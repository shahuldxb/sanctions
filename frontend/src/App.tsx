import React, { Suspense, lazy, Component } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import { HelpProvider } from './components/HelpOverlay'
import { Spinner } from './components/ui'

// Error Boundary to catch rendering errors
class ErrorBoundary extends Component<{children: React.ReactNode}, {error: string | null, info: string | null}> {
  constructor(props: any) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(e: any) {
    return { error: e?.message || String(e) };
  }
  componentDidCatch(e: any, info: any) {
    console.error('React Error:', e, info);
    this.setState({ info: info?.componentStack || '' });
  }
  render() {
    if (this.state.error) return (
      <div className="p-8">
        <div className="bg-red-900/20 border border-red-600/40 rounded-xl p-6">
          <h2 className="text-xl font-bold text-red-400 mb-2">Page Error</h2>
          <p className="text-red-300 mb-4">{this.state.error}</p>
          {this.state.info && <pre className="text-xs text-slate-400 bg-slate-800 p-3 rounded overflow-auto max-h-40">{this.state.info}</pre>}
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" onClick={() => this.setState({error: null, info: null})}>Retry</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

// Lazy-loaded pages
const Dashboard = lazy(() => import('./pages/Dashboard'))
const SanctionsList = lazy(() => import('./pages/SanctionsList'))
const SanctionsListBySource = lazy(() => import('./pages/SanctionsListBySource'))
const ScreeningQuick = lazy(() => import('./pages/screening/ScreeningQuick'))
const ScreeningBatch = lazy(() => import('./pages/screening/ScreeningBatch'))
const ScreeningByList = lazy(() => import('./pages/screening/ScreeningByList'))
const ScreeningAll = lazy(() => import('./pages/screening/ScreeningAll'))
const ScreeningHistory = lazy(() => import('./pages/screening/ScreeningHistory'))
const Cases = lazy(() => import('./pages/Cases'))
const Alerts = lazy(() => import('./pages/Alerts'))

const Watchlist = lazy(() => import('./pages/Watchlist'))
const Rules = lazy(() => import('./pages/Rules'))
const Users = lazy(() => import('./pages/Users'))
const Reports = lazy(() => import('./pages/Reports'))
const AuditLog = lazy(() => import('./pages/AuditLog'))
const ScraperControl = lazy(() => import('./pages/process/ScraperControl'))
const SanctionsListManager = lazy(() => import('./pages/process/SanctionsListManager'))
const PEPManager = lazy(() => import('./pages/process/PEPManager'))
const DataSources = lazy(() => import('./pages/process/DataSources'))
const OFACDelta = lazy(() => import('./pages/process/OFACDelta'))
const EnrichmentEngine = lazy(() => import('./pages/process/EnrichmentEngine'))
const FuzzyEngine = lazy(() => import('./pages/process/FuzzyEngine'))
const Scheduler = lazy(() => import('./pages/process/Scheduler'))
const ActiveProcesses = lazy(() => import('./pages/process/ActiveProcesses'))
const AIAnalysis = lazy(() => import('./pages/ai/AIAnalysis'))
const AIChat = lazy(() => import('./pages/ai/AIChat'))
const AIRisk = lazy(() => import('./pages/ai/AIRisk'))

function Loading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={32} />
        <span className="text-sm text-slate-500">Loading...</span>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <HelpProvider>
      <Toaster position="top-right" toastOptions={{
        style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' },
        success: { iconTheme: { primary: '#22c55e', secondary: '#1e293b' } },
        error: { iconTheme: { primary: '#ef4444', secondary: '#1e293b' } },
      }} />
      <Layout>
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />

              {/* Sanctions Lists */}
              <Route path="/sanctions" element={<SanctionsList />} />
              <Route path="/sanctions/:source" element={<SanctionsListBySource />} />
              <Route path="/watchlist" element={<Watchlist />} />

              {/* Screening */}
              <Route path="/screening/quick" element={<ScreeningQuick />} />
              <Route path="/screening/batch" element={<ScreeningBatch />} />
              <Route path="/screening/ofac" element={<ScreeningByList source="OFAC" />} />
              <Route path="/screening/eu" element={<ScreeningByList source="EU" />} />
              <Route path="/screening/un" element={<ScreeningByList source="UN" />} />
              <Route path="/screening/uk" element={<ScreeningByList source="UK" />} />
              <Route path="/screening/seco" element={<ScreeningByList source="SECO" />} />
              <Route path="/screening/dfat" element={<ScreeningByList source="DFAT" />} />
              <Route path="/screening/mas" element={<ScreeningByList source="MAS" />} />
              <Route path="/screening/all" element={<ScreeningAll />} />
              <Route path="/screening/history" element={<ScreeningHistory />} />

              {/* Cases & Alerts */}
              <Route path="/cases" element={<Cases />} />
              <Route path="/alerts" element={<Alerts />} />



              {/* Process Control */}
              <Route path="/process/scraper" element={<ScraperControl />} />
              <Route path="/process/sanctions-manager" element={<SanctionsListManager />} />
              <Route path="/process/pep-manager" element={<PEPManager />} />
              <Route path="/process/data-sources" element={<DataSources />} />
              <Route path="/process/ofac-delta" element={<OFACDelta />} />
              <Route path="/process/enrichment" element={<EnrichmentEngine />} />
              <Route path="/process/fuzzy" element={<FuzzyEngine />} />
              <Route path="/process/scheduler" element={<Scheduler />} />
              <Route path="/process/active" element={<ActiveProcesses />} />

              {/* AI Intelligence */}
              <Route path="/ai/analysis" element={<AIAnalysis />} />
              <Route path="/ai/chat" element={<AIChat />} />
              <Route path="/ai/risk" element={<AIRisk />} />

              {/* Management */}
              <Route path="/rules" element={<Rules />} />
              <Route path="/users" element={<Users />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/audit" element={<AuditLog />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Layout>
    </HelpProvider>
  )
}
