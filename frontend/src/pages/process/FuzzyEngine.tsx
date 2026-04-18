import React, { useState, useRef } from 'react'
import { api } from '../../api'
import { Spinner, PageHeader, StatCard, ProgressBar } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Search, Play, Terminal } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Fuzzy Matching Engine',
  entities: [{
    name: 'fuzzy_index', description: 'Phonetic and fuzzy search index for sanctions name matching',
    fields: [
      { name: 'entry_id', type: 'int', description: 'FK to sanctions_entries' },
      { name: 'original_name', type: 'varchar', description: 'Original name' },
      { name: 'soundex_code', type: 'varchar', description: 'Soundex phonetic code' },
      { name: 'metaphone_code', type: 'varchar', description: 'Metaphone phonetic code' },
      { name: 'ngrams', type: 'text', description: 'Character n-grams for fuzzy matching' },
      { name: 'normalized_name', type: 'varchar', description: 'Normalized/cleaned name for comparison' },
    ]
  }]
}

const ALGORITHMS = [
  { id: 'levenshtein', name: 'Levenshtein Distance', desc: 'Edit distance between strings' },
  { id: 'jaro_winkler', name: 'Jaro-Winkler', desc: 'Prefix-weighted string similarity' },
  { id: 'soundex', name: 'Soundex', desc: 'English phonetic algorithm' },
  { id: 'metaphone', name: 'Double Metaphone', desc: 'Advanced phonetic algorithm' },
  { id: 'ngram', name: 'N-Gram Similarity', desc: 'Character n-gram overlap' },
  { id: 'token_sort', name: 'Token Sort Ratio', desc: 'Word-order independent matching' },
]

export default function FuzzyEngine() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [liveLog, setLiveLog] = useState<string[]>([])
  const [testName, setTestName] = useState('')
  const [testResults, setTestResults] = useState<any[]>([])
  const [testing, setTesting] = useState(false)
  const [threshold, setThreshold] = useState(70)
  const logRef = useRef<HTMLDivElement>(null)

  const rebuildIndex = async () => {
    setRunning(true); setProgress(0)
    setLiveLog([`[${new Date().toLocaleTimeString()}] Rebuilding fuzzy search index...`])
    try {
      await api.post('/scraper/run/fuzzy_index')
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
      const es = new EventSource(`${baseUrl}/api/scraper/stream/fuzzy_index`)
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          const ts = new Date().toLocaleTimeString()
          if (d.type === 'log') setLiveLog(p => [...p.slice(-300), `[${ts}] ${d.message}`])
          else if (d.type === 'progress') { setProgress(d.progress); setLiveLog(p => [...p.slice(-300), `[${ts}] ${d.progress}% - ${d.message}`]) }
          else if (d.type === 'complete') { setProgress(100); setRunning(false); es.close(); toast.success('Index rebuilt') }
          else if (d.type === 'error') { setRunning(false); es.close(); toast.error(d.message) }
        } catch { }
      }
      es.onerror = () => { setRunning(false); es.close() }
    } catch (e: any) { toast.error(e.message); setRunning(false) }
  }

  const testFuzzy = async () => {
    if (!testName.trim()) return
    setTesting(true); setTestResults([])
    try {
      const r = await api.post('/screening/fuzzy-test', { name: testName, threshold })
      setTestResults(r.data?.matches || [])
    } catch (e: any) { toast.error(e.message) }
    setTesting(false)
  }

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Fuzzy Matching Engine" subtitle="Configure and test phonetic and fuzzy name matching algorithms" icon={Search}
        actions={<button onClick={rebuildIndex} disabled={running} className="btn-primary">{running ? <><Spinner size={14} /> Rebuilding...</> : <><Play size={14} /> Rebuild Index</>}</button>} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="card-header"><span className="font-semibold text-white">Matching Algorithms</span></div>
          <div className="p-5 space-y-2">
            {ALGORITHMS.map(alg => (
              <div key={alg.id} className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl">
                <div>
                  <div className="text-sm font-medium text-white">{alg.name}</div>
                  <div className="text-xs text-slate-500">{alg.desc}</div>
                </div>
                <span className="text-xs text-green-400 bg-green-900/20 px-2 py-0.5 rounded-full">Active</span>
              </div>
            ))}
            {running && <ProgressBar pct={progress} label={`Rebuilding index... ${progress}%`} />}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="font-semibold text-white">Live Fuzzy Test</span></div>
          <div className="p-5 space-y-4">
            <div>
              <label className="text-xs text-slate-400 uppercase mb-1 block">Test Name</label>
              <div className="flex gap-2">
                <input className="input flex-1" value={testName} onChange={e => setTestName(e.target.value)} placeholder="Enter name to test..." onKeyDown={e => e.key === 'Enter' && testFuzzy()} />
                <button onClick={testFuzzy} disabled={testing} className="btn-primary px-4">{testing ? <Spinner size={14} /> : <Search size={14} />}</button>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase mb-1 block">Threshold: {threshold}%</label>
              <input type="range" min={50} max={100} value={threshold} onChange={e => setThreshold(+e.target.value)} className="w-full accent-blue-500" />
            </div>
            {testResults.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {testResults.map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-slate-800/60 rounded-xl p-3">
                    <div>
                      <div className="text-sm text-white">{r.matched_name}</div>
                      <div className="text-xs text-slate-500">{r.algorithm} · {r.source_code}</div>
                    </div>
                    <div className={`text-sm font-bold ${r.score >= 90 ? 'text-red-400' : r.score >= 70 ? 'text-amber-400' : 'text-green-400'}`}>{r.score}%</div>
                  </div>
                ))}
              </div>
            )}
            {testing && <div className="text-center py-4"><Spinner size={24} /></div>}
            {!testing && testResults.length === 0 && testName && <div className="text-center text-slate-500 text-sm py-4">No matches above {threshold}% threshold</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="flex items-center gap-2"><Terminal size={14} className="text-green-400" /><span className="font-semibold text-white text-sm">Index Rebuild Log</span></div></div>
        <div ref={logRef} className="bg-black/70 p-4 h-40 overflow-y-auto font-mono text-xs space-y-0.5">
          {liveLog.length === 0 ? <div className="text-slate-600">Click "Rebuild Index" to see live output.</div>
            : liveLog.map((line, i) => <div key={i} className={line.includes('✓') ? 'text-green-400' : line.includes('✗') ? 'text-red-400' : 'text-green-300'}>{line}</div>)}
        </div>
      </div>
    </div>
  )
}
