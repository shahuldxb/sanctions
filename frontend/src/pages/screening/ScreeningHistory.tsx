import React, { useEffect, useState } from 'react'
import { getScreeningRequests, getScreeningMatches, updateMatch } from '../../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, CrudActions, PageHeader, ScoreBar, StatCard } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Clock, RefreshCw, Eye } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Screening History',
  entities: [{
    name: 'screening_requests', description: 'All screening requests submitted to the engine',
    fields: [
      { name: 'id', type: 'int', description: 'Primary key' },
      { name: 'request_id', type: 'varchar(50)', description: 'Unique request identifier' },
      { name: 'subject_name', type: 'varchar(500)', description: 'Name that was screened' },
      { name: 'subject_type', type: 'enum', description: 'INDIVIDUAL | ENTITY | VESSEL' },
      { name: 'overall_result', type: 'enum', description: 'CLEAR | POTENTIAL_MATCH | BLOCKED' },
      { name: 'match_count', type: 'int', description: 'Number of matches found' },
      { name: 'top_score', type: 'decimal', description: 'Highest match score 0-100' },
      { name: 'source_system', type: 'varchar', description: 'System that initiated the screening' },
      { name: 'requested_by', type: 'varchar', description: 'User or system that requested screening' },
      { name: 'started_at', type: 'datetime', description: 'When screening started' },
      { name: 'completed_at', type: 'datetime', description: 'When screening completed' },
    ]
  }]
}

export default function ScreeningHistory() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [matches, setMatches] = useState<any[]>([])
  const [showDetail, setShowDetail] = useState(false)
  const [stats, setStats] = useState({ total: 0, blocked: 0, review: 0, clear: 0 })

  const load = async () => {
    setLoading(true)
    try {
      const r = await getScreeningRequests({ page, limit: 50, search, result })
      setData(r.data.data || [])
      setTotal(r.data.total || 0)
      const d = r.data.data || []
      setStats({
        total: r.data.total || 0,
        blocked: d.filter((x: any) => x.overall_result === 'BLOCKED').length,
        review: d.filter((x: any) => x.overall_result === 'POTENTIAL_MATCH').length,
        clear: d.filter((x: any) => x.overall_result === 'CLEAR').length,
      })
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, result])

  const viewDetail = async (row: any) => {
    setSelected(row)
    try {
      const r = await getScreeningMatches(row.id)
      setMatches(r.data || [])
    } catch { setMatches([]) }
    setShowDetail(true)
  }

  const disposeMatch = async (matchId: number, disposition: string) => {
    await updateMatch(matchId, { disposition, disposed_by: 'Compliance Officer', disposed_at: new Date().toISOString() })
    toast.success('Match disposition updated')
    const r = await getScreeningMatches(selected.id)
    setMatches(r.data || [])
  }

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Screening History" subtitle="All screening requests and results" icon={Clock}
        actions={<button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Screenings" value={stats.total.toLocaleString()} />
        <StatCard label="Blocked" value={stats.blocked} color="text-red-400" />
        <StatCard label="Review" value={stats.review} color="text-amber-400" />
        <StatCard label="Clear" value={stats.clear} color="text-green-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4 flex gap-3">
          <SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search by name..." />
          <select className="select w-44" value={result} onChange={e => { setResult(e.target.value); setPage(1) }}>
            <option value="">All Results</option>
            <option value="BLOCKED">Blocked</option>
            <option value="POTENTIAL_MATCH">Potential Match</option>
            <option value="CLEAR">Clear</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Subject Name</th><th>Type</th><th>Result</th><th>Matches</th><th>Top Score</th><th>Source</th><th>Requested By</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={9} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={9}><Empty message="No screening history yet" /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id}>
                  <td className="font-medium text-white">{row.subject_name}</td>
                  <td><Badge value={row.subject_type || 'INDIVIDUAL'} /></td>
                  <td><Badge value={row.overall_result} /></td>
                  <td className="text-center">{row.match_count || 0}</td>
                  <td>
                    {row.top_score > 0 ? (
                      <div className="flex items-center gap-2 w-20">
                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${row.top_score >= 90 ? 'bg-red-500' : row.top_score >= 70 ? 'bg-amber-500' : 'bg-yellow-500'}`} style={{ width: `${row.top_score}%` }} />
                        </div>
                        <span className="text-xs font-bold">{Math.round(row.top_score)}%</span>
                      </div>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="text-xs text-slate-400">{row.source_system}</td>
                  <td className="text-xs text-slate-400">{row.requested_by}</td>
                  <td className="text-xs text-slate-500">{row.started_at ? new Date(row.started_at).toLocaleString() : '—'}</td>
                  <td><CrudActions onView={() => viewDetail(row)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} total={total} limit={50} onChange={setPage} /></div>
      </div>

      <Modal open={showDetail} onClose={() => setShowDetail(false)} title="Screening Request Detail" size="xl">
        {selected && (
          <div className="p-6">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-800/60 rounded-xl p-4"><div className="text-xs text-slate-400 mb-1">Subject</div><div className="font-semibold text-white">{selected.subject_name}</div></div>
              <div className="bg-slate-800/60 rounded-xl p-4"><div className="text-xs text-slate-400 mb-1">Result</div><Badge value={selected.overall_result} /></div>
              <div className="bg-slate-800/60 rounded-xl p-4"><div className="text-xs text-slate-400 mb-1">Screened</div><div className="text-sm text-slate-200">{selected.started_at ? new Date(selected.started_at).toLocaleString() : '—'}</div></div>
            </div>
            <h4 className="font-semibold text-white mb-3">Matches ({matches.length})</h4>
            {matches.length === 0 ? <Empty message="No matches found" /> : (
              <div className="space-y-3">
                {matches.map((m: any) => (
                  <div key={m.id} className="bg-slate-800/60 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <div className="font-semibold text-white">{m.matched_name}</div>
                        <div className="text-xs text-slate-500"><span className="text-blue-300">{m.source_code}</span> · {m.match_type}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${m.match_score >= 90 ? 'text-red-400' : m.match_score >= 70 ? 'text-amber-400' : 'text-yellow-400'}`}>{Math.round(m.match_score)}%</div>
                        <Badge value={m.disposition || 'PENDING'} />
                      </div>
                    </div>
                    <ScoreBar score={m.match_score} />
                    {m.disposition === 'PENDING' && (
                      <div className="flex gap-2 mt-3">
                        <button className="btn-danger text-xs py-1" onClick={() => disposeMatch(m.id, 'CONFIRMED_MATCH')}>Confirm Match</button>
                        <button className="btn-success text-xs py-1" onClick={() => disposeMatch(m.id, 'FALSE_POSITIVE')}>False Positive</button>
                        <button className="btn-warn text-xs py-1" onClick={() => disposeMatch(m.id, 'ESCALATED')}>Escalate</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
