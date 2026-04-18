import React, { useEffect, useState } from 'react'
import { getLiabilities, createLiability, updateLiability, deleteLiability } from '../../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Wallet, Plus, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Liabilities',
  entities: [{
    name: 'core_liabilities', description: 'Customer liabilities including loans, mortgages, and credit facilities',
    fields: [
      { name: 'liability_number', type: 'varchar(20)', description: 'Unique liability reference' },
      { name: 'customer_id', type: 'int', description: 'FK to core_customers' },
      { name: 'liability_type', type: 'enum', description: 'MORTGAGE | PERSONAL_LOAN | CREDIT_CARD | OVERDRAFT | TRADE_FINANCE | BOND' },
      { name: 'outstanding_amount', type: 'decimal(18,2)', description: 'Current outstanding balance' },
      { name: 'original_amount', type: 'decimal(18,2)', description: 'Original principal amount' },
      { name: 'currency', type: 'varchar(3)', description: 'Currency' },
      { name: 'interest_rate', type: 'decimal(5,2)', description: 'Annual interest rate %' },
      { name: 'maturity_date', type: 'date', description: 'Loan maturity date' },
      { name: 'status', type: 'enum', description: 'ACTIVE | DEFAULTED | SETTLED | WRITTEN_OFF' },
    ]
  }]
}

const LIABILITY_TYPES = ['MORTGAGE', 'PERSONAL_LOAN', 'CREDIT_CARD', 'OVERDRAFT', 'TRADE_FINANCE', 'BOND', 'GUARANTEE']
const STATUSES = ['ACTIVE', 'DEFAULTED', 'SETTLED', 'WRITTEN_OFF', 'RESTRUCTURED']

export default function Liabilities() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [liabType, setLiabType] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await getLiabilities({ page, limit: 50, search, liability_type: liabType, status })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, liabType, status])

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) { await updateLiability(form.id, form); toast.success('Liability updated') }
      else { await createLiability(form); toast.success('Liability created') }
      setShowForm(false); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteLiability(selected.id); toast.success('Liability deleted')
    setShowDelete(false); load()
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))
  const totalOutstanding = data.reduce((s, d) => s + (parseFloat(d.outstanding_amount) || 0), 0)
  const defaulted = data.filter(d => d.status === 'DEFAULTED').length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Liabilities" subtitle="Customer loans, mortgages and credit facilities" icon={Wallet}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({ liability_type: 'PERSONAL_LOAN', currency: 'USD', status: 'ACTIVE' }); setShowForm(true) }} className="btn-primary"><Plus size={14} /> New Liability</button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Liabilities" value={total.toLocaleString()} />
        <StatCard label="Outstanding" value={`$${(totalOutstanding / 1e6).toFixed(2)}M`} color="text-amber-400" />
        <StatCard label="Defaulted" value={defaulted} color="text-red-400" />
        <StatCard label="Active" value={data.filter(d => d.status === 'ACTIVE').length} color="text-blue-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search liabilities..." />
          <select className="select w-44" value={liabType} onChange={e => { setLiabType(e.target.value); setPage(1) }}>
            <option value="">All Types</option>
            {LIABILITY_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="select w-36" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Liability #</th><th>Customer</th><th>Type</th><th>Outstanding</th><th>Original</th><th>Currency</th><th>Rate %</th><th>Maturity</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={10} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={10}><Empty message="No liabilities found" action={<button className="btn-primary" onClick={() => { setForm({ liability_type: 'PERSONAL_LOAN', currency: 'USD', status: 'ACTIVE' }); setShowForm(true) }}><Plus size={14} /> New Liability</button>} /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id}>
                  <td><span className="font-mono text-xs text-blue-300">{row.liability_number}</span></td>
                  <td className="text-xs text-slate-400">{row.customer_name || row.customer_id}</td>
                  <td><Badge value={row.liability_type} /></td>
                  <td className="font-mono text-sm font-semibold text-amber-400">{parseFloat(row.outstanding_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}</td>
                  <td className="font-mono text-xs text-slate-400">{parseFloat(row.original_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}</td>
                  <td><span className="font-mono text-xs">{row.currency}</span></td>
                  <td className="text-xs text-slate-400">{row.interest_rate ? `${row.interest_rate}%` : '—'}</td>
                  <td className="text-xs text-slate-400">{row.maturity_date ? new Date(row.maturity_date).toLocaleDateString() : '—'}</td>
                  <td><Badge value={row.status} /></td>
                  <td><CrudActions onEdit={() => { setForm(row); setShowForm(true) }} onDelete={() => { setSelected(row); setShowDelete(true) }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} total={total} limit={50} onChange={setPage} /></div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Liability' : 'New Liability'} size="lg">
        <div className="p-6 grid grid-cols-2 gap-4">
          <Field label="Liability Type"><select className="select" value={form.liability_type || 'PERSONAL_LOAN'} onChange={e => f('liability_type', e.target.value)}>{LIABILITY_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Customer ID"><input className="input" type="number" value={form.customer_id || ''} onChange={e => f('customer_id', e.target.value)} /></Field>
          <Field label="Original Amount"><input className="input" type="number" step="0.01" value={form.original_amount || ''} onChange={e => f('original_amount', e.target.value)} /></Field>
          <Field label="Outstanding Amount"><input className="input" type="number" step="0.01" value={form.outstanding_amount || ''} onChange={e => f('outstanding_amount', e.target.value)} /></Field>
          <Field label="Currency"><select className="select" value={form.currency || 'USD'} onChange={e => f('currency', e.target.value)}><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>SGD</option></select></Field>
          <Field label="Interest Rate %"><input className="input" type="number" step="0.01" value={form.interest_rate || ''} onChange={e => f('interest_rate', e.target.value)} /></Field>
          <Field label="Maturity Date"><input className="input" type="date" value={form.maturity_date || ''} onChange={e => f('maturity_date', e.target.value)} /></Field>
          <Field label="Status"><select className="select" value={form.status || 'ACTIVE'} onChange={e => f('status', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <div className="col-span-2 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del} title="Delete Liability" message={`Delete liability "${selected?.liability_number}"?`} />
    </div>
  )
}
