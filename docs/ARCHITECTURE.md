# Architecture

## Services (one `docker-compose.yml`)

| Service  | Image                                | Exposed                          | Role |
|----------|--------------------------------------|----------------------------------|------|
| `web`    | `nginx-unprivileged` (non-root)      | host `:WEB_PORT` → `:8080`       | Serves the built SPA, reverse-proxies `/api`, sets security headers, rate-limits |
| `api`    | Node 20+ (Express + TypeScript)      | internal `:8000`                 | Submissions, analysis engine, REST API |
| `db`     | `postgres:16-alpine`                 | internal `:5432`                 | Jobs (status + report) and reference samples |

Only `web` is published. `api` and `db` are reachable only on the internal
Docker network. State (job status + final report) lives in the database, so
the polling endpoint works regardless of which API worker ran the job.

## Request flow

```
Browser ──▶ web (nginx)
            ├─ /         → SPA (index.html + hashed assets, self-hosted fonts)
            └─ /api/*    → api (Express)
                            ├─ /health[/ready]
                            ├─ /samples     POST file | url
                            ├─ /jobs        GET /:id  (status + progress)
                            └─ /reports     GET /:id  (final report JSON)
```

## Analysis pipeline (`backend/src/services/`)

```
POST /api/samples  (file | url | hash)
  └─ samples route validates input, computes SHA-256, persists a `samples`
     row, queues a `jobs` row
  └─ analysisService.drain() picks up the job (max ANALYSIS_CONCURRENCY)
       1. resolve the connector (simulated | static | …)
       2. run connector.analyse(input, onProgress)
            · static  — extract strings / magic / entropy from retained bytes
            · simulated — synthesize a deterministic report from the seed
       3. on completion, write the report JSON to `reports`, mark job done
```

The frontend polls `GET /api/jobs/:id` every ~500 ms while a job is
running, then fetches `GET /api/reports/:id` once the job is `done`.

Because jobs run in the same Node process as the HTTP server, a crash or
restart can leave a row in `queued`/`running`. On startup
`analysisService.resumeOrphans` re-queues any non-terminal jobs; live jobs
that are still in flight elsewhere bump `updated_at` so they are never
double-driven. A dedicated task queue (BullMQ, River, etc.) is the
production-grade upgrade if you outgrow the single-host model.

## Backend layout (`backend/src/`)

- `config.ts` — env-driven config; the only place we parse `process.env`.
- `index.ts` — Express app bootstrap.
- `db/` — `pool.ts` (pg Pool), `migrate.ts` (idempotent schema + seed),
  `seedData.ts` (reference reports).
- `lib/` — `log.ts` (structured JSON logger), `validate.ts` (URL/SSRF
  guard, UUID, name cleaner), `hash.ts`, `severity.ts`, `filetype.ts`.
- `middleware/` — `errorHandler.ts` (curated error responses), `rateLimit.ts`
  (token-bucket per IP).
- `routes/` — `health.ts`, `samples.ts`, `jobs.ts`, `reports.ts`.
- `services/` — `analysis.ts` (job runner), `reportGenerator.ts` (mock
  reports), `connectors/` (per-backend implementations).

## Frontend (`frontend/src/`)

- `main.tsx` — React mount + theme provider.
- `App.tsx` — view state machine (`import` → `analyzing` → `report`).
- `components/` — `ImportView`, `AnalyzingView`, `AppView`, `Provenance`,
  `tabs/` (`Overview`, `Killchain`, `Timeline`, `Blast`, `Network`).
- `lib/api.ts` — fetch wrapper.

The report data model is shared end-to-end: `backend/src/types.ts` ⇄
`frontend/src/types.ts`. The TypeScript types are the contract; the backend
serializes a single `Report` JSON document and the UI consumes the same shape.

## Data model

- `samples` (`id` uuid PK, `name`, `sha256`, `created_at`)
- `jobs` (`id` uuid PK, `sample_id`, `status` ∈
  `queued|running|done|error`, `progress` int, `error` text, `report_id`)
- `reports` (`sample_id` PK, `data` jsonb)

Schema is created idempotently on startup; reference samples are seeded the
same way.

## Extending with a real sandbox

Implement `SandboxConnector` in `backend/src/services/connectors/`:

```ts
// backend/src/services/connectors/cape.ts
import type { SandboxConnector, ProgressFn, Report, SampleInput } from './types.js';

export class CapeConnector implements SandboxConnector {
  readonly name = 'cape';

  async analyse(input: SampleInput, onProgress: ProgressFn): Promise<Report> {
    onProgress(10, 'submitting');
    // … talk to CAPE, collect artefacts, return a Report
    return report;
  }
}
```

Wire it in `connectors/index.ts`:

```ts
case 'cape':
  instance = new CapeConnector();
  break;
```

The rest of the pipeline (validation, scoring, persistence, UI) is unchanged.
