import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS, MONO, lvlColor, tag, dot } from "../../lib/theme";
import type { Report } from "../../lib/types";

const SPEEDS = [1, 2.5, 5];

function fmt(t: number): string {
  if (t < 0) t = 0;
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${String(m).padStart(2, "0")}:${sec.toFixed(1).padStart(4, "0")}`;
}

export function Timeline({ report }: { report: Report }) {
  const events = report.timeline;
  const dur = useMemo(() => (events.length ? events[events.length - 1].t + 1.4 : 1.4), [events]);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2.5);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    lastRef.current = performance.now();
    const step = (now: number) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      setPlayhead((prev) => {
        const np = prev + dt * speed;
        if (np >= dur) {
          setPlaying(false);
          return dur;
        }
        return np;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, dur]);

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
    } else {
      if (playhead >= dur) setPlayhead(0);
      setPlaying(true);
    }
  };

  const pct = (t: number) => (dur ? (t / dur) * 100 : 0);

  return (
    <div className="reveal" style={{ marginTop: 34 }}>
      <div
        className="tl-controls"
        style={{ display: "flex", alignItems: "center", gap: 18, paddingBottom: 22, borderBottom: `1px solid ${COLORS.hair}` }}
      >
        <button
          onClick={togglePlay}
          style={{
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            color: COLORS.bg,
            background: COLORS.ink,
            border: "none",
            borderRadius: 3,
            padding: "9px 18px",
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 500, minWidth: 150 }}>
          T+{fmt(playhead)} <span style={{ color: "#A6A29A", fontSize: 12 }}>/ {fmt(dur)}</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.mut }}>
          Speed
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {SPEEDS.map((v) => {
            const active = speed === v;
            return (
              <button
                key={v}
                onClick={() => setSpeed(v)}
                style={{
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 9px",
                  borderRadius: 2,
                  background: active ? COLORS.ink : "transparent",
                  color: active ? COLORS.bg : COLORS.mut,
                  border: active ? `1px solid ${COLORS.ink}` : "1px solid rgba(26,25,21,0.2)",
                }}
              >
                {v}×
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrubber track */}
      <div style={{ position: "relative", height: 40, margin: "18px 2px 6px" }}>
        <div style={{ position: "absolute", top: 19, left: 0, right: 0, height: 2, background: "rgba(26,25,21,0.14)" }} />
        <div style={{ position: "absolute", top: 19, left: 0, height: 2, background: COLORS.ink, width: `${pct(playhead)}%` }} />
        {events.map((e, i) => {
          const fired = playhead >= e.t;
          return (
            <div
              key={i}
              onClick={() => {
                setPlaying(false);
                setPlayhead(e.t);
              }}
              style={{
                position: "absolute",
                top: 14,
                width: 11,
                height: 11,
                borderRadius: "50%",
                transform: "translateX(-50%)",
                cursor: "pointer",
                border: `2px solid ${COLORS.bg}`,
                left: `${pct(e.t)}%`,
                background: fired ? lvlColor(e.level) : "#C0BCB2",
              }}
            />
          );
        })}
        <div
          style={{
            position: "absolute",
            top: 10,
            width: 2,
            height: 20,
            background: COLORS.ink,
            transform: "translateX(-50%)",
            left: `${pct(playhead)}%`,
          }}
        />
        <input
          type="range"
          min={0}
          max={dur}
          step={0.1}
          value={playhead}
          onChange={(e) => {
            setPlaying(false);
            setPlayhead(parseFloat(e.target.value));
          }}
          style={{ position: "absolute", top: 8, left: 0, width: "100%", height: 24, opacity: 0, cursor: "pointer", margin: 0 }}
        />
      </div>

      {/* Event rows */}
      <div>
        {events.map((e, i) => {
          const c = lvlColor(e.level);
          const fired = playhead >= e.t;
          const next = events[i + 1];
          const active = fired && (!next || playhead < next.t);
          return (
            <div
              key={i}
              onClick={() => {
                setPlaying(false);
                setPlayhead(e.t);
              }}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                padding: "14px 0",
                cursor: "pointer",
                borderBottom: "1px solid rgba(26,25,21,0.1)",
                opacity: fired ? 1 : 0.45,
                ...(active ? { borderLeft: `2px solid ${c}`, paddingLeft: 14, marginLeft: -16 } : null),
              }}
            >
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, width: 62, flex: "none", color: fired ? c : "#A6A29A" }}>
                {fmt(e.t)}
              </div>
              <span style={{ ...dot(fired ? c : "#C0BCB2", 9), marginTop: 5 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: COLORS.ink }}>{e.label}</span>
                  <span style={tag(c)}>{e.level.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 13, color: "#6E6A60", lineHeight: 1.45, marginTop: 2 }}>{e.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
