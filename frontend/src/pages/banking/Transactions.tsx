import React, { useEffect, useState } from 'react'
import { getTransactions, createTransaction, updateTransaction, deleteTransaction } from '../../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Activity, Plus, RefreshCw, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Transactions',
  entities: [{
    name: 'core_transactions', description: 'Financial transactions with real-time sanctions screening',
    fields: [
      { name: 'transaction_ref', type: 'varchar(50)', description: 'Unique transaction reference' },
      { name: 'account_id', type: 'int', description: 'FK to core_accounts' },
      { name: 'transaction_type', type: 'enum', description: 'CREDIT | DEBIT | TRANSFER | WIRE | SWIFT | SEPA' },
      { name: 'amount', type: 'decimal(18,2)', description: 'Transaction amount' },
      { name: 'currency', type: 'varchar(3)', description: 'Transaction currency' },
      { name: 'counterparty_name', type: 'varchar(500)', description: 'Counterparty name (screened)' },
      { name: 'counterparty_account', type: 'varchar(50)', description: 'Counterparty account/IBAN' },
      { name: 'counterparty_bank', type: 'varchar(200)', description: 'Counterparty bank name' },
      { name: 'beneficiary_country', type: 'varchar(2)', description: 'Beneficiary country ISO2' },
      { name: 'sanctions_status', type: 'enum', description: 'CLEAR | PENDING_REVIEW | BLOCKED' },
      { name: 'screening_score', type: 'decimal(5,2)', description: 'Highest sanctions match score' },
      { name: 'status', type: 'enum', description: 'PENDING | COMPLETED | BLOCKED | REVERSED | FAILED' },
    ]
  }]
}

const TXN_TYPES = ['CREDIT', 'DEBIT', 'TRANSFER', 'WIRE', 'SWIFT', 'SEPA', 'RTGS', 'ACH']
const STATUSES = ['PENDING', 'COMPLETED', 'BLOCKED', 'REVERSED', 'FAILED']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'SGD', 'CHF', 'JPY']

export default function Transactions() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [txnType, setTxnType] = useState('')
  const [status, setStatus] = useState('')
  const [sanctionsStatus, setSanctionsStatus] = useState('')
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
      const r = await getTransactions({ page, limit: 50, search, transaction_type: txnType, status, sanctions_status: sanctionsStatus })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, txnType, status, sanctionsStatus])

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) { await updateTransaction(form.id, form); toast.success('Transaction updated') }
      else { await createTransaction(form); toast.success('Transaction created') }
      setShowForm(false); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteTransaction(selected.id); toast.success('Transaction deleted')
    setShowDelete(false); load()
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))

  const totalAmount = data.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
  const blocked = data.filter(d => d.sanctions_status === 'BLOCKED' || d.status === 'BLOCKED').length
  const pending = data.filter(d => d.sanctions_status === 'PENDING_REVIEW').length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Transactions" subtitle="Financial transactions with sanctions screening" icon={Activity}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({ transaction_type: 'WIRE', currency: 'USD', status: 'PENDING', sanctions_status: 'CLEAR' }); setShowForm(true) }} className="btn-primary"><Plus size={14} /> New Transaction</button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Transactions" value={total.toLocaleString()} />
        <StatCard label="Total Volume" value={`$${(totalAmount / 1e6).toFixed(2)}M`} color="text-blue-400" />
        <StatCard label="Blocked" value={blocked} color="text-red-400" />
        <StatCard label="Pending Review" value={pending} color="text-amber-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search transactions..." />
          <select className="select w-36" value={txnType} onChange={e => { setTxnType(e.target.value); setPage(1) }}>
            <option value="">All Types</option>
            {TXN_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="select w-36" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="select w-44" value={sanctionsStatus} onChange={e => { setSanctionsStatus(e.target.value); setPage(1) }}>
            <option value="">All Sanctions</option>
            <option value="BLOCKED">Blocked</option>
            <option value="PENDING_REVIEW">Pending Review</option>
            <option value="CLEAR">Clear</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Ref</th><th>Type</th><th>Amount</th><th>Counterparty</th><th>Bank</th><th>Country</th><th>Sanctions</th><th>Score</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={11} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={11}><Empty message="No transactions found" action={<button className="btn-primary" onClick={() => { setForm({ transaction_type: 'WIRE', currency: 'USD', status: 'PENDING' }); setShowForm(true) }}><Plus size={14} /> New Transaction</button>} /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id} className={row.sanctions_status === 'BLOCKED' ? 'bg-red-900/10' : row.sanctions_status === 'PENDING_REVIEW' ? 'bg-amber-900/10' : ''}>
                  <td><span className="font-mono text-xs text-blue-300">{row.transaction_ref}</span></td>
                  <td><Badge value={row.transaction_type} /></td>
                  <td className={`font-mono text-sm font-semibold ${row.transaction_type === 'DEBIT' ? 'text-red-400' : 'text-green-400'}`}>
                    {parseFloat(row.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} {row.currency}
                  </td>
                  <td>
                    <div className="text-sm text-white">{row.counterparty_name || '—'}</div>
                    <div className="text-xs text-slate-500 font-mono">{row.counterparty_account || ''}</div>
                  </td>
                  <td className="text-xs text-slate-400 max-w-[120px] truncate">{row.counterparty_bank || '—'}</td>
                  <td className="text-xs text-slate-400">{row.beneficiary_country || '—'}</td>
                  <td><Badge value={row.sanctions_status || 'CLEAR'} /></td>
                  <td>
                    {row.screening_score > 0 ? (
                      <span className={`font-mono text-xs font-bold ${row.screening_score >= 90 ? 'text-red-400' : row.screening_score >= 70 ? 'text-amber-400' : 'text-slate-400'}`}>{Math.round(row.screening_score)}%</span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td><Badge value={row.status} /></td>
                  <td className="text-xs text-slate-500">{row.transaction_date ? new Date(row.transaction_date).toLocaleDateString() : '—'}</td>
                  <td><CrudActions onView={() => { setSelected(row); setShowDetail(true) }} onEdit={() => { setForm(row); setShowForm(true) }} onDelete={() => { setSelected(row); setShowDelete(true) }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} total={total} limit={50} onChange={setPage} /></div>
      </div>

      <Modal open={showDetail} onClose={() => setShowDetail(false)} title={`Transaction: ${selected?.transaction_ref}`} size="lg">
        {selected && (
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="space-y-1">
              {[['Reference', selected.transaction_ref], ['Type', selected.transaction_type], ['Amount', `${parseFloat(selected.amount || 0).toLocaleString()} ${selected.currency}`], ['Counterparty', selected.counterparty_name], ['Account', selected.counterparty_account], ['Bank', selected.counterparty_bank]].map(([l, v]) => (
                <div key={l} className="flex justify-between py-2 border-b border-slate-800"><span className="text-xs text-slate-500">{l}</span><span className="text-xs text-slate-200 font-medium">{v || '—'}</span></div>
              ))}
            </div>
            <div className="space-y-1">
              {[['Country', selected.beneficiary_country], ['Sanctions Status', selected.sanctions_status], ['Screening Score', selected.screening_score ? `${Math.round(selected.screening_score)}%` : '—'], ['Status', selected.status], ['Date', selected.transaction_date ? new Date(selected.transaction_date).toLocaleString() : '—'], ['Purpose', selected.purpose]].map(([l, v]) => (
                <div key={l} className="flex justify-between py-2 border-b border-slate-800"><span className="text-xs text-slate-500">{l}</span><span className="text-xs text-slate-200 font-medium">{v || '—'}</span></div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Transaction' : 'New Transaction'} size="xl">
        <div className="p-6 grid grid-cols-3 gap-4">
          <Field label="Transaction Type"><select className="select" value={form.transaction_type || 'WIRE'} onChange={e => f('transaction_type', e.target.value)}>{TXN_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Amount"><input className="input" type="number" step="0.01" value={form.amount || ''} onChange={e => f('amount', e.target.value)} /></Field>
          <Field label="Currency"><select className="select" value={form.currency || 'USD'} onChange={e => f('currency', e.target.value)}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></Field>
          <div className="col-span-2"><Field label="Counterparty Name"><input className="input" value={form.counterparty_name || ''} onChange={e => f('counterparty_name', e.target.value)} /></Field></div>
          <Field label="Beneficiary Country"><input className="input" value={form.beneficiary_country || ''} onChange={e => f('beneficiary_country', e.target.value)} maxLength={2} placeholder="ISO2" /></Field>
          <Field label="Counterparty Account"><input className="input" value={form.counterparty_account || ''} onChange={e => f('counterparty_account', e.target.value)} /></Field>
          <div className="col-span-2"><Field label="Counterparty Bank"><input className="input" value={form.counterparty_bank || ''} onChange={e => f('counterparty_bank', e.target.value)} /></Field></div>
          <Field label="Account ID"><input className="input" type="number" value={form.account_id || ''} onChange={e => f('account_id', e.target.value)} /></Field>
          <Field label="Status"><select className="select" value={form.status || 'PENDING'} onChange={e => f('status', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Transaction Date"><input className="input" type="date" value={form.transaction_date || ''} onChange={e => f('transaction_date', e.target.value)} /></Field>
          <div className="col-span-3"><Field label="Purpose"><input className="input" value={form.purpose || ''} onChange={e => f('purpose', e.target.value)} /></Field></div>
          <div className="col-span-3 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del} title="Delete Transaction" message={`Delete transaction "${selected?.transaction_ref}"?`} />
    </div>
  )
}
