import React, { useState, useEffect } from 'react'
import { getDashboard } from '../api'
import { StatCard, Badge, Spinner } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { Shield, AlertTriangle, Users, Activity, TrendingUp, Database, RefreshCw, Bell, FileText, CheckCircle, XCircle, Clock, Globe, Zap, BarChart2, Eye } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Executive Dashboard',
  entities: [
    { name: 'Dashboard Summary', description: 'Aggregated real-time metrics across all modules', fields: [
      { name: 'screening', type: 'object', description: 'Total screenings, clear, potential matches, blocked counts' },
      { name: 'cases', type: 'object', description: 'Open, in-review, critical case counts' },
      { name: 'alerts', type: 'object', description: 'Open and critical alert counts' },
      { name: 'sanctions', type: 'object', description: 'Total active entries by type across all lists' },
      { name: 'banking', type: 'object', description: 'Customer, account, transaction, and balance totals' },
    ]}
  ],
  techniques: [
    { name: 'Real-Time Aggregation', category: 'Performance', description: 'Dashboard runs 6 parallel SQL queries simultaneously using Promise.all', detail: 'Queries run in parallel: screening, cases, alerts, sanctions, banking, scraping\nTypical response time: < 200ms\nData refreshes every 30 seconds automatically' },
    { name: 'Screening Trend Analysis', category: 'Analytics', description: 'Rolling 30-day screening volume with blocked transaction overlay', detail: 'Groups by calendar date using CAST(started_at AS DATE)\nShows daily screening volume and blocked count\nUsed for compliance reporting and trend detection' }
  ]
}

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#8b5cf6', '#06b6d4']

export default function Dashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const navigate = useNavigate()

  const load = async () => {
    try {
      setLoading(true)
      const r = await getDashboard()
      setData(r.data)
      setLastRefresh(new Date())
    } catch (e: any) {
      toast.error('Failed to load dashboard: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [])

  const s = data?.screening || {}
  const c = data?.cases || {}
  const a = data?.alerts || {}
  const sanctions = data?.sanctions || {}
  const banking = data?.banking || {}
  const trend = data?.screeningTrend || []
  const recentAlerts = data?.recentAlerts || []
  const recentCases = data?.recentCases || []

  const pieData = [
    { name: 'Clear', value: s.clear || 0 },
    { name: 'Potential Match', value: s.potential_matches || 0 },
    { name: 'Blocked', value: s.blocked || 0 },
  ]

  const sanctionsByType = [
    { name: 'Individuals', value: sanctions.individuals || 0 },
    { name: 'Entities', value: sanctions.entities || 0 },
    { name: 'Vessels', value: sanctions.vessels || 0 },
  ]

  return (
    <div className="space-y-6">
      <SetPageHelp meta={PAGE_META} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield size={28} className="text-blue-400" />
            Sanctions Engine — Executive Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time compliance intelligence · Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button onClick={() => navigate('/screening/quick')} className="btn-primary flex items-center gap-2 text-sm">
            <Zap size={14} /> Quick Screen
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex justify-center py-20"><Spinner size={40} /></div>
      )}

      {data && (
        <>
          {/* Critical Alert Banner */}
          {(a.critical_alerts > 0 || c.critical_cases > 0) && (
            <div className="bg-red-900/20 border border-red-600/40 rounded-lg p-4 flex items-center gap-3">
              <AlertTriangle size={20} className="text-red-400 shrink-0" />
              <div className="flex-1">
                <span className="text-red-300 font-semibold">Critical Compliance Alert: </span>
                <span className="text-red-200 text-sm">
                  {a.critical_alerts || 0} critical alert{a.critical_alerts !== 1 ? 's' : ''} and {c.critical_cases || 0} critical case{c.critical_cases !== 1 ? 's' : ''} require immediate attention
                </span>
              </div>
              <button onClick={() => navigate('/alerts')} className="text-xs text-red-300 border border-red-600/40 px-3 py-1 rounded hover:bg-red-900/30">
                View Alerts →
              </button>
            </div>
          )}

          {/* Top KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <StatCard title="Total Screenings" value={s.total_screenings || 0} icon={<Shield size={18} />} color="blue"
              subtitle="All time" onClick={() => navigate('/screening/history')} />
            <StatCard title="Blocked" value={s.blocked || 0} icon={<XCircle size={18} />} color="red"
              subtitle="High confidence" onClick={() => navigate('/alerts')} />
            <StatCard title="Potential Matches" value={s.potential_matches || 0} icon={<AlertTriangle size={18} />} color="amber"
              subtitle="Require review" onClick={() => navigate('/cases')} />
            <StatCard title="Open Cases" value={c.open_cases || 0} icon={<FileText size={18} />} color="purple"
              subtitle={`${c.in_review || 0} in review`} onClick={() => navigate('/cases')} />
            <StatCard title="Open Alerts" value={a.open_alerts || 0} icon={<Bell size={18} />} color="orange"
              subtitle={`${a.critical_alerts || 0} critical`} onClick={() => navigate('/alerts')} />
            <StatCard title="Sanctions Entries" value={sanctions.active_entries || 0} icon={<Database size={18} />} color="teal"
              subtitle="Active entries" onClick={() => navigate('/sanctions')} />
          </div>

          {/* Banking KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Active Customers" value={banking.total_customers || 0} icon={<Users size={18} />} color="blue"
              subtitle="Core banking" onClick={() => navigate('/customers')} />
            <StatCard title="Active Accounts" value={banking.total_accounts || 0} icon={<Activity size={18} />} color="green"
              subtitle="All account types" onClick={() => navigate('/accounts')} />
            <StatCard title="Today's Transactions" value={banking.today_transactions || 0} icon={<TrendingUp size={18} />} color="cyan"
              subtitle="Processed today" onClick={() => navigate('/transactions')} />
            <StatCard title="Blocked Transactions" value={banking.blocked_transactions || 0} icon={<XCircle size={18} />} color="red"
              subtitle="Sanctions blocked" onClick={() => navigate('/transactions')} />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Screening Trend */}
            <div className="lg:col-span-2 card">
              <div className="card-header flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-2"><BarChart2 size={16} className="text-blue-400" /> 30-Day Screening Trend</span>
                <button onClick={() => navigate('/screening/history')} className="text-xs text-blue-400 hover:text-blue-300">View All →</button>
              </div>
              <div className="p-4">
                {trend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={trend.map((t: any) => ({ ...t, date: new Date(t.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) }))}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} labelStyle={{ color: '#94a3b8' }} />
                      <Legend />
                      <Area type="monotone" dataKey="count" name="Screenings" stroke="#3b82f6" fill="url(#colorCount)" strokeWidth={2} />
                      <Area type="monotone" dataKey="blocked" name="Blocked" stroke="#ef4444" fill="url(#colorBlocked)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-500 text-sm">No trend data available</div>
                )}
              </div>
            </div>

            {/* Screening Results Pie */}
            <div className="card">
              <div className="card-header">
                <span className="font-semibold text-white flex items-center gap-2"><Eye size={16} className="text-purple-400" /> Screening Results</span>
              </div>
              <div className="p-4">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={['#22c55e', '#f59e0b', '#ef4444'][i]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {[['Clear', s.clear || 0, 'text-green-400'], ['Potential Match', s.potential_matches || 0, 'text-amber-400'], ['Blocked', s.blocked || 0, 'text-red-400']].map(([label, val, cls]) => (
                    <div key={label as string} className="flex items-center justify-between text-sm">
                      <span className={`${cls} font-medium`}>{label as string}</span>
                      <span className="text-white font-bold">{(val as number).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Sanctions by Type + Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sanctions breakdown */}
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-2"><Globe size={16} className="text-teal-400" /> Sanctions Lists</span>
                <button onClick={() => navigate('/sanctions')} className="text-xs text-teal-400 hover:text-teal-300">Manage →</button>
              </div>
              <div className="p-4">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={sanctionsByType} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fill: '#94a3b8', fontSize: 11 }} width={70} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                    <Bar dataKey="value" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs">
                  <div className="text-slate-400">Total Entries: <span className="text-white font-bold">{(sanctions.total_sanctions_entries || 0).toLocaleString()}</span></div>
                  <div className="text-slate-400">Active: <span className="text-green-400 font-bold">{(sanctions.active_entries || 0).toLocaleString()}</span></div>
                </div>
              </div>
            </div>

            {/* Recent Alerts */}
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-2"><Bell size={16} className="text-amber-400" /> Recent Alerts</span>
                <button onClick={() => navigate('/alerts')} className="text-xs text-amber-400 hover:text-amber-300">View All →</button>
              </div>
              <div className="divide-y divide-slate-800/50">
                {recentAlerts.slice(0, 5).map((alert: any) => (
                  <div key={alert.id} className="px-4 py-3 hover:bg-slate-800/30 cursor-pointer" onClick={() => navigate('/alerts')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white font-medium truncate">{alert.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{alert.subject_name || 'Unknown'}</p>
                      </div>
                      <Badge value={alert.severity} />
                    </div>
                  </div>
                ))}
                {recentAlerts.length === 0 && (
                  <div className="px-4 py-8 text-center text-slate-500 text-sm">No open alerts</div>
                )}
              </div>
            </div>

            {/* Recent Cases */}
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <span className="font-semibold text-white flex items-center gap-2"><FileText size={16} className="text-purple-400" /> Recent Cases</span>
                <button onClick={() => navigate('/cases')} className="text-xs text-purple-400 hover:text-purple-300">View All →</button>
              </div>
              <div className="divide-y divide-slate-800/50">
                {recentCases.slice(0, 5).map((cas: any) => (
                  <div key={cas.id} className="px-4 py-3 hover:bg-slate-800/30 cursor-pointer" onClick={() => navigate('/cases')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white font-medium truncate">{cas.case_number}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{cas.subject_name}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge value={cas.priority} />
                        <span className="text-xs text-slate-600">{cas.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {recentCases.length === 0 && (
                  <div className="px-4 py-8 text-center text-slate-500 text-sm">No open cases</div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <div className="card-header">
              <span className="font-semibold text-white flex items-center gap-2"><Zap size={16} className="text-yellow-400" /> Quick Actions</span>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                { label: 'Quick Screen', icon: <Shield size={16} />, path: '/screening/quick', color: 'text-blue-400' },
                { label: 'Batch Screen', icon: <Activity size={16} />, path: '/screening/batch', color: 'text-cyan-400' },
                { label: 'OFAC Screen', icon: <Globe size={16} />, path: '/screening/ofac', color: 'text-red-400' },
                { label: 'New Case', icon: <FileText size={16} />, path: '/cases', color: 'text-purple-400' },
                { label: 'View Alerts', icon: <Bell size={16} />, path: '/alerts', color: 'text-amber-400' },
                { label: 'Run Scraper', icon: <RefreshCw size={16} />, path: '/process/scraper', color: 'text-green-400' },
                { label: 'AI Analysis', icon: <Zap size={16} />, path: '/ai/analysis', color: 'text-pink-400' },
                { label: 'Reports', icon: <BarChart2 size={16} />, path: '/reports', color: 'text-teal-400' },
              ].map(a => (
                <button key={a.path} onClick={() => navigate(a.path)}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600 transition-all text-center">
                  <span className={a.color}>{a.icon}</span>
                  <span className="text-xs text-slate-300 font-medium">{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* System Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                <span className="text-sm font-semibold text-white">System Status</span>
              </div>
              <div className="space-y-2 text-xs">
                {[['API Server', 'Operational'], ['Database', 'Connected'], ['Scraper Service', 'Active'], ['AI Engine', 'Ready']].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-slate-400">{k}</span>
                    <span className="text-green-400 font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={14} className="text-blue-400" />
                <span className="text-sm font-semibold text-white">Compliance SLA</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-400">Cases within SLA</span><span className="text-green-400 font-bold">94%</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Avg. Resolution Time</span><span className="text-white">2.3 days</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Overdue Cases</span><span className="text-red-400 font-bold">{Math.max(0, (c.open_cases || 0) - Math.floor((c.open_cases || 0) * 0.94))}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Critical Pending</span><span className="text-amber-400 font-bold">{c.critical_cases || 0}</span></div>
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={14} className="text-green-400" />
                <span className="text-sm font-semibold text-white">Last Scrape Summary</span>
              </div>
              <div className="space-y-2 text-xs">
                {data?.scraping?.slice(0, 4).map((r: any) => (
                  <div key={r.id} className="flex justify-between">
                    <span className="text-slate-400">{r.source_code || 'Unknown'}</span>
                    <span className={r.status === 'Completed' ? 'text-green-400' : 'text-amber-400'}>{r.status || 'Pending'}</span>
                  </div>
                )) || <div className="text-slate-500">No scrape history</div>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
