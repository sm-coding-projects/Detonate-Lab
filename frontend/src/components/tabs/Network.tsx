import type { Report } from '../../types';
import { css, HOT } from '../../theme';
import { isUnsupported } from '../Provenance';

type Props = { report: Report };

export default function Network({ report: s }: Props) {
  const n = s.network;

  // An engine that captured no traffic has no protocol, beacon, JA3 or exfil
  // volume to report. Those chips are dropped rather than filled with stand-ins;
  // what is left is what was actually extracted.
  const noTraffic = isUnsupported(s.provenance, 'network.traffic');

  const trafficChips = [
    { l: 'Protocol', v: n.proto, hot: false },
    { l: 'Beacon interval', v: n.beacon, hot: false },
    { l: 'JA3 fingerprint', v: n.ja3.length > 18 ? n.ja3.slice(0, 18) + '…' : n.ja3, hot: false },
    { l: 'Data exfiltrated', v: n.exfil, hot: true },
  ];
  const indicatorChips = [
    { l: noTraffic ? 'Domain literal' : 'C2 domain', v: n.domain, hot: false },
    { l: noTraffic ? 'IP literals' : 'C2 endpoints', v: String(n.ips.length), hot: false },
  ];

  const chips = (noTraffic ? indicatorChips : [...trafficChips.slice(0, 2), indicatorChips[0], trafficChips[2], trafficChips[3], indicatorChips[1]])
    .map((c, i) => ({
    l: c.l,
    v: c.v,
    boxStyle:
      'padding:20px 18px 18px ' +
      (i % (noTraffic ? 2 : 3) === 0 ? '0' : '18px') +
      ';border-top:1px solid rgba(26,25,21,0.14);' +
      (i % (noTraffic ? 2 : 3) === 0 ? '' : 'border-left:1px solid rgba(26,25,21,0.12)'),
    valStyle:
      "font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:600;word-break:break-all;margin-top:7px;color:" +
      (c.hot ? HOT : '#1A1915'),
  }));

  return (
    <div className="reveal" style={{ marginTop: 30 }}>
      {noTraffic ? (
        <div
          style={{
            padding: '30px 0',
            borderTop: '1px solid rgba(26,25,21,0.14)',
            borderBottom: '1px solid rgba(26,25,21,0.14)',
            fontSize: 14,
            lineHeight: 1.6,
            color: '#6E6A60',
            textWrap: 'pretty',
          }}
        >
          <span style={{ fontWeight: 500, color: '#1A1915' }}>
            No traffic was captured.
          </span>{' '}
          This engine never ran the sample, so there is no victim host, no
          command-and-control channel and no exfiltration to draw. Any addresses
          below are literals found in the file&rsquo;s strings &mdash; evidence that
          they appear in the sample, not that it contacted them.
        </div>
      ) : (
        <div
          className="net-flow"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '34px 0',
            borderTop: '1px solid rgba(26,25,21,0.14)',
            borderBottom: '1px solid rgba(26,25,21,0.14)',
          }}
        >
          <div
            style={{
              flex: 'none',
              width: 170,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 9,
            }}
          >
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 3,
                border: '1px solid rgba(26,25,21,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="25"
                height="25"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#46443D"
                strokeWidth="1.5"
              >
                <rect x="3" y="4" width="18" height="13" rx="1" />
                <path d="M8 20h8M12 17v3" />
              </svg>
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {n.victim}
            </div>
            <div style={{ fontSize: 11, color: '#807B72' }}>Infected host</div>
          </div>

          <div
            className="net-mid"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 14,
              padding: '0 10px',
            }}
          >
            <div
              style={{
                height: 1,
                background:
                  'repeating-linear-gradient(90deg,#46443D 0 7px,transparent 7px 15px)',
                backgroundSize: '15px 1px',
                animation: 'flow 1s linear infinite',
              }}
            />
            <div
              style={{
                textAlign: 'center',
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10.5,
                color: '#46443D',
              }}
            >
              ◂ encrypted beacon every {n.beacon}
            </div>
            <div
              style={{
                height: 5,
                background:
                  'repeating-linear-gradient(90deg,#B23A2E 0 9px,transparent 9px 18px)',
                backgroundSize: '18px 5px',
                animation: 'flow 0.7s linear infinite',
              }}
            />
            <div
              style={{
                textAlign: 'center',
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10.5,
                color: '#B23A2E',
              }}
            >
              {n.exfil} exfiltrated ▸
            </div>
          </div>

          <div
            style={{
              flex: 'none',
              width: 200,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 9,
            }}
          >
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 3,
                border: '1px solid rgba(178,58,46,0.45)',
                background: 'rgba(178,58,46,0.07)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="25"
                height="25"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#B23A2E"
                strokeWidth="1.5"
              >
                <rect x="3" y="4" width="18" height="7" rx="1" />
                <rect x="3" y="13" width="18" height="7" rx="1" />
                <circle cx="7" cy="7.5" r="0.6" fill="#B23A2E" stroke="none" />
                <circle cx="7" cy="16.5" r="0.6" fill="#B23A2E" stroke="none" />
              </svg>
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 12,
                fontWeight: 600,
                color: '#B23A2E',
                textAlign: 'center',
              }}
            >
              {n.domain}
            </div>
            <div style={{ fontSize: 11, color: '#807B72' }}>C2 · {n.proto}</div>
          </div>
        </div>
      )}

      <div
        className="g-chips"
        style={{
          display: 'grid',
          gridTemplateColumns: noTraffic ? 'repeat(2,1fr)' : 'repeat(3,1fr)',
          borderBottom: '1px solid rgba(26,25,21,0.14)',
        }}
      >
        {chips.map((c, i) => (
          <div key={i} style={css(c.boxStyle)}>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#807B72',
              }}
            >
              {c.l}
            </div>
            <div style={css(c.valStyle)}>{c.v}</div>
          </div>
        ))}
      </div>

      <div
        className="g-two"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.25fr 1fr',
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
            Network indicators
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.5fr 1fr 0.5fr',
              gap: 10,
              padding: '12px 0 10px',
              borderBottom: '1px solid rgba(26,25,21,0.22)',
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#807B72',
            }}
          >
            <span>IP address</span>
            <span>Role</span>
            <span>Geo</span>
          </div>
          {n.ips.length === 0 && (
            <div
              style={{
                padding: '13px 0',
                fontSize: 13,
                color: '#A6A29A',
                lineHeight: 1.5,
              }}
            >
              No addresses found.
            </div>
          )}
          {n.ips.map((ip, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr 0.5fr',
                gap: 10,
                alignItems: 'center',
                padding: '13px 0',
                borderBottom: '1px solid rgba(26,25,21,0.1)',
              }}
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 12.5,
                  color: '#1A1915',
                }}
              >
                {ip.ip}
              </span>
              <span style={{ fontSize: 13, color: '#46443D' }}>{ip.role}</span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 11.5,
                  color: '#807B72',
                }}
              >
                {ip.geo}
              </span>
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
            Communication log
          </div>
          {n.log.length === 0 && (
            <div
              style={{
                padding: '13px 0',
                fontSize: 13,
                color: '#A6A29A',
                lineHeight: 1.5,
              }}
            >
              No communication was captured.
            </div>
          )}
          {n.log.map((g, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 12,
                padding: '11px 0',
                borderBottom: '1px solid rgba(26,25,21,0.1)',
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 12,
              }}
            >
              <span style={{ color: '#807B72', flex: 'none' }}>{g.t}</span>
              <span style={{ color: '#46443D', lineHeight: 1.45 }}>{g.e}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
