import { useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Info, ShieldAlert, HelpCircle, Circle, ChevronDown, X, Sparkles,
} from 'lucide-react'

// ── Severity vocabulary ────────────────────────────────────────────────────────
// One friendly label per level, mapped onto the existing badge classes (they already
// have light-mode overrides in index.css).
export const LEVEL = {
  act:      { badge: 'risk-red',    label: 'Discuss soon', dot: 'bg-rose-500',    icon: ShieldAlert },
  high:     { badge: 'risk-red',    label: 'High',         dot: 'bg-rose-500',    icon: ShieldAlert },
  watch:    { badge: 'risk-yellow', label: 'Watch',        dot: 'bg-amber-500',   icon: AlertTriangle },
  moderate: { badge: 'risk-yellow', label: 'Moderate',     dot: 'bg-amber-500',   icon: AlertTriangle },
  info:     { badge: 'risk-blue',   label: 'FYI',          dot: 'bg-sky-500',     icon: Info },
  positive: { badge: 'risk-green',  label: 'Good news',    dot: 'bg-emerald-500', icon: CheckCircle2 },
  ok:       { badge: 'risk-green',  label: 'Good',         dot: 'bg-emerald-500', icon: CheckCircle2 },
  none:     { badge: 'risk-green',  label: 'No change',    dot: 'bg-emerald-500', icon: CheckCircle2 },
}

// Plain-language names first, technical name second.
export const CALC_META = {
  egfr:               { title: 'Kidney function',     tech: 'eGFR · CKD-EPI 2021' },
  fib4:               { title: 'Liver scarring risk', tech: 'FIB-4 index' },
  ascvd:              { title: '10-year heart risk',  tech: 'Pooled Cohort Equations' },
  idrs:               { title: 'Diabetes risk score', tech: 'Indian Diabetes Risk Score' },
  bmi:                { title: 'Body weight (BMI)',   tech: 'Asian / WHO cut-offs' },
  metabolic_syndrome: { title: 'Metabolic syndrome',  tech: '5-point check (2009 criteria)' },
}

export function LevelBadge({ level, label }) {
  const m = LEVEL[level] || LEVEL.info
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${m.badge}`}>
      {label || m.label}
    </span>
  )
}

export function Dot({ level }) {
  return <span className={`w-2 h-2 rounded-full shrink-0 ${(LEVEL[level] || LEVEL.info).dot}`} />
}

// Compact card section with a small title row
export function Panel({ title, icon: Icon, right, children, className = '' }) {
  return (
    <section className={`card p-4 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-[13px] font-semibold text-white flex items-center gap-2">
            {Icon && <Icon size={14} className="text-brand-400" />} {title}
          </h3>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

// Collapsible block (progressive disclosure)
export function Accordion({ title, icon: Icon, meta, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card p-0 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.02]"
      >
        <span className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={14} className="text-brand-400 shrink-0" />}
          <span className="text-[13px] font-semibold text-white truncate">{title}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {meta}
          <ChevronDown size={15} className={`text-stone-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-white/[0.06]">{children}</div>}
    </div>
  )
}

// Right-hand detail sheet on desktop, bottom sheet on mobile
export function Sheet({ open, onClose, title, subtitle, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 !m-0 z-50 flex justify-end items-end md:items-stretch bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className="w-full md:w-[440px] max-h-[88vh] md:max-h-none md:h-full overflow-y-auto bg-[#121520] border-t md:border-t-0 md:border-l border-white/[0.1] rounded-t-2xl md:rounded-none shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 bg-[#121520] border-b border-white/[0.07]">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white leading-tight">{title}</h3>
            {subtitle && <p className="text-[11px] font-mono text-stone-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white p-1 -m-1" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

// Tri-state check used for risk enhancers / metabolic syndrome components
export function TriState({ value }) {
  if (value === true) return <CheckCircle2 size={14} className="text-amber-400 shrink-0" />
  if (value === false) return <Circle size={14} className="text-emerald-400 shrink-0" />
  return <HelpCircle size={14} className="text-stone-500 shrink-0" />
}

export function EmptyNote({ children }) {
  return <p className="text-xs text-stone-500 py-1">{children}</p>
}

export function AiTag() {
  return <span className="inline-flex items-center gap-1 text-[10px] text-stone-500"><Sparkles size={10} /> AI</span>
}

export const pretty = (s) => (s == null ? '—' : String(s).replace(/_/g, ' '))

export function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
