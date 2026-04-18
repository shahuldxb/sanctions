import React, { useState, useRef, useEffect } from 'react'
import { api } from '../../api'
import { Spinner, PageHeader } from '../../components/ui'
import { SetPageHelp } from '../../components/HelpOverlay'
import { MessageSquare, Send, Trash2, Brain } from 'lucide-react'
import toast from 'react-hot-toast'

const PAGE_META = {
  title: 'AI Compliance Chat',
  entities: [{
    name: 'ai_chat_sessions', description: 'Azure OpenAI powered compliance assistant chat sessions',
    fields: [
      { name: 'session_id', type: 'varchar', description: 'Chat session identifier' },
      { name: 'role', type: 'enum', description: 'user | assistant | system' },
      { name: 'content', type: 'text', description: 'Message content' },
      { name: 'tokens_used', type: 'int', description: 'Tokens consumed' },
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

interface Message { role: 'user' | 'assistant'; content: string; ts: Date }

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: 'Hello! I am your Sanctions Compliance AI Assistant, powered by Azure OpenAI. I can help you with sanctions regulations, screening procedures, compliance guidance, entity analysis, and more. What would you like to know?',
    ts: new Date()
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight }, [messages])

  const send = async (msg?: string) => {
    const text = msg || input.trim()
    if (!text) return
    setInput('')
    const userMsg: Message = { role: 'user', content: text, ts: new Date() }
    setMessages(p => [...p, userMsg])
    setLoading(true)
    try {
      const r = await api.post('/ai/chat', {
        messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
        context: 'sanctions_compliance'
      })
      setMessages(p => [...p, { role: 'assistant', content: r.data.response || r.data.message || 'I processed your request.', ts: new Date() }])
    } catch (e: any) {
      toast.error('AI error: ' + (e.message || e))
      setMessages(p => [...p, { role: 'assistant', content: 'I encountered an error. Please try again.', ts: new Date() }])
    }
    setLoading(false)
  }

  return (
    <div>
      <SetPageHelp meta={PAGE_META} />
      <PageHeader title="AI Compliance Chat" subtitle="Azure OpenAI powered sanctions compliance assistant" icon={MessageSquare}
        actions={<button onClick={() => setMessages([{ role: 'assistant', content: 'Session cleared. How can I help you?', ts: new Date() }])} className="btn-ghost text-xs"><Trash2 size={14} /> Clear</button>} />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 card flex flex-col h-[700px]">
          <div className="flex-1 overflow-y-auto p-5 space-y-4" ref={chatRef}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-5 py-3 ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-800/80 text-slate-200 rounded-bl-sm border border-slate-700'}`}>
                  {msg.role === 'assistant' && <div className="flex items-center gap-1 mb-1"><Brain size={10} className="text-purple-400" /><span className="text-xs text-purple-400">AI Assistant</span></div>}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                  <div className="text-xs opacity-40 mt-1">{msg.ts.toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800/80 rounded-2xl rounded-bl-sm border border-slate-700 px-5 py-3 flex items-center gap-2 text-purple-400">
                  <Spinner size={14} /><span className="text-xs">Thinking...</span>
                </div>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-slate-700/50">
            <div className="flex gap-2">
              <input className="input flex-1" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()} placeholder="Ask about sanctions, compliance, screening..." disabled={loading} />
              <button className="btn-primary px-4" onClick={() => send()} disabled={loading || !input.trim()}>{loading ? <Spinner size={16} /> : <Send size={16} />}</button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="card">
            <div className="card-header"><span className="text-sm font-semibold text-white">Quick Questions</span></div>
            <div className="p-3 space-y-1">
              {QUICK_QUESTIONS.map((q, i) => (
                <button key={i} onClick={() => send(q)} className="w-full text-left text-xs text-slate-400 hover:text-white hover:bg-slate-700/50 p-2 rounded-lg transition-colors">{q}</button>
              ))}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-slate-500 font-semibold uppercase mb-2">Model</div>
            <div className="text-xs text-slate-300">Azure OpenAI GPT-4</div>
            <div className="text-xs text-slate-500 mt-1">Sanctions compliance specialist context</div>
          </div>
        </div>
      </div>
    </div>
  )
}
