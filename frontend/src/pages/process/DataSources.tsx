/**
 * Unified Data Sources Manager
 * ─────────────────────────────
 * Single page combining PEP sources (OpenSanctions, Wikidata, ICIJ) and
 * Sanctions sources (OFAC, EU, UN, UK, SECO, DFAT, MAS, BIS) with shared
 * unified RAM index controls.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Database, Cpu, RefreshCw, Play, Trash2, Activity,
  Globe, Shield, User, CheckCircle, AlertCircle, Clock,
  ChevronDown, ChevronUp, Zap, MemoryStick, BarChart2,
  Download, Upload, Server, GitMerge
} from 'lucide-react'
import { PageHeader } from '../../components/ui'
import toast from 'react-hot-toast'
import axios from 'axios'

const API = '/api'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString()
}
function fmtMs(ms: number) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

// ── Source badge colours ──────────────────────────────────────────────────────
const SOURCE_META: Record<string, { flag: string; color: string; border: string; bg: string }> = {
  OFAC:              { flag: '🇺🇸', color: 'text-red-300',    border: 'border-red-700/50',    bg: 'bg-red-900/10' },
  EU:                { flag: '🇪🇺', color: 'text-blue-300',   border: 'border-blue-700/50',   bg: 'bg-blue-900/10' },
  UN:                { flag: '🌐', color: 'text-orange-300', border: 'border-orange-700/50', bg: 'bg-orange-900/10' },
  UK:                { flag: '🇬🇧', color: 'text-indigo-300', border: 'border-indigo-700/50', bg: 'bg-indigo-900/10' },
  SECO:              { flag: '🇨🇭', color: 'text-sky-300',    border: 'border-sky-700/50',    bg: 'bg-sky-900/10' },
  DFAT:              { flag: '🇦🇺', color: 'text-teal-300',   border: 'border-teal-700/50',   bg: 'bg-teal-900/10' },
  MAS:               { flag: '🇸🇬', color: 'text-cyan-300',   border: 'border-cyan-700/50',   bg: 'bg-cyan-900/10' },
  BIS:               { flag: '🇺🇸', color: 'text-violet-300', border: 'border-violet-700/50', bg: 'bg-violet-900/10' },
  OPENSANCTIONS_PEP: { flag: '🌍', color: 'text-purple-300', border: 'border-purple-600/50', bg: 'bg-purple-900/10' },
  WIKIDATA:          { flag: '📚', color: 'text-emerald-300', border: 'border-emerald-700/50',bg: 'bg-emerald-900/10' },
  ICIJ:              { flag: '🔍', color: 'text-amber-300',   border: 'border-amber-700/50',  bg: 'bg-amber-900/10' },
}

// ── Unified Index Status Card ─────────────────────────────────────────────────
function UnifiedIndexCard() {
  const [status, setStatus]   = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/unified/status`)
      setStatus(r.data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchStatus()
    const iv = setInterval(fetchStatus, 3000)
    return () => clearInterval(iv)
  }, [fetchStatus])

  const loadAll = async () => {
    setLoading(true)
    try {
      await axios.post(`${API}/unified/load`)
      toast.success('Unified RAM index rebuild started')
      setTimeout(fetchStatus, 1000)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Load failed')
    } finally {
      setLoading(false)
    }
  }

  const clearAll = async () => {
    if (!confirm('Clear the unified RAM index? Screening will be unavailable until reloaded.')) return
    setClearing(true)
    try {
      await axios.post(`${API}/unified/clear`)
      toast.success('Unified RAM index cleared')
      setTimeout(fetchStatus, 500)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Clear failed')
    } finally {
      setClearing(false)
    }
  }

  const isLoading = status?.isLoading
  const pct       = status?.loadProgress?.pct ?? 0
  const total     = status?.entryCount ?? 0
  const loaded    = status?.loadProgress?.loaded ?? 0

  return (
    <div className="rounded-xl border border-slate-600/60 bg-slate-800/30 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
          <Cpu size={18} className="text-blue-400" />
        </div>
        <div>
          <div className="text-sm font-bold text-white">Unified RAM Index</div>
          <div className="text-xs text-slate-500">Token + Double Metaphone + Trigram · All sources</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {isLoading ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-300 animate-pulse font-mono">
              LOADING {pct}%
            </span>
          ) : total > 0 ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-300 font-mono">
              READY
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 font-mono">
              EMPTY
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-slate-900/60 p-3 text-center">
          <div className="text-lg font-bold text-white font-mono">{fmt(total)}</div>
          <div className="text-xs text-slate-500">Entries in RAM</div>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-3 text-center">
          <div className="text-lg font-bold text-blue-300 font-mono">{status?.heapUsedMB ? `${status.heapUsedMB}MB` : '—'}</div>
          <div className="text-xs text-slate-500">Heap Used</div>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-3 text-center">
          <div className="text-lg font-bold text-slate-300 font-mono">{status?.loadedAt ? new Date(status.loadedAt).toLocaleTimeString() : '—'}</div>
          <div className="text-xs text-slate-500">Last Loaded</div>
        </div>
      </div>

      {/* Progress bar */}
      {isLoading && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Loading {fmt(loaded)} / {fmt(status?.loadProgress?.total)} entries</span>
            <span className="font-mono">{pct}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={loadAll}
          disabled={loading || isLoading}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {loading || isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Cpu size={14} />}
          {isLoading ? `Loading ${pct}%...` : 'Load All into RAM'}
        </button>
        <button
          onClick={clearAll}
          disabled={clearing}
          className="px-4 py-2 rounded-lg border border-red-700/50 text-red-400 hover:bg-red-900/20 text-sm transition-colors disabled:opacity-50"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Per-source RAM reload button ──────────────────────────────────────────────
function SourceRAMButton({ sourceCode, category }: { sourceCode: string; category: 'PEP' | 'SANCTIONS' }) {
  const [loading, setLoading] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      await axios.post(`${API}/unified/reload-category`, { category, source: sourceCode })
      toast.success(`RAM index updated for ${sourceCode}`)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Reload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={reload}
      disabled={loading}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-300 transition-colors disabled:opacity-50"
      title="Reload this source into unified RAM index"
    >
      {loading ? <RefreshCw size={10} className="animate-spin" /> : <Cpu size={10} />}
      RAM
    </button>
  )
}

// ── PEP Source Card ───────────────────────────────────────────────────────────
function PEPSourceCard({
  title, code, flag, description, expected, updateFreq, inDB, stats, loadLabel,
  onLoad, isLoading, loadProgress, lastLog, border, bg
}: any) {
  return (
    <div className={`rounded-xl border ${border} ${bg} p-5 space-y-4`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="text-2xl">{flag}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-sm">{title}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 font-mono">{code}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <SourceRAMButton sourceCode={code} category="PEP" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-900/60 p-2.5">
          <div className="text-xs text-slate-500">Expected</div>
          <div className="text-sm font-bold text-slate-300 font-mono">{expected}</div>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-2.5">
          <div className="text-xs text-slate-500">In DB</div>
          <div className="text-sm font-bold text-white font-mono">{fmt(inDB)}</div>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-2.5">
          <div className="text-xs text-slate-500">Update Freq</div>
          <div className="text-sm font-bold text-slate-300">{updateFreq}</div>
        </div>
        <div className="rounded-lg bg-slate-900/60 p-2.5">
          <div className="text-xs text-slate-500">With Position</div>
          <div className="text-sm font-bold text-slate-300 font-mono">{fmt(stats?.withPosition)}</div>
        </div>
      </div>

      {/* Extra stats */}
      {stats && (
        <div className="space-y-1 text-xs">
          {stats.withWikidataId != null && (
            <div className="flex justify-between text-slate-500">
              <span>With Wikidata ID</span>
              <span className="font-mono text-slate-300">{fmt(stats.withWikidataId)}</span>
            </div>
          )}
          {stats.withDob != null && (
            <div className="flex justify-between text-slate-500">
              <span>With Date of Birth</span>
              <span className="font-mono text-slate-300">{fmt(stats.withDob)}</span>
            </div>
          )}
          {stats.withAdverseLinks != null && (
            <div className="flex justify-between text-slate-500">
              <span>With Adverse Links</span>
              <span className="font-mono text-slate-300">{fmt(stats.withAdverseLinks)}</span>
            </div>
          )}
          {stats.datasets != null && (
            <div className="flex justify-between text-slate-500">
              <span>Datasets</span>
              <span className="font-mono text-slate-300">{stats.datasets}</span>
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      {isLoading && loadProgress && (
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>{lastLog || 'Loading...'}</span>
            <span className="font-mono">{loadProgress.pct ?? 0}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-400 transition-all duration-500 animate-pulse"
              style={{ width: `${loadProgress.pct ?? 0}%` }}
            />
          </div>
        </div>
      )}
      {!isLoading && lastLog && (
        <div className="text-xs text-slate-500 italic truncate">{lastLog}</div>
      )}

      {/* Load button */}
      <button
        onClick={onLoad}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-purple-700/30 hover:bg-purple-700/50 border border-purple-600/40 text-purple-200 text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
        {isLoading ? 'Loading...' : loadLabel}
      </button>
    </div>
  )
}

// ── Sanctions Source Row ──────────────────────────────────────────────────────
function SanctionsSourceRow({ src, onRun, running }: { src: any; onRun: () => void; running: boolean }) {
  const meta = SOURCE_META[src.source_code] || { flag: '🌐', color: 'text-slate-300', border: 'border-slate-700', bg: '' }
  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border ${meta.border} ${meta.bg} transition-all`}>
      <span className="text-xl shrink-0">{meta.flag}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-bold text-sm ${meta.color}`}>{src.source_code}</span>
          <span className="text-xs text-slate-500">{src.source_name}</span>
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
          <span><span className="text-white font-mono">{fmt(src.total_entries)}</span> entries</span>
          <span>Every {src.scrape_interval_hours}h</span>
          {src.last_scraped && <span>Last: {new Date(src.last_scraped).toLocaleDateString()}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <SourceRAMButton sourceCode={src.source_code} category="SANCTIONS" />
        <button
          onClick={onRun}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700/30 hover:bg-blue-700/50 border border-blue-600/40 text-blue-200 text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {running ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
          {running ? 'Running...' : 'Scrape & Load'}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DataSources() {
  const [tab, setTab] = useState<'pep' | 'sanctions'>('pep')

  // PEP state
  const [pepStats,       setPepStats]       = useState<any>(null)
  const [wikidataStatus, setWikidataStatus] = useState<any>(null)
  const [icijStatus,     setIcijStatus]     = useState<any>(null)
  const [bcpStatus,      setBcpStatus]      = useState<any>(null)

  // Sanctions state
  const [sanctionsSources, setSanctionsSources] = useState<any[]>([])
  const [runningSrc,       setRunningSrc]        = useState<string | null>(null)

  // Unified index
  const [unifiedStats, setUnifiedStats] = useState<any>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [pepR, wdR, icijR, bcpR, srcR, uniR] = await Promise.allSettled([
        axios.get(`${API}/pep/stats`),
        axios.get(`${API}/pep/wikidata-status`),
        axios.get(`${API}/pep/icij-status`),
        axios.get(`${API}/pep/status`),
        axios.get(`${API}/scraper/sources`),
        axios.get(`${API}/unified/stats`),
      ])
      if (pepR.status === 'fulfilled')  setPepStats(pepR.value.data)
      if (wdR.status === 'fulfilled')   setWikidataStatus(wdR.value.data)
      if (icijR.status === 'fulfilled') setIcijStatus(icijR.value.data)
      if (bcpR.status === 'fulfilled')  setBcpStatus(bcpR.value.data)
      if (srcR.status === 'fulfilled')  setSanctionsSources(srcR.value.data?.sources || [])
      if (uniR.status === 'fulfilled')  setUnifiedStats(uniR.value.data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 4000)
    return () => clearInterval(iv)
  }, [fetchAll])

  // PEP load handlers
  const loadWikidata = async () => {
    try {
      await axios.post(`${API}/pep/wikidata-load`)
      toast.success('Wikidata SPARQL load started')
    } catch (e: any) { toast.error(e.response?.data?.error || 'Failed') }
  }

  const loadICIJ = async () => {
    try {
      await axios.post(`${API}/pep/icij-load`)
      toast.success('ICIJ Offshore Leaks load started')
    } catch (e: any) { toast.error(e.response?.data?.error || 'Failed') }
  }

  const runBCP = async () => {
    try {
      await axios.post(`${API}/pep/reload`)
      toast.success('OpenSanctions BCP pipeline started')
    } catch (e: any) { toast.error(e.response?.data?.error || 'Failed') }
  }

  // Sanctions scrape handler
  const runSanctionsScrape = async (sourceCode: string) => {
    setRunningSrc(sourceCode)
    try {
      await axios.post(`${API}/scraper/run`, { source: sourceCode })
      toast.success(`${sourceCode} scrape started`)
      setTimeout(fetchAll, 2000)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Scrape failed')
    } finally {
      setTimeout(() => setRunningSrc(null), 5000)
    }
  }

  // Derived PEP stats
  const openSanctionsInDB = pepStats?.totalInDB ?? 0
  const wikidataInDB      = wikidataStatus?.inDB ?? 0
  const icijInDB          = icijStatus?.inDB ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Data Sources</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage all PEP and sanctions data sources · Unified RAM index</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-xs transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Unified Index Card — always visible */}
      <UnifiedIndexCard />

      {/* Unified stats breakdown */}
      {unifiedStats?.bySource && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Unified Index — By Source</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(unifiedStats.bySource as Record<string, number>).map(([src, cnt]) => {
              const meta = SOURCE_META[src] || { flag: '🌐', color: 'text-slate-300', border: 'border-slate-700', bg: '' }
              return (
                <div key={src} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${meta.border} ${meta.bg}`}>
                  <span className="text-sm">{meta.flag}</span>
                  <span className={`text-xs font-mono font-bold ${meta.color}`}>{src}</span>
                  <span className="text-xs text-slate-400 font-mono">{(cnt as number).toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-slate-800/40 rounded-xl border border-slate-700/60 w-fit">
        <button
          onClick={() => setTab('pep')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'pep'
              ? 'bg-purple-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <User size={14} /> PEP Sources
          <span className="text-xs font-mono opacity-70">{fmt(openSanctionsInDB + wikidataInDB + icijInDB)}</span>
        </button>
        <button
          onClick={() => setTab('sanctions')}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === 'sanctions'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Shield size={14} /> Sanctions Sources
          <span className="text-xs font-mono opacity-70">{fmt(sanctionsSources.reduce((a, s) => a + (s.total_entries || 0), 0))}</span>
        </button>
      </div>

      {/* ── PEP Tab ── */}
      {tab === 'pep' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* OpenSanctions */}
          <PEPSourceCard
            title="OpenSanctions PEP"
            code="OPENSANCTIONS_PEP"
            flag="🌍"
            description="Wikidata + Every Politician + national gazettes"
            expected="~700K"
            updateFreq="Daily"
            inDB={openSanctionsInDB}
            stats={{
              withPosition:   pepStats?.withPosition,
              withWikidataId: pepStats?.withWikidataId,
              withDob:        pepStats?.withDob,
              withAdverseLinks: pepStats?.withAdverseLinks,
            }}
            loadLabel="Run BCP Pipeline"
            onLoad={runBCP}
            isLoading={bcpStatus?.status === 'running'}
            loadProgress={bcpStatus?.status === 'running' ? { pct: Math.round(((bcpStatus?.phaseIndex ?? 0) / 7) * 100) } : null}
            lastLog={bcpStatus?.status === 'running' ? `Stage: ${bcpStatus?.phase}` : bcpStatus?.status === 'completed' ? '✓ Pipeline completed' : null}
            border="border-purple-600/40"
            bg="bg-purple-900/5"
          />

          {/* Wikidata */}
          <PEPSourceCard
            title="Wikidata SPARQL"
            code="WIKIDATA"
            flag="📚"
            description="Heads of state, ministers, senior officials"
            expected="~50K"
            updateFreq="Weekly"
            inDB={wikidataInDB}
            stats={{
              withPosition:   wikidataStatus?.withPosition,
              withWikidataId: wikidataInDB,
              withDob:        wikidataStatus?.withDob,
              datasets:       '5 SPARQL queries',
            }}
            loadLabel="Load Wikidata SPARQL"
            onLoad={loadWikidata}
            isLoading={wikidataStatus?.isLoading}
            loadProgress={wikidataStatus?.progress}
            lastLog={wikidataStatus?.lastLog}
            border="border-emerald-700/40"
            bg="bg-emerald-900/5"
          />

          {/* ICIJ */}
          <PEPSourceCard
            title="ICIJ Offshore Leaks"
            code="ICIJ"
            flag="🔍"
            description="Panama Papers, Pandora Papers, adverse links"
            expected="~800K"
            updateFreq="Quarterly"
            inDB={icijInDB}
            stats={{
              withAdverseLinks: icijInDB,
              datasets:         '5 leak datasets',
            }}
            loadLabel="Load ICIJ Offshore Leaks"
            onLoad={loadICIJ}
            isLoading={icijStatus?.isLoading}
            loadProgress={icijStatus?.progress}
            lastLog={icijStatus?.lastLog}
            border="border-amber-700/40"
            bg="bg-amber-900/5"
          />
        </div>
      )}

      {/* ── Sanctions Tab ── */}
      {tab === 'sanctions' && (
        <div className="space-y-3">
          {sanctionsSources.length === 0 ? (
            <div className="rounded-xl border border-slate-700/60 bg-slate-800/20 p-12 text-center">
              <Database size={40} className="text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500">No sanctions sources found</p>
            </div>
          ) : (
            sanctionsSources.map(src => (
              <SanctionsSourceRow
                key={src.source_code}
                src={src}
                onRun={() => runSanctionsScrape(src.source_code)}
                running={runningSrc === src.source_code}
              />
            ))
          )}

          {/* Run all button */}
          {sanctionsSources.length > 0 && (
            <button
              onClick={() => sanctionsSources.forEach(s => runSanctionsScrape(s.source_code))}
              disabled={!!runningSrc}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-blue-600/40 bg-blue-900/10 hover:bg-blue-900/20 text-blue-300 text-sm font-semibold transition-colors disabled:opacity-50"
            >
              <Play size={14} /> Scrape & Load All Sanctions Sources
            </button>
          )}
        </div>
      )}
    </div>
  )
}
