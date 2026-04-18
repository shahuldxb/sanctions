import React, { useState, useRef, useEffect } from 'react'
import { api } from '../api'
import { Spinner, PageHeader, StatCard } from '../components/ui'
import { SetPageHelp } from '../components/HelpOverlay'
import { Brain, Send, RefreshCw, Zap, FileSearch, Globe, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'AI Intelligence',
  entities: [{
    name: 'ai_analysis', description: 'Azure OpenAI powered sanctions intelligence and analysis',
    fields: [
      { name: 'query', type: 'text', description: 'Natural language query or subject name' },
      { name: 'analysis_type', type: 'enum', description: 'ENTITY_ANALYSIS | RISK_ASSESSMENT | NETWORK_ANALYSIS | ADVERSE_MEDIA | TRANSLITERATION' },
      { name: 'response', type: 'text', description: 'AI-generated analysis response' },
      { name: 'confidence', type: 'decimal', description: 'AI confidence score 0-1' },
      { name: 'sources', type: 'text', description: 'Sources referenced in analysis' },
    ]
  }]
}

const QUICK_PROMPTS = [
  { label: 'Analyze Entity Risk', prompt: 'Analyze the sanctions risk profile for: ', icon: FileSearch },
  { label: 'Network Analysis', prompt: 'Identify potential sanctions network connections for: ', icon: Globe },
  { label: 'Transliterate Name', prompt: 'Provide all transliterations and name variants for: ', icon: RefreshCw },
  { label: 'Adverse Media', prompt: 'Search for adverse media and sanctions indicators for: ', icon: AlertTriangle },
  { label: 'Country Risk', prompt: 'Provide sanctions risk assessment for country: ', icon: Globe },
  { label: 'Explain Match', prompt: 'Explain why this could be a sanctions match: ', icon: Zap },
]

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  type?: 'analysis' | 'chat'
}

export default function AIIntelligence() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Welcome to the Sanctions AI Intelligence Engine. I can help you analyze entities, assess sanctions risk, identify network connections, transliterate names, and provide compliance guidance. What would you like to investigate?',
      timestamp: new Date(),
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [analysisType, setAnalysisType] = useState('ENTITY_ANALYSIS')
  const [subject, setSubject] = useState('')
  const [analysisResult, setAnalysisResult] = useState<any>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages])

  const sendMessage = async (msg?: string) => {
    const text = msg || input.trim()
    if (!text) return
    setInput('')
    const userMsg: Message = { role: 'user', content: text, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    try {
      const r = await api.post('/ai/chat', {
        messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
        context: 'sanctions_compliance'
      })
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: r.data.response || r.data.message || 'Analysis complete.',
        timestamp: new Date()
      }])
    } catch (e: any) {
      toast.error('AI service error: ' + e.message)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      }])
    }
    setLoading(false)
  }

  const runAnalysis = async () => {
    if (!subject.trim()) { toast.error('Enter a subject name or entity'); return }
    setAnalyzing(true)
    setAnalysisResult(null)
    try {
      const r = await api.post('/ai/analyze', { subject, analysis_type: analysisType })
      setAnalysisResult(r.data)
      toast.success('Analysis complete')
    } catch (e: any) {
      toast.error('Analysis failed: ' + e.message)
    }
    setAnalyzing(false)
  }

  const getRiskColor = (risk: string) => {
    switch (risk?.toUpperCase()) {
      case 'CRITICAL': case 'HIGH': return 'text-red-400'
      case 'MEDIUM': return 'text-amber-400'
      case 'LOW': return 'text-green-400'
      default: return 'text-slate-400'
    }
  }

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="AI Intelligence Engine" subtitle="Azure OpenAI powered sanctions analysis and entity intelligence" icon={Brain} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Chat */}
        <div className="card flex flex-col h-[700px]">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-purple-400" />
              <span className="font-semibold text-white">Sanctions AI Assistant</span>
              <span className="text-xs text-slate-500">Powered by Azure OpenAI</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={chatRef}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-800/80 text-slate-200 rounded-bl-sm border border-slate-700'}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1 mb-1">
                      <Brain size={10} className="text-purple-400" />
                      <span className="text-xs text-purple-400 font-medium">AI Engine</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                  <div className="text-xs opacity-50 mt-1">{msg.timestamp.toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800/80 rounded-2xl rounded-bl-sm border border-slate-700 px-4 py-3">
                  <div className="flex items-center gap-2 text-purple-400">
                    <Spinner size={14} />
                    <span className="text-xs">Analyzing...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-700/50">
            <div className="flex flex-wrap gap-1 mb-3">
              {QUICK_PROMPTS.map(qp => (
                <button key={qp.label} onClick={() => setInput(qp.prompt)} className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors">
                  {qp.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Ask about any entity, country, or sanctions matter..."
                disabled={loading}
              />
              <button className="btn-primary px-4" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
                {loading ? <Spinner size={16} /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Structured Analysis */}
        <div className="space-y-4">
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-amber-400" />
                <span className="font-semibold text-white">Structured Analysis</span>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-slate-400 uppercase mb-1 block">Subject / Entity Name</label>
                <input className="input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Enter name, company, or entity..." onKeyDown={e => e.key === 'Enter' && runAnalysis()} />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase mb-1 block">Analysis Type</label>
                <select className="select" value={analysisType} onChange={e => setAnalysisType(e.target.value)}>
                  <option value="ENTITY_ANALYSIS">Entity Risk Analysis</option>
                  <option value="NETWORK_ANALYSIS">Network & Connections</option>
                  <option value="TRANSLITERATION">Name Transliteration</option>
                  <option value="ADVERSE_MEDIA">Adverse Media Check</option>
                  <option value="COUNTRY_RISK">Country Risk</option>
                  <option value="OWNERSHIP">Ownership Structure</option>
                </select>
              </div>
              <button className="btn-primary w-full py-3" onClick={runAnalysis} disabled={analyzing}>
                {analyzing ? <><Spinner size={16} /> Analyzing with AI...</> : <><Brain size={16} /> Run AI Analysis</>}
              </button>
            </div>
          </div>

          {analysisResult && (
            <div className="card">
              <div className="card-header">
                <span className="font-semibold text-white">Analysis Results</span>
                <span className={`text-sm font-bold ${getRiskColor(analysisResult.risk_level)}`}>{analysisResult.risk_level}</span>
              </div>
              <div className="p-5 space-y-4">
                {analysisResult.risk_score !== undefined && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Risk Score</span>
                      <span className={`font-bold ${getRiskColor(analysisResult.risk_level)}`}>{analysisResult.risk_score}/100</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${analysisResult.risk_score >= 70 ? 'bg-red-500' : analysisResult.risk_score >= 40 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${analysisResult.risk_score}%` }} />
                    </div>
                  </div>
                )}

                {analysisResult.summary && (
                  <div className="bg-slate-800/60 rounded-xl p-3 text-sm text-slate-300 leading-relaxed">{analysisResult.summary}</div>
                )}

                {analysisResult.name_variants?.length > 0 && (
                  <div>
                    <div className="text-xs text-slate-400 uppercase mb-2">Name Variants & Transliterations</div>
                    <div className="flex flex-wrap gap-1">
                      {analysisResult.name_variants.map((v: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-900/30 text-blue-300 text-xs rounded-full border border-blue-700/30">{v}</span>
                      ))}
                    </div>
                  </div>
                )}

                {analysisResult.risk_factors?.length > 0 && (
                  <div>
                    <div className="text-xs text-slate-400 uppercase mb-2">Risk Factors</div>
                    <div className="space-y-1">
                      {analysisResult.risk_factors.map((f: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                          <span className="text-red-400 mt-0.5">▸</span>{f}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysisResult.recommendations?.length > 0 && (
                  <div>
                    <div className="text-xs text-slate-400 uppercase mb-2">Recommendations</div>
                    <div className="space-y-1">
                      {analysisResult.recommendations.map((r: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                          <span className="text-green-400 mt-0.5">✓</span>{r}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header"><span className="font-semibold text-white text-sm">AI Capabilities</span></div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {[
                ['Entity Risk Scoring', 'AI-powered risk assessment'],
                ['Name Transliteration', 'Arabic, Cyrillic, Chinese, Persian'],
                ['Network Mapping', 'Ownership & control chains'],
                ['Adverse Media', 'News and media analysis'],
                ['Fuzzy Matching', 'Phonetic & semantic similarity'],
                ['Country Risk', 'Jurisdiction risk assessment'],
                ['PEP Detection', 'Politically exposed persons'],
                ['Ownership Analysis', 'Beneficial ownership tracing'],
              ].map(([title, desc]) => (
                <div key={title} className="bg-slate-800/40 rounded-lg p-3">
                  <div className="text-xs font-medium text-white mb-0.5">{title}</div>
                  <div className="text-xs text-slate-500">{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
