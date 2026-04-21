/**
 * PEP Manager — 3 source cards at top + 7-stage BCP pipeline tracker
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  RefreshCw, Database, Cpu, Download, CheckCircle, AlertCircle,
  Clock, Zap, Activity, Users, Server, GitMerge, ArrowRight,
  Play, ChevronDown, ChevronUp, Info, Pause, Square, RotateCcw,
  MemoryStick, Globe, BookOpen, Search
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
function fmtNum(n: number | null | undefined) { return n ? n.toLocaleString() : '—' }

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

// ── Stage Row ─────────────────────────────────────────────────────────────────
function StageRow({ stage, bcpStatus, timingMs }: { stage: typeof STAGES[0]; bcpStatus: any; timingMs: number }) {
  const stageIdx   = STAGE_ORDER.indexOf(stage.key)
  const currentIdx = bcpStatus?.phase ? STAGE_ORDER.indexOf(bcpStatus.phase) : -1
  const overallSt  = bcpStatus?.status ?? 'idle'

  let stStatus: 'idle' | 'active' | 'paused' | 'done' | 'error' = 'idle'
  if (overallSt === 'completed') stStatus = 'done'
  else if (overallSt === 'error') stStatus = stageIdx < currentIdx ? 'done' : stageIdx === currentIdx ? 'error' : 'idle'
  else if (overallSt === 'stopped') stStatus = stageIdx < currentIdx ? 'done' : 'idle'
  else if (overallSt === 'running' || overallSt === 'paused')
    stStatus = stageIdx < currentIdx ? 'done' : stageIdx === currentIdx ? (overallSt === 'paused' ? 'paused' : 'active') : 'idle'

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
  const rowCls = { idle: 'bg-slate-800/50 border-slate-700 text-slate-400', active: 'bg-violet-950/60 border-violet-500 text-white', paused: 'bg-amber-950/60 border-amber-500 text-amber-100', done: 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200', error: 'bg-red-950/60 border-red-600 text-red-200' }
  const iconCls = { idle: 'text-slate-600', active: 'text-violet-400', paused: 'text-amber-400', done: 'text-emerald-400', error: 'text-red-400' }
  const badge = { idle: { label: 'WAITING', cls: 'bg-slate-700 text-slate-400' }, active: { label: 'RUNNING', cls: 'bg-violet-600 text-white animate-pulse' }, paused: { label: 'PAUSED', cls: 'bg-amber-600 text-white' }, done: { label: 'DONE', cls: 'bg-emerald-700 text-emerald-100' }, error: { label: 'FAILED', cls: 'bg-red-700 text-red-100' } }

  return (
    <div className={`flex items-center gap-4 p-3 rounded-lg border transition-all duration-300 ${rowCls[stStatus]}`}>
      <Icon size={18} className={`shrink-0 ${iconCls[stStatus]}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{stage.label}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${badge[stStatus].cls}`}>{badge[stStatus].label}</span>
        </div>
        <p className="text-xs opacity-50 mt-0.5 truncate">{stage.desc}</p>
      </div>
      <div className="text-right shrink-0 w-44">
        {stStatus === 'active' && (<div className="space-y-1"><div className="text-violet-300 font-mono text-sm font-bold">{elapsed}s elapsed</div><div className="text-slate-500 text-xs">expected ~{exp}s</div><div className="w-full bg-slate-700 rounded-full h-1.5"><div className="bg-violet-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (elapsed / exp) * 100)}%` }} /></div></div>)}
        {stStatus === 'paused' && (<div className="space-y-0.5"><div className="text-amber-300 font-mono text-sm font-bold">⏸ {elapsed}s</div><div className="text-slate-500 text-xs">expected ~{exp}s</div></div>)}
        {stStatus === 'done' && (<div className="space-y-0.5"><div className="text-emerald-300 font-mono text-sm font-bold">✓ {timingMs ? fmtMs(timingMs) : '—'}</div><div className="text-slate-500 text-xs">expected ~{exp}s</div></div>)}
        {(stStatus === 'idle' || stStatus === 'error') && (<div className="text-slate-600 text-xs">~{exp}s expected</div>)}
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
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2.5 border-b border-slate-700 hover:bg-slate-800/50 transition-colors">
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
            <div key={i} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-300' : l.msg?.includes('✓') || l.msg?.includes('complete') ? 'text-emerald-400' : 'text-slate-300'}>
              <span className="text-slate-600 mr-2 select-none">{toIST(l.ts)}</span>{l.msg}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  )
}

// ── Source Card ───────────────────────────────────────────────────────────────
function SourceCard({
  title, desc, icon: Icon, badge: badgeLabel, badgeCls,
  accentCls, borderCls,
  stats, extraStats,
  loadStatus, loadProgress, loadLogs,
  onLoad, onReloadRAM,
  loadBtnLabel, loadBtnCls,
  ramLoading, ramProgress,
}: any) {
  const isRunning  = loadStatus === 'running'
  const isDone     = loadStatus === 'completed'
  const isError    = loadStatus === 'error'
  const pct        = loadProgress?.pct ?? 0
  const loaded     = loadProgress?.loaded ?? 0
  const total      = loadProgress?.total ?? 0
  const lastLog    = loadLogs?.slice(-1)[0]?.msg ?? ''

  return (
    <div className={`bg-slate-800 border rounded-xl p-4 space-y-3 ${borderCls}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Icon size={20} className={accentCls} />
          <div>
            <div className="font-bold text-white text-sm">{title}</div>
            <div className="text-slate-400 text-xs mt-0.5">{desc}</div>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded font-mono shrink-0 ${badgeCls}`}>{badgeLabel}</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {stats.map((s: any) => (
          <div key={s.label} className="bg-slate-900 rounded-lg p-2">
            <div className="text-slate-500 mb-0.5">{s.label}</div>
            <div className={`font-bold ${s.color ?? 'text-white'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Extra detail rows */}
      {extraStats && extraStats.length > 0 && (
        <div className="text-xs space-y-1.5 pt-1 border-t border-slate-700">
          {extraStats.map((s: any) => (
            <div key={s.label} className="flex justify-between text-slate-500">
              <span>{s.label}</span>
              <span className={s.color ?? 'text-slate-300'}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Progress bar when loading */}
      {isRunning && (
        <div className="space-y-1.5 pt-1 border-t border-slate-700">
          <div className="flex justify-between text-xs text-slate-400">
            <span className={`${accentCls} font-medium animate-pulse`}>● LOADING</span>
            <span className="font-mono">{loaded.toLocaleString()} / {total > 0 ? total.toLocaleString() : '?'} ({pct}%)</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 1)}%`, background: `var(--progress-gradient)` }} />
          </div>
          {lastLog && <div className="text-xs text-slate-500 truncate">{lastLog}</div>}
        </div>
      )}

      {/* RAM reload progress */}
      {ramLoading && (
        <div className="space-y-1.5 pt-1 border-t border-slate-700">
          <div className="flex justify-between text-xs text-slate-400">
            <span className="text-cyan-400 font-medium animate-pulse">⟳ Reloading RAM…</span>
            <span className="font-mono">{(ramProgress?.loaded ?? 0).toLocaleString()} / {(ramProgress?.total ?? 0).toLocaleString()} ({ramProgress?.pct ?? 0}%)</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-violet-500 transition-all duration-500" style={{ width: `${Math.max(ramProgress?.pct ?? 0, 1)}%` }} />
          </div>
        </div>
      )}

      {/* Completed */}
      {isDone && (
        <div className="text-xs text-emerald-400 flex items-center gap-1 pt-1 border-t border-slate-700">
          <CheckCircle size={11} /> Load completed
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="text-xs text-red-400 pt-1 border-t border-slate-700">
          ✗ Load failed
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1 border-t border-slate-700">
        <button
          onClick={onLoad}
          disabled={isRunning}
          className={`flex-1 text-xs py-2 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
            isRunning ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : `${loadBtnCls} text-white cursor-pointer`
          }`}
        >
          {isRunning
            ? <><RefreshCw size={11} className="animate-spin" /> Loading...</>
            : isDone
              ? <><RotateCcw size={11} /> Reload Data</>
              : <><Play size={11} /> {loadBtnLabel}</>
          }
        </button>
        <button
          onClick={onReloadRAM}
          disabled={ramLoading || isRunning}
          title="Reload only this source's entries into RAM index"
          className="text-xs py-2 px-3 rounded-lg font-medium transition-all flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-cyan-300 cursor-pointer"
        >
          <Cpu size={11} /> RAM
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PEPManager() {
  const [stats,          setStats]          = useState<any>(null)
  const [loadStatus,     setLoadStatus]     = useState<any>(null)
  const [bcpStatus,      setBCPStatus]      = useState<any>(null)
  const [wikidataStatus, setWikidataStatus] = useState<any>(null)
  const [icijStatus,     setICIJStatus]     = useState<any>(null)
  const [legacyRunning,  setLegacyRunning]  = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [showInfo,       setShowInfo]       = useState(false)
  const [showLogs,       setShowLogs]       = useState(false)
  const [confirmStop,    setConfirmStop]    = useState(false)
  const [actionLoading,  setActionLoading]  = useState<string | null>(null)
  // Per-source RAM reload state
  const [ramReloading,   setRamReloading]   = useState<Record<string, boolean>>({})
  const [ramProgress,    setRamProgress]    = useState<Record<string, any>>({})

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, loadRes, bcpRes, wdRes, icijRes] = await Promise.all([
        fetch(`${API}/pep/stats`).then(r => r.json()).catch(() => null),
        fetch(`${API}/pep/load-status`).then(r => r.json()).catch(() => null),
        fetch(`${API}/pep/bcp-status`).then(r => r.json()).catch(() => null),
        fetch(`${API}/pep/wikidata-status`).then(r => r.json()).catch(() => null),
        fetch(`${API}/pep/icij-status`).then(r => r.json()).catch(() => null),
      ])
      if (statsRes) setStats(statsRes)
      if (loadRes)  setLoadStatus(loadRes)
      if (bcpRes)   setBCPStatus(bcpRes)
      if (wdRes)    setWikidataStatus(wdRes)
      if (icijRes)  setICIJStatus(icijRes)
    } catch (_) {}
  }, [])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 2000)
    return () => clearInterval(t)
  }, [fetchAll])

  // ── BCP actions ──────────────────────────────────────────────────────────────
  async function handleStart() {
    setActionLoading('start'); setError(null)
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
    try { const r = await fetch(`${API}/pep/bcp-pause`, { method: 'POST' }); const d = await r.json(); if (!r.ok) throw new Error(d.error) }
    catch (e: any) { setError(e.message) }
    finally { setActionLoading(null); fetchAll() }
  }
  async function handleResume() {
    setActionLoading('resume')
    try { const r = await fetch(`${API}/pep/bcp-resume`, { method: 'POST' }); const d = await r.json(); if (!r.ok) throw new Error(d.error) }
    catch (e: any) { setError(e.message) }
    finally { setActionLoading(null); fetchAll() }
  }
  async function handleStop() {
    setConfirmStop(false); setActionLoading('stop')
    try { const r = await fetch(`${API}/pep/bcp-stop`, { method: 'POST' }); const d = await r.json(); if (!r.ok) throw new Error(d.error) }
    catch (e: any) { setError(e.message) }
    finally { setActionLoading(null); fetchAll() }
  }
  async function handleRestart() {
    setActionLoading('restart'); setError(null)
    try {
      if (isActive) { await fetch(`${API}/pep/bcp-stop`, { method: 'POST' }).catch(() => {}); await new Promise(r => setTimeout(r, 1500)) }
      const r = await fetch(`${API}/pep/bcp-load`, { method: 'POST' }); const d = await r.json()
      if (!r.ok) throw new Error(d.error); setShowLogs(true)
    } catch (e: any) { setError(e.message) }
    finally { setActionLoading(null); fetchAll() }
  }
  async function startLegacyLoad() {
    setLegacyRunning(true); setError(null)
    try { const r = await fetch(`${API}/pep/load`, { method: 'POST' }); const d = await r.json(); if (!r.ok && !d.error?.includes('already')) throw new Error(d.error) }
    catch (e: any) { setError(e.message) }
    finally { setLegacyRunning(false); fetchAll() }
  }

  // ── Source-specific RAM reload ────────────────────────────────────────────────
  async function reloadSourceRAM(source: string) {
    setRamReloading(prev => ({ ...prev, [source]: true }))
    setRamProgress(prev => ({ ...prev, [source]: { loaded: 0, total: 0, pct: 0 } }))
    setError(null)
    try {
      const r = await fetch(`${API}/pep/reload-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'RAM reload failed')
      // Poll progress from stats endpoint
      const poll = setInterval(async () => {
        try {
          const st = await fetch(`${API}/pep/stats`).then(r => r.json())
          if (st) setStats(st)
          // Check if loading is done
          if (!st?.isLoading) {
            clearInterval(poll)
            setRamReloading(prev => ({ ...prev, [source]: false }))
          }
        } catch (_) {}
      }, 1500)
      setTimeout(() => { clearInterval(poll); setRamReloading(prev => ({ ...prev, [source]: false })) }, 120000)
    } catch (e: any) {
      setError(e.message)
      setRamReloading(prev => ({ ...prev, [source]: false }))
    }
  }

  async function startWikidataLoad() {
    setError(null)
    try { const r = await fetch(`${API}/pep/wikidata-load`, { method: 'POST' }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to start Wikidata load'); fetchAll() }
    catch (e: any) { setError(e.message) }
  }
  async function startICIJLoad() {
    setError(null)
    try { const r = await fetch(`${API}/pep/icij-load`, { method: 'POST' }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed to start ICIJ load'); fetchAll() }
    catch (e: any) { setError(e.message) }
  }

  // ── Derived state ─────────────────────────────────────────────────────────────
  const bcpSt      = bcpStatus?.status ?? 'idle'
  const isActive   = bcpSt === 'running' || bcpSt === 'paused'
  const isRunning  = bcpSt === 'running'
  const isPaused   = bcpSt === 'paused'
  const isLegacy   = legacyRunning || loadStatus?.status === 'running'
  const anyRunning = isActive || isLegacy
  const timings    = bcpStatus?.timings ?? {}
  const bstats     = bcpStatus?.stats   ?? {}
  const bcpLogs    = bcpStatus?.logs?.slice(-100) ?? []
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

  // Per-source DB stats
  const osRow  = stats?.bySource?.find((b: any) => b.source === 'OPENSANCTIONS_PEP')
  const wdRow  = stats?.bySource?.find((b: any) => b.source === 'WIKIDATA')
  const icRow  = stats?.bySource?.find((b: any) => b.source === 'ICIJ')

  const wdSt      = wikidataStatus?.status ?? 'idle'
  const wdProg    = wikidataStatus?.progress ?? {}
  const wdLogs    = wikidataStatus?.logs ?? []

  const icSt      = icijStatus?.status ?? 'idle'
  const icProg    = icijStatus?.progress ?? {}
  const icLogs    = icijStatus?.logs ?? []

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users size={22} className="text-violet-400" /> PEP Data Manager
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Load and manage PEP data from 3 independent sources — each with its own pipeline and RAM index
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowInfo(o => !o)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors">
            <Info size={16} />
          </button>
          <button onClick={fetchAll} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-700 rounded-xl p-3 text-red-300 text-sm">
          <AlertCircle size={14} className="shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs hover:text-white">✕</button>
        </div>
      )}

      {/* ── DATA SOURCES — TOP ── */}
      <div>
        <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
          <Database size={12} /> Data Sources
          <span className="text-slate-600 font-normal normal-case tracking-normal">— click Load to import, RAM to reload index for that source only</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* OpenSanctions */}
          <div style={{ '--progress-gradient': 'linear-gradient(90deg, #7c3aed, #a855f7)' } as any}>
            <SourceCard
              title="OpenSanctions PEP"
              desc="Wikidata + Every Politician + national gazettes"
              icon={Globe}
              badge="BCP"
              badgeCls="bg-violet-900 text-violet-300"
              accentCls="text-violet-400"
              borderCls="border-violet-900/50"
              stats={[
                { label: 'Expected',    value: '~700K',                     color: 'text-white' },
                { label: 'In DB',       value: fmtNum(osRow?.cnt),          color: 'text-emerald-400' },
                { label: 'Update Freq', value: 'Daily',                     color: 'text-violet-300' },
                { label: 'With Position', value: fmtNum(osRow?.with_position), color: 'text-slate-300' },
              ]}
              extraStats={[
                { label: 'With Wikidata ID',  value: fmtNum(osRow?.with_wikidata),      color: 'text-blue-400 font-medium' },
                { label: 'With Adverse Links', value: fmtNum(osRow?.with_adverse_links), color: 'text-amber-400 font-medium' },
                { label: 'With Date of Birth', value: fmtNum(osRow?.with_dob),           color: 'text-emerald-400 font-medium' },
              ]}
              loadStatus={bcpSt}
              loadProgress={null}
              loadLogs={[]}
              onLoad={handleStart}
              onReloadRAM={() => reloadSourceRAM('OPENSANCTIONS_PEP')}
              loadBtnLabel="Run BCP Pipeline"
              loadBtnCls="bg-violet-600 hover:bg-violet-500"
              ramLoading={!!ramReloading['OPENSANCTIONS_PEP']}
              ramProgress={ramProgress['OPENSANCTIONS_PEP']}
            />
          </div>

          {/* Wikidata */}
          <div style={{ '--progress-gradient': 'linear-gradient(90deg, #2563eb, #7c3aed)' } as any}>
            <SourceCard
              title="Wikidata SPARQL"
              desc="Heads of state, ministers, senior officials"
              icon={BookOpen}
              badge="SPARQL"
              badgeCls="bg-blue-900 text-blue-300"
              accentCls="text-blue-400"
              borderCls="border-blue-900/50"
              stats={[
                { label: 'Expected',    value: '~50K',                color: 'text-white' },
                { label: 'In DB',       value: fmtNum(wdRow?.cnt),    color: 'text-emerald-400' },
                { label: 'Update Freq', value: 'Weekly',              color: 'text-blue-300' },
                { label: 'Queries',     value: '5 SPARQL',            color: 'text-slate-300' },
              ]}
              extraStats={[
                { label: 'With Position',  value: fmtNum(wdRow?.with_position), color: 'text-blue-400 font-medium' },
                { label: 'With Wikidata ID', value: fmtNum(wdRow?.with_wikidata), color: 'text-violet-400 font-medium' },
                { label: 'With Date of Birth', value: fmtNum(wdRow?.with_dob), color: 'text-emerald-400 font-medium' },
              ]}
              loadStatus={wdSt}
              loadProgress={wdProg}
              loadLogs={wdLogs}
              onLoad={startWikidataLoad}
              onReloadRAM={() => reloadSourceRAM('WIKIDATA')}
              loadBtnLabel="Load Wikidata SPARQL"
              loadBtnCls="bg-blue-600 hover:bg-blue-500"
              ramLoading={!!ramReloading['WIKIDATA']}
              ramProgress={ramProgress['WIKIDATA']}
            />
          </div>

          {/* ICIJ */}
          <div style={{ '--progress-gradient': 'linear-gradient(90deg, #d97706, #ef4444)' } as any}>
            <SourceCard
              title="ICIJ Offshore Leaks"
              desc="Panama Papers, Pandora Papers, adverse links"
              icon={Search}
              badge="API"
              badgeCls="bg-amber-900 text-amber-300"
              accentCls="text-amber-400"
              borderCls="border-amber-900/50"
              stats={[
                { label: 'Expected',    value: '~800K',               color: 'text-white' },
                { label: 'In DB',       value: fmtNum(icRow?.cnt),    color: 'text-emerald-400' },
                { label: 'Update Freq', value: 'Quarterly',           color: 'text-amber-300' },
                { label: 'Datasets',    value: '5 leaks',             color: 'text-slate-300' },
              ]}
              extraStats={[
                { label: 'With Adverse Links', value: fmtNum(icRow?.with_adverse_links), color: 'text-amber-400 font-medium' },
                { label: 'With Countries',     value: fmtNum(icRow?.with_countries),     color: 'text-blue-400 font-medium' },
                { label: 'With Dataset Tag',   value: fmtNum(icRow?.with_dataset),       color: 'text-emerald-400 font-medium' },
              ]}
              loadStatus={icSt}
              loadProgress={icProg}
              loadLogs={icLogs}
              onLoad={startICIJLoad}
              onReloadRAM={() => reloadSourceRAM('ICIJ')}
              loadBtnLabel="Load ICIJ Offshore Leaks"
              loadBtnCls="bg-amber-700 hover:bg-amber-600"
              ramLoading={!!ramReloading['ICIJ']}
              ramProgress={ramProgress['ICIJ']}
            />
          </div>

        </div>
      </div>

      {/* ── OVERALL RAM STATUS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total in RAM',       value: fmtNum(stats?.totalInRAM ?? 0),        color: 'text-violet-300', icon: Cpu,      sub: 'Available for screening' },
          { label: 'Total in DB',        value: fmtNum(stats?.totalInDB ?? 0),          color: 'text-white',      icon: Database, sub: 'All active entries' },
          { label: 'In-Memory Table',    value: stats?.totalInMemTable ? `${fmtNum(stats.totalInMemTable)} rows` : '—', color: 'text-cyan-300', icon: Server, sub: 'pep_entries_mem (SQL OLTP)' },
          { label: 'RAM Engine',         value: stats?.totalInRAM ? '● LOADED' : (stats?.isLoading ? `○ ${stats?.loadProgress?.pct ?? 0}%` : '○ IDLE'), color: stats?.totalInRAM ? 'text-emerald-400 text-sm' : (stats?.isLoading ? 'text-cyan-400 text-sm' : 'text-amber-400 text-sm'), icon: Activity, sub: stats?.loadedAt ? `Updated ${toIST(stats.loadedAt)}` : 'Not loaded' },
        ].map(s => (
          <div key={s.label} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-2"><s.icon size={11} /> {s.label}</div>
            <div className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── OpenSanctions BCP Pipeline ── */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm flex items-center gap-2">
            <Activity size={14} className="text-violet-400" /> OpenSanctions BCP Pipeline
            <div className={`px-3 py-1 rounded-lg border font-mono text-xs font-bold ${sc.bg} ${sc.border} ${sc.color}`}>
              {sc.label}{bcpSt === 'running' && <span className="ml-1 animate-pulse">●</span>}
            </div>
          </h2>
          <div className="flex items-center gap-2">
            {!isActive && (
              <button onClick={handleStart} disabled={!!actionLoading || isLegacy}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition-colors">
                {actionLoading === 'start' ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                {bcpSt === 'idle' ? 'Run BCP Load' : 'Run Again'}
              </button>
            )}
            {isRunning && (
              <button onClick={handlePause} disabled={!!actionLoading || bcpStatus?.pauseRequested}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs transition-colors">
                <Pause size={12} /> {bcpStatus?.pauseRequested ? 'Pausing...' : 'Pause'}
              </button>
            )}
            {isPaused && (
              <button onClick={handleResume} disabled={!!actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs transition-colors">
                <Play size={12} /> Resume
              </button>
            )}
            {isActive && (
              <>
                <button onClick={() => setConfirmStop(true)} disabled={!!actionLoading || bcpStatus?.abortRequested}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-xs transition-colors">
                  <Square size={12} /> {bcpStatus?.abortRequested ? 'Stopping...' : 'Stop'}
                </button>
                <button onClick={handleRestart} disabled={!!actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-lg text-xs transition-colors">
                  <RotateCcw size={12} /> Restart
                </button>
              </>
            )}
            <button onClick={() => setShowLogs(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs transition-colors">
              📋 {showLogs ? 'Hide' : 'Logs'}
              {bcpLogs.length > 0 && <span className="bg-slate-600 text-xs px-1 py-0.5 rounded-full">{bcpLogs.length}</span>}
            </button>
          </div>
        </div>

        {confirmStop && (
          <div className="bg-red-950 border-b border-red-700 px-4 py-3 flex items-center justify-between gap-4">
            <div><p className="text-red-200 font-semibold text-sm">Stop the pipeline?</p><p className="text-red-400 text-xs">The current stage will finish first. Data already written is safe.</p></div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setConfirmStop(false)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs">Cancel</button>
              <button onClick={handleStop} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold">Confirm Stop</button>
            </div>
          </div>
        )}

        {bcpSt === 'error' && bcpStatus?.error && (
          <div className="bg-red-950 border-b border-red-700 px-4 py-3">
            <p className="text-red-300 font-semibold text-xs">❌ Failed at stage: {bcpStatus.phase}</p>
            <p className="text-red-400 text-xs mt-1 font-mono">{bcpStatus.error}</p>
          </div>
        )}

        <div className="p-3 space-y-2">
          {STAGES.map(stage => (
            <StageRow key={stage.key} stage={stage} bcpStatus={bcpStatus} timingMs={(timings as any)[`${stage.key}_ms`] ?? 0} />
          ))}
        </div>

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

        {(bcpStatus?.startedAt || bcpSt === 'completed') && (
          <div className="px-4 py-2 border-t border-slate-700 flex gap-6 text-xs text-slate-500">
            {bcpStatus?.startedAt && <span>Started: {toIST(bcpStatus.startedAt)}</span>}
            {bcpSt === 'completed' && bcpStatus?.completedAt && <span className="text-emerald-400">Completed: {toIST(bcpStatus.completedAt)}</span>}
            {timings.total_ms > 0 && <span className="text-violet-300 font-mono font-bold">Total: {fmtMs(timings.total_ms)}</span>}
          </div>
        )}
      </div>

      {/* Logs */}
      {showLogs && <LogPanel logs={bcpLogs} running={isRunning} title="BCP Pipeline Log" />}
      {isLegacy  && <LogPanel logs={legacyLogs} running={isLegacy} title="Scraper Log" />}

    </div>
  )
}
