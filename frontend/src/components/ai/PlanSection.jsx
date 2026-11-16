import { useState } from 'react'
import { CalendarClock, MessageCircleQuestion, Copy, Check, FileQuestion } from 'lucide-react'
import { Panel, EmptyNote } from './ui'

export default function PlanSection({ report, insights }) {
  const [copied, setCopied] = useState(false)
  const plan = report.monitoring_plan || []
  const questions = insights?.questions_for_doctor || []
  const gaps = insights?.data_gaps || []

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(questions.map((q, i) => `${i + 1}. ${q}`).join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <Panel title="Suggested tests" icon={CalendarClock} right={<span className="text-[11px] text-stone-500">confirm with your doctor</span>}>
        {plan.length ? (
          <ul className="divide-y divide-white/[0.06] -my-2">
            {plan.map((m, i) => (
              <li key={i} className="py-2.5">
                <p className="text-[13px] font-medium text-stone-100">{m.test}</p>
                <p className="text-[11px] font-mono text-brand-400 mt-0.5">{m.interval}</p>
                <p className="text-[11px] text-stone-400 mt-0.5 leading-relaxed line-clamp-2">{m.why}</p>
              </li>
            ))}
          </ul>
        ) : <EmptyNote>Nothing specific yet — add more records.</EmptyNote>}
      </Panel>

      <div className="space-y-4">
        <Panel
          title="Questions for your next visit"
          icon={MessageCircleQuestion}
          right={questions.length > 0 && (
            <button onClick={copy} className="btn-ghost text-[11px] px-2 py-1">
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        >
          {questions.length ? (
            <ol className="space-y-1.5 text-[13px] text-stone-300 list-decimal pl-4">
              {questions.map((q, i) => <li key={i} className="leading-relaxed pl-1">{q}</li>)}
            </ol>
          ) : <EmptyNote>Generate insights to get suggested questions.</EmptyNote>}
        </Panel>

        {gaps.length > 0 && (
          <Panel title="To improve your results" icon={FileQuestion}>
            <ul className="space-y-1 text-xs text-stone-400 list-disc pl-4">
              {gaps.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  )
}
