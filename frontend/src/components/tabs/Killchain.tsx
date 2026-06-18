import { useState } from "react";
import { COLORS, MONO, lvlColor, tag } from "../../lib/theme";
import type { Report } from "../../lib/types";

const ROW_COLS = "44px 1fr 168px 96px";

export function Killchain({ report }: { report: Report }) {
  const [open, setOpen] = useState(0);

  return (
    <div className="reveal" style={{ marginTop: 34 }}>
      <div
        className="kc-row"
        style={{
          display: "grid",
          gridTemplateColumns: ROW_COLS,
          gap: 16,
          paddingBottom: 11,
          borderBottom: "1px solid rgba(26,25,21,0.22)",
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: COLORS.mut,
        }}
      >
        <span />
        <span>Tactic</span>
        <span className="kc-mid">MITRE · techniques</span>
        <span style={{ textAlign: "right" }}>Severity</span>
      </div>

      {report.killchain.map((k, i) => {
        const c = lvlColor(k.level);
        const isOpen = open === i;
        const count = `${k.techniques.length} ${k.techniques.length > 1 ? "techniques" : "technique"}`;
        return (
          <div key={i}>
            <div
              className="kc-row"
              onClick={() => setOpen(isOpen ? -1 : i)}
              style={{
                display: "grid",
                gridTemplateColumns: ROW_COLS,
                gap: 16,
                alignItems: "center",
                padding: "19px 0",
                cursor: "pointer",
                borderBottom: `1px solid ${COLORS.hair}`,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 12, color: "#A6A29A" }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em", color: COLORS.ink }}>{k.tactic}</span>
              <span className="kc-mid" style={{ fontFamily: MONO, fontSize: 11.5, color: "#6E6A60" }}>
                {k.id} · {count}
              </span>
              <span style={{ textAlign: "right" }}>
                <span style={tag(c)}>{k.level.toUpperCase()}</span>
              </span>
            </div>
            {isOpen && (
              <div style={{ padding: "2px 0 28px 60px", borderBottom: `1px solid ${COLORS.hair}` }}>
                <p
                  style={{
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: COLORS.faint,
                    maxWidth: 680,
                    margin: "14px 0 0",
                    borderLeft: `2px solid ${c}`,
                    paddingLeft: 16,
                  }}
                >
                  {k.plain}
                </p>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: COLORS.mut,
                    margin: "20px 0 12px",
                  }}
                >
                  Techniques observed
                </div>
                {k.techniques.map((t, j) => (
                  <div key={j} style={{ display: "flex", gap: 14, padding: "11px 0", borderTop: "1px solid rgba(26,25,21,0.1)" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: COLORS.ink, width: 90, flex: "none" }}>
                      {t.id}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{t.name}</div>
                      <div style={{ fontSize: 13, color: "#6E6A60", lineHeight: 1.5, marginTop: 2 }}>{t.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
