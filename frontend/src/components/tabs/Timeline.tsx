import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Report } from '../../types';
import { lvlColor, tag, dot, css } from '../../theme';
import { NotObserved } from '../Provenance';

type Props = { report: Report };

function fmtT(t: number): string {
  if (t < 0) t = 0;
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return String(m).padStart(2, '0') + ':' + sec.toFixed(1).padStart(4, '0');
}

const SPEEDS = [1, 2.5, 5];

export default function Timeline({ report: s }: Props) {
  // Defensive: an engine that observes no execution returns an empty timeline.
  const hasEvents = s.timeline.length > 0;
  const dur = hasEvents ? s.timeline[s.timeline.length - 1].t + 1.4 : 1;

  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2.5);

  const raf = useRef<ReturnType<typeof setInterval> | null>(null);
  const last = useRef(0);
  const phRef = useRef(0);
  const speedRef = useRef(speed);
  phRef.current = playhead;
  speedRef.current = speed;

  const stop = () => {
    if (raf.current) {
      clearInterval(raf.current);
      raf.current = null;
    }
  };

  useEffect(() => stop, []);

  const play = () => {
    if (phRef.current >= dur) {
      phRef.current = 0;
      setPlayhead(0);
    }
    setPlaying(true);
    last.current = performance.now();
    stop();
    raf.current = setInterval(() => {
      const now = performance.now();
      const dt = (now - last.current) / 1000;
      last.current = now;
      let ph = phRef.current + dt * speedRef.current;
      if (ph >= dur) {
        stop();
        phRef.current = dur;
        setPlayhead(dur);
        setPlaying(false);
        return;
      }
      phRef.current = ph;
      setPlayhead(ph);
    }, 33);
  };

  const pause = () => {
    setPlaying(false);
    stop();
  };

  const togglePlay = () => (playing ? pause() : play());

  const scrub = (e: ChangeEvent<HTMLInputElement>) => {
    stop();
    const v = parseFloat(e.target.value);
    phRef.current = v;
    setPlayhead(v);
    setPlaying(false);
  };

  const jumpTo = (t: number) => {
    stop();
    phRef.current = t;
    setPlayhead(t);
    setPlaying(false);
  };

  if (!hasEvents) {
    return (
      <NotObserved
        provenance={s.provenance}
        title="No execution timeline"
        body="No behavioral events were recorded for this sample, so there is nothing to replay."
      />
    );
  }

  const fillStyle =
    'position:absolute;top:19px;left:0;height:2px;background:#1A1915;width:' +
    (playhead / dur) * 100 +
    '%';
  const playheadStyle =
    'position:absolute;top:10px;width:2px;height:20px;background:#1A1915;transform:translateX(-50%);left:' +
    (playhead / dur) * 100 +
    '%';

  const events = s.timeline.map((e, i) => {
    const c = lvlColor(e.level);
    const fired = playhead >= e.t;
    const next = s.timeline[i + 1];
    const active = fired && (!next || playhead < next.t);
    const pct = (e.t / dur) * 100;
    return {
      t: e.t,
      time: fmtT(e.t),
      label: e.label,
      detail: e.detail,
      levelLabel: e.level.toUpperCase(),
      tickStyle:
        'position:absolute;top:14px;width:11px;height:11px;border-radius:50%;transform:translateX(-50%);cursor:pointer;border:2px solid #EAE8E2;left:' +
        pct +
        '%;background:' +
        (fired ? c : '#C0BCB2'),
      rowStyle:
        'display:flex;align-items:flex-start;gap:14px;padding:14px 0;cursor:pointer;border-bottom:1px solid rgba(26,25,21,0.1);' +
        (active
          ? 'border-left:2px solid ' + c + ';padding-left:14px;margin-left:-16px;'
          : '') +
        'opacity:' +
        (fired ? 1 : 0.45),
      timeStyle:
        "font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;width:62px;flex:none;color:" +
        (fired ? c : '#A6A29A'),
      dotStyle: dot(fired ? c : '#C0BCB2', 9) + ';margin-top:5px',
      tagStyle: tag(c),
    };
  });

  return (
    <div className="reveal" style={{ marginTop: 34 }}>
      <div
        className="tl-controls"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          paddingBottom: 22,
          borderBottom: '1px solid rgba(26,25,21,0.14)',
        }}
      >
        <button
          onClick={togglePlay}
          style={{
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            color: '#EAE8E2',
            background: '#1A1915',
            border: 'none',
            borderRadius: 3,
            padding: '9px 18px',
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 16,
            fontWeight: 500,
            minWidth: 150,
          }}
        >
          T+{fmtT(playhead)}{' '}
          <span style={{ color: '#A6A29A', fontSize: 12 }}>/ {fmtT(dur)}</span>
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#807B72',
          }}
        >
          Speed
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {SPEEDS.map((v) => {
            const a = speed === v;
            return (
              <button
                key={v}
                onClick={() => setSpeed(v)}
                style={css(
                  'cursor:pointer;font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:600;padding:4px 9px;border-radius:2px;' +
                    (a
                      ? 'background:#1A1915;color:#EAE8E2;border:1px solid #1A1915'
                      : 'background:transparent;color:#807B72;border:1px solid rgba(26,25,21,0.2)'),
                )}
              >
                {v}×
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ position: 'relative', height: 40, margin: '18px 2px 6px' }}>
        <div
          style={{
            position: 'absolute',
            top: 19,
            left: 0,
            right: 0,
            height: 2,
            background: 'rgba(26,25,21,0.14)',
          }}
        />
        <div style={css(fillStyle)} />
        {events.map((e, i) => (
          <div key={i} onClick={() => jumpTo(e.t)} style={css(e.tickStyle)} />
        ))}
        <div style={css(playheadStyle)} />
        <input
          type="range"
          min={0}
          max={dur}
          step={0.1}
          value={playhead}
          onChange={scrub}
          style={{
            position: 'absolute',
            top: 8,
            left: 0,
            width: '100%',
            height: 24,
            opacity: 0,
            cursor: 'pointer',
            margin: 0,
          }}
        />
      </div>

      <div>
        {events.map((e, i) => (
          <div key={i} onClick={() => jumpTo(e.t)} style={css(e.rowStyle)}>
            <div style={css(e.timeStyle)}>{e.time}</div>
            <span style={css(e.dotStyle)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{ fontSize: 15, fontWeight: 500, color: '#1A1915' }}
                >
                  {e.label}
                </span>
                <span style={css(e.tagStyle)}>{e.levelLabel}</span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#6E6A60',
                  lineHeight: 1.45,
                  marginTop: 2,
                }}
              >
                {e.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
