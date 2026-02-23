import { useState, useRef, useEffect } from 'react'
import api from '../utils/api'
import { Send, Loader, Bot, User, Stethoscope } from 'lucide-react'

const SUGGESTED = [
  "Is my HbA1c increasing?",
  "Compare my latest report with before.",
  "Am I at risk of diabetes?",
  "What are my abnormal values?",
]

export default function ChatPage() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your health assistant. Ask me about your lab results, trends, or health risks. I'll provide contextual explanations based on your data.\n\n⚠️ I'm not a doctor — always consult a healthcare provider for medical decisions." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [doctorMode, setDoctorMode] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (text) => {
    const q = text || input.trim()
    if (!q) return
    setInput('')
    setMessages(m => [...m, { role: 'user', content: q }])
    setLoading(true)
    try {
      const res = await api.post('/chat/', { message: q, doctor_mode: doctorMode })
      setMessages(m => [...m, { role: 'assistant', content: res.data.answer }])
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: 'Sorry, an error occurred. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-brand-400" />
          <h1 className="font-semibold text-white">AI Health Assistant</h1>
        </div>
        <button
          onClick={() => setDoctorMode(d => !d)}
          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-colors ${
            doctorMode ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'border-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          <Stethoscope size={13} />
          Doctor Mode {doctorMode ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} className="text-brand-400" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-brand-500 text-white rounded-tr-sm'
                : 'bg-slate-800 text-slate-100 rounded-tl-sm'
            }`}>
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} className="text-slate-300" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-brand-500/20 flex items-center justify-center">
              <Bot size={14} className="text-brand-400" />
            </div>
            <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader size={14} className="animate-spin text-slate-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="px-6 pb-2 flex flex-wrap gap-2">
          {SUGGESTED.map(s => (
            <button key={s} onClick={() => send(s)} className="text-xs text-slate-400 border border-slate-700 hover:border-slate-500 hover:text-white rounded-full px-3 py-1.5 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-slate-800 p-4 flex gap-3">
        <input
          className="input flex-1"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask about your health data…"
          disabled={loading}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()} className="btn-primary px-3">
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
