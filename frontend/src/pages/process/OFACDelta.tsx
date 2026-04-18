import React, { useEffect, useState, useRef } from 'react'
import { api } from '../../api'
import { Badge, Spinner, PageHeader, StatCard, ProgressBar } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Zap, Play, RefreshCw, Terminal, GitMerge, Plus, Minus, Edit } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'OFAC Delta Processor',
  entities: [{
    name: 'ofac_delta_runs', description: 'OFAC incremental change file processing',
    fields: [
      { name: 'delta_file_url', type: 'varchar', description: 'URL of the OFAC delta XML file' },
      { name: 'delta_date', type: 'date', description: 'Date of the delta file' },
      { name: 'adds', type: 'int', description: 'Number of new entries added' },
      { name: 'changes', type: 'int', description: 'Number of entries modified' },
      { name: 'deletes', type: 'int', description: 'Number of entries removed' },
      { name: 'status', type: 'enum', description: 'PENDING | PROCESSING | APPLIED | FAILED' },
    ]
  }]
}

export default function OFACDelta() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [liveLog, setLiveLog] = useState<string[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [stats, setStats] = useState<any>({})
  const [connected, setConnected] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  const loadHistory = async () => {
    try {
      const r = await api.get('/scraper/ofac-delta/history')
      setHistory(r.data?.data || r.data || [])
      const s = r.data?.stats || {}
      setStats(s)
    } catch { }
  }

  useEffect(() => { loadHistory() }, [])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [liveLog])

  const runDelta = async () => {
    setRunning(true)
    setProgress(0)
    setLiveLog([`[${new Date().toLocaleTimeString()}] Fetching OFAC delta files...`])
    if (esRef.current) esRef.current.close()

    try {
      await api.post('/scraper/trigger/OFAC', { mode: 'delta' })
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
      const es = new EventSource(`${baseUrl}/api/scraper/stream/OFAC_DELTA`)
      esRef.current = es
      setConnected(true)

      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          const ts = new Date().toLocaleTimeString()
          if (d.type === 'log') setLiveLog(p => [...p.slice(-400), `[${ts}] ${d.message}`])
          else if (d.type === 'progress') { setProgress(d.progress); setLiveLog(p => [...p.slice(-400), `[${ts}] ${d.progress}% - ${d.message || ''}`]) }
          else if (d.type === 'complete') {
            setProgress(100)
            setLiveLog(p => [...p, `[${ts}] ✓ Delta applied: +${d.adds} added, ~${d.changes} changed, -${d.deletes} removed`])
            setRunning(false); setConnected(false); es.close()
            toast.success(`Delta processed: +${d.adds} adds, ~${d.changes} changes`)
            loadHistory()
          } else if (d.type === 'error') {
            setLiveLog(p => [...p, `[${ts}] ✗ ERROR: ${d.message}`])
            setRunning(false); setConnected(false); es.close()
            toast.error(`Delta failed: ${d.message}`)
          }
        } catch { }
      }
      es.onerror = () => { setConnected(false); setRunning(false); es.close() }
    } catch (e: any) {
      toast.error(e.message)
      setRunning(false)
    }
  }

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="OFAC Delta Processor" subtitle="Process OFAC incremental change files for real-time list updates" icon={Zap}
        actions={<>
          <button onClick={loadHistory} className="btn-ghost"><RefreshCw size={14} /></button>
          <button onClick={runDelta} disabled={running} className="btn-primary">
            {running ? <><Spinner size={14} /> Processing...</> : <><Play size={14} /> Run Delta</>}
          </button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Delta Runs" value={history.length} />
        <StatCard label="Total Adds" value={(stats.total_adds || 0).toLocaleString()} color="text-green-400" />
        <StatCard label="Total Changes" value={(stats.total_changes || 0).toLocaleString()} color="text-amber-400" />
        <StatCard label="Total Removes" value={(stats.total_deletes || 0).toLocaleString()} color="text-red-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="card-header"><span className="font-semibold text-white">Delta Process Info</span></div>
          <div className="p-5 space-y-3 text-sm text-slate-300">
            <div className="flex items-start gap-3 p-3 bg-blue-900/20 rounded-xl border border-blue-700/30">
              <GitMerge size={16} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-white mb-1">OFAC Delta Files</div>
                <div className="text-xs text-slate-400">OFAC publishes incremental change files (adds, changes, deletes) at regular intervals. The delta processor downloads and applies these changes without requiring a full list reload, dramatically reducing processing time.</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-900/20 rounded-xl p-3 text-center border border-green-700/30">
                <Plus size={16} className="text-green-400 mx-auto mb-1" />
                <div className="text-xs text-slate-400">Adds</div>
                <div className="text-sm font-bold text-green-400">New entries</div>
              </div>
              <div className="bg-amber-900/20 rounded-xl p-3 text-center border border-amber-700/30">
                <Edit size={16} className="text-amber-400 mx-auto mb-1" />
                <div className="text-xs text-slate-400">Changes</div>
                <div className="text-sm font-bold text-amber-400">Modified entries</div>
              </div>
              <div className="bg-red-900/20 rounded-xl p-3 text-center border border-red-700/30">
                <Minus size={16} className="text-red-400 mx-auto mb-1" />
                <div className="text-xs text-slate-400">Deletes</div>
                <div className="text-sm font-bold text-red-400">Removed entries</div>
              </div>
            </div>
            {running && <ProgressBar pct={progress} label={`Processing delta files... ${progress}%`} />}
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-green-400" />
              <span className="font-semibold text-white text-sm">Live Output</span>
              {connected && <span className="flex items-center gap-1 text-xs text-green-400 animate-pulse"><span className="w-1.5 h-1.5 bg-green-400 rounded-full" /> LIVE</span>}
            </div>
          </div>
          <div ref={logRef} className="bg-black/70 p-4 h-48 overflow-y-auto font-mono text-xs space-y-0.5">
            {liveLog.length === 0 ? <div className="text-slate-600">Click "Run Delta" to process OFAC delta files.</div>
              : liveLog.map((line, i) => (
                <div key={i} className={line.includes('✓') ? 'text-green-400' : line.includes('✗') || line.includes('ERROR') ? 'text-red-400' : 'text-green-300'}>{line}</div>
              ))}
            {running && <div className="animate-pulse text-green-700">▌</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="font-semibold text-white">Delta Run History</span></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Status</th><th>Adds</th><th>Changes</th><th>Deletes</th><th>Duration</th><th>File</th></tr></thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-500">No delta runs yet. Click Run Delta to start.</td></tr>
              ) : history.map((row: any, i: number) => (
                <tr key={i}>
                  <td className="text-xs text-slate-400">{row.delta_date || row.started_at ? new Date(row.delta_date || row.started_at).toLocaleDateString() : '—'}</td>
                  <td><Badge value={row.status} /></td>
                  <td className="text-xs text-green-400">+{row.adds || row.records_added || 0}</td>
                  <td className="text-xs text-amber-400">~{row.changes || row.records_updated || 0}</td>
                  <td className="text-xs text-red-400">-{row.deletes || row.records_deleted || 0}</td>
                  <td className="text-xs text-slate-400">{row.duration_seconds ? `${row.duration_seconds}s` : '—'}</td>
                  <td className="text-xs text-slate-500 font-mono truncate max-w-[150px]">{row.delta_file_url ? row.delta_file_url.split('/').pop() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
