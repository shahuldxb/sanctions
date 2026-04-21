import React, { useState } from 'react'
import { screenSubject, screenPEP, aiAnalyze } from '../../api'
import { Badge, ScoreBar, Spinner } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import {
  Zap, AlertTriangle, CheckCircle, XCircle, Bot, Shield,
  Clock, Cpu, Database, User, Flag, Briefcase, Globe,
  ChevronRight, Search, BarChart2, FileText, Activity
} from 'lucide-react'
import toast from 'react-hot-toast'

function parseEngineUsed(engineUsed: string) {
  if (!engineUsed) return null
  const msMatch        = engineUsed.match(/(\d+)ms/)
  const candidateMatch = engineUsed.match(/(\d+)\/(\d+)\s+candidates/)
  return {
    ms:         msMatch        ? parseInt(msMatch[1])        : null,
    candidates: candidateMatch ? parseInt(candidateMatch[1]) : null,
    total:      candidateMatch ? parseInt(candidateMatch[2]) : null,
    isRAM:      engineUsed.includes('IN_MEMORY'),
  }
}

const PAGE_META = {
  title: 'Master Screener',
  entities: [{
    name: 'Master Screener',
    description: 'Single search against all sanctions lists AND the PEP database simultaneously.',
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

// ── Verdict pill ──────────────────────────────────────────────────────────────
function VerdictPill({ overall }: { overall: string }) {
  const isBlocked = overall === 'BLOCKED' || overall === 'HIT'
  const isReview  = overall === 'POTENTIAL_MATCH' || overall === 'POSSIBLE_MATCH' || overall === 'REVIEW'
  if (isBlocked) return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/40 text-red-400 text-sm font-bold tracking-wide">
      <XCircle size={14} /> BLOCKED
    </span>
  )
  if (isReview) return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-sm font-bold tracking-wide">
      <AlertTriangle size={14} /> REVIEW
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-sm font-bold tracking-wide">
      <CheckCircle size={14} /> CLEAR
    </span>
  )
}

// ── Result summary card ───────────────────────────────────────────────────────
function ResultSummaryCard({ label, overall, matchCount, topScore, engineInfo, icon: Icon, accentClass, onClick, active, hitLists }: any) {
  const isBlocked = overall === 'BLOCKED' || overall === 'HIT'
  const isReview  = overall === 'POTENTIAL_MATCH' || overall === 'POSSIBLE_MATCH' || overall === 'REVIEW'
  const isClear   = !isBlocked && !isReview

  const leftBorder = isBlocked ? 'border-l-red-500' : isReview ? 'border-l-amber-500' : 'border-l-emerald-500'
  const activeBg   = active ? 'bg-slate-700/40' : 'bg-slate-800/30 hover:bg-slate-700/30'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border border-slate-700/60 border-l-4 ${leftBorder} ${activeBg} p-4 transition-all duration-150 cursor-pointer`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-lg ${accentClass}`}>
            <Icon size={16} />
          </div>
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-widest font-medium">{label}</div>
            <div className="mt-1"><VerdictPill overall={overall} /></div>
          </div>
        </div>
        <div className="text-right shrink-0">
          {engineInfo?.ms !== null && engineInfo?.ms !== undefined && (
            <div className="flex items-center gap-1 justify-end text-cyan-400">
              <Clock size={11} />
              <span className="text-base font-mono font-bold">{engineInfo.ms}</span>
              <span className="text-xs text-cyan-600">ms</span>
            </div>
          )}
          {engineInfo?.isRAM && (
            <div className="flex items-center gap-1 justify-end mt-0.5">
              <Cpu size={9} className="text-slate-500" />
              <span className="text-xs text-slate-500">RAM engine</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-sm">
        <div>
          <span className={`text-xl font-bold ${isBlocked ? 'text-red-400' : isReview ? 'text-amber-400' : 'text-emerald-400'}`}>
            {matchCount}
          </span>
          <span className="text-slate-500 text-xs ml-1">match{matchCount !== 1 ? 'es' : ''}</span>
        </div>
        {topScore > 0 && (
          <div>
            <span className={`text-xl font-bold ${topScore >= 90 ? 'text-red-400' : topScore >= 70 ? 'text-amber-400' : 'text-yellow-400'}`}>
              {topScore}%
            </span>
            <span className="text-slate-500 text-xs ml-1">top score</span>
          </div>
        )}
        {engineInfo?.candidates !== null && engineInfo?.candidates !== undefined && (
          <div className="ml-auto flex items-center gap-1 text-slate-500">
            <Database size={10} />
            <span className="text-xs">{engineInfo.candidates?.toLocaleString()} / {engineInfo.total?.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Hit list badges */}
      {hitLists && hitLists.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {hitLists.map((list: string) => (
            <span
              key={list}
              className={`text-xs px-2 py-0.5 rounded font-mono font-semibold border ${
                isBlocked ? 'bg-red-500/10 border-red-500/30 text-red-300' :
                isReview  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                            'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}
            >
              {list}
            </span>
          ))}
        </div>
      )}

      {active && (
        <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
          <ChevronRight size={12} />
          <span>Viewing details below</span>
        </div>
      )}
    </button>
  )
}

// ── Match row ─────────────────────────────────────────────────────────────────
function SanctionMatchRow({ m, index }: { m: any; index: number }) {
  const score = m.score ?? m.match_score ?? 0
  const scoreColor = score >= 90 ? 'text-red-400' : score >= 70 ? 'text-amber-400' : 'text-yellow-400'
  const scoreBg    = score >= 90 ? 'bg-red-500/10 border-red-500/20' : score >= 70 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-yellow-500/10 border-yellow-500/20'

  return (
    <div className="flex items-start gap-4 py-3.5 border-b border-slate-800/80 last:border-0">
      {/* Index */}
      <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-500 shrink-0 mt-0.5">
        {index + 1}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-white text-sm">{m.primary_name || m.name}</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-800/40">
                {m.list_source || m.source_code}
              </span>
              {m.list_name && (
                <span className="text-xs text-slate-400 truncate max-w-[200px]">{m.list_name}</span>
              )}
              {m.match_type && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 border border-slate-700">
                  {m.match_type}
                </span>
              )}
              {m.nationality && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Globe size={9} />{m.nationality}
                </span>
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
    </div>
  )
}

function PEPMatchRow({ m, index }: { m: any; index: number }) {
  const score = m.score ?? 0
  const scoreColor = score >= 90 ? 'text-red-400' : score >= 70 ? 'text-amber-400' : 'text-yellow-400'
  const scoreBg    = score >= 90 ? 'bg-red-500/10 border-red-500/20' : score >= 70 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-yellow-500/10 border-yellow-500/20'

  return (
    <div className="flex items-start gap-4 py-3.5 border-b border-slate-800/80 last:border-0">
      <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-500 shrink-0 mt-0.5">
        {index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-white text-sm">{m.name}</div>
            {m.matchedOn && m.matchedOn !== m.name && (
              <div className="text-xs text-slate-500 mt-0.5">
                Alias match: <span className="text-slate-300 italic">"{m.matchedOn}"</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {m.source && (
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-800/40">
                  {m.source}
                </span>
              )}
              {m.position && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Briefcase size={9} />{m.position}
                </span>
              )}
              {m.countries && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Flag size={9} />{m.countries}
                </span>
              )}
              {m.birthDate && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <User size={9} />DOB: {m.birthDate}
                </span>
              )}
            </div>
            {m.party && (
              <div className="text-xs text-slate-500 mt-1">Party: <span className="text-slate-300">{m.party}</span></div>
            )}
          </div>

          <div className={`shrink-0 px-3 py-1.5 rounded-lg border text-center ${scoreBg}`}>
            <div className={`text-lg font-bold font-mono ${scoreColor}`}>{score}%</div>
            <div className="text-xs text-slate-500 -mt-0.5">match</div>
          </div>
        </div>

        <div className="mt-2">
          <ScoreBar score={score} />
        </div>
      </div>
    </div>
  )
}

// ── Lower confidence matches group (collapsible) ────────────────────────────
function LowerMatchesGroup({ matches, threshold }: { matches: any[]; threshold: number }) {
  const [expanded, setExpanded] = React.useState(false)
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
            <p className="text-xs text-amber-400/70">These entries share name tokens with the subject but are likely different individuals. Review carefully before taking action.</p>
          </div>
          {matches.map((m: any, i: number) => <SanctionMatchRow key={i} m={m} index={i} />)}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ScreeningQuick() {
  const [form, setForm] = useState({
    name: '', entity_type: 'INDIVIDUAL', dob: '', nationality: '', id_number: '', threshold: 60
  })
  const [sanctionResult, setSanctionResult] = useState<any>(null)
  const [pepResult,      setPepResult]      = useState<any>(null)
  const [loading,        setLoading]        = useState(false)
  const [aiLoading,      setAiLoading]      = useState(false)
  const [aiResult,       setAiResult]       = useState<any>(null)
  const [activePanel,    setActivePanel]    = useState<'sanctions' | 'pep' | 'ai'>('sanctions')

  const screen = async () => {
    if (!form.name.trim()) { toast.error('Please enter a name'); return }
    setLoading(true)
    setSanctionResult(null)
    setPepResult(null)
    setAiResult(null)
    setActivePanel('sanctions')

    const [sanctionRes, pepRes] = await Promise.allSettled([
      screenSubject({
        subjects: [{ subject_name: form.name, subject_type: form.entity_type, dob: form.dob, nationality: form.nationality, id_number: form.id_number }],
        source_system: 'MASTER_SCREENER',
        requested_by: 'Compliance Officer',
        threshold: form.threshold
      }),
      screenPEP({ name: form.name, threshold: form.threshold, maxResults: 20 })
    ])

    if (sanctionRes.status === 'fulfilled') {
      const raw      = sanctionRes.value.data
      const subject0 = raw.results?.[0] || {}
      const matchList = subject0.matchList || subject0.matches || []
      const hitLists = Array.from(new Set(
        matchList
          .filter((m: any) => (m.primary_name || m.name || '').length <= 80)
          .map((m: any) => m.list_source || m.source_code || '')
          .filter(Boolean)
      )) as string[]
      setSanctionResult({
        ...raw,
        overallResult: subject0.result || raw.overallResult || 'CLEAR',
        matches:    matchList,
        topScore:   subject0.score      || 0,
        engineUsed: subject0.engineUsed || '',
        engineInfo: parseEngineUsed(subject0.engineUsed || ''),
        hitLists,
      })
    } else {
      toast.error('Sanctions screening failed')
    }

    if (pepRes.status === 'fulfilled') {
      setPepResult(pepRes.value.data)
    } else {
      toast.error('PEP screening failed')
    }

    const sOverall = sanctionRes.status === 'fulfilled' ? sanctionRes.value.data?.results?.[0]?.result || sanctionRes.value.data?.overallResult : null
    const pOverall = pepRes.status === 'fulfilled' ? pepRes.value.data?.result : null
    if (sOverall === 'BLOCKED' || pOverall === 'HIT') toast.error('⛔ BLOCKED / HIT detected!')
    else if (sOverall === 'POTENTIAL_MATCH' || pOverall === 'POSSIBLE_MATCH') toast('⚠️ Review required', { icon: '⚠️' })
    else toast.success('✓ Clear on all lists')

    setLoading(false)
  }

  const runAI = async () => {
    if (!sanctionResult && !pepResult) return
    setAiLoading(true)
    setActivePanel('ai')
    try {
      const allMatches = [
        ...(sanctionResult?.matches || []).map((m: any) => ({ ...m, _list: 'SANCTIONS' })),
        ...(pepResult?.matches || []).map((m: any) => ({ name: m.name, match_score: m.score, source_code: m.source, _list: 'PEP', position: m.position })),
      ]
      const r = await aiAnalyze({ subject_name: form.name, subject_type: form.entity_type, context: 'Master Screener (Sanctions + PEP)', matches: allMatches })
      setAiResult(r.data.analysis)
    } catch (e: any) { toast.error(e.message) }
    finally { setAiLoading(false) }
  }

  // Filter out description-text entries (primary_name > 80 chars are descriptions, not names)
  const allSanctionMatches = (sanctionResult?.matches || []) as any[]
  const sanctionMatches = allSanctionMatches.filter((m: any) => (m.primary_name || m.name || '').length <= 80)
  const pepMatches      = (pepResult?.matches || []) as any[]
  const hasResults      = sanctionResult || pepResult

  // Group sanctions matches: confirmed (≥90%) vs lower confidence (70-89%)
  const confirmedMatches = sanctionMatches.filter((m: any) => (m.score ?? m.match_score ?? 0) >= 90)
  const lowerMatches     = sanctionMatches.filter((m: any) => (m.score ?? m.match_score ?? 0) < 90)

  // Use pre-computed hitLists stored in state (computed at API call time)
  const sanctionHitLists = (sanctionResult?.hitLists || []) as string[]
  const pepHitLists = Array.from(new Set(
    pepMatches.map((m: any) => m.source || m.dataset || '').filter(Boolean)
  )) as string[]

  return (
    <div className="space-y-0">
      <SetPageHelp meta={PAGE_META} />

      {/* ── Page header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Zap size={18} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Master Screener</h1>
            <p className="text-sm text-slate-400">Simultaneous screening across all sanctions lists and PEP database</p>
          </div>
        </div>
      </div>

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
              {/* ── Summary row ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sanctionResult && (
                  <ResultSummaryCard
                    label="Sanctions Lists"
                    overall={sanctionResult.overallResult}
                    matchCount={sanctionMatches.length}
                    topScore={sanctionResult.topScore}
                    engineInfo={sanctionResult.engineInfo}
                    icon={Shield}
                    accentClass="bg-blue-500/10 text-blue-400"
                    onClick={() => setActivePanel('sanctions')}
                    active={activePanel === 'sanctions'}
                    hitLists={sanctionHitLists}
                  />
                )}
                {pepResult && (
                  <ResultSummaryCard
                    label="PEP Database"
                    overall={pepResult.result}
                    matchCount={pepMatches.length}
                    topScore={pepResult.topScore}
                    engineInfo={{ ms: pepResult.durationMs, isRAM: true, candidates: null, total: pepResult.totalPEPs }}
                    icon={User}
                    accentClass="bg-purple-500/10 text-purple-400"
                    onClick={() => setActivePanel('pep')}
                    active={activePanel === 'pep'}
                    hitLists={pepHitLists}
                  />
                )}
              </div>

              {/* ── Tab bar ── */}
              <div className="flex items-center gap-1 bg-slate-800/40 rounded-lg p-1 border border-slate-700/40">
                {[
                  { id: 'sanctions', label: `Sanctions`, count: sanctionMatches.length, icon: Shield },
                  { id: 'pep',       label: `PEP`,       count: pepMatches.length,      icon: User },
                  { id: 'ai',        label: 'AI Analysis', count: null,                 icon: Bot },
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

              {/* ── Sanctions detail ── */}
              {activePanel === 'sanctions' && (
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2.5">
                    <Shield size={14} className="text-blue-400" />
                    <span className="text-sm font-semibold text-white">Sanctions Matches</span>
                    {sanctionMatches.length > 0 && (
                      <span className="ml-auto text-xs text-slate-500">
                        {sanctionMatches.length} result{sanctionMatches.length !== 1 ? 's' : ''} · sorted by score
                      </span>
                    )}
                  </div>
                  {sanctionMatches.length === 0 ? (
                    <div className="py-12 text-center">
                      <CheckCircle size={28} className="text-emerald-500 mx-auto mb-2.5" />
                      <p className="text-slate-300 font-medium">No sanctions matches found</p>
                      <p className="text-slate-500 text-sm mt-1">Subject is not on any monitored sanctions list above the {form.threshold}% threshold</p>
                    </div>
                  ) : (
                    <div className="px-4">
                      {/* Confirmed high-confidence matches */}
                      {confirmedMatches.length > 0 && (
                        <>
                          <div className="py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
                            Confirmed Matches ({confirmedMatches.length})
                          </div>
                          {confirmedMatches.map((m: any, i: number) => <SanctionMatchRow key={i} m={m} index={i} />)}
                        </>
                      )}
                      {/* Lower confidence matches — collapsed by default */}
                      {lowerMatches.length > 0 && (
                        <LowerMatchesGroup matches={lowerMatches} threshold={form.threshold} />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── PEP detail ── */}
              {activePanel === 'pep' && (
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2.5">
                    <User size={14} className="text-purple-400" />
                    <span className="text-sm font-semibold text-white">PEP Matches</span>
                    {pepResult?.totalPEPs && (
                      <span className="ml-auto text-xs text-slate-500">
                        {pepResult.totalPEPs.toLocaleString()} entries in index
                      </span>
                    )}
                  </div>
                  {pepMatches.length === 0 ? (
                    <div className="py-12 text-center">
                      <CheckCircle size={28} className="text-emerald-500 mx-auto mb-2.5" />
                      <p className="text-slate-300 font-medium">No PEP matches found</p>
                      <p className="text-slate-500 text-sm mt-1">Subject does not appear in the Politically Exposed Persons database above the {form.threshold}% threshold</p>
                    </div>
                  ) : (
                    <div className="px-4">
                      {pepMatches.map((m: any, i: number) => <PEPMatchRow key={i} m={m} index={i} />)}
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
                        Get an expert compliance assessment across both sanctions and PEP results
                      </p>
                      <button
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                        onClick={runAI}
                      >
                        <Bot size={14} /> Run AI Analysis
                      </button>
                    </div>
                  )}

                  {!aiLoading && aiResult && (
                    <div className="p-5 space-y-4">
                      {/* Recommendation */}
                      <div className="rounded-lg bg-slate-900/50 border border-slate-700/60 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Activity size={13} className="text-blue-400" />
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recommendation</span>
                        </div>
                        <p className="text-slate-200 text-sm leading-relaxed">{aiResult.recommendation}</p>
                      </div>

                      {/* Reasoning */}
                      <div className="rounded-lg bg-slate-900/50 border border-slate-700/60 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <BarChart2 size={13} className="text-purple-400" />
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Reasoning</span>
                        </div>
                        <p className="text-slate-300 text-sm leading-relaxed">{aiResult.reasoning}</p>
                      </div>

                      {/* Regulatory basis */}
                      <div className="rounded-lg bg-slate-900/50 border border-slate-700/60 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText size={13} className="text-emerald-400" />
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Regulatory Basis</span>
                        </div>
                        <p className="text-slate-300 text-sm leading-relaxed">{aiResult.regulatory_basis}</p>
                      </div>

                      {/* Next steps */}
                      {aiResult.next_steps?.length > 0 && (
                        <div className="rounded-lg bg-slate-900/50 border border-slate-700/60 p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <ChevronRight size={13} className="text-amber-400" />
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Next Steps</span>
                          </div>
                          <ol className="space-y-2">
                            {aiResult.next_steps.map((s: string, i: number) => (
                              <li key={i} className="flex gap-3 text-sm text-slate-300">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/15 text-blue-400 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                                <span>{s}</span>
                              </li>
                            ))}
                          </ol>
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
