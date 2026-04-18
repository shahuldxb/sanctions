import React, { useEffect, useState, useRef } from 'react'
import { api } from '../../api'
import { Badge, Spinner, PageHeader, StatCard, ProgressBar } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Brain, Play, RefreshCw, Terminal, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Enrichment Engine',
  entities: [{
    name: 'enrichment_jobs', description: 'AI-powered enrichment of sanctions records with additional intelligence',
    fields: [
      { name: 'entry_id', type: 'int', description: 'Sanctions entry being enriched' },
      { name: 'enrichment_type', type: 'enum', description: 'TRANSLITERATION | ALIASES | IDENTIFIERS | RISK_SCORE | NETWORK | ADVERSE_MEDIA' },
      { name: 'source', type: 'varchar', description: 'Enrichment data source' },
      { name: 'confidence', type: 'decimal', description: 'Enrichment confidence score 0-1' },
      { name: 'status', type: 'enum', description: 'PENDING | PROCESSING | COMPLETED | FAILED' },
    ]
  }]
}

const ENRICHMENT_TYPES = [
  { id: 'transliteration', name: 'Name Transliteration', desc: 'Generate Arabic, Cyrillic, Chinese, Persian variants', icon: '🔤' },
  { id: 'aliases', name: 'Alias Discovery', desc: 'Find additional aliases and name variants via AI', icon: '👤' },
  { id: 'identifiers', name: 'Identifier Enrichment', desc: 'Enrich passport, ID, registration numbers', icon: '🪪' },
  { id: 'risk_score', name: 'Risk Scoring', desc: 'AI-powered risk score calculation', icon: '📊' },
  { id: 'network', name: 'Network Analysis', desc: 'Map ownership and control networks', icon: '🕸️' },
  { id: 'adverse_media', name: 'Adverse Media', desc: 'Scan news and media for adverse information', icon: '📰' },
]

export default function EnrichmentEngine() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [liveLog, setLiveLog] = useState<string[]>([])
  const [stats, setStats] = useState<any>({})
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['transliteration', 'aliases'])
  const [batchSize, setBatchSize] = useState(100)
  const logRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    api.get('/scraper/enrichment/stats').then(r => setStats(r.data || {})).catch(() => { })
  }, [])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [liveLog])

  const runEnrichment = async () => {
    setRunning(true); setProgress(0)
    setLiveLog([`[${new Date().toLocaleTimeString()}] Starting enrichment engine...`])
    if (esRef.current) esRef.current.close()
    try {
      await api.post('/scraper/run/enrichment', { types: selectedTypes, batch_size: batchSize })
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
      const es = new EventSource(`${baseUrl}/api/scraper/stream/enrichment`)
      esRef.current = es
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          const ts = new Date().toLocaleTimeString()
          if (d.type === 'log') setLiveLog(p => [...p.slice(-400), `[${ts}] ${d.message}`])
          else if (d.type === 'progress') { setProgress(d.progress); setLiveLog(p => [...p.slice(-400), `[${ts}] ${d.progress}% - ${d.message || ''}`]) }
          else if (d.type === 'complete') {
            setProgress(100); setRunning(false); es.close()
            setLiveLog(p => [...p, `[${ts}] ✓ Enrichment complete: ${d.records} records enriched`])
            toast.success(`Enrichment complete: ${d.records} records`)
          } else if (d.type === 'error') {
            setRunning(false); es.close()
            setLiveLog(p => [...p, `[${ts}] ✗ ERROR: ${d.message}`])
            toast.error(d.message)
          }
        } catch { }
      }
      es.onerror = () => { setRunning(false); es.close() }
    } catch (e: any) { toast.error(e.message); setRunning(false) }
  }

  const toggleType = (t: string) => setSelectedTypes(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Enrichment Engine" subtitle="AI-powered enrichment of sanctions records with additional intelligence" icon={Brain}
        actions={<button onClick={runEnrichment} disabled={running} className="btn-primary">{running ? <><Spinner size={14} /> Enriching...</> : <><Play size={14} /> Run Enrichment</>}</button>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Enriched Records" value={(stats.enriched || 0).toLocaleString()} color="text-green-400" />
        <StatCard label="Pending" value={(stats.pending || 0).toLocaleString()} color="text-amber-400" />
        <StatCard label="Transliterations" value={(stats.transliterations || 0).toLocaleString()} />
        <StatCard label="Avg Confidence" value={stats.avg_confidence ? `${(stats.avg_confidence * 100).toFixed(0)}%` : '—'} color="text-blue-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="card-header"><span className="font-semibold text-white">Enrichment Configuration</span></div>
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs text-slate-400 uppercase mb-2 block">Enrichment Types</label>
              <div className="grid grid-cols-2 gap-2">
                {ENRICHMENT_TYPES.map(et => (
                  <label key={et.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${selectedTypes.includes(et.id) ? 'border-blue-500/50 bg-blue-900/20' : 'border-slate-700 hover:border-slate-600'}`}>
                    <input type="checkbox" className="accent-blue-500" checked={selectedTypes.includes(et.id)} onChange={() => toggleType(et.id)} />
                    <span className="text-sm">{et.icon}</span>
                    <div>
                      <div className="text-xs font-medium text-white">{et.name}</div>
                      <div className="text-xs text-slate-500">{et.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase mb-1 block">Batch Size</label>
              <input className="input w-32" type="number" value={batchSize} onChange={e => setBatchSize(+e.target.value)} min={10} max={1000} />
            </div>
            {running && <ProgressBar pct={progress} label={`Enriching records... ${progress}%`} />}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="flex items-center gap-2"><Terminal size={14} className="text-green-400" /><span className="font-semibold text-white text-sm">Live Output</span></div></div>
          <div ref={logRef} className="bg-black/70 p-4 h-56 overflow-y-auto font-mono text-xs space-y-0.5">
            {liveLog.length === 0 ? <div className="text-slate-600">Click "Run Enrichment" to start enriching records.</div>
              : liveLog.map((line, i) => <div key={i} className={line.includes('✓') ? 'text-green-400' : line.includes('✗') ? 'text-red-400' : 'text-green-300'}>{line}</div>)}
            {running && <div className="animate-pulse text-green-700">▌</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
