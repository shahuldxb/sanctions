import React, { useEffect, useState } from 'react'
import { getCountries, createCountry, updateCountry, deleteCountry } from '../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { Globe, Plus, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Countries',
  entities: [{
    name: 'countries', description: 'Country risk registry with sanctions and embargo status',
    fields: [
      { name: 'country_code', type: 'varchar(2)', description: 'ISO2 country code', required: true },
      { name: 'country_name', type: 'varchar(200)', description: 'Full country name', required: true },
      { name: 'risk_level', type: 'enum', description: 'LOW | MEDIUM | HIGH | VERY_HIGH | EMBARGOED' },
      { name: 'is_sanctioned', type: 'bit', description: 'Country under sanctions' },
      { name: 'is_embargoed', type: 'bit', description: 'Full embargo in place' },
      { name: 'is_high_risk', type: 'bit', description: 'FATF high-risk jurisdiction' },
      { name: 'is_tax_haven', type: 'bit', description: 'Known tax haven jurisdiction' },
      { name: 'fatf_status', type: 'enum', description: 'NORMAL | GREY_LIST | BLACK_LIST' },
      { name: 'sanctions_programs', type: 'text', description: 'Active sanctions programs' },
    ]
  }]
}

const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH', 'EMBARGOED']
const FATF_STATUSES = ['NORMAL', 'GREY_LIST', 'BLACK_LIST']

export default function Countries() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [riskLevel, setRiskLevel] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await getCountries({ page, limit: 50, search, risk_level: riskLevel })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, riskLevel])

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) { await updateCountry(form.id, form); toast.success('Country updated') }
      else { await createCountry(form); toast.success('Country created') }
      setShowForm(false); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteCountry(selected.id); toast.success('Country deleted')
    setShowDelete(false); load()
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))
  const sanctioned = data.filter(d => d.is_sanctioned).length
  const embargoed = data.filter(d => d.is_embargoed).length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Countries" subtitle="Country risk registry with sanctions and embargo status" icon={Globe}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({ risk_level: 'LOW', fatf_status: 'NORMAL', is_sanctioned: false, is_embargoed: false }); setShowForm(true) }} className="btn-primary"><Plus size={14} /> Add Country</button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Countries" value={total.toLocaleString()} />
        <StatCard label="Sanctioned" value={sanctioned} color="text-red-400" />
        <StatCard label="Embargoed" value={embargoed} color="text-red-400" />
        <StatCard label="High Risk" value={data.filter(d => d.risk_level === 'HIGH' || d.risk_level === 'VERY_HIGH').length} color="text-amber-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search countries..." />
          <select className="select w-40" value={riskLevel} onChange={e => { setRiskLevel(e.target.value); setPage(1) }}>
            <option value="">All Risk Levels</option>
            {RISK_LEVELS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Code</th><th>Country</th><th>Risk Level</th><th>FATF Status</th><th>Sanctioned</th><th>Embargoed</th><th>High Risk</th><th>Tax Haven</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={9} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={9}><Empty message="No countries found" /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id} className={row.is_embargoed ? 'bg-red-900/10' : row.is_sanctioned ? 'bg-amber-900/5' : ''}>
                  <td><span className="font-mono text-sm font-bold text-blue-300">{row.country_code}</span></td>
                  <td className="font-medium text-white">{row.country_name}</td>
                  <td><Badge value={row.risk_level} /></td>
                  <td><Badge value={row.fatf_status || 'NORMAL'} /></td>
                  <td className="text-center">{row.is_sanctioned ? <span className="text-red-400 font-bold">YES</span> : <span className="text-slate-600">No</span>}</td>
                  <td className="text-center">{row.is_embargoed ? <span className="text-red-400 font-bold">YES</span> : <span className="text-slate-600">No</span>}</td>
                  <td className="text-center">{row.is_high_risk ? <span className="text-amber-400 font-bold">YES</span> : <span className="text-slate-600">No</span>}</td>
                  <td className="text-center">{row.is_tax_haven ? <span className="text-amber-400 font-bold">YES</span> : <span className="text-slate-600">No</span>}</td>
                  <td><CrudActions onEdit={() => { setForm(row); setShowForm(true) }} onDelete={() => { setSelected(row); setShowDelete(true) }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} total={total} limit={50} onChange={setPage} /></div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Country' : 'Add Country'} size="lg">
        <div className="p-6 grid grid-cols-2 gap-4">
          <Field label="Country Code (ISO2)" required><input className="input" value={form.country_code || ''} onChange={e => f('country_code', e.target.value.toUpperCase())} maxLength={2} /></Field>
          <Field label="Country Name" required><input className="input" value={form.country_name || ''} onChange={e => f('country_name', e.target.value)} /></Field>
          <Field label="Risk Level"><select className="select" value={form.risk_level || 'LOW'} onChange={e => f('risk_level', e.target.value)}>{RISK_LEVELS.map(r => <option key={r}>{r}</option>)}</select></Field>
          <Field label="FATF Status"><select className="select" value={form.fatf_status || 'NORMAL'} onChange={e => f('fatf_status', e.target.value)}>{FATF_STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <div className="col-span-2 grid grid-cols-4 gap-4">
            {[['is_sanctioned', 'Sanctioned'], ['is_embargoed', 'Embargoed'], ['is_high_risk', 'High Risk'], ['is_tax_haven', 'Tax Haven']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-blue-500" checked={!!form[k]} onChange={e => f(k, e.target.checked)} />
                <span className="text-sm text-slate-300">{l}</span>
              </label>
            ))}
          </div>
          <div className="col-span-2"><Field label="Sanctions Programs"><textarea className="input h-20 resize-none" value={form.sanctions_programs || ''} onChange={e => f('sanctions_programs', e.target.value)} placeholder="OFAC, EU, UN..." /></Field></div>
          <div className="col-span-2 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Add'}</button></div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del} title="Delete Country" message={`Delete country "${selected?.country_name}"?`} />
    </div>
  )
}
