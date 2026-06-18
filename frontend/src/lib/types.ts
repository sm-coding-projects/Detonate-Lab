export type Level = "critical" | "high" | "medium" | "low" | "info" | "none";

export interface Technique {
  id: string;
  name: string;
  desc: string;
}

export interface KillchainStage {
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

export interface BlastStat {
  n: number | string;
  t: string;
}

export interface BlastLayer {
  key: string;
  label: string;
  sub: string;
  level: Level;
  stats: BlastStat[];
}

export interface Factor {
  label: string;
  on: boolean;
  level: Level;
}

export interface Tile {
  l: string;
  v: string;
  hot: boolean;
}

export interface NetIP {
  ip: string;
  role: string;
  geo: string;
}

export interface NetLog {
  t: string;
  e: string;
}

export interface Network {
  victim: string;
  domain: string;
  proto: string;
  beacon: string;
  exfil: string;
  ja3: string;
  ips: NetIP[];
  log: NetLog[];
}

export interface Report {
  id: string;
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
  synthetic: boolean;
  tiles: Tile[];
  factors: Factor[];
  killchain: KillchainStage[];
  timeline: TimelineEvent[];
  blast: BlastLayer[];
  network: Network;
}

export interface Analysis {
  id: string;
  status: "queued" | "analyzing" | "completed" | "failed";
  progress: number;
  stage_lines: string[];
  error: string | null;
  source_kind: string;
  source_name: string;
  sha256: string | null;
  file_size: number | null;
  file_type: string | null;
  is_sample: boolean;
  created_at: string;
  report: Report | null;
}

export interface AnalysisSummary {
  id: string;
  status: string;
  name: string;
  seen: string;
  classification: string;
  sevLabel: string;
  sevLevel: string;
  score: number;
  summary: string;
  is_sample: boolean;
}

export interface User {
  id: string;
  email: string;
  is_admin: boolean;
}

export interface AuthConfig {
  app_name: string;
  allow_registration: boolean;
}
