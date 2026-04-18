import React, { useEffect, useState } from 'react'
import { getAccounts, getAccount, createAccount, updateAccount, deleteAccount } from '../../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { CreditCard, Plus, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Accounts',
  entities: [{
    name: 'core_accounts', description: 'Core banking accounts linked to customers',
    fields: [
      { name: 'account_number', type: 'varchar(30)', description: 'Unique account number' },
      { name: 'customer_id', type: 'int', description: 'FK to core_customers', required: true },
      { name: 'account_type', type: 'enum', description: 'CURRENT | SAVINGS | FIXED_DEPOSIT | LOAN | INVESTMENT' },
      { name: 'currency', type: 'varchar(3)', description: 'ISO4217 currency code' },
      { name: 'balance', type: 'decimal(18,2)', description: 'Current account balance' },
      { name: 'status', type: 'enum', description: 'ACTIVE | FROZEN | CLOSED | DORMANT' },
      { name: 'frozen_reason', type: 'varchar', description: 'Reason for account freeze (if frozen)' },
      { name: 'iban', type: 'varchar(34)', description: 'International Bank Account Number' },
      { name: 'swift_code', type: 'varchar(11)', description: 'SWIFT/BIC code' },
    ]
  }]
}

const ACCOUNT_TYPES = ['CURRENT', 'SAVINGS', 'FIXED_DEPOSIT', 'LOAN', 'INVESTMENT', 'NOSTRO', 'VOSTRO']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'SGD', 'CHF', 'JPY', 'CNY', 'INR']
const STATUSES = ['ACTIVE', 'FROZEN', 'CLOSED', 'DORMANT', 'PENDING']

export default function Accounts() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [acctType, setAcctType] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await getAccounts({ page, limit: 50, search, account_type: acctType, status })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, acctType, status])

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) { await updateAccount(form.id, form); toast.success('Account updated') }
      else { await createAccount(form); toast.success('Account created') }
      setShowForm(false); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteAccount(selected.id); toast.success('Account deleted')
    setShowDelete(false); load()
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))

  const frozen = data.filter(d => d.status?.toUpperCase() === 'FROZEN').length
  const totalBalance = data.reduce((s, d) => s + (parseFloat(d.balance) || 0), 0)

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Accounts" subtitle="Core banking accounts" icon={CreditCard}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({ account_type: 'CURRENT', currency: 'USD', status: 'ACTIVE', balance: 0 }); setShowForm(true) }} className="btn-primary"><Plus size={14} /> New Account</button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Accounts" value={total.toLocaleString()} />
        <StatCard label="Frozen" value={frozen} color="text-red-400" />
        <StatCard label="Total Balance" value={`$${(totalBalance / 1e6).toFixed(2)}M`} color="text-green-400" />
        <StatCard label="Active" value={data.filter(d => d.status?.toUpperCase() === 'ACTIVE').length} color="text-blue-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search accounts..." />
          <select className="select w-40" value={acctType} onChange={e => { setAcctType(e.target.value); setPage(1) }}>
            <option value="">All Types</option>
            {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
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
            <thead><tr><th>Account #</th><th>Customer</th><th>Type</th><th>Currency</th><th>Balance</th><th>IBAN</th><th>Status</th><th>Frozen Reason</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={9} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={9}><Empty message="No accounts found" action={<button className="btn-primary" onClick={() => { setForm({ account_type: 'CURRENT', currency: 'USD', status: 'ACTIVE' }); setShowForm(true) }}><Plus size={14} /> New Account</button>} /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id}>
                  <td><span className="font-mono text-xs text-blue-300">{row.account_number}</span></td>
                  <td className="text-sm text-slate-300">{row.customer_name || row.customer_id}</td>
                  <td><Badge value={row.account_type} /></td>
                  <td><span className="font-mono text-xs">{row.currency}</span></td>
                  <td className={`font-mono text-sm font-semibold ${parseFloat(row.balance) < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {parseFloat(row.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td><span className="font-mono text-xs text-slate-500">{row.iban || '—'}</span></td>
                  <td><Badge value={row.status} /></td>
                  <td className="text-xs text-slate-500 max-w-[120px] truncate">{row.frozen_reason || '—'}</td>
                  <td><CrudActions onView={() => { setSelected(row); setShowDetail(true) }} onEdit={() => { setForm(row); setShowForm(true) }} onDelete={() => { setSelected(row); setShowDelete(true) }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} total={total} limit={50} onChange={setPage} /></div>
      </div>

      <Modal open={showDetail} onClose={() => setShowDetail(false)} title={`Account: ${selected?.account_number}`} size="md">
        {selected && (
          <div className="p-6 space-y-1">
            {[['Account Number', selected.account_number], ['Customer', selected.customer_name || selected.customer_id], ['Type', selected.account_type], ['Currency', selected.currency], ['Balance', parseFloat(selected.balance || 0).toLocaleString()], ['IBAN', selected.iban], ['SWIFT', selected.swift_code], ['Status', selected.status], ['Frozen Reason', selected.frozen_reason], ['Opened', selected.opened_date]].map(([l, v]) => (
              <div key={l} className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-xs text-slate-500">{l}</span>
                <span className="text-xs text-slate-200 font-medium">{v || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Account' : 'New Account'} size="lg">
        <div className="p-6 grid grid-cols-2 gap-4">
          <Field label="Account Type"><select className="select" value={form.account_type || 'CURRENT'} onChange={e => f('account_type', e.target.value)}>{ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Currency"><select className="select" value={form.currency || 'USD'} onChange={e => f('currency', e.target.value)}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Customer ID"><input className="input" type="number" value={form.customer_id || ''} onChange={e => f('customer_id', e.target.value)} /></Field>
          <Field label="Balance"><input className="input" type="number" step="0.01" value={form.balance || 0} onChange={e => f('balance', e.target.value)} /></Field>
          <Field label="IBAN"><input className="input" value={form.iban || ''} onChange={e => f('iban', e.target.value)} placeholder="GB29NWBK60161331926819" /></Field>
          <Field label="SWIFT Code"><input className="input" value={form.swift_code || ''} onChange={e => f('swift_code', e.target.value)} placeholder="BARCGB22" /></Field>
          <Field label="Status"><select className="select" value={form.status || 'ACTIVE'} onChange={e => f('status', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Opened Date"><input className="input" type="date" value={form.opened_date || ''} onChange={e => f('opened_date', e.target.value)} /></Field>
          {form.status === 'FROZEN' && <div className="col-span-2"><Field label="Frozen Reason"><input className="input" value={form.frozen_reason || ''} onChange={e => f('frozen_reason', e.target.value)} /></Field></div>}
          <div className="col-span-2 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del} title="Delete Account" message={`Delete account "${selected?.account_number}"?`} />
    </div>
  )
}
