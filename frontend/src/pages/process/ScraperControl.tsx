import React, { useEffect, useState, useRef } from 'react'
import { api } from '../../api'
import { Badge, Spinner, PageHeader, StatCard, ProgressBar, Field } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Download, Play, Square, RefreshCw, Terminal, Clock, Database, Wifi, WifiOff, Globe, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Scraper Control',
  entities: [{
    name: 'scraper_runs', description: 'Sanctions list scraper execution history and live monitoring',
    fields: [
      { name: 'source_code', type: 'varchar(20)', description: 'Source: OFAC | EU | UN | UK | SECO | DFAT | MAS' },
      { name: 'run_type', type: 'enum', description: 'FULL | DELTA | SCHEDULED' },
      { name: 'status', type: 'enum', description: 'RUNNING | COMPLETED | FAILED | SCHEDULED' },
      { name: 'records_added', type: 'int', description: 'New records added in this run' },
      { name: 'records_updated', type: 'int', description: 'Records updated in this run' },
      { name: 'records_deleted', type: 'int', description: 'Records removed in this run' },
      { name: 'duration_seconds', type: 'int', description: 'Run duration in seconds' },
      { name: 'error_message', type: 'text', description: 'Error details if failed' },
    ]
  }]
}

const SOURCES = [
  { code: 'OFAC', name: 'OFAC SDN', flag: '🇺🇸', url: 'https://www.treasury.gov/ofac/downloads/sdn.xml', schedule: 'Every 3h' },
  { code: 'EU', name: 'EU Sanctions', flag: '🇪🇺', url: 'https://webgate.ec.europa.eu/fsd/fsf', schedule: 'Every 3h' },
  { code: 'UN', name: 'UN Security Council', flag: '🇺🇳', url: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml', schedule: 'Every 3h' },
  { code: 'UK', name: 'UK OFSI', flag: '🇬🇧', url: 'https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/', schedule: 'Every 3h' },
  { code: 'SECO', name: 'SECO Switzerland', flag: '🇨🇭', url: 'https://www.seco.admin.ch/seco/en/home/Aussenwirtschaftspolitik_Wirtschaftliche_Zusammenarbeit/Wirtschaftsbeziehungen/exportkontrollen-und-sanktionen/sanktionen-embargos/sanktionsmassnahmen.html', schedule: 'Every 6h' },
  { code: 'DFAT', name: 'DFAT Australia', flag: '🇦🇺', url: 'https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list', schedule: 'Every 6h' },
  { code: 'MAS', name: 'MAS Singapore', flag: '🇸🇬', url: 'https://www.mas.gov.sg/regulation/anti-money-laundering/targeted-financial-sanctions/lists-of-designated-individuals-and-entities', schedule: 'Every 6h' },
  { code: 'BIS', name: 'BIS Entity List', flag: '🇺🇸', url: 'https://www.bis.doc.gov/index.php/policy-guidance/lists-of-parties-of-concern/entity-list', schedule: 'Daily' },
]

export default function ScraperControl() {
  const [statuses, setStatuses] = useState<Record<string, any>>({})
  const [history, setHistory] = useState<any[]>([])
  const [running, setRunning] = useState<Record<string, boolean>>({})
  const [liveLog, setLiveLog] = useState<string[]>([])
  const [activeSource, setActiveSource] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [mode, setMode] = useState('full')
  const logRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  const loadStatus = async () => {
    try {
      const r = await api.get('/scraper/status')
      setStatuses(r.data || {})
    } catch { }
  }

  const loadHistory = async () => {
    try {
      const r = await api.get('/scraper/history')
      setHistory(r.data?.data || r.data || [])
    } catch { }
  }

  useEffect(() => {
    loadStatus(); loadHistory()
    const iv = setInterval(() => { loadStatus(); loadHistory() }, 8000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [liveLog])

  const runScraper = async (code: string) => {
    setRunning(p => ({ ...p, [code]: true }))
    setActiveSource(code)
    setLiveLog([`[${new Date().toLocaleTimeString()}] Starting ${code} scraper (${mode} mode)...`])
    if (esRef.current) esRef.current.close()

    try {
      await api.post(`/scraper/trigger/${code}`, { mode })
      const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000')
      const es = new EventSource(`${baseUrl}/api/scraper/stream/${code}`)
      esRef.current = es
      setConnected(true)

      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          const ts = new Date().toLocaleTimeString()
          if (d.type === 'log') setLiveLog(p => [...p.slice(-300), `[${ts}] ${d.message}`])
          else if (d.type === 'progress') {
            setStatuses(p => ({ ...p, [code]: { ...p[code], progress: d.progress, status: 'RUNNING' } }))
            setLiveLog(p => [...p.slice(-300), `[${ts}] Progress: ${d.progress}% - ${d.message || ''}`])
          } else if (d.type === 'complete') {
            setStatuses(p => ({ ...p, [code]: { ...p[code], status: 'COMPLETED', progress: 100, records_added: d.added, records_updated: d.updated, last_run: new Date().toISOString() } }))
            setLiveLog(p => [...p, `[${ts}] ✓ COMPLETE: +${d.added} added, ~${d.updated} updated, ${d.duration}s`])
            setRunning(p => ({ ...p, [code]: false }))
            setConnected(false)
            es.close()
            toast.success(`${code} scrape complete: ${d.added} records added`)
            loadHistory()
          } else if (d.type === 'error') {
            setLiveLog(p => [...p, `[${ts}] ✗ ERROR: ${d.message}`])
            setRunning(p => ({ ...p, [code]: false }))
            setConnected(false)
            es.close()
            toast.error(`${code} failed: ${d.message}`)
          }
        } catch { }
      }
      es.onerror = () => { setConnected(false); setRunning(p => ({ ...p, [code]: false })); es.close() }
    } catch (e: any) {
      toast.error(`Failed: ${e.message}`)
      setRunning(p => ({ ...p, [code]: false }))
    }
  }

  const runAll = async () => {
    setLiveLog([`[${new Date().toLocaleTimeString()}] Starting ALL scrapers...`])
    for (const src of SOURCES) {
      if (!running[src.code]) {
        await runScraper(src.code)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  const stopScraper = async (code: string) => {
    if (esRef.current) esRef.current.close()
    await api.post(`/scraper/stop/${code}`).catch(() => { })
    setRunning(p => ({ ...p, [code]: false }))
    setConnected(false)
    toast('Scraper stopped')
  }

  const totalRunning = Object.values(running).filter(Boolean).length
  const totalCompleted = Object.values(statuses).filter((s: any) => s?.status === 'COMPLETED').length
  const totalFailed = Object.values(statuses).filter((s: any) => s?.status === 'FAILED').length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Scraper Control Center" subtitle="Download and process sanctions lists from all global sources" icon={Download}
        actions={<>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Mode:</label>
            <select className="select text-xs py-1 w-24" value={mode} onChange={e => setMode(e.target.value)}>
              <option value="full">Full</option>
              <option value="delta">Delta</option>
            </select>
          </div>
          <button onClick={runAll} disabled={totalRunning > 0} className="btn-primary text-xs">
            {totalRunning > 0 ? <><Spinner size={12} /> Running ({totalRunning})</> : <><Play size={12} /> Run All</>}
          </button>
          <button onClick={() => { loadStatus(); loadHistory() }} className="btn-ghost"><RefreshCw size={14} /></button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Sources" value={SOURCES.length} />
        <StatCard label="Running" value={totalRunning} color="text-blue-400" />
        <StatCard label="Completed" value={totalCompleted} color="text-green-400" />
        <StatCard label="Failed" value={totalFailed} color="text-red-400" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {SOURCES.map(src => {
          const st = statuses[src.code] || {}
          const isRunning = running[src.code]
          return (
            <div key={src.code} className={`card border transition-all ${isRunning ? 'border-blue-500/60 bg-blue-900/5' : st.status === 'FAILED' ? 'border-red-600/40' : st.status === 'COMPLETED' ? 'border-green-600/30' : 'border-slate-700'}`}>
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
                    <button onClick={() => stopScraper(src.code)} className="p-1.5 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50">
                      <Square size={12} />
                    </button>
                  ) : (
                    <button onClick={() => runScraper(src.code)} className="p-1.5 bg-blue-900/30 text-blue-400 rounded hover:bg-blue-900/50">
                      <Play size={12} />
                    </button>
                  )}
                </div>

                {isRunning && <ProgressBar pct={st.progress || 0} label={`${st.progress || 0}%`} />}

                <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
                  <div>
                    <div className="text-slate-500">Status</div>
                    <div className={`font-medium ${isRunning ? 'text-blue-400' : st.status === 'COMPLETED' ? 'text-green-400' : st.status === 'FAILED' ? 'text-red-400' : 'text-slate-400'}`}>
                      {isRunning ? '● RUNNING' : st.status || 'IDLE'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Records</div>
                    <div className="text-slate-300">{st.total_records?.toLocaleString() || st.records_added?.toLocaleString() || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Last Run</div>
                    <div className="text-slate-400">{st.last_run ? new Date(st.last_run).toLocaleTimeString() : 'Never'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Schedule</div>
                    <div className="text-slate-400">{src.schedule}</div>
                  </div>
                </div>

                {st.error_message && (
                  <div className="mt-2 flex items-start gap-1 text-xs text-red-300 bg-red-900/20 rounded p-1.5">
                    <AlertCircle size={10} className="mt-0.5 shrink-0" />
                    <span className="truncate">{st.error_message}</span>
                  </div>
                )}

                <button onClick={() => setActiveSource(activeSource === src.code ? null : src.code)} className="mt-2 text-xs text-slate-500 hover:text-blue-400 flex items-center gap-1">
                  <Terminal size={10} /> Logs
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Live Log */}
      {activeSource && (
        <div className="card mb-6">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-green-400" />
              <span className="font-semibold text-white text-sm">Live Log: {activeSource}</span>
              {connected && <span className="flex items-center gap-1 text-xs text-green-400 animate-pulse"><span className="w-1.5 h-1.5 bg-green-400 rounded-full" /> LIVE</span>}
            </div>
            <button onClick={() => setActiveSource(null)} className="text-xs text-slate-500 hover:text-white">Close</button>
          </div>
          <div ref={logRef} className="bg-black/70 p-4 h-56 overflow-y-auto font-mono text-xs space-y-0.5">
            {liveLog.length === 0 ? <div className="text-slate-600">No log output yet. Start a scraper to see live output.</div>
              : liveLog.map((line, i) => (
                <div key={i} className={line.includes('✓') ? 'text-green-400' : line.includes('✗') || line.includes('ERROR') ? 'text-red-400' : line.includes('WARN') ? 'text-amber-300' : 'text-green-300'}>{line}</div>
              ))}
            <div className="animate-pulse text-green-700">▌</div>
          </div>
        </div>
      )}

      {/* History */}
      <div className="card">
        <div className="card-header">
          <span className="font-semibold text-white">Scraper Run History</span>
          <button onClick={loadHistory} className="btn-ghost text-xs"><RefreshCw size={12} /></button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Source</th><th>Type</th><th>Status</th><th>Added</th><th>Updated</th><th>Deleted</th><th>Duration</th><th>Started</th><th>Error</th></tr></thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-slate-500">No scraper runs yet. Click Run to start.</td></tr>
              ) : history.slice(0, 50).map((row: any, i: number) => (
                <tr key={i}>
                  <td><span className="font-mono text-xs font-bold text-blue-300">{row.source_code}</span></td>
                  <td><Badge value={row.run_type || 'FULL'} /></td>
                  <td><Badge value={row.status} /></td>
                  <td className="text-xs text-green-400">+{row.records_added || 0}</td>
                  <td className="text-xs text-amber-400">~{row.records_updated || 0}</td>
                  <td className="text-xs text-red-400">-{row.records_deleted || 0}</td>
                  <td className="text-xs text-slate-400">{row.duration_seconds ? `${row.duration_seconds}s` : '—'}</td>
                  <td className="text-xs text-slate-500">{row.started_at ? new Date(row.started_at).toLocaleString() : '—'}</td>
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
