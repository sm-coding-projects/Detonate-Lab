import { createHash, randomUUID } from 'node:crypto';

export function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function uuid(): string {
  return randomUUID();
}

/** Deterministic 32-bit unsigned int derived from a seed string (for stable synthesis). */
export function seedInt(seed: string, salt = ''): number {
  const h = createHash('sha256').update(salt + seed).digest();
  return h.readUInt32BE(0);
}

/** Seeded pseudo-random generator in [0,1) — same seed always yields the same sequence. */
export function rng(seed: string): () => number {
  let s = seedInt(seed) || 1;
  return () => {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 0xffffffff;
  };
}
