import { statSync } from 'node:fs';
import { basename } from 'node:path';
import { config } from '../../config.js';
import { logger } from '../../lib/log.js';
import { readSecret } from '../../lib/secrets.js';
import type { ProgressFn, SandboxConnector } from './types.js';
import type { Level, Report, ReportSection } from '../../types.js';

/**
 * Real-detonation connector. The api service POSTs each sample to a
 * dedicated `sandbox-runner` container that spins up an isolated
 * Docker-in-Docker worker, executes the sample, and returns its
 * observations. This connector translates the worker's JSON response
 * into a Report with provenance indicating which sections were actually
 * observed vs. unsupported.
 *
 * Network: The runner is reachable over the compose-internal network
 * only. The api is the only caller and authenticates with a shared
 * bearer token (the `sandbox_runner_token` secret). The runner runs
 * with no network egress except via INetSim, which is the only way the
 * detonated sample can reach the outside world (and the only thing it
 * can reach — egress from the runner to the public internet is blocked
 * by iptables inside the runner).
 */
export class DockerSandboxConnector implements SandboxConnector {
  readonly name = 'docker';

  async detonate(input: Parameters<SandboxConnector['detonate']>[0], onProgress: ProgressFn): Promise<Report> {
    if (!input.quarantinePath) {
      throw new Error('docker connector requires a quarantined sample (RETAIN_BYTES=true)');
    }
    const stat = statSync(input.quarantinePath);
    if (!stat.isFile() || stat.size === 0) {
      throw new Error(`quarantined sample is missing or empty: ${input.quarantinePath}`);
    }

    const token = readSecret(config.sandboxRunnerTokenFile, 'SANDBOX_RUNNER_TOKEN');

    onProgress({ progress: 5, line: { n: '01', txt: 'submitting sample to sandbox runner' } });
    onProgress({ progress: 12, line: { n: '02', txt: 'runner is spinning up an isolated worker' } });

    // Two-step API: POST /detonate starts the detonation and returns a
    // job_id; GET /detonate/:id polls until completion. The runner does
    // the heavy lifting inside DinD and streams progress through its own
    // log socket; we relay those into the UI's progress feed via the
    // intermediate polling loop.
    const startRes = await this.fetchWithTimeout(`${config.sandboxRunnerUrl}/detonate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: input.name,
        sha256: input.sha256,
        size: stat.size,
        fileType: input.fileType,
        // We pass the path the api sees; the runner binds its own
        // /data/quarantine mount from the same compose volume so the
        // path resolves identically.
        quarantinePath: input.quarantinePath,
        timeoutMs: config.sandboxRunnerTimeoutMs,
      }),
    });

    if (!startRes.ok) {
      const errBody = await startRes.text().catch(() => '');
      throw new Error(`sandbox-runner rejected detonation (${startRes.status}): ${errBody.slice(0, 500)}`);
    }

    const { jobId } = (await startRes.json()) as { jobId: string };
    logger.info('sandbox', `detonation ${jobId} submitted to runner`);

    onProgress({ progress: 20, line: { n: '03', txt: `detonation queued as ${jobId}` } });

    // Poll until completion. We use a sub-timeout smaller than the
    // overall sandbox timeout so we don't sit forever after the runner
    // has already given up.
    const deadline = Date.now() + config.sandboxRunnerTimeoutMs + 10_000;
    let lastLogN = 0;
    while (Date.now() < deadline) {
      await sleep(1500);
      const pollRes = await this.fetchWithTimeout(`${config.sandboxRunnerUrl}/detonate/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!pollRes.ok) {
        const errBody = await pollRes.text().catch(() => '');
        throw new Error(`sandbox-runner poll failed (${pollRes.status}): ${errBody.slice(0, 500)}`);
      }
      const poll = (await pollRes.json()) as {
        status: 'queued' | 'running' | 'done' | 'error';
        progress: number;
        logs?: { n: string; txt: string }[];
        report?: RunnerReportPayload;
        error?: string;
      };

      onProgress({ progress: Math.max(20, Math.min(85, poll.progress ?? 20)) });

      // Relay new runner logs into the UI.
      if (poll.logs) {
        for (const l of poll.logs.slice(lastLogN)) {
          onProgress({ progress: poll.progress ?? 50, line: l });
        }
        lastLogN = poll.logs.length;
      }

      if (poll.status === 'done' && poll.report) {
        onProgress({ progress: 92, line: { n: '90', txt: 'mapping observations to MITRE ATT&CK' } });
        const report = mapRunnerReport(input, poll.report);
        onProgress({ progress: 100, line: { n: '99', txt: 'report complete' } });
        return report;
      }
      if (poll.status === 'error') {
        throw new Error(`detonation failed: ${poll.error ?? 'unknown runner error'}`);
      }
    }

    throw new Error(`detonation timed out after ${config.sandboxRunnerTimeoutMs}ms`);
  }

  private async fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
    // Node's built-in fetch supports an AbortSignal via the second arg
    // but our caller already composes headers; we re-implement here so
    // the rest of the method stays simple. The 10-second connect/read
    // window is short — the runner should respond fast or fail.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Runner payload → Report mapping ----------------------------------------

interface RunnerReportPayload {
  verdict: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  score: number; // 0..100
  confidence: 'low' | 'medium' | 'high';
  severity: Level;
  classification: string;
  tagline: string;
  summary: string;
  killchain: Report['killchain'];
  timeline: Report['timeline'];
  blast: Report['blast'];
  network: Report['network'];
  /** Sections that the runner couldn't observe — propagated as-is. */
  unsupported: ReportSection[];
  /** Worker PID, run duration, base image, etc. — for the provenance note. */
  runMeta: {
    baseImage: string;
    durationMs: number;
    workerId: string;
  };
}

function mapRunnerReport(input: Parameters<SandboxConnector['detonate']>[0], raw: RunnerReportPayload): Report {
  // The runner's report is the report — we don't recompute. We do add a
  // provenance stamp and copy over the sample's basic identity so the
  // UI can render the header without going back to the DB.
  const observed: ReportSection[] = (['killchain', 'timeline', 'blast', 'network', 'network.traffic'] as ReportSection[]).filter(
    (s) => !raw.unsupported.includes(s),
  );

  return {
    id: '',
    name: basename(input.name),
    file: input.name,
    sha: input.sha256,
    type: input.fileType + (input.size ? ` · ${humanSize(input.size)}` : ''),
    size: humanSize(input.size),
    seen: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    classification: raw.classification,
    verdict: verdictText(raw.verdict),
    confidence: raw.confidence,
    severity: raw.score,
    sevLevel: raw.severity,
    sevLabel: severityLabel(raw.score),
    tagline: raw.tagline,
    summary: raw.summary,
    tiles: [],
    factors: [],
    killchain: raw.killchain ?? [],
    timeline: raw.timeline ?? [],
    blast: raw.blast ?? [],
    network: raw.network ?? emptyNetwork(),
    provenance: {
      engine: 'docker',
      label: `Docker detonation · ${raw.runMeta.baseImage}`,
      synthetic: false,
      caveat:
        observed.length === 5
          ? `Real detonation in an isolated DinD worker (${raw.runMeta.workerId}, ${(raw.runMeta.durationMs / 1000).toFixed(1)}s, image ${raw.runMeta.baseImage}). Network egress was restricted to the in-stack INetSim only.`
          : `Real detonation, but the runner could not substantiate: ${raw.unsupported.join(', ')}. Those sections are left as 'not observed' in the UI.`,
      unsupported: raw.unsupported,
    },
  };
}

function verdictText(v: RunnerReportPayload['verdict']): string {
  switch (v) {
    case 'malicious': return 'Malicious — confirmed by runtime behavior';
    case 'suspicious': return 'Suspicious — observed anomalies warrant review';
    case 'clean':     return 'Clean — no malicious indicators observed';
    case 'unknown':   return 'Inconclusive — insufficient evidence';
  }
}

function severityLabel(score: number): string {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  if (score >= 20) return 'Low';
  if (score > 0)   return 'Info';
  return 'None';
}

function emptyNetwork(): Report['network'] {
  return { victim: '', domain: '', proto: '', beacon: '', exfil: '', ja3: '', ips: [], log: [] };
}

// Re-export humanSize so we don't pull in static.ts just for that.
function humanSize(n: number): string {
  // Trivial wrapper — the static connector has the canonical version.
  // This keeps dockerSandbox.ts self-contained for the mapping layer.
  if (!n) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}