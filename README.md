# Detonate Lab

A malware **sandbox report viewer**. Submit a sample (file drop or URL) and explore
the result across five linked views: **Overview**, **Kill chain** (MITRE ATT&CK),
**Timeline**, **Blast radius**, and **Network** (C2 / exfiltration).

**Nothing is detonated.** This is the report interface, not a sandbox — see
[What the engines actually do](#what-the-engines-actually-do) for exactly what each
analysis engine can and cannot tell you.

Built from the approved Claude Design mockup — the UI is a pixel-faithful port —
and turned into a real, secure, full-stack application that deploys with a single
`docker compose up`.

<p align="center"><em>http://localhost:8080 after startup</em></p>

---

## Quick start

```bash
cp .env.example .env        # optional — defaults work for local use
docker compose up --build   # builds web + api, starts Postgres, seeds data
# open http://localhost:8080
```

That's it — one compose file, three services. Stop with `docker compose down`
(add `-v` to also drop the database + quarantine volumes).

---

## Tech stack & why

| Layer | Choice | Rationale |
|------|--------|-----------|
| **Frontend** | React 18 + Vite + TypeScript | The design is a stateful SPA (view machine + rich client interactions: timeline scrubber, animated blast rings, expandable kill chain). React maps onto it cleanly; the styling is ported verbatim for fidelity. |
| **Backend** | Node 20 + Express + TypeScript | Small, well-understood REST surface; shares the `Report` type vocabulary with the frontend; easy to keep strict and auditable. |
| **Database** | PostgreSQL 16 | Reports are deeply nested → stored as `jsonb`; samples/jobs are relational. One engine covers both. |
| **Web tier** | nginx (unprivileged) | Serves the static SPA, reverse-proxies `/api`, terminates security headers, enforces upload size. |
| **Analysis** | Pluggable `SandboxConnector` (default: `StaticConnector`) | A clean seam so a real detonation backend (CAPE/Cuckoo/cloud) drops in without touching the app. No connector shipped here **ever executes** submitted bytes. |

---

## Architecture

```
                    ┌──────────────────────────── docker compose ───────────────────────────┐
  browser ── :8080 ─┤  web (nginx)                api (Node/Express)            db (Postgres) │
                    │  • serves SPA               • POST /api/samples           • samples      │
                    │  • /api/* ─────proxy──────► • GET  /api/jobs/:id          • jobs         │
                    │  • security headers, gzip   • GET  /api/reports/:id       • reports(jsonb)│
                    │  • 110 MB upload cap        • rate limit, validation                     │
                    │                             • SandboxConnector ──► report               │
                    └────────────────────────────────────────────────────────────────────────┘
            only the web port is published; api + db are private to the compose network
```

**Request flow:** a submission creates a `sample` + a queued `job`; a
concurrency-limited worker runs the connector, which streams progress lines into
the job row and finally writes the `report`. The Analyzing screen polls
`GET /api/jobs/:id` (~400 ms) and, on `done`, loads `GET /api/reports/:id`.

The API contract is documented in [`docs/API.md`](docs/API.md).

---

## Security posture

Per the chosen scope the app itself is **open** (no login — front it with your own
auth/reverse proxy/VPN for non-lab use). Everything else is hardened:

- **Never executes samples.** Neither shipped connector runs, opens, or interprets
  submitted bytes as code. The `static` connector *reads* them — it extracts printable
  strings and matches them against regexes — but never executes them. Because it needs
  the bytes, `RETAIN_BYTES` defaults to **true** and samples persist on a quarantine
  volume (`0600`, never executed). Set it false and file submissions report as
  inconclusive rather than scanned.
- **Upload safety.** 100 MB cap enforced at both nginx and the API; in-memory single
  file; magic-byte sniffing instead of trusting the extension; filenames sanitized.
- **SSRF-aware URL validation.** URL submissions must be `http(s)` and are rejected
  for loopback / private / link-local / cloud-metadata (`169.254.169.254`) hosts.
- **Rate limiting.** Per-IP token buckets — a general API budget and a stricter
  submit budget (returns `429` with `Retry-After`).
- **Input validation.** UUIDs, URLs, and body sizes (`16kb` JSON limit) validated;
  errors never leak internals (generic message on `5xx`).
- **Security headers** (nginx): strict `Content-Security-Policy` (`script-src 'self'`,
  no framing), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, COOP. API adds `helmet` defense-in-depth.
- **Container hardening.** Multi-stage builds; non-root in both images
  (`node` user / nginx-unprivileged); `no-new-privileges`; `tmpfs /tmp`; DB and API
  not published to the host; pinned base images.
- **No secrets in code.** DB credentials come from `.env` (change them before any
  shared deployment).

> ⚠️ **This is not a sandbox.** Nothing is ever detonated. Despite the name and the
> progress log, no sample is executed, no VM is involved, and no behavior is observed.
> Wiring a real detonation backend means standing up a properly isolated sandbox
> environment behind the connector seam — out of scope for this repo.

---

## What the engines actually do

The report shape is richer than any shipped engine can fill, so every report carries a
`provenance` stamp naming the engine that produced it and listing the sections it has
**no evidence for**. The UI renders those sections as an explicit "not observed" state
instead of plausible-looking values, and shows the engine's caveat on every tab.

| Engine | What it does | What it cannot produce |
|---|---|---|
| `static` (default) | Extracts printable ASCII/UTF-16 strings from the retained bytes and matches them against 18 signature rules. Kill chain, score, and extracted IP/domain literals are real findings. | Execution timeline, blast radius, observed network traffic. Never claims more than "Suspicious", and caps confidence — strings are weaker evidence than behavior. |
| `simulated` | Nothing. Fabricates a plausible report deterministically from the sample's SHA-256. | Everything — the whole report is synthetic and is labelled as such. Demo/UI use only. |
| seeded library | Hand-written example reports from the design mockup. | Everything — labelled synthetic. |

**Static analysis is a weak negative.** A signature miss is reported as
`NO MATCH — signature miss is not an all-clear`, never as "benign". Packed, encrypted,
or obfuscated samples match nothing, and that describes most real malware.

---

## Plugging in a real sandbox

Implement the interface in `backend/src/services/connectors/types.ts`:

```ts
export interface SandboxConnector {
  readonly name: string;
  detonate(input: SampleInput, onProgress: ProgressFn, predetermined?: Report | null): Promise<Report>;
}
```

Add your class (e.g. `CapeConnector`) and register it in
`backend/src/services/connectors/index.ts` keyed on `SANDBOX_CONNECTOR`, then set
`SANDBOX_CONNECTOR=cape` in `.env`. No other code changes. Set `RETAIN_BYTES=true`
if your connector needs the sample bytes from the quarantine volume.

---

## Configuration

All optional — see [`.env.example`](.env.example). Key vars: `WEB_PORT`,
`POSTGRES_USER/PASSWORD/DB`, `SANDBOX_CONNECTOR`, `MAX_UPLOAD_BYTES`, `RETAIN_BYTES`,
`ANALYSIS_CONCURRENCY`, `RATE_MAX_REQUESTS`, `SUBMIT_MAX_REQUESTS`.

---

## Local development (without Docker)

```bash
# Terminal 1 — Postgres (or use your own)
docker run --rm -e POSTGRES_USER=detonate -e POSTGRES_PASSWORD=detonate \
  -e POSTGRES_DB=detonate -p 5432:5432 postgres:16-alpine

# Terminal 2 — API
cd backend && npm install && DATABASE_URL=postgres://detonate:detonate@localhost:5432/detonate npm run dev

# Terminal 3 — frontend (Vite proxies /api → :8080)
cd frontend && npm install && npm run dev
```

---

## Project layout

```
docker-compose.yml          single-file deployment
.env.example                configuration template
docs/API.md                 REST contract
backend/                    Express + TS API
  src/
    index.ts                app bootstrap + security middleware
    config.ts               env-driven config
    db/                     pool, migrate+seed, seeded reports
    lib/                    hashing, magic-byte sniffing, validation, severity
    middleware/             rate limiter, error handler
    routes/                 health, samples, jobs, reports
    services/
      analysis.ts           concurrency-limited, restart-safe job queue
      reportGenerator.ts    deterministic synthetic report builder
      connectors/           SandboxConnector interface
        static.ts           default — string extraction + signature rules
        simulated.ts        synthetic report, reads nothing
frontend/                   React + Vite + TS SPA (pixel-faithful port)
  nginx.conf                SPA serve + /api proxy + security headers
```
