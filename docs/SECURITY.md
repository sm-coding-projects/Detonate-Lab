# Security

Detonate Lab accepts user-supplied files and URLs and asks a connector to
score them. Even with a safe connector the upload path itself has to be
defended, so security is treated as a first-class concern. This document
describes the controls actually in the tree, and the operator's
responsibilities on top of them.

## Handling of submitted samples

- Submissions are **never executed**. The default `SANDBOX_CONNECTOR=static`
  reads bytes (hash, magic, strings, entropy) without ever calling into the
  OS; `SANDBOX_CONNECTOR=simulated` is a deterministic mock. Both connectors
  keep the file paths and byte contents inside the process — no shells, no
  dynamic loading.
- When `RETAIN_BYTES=true` uploads are streamed to a per-job directory and
  read back; otherwise the bytes are discarded after hashing and the
  connector logs a warning so the report reflects that it had no content to
  scan.
- A hard **size cap** (`MAX_UPLOAD_BYTES`, default 100 MB) is enforced by
  `multer` while streaming. Oversized requests are aborted and rejected with
  `413 Payload too large`.
- Original filenames are sanitized (`cleanName`: basename only, control
  characters stripped, length-capped at 160 chars). The sample name in the
  database is the cleaned display name; the on-disk name is never the
  client's path.

## Transport & headers (nginx)

`web/nginx.conf` and `web/security-headers.conf` set:

- `Strict-Transport-Security` — `max-age=31536000; includeSubDomains`. Only
  emitted when `$https = on`, so a plain-HTTP deployment behind a TLS
  terminator doesn't strand clients.
- `Content-Security-Policy` — `default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-
  src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self';
  form-action 'self'; upgrade-insecure-requests`. The `unsafe-inline` is for
  inline `style=` attributes the UI uses; scripts and fonts are self-hosted
  so no third-party allow-list is needed.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` disabling the
  non-essential device APIs, `Cross-Origin-Opener-Policy: same-origin`.
- `Cross-Origin-Resource-Policy: same-origin` on `/assets/` (the SPA's hashed
  bundles). They are same-origin by default, but the explicit header stops
  speculative cross-origin reads.
- `server_tokens off` — nginx no longer echoes the version banner on error
  pages.

The API tier (Express) re-applies `nosniff`/`DENY`/`no-store` via
`helmet()` as defense in depth and emits `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, and `Cross-Origin-Resource-Policy:
same-site` regardless of what nginx does.

## CSRF / CORS

- Same-origin SPA + API: nginx serves the SPA and proxies `/api/` to the
  backend, so the browser sees a single origin and the Same-Origin Policy
  is the primary CSRF defense. `CORS_ORIGINS` is empty by default and only
  widens when explicitly configured.
- Cookies: this service does not set authentication cookies — there is no
  auth in the current scope (see "Out of scope" below).

## Input validation & injection

- All request bodies are validated by a small custom validator
  (`backend/src/lib/validate.ts`): URL submission is parsed with `URL`,
  bounded to 2048 chars, restricted to `http`/`https`, and every resolved
  address is checked against an SSRF blocklist (see below).
- Database access is exclusively through `pg`'s parameterized queries
  (`$1, $2, ...`); no string interpolation into SQL. SQL injection is not
  reachable.
- The frontend renders all dynamic values through React's normal
  escape-the-children path; no `dangerouslySetInnerHTML` is used.

## SSRF blocklist

`validateSampleUrl` rejects URLs whose host or any resolved address is in
any of the following ranges (the blocklist mirrors the IANA "Special-Purpose
Address Registry" and the public-suffix equivalents):

- IPv4: `0.0.0.0/8`, `127.0.0.0/8`, `10.0.0.0/8`, `169.254.0.0/16`,
  `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` (CGNAT),
  `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`,
  `240.0.0.0/4`.
- IPv6: `::/128`, `::1/128`, `fc00::/7` (unique-local), `fe80::/10`
  (link-local), `ff00::/8` (multicast), and IPv4-mapped equivalents.
- Names: `localhost`, `*.localhost`, `*.internal`, `*.local`.

The default connector never fetches the URL, so this is a contract guard:
a future connector (real detonation backend) cannot be tricked into
reaching internal infrastructure through a DNS-rebinding-style attack.

## Rate limiting

- Global per-IP token bucket on `/api` (`RATE_MAX_REQUESTS`,
  `RATE_WINDOW_MS`, defaults 120 / 60 s).
- Stricter bucket on `POST /api/samples` (`SUBMIT_MAX_REQUESTS`, default 12
  per minute).
- Per-route bucket on `GET /api/reports/:id` (`REPORT_MAX_REQUESTS`, default
  30 per minute) so a polling client cannot hammer the endpoint while
  waiting for a job.
- Multi-replica deployments need to back these with Redis; the in-memory
  bucket is single-instance.

## Logging & error hygiene

- A single structured logger (`backend/src/lib/log.ts`) emits one JSON line
  per event to stdout/stderr. There is no `console.*` call in the backend
  source tree — search-confirmed.
- The central `errorHandler` middleware never forwards upstream error
  messages to the response body. Each status code resolves to a curated
  short message; raw `err.message` only goes to the log.
- The multer upload middleware replaces its default error messages with
  curated strings, so a malformed multipart body never reveals parser
  internals.
- `Cache-Control: private, no-store` is set on `GET /api/reports/:id` so
  proxies and shared caches don't retain user-private reports.

## Container hardening

- **Non-root** everywhere: backend runs as a non-root user, nginx uses the
  unprivileged image (`nginxinc/nginx-unprivileged`), Postgres runs as its
  own user. Only the web port is published; database and API stay on the
  internal Docker network.
- Backend: `read_only` root filesystem, `cap_drop: ALL`,
  `no-new-privileges`, `tmpfs` for `/tmp` and any temp dirs.
- Multi-stage builds; only the compiled app and production `node_modules`
  ship in the runtime image.

## Secrets

- No secret is hard-coded; everything is read from the environment.
- `.env` is git-ignored and is expected to be `0600`.

## Out of scope

- **Authentication / authorization**: this build has no user accounts, no
  JWT, no CSRF cookie. The threat model assumes a trusted local user (a
  security analyst running the stack) submitting their own samples. Adding
  auth is a future PR; when it lands, argon2id for passwords,
  httpOnly/SameSite=Strict cookies for sessions, and a double-submit CSRF
  token are the planned controls.
- **Real detonation**: the `static` and `simulated` connectors are
  intentionally safe. Wiring a real sandbox (CAPE, Cuckoo, etc.) is an
  operator choice; the SSRF blocklist above is the line of defense that
  travels with that change.

## Operator responsibilities

- Serve over **HTTPS** in production. The HSTS header is gated on `$https`,
  so terminating TLS at nginx (or in front of it) is what activates it.
- Keep base images patched (`docker compose build --pull --no-cache`).
- Treat the upload directory as hostile storage; don't mount it elsewhere
  or execute its contents. Apply your own retention/cleanup policy.
- If you wire a real sandbox connector, keep the SSRF blocklist in
  `backend/src/lib/validate.ts` up to date and add a DNS-rebinding check at
  the fetch boundary (resolve, then connect to the resolved IP with the
  hostname in the `Host:` header).

## Reporting

Found an issue? Open a private security advisory rather than a public issue.
