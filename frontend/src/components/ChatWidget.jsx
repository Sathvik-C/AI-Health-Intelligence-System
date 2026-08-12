import { useState, useRef, useEffect } from 'react'
import api from '../utils/api'
import { Send, Loader, Bot, User, Stethoscope, MessageCircle, X } from 'lucide-react'

const SUGGESTED = [
  "Is my HbA1c increasing?",
  "Compare my latest report with before.",
  "Am I at risk of diabetes?",
  "What are my abnormal values?",
]

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your health assistant. Ask me about your lab results, trends, or health risks. I'll provide contextual explanations based on your data.\n\n⚠️ I'm not a doctor — always consult a healthcare provider for medical decisions." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [doctorMode, setDoctorMode] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { 
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) 
    }
  }, [messages, isOpen])

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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-brand-500 hover:bg-brand-600 text-white rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 z-50"
      >
        <MessageCircle size={24} />
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[32rem] bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden">
      {/* Header */}
      <div className="bg-stone-950 border-b border-stone-800 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-brand-400" />
          <h1 className="font-semibold text-white text-sm">AI Assistant</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDoctorMode(d => !d)}
            className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border transition-colors ${
              doctorMode ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'border-stone-700 text-stone-400 hover:text-white'
            }`}
          >
            <Stethoscope size={11} />
            Doctor Mode
          </button>
          <button onClick={() => setIsOpen(false)} className="text-stone-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={12} className="text-brand-400" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-brand-500 text-white rounded-tr-sm'
                : 'bg-stone-800 text-stone-100 rounded-tl-sm'
            }`}>
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center shrink-0 mt-0.5">
                <User size={12} className="text-stone-300" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-brand-500/20 flex items-center justify-center">
              <Bot size={12} className="text-brand-400" />
            </div>
            <div className="bg-stone-800 rounded-2xl rounded-tl-sm px-3 py-2 flex items-center">
              <Loader size={12} className="animate-spin text-stone-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
          {SUGGESTED.map(s => (
            <button key={s} onClick={() => send(s)} className="text-[10px] text-stone-400 border border-stone-700 hover:border-stone-500 hover:text-white rounded-full px-2 py-1 transition-colors text-left">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="bg-stone-950 border-t border-stone-800 p-3 flex gap-2 shrink-0">
        <input
          className="input flex-1 text-xs py-1.5 px-3"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask about your health data…"
          disabled={loading}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()} className="btn-primary px-2.5 py-1.5">
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
