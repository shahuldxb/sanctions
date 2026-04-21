import React, { useEffect, useState, useRef, useCallback } from 'react'
import { api } from '../../api'
import { Badge, Spinner, PageHeader, StatCard, ProgressBar, Field } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Download, Play, Square, RefreshCw, Terminal, Clock, Database, Wifi, WifiOff, Globe, AlertCircle, Timer, Trash2, MemoryStick } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Scraper Control',
  entities: [{
    name: 'scraper_runs', description: 'Sanctions list scraper execution history and live monitoring',
    fields: [
      { name: 'source_code', type: 'varchar(20)', description: 'Source: OFAC | EU | UN | UK | SECO | DFAT | MAS' },
      { name: 'status', type: 'enum', description: 'RUNNING | SUCCESS | FAILED' },
      { name: 'records_added', type: 'int', description: 'New records added in this run' },
      { name: 'records_updated', type: 'int', description: 'Records updated in this run' },
      { name: 'duration_seconds', type: 'int', description: 'Run duration in seconds' },
    ]
  }]
}

const SOURCES = [
  { code: 'OFAC', name: 'OFAC SDN',           flag: '🇺🇸' },
  { code: 'EU',   name: 'EU Sanctions',        flag: '🇪🇺' },
  { code: 'UN',   name: 'UN Security Council', flag: '🇺🇳' },
  { code: 'UK',   name: 'UK OFSI',             flag: '🇬🇧' },
  { code: 'SECO', name: 'SECO Switzerland',    flag: '🇨🇭' },
  { code: 'DFAT', name: 'DFAT Australia',      flag: '🇦🇺' },
  { code: 'MAS',  name: 'MAS Singapore',       flag: '🇸🇬' },
  { code: 'BIS',  name: 'BIS Entity List',     flag: '🇺🇸' },
]

function fmtElapsed(sec: number | null | undefined): string {
  if (sec == null || sec < 0) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

/** Format UTC ISO string as IST date+time */
function toIST(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  })
}

/** Current IST time string for log prefixes */
function nowIST(): string {
  return new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  })
}

function useLiveTimer(startedAt: string | null): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAt) { setElapsed(0); return }
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [startedAt])
  return elapsed
}

function LiveClockCard() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])
  const timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  const dateStr = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
  return (
    <div className="card p-4 flex flex-col justify-center">
      <div className="text-2xl font-mono font-bold text-slate-200 tracking-tight">{timeStr}</div>
      <div className="text-xs text-slate-500 mt-0.5">{dateStr} • IST</div>
    </div>
  )
}

function SourceCard({ src, st, isRunning, onRun, onStop, onToggleLogs, showingLogs, onClearMem, onLoadMem }: {
  src: typeof SOURCES[0]
  st: any
  isRunning: boolean
  onRun: () => void
  onStop: () => void
  onToggleLogs: () => void
  showingLogs: boolean
  onClearMem: () => void
  onLoadMem: () => void
}) {
  const liveElapsed = useLiveTimer(isRunning ? (st.run_started_at || null) : null)

  const statusLabel = isRunning ? '● RUNNING' : (st.last_run_status || 'IDLE')
  const statusColor = isRunning
    ? 'text-blue-400'
    : st.last_run_status === 'SUCCESS' ? 'text-green-400'
    : st.last_run_status === 'FAILED'  ? 'text-red-400'
    : 'text-slate-400'
  const cardBorder = isRunning
    ? 'border-blue-500/60 bg-blue-900/5'
    : st.last_run_status === 'FAILED'  ? 'border-red-600/40'
    : st.last_run_status === 'SUCCESS' ? 'border-green-600/30'
    : 'border-slate-700'

  return (
    <div className={`card border transition-all ${cardBorder}`}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{src.flag}</span>
            <div>
              <div className="text-sm font-semibold text-white">{src.code}</div>
              <div className="text-xs text-slate-500">{src.name}</div>
            </div>
          </div>
          {isRunning ? (
            <button onClick={onStop} className="p-1.5 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50" title="Stop">
              <Square size={12} />
            </button>
          ) : (
            <button onClick={onRun} className="p-1.5 bg-blue-900/30 text-blue-400 rounded hover:bg-blue-900/50" title="Run">
              <Play size={12} />
            </button>
          )}
        </div>
        {isRunning && <ProgressBar pct={st.progress || 0} label={`${st.progress || 0}%`} />}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2 text-xs">
          <div>
            <div className="text-slate-500 mb-0.5">Status</div>
            <div className={`font-medium ${statusColor}`}>{statusLabel}</div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5 flex items-center gap-1"><Timer size={9} /> Elapsed</div>
            <div className={`font-mono font-semibold ${isRunning ? 'text-blue-300 animate-pulse' : 'text-slate-300'}`}>
              {isRunning ? fmtElapsed(liveElapsed) : fmtElapsed(st.last_elapsed_seconds)}
            </div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5">Records</div>
            <div className="text-slate-300">
              {(st.total_entries ?? st.last_records)?.toLocaleString() || '—'}
            </div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5">Last Run</div>
            <div className="text-slate-400 text-[10px] leading-tight">
              {st.last_run_at ? toIST(st.last_run_at) : 'Never'}
            </div>
          </div>
        </div>
        {/* In-Memory Table & RAM counts */}
        <div className="mt-2 border-t border-slate-700/50 pt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <div>
            <div className="text-slate-500 mb-0.5 flex items-center gap-1"><Database size={9} /> In-Mem Table</div>
            <div className={`font-mono font-semibold ${(st.in_mem_count || 0) > 0 ? 'text-cyan-400' : 'text-slate-500'}`}>
              {(st.in_mem_count || 0) > 0 ? (st.in_mem_count || 0).toLocaleString() : '—'}
            </div>
          </div>
          <div>
            <div className="text-slate-500 mb-0.5 flex items-center gap-1"><MemoryStick size={9} /> RAM Index</div>
            <div className={`font-mono font-semibold ${(st.in_ram_count || 0) > 0 ? 'text-violet-400' : 'text-slate-500'}`}>
              {(st.in_ram_count || 0) > 0 ? (st.in_ram_count || 0).toLocaleString() : '—'}
            </div>
          </div>
        </div>

        {!isRunning && st.last_run_status === 'FAILED' && st.error_message && (
          <div className="mt-2 flex items-start gap-1 text-xs text-red-300 bg-red-900/20 rounded p-1.5">
            <AlertCircle size={10} className="mt-0.5 shrink-0" />
            <span className="truncate">{st.error_message}</span>
          </div>
        )}

        {/* Action row: logs + clear buttons */}
        <div className="mt-2 flex items-center justify-between gap-1">
          <button
            onClick={onToggleLogs}
            className={`text-xs flex items-center gap-1 transition-colors ${showingLogs ? 'text-blue-400' : 'text-slate-500 hover:text-blue-400'}`}
          >
            <Terminal size={10} /> {showingLogs ? 'Hide Logs' : 'Show Logs'}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={onClearMem}
              disabled={isRunning}
              title="Clear In-Memory Table — delete rows from sanctions_entries_mem for this source"
              className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-900/20 text-red-400 hover:bg-red-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 size={9} /> Clear Mem
            </button>
            <button
              onClick={onLoadMem}
              disabled={isRunning}
              title="Load In-Memory Table — copy rows from sanctions_entries into sanctions_entries_mem"
              className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-cyan-900/20 text-cyan-400 hover:bg-cyan-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <MemoryStick size={9} /> Load Mem
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ScraperControl() {
  const [statuses, setStatuses]         = useState<any[]>([])
  const [history, setHistory]           = useState<any[]>([])
  const [running, setRunning]           = useState<Record<string, boolean>>({})
  const [runStartedAt, setRunStartedAt] = useState<Record<string, string>>({})
  const [liveLog, setLiveLog]           = useState<string[]>([])
  const [activeSource, setActiveSource] = useState<string | null>(null)
  const [connected, setConnected]       = useState(false)
  const [mode, setMode]                 = useState('full')
  const logRef = useRef<HTMLDivElement>(null)
  const esRef  = useRef<EventSource | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const r = await api.get('/scraper/status')
      const data: any[] = Array.isArray(r.data) ? r.data : Object.values(r.data || {})
      setStatuses(data)
    } catch { }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const r = await api.get('/scraper/history')
      setHistory(r.data?.data || r.data || [])
    } catch { }
  }, [])

  useEffect(() => {
    loadStatus(); loadHistory()
    const iv = setInterval(() => { loadStatus(); loadHistory() }, 8000)
    return () => clearInterval(iv)
  }, [loadStatus, loadHistory])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [liveLog])

  const runScraper = async (code: string) => {
    // Open log panel immediately so user sees output right away
    setActiveSource(code)
    setLiveLog([`[${nowIST()}] Starting ${code} scraper (${mode} mode)...`])
    setConnected(false)

    const startedAt = new Date().toISOString()
    setRunning(p => ({ ...p, [code]: true }))
    setRunStartedAt(p => ({ ...p, [code]: startedAt }))

    // Zeroise records and stamp Last Run immediately
    setStatuses(prev => prev.map(s => s.source_code === code
      ? { ...s, total_entries: 0, last_records: 0, last_run_at: startedAt, last_run_status: 'RUNNING', progress: 0 }
      : s
    ))

    // Cancel any previous poll
    if ((esRef as any).current?.stopPoll) (esRef as any).current.stopPoll()

    try {
      const triggerRes = await api.post(`/scraper/trigger/${code}`, { mode })
      const runId: string = triggerRes.data?.runId || code

      setLiveLog(prev => [...prev, `[${nowIST()}] Connected — polling log for run ${runId}...`])
      setConnected(true)

      // POLLING instead of SSE — tunnel proxies buffer SSE so events never arrive live
      let seenCount = 0
      let active = true
      const poll = async () => {
        if (!active) return
        try {
          const r = await api.get(`/scraper/logs/${runId}?since=${seenCount}`)
          const data = r.data
          if (data.logs?.length) {
            const newLines = data.logs.map((l: any) => {
              const t = new Date(l.ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })
              return `[${t}] ${l.msg}`
            })
            setLiveLog(p => [...p, ...newLines].slice(-500))
            seenCount = data.total
          }
          if (data.progress !== undefined) {
            setStatuses(p => p.map(s => s.source_code === code ? { ...s, progress: data.progress } : s))
          }
          if (data.done) {
            active = false
            const elapsed = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
            setStatuses(p => p.map(s => s.source_code === code
              ? { ...s, last_run_status: 'SUCCESS', progress: 100, last_elapsed_seconds: elapsed, last_run_at: new Date().toISOString() }
              : s
            ))
            setRunning(p => ({ ...p, [code]: false }))
            setConnected(false)
            toast.success(`${code} complete`)
            loadStatus(); loadHistory()
            return
          }
        } catch { /* ignore transient poll errors */ }
        if (active) setTimeout(poll, 1500)
      }
      setTimeout(poll, 800) // first poll after 0.8s
      ;(esRef as any).current = { stopPoll: () => { active = false } }

    } catch (err: any) {
      setLiveLog(p => [...p, `[${nowIST()}] Failed to start: ${err.message}`])
      toast.error(`Failed to start ${code}: ${err.message}`)
      setRunning(p => ({ ...p, [code]: false }))
      setStatuses(prev => prev.map(s => s.source_code === code
        ? { ...s, last_run_status: 'FAILED', progress: 0 }
        : s
      ))
    }
  }

  const stopScraper = async (code: string) => {
    if ((esRef as any).current?.stopPoll) (esRef as any).current.stopPoll()
    ;(esRef as any).current = null
    await api.post(`/scraper/stop/${code}`).catch(() => { })
    setRunning(p => ({ ...p, [code]: false }))
    setConnected(false)
    setStatuses(prev => prev.map(s => s.source_code === code
      ? { ...s, last_run_status: 'STOPPED', progress: 0 }
      : s
    ))
    setLiveLog(p => [...p, `[${nowIST()}] Scraper stopped by user`])
    toast('Scraper stopped')
  }

  const clearMem = async (code: string) => {
    if (!window.confirm(`Delete ${code} rows from sanctions_entries_mem (SQL in-memory table)?`)) return
    try {
      await api.post(`/scraper/clear-mem/${code}`)
      toast.success(`${code} in-memory table cleared`)
      loadStatus()
    } catch (err: any) {
      toast.error(`Clear mem failed: ${err.message}`)
    }
  }

  const loadMem = async (code: string) => {
    try {
      toast.loading(`Loading ${code} into in-memory table...`, { id: `load-mem-${code}` })
      const r = await api.post(`/scraper/load-mem/${code}`)
      toast.success(`${code}: ${r.data?.loaded?.toLocaleString() || 0} rows loaded into in-memory table`, { id: `load-mem-${code}` })
      loadStatus()
    } catch (err: any) {
      toast.error(`Load mem failed: ${err.message}`, { id: `load-mem-${code}` })
    }
  }

  const runAll = async () => {
    setLiveLog([`[${nowIST()}] Starting ALL scrapers sequentially...`])
    for (const src of SOURCES) {
      if (!running[src.code]) {
        await runScraper(src.code)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  const statusMap: Record<string, any> = {}
  statuses.forEach(s => { statusMap[s.source_code] = s })

  const totalRunning = Object.values(running).filter(Boolean).length
  const totalSources = SOURCES.length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader
        title="Scraper Control Center"
        subtitle="Download and process sanctions lists from all global sources"
        icon={Download}
        actions={<>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Mode:</label>
            <select className="select text-xs py-1 w-24" value={mode} onChange={e => setMode(e.target.value)}>
              <option value="full">Full</option>
              <option value="delta">Delta</option>
            </select>
          </div>
          <button onClick={runAll} disabled={totalRunning > 0} className="btn-primary text-xs">
            {totalRunning > 0
              ? <><Spinner size={12} /> Running ({totalRunning})</>
              : <><Play size={12} /> Run All</>}
          </button>
          <button onClick={() => { loadStatus(); loadHistory() }} className="btn-ghost"><RefreshCw size={14} /></button>
        </>}
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Sources" value={totalSources} />
        <StatCard label="Running" value={totalRunning} color="text-blue-400" />
        <StatCard
          label="Total Records"
          value={statuses.reduce((acc, s) => acc + (s.total_entries || 0), 0).toLocaleString()}
          color="text-green-400"
        />
        <LiveClockCard />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {SOURCES.map(src => {
          const st = statusMap[src.code] || {}
          const isRunning = !!running[src.code]
          const enrichedSt = isRunning ? { ...st, run_started_at: runStartedAt[src.code] } : st
          return (
            <SourceCard
              key={src.code}
              src={src}
              st={enrichedSt}
              isRunning={isRunning}
              onRun={() => runScraper(src.code)}
              onStop={() => stopScraper(src.code)}
              onToggleLogs={() => setActiveSource(activeSource === src.code ? null : src.code)}
              showingLogs={activeSource === src.code}
              onClearMem={() => clearMem(src.code)}
              onLoadMem={() => loadMem(src.code)}
            />
          )
        })}
      </div>

      {activeSource && (
        <div className="card mb-6">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-green-400" />
              <span className="font-semibold text-white text-sm">Live Log — {activeSource}</span>
              {connected ? (
                <span className="flex items-center gap-1 text-xs text-green-400 animate-pulse">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full" /> LIVE
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full" /> IDLE
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setLiveLog([])} className="text-xs text-slate-500 hover:text-amber-400">Clear</button>
              <button onClick={() => setActiveSource(null)} className="text-xs text-slate-500 hover:text-white">Close</button>
            </div>
          </div>
          <div
            ref={logRef}
            className="font-mono text-xs bg-black/50 rounded-b p-3 h-56 overflow-y-auto"
          >
            {liveLog.length === 0 ? (
              <div className="text-slate-600 italic">Waiting for log output...</div>
            ) : (
              liveLog.map((line, i) => (
                <div key={i} className={
                  line.includes('COMPLETE') ? 'text-green-400'
                  : line.includes('ERROR') || line.includes('Failed') ? 'text-red-400'
                  : line.includes('WARN') || line.includes('dropped') ? 'text-amber-300'
                  : line.includes('Starting') || line.includes('Stream') ? 'text-blue-300'
                  : 'text-green-300'
                }>{line}</div>
              ))
            )}
            {connected && <div className="animate-pulse text-green-700 mt-1">|</div>}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="font-semibold text-white">Scraper Run History</span>
          <button onClick={loadHistory} className="btn-ghost text-xs"><RefreshCw size={12} /></button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Status</th>
                <th>Downloaded</th>
                <th>Added</th>
                <th>Updated</th>
                <th>Deleted</th>
                <th className="flex items-center gap-1"><Timer size={11} /> Elapsed</th>
                <th>Started (IST)</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-slate-500">No scraper runs yet. Click Run to start.</td></tr>
              ) : history.slice(0, 50).map((row: any, i: number) => (
                <tr key={i}>
                  <td><span className="font-mono text-xs font-bold text-blue-300">{row.source_code}</span></td>
                  <td><Badge value={row.status} /></td>
                  <td className="text-xs text-slate-300">{row.records_downloaded?.toLocaleString() || '—'}</td>
                  <td className="text-xs text-green-400">+{row.records_added || 0}</td>
                  <td className="text-xs text-amber-400">~{row.records_updated || 0}</td>
                  <td className="text-xs text-red-400">-{row.records_deleted || 0}</td>
                  <td className="text-xs font-mono font-semibold text-slate-300">
                    {row.duration_seconds != null ? fmtElapsed(row.duration_seconds) : '—'}
                  </td>
                  <td className="text-xs text-slate-400">{row.started_at ? toIST(row.started_at) : '—'}</td>
                  <td className="text-xs text-red-400 max-w-[150px] truncate">{row.error_message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
