import React, { useState } from 'react'
import { api } from '../../api'
import { Spinner, PageHeader, Field } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { FileSearch, Brain, Globe, User, Building, Ship } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'AI Entity Analysis',
  entities: [{
    name: 'ai_analysis_results', description: 'AI-powered deep analysis of entities for sanctions risk',
    fields: [
      { name: 'subject', type: 'varchar', description: 'Entity name or identifier' },
      { name: 'entity_type', type: 'enum', description: 'INDIVIDUAL | ENTITY | VESSEL' },
      { name: 'analysis_type', type: 'enum', description: 'FULL | QUICK | NETWORK | MEDIA' },
      { name: 'risk_score', type: 'int', description: 'AI risk score 0-100' },
      { name: 'risk_level', type: 'enum', description: 'LOW | MEDIUM | HIGH | CRITICAL' },
      { name: 'summary', type: 'text', description: 'AI-generated analysis summary' },
      { name: 'name_variants', type: 'text', description: 'Discovered name variants' },
      { name: 'risk_factors', type: 'text', description: 'Identified risk factors' },
    ]
  }]
}

export default function AIAnalysis() {
  const [form, setForm] = useState({ subject: '', entity_type: 'INDIVIDUAL', nationality: '', dob: '', analysis_type: 'FULL' })
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const analyze = async () => {
    if (!form.subject.trim()) { toast.error('Enter a subject name'); return }
    setLoading(true); setResult(null)
    try {
      const r = await api.post('/ai/analyze', form)
      setResult(r.data)
      toast.success('Analysis complete')
    } catch (e: any) { toast.error('Analysis failed: ' + (e.message || e)) }
    setLoading(false)
  }

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))
  const getRiskColor = (r: string) => ({ CRITICAL: 'text-red-400', HIGH: 'text-red-400', MEDIUM: 'text-amber-400', LOW: 'text-green-400' }[r] || 'text-slate-400')

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="AI Entity Analysis" subtitle="Deep AI-powered analysis of entities for sanctions and compliance risk" icon={FileSearch} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card">
          <div className="card-header"><span className="font-semibold text-white">Analysis Parameters</span></div>
          <div className="p-5 space-y-4">
            <Field label="Subject Name" required><input className="input" value={form.subject} onChange={e => f('subject', e.target.value)} placeholder="Full name or entity..." onKeyDown={e => e.key === 'Enter' && analyze()} /></Field>
            <Field label="Entity Type">
              <div className="grid grid-cols-3 gap-2">
                {[['INDIVIDUAL', User], ['ENTITY', Building], ['VESSEL', Ship]].map(([t, Icon]: any) => (
                  <button key={t} onClick={() => f('entity_type', t)} className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${form.entity_type === t ? 'border-blue-500 bg-blue-900/20 text-blue-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                    <Icon size={16} />{t}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Nationality (ISO2)"><input className="input" value={form.nationality} onChange={e => f('nationality', e.target.value)} maxLength={2} placeholder="e.g., IR, SY" /></Field>
            <Field label="Date of Birth"><input className="input" type="date" value={form.dob} onChange={e => f('dob', e.target.value)} /></Field>
            <Field label="Analysis Depth">
              <select className="select" value={form.analysis_type} onChange={e => f('analysis_type', e.target.value)}>
                <option value="QUICK">Quick (5s)</option>
                <option value="FULL">Full Analysis (30s)</option>
                <option value="NETWORK">Network Deep Dive (60s)</option>
                <option value="MEDIA">Adverse Media (45s)</option>
              </select>
            </Field>
            <button className="btn-primary w-full py-3" onClick={analyze} disabled={loading}>
              {loading ? <><Spinner size={16} /> Analyzing with Azure AI...</> : <><Brain size={16} /> Analyze Entity</>}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {loading && (
            <div className="card p-12 text-center">
              <Brain size={32} className="text-purple-400 mx-auto mb-3 animate-pulse" />
              <div className="text-white font-medium">Azure AI is analyzing "{form.subject}"</div>
              <div className="text-xs text-slate-500 mt-1">Running {form.analysis_type.toLowerCase()} analysis...</div>
            </div>
          )}

          {result && !loading && (
            <>
              <div className="card">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-lg font-bold text-white">{result.subject || form.subject}</div>
                      <div className="text-sm text-slate-400">{result.entity_type || form.entity_type}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-3xl font-black ${getRiskColor(result.risk_level)}`}>{result.risk_score || 0}</div>
                      <div className={`text-sm font-bold ${getRiskColor(result.risk_level)}`}>{result.risk_level || 'UNKNOWN'}</div>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-4">
                    <div className={`h-full rounded-full ${(result.risk_score || 0) >= 70 ? 'bg-red-500' : (result.risk_score || 0) >= 40 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${result.risk_score || 0}%` }} />
                  </div>
                  {result.summary && <div className="text-sm text-slate-300 leading-relaxed bg-slate-800/60 rounded-xl p-4">{result.summary}</div>}
                </div>
              </div>

              {result.name_variants?.length > 0 && (
                <div className="card">
                  <div className="card-header"><span className="font-semibold text-white">Name Variants & Transliterations</span></div>
                  <div className="p-4 flex flex-wrap gap-2">
                    {result.name_variants.map((v: string, i: number) => (
                      <span key={i} className="px-3 py-1 bg-blue-900/30 text-blue-300 text-sm rounded-full border border-blue-700/30">{v}</span>
                    ))}
                  </div>
                </div>
              )}

              {result.risk_factors?.length > 0 && (
                <div className="card">
                  <div className="card-header"><span className="font-semibold text-white">Risk Factors</span></div>
                  <div className="p-4 space-y-2">
                    {result.risk_factors.map((f: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-slate-300 p-2 bg-red-900/10 rounded-lg">
                        <span className="text-red-400 mt-0.5">▸</span>{f}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.recommendations?.length > 0 && (
                <div className="card">
                  <div className="card-header"><span className="font-semibold text-white">Recommendations</span></div>
                  <div className="p-4 space-y-2">
                    {result.recommendations.map((r: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-slate-300 p-2 bg-green-900/10 rounded-lg">
                        <span className="text-green-400 mt-0.5">✓</span>{r}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!result && !loading && (
            <div className="card p-12 text-center">
              <Brain size={48} className="text-slate-700 mx-auto mb-4" />
              <div className="text-slate-500 font-medium">Enter an entity name and click Analyze</div>
              <div className="text-xs text-slate-600 mt-2">Powered by Azure OpenAI · Analyzes sanctions risk, name variants, network connections, and adverse media</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
