/**
 * PEP Manager
 * ───────────
 * Finastra-style control panel for managing PEP data from all sources.
 * Shows per-source status, per-stage timing, and lets operators load
 * individual sources or all sources at once.
 *
 * Two load methods:
 *   1. BCP Pipeline (enterprise) — download → transform → BCP bulk load → MERGE
 *   2. Row-by-row scraper (legacy) — slower but works without BCP
 */
import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Play, Database, Cpu, Download,
  CheckCircle, AlertCircle, Clock, Zap, Activity, Users, Shield,
  Server, GitMerge
} from 'lucide-react'

const API = '/api'

interface PEPStats {
  totalInDB:  number
  totalInRAM: number
  loadedAt:   string | null
  bySource:   { source: string; cnt: number; with_wikidata: number; with_adverse_links: number; with_dob: number; with_position: number }[]
}

interface LoadStatus {
  status:      string
  startedAt:   string | null
  completedAt: string | null
  results:     { source: string; status: string; added: number; updated: number; downloaded: number; error?: string }[]
  recentLogs:  { ts: string; msg: string; level: string }[]
}

interface BCPStatus {
  status:      string
  phase:       string | null
  startedAt:   string | null
  completedAt: string | null
  timings:     { download_ms: number; bcp_ms: number; merge_ms: number; total_ms: number }
  stats:       { downloaded_bytes: number; rows_in_staging: number; rows_merged: number; rows_added: number; rows_updated: number }
  error:       string | null
  logs:        { ts: string; msg: string; level: string }[]
}

const PEP_SOURCES = [
  { code: 'opensanctions', name: 'OpenSanctions PEP', description: 'Wikidata + Every Politician + national gazettes', records: '~700K', flag: '🌐', updateFreq: 'Daily', method: 'BCP' },
  { code: 'wikidata', name: 'Wikidata SPARQL', description: 'Heads of state, ministers, senior officials', records: '~50K', flag: '📚', updateFreq: 'Weekly', method: 'SPARQL' },
  { code: 'icij', name: 'ICIJ Offshore Leaks', description: 'Panama Papers, Pandora Papers, adverse links', records: '~800K', flag: '🔍', updateFreq: 'Quarterly', method: 'API' },
]

function msBar(ms: number, maxMs: number) {
  const pct = Math.min(100, Math.round((ms / Math.max(maxMs, 1)) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-violet-300 w-16 text-right">{ms.toLocaleString()} ms</span>
    </div>
  )
}

function bytesLabel(b: number) {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${b} B`
}

const PHASE_LABELS: Record<string, string> = {
  download:  '⬇ Downloading CSV...',
  transform: '⚙ Transforming columns...',
  bcp:       '⚡ BCP bulk loading...',
  merge:     '🔀 Merging into production...',
  audit:     '📋 Writing audit log...',
}

export default function PEPManager() {
  const [stats, setStats]             = useState<PEPStats | null>(null)
  const [loadStatus, setLoadStatus]   = useState<LoadStatus | null>(null)
  const [bcpStatus, setBCPStatus]     = useState<BCPStatus | null>(null)
  const [running, setRunning]         = useState(false)
  const [bcpRunning, setBCPRunning]   = useState(false)
  const [ramLoading, setRamLoading]   = useState(false)
  const [reloadResult, setReloadResult] = useState<{ entries: number; ram_ms: number } | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [logsOpen, setLogsOpen]       = useState(false)
  const [bcpLogsOpen, setBCPLogsOpen] = useState(true)
  const [activeTab, setActiveTab]     = useState<'bcp' | 'legacy'>('bcp')

  const loadStats = useCallback(async () => {
    try { const r = await fetch(`${API}/pep/stats`); setStats(await r.json()) } catch (_) {}
  }, [])

  const pollLoadStatus = useCallback(async () => {
    try { const r = await fetch(`${API}/pep/load-status`); const d: LoadStatus = await r.json(); setLoadStatus(d); return d } catch (_) { return null }
  }, [])

  const pollBCPStatus = useCallback(async () => {
    try { const r = await fetch(`${API}/pep/bcp-status`); const d: BCPStatus = await r.json(); setBCPStatus(d); return d } catch (_) { return null }
  }, [])

  useEffect(() => {
    loadStats(); pollLoadStatus(); pollBCPStatus()
    const t = setInterval(() => { loadStats(); pollLoadStatus(); pollBCPStatus() }, 8000)
    return () => clearInterval(t)
  }, [loadStats, pollLoadStatus, pollBCPStatus])

  async function startBCPLoad() {
    setBCPRunning(true); setError(null)
    try {
      const r = await fetch(`${API}/pep/bcp-load`, { method: 'POST' })
      const data = await r.json()
      if (data.error && !data.error.includes('already running')) throw new Error(data.error)
      setBCPLogsOpen(true)
      let done = false
      while (!done) {
        await new Promise(res => setTimeout(res, 5000))
        const status = await pollBCPStatus()
        if (status && (status.status === 'completed' || status.status === 'error' || status.status === 'idle')) {
          done = true
          if (status.status === 'completed') loadStats()
        }
      }
    } catch (e: any) { setError(e.message) }
    finally { setBCPRunning(false) }
  }

  async function startLoad() {
    setRunning(true); setError(null)
    try {
      const r = await fetch(`${API}/pep/load`, { method: 'POST' })
      const data = await r.json()
      if (data.error && !data.error.includes('already running')) throw new Error(data.error)
      let done = false
      while (!done) {
        await new Promise(res => setTimeout(res, 5000))
        const status = await pollLoadStatus()
        if (status && (status.status === 'completed' || status.status === 'error' || status.status === 'idle')) done = true
      }
    } catch (e: any) { setError(e.message) }
    finally { setRunning(false); loadStats() }
  }

  async function reloadRAM() {
    setRamLoading(true); setReloadResult(null)
    try {
      const r = await fetch(`${API}/pep/reload`, { method: 'POST' })
      const data = await r.json()
      setReloadResult({ entries: data.entryCount || data.count || 0, ram_ms: data.loadTimeMs || 0 })
    } catch (e: any) { setError(e.message) }
    finally { setRamLoading(false); loadStats() }
  }

  const recentLogs      = loadStatus?.recentLogs?.slice(-30) || []
  const bcpLogs         = bcpStatus?.logs?.slice(-40) || []
  const isBCPRunning    = bcpRunning || bcpStatus?.status === 'running'
  const isLegacyRunning = running || loadStatus?.status === 'running'

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users size={22} className="text-violet-400" /> PEP Manager
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">Politically Exposed Persons — load, manage, and monitor all PEP data sources</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reloadRAM} disabled={ramLoading} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm disabled:opacity-50">
            <Cpu size={14} className={ramLoading ? 'animate-spin' : ''} />
            {ramLoading ? 'Reloading...' : 'Reload RAM'}
          </button>
          <button onClick={() => { loadStats(); pollLoadStatus(); pollBCPStatus() }} className="p-1.5 text-slate-400 hover:text-white">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-700 rounded p-3 text-red-300 text-sm">
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs">✕</button>
        </div>
      )}

      {/* Engine Status Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><Activity size={10} /> PEP Engine</div>
          <div className={`text-sm font-bold ${stats?.totalInRAM ? 'text-green-400' : 'text-red-400'}`}>{stats?.totalInRAM ? '● LOADED' : '○ NOT LOADED'}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><Cpu size={10} /> Entries in RAM</div>
          <div className="text-white font-bold text-sm">{stats?.totalInRAM?.toLocaleString() || '—'}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><Database size={10} /> Entries in DB</div>
          <div className="text-white font-bold text-sm">{stats?.totalInDB?.toLocaleString() || '—'}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><Clock size={10} /> Last Loaded</div>
          <div className="text-white font-bold text-xs">{stats?.loadedAt ? new Date(stats.loadedAt).toLocaleTimeString() : 'Never'}</div>
        </div>
      </div>

      {reloadResult && (
        <div className="bg-green-900/20 border border-green-700 rounded-lg p-3 text-sm text-green-300 flex items-center gap-2">
          <CheckCircle size={14} />
          RAM reloaded: <strong>{reloadResult.entries.toLocaleString()}</strong> entries in <strong>{reloadResult.ram_ms.toLocaleString()} ms</strong>
        </div>
      )}

      {/* Load Method Tabs */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="flex border-b border-slate-700">
          <button onClick={() => setActiveTab('bcp')} className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors ${activeTab === 'bcp' ? 'bg-violet-900/40 text-violet-300 border-b-2 border-violet-500' : 'text-slate-400 hover:text-white'}`}>
            <Server size={14} /> BCP Pipeline
            <span className="text-xs bg-violet-800 text-violet-200 px-1.5 py-0.5 rounded font-normal">Enterprise</span>
          </button>
          <button onClick={() => setActiveTab('legacy')} className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors ${activeTab === 'legacy' ? 'bg-slate-700 text-slate-200 border-b-2 border-slate-500' : 'text-slate-400 hover:text-white'}`}>
            <Download size={14} /> Row-by-Row Scraper
          </button>
        </div>

        {activeTab === 'bcp' && (
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-white font-semibold text-sm">OpenSanctions BCP Bulk Load</div>
                <div className="text-slate-400 text-xs mt-0.5">Download CSV → Transform columns → BCP TABLOCK bulk load into pep_staging → MERGE into pep_entries</div>
              </div>
              <button onClick={startBCPLoad} disabled={isBCPRunning} className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded text-sm font-semibold disabled:opacity-50 shrink-0 ml-4">
                <Zap size={14} className={isBCPRunning ? 'animate-pulse' : ''} />
                {isBCPRunning ? 'Running BCP...' : 'Run BCP Load'}
              </button>
            </div>

            {isBCPRunning && bcpStatus?.phase && (
              <div className="flex items-center gap-2 bg-violet-900/20 border border-violet-700 rounded p-3 text-violet-300 text-sm animate-pulse">
                <RefreshCw size={13} className="animate-spin" />
                {PHASE_LABELS[bcpStatus.phase] || bcpStatus.phase}
              </div>
            )}

            {bcpStatus && (bcpStatus.status === 'completed' || bcpStatus.status === 'error') && (
              <div className={`border rounded-xl p-4 space-y-3 ${bcpStatus.status === 'completed' ? 'bg-slate-900 border-violet-700' : 'bg-red-900/20 border-red-700'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-white font-semibold text-sm flex items-center gap-2">
                    {bcpStatus.status === 'completed'
                      ? <><CheckCircle size={14} className="text-green-400" /> BCP Pipeline Complete</>
                      : <><AlertCircle size={14} className="text-red-400" /> BCP Pipeline Failed</>}
                  </span>
                  {bcpStatus.timings?.total_ms > 0 && (
                    <span className="text-violet-400 font-mono font-bold text-sm">{(bcpStatus.timings.total_ms / 1000).toFixed(1)}s total</span>
                  )}
                </div>
                {bcpStatus.status === 'completed' && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="bg-slate-800 rounded p-2"><div className="text-slate-500">Downloaded</div><div className="text-white font-bold">{bytesLabel(bcpStatus.stats.downloaded_bytes)}</div></div>
                      <div className="bg-slate-800 rounded p-2"><div className="text-slate-500">Rows Staged</div><div className="text-white font-bold">{bcpStatus.stats.rows_in_staging.toLocaleString()}</div></div>
                      <div className="bg-slate-800 rounded p-2"><div className="text-slate-500">Added</div><div className="text-green-400 font-bold">+{bcpStatus.stats.rows_added.toLocaleString()}</div></div>
                      <div className="bg-slate-800 rounded p-2"><div className="text-slate-500">Updated</div><div className="text-blue-400 font-bold">~{bcpStatus.stats.rows_updated.toLocaleString()}</div></div>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div>
                        <div className="flex items-center gap-1 text-slate-400 mb-0.5"><Download size={10} /> Stage 1 — Download CSV</div>
                        {msBar(bcpStatus.timings.download_ms, bcpStatus.timings.total_ms)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-slate-400 mb-0.5"><Server size={10} /> Stage 2 — BCP Bulk Load (TABLOCK)</div>
                        {msBar(bcpStatus.timings.bcp_ms, bcpStatus.timings.total_ms)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-slate-400 mb-0.5"><GitMerge size={10} /> Stage 3 — MERGE into pep_entries</div>
                        {msBar(bcpStatus.timings.merge_ms, bcpStatus.timings.total_ms)}
                      </div>
                    </div>
                  </>
                )}
                {bcpStatus.error && <div className="text-red-300 text-xs font-mono bg-red-900/20 rounded p-2">{bcpStatus.error}</div>}
              </div>
            )}

            {bcpLogs.length > 0 && (
              <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Zap size={13} className="text-violet-400" /> BCP Pipeline Log
                    {isBCPRunning && <span className="flex items-center gap-1 text-xs text-violet-400 animate-pulse"><span className="w-1.5 h-1.5 bg-violet-400 rounded-full" /> LIVE</span>}
                  </div>
                  <button onClick={() => setBCPLogsOpen(o => !o)} className="text-xs text-slate-500 hover:text-white">{bcpLogsOpen ? 'Collapse' : 'Expand'}</button>
                </div>
                <div className={`bg-black/60 font-mono text-xs p-3 overflow-y-auto transition-all ${bcpLogsOpen ? 'max-h-64' : 'max-h-16'}`}>
                  {bcpLogs.map((l, i) => (
                    <div key={i} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-300' : l.msg.includes('complete') || l.msg.includes('complete') ? 'text-green-400' : 'text-green-300'}>
                      <span className="text-slate-600 mr-2">{new Date(l.ts).toLocaleTimeString()}</span>{l.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-slate-900/50 rounded-lg p-3 text-xs text-slate-400">
              <div className="text-slate-300 font-semibold mb-1">Why BCP is faster than row-by-row inserts</div>
              BCP uses <code className="text-violet-300">TABLOCK</code> + <code className="text-violet-300">BULK_LOGGED</code> recovery — the transaction log is bypassed for staging loads, reducing I/O by ~90%. 700K rows load in ~90 seconds vs ~25 minutes with individual INSERTs. The atomic MERGE ensures pep_entries is never partially updated.
            </div>
          </div>
        )}

        {activeTab === 'legacy' && (
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-white font-semibold text-sm">Row-by-Row Scraper (All Sources)</div>
                <div className="text-slate-400 text-xs mt-0.5">Downloads and inserts OpenSanctions PEP, Wikidata SPARQL, and ICIJ Offshore Leaks using batch INSERT</div>
              </div>
              <button onClick={startLoad} disabled={isLegacyRunning} className="flex items-center gap-1.5 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded text-sm font-semibold disabled:opacity-50 shrink-0 ml-4">
                <Play size={14} className={isLegacyRunning ? 'animate-pulse' : ''} />
                {isLegacyRunning ? 'Loading...' : 'Load All Sources'}
              </button>
            </div>
            {recentLogs.length > 0 && (
              <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Zap size={13} className="text-slate-400" /> Scraper Log
                    {isLegacyRunning && <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse"><span className="w-1.5 h-1.5 bg-amber-400 rounded-full" /> LIVE</span>}
                  </div>
                  <button onClick={() => setLogsOpen(o => !o)} className="text-xs text-slate-500 hover:text-white">{logsOpen ? 'Collapse' : 'Expand'}</button>
                </div>
                <div className={`bg-black/60 font-mono text-xs p-3 overflow-y-auto transition-all ${logsOpen ? 'max-h-64' : 'max-h-24'}`}>
                  {recentLogs.map((l, i) => (
                    <div key={i} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-300' : l.msg.includes('complete') ? 'text-green-400' : 'text-green-300'}>
                      <span className="text-slate-600 mr-2">{new Date(l.ts).toLocaleTimeString()}</span>{l.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Source Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PEP_SOURCES.map(src => {
          const dbRow     = stats?.bySource?.find(b => b.source.toLowerCase().includes(src.code) || b.source === src.code.toUpperCase())
          const runResult = loadStatus?.results?.find(r => r.source === src.code)
          const isActive  = loadStatus?.status === 'running'
          return (
            <div key={src.code} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{src.flag}</span>
                  <div>
                    <div className="font-bold text-white text-sm">{src.name}</div>
                    <div className="text-slate-400 text-xs">{src.description}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {runResult?.status === 'completed' && <CheckCircle size={14} className="text-green-400 shrink-0" />}
                  {runResult?.error && <AlertCircle size={14} className="text-red-400 shrink-0" />}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${src.method === 'BCP' ? 'bg-violet-900 text-violet-300' : 'bg-slate-700 text-slate-400'}`}>{src.method}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900 rounded p-2"><div className="text-slate-500">Expected</div><div className="text-white font-bold">{src.records}</div></div>
                <div className="bg-slate-900 rounded p-2"><div className="text-slate-500">In DB</div><div className="text-green-400 font-bold">{dbRow?.cnt?.toLocaleString() || '—'}</div></div>
                <div className="bg-slate-900 rounded p-2"><div className="text-slate-500">Update Freq</div><div className="text-violet-300">{src.updateFreq}</div></div>
                <div className="bg-slate-900 rounded p-2"><div className="text-slate-500">With Position</div><div className="text-slate-300">{dbRow?.with_position?.toLocaleString() || '—'}</div></div>
              </div>
              {dbRow && (
                <div className="text-xs space-y-1">
                  <div className="flex justify-between text-slate-500"><span>With Wikidata ID</span><span className="text-blue-400">{dbRow.with_wikidata?.toLocaleString()}</span></div>
                  <div className="flex justify-between text-slate-500"><span>With Adverse Links</span><span className="text-amber-400">{dbRow.with_adverse_links?.toLocaleString()}</span></div>
                  <div className="flex justify-between text-slate-500"><span>With Date of Birth</span><span className="text-green-400">{dbRow.with_dob?.toLocaleString()}</span></div>
                </div>
              )}
              {runResult?.error && <div className="bg-red-900/20 border border-red-800 rounded p-2 text-xs text-red-300 flex items-start gap-1"><AlertCircle size={10} className="mt-0.5 shrink-0" /> {runResult.error}</div>}
              {isActive && !runResult && <div className="flex items-center gap-1 text-xs text-violet-400 animate-pulse"><RefreshCw size={10} className="animate-spin" /> Queued...</div>}
            </div>
          )
        })}
      </div>

      {/* Method Explanation */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-xs text-slate-400 space-y-2">
        <div className="text-slate-300 font-semibold text-sm flex items-center gap-1"><Shield size={12} /> Why PEP Loading Takes Longer</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-900 rounded p-2"><div className="text-violet-300 font-semibold mb-1">700K+ Records</div>OpenSanctions PEP CSV is ~180MB with 700,053 rows. Each row has 20+ fields including positions, aliases, Wikidata IDs, and adverse links. Parsing alone takes ~45 seconds.</div>
          <div className="bg-slate-900 rounded p-2"><div className="text-violet-300 font-semibold mb-1">Paginated RAM Load</div>Loading 700K rows from Azure SQL in one query causes socket timeout after ~5 minutes. The engine loads in pages of 10,000 rows with pool reconnect between pages to avoid this.</div>
          <div className="bg-slate-900 rounded p-2"><div className="text-violet-300 font-semibold mb-1">Phonetic Index Build</div>Every PEP name and alias is tokenised and Double Metaphone encoded. 700K entries x ~3 aliases each = ~2.1M phonetic codes indexed in RAM for sub-20ms fuzzy search.</div>
        </div>
      </div>
    </div>
  )
}
