import React, { useEffect, useState } from 'react'
import { getSanctions, getSanctionEntry, createSanctionEntry, updateSanctionEntry, deleteSanctionEntry } from '../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard, TabBar } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { Database, Plus, RefreshCw, Shield, Filter } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Sanctions Entries',
  entities: [{
    name: 'sanctions_entries', description: 'Master table of all sanctioned individuals, entities, vessels, and aircraft from all lists',
    fields: [
      { name: 'id', type: 'int', description: 'Primary key' },
      { name: 'source_id', type: 'int', description: 'FK to sanctions_list_sources', required: true },
      { name: 'external_id', type: 'varchar(100)', description: 'Original ID from source list (e.g., OFAC UID)' },
      { name: 'entry_type', type: 'enum', description: 'INDIVIDUAL | ENTITY | VESSEL | AIRCRAFT', required: true },
      { name: 'primary_name', type: 'varchar(500)', description: 'Primary sanctioned name', required: true },
      { name: 'dob', type: 'date', description: 'Date of birth (individuals)' },
      { name: 'nationality', type: 'varchar(100)', description: 'ISO2 country code or country name' },
      { name: 'programme', type: 'varchar(500)', description: 'Sanctions programme(s) e.g., IRAN, SDN' },
      { name: 'listing_date', type: 'date', description: 'Date added to sanctions list' },
      { name: 'delisted_date', type: 'date', description: 'Date removed from list (if delisted)' },
      { name: 'status', type: 'enum', description: 'ACTIVE | DELISTED | UNDER_REVIEW' },
      { name: 'last_updated', type: 'date', description: 'Last update from source list' },
    ]
  }, {
    name: 'sanctions_aliases', description: 'Alternative names (AKAs) for sanctions entries',
    fields: [
      { name: 'entry_id', type: 'int', description: 'FK to sanctions_entries' },
      { name: 'alias_name', type: 'varchar(500)', description: 'Alternative name' },
      { name: 'alias_type', type: 'enum', description: 'AKA | NFM (name for matching) | FORMERLY KNOWN AS' },
      { name: 'alias_quality', type: 'enum', description: 'STRONG | WEAK' },
    ]
  }]
}

const ENTRY_TYPES = ['INDIVIDUAL', 'ENTITY', 'VESSEL', 'AIRCRAFT']
const SOURCES = ['OFAC', 'EU', 'UN', 'UK', 'SECO', 'DFAT', 'MAS', 'WORLD_BANK']

export default function SanctionsList() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [entryType, setEntryType] = useState('')
  const [source, setSource] = useState('')
  const [status, setStatus] = useState('ACTIVE')
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
      const r = await getSanctions({ page, limit: 50, search, entry_type: entryType, source_code: source, status })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, entryType, source, status])

  const openEdit = async (row: any) => {
    const r = await getSanctionEntry(row.id)
    setForm(r.data)
    setSelected(r.data)
    setShowForm(true)
  }

  const openView = async (row: any) => {
    const r = await getSanctionEntry(row.id)
    setSelected(r.data)
    setShowDetail(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) {
        await updateSanctionEntry(form.id, form)
        toast.success('Entry updated')
      } else {
        await createSanctionEntry(form)
        toast.success('Entry created')
      }
      setShowForm(false)
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteSanctionEntry(selected.id)
    toast.success('Entry deleted')
    setShowDelete(false)
    load()
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Sanctions Entries" subtitle="All sanctioned individuals, entities, vessels and aircraft across all lists"
        icon={Database}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({}); setShowForm(true) }} className="btn-primary"><Plus size={14} /> Add Entry</button>
        </>}
      />

      {/* Filters */}
      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3 items-center">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search name, programme..." />
          <select className="select w-40" value={entryType} onChange={e => { setEntryType(e.target.value); setPage(1) }}>
            <option value="">All Types</option>
            {ENTRY_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="select w-36" value={source} onChange={e => { setSource(e.target.value); setPage(1) }}>
            <option value="">All Sources</option>
            {SOURCES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="select w-36" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            <option value="ACTIVE">Active</option>
            <option value="DELISTED">Delisted</option>
            <option value="">All Status</option>
          </select>
          <span className="text-xs text-slate-500 ml-auto">{total.toLocaleString()} entries</span>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Type</th><th>Source</th><th>Programme</th>
                <th>DOB</th><th>Nationality</th><th>Status</th><th>Updated</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data.length ? (
                <tr><td colSpan={9} className="text-center py-12"><Spinner /></td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={9}><Empty message="No sanctions entries found" action={<button className="btn-primary" onClick={() => { setForm({}); setShowForm(true) }}><Plus size={14} /> Add Entry</button>} /></td></tr>
              ) : data.map((row: any) => (
                <tr key={row.id}>
                  <td>
                    <div className="font-medium text-white">{row.primary_name}</div>
                    {row.external_id && <div className="text-xs text-slate-500 font-mono">{row.external_id}</div>}
                  </td>
                  <td><Badge value={row.entry_type} /></td>
                  <td><span className="font-mono text-xs text-blue-300 bg-blue-900/20 px-2 py-0.5 rounded">{row.source_code || '—'}</span></td>
                  <td><span className="text-xs text-slate-400 max-w-[120px] truncate block">{row.programme || '—'}</span></td>
                  <td className="text-xs text-slate-400">{row.dob || '—'}</td>
                  <td className="text-xs text-slate-400">{row.nationality || '—'}</td>
                  <td><Badge value={row.status} /></td>
                  <td className="text-xs text-slate-500">{row.last_updated ? new Date(row.last_updated).toLocaleDateString() : '—'}</td>
                  <td>
                    <CrudActions
                      onView={() => openView(row)}
                      onEdit={() => openEdit(row)}
                      onDelete={() => { setSelected(row); setShowDelete(true) }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination page={page} total={total} limit={50} onChange={setPage} />
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={showDetail} onClose={() => setShowDetail(false)} title="Sanctions Entry Detail" size="lg">
        {selected && (
          <div className="p-6 grid grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3">Identity</h4>
              <div className="space-y-1">
                {[['Name', selected.primary_name], ['External ID', selected.external_id], ['Type', selected.entry_type], ['DOB', selected.dob], ['Nationality', selected.nationality], ['Programme', selected.programme], ['Status', selected.status]].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-1.5 border-b border-slate-800">
                    <span className="text-xs text-slate-500">{l}</span>
                    <span className="text-xs text-slate-200 font-medium">{v || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3">Aliases ({selected.alias_count || 0})</h4>
              {selected.aliases?.length > 0 ? (
                <div className="space-y-1">
                  {selected.aliases.map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800">
                      <span className="text-xs text-slate-200">{a.alias_name}</span>
                      <span className="text-xs text-slate-500">{a.alias_type}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-slate-600">No aliases recorded</p>}
            </div>
          </div>
        )}
      </Modal>

      {/* Form Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Sanctions Entry' : 'New Sanctions Entry'} size="lg">
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Primary Name" required><input className="input" value={form.primary_name || ''} onChange={e => f('primary_name', e.target.value)} placeholder="Full sanctioned name" /></Field>
          </div>
          <Field label="Entry Type" required>
            <select className="select" value={form.entry_type || ''} onChange={e => f('entry_type', e.target.value)}>
              <option value="">Select type</option>
              {ENTRY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Source List" required>
            <select className="select" value={form.source_code || ''} onChange={e => f('source_code', e.target.value)}>
              <option value="">Select source</option>
              {SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="External ID"><input className="input" value={form.external_id || ''} onChange={e => f('external_id', e.target.value)} placeholder="Source list ID" /></Field>
          <Field label="Programme"><input className="input" value={form.programme || ''} onChange={e => f('programme', e.target.value)} placeholder="e.g., IRAN, SDN" /></Field>
          <Field label="Date of Birth"><input className="input" type="date" value={form.dob || ''} onChange={e => f('dob', e.target.value)} /></Field>
          <Field label="Nationality"><input className="input" value={form.nationality || ''} onChange={e => f('nationality', e.target.value)} placeholder="ISO2 code or country name" /></Field>
          <Field label="Listing Date"><input className="input" type="date" value={form.listing_date || ''} onChange={e => f('listing_date', e.target.value)} /></Field>
          <Field label="Status">
            <select className="select" value={form.status || 'ACTIVE'} onChange={e => f('status', e.target.value)}>
              <option>ACTIVE</option><option>DELISTED</option><option>UNDER_REVIEW</option>
            </select>
          </Field>
          <div className="col-span-2 flex justify-end gap-3 pt-2">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Create'}</button>
          </div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del}
        title="Delete Sanctions Entry"
        message={`Are you sure you want to delete "${selected?.primary_name}"? This action cannot be undone.`} />
    </div>
  )
}
