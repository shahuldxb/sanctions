/**
 * Sanctions List Manager
 * ─────────────────────
 * Finastra-style control panel for managing all 8 sanctions lists.
 * Shows per-list status, per-stage timing (download / insert / RAM),
 * and lets operators run individual lists or all lists at once.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Play, Database, Cpu, Download, Upload,
  CheckCircle, AlertCircle, Clock, Zap, Activity, BarChart2
} from 'lucide-react'

const API = '/api'

interface SourceInfo {
  id: number
  source_code: string
  source_name: string
  total_entries: number
  last_scraped: string | null
  last_scrape_status: string | null
  scrape_interval_hours: number
  is_active: number
}

interface StageResult {
  source: string
  download_ms: number
  insert_ms:   number
  ram_ms:      number
  total_ms:    number
  downloaded:  number
  added:       number
  updated:     number
  deleted:     number
  logs:        string[]
  error?:      string
}

interface EngineStatus {
  loaded: boolean
  entryCount: number
  loadedAt: string | null
  heapUsedMB: number
}

const SOURCE_FLAGS: Record<string, string> = {
  OFAC: '🇺🇸', EU: '🇪🇺', UN: '🌐', UK: '🇬🇧',
  SECO: '🇨🇭', DFAT: '🇦🇺', MAS: '🇸🇬', BIS: '🇺🇸',
}

function msBar(ms: number, maxMs: number) {
  const pct = Math.min(100, Math.round((ms / maxMs) * 100))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-cyan-300 w-16 text-right">{ms.toLocaleString()} ms</span>
    </div>
  )
}

function TimingCard({ result }: { result: StageResult }) {
  const maxMs = Math.max(result.download_ms, result.insert_ms, result.ram_ms, 1)
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 mt-2 text-xs space-y-2">
      <div className="flex items-center justify-between text-slate-400 mb-1">
        <span className="font-semibold text-white">Stage Timing</span>
        <span className="text-cyan-400 font-mono font-bold">{result.total_ms.toLocaleString()} ms total</span>
      </div>
      <div>
        <div className="flex items-center gap-1 text-slate-400 mb-0.5">
          <Download size={10} /> <span>Download &amp; Parse</span>
        </div>
        {msBar(result.download_ms, maxMs)}
      </div>
      <div>
        <div className="flex items-center gap-1 text-slate-400 mb-0.5">
          <Database size={10} /> <span>DB Insert (batch 5K)</span>
        </div>
        {msBar(result.insert_ms, maxMs)}
      </div>
      <div>
        <div className="flex items-center gap-1 text-slate-400 mb-0.5">
          <Cpu size={10} /> <span>RAM Reload + Phonetic Index</span>
        </div>
        {msBar(result.ram_ms, maxMs)}
      </div>
      <div className="pt-1 border-t border-slate-700 grid grid-cols-3 gap-2 text-center">
        <div><div className="text-green-400 font-bold">+{result.added.toLocaleString()}</div><div className="text-slate-500">Added</div></div>
        <div><div className="text-amber-400 font-bold">~{result.updated.toLocaleString()}</div><div className="text-slate-500">Updated</div></div>
        <div><div className="text-blue-400 font-bold">{result.downloaded.toLocaleString()}</div><div className="text-slate-500">Total</div></div>
      </div>
    </div>
  )
}

export default function SanctionsListManager() {
  const [sources, setSources]         = useState<SourceInfo[]>([])
  const [engine, setEngine]           = useState<EngineStatus | null>(null)
  const [running, setRunning]         = useState<Record<string, boolean>>({})
  const [results, setResults]         = useState<Record<string, StageResult>>({})
  const [allRunning, setAllRunning]   = useState(false)
  const [ramLoading, setRamLoading]   = useState(false)
  const [logs, setLogs]               = useState<Record<string, string[]>>({})
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({})
  const [error, setError]             = useState<string | null>(null)

  const loadSources = useCallback(async () => {
    try {
      const r = await fetch(`${API}/scraper/status`)
      const data = await r.json()
      setSources(data)
    } catch (e: any) { setError(e.message) }
  }, [])

  const loadEngine = useCallback(async () => {
    try {
      const r = await fetch(`${API}/scraper/engine-status`)
      const data = await r.json()
      setEngine(data)
    } catch (_) {}
  }, [])

  useEffect(() => {
    loadSources()
    loadEngine()
    const t = setInterval(() => { loadSources(); loadEngine(); }, 30000)
    return () => clearInterval(t)
  }, [loadSources, loadEngine])

  async function runSource(code: string) {
    setRunning(r => ({ ...r, [code]: true }))
    setResults(r => { const n = { ...r }; delete n[code]; return n })
    setLogs(l => ({ ...l, [code]: [`[${new Date().toLocaleTimeString()}] Starting ${code}...`] }))
    try {
      const resp = await fetch(`${API}/scraper/timed-run/${code}`, { method: 'POST' })
      const data: StageResult = await resp.json()
      if (data.error) throw new Error(data.error)
      setResults(r => ({ ...r, [code]: data }))
      setLogs(l => ({ ...l, [code]: [...(l[code] || []), ...data.logs, `✓ Completed in ${data.total_ms}ms`] }))
    } catch (e: any) {
      setResults(r => ({ ...r, [code]: { source: code, download_ms: 0, insert_ms: 0, ram_ms: 0, total_ms: 0, downloaded: 0, added: 0, updated: 0, deleted: 0, logs: [], error: e.message } }))
      setLogs(l => ({ ...l, [code]: [...(l[code] || []), `✗ Error: ${e.message}`] }))
    } finally {
      setRunning(r => ({ ...r, [code]: false }))
      loadSources()
      loadEngine()
    }
  }

  async function runAll() {
    setAllRunning(true)
    const activeSources = sources.filter(s => s.is_active)
    for (const src of activeSources) {
      await runSource(src.source_code)
    }
    setAllRunning(false)
  }

  async function reloadRAM() {
    setRamLoading(true)
    try {
      const r = await fetch(`${API}/scraper/reload-ram`, { method: 'POST' })
      const data = await r.json()
      setEngine(prev => prev ? { ...prev, loaded: true, entryCount: data.entries } : prev)
    } catch (e: any) { setError(e.message) }
    finally { setRamLoading(false); loadEngine() }
  }

  const totalEntries = sources.reduce((s, x) => s + (x.total_entries || 0), 0)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Database size={22} className="text-cyan-400" />
            Sanctions List Manager
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Initialize, load, and manage all 8 sanctions lists with per-stage timing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reloadRAM}
            disabled={ramLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm disabled:opacity-50"
          >
            <Cpu size={14} className={ramLoading ? 'animate-spin' : ''} />
            {ramLoading ? 'Reloading RAM...' : 'Reload RAM'}
          </button>
          <button
            onClick={runAll}
            disabled={allRunning}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm font-semibold disabled:opacity-50"
          >
            <Play size={14} className={allRunning ? 'animate-pulse' : ''} />
            {allRunning ? 'Running All...' : 'Run All Lists'}
          </button>
          <button onClick={() => { loadSources(); loadEngine(); }} className="p-1.5 text-slate-400 hover:text-white">
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
          <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><Activity size={10} /> RAM Engine</div>
          <div className={`text-sm font-bold ${engine?.loaded ? 'text-green-400' : 'text-red-400'}`}>
            {engine?.loaded ? '● LOADED' : '○ NOT LOADED'}
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><BarChart2 size={10} /> Entries in RAM</div>
          <div className="text-white font-bold text-sm">{engine?.entryCount?.toLocaleString() || '—'}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><Database size={10} /> Entries in DB</div>
          <div className="text-white font-bold text-sm">{totalEntries.toLocaleString()}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><Cpu size={10} /> Heap Used</div>
          <div className="text-white font-bold text-sm">{engine?.heapUsedMB ? `${engine.heapUsedMB} MB` : '—'}</div>
        </div>
      </div>

      {/* Architecture Badges */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'A — Staging + Atomic Swap', color: 'bg-green-900/40 border-green-700 text-green-300' },
          { label: 'B — Double Metaphone Phonetic Index', color: 'bg-blue-900/40 border-blue-700 text-blue-300' },
          { label: 'C — Batch Size 5,000 rows', color: 'bg-purple-900/40 border-purple-700 text-purple-300' },
        ].map(b => (
          <span key={b.label} className={`text-xs px-2 py-0.5 rounded border ${b.color} flex items-center gap-1`}>
            <CheckCircle size={10} /> {b.label}
          </span>
        ))}
      </div>

      {/* Per-List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sources.map(src => {
          const isRunning = running[src.source_code] || false
          const result    = results[src.source_code]
          const srcLogs   = logs[src.source_code] || []
          const logsOpen  = expandedLogs[src.source_code]
          const flag      = SOURCE_FLAGS[src.source_code] || '🌍'

          return (
            <div key={src.source_code} className={`bg-slate-800 border rounded-xl p-4 transition-all ${isRunning ? 'border-cyan-600 shadow-lg shadow-cyan-900/30' : result?.error ? 'border-red-700' : result ? 'border-green-700' : 'border-slate-700'}`}>
              {/* Card Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{flag}</span>
                  <div>
                    <div className="font-bold text-white text-sm">{src.source_code}</div>
                    <div className="text-slate-400 text-xs">{src.source_name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isRunning && (
                    <span className="flex items-center gap-1 text-xs text-cyan-400 animate-pulse">
                      <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" /> Running
                    </span>
                  )}
                  {!isRunning && result && !result.error && (
                    <CheckCircle size={14} className="text-green-400" />
                  )}
                  {!isRunning && result?.error && (
                    <AlertCircle size={14} className="text-red-400" />
                  )}
                  <button
                    onClick={() => runSource(src.source_code)}
                    disabled={isRunning || allRunning}
                    className="flex items-center gap-1 px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs font-semibold disabled:opacity-40"
                  >
                    {isRunning ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
                    {isRunning ? 'Running' : 'Run'}
                  </button>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                <div className="bg-slate-900 rounded p-2">
                  <div className="text-slate-500">DB Entries</div>
                  <div className="text-white font-bold">{src.total_entries?.toLocaleString() || '0'}</div>
                </div>
                <div className="bg-slate-900 rounded p-2">
                  <div className="text-slate-500">Last Run</div>
                  <div className="text-slate-300">{src.last_scraped ? new Date(src.last_scraped).toLocaleDateString() : 'Never'}</div>
                </div>
                <div className="bg-slate-900 rounded p-2">
                  <div className="text-slate-500">Status</div>
                  <div className={`font-semibold ${src.last_scrape_status === 'SUCCESS' ? 'text-green-400' : src.last_scrape_status === 'FAILED' ? 'text-red-400' : 'text-slate-400'}`}>
                    {src.last_scrape_status || 'IDLE'}
                  </div>
                </div>
              </div>

              {/* Stage Timing Result */}
              {result && !result.error && <TimingCard result={result} />}
              {result?.error && (
                <div className="bg-red-900/20 border border-red-800 rounded p-2 text-xs text-red-300 mt-2 flex items-start gap-1">
                  <AlertCircle size={10} className="mt-0.5 shrink-0" /> {result.error}
                </div>
              )}

              {/* Log Toggle */}
              {srcLogs.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setExpandedLogs(e => ({ ...e, [src.source_code]: !e[src.source_code] }))}
                    className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
                  >
                    <Zap size={10} /> {logsOpen ? 'Hide' : 'Show'} log ({srcLogs.length} lines)
                  </button>
                  {logsOpen && (
                    <div className="mt-1 bg-black/60 rounded p-2 font-mono text-xs max-h-32 overflow-y-auto space-y-0.5">
                      {srcLogs.map((line, i) => (
                        <div key={i} className={line.startsWith('✓') ? 'text-green-400' : line.startsWith('✗') ? 'text-red-400' : 'text-green-300'}>
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Method Explanation */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-xs text-slate-400 space-y-2">
        <div className="text-slate-300 font-semibold text-sm flex items-center gap-1"><Clock size={12} /> How Each Stage Works</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-900 rounded p-2">
            <div className="text-cyan-300 font-semibold mb-1 flex items-center gap-1"><Download size={10} /> Stage 1 — Download &amp; Parse</div>
            HTTP GET to official source URL (OFAC.gov, EU, UN, etc.) → stream to CSV/XML parser → normalise to internal schema. Bottleneck: network latency + file size (OFAC SDN ~15MB XML).
          </div>
          <div className="bg-slate-900 rounded p-2">
            <div className="text-purple-300 font-semibold mb-1 flex items-center gap-1"><Database size={10} /> Stage 2 — DB Insert (Staging + Atomic Swap)</div>
            Bulk INSERT into staging table via TVP (5,000 rows/batch) → MERGE into live table → atomic rename. Zero downtime — live table is never partially updated.
          </div>
          <div className="bg-slate-900 rounded p-2">
            <div className="text-green-300 font-semibold mb-1 flex items-center gap-1"><Cpu size={10} /> Stage 3 — RAM Reload + Phonetic Index</div>
            SELECT all active entries → build token index + Double Metaphone phonetic codes (catches Gaddafi/Qaddafi, Mohammed/Muhammad variants). Screening runs in RAM at &lt;20ms.
          </div>
        </div>
      </div>
    </div>
  )
}
