import type { Report } from '../../types';
import { lvlColor, tag, dot, css, HOT } from '../../theme';
import { isUnsupported } from '../Provenance';

type Props = {
  report: Report;
  onOpenStage: (i: number) => void;
};

const STAGE_OPACITY: Record<string, number> = {
  critical: 1,
  high: 0.78,
  medium: 0.58,
  low: 0.4,
  info: 0.28,
};

// Ported from `tileBox(i)` / `bignum(hot)` in the design.
function tileBox(i: number): string {
  return (
    'padding:24px 18px 22px ' +
    (i === 0 ? '0' : '18px') +
    ';' +
    (i === 0 ? '' : 'border-left:1px solid rgba(26,25,21,0.12)')
  );
}
function bignum(hot: boolean): string {
  return (
    "font-family:'JetBrains Mono',monospace;font-size:30px;font-weight:500;letter-spacing:-0.02em;color:" +
    (hot ? HOT : '#1A1915')
  );
}

export default function Overview({ report: s, onOpenStage }: Props) {
  const col = lvlColor(s.sevLevel);

  const techCount = s.killchain.reduce((a, k) => a + k.techniques.length, 0);
  // An engine that observes no execution has no event count — "0 behavioral
  // events" would read as "it did nothing", which is a different claim.
  const noTimeline = isUnsupported(s.provenance, 'timeline');
  const noChain = isUnsupported(s.provenance, 'killchain');
  const tiles = [
    { l: noChain ? 'MITRE tactics (none mapped)' : 'MITRE tactics', v: noChain ? '—' : String(s.killchain.length), hot: false },
    { l: noChain ? 'Techniques (none mapped)' : 'Techniques', v: noChain ? '—' : String(techCount), hot: false },
    {
      l: noTimeline ? 'Behavioral events (not observed)' : 'Behavioral events',
      v: noTimeline ? '—' : String(s.timeline.length),
      hot: false,
    },
  ]
    .concat(s.tiles.map((t) => ({ l: t.l, v: t.v, hot: true })))
    .map((t, i) => ({
      l: t.l,
      v: t.v,
      boxStyle: tileBox(i),
      valStyle: bignum(t.hot),
    }));

  const factors = s.factors.map((f) => {
    const c = f.on ? lvlColor(f.level) : '#C0BCB2';
    return {
      label: f.label,
      dotStyle: dot(c, 8),
      txt: f.on ? 'Detected' : 'Not seen',
      txtStyle:
        "font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;letter-spacing:0.04em;color:" +
        (f.on ? lvlColor(f.level) : '#A6A29A'),
    };
  });

  // Prefer observed events; fall back to the kill chain so an engine without a
  // timeline still surfaces its strongest findings instead of an empty column.
  const topActions = (
    s.timeline.length > 0
      ? s.timeline
          .filter((e) => e.level === 'critical' || e.level === 'high')
          .map((e) => ({ label: e.label, detail: e.detail, level: e.level }))
      : s.killchain
          .filter((k) => k.level === 'critical' || k.level === 'high')
          .flatMap((k) =>
            k.techniques.map((t) => ({
              label: `${k.tactic} — ${t.name}`,
              detail: t.desc,
              level: k.level,
            })),
          )
  )
    .slice(0, 5)
    .map((e) => ({
      label: e.label,
      detail: e.detail,
      dotStyle: dot(lvlColor(e.level), 8) + ';margin-top:6px',
    }));

  const numStyle =
    "font-family:'JetBrains Mono',monospace;font-size:clamp(64px,11vw,120px);font-weight:500;line-height:0.82;letter-spacing:-0.04em;color:" +
    col;
  const barStyle =
    'position:absolute;left:0;top:0;height:100%;background:' +
    col +
    ';width:' +
    s.severity +
    '%';

  return (
    <div className="reveal">
      <div
        className="g-verdict"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)',
          gap: 56,
          padding: '40px 0 38px',
          borderBottom: '1px solid rgba(26,25,21,0.14)',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#807B72',
            }}
          >
            Threat score
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 18,
              marginTop: 12,
            }}
          >
            <div style={css(numStyle)}>{s.severity}</div>
            <div style={{ paddingBottom: 14 }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 13,
                  color: '#807B72',
                }}
              >
                / 100
              </div>
              <div style={{ marginTop: 10 }}>
                <span style={css(tag(col))}>{s.sevLabel}</span>
              </div>
            </div>
          </div>
          <div
            style={{
              height: 3,
              background: 'rgba(26,25,21,0.12)',
              marginTop: 26,
              position: 'relative',
            }}
          >
            <div style={css(barStyle)} />
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 11.5,
              color: '#807B72',
              marginTop: 12,
            }}
          >
            Confidence — {s.confidence}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 19,
              lineHeight: 1.5,
              fontWeight: 500,
              letterSpacing: '-0.01em',
            }}
          >
            {s.verdict} — {s.classification}.
          </div>
          <p
            style={{
              margin: '16px 0 0',
              fontSize: 15,
              lineHeight: 1.66,
              color: '#46443D',
              textWrap: 'pretty',
            }}
          >
            {s.summary}
          </p>
        </div>
      </div>

      <div
        className="g-tiles"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6,1fr)',
          borderBottom: '1px solid rgba(26,25,21,0.14)',
        }}
      >
        {tiles.map((t, i) => (
          <div key={i} style={css(t.boxStyle)}>
            <div style={css(t.valStyle)}>{t.v}</div>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#807B72',
                marginTop: 7,
                lineHeight: 1.3,
              }}
            >
              {t.l}
            </div>
          </div>
        ))}
      </div>

      {s.killchain.length > 0 && (
      <div
        style={{
          padding: '38px 0',
          borderBottom: '1px solid rgba(26,25,21,0.14)',
        }}
      >
        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#807B72',
            marginBottom: 20,
          }}
        >
          The attack, in sequence
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {s.killchain.map((k, i) => {
            const c = lvlColor(k.level);
            const barStyleG =
              'height:42px;border-radius:2px;background:' +
              c +
              ';opacity:' +
              (STAGE_OPACITY[k.level] ?? 0.5);
            return (
              <div
                key={i}
                onClick={() => onOpenStage(i)}
                style={{ flex: 1, cursor: 'pointer' }}
              >
                <div style={css(barStyleG)} />
                <div
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 8.5,
                    color: '#807B72',
                    textAlign: 'center',
                    marginTop: 8,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {k.short}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      <div
        className="g-two"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 56,
          padding: '38px 0 4px',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#807B72',
              marginBottom: 6,
            }}
          >
            Severity factors
          </div>
          {factors.map((f, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '13px 0',
                borderBottom: '1px solid rgba(26,25,21,0.1)',
              }}
            >
              <span style={css(f.dotStyle)} />
              <span style={{ flex: 1, fontSize: 14, color: '#1A1915' }}>
                {f.label}
              </span>
              <span style={css(f.txtStyle)}>{f.txt}</span>
            </div>
          ))}
        </div>
        <div>
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#807B72',
              marginBottom: 6,
            }}
          >
            {s.timeline.length > 0 ? 'Most damaging actions' : 'Strongest findings'}
          </div>
          {topActions.length === 0 && (
            <div
              style={{
                padding: '13px 0',
                fontSize: 13,
                color: '#A6A29A',
                lineHeight: 1.5,
              }}
            >
              No high-severity findings.
            </div>
          )}
          {topActions.map((a, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                padding: '13px 0',
                borderBottom: '1px solid rgba(26,25,21,0.1)',
              }}
            >
              <span style={css(a.dotStyle)} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{a.label}</div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: '#6E6A60',
                    lineHeight: 1.45,
                    marginTop: 2,
                  }}
                >
                  {a.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
