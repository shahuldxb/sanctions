import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSanctions, deleteSanctionEntry, updateSanctionEntry } from '../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, CrudActions, PageHeader, Confirm, StatCard } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { Shield, Globe, Scale, Building2, RefreshCw, Search, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'

const SOURCE_INFO: Record<string, any> = {
  ofac: { code: 'OFAC', name: 'OFAC Specially Designated Nationals', icon: Shield, color: 'text-red-400', url: 'https://ofac.treasury.gov', description: 'US Treasury Office of Foreign Assets Control — SDN and Consolidated Sanctions List' },
  eu: { code: 'EU', name: 'EU Consolidated Financial Sanctions', icon: Globe, color: 'text-blue-400', url: 'https://data.europa.eu', description: 'European Union Consolidated Financial Sanctions List' },
  un: { code: 'UN', name: 'UN Security Council Consolidated List', icon: Scale, color: 'text-teal-400', url: 'https://scsanctions.un.org', description: 'United Nations Security Council Consolidated Sanctions List' },
  uk: { code: 'UK', name: 'UK OFSI Consolidated Sanctions', icon: Building2, color: 'text-purple-400', url: 'https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets', description: 'UK Office of Financial Sanctions Implementation' },
  seco: { code: 'SECO', name: 'SECO Swiss Sanctions', icon: Shield, color: 'text-amber-400', url: 'https://www.seco.admin.ch', description: 'Swiss State Secretariat for Economic Affairs' },
  dfat: { code: 'DFAT', name: 'DFAT Australia Sanctions', icon: Shield, color: 'text-green-400', url: 'https://www.dfat.gov.au', description: 'Australian Department of Foreign Affairs and Trade' },
  mas: { code: 'MAS', name: 'MAS Singapore Sanctions', icon: Shield, color: 'text-cyan-400', url: 'https://www.mas.gov.sg', description: 'Monetary Authority of Singapore Targeted Financial Sanctions' },
}

export default function SanctionsListBySource() {
  const { source } = useParams<{ source: string }>()
  const navigate = useNavigate()
  const info = SOURCE_INFO[source?.toLowerCase() || ''] || { code: source?.toUpperCase(), name: source, icon: Shield, color: 'text-white', description: '' }

  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [entryType, setEntryType] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [showDelete, setShowDelete] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await getSanctions({ page, limit: 50, search, entry_type: entryType, source_code: info.code, status: 'ACTIVE' })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, entryType, source])

  const del = async () => {
    await deleteSanctionEntry(selected.id)
    toast.success('Entry removed')
    setShowDelete(false)
    load()
  }

  const Icon = info.icon

  const PAGE_META = {
    title: `${info.name} List`,
    entities: [{
      name: `${info.code} Sanctions Entries`, description: info.description,
      fields: [
        { name: 'external_id', type: 'varchar', description: `${info.code}-specific unique identifier` },
        { name: 'primary_name', type: 'varchar(500)', description: 'Primary sanctioned name' },
        { name: 'entry_type', type: 'enum', description: 'INDIVIDUAL | ENTITY | VESSEL | AIRCRAFT' },
        { name: 'programme', type: 'varchar', description: `${info.code} sanctions programme/regime` },
        { name: 'dob', type: 'date', description: 'Date of birth' },
        { name: 'nationality', type: 'varchar', description: 'Country of nationality/registration' },
        { name: 'status', type: 'enum', description: 'ACTIVE | DELISTED' },
        { name: 'last_updated', type: 'date', description: 'Last update from source' },
      ]
    }]
  }

  // Counts by type
  const individuals = data.filter(d => d.entry_type === 'INDIVIDUAL').length
  const entities = data.filter(d => d.entry_type === 'ENTITY').length
  const vessels = data.filter(d => d.entry_type === 'VESSEL').length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 bg-slate-800 rounded-xl border border-slate-700`}>
            <Icon size={28} className={info.color} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{info.name}</h1>
            <p className="text-sm text-slate-400 mt-0.5">{info.description}</p>
            <a href={info.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
              <ExternalLink size={10} /> {info.url}
            </a>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/screening/${source}`)} className="btn-primary"><Search size={14} /> Screen Against {info.code}</button>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Entries" value={total.toLocaleString()} color={info.color} />
        <StatCard label="Individuals" value={individuals} />
        <StatCard label="Entities" value={entities} />
        <StatCard label="Vessels" value={vessels} />
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3 items-center">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder={`Search ${info.code} list...`} />
          <select className="select w-40" value={entryType} onChange={e => { setEntryType(e.target.value); setPage(1) }}>
            <option value="">All Types</option>
            <option>INDIVIDUAL</option><option>ENTITY</option><option>VESSEL</option><option>AIRCRAFT</option>
          </select>
          <span className="text-xs text-slate-500 ml-auto">{total.toLocaleString()} active entries</span>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>ID</th><th>Type</th><th>Programme</th><th>DOB</th><th>Nationality</th><th>Updated</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading && !data.length ? (
                <tr><td colSpan={8} className="text-center py-12"><Spinner /></td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={8}><Empty message={`No ${info.code} entries found. Run the scraper to load data.`}
                  action={<button className="btn-primary" onClick={() => navigate('/process/scraper')}>Go to Scraper</button>} /></td></tr>
              ) : data.map((row: any) => (
                <tr key={row.id}>
                  <td>
                    <div className="font-semibold text-white">{row.primary_name}</div>
                    {row.alias_count > 0 && <div className="text-xs text-slate-500">{row.alias_count} alias{row.alias_count > 1 ? 'es' : ''}</div>}
                  </td>
                  <td><span className="font-mono text-xs text-slate-500">{row.external_id || '—'}</span></td>
                  <td><Badge value={row.entry_type} /></td>
                  <td><span className="text-xs text-slate-400 max-w-[140px] truncate block">{row.programme || '—'}</span></td>
                  <td className="text-xs text-slate-400">{row.dob || '—'}</td>
                  <td className="text-xs text-slate-400">{row.nationality || '—'}</td>
                  <td className="text-xs text-slate-500">{row.last_updated ? new Date(row.last_updated).toLocaleDateString() : '—'}</td>
                  <td>
                    <CrudActions
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

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del}
        title="Remove Entry" message={`Remove "${selected?.primary_name}" from the ${info.code} list?`} />
    </div>
  )
}
