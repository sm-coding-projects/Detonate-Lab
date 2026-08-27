import { query } from '../db/pool.js';
import { config } from '../config.js';
import { uuid } from '../lib/hash.js';
import type { Job, JobStatus, Report, SampleInput } from '../types.js';
import { getConnector } from './connectors/index.js';

interface JobRow {
  id: string;
  sample_id: string;
  name: string;
  status: JobStatus;
  progress: number;
  lines: { n: string; txt: string }[];
  report_id: string | null;
  error: string | null;
}

/**
 * In-process, concurrency-limited analysis queue backed by Postgres. Job input is
 * persisted so a process restart can resume queued work. Single-instance by design
 * (one api container); a multi-replica deployment would swap this for a real queue
 * (e.g. BullMQ/Redis) behind the same createJob/getJob surface.
 */
class AnalysisService {
  private active = 0;
  private readonly pending: string[] = [];

  /** Create a job for a freshly submitted sample (generates a new report). */
  async createUploadJob(input: SampleInput): Promise<{ jobId: string; sampleId: string }> {
    const sampleId = uuid();
    await query(
      `INSERT INTO samples (id, name, file_name, sha256, file_type, size_bytes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [sampleId, input.name, input.name, input.sha256, input.fileType, input.size, input.source],
    );
    return this.enqueue(sampleId, input.name, input, false);
  }

  /** Create a job that replays an existing (e.g. seeded) sample's stored report. */
  async createReplayJob(sampleId: string, input: SampleInput): Promise<{ jobId: string; sampleId: string }> {
    return this.enqueue(sampleId, input.name, input, true);
  }

  private async enqueue(sampleId: string, name: string, input: SampleInput, replay: boolean): Promise<{ jobId: string; sampleId: string }> {
    const jobId = uuid();
    await query(
      `INSERT INTO jobs (id, sample_id, name, status, progress, lines, input, replay)
       VALUES ($1,$2,$3,'queued',0,'[]'::jsonb,$4::jsonb,$5)`,
      [jobId, sampleId, name, JSON.stringify(input), replay],
    );
    this.pending.push(jobId);
    queueMicrotask(() => this.drain());
    return { jobId, sampleId };
  }

  async getJob(id: string): Promise<Job | null> {
    const { rows } = await query<JobRow>(
      `SELECT id, sample_id, name, status, progress, lines, report_id, error FROM jobs WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      sampleId: r.sample_id,
      name: r.name,
      status: r.status,
      progress: r.progress,
      lines: r.lines ?? [],
      reportId: r.report_id ?? undefined,
      error: r.error ?? undefined,
    };
  }

  /** Requeue any jobs left unfinished by a previous process (crash/restart). */
  async resumeOrphans(): Promise<void> {
    const { rows } = await query<{ id: string }>(
      `UPDATE jobs SET status = 'queued', progress = 0, lines = '[]'::jsonb, updated_at = now()
       WHERE status IN ('queued','running') RETURNING id`,
    );
    for (const r of rows) this.pending.push(r.id);
    if (rows.length) {
      console.log(`[analysis] resumed ${rows.length} unfinished job(s)`);
      queueMicrotask(() => this.drain());
    }
  }

  private drain(): void {
    while (this.active < config.analysisConcurrency && this.pending.length > 0) {
      const id = this.pending.shift()!;
      this.active++;
      this.run(id)
        .catch((err) => console.error('[analysis] job crashed', id, err))
        .finally(() => {
          this.active--;
          this.drain();
        });
    }
  }

  private async run(jobId: string): Promise<void> {
    const { rows } = await query<{ sample_id: string; input: SampleInput; replay: boolean }>(
      `SELECT sample_id, input, replay FROM jobs WHERE id = $1`,
      [jobId],
    );
    const row = rows[0];
    if (!row) return;
    const { sample_id: sampleId, input, replay } = row;

    await query(`UPDATE jobs SET status='running', updated_at=now() WHERE id=$1`, [jobId]);

    try {
      let predetermined: Report | null = null;
      if (replay) {
        const r = await query<{ data: Report }>(`SELECT data FROM reports WHERE sample_id = $1`, [sampleId]);
        predetermined = r.rows[0]?.data ?? null;
      }

      const connector = getConnector();
      const lines: { n: string; txt: string }[] = [];
      const report = await connector.detonate(input, async (p) => {
        if (p.line) lines.push(p.line);
        await query(
          `UPDATE jobs SET progress=$2, lines=$3::jsonb, updated_at=now() WHERE id=$1`,
          [jobId, p.progress, JSON.stringify(lines)],
        );
      }, predetermined);

      report.id = sampleId;

      if (!replay) {
        await query(
          `INSERT INTO reports (sample_id, data) VALUES ($1, $2::jsonb)
           ON CONFLICT (sample_id) DO UPDATE SET data = EXCLUDED.data`,
          [sampleId, JSON.stringify(report)],
        );
        // Denormalize card fields onto the sample for the library listing.
        await query(
          `UPDATE samples SET name=$2, file_type=$3, classification=$4, severity=$5,
             sev_level=$6, sev_label=$7, tagline=$8, seen=$9 WHERE id=$1`,
          [sampleId, report.name, report.type, report.classification, report.severity,
            report.sevLevel, report.sevLabel, report.tagline, report.seen],
        );
      }

      await query(
        `UPDATE jobs SET status='done', progress=100, report_id=$2, updated_at=now() WHERE id=$1`,
        [jobId, sampleId],
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'analysis failed';
      console.error('[analysis] failed', jobId, msg);
      await query(`UPDATE jobs SET status='error', error=$2, updated_at=now() WHERE id=$1`, [jobId, msg]);
    }
  }
}

export const analysisService = new AnalysisService();
