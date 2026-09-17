function int(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function str(name: string, def: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? def : v;
}

function list(name: string, def: string[]): string[] {
  const v = process.env[name];
  if (!v) return def;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  env: str('NODE_ENV', 'production'),
  port: int('PORT', 8080),

  // Postgres
  databaseUrl: str('DATABASE_URL', 'postgres://detonate:detonate@db:5432/detonate'),

  // Uploads
  maxUploadBytes: int('MAX_UPLOAD_BYTES', 100 * 1024 * 1024), // 100 MB (matches design copy)
  quarantineDir: str('QUARANTINE_DIR', '/data/quarantine'),
  retainBytes: str('RETAIN_BYTES', 'true') === 'true', // keep submitted bytes (quarantined) for real connectors

  // Analysis
  connector: str('SANDBOX_CONNECTOR', 'static'), // 'static' | 'simulated' | (future) 'cape' | 'cuckoo'
  analysisConcurrency: int('ANALYSIS_CONCURRENCY', 2),
  // Per-step delay for the simulated detonation log (ms). Keeps the Analyzing
  // screen's pacing close to the original design (~400ms/step).
  simStepMs: int('SIM_STEP_MS', 380),

  // Rate limiting (token-bucket per IP)
  rateWindowMs: int('RATE_WINDOW_MS', 60_000),
  rateMaxRequests: int('RATE_MAX_REQUESTS', 120), // general read budget per window
  submitWindowMs: int('SUBMIT_WINDOW_MS', 60_000),
  submitMaxRequests: int('SUBMIT_MAX_REQUESTS', 12), // stricter budget for POST /samples
  reportMaxRequests: int('REPORT_MAX_REQUESTS', 30), // tight budget for GET /api/reports/:id

  // CORS — empty means same-origin only (nginx proxies, so this is the default).
  corsOrigins: list('CORS_ORIGINS', []),

  // Trust the X-Forwarded-* headers from the nginx reverse proxy.
  trustProxy: str('TRUST_PROXY', 'true') === 'true',
} as const;

export type Config = typeof config;
