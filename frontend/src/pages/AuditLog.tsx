import React, { useEffect, useState } from 'react'
import { getAuditLog } from '../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, PageHeader, StatCard } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { ClipboardList, RefreshCw, Eye } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Audit Log',
  entities: [{
    name: 'audit_log', description: 'Complete immutable audit trail of all system actions and changes',
    fields: [
      { name: 'action_type', type: 'enum', description: 'CREATE | UPDATE | DELETE | SCREEN | LOGIN | EXPORT | APPROVE | REJECT' },
      { name: 'entity_type', type: 'varchar', description: 'Type of entity affected' },
      { name: 'entity_id', type: 'int', description: 'ID of entity affected' },
      { name: 'user_name', type: 'varchar', description: 'User who performed the action' },
      { name: 'ip_address', type: 'varchar', description: 'IP address of the user' },
      { name: 'old_values', type: 'text', description: 'Previous values (JSON)' },
      { name: 'new_values', type: 'text', description: 'New values (JSON)' },
      { name: 'description', type: 'varchar', description: 'Human-readable description' },
      { name: 'session_id', type: 'varchar', description: 'User session identifier' },
    ]
  }]
}

export default function AuditLog() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [actionType, setActionType] = useState('')
  const [entityType, setEntityType] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [showDetail, setShowDetail] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await getAuditLog({ page, limit: 100, search, action_type: actionType, entity_type: entityType })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, actionType, entityType])

  const ACTION_TYPES = ['CREATE', 'UPDATE', 'DELETE', 'SCREEN', 'LOGIN', 'EXPORT', 'APPROVE', 'REJECT']
  const ENTITY_TYPES = ['customers', 'accounts', 'transactions', 'cases', 'alerts', 'watchlist', 'rules', 'sanctions']

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Audit Log" subtitle="Immutable audit trail of all system actions" icon={ClipboardList}
        actions={<button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Events" value={total.toLocaleString()} />
        <StatCard label="Today" value={data.filter(d => d.created_at && new Date(d.created_at).toDateString() === new Date().toDateString()).length} color="text-blue-400" />
        <StatCard label="Screenings" value={data.filter(d => d.action_type === 'SCREEN').length} color="text-purple-400" />
        <StatCard label="Changes" value={data.filter(d => ['CREATE', 'UPDATE', 'DELETE'].includes(d.action_type)).length} color="text-amber-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex flex-wrap gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search audit log..." />
          <select className="select w-36" value={actionType} onChange={e => { setActionType(e.target.value); setPage(1) }}>
            <option value="">All Actions</option>
            {ACTION_TYPES.map(a => <option key={a}>{a}</option>)}
          </select>
          <select className="select w-40" value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1) }}>
            <option value="">All Entities</option>
            {ENTITY_TYPES.map(e => <option key={e}>{e}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Timestamp</th><th>Action</th><th>Entity</th><th>Entity ID</th><th>User</th><th>IP Address</th><th>Description</th><th>Detail</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={8} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={8}><Empty message="No audit events found" /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id}>
                  <td className="text-xs text-slate-400 whitespace-nowrap">{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                  <td><Badge value={row.action_type} /></td>
                  <td className="text-xs text-slate-400">{row.entity_type}</td>
                  <td className="text-xs text-slate-500">{row.entity_id}</td>
                  <td className="text-xs text-slate-300">{row.user_name || 'System'}</td>
                  <td className="text-xs font-mono text-slate-500">{row.ip_address || '—'}</td>
                  <td className="text-xs text-slate-400 max-w-[200px] truncate">{row.description || '—'}</td>
                  <td>
                    {(row.old_values || row.new_values) && (
                      <button onClick={() => { setSelected(row); setShowDetail(true) }} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded">
                        <Eye size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} total={total} limit={100} onChange={setPage} /></div>
      </div>

      <Modal open={showDetail} onClose={() => setShowDetail(false)} title="Audit Event Detail" size="lg">
        {selected && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[['Action', selected.action_type], ['Entity', selected.entity_type], ['Entity ID', selected.entity_id], ['User', selected.user_name], ['IP', selected.ip_address], ['Session', selected.session_id], ['Time', selected.created_at ? new Date(selected.created_at).toLocaleString() : '—']].map(([l, v]) => (
                <div key={l} className="flex justify-between py-2 border-b border-slate-800"><span className="text-xs text-slate-500">{l}</span><span className="text-xs text-slate-200 font-medium">{v || '—'}</span></div>
              ))}
            </div>
            {selected.old_values && (
              <div>
                <div className="text-xs text-slate-400 uppercase mb-2">Previous Values</div>
                <pre className="bg-slate-800/60 rounded-xl p-3 text-xs text-slate-300 overflow-auto max-h-40">{JSON.stringify(JSON.parse(selected.old_values || '{}'), null, 2)}</pre>
              </div>
            )}
            {selected.new_values && (
              <div>
                <div className="text-xs text-slate-400 uppercase mb-2">New Values</div>
                <pre className="bg-slate-800/60 rounded-xl p-3 text-xs text-slate-300 overflow-auto max-h-40">{JSON.stringify(JSON.parse(selected.new_values || '{}'), null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
