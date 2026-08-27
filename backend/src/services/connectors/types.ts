import type { Report, SampleInput } from '../../types.js';

export interface DetonationProgress {
  /** Overall completion, 0..100. */
  progress: number;
  /** A new analysis log line to append, if any. */
  line?: { n: string; txt: string };
}

export type ProgressFn = (p: DetonationProgress) => void | Promise<void>;

/**
 * A SandboxConnector turns a submitted sample into a structured Report, emitting
 * progress as it goes. The default `SimulatedConnector` produces a synthetic report
 * and NEVER executes the submitted bytes. A real backend (CAPE, Cuckoo, a cloud
 * detonation service) implements this same interface as a drop-in replacement —
 * see services/connectors/index.ts.
 *
 * `predetermined` lets the pipeline replay a known report (e.g. re-running a
 * prepared/seeded sample) while still showing the live progress animation. Real
 * connectors may ignore it.
 */
export interface SandboxConnector {
  readonly name: string;
  detonate(input: SampleInput, onProgress: ProgressFn, predetermined?: Report | null): Promise<Report>;
}

export const ANALYSIS_LINES: string[] = [
  'SIMULATED RUN — no sample is executed; output below is synthesized',
  'Unpacking PE — UPX layer stripped (1 of 1)',
  'Static triage: 14 suspicious imports, 3 high-entropy sections',
  'Detonating in isolated Windows 10 sandbox',
  'Hooking kernel and userland API calls',
  'Behavioral capture: events recorded',
  'Mapping observations to MITRE ATT&CK',
  'Reconstructing network traffic (TLS unwrapped)',
  'Scoring threat · generating report',
];
