import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./lib/api";
import { useAuth } from "./lib/auth";
import { COLORS, MONO } from "./lib/theme";
import type { Analysis, AnalysisSummary } from "./lib/types";
import { Topbar } from "./components/Topbar";
import { AuthScreen } from "./components/AuthScreen";
import { ImportView } from "./components/ImportView";
import { AnalyzingView } from "./components/AnalyzingView";
import { AppView } from "./components/AppView";

export type Tab = "overview" | "killchain" | "timeline" | "blast" | "network";
type View = "import" | "analyzing" | "app";

const shell: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  background: COLORS.bg,
  color: COLORS.ink,
  fontFamily: "'Schibsted Grotesk', sans-serif",
  overflow: "hidden",
};

export function App() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>("import");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [library, setLibrary] = useState<AnalysisSummary[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const analysisId = analysis?.id ?? null;
  const timerRef = useRef<number | null>(null);
  const completeTimerRef = useRef<number | null>(null);

  const loadLibrary = useCallback(async () => {
    setLibLoading(true);
    try {
      setLibrary(await api.list());
    } catch {
      /* ignore — shown empty */
    } finally {
      setLibLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadLibrary();
  }, [user, loadLibrary]);

  // Poll the running analysis until it completes or fails.
  useEffect(() => {
    if (view !== "analyzing" || !analysisId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const a = await api.get(analysisId);
        if (stopped) return;
        setAnalysis(a);
        if (a.status === "completed") {
          stopped = true;
          if (timerRef.current) window.clearInterval(timerRef.current);
          completeTimerRef.current = window.setTimeout(() => {
            setTab("overview");
            setView("app");
          }, 450);
        } else if (a.status === "failed") {
          stopped = true;
          if (timerRef.current) window.clearInterval(timerRef.current);
          setNotice(a.error || "Analysis failed");
          setView("import");
          loadLibrary();
        }
      } catch {
        /* transient — keep polling */
      }
    };
    timerRef.current = window.setInterval(tick, 500);
    tick();
    return () => {
      stopped = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (completeTimerRef.current) {
        window.clearTimeout(completeTimerRef.current);
        completeTimerRef.current = null;
      }
    };
  }, [view, analysisId, loadLibrary]);

  const startAnalysis = (a: Analysis) => {
    setNotice(null);
    setAnalysis(a);
    setView("analyzing");
  };

  const onSubmitFile = async (file: File) => startAnalysis(await api.submitFile(file));
  const onSubmitUrl = async (url: string) => startAnalysis(await api.submitUrl(url));

  const onPickSample = async (id: string) => {
    try {
      const a = await api.get(id);
      setAnalysis(a);
      setTab("overview");
      setView(a.status === "completed" ? "app" : "analyzing");
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Could not open sample");
    }
  };

  const reset = () => {
    setAnalysis(null);
    setNotice(null);
    setView("import");
    loadLibrary();
  };

  if (loading) {
    return (
      <div style={{ ...shell, alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 13, color: COLORS.mut }}>Loading Detonate Lab…</div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  return (
    <div style={shell}>
      <Topbar inApp={view === "app"} tab={tab} onTab={setTab} onBrand={reset} />
      {view === "import" && (
        <ImportView
          library={library}
          loading={libLoading}
          notice={notice}
          onDismissNotice={() => setNotice(null)}
          onSubmitFile={onSubmitFile}
          onSubmitUrl={onSubmitUrl}
          onPickSample={onPickSample}
        />
      )}
      {view === "analyzing" && analysis && <AnalyzingView analysis={analysis} />}
      {view === "app" && analysis?.report && (
        <AppView report={analysis.report} tab={tab} onTab={setTab} onNew={reset} />
      )}
    </div>
  );
}
