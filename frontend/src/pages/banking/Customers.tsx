import React, { useEffect, useState } from 'react'
import { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, screenSubject } from '../../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard, TabBar } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Users, Plus, RefreshCw, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

const PAGE_META = {
  title: 'Customers',
  entities: [{
    name: 'core_customers', description: 'Core banking customer master data',
    fields: [
      { name: 'customer_number', type: 'varchar(20)', description: 'Unique customer reference number' },
      { name: 'full_name', type: 'varchar(500)', description: 'Full legal name', required: true },
      { name: 'customer_type', type: 'enum', description: 'INDIVIDUAL | CORPORATE | SME | GOVERNMENT' },
      { name: 'risk_rating', type: 'enum', description: 'LOW | MEDIUM | HIGH | VERY_HIGH' },
      { name: 'kyc_status', type: 'enum', description: 'PENDING | VERIFIED | EXPIRED | REJECTED' },
      { name: 'nationality', type: 'varchar(2)', description: 'ISO2 country code' },
      { name: 'date_of_birth', type: 'date', description: 'Date of birth (individuals)' },
      { name: 'id_type', type: 'varchar', description: 'Passport | National ID | Company Reg' },
      { name: 'id_number', type: 'varchar', description: 'Identity document number' },
      { name: 'sanctions_status', type: 'enum', description: 'CLEAR | PENDING_REVIEW | BLOCKED | WATCHLIST' },
      { name: 'last_screened_at', type: 'datetime', description: 'Last sanctions screening date' },
    ]
  }]
}

const CUSTOMER_TYPES = ['INDIVIDUAL', 'CORPORATE', 'SME', 'GOVERNMENT', 'NGO']
const RISK_RATINGS = ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']
const KYC_STATUSES = ['PENDING', 'VERIFIED', 'EXPIRED', 'REJECTED']

export default function Customers() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [riskRating, setRiskRating] = useState('')
  const [kycStatus, setKycStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [screening, setScreening] = useState<number | null>(null)
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try {
      const r = await getCustomers({ page, limit: 50, search, risk_rating: riskRating, kyc_status: kycStatus })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, riskRating, kycStatus])

  const openView = async (row: any) => {
    const r = await getCustomer(row.id)
    setSelected(r.data)
    setShowDetail(true)
  }

  const openEdit = async (row: any) => {
    const r = await getCustomer(row.id)
    setForm(r.data)
    setShowForm(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) { await updateCustomer(form.id, form); toast.success('Customer updated') }
      else { await createCustomer(form); toast.success('Customer created') }
      setShowForm(false); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteCustomer(selected.id); toast.success('Customer deleted')
    setShowDelete(false); load()
  }

  const screenCustomer = async (row: any) => {
    setScreening(row.id)
    try {
      const r = await screenSubject({
        subjects: [{ subject_name: row.full_name, subject_type: row.customer_type, dob: row.date_of_birth, nationality: row.nationality }],
        source_system: 'CUSTOMER_SCREEN', requested_by: 'Compliance Officer', threshold: 60
      })
      const result = r.data.overallResult
      if (result === 'BLOCKED') toast.error(`⛔ ${row.full_name} is BLOCKED on sanctions list!`)
      else if (result === 'POTENTIAL_MATCH') toast(`⚠️ Potential match for ${row.full_name}`, { icon: '⚠️' })
      else toast.success(`✓ ${row.full_name} is Clear`)
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setScreening(null) }
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))

  const stats = {
    total: total,
    high: data.filter(d => d.risk_rating === 'HIGH' || d.risk_rating === 'VERY_HIGH').length,
    blocked: data.filter(d => d.sanctions_status === 'BLOCKED').length,
    pending_kyc: data.filter(d => d.kyc_status === 'PENDING').length,
  }

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Customers" subtitle="Core banking customer master" icon={Users}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({ customer_type: 'INDIVIDUAL', risk_rating: 'LOW', kyc_status: 'PENDING', sanctions_status: 'CLEAR' }); setShowForm(true) }} className="btn-primary"><Plus size={14} /> New Customer</button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Customers" value={total.toLocaleString()} />
        <StatCard label="High Risk" value={stats.high} color="text-red-400" />
        <StatCard label="Sanctions Blocked" value={stats.blocked} color="text-red-400" />
        <StatCard label="KYC Pending" value={stats.pending_kyc} color="text-amber-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search customers..." />
          <select className="select w-36" value={riskRating} onChange={e => { setRiskRating(e.target.value); setPage(1) }}>
            <option value="">All Risk</option>
            {RISK_RATINGS.map(r => <option key={r}>{r}</option>)}
          </select>
          <select className="select w-36" value={kycStatus} onChange={e => { setKycStatus(e.target.value); setPage(1) }}>
            <option value="">All KYC</option>
            {KYC_STATUSES.map(k => <option key={k}>{k}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Customer #</th><th>Name</th><th>Type</th><th>Risk</th><th>KYC</th><th>Nationality</th><th>Sanctions</th><th>Last Screened</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={9} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={9}><Empty message="No customers found" action={<button className="btn-primary" onClick={() => { setForm({ customer_type: 'INDIVIDUAL', risk_rating: 'LOW', kyc_status: 'PENDING' }); setShowForm(true) }}><Plus size={14} /> Add Customer</button>} /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id}>
                  <td><span className="font-mono text-xs text-blue-300">{row.customer_id}</span></td>
                  <td>
                    <div className="font-medium text-white">{row.full_name}</div>
                    <div className="text-xs text-slate-500">{row.customer_type} · {row.nationality || ''}</div>
                  </td>
                  <td><Badge value={row.customer_type} /></td>
                  <td><Badge value={row.risk_rating || 'Low'} /></td>
                  <td><Badge value={row.kyc_status || 'Pending'} /></td>
                  <td className="text-xs text-slate-400">{row.nationality || '—'}</td>
                  <td><Badge value={row.sanctions_status || 'Clear'} /></td>
                  <td className="text-xs text-slate-500">{row.last_screened ? new Date(row.last_screened).toLocaleDateString() : 'Never'}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => screenCustomer(row)} disabled={screening === row.id}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded" title="Screen Now">
                        {screening === row.id ? <Spinner size={12} /> : <Shield size={12} />}
                      </button>
                      <CrudActions onView={() => openView(row)} onEdit={() => openEdit(row)} onDelete={() => { setSelected(row); setShowDelete(true) }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} total={total} limit={50} onChange={setPage} /></div>
      </div>

      {/* Detail */}
      <Modal open={showDetail} onClose={() => setShowDetail(false)} title={`Customer: ${selected?.customer_id}`} size="lg">
        {selected && (
          <div className="p-6 grid grid-cols-2 gap-6">
            <div className="space-y-1">
              {[['Name', selected.full_name], ['Type', selected.customer_type], ['Risk Rating', selected.risk_rating], ['KYC Status', selected.kyc_status], ['Nationality', selected.nationality], ['DOB', selected.date_of_birth], ['ID Type', selected.id_type], ['ID Number', selected.id_number]].map(([l, v]) => (
                <div key={l} className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-xs text-slate-500">{l}</span>
                  <span className="text-xs text-slate-200 font-medium">{v || '—'}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              {[['Sanctions Status', selected.sanctions_status], ['Last Screened', selected.last_screened ? new Date(selected.last_screened).toLocaleString() : 'Never'], ['Email', selected.email], ['Phone', selected.phone], ['Address', selected.address], ['City', selected.city], ['Country', selected.country]].map(([l, v]) => (
                <div key={l} className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-xs text-slate-500">{l}</span>
                  <span className="text-xs text-slate-200 font-medium">{v || '—'}</span>
                </div>
              ))}
              <div className="mt-4 flex gap-2">
                <button className="btn-primary text-xs" onClick={() => screenCustomer(selected)}><Shield size={12} /> Screen Now</button>
                <button className="btn-ghost text-xs" onClick={() => navigate('/accounts')}>View Accounts</button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Form */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Customer' : 'New Customer'} size="xl">
        <div className="p-6 grid grid-cols-3 gap-4">
          <div className="col-span-3"><Field label="Full Name" required><input className="input" value={form.full_name || ''} onChange={e => f('full_name', e.target.value)} /></Field></div>
          <Field label="Customer Type"><select className="select" value={form.customer_type || 'INDIVIDUAL'} onChange={e => f('customer_type', e.target.value)}>{CUSTOMER_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Risk Rating"><select className="select" value={form.risk_rating || 'LOW'} onChange={e => f('risk_rating', e.target.value)}>{RISK_RATINGS.map(r => <option key={r}>{r}</option>)}</select></Field>
          <Field label="KYC Status"><select className="select" value={form.kyc_status || 'PENDING'} onChange={e => f('kyc_status', e.target.value)}>{KYC_STATUSES.map(k => <option key={k}>{k}</option>)}</select></Field>
          <Field label="Nationality (ISO2)"><input className="input" value={form.nationality || ''} onChange={e => f('nationality', e.target.value)} maxLength={2} /></Field>
          <Field label="Date of Birth"><input className="input" type="date" value={form.date_of_birth || ''} onChange={e => f('date_of_birth', e.target.value)} /></Field>
          <Field label="ID Type"><input className="input" value={form.id_type || ''} onChange={e => f('id_type', e.target.value)} placeholder="Passport" /></Field>
          <Field label="ID Number"><input className="input" value={form.id_number || ''} onChange={e => f('id_number', e.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email || ''} onChange={e => f('email', e.target.value)} /></Field>
          <Field label="Phone"><input className="input" value={form.phone || ''} onChange={e => f('phone', e.target.value)} /></Field>
          <div className="col-span-2"><Field label="Address"><input className="input" value={form.address || ''} onChange={e => f('address', e.target.value)} /></Field></div>
          <Field label="City"><input className="input" value={form.city || ''} onChange={e => f('city', e.target.value)} /></Field>
          <Field label="Country"><input className="input" value={form.country || ''} onChange={e => f('country', e.target.value)} /></Field>
          <div className="col-span-3 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del} title="Delete Customer" message={`Delete customer "${selected?.full_name}"?`} />
    </div>
  )
}
