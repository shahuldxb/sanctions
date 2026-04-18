import React, { useEffect, useState } from 'react'
import { api } from '../../api'
import { Badge, Spinner, PageHeader, StatCard, Modal, Field } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { Clock, RefreshCw, ToggleLeft, ToggleRight, Edit } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Scheduler',
  entities: [{
    name: 'scheduled_jobs', description: 'Scheduled background jobs for automated sanctions list updates',
    fields: [
      { name: 'job_name', type: 'varchar', description: 'Job identifier' },
      { name: 'cron_expression', type: 'varchar', description: 'Cron schedule expression' },
      { name: 'is_enabled', type: 'bit', description: 'Whether job is active' },
      { name: 'last_run', type: 'datetime', description: 'Last execution time' },
      { name: 'next_run', type: 'datetime', description: 'Next scheduled execution' },
    ]
  }]
}

const DEFAULT_JOBS = [
  { job_name: 'OFAC_FULL_SCRAPE', description: 'Full OFAC SDN list download', cron_expression: '0 0 */3 * * *', is_enabled: true },
  { job_name: 'EU_FULL_SCRAPE', description: 'EU consolidated sanctions list', cron_expression: '0 30 */3 * * *', is_enabled: true },
  { job_name: 'UN_FULL_SCRAPE', description: 'UN Security Council list', cron_expression: '0 0 */6 * * *', is_enabled: true },
  { job_name: 'UK_FULL_SCRAPE', description: 'UK OFSI sanctions list', cron_expression: '0 30 */6 * * *', is_enabled: true },
  { job_name: 'OFAC_DELTA', description: 'OFAC incremental changes', cron_expression: '0 */30 * * * *', is_enabled: true },
  { job_name: 'BATCH_SCREENING', description: 'Screen all customers batch', cron_expression: '0 0 2 * * *', is_enabled: true },
  { job_name: 'ENRICHMENT_RUN', description: 'Enrich new sanctions records', cron_expression: '0 0 4 * * *', is_enabled: true },
  { job_name: 'FUZZY_INDEX_REBUILD', description: 'Rebuild phonetic search index', cron_expression: '0 0 1 * * *', is_enabled: true },
  { job_name: 'ALERT_DIGEST', description: 'Send daily alert digest', cron_expression: '0 0 8 * * 1-5', is_enabled: true },
]

export default function Scheduler() {
  const [jobs, setJobs] = useState<any[]>(DEFAULT_JOBS)
  const [loading, setLoading] = useState(false)
  const [editJob, setEditJob] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/scraper/scheduler')
      if (r.data?.data?.length > 0) setJobs(r.data.data)
      else if (r.data?.length > 0) setJobs(r.data)
    } catch { }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleJob = async (job: any) => {
    const updated = { ...job, is_enabled: !job.is_enabled }
    try {
      if (job.id) await api.put(`/scraper/scheduler/${job.id}`, updated)
      setJobs(p => p.map(j => j.job_name === job.job_name ? updated : j))
      toast.success(`${job.job_name} ${updated.is_enabled ? 'enabled' : 'disabled'}`)
    } catch (e: any) { toast.error(e.message) }
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      if (editJob.id) await api.put(`/scraper/scheduler/${editJob.id}`, editJob)
      setJobs(p => p.map(j => j.job_name === editJob.job_name ? editJob : j))
      toast.success('Schedule updated')
      setEditJob(null)
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const enabled = jobs.filter(j => j.is_enabled).length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Job Scheduler" subtitle="Configure automated schedules for all background processes" icon={Clock}
        actions={<button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>} />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Jobs" value={jobs.length} />
        <StatCard label="Enabled" value={enabled} color="text-green-400" />
        <StatCard label="Disabled" value={jobs.length - enabled} color="text-slate-400" />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Job Name</th><th>Description</th><th>Schedule (Cron)</th><th>Last Run</th><th>Next Run</th><th>Enabled</th><th>Edit</th></tr></thead>
            <tbody>
              {jobs.map((job: any, i: number) => (
                <tr key={i}>
                  <td className="font-mono text-xs text-blue-300">{job.job_name}</td>
                  <td className="text-xs text-slate-400">{job.description}</td>
                  <td className="font-mono text-xs text-amber-300">{job.cron_expression}</td>
                  <td className="text-xs text-slate-500">{job.last_run ? new Date(job.last_run).toLocaleString() : 'Never'}</td>
                  <td className="text-xs text-slate-500">{job.next_run ? new Date(job.next_run).toLocaleString() : '—'}</td>
                  <td>
                    <button onClick={() => toggleJob(job)} className="text-slate-400 hover:text-blue-400">
                      {job.is_enabled ? <ToggleRight size={20} className="text-green-400" /> : <ToggleLeft size={20} />}
                    </button>
                  </td>
                  <td>
                    <button onClick={() => setEditJob({ ...job })} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded">
                      <Edit size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!editJob} onClose={() => setEditJob(null)} title={`Edit Schedule: ${editJob?.job_name}`} size="md">
        {editJob && (
          <div className="p-6 space-y-4">
            <Field label="Cron Expression">
              <input className="input font-mono" value={editJob.cron_expression || ''} onChange={e => setEditJob({ ...editJob, cron_expression: e.target.value })} />
              <div className="text-xs text-slate-500 mt-1">Format: seconds minutes hours day month weekday</div>
            </Field>
            <Field label="Description">
              <input className="input" value={editJob.description || ''} onChange={e => setEditJob({ ...editJob, description: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-3">
              <button className="btn-ghost" onClick={() => setEditJob(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveEdit} disabled={saving}>{saving ? <Spinner size={14} /> : null}Save</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
