import type { CSSProperties } from 'react';
import type { Tab } from '../types';
import { BG, css } from '../theme';

type Props = {
  isApp: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  onLogo: () => void;
};

const NAV: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'killchain', label: 'Kill chain' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'blast', label: 'Blast radius' },
  { key: 'network', label: 'Network' },
];

// Ported from `mkNav` in the design.
function navStyle(active: boolean): CSSProperties {
  return css(
    "background:none;border:none;cursor:pointer;font-family:'Schibsted Grotesk',sans-serif;font-size:13.5px;padding:0;color:" +
      (active ? '#1A1915' : '#807B72') +
      ';text-decoration:' +
      (active ? 'underline' : 'none') +
      ';text-underline-offset:6px;text-decoration-thickness:1.5px',
  );
}

export default function TopBar({ isApp, tab, onTab, onLogo }: Props) {
  return (
    <div
      className="topbar"
      style={{
        height: 62,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        borderBottom: '1px solid rgba(26,25,21,0.14)',
        zIndex: 20,
        background: BG,
      }}
    >
      <div
        onClick={onLogo}
        title="Back to start"
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 13,
          cursor: 'pointer',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' }}>
          Detonate Lab
        </div>
        <div
          className="tagline"
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 11,
            color: '#807B72',
            letterSpacing: '0.02em',
          }}
        >
          Malware Detonation Sandbox
        </div>
      </div>

      {isApp && (
        <div
          className="navtabs"
          style={{ display: 'flex', alignItems: 'center', gap: 24 }}
        >
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => onTab(n.key)}
              style={navStyle(tab === n.key)}
            >
              {n.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
