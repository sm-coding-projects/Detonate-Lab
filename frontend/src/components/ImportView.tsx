import { useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { getSamples, submitFile, submitUrl, submitSample } from '../api';
import type { SampleCard } from '../types';
import { lvlColor, tag, css } from '../theme';

type Props = {
  onSubmitted: (jobId: string) => void;
  onSeededReport: (reportId: string) => void;
};

export default function ImportView({ onSubmitted, onSeededReport }: Props) {
  const [lib, setLib] = useState<SampleCard[]>([]);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    getSamples()
      .then((s) => alive && setLib(s))
      .catch((e) => alive && setError(String(e.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  async function doFile(file: File) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await submitFile(file);
      onSubmitted(jobId);
    } catch (e) {
      setError(String((e as Error).message || e));
      setBusy(false);
    }
  }

  async function doUrl() {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await submitUrl(u);
      onSubmitted(jobId);
    } catch (e) {
      setError(String((e as Error).message || e));
      setBusy(false);
    }
  }

  async function doCard(m: SampleCard) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await submitSample(m.id);
      onSubmitted(jobId);
    } catch {
      // Re-submit by sampleId not available — fall back to the seeded report.
      onSeededReport(m.id);
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setHover(false);
    const f = e.dataTransfer.files?.[0];
    if (f) doFile(f);
  }

  function urlKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') doUrl();
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div
        className="wrap"
        style={{ maxWidth: 1120, margin: '0 auto', padding: '84px 32px 0' }}
      >
        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 12,
            color: '#807B72',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 36,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#3E7A4E',
            }}
          />
          Sandbox online — isolated, read-only environment
        </div>
        <h1
          style={{
            fontSize: 'clamp(30px,4.7vw,54px)',
            lineHeight: 1.08,
            fontWeight: 500,
            letterSpacing: '-0.025em',
            maxWidth: '17ch',
            margin: 0,
          }}
        >
          Drop a sample. We detonate it in isolation and show you every action it
          takes, its blast radius, and who it phones home to.
        </h1>

        <input
          ref={fileRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) doFile(f);
            e.target.value = '';
          }}
        />

        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setHover(true);
          }}
          onDragLeave={() => setHover(false)}
          onDrop={onDrop}
          style={{
            marginTop: 52,
            border: `1px solid ${hover ? '#1A1915' : 'rgba(26,25,21,0.26)'}`,
            borderRadius: 4,
            padding: '26px 30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'border-color .2s,background .2s',
            background: hover ? '#EEECE6' : 'transparent',
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 500 }}>
              Drop a sample to detonate
            </div>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 11.5,
                color: '#807B72',
                marginTop: 5,
              }}
            >
              PE · DLL · MSI · DOC · JS · APK — max 100 MB
            </div>
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 9,
            }}
          >
            Detonate <span style={{ fontSize: 16 }}>→</span>
          </div>
        </div>

        <div
          className="url-row"
          style={{
            marginTop: 16,
            display: 'flex',
            alignItems: 'stretch',
            border: '1px solid rgba(26,25,21,0.26)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 18,
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#807B72',
              flex: 'none',
            }}
          >
            URL
          </div>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={urlKey}
            placeholder="https://example.com/sample.exe"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              padding: 16,
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 13,
              color: '#1A1915',
              outline: 'none',
            }}
          />
          <button
            onClick={doUrl}
            style={{
              flex: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              color: '#EAE8E2',
              background: '#1A1915',
              border: 'none',
              padding: '15px 22px',
            }}
          >
            Fetch &amp; detonate
          </button>
        </div>

        {error && (
          <div
            style={{
              marginTop: 16,
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 12.5,
              color: '#B23A2E',
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: 72,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            paddingBottom: 14,
            borderBottom: '1px solid rgba(26,25,21,0.22)',
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#807B72',
            }}
          >
            Prepared samples
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 11,
              color: '#807B72',
            }}
          >
            Select to analyze
          </div>
        </div>

        {lib.map((m) => (
          <div
            key={m.id}
            onClick={() => doCard(m)}
            style={{
              padding: '26px 0',
              borderBottom: '1px solid rgba(26,25,21,0.14)',
              cursor: 'pointer',
              transition: 'padding .2s',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <h3
                style={{
                  fontSize: 25,
                  fontWeight: 500,
                  letterSpacing: '-0.015em',
                  margin: 0,
                }}
              >
                {m.name}
              </h3>
              <div
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 12,
                  color: '#807B72',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.seen}
              </div>
            </div>
            <div
              className="g-two"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 28,
                marginTop: 16,
                maxWidth: 660,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#807B72',
                  }}
                >
                  Classification
                </div>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  {m.classification}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#807B72',
                  }}
                >
                  Verdict
                </div>
                <div style={{ marginTop: 6 }}>
                  <span style={css(tag(lvlColor(m.sevLevel)))}>
                    {m.sevLabel} {m.score}
                  </span>
                </div>
              </div>
            </div>
            <p
              style={{
                margin: '16px 0 0',
                maxWidth: 640,
                fontSize: 14.5,
                lineHeight: 1.6,
                color: '#46443D',
                textWrap: 'pretty',
              }}
            >
              {m.summary}
            </p>
          </div>
        ))}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '26px 0 44px',
            marginTop: 18,
            borderTop: '1px solid rgba(26,25,21,0.14)',
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 11,
              color: '#807B72',
            }}
          >
            © 2026 — Detonate Lab
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 11,
              color: '#807B72',
            }}
          >
            Isolated · Read-only · For analysis
          </div>
        </div>
      </div>
    </div>
  );
}
