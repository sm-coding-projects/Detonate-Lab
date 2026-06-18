import { COLORS, MONO } from "../lib/theme";
import type { Analysis } from "../lib/types";

export function AnalyzingView({ analysis }: { analysis: Analysis }) {
  const progress = analysis.progress;
  const name = analysis.source_name || "sample";
  const lines = analysis.stage_lines || [];

  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      <div
        className="wrap"
        style={{ maxWidth: 1120, margin: "0 auto", padding: "88px 32px", display: "flex", flexDirection: "column", gap: 44 }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: COLORS.mut }}>Detonating in isolated sandbox</div>
            <h2
              style={{
                fontSize: "clamp(26px,3.8vw,42px)",
                fontWeight: 500,
                letterSpacing: "-0.02em",
                margin: "10px 0 0",
                wordBreak: "break-all",
              }}
            >
              {name}
            </h2>
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: "clamp(54px,10vw,118px)",
              fontWeight: 500,
              lineHeight: 0.82,
              letterSpacing: "-0.04em",
            }}
          >
            {progress}
            <span style={{ fontSize: "0.38em", color: COLORS.mut }}>%</span>
          </div>
        </div>

        <div style={{ height: 2, background: "rgba(26,25,21,0.14)", position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              background: COLORS.ink,
              width: `${progress}%`,
              transition: "width .3s ease",
            }}
          />
        </div>

        <div
          style={{
            fontFamily: MONO,
            fontSize: 12.5,
            color: COLORS.faint,
            display: "flex",
            flexDirection: "column",
            gap: 9,
            minHeight: 200,
          }}
        >
          {lines.map((line, i) => (
            <div key={i} className="an-row" style={{ display: "flex", gap: 14 }}>
              <span style={{ color: "#A6A29A" }}>{String(i + 1).padStart(2, "0")}</span>
              <span>{line}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
