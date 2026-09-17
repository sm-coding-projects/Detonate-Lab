import { promises as dns } from 'node:dns';

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
 * reject obvious SSRF targets (loopback, link-local, private ranges, non-
 * standard schemes). The default connector never actually fetches the URL —
 * but validating here keeps the contract safe for a real connector and rejects
 * junk early.
 *
 * Two stages:
 *  1. host-string sanity  (cheap, no DNS) — fast-rejects obvious bad
 *     hostnames and IPv4/IPv6 literals.
 *  2. DNS resolution      (catches DNS-rebinding): the resolved address(es)
 *     are checked against the same IANA blocklist, so a hostname that
 *     resolves to an internal IP cannot slip through.
 */
export async function validateSampleUrl(raw: unknown): Promise<string> {
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

  // `URL#hostname` strips the bracket form for IPv6 literals.
  const host = u.hostname.toLowerCase();
  if (host === '') throw new ValidationError('url host is not permitted');
  if (isBlockedHost(host) || isBlockedIp(host)) {
    throw new ValidationError('url host is not permitted');
  }

  // DNS resolution. Rejects any resolved address that lands in an internal
  // / reserved range. `all: true` returns every A/AAAA; we check them all.
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ValidationError('url host could not be resolved');
  }
  if (addrs.length === 0) {
    throw new ValidationError('url host did not resolve to an address');
  }
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new ValidationError('url host resolves to a non-public address');
    }
  }
  return u.toString();
}

function isBlockedHost(host: string): boolean {
  if (host === '') return true;
  if (host === 'localhost' || host === '0.0.0.0' || host === '::') return true;
  if (host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return true;
  return false;
}

/**
 * Normalize an IPv6 address string into its 8 colon-separated hextets.
 * Handles :: zero-compression and accepts the bracketed form some resolvers
 * emit. Returns null for syntactically invalid addresses.
 */
function expandIpv6(addr: string): string[] | null {
  const a = addr.replace(/^\[|\]$/g, '').toLowerCase();
  if (!a.includes(':')) return null;
  if (a.includes(':::')) return null;

  // IPv4-mapped (::ffff:a.b.c.d) — expand the v4 tail first.
  const mapped = a.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) {
    const v4 = mapped[1].split('.').map(Number);
    if (v4.length !== 4 || v4.some((n) => n < 0 || n > 255)) return null;
    const high = ((v4[0] << 8) | v4[1]).toString(16).padStart(4, '0');
    const low  = ((v4[2] << 8) | v4[3]).toString(16).padStart(4, '0');
    return ['0000', '0000', '0000', '0000', '0000', 'ffff', high, low];
  }

  const parts = a.split(':');
  let hextets: string[];
  if (a.includes('::')) {
    const [left, right] = a.split('::');
    const leftParts  = left  === '' ? [] : left.split(':');
    const rightParts = right === '' ? [] : right.split(':');
    if (leftParts.length + rightParts.length >= 8) return null;
    const pad = 8 - leftParts.length - rightParts.length;
    hextets = [...leftParts, ...Array(pad).fill('0'), ...rightParts];
  } else {
    hextets = parts;
  }
  if (hextets.length !== 8) return null;
  const out: (string | null)[] = hextets.map((h) => {
    if (h.length === 0 || h.length > 4) return null;
    if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
    return h.padStart(4, '0');
  });
  return out.includes(null) ? null : (out as string[]);
}

/**
 * Returns true if `addr` falls inside any IANA special-purpose range that
 * should never be the target of an outbound fetch from this service.
 * Handles both dotted-quad IPv4 and the IPv6 representation `dns.lookup`
 * returns (no embedded zone).
 */
export function isBlockedIp(addr: string): boolean {
  if (!addr) return true;

  // --- IPv6 ---------------------------------------------------------------
  if (addr.includes(':')) {
    const hextets = expandIpv6(addr);
    if (!hextets) return false;
    // Many IANA IPv6 policies are expressed in /8 or /10 terms. The "first
    // byte" of an IPv6 address is the high byte of the first hextet; the
    // "second byte" is the low byte of the first hextet.
    const firstByte  = parseInt(hextets[0].slice(0, 2), 16);
    const secondByte = parseInt(hextets[0].slice(2, 4), 16);
    // ::/128 unspecified
    if (hextets.every((h) => h === '0000')) return true;
    // ::1/128 loopback
    if (hextets[7] === '0001' && hextets.slice(0, 7).every((h) => h === '0000')) return true;
    // fc00::/7 unique-local — top 7 bits of first byte = 1111110 → 0xFC or 0xFD
    if (firstByte === 0xfc || firstByte === 0xfd) return true;
    // fe80::/10 link-local — first byte 0xFE, second byte's top 2 bits = 10
    if (firstByte === 0xfe && (secondByte & 0xc0) === 0x80) return true;
    // ff00::/8 multicast
    if (firstByte === 0xff) return true;
    // IPv4-mapped (hextet 5 = ffff) — unwrap and check the v4 octets
    if (hextets[5] === 'ffff') {
      const high = parseInt(hextets[6], 16);
      const low  = parseInt(hextets[7], 16);
      const a = (high >> 8) & 0xff;
      const b = high & 0xff;
      const c = (low >> 8) & 0xff;
      const d = low & 0xff;
      return isBlockedIp(`${a}.${b}.${c}.${d}`);
    }
    return false;
  }

  // --- IPv4 ---------------------------------------------------------------
  const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if ([a, b, c, d].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;

  if (a === 0) return true;                                              // 0.0.0.0/8 "this network"
  if (a === 127) return true;                                            // 127.0.0.0/8 loopback
  if (a === 10) return true;                                             // 10.0.0.0/8 RFC1918
  if (a === 169 && b === 254) return true;                               // 169.254.0.0/16 link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;                      // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 168) return true;                               // 192.168.0.0/16 RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true;                     // 100.64.0.0/10 CGNAT
  if (a >= 224 && a <= 239) return true;                                 // 224.0.0.0/4 multicast
  if (a >= 240) return true;                                             // 240.0.0.0/4 reserved (includes 255.255.255.255)
  // TEST-NET ranges (RFC 5737)
  if (a === 192 && b === 0 && c === 2) return true;                      // 192.0.2.0/24
  if (a === 198 && b === 51 && c === 100) return true;                   // 198.51.100.0/24
  if (a === 203 && b === 0 && c === 113) return true;                    // 203.0.113.0/24
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
