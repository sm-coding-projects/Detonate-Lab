import type { CSSProperties } from 'react';
import type { Level } from './types';

// Palette — ported verbatim from the design.
export const BG = '#EAE8E2';
export const INK = '#1A1915';
export const MUT = '#807B72';
export const HOT = '#B23A2E';

export const LVL: Record<Level, string> = {
  critical: '#B23A2E',
  high: '#BC6B26',
  medium: '#9C7C24',
  low: '#4A6FA5',
  info: '#75716A',
  none: '#3E7A4E',
};

export function lvlColor(l: Level | string): string {
  return (LVL as Record<string, string>)[l] || '#4A6FA5';
}

// Returns the design's CSS string for a severity tag, exactly as `tag(c)`.
export function tag(c: string): string {
  return (
    "display:inline-block;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;letter-spacing:0.05em;white-space:nowrap;color:" +
    c +
    ';background:' +
    c +
    '14;border:1px solid ' +
    c +
    '40;padding:3px 8px;border-radius:2px'
  );
}

// Returns the design's CSS string for a colored dot, exactly as `dot(c,sz)`.
export function dot(c: string, sz?: number): string {
  const s = sz || 9;
  return (
    'width:' +
    s +
    'px;height:' +
    s +
    'px;border-radius:50%;flex:none;background:' +
    c
  );
}

// Parse a design CSS string ("a:b;c:d") into a React style object.
export function css(str: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of str.split(';')) {
    const i = decl.indexOf(':');
    if (i === -1) continue;
    const rawKey = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!rawKey) continue;
    // camelCase the property, leaving custom props (--x) alone.
    const key = rawKey.startsWith('--')
      ? rawKey
      : rawKey.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
    out[key] = val;
  }
  return out as CSSProperties;
}
