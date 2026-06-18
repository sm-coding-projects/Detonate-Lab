# Architecture

## Services (one `docker-compose.yml`)

| Service | Image | Exposed | Role |
|---|---|---|---|
| `web` | nginx (unprivileged, non-root) | host `:WEB_PORT` → `:8080` | Serves the built SPA, reverse-proxies `/api`, sets security headers, rate-limits |
| `backend` | FastAPI on gunicorn/uvicorn (non-root) | internal `:8000` | Auth, submissions, analysis engine, REST API |
| `db` | postgres:16-alpine | internal `:5432` | Users + analyses (report stored as JSON) |

Only `web` is published. `backend` and `db` are reachable only on the internal Docker
network. State (job progress + final report) lives in the database, so the polling
endpoint works regardless of which backend worker ran the job.

## Request flow

```
Browser ──▶ web (nginx)
              ├─ /            → SPA (index.html + hashed assets, self-hosted fonts)
              └─ /api/*       → backend
                                 ├─ /auth/*      register · login · logout · me
                                 ├─ /analyses    list · get · file · url · delete
                                 └─ /health[/ready]
```

## Analysis pipeline (`backend/app/analysis/`)

```
submit (file|url)
  └─ Analysis row created (status=queued)  ──▶ asyncio background task
        1. static_analysis.analyze_file   → SHA-256, size, magic-byte type,
                                             entropy, PE imports, strings, IOCs   (REAL, safe)
        2. scoring.score_features         → 0–100 score, severity band, factors
        3. progress animation             → stage_lines + progress persisted per step
        4. resolve report:
             · known SHA  → curated reference report (seed_data)
             · otherwise  → sandbox.detonate (DemoSandbox) → synthesized, labelled report
        5. status=completed, report stored
```

The frontend polls `GET /api/analyses/{id}` every 500 ms during analysis to drive the
progress view, then renders the report's five tabs.

Because jobs run in-process (tied to the worker that accepted them), a crash or
worker recycle could strand a row mid-flight. On startup `reconcile_orphans`
fails any `queued`/`analyzing` row untouched for >120 s (an active job bumps
`updated_at` every stage, so live jobs in sibling workers are never affected). A
dedicated task queue (Celery/RQ/Arq) is the production-grade upgrade and is the
clean extension point if you outgrow the single-host model.

## Frontend (`frontend/src/`)

- `App.tsx` — auth gate + view state machine (`import` → `analyzing` → `app`) + polling
- `lib/` — `api.ts` (fetch + CSRF), `auth.tsx` (session context), `theme.ts`, `types.ts`
- `components/` — `Topbar`, `AuthScreen`, `ImportView`, `AnalyzingView`, `AppView`
- `components/tabs/` — `Overview`, `Killchain`, `Timeline`, `Blast`, `Network`

The report data model is shared end-to-end: `schemas.Report` (Pydantic) ⇄ `types.Report`
(TypeScript).

## Data model

- **User** — `id`, `email` (unique), `password_hash` (argon2id), `is_admin`, `is_active`
- **Analysis** — `id`, `owner_id`, `status`, `progress`, `stage_lines`, provenance
  (`source_kind/name/url`, `stored_path`), static facts (`sha256`, `file_size`,
  `file_type`), `is_sample`, and the full `report` JSON document.

Schema is created idempotently on startup (`Base.metadata.create_all`); reference
samples and the optional bootstrap admin are seeded the same way.

## Extending with a real sandbox

Implement the `Sandbox` protocol in `backend/app/analysis/sandbox.py`:

```python
class MySandbox:
    name = "cape"
    def detonate(self, path, feats, score, *, display) -> dict:
        # return {"killchain": [...], "timeline": [...], "blast": [...], "network": {...}}
        ...
```

Return it from `get_sandbox()` and the rest of the pipeline (scoring, progress,
storage, UI) is unchanged.
