import { useEffect, useState } from "react";
import { COLORS, MONO, lvlColor, dot } from "../../lib/theme";
import type { BlastStat, Report } from "../../lib/types";

function countVal(n: number | string, p: number): string {
  if (typeof n === "number") return Math.round(n * p).toLocaleString("en-US");
  return p >= 0.55 ? n : "—";
}

export function Blast({ report }: { report: Report }) {
  const blast = report.blast;
  const origin = blast[0];
  const rings = blast.slice(1);
  const [armed, setArmed] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), 60);
    const start = performance.now();
    const dur = 1100;
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / dur);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className="reveal g-blast"
      style={{ marginTop: 30, display: "grid", gridTemplateColumns: "1fr 360px", gap: 48, alignItems: "start" }}
    >
      <div
        className="blast-canvas"
        style={{
          position: "relative",
          height: 560,
          border: `1px solid ${COLORS.hair}`,
          borderRadius: 4,
          overflow: "hidden",
          background: "#EEECE6",
        }}
      >
        {rings.map((L, j) => {
          const c = lvlColor(L.level);
          const d = (j + 1) * 100 + 60;
          return (
            <div
              key={j}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                borderRadius: "50%",
                width: d,
                height: d,
                border: `1px solid ${c}`,
                transition: `opacity .7s ease ${j * 0.12}s, transform .7s cubic-bezier(.2,.8,.2,1) ${j * 0.12}s`,
                opacity: armed ? 0.85 - j * 0.1 : 0,
                transform: `translate(-50%,-50%) scale(${armed ? 1 : 0.4})`,
              }}
            />
          );
        })}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            zIndex: 5,
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 3,
              background: COLORS.hot,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EAE8E2" strokeWidth="1.7">
              <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
              <path d="M12 8v4" />
              <circle cx="12" cy="15.5" r="0.5" fill="#EAE8E2" stroke="none" />
            </svg>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: COLORS.ink }}>{origin.label}</div>
          <div style={{ fontSize: 11, color: "#6E6A60" }}>{origin.sub}</div>
        </div>
      </div>

      <div>
        {blast.map((L, i) => {
          const c = lvlColor(L.level);
          return (
            <div key={i} style={{ padding: "18px 0", borderBottom: "1px solid rgba(26,25,21,0.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={dot(c, 9)} />
                <span style={{ fontSize: 14.5, fontWeight: 500 }}>{L.label}</span>
                <span style={{ fontSize: 11, color: COLORS.mut, marginLeft: "auto" }}>{L.sub}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
                {L.stats.map((s: BlastStat, j) => (
                  <div key={j}>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 22,
                        fontWeight: 500,
                        letterSpacing: "-0.01em",
                        color: typeof s.n === "number" && s.n >= 1000 ? COLORS.hot : COLORS.ink,
                      }}
                    >
                      {countVal(s.n, progress)}
                    </div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: COLORS.mut,
                        marginTop: 3,
                      }}
                    >
                      {s.t}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
