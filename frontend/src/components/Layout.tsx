import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Shield, LayoutDashboard, Search, FileText, Users, Building2,
  AlertTriangle, Globe, List, Scale, Settings, ChevronDown, ChevronRight,
  Activity, Database, Bot, RefreshCw, BarChart3, BookOpen,
  Eye, Bell, Gavel, Menu, X, Layers, Cpu, Zap, Clock
} from 'lucide-react'

interface NavItem {
  label: string
  icon: any
  path?: string
  children?: NavItem[]
  badge?: string
  badgeColor?: string
}

const nav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  {
    label: 'Screening', icon: Search, children: [
      { label: 'Master Screener', icon: Zap, path: '/screening/quick' },
      { label: 'Batch Screener', icon: Layers, path: '/screening/batch' },
      { label: 'Screening History', icon: Clock, path: '/screening/history' },
    ]
  },
  {
    label: 'Cases & Alerts', icon: AlertTriangle, children: [
      { label: 'Cases', icon: FileText, path: '/cases' },
      { label: 'Alerts', icon: Bell, path: '/alerts' },
    ]
  },
  {
    label: 'Sanctions Lists', icon: List, children: [
      { label: 'All Entries', icon: Database, path: '/sanctions' },
      { label: 'Internal Watchlist', icon: Eye, path: '/watchlist' },
    ]
  },
  {
    label: 'Process Control', icon: Cpu, children: [
      { label: 'Sanctions List Manager', icon: Database, path: '/process/sanctions-manager' },
      { label: 'PEP Manager', icon: Users, path: '/process/pep-manager' },
      { label: 'Scraper Control', icon: RefreshCw, path: '/process/scraper' },
      { label: 'OFAC Delta', icon: Zap, path: '/process/ofac-delta' },
      { label: 'Enrichment Engine', icon: Database, path: '/process/enrichment' },
      { label: 'Fuzzy Match Engine', icon: Search, path: '/process/fuzzy' },
      { label: 'Scheduler', icon: Clock, path: '/process/scheduler' },
      { label: 'Active Processes', icon: Activity, path: '/process/active' },
    ]
  },
  {
    label: 'Intelligence', icon: Bot, children: [
      { label: 'AI Analysis', icon: Bot, path: '/ai/analysis' },
      { label: 'AI Chat (SENTINEL)', icon: Bot, path: '/ai/chat' },
      { label: 'Risk Assessment', icon: BarChart3, path: '/ai/risk' },
    ]
  },
  {
    label: 'Management', icon: Settings, children: [
      { label: 'Screening Rules', icon: Gavel, path: '/rules' },
      { label: 'Users', icon: Users, path: '/users' },
      { label: 'Reports', icon: BarChart3, path: '/reports' },
      { label: 'Audit Log', icon: BookOpen, path: '/audit' },
    ]
  },
]

function NavGroup({ item, depth = 0 }: { item: NavItem; depth?: number }) {
  const location = useLocation()
  const isActive = item.path ? location.pathname === item.path : false
  const hasActiveChild = item.children?.some(c => c.path && location.pathname.startsWith(c.path))
  const [open, setOpen] = useState(hasActiveChild || false)

  if (item.path) {
    return (
      <NavLink to={item.path} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''} ${depth > 0 ? 'pl-8 text-xs' : ''}`}>
        <item.icon size={depth > 0 ? 13 : 16} />
        <span className="flex-1">{item.label}</span>
        {item.badge && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold text-white ${item.badgeColor || 'bg-blue-600'}`}>{item.badge}</span>}
      </NavLink>
    )
  }

  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className={`sidebar-link w-full ${hasActiveChild ? 'text-white' : ''}`}>
        <item.icon size={16} />
        <span className="flex-1 text-left">{item.label}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <div className="ml-2 border-l border-slate-700/50 pl-2 mt-0.5 space-y-0.5">
          {item.children?.map((c, i) => <NavGroup key={i} item={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-200 flex-shrink-0 flex flex-col bg-slate-900 border-r border-slate-800 overflow-hidden`}>
        {/* Logo */}
        <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/30">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-white text-sm leading-tight">Sanctions Engine</div>
            <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-widest">Enterprise v2.0</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {nav.map((item, i) => <NavGroup key={i} item={item} />)}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-slate-500">All systems operational</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-3 shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-500 hover:text-white">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Activity size={12} className="text-green-400" /> API Online</span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1"><Database size={12} className="text-blue-400" /> SQL Server</span>
            <span className="text-slate-700">|</span>
            <span className="text-slate-400">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
