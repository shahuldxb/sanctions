import React, { useState } from 'react'
import { screenSubject } from '../../api'
import { Badge, ScoreBar, Field, Spinner, PageHeader } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Layers, Search, Shield, Globe, Scale, Building2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const LISTS = [
  { code: 'OFAC', name: 'OFAC SDN', icon: Shield, color: 'text-red-400' },
  { code: 'EU', name: 'EU List', icon: Globe, color: 'text-blue-400' },
  { code: 'UN', name: 'UN List', icon: Scale, color: 'text-teal-400' },
  { code: 'UK', name: 'UK OFSI', icon: Building2, color: 'text-purple-400' },
  { code: 'SECO', name: 'SECO', icon: Shield, color: 'text-amber-400' },
  { code: 'DFAT', name: 'DFAT', icon: Shield, color: 'text-green-400' },
  { code: 'MAS', name: 'MAS', icon: Shield, color: 'text-cyan-400' },
]

const PAGE_META = {
  title: 'All Lists Screening',
  entities: [{ name: 'Multi-List Screen', description: 'Screen against all 7 sanctions lists simultaneously with per-list results', fields: [
    { name: 'name', type: 'varchar', description: 'Subject name', required: true },
    { name: 'entity_type', type: 'enum', description: 'INDIVIDUAL | ENTITY | VESSEL' },
    { name: 'threshold', type: 'int', description: 'Match threshold (default 60)' },
  ]}]
}

export default function ScreeningAll() {
  const [form, setForm] = useState({ name: '', entity_type: 'INDIVIDUAL', dob: '', nationality: '', threshold: 60 })
  const [results, setResults] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const screen = async () => {
    if (!form.name.trim()) { toast.error('Enter a name'); return }
    setLoading(true); setResults({}); setDone(false)
    const res: Record<string, any> = {}
    await Promise.all(LISTS.map(async (list) => {
      try {
        const r = await screenSubject({
          subjects: [{ subject_name: form.name, subject_type: form.entity_type, dob: form.dob, nationality: form.nationality }],
          source_system: 'ALL_LISTS_SCREEN', requested_by: 'Compliance Officer',
          lists_to_check: [list.code], threshold: form.threshold
        })
        res[list.code] = r.data
      } catch { res[list.code] = { overallResult: 'ERROR', matches: [] } }
      setResults({ ...res })
    }))
    setLoading(false); setDone(true)
    const blocked = Object.values(res).filter((r: any) => r.overallResult === 'BLOCKED').length
    if (blocked > 0) toast.error(`⛔ BLOCKED on ${blocked} list(s)!`)
    else if (Object.values(res).some((r: any) => r.overallResult === 'POTENTIAL_MATCH')) toast('⚠️ Potential matches found', { icon: '⚠️' })
    else toast.success('✓ Clear on all lists')
  }

  const overallBlocked = Object.values(results).some((r: any) => r.overallResult === 'BLOCKED')
  const overallReview = !overallBlocked && Object.values(results).some((r: any) => r.overallResult === 'POTENTIAL_MATCH')

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="All Lists Screening" subtitle="Screen simultaneously against all 7 active sanctions lists" icon={Layers} />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="card-header"><span className="font-semibold text-white">Subject</span></div>
          <div className="p-5 space-y-4">
            <Field label="Name" required><input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name..." onKeyDown={e => e.key === 'Enter' && screen()} /></Field>
            <Field label="Type"><select className="select" value={form.entity_type} onChange={e => setForm(p => ({ ...p, entity_type: e.target.value }))}><option value="INDIVIDUAL">Individual</option><option value="ENTITY">Entity</option><option value="VESSEL">Vessel</option></select></Field>
            <Field label="DOB"><input className="input" type="date" value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} /></Field>
            <Field label="Nationality"><input className="input" value={form.nationality} onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))} placeholder="ISO2" maxLength={2} /></Field>
            <Field label={`Threshold: ${form.threshold}%`}><input type="range" min={40} max={100} value={form.threshold} onChange={e => setForm(p => ({ ...p, threshold: parseInt(e.target.value) }))} className="w-full accent-blue-500" /></Field>
            <button className="btn-primary w-full py-3" onClick={screen} disabled={loading}>
              {loading ? <><Spinner size={16} /> Screening...</> : <><Search size={16} /> Screen All Lists</>}
            </button>
          </div>
        </div>

        <div className="lg:col-span-3">
          {done && (
            <div className={`card border-2 p-5 mb-4 ${overallBlocked ? 'border-red-600 bg-red-900/10' : overallReview ? 'border-amber-500 bg-amber-900/10' : 'border-green-600 bg-green-900/10'}`}>
              <div className="flex items-center gap-3">
                {overallBlocked ? <XCircle size={32} className="text-red-400" /> : overallReview ? <AlertTriangle size={32} className="text-amber-400" /> : <CheckCircle size={32} className="text-green-400" />}
                <div>
                  <div className="text-xl font-bold text-white">{overallBlocked ? '⛔ BLOCKED' : overallReview ? '⚠️ REVIEW REQUIRED' : '✓ CLEAR ON ALL LISTS'}</div>
                  <div className="text-sm text-slate-400">"{form.name}" screened against {LISTS.length} lists</div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {LISTS.map(list => {
              const r = results[list.code]
              const Icon = list.icon
              return (
                <div key={list.code} className={`card border ${r?.overallResult === 'BLOCKED' ? 'border-red-600/50 bg-red-900/5' : r?.overallResult === 'POTENTIAL_MATCH' ? 'border-amber-500/50 bg-amber-900/5' : r?.overallResult === 'CLEAR' ? 'border-green-600/30 bg-green-900/5' : 'border-slate-700'}`}>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className={list.color} />
                        <span className="font-semibold text-white text-sm">{list.name}</span>
                      </div>
                      {r ? <Badge value={r.overallResult} /> : loading ? <Spinner size={14} /> : <span className="text-slate-600 text-xs">—</span>}
                    </div>
                    {r?.matches?.length > 0 && (
                      <div className="space-y-2">
                        {r.matches.slice(0, 2).map((m: any, i: number) => (
                          <div key={i} className="bg-slate-800/60 rounded-lg p-2">
                            <div className="text-xs font-medium text-white truncate">{m.primary_name}</div>
                            <ScoreBar score={m.match_score} />
                          </div>
                        ))}
                        {r.matches.length > 2 && <div className="text-xs text-slate-500 text-center">+{r.matches.length - 2} more</div>}
                      </div>
                    )}
                    {r?.overallResult === 'CLEAR' && <div className="text-xs text-green-400 text-center py-2">No matches found</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
