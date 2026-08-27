import { useCallback, useState } from 'react';
import TopBar from './components/TopBar';
import ImportView from './components/ImportView';
import AnalyzingView from './components/AnalyzingView';
import AppView from './components/AppView';
import { getReport } from './api';
import type { Report, Tab, View } from './types';
import { BG, INK } from './theme';

export default function App() {
  const [view, setView] = useState<View>('import');
  const [tab, setTab] = useState<Tab>('overview');
  const [jobId, setJobId] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const goImport = useCallback(() => {
    setView('import');
    setTab('overview');
    setJobId(null);
    setReport(null);
  }, []);

  // ImportView hands us a job to watch.
  const onSubmitted = useCallback((id: string) => {
    setReport(null);
    setJobId(id);
    setView('analyzing');
  }, []);

  // A prepared card whose report we can show directly (no job).
  const onSeededReport = useCallback(async (reportId: string) => {
    try {
      const r = await getReport(reportId);
      setReport(r);
      setTab('overview');
      setView('app');
    } catch {
      // Fall back to a fresh job if the direct report isn't ready.
    }
  }, []);

  // AnalyzingView resolved a completed report.
  const onDone = useCallback((r: Report) => {
    setReport(r);
    setTab('overview');
    setView('app');
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: BG,
        color: INK,
        fontFamily: "'Schibsted Grotesk',sans-serif",
        overflow: 'hidden',
      }}
    >
      <TopBar
        isApp={view === 'app'}
        tab={tab}
        onTab={setTab}
        onLogo={goImport}
      />

      {view === 'import' && (
        <ImportView onSubmitted={onSubmitted} onSeededReport={onSeededReport} />
      )}

      {view === 'analyzing' && jobId && (
        <AnalyzingView jobId={jobId} onDone={onDone} onReset={goImport} />
      )}

      {view === 'app' && report && (
        <AppView report={report} tab={tab} onTab={setTab} onNewAnalysis={goImport} />
      )}
    </div>
  );
}
