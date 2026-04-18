import React, { useEffect, useState } from 'react'
import { getWatchlist, createWatchlistEntry, updateWatchlistEntry, deleteWatchlistEntry, screenSubject } from '../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { Eye, Plus, RefreshCw, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Watchlist',
  entities: [{
    name: 'watchlist', description: 'Internal watchlist of high-risk individuals and entities for enhanced monitoring',
    fields: [
      { name: 'subject_name', type: 'varchar(500)', description: 'Name of the watched subject', required: true },
      { name: 'subject_type', type: 'enum', description: 'INDIVIDUAL | ENTITY | VESSEL' },
      { name: 'watch_reason', type: 'enum', description: 'PEP | ADVERSE_MEDIA | INTERNAL_RISK | REGULATORY | SANCTIONS_ADJACENT' },
      { name: 'risk_level', type: 'enum', description: 'LOW | MEDIUM | HIGH | CRITICAL' },
      { name: 'status', type: 'enum', description: 'ACTIVE | INACTIVE | ESCALATED' },
      { name: 'nationality', type: 'varchar(2)', description: 'ISO2 nationality' },
      { name: 'date_of_birth', type: 'date', description: 'Date of birth' },
      { name: 'added_by', type: 'varchar', description: 'Officer who added the entry' },
      { name: 'review_date', type: 'date', description: 'Next review date' },
      { name: 'notes', type: 'text', description: 'Additional notes and context' },
    ]
  }]
}

const WATCH_REASONS = ['PEP', 'ADVERSE_MEDIA', 'INTERNAL_RISK', 'REGULATORY', 'SANCTIONS_ADJACENT', 'FRAUD', 'AML']
const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const STATUSES = ['ACTIVE', 'INACTIVE', 'ESCALATED']

export default function Watchlist() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [riskLevel, setRiskLevel] = useState('')
  const [status, setStatus] = useState('ACTIVE')
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
      const r = await getWatchlist({ page, limit: 50, search, risk_level: riskLevel, status })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, riskLevel, status])

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) { await updateWatchlistEntry(form.id, form); toast.success('Watchlist entry updated') }
      else { await createWatchlistEntry({ ...form, added_by: 'Compliance Officer', added_date: new Date().toISOString().split('T')[0] }); toast.success('Added to watchlist') }
      setShowForm(false); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteWatchlistEntry(selected.id); toast.success('Removed from watchlist')
    setShowDelete(false); load()
  }

  const screenEntry = async (row: any) => {
    setScreening(row.id)
    try {
      const r = await screenSubject({
        subjects: [{ subject_name: row.subject_name, subject_type: row.subject_type, dob: row.date_of_birth, nationality: row.nationality }],
        source_system: 'WATCHLIST_SCREEN', requested_by: 'Compliance Officer', threshold: 60
      })
      const result = r.data.overallResult
      if (result === 'BLOCKED') toast.error(`⛔ "${row.subject_name}" is BLOCKED!`)
      else if (result === 'POTENTIAL_MATCH') toast(`⚠️ Potential match found`, { icon: '⚠️' })
      else toast.success(`✓ Clear on all lists`)
    } catch (e: any) { toast.error(e.message) }
    finally { setScreening(null) }
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))
  const critical = data.filter(d => d.risk_level === 'CRITICAL').length
  const high = data.filter(d => d.risk_level === 'HIGH').length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Watchlist" subtitle="Internal high-risk subjects under enhanced monitoring" icon={Eye}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({ subject_type: 'INDIVIDUAL', risk_level: 'HIGH', status: 'ACTIVE', watch_reason: 'PEP' }); setShowForm(true) }} className="btn-primary"><Plus size={14} /> Add to Watchlist</button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Active Entries" value={total.toLocaleString()} />
        <StatCard label="Critical" value={critical} color="text-red-400" />
        <StatCard label="High Risk" value={high} color="text-amber-400" />
        <StatCard label="PEP" value={data.filter(d => d.watch_reason === 'PEP').length} color="text-purple-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search watchlist..." />
          <select className="select w-36" value={riskLevel} onChange={e => { setRiskLevel(e.target.value); setPage(1) }}>
            <option value="">All Risk</option>
            {RISK_LEVELS.map(r => <option key={r}>{r}</option>)}
          </select>
          <select className="select w-36" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            <option value="ACTIVE">Active</option>
            <option value="">All</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Subject Name</th><th>Type</th><th>Reason</th><th>Risk</th><th>Nationality</th><th>Added By</th><th>Review Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={9} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={9}><Empty message="Watchlist is empty" action={<button className="btn-primary" onClick={() => { setForm({ subject_type: 'INDIVIDUAL', risk_level: 'HIGH', status: 'ACTIVE' }); setShowForm(true) }}><Plus size={14} /> Add Entry</button>} /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id}>
                  <td>
                    <div className="font-medium text-white">{row.subject_name}</div>
                    {row.date_of_birth && <div className="text-xs text-slate-500">DOB: {new Date(row.date_of_birth).toLocaleDateString()}</div>}
                  </td>
                  <td><Badge value={row.subject_type} /></td>
                  <td><Badge value={row.watch_reason} /></td>
                  <td><Badge value={row.risk_level} /></td>
                  <td className="text-xs text-slate-400">{row.nationality || '—'}</td>
                  <td className="text-xs text-slate-400">{row.added_by || '—'}</td>
                  <td className="text-xs text-slate-400">{row.review_date ? new Date(row.review_date).toLocaleDateString() : '—'}</td>
                  <td><Badge value={row.status} /></td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => screenEntry(row)} disabled={screening === row.id} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded" title="Screen">
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

      <Modal open={showDetail} onClose={() => setShowDetail(false)} title={`Watchlist: ${selected?.subject_name}`} size="md">
        {selected && (
          <div className="p-6 space-y-1">
            {[['Subject', selected.subject_name], ['Type', selected.subject_type], ['Reason', selected.watch_reason], ['Risk Level', selected.risk_level], ['Nationality', selected.nationality], ['DOB', selected.date_of_birth], ['Added By', selected.added_by], ['Added Date', selected.added_date], ['Review Date', selected.review_date], ['Status', selected.status]].map(([l, v]) => (
              <div key={l} className="flex justify-between py-2 border-b border-slate-800"><span className="text-xs text-slate-500">{l}</span><span className="text-xs text-slate-200 font-medium">{v || '—'}</span></div>
            ))}
            {selected.notes && <div className="mt-3 bg-slate-800/60 rounded-xl p-3 text-sm text-slate-300">{selected.notes}</div>}
          </div>
        )}
      </Modal>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Watchlist Entry' : 'Add to Watchlist'} size="lg">
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2"><Field label="Subject Name" required><input className="input" value={form.subject_name || ''} onChange={e => f('subject_name', e.target.value)} /></Field></div>
          <Field label="Subject Type"><select className="select" value={form.subject_type || 'INDIVIDUAL'} onChange={e => f('subject_type', e.target.value)}><option>INDIVIDUAL</option><option>ENTITY</option><option>VESSEL</option></select></Field>
          <Field label="Watch Reason"><select className="select" value={form.watch_reason || 'PEP'} onChange={e => f('watch_reason', e.target.value)}>{WATCH_REASONS.map(r => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Risk Level"><select className="select" value={form.risk_level || 'HIGH'} onChange={e => f('risk_level', e.target.value)}>{RISK_LEVELS.map(r => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Status"><select className="select" value={form.status || 'ACTIVE'} onChange={e => f('status', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Nationality (ISO2)"><input className="input" value={form.nationality || ''} onChange={e => f('nationality', e.target.value)} maxLength={2} /></Field>
          <Field label="Date of Birth"><input className="input" type="date" value={form.date_of_birth || ''} onChange={e => f('date_of_birth', e.target.value)} /></Field>
          <Field label="Review Date"><input className="input" type="date" value={form.review_date || ''} onChange={e => f('review_date', e.target.value)} /></Field>
          <div className="col-span-2"><Field label="Notes"><textarea className="input h-20 resize-none" value={form.notes || ''} onChange={e => f('notes', e.target.value)} /></Field></div>
          <div className="col-span-2 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Add'}</button></div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del} title="Remove from Watchlist" message={`Remove "${selected?.subject_name}" from watchlist?`} />
    </div>
  )
}
