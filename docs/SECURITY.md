# Security

Detonate Lab handles untrusted, potentially malicious uploads, so security is a
first-class concern. This documents the controls in place and the operator's
responsibilities.

## Handling of uploaded samples

- Uploads are **never executed**. They are streamed to a dedicated quarantine volume
  (`/data/quarantine`) as opaque `<uuid>.bin` blobs with mode `0600`.
- Original filenames are sanitized (basename only, restricted charset, length-capped);
  the stored name is a server-generated UUID, never the client's path.
- A hard **size cap** (default 100 MB) is enforced while streaming — oversized uploads
  are aborted and deleted, and the request is rejected with `413`.
- Static analysis only **reads** bytes (hashing, entropy, magic bytes, string scan).
  PE parsing uses pure-python `pefile` and is wrapped in defensive error handling.

## Authentication & sessions

- Passwords hashed with **argon2id** (`argon2-cffi`) — memory-hard, no dependency on
  the removed stdlib `crypt`.
- Sessions are stateless **JWT** (HS256) carried in an **httpOnly** cookie
  (`dl_access`) — unreadable by JavaScript, so XSS cannot exfiltrate the token.
- Cookies are `SameSite=Strict` and `Secure` (when `DL_COOKIE_SECURE=true`).
- **Login throttling**: 5 failures per IP+email locks that pair out for 5 minutes;
  nginx additionally rate-limits the auth endpoints to ~12 req/min.
- Login responses are uniform ("Invalid email or password") — no user enumeration.

## Authorization

Beyond authentication, the read endpoints enforce **object-level authorization**:
a user may only list and fetch their own analyses plus the shared reference
samples; fetching another user's analysis returns `404` (not `403`, to avoid
confirming its existence). Admins may view all. This matches the delete
endpoint's ownership check.

## CSRF

Same-origin SPA + API with `SameSite=Strict` cookies is the primary defense. On top of
that, a **double-submit CSRF token** (`dl_csrf` cookie echoed in the `X-CSRF-Token`
header) is required on every state-changing request (`POST`/`DELETE`), compared in
constant time.

## Transport & headers (nginx)

- **CSP**: `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'self'`, `form-action 'self'`. Scripts and fonts are `'self'` only — no
  external CDNs (fonts are self-hosted), so the CSP needs no third-party allowances.
  `style-src` permits `'unsafe-inline'` because the UI uses inline style attributes.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` locking down device APIs,
  `Cross-Origin-Opener-Policy: same-origin`.
- `Strict-Transport-Security` is provided (commented) — enable it behind HTTPS.
- `server_tokens off`; the backend also sets `nosniff`/`DENY`/`no-store` as
  defense-in-depth.

## Container hardening

- **Non-root** everywhere: backend runs as uid 10001; nginx uses the unprivileged
  image (uid 101); Postgres runs as its own user.
- Backend: `cap_drop: ALL`, `read_only` root filesystem with a `tmpfs` for `/tmp`,
  `no-new-privileges`.
- `no-new-privileges` on all services.
- Multi-stage builds; only the venv and app code ship in the runtime image.
- Only the web port is published; database and API stay on the internal network.

## Input validation & injection

- All request bodies validated by Pydantic; URLs and emails are format-checked.
- Database access is exclusively through SQLAlchemy's parameterized ORM — no string
  SQL, so SQL injection is not reachable.
- React escapes all rendered values; no `dangerouslySetInnerHTML` is used.

## Secrets

- No secret is hard-coded. All come from the environment.
- Production **fails closed**: it will not start with a missing/weak `DL_SECRET_KEY`.
- `.env` is git-ignored; `init-env.sh` writes it `0600`.

## Operator responsibilities

- Serve over **HTTPS** in production and set `DL_COOKIE_SECURE=true`.
- Rotate `DL_SECRET_KEY` and database credentials periodically (rotating the key
  invalidates existing sessions).
- Set `DL_ALLOW_REGISTRATION=false` once your accounts exist if signups aren't wanted.
- Treat the quarantine volume as hostile storage; don't mount it elsewhere or execute
  its contents. Apply your own retention/cleanup policy.
- Keep base images patched (`docker compose build --pull`).

## Reporting

Found an issue? Open a private security advisory rather than a public issue.
