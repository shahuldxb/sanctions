import React, { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../../api'
import { Spinner, PageHeader, Empty } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import {
  MessageSquare, Send, Trash2, Brain, Star, Clock, User,
  ChevronRight, ExternalLink, BookOpen, History, Plus, X
} from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'AI Sentinel – Compliance Chat',
  entities: [{
    name: 'ai_chat_sessions', description: 'Persistent AI Sentinel chat sessions with history, feedback, and sources',
    fields: [
      { name: 'session_key', type: 'varchar', description: 'Unique session identifier' },
      { name: 'asked_by', type: 'varchar', description: 'User who initiated the session' },
      { name: 'title', type: 'nvarchar', description: 'Auto-generated from first question' },
    ]
  }, {
    name: 'ai_chat_messages', description: 'Individual messages in each session',
    fields: [
      { name: 'role', type: 'enum', description: 'user | assistant' },
      { name: 'content', type: 'text', description: 'Message content' },
      { name: 'feedback_score', type: 'tinyint', description: '1-5 star rating given by user' },
      { name: 'feedback_note', type: 'nvarchar', description: 'Optional feedback comment' },
    ]
  }, {
    name: 'ai_chat_sources', description: 'Regulatory sources cited in each AI response',
    fields: [
      { name: 'source_type', type: 'varchar', description: 'REGULATION | LIST | DOCUMENT' },
      { name: 'source_name', type: 'nvarchar', description: 'Full name of the source' },
      { name: 'source_ref', type: 'nvarchar', description: 'URL or document reference' },
    ]
  }]
}

const QUICK_QUESTIONS = [
  'What are the current OFAC sanctions programs?',
  'Explain the difference between SDN and non-SDN lists',
  'What is the 50% rule in OFAC sanctions?',
  'How do I handle a potential match in the screening process?',
  'What are the penalties for OFAC violations?',
  'Explain UN Security Council targeted sanctions',
  'What is a Suspicious Activity Report (SAR)?',
  'How does the EU sanctions framework work?',
]

interface Source { source_type: string; source_name: string; source_ref: string | null }
interface Message {
  id?: number
  role: 'user' | 'assistant'
  content: string
  ts: Date
  feedback_score?: number | null
  feedback_note?: string | null
  sources?: Source[]
  tokens_used?: number | null
}
interface Session {
  id: number
  session_key: string
  title: string | null
  asked_by: string
  created_at: string
  updated_at: string
  message_count: number
  first_question: string | null
  last_message_at: string | null
  avg_feedback: number | null
}

function StarRating({ value, onChange }: { value: number | null | undefined; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="p-0.5 transition-transform hover:scale-110"
          title={`Rate ${n} star${n > 1 ? 's' : ''}`}
        >
          <Star size={14}
            className={`transition-colors ${(hover || value || 0) >= n ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`} />
        </button>
      ))}
    </div>
  )
}

function SourceBadge({ src }: { src: Source }) {
  const colours: Record<string, string> = {
    REGULATION: 'bg-blue-900/60 text-blue-300 border-blue-700/50',
    LIST: 'bg-purple-900/60 text-purple-300 border-purple-700/50',
    DOCUMENT: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/50',
  }
  const cls = colours[src.source_type] || colours.REGULATION
  return (
    <a href={src.source_ref || '#'} target="_blank" rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${cls} hover:opacity-80 transition-opacity`}
      title={src.source_ref || src.source_name}
    >
      <BookOpen size={10} />
      {src.source_name.length > 40 ? src.source_name.substring(0, 38) + '…' : src.source_name}
      {src.source_ref && <ExternalLink size={9} />}
    </a>
  )
}

export default function AIChat() {
  // Session state
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsTotal, setSessionsTotal] = useState(0)
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  const [sessionKey] = useState(() => `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const [askedBy] = useState('Compliance Officer')
  const [showHistory, setShowHistory] = useState(false)

  // Chat state
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: 'Hello! I am **SENTINEL**, your AI-powered Sanctions Compliance Assistant, powered by Azure OpenAI.\n\nI can help you with sanctions regulations, screening procedures, compliance guidance, entity analysis, and more.\n\nAll conversations are saved with full history, source citations, and feedback scores.\n\nWhat would you like to know?',
    ts: new Date(),
    sources: []
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedbackTarget, setFeedbackTarget] = useState<number | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages])

  const loadSessions = useCallback(async () => {
    try {
      const r = await api.get('/ai/sessions?limit=50')
      setSessions(r.data.data || [])
      setSessionsTotal(r.data.total || 0)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  const loadSession = async (session: Session) => {
    try {
      const r = await api.get(`/ai/sessions/${session.id}/messages`)
      const msgs: Message[] = r.data.map((m: any) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        ts: new Date(m.created_at),
        feedback_score: m.feedback_score,
        feedback_note: m.feedback_note,
        sources: m.sources || [],
        tokens_used: m.tokens_used,
      }))
      setMessages(msgs.length ? msgs : messages)
      setActiveSessionId(session.id)
      setShowHistory(false)
    } catch (e: any) { toast.error('Failed to load session: ' + e.message) }
  }

  const deleteSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this conversation?')) return
    try {
      await api.delete(`/ai/sessions/${id}`)
      setSessions(p => p.filter(s => s.id !== id))
      if (activeSessionId === id) { setActiveSessionId(null); newChat() }
      toast.success('Session deleted')
    } catch (e: any) { toast.error(e.message) }
  }

  const newChat = () => {
    setActiveSessionId(null)
    setMessages([{
      role: 'assistant',
      content: 'New session started. How can I help you with sanctions compliance?',
      ts: new Date(),
      sources: []
    }])
    setShowHistory(false)
  }

  const send = async (msg?: string) => {
    const text = msg || input.trim()
    if (!text) return
    setInput('')
    const userMsg: Message = { role: 'user', content: text, ts: new Date() }
    setMessages(p => [...p, userMsg])
    setLoading(true)
    try {
      const history = messages
        .filter(m => m.role !== 'assistant' || m.id !== undefined || messages.indexOf(m) > 0)
        .map(m => ({ role: m.role, content: m.content }))

      const r = await api.post('/ai/chat', {
        message: text,
        history,
        session_key: activeSessionId ? undefined : sessionKey,
        asked_by: askedBy,
      })

      const asstMsg: Message = {
        id: r.data.message_id,
        role: 'assistant',
        content: r.data.response || 'I processed your request.',
        ts: new Date(),
        sources: r.data.sources || [],
        tokens_used: r.data.tokens_used?.total_tokens || null,
        feedback_score: null,
      }
      setMessages(p => [...p, asstMsg])

      // Update session id from response
      if (r.data.session_id && !activeSessionId) setActiveSessionId(r.data.session_id)

      // Refresh session list
      loadSessions()
    } catch (e: any) {
      toast.error('AI error: ' + (e.message || e))
      setMessages(p => [...p, { role: 'assistant', content: 'I encountered an error. Please try again.', ts: new Date(), sources: [] }])
    }
    setLoading(false)
  }

  const submitFeedback = async (msgId: number, score: number) => {
    try {
      await api.patch(`/ai/messages/${msgId}/feedback`, { score })
      setMessages(p => p.map(m => m.id === msgId ? { ...m, feedback_score: score } : m))
      setFeedbackTarget(null)
      toast.success(`Feedback saved (${score} ★)`)
    } catch (e: any) { toast.error('Failed to save feedback') }
  }

  const formatContent = (text: string) => {
    // Simple markdown-like rendering
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-slate-700 px-1 rounded text-xs">$1</code>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader
        title="AI Sentinel"
        subtitle="Azure OpenAI powered sanctions compliance assistant · All sessions persisted"
        icon={Brain}
        actions={
          <div className="flex gap-2">
            <button onClick={() => { setShowHistory(p => !p); loadSessions() }}
              className={`btn-ghost text-xs flex items-center gap-1 ${showHistory ? 'text-blue-400' : ''}`}>
              <History size={14} /> History ({sessionsTotal})
            </button>
            <button onClick={newChat} className="btn-ghost text-xs flex items-center gap-1">
              <Plus size={14} /> New Chat
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* ── Main Chat Panel ──────────────────────────────────────────────── */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* Session banner */}
          {activeSessionId && (
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-900/30 border border-blue-700/40 rounded-xl text-xs text-blue-300">
              <History size={12} />
              Viewing saved session #{activeSessionId}
              <button onClick={newChat} className="ml-auto text-slate-400 hover:text-white"><X size={12} /></button>
            </div>
          )}

          <div className="card flex flex-col" style={{ height: '680px' }}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5" ref={chatRef}>
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[82%] ${msg.role === 'user' ? '' : 'w-full'}`}>
                    {/* Header row */}
                    <div className={`flex items-center gap-2 mb-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'user' ? (
                        <>
                          <span className="text-xs text-slate-400">{askedBy}</span>
                          <User size={12} className="text-blue-400" />
                        </>
                      ) : (
                        <>
                          <Brain size={12} className="text-purple-400" />
                          <span className="text-xs text-purple-400">SENTINEL</span>
                          {msg.tokens_used && <span className="text-xs text-slate-600">{msg.tokens_used} tokens</span>}
                        </>
                      )}
                      <span className="text-xs text-slate-600 flex items-center gap-0.5">
                        <Clock size={9} />{msg.ts.toLocaleTimeString()}
                      </span>
                    </div>

                    {/* Bubble */}
                    <div className={`rounded-2xl px-5 py-3 ${msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-slate-800/80 text-slate-200 rounded-bl-sm border border-slate-700/60'}`}>
                      <div className="text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }} />
                    </div>

                    {/* Sources (assistant only) */}
                    {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.sources.map((src, si) => <SourceBadge key={si} src={src} />)}
                      </div>
                    )}

                    {/* Feedback (assistant only, has DB id) */}
                    {msg.role === 'assistant' && msg.id && (
                      <div className="mt-2 flex items-center gap-3">
                        <StarRating
                          value={msg.feedback_score}
                          onChange={score => submitFeedback(msg.id!, score)}
                        />
                        {msg.feedback_score && (
                          <span className="text-xs text-amber-400">{msg.feedback_score} ★ rated</span>
                        )}
                        {!msg.feedback_score && (
                          <span className="text-xs text-slate-600">Rate this response</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800/80 rounded-2xl rounded-bl-sm border border-slate-700 px-5 py-3 flex items-center gap-2 text-purple-400">
                    <Spinner size={14} /><span className="text-xs">SENTINEL is thinking…</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-700/50">
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="Ask about sanctions, compliance, screening…"
                  disabled={loading}
                />
                <button className="btn-primary px-4" onClick={() => send()} disabled={loading || !input.trim()}>
                  {loading ? <Spinner size={16} /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Sidebar ────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* History panel (toggleable) */}
          {showHistory && (
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <History size={14} /> Conversation History
                </span>
                <span className="text-xs text-slate-500">{sessionsTotal} sessions</span>
              </div>
              <div className="p-2 max-h-80 overflow-y-auto space-y-1">
                {sessions.length === 0
                  ? <div className="text-xs text-slate-500 p-3 text-center">No saved sessions yet</div>
                  : sessions.map(s => (
                    <div key={s.id}
                      onClick={() => loadSession(s)}
                      className={`group flex items-start gap-2 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-slate-700/50 ${activeSessionId === s.id ? 'bg-blue-900/30 border border-blue-700/40' : ''}`}>
                      <MessageSquare size={12} className="text-slate-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-300 truncate font-medium">
                          {s.title || s.first_question || 'Untitled session'}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-600">{s.asked_by}</span>
                          <span className="text-xs text-slate-600">·</span>
                          <span className="text-xs text-slate-600">{s.message_count} msgs</span>
                          {s.avg_feedback && (
                            <span className="text-xs text-amber-500 flex items-center gap-0.5">
                              <Star size={9} className="fill-amber-500" />{s.avg_feedback.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {s.last_message_at ? new Date(s.last_message_at).toLocaleDateString() : ''}
                        </div>
                      </div>
                      <button onClick={e => deleteSession(s.id, e)}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity p-0.5">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          {/* Quick Questions */}
          <div className="card">
            <div className="card-header"><span className="text-sm font-semibold text-white">Quick Questions</span></div>
            <div className="p-3 space-y-1">
              {QUICK_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => send(q)}
                  className="w-full text-left text-xs text-slate-400 hover:text-white hover:bg-slate-700/50 p-2 rounded-lg transition-colors flex items-start gap-1.5">
                  <ChevronRight size={10} className="mt-0.5 shrink-0 text-slate-600" />
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Model info */}
          <div className="card p-4 space-y-2">
            <div className="text-xs text-slate-500 font-semibold uppercase">Model</div>
            <div className="text-xs text-slate-300">Azure OpenAI GPT-4o</div>
            <div className="text-xs text-slate-500">Sanctions compliance specialist context</div>
            <div className="border-t border-slate-700/50 pt-2 space-y-1">
              <div className="text-xs text-slate-500 font-semibold uppercase">Features</div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5"><History size={10} className="text-blue-400" /> Persistent history</div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5"><Star size={10} className="text-amber-400" /> Feedback scoring</div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5"><BookOpen size={10} className="text-purple-400" /> Source citations</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
