import { useState } from 'react'
import { ChevronDown, Link2, Footprints, ShieldCheck, Smile, Activity } from 'lucide-react'
import { Dot, LevelBadge, Panel, EmptyNote } from './ui'

/** One expandable insight row: title + 1-line text; tap to see the full text and evidence. */
export function InsightRow({ item, level, factsById, icon: Icon }) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-start gap-3 py-2.5 text-left group">
        {Icon ? <Icon size={14} className="text-stone-400 mt-0.5 shrink-0" /> : <span className="mt-1.5"><Dot level={level} /></span>}
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="text-[13px] font-medium text-stone-100 leading-snug">{item.title}</span>
            {level && !Icon && <LevelBadge level={level} />}
          </span>
          <span className={`text-xs text-stone-400 leading-relaxed mt-0.5 ${open ? 'block' : 'line-clamp-1'}`}>{item.explanation}</span>
          {open && item.evidence_ids?.length > 0 && (
            <span className="block mt-2 space-y-1">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-stone-500">Based on</span>
              {item.evidence_ids.map(id => (
                <span key={id} className="block text-[11px] text-stone-400 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1.5 leading-relaxed">
                  {factsById[id]?.text || id}
                </span>
              ))}
            </span>
          )}
        </span>
        <ChevronDown size={14} className={`text-stone-600 group-hover:text-stone-400 mt-0.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    </li>
  )
}

export default function OverviewSection({ insights, factsById }) {
  if (!insights) return <EmptyNote>Generate insights to see your overview.</EmptyNote>
  const findings = insights.key_findings || []
  const attention = findings.filter(f => f.severity === 'act' || f.severity === 'watch')
  const good = findings.filter(f => f.severity === 'positive' || f.severity === 'info')
  const patterns = [
    ...(insights.connections || []).map(c => ({ ...c, _icon: Link2 })),
    ...(insights.lifestyle_focus || []).map(c => ({ ...c, _icon: Footprints })),
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <Panel title="Needs your attention" icon={Activity} right={<span className="text-[11px] text-stone-500">{attention.length}</span>}>
        {attention.length ? (
          <ul className="divide-y divide-white/[0.06] -my-2.5">
            {attention.map((f, i) => <InsightRow key={i} item={f} level={f.severity} factsById={factsById} />)}
          </ul>
        ) : (
          <p className="text-xs text-emerald-400 flex items-center gap-2"><ShieldCheck size={14} /> Nothing needs urgent attention.</p>
        )}
      </Panel>

      <Panel title="Going well" icon={Smile} right={<span className="text-[11px] text-stone-500">{good.length}</span>}>
        {good.length ? (
          <ul className="divide-y divide-white/[0.06] -my-2.5">
            {good.map((f, i) => <InsightRow key={i} item={f} level={f.severity} factsById={factsById} />)}
          </ul>
        ) : <EmptyNote>No improvements detected yet — add more reports to track progress.</EmptyNote>}
      </Panel>

      {patterns.length > 0 && (
        <Panel title="Patterns in your data" icon={Link2} className="lg:col-span-2">
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 divide-y lg:divide-y-0 divide-white/[0.06] -my-2.5">
            {patterns.map((p, i) => <InsightRow key={i} item={p} icon={p._icon} factsById={factsById} />)}
          </ul>
        </Panel>
      )}
    </div>
  )
}
