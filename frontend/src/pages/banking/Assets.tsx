import React, { useEffect, useState } from 'react'
import { getAssets, createAsset, updateAsset, deleteAsset } from '../../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { TrendingUp, Plus, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Assets',
  entities: [{
    name: 'core_assets', description: 'Customer assets under management including real estate, securities, and other holdings',
    fields: [
      { name: 'asset_number', type: 'varchar(20)', description: 'Unique asset reference' },
      { name: 'customer_id', type: 'int', description: 'FK to core_customers' },
      { name: 'asset_type', type: 'enum', description: 'REAL_ESTATE | SECURITIES | VEHICLE | BUSINESS | PRECIOUS_METALS | CRYPTOCURRENCY | OTHER' },
      { name: 'asset_name', type: 'varchar(500)', description: 'Asset description/name' },
      { name: 'current_value', type: 'decimal(18,2)', description: 'Current market value' },
      { name: 'currency', type: 'varchar(3)', description: 'Valuation currency' },
      { name: 'status', type: 'enum', description: 'ACTIVE | FROZEN | DISPOSED | UNDER_REVIEW' },
      { name: 'acquisition_date', type: 'date', description: 'Date asset was acquired' },
      { name: 'location', type: 'varchar', description: 'Physical location (for real estate/vehicles)' },
    ]
  }]
}

const ASSET_TYPES = ['REAL_ESTATE', 'SECURITIES', 'VEHICLE', 'BUSINESS', 'PRECIOUS_METALS', 'CRYPTOCURRENCY', 'CASH', 'OTHER']
const STATUSES = ['ACTIVE', 'FROZEN', 'DISPOSED', 'UNDER_REVIEW']

export default function Assets() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [assetType, setAssetType] = useState('')
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
      const r = await getAssets({ page, limit: 50, search, asset_type: assetType, status })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, assetType, status])

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) { await updateAsset(form.id, form); toast.success('Asset updated') }
      else { await createAsset(form); toast.success('Asset created') }
      setShowForm(false); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteAsset(selected.id); toast.success('Asset deleted')
    setShowDelete(false); load()
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))
  const totalValue = data.reduce((s, d) => s + (parseFloat(d.current_value) || 0), 0)
  const frozen = data.filter(d => d.status === 'FROZEN').length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Assets" subtitle="Customer assets under management" icon={TrendingUp}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({ asset_type: 'REAL_ESTATE', currency: 'USD', status: 'ACTIVE' }); setShowForm(true) }} className="btn-primary"><Plus size={14} /> New Asset</button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Assets" value={total.toLocaleString()} />
        <StatCard label="Total Value" value={`$${(totalValue / 1e6).toFixed(2)}M`} color="text-green-400" />
        <StatCard label="Frozen" value={frozen} color="text-red-400" />
        <StatCard label="Under Review" value={data.filter(d => d.status === 'UNDER_REVIEW').length} color="text-amber-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search assets..." />
          <select className="select w-44" value={assetType} onChange={e => { setAssetType(e.target.value); setPage(1) }}>
            <option value="">All Types</option>
            {ASSET_TYPES.map(t => <option key={t}>{t}</option>)}
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
            <thead><tr><th>Asset #</th><th>Name</th><th>Type</th><th>Customer</th><th>Value</th><th>Currency</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={9} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={9}><Empty message="No assets found" action={<button className="btn-primary" onClick={() => { setForm({ asset_type: 'REAL_ESTATE', currency: 'USD', status: 'ACTIVE' }); setShowForm(true) }}><Plus size={14} /> New Asset</button>} /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id}>
                  <td><span className="font-mono text-xs text-blue-300">{row.asset_number}</span></td>
                  <td className="font-medium text-white max-w-[180px] truncate">{row.asset_name}</td>
                  <td><Badge value={row.asset_type} /></td>
                  <td className="text-xs text-slate-400">{row.customer_name || row.customer_id}</td>
                  <td className="font-mono text-sm font-semibold text-green-400">{parseFloat(row.current_value || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}</td>
                  <td><span className="font-mono text-xs">{row.currency}</span></td>
                  <td className="text-xs text-slate-400 max-w-[120px] truncate">{row.location || '—'}</td>
                  <td><Badge value={row.status} /></td>
                  <td><CrudActions onEdit={() => { setForm(row); setShowForm(true) }} onDelete={() => { setSelected(row); setShowDelete(true) }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} total={total} limit={50} onChange={setPage} /></div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit Asset' : 'New Asset'} size="lg">
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2"><Field label="Asset Name" required><input className="input" value={form.asset_name || ''} onChange={e => f('asset_name', e.target.value)} /></Field></div>
          <Field label="Asset Type"><select className="select" value={form.asset_type || 'REAL_ESTATE'} onChange={e => f('asset_type', e.target.value)}>{ASSET_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Customer ID"><input className="input" type="number" value={form.customer_id || ''} onChange={e => f('customer_id', e.target.value)} /></Field>
          <Field label="Current Value"><input className="input" type="number" step="0.01" value={form.current_value || ''} onChange={e => f('current_value', e.target.value)} /></Field>
          <Field label="Currency"><select className="select" value={form.currency || 'USD'} onChange={e => f('currency', e.target.value)}><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>SGD</option></select></Field>
          <Field label="Status"><select className="select" value={form.status || 'ACTIVE'} onChange={e => f('status', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Acquisition Date"><input className="input" type="date" value={form.acquisition_date || ''} onChange={e => f('acquisition_date', e.target.value)} /></Field>
          <div className="col-span-2"><Field label="Location"><input className="input" value={form.location || ''} onChange={e => f('location', e.target.value)} /></Field></div>
          <div className="col-span-2 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del} title="Delete Asset" message={`Delete asset "${selected?.asset_name}"?`} />
    </div>
  )
}
