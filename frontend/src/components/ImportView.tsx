import { useRef, useState } from "react";
import { COLORS, MONO, lvlColor, tag } from "../lib/theme";
import { ApiError } from "../lib/api";
import type { AnalysisSummary } from "../lib/types";

export function ImportView({
  library,
  loading,
  notice,
  onDismissNotice,
  onSubmitFile,
  onSubmitUrl,
  onPickSample,
}: {
  library: AnalysisSummary[];
  loading: boolean;
  notice: string | null;
  onDismissNotice: () => void;
  onSubmitFile: (file: File) => Promise<void>;
  onSubmitUrl: (url: string) => Promise<void>;
  onPickSample: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const guard = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Submission failed");
      setBusy(false);
    }
  };

  const handleFile = (file?: File | null) => {
    if (file) guard(() => onSubmitFile(file));
  };

  const submitUrl = () => {
    const u = url.trim();
    if (u) guard(() => onSubmitUrl(u));
  };

  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      <div className="wrap" style={{ maxWidth: 1120, margin: "0 auto", padding: "84px 32px 0" }}>
        {notice && (
          <div
            style={{
              marginBottom: 28,
              border: `1px solid ${COLORS.hot}55`,
              background: `${COLORS.hot}10`,
              borderRadius: 4,
              padding: "12px 16px",
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              fontFamily: MONO,
              fontSize: 12,
              color: COLORS.hot,
            }}
          >
            <span>{notice}</span>
            <button
              onClick={onDismissNotice}
              style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.hot }}
            >
              ✕
            </button>
          </div>
        )}

        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: COLORS.mut,
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 36,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3E7A4E" }} />
          Sandbox online — isolated, read-only environment
        </div>

        <h1
          style={{
            fontSize: "clamp(30px,4.7vw,54px)",
            lineHeight: 1.08,
            fontWeight: 500,
            letterSpacing: "-0.025em",
            maxWidth: "17ch",
            margin: 0,
          }}
        >
          Drop a sample. We detonate it in isolation and show you every action it takes, its blast radius, and who it
          phones home to.
        </h1>

        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        <div
          className="drop-zone"
          onClick={() => !busy && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          style={{
            marginTop: 52,
            border: `1px solid ${dragging ? COLORS.ink : "rgba(26,25,21,0.26)"}`,
            background: dragging ? "#EEECE6" : "transparent",
            borderRadius: 4,
            padding: "26px 30px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: busy ? "default" : "pointer",
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 500 }}>
              {busy ? "Submitting…" : "Drop a sample to detonate"}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: COLORS.mut, marginTop: 5 }}>
              PE · DLL · MSI · DOC · JS · APK — max 100 MB
            </div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, display: "flex", alignItems: "center", gap: 9 }}>
            Detonate <span style={{ fontSize: 16 }}>→</span>
          </div>
        </div>

        <div
          className="url-row"
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "stretch",
            border: "1px solid rgba(26,25,21,0.26)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              paddingLeft: 18,
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: COLORS.mut,
              flex: "none",
            }}
          >
            URL
          </div>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitUrl()}
            placeholder="https://example.com/sample.exe"
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              background: "transparent",
              padding: 16,
              fontFamily: MONO,
              fontSize: 13,
              color: COLORS.ink,
              outline: "none",
            }}
          />
          <button
            className="submit-btn"
            onClick={submitUrl}
            disabled={busy}
            style={{
              flex: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              color: COLORS.bg,
              background: COLORS.ink,
              border: "none",
              padding: "15px 22px",
            }}
          >
            Fetch &amp; detonate
          </button>
        </div>

        {err && (
          <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 12, color: COLORS.hot }}>{err}</div>
        )}

        <div
          style={{
            marginTop: 72,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            paddingBottom: 14,
            borderBottom: "1px solid rgba(26,25,21,0.22)",
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: COLORS.mut,
            }}
          >
            Prepared samples
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: COLORS.mut }}>
            {loading ? "Loading…" : "Select to analyze"}
          </div>
        </div>

        {library.map((m) => {
          const color = lvlColor(m.sevLevel);
          const completed = m.status === "completed";
          return (
            <div
              key={m.id}
              className="sample-row"
              onClick={() => completed && onPickSample(m.id)}
              style={{
                padding: "26px 0",
                borderBottom: "1px solid rgba(26,25,21,0.14)",
                cursor: completed ? "pointer" : "default",
                opacity: completed ? 1 : 0.7,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
                <h3 style={{ fontSize: 25, fontWeight: 500, letterSpacing: "-0.015em", margin: 0 }}>{m.name}</h3>
                <div style={{ fontFamily: MONO, fontSize: 12, color: COLORS.mut, whiteSpace: "nowrap" }}>{m.seen}</div>
              </div>
              <div
                className="g-two"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 28,
                  marginTop: 16,
                  maxWidth: 660,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: COLORS.mut,
                    }}
                  >
                    Classification
                  </div>
                  <div style={{ fontSize: 14, marginTop: 4 }}>{m.classification}</div>
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: COLORS.mut,
                    }}
                  >
                    Verdict
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <span style={tag(color)}>
                      {m.sevLabel} {completed ? m.score : ""}
                    </span>
                  </div>
                </div>
              </div>
              <p
                style={{
                  margin: "16px 0 0",
                  maxWidth: 640,
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  color: COLORS.faint,
                }}
              >
                {m.summary}
              </p>
            </div>
          );
        })}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "26px 0 44px",
            marginTop: 18,
            borderTop: "1px solid rgba(26,25,21,0.14)",
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: 11, color: COLORS.mut }}>© 2026 — Detonate Lab</div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: COLORS.mut }}>Isolated · Read-only · For analysis</div>
        </div>
      </div>
    </div>
  );
}
