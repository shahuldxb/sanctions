import React, { useState } from 'react'
import { screenSubject } from '../../api'
import { Badge, ScoreBar, Field, Spinner, PageHeader, ProgressBar } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Layers, Upload, Play, Download, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Batch Screener',
  entities: [{
    name: 'Batch Screening', description: 'Screen multiple subjects simultaneously against all sanctions lists',
    fields: [
      { name: 'subjects', type: 'array', description: 'List of subjects to screen (one per line or CSV upload)', required: true },
      { name: 'threshold', type: 'int', description: 'Match threshold 0-100 (default 60)' },
      { name: 'lists', type: 'array', description: 'Lists to check (default: all active lists)' },
    ]
  }]
}

const DEMO_NAMES = `VLADIMIR PUTIN
BASHAR AL-ASSAD
KIM JONG UN
ALI KHAMENEI
HASSAN ROUHANI
JOHN SMITH
MARIA GARCIA
AHMED HASSAN
CHEN WEI
FATIMA AL-ZAHRA`

export default function ScreeningBatch() {
  const [input, setInput] = useState(DEMO_NAMES)
  const [threshold, setThreshold] = useState(60)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stats, setStats] = useState({ total: 0, blocked: 0, review: 0, clear: 0 })

  const run = async () => {
    const names = input.split('\n').map(n => n.trim()).filter(Boolean)
    if (!names.length) { toast.error('Enter at least one name'); return }
    setLoading(true); setResults([]); setProgress(0)
    const res: any[] = []
    let blocked = 0, review = 0, clear = 0
    for (let i = 0; i < names.length; i++) {
      try {
        const r = await screenSubject({
          subjects: [{ subject_name: names[i], subject_type: 'INDIVIDUAL' }],
          source_system: 'BATCH_SCREEN', requested_by: 'Compliance Officer', threshold
        })
        const result = r.data.overallResult
        if (result === 'BLOCKED') blocked++
        else if (result === 'POTENTIAL_MATCH') review++
        else clear++
        res.push({ name: names[i], ...r.data })
        setResults([...res])
        setProgress(Math.round(((i + 1) / names.length) * 100))
        setStats({ total: i + 1, blocked, review, clear })
      } catch { res.push({ name: names[i], overallResult: 'ERROR', matches: [] }) }
    }
    setLoading(false)
    toast.success(`Batch complete: ${blocked} blocked, ${review} review, ${clear} clear`)
  }

  const exportCSV = () => {
    const rows = [['Name', 'Result', 'Top Score', 'Matches', 'Lists Hit']]
    results.forEach(r => rows.push([r.name, r.overallResult, r.topScore || 0, r.matches?.length || 0, r.matches?.map((m: any) => m.source_code).join(';') || '']))
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'batch_screening.csv'; a.click()
  }

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Batch Screener" subtitle="Screen multiple subjects against all active sanctions lists" icon={Layers}
        actions={results.length > 0 ? <button className="btn-ghost" onClick={exportCSV}><Download size={14} /> Export CSV</button> : undefined} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card">
          <div className="card-header"><span className="font-semibold text-white">Input</span></div>
          <div className="p-5 space-y-4">
            <Field label="Names (one per line)">
              <textarea className="input h-64 font-mono text-xs resize-none" value={input} onChange={e => setInput(e.target.value)} placeholder="Enter names, one per line..." />
            </Field>
            <Field label={`Threshold: ${threshold}%`}>
              <input type="range" min={40} max={100} value={threshold} onChange={e => setThreshold(parseInt(e.target.value))} className="w-full accent-blue-500" />
            </Field>
            {loading && <ProgressBar pct={progress} label={`Processing ${stats.total} subjects...`} />}
            <button className="btn-primary w-full py-3" onClick={run} disabled={loading}>
              {loading ? <><Spinner size={16} /> Running batch...</> : <><Play size={16} /> Run Batch Screen</>}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {loading && (
            <div className="grid grid-cols-4 gap-3">
              {[['Total', stats.total, 'text-white'], ['Blocked', stats.blocked, 'text-red-400'], ['Review', stats.review, 'text-amber-400'], ['Clear', stats.clear, 'text-green-400']].map(([l, v, c]) => (
                <div key={l as string} className="card p-4 text-center">
                  <div className={`text-2xl font-bold ${c}`}>{v}</div>
                  <div className="text-xs text-slate-500">{l}</div>
                </div>
              ))}
            </div>
          )}

          {results.length > 0 && (
            <>
              <div className="grid grid-cols-4 gap-3">
                {[['Total', stats.total, 'text-white'], ['Blocked', stats.blocked, 'text-red-400'], ['Review', stats.review, 'text-amber-400'], ['Clear', stats.clear, 'text-green-400']].map(([l, v, c]) => (
                  <div key={l as string} className="card p-4 text-center">
                    <div className={`text-2xl font-bold ${c}`}>{v}</div>
                    <div className="text-xs text-slate-500">{l}</div>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Name</th><th>Result</th><th>Top Score</th><th>Matches</th><th>Lists Hit</th></tr></thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i}>
                          <td className="font-medium text-white">{r.name}</td>
                          <td><Badge value={r.overallResult} /></td>
                          <td>
                            {r.topScore > 0 ? (
                              <div className="flex items-center gap-2 w-24">
                                <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${r.topScore >= 90 ? 'bg-red-500' : r.topScore >= 70 ? 'bg-amber-500' : 'bg-yellow-500'}`} style={{ width: `${r.topScore}%` }} />
                                </div>
                                <span className="text-xs font-bold">{r.topScore}%</span>
                              </div>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td>{r.matches?.length || 0}</td>
                          <td className="text-xs">{[...new Set(r.matches?.map((m: any) => m.source_code) || [])].join(', ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {!loading && results.length === 0 && (
            <div className="card flex items-center justify-center py-24">
              <div className="text-center">
                <Layers size={48} className="text-slate-700 mx-auto mb-4" />
                <p className="text-slate-500">Enter names and run batch screening</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
