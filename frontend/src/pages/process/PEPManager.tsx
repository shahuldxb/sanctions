/**
 * PEP Manager — 7-stage pipeline tracker with pause/stop/restart controls
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  RefreshCw, Database, Cpu, Download, CheckCircle, AlertCircle,
  Clock, Zap, Activity, Users, Server, GitMerge, ArrowRight,
  Play, ChevronDown, ChevronUp, Info, Pause, Square, RotateCcw,
  MemoryStick
} from 'lucide-react'

const API = '/api'

// ── Helpers ───────────────────────────────────────────────────────────────────
function bytesLabel(b: number) {
  if (!b) return '—'
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${b} B`
}
function toIST(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', hour12: true,
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}
function fmtMs(ms: number) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}
function fmtNum(n: number) { return n ? n.toLocaleString() : '—' }

// ── Stage definitions ─────────────────────────────────────────────────────────
const STAGES = [
  { key: 'download',  label: 'Download CSV',        icon: Download,    desc: 'Stream OpenSanctions PEP CSV (~180MB)',          expected: 60  },
  { key: 'transform', label: 'Transform',            icon: GitMerge,    desc: 'Reorder columns to match pep_staging schema',    expected: 30  },
  { key: 'bcp',       label: 'BCP Bulk Load',        icon: Server,      desc: 'SQL Server bulk copy into pep_staging (TABLOCK)', expected: 25  },
  { key: 'merge',     label: 'MERGE to Production',  icon: GitMerge,    desc: 'Atomic MERGE pep_staging → pep_entries',         expected: 15  },
  { key: 'audit',     label: 'Audit Log',            icon: Activity,    desc: 'Write timing and row counts to audit_log',       expected: 2   },
  { key: 'mem_table', label: 'In-Memory Table',      icon: MemoryStick, desc: 'Reload pep_entries_mem (SQL In-Memory OLTP)',    expected: 180 },
  { key: 'ram_index', label: 'RAM Index',            icon: Cpu,         desc: 'Build Node.js Token + Double Metaphone + Trigram index', expected: 120 },
]

const STAGE_ORDER = STAGES.map(s => s.key)

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-white', icon: Icon }: any) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-2">
        {Icon && <Icon size={11} />} {label}
      </div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Stage Row ─────────────────────────────────────────────────────────────────
function StageRow({ stage, bcpStatus, timingMs }: {
  stage: typeof STAGES[0]
  bcpStatus: any
  timingMs: number
}) {
  const stageIdx   = STAGE_ORDER.indexOf(stage.key)
  const currentIdx = bcpStatus?.phase ? STAGE_ORDER.indexOf(bcpStatus.phase) : -1
  const overallSt  = bcpStatus?.status ?? 'idle'

  let stStatus: 'idle' | 'active' | 'paused' | 'done' | 'error' = 'idle'
  if (overallSt === 'completed') {
    stStatus = 'done'
  } else if (overallSt === 'error') {
    stStatus = stageIdx < currentIdx ? 'done' : stageIdx === currentIdx ? 'error' : 'idle'
  } else if (overallSt === 'stopped') {
    stStatus = stageIdx < currentIdx ? 'done' : 'idle'
  } else if (overallSt === 'running' || overallSt === 'paused') {
    stStatus = stageIdx < currentIdx ? 'done' : stageIdx === currentIdx ? (overallSt === 'paused' ? 'paused' : 'active') : 'idle'
  }

  // Live elapsed counter
  const [elapsed, setElapsed] = useState(0)
  const isActive = stStatus === 'active' || stStatus === 'paused'
  useEffect(() => {
    if (!isActive || !bcpStatus?.phaseStartedAt) { setElapsed(0); return }
    const update = () => setElapsed(Math.floor((Date.now() - new Date(bcpStatus.phaseStartedAt).getTime()) / 1000))
    update()
    const iv = setInterval(update, 500)
    return () => clearInterval(iv)
  }, [isActive, bcpStatus?.phaseStartedAt])

  const Icon = stage.icon
  const exp  = stage.expected

  const rowCls = {
    idle:   'bg-slate-800/50 border-slate-700 text-slate-400',
    active: 'bg-violet-950/60 border-violet-500 text-white',
    paused: 'bg-amber-950/60 border-amber-500 text-amber-100',
    done:   'bg-emerald-950/40 border-emerald-700/60 text-emerald-200',
    error:  'bg-red-950/60 border-red-600 text-red-200',
  }
  const iconCls = { idle: 'text-slate-600', active: 'text-violet-400', paused: 'text-amber-400', done: 'text-emerald-400', error: 'text-red-400' }
  const badge = {
    idle:   { label: 'WAITING', cls: 'bg-slate-700 text-slate-400' },
    active: { label: 'RUNNING', cls: 'bg-violet-600 text-white animate-pulse' },
    paused: { label: 'PAUSED',  cls: 'bg-amber-600 text-white' },
    done:   { label: 'DONE',    cls: 'bg-emerald-700 text-emerald-100' },
    error:  { label: 'FAILED',  cls: 'bg-red-700 text-red-100' },
  }

  return (
    <div className={`flex items-center gap-4 p-3 rounded-lg border transition-all duration-300 ${rowCls[stStatus]}`}>
      {/* Icon */}
      <Icon size={18} className={`shrink-0 ${iconCls[stStatus]}`} />

      {/* Label */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{stage.label}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${badge[stStatus].cls}`}>
            {badge[stStatus].label}
          </span>
        </div>
        <p className="text-xs opacity-50 mt-0.5 truncate">{stage.desc}</p>
      </div>

      {/* Timing */}
      <div className="text-right shrink-0 w-44">
        {stStatus === 'active' && (
          <div className="space-y-1">
            <div className="text-violet-300 font-mono text-sm font-bold">{elapsed}s elapsed</div>
            <div className="text-slate-500 text-xs">expected ~{exp}s</div>
            <div className="w-full bg-slate-700 rounded-full h-1.5">
              <div
                className="bg-violet-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (elapsed / exp) * 100)}%` }}
              />
            </div>
          </div>
        )}
        {stStatus === 'paused' && (
          <div className="space-y-0.5">
            <div className="text-amber-300 font-mono text-sm font-bold">⏸ {elapsed}s</div>
            <div className="text-slate-500 text-xs">expected ~{exp}s</div>
          </div>
        )}
        {stStatus === 'done' && (
          <div className="space-y-0.5">
            <div className="text-emerald-300 font-mono text-sm font-bold">✓ {timingMs ? fmtMs(timingMs) : '—'}</div>
            <div className="text-slate-500 text-xs">expected ~{exp}s</div>
          </div>
        )}
        {(stStatus === 'idle' || stStatus === 'error') && (
          <div className="text-slate-600 text-xs">~{exp}s expected</div>
        )}
      </div>
    </div>
  )
}

// ── Log panel ─────────────────────────────────────────────────────────────────
function LogPanel({ logs, running, title }: { logs: any[]; running: boolean; title: string }) {
  const [open, setOpen] = useState(true)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open && endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }) }, [logs?.length, open])
  if (!logs?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 border-b border-slate-700 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Zap size={13} className="text-violet-400" />
          {title}
          {running && <span className="flex items-center gap-1 text-xs text-violet-400 animate-pulse"><span className="w-1.5 h-1.5 bg-violet-400 rounded-full inline-block" /> LIVE</span>}
          <span className="text-xs text-slate-500 font-normal">{logs.length} lines</span>
        </div>
        {open ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
      </button>
      {open && (
        <div className="bg-black/70 font-mono text-xs p-3 max-h-72 overflow-y-auto space-y-0.5">
          {logs.map((l: any, i: number) => (
            <div key={i} className={
              l.level === 'error' ? 'text-red-400'
              : l.level === 'warn' ? 'text-amber-300'
              : l.msg?.includes('✓') || l.msg?.includes('complete') ? 'text-emerald-400'
              : 'text-slate-300'
            }>
              <span className="text-slate-600 mr-2 select-none">{toIST(l.ts)}</span>
              {l.msg}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  )
}

// ── Source cards ──────────────────────────────────────────────────────────────
const PEP_SOURCES = [
  { code: 'OPENSANCTIONS_PEP', name: 'OpenSanctions PEP', desc: 'Wikidata + Every Politician + national gazettes', records: '~700K', flag: '🌐', freq: 'Daily',     method: 'BCP'    },
  { code: 'WIKIDATA',          name: 'Wikidata SPARQL',   desc: 'Heads of state, ministers, senior officials',    records: '~50K',  flag: '📚', freq: 'Weekly',    method: 'SPARQL' },
  { code: 'ICIJ',              name: 'ICIJ Offshore Leaks', desc: 'Panama Papers, Pandora Papers, adverse links', records: '~800K', flag: '🔍', freq: 'Quarterly', method: 'API'    },
]

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PEPManager() {
  const [stats,        setStats]        = useState<any>(null)
  const [loadStatus,   setLoadStatus]   = useState<any>(null)
  const [bcpStatus,    setBCPStatus]    = useState<any>(null)
  const [legacyRunning,setLegacyRunning]= useState(false)
  const [ramLoading,   setRamLoading]   = useState(false)
  const [reloadResult, setReloadResult] = useState<any>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [showInfo,     setShowInfo]     = useState(false)
  const [showLogs,     setShowLogs]     = useState(false)
  const [confirmStop,  setConfirmStop]  = useState(false)
  const [actionLoading,setActionLoading]= useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, loadRes, bcpRes] = await Promise.all([
        fetch(`${API}/pep/stats`).then(r => r.json()).catch(() => null),
        fetch(`${API}/pep/load-status`).then(r => r.json()).catch(() => null),
        fetch(`${API}/pep/bcp-status`).then(r => r.json()).catch(() => null),
      ])
      if (statsRes) setStats(statsRes)
      if (loadRes)  setLoadStatus(loadRes)
      if (bcpRes)   setBCPStatus(bcpRes)
    } catch (_) {}
  }, [])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 2000)
    return () => clearInterval(t)
  }, [fetchAll])

  // ── BCP actions ──────────────────────────────────────────────────────────────
  async function handleStart() {
    setActionLoading('start'); setError(null); setReloadResult(null)
    try {
      const r = await fetch(`${API}/pep/bcp-load`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok && !d.error?.includes('already')) throw new Error(d.error)
      setShowLogs(true)
    } catch (e: any) { setError(e.message) }
    finally { setActionLoading(null); fetchAll() }
  }

  async function handlePause() {
    setActionLoading('pause')
    try {
      const r = await fetch(`${API}/pep/bcp-pause`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
    } catch (e: any) { setError(e.message) }
    finally { setActionLoading(null); fetchAll() }
  }

  async function handleResume() {
    setActionLoading('resume')
    try {
      const r = await fetch(`${API}/pep/bcp-resume`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
    } catch (e: any) { setError(e.message) }
    finally { setActionLoading(null); fetchAll() }
  }

  async function handleStop() {
    setConfirmStop(false); setActionLoading('stop')
    try {
      const r = await fetch(`${API}/pep/bcp-stop`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
    } catch (e: any) { setError(e.message) }
    finally { setActionLoading(null); fetchAll() }
  }

  async function handleRestart() {
    setActionLoading('restart'); setError(null)
    try {
      if (isActive) {
        await fetch(`${API}/pep/bcp-stop`, { method: 'POST' }).catch(() => {})
        await new Promise(r => setTimeout(r, 1500))
      }
      const r = await fetch(`${API}/pep/bcp-load`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setShowLogs(true)
    } catch (e: any) { setError(e.message) }
    finally { setActionLoading(null); fetchAll() }
  }

  async function startLegacyLoad() {
    setLegacyRunning(true); setError(null)
    try {
      const r = await fetch(`${API}/pep/load`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok && !d.error?.includes('already')) throw new Error(d.error)
    } catch (e: any) { setError(e.message) }
    finally { setLegacyRunning(false); fetchAll() }
  }

  async function reloadRAM() {
    setRamLoading(true); setReloadResult(null); setError(null)
    try {
      const r = await fetch(`${API}/pep/reload`, { method: 'POST' })
      const d = await r.json()
      setReloadResult({ entries: d.entryCount || d.count || 0, ram_ms: d.loadTimeMs || 0 })
      fetchAll()
    } catch (e: any) { setError(e.message) }
    finally { setRamLoading(false) }
  }

  // ── Derived state ─────────────────────────────────────────────────────────────
  const bcpSt      = bcpStatus?.status ?? 'idle'
  const isActive   = bcpSt === 'running' || bcpSt === 'paused'
  const isRunning  = bcpSt === 'running'
  const isPaused   = bcpSt === 'paused'
  const isIdle     = !isActive && bcpSt !== 'running'
  const isLegacy   = legacyRunning || loadStatus?.status === 'running'
  const anyRunning = isActive || isLegacy

  const timings  = bcpStatus?.timings ?? {}
  const bstats   = bcpStatus?.stats   ?? {}
  const bcpLogs  = bcpStatus?.logs?.slice(-100) ?? []
  const legacyLogs = loadStatus?.recentLogs?.slice(-50) ?? []

  const statusConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
    idle:      { label: 'IDLE',      color: 'text-slate-400',   bg: 'bg-slate-800',   border: 'border-slate-600' },
    running:   { label: 'RUNNING',   color: 'text-violet-300',  bg: 'bg-violet-950',  border: 'border-violet-500' },
    paused:    { label: 'PAUSED',    color: 'text-amber-300',   bg: 'bg-amber-950',   border: 'border-amber-500' },
    completed: { label: 'COMPLETED', color: 'text-emerald-300', bg: 'bg-emerald-950', border: 'border-emerald-600' },
    error:     { label: 'ERROR',     color: 'text-red-300',     bg: 'bg-red-950',     border: 'border-red-600' },
    stopped:   { label: 'STOPPED',   color: 'text-orange-300',  bg: 'bg-orange-950',  border: 'border-orange-600' },
  }
  const sc = statusConfig[bcpSt] ?? statusConfig.idle

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users size={22} className="text-violet-400" /> PEP Data Manager
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            7-stage pipeline: Download → Transform → BCP Load → MERGE → Audit → In-Memory Table → RAM Index
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-4 py-2 rounded-lg border font-mono text-sm font-bold ${sc.bg} ${sc.border} ${sc.color}`}>
            {sc.label}{bcpSt === 'running' && <span className="ml-2 animate-pulse">●</span>}
          </div>
          <button onClick={() => setShowInfo(o => !o)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors">
            <Info size={16} />
          </button>
          <button onClick={fetchAll} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Info panel */}
      {showInfo && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 text-sm text-slate-300 space-y-3">
          <div className="font-semibold text-white flex items-center gap-2"><Info size={14} className="text-violet-400" /> How PEP data flows</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            {[
              { n: 1, icon: Download,    title: 'DB Load (Stages 1–5)',  body: 'BCP Pipeline downloads the OpenSanctions CSV (~180MB) and bulk-loads 700K rows into SQL Server in ~90s.' },
              { n: 2, icon: Database,    title: 'In-Memory Table (Stage 6)', body: 'Copies pep_entries (disk) → pep_entries_mem (SQL Server In-Memory OLTP) for fast reads.' },
              { n: 3, icon: Cpu,         title: 'RAM Index (Stage 7)',   body: 'Reads pep_entries_mem and builds a 3-layer index in Node.js RAM: Token (exact), Double Metaphone (phonetic), and Trigram (structural). Enables sub-20ms fuzzy search with alias expansion.' },
              { n: 4, icon: Zap,         title: 'Ready to Screen',       body: 'Master Screener queries the RAM index directly. 700K PEPs screened in <20ms per request.' },
            ].map(s => (
              <div key={s.n} className="bg-slate-900 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-violet-300 font-semibold"><s.icon size={12} /> Stage {s.n}: {s.title}</div>
                <div className="text-slate-400">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error / success banners */}
      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-700 rounded-xl p-3 text-red-300 text-sm">
          <AlertCircle size={14} className="shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs hover:text-white">✕</button>
        </div>
      )}
      {reloadResult && (
        <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-700 rounded-xl p-3 text-emerald-300 text-sm">
          <CheckCircle size={14} className="shrink-0" />
          RAM index reloaded: <strong>{reloadResult.entries.toLocaleString()}</strong> entries in <strong>{fmtMs(reloadResult.ram_ms)}</strong>
          <button onClick={() => setReloadResult(null)} className="ml-auto text-xs hover:text-white">✕</button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="PEP Engine" icon={Activity}
          value={stats?.totalInRAM ? '● LOADED' : (stats?.isLoading ? `○ LOADING ${stats?.loadProgress?.pct || 0}%` : (stats?.totalInMemTable ? '○ READY TO LOAD' : '○ NOT READY'))}
          color={stats?.totalInRAM ? 'text-emerald-400 text-sm' : (stats?.isLoading ? 'text-cyan-400 text-sm' : 'text-amber-400 text-sm')}
          sub={stats?.loadedAt ? `Updated ${toIST(stats.loadedAt)}` : (stats?.isLoading ? `${(stats?.loadProgress?.loaded || 0).toLocaleString()} / ${(stats?.loadProgress?.total || 703175).toLocaleString()} rows` : 'Click Reload RAM to load')} />
        <StatCard label="Entries in RAM" icon={Cpu}
          value={fmtNum(stats?.totalInRAM ?? 0)} color="text-violet-300"
          sub="Available for screening" />
        <StatCard label="Entries in DB" icon={Database}
          value={fmtNum(stats?.totalInDB ?? 0)} color="text-white"
          sub="Permanent storage" />
        <StatCard label="In-Memory Table" icon={Server}
          value={stats?.totalInMemTable ? `${fmtNum(stats.totalInMemTable)} rows` : '—'} color="text-cyan-300"
          sub="pep_entries_mem (SQL OLTP)" />
      </div>

      {/* Control buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Start (idle/completed/error/stopped) */}
        {!isActive && (
          <button
            onClick={handleStart}
            disabled={!!actionLoading || isLegacy}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors"
          >
            {actionLoading === 'start' ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            {bcpSt === 'idle' ? 'Run BCP Load' : 'Run Again'}
          </button>
        )}

        {/* Pause (running) */}
        {isRunning && (
          <button
            onClick={handlePause}
            disabled={!!actionLoading || bcpStatus?.pauseRequested}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors"
          >
            {actionLoading === 'pause' ? <RefreshCw size={14} className="animate-spin" /> : <Pause size={14} />}
            {bcpStatus?.pauseRequested ? 'Pausing...' : 'Pause'}
          </button>
        )}

        {/* Resume (paused) */}
        {isPaused && (
          <button
            onClick={handleResume}
            disabled={!!actionLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors"
          >
            {actionLoading === 'resume' ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            Resume
          </button>
        )}

        {/* Stop (running or paused) */}
        {isActive && (
          <button
            onClick={() => setConfirmStop(true)}
            disabled={!!actionLoading || bcpStatus?.abortRequested}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors"
          >
            {actionLoading === 'stop' ? <RefreshCw size={14} className="animate-spin" /> : <Square size={14} />}
            {bcpStatus?.abortRequested ? 'Stopping...' : 'Stop'}
          </button>
        )}

        {/* Restart (running or paused) */}
        {isActive && (
          <button
            onClick={handleRestart}
            disabled={!!actionLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors"
          >
            {actionLoading === 'restart' ? <RefreshCw size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            Restart
          </button>
        )}

        {/* Log toggle */}
        <button
          onClick={() => setShowLogs(v => !v)}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors ml-auto"
        >
          📋 {showLogs ? 'Hide Logs' : 'Show Logs'}
          {bcpLogs.length > 0 && <span className="bg-slate-600 text-xs px-1.5 py-0.5 rounded-full">{bcpLogs.length}</span>}
        </button>
      </div>

      {/* Stop confirmation */}
      {confirmStop && (
        <div className="bg-red-950 border border-red-700 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-red-200 font-semibold">Stop the pipeline?</p>
            <p className="text-red-400 text-sm">The current stage will finish first, then the pipeline halts. Data already written to the DB is safe.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setConfirmStop(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">Cancel</button>
            <button onClick={handleStop} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold">Confirm Stop</button>
          </div>
        </div>
      )}

      {/* Error from BCP */}
      {bcpSt === 'error' && bcpStatus?.error && (
        <div className="bg-red-950 border border-red-700 rounded-xl p-4">
          <p className="text-red-300 font-semibold text-sm">❌ Pipeline failed at stage: {bcpStatus.phase}</p>
          <p className="text-red-400 text-xs mt-1 font-mono">{bcpStatus.error}</p>
        </div>
      )}

      {/* 7-stage tracker */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm flex items-center gap-2">
            <Activity size={14} className="text-violet-400" /> Pipeline Stages
          </h2>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {bcpStatus?.startedAt && <span>Started: {toIST(bcpStatus.startedAt)}</span>}
            {bcpSt === 'completed' && bcpStatus?.completedAt && <span className="text-emerald-400">Completed: {toIST(bcpStatus.completedAt)}</span>}
            {timings.total_ms > 0 && <span className="text-violet-300 font-mono font-bold">Total: {fmtMs(timings.total_ms)}</span>}
          </div>
        </div>
        <div className="p-3 space-y-2">
          {STAGES.map(stage => (
            <StageRow
              key={stage.key}
              stage={stage}
              bcpStatus={bcpStatus}
              timingMs={(timings as any)[`${stage.key}_ms`] ?? 0}
            />
          ))}
        </div>

        {/* Completion summary */}
        {bcpSt === 'completed' && (
          <div className="px-4 py-3 border-t border-slate-700 bg-emerald-950/20">
            <div className="flex flex-wrap gap-6 text-sm">
              <div><span className="text-slate-400">Downloaded:</span> <span className="text-white font-mono">{bytesLabel(bstats.downloaded_bytes)}</span></div>
              <div><span className="text-slate-400">Rows staged:</span> <span className="text-white font-mono">{fmtNum(bstats.rows_in_staging)}</span></div>
              <div><span className="text-slate-400">Active entries:</span> <span className="text-white font-mono">{fmtNum(bstats.rows_merged)}</span></div>
              <div><span className="text-slate-400">Added:</span> <span className="text-emerald-300 font-mono">+{fmtNum(bstats.rows_added)}</span></div>
              <div><span className="text-slate-400">Updated:</span> <span className="text-sky-300 font-mono">~{fmtNum(bstats.rows_updated)}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* Row-by-row scraper (fallback) */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="bg-slate-700/30 border-b border-slate-700 px-5 py-3 flex items-center justify-between">
          <div>
            <div className="font-bold text-white flex items-center gap-2">
              <Download size={15} className="text-slate-400" /> Row-by-Row Scraper
              <span className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-normal">Fallback</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">All sources via batch INSERT — slower but more granular</div>
          </div>
          <button
            onClick={startLegacyLoad}
            disabled={anyRunning || isLegacy}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shrink-0"
          >
            {isLegacy ? <><RefreshCw size={14} className="animate-spin" /> Loading...</> : <><Play size={14} /> Load All Sources</>}
          </button>
        </div>
        <div className="p-4 flex flex-wrap gap-2 text-xs text-slate-400">
          {PEP_SOURCES.map(s => (
            <span key={s.code} className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg">
              <span>{s.flag}</span> {s.name} <span className="text-slate-600">({s.records})</span>
            </span>
          ))}
        </div>
      </div>

      {/* RAM Reload */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-white flex items-center gap-2">
              <Cpu size={15} className="text-cyan-400" /> Reload RAM Index
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Rebuilds the Node.js in-memory Token + Double Metaphone + Trigram index from{' '}
              <code className="text-cyan-300">pep_entries_mem</code>.
              Run this after a DB load if screening results seem stale.
            </div>
          </div>
          <button
            onClick={reloadRAM}
            disabled={ramLoading || anyRunning}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-800 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shrink-0"
          >
            {ramLoading ? <><RefreshCw size={14} className="animate-spin" /> Reloading...</> : <><Cpu size={14} /> Reload RAM</>}
          </button>
        </div>
        {/* Progress bar — shown when engine is loading */}
        {(stats?.isLoading || ramLoading) && (() => {
          const prog = stats?.loadProgress || { loaded: 0, total: 703175, pct: 0 }
          const pct  = prog.pct || 0
          const loaded = prog.loaded || 0
          const total  = prog.total  || 703175
          return (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <RefreshCw size={11} className="animate-spin text-cyan-400" />
                  Loading RAM index…
                </span>
                <span className="font-mono text-cyan-300">
                  {loaded.toLocaleString()} / {total.toLocaleString()} rows ({pct}%)
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-cyan-600 to-violet-500 transition-all duration-500"
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
              {pct > 0 && pct < 100 && (
                <div className="text-xs text-slate-500">
                  Estimated time remaining:{' '}
                  {total > 0 && loaded > 0
                    ? (() => {
                        const remaining = total - loaded
                        const ratePerSec = loaded / ((Date.now() - (stats?.loadStartedAt || Date.now())) / 1000 || 1)
                        const secsLeft = ratePerSec > 0 ? Math.round(remaining / ratePerSec) : null
                        if (!secsLeft || secsLeft > 7200) return '~30 min'
                        if (secsLeft > 60) return `~${Math.round(secsLeft / 60)} min`
                        return `~${secsLeft}s`
                      })()
                    : '~30 min'
                  }
                </div>
              )}
              {pct === 100 && (
                <div className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle size={11} /> Index fully loaded — {total.toLocaleString()} entries ready for screening
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Logs */}
      {showLogs && <LogPanel logs={bcpLogs} running={isRunning} title="BCP Pipeline Log" />}
      {isLegacy && <LogPanel logs={legacyLogs} running={isLegacy} title="Scraper Log" />}

      {/* Data sources */}
      <div>
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3">Data Sources</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PEP_SOURCES.map(src => {
            const dbRow = stats?.bySource?.find((b: any) =>
              b.source === src.code || b.source.toLowerCase().includes(src.code.toLowerCase().split('_')[0])
            )
            const integrated = src.method === 'BCP'
            return (
              <div key={src.code} className={`bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3 ${!integrated ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl leading-none">{src.flag}</span>
                    <div>
                      <div className="font-bold text-white text-sm">{src.name}</div>
                      <div className="text-slate-400 text-xs mt-0.5">{src.desc}</div>
                    </div>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${src.method === 'BCP' ? 'bg-violet-900 text-violet-300' : 'bg-slate-700 text-slate-400'}`}>
                    {src.method}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900 rounded-lg p-2"><div className="text-slate-500 mb-0.5">Expected</div><div className="text-white font-bold">{src.records}</div></div>
                  <div className="bg-slate-900 rounded-lg p-2"><div className="text-slate-500 mb-0.5">In DB</div><div className="text-emerald-400 font-bold">{fmtNum(dbRow?.cnt ?? 0)}</div></div>
                  <div className="bg-slate-900 rounded-lg p-2"><div className="text-slate-500 mb-0.5">Update Freq</div><div className="text-violet-300">{src.freq}</div></div>
                  <div className="bg-slate-900 rounded-lg p-2"><div className="text-slate-500 mb-0.5">With Position</div><div className="text-slate-300">{fmtNum(dbRow?.with_position ?? 0)}</div></div>
                </div>
                {dbRow && (
                  <div className="text-xs space-y-1.5 pt-1 border-t border-slate-700">
                    <div className="flex justify-between text-slate-500"><span>With Wikidata ID</span><span className="text-blue-400 font-medium">{fmtNum(dbRow.with_wikidata)}</span></div>
                    <div className="flex justify-between text-slate-500"><span>With Adverse Links</span><span className="text-amber-400 font-medium">{fmtNum(dbRow.with_adverse_links)}</span></div>
                    <div className="flex justify-between text-slate-500"><span>With Date of Birth</span><span className="text-emerald-400 font-medium">{fmtNum(dbRow.with_dob)}</span></div>
                  </div>
                )}
                {!integrated && <div className="text-xs text-slate-500 italic pt-1 border-t border-slate-700">Not yet integrated</div>}
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
