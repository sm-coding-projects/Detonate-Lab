import { COLORS, MONO, OPACITY_BY_LEVEL, lvlColor, tag, dot } from "../../lib/theme";
import type { Report } from "../../lib/types";

export function Overview({ report, onOpenKillchain }: { report: Report; onOpenKillchain: () => void }) {
  const color = lvlColor(report.sevLevel);

  return (
    <div className="reveal">
      {/* Verdict + score */}
      <div
        className="g-verdict"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1.05fr) minmax(0,1fr)",
          gap: 56,
          padding: "40px 0 38px",
          borderBottom: `1px solid ${COLORS.hair}`,
        }}
      >
        <div>
          <Label>Threat score</Label>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 18, marginTop: 12 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: "clamp(64px,11vw,120px)",
                fontWeight: 500,
                lineHeight: 0.82,
                letterSpacing: "-0.04em",
                color,
              }}
            >
              {report.severity}
            </div>
            <div style={{ paddingBottom: 14 }}>
              <div style={{ fontFamily: MONO, fontSize: 13, color: COLORS.mut }}>/ 100</div>
              <div style={{ marginTop: 10 }}>
                <span style={tag(color)}>{report.sevLabel}</span>
              </div>
            </div>
          </div>
          <div style={{ height: 3, background: "rgba(26,25,21,0.12)", marginTop: 26, position: "relative" }}>
            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", background: color, width: `${report.severity}%` }} />
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: COLORS.mut, marginTop: 12 }}>
            Confidence — {report.confidence}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 19, lineHeight: 1.5, fontWeight: 500, letterSpacing: "-0.01em" }}>
            {report.verdict} — {report.classification}.
          </div>
          <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 1.66, color: COLORS.faint }}>{report.summary}</p>
        </div>
      </div>

      {/* Tiles */}
      <div
        className="g-tiles"
        style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", borderBottom: `1px solid ${COLORS.hair}` }}
      >
        {report.tiles.map((t, i) => (
          <div
            key={i}
            style={{
              padding: `24px 18px 22px ${i === 0 ? "0" : "18px"}`,
              borderLeft: i === 0 ? "none" : "1px solid rgba(26,25,21,0.12)",
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 30,
                fontWeight: 500,
                letterSpacing: "-0.02em",
                color: t.hot ? COLORS.hot : COLORS.ink,
              }}
            >
              {t.v}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: COLORS.mut,
                marginTop: 7,
                lineHeight: 1.3,
              }}
            >
              {t.l}
            </div>
          </div>
        ))}
      </div>

      {/* Attack in sequence */}
      <div style={{ padding: "38px 0", borderBottom: `1px solid ${COLORS.hair}` }}>
        <Label style={{ marginBottom: 20 }}>The attack, in sequence</Label>
        <div style={{ display: "flex", gap: 5 }}>
          {report.killchain.map((k, i) => (
            <div key={i} onClick={onOpenKillchain} style={{ flex: 1, cursor: "pointer" }}>
              <div style={{ height: 42, borderRadius: 2, background: lvlColor(k.level), opacity: OPACITY_BY_LEVEL[k.level] }} />
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 8.5,
                  color: COLORS.mut,
                  textAlign: "center",
                  marginTop: 8,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {k.short}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Factors + top actions */}
      <div className="g-two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, padding: "38px 0 4px" }}>
        <div>
          <Label style={{ marginBottom: 6 }}>Severity factors</Label>
          {report.factors.map((f, i) => {
            const c = f.on ? lvlColor(f.level) : "#C0BCB2";
            return (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: "1px solid rgba(26,25,21,0.1)" }}
              >
                <span style={dot(c, 8)} />
                <span style={{ flex: 1, fontSize: 14, color: COLORS.ink }}>{f.label}</span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    color: f.on ? lvlColor(f.level) : "#A6A29A",
                  }}
                >
                  {f.on ? "Detected" : "Not seen"}
                </span>
              </div>
            );
          })}
        </div>
        <div>
          <Label style={{ marginBottom: 6 }}>Most damaging actions</Label>
          {report.timeline
            .filter((e) => e.level === "critical" || e.level === "high")
            .slice(0, 5)
            .map((a, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "13px 0", borderBottom: "1px solid rgba(26,25,21,0.1)" }}
              >
                <span style={{ ...dot(lvlColor(a.level), 8), marginTop: 6 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{a.label}</div>
                  <div style={{ fontSize: 12.5, color: "#6E6A60", lineHeight: 1.45, marginTop: 2 }}>{a.detail}</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: COLORS.mut,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
