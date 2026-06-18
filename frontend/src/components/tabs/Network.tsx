import { COLORS, MONO } from "../../lib/theme";
import type { Report } from "../../lib/types";

export function Network({ report }: { report: Report }) {
  const net = report.network;
  const ja3Short = net.ja3.length > 18 ? net.ja3.slice(0, 18) + "…" : net.ja3;
  const chips = [
    { l: "Protocol", v: net.proto, hot: false },
    { l: "Beacon interval", v: net.beacon, hot: false },
    { l: "C2 domain", v: net.domain, hot: false },
    { l: "JA3 fingerprint", v: ja3Short, hot: false },
    { l: "Data exfiltrated", v: net.exfil, hot: true },
    { l: "C2 endpoints", v: String(net.ips.length), hot: false },
  ];

  return (
    <div className="reveal" style={{ marginTop: 30 }}>
      <div
        className="net-flow"
        style={{
          display: "flex",
          alignItems: "center",
          padding: "34px 0",
          borderTop: `1px solid ${COLORS.hair}`,
          borderBottom: `1px solid ${COLORS.hair}`,
        }}
      >
        <div style={{ flex: "none", width: 170, display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 3,
              border: "1px solid rgba(26,25,21,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#46443D" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="13" rx="1" />
              <path d="M8 20h8M12 17v3" />
            </svg>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{net.victim}</div>
          <div style={{ fontSize: 11, color: COLORS.mut }}>Infected host</div>
        </div>

        <div className="net-mid" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, padding: "0 10px" }}>
          <div style={{ height: 1, background: "repeating-linear-gradient(90deg,#46443D 0 7px,transparent 7px 15px)", backgroundSize: "15px 1px", animation: "flow 1s linear infinite" }} />
          <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 10.5, color: "#46443D" }}>
            ◂ encrypted beacon every {net.beacon}
          </div>
          <div style={{ height: 5, background: "repeating-linear-gradient(90deg,#B23A2E 0 9px,transparent 9px 18px)", backgroundSize: "18px 5px", animation: "flow 0.7s linear infinite" }} />
          <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 10.5, color: COLORS.hot }}>
            {net.exfil} exfiltrated ▸
          </div>
        </div>

        <div style={{ flex: "none", width: 200, display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 3,
              border: "1px solid rgba(178,58,46,0.45)",
              background: "rgba(178,58,46,0.07)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#B23A2E" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="7" rx="1" />
              <rect x="3" y="13" width="18" height="7" rx="1" />
              <circle cx="7" cy="7.5" r="0.6" fill="#B23A2E" stroke="none" />
              <circle cx="7" cy="16.5" r="0.6" fill="#B23A2E" stroke="none" />
            </svg>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: COLORS.hot, textAlign: "center" }}>{net.domain}</div>
          <div style={{ fontSize: 11, color: COLORS.mut }}>C2 · {net.proto}</div>
        </div>
      </div>

      <div className="g-chips" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderBottom: `1px solid ${COLORS.hair}` }}>
        {chips.map((c, i) => (
          <div
            key={i}
            style={{
              padding: `20px 18px 18px ${i % 3 === 0 ? "0" : "18px"}`,
              borderTop: `1px solid ${COLORS.hair}`,
              borderLeft: i % 3 === 0 ? "none" : "1px solid rgba(26,25,21,0.12)",
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.mut }}>
              {c.l}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 15,
                fontWeight: 600,
                wordBreak: "break-all",
                marginTop: 7,
                color: c.hot ? COLORS.hot : COLORS.ink,
              }}
            >
              {c.v}
            </div>
          </div>
        ))}
      </div>

      <div className="g-two" style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 56, padding: "38px 0 4px" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.mut, marginBottom: 6 }}>
            Network indicators
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr 0.5fr",
              gap: 10,
              padding: "12px 0 10px",
              borderBottom: "1px solid rgba(26,25,21,0.22)",
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: COLORS.mut,
            }}
          >
            <span>IP address</span>
            <span>Role</span>
            <span>Geo</span>
          </div>
          {net.ips.length === 0 && (
            <div style={{ fontSize: 13, color: "#6E6A60", padding: "14px 0" }}>No network indicators observed.</div>
          )}
          {net.ips.map((ip, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 1fr 0.5fr",
                gap: 10,
                alignItems: "center",
                padding: "13px 0",
                borderBottom: "1px solid rgba(26,25,21,0.1)",
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 12.5, color: COLORS.ink }}>{ip.ip}</span>
              <span style={{ fontSize: 13, color: "#46443D" }}>{ip.role}</span>
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: COLORS.mut }}>{ip.geo}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.mut, marginBottom: 6 }}>
            Communication log
          </div>
          {net.log.map((g, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 12,
                padding: "11px 0",
                borderBottom: "1px solid rgba(26,25,21,0.1)",
                fontFamily: MONO,
                fontSize: 12,
              }}
            >
              <span style={{ color: COLORS.mut, flex: "none" }}>{g.t}</span>
              <span style={{ color: "#46443D", lineHeight: 1.45 }}>{g.e}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
