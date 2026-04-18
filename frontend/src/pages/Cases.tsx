import React, { useEffect, useState } from 'react'
import { getCases, getCase, createCase, updateCase, deleteCase, addCaseNote } from '../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard, TabBar } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { FileText, Plus, RefreshCw, MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Cases',
  entities: [{
    name: 'cases', description: 'Compliance investigation cases arising from screening matches',
    fields: [
      { name: 'case_number', type: 'varchar(50)', description: 'Unique case reference number' },
      { name: 'subject_name', type: 'varchar(500)', description: 'Name of the subject under investigation' },
      { name: 'case_type', type: 'enum', description: 'SANCTIONS_HIT | POTENTIAL_MATCH | WATCHLIST | TRANSACTION_BLOCK' },
      { name: 'status', type: 'enum', description: 'OPEN | IN_REVIEW | ESCALATED | CLOSED | DISMISSED' },
      { name: 'priority', type: 'enum', description: 'CRITICAL | HIGH | MEDIUM | LOW' },
      { name: 'assigned_to', type: 'varchar', description: 'Compliance officer assigned to case' },
      { name: 'screening_request_id', type: 'int', description: 'FK to screening_requests' },
      { name: 'resolution', type: 'varchar', description: 'Final resolution text' },
      { name: 'due_date', type: 'date', description: 'Case resolution due date' },
    ]
  }, {
    name: 'case_notes', description: 'Audit trail of notes and actions on a case',
    fields: [
      { name: 'case_id', type: 'int', description: 'FK to cases' },
      { name: 'note_text', type: 'text', description: 'Note content' },
      { name: 'note_type', type: 'enum', description: 'COMMENT | ACTION | ESCALATION | RESOLUTION' },
      { name: 'created_by', type: 'varchar', description: 'Author of the note' },
    ]
  }]
}

const STATUSES = ['OPEN', 'IN_REVIEW', 'ESCALATED', 'CLOSED', 'DISMISSED']
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const CASE_TYPES = ['SANCTIONS_HIT', 'POTENTIAL_MATCH', 'WATCHLIST', 'TRANSACTION_BLOCK', 'ADVERSE_MEDIA']

export default function Cases() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [tab, setTab] = useState('details')

  const load = async () => {
    setLoading(true)
    try {
      const r = await getCases({ page, limit: 50, search, status, priority })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, status, priority])

  const openView = async (row: any) => {
    const r = await getCase(row.id)
    setSelected(r.data)
    setTab('details')
    setShowDetail(true)
  }

  const openEdit = async (row: any) => {
    const r = await getCase(row.id)
    setForm(r.data)
    setShowForm(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) { await updateCase(form.id, form); toast.success('Case updated') }
      else { await createCase(form); toast.success('Case created') }
      setShowForm(false); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteCase(selected.id); toast.success('Case deleted')
    setShowDelete(false); load()
  }

  const submitNote = async () => {
    if (!note.trim()) return
    await addCaseNote(selected.id, { note_text: note, note_type: 'COMMENT', created_by: 'Compliance Officer' })
    toast.success('Note added')
    setNote('')
    const r = await getCase(selected.id)
    setSelected(r.data)
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))

  const stats = {
    open: data.filter(d => d.status === 'OPEN').length,
    critical: data.filter(d => d.priority === 'CRITICAL').length,
    review: data.filter(d => d.status === 'IN_REVIEW').length,
    escalated: data.filter(d => d.status === 'ESCALATED').length,
  }

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Cases" subtitle="Compliance investigation cases" icon={FileText}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({ status: 'OPEN', priority: 'MEDIUM', case_type: 'POTENTIAL_MATCH' }); setShowForm(true) }} className="btn-primary"><Plus size={14} /> New Case</button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Open Cases" value={stats.open} color="text-blue-400" />
        <StatCard label="Critical" value={stats.critical} color="text-red-400" />
        <StatCard label="In Review" value={stats.review} color="text-amber-400" />
        <StatCard label="Escalated" value={stats.escalated} color="text-purple-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search cases..." />
          <select className="select w-40" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="select w-36" value={priority} onChange={e => { setPriority(e.target.value); setPage(1) }}>
            <option value="">All Priorities</option>
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Case #</th><th>Subject</th><th>Type</th><th>Status</th><th>Priority</th><th>Assigned To</th><th>Due Date</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={9} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={9}><Empty message="No cases found" action={<button className="btn-primary" onClick={() => { setForm({ status: 'OPEN', priority: 'MEDIUM' }); setShowForm(true) }}><Plus size={14} /> New Case</button>} /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id}>
                  <td><span className="font-mono text-xs text-blue-300">{row.case_number}</span></td>
                  <td className="font-medium text-white">{row.subject_name}</td>
                  <td><span className="text-xs text-slate-400">{row.case_type}</span></td>
                  <td><Badge value={row.status} /></td>
                  <td><Badge value={row.priority} /></td>
                  <td className="text-xs text-slate-400">{row.assigned_analyst || row.assigned_to || '—'}</td>
                  <td className="text-xs text-slate-400">{row.sla_due_date ? new Date(row.sla_due_date).toLocaleDateString() : row.due_date ? new Date(row.due_date).toLocaleDateString() : '—'}</td>
                  <td className="text-xs text-slate-500">{row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</td>
                  <td><CrudActions onView={() => openView(row)} onEdit={() => openEdit(row)} onDelete={() => { setSelected(row); setShowDelete(true) }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} total={total} limit={50} onChange={setPage} /></div>
      </div>

      {/* Detail Modal */}
      <Modal open={showDetail} onClose={() => setShowDetail(false)} title={`Case: ${selected?.case_number}`} size="xl">
        {selected && (
          <div className="p-6">
            <TabBar tabs={[{ id: 'details', label: 'Details' }, { id: 'notes', label: `Notes (${selected.notes?.length || 0})` }]} active={tab} onChange={setTab} />
            {tab === 'details' && (
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  {[['Subject', selected.subject_name], ['Case Type', selected.case_type], ['Status', selected.status], ['Priority', selected.priority], ['Assigned To', selected.assigned_analyst || selected.assigned_to], ['SLA Due', selected.sla_due_date ? new Date(selected.sla_due_date).toLocaleDateString() : '—'], ['Opened', selected.opened_at ? new Date(selected.opened_at).toLocaleString() : '—'], ['Decision', selected.decision || '—'], ['SAR Filed', selected.sar_filed ? 'Yes' : 'No']].map(([l, v]) => (
                    <div key={l} className="flex justify-between py-2 border-b border-slate-800">
                      <span className="text-xs text-slate-500">{l}</span>
                      <span className="text-xs text-slate-200 font-medium">{v || '—'}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase mb-2">Resolution</div>
                  <div className="bg-slate-800/60 rounded-xl p-3 text-sm text-slate-300 min-h-[80px]">{selected.resolution || 'No resolution recorded yet.'}</div>
                </div>
              </div>
            )}
            {tab === 'notes' && (
              <div className="space-y-3">
                {selected.notes?.length > 0 ? selected.notes.map((n: any, i: number) => (
                  <div key={i} className="bg-slate-800/60 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-blue-300">{n.created_by}</span>
                      <span className="text-xs text-slate-500">{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</span>
                    </div>
                    <p className="text-sm text-slate-300">{n.note_text}</p>
                  </div>
                )) : <Empty message="No notes yet" />}
                <div className="flex gap-2 mt-4">
                  <input className="input flex-1" value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note..." onKeyDown={e => e.key === 'Enter' && submitNote()} />
                  <button className="btn-primary" onClick={submitNote}><MessageSquare size={14} /> Add</button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Form Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Case' : 'New Case'} size="lg">
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2"><Field label="Subject Name" required><input className="input" value={form.subject_name || ''} onChange={e => f('subject_name', e.target.value)} /></Field></div>
          <Field label="Case Type"><select className="select" value={form.case_type || ''} onChange={e => f('case_type', e.target.value)}><option value="">Select</option>{CASE_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Status"><select className="select" value={form.status || 'OPEN'} onChange={e => f('status', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Priority"><select className="select" value={form.priority || 'MEDIUM'} onChange={e => f('priority', e.target.value)}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Assigned To"><input className="input" value={form.assigned_to || ''} onChange={e => f('assigned_to', e.target.value)} placeholder="Officer name" /></Field>
          <Field label="Due Date"><input className="input" type="date" value={form.due_date || ''} onChange={e => f('due_date', e.target.value)} /></Field>
          <div className="col-span-2"><Field label="Resolution"><textarea className="input h-24 resize-none" value={form.resolution || ''} onChange={e => f('resolution', e.target.value)} /></Field></div>
          <div className="col-span-2 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del} title="Delete Case" message={`Delete case "${selected?.case_number}"?`} />
    </div>
  )
}
