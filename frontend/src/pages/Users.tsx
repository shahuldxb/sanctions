import React, { useEffect, useState } from 'react'
import { getUsers, createUser, updateUser, deleteUser } from '../api'
import { Badge, Pagination, SearchBar, Spinner, Empty, Modal, Field, CrudActions, PageHeader, Confirm, StatCard } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { Users as UsersIcon, Plus, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'Users',
  entities: [{
    name: 'users', description: 'System users with roles and permissions',
    fields: [
      { name: 'username', type: 'varchar(100)', description: 'Login username', required: true },
      { name: 'full_name', type: 'varchar(200)', description: 'Full display name', required: true },
      { name: 'email', type: 'varchar(200)', description: 'Email address', required: true },
      { name: 'role', type: 'enum', description: 'ADMIN | COMPLIANCE_OFFICER | ANALYST | VIEWER | AUDITOR' },
      { name: 'department', type: 'varchar', description: 'Department or team' },
      { name: 'is_active', type: 'bit', description: 'Account active status' },
      { name: 'last_login', type: 'datetime', description: 'Last login timestamp' },
    ]
  }]
}

const ROLES = ['ADMIN', 'COMPLIANCE_OFFICER', 'ANALYST', 'VIEWER', 'AUDITOR']

export default function Users() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await getUsers({ page, limit: 50, search })
      setData(r.data.data || r.data || [])
      setTotal(r.data.total || (r.data.data || r.data || []).length)
    } catch (e: any) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search])

  const save = async () => {
    setSaving(true)
    try {
      if (form.id) { await updateUser(form.id, form); toast.success('User updated') }
      else { await createUser(form); toast.success('User created') }
      setShowForm(false); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const del = async () => {
    await deleteUser(selected.id); toast.success('User deleted')
    setShowDelete(false); load()
  }

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))
  const active = data.filter(d => d.is_active).length

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="Users" subtitle="System users and access management" icon={UsersIcon}
        actions={<>
          <button onClick={load} className="btn-ghost"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => { setForm({ role: 'ANALYST', is_active: true }); setShowForm(true) }} className="btn-primary"><Plus size={14} /> New User</button>
        </>} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Users" value={total} />
        <StatCard label="Active" value={active} color="text-green-400" />
        <StatCard label="Admins" value={data.filter(d => d.role === 'ADMIN').length} color="text-red-400" />
        <StatCard label="Compliance" value={data.filter(d => d.role === 'COMPLIANCE_OFFICER').length} color="text-blue-400" />
      </div>

      <div className="card mb-4">
        <div className="p-4"><SearchBar value={search} onChange={(v: string) => { setSearch(v); setPage(1) }} placeholder="Search users..." /></div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Username</th><th>Full Name</th><th>Email</th><th>Role</th><th>Department</th><th>Last Login</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && !data.length ? <tr><td colSpan={8} className="text-center py-12"><Spinner /></td></tr>
              : data.length === 0 ? <tr><td colSpan={8}><Empty message="No users found" action={<button className="btn-primary" onClick={() => { setForm({ role: 'ANALYST', is_active: true }); setShowForm(true) }}><Plus size={14} /> New User</button>} /></td></tr>
              : data.map((row: any) => (
                <tr key={row.id}>
                  <td className="font-mono text-sm text-blue-300">{row.username}</td>
                  <td className="font-medium text-white">{row.full_name}</td>
                  <td className="text-xs text-slate-400">{row.email}</td>
                  <td><Badge value={row.role} /></td>
                  <td className="text-xs text-slate-400">{row.department || '—'}</td>
                  <td className="text-xs text-slate-500">{row.last_login ? new Date(row.last_login).toLocaleString() : 'Never'}</td>
                  <td>{row.is_active ? <span className="text-green-400 text-xs">● Active</span> : <span className="text-slate-500 text-xs">○ Inactive</span>}</td>
                  <td><CrudActions onEdit={() => { setForm(row); setShowForm(true) }} onDelete={() => { setSelected(row); setShowDelete(true) }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4"><Pagination page={page} total={total} limit={50} onChange={setPage} /></div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Edit User' : 'New User'} size="md">
        <div className="p-6 grid grid-cols-2 gap-4">
          <Field label="Username" required><input className="input" value={form.username || ''} onChange={e => f('username', e.target.value)} /></Field>
          <Field label="Full Name" required><input className="input" value={form.full_name || ''} onChange={e => f('full_name', e.target.value)} /></Field>
          <div className="col-span-2"><Field label="Email" required><input className="input" type="email" value={form.email || ''} onChange={e => f('email', e.target.value)} /></Field></div>
          <Field label="Role"><select className="select" value={form.role || 'ANALYST'} onChange={e => f('role', e.target.value)}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Department"><input className="input" value={form.department || ''} onChange={e => f('department', e.target.value)} /></Field>
          {!form.id && <div className="col-span-2"><Field label="Password"><input className="input" type="password" value={form.password || ''} onChange={e => f('password', e.target.value)} /></Field></div>}
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" className="w-4 h-4 accent-blue-500" checked={!!form.is_active} onChange={e => f('is_active', e.target.checked)} />
            <span className="text-sm text-slate-300">Active Account</span>
          </div>
          <div className="col-span-2 flex justify-end gap-3"><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={14} /> : null}{form.id ? 'Update' : 'Create'}</button></div>
        </div>
      </Modal>

      <Confirm open={showDelete} onClose={() => setShowDelete(false)} onConfirm={del} title="Delete User" message={`Delete user "${selected?.username}"?`} />
    </div>
  )
}
