import React, { useEffect, useState } from 'react'
import { getTradeFinance, createTradeFinance, updateTradeFinance, deleteTradeFinance, screenTradeFinance } from '../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { Package, Plus, RefreshCw, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Trade Finance',
  entities: [{
    name: 'trade_finance_instruments', description: 'Letters of Credit, Bank Guarantees, and Documentary Collections with sanctions screening',
    fields: [
      { name: 'instrument_number', type: 'varchar(50)', description: 'Unique instrument reference' },
      { name: 'instrument_type', type: 'enum', description: 'LC | SBLC | BG | DC | FORFAITING' },
      { name: 'applicant_name', type: 'varchar(500)', description: 'Applicant/buyer name (screened)' },
      { name: 'beneficiary_name', type: 'varchar(500)', description: 'Beneficiary/seller name (screened)' },
      { name: 'issuing_bank', type: 'varchar(200)', description: 'Issuing bank name' },
      { name: 'advising_bank', type: 'varchar(200)', description: 'Advising bank name' },
      { name: 'amount', type: 'decimal(18,2)', description: 'Instrument amount' },
      { name: 'currency', type: 'varchar(3)', description: 'Currency' },
      { name: 'goods_description', type: 'text', description: 'Description of goods/services' },
      { name: 'origin_country', type: 'varchar(2)', description: 'Country of origin ISO2' },
      { name: 'destination_country', type: 'varchar(2)', description: 'Destination country ISO2' },
      { name: 'sanctions_status', type: 'enum', description: 'CLEAR | PENDING_REVIEW | BLOCKED' },
      { name: 'status', type: 'enum', description: 'DRAFT | ISSUED | ADVISED | CONFIRMED | SETTLED | CANCELLED' },
    ]
  }]
}

const INSTRUMENT_TYPES = ['LC', 'SBLC', 'BG', 'DC', 'FORFAITING', 'SUPPLY_CHAIN']
const STATUSES = ['DRAFT', 'ISSUED', 'ADVISED', 'CONFIRMED', 'SETTLED', 'CANCELLED']

export default function TradeFinance() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [instrType, setInstrType] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [screening, setScreening] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await getTradeFinance({ page, limit: 50, search, instrument_type: instrType, status })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, instrType, status])

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) { await updateTradeFinance(form.id, form); toast.success('Instrument updated') }
      else { await createTradeFinance(form); toast.success('Instrument created') }
      setShowForm(false); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteTradeFinance(selected.id); toast.success('Instrument deleted')
    setShowDelete(false); load()
  }

  const runScreen = async (row: any) => {
    setScreening(row.id)
    try {
      const r = await screenTradeFinance(row.id)
      toast.success(`Screening complete: ${r.data.overallResult}`)
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setScreening(null) }
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))
  const totalAmount = data.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
  const blocked = data.filter(d => d.sanctions_status === 'BLOCKED').length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Trade Finance" subtitle="Letters of Credit, Bank Guarantees and Documentary Collections" icon={Package}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({ instrument_type: 'LC', currency: 'USD', status: 'DRAFT', sanctions_status: 'CLEAR' }); setShowForm(true) }} className="btn-primary"><Plus size={14} /> New Instrument</button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Instruments" value={total.toLocaleString()} />
        <StatCard label="Total Value" value={`$${(totalAmount / 1e6).toFixed(2)}M`} color="text-blue-400" />
        <StatCard label="Blocked" value={blocked} color="text-red-400" />
        <StatCard label="Pending Review" value={data.filter(d => d.sanctions_status === 'PENDING_REVIEW').length} color="text-amber-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search instruments..." />
          <select className="select w-40" value={instrType} onChange={e => { setInstrType(e.target.value); setPage(1) }}>
            <option value="">All Types</option>
            {INSTRUMENT_TYPES.map(t => <option key={t}>{t}</option>)}
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
            <thead><tr><th>Instrument #</th><th>Type</th><th>Applicant</th><th>Beneficiary</th><th>Amount</th><th>Origin</th><th>Dest</th><th>Sanctions</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={10} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={10}><Empty message="No trade finance instruments found" action={<button className="btn-primary" onClick={() => { setForm({ instrument_type: 'LC', currency: 'USD', status: 'DRAFT' }); setShowForm(true) }}><Plus size={14} /> New Instrument</button>} /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id} className={row.sanctions_status === 'BLOCKED' ? 'bg-red-900/10' : ''}>
                  <td><span className="font-mono text-xs text-blue-300">{row.instrument_number}</span></td>
                  <td><Badge value={row.instrument_type} /></td>
                  <td className="text-sm text-white max-w-[120px] truncate">{row.applicant_name}</td>
                  <td className="text-sm text-slate-300 max-w-[120px] truncate">{row.beneficiary_name}</td>
                  <td className="font-mono text-sm font-semibold text-green-400">{parseFloat(row.amount || 0).toLocaleString()} {row.currency}</td>
                  <td className="text-xs text-slate-400">{row.origin_country || '—'}</td>
                  <td className="text-xs text-slate-400">{row.destination_country || '—'}</td>
                  <td><Badge value={row.sanctions_status || 'CLEAR'} /></td>
                  <td><Badge value={row.status} /></td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => runScreen(row)} disabled={screening === row.id} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded" title="Screen">
                        {screening === row.id ? <Spinner size={12} /> : <Shield size={12} />}
                      </button>
                      <CrudActions onView={() => { setSelected(row); setShowDetail(true) }} onEdit={() => { setForm(row); setShowForm(true) }} onDelete={() => { setSelected(row); setShowDelete(true) }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} total={total} limit={50} onChange={setPage} /></div>
      </div>

      <Modal open={showDetail} onClose={() => setShowDetail(false)} title={`Instrument: ${selected?.instrument_number}`} size="lg">
        {selected && (
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="space-y-1">
              {[['Type', selected.instrument_type], ['Applicant', selected.applicant_name], ['Beneficiary', selected.beneficiary_name], ['Amount', `${parseFloat(selected.amount || 0).toLocaleString()} ${selected.currency}`], ['Issuing Bank', selected.issuing_bank], ['Advising Bank', selected.advising_bank]].map(([l, v]) => (
                <div key={l} className="flex justify-between py-2 border-b border-slate-800"><span className="text-xs text-slate-500">{l}</span><span className="text-xs text-slate-200 font-medium">{v || '—'}</span></div>
              ))}
            </div>
            <div className="space-y-1">
              {[['Origin', selected.origin_country], ['Destination', selected.destination_country], ['Sanctions', selected.sanctions_status], ['Status', selected.status], ['Expiry', selected.expiry_date], ['Goods', selected.goods_description]].map(([l, v]) => (
                <div key={l} className="flex justify-between py-2 border-b border-slate-800"><span className="text-xs text-slate-500">{l}</span><span className="text-xs text-slate-200 font-medium max-w-[200px] truncate">{v || '—'}</span></div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Instrument' : 'New Trade Finance Instrument'} size="xl">
        <div className="p-6 grid grid-cols-3 gap-4">
          <Field label="Instrument Type"><select className="select" value={form.instrument_type || 'LC'} onChange={e => f('instrument_type', e.target.value)}>{INSTRUMENT_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Amount"><input className="input" type="number" step="0.01" value={form.amount || ''} onChange={e => f('amount', e.target.value)} /></Field>
          <Field label="Currency"><select className="select" value={form.currency || 'USD'} onChange={e => f('currency', e.target.value)}><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></select></Field>
          <div className="col-span-2"><Field label="Applicant Name" required><input className="input" value={form.applicant_name || ''} onChange={e => f('applicant_name', e.target.value)} /></Field></div>
          <div className="col-span-2"><Field label="Beneficiary Name" required><input className="input" value={form.beneficiary_name || ''} onChange={e => f('beneficiary_name', e.target.value)} /></Field></div>
          <Field label="Issuing Bank"><input className="input" value={form.issuing_bank || ''} onChange={e => f('issuing_bank', e.target.value)} /></Field>
          <Field label="Advising Bank"><input className="input" value={form.advising_bank || ''} onChange={e => f('advising_bank', e.target.value)} /></Field>
          <Field label="Origin Country"><input className="input" value={form.origin_country || ''} onChange={e => f('origin_country', e.target.value)} maxLength={2} placeholder="ISO2" /></Field>
          <Field label="Destination Country"><input className="input" value={form.destination_country || ''} onChange={e => f('destination_country', e.target.value)} maxLength={2} placeholder="ISO2" /></Field>
          <Field label="Expiry Date"><input className="input" type="date" value={form.expiry_date || ''} onChange={e => f('expiry_date', e.target.value)} /></Field>
          <Field label="Status"><select className="select" value={form.status || 'DRAFT'} onChange={e => f('status', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <div className="col-span-3"><Field label="Goods Description"><textarea className="input h-20 resize-none" value={form.goods_description || ''} onChange={e => f('goods_description', e.target.value)} /></Field></div>
          <div className="col-span-3 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del} title="Delete Instrument" message={`Delete instrument "${selected?.instrument_number}"?`} />
    </div>
  )
}
