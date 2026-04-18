import React, { useEffect, useState } from 'react'
import { api } from '../../api'
import { Badge, Spinner, PageHeader, ProgressBar } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Activity, RefreshCw, Square, Cpu, Clock, Database } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Active Processes',
  entities: [{
    name: 'active_processes', description: 'Real-time view of all currently running background processes',
    fields: [
      { name: 'process_id', type: 'varchar', description: 'Unique process identifier' },
      { name: 'process_type', type: 'varchar', description: 'Type of process' },
      { name: 'status', type: 'enum', description: 'RUNNING | QUEUED | PAUSED' },
      { name: 'progress', type: 'int', description: 'Completion percentage' },
      { name: 'started_at', type: 'datetime', description: 'Process start time' },
      { name: 'cpu_usage', type: 'decimal', description: 'CPU usage percentage' },
      { name: 'memory_mb', type: 'int', description: 'Memory usage in MB' },
    ]
  }]
}

export default function ActiveProcesses() {
  const [processes, setProcesses] = useState<any[]>([])
  const [systemStats, setSystemStats] = useState<any>({})
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [pr, sr] = await Promise.all([
        api.get('/scraper/active-runs').catch(() => ({ data: [] })),
        api.get('/scraper/system-stats').catch(() => ({ data: {} }))
      ])
      setProcesses(pr.data?.data || pr.data || [])
      setSystemStats(sr.data || {})
    } catch { }
    setLoading(false)
  }

  useEffect(() => { load(); const iv = setInterval(load, 3000); return () => clearInterval(iv) }, [])

  const stopProcess = async (pid: string) => {
    await api.post(`/scraper/stop/${pid}`).catch(() => { })
    toast('Process stop requested')
    load()
  }

  const elapsed = (startedAt: string) => {
    if (!startedAt) return '—'
    const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  }

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Active Processes" subtitle="Real-time monitoring of all running background processes" icon={Activity}
        actions={<button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{processes.length}</div>
          <div className="text-xs text-slate-500 mt-1">Active Processes</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">{systemStats.cpu_usage ? `${systemStats.cpu_usage.toFixed(1)}%` : '—'}</div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1"><Cpu size={10} /> CPU Usage</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{systemStats.memory_used ? `${systemStats.memory_used}MB` : '—'}</div>
          <div className="text-xs text-slate-500 mt-1">Memory Used</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{systemStats.db_connections || '—'}</div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1"><Database size={10} /> DB Connections</div>
        </div>
      </div>

      {processes.length === 0 ? (
        <div className="card p-12 text-center">
          <Activity size={32} className="text-slate-600 mx-auto mb-3" />
          <div className="text-slate-500">No active processes running</div>
          <div className="text-xs text-slate-600 mt-1">All background processes are idle. Start a scraper or screening job to see activity here.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {processes.map((proc: any, i: number) => (
            <div key={i} className="card border border-blue-500/30 bg-blue-900/5">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                      <span className="font-semibold text-white">{proc.process_type || proc.job_name || proc.process_id}</span>
                      <Badge value={proc.status || 'RUNNING'} />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono">{proc.process_id}</div>
                  </div>
                  <button onClick={() => stopProcess(proc.process_id)} className="btn-danger text-xs py-1 px-2 shrink-0">
                    <Square size={10} /> Stop
                  </button>
                </div>

                {proc.progress !== undefined && <ProgressBar pct={proc.progress} label={`${proc.progress}%`} />}

                <div className="grid grid-cols-4 gap-4 mt-3 text-xs">
                  <div><div className="text-slate-500">Elapsed</div><div className="text-slate-300 flex items-center gap-1"><Clock size={10} />{elapsed(proc.started_at)}</div></div>
                  <div><div className="text-slate-500">CPU</div><div className="text-slate-300 flex items-center gap-1"><Cpu size={10} />{proc.cpu_usage ? `${proc.cpu_usage.toFixed(1)}%` : '—'}</div></div>
                  <div><div className="text-slate-500">Records</div><div className="text-slate-300">{proc.records_processed?.toLocaleString() || '—'}</div></div>
                  <div><div className="text-slate-500">Current Step</div><div className="text-slate-300 truncate">{proc.current_step || '—'}</div></div>
                </div>

                {proc.message && <div className="mt-2 text-xs text-slate-400 bg-slate-800/60 rounded p-2">{proc.message}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
