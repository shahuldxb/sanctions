import React, { useState, useEffect, createContext, useContext } from 'react'
import { X, Database, Cpu, BookOpen, Layers, Shield, Zap } from 'lucide-react'

// ── Context ────────────────────────────────────────────────────────────────
const HelpCtx = createContext<{ setPageMeta: (m: PageMeta) => void }>({ setPageMeta: () => {} })

export interface PageMeta {
  title: string
  entities: EntityDef[]
  techniques?: TechniqueDef[]
}
interface EntityDef { name: string; description: string; fields: FieldDef[] }
interface FieldDef { name: string; type: string; description: string; required?: boolean }
interface TechniqueDef { name: string; category: string; description: string; detail: string }

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<PageMeta | null>(null)
  const [showF1, setShowF1] = useState(false)
  const [showF2, setShowF2] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'F1') { e.preventDefault(); setShowF1(v => !v); setShowF2(false) }
      if (e.altKey && e.key === 'F2') { e.preventDefault(); setShowF2(v => !v); setShowF1(false) }
      if (e.key === 'Escape') { setShowF1(false); setShowF2(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <HelpCtx.Provider value={{ setPageMeta: setMeta }}>
      {children}

      {/* Alt+F1 — Entities & Fields */}
      {showF1 && meta && (
        <div className="fixed inset-0 z-[100] flex items-start justify-end p-6 bg-black/60 backdrop-blur-sm" onClick={() => setShowF1(false)}>
          <div className="bg-slate-900 border border-blue-600/40 rounded-2xl shadow-2xl w-[640px] max-h-[85vh] overflow-y-auto animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600/20 rounded-lg"><Database size={18} className="text-blue-400" /></div>
                <div>
                  <h2 className="font-bold text-white">Entities & Fields</h2>
                  <p className="text-xs text-slate-400">{meta.title} — Alt+F1</p>
                </div>
              </div>
              <button onClick={() => setShowF1(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-6">
              {meta.entities.map((ent, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-3">
                    <Layers size={14} className="text-blue-400" />
                    <h3 className="font-semibold text-blue-300">{ent.name}</h3>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">{ent.description}</p>
                  <div className="bg-slate-800/60 rounded-xl overflow-hidden border border-slate-700">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-slate-800"><th className="px-3 py-2 text-left text-slate-400 font-semibold">Field</th><th className="px-3 py-2 text-left text-slate-400 font-semibold">Type</th><th className="px-3 py-2 text-left text-slate-400 font-semibold">Description</th></tr></thead>
                      <tbody>
                        {ent.fields.map((f, j) => (
                          <tr key={j} className="border-t border-slate-700">
                            <td className="px-3 py-2 font-mono text-blue-300">{f.name}{f.required && <span className="text-red-400 ml-1">*</span>}</td>
                            <td className="px-3 py-2 text-amber-300">{f.type}</td>
                            <td className="px-3 py-2 text-slate-300">{f.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Alt+F2 — Techniques & Skills */}
      {showF2 && meta && (
        <div className="fixed inset-0 z-[100] flex items-start justify-end p-6 bg-black/60 backdrop-blur-sm" onClick={() => setShowF2(false)}>
          <div className="bg-slate-900 border border-purple-600/40 rounded-2xl shadow-2xl w-[680px] max-h-[85vh] overflow-y-auto animate-slide-in" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-600/20 rounded-lg"><Cpu size={18} className="text-purple-400" /></div>
                <div>
                  <h2 className="font-bold text-white">Techniques & Skills</h2>
                  <p className="text-xs text-slate-400">{meta.title} — Alt+F2</p>
                </div>
              </div>
              <button onClick={() => setShowF2(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {(meta.techniques || defaultTechniques).map((t, i) => (
                <div key={i} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-purple-900/40 rounded-lg mt-0.5"><Zap size={14} className="text-purple-400" /></div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-purple-300">{t.name}</span>
                        <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{t.category}</span>
                      </div>
                      <p className="text-xs text-slate-400 mb-2">{t.description}</p>
                      <p className="text-xs text-slate-300 bg-slate-900/60 rounded-lg p-2 font-mono leading-relaxed">{t.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard hint */}
      <div className="fixed bottom-4 right-4 z-40 flex gap-2 opacity-40 hover:opacity-100 transition-opacity">
        <button onClick={() => { setShowF1(v => !v); setShowF2(false) }} className="flex items-center gap-1.5 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white">
          <Database size={12} /><kbd className="font-mono">Alt+F1</kbd> Fields
        </button>
        <button onClick={() => { setShowF2(v => !v); setShowF1(false) }} className="flex items-center gap-1.5 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white">
          <Cpu size={12} /><kbd className="font-mono">Alt+F2</kbd> Techniques
        </button>
      </div>
    </HelpCtx.Provider>
  )
}

export function useHelp() { return useContext(HelpCtx) }

export function SetPageHelp({ meta }: { meta: PageMeta }) {
  const { setPageMeta } = useHelp()
  useEffect(() => { setPageMeta(meta) }, [meta.title])
  return null
}

// ── Default techniques (shown on all pages) ────────────────────────────────
const defaultTechniques: TechniqueDef[] = [
  {
    name: 'Levenshtein Distance Matching',
    category: 'Fuzzy Match',
    description: 'Calculates minimum edit distance between two strings for approximate name matching.',
    detail: 'score = ((maxLen - editDist) / maxLen) × 100\nThreshold: 60% for review, 90% for auto-block\nHandles typos, transliteration variants, and OCR errors'
  },
  {
    name: 'Soundex Phonetic Matching',
    category: 'Phonetic',
    description: 'Encodes names by their English pronunciation to catch phonetically similar names.',
    detail: 'HUSSAIN → H250, HUSSEIN → H250 (match!)\nUsed as boost: if phonetic match, score += 10\nEffective for Arabic/Persian name variants'
  },
  {
    name: 'OFAC Delta Processing',
    category: 'List Management',
    description: 'Processes incremental changes from OFAC SDN delta files instead of full reload.',
    detail: 'Delta file contains: ADD, UPDATE, DELETE actions\nOnly changed records are processed → 10x faster\nFull reload used as fallback if delta unavailable\nChange log maintained for audit trail'
  },
  {
    name: 'Parallel Batch DB Write',
    category: 'Performance',
    description: 'Writes sanctions records to database in parallel batches of 200 using ThreadPoolExecutor.',
    detail: 'Workers: 8 parallel threads\nBatch size: 200 records\nUpsert logic: INSERT if new, UPDATE if changed\n12,500 OFAC records processed in < 90 seconds'
  },
  {
    name: 'Name Transliteration Enrichment',
    category: 'Enrichment',
    description: 'Automatically generates common romanization variants for Arabic, Cyrillic, and other scripts.',
    detail: 'MOHAMMAD ↔ MOHAMMED ↔ MUHAMMAD\nAHMAD ↔ AHMED, HUSSAIN ↔ HUSSEIN\nVariants stored as aliases with type=NFM\nBoosts recall for cross-script name matching'
  },
  {
    name: 'Azure OpenAI Risk Analysis',
    category: 'AI/ML',
    description: 'GPT-4o powered compliance analysis for match disposition and case narrative generation.',
    detail: 'Model: gpt-4o (Azure deployment)\nTemperature: 0.1 for deterministic analysis\nOutputs: risk_level, recommendation, regulatory_basis\nFallback: rule-based scoring if AI unavailable'
  },
  {
    name: 'SSE Real-Time Process Streaming',
    category: 'Architecture',
    description: 'Server-Sent Events stream every processing step to the UI in real time.',
    detail: 'Events: DOWNLOAD_START, PARSE_PROGRESS, DB_WRITE_PROGRESS, DONE\nHeartbeat every 1s to keep connection alive\nLog replay available for completed runs\nUI shows progress bars, timing, and record counts'
  },
  {
    name: 'Entity Type Inference',
    category: 'Enrichment',
    description: 'Automatically infers whether a sanctions entry is a vessel, aircraft, or entity from name patterns.',
    detail: 'Vessel keywords: MV, MT, SS, TANKER, SHIP\nAircraft keywords: AIRLINE, AIRWAYS, AVIATION\nFallback: ENTITY for corporate names\nIMO number validation for vessel entries'
  }
]
