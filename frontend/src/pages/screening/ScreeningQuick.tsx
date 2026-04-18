import React, { useState } from 'react'
import { screenSubject, aiAnalyze } from '../../api'
import { Badge, ScoreBar, Field, Spinner, PageHeader, StatCard, TabBar } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Zap, Search, AlertTriangle, CheckCircle, XCircle, Bot, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Quick Screen',
  entities: [{
    name: 'Quick Screening', description: 'Instant single-subject screening against all active sanctions lists simultaneously',
    fields: [
      { name: 'name', type: 'varchar', description: 'Subject name to screen', required: true },
      { name: 'entity_type', type: 'enum', description: 'INDIVIDUAL | ENTITY | VESSEL | AIRCRAFT' },
      { name: 'dob', type: 'date', description: 'Date of birth (improves accuracy for individuals)' },
      { name: 'nationality', type: 'varchar(2)', description: 'ISO2 country code' },
      { name: 'id_number', type: 'varchar', description: 'Passport, national ID, or registration number' },
      { name: 'threshold', type: 'int', description: 'Match threshold 0-100 (default 60)' },
    ]
  }]
}

export default function ScreeningQuick() {
  const [form, setForm] = useState({ name: '', entity_type: 'INDIVIDUAL', dob: '', nationality: '', id_number: '', threshold: 60 })
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<any>(null)
  const [tab, setTab] = useState('results')

  const screen = async () => {
    if (!form.name.trim()) { toast.error('Please enter a name'); return }
    setLoading(true); setResult(null); setAiResult(null)
    try {
      const r = await screenSubject({
        subjects: [{ subject_name: form.name, subject_type: form.entity_type, dob: form.dob, nationality: form.nationality, id_number: form.id_number }],
        source_system: 'QUICK_SCREEN',
        requested_by: 'Compliance Officer',
        threshold: form.threshold
      })
      setResult(r.data)
      if (r.data.overallResult === 'BLOCKED') toast.error('⛔ BLOCKED!')
      else if (r.data.overallResult === 'POTENTIAL_MATCH') toast('⚠️ Review required', { icon: '⚠️' })
      else toast.success('✓ Clear')
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  const runAI = async () => {
    if (!result) return
    setAiLoading(true)
    try {
      const r = await aiAnalyze({ subject_name: form.name, subject_type: form.entity_type, context: 'Quick Screen', matches: result.matches || [] })
      setAiResult(r.data.analysis)
      setTab('ai')
    } catch (e: any) { toast.error(e.message) }
    finally { setAiLoading(false) }
  }

  const overall = result?.overallResult
  const matches = result?.matches || []

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Quick Screen" subtitle="Instant screening against all active sanctions lists" icon={Zap} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input */}
        <div className="card">
          <div className="card-header"><span className="font-semibold text-white">Subject Details</span></div>
          <div className="p-5 space-y-4">
            <Field label="Name" required>
              <input className="input text-lg" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Full name..." onKeyDown={e => e.key === 'Enter' && screen()} autoFocus />
            </Field>
            <Field label="Type">
              <select className="select" value={form.entity_type} onChange={e => setForm(p => ({ ...p, entity_type: e.target.value }))}>
                <option value="INDIVIDUAL">Individual</option><option value="ENTITY">Entity</option>
                <option value="VESSEL">Vessel</option><option value="AIRCRAFT">Aircraft</option>
              </select>
            </Field>
            <Field label="Date of Birth"><input className="input" type="date" value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} /></Field>
            <Field label="Nationality"><input className="input" value={form.nationality} onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))} placeholder="ISO2 e.g. IR" maxLength={2} /></Field>
            <Field label="ID Number"><input className="input" value={form.id_number} onChange={e => setForm(p => ({ ...p, id_number: e.target.value }))} placeholder="Passport / Reg No." /></Field>
            <Field label={`Threshold: ${form.threshold}%`}>
              <input type="range" min={40} max={100} value={form.threshold} onChange={e => setForm(p => ({ ...p, threshold: parseInt(e.target.value) }))} className="w-full accent-blue-500" />
            </Field>
            <button className="btn-primary w-full py-3" onClick={screen} disabled={loading}>
              {loading ? <><Spinner size={16} /> Screening all lists...</> : <><Search size={16} /> Screen Now</>}
            </button>
            {result && (
              <button className="btn-ghost w-full" onClick={runAI} disabled={aiLoading}>
                {aiLoading ? <><Spinner size={14} /> Analyzing...</> : <><Bot size={14} /> AI Analysis</>}
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          {!result && !loading && (
            <div className="card h-full flex items-center justify-center py-24">
              <div className="text-center">
                <Shield size={56} className="text-slate-700 mx-auto mb-4" />
                <p className="text-slate-500 text-lg">Ready to screen</p>
                <p className="text-xs text-slate-600 mt-2">Will check OFAC, EU, UN, UK, SECO, DFAT, MAS simultaneously</p>
              </div>
            </div>
          )}
          {loading && (
            <div className="card h-full flex items-center justify-center py-24">
              <div className="text-center"><Spinner size={48} /><p className="text-slate-400 mt-4">Screening all lists...</p></div>
            </div>
          )}
          {result && !loading && (
            <div className="space-y-4">
              {/* Result */}
              <div className={`card border-2 p-6 ${overall === 'BLOCKED' ? 'border-red-600 bg-red-900/10' : overall === 'POTENTIAL_MATCH' ? 'border-amber-500 bg-amber-900/10' : 'border-green-600 bg-green-900/10'}`}>
                <div className="flex items-center gap-4">
                  {overall === 'BLOCKED' ? <XCircle size={44} className="text-red-400" /> : overall === 'POTENTIAL_MATCH' ? <AlertTriangle size={44} className="text-amber-400" /> : <CheckCircle size={44} className="text-green-400" />}
                  <div>
                    <div className="text-3xl font-bold text-white">{overall === 'BLOCKED' ? '⛔ BLOCKED' : overall === 'POTENTIAL_MATCH' ? '⚠️ REVIEW' : '✓ CLEAR'}</div>
                    <div className="text-slate-400">{matches.length} match{matches.length !== 1 ? 'es' : ''} across all lists · Top score: {result.topScore || 0}%</div>
                  </div>
                </div>
              </div>

              <TabBar tabs={[{ id: 'results', label: `Matches (${matches.length})` }, { id: 'ai', label: 'AI Analysis' }]} active={tab} onChange={setTab} />

              {tab === 'results' && (
                <div className="card">
                  {matches.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No matches found above threshold</div>
                  ) : (
                    <div className="divide-y divide-slate-800">
                      {matches.map((m: any, i: number) => (
                        <div key={i} className="p-4">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div>
                              <div className="font-semibold text-white">{m.primary_name}</div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                <span className="font-mono text-blue-300 bg-blue-900/20 px-1.5 py-0.5 rounded">{m.source_code}</span>
                                {m.programme && <> · {m.programme}</>}
                                {m.entry_type && <> · <Badge value={m.entry_type} /></>}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`text-xl font-bold ${m.match_score >= 90 ? 'text-red-400' : m.match_score >= 70 ? 'text-amber-400' : 'text-yellow-400'}`}>{m.match_score}%</div>
                              <Badge value={m.match_type || 'FUZZY'} />
                            </div>
                          </div>
                          <ScoreBar score={m.match_score} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'ai' && (
                <div className="card p-6">
                  {!aiResult ? (
                    <div className="text-center py-8">
                      <Bot size={40} className="text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-500">Click "AI Analysis" to get an expert compliance assessment</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <Bot size={20} className="text-blue-400" />
                        <span className="font-semibold text-white">AI Compliance Assessment</span>
                        <Badge value={aiResult.risk_level || 'REVIEW_REQUIRED'} />
                      </div>
                      <div className="bg-slate-800/60 rounded-xl p-4">
                        <div className="text-xs text-slate-400 uppercase mb-2">Recommendation</div>
                        <div className="text-slate-200">{aiResult.recommendation}</div>
                      </div>
                      <div className="bg-slate-800/60 rounded-xl p-4">
                        <div className="text-xs text-slate-400 uppercase mb-2">Reasoning</div>
                        <div className="text-slate-300 text-sm">{aiResult.reasoning}</div>
                      </div>
                      <div className="bg-slate-800/60 rounded-xl p-4">
                        <div className="text-xs text-slate-400 uppercase mb-2">Regulatory Basis</div>
                        <div className="text-slate-300 text-sm">{aiResult.regulatory_basis}</div>
                      </div>
                      {aiResult.next_steps?.length > 0 && (
                        <div className="bg-slate-800/60 rounded-xl p-4">
                          <div className="text-xs text-slate-400 uppercase mb-2">Next Steps</div>
                          <ul className="space-y-1">{aiResult.next_steps.map((s: string, i: number) => <li key={i} className="text-sm text-slate-300 flex gap-2"><span className="text-blue-400">→</span>{s}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
