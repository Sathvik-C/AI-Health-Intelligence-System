import { useState } from 'react'
import { FileText, Dna, BookOpen, User, ExternalLink, ShieldCheck, ShieldAlert, ChevronDown, Info } from 'lucide-react'

// Renders a RAG answer from POST /chat/: claims with numbered citations + the source cards they point to.
const KIND = {
  openfda: { icon: FileText, label: 'FDA label' },
  cpic: { icon: Dna, label: 'CPIC guideline' },
  medlineplus: { icon: BookOpen, label: 'MedlinePlus' },
  user: { icon: User, label: 'Your records' },
}

function KindBadge({ kind }) {
  const k = KIND[kind] || { icon: Info, label: kind }
  const Icon = k.icon
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-stone-300 shrink-0">
      <Icon size={10} /> {k.label}
    </span>
  )
}

function RefChip({ n, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show source ${n}`}
      className={`rag-ref-chip ${active ? 'is-active' : ''} ml-1 align-super text-[9px] font-bold px-1 rounded border transition-colors ${
        active ? 'bg-brand-500 text-white border-brand-500' : 'text-brand-400 border-brand-500/40 hover:bg-brand-500/20'
      }`}
    >
      {n}
    </button>
  )
}

function SourceCard({ s, open, onToggle }) {
  return (
    <li className={`rounded-xl border p-2.5 transition-colors ${open ? 'border-brand-500/50 bg-brand-500/[0.06]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-bold text-brand-400 mt-0.5 w-4 shrink-0">[{s.ref}]</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <KindBadge kind={s.kind} />
            <span className="text-[11px] font-semibold text-stone-100 truncate">{s.title}</span>
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5">
            {s.section}{s.version ? ` · ${s.version}` : ''}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <button type="button" onClick={onToggle} className="text-[10px] text-stone-300 hover:text-white inline-flex items-center gap-0.5">
              <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
              {open ? 'Hide passage' : 'Show passage'}
            </button>
            {s.url && (
              <a href={s.url} target="_blank" rel="noreferrer" className="text-[10px] text-brand-400 hover:underline inline-flex items-center gap-0.5">
                Open source <ExternalLink size={10} />
              </a>
            )}
          </div>
          {open && (
            <div className="mt-1.5 text-[11px] leading-relaxed text-stone-300 whitespace-pre-wrap border-l-2 border-brand-500/40 pl-2">
              {s.snippet}{s.snippet && s.snippet.length >= 600 ? ' …' : ''}
              {s.attribution && <div className="mt-1 text-[10px] text-stone-400 italic">{s.attribution}</div>}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function Verification({ v }) {
  if (!v) return null
  const dropped = (v.dropped || []).length
  const unavailable = v.entailment === 'unavailable'
  return (
    <div className={`flex items-start gap-1.5 text-[10px] ${unavailable ? 'text-amber-400' : 'text-emerald-400'}`}>
      {unavailable ? <ShieldAlert size={12} className="shrink-0 mt-px" /> : <ShieldCheck size={12} className="shrink-0 mt-px" />}
      <span>
        {unavailable
          ? 'Citations checked, but the second check was unavailable — please read the sources.'
          : 'Every statement was checked against its cited source.'}
        {dropped > 0 && ` ${dropped} statement${dropped > 1 ? 's' : ''} removed because ${dropped > 1 ? 'their' : 'its'} sources did not support ${dropped > 1 ? 'them' : 'it'}.`}
      </span>
    </div>
  )
}

export default function CitedAnswer({ data }) {
  const [openRef, setOpenRef] = useState(null)

  if (data.status !== 'answered') {
    return (
      <div className="space-y-2">
        <p className="whitespace-pre-wrap">{data.answer}</p>
        {data.related_sources?.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">Closest reading</div>
            <ul className="space-y-1">
              {data.related_sources.map((s, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[11px]">
                  <KindBadge kind={s.kind} />
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-brand-400 hover:underline truncate">
                      {s.title} — {s.section}
                    </a>
                  ) : (
                    <span className="truncate">{s.title} — {s.section}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5 list-disc pl-4 marker:text-brand-400">
        {data.claims.map((c, i) => (
          <li key={i}>
            {c.text}
            {c.refs.map(n => (
              <RefChip key={n} n={n} active={openRef === n} onClick={() => setOpenRef(openRef === n ? null : n)} />
            ))}
          </li>
        ))}
      </ul>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-1">Sources</div>
        <ul className="space-y-1.5">
          {data.sources.map(s => (
            <SourceCard key={s.ref} s={s} open={openRef === s.ref} onToggle={() => setOpenRef(openRef === s.ref ? null : s.ref)} />
          ))}
        </ul>
      </div>

      <div className="space-y-1 pt-1 border-t border-white/[0.06]">
        <Verification v={data.verification} />
        {data.disclaimer && <div className="text-[10px] text-stone-400">{data.disclaimer}</div>}
      </div>
    </div>
  )
}
