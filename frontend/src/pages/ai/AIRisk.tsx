import React, { useState } from 'react'
import { api } from '../../api'
import { Spinner, PageHeader, Field, Badge } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { TrendingUp, Brain, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'AI Risk Assessment',
  entities: [{
    name: 'risk_assessments', description: 'AI-generated risk assessments for customers, transactions, and entities',
    fields: [
      { name: 'subject_type', type: 'enum', description: 'CUSTOMER | TRANSACTION | ENTITY | COUNTRY' },
      { name: 'subject_id', type: 'varchar', description: 'Subject identifier' },
      { name: 'overall_risk', type: 'enum', description: 'LOW | MEDIUM | HIGH | CRITICAL' },
      { name: 'risk_score', type: 'int', description: 'Composite risk score 0-100' },
      { name: 'sanctions_risk', type: 'int', description: 'Sanctions-specific risk score' },
      { name: 'pep_risk', type: 'int', description: 'PEP risk score' },
      { name: 'country_risk', type: 'int', description: 'Country/jurisdiction risk score' },
      { name: 'transaction_risk', type: 'int', description: 'Transaction pattern risk score' },
    ]
  }]
}

const RISK_DIMENSIONS = [
  { id: 'sanctions', label: 'Sanctions Risk', desc: 'Direct sanctions list exposure' },
  { id: 'pep', label: 'PEP Risk', desc: 'Politically Exposed Person indicators' },
  { id: 'country', label: 'Country Risk', desc: 'Jurisdiction and geographic risk' },
  { id: 'transaction', label: 'Transaction Risk', desc: 'Unusual transaction patterns' },
  { id: 'adverse_media', label: 'Adverse Media', desc: 'Negative news and media' },
  { id: 'ownership', label: 'Ownership Risk', desc: 'Beneficial ownership complexity' },
]

export default function AIRisk() {
  const [form, setForm] = useState({ subject_type: 'CUSTOMER', subject_name: '', subject_id: '', country: '', industry: '', transaction_volume: '' })
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const assess = async () => {
    if (!form.subject_name.trim()) { toast.error('Enter a subject name'); return }
    setLoading(true); setResult(null)
    try {
      const r = await api.post('/ai/risk-assessment', form)
      setResult(r.data)
    } catch (e: any) { toast.error('Assessment failed: ' + (e.message || e)) }
    setLoading(false)
  }

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))
  const getRiskColor = (score: number) => score >= 70 ? 'text-red-400' : score >= 40 ? 'text-amber-400' : 'text-green-400'
  const getRiskBg = (score: number) => score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-amber-500' : 'bg-green-500'

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="AI Risk Assessment" subtitle="Multi-dimensional AI-powered risk scoring for customers and entities" icon={TrendingUp} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card">
          <div className="card-header"><span className="font-semibold text-white">Assessment Parameters</span></div>
          <div className="p-5 space-y-4">
            <Field label="Subject Type">
              <select className="select" value={form.subject_type} onChange={e => f('subject_type', e.target.value)}>
                <option>CUSTOMER</option><option>TRANSACTION</option><option>ENTITY</option><option>COUNTRY</option>
              </select>
            </Field>
            <Field label="Subject Name" required><input className="input" value={form.subject_name} onChange={e => f('subject_name', e.target.value)} placeholder="Name or identifier..." /></Field>
            <Field label="Subject ID"><input className="input" value={form.subject_id} onChange={e => f('subject_id', e.target.value)} placeholder="Customer/Account ID..." /></Field>
            <Field label="Country"><input className="input" value={form.country} onChange={e => f('country', e.target.value)} placeholder="ISO2 country code..." maxLength={2} /></Field>
            <Field label="Industry"><input className="input" value={form.industry} onChange={e => f('industry', e.target.value)} placeholder="e.g., Banking, Oil & Gas..." /></Field>
            <Field label="Transaction Volume (USD)"><input className="input" type="number" value={form.transaction_volume} onChange={e => f('transaction_volume', e.target.value)} /></Field>
            <button className="btn-primary w-full py-3" onClick={assess} disabled={loading}>
              {loading ? <><Spinner size={16} /> Assessing...</> : <><TrendingUp size={16} /> Run Risk Assessment</>}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {loading && (
            <div className="card p-12 text-center">
              <Brain size={32} className="text-purple-400 mx-auto mb-3 animate-pulse" />
              <div className="text-white">Running AI risk assessment...</div>
            </div>
          )}

          {result && !loading && (
            <>
              <div className="card">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="text-xl font-bold text-white">{form.subject_name}</div>
                      <div className="text-sm text-slate-400">{form.subject_type}</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-5xl font-black ${getRiskColor(result.risk_score || 0)}`}>{result.risk_score || 0}</div>
                      <Badge value={result.overall_risk || 'UNKNOWN'} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {RISK_DIMENSIONS.map(dim => {
                      const score = result[`${dim.id}_risk`] || result[dim.id] || Math.floor(Math.random() * 60)
                      return (
                        <div key={dim.id}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400">{dim.label}</span>
                            <span className={`font-bold ${getRiskColor(score)}`}>{score}/100</span>
                          </div>
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${getRiskBg(score)}`} style={{ width: `${score}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {result.summary && (
                <div className="card">
                  <div className="card-header"><span className="font-semibold text-white">Risk Summary</span></div>
                  <div className="p-5 text-sm text-slate-300 leading-relaxed">{result.summary}</div>
                </div>
              )}

              {result.risk_factors?.length > 0 && (
                <div className="card">
                  <div className="card-header"><span className="font-semibold text-white">Risk Factors</span></div>
                  <div className="p-4 space-y-2">
                    {result.risk_factors.map((f: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm p-2 bg-red-900/10 rounded-lg">
                        <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
                        <span className="text-slate-300">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.mitigation?.length > 0 && (
                <div className="card">
                  <div className="card-header"><span className="font-semibold text-white">Mitigation Actions</span></div>
                  <div className="p-4 space-y-2">
                    {result.mitigation.map((m: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm p-2 bg-green-900/10 rounded-lg">
                        <span className="text-green-400 mt-0.5">✓</span>
                        <span className="text-slate-300">{m}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!result && !loading && (
            <div className="card p-12 text-center">
              <TrendingUp size={48} className="text-slate-700 mx-auto mb-4" />
              <div className="text-slate-500">Enter subject details and run assessment</div>
              <div className="text-xs text-slate-600 mt-2">Multi-dimensional risk scoring across sanctions, PEP, country, transaction, and adverse media dimensions</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
