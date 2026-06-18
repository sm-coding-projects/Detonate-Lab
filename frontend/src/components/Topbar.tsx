import { COLORS, MONO } from "../lib/theme";
import { useAuth } from "../lib/auth";
import type { Tab } from "../App";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "killchain", label: "Kill chain" },
  { key: "timeline", label: "Timeline" },
  { key: "blast", label: "Blast radius" },
  { key: "network", label: "Network" },
];

export function Topbar({
  inApp,
  tab,
  onTab,
  onBrand,
}: {
  inApp: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  onBrand: () => void;
}) {
  const { user, logout } = useAuth();

  return (
    <div
      className="topbar"
      style={{
        height: 62,
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        borderBottom: `1px solid ${COLORS.hair}`,
        zIndex: 20,
        background: COLORS.bg,
      }}
    >
      <div
        className="hover-dim"
        onClick={onBrand}
        title="Back to start"
        style={{ display: "flex", alignItems: "baseline", gap: 13, cursor: "pointer" }}
      >
        <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>Detonate Lab</div>
        <div className="tagline" style={{ fontFamily: MONO, fontSize: 11, color: COLORS.mut, letterSpacing: "0.02em" }}>
          Malware Detonation Sandbox
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {inApp && (
          <div className="navtabs" style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  className="nav-btn"
                  onClick={() => onTab(t.key)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "'Schibsted Grotesk', sans-serif",
                    fontSize: 13.5,
                    padding: 0,
                    color: active ? COLORS.ink : COLORS.mut,
                    textDecoration: active ? "underline" : "none",
                    textUnderlineOffset: 6,
                    textDecorationThickness: 1.5,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
        {user && (
          <button
            className="text-link"
            onClick={logout}
            title={user.email}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: 11,
              color: COLORS.mut,
              padding: 0,
            }}
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
