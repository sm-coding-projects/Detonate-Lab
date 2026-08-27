export type Level = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'none';

/** Report sections whose content an engine may or may not have evidence for. */
export type ReportSection = 'killchain' | 'timeline' | 'blast' | 'network' | 'network.traffic';

/**
 * Where a report's content came from. Every Report carries this so the UI can
 * state plainly what produced it and which sections have no evidence behind them.
 *
 * This exists because the report shape is richer than most engines can fill. A
 * string-matching static scan cannot observe an execution timeline, a blast
 * radius, or live C2 traffic — and rendering synthesized stand-ins for those
 * next to real findings, indistinguishably, is the failure this field prevents.
 */
export interface Provenance {
  /** Connector id that produced the report ('static', 'simulated', 'seed'). */
  engine: string;
  /** Human-readable engine name, shown in the report banner. */
  label: string;
  /** True when the report's content is fabricated rather than derived from the sample. */
  synthetic: boolean;
  /** One line stating what this engine cannot see. */
  caveat: string;
  /** Sections with no evidence behind them — the UI renders these as "not observed". */
  unsupported: ReportSection[];
}

export interface Technique {
  id: string;
  name: string;
  desc: string;
}

export interface KillChainStage {
  tactic: string;
  id: string;
  level: Level;
  short: string;
  plain: string;
  techniques: Technique[];
}

export interface TimelineEvent {
  t: number;
  label: string;
  detail: string;
  level: Level;
}

export interface BlastLayer {
  key: string;
  label: string;
  sub: string;
  level: Level;
  stats: { n: number | string; t: string }[];
}

export interface NetworkInfo {
  victim: string;
  domain: string;
  proto: string;
  beacon: string;
  exfil: string;
  ja3: string;
  ips: { ip: string; role: string; geo: string }[];
  log: { t: string; e: string }[];
}

export interface Report {
  id: string;
  /** What produced this report and what it could not see. Optional for
   *  reports written before provenance tracking; the UI treats absence as unknown. */
  provenance?: Provenance;
  name: string;
  file: string;
  sha: string;
  type: string;
  size: string;
  seen: string;
  classification: string;
  verdict: string;
  confidence: string;
  severity: number;
  sevLevel: Level;
  sevLabel: string;
  tagline: string;
  summary: string;
  tiles: { l: string; v: string; hot: boolean }[];
  factors: { label: string; on: boolean; level: Level }[];
  killchain: KillChainStage[];
  timeline: TimelineEvent[];
  blast: BlastLayer[];
  network: NetworkInfo;
}

export interface SampleCard {
  id: string;
  name: string;
  seen: string;
  classification: string;
  sevLabel: string;
  sevLevel: Level;
  score: number;
  summary: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export interface Job {
  id: string;
  sampleId: string;
  name: string;
  status: JobStatus;
  progress: number;
  lines: { n: string; txt: string }[];
  reportId?: string;
  error?: string;
}

/** Minimal description of an inbound sample handed to a SandboxConnector. */
export interface SampleInput {
  /** Display name (filename or URL basename). */
  name: string;
  /** SHA-256 of the submitted bytes, or of the URL string for URL submissions. */
  sha256: string;
  /** Size in bytes (0 for URL submissions). */
  size: number;
  /** Best-effort file type label from magic-byte sniffing. */
  fileType: string;
  /** Submission source. */
  source: 'upload' | 'url' | 'seed';
  /** Original URL for url submissions. */
  url?: string;
  /** Absolute path to the quarantined bytes on disk, if retained. */
  quarantinePath?: string;
}
