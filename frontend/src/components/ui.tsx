import React, { useRef, useEffect } from 'react'
import { AlertTriangle, CheckCircle, XCircle, Info, X, ChevronLeft, ChevronRight, Search, Edit2, Trash2, Eye } from 'lucide-react'

// ── Badge ──────────────────────────────────────────────────────────────────
export function Badge({ value, type }: { value: string; type?: string }) {
  if (!value) return null
  const cls: Record<string, string> = {
    BLOCKED: 'badge-red', CRITICAL: 'badge-red', HIGH: 'badge-red', FAILED: 'badge-red', REJECTED: 'badge-red',
    POTENTIAL_MATCH: 'badge-yellow', FLAGGED: 'badge-yellow', MEDIUM: 'badge-yellow', IN_REVIEW: 'badge-yellow',
    PENDING: 'badge-yellow', WARNING: 'badge-yellow', REVIEW: 'badge-yellow', ESCALATED: 'badge-yellow',
    CLEAR: 'badge-green', LOW: 'badge-green', ACTIVE: 'badge-green', COMPLETED: 'badge-green',
    SUCCESS: 'badge-green', OPEN: 'badge-green', VERIFIED: 'badge-green', APPROVED: 'badge-green',
    CLOSED: 'badge-gray', INACTIVE: 'badge-gray', CANCELLED: 'badge-gray', DELISTED: 'badge-gray', EXPIRED: 'badge-gray',
    RUNNING: 'badge-blue', INFO: 'badge-blue', INDIVIDUAL: 'badge-blue', PROCESSING: 'badge-blue',
    ENTITY: 'badge-purple', VESSEL: 'badge-blue', AIRCRAFT: 'badge-yellow', CORPORATE: 'badge-purple',
  }
  const c = cls[value?.toUpperCase()] || cls[type || ''] || 'badge-gray'
  return <span className={c}>{value}</span>
}

// ── Stat Card ──────────────────────────────────────────────────────────────
// Supports both {label, value, color, icon} and {title, value, subtitle, icon, color, onClick}
export function StatCard({ label, title, value, sub, subtitle, color, icon, onClick }: any) {
  const displayLabel = label || title || ''
  const displaySub = sub || subtitle || ''
  const colorClass = typeof color === 'string' && color.startsWith('text-') ? color :
    color === 'red' ? 'text-red-400' : color === 'amber' ? 'text-amber-400' :
    color === 'green' ? 'text-green-400' : color === 'blue' ? 'text-blue-400' :
    color === 'purple' ? 'text-purple-400' : color === 'teal' ? 'text-teal-400' :
    color === 'orange' ? 'text-orange-400' : color === 'cyan' ? 'text-cyan-400' :
    color === 'pink' ? 'text-pink-400' : 'text-white'

  return (
    <div className={`stat-card ${onClick ? 'cursor-pointer hover:border-slate-600' : ''}`} onClick={onClick}>
      <div className="flex items-start justify-between">
        <div>
          <div className={`stat-value ${colorClass}`}>{value ?? '—'}</div>
          <div className="stat-label">{displayLabel}</div>
          {displaySub && <div className="text-xs text-slate-500 mt-1">{displaySub}</div>}
        </div>
        {icon && <div className="p-2 bg-slate-800 rounded-lg text-slate-400">{icon}</div>}
      </div>
    </div>
  )
}

// ── Score Bar ──────────────────────────────────────────────────────────────
export function ScoreBar({ score }: { score: number }) {
  const color = score >= 90 ? 'bg-red-500' : score >= 70 ? 'bg-amber-500' : score >= 50 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="score-bar flex-1"><div className={`score-fill ${color}`} style={{ width: `${score}%` }} /></div>
      <span className={`text-xs font-bold ${score >= 90 ? 'text-red-400' : score >= 70 ? 'text-amber-400' : 'text-green-400'}`}>{score}%</span>
    </div>
  )
}

// ── Pagination ─────────────────────────────────────────────────────────────
export function Pagination({ page, total, limit, onChange }: { page: number; total: number; limit: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / limit)
  if (pages <= 1) return null
  return (
    <div className="flex items-center gap-2 justify-end mt-4">
      <span className="text-xs text-slate-500">{total} total</span>
      <button className="btn-ghost py-1 px-2" onClick={() => onChange(page - 1)} disabled={page === 1}><ChevronLeft size={14} /></button>
      <span className="text-sm text-slate-300">{page} / {pages}</span>
      <button className="btn-ghost py-1 px-2" onClick={() => onChange(page + 1)} disabled={page === pages}><ChevronRight size={14} /></button>
    </div>
  )
}

// ── Search Bar ─────────────────────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = 'Search...' }: any) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input className="input pl-9 w-64" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

// ── Loading Spinner ────────────────────────────────────────────────────────
export function Spinner({ size = 20 }: { size?: number }) {
  return <div className="animate-spin rounded-full border-2 border-slate-600 border-t-blue-500 inline-block" style={{ width: size, height: size }} />
}

// ── Empty State ────────────────────────────────────────────────────────────
export function Empty({ message = 'No records found', action }: { message?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <Info size={40} className="mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md' }: any) {
  if (!open) return null
  const sizes: Record<string, string> = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl', full: 'max-w-7xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className={`card w-full ${sizes[size]} max-h-[90vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="card-header flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button className="text-slate-500 hover:text-white" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

// ── Form Field ─────────────────────────────────────────────────────────────
export function Field({ label, children, required }: any) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>
      {children}
    </div>
  )
}

// ── Confirm Dialog ─────────────────────────────────────────────────────────
export function Confirm({ open, onClose, onConfirm, message, title = 'Confirm Action' }: any) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="p-6">
        <div className="flex gap-3 mb-6">
          <AlertTriangle size={24} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-slate-300">{message}</p>
        </div>
        <div className="flex gap-3 justify-end">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-danger" onClick={() => { onConfirm(); onClose(); }}>Confirm</button>
        </div>
      </div>
    </Modal>
  )
}

// ── Progress Bar ───────────────────────────────────────────────────────────
export function ProgressBar({ pct, label, color = 'bg-blue-500' }: { pct: number; label?: string; color?: string }) {
  return (
    <div>
      {label && <div className="flex justify-between text-xs text-slate-400 mb-1"><span>{label}</span><span>{pct}%</span></div>}
      <div className="progress-bar"><div className={`progress-fill ${color}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
    </div>
  )
}

// ── Process Log ────────────────────────────────────────────────────────────
export function ProcessLog({ entries }: { entries: any[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [entries])

  const levelColor: Record<string, string> = {
    error: 'text-red-400', warn: 'text-amber-400', success: 'text-green-400',
    info: 'text-slate-300', debug: 'text-slate-500',
  }

  return (
    <div className="process-log" ref={ref}>
      {entries.length === 0 && <div className="text-slate-600 text-center py-8">Waiting for process to start...</div>}
      {entries.map((e, i) => (
        <div key={i} className="log-line">
          <span className="log-ts">{(e.ts || e.timestamp || '')?.slice(11, 19)}</span>
          {e.event && <span className="log-event text-blue-400">[{e.event}]</span>}
          <span className={levelColor[e.level || 'info'] || 'text-slate-300'}>{e.msg || e.message || JSON.stringify(e).slice(0, 120)}</span>
        </div>
      ))}
    </div>
  )
}

// ── CRUD Action Buttons ────────────────────────────────────────────────────
export function CrudActions({ onView, onEdit, onDelete }: { onView?: () => void; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="flex items-center gap-1">
      {onView && <button onClick={onView} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 rounded" title="View"><Eye size={14} /></button>}
      {onEdit && <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-900/30 rounded" title="Edit"><Edit2 size={14} /></button>}
      {onDelete && <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/30 rounded" title="Delete"><Trash2 size={14} /></button>}
    </div>
  )
}

// ── Page Header ────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions, icon: Icon, children }: any) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-3">
        {Icon && <div className="p-2.5 bg-blue-600/20 border border-blue-600/30 rounded-xl">
          {React.isValidElement(Icon) ? Icon : React.createElement(Icon as any, { size: 22, className: 'text-blue-400' })}
        </div>}
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">{actions || children}</div>
    </div>
  )
}

// ── Tab Bar ────────────────────────────────────────────────────────────────
export function TabBar({ tabs, active, onChange }: { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 bg-slate-800/50 p-1 rounded-xl mb-6 border border-slate-700">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${active === t.id ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-xs opacity-70">({t.count})</span>}
        </button>
      ))}
    </div>
  )
}

// ── Alert Banner ───────────────────────────────────────────────────────────
export function AlertBanner({ type = 'info', message, onClose }: any) {
  const styles: Record<string, string> = {
    error: 'bg-red-900/40 border-red-700 text-red-300',
    warning: 'bg-amber-900/40 border-amber-700 text-amber-300',
    success: 'bg-green-900/40 border-green-700 text-green-300',
    info: 'bg-blue-900/40 border-blue-700 text-blue-300',
  }
  const icons: Record<string, any> = { error: XCircle, warning: AlertTriangle, success: CheckCircle, info: Info }
  const Icon = icons[type]
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border mb-4 ${styles[type]}`}>
      <Icon size={16} className="shrink-0" />
      <span className="text-sm flex-1">{message}</span>
      {onClose && <button onClick={onClose}><X size={14} /></button>}
    </div>
  )
}

// ── Detail Row ─────────────────────────────────────────────────────────────
export function DetailRow({ label, value, badge }: { label: string; value: any; badge?: boolean }) {
  return (
    <div className="flex justify-between py-2 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-slate-200 font-medium text-right max-w-xs truncate">
        {badge ? <Badge value={String(value)} /> : (value ?? '—')}
      </span>
    </div>
  )
}

// ── Live Log Viewer ────────────────────────────────────────────────────────
export function LiveLog({ logs, height = 300 }: { logs: any[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [logs])
  const levelColor: Record<string, string> = {
    error: 'text-red-400', warn: 'text-amber-400', success: 'text-green-400',
    info: 'text-slate-300', debug: 'text-slate-500',
  }
  return (
    <div ref={ref} className="bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs overflow-y-auto p-3 space-y-0.5" style={{ height }}>
      {logs.length === 0 && <div className="text-slate-600 text-center py-6">Waiting for process to start...</div>}
      {logs.map((e, i) => (
        <div key={i} className="flex gap-2 leading-5">
          <span className="text-slate-600 shrink-0">{(e.ts || e.timestamp || '')?.slice(11, 19) || '--:--:--'}</span>
          <span className={levelColor[e.level || 'info'] || 'text-slate-300'}>{e.msg || e.message || String(e)}</span>
        </div>
      ))}
    </div>
  )
}
