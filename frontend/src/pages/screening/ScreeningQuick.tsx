import React, { useState, useEffect } from 'react'
import { aiAnalyze } from '../../api'
import { Badge, ScoreBar, Spinner } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import {
  Zap, AlertTriangle, CheckCircle, XCircle, Bot, Shield,
  Clock, Cpu, Database, User, Flag, Briefcase, Globe,
  ChevronRight, Search, BarChart2, FileText, Activity,
  AlertCircle, Info
} from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

const PAGE_META = {
  title: 'Master Screener',
  entities: [{
    name: 'Master Screener',
    description: 'Single search against all sanctions lists AND the PEP database simultaneously via unified RAM index.',
    fields: [
      { name: 'name', type: 'varchar', description: 'Subject name to screen', required: true },
      { name: 'entity_type', type: 'enum', description: 'INDIVIDUAL | ENTITY | VESSEL | AIRCRAFT' },
      { name: 'dob', type: 'date', description: 'Date of birth (improves accuracy)' },
      { name: 'nationality', type: 'varchar(2)', description: 'ISO2 country code' },
      { name: 'id_number', type: 'varchar', description: 'Passport, national ID, or registration number' },
      { name: 'threshold', type: 'int', description: 'Match threshold 0-100 (default 60)' },
    ]
  }]
}

// ── List type badge colours ───────────────────────────────────────────────────
const LIST_BADGE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  OFAC:               { bg: 'bg-red-900/30',    text: 'text-red-300',    border: 'border-red-800/40',    label: 'OFAC' },
  UN:                 { bg: 'bg-orange-900/30',  text: 'text-orange-300', border: 'border-orange-800/40', label: 'UN' },
  EU:                 { bg: 'bg-blue-900/30',    text: 'text-blue-300',   border: 'border-blue-800/40',   label: 'EU' },
  UK:                 { bg: 'bg-indigo-900/30',  text: 'text-indigo-300', border: 'border-indigo-800/40', label: 'UK' },
  SECO:               { bg: 'bg-sky-900/30',     text: 'text-sky-300',    border: 'border-sky-800/40',    label: 'SECO' },
  DFAT:               { bg: 'bg-teal-900/30',    text: 'text-teal-300',   border: 'border-teal-800/40',   label: 'DFAT' },
  MAS:                { bg: 'bg-cyan-900/30',    text: 'text-cyan-300',   border: 'border-cyan-800/40',   label: 'MAS' },
  BIS:                { bg: 'bg-violet-900/30',  text: 'text-violet-300', border: 'border-violet-800/40', label: 'BIS' },
  OPENSANCTIONS_PEP:  { bg: 'bg-purple-900/30',  text: 'text-purple-300', border: 'border-purple-800/40', label: 'OpenSanctions' },
  WIKIDATA:           { bg: 'bg-emerald-900/30', text: 'text-emerald-300',border: 'border-emerald-800/40',label: 'Wikidata' },
  ICIJ:               { bg: 'bg-amber-900/30',   text: 'text-amber-300',  border: 'border-amber-800/40',  label: 'ICIJ' },
}

function ListBadge({ code }: { code: string }) {
  const cfg = LIST_BADGE[code] || { bg: 'bg-slate-700/60', text: 'text-slate-300', border: 'border-slate-600', label: code }
  return (
    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  if (category === 'PEP') return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-900/20 text-purple-400 border border-purple-800/30">PEP</span>
  )
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-900/20 text-blue-400 border border-blue-800/30">SANCTIONS</span>
  )
}

// ── Verdict pill ──────────────────────────────────────────────────────────────
function VerdictPill({ score }: { score: number }) {
  if (score >= 90) return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/40 text-red-400 text-sm font-bold tracking-wide">
      <XCircle size={14} /> BLOCKED
    </span>
  )
  if (score >= 70) return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-sm font-bold tracking-wide">
      <AlertTriangle size={14} /> REVIEW
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/40 text-yellow-400 text-sm font-bold tracking-wide">
      <Info size={14} /> POSSIBLE
    </span>
  )
}

// ── Unified match row ─────────────────────────────────────────────────────────
function UnifiedMatchRow({ m, index }: { m: any; index: number }) {
  const score      = m.score ?? 0
  const scoreColor = score >= 90 ? 'text-red-400' : score >= 70 ? 'text-amber-400' : 'text-yellow-400'
  const scoreBg    = score >= 90 ? 'bg-red-500/10 border-red-500/20' : score >= 70 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-yellow-500/10 border-yellow-500/20'
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-slate-800/80 last:border-0">
      <div
        className="flex items-start gap-4 py-3.5 cursor-pointer hover:bg-slate-800/20 px-1 rounded transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Index */}
        <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-500 shrink-0 mt-0.5">
          {index + 1}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-white text-sm">{m.primary_name}</div>
              {m.matchedName && m.matchedName !== m.primary_name && (
                <div className="text-xs text-slate-500 mt-0.5">
                  Matched via alias: <span className="text-slate-300 italic">"{m.matchedName}"</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <CategoryBadge category={m.list_category} />
                <ListBadge code={m.source_code} />
                {m.position && (
                  <span className="flex items-center gap-1 text-xs text-slate-400 max-w-[200px] truncate">
                    <Briefcase size={9} />{m.position}
                  </span>
                )}
                {m.nationality && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Globe size={9} />{m.nationality}
                  </span>
                )}
                {m.birth_date && (
                  <span className="text-xs text-slate-500">b. {m.birth_date}</span>
                )}
              </div>
            </div>

            {/* Score badge */}
            <div className={`shrink-0 px-3 py-1.5 rounded-lg border text-center ${scoreBg}`}>
              <div className={`text-lg font-bold font-mono ${scoreColor}`}>{score}%</div>
              <div className="text-xs text-slate-500 -mt-0.5">match</div>
            </div>
          </div>

          {/* Score bar */}
          <div className="mt-2">
            <ScoreBar score={score} />
          </div>
        </div>

        <ChevronRight size={14} className={`text-slate-600 shrink-0 mt-1 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="ml-10 mb-3 p-3 rounded-lg bg-slate-900/40 border border-slate-700/40 text-xs space-y-1.5">
          {m.countries && <div><span className="text-slate-500">Countries:</span> <span className="text-slate-300">{m.countries}</span></div>}
          {m.dataset && <div><span className="text-slate-500">Dataset:</span> <span className="text-slate-300">{m.dataset}</span></div>}
          {m.political_party && <div><span className="text-slate-500">Party:</span> <span className="text-slate-300">{m.political_party}</span></div>}
          {m.adverse_links && <div><span className="text-slate-500">Adverse Links:</span> <span className="text-amber-300">{m.adverse_links}</span></div>}
          {m.wikidata_id && <div><span className="text-slate-500">Wikidata ID:</span> <span className="text-slate-300">{m.wikidata_id}</span></div>}
          {m.icij_node_id && <div><span className="text-slate-500">ICIJ Node:</span> <span className="text-slate-300">{m.icij_node_id}</span></div>}
          {m.listing_date && <div><span className="text-slate-500">Listed:</span> <span className="text-slate-300">{m.listing_date}</span></div>}
          {m.status && <div><span className="text-slate-500">Status:</span> <span className={m.status === 'ACTIVE' ? 'text-red-400' : 'text-slate-400'}>{m.status}</span></div>}
          {m.aliases && <div><span className="text-slate-500">Aliases:</span> <span className="text-slate-300">{m.aliases.replace(/\|/g, ' · ')}</span></div>}
          <div><span className="text-slate-500">Source:</span> <span className="text-slate-300">{m.source_name || m.source_code}</span></div>
          <div><span className="text-slate-500">External ID:</span> <span className="text-slate-400 font-mono">{m.external_id}</span></div>
        </div>
      )}
    </div>
  )
}

// ── Lower confidence group ────────────────────────────────────────────────────
function LowerMatchesGroup({ matches, threshold }: { matches: any[]; threshold: number }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
        <span>Lower Confidence ({matches.length}) — {threshold}–89% match</span>
        <ChevronRight size={12} className={`ml-auto transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      {expanded && (
        <div className="border border-slate-700/40 rounded-lg overflow-hidden mb-2">
          <div className="px-3 py-2 bg-amber-900/10 border-b border-slate-700/40">
            <p className="text-xs text-amber-400/70">These entries share name tokens but may be different individuals. Review carefully.</p>
          </div>
          {matches.map((m: any, i: number) => <UnifiedMatchRow key={i} m={m} index={i} />)}
        </div>
      )}
    </div>
  )
}

// ── Engine status bar ─────────────────────────────────────────────────────────
function EngineStatusBar() {
  const [status, setStatus] = useState<any>(null)
  useEffect(() => {
    axios.get('/api/unified/status').then(r => setStatus(r.data)).catch(() => {})
    const t = setInterval(() => {
      axios.get('/api/unified/status').then(r => setStatus(r.data)).catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [])

  if (!status) return null

  const pct = status.loadProgress?.pct ?? 0
  const isLoading = status.isLoading

  if (isLoading) return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-900/10 px-4 py-2.5 flex items-center gap-3 mb-4">
      <Cpu size={14} className="text-blue-400 animate-pulse shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-blue-300 font-medium">Loading unified index…</span>
          <span className="text-blue-400 font-mono">{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )

  if (!status.indexReady) return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-900/10 px-4 py-2.5 flex items-center gap-3 mb-4">
      <AlertCircle size={14} className="text-amber-400 shrink-0" />
      <span className="text-xs text-amber-300">Unified index not loaded — screening will use DB fallback</span>
    </div>
  )

  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-900/10 px-4 py-2 flex items-center gap-3 mb-4">
      <Cpu size={12} className="text-emerald-400 shrink-0" />
      <span className="text-xs text-emerald-300 font-medium">
        Unified RAM index ready — {status.totalInRAM?.toLocaleString()} entries ({status.tokenCount?.toLocaleString()} tokens)
      </span>
      <span className="ml-auto text-xs text-slate-500">
        {status.lastLoaded ? `Last loaded ${new Date(status.lastLoaded).toLocaleTimeString()}` : ''}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ScreeningQuick() {
  const [form, setForm] = useState({
    name: '', entity_type: 'INDIVIDUAL', dob: '', nationality: '', id_number: '', threshold: 60
  })
  const [result,      setResult]      = useState<any>(null)
  const [loading,     setLoading]     = useState(false)
  const [aiLoading,   setAiLoading]   = useState(false)
  const [aiResult,    setAiResult]    = useState<any>(null)
  const [activePanel, setActivePanel] = useState<'all' | 'sanctions' | 'pep' | 'ai'>('all')

  const screen = async () => {
    if (!form.name.trim()) { toast.error('Please enter a name'); return }
    setLoading(true)
    setResult(null)
    setAiResult(null)
    setActivePanel('all')

    try {
      const res = await axios.post('/api/unified/screen', {
        name:      form.name.trim(),
        threshold: form.threshold,
        maxResults: 50,
      })
      setResult(res.data)

      const hits = res.data.results || []
      const topScore = hits[0]?.score ?? 0
      const hasBlocked = hits.some((m: any) => m.score >= 90)
      const hasReview  = hits.some((m: any) => m.score >= 70 && m.score < 90)

      if (hasBlocked) toast.error(`⛔ ${hits.filter((m:any)=>m.score>=90).length} BLOCKED match(es) found!`)
      else if (hasReview) toast(`⚠️ Review required — ${hits.filter((m:any)=>m.score>=70).length} possible match(es)`, { icon: '⚠️' })
      else toast.success('✓ Clear across all lists and PEP database')
    } catch (e: any) {
      toast.error('Screening failed: ' + (e.response?.data?.error || e.message))
    } finally {
      setLoading(false)
    }
  }

  const runAI = async () => {
    if (!result?.results?.length) return
    setAiLoading(true)
    setActivePanel('ai')
    try {
      const allMatches = (result.results || []).map((m: any) => ({
        primary_name: m.primary_name,
        match_score: m.score,
        source_code: m.source_code,
        list_category: m.list_category,
        position: m.position,
        nationality: m.nationality,
      }))
      const r = await aiAnalyze({
        subject_name: form.name,
        subject_type: form.entity_type,
        context: 'Master Screener (Unified — Sanctions + PEP)',
        matches: allMatches
      })
      setAiResult(r.data.analysis)
    } catch (e: any) { toast.error(e.message) }
    finally { setAiLoading(false) }
  }

  const allMatches     = (result?.results || []) as any[]
  const sanctionHits   = allMatches.filter((m: any) => m.list_category === 'SANCTIONS')
  const pepHits        = allMatches.filter((m: any) => m.list_category === 'PEP')
  const confirmedHits  = allMatches.filter((m: any) => m.score >= 90)
  const reviewHits     = allMatches.filter((m: any) => m.score >= 70 && m.score < 90)
  const possibleHits   = allMatches.filter((m: any) => m.score < 70)
  const hasResults     = result !== null
  const topScore       = allMatches[0]?.score ?? 0

  const displayMatches = activePanel === 'all'       ? allMatches
                       : activePanel === 'sanctions'  ? sanctionHits
                       : activePanel === 'pep'        ? pepHits
                       : []

  const displayConfirmed = displayMatches.filter((m: any) => m.score >= 90)
  const displayLower     = displayMatches.filter((m: any) => m.score < 90)

  return (
    <div className="space-y-0">
      <SetPageHelp meta={PAGE_META} />

      {/* ── Page header ── */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Zap size={18} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Master Screener</h1>
            <p className="text-sm text-slate-400">Unified screening across all sanctions lists and PEP database via single RAM index</p>
          </div>
        </div>
      </div>

      {/* Engine status */}
      <EngineStatusBar />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">

        {/* ══ LEFT: Input panel ══ */}
        <div className="space-y-4">
          {/* Subject form */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2">
              <Search size={14} className="text-slate-400" />
              <span className="text-sm font-semibold text-slate-200">Subject Details</span>
            </div>
            <div className="p-4 space-y-3">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Full name or entity name..."
                  onKeyDown={e => e.key === 'Enter' && screen()}
                  autoFocus
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Type</label>
                <select
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition"
                  value={form.entity_type}
                  onChange={e => setForm(p => ({ ...p, entity_type: e.target.value }))}
                >
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="ENTITY">Entity / Organisation</option>
                  <option value="VESSEL">Vessel</option>
                  <option value="AIRCRAFT">Aircraft</option>
                </select>
              </div>

              {/* Two-column row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Date of Birth</label>
                  <input
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition"
                    type="date"
                    value={form.dob}
                    onChange={e => setForm(p => ({ ...p, dob: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">Nationality</label>
                  <input
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
                    value={form.nationality}
                    onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))}
                    placeholder="ISO2 e.g. RU"
                    maxLength={2}
                  />
                </div>
              </div>

              {/* ID Number */}
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">ID / Passport Number</label>
                <input
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500 transition"
                  value={form.id_number}
                  onChange={e => setForm(p => ({ ...p, id_number: e.target.value }))}
                  placeholder="Passport / Registration No."
                />
              </div>

              {/* Threshold */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Match Threshold</label>
                  <span className="text-sm font-bold text-blue-400 font-mono">{form.threshold}%</span>
                </div>
                <input
                  type="range" min={40} max={100}
                  value={form.threshold}
                  onChange={e => setForm(p => ({ ...p, threshold: parseInt(e.target.value) }))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-slate-600 mt-0.5">
                  <span>Broad (40%)</span>
                  <span>Exact (100%)</span>
                </div>
              </div>

              {/* Screen button */}
              <button
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                onClick={screen}
                disabled={loading}
              >
                {loading ? <><Spinner size={16} /> Screening...</> : <><Zap size={16} /> Run Master Screen</>}
              </button>

              {hasResults && (
                <button
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white text-sm transition-colors disabled:opacity-50"
                  onClick={runAI}
                  disabled={aiLoading}
                >
                  {aiLoading ? <><Spinner size={14} /> Analyzing...</> : <><Bot size={14} /> AI Compliance Analysis</>}
                </button>
              )}
            </div>
          </div>

          {/* Coverage panel */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-4 space-y-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Coverage</div>
            <div className="space-y-2">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded bg-blue-500/10 mt-0.5">
                  <Shield size={11} className="text-blue-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-blue-300 mb-0.5">Sanctions Lists</div>
                  <div className="flex flex-wrap gap-1">
                    {['OFAC', 'EU', 'UN', 'UK', 'SECO', 'DFAT', 'MAS', 'BIS'].map(l => (
                      <span key={l} className="text-xs px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 font-mono">{l}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded bg-purple-500/10 mt-0.5">
                  <User size={11} className="text-purple-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-purple-300 mb-0.5">PEP Database</div>
                  <div className="flex flex-wrap gap-1">
                    {['OpenSanctions', 'Wikidata', 'ICIJ'].map(l => (
                      <span key={l} className="text-xs px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">{l}</span>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">700K+ entries</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Results panel ══ */}
        <div className="space-y-4">

          {/* Empty state */}
          {!hasResults && !loading && (
            <div className="rounded-xl border border-slate-700/40 border-dashed bg-slate-800/10 flex flex-col items-center justify-center py-24 text-center">
              <div className="p-4 rounded-full bg-slate-800/60 mb-4">
                <Shield size={32} className="text-slate-600" />
              </div>
              <p className="text-slate-400 font-medium">No screening results yet</p>
              <p className="text-slate-600 text-sm mt-1">Enter a name and click Run Master Screen</p>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 flex flex-col items-center justify-center py-24 text-center">
              <Spinner size={40} />
              <p className="text-slate-400 mt-4 font-medium">Screening in progress...</p>
              <p className="text-slate-600 text-sm mt-1">Checking all sanctions lists and PEP database simultaneously</p>
            </div>
          )}

          {hasResults && !loading && (
            <>
              {/* ── Summary stats row ── */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Total Matches', value: allMatches.length, color: 'text-white' },
                  { label: 'Blocked (≥90%)', value: confirmedHits.length, color: confirmedHits.length > 0 ? 'text-red-400' : 'text-emerald-400' },
                  { label: 'Review (70–89%)', value: reviewHits.length, color: reviewHits.length > 0 ? 'text-amber-400' : 'text-slate-400' },
                  { label: 'Screened in', value: result?.durationMs ? `${result.durationMs}ms` : '—', color: 'text-cyan-400' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-3 text-center">
                    <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Tab bar ── */}
              <div className="flex items-center gap-1 bg-slate-800/40 rounded-lg p-1 border border-slate-700/40">
                {[
                  { id: 'all',       label: 'All Results',  count: allMatches.length,    icon: Activity },
                  { id: 'sanctions', label: 'Sanctions',    count: sanctionHits.length,  icon: Shield },
                  { id: 'pep',       label: 'PEP',          count: pepHits.length,       icon: User },
                  { id: 'ai',        label: 'AI Analysis',  count: null,                 icon: Bot },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActivePanel(tab.id as any)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                      activePanel === tab.id
                        ? 'bg-slate-700 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <tab.icon size={14} />
                    <span>{tab.label}</span>
                    {tab.count !== null && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
                        activePanel === tab.id ? 'bg-slate-600 text-slate-200' : 'bg-slate-700/60 text-slate-500'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── Match list ── */}
              {activePanel !== 'ai' && (
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2.5">
                    {activePanel === 'all'       && <Activity size={14} className="text-blue-400" />}
                    {activePanel === 'sanctions' && <Shield size={14} className="text-blue-400" />}
                    {activePanel === 'pep'       && <User size={14} className="text-purple-400" />}
                    <span className="text-sm font-semibold text-white">
                      {activePanel === 'all' ? 'All Matches' : activePanel === 'sanctions' ? 'Sanctions Matches' : 'PEP Matches'}
                    </span>
                    <span className="ml-auto text-xs text-slate-500">
                      {displayMatches.length} result{displayMatches.length !== 1 ? 's' : ''} · sorted by score
                    </span>
                  </div>

                  {displayMatches.length === 0 ? (
                    <div className="py-12 text-center">
                      <CheckCircle size={28} className="text-emerald-500 mx-auto mb-2.5" />
                      <p className="text-slate-300 font-medium">No matches found</p>
                      <p className="text-slate-500 text-sm mt-1">Subject is not on any monitored list above the {form.threshold}% threshold</p>
                    </div>
                  ) : (
                    <div className="px-4">
                      {/* Confirmed high-confidence matches */}
                      {displayConfirmed.length > 0 && (
                        <>
                          <div className="py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                            Confirmed Matches — ≥90% ({displayConfirmed.length})
                          </div>
                          {displayConfirmed.map((m: any, i: number) => <UnifiedMatchRow key={i} m={m} index={i} />)}
                        </>
                      )}
                      {/* Lower confidence matches */}
                      {displayLower.length > 0 && (
                        <LowerMatchesGroup matches={displayLower} threshold={form.threshold} />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── AI Analysis ── */}
              {activePanel === 'ai' && (
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2.5">
                    <Bot size={14} className="text-blue-400" />
                    <span className="text-sm font-semibold text-white">AI Compliance Assessment</span>
                    {aiResult && <Badge value={aiResult.risk_level || 'REVIEW_REQUIRED'} />}
                  </div>

                  {aiLoading && (
                    <div className="py-16 text-center">
                      <Spinner size={36} />
                      <p className="text-slate-400 mt-4">Generating compliance assessment...</p>
                    </div>
                  )}

                  {!aiLoading && !aiResult && (
                    <div className="py-16 text-center px-6">
                      <div className="p-3 rounded-full bg-slate-800/60 w-fit mx-auto mb-3">
                        <Bot size={28} className="text-slate-500" />
                      </div>
                      <p className="text-slate-300 font-medium">AI Analysis not yet run</p>
                      <p className="text-slate-500 text-sm mt-1 mb-4">
                        Get an expert compliance assessment across all screening results
                      </p>
                      <button
                        onClick={runAI}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                      >
                        <Bot size={14} /> Run AI Analysis
                      </button>
                    </div>
                  )}

                  {!aiLoading && aiResult && (
                    <div className="p-4 space-y-4">
                      <div className="flex items-center gap-3">
                        <Badge value={aiResult.risk_level || 'REVIEW_REQUIRED'} />
                        <span className="text-sm text-slate-300">{aiResult.summary}</span>
                      </div>
                      {aiResult.reasoning && (
                        <div className="rounded-lg bg-slate-900/40 border border-slate-700/40 p-3">
                          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reasoning</div>
                          <p className="text-sm text-slate-300 leading-relaxed">{aiResult.reasoning}</p>
                        </div>
                      )}
                      {aiResult.recommended_action && (
                        <div className="rounded-lg bg-blue-900/10 border border-blue-800/30 p-3">
                          <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Recommended Action</div>
                          <p className="text-sm text-slate-300">{aiResult.recommended_action}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
