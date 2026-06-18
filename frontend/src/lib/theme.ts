import type { CSSProperties } from "react";
import type { Level } from "./types";

// Palette ported verbatim from the Detonate Lab design.
export const COLORS = {
  bg: "#EAE8E2",
  ink: "#1A1915",
  mut: "#807B72",
  hot: "#B23A2E",
  faint: "#46443D",
  hair: "rgba(26,25,21,0.14)",
};

export const LVL: Record<Level, string> = {
  critical: "#B23A2E",
  high: "#BC6B26",
  medium: "#9C7C24",
  low: "#4A6FA5",
  info: "#75716A",
  none: "#3E7A4E",
};

export const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
export const SANS = "'Schibsted Grotesk', system-ui, -apple-system, sans-serif";

export function lvlColor(l: string): string {
  return (LVL as Record<string, string>)[l] || LVL.low;
}

// Pill/tag styling for severity labels.
export function tag(color: string): CSSProperties {
  return {
    display: "inline-block",
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
    color,
    background: `${color}14`,
    border: `1px solid ${color}40`,
    padding: "3px 8px",
    borderRadius: 2,
  };
}

export function dot(color: string, sz = 9): CSSProperties {
  return {
    width: sz,
    height: sz,
    borderRadius: "50%",
    flex: "none",
    background: color,
    display: "inline-block",
  };
}

export const OPACITY_BY_LEVEL: Record<Level, number> = {
  critical: 1,
  high: 0.78,
  medium: 0.58,
  low: 0.4,
  info: 0.28,
  none: 0.28,
};
