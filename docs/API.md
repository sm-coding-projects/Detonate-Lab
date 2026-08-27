# Detonate Lab — API contract

Base URL: `/api`. All responses are JSON unless noted. The SPA is served by nginx
which reverse-proxies `/api/*` to the backend.

## Conventions

- Errors: `{ "error": { "code": string, "message": string } }` with an appropriate
  HTTP status (400 validation, 404 not found, 413 payload too large, 429 rate limited,
  500 internal).
- Severity levels (used everywhere): `critical | high | medium | low | info | none`.
- `seen` / timestamps are ISO-ish display strings already formatted server-side
  (e.g. `2026-06-14 22:17 UTC`).

## Endpoints

### `GET /api/health`
→ `200 { "status": "ok", "time": "<iso>" }`

### `GET /api/samples`
Library listing for the Import screen. Newest first.
→ `200 { "samples": SampleCard[] }`

```ts
type SampleCard = {
  id: string;            // uuid (also the reportId)
  name: string;          // "WRAITHLOCK"
  seen: string;          // "2026-06-14 22:17 UTC"
  classification: string;
  sevLabel: string;      // "CRITICAL"
  sevLevel: Level;       // "critical"
  score: number;         // 0..100
  summary: string;       // short tagline
};
```

### `POST /api/samples`
Submit a sample to detonate. Two content types:

- `multipart/form-data` with field `file` (the dropped sample, ≤ 100 MB).
- `application/json` with `{ "url": "https://…/sample.exe" }`.

The backend **never executes** the bytes. It hashes + fingerprints the file (or URL),
creates a Sample + queued Job, and returns immediately.

→ `202 { "jobId": string, "sampleId": string }`

Validation errors → `400`. Oversized upload → `413`. Rate limited → `429`.

### `GET /api/jobs/:id`
Poll analysis progress. The Analyzing screen polls this ~every 400 ms.
→ `200 Job`

```ts
type Job = {
  id: string;
  sampleId: string;
  name: string;                 // display name being analyzed
  status: "queued" | "running" | "done" | "error";
  progress: number;             // 0..100
  lines: { n: string; txt: string }[];  // streamed analysis log, n = "01".."08"
  reportId?: string;            // set when status === "done"
  error?: string;               // set when status === "error"
};
```

### `GET /api/reports/:id`
Full report for a completed sample (`id` == `sampleId`).
→ `200 { "report": Report }`, or `404` if not ready.

```ts
type Level = "critical"|"high"|"medium"|"low"|"info"|"none";

type Report = {
  id: string;
  name: string; file: string; sha: string; type: string; size: string; seen: string;
  classification: string; verdict: string; confidence: string;
  severity: number; sevLevel: Level; sevLabel: string;
  tagline: string; summary: string;
  tiles:   { l: string; v: string; hot: boolean }[];           // the 3 "hot" stat tiles
  factors: { label: string; on: boolean; level: Level }[];
  killchain: {
    tactic: string; id: string; level: Level; short: string; plain: string;
    techniques: { id: string; name: string; desc: string }[];
  }[];
  timeline: { t: number; label: string; detail: string; level: Level }[];
  blast: { key: string; label: string; sub: string; level: Level;
           stats: { n: number | string; t: string }[] }[];
  network: {
    victim: string; domain: string; proto: string; beacon: string; exfil: string; ja3: string;
    ips: { ip: string; role: string; geo: string }[];
    log: { t: string; e: string }[];
  };
};
```

The frontend reproduces the original design's `renderVals` logic from this raw report
(prepending MITRE-tactics / techniques / behavioral-event counts to `tiles`, computing
tag/severity colors from `level`, etc.). The API returns the raw report only.
