import { useEffect, useRef, useState } from 'react';
import { getJob, getReport } from '../api';
import type { Job, Report } from '../types';

type Props = {
  jobId: string;
  onDone: (report: Report) => void;
  onReset: () => void;
};

export default function AnalyzingView({ jobId, onDone, onReset }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    settled.current = false;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (!alive || settled.current) return;
      try {
        const j = await getJob(jobId);
        if (!alive) return;
        setJob(j);

        if (j.status === 'error') {
          settled.current = true;
          setError(j.error || 'Analysis failed.');
          return;
        }

        if (j.status === 'done' && j.reportId) {
          settled.current = true;
          try {
            const r = await getReport(j.reportId);
            if (!alive) return;
            // ~650ms delay to match the design's transition feel.
            timer = setTimeout(() => {
              if (alive) onDone(r);
            }, 650);
          } catch (e) {
            if (alive) setError(String((e as Error).message || e));
          }
          return;
        }

        timer = setTimeout(poll, 400);
      } catch {
        // Transient fetch error — keep polling.
        if (!alive) return;
        timer = setTimeout(poll, 400);
      }
    };

    poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, onDone]);

  const name = job?.name || '';
  const progress = job?.progress ?? 0;
  const lines = job?.lines ?? [];

  if (error) {
    return (
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div
          className="wrap"
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            padding: '88px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 12,
              color: '#B23A2E',
            }}
          >
            Detonation failed
          </div>
          <h2
            style={{
              fontSize: 'clamp(26px,3.8vw,42px)',
              fontWeight: 500,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            {name || 'Analysis error'}
          </h2>
          <p style={{ fontSize: 15, color: '#46443D', lineHeight: 1.6, margin: 0 }}>
            {error}
          </p>
          <div>
            <button
              onClick={onReset}
              style={{
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                color: '#EAE8E2',
                background: '#1A1915',
                border: 'none',
                borderRadius: 3,
                padding: '11px 20px',
              }}
            >
              New analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div
        className="wrap"
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: '88px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 44,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 24,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 12,
                color: '#807B72',
              }}
            >
              Detonating in isolated sandbox
            </div>
            <h2
              style={{
                fontSize: 'clamp(26px,3.8vw,42px)',
                fontWeight: 500,
                letterSpacing: '-0.02em',
                margin: '10px 0 0',
                wordBreak: 'break-all',
              }}
            >
              {name}
            </h2>
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 'clamp(54px,10vw,118px)',
              fontWeight: 500,
              lineHeight: 0.82,
              letterSpacing: '-0.04em',
            }}
          >
            {progress}
            <span style={{ fontSize: '0.38em', color: '#807B72' }}>%</span>
          </div>
        </div>

        <div
          style={{
            height: 2,
            background: 'rgba(26,25,21,0.14)',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              background: '#1A1915',
              width: `${progress}%`,
              transition: 'width .3s ease',
            }}
          />
        </div>

        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 12.5,
            color: '#46443D',
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
            minHeight: 200,
          }}
        >
          {lines.map((l, i) => (
            <div
              key={`${l.n}-${i}`}
              className="an-row"
              style={{ display: 'flex', gap: 14 }}
            >
              <span style={{ color: '#A6A29A' }}>{l.n}</span>
              <span>{l.txt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
