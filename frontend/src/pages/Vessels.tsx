import React, { useEffect, useState } from 'react'
import { getVessels, createVessel, updateVessel, deleteVessel, screenSubject } from '../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { Ship, Plus, RefreshCw, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Vessels',
  entities: [{
    name: 'vessels', description: 'Vessel registry with IMO tracking and sanctions screening',
    fields: [
      { name: 'vessel_name', type: 'varchar(500)', description: 'Vessel name', required: true },
      { name: 'imo_number', type: 'varchar(20)', description: 'IMO vessel identification number' },
      { name: 'mmsi', type: 'varchar(20)', description: 'Maritime Mobile Service Identity' },
      { name: 'vessel_type', type: 'enum', description: 'TANKER | BULK_CARRIER | CONTAINER | GENERAL_CARGO | PASSENGER | FISHING' },
      { name: 'flag_country', type: 'varchar(2)', description: 'Flag state ISO2 code' },
      { name: 'owner_name', type: 'varchar(500)', description: 'Registered owner (screened)' },
      { name: 'operator_name', type: 'varchar(500)', description: 'Commercial operator (screened)' },
      { name: 'gross_tonnage', type: 'int', description: 'Gross tonnage' },
      { name: 'year_built', type: 'int', description: 'Year of construction' },
      { name: 'sanctions_status', type: 'enum', description: 'CLEAR | FLAGGED | BLOCKED' },
    ]
  }]
}

const VESSEL_TYPES = ['TANKER', 'BULK_CARRIER', 'CONTAINER', 'GENERAL_CARGO', 'PASSENGER', 'FISHING', 'OFFSHORE', 'NAVAL']

export default function Vessels() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [vesselType, setVesselType] = useState('')
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
      const r = await getVessels({ page, limit: 50, search, vessel_type: vesselType })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, vesselType])

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) { await updateVessel(form.id, form); toast.success('Vessel updated') }
      else { await createVessel(form); toast.success('Vessel created') }
      setShowForm(false); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteVessel(selected.id); toast.success('Vessel deleted')
    setShowDelete(false); load()
  }

  const screenVessel = async (row: any) => {
    setScreening(row.id)
    try {
      const r = await screenSubject({
        subjects: [{ subject_name: row.vessel_name, subject_type: 'VESSEL', id_number: row.imo_number }],
        source_system: 'VESSEL_SCREEN', requested_by: 'Compliance Officer', threshold: 65
      })
      const result = r.data.overallResult
      if (result === 'BLOCKED') toast.error(`⛔ Vessel "${row.vessel_name}" is BLOCKED!`)
      else if (result === 'POTENTIAL_MATCH') toast(`⚠️ Vessel potential match`, { icon: '⚠️' })
      else toast.success(`✓ Vessel clear`)
      load()
    } catch (e: any) { toast.error(e.message) }
    finally { setScreening(null) }
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))
  const blocked = data.filter(d => d.sanctions_status === 'BLOCKED').length
  const flagged = data.filter(d => d.sanctions_status === 'FLAGGED').length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Vessels" subtitle="Vessel registry with IMO tracking and sanctions screening" icon={Ship}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({ vessel_type: 'TANKER', sanctions_status: 'CLEAR' }); setShowForm(true) }} className="btn-primary"><Plus size={14} /> Register Vessel</button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Vessels" value={total.toLocaleString()} />
        <StatCard label="Blocked" value={blocked} color="text-red-400" />
        <StatCard label="Flagged" value={flagged} color="text-amber-400" />
        <StatCard label="Clear" value={data.filter(d => d.sanctions_status === 'CLEAR').length} color="text-green-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search vessels, IMO..." />
          <select className="select w-44" value={vesselType} onChange={e => { setVesselType(e.target.value); setPage(1) }}>
            <option value="">All Types</option>
            {VESSEL_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vessel Name</th><th>IMO</th><th>Type</th><th>Flag</th><th>Owner</th><th>Gross Tonnage</th><th>Year Built</th><th>Sanctions</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={9} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={9}><Empty message="No vessels found" action={<button className="btn-primary" onClick={() => { setForm({ vessel_type: 'TANKER' }); setShowForm(true) }}><Plus size={14} /> Register Vessel</button>} /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id} className={row.sanctions_status === 'BLOCKED' ? 'bg-red-900/10' : ''}>
                  <td>
                    <div className="font-semibold text-white">{row.vessel_name}</div>
                    {row.mmsi && <div className="text-xs text-slate-500">MMSI: {row.mmsi}</div>}
                  </td>
                  <td><span className="font-mono text-xs text-blue-300">{row.imo_number || '—'}</span></td>
                  <td><Badge value={row.vessel_type} /></td>
                  <td className="text-xs text-slate-400">{row.flag_country || '—'}</td>
                  <td className="text-xs text-slate-300 max-w-[120px] truncate">{row.owner_name || '—'}</td>
                  <td className="text-xs text-slate-400">{row.gross_tonnage?.toLocaleString() || '—'}</td>
                  <td className="text-xs text-slate-400">{row.year_built || '—'}</td>
                  <td><Badge value={row.sanctions_status || 'CLEAR'} /></td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => screenVessel(row)} disabled={screening === row.id} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded" title="Screen">
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

      <Modal open={showDetail} onClose={() => setShowDetail(false)} title={`Vessel: ${selected?.vessel_name}`} size="md">
        {selected && (
          <div className="p-6 space-y-1">
            {[['Name', selected.vessel_name], ['IMO', selected.imo_number], ['MMSI', selected.mmsi], ['Type', selected.vessel_type], ['Flag', selected.flag_country], ['Owner', selected.owner_name], ['Operator', selected.operator_name], ['Gross Tonnage', selected.gross_tonnage?.toLocaleString()], ['Year Built', selected.year_built], ['Sanctions', selected.sanctions_status]].map(([l, v]) => (
              <div key={l} className="flex justify-between py-2 border-b border-slate-800"><span className="text-xs text-slate-500">{l}</span><span className="text-xs text-slate-200 font-medium">{v || '—'}</span></div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Vessel' : 'Register Vessel'} size="lg">
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2"><Field label="Vessel Name" required><input className="input" value={form.vessel_name || ''} onChange={e => f('vessel_name', e.target.value)} /></Field></div>
          <Field label="IMO Number"><input className="input" value={form.imo_number || ''} onChange={e => f('imo_number', e.target.value)} placeholder="IMO1234567" /></Field>
          <Field label="MMSI"><input className="input" value={form.mmsi || ''} onChange={e => f('mmsi', e.target.value)} /></Field>
          <Field label="Vessel Type"><select className="select" value={form.vessel_type || 'TANKER'} onChange={e => f('vessel_type', e.target.value)}>{VESSEL_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Flag Country (ISO2)"><input className="input" value={form.flag_country || ''} onChange={e => f('flag_country', e.target.value)} maxLength={2} /></Field>
          <div className="col-span-2"><Field label="Owner Name"><input className="input" value={form.owner_name || ''} onChange={e => f('owner_name', e.target.value)} /></Field></div>
          <div className="col-span-2"><Field label="Operator Name"><input className="input" value={form.operator_name || ''} onChange={e => f('operator_name', e.target.value)} /></Field></div>
          <Field label="Gross Tonnage"><input className="input" type="number" value={form.gross_tonnage || ''} onChange={e => f('gross_tonnage', e.target.value)} /></Field>
          <Field label="Year Built"><input className="input" type="number" value={form.year_built || ''} onChange={e => f('year_built', e.target.value)} /></Field>
          <div className="col-span-2 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Register'}</button></div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del} title="Delete Vessel" message={`Delete vessel "${selected?.vessel_name}"?`} />
    </div>
  )
}
