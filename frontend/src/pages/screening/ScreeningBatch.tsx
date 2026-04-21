import React, { useState, useRef } from 'react'
import { Badge, ScoreBar, Spinner, PageHeader, ProgressBar } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import {
  Layers, Play, Download, CheckCircle, XCircle, AlertTriangle,
  ChevronRight, Shield, User, Upload, Activity, Info, Bot
} from 'lucide-react'
import { aiAnalyze } from '../../api'
import toast from 'react-hot-toast'
import axios from 'axios'

const PAGE_META = {
  title: 'Batch Screener',
  entities: [{
    name: 'Batch Screening',
    description: 'Screen multiple subjects simultaneously against all sanctions lists and PEP database via unified RAM index.',
    fields: [
      { name: 'subjects', type: 'array', description: 'Names to screen (one per line or CSV upload)', required: true },
      { name: 'threshold', type: 'int', description: 'Match threshold 0-100 (default 60)' },
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

// ── List badge colours ────────────────────────────────────────────────────────
const LIST_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  OFAC:              { bg: 'bg-red-900/30',    text: 'text-red-300',    label: 'OFAC' },
  UN:                { bg: 'bg-orange-900/30', text: 'text-orange-300', label: 'UN' },
  EU:                { bg: 'bg-blue-900/30',   text: 'text-blue-300',   label: 'EU' },
  UK:                { bg: 'bg-indigo-900/30', text: 'text-indigo-300', label: 'UK' },
  SECO:              { bg: 'bg-sky-900/30',    text: 'text-sky-300',    label: 'SECO' },
  DFAT:              { bg: 'bg-teal-900/30',   text: 'text-teal-300',   label: 'DFAT' },
  MAS:               { bg: 'bg-cyan-900/30',   text: 'text-cyan-300',   label: 'MAS' },
  BIS:               { bg: 'bg-violet-900/30', text: 'text-violet-300', label: 'BIS' },
  OPENSANCTIONS_PEP: { bg: 'bg-purple-900/30', text: 'text-purple-300', label: 'OpenSanctions' },
  WIKIDATA:          { bg: 'bg-emerald-900/30',text: 'text-emerald-300',label: 'Wikidata' },
  ICIJ:              { bg: 'bg-amber-900/30',  text: 'text-amber-300',  label: 'ICIJ' },
}

function ListPill({ code }: { code: string }) {
  const cfg = LIST_BADGE[code] || { bg: 'bg-slate-700/60', text: 'text-slate-300', label: code }
  return (
    <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

function CategoryPill({ category }: { category: string }) {
  if (category === 'PEP') return (
    <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-purple-900/20 text-purple-400">PEP</span>
  )
  return (
    <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-900/20 text-blue-400">SANCTIONS</span>
  )
}

// ── Match list for a single subject with Sanctions/PEP/AI tabs ───────────────
function SubjectMatchTabs({ subjectName, matches }: { subjectName: string; matches: any[] }) {
  const [activeTab, setActiveTab] = useState<'sanctions' | 'pep' | 'ai'>('sanctions')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult]   = useState<any>(null)

  const sanctionsHits = matches.filter((m: any) => m.list_category === 'SANCTIONS')
  const pepHits       = matches.filter((m: any) => m.list_category === 'PEP')

  const runAI = async () => {
    setAiLoading(true)
    try {
      const r = await aiAnalyze({
        subject_name: subjectName,
        subject_type: 'INDIVIDUAL',
        context: 'Batch Screener (Unified — Sanctions + PEP)',
        matches: matches.map((m: any) => ({
          primary_name: m.primary_name, match_score: m.score,
          source_code: m.source_code, list_category: m.list_category, position: m.position,
        }))
      })
      setAiResult(r.data.analysis)
      setActiveTab('ai')
    } catch (e: any) { toast.error(e.message) }
    finally { setAiLoading(false) }
  }

  const renderMatchList = (list: any[]) => (
    list.length === 0
      ? <div className="py-8 text-center"><CheckCircle size={22} className="text-emerald-500 mx-auto mb-2" /><p className="text-slate-400 text-sm">No matches in this category</p></div>
      : <div className="space-y-1.5 p-3 max-h-64 overflow-y-auto">
          {list.map((m: any, i: number) => (
            <div key={i} className="flex items-start gap-2 text-xs bg-slate-900/60 rounded px-2 py-1.5">
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium truncate">{m.primary_name}</div>
                {m.matchedName && m.matchedName !== m.primary_name && (
                  <div className="text-slate-500 italic">via "{m.matchedName}"</div>
                )}
                <div className="flex flex-wrap gap-1 mt-1">
                  <CategoryPill category={m.list_category} />
                  <ListPill code={m.source_code} />
                  {m.position && <span className="text-slate-500 truncate max-w-[120px]">{m.position}</span>}
                </div>
              </div>
              <span className={`font-mono font-bold text-sm shrink-0 ${m.score >= 90 ? 'text-red-400' : m.score >= 70 ? 'text-amber-400' : 'text-yellow-400'}`}>
                {m.score}%
              </span>
            </div>
          ))}
        </div>
  )

  return (
    <div className="rounded-lg border border-slate-700/40 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-slate-700/40 bg-slate-900/40">
        {[
          { id: 'sanctions', label: 'Sanctions', count: sanctionsHits.length, icon: Shield, activeColor: 'border-blue-500 text-blue-400' },
          { id: 'pep',       label: 'PEP',       count: pepHits.length,       icon: User,   activeColor: 'border-purple-500 text-purple-400' },
          { id: 'ai',        label: 'AI Analysis', count: 0,                  icon: Bot,    activeColor: 'border-emerald-500 text-emerald-400' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => tab.id === 'ai' && !aiResult ? runAI() : setActiveTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id ? `${tab.activeColor} bg-slate-800/40` : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <tab.icon size={11} />
            {tab.label}
            {tab.id !== 'ai' && (
              <span className={`text-xs px-1 py-0.5 rounded font-mono ${
                tab.count > 0
                  ? tab.id === 'sanctions' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'
                  : 'bg-slate-700/60 text-slate-500'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>
      {/* Tab content */}
      {activeTab === 'sanctions' && renderMatchList(sanctionsHits)}
      {activeTab === 'pep' && renderMatchList(pepHits)}
      {activeTab === 'ai' && (
        <div className="p-3">
          {aiLoading && <div className="py-8 text-center"><Spinner size={28} /><p className="text-slate-400 mt-3 text-sm">Generating assessment...</p></div>}
          {!aiLoading && !aiResult && (
            <div className="py-8 text-center">
              <Bot size={24} className="text-slate-500 mx-auto mb-2" />
              <p className="text-slate-400 text-sm mb-3">AI Analysis not yet run</p>
              <button onClick={runAI} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors">
                <Bot size={12} /> Run AI Analysis
              </button>
            </div>
          )}
          {!aiLoading && aiResult && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge value={aiResult.risk_level || 'REVIEW_REQUIRED'} />
                <span className="text-xs text-slate-300">{aiResult.summary}</span>
              </div>
              {aiResult.reasoning && (
                <div className="rounded bg-slate-900/40 border border-slate-700/40 p-2">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Reasoning</div>
                  <p className="text-xs text-slate-300 leading-relaxed">{aiResult.reasoning}</p>
                </div>
              )}
              {aiResult.recommended_action && (
                <div className="rounded bg-blue-900/10 border border-blue-800/30 p-2">
                  <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Recommended Action</div>
                  <p className="text-xs text-slate-300">{aiResult.recommended_action}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Expandable row detail (legacy — kept for no-match rows) ───────────────────
function MatchDetail({ matches }: { matches: any[] }) {
  if (!matches.length) return <span className="text-slate-600 text-xs">—</span>
  return <span className="text-xs text-blue-400">{matches.length} match{matches.length !== 1 ? 'es' : ''}</span>
}

// ── Result row ────────────────────────────────────────────────────────────────
function ResultRow({ r, index }: { r: any; index: number }) {
  const topScore    = r.results?.[0]?.score ?? 0
  const matches     = r.results || []
  const sanctionHits = matches.filter((m: any) => m.list_category === 'SANCTIONS')
  const pepHits      = matches.filter((m: any) => m.list_category === 'PEP')
  const hitSources   = [...new Set(matches.map((m: any) => m.source_code))] as string[]

  const statusIcon = r.overallResult === 'BLOCKED'
    ? <XCircle size={14} className="text-red-400" />
    : r.overallResult === 'REVIEW' || r.overallResult === 'POTENTIAL_MATCH'
    ? <AlertTriangle size={14} className="text-amber-400" />
    : r.overallResult === 'ERROR'
    ? <AlertTriangle size={14} className="text-slate-500" />
    : <CheckCircle size={14} className="text-emerald-400" />

  return (
    <>
      <tr className={index % 2 === 0 ? 'bg-slate-900/20' : ''}>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {statusIcon}
            <span className="font-medium text-white text-sm">{r.name}</span>
          </div>
        </td>
        <td className="py-3 px-4"><Badge value={r.overallResult} /></td>
        <td className="py-3 px-4">
          {topScore > 0 ? (
            <div className="flex items-center gap-2 w-28">
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${topScore >= 90 ? 'bg-red-500' : topScore >= 70 ? 'bg-amber-500' : 'bg-yellow-500'}`} style={{ width: `${topScore}%` }} />
              </div>
              <span className={`text-xs font-bold font-mono ${topScore >= 90 ? 'text-red-400' : topScore >= 70 ? 'text-amber-400' : 'text-yellow-400'}`}>{topScore}%</span>
            </div>
          ) : <span className="text-slate-600 text-sm">—</span>}
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2 text-xs">
            {sanctionHits.length > 0 && <span className="flex items-center gap-1 text-blue-400"><Shield size={10} />{sanctionHits.length}</span>}
            {pepHits.length > 0 && <span className="flex items-center gap-1 text-purple-400"><User size={10} />{pepHits.length}</span>}
            {matches.length === 0 && <span className="text-slate-600">—</span>}
          </div>
        </td>
        <td className="py-3 px-4">
          <div className="flex flex-wrap gap-1">
            {hitSources.slice(0, 4).map((s: string) => <ListPill key={s} code={s} />)}
            {hitSources.length > 4 && <span className="text-xs text-slate-500">+{hitSources.length - 4}</span>}
            {hitSources.length === 0 && <span className="text-slate-600 text-xs">—</span>}
          </div>
        </td>
        <td className="py-3 px-4">
          {matches.length > 0
            ? <span className="text-xs text-blue-300">{matches.length} match{matches.length !== 1 ? 'es' : ''}</span>
            : <span className="text-slate-600 text-xs">—</span>
          }
        </td>
        <td className="py-3 px-4 text-xs text-slate-500 font-mono">{r.durationMs ? `${r.durationMs}ms` : '—'}</td>
      </tr>
      {matches.length > 0 && (
        <tr>
          <td colSpan={7} className="px-4 pb-3 pt-1 bg-slate-900/30">
            <SubjectMatchTabs subjectName={r.name} matches={matches} />
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ScreeningBatch() {
  const [input,     setInput]     = useState(DEMO_NAMES)
  const [threshold, setThreshold] = useState(60)
  const [results,   setResults]   = useState<any[]>([])
  const [loading,   setLoading]   = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [stats,     setStats]     = useState({ total: 0, blocked: 0, review: 0, clear: 0, pep: 0 })
  const fileRef = useRef<HTMLInputElement>(null)

  const run = async () => {
    const names = input.split('\n').map(n => n.trim()).filter(Boolean)
    if (!names.length) { toast.error('Enter at least one name'); return }
    setLoading(true); setResults([]); setProgress(0)
    setStats({ total: 0, blocked: 0, review: 0, clear: 0, pep: 0 })

    const res: any[] = []
    let blocked = 0, review = 0, clear = 0, pep = 0

    for (let i = 0; i < names.length; i++) {
      try {
        const r = await axios.post('/api/unified/screen', {
          name: names[i],
          threshold,
          maxResults: 20,
        })
        const data    = r.data
        const matches = data.results || []
        const topScore = matches[0]?.score ?? 0
        const hasPEP   = matches.some((m: any) => m.list_category === 'PEP')

        let overallResult = 'CLEAR'
        if (topScore >= 90) overallResult = 'BLOCKED'
        else if (topScore >= 70) overallResult = 'REVIEW'
        else if (topScore >= threshold) overallResult = 'POSSIBLE_MATCH'

        if (overallResult === 'BLOCKED') blocked++
        else if (overallResult === 'REVIEW' || overallResult === 'POSSIBLE_MATCH') review++
        else clear++
        if (hasPEP) pep++

        res.push({ name: names[i], overallResult, topScore, durationMs: data.durationMs, results: matches })
      } catch {
        res.push({ name: names[i], overallResult: 'ERROR', topScore: 0, results: [] })
      }
      setResults([...res])
      setProgress(Math.round(((i + 1) / names.length) * 100))
      setStats({ total: i + 1, blocked, review, clear, pep })
    }

    setLoading(false)
    toast.success(`Batch complete: ${blocked} blocked, ${review} review, ${clear} clear`)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      // Support CSV (first column) or plain text
      const lines = text.split('\n').map(l => {
        const parts = l.split(',')
        return parts[0].replace(/^["']|["']$/g, '').trim()
      }).filter(Boolean)
      setInput(lines.join('\n'))
      toast.success(`Loaded ${lines.length} names from file`)
    }
    reader.readAsText(file)
  }

  const exportCSV = () => {
    const rows = [['Name', 'Result', 'Top Score', 'Sanctions Hits', 'PEP Hits', 'Lists Hit', 'Duration (ms)']]
    results.forEach(r => {
      const sanctionHits = (r.results || []).filter((m: any) => m.list_category === 'SANCTIONS').length
      const pepHits      = (r.results || []).filter((m: any) => m.list_category === 'PEP').length
      const lists        = [...new Set((r.results || []).map((m: any) => m.source_code))].join(';')
      rows.push([r.name, r.overallResult, r.topScore || 0, sanctionHits, pepHits, lists, r.durationMs || 0])
    })
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `batch_screening_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const hasResults = results.length > 0

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader
        title="Batch Screener"
        subtitle="Screen multiple subjects against all sanctions lists and PEP database via unified RAM index"
        icon={Layers}
        actions={hasResults
          ? <button className="btn-ghost" onClick={exportCSV}><Download size={14} /> Export CSV</button>
          : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">

        {/* ── Left: Input panel ── */}
        <div className="space-y-4">
          <div className="card">
            <div className="card-header">
              <span className="font-semibold text-white">Input</span>
            </div>
            <div className="p-5 space-y-4">

              {/* Names textarea */}
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                  Names <span className="text-red-400">*</span>
                  <span className="text-slate-600 normal-case ml-1">(one per line)</span>
                </label>
                <textarea
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-xs font-mono placeholder-slate-600 focus:outline-none focus:border-blue-500 transition resize-none h-52"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Enter names, one per line..."
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-slate-600">
                    {input.split('\n').filter(n => n.trim()).length} names
                  </span>
                  <button
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={10} className="inline mr-1" />Upload CSV
                  </button>
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
                </div>
              </div>

              {/* Threshold */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Match Threshold</label>
                  <span className="text-sm font-bold text-blue-400 font-mono">{threshold}%</span>
                </div>
                <input
                  type="range" min={40} max={100}
                  value={threshold}
                  onChange={e => setThreshold(parseInt(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-600 mt-0.5">
                  <span>Broad (40%)</span>
                  <span>Exact (100%)</span>
                </div>
              </div>

              {/* Progress */}
              {loading && (
                <ProgressBar pct={progress} label={`Processing ${stats.total} of ${input.split('\n').filter(n=>n.trim()).length} subjects...`} />
              )}

              {/* Run button */}
              <button
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={run}
                disabled={loading}
              >
                {loading ? <><Spinner size={16} /> Running batch...</> : <><Play size={16} /> Run Batch Screen</>}
              </button>

              {/* Coverage note */}
              <div className="rounded-lg bg-slate-800/40 border border-slate-700/40 p-3 space-y-1.5">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Coverage</div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Shield size={10} className="text-blue-400" />
                  OFAC · EU · UN · UK · SECO · DFAT · MAS · BIS
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <User size={10} className="text-purple-400" />
                  OpenSanctions · Wikidata · ICIJ (700K+ PEP)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Results ── */}
        <div className="space-y-4">

          {/* Stats row — shown during and after run */}
          {(loading || hasResults) && (
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: 'Screened',   value: stats.total,   color: 'text-white' },
                { label: 'Blocked',    value: stats.blocked, color: stats.blocked > 0 ? 'text-red-400' : 'text-slate-400' },
                { label: 'Review',     value: stats.review,  color: stats.review > 0 ? 'text-amber-400' : 'text-slate-400' },
                { label: 'Clear',      value: stats.clear,   color: stats.clear > 0 ? 'text-emerald-400' : 'text-slate-400' },
                { label: 'PEP Hits',   value: stats.pep,     color: stats.pep > 0 ? 'text-purple-400' : 'text-slate-400' },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-3 text-center">
                  <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Results table */}
          {hasResults && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2.5">
                <Activity size={14} className="text-blue-400" />
                <span className="text-sm font-semibold text-white">Screening Results</span>
                <span className="ml-auto text-xs text-slate-500">{results.length} subjects · unified index</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/60 bg-slate-800/40">
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Subject</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Result</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Top Score</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Hits</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Lists</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Detail</th>
                      <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {results.map((r, i) => <ResultRow key={i} r={r} index={i} />)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !hasResults && (
            <div className="card flex items-center justify-center py-24">
              <div className="text-center">
                <Layers size={48} className="text-slate-700 mx-auto mb-4" />
                <p className="text-slate-400 font-medium">Enter names and run batch screening</p>
                <p className="text-slate-600 text-sm mt-1">Screens against all sanctions lists and 700K+ PEP entries simultaneously</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
