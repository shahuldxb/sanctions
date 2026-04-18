import React, { useEffect, useState, useRef } from 'react'
import { api } from '../api'
import { Badge, Spinner, PageHeader, StatCard, ProgressBar } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { Activity, Play, Square, RefreshCw, Terminal, Clock, Cpu, Database, Wifi, WifiOff } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Process Control Center',
  entities: [{
    name: 'background_processes', description: 'All background processes running in the Sanctions Engine',
    fields: [
      { name: 'process_name', type: 'varchar', description: 'Process identifier' },
      { name: 'status', type: 'enum', description: 'RUNNING | IDLE | FAILED | STOPPED' },
      { name: 'progress', type: 'int', description: 'Completion percentage 0-100' },
      { name: 'last_run', type: 'datetime', description: 'Last execution time' },
      { name: 'next_run', type: 'datetime', description: 'Next scheduled execution' },
      { name: 'records_processed', type: 'int', description: 'Records processed in last run' },
      { name: 'duration_seconds', type: 'int', description: 'Duration of last run in seconds' },
      { name: 'error_message', type: 'text', description: 'Last error message if failed' },
    ]
  }]
}

const PROCESSES = [
  { id: 'ofac_scraper', name: 'OFAC SDN Scraper', description: 'Downloads and processes OFAC SDN list (full + delta)', schedule: 'Every 3 hours', icon: '🇺🇸' },
  { id: 'eu_scraper', name: 'EU Sanctions Scraper', description: 'Scrapes EU consolidated sanctions list', schedule: 'Every 3 hours', icon: '🇪🇺' },
  { id: 'un_scraper', name: 'UN Sanctions Scraper', description: 'Downloads UN Security Council consolidated list', schedule: 'Every 3 hours', icon: '🇺🇳' },
  { id: 'uk_scraper', name: 'UK OFSI Scraper', description: 'Downloads UK OFSI financial sanctions list', schedule: 'Every 3 hours', icon: '🇬🇧' },
  { id: 'seco_scraper', name: 'SECO Scraper', description: 'Swiss SECO sanctions list', schedule: 'Every 6 hours', icon: '🇨🇭' },
  { id: 'dfat_scraper', name: 'DFAT Scraper', description: 'Australian DFAT consolidated list', schedule: 'Every 6 hours', icon: '🇦🇺' },
  { id: 'mas_scraper', name: 'MAS Scraper', description: 'Singapore MAS sanctions list', schedule: 'Every 6 hours', icon: '🇸🇬' },
  { id: 'ofac_delta', name: 'OFAC Delta Processor', description: 'Processes incremental OFAC changes', schedule: 'Every 30 min', icon: '⚡' },
  { id: 'enrichment', name: 'Enrichment Engine', description: 'Enriches sanctions records with additional data', schedule: 'After each scrape', icon: '🧠' },
  { id: 'fuzzy_index', name: 'Fuzzy Index Builder', description: 'Rebuilds phonetic and fuzzy search indexes', schedule: 'Every 12 hours', icon: '🔍' },
  { id: 'batch_screener', name: 'Batch Screener', description: 'Screens all customers and transactions in batch', schedule: 'Daily at 02:00', icon: '📋' },
  { id: 'alert_processor', name: 'Alert Processor', description: 'Processes and routes compliance alerts', schedule: 'Continuous', icon: '🔔' },
]

export default function ProcessControl() {
  const [statuses, setStatuses] = useState<Record<string, any>>({})
  const [logs, setLogs] = useState<Record<string, string[]>>({})
  const [running, setRunning] = useState<Record<string, boolean>>({})
  const [activeLog, setActiveLog] = useState<string | null>(null)
  const [liveLog, setLiveLog] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const loadStatuses = async () => {
    try {
      const r = await api.get('/scraper/status')
      setStatuses(r.data || {})
    } catch { }
  }

  useEffect(() => {
    loadStatuses()
    const interval = setInterval(loadStatuses, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [liveLog])

  const startProcess = async (processId: string) => {
    setRunning(p => ({ ...p, [processId]: true }))
    setLiveLog([])
    setActiveLog(processId)

    // Close existing SSE
    if (eventSourceRef.current) eventSourceRef.current.close()

    try {
      // Start the process
      await api.post(`/scraper/run/${processId}`)

      // Connect to SSE stream
      const es = new EventSource(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/scraper/stream/${processId}`)
      eventSourceRef.current = es
      setConnected(true)

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'log') {
            setLiveLog(prev => [...prev.slice(-200), `[${new Date().toLocaleTimeString()}] ${data.message}`])
          } else if (data.type === 'progress') {
            setStatuses(prev => ({ ...prev, [processId]: { ...prev[processId], progress: data.progress, status: 'RUNNING' } }))
          } else if (data.type === 'complete') {
            setStatuses(prev => ({ ...prev, [processId]: { ...prev[processId], status: 'IDLE', progress: 100, last_run: new Date().toISOString(), records_processed: data.records } }))
            setLiveLog(prev => [...prev, `✓ Completed: ${data.records} records processed in ${data.duration}s`])
            setRunning(p => ({ ...p, [processId]: false }))
            setConnected(false)
            es.close()
            toast.success(`${processId} completed: ${data.records} records`)
          } else if (data.type === 'error') {
            setLiveLog(prev => [...prev, `✗ Error: ${data.message}`])
            setRunning(p => ({ ...p, [processId]: false }))
            setConnected(false)
            es.close()
            toast.error(`${processId} failed: ${data.message}`)
          }
        } catch { }
      }

      es.onerror = () => {
        setConnected(false)
        setRunning(p => ({ ...p, [processId]: false }))
        es.close()
      }
    } catch (e: any) {
      toast.error(`Failed to start ${processId}: ${e.message}`)
      setRunning(p => ({ ...p, [processId]: false }))
    }
  }

  const stopProcess = async (processId: string) => {
    if (eventSourceRef.current) eventSourceRef.current.close()
    await api.post(`/scraper/stop/${processId}`).catch(() => { })
    setRunning(p => ({ ...p, [processId]: false }))
    setConnected(false)
    toast('Process stopped')
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'text-blue-400'
      case 'IDLE': return 'text-green-400'
      case 'FAILED': return 'text-red-400'
      case 'STOPPED': return 'text-slate-500'
      default: return 'text-slate-500'
    }
  }

  const totalRunning = Object.values(running).filter(Boolean).length
  const totalFailed = Object.values(statuses).filter((s: any) => s?.status === 'FAILED').length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Process Control Center" subtitle="Monitor and control all background processes" icon={Activity}
        actions={<>
          <button onClick={loadStatuses} className="btn-ghost"><RefreshCw size={14} /></button>
          {connected ? <span className="flex items-center gap-1 text-xs text-green-400"><Wifi size={12} /> Live</span>
            : <span className="flex items-center gap-1 text-xs text-slate-500"><WifiOff size={12} /> Offline</span>}
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Processes" value={PROCESSES.length} />
        <StatCard label="Running" value={totalRunning} color="text-blue-400" />
        <StatCard label="Failed" value={totalFailed} color="text-red-400" />
        <StatCard label="Scheduled" value={PROCESSES.filter(p => p.schedule !== 'Continuous').length} color="text-green-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {PROCESSES.map(proc => {
          const st = statuses[proc.id] || {}
          const isRunning = running[proc.id]
          return (
            <div key={proc.id} className={`card border ${isRunning ? 'border-blue-500/50 bg-blue-900/5' : st.status === 'FAILED' ? 'border-red-600/50' : 'border-slate-700'}`}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{proc.icon}</span>
                    <div>
                      <div className="font-semibold text-white text-sm">{proc.name}</div>
                      <div className="text-xs text-slate-500">{proc.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isRunning ? (
                      <button onClick={() => stopProcess(proc.id)} className="btn-danger text-xs py-1 px-2"><Square size={10} /> Stop</button>
                    ) : (
                      <button onClick={() => startProcess(proc.id)} className="btn-primary text-xs py-1 px-2"><Play size={10} /> Run</button>
                    )}
                  </div>
                </div>

                {isRunning && st.progress !== undefined && (
                  <ProgressBar pct={st.progress || 0} label={`Processing... ${st.progress || 0}%`} />
                )}

                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div>
                    <div className="text-slate-500">Status</div>
                    <div className={`font-medium ${getStatusColor(isRunning ? 'RUNNING' : st.status || 'IDLE')}`}>
                      {isRunning ? '● RUNNING' : st.status || 'IDLE'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Last Run</div>
                    <div className="text-slate-300">{st.last_run ? new Date(st.last_run).toLocaleTimeString() : 'Never'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Records</div>
                    <div className="text-slate-300">{st.records_processed?.toLocaleString() || '—'}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Clock size={10} /> {proc.schedule}</span>
                  {st.duration_seconds && <span className="flex items-center gap-1"><Cpu size={10} /> {st.duration_seconds}s</span>}
                  <button onClick={() => setActiveLog(activeLog === proc.id ? null : proc.id)} className="text-blue-400 hover:text-blue-300">
                    <Terminal size={12} />
                  </button>
                </div>

                {st.error_message && (
                  <div className="mt-2 bg-red-900/20 border border-red-600/30 rounded-lg p-2 text-xs text-red-300">{st.error_message}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Live Log Panel */}
      {activeLog && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-green-400" />
              <span className="font-semibold text-white text-sm">Live Log: {PROCESSES.find(p => p.id === activeLog)?.name}</span>
              {connected && <span className="flex items-center gap-1 text-xs text-green-400 animate-pulse"><span className="w-1.5 h-1.5 bg-green-400 rounded-full" /> LIVE</span>}
            </div>
            <button onClick={() => setActiveLog(null)} className="text-slate-500 hover:text-white text-xs">Close</button>
          </div>
          <div ref={logRef} className="bg-black/60 p-4 h-64 overflow-y-auto font-mono text-xs text-green-300 space-y-0.5">
            {liveLog.length === 0 ? (
              <div className="text-slate-600">Waiting for process output... Click Run to start.</div>
            ) : (
              liveLog.map((line, i) => (
                <div key={i} className={line.startsWith('✓') ? 'text-green-400' : line.startsWith('✗') ? 'text-red-400' : line.includes('ERROR') ? 'text-red-300' : line.includes('WARN') ? 'text-amber-300' : 'text-green-300'}>
                  {line}
                </div>
              ))
            )}
            <div className="animate-pulse text-green-600">▌</div>
          </div>
        </div>
      )}
    </div>
  )
}
