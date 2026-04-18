import React, { useEffect, useState } from 'react'
import { getRules, createRule, updateRule, deleteRule } from '../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { Settings, Plus, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Screening Rules',
  entities: [{
    name: 'screening_rules', description: 'Configurable rules that govern the screening engine behavior',
    fields: [
      { name: 'rule_name', type: 'varchar(200)', description: 'Rule name', required: true },
      { name: 'rule_type', type: 'enum', description: 'THRESHOLD | COUNTRY_BLOCK | AMOUNT_LIMIT | ENTITY_TYPE | KEYWORD | REGEX' },
      { name: 'rule_category', type: 'enum', description: 'SCREENING | TRANSACTION | CUSTOMER | TRADE_FINANCE | VESSEL' },
      { name: 'condition_field', type: 'varchar', description: 'Field to evaluate' },
      { name: 'condition_operator', type: 'enum', description: 'EQUALS | CONTAINS | GREATER_THAN | LESS_THAN | IN | NOT_IN' },
      { name: 'condition_value', type: 'varchar', description: 'Value to compare against' },
      { name: 'action', type: 'enum', description: 'BLOCK | ALERT | REVIEW | LOG | ESCALATE' },
      { name: 'threshold_score', type: 'decimal', description: 'Match threshold for screening rules' },
      { name: 'is_active', type: 'bit', description: 'Whether rule is currently active' },
      { name: 'priority', type: 'int', description: 'Rule evaluation priority (lower = higher priority)' },
    ]
  }]
}

const RULE_TYPES = ['THRESHOLD', 'COUNTRY_BLOCK', 'AMOUNT_LIMIT', 'ENTITY_TYPE', 'KEYWORD', 'REGEX', 'COMPOSITE']
const RULE_CATEGORIES = ['SCREENING', 'TRANSACTION', 'CUSTOMER', 'TRADE_FINANCE', 'VESSEL']
const ACTIONS = ['BLOCK', 'ALERT', 'REVIEW', 'LOG', 'ESCALATE']
const OPERATORS = ['EQUALS', 'CONTAINS', 'GREATER_THAN', 'LESS_THAN', 'IN', 'NOT_IN', 'REGEX_MATCH']

export default function Rules() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await getRules({ page, limit: 50, search, category })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, category])

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) { await updateRule(form.id, form); toast.success('Rule updated') }
      else { await createRule(form); toast.success('Rule created') }
      setShowForm(false); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteRule(selected.id); toast.success('Rule deleted')
    setShowDelete(false); load()
  }

  const toggleRule = async (row: any) => {
    await updateRule(row.id, { is_active: !row.is_active })
    toast.success(`Rule ${!row.is_active ? 'activated' : 'deactivated'}`)
    load()
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))
  const active = data.filter(d => d.is_active).length
  const blocking = data.filter(d => d.action === 'BLOCK').length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Screening Rules" subtitle="Configure rules governing the sanctions screening engine" icon={Settings}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({ rule_type: 'THRESHOLD', rule_category: 'SCREENING', action: 'ALERT', is_active: true, priority: 100, threshold_score: 70 }); setShowForm(true) }} className="btn-primary"><Plus size={14} /> New Rule</button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Rules" value={total.toLocaleString()} />
        <StatCard label="Active" value={active} color="text-green-400" />
        <StatCard label="Blocking Rules" value={blocking} color="text-red-400" />
        <StatCard label="Inactive" value={total - active} color="text-slate-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search rules..." />
          <select className="select w-44" value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}>
            <option value="">All Categories</option>
            {RULE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Rule Name</th><th>Type</th><th>Category</th><th>Condition</th><th>Action</th><th>Threshold</th><th>Priority</th><th>Active</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={9} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={9}><Empty message="No rules configured" action={<button className="btn-primary" onClick={() => { setForm({ rule_type: 'THRESHOLD', rule_category: 'SCREENING', action: 'ALERT', is_active: true, priority: 100 }); setShowForm(true) }}><Plus size={14} /> New Rule</button>} /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id}>
                  <td className="font-medium text-white">{row.rule_name}</td>
                  <td><Badge value={row.rule_type} /></td>
                  <td><Badge value={row.rule_category} /></td>
                  <td className="text-xs text-slate-400 max-w-[160px] truncate">{row.condition_field} {row.condition_operator} {row.condition_value}</td>
                  <td><Badge value={row.action} /></td>
                  <td className="text-xs text-slate-400">{row.threshold_score ? `${row.threshold_score}%` : '—'}</td>
                  <td className="text-xs text-slate-400">{row.priority}</td>
                  <td>
                    <button onClick={() => toggleRule(row)} className="text-slate-400 hover:text-blue-400">
                      {row.is_active ? <ToggleRight size={20} className="text-green-400" /> : <ToggleLeft size={20} />}
                    </button>
                  </td>
                  <td><CrudActions onEdit={() => { setForm(row); setShowForm(true) }} onDelete={() => { setSelected(row); setShowDelete(true) }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} total={total} limit={50} onChange={setPage} /></div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Rule' : 'New Screening Rule'} size="lg">
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2"><Field label="Rule Name" required><input className="input" value={form.rule_name || ''} onChange={e => f('rule_name', e.target.value)} /></Field></div>
          <Field label="Rule Type"><select className="select" value={form.rule_type || 'THRESHOLD'} onChange={e => f('rule_type', e.target.value)}>{RULE_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Category"><select className="select" value={form.rule_category || 'SCREENING'} onChange={e => f('rule_category', e.target.value)}>{RULE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Condition Field"><input className="input" value={form.condition_field || ''} onChange={e => f('condition_field', e.target.value)} placeholder="e.g., country_code" /></Field>
          <Field label="Operator"><select className="select" value={form.condition_operator || 'EQUALS'} onChange={e => f('condition_operator', e.target.value)}>{OPERATORS.map(o => <option key={o}>{o}</option>)}</select></Field>
          <div className="col-span-2"><Field label="Condition Value"><input className="input" value={form.condition_value || ''} onChange={e => f('condition_value', e.target.value)} placeholder="e.g., IR, SY, KP" /></Field></div>
          <Field label="Action"><select className="select" value={form.action || 'ALERT'} onChange={e => f('action', e.target.value)}>{ACTIONS.map(a => <option key={a}>{a}</option>)}</select></Field>
          <Field label="Threshold Score %"><input className="input" type="number" min={0} max={100} value={form.threshold_score || ''} onChange={e => f('threshold_score', e.target.value)} /></Field>
          <Field label="Priority"><input className="input" type="number" value={form.priority || 100} onChange={e => f('priority', e.target.value)} /></Field>
          <div className="flex items-center gap-3 pt-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-blue-500" checked={!!form.is_active} onChange={e => f('is_active', e.target.checked)} />
              <span className="text-sm text-slate-300">Active</span>
            </label>
          </div>
          <div className="col-span-2"><Field label="Description"><textarea className="input h-20 resize-none" value={form.description || ''} onChange={e => f('description', e.target.value)} /></Field></div>
          <div className="col-span-2 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del} title="Delete Rule" message={`Delete rule "${selected?.rule_name}"?`} />
    </div>
  )
}
