export type Level = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'none';

/** Report sections an engine may have no evidence for. Mirrors backend/src/types.ts. */
export type ReportSection =
  | 'killchain'
  | 'timeline'
  | 'blast'
  | 'network'
  | 'network.traffic';

/** Where a report's content came from, and what its engine could not see. */
export type Provenance = {
  engine: string;
  label: string;
  synthetic: boolean;
  caveat: string;
  unsupported: ReportSection[];
};

export type SampleCard = {
  id: string;
  name: string;
  seen: string;
  classification: string;
  sevLabel: string;
  sevLevel: Level;
  score: number;
  summary: string;
};

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export type JobLine = { n: string; txt: string };

export type Job = {
  id: string;
  sampleId: string;
  name: string;
  status: JobStatus;
  progress: number;
  lines: JobLine[];
  reportId?: string;
  error?: string;
};

export type Technique = { id: string; name: string; desc: string };

export type KillchainStage = {
  tactic: string;
  id: string;
  level: Level;
  short: string;
  plain: string;
  techniques: Technique[];
};

export type TimelineEvent = {
  t: number;
  label: string;
  detail: string;
  level: Level;
};

export type BlastStat = { n: number | string; t: string };

export type BlastLayer = {
  key: string;
  label: string;
  sub: string;
  level: Level;
  stats: BlastStat[];
};

export type NetworkIp = { ip: string; role: string; geo: string };
export type NetworkLog = { t: string; e: string };

export type Network = {
  victim: string;
  domain: string;
  proto: string;
  beacon: string;
  exfil: string;
  ja3: string;
  ips: NetworkIp[];
  log: NetworkLog[];
};

export type Tile = { l: string; v: string; hot: boolean };

export type Factor = { label: string; on: boolean; level: Level };

export type Report = {
  id: string;
  /** Absent on reports written before provenance tracking — treated as unknown. */
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
  tiles: Tile[];
  factors: Factor[];
  killchain: KillchainStage[];
  timeline: TimelineEvent[];
  blast: BlastLayer[];
  network: Network;
};

export type View = 'import' | 'analyzing' | 'app';

export type Tab = 'overview' | 'killchain' | 'timeline' | 'blast' | 'network';
