import { useState } from 'react';
import type { Report, Tab } from '../types';
import { lvlColor, tag, css } from '../theme';
import Overview from './tabs/Overview';
import KillChain from './tabs/KillChain';
import Timeline from './tabs/Timeline';
import Blast from './tabs/Blast';
import Network from './tabs/Network';
import { ProvenanceBanner, NotObserved, isUnsupported } from './Provenance';

type Props = {
  report: Report;
  tab: Tab;
  onTab: (t: Tab) => void;
  onNewAnalysis: () => void;
};

const TITLES: Record<Tab, [string, string, string]> = {
  overview: ['Report', 'Threat overview', 'Verdict, severity and key behaviors'],
  killchain: [
    'Report',
    'Kill chain',
    'MITRE ATT&CK tactics and techniques observed',
  ],
  timeline: [
    'Report',
    'Execution timeline',
    'Behavioral events in order of execution — press play to replay',
  ],
  blast: ['Report', 'Blast radius', 'Scope and impact of the infection'],
  network: [
    'Report',
    'Network activity',
    'Command-and-control and data exfiltration',
  ],
};

export default function AppView({ report: s, tab, onTab, onNewAnalysis }: Props) {
  const col = lvlColor(s.sevLevel);
  const [tabTag, tabTitle, tabSub] = TITLES[tab];
  // kcSel is shared so an Overview stage click can open the matching row.
  const [kcSel, setKcSel] = useState(0);

  const openKillchain = (i: number) => {
    setKcSel(i);
    onTab('killchain');
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flex: 'none', borderBottom: '1px solid rgba(26,25,21,0.14)' }}>
        <div
          className="wrap doc-title"
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            padding: '24px 32px 22px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 24,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <h2
                style={{
                  fontSize: 27,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                {s.name}
              </h2>
              <span style={css(tag(col))}>
                {s.sevLabel} {s.severity}
              </span>
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 11,
                color: '#807B72',
                marginTop: 8,
                wordBreak: 'break-all',
              }}
            >
              {s.sha}
            </div>
          </div>
          <div className="doc-right" style={{ textAlign: 'right', flex: 'none' }}>
            <button
              onClick={onNewAnalysis}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13.5,
                color: '#1A1915',
                textDecoration: 'underline',
                textUnderlineOffset: 5,
                textDecorationThickness: '1.5px',
                padding: 0,
              }}
            >
              New analysis
            </button>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 11,
                color: '#807B72',
                marginTop: 9,
              }}
            >
              {s.classification}
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div
          className="wrap"
          style={{ maxWidth: 1120, margin: '0 auto', padding: '34px 32px 80px' }}
        >
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 11,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#807B72',
              }}
            >
              {tabTag}
            </div>
            <h1
              style={{
                fontSize: 'clamp(26px,3.4vw,40px)',
                fontWeight: 500,
                letterSpacing: '-0.022em',
                margin: '7px 0 0',
              }}
            >
              {tabTitle}
            </h1>
            <div style={{ fontSize: 14.5, color: '#6E6A60', marginTop: 5 }}>
              {tabSub}
            </div>
          </div>

          <ProvenanceBanner provenance={s.provenance} />

          {tab === 'overview' && (
            <Overview report={s} onOpenStage={openKillchain} />
          )}
          {tab === 'killchain' &&
            (isUnsupported(s.provenance, 'killchain') ? (
              <NotObserved
                provenance={s.provenance}
                title="No kill chain was reconstructed"
                body="This engine produced no ATT&CK mapping for this sample. Nothing is shown here rather than a placeholder chain."
              />
            ) : (
              <KillChain report={s} kcSel={kcSel} setKcSel={setKcSel} />
            ))}
          {tab === 'timeline' &&
            (isUnsupported(s.provenance, 'timeline') ? (
              <NotObserved
                provenance={s.provenance}
                title="This engine observes no execution"
                body="An execution timeline requires running the sample and recording when each behavior occurred. Nothing was run, so there are no timestamps to show. The findings this engine did produce are on the Kill chain tab."
              />
            ) : (
              <Timeline key="tl" report={s} />
            ))}
          {tab === 'blast' &&
            (isUnsupported(s.provenance, 'blast') ? (
              <NotObserved
                provenance={s.provenance}
                title="No blast radius was measured"
                body="Scope and impact — files touched, hosts reached, data moved — can only be counted by observing the sample run against real targets. This engine did not run it, so there is nothing to count."
              />
            ) : (
              <Blast key="bl" report={s} />
            ))}
          {tab === 'network' &&
            (isUnsupported(s.provenance, 'network') ? (
              <NotObserved
                provenance={s.provenance}
                title="No network activity was captured"
                body="This engine recorded no traffic and extracted no network indicators for this sample."
              />
            ) : (
              <Network report={s} />
            ))}
        </div>
      </div>
    </div>
  );
}
