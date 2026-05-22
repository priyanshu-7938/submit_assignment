import { useState, useEffect } from 'react';
import { 
  Activity, 
  Clock, 
  Cpu, 
  Terminal, 
  RefreshCw, 
  TrendingUp, 
  ShieldAlert, 
  CheckCircle, 
  Layers,
  Database
} from 'lucide-react';

const ANALYTICS_BASE = ''; // Points directly to your analytics-server port

// --- Interfaces for Component State ---
interface SummaryMetrics {
  totalInferenceRequests: number;
  activeConversations: number;
  averageLatencyMs: number;
  statusBreakdown: { status: string; count: number }[];
}

interface ModelMetrics {
  provider: string;
  model: string;
  requestCount: number;
  avgLatencyMs: number;
}

interface ObservabilityLog {
  id: string;
  level: string; // Stored in model string field
  timestamp: string;
  message: {
    content: string;
    userId: string;
  } | string;
}

export default function AnalyticsDashboard() {
  // State variables for server analytics
  const [summary, setSummary] = useState<SummaryMetrics | null>(null);
  const [models, setModels] = useState<ModelMetrics[]>([]);
  const [logs, setLogs] = useState<ObservabilityLog[]>([]);
  
  const [isLivePolling, setIsLivePolling] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // --- Core API Data Fetching ---
  const fetchAllTelemetryData = async () => {
    try {
      // 1. Grab top-level status KPIs
      const summaryRes = await fetch(`${ANALYTICS_BASE}/api/analytics/summary`);
      const summaryData = await summaryRes.json();
      if (summaryData.success) setSummary(summaryData.metrics);

      // 2. Grab model throughput breakdowns
      const modelsRes = await fetch(`${ANALYTICS_BASE}/api/analytics/models`);
      const modelsData = await modelsRes.json();
      if (modelsData.success) setModels(modelsData.models);

      // 3. Grab raw streaming observability log rows
      const logsRes = await fetch(`${ANALYTICS_BASE}/api/analytics/system-logs`);
      const logsData = await logsRes.json();
      if (logsData.success) setLogs(logsData.logs);

      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Telemetry collection fetch execution failure:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Triggers baseline lifecycle execution and handles long-polling interval setup
  useEffect(() => {
    fetchAllTelemetryData();

    let pollingInterval: ReturnType<typeof setInterval>;
    if (isLivePolling) {
      pollingInterval = setInterval(() => {
        fetchAllTelemetryData();
      }, 4000); // Poll every 4 seconds to catch active tracking SDK flushes
    }

    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [isLivePolling]);

  // Helper utility to safely parse and display JSON-string payloads or direct content strings
  const renderLogContent = (logMessage: any) => {
    if (typeof logMessage === 'object' && logMessage !== null) {
      return (
        <div className="space-y-1">
          <p className="text-zinc-200 font-medium break-all">{logMessage.content}</p>
          <div className="flex gap-3 text-[10px] text-zinc-500 font-mono">
            <span>Actor ID: {logMessage.userId}</span>
          </div>
        </div>
      );
    }
    return <p className="text-zinc-200 font-medium break-all">{String(logMessage)}</p>;
  };

  // Helper utility to apply context badges based on severity
  const getSeverityStyles = (level: string) => {
    const cleanLevel = level.toLowerCase();
    if (cleanLevel === 'error') return 'bg-red-950/40 border-red-900 text-red-400';
    if (cleanLevel === 'warn' || cleanLevel === 'warning') return 'bg-amber-950/40 border-amber-900 text-amber-400';
    if (cleanLevel === 'debug') return 'bg-blue-950/40 border-blue-900 text-blue-400';
    return 'bg-zinc-900 border-zinc-800 text-zinc-400';
  };

  return (
    <div className="min-h-screen w-screen bg-zinc-950 text-zinc-50 p-6 font-sans antialiased overflow-x-hidden">
      
      {/* HEADER SECTION CONTROLS */}
      <header className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-zinc-900 mb-8">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 shadow-sm">
              <Database className="w-5 h-5 text-zinc-400" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Observability Pipeline</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">Live monitoring dashboard for raw SDK telemetry signals and ingestion loops.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs w-full sm:w-auto justify-end">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg text-zinc-400">
            <span className={`w-1.5 h-1.5 rounded-full ${isLivePolling ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
            <span>{isLivePolling ? 'Live Polling Active' : 'Polling Suspended'}</span>
          </div>

          <button
            onClick={() => setIsLivePolling(!isLivePolling)}
            className={`px-3 py-1.5 rounded-lg border font-medium transition ${
              isLivePolling 
                ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300' 
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-950 border-transparent'
            }`}
          >
            {isLivePolling ? 'Pause' : 'Resume Streaming'}
          </button>

          <button
            onClick={fetchAllTelemetryData}
            disabled={isLoading}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition disabled:opacity-40"
            title="Force Pipeline Sync"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          
          {lastRefreshed && (
            <span className="text-[10px] font-mono text-zinc-500 w-full sm:w-auto text-right block">Sync: {lastRefreshed}</span>
          )}
        </div>
      </header>

      {/* MAIN VIEWGRID STRUCTURE */}
      <main className="max-w-7xl mx-auto space-y-6">
        
        {/* TOP METRICS KPI CARDS ROW */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-900/40 border border-zinc-900 p-4 rounded-xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Total Signals</span>
              <span className="text-2xl font-semibold tracking-tight">{summary?.totalInferenceRequests ?? '—'}</span>
            </div>
            <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg"><Activity className="w-4 h-4 text-zinc-400" /></div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-900 p-4 rounded-xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Active Rooms</span>
              <span className="text-2xl font-semibold tracking-tight">{summary?.activeConversations ?? '—'}</span>
            </div>
            <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg"><Layers className="w-4 h-4 text-zinc-400" /></div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-900 p-4 rounded-xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Avg Generation Latency</span>
              <span className="text-2xl font-semibold tracking-tight">
                {summary?.averageLatencyMs ? `${summary.averageLatencyMs}ms` : '—'}
              </span>
            </div>
            <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg"><Clock className="w-4 h-4 text-zinc-400" /></div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-900 p-4 rounded-xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">Success Rate</span>
              <span className="text-2xl font-semibold tracking-tight text-emerald-400">
                {(() => {
                  if (!summary) return '—';
                  const completed = summary.statusBreakdown.find(s => s.status === 'COMPLETED')?.count || 0;
                  return summary.totalInferenceRequests > 0 
                    ? `${Math.round((completed / summary.totalInferenceRequests) * 100)}%`
                    : '100%';
                })()}
              </span>
            </div>
            <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg"><CheckCircle className="w-4 h-4 text-emerald-500/80" /></div>
          </div>
        </section>

        {/* MIDDLE DOUBLE-COLUMN PANEL SPLIT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* PER-MODEL LATENCY CHART TABLE LIST */}
          <section className="bg-zinc-900/20 border border-zinc-900 rounded-xl p-5 lg:col-span-1 space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
              <Cpu className="w-4 h-4 text-zinc-400" />
              <h2 className="text-xs font-semibold tracking-wider uppercase text-zinc-400">Model Deployment Efficiency</h2>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[360px] pr-1">
              {models.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-12">No active inference maps recorded.</p>
              ) : (
                models.map((m) => (
                  <div key={`${m.provider}-${m.model}`} className="bg-zinc-900/40 border border-zinc-900 p-3 rounded-lg space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate block text-zinc-200">{m.model.split('/').pop()}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase tracking-tight">{m.provider}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 font-mono border-t border-zinc-900/50">
                      <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-zinc-500" /> Vol: {m.requestCount}</span>
                      <span className="text-zinc-300 font-semibold">{m.avgLatencyMs} ms</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* LOWER SECTION: EVENT STREAM LOG VIEWER (CRITICAL EVENT CONTENT LOGGER) */}
          <section className="bg-zinc-900/20 border border-zinc-900 rounded-xl p-5 lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-zinc-400" />
                <h2 className="text-xs font-semibold tracking-wider uppercase text-zinc-400">Live Ingested Observability Events</h2>
              </div>
              <span className="text-[10px] font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 text-zinc-500">
                Showing last 50 events
              </span>
            </div>

            {/* RAW TERMINAL EVENT OUTPUT LOG STREAM */}
            <div className="space-y-2 overflow-y-auto h-[360px] pr-2 font-mono text-xs scrollbar-thin">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-2 py-16">
                  <ShieldAlert className="w-5 h-5 opacity-40" />
                  <p className="text-xs">Waiting for incoming SDK batch flushes...</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div 
                    key={log.id} 
                    className="p-3 bg-zinc-950 border border-zinc-900 rounded-lg flex flex-col sm:flex-row items-start gap-3 transition hover:border-zinc-800"
                  >
                    {/* Level Severity Status Pillar */}
                    <div className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider shrink-0 sm:mt-0.5 ${getSeverityStyles(log.level)}`}>
                      {log.level}
                    </div>

                    {/* Content Payload Parsing Area */}
                    <div className="flex-1 min-w-0">
                      {renderLogContent(log.message)}
                    </div>

                    {/* Timestamp Tag */}
                    <div className="text-[10px] text-zinc-600 text-right shrink-0 whitespace-nowrap self-end sm:self-start">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}