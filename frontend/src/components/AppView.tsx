import { COLORS, MONO, lvlColor, tag } from "../lib/theme";
import type { Report } from "../lib/types";
import type { Tab } from "../App";
import { Overview } from "./tabs/Overview";
import { Killchain } from "./tabs/Killchain";
import { Timeline } from "./tabs/Timeline";
import { Blast } from "./tabs/Blast";
import { Network } from "./tabs/Network";

const TITLES: Record<Tab, [string, string, string]> = {
  overview: ["Report", "Threat overview", "Verdict, severity and key behaviors"],
  killchain: ["Report", "Kill chain", "MITRE ATT&CK tactics and techniques observed"],
  timeline: ["Report", "Execution timeline", "Behavioral events in order of execution — press play to replay"],
  blast: ["Report", "Blast radius", "Scope and impact of the infection"],
  network: ["Report", "Network activity", "Command-and-control and data exfiltration"],
};

export function AppView({
  report,
  tab,
  onTab,
  onNew,
}: {
  report: Report;
  tab: Tab;
  onTab: (t: Tab) => void;
  onNew: () => void;
}) {
  const color = lvlColor(report.sevLevel);
  const [tabTag, tabTitle, tabSub] = TITLES[tab];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: "none", borderBottom: `1px solid ${COLORS.hair}` }}>
        <div
          className="wrap doc-title"
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            padding: "24px 32px 22px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 24,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 27, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>{report.name}</h2>
              <span style={tag(color)}>
                {report.sevLabel} {report.severity}
              </span>
              {report.synthetic && (
                <span style={tag(COLORS.mut)} title="Behavioral data synthesized from static analysis">
                  HEURISTIC
                </span>
              )}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: COLORS.mut, marginTop: 8, wordBreak: "break-all" }}>
              {report.sha}
            </div>
          </div>
          <div className="doc-right" style={{ textAlign: "right", flex: "none" }}>
            <button
              onClick={onNew}
              className="text-link"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13.5,
                color: COLORS.ink,
                textDecoration: "underline",
                textUnderlineOffset: 5,
                textDecorationThickness: 1.5,
                padding: 0,
              }}
            >
              New analysis
            </button>
            <div style={{ fontFamily: MONO, fontSize: 11, color: COLORS.mut, marginTop: 9 }}>
              {report.classification}
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <div className="wrap" style={{ maxWidth: 1120, margin: "0 auto", padding: "34px 32px 80px" }}>
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: COLORS.mut,
              }}
            >
              {tabTag}
            </div>
            <h1 style={{ fontSize: "clamp(26px,3.4vw,40px)", fontWeight: 500, letterSpacing: "-0.022em", margin: "7px 0 0" }}>
              {tabTitle}
            </h1>
            <div style={{ fontSize: 14.5, color: "#6E6A60", marginTop: 5 }}>{tabSub}</div>
          </div>

          {tab === "overview" && <Overview report={report} onOpenKillchain={() => onTab("killchain")} />}
          {tab === "killchain" && <Killchain report={report} />}
          {tab === "timeline" && <Timeline report={report} />}
          {tab === "blast" && <Blast report={report} />}
          {tab === "network" && <Network report={report} />}
        </div>
      </div>
    </div>
  );
}
