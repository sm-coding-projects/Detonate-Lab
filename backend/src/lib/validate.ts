export class ValidationError extends Error {
  status = 400;
  code = 'validation_error';
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate a user-supplied URL for a sample fetch. We only accept http(s) and
 * reject obvious SSRF targets (loopback, link-local, private ranges, non-standard
 * schemes). The default connector never actually fetches the URL — but validating
 * here keeps the contract safe for a real connector and rejects junk early.
 */
export function validateSampleUrl(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('url must be a string');
  const value = raw.trim();
  if (!value) throw new ValidationError('url is required');
  if (value.length > 2048) throw new ValidationError('url is too long');

  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new ValidationError('url is not a valid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ValidationError('url must use http or https');
  }
  const host = u.hostname.toLowerCase();
  if (isBlockedHost(host)) {
    throw new ValidationError('url host is not permitted');
  }
  return u.toString();
}

function isBlockedHost(host: string): boolean {
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
  if (host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return true;

  // IPv4 literal checks for private / loopback / link-local / metadata ranges.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Strip control chars and clamp length for any user-facing display string. */
export function cleanName(raw: string, max = 160): string {
  let cleaned = '';
  for (const ch of raw) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x20 && c !== 0x7f) cleaned += ch;
  }
  cleaned = cleaned.trim();
  const base = cleaned.split(/[\\/]/).pop() || cleaned;
  return base.slice(0, max) || 'sample';
}
