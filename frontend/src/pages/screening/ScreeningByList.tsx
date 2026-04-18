import React, { useState } from 'react'
import { screenSubject } from '../../api'
import { Badge, ScoreBar, Field, Spinner, AlertBanner, PageHeader, StatCard } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Shield, Search, AlertTriangle, CheckCircle, XCircle, User, Building2, Ship, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props { source: string }

const SOURCE_INFO: Record<string, any> = {
  OFAC: { name: 'OFAC SDN', color: 'text-red-400', border: 'border-red-600/30', bg: 'bg-red-900/10', description: 'Screen against OFAC Specially Designated Nationals and Blocked Persons List', threshold: 60 },
  EU: { name: 'EU Consolidated', color: 'text-blue-400', border: 'border-blue-600/30', bg: 'bg-blue-900/10', description: 'Screen against EU Consolidated Financial Sanctions List', threshold: 65 },
  UN: { name: 'UN Security Council', color: 'text-teal-400', border: 'border-teal-600/30', bg: 'bg-teal-900/10', description: 'Screen against UN Security Council Consolidated Sanctions List', threshold: 65 },
  UK: { name: 'UK OFSI', color: 'text-purple-400', border: 'border-purple-600/30', bg: 'bg-purple-900/10', description: 'Screen against UK Office of Financial Sanctions Implementation list', threshold: 65 },
  SECO: { name: 'SECO Switzerland', color: 'text-amber-400', border: 'border-amber-600/30', bg: 'bg-amber-900/10', description: 'Screen against Swiss SECO Sanctions List', threshold: 65 },
  DFAT: { name: 'DFAT Australia', color: 'text-green-400', border: 'border-green-600/30', bg: 'bg-green-900/10', description: 'Screen against Australian DFAT Consolidated Sanctions List', threshold: 65 },
  MAS: { name: 'MAS Singapore', color: 'text-cyan-400', border: 'border-cyan-600/30', bg: 'bg-cyan-900/10', description: 'Screen against MAS Singapore Targeted Financial Sanctions', threshold: 65 },
}

export default function ScreeningByList({ source }: Props) {
  const info = SOURCE_INFO[source] || { name: source, color: 'text-white', border: 'border-slate-600', bg: 'bg-slate-900/10', description: '', threshold: 65 }

  const [form, setForm] = useState({ name: '', dob: '', nationality: '', entity_type: 'INDIVIDUAL', threshold: info.threshold })
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<any[]>([])

  const PAGE_META = {
    title: `${info.name} Screening`,
    entities: [{
      name: 'Screening Request', description: `Single-subject screening against the ${info.name} list`,
      fields: [
        { name: 'name', type: 'varchar', description: 'Subject name to screen', required: true },
        { name: 'dob', type: 'date', description: 'Date of birth (improves accuracy)' },
        { name: 'nationality', type: 'varchar', description: 'ISO2 country code (improves accuracy)' },
        { name: 'entity_type', type: 'enum', description: 'INDIVIDUAL | ENTITY | VESSEL' },
        { name: 'threshold', type: 'int', description: 'Minimum match score 0-100 (default: ' + info.threshold + ')' },
      ]
    }, {
      name: 'Screening Match', description: 'A potential match found during screening',
      fields: [
        { name: 'entry_name', type: 'varchar', description: 'Matched sanctions entry name' },
        { name: 'score', type: 'int', description: 'Match confidence score 0-100' },
        { name: 'match_type', type: 'enum', description: 'EXACT | FUZZY | PHONETIC | ALIAS' },
        { name: 'matched_field', type: 'varchar', description: 'Which field matched: PRIMARY_NAME | ALIAS' },
        { name: 'list_source', type: 'varchar', description: 'Source list of the match' },
        { name: 'programme', type: 'varchar', description: 'Sanctions programme' },
      ]
    }],
    techniques: [
      { name: 'Levenshtein Fuzzy Match', category: 'Core Algorithm', description: `Scores name similarity 0-100. Threshold: ${info.threshold}% for ${info.name}`, detail: `score = ((maxLen - editDist) / maxLen) × 100\nAuto-block: ≥ 90%\nReview: ≥ 65%\nClear: < ${info.threshold}%` },
      { name: 'Phonetic Boost', category: 'Enhancement', description: 'Soundex phonetic matching boosts score for phonetically similar names', detail: 'HUSSAIN/HUSSEIN → same Soundex H250\nBoost applied: +10 points if phonetic match\nPrevents false negatives on transliterated names' },
      { name: 'DOB/Nationality Scoring', category: 'Enhancement', description: 'Date of birth and nationality used to adjust match confidence', detail: 'Year match: +5 points\nYear mismatch: -10 points\nNationality match: +5 points\nHelps differentiate common names' }
    ]
  }

  const screen = async () => {
    if (!form.name.trim()) { toast.error('Please enter a name to screen'); return }
    setLoading(true)
    setResult(null)
    try {
      const r = await screenSubject({
        subjects: [{ subject_name: form.name, subject_type: form.entity_type, dob: form.dob, nationality: form.nationality }],
        source_system: `${source}_WORKBENCH`,
        requested_by: 'Compliance Officer',
        lists_to_check: [source],
        threshold: form.threshold
      })
      setResult(r.data)
      setHistory(prev => [{ name: form.name, result: r.data, ts: new Date().toISOString() }, ...prev.slice(0, 9)])
      if (r.data.overallResult === 'BLOCKED') toast.error('⛔ BLOCKED — High confidence match found!')
      else if (r.data.overallResult === 'POTENTIAL_MATCH') toast('⚠️ Potential match — Review required', { icon: '⚠️' })
      else toast.success('✓ Clear — No matches found')
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  const overall = result?.overallResult
  const matches = result?.matches || []

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />

      {/* Header */}
      <div className={`card mb-6 border ${info.border} ${info.bg}`}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <Shield size={24} className={info.color} />
            <h1 className="text-xl font-bold text-white">{info.name} Screening Workbench</h1>
          </div>
          <p className="text-sm text-slate-400">{info.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="lg:col-span-1">
          <div className="card">
            <div className="card-header"><span className="font-semibold text-white">Screen Subject</span></div>
            <div className="p-5 space-y-4">
              <Field label="Subject Name" required>
                <input className="input text-lg" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Enter full name..." onKeyDown={e => e.key === 'Enter' && screen()} />
              </Field>
              <Field label="Entity Type">
                <select className="select" value={form.entity_type} onChange={e => setForm(p => ({ ...p, entity_type: e.target.value }))}>
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="ENTITY">Entity / Company</option>
                  <option value="VESSEL">Vessel</option>
                </select>
              </Field>
              <Field label="Date of Birth">
                <input className="input" type="date" value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} />
              </Field>
              <Field label="Nationality (ISO2)">
                <input className="input" value={form.nationality} onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))} placeholder="e.g., IR, RU, SY" maxLength={2} />
              </Field>
              <Field label={`Match Threshold: ${form.threshold}%`}>
                <input type="range" min={40} max={100} value={form.threshold} onChange={e => setForm(p => ({ ...p, threshold: parseInt(e.target.value) }))} className="w-full accent-blue-500" />
                <div className="flex justify-between text-xs text-slate-500 mt-1"><span>40% (loose)</span><span>100% (exact)</span></div>
              </Field>
              <button className="btn-primary w-full py-3 text-base" onClick={screen} disabled={loading}>
                {loading ? <><Spinner size={16} /> Screening...</> : <><Search size={16} /> Screen Against {info.name}</>}
              </button>
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="card mt-4">
              <div className="card-header"><span className="text-sm font-semibold text-white">Recent Screens</span></div>
              <div className="divide-y divide-slate-800">
                {history.map((h, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/40"
                    onClick={() => { setForm(p => ({ ...p, name: h.name })); setResult(h.result) }}>
                    <span className="text-sm text-slate-300 truncate">{h.name}</span>
                    <Badge value={h.result?.overallResult || 'CLEAR'} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2">
          {!result && !loading && (
            <div className="card h-full flex items-center justify-center py-20">
              <div className="text-center">
                <Shield size={48} className={`${info.color} mx-auto mb-4 opacity-30`} />
                <p className="text-slate-500">Enter a name and click Screen to begin</p>
                <p className="text-xs text-slate-600 mt-2">Screening against {info.name}</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="card h-full flex items-center justify-center py-20">
              <div className="text-center">
                <Spinner size={48} />
                <p className="text-slate-400 mt-4">Screening "{form.name}" against {info.name}...</p>
                <p className="text-xs text-slate-600 mt-1">Running fuzzy match + phonetic analysis</p>
              </div>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4">
              {/* Result Banner */}
              <div className={`card border-2 p-6 ${overall === 'BLOCKED' ? 'border-red-600 bg-red-900/10' : overall === 'POTENTIAL_MATCH' ? 'border-amber-600 bg-amber-900/10' : 'border-green-600 bg-green-900/10'}`}>
                <div className="flex items-center gap-4">
                  {overall === 'BLOCKED' ? <XCircle size={40} className="text-red-400" /> :
                   overall === 'POTENTIAL_MATCH' ? <AlertTriangle size={40} className="text-amber-400" /> :
                   <CheckCircle size={40} className="text-green-400" />}
                  <div>
                    <div className="text-2xl font-bold text-white">{overall === 'BLOCKED' ? '⛔ BLOCKED' : overall === 'POTENTIAL_MATCH' ? '⚠️ POTENTIAL MATCH' : '✓ CLEAR'}</div>
                    <div className="text-sm text-slate-400 mt-0.5">
                      "{form.name}" screened against {info.name} — {matches.length} match{matches.length !== 1 ? 'es' : ''} found
                    </div>
                    {result.screeningRequestId && <div className="text-xs text-slate-600 font-mono mt-1">Request ID: {result.screeningRequestId}</div>}
                  </div>
                </div>
              </div>

              {/* Matches */}
              {matches.length > 0 && (
                <div className="card">
                  <div className="card-header"><span className="font-semibold text-white">Matches ({matches.length})</span></div>
                  <div className="divide-y divide-slate-800">
                    {matches.map((m: any, i: number) => (
                      <div key={i} className="p-4">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <div className="font-semibold text-white">{m.primary_name || m.entry_name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              <span className="font-mono text-blue-300">{m.source_code || m.list_source}</span>
                              {m.programme && <> · {m.programme}</>}
                              {m.entry_type && <> · <Badge value={m.entry_type} /></>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`text-2xl font-bold ${m.match_score >= 90 ? 'text-red-400' : m.match_score >= 70 ? 'text-amber-400' : 'text-yellow-400'}`}>{m.match_score}%</div>
                            <Badge value={m.match_type || 'FUZZY'} />
                          </div>
                        </div>
                        <ScoreBar score={m.match_score} />
                        <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                          <div><span className="text-slate-500">Matched on: </span><span className="text-slate-300">{m.matched_field || 'PRIMARY_NAME'}</span></div>
                          <div><span className="text-slate-500">Matched value: </span><span className="text-slate-300">{m.matched_value || m.primary_name}</span></div>
                          {m.dob && <div><span className="text-slate-500">DOB: </span><span className="text-slate-300">{m.dob}</span></div>}
                          {m.nationality && <div><span className="text-slate-500">Nationality: </span><span className="text-slate-300">{m.nationality}</span></div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="Total Matches" value={matches.length} />
                <StatCard label="Top Score" value={`${result.topScore || 0}%`} color={result.topScore >= 90 ? 'text-red-400' : result.topScore >= 70 ? 'text-amber-400' : 'text-green-400'} />
                <StatCard label="Screened At" value={result.screenedAt ? new Date(result.screenedAt).toLocaleTimeString() : '—'} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
