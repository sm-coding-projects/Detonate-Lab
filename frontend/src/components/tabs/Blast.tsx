import { useEffect, useRef, useState } from 'react';
import type { Report } from '../../types';
import { lvlColor, dot, css, HOT } from '../../theme';
import { NotObserved } from '../Provenance';

type Props = { report: Report };

// Ported from `countVal(n,p)` in the design.
function countVal(n: number | string, p: number): string {
  return typeof n === 'number'
    ? Math.round(n * p).toLocaleString('en-US')
    : p >= 0.55
      ? n
      : '—';
}

export default function Blast({ report: s }: Props) {
  const [armed, setArmed] = useState(false);
  const [progress, setProgress] = useState(0);
  const bRaf = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Mirror setTab('blast'): arm after 60ms, then count over 1100ms.
    const arm = setTimeout(() => {
      setArmed(true);
      const start = performance.now();
      const dur = 1100;
      bRaf.current = setInterval(() => {
        const p = Math.min(1, (performance.now() - start) / dur);
        setProgress(p);
        if (p >= 1 && bRaf.current) clearInterval(bRaf.current);
      }, 33);
    }, 60);
    return () => {
      clearTimeout(arm);
      if (bRaf.current) clearInterval(bRaf.current);
    };
  }, []);

  if (s.blast.length === 0) {
    return (
      <NotObserved
        provenance={s.provenance}
        title="No blast radius was measured"
        body="No scope or impact figures were produced for this sample."
      />
    );
  }

  const origin = { label: s.blast[0].label, sub: s.blast[0].sub };

  const rings = s.blast.slice(1).map((L, j) => {
    const c = lvlColor(L.level);
    const d = (j + 1) * 100 + 60;
    return {
      ringStyle:
        'position:absolute;left:50%;top:50%;border-radius:50%;width:' +
        d +
        'px;height:' +
        d +
        'px;border:1px solid ' +
        c +
        ';transition:opacity .7s ease ' +
        j * 0.12 +
        's, transform .7s cubic-bezier(.2,.8,.2,1) ' +
        j * 0.12 +
        's;opacity:' +
        (armed ? 0.85 - j * 0.1 : 0) +
        ';transform:translate(-50%,-50%) scale(' +
        (armed ? 1 : 0.4) +
        ')',
    };
  });

  const layers = s.blast.map((L) => {
    const c = lvlColor(L.level);
    return {
      label: L.label,
      sub: L.sub,
      dotStyle: dot(c, 9),
      stats: L.stats.map((stt) => ({
        n: countVal(stt.n, progress),
        t: stt.t,
        nStyle:
          "font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:500;letter-spacing:-0.01em;color:" +
          (typeof stt.n === 'number' && stt.n >= 1000 ? HOT : '#1A1915'),
      })),
    };
  });

  return (
    <div
      className="reveal g-blast"
      style={{
        marginTop: 30,
        display: 'grid',
        gridTemplateColumns: '1fr 360px',
        gap: 48,
        alignItems: 'start',
      }}
    >
      <div
        className="blast-canvas"
        style={{
          position: 'relative',
          height: 560,
          border: '1px solid rgba(26,25,21,0.14)',
          borderRadius: 4,
          overflow: 'hidden',
          background: '#EEECE6',
        }}
      >
        {rings.map((r, i) => (
          <div key={i} style={css(r.ringStyle)} />
        ))}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            zIndex: 5,
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 3,
              background: '#B23A2E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#EAE8E2"
              strokeWidth="1.7"
            >
              <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
              <path d="M12 8v4" />
              <circle cx="12" cy="15.5" r="0.5" fill="#EAE8E2" stroke="none" />
            </svg>
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 12,
              fontWeight: 600,
              color: '#1A1915',
            }}
          >
            {origin.label}
          </div>
          <div style={{ fontSize: 11, color: '#6E6A60' }}>{origin.sub}</div>
        </div>
      </div>

      <div>
        {layers.map((L, i) => (
          <div
            key={i}
            style={{
              padding: '18px 0',
              borderBottom: '1px solid rgba(26,25,21,0.12)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
              }}
            >
              <span style={css(L.dotStyle)} />
              <span style={{ fontSize: 14.5, fontWeight: 500 }}>{L.label}</span>
              <span
                style={{ fontSize: 11, color: '#807B72', marginLeft: 'auto' }}
              >
                {L.sub}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22 }}>
              {L.stats.map((s2, j) => (
                <div key={j}>
                  <div style={css(s2.nStyle)}>{s2.n}</div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 10,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: '#807B72',
                      marginTop: 3,
                    }}
                  >
                    {s2.t}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
