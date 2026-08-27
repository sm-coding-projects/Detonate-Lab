import { pool, query, waitForDb } from './pool.js';
import { SEED_REPORTS } from './seedData.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS samples (
  id             uuid PRIMARY KEY,
  name           text NOT NULL,
  file_name      text NOT NULL,
  sha256         text NOT NULL,
  file_type      text NOT NULL DEFAULT '',
  size_bytes     bigint NOT NULL DEFAULT 0,
  classification text NOT NULL DEFAULT '',
  severity       int  NOT NULL DEFAULT 0,
  sev_level      text NOT NULL DEFAULT 'info',
  sev_label      text NOT NULL DEFAULT '',
  tagline        text NOT NULL DEFAULT '',
  seen           text NOT NULL DEFAULT '',
  source         text NOT NULL DEFAULT 'upload',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  sample_id  uuid PRIMARY KEY REFERENCES samples(id) ON DELETE CASCADE,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id         uuid PRIMARY KEY,
  sample_id  uuid NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'queued',
  progress   int  NOT NULL DEFAULT 0,
  lines      jsonb NOT NULL DEFAULT '[]'::jsonb,
  input      jsonb NOT NULL DEFAULT '{}'::jsonb,
  replay     boolean NOT NULL DEFAULT false,
  report_id  uuid,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_samples_created ON samples (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
`;

export async function migrate(): Promise<void> {
  await waitForDb();
  await query(SCHEMA);
  await seed();
  console.log('[db] migration + seed complete');
}

async function seed(): Promise<void> {
  for (const r of SEED_REPORTS) {
    await query(
      `INSERT INTO samples
         (id, name, file_name, sha256, file_type, size_bytes, classification,
          severity, sev_level, sev_label, tagline, seen, source, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'seed', $13::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        r.id, r.name, r.file, r.sha, r.type, 0, r.classification,
        r.severity, r.sevLevel, r.sevLabel, r.tagline, r.seen, seenToTimestamp(r.seen),
      ],
    );
    await query(
      `INSERT INTO reports (sample_id, data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (sample_id) DO NOTHING`,
      [r.id, JSON.stringify(r)],
    );
  }
}

// "2026-06-14 22:17 UTC" -> a value Postgres can cast to timestamptz.
function seenToTimestamp(seen: string): string {
  const m = seen.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!m) return '2026-01-01 00:00:00+00';
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:00+00`;
}

// Allow running standalone: `node dist/db/migrate.js`
const isMain = process.argv[1]?.endsWith('migrate.js');
if (isMain) {
  migrate()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[db] migration failed', err);
      process.exit(1);
    });
}
