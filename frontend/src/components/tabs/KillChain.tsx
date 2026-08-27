import type { Report } from '../../types';
import { lvlColor, tag, css } from '../../theme';

type Props = {
  report: Report;
  kcSel: number;
  setKcSel: (i: number) => void;
};

export default function KillChain({ report: s, kcSel, setKcSel }: Props) {
  const stages = s.killchain.map((k, i) => {
    const c = lvlColor(k.level);
    const open = kcSel === i;
    return {
      idx: String(i + 1).padStart(2, '0'),
      tactic: k.tactic,
      taId: k.id,
      levelLabel: k.level.toUpperCase(),
      open,
      techCount:
        k.techniques.length +
        (k.techniques.length > 1 ? ' techniques' : ' technique'),
      onClick: () => setKcSel(open ? -1 : i),
      rowStyle:
        'display:grid;grid-template-columns:44px 1fr 168px 96px;gap:16px;align-items:center;padding:19px 0;cursor:pointer;border-bottom:1px solid rgba(26,25,21,0.14);',
      tagStyle: tag(c),
      plainStyle:
        'font-size:15px;line-height:1.6;color:#46443D;max-width:680px;margin:14px 0 0;border-left:2px solid ' +
        c +
        ';padding-left:16px',
      plain: k.plain,
      techniques: k.techniques,
    };
  });

  return (
    <div className="reveal" style={{ marginTop: 34 }}>
      <div
        className="kc-row"
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 168px 96px',
          gap: 16,
          paddingBottom: 11,
          borderBottom: '1px solid rgba(26,25,21,0.22)',
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#807B72',
        }}
      >
        <span />
        <span>Tactic</span>
        <span className="kc-mid">MITRE · techniques</span>
        <span style={{ textAlign: 'right' }}>Severity</span>
      </div>

      {stages.map((k, i) => (
        <div key={i}>
          <div onClick={k.onClick} className="kc-row" style={css(k.rowStyle)}>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 12,
                color: '#A6A29A',
              }}
            >
              {k.idx}
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: '-0.01em',
                color: '#1A1915',
              }}
            >
              {k.tactic}
            </span>
            <span
              className="kc-mid"
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 11.5,
                color: '#6E6A60',
              }}
            >
              {k.taId} · {k.techCount}
            </span>
            <span style={{ textAlign: 'right' }}>
              <span style={css(k.tagStyle)}>{k.levelLabel}</span>
            </span>
          </div>

          {k.open && (
            <div
              style={{
                padding: '2px 0 28px 60px',
                borderBottom: '1px solid rgba(26,25,21,0.14)',
              }}
            >
              <p style={css(k.plainStyle)}>{k.plain}</p>
              <div
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#807B72',
                  margin: '20px 0 12px',
                }}
              >
                Techniques observed
              </div>
              {k.techniques.map((t, j) => (
                <div
                  key={j}
                  style={{
                    display: 'flex',
                    gap: 14,
                    padding: '11px 0',
                    borderTop: '1px solid rgba(26,25,21,0.1)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: '#1A1915',
                      width: 90,
                      flex: 'none',
                    }}
                  >
                    {t.id}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{t.name}</div>
                    <div
                      style={{
                        fontSize: 13,
                        color: '#6E6A60',
                        lineHeight: 1.5,
                        marginTop: 2,
                      }}
                    >
                      {t.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
