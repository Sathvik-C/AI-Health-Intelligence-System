import { useState } from 'react'
import { Pill, Dna, ChevronDown, ExternalLink, FlaskConical } from 'lucide-react'
import { LevelBadge, EmptyNote, pretty } from './ui'

const RANK = { high: 0, moderate: 1, info: 2, ok: 3, none: 3 }
const SUMMARY = { high: 'Discuss soon', moderate: 'Check with doctor', info: 'FYI', ok: 'No issues', none: 'No issues' }
const resultText = (r) => pretty(r).replace('metabolizer', 'metaboliser')

function MedicineRow({ med, checks }) {
  const [open, setOpen] = useState(checks.some(c => c.severity === 'high' || c.severity === 'moderate'))
  const worst = checks.reduce((w, c) => (RANK[c.severity] < RANK[w] ? c.severity : w), 'ok')
  return (
    <li className="py-1">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center gap-3 py-2 text-left">
        <Pill size={15} className="text-stone-400 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="text-[13px] font-medium text-stone-100">{med.drug_name}</span>
          {med.dosage && <span className="text-xs text-stone-500"> · {med.dosage}</span>}
          <span className="block text-[11px] text-stone-500">
            {checks.length ? `${checks.length} check${checks.length > 1 ? 's' : ''}` : 'No gene or lab checks apply'}
          </span>
        </span>
        {checks.length > 0 && <LevelBadge level={worst} label={SUMMARY[worst]} />}
        {checks.length > 0 && <ChevronDown size={14} className={`text-stone-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && checks.length > 0 && (
        <ul className="ml-7 mb-2 space-y-2">
          {checks.map((c, i) => (
            <li key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-stone-300 flex items-center gap-1.5">
                  {c.kind === 'gene' ? <Dna size={12} /> : <FlaskConical size={12} />} {c.label}
                </span>
                <LevelBadge level={c.severity} />
              </div>
              <p className="text-xs text-stone-400 leading-relaxed mt-1">{c.text}</p>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function MedicinesSection({ report, onEditProfile }) {
  const meds = report.current_medicines || []
  const pgx = report.pharmacogenomics
  const byDrug = {}
  pgx.interactions.forEach(i => (byDrug[i.drug] ||= []).push({
    kind: 'gene', severity: i.severity, label: `Gene ${i.gene} · ${resultText(i.result)}`, text: i.recommendation,
  }))
  report.drug_lab_checks.forEach(c => (byDrug[c.drug] ||= []).push({
    kind: 'lab', severity: c.severity, label: c.lab, text: c.message,
  }))
  const sorted = [...meds].sort((a, b) => {
    const wa = Math.min(...(byDrug[a.drug_name] || [{ severity: 'none' }]).map(c => RANK[c.severity]))
    const wb = Math.min(...(byDrug[b.drug_name] || [{ severity: 'none' }]).map(c => RANK[c.severity]))
    return wa - wb
  })

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-400">
        Each current medicine checked against your <span className="text-stone-200">lab results</span> and, if entered, your <span className="text-stone-200">genes</span>.
      </p>
      <section className="card p-4">
        {meds.length ? (
          <ul className="divide-y divide-white/[0.06] -my-1">
            {sorted.map(m => <MedicineRow key={m.drug_name} med={m} checks={byDrug[m.drug_name] || []} />)}
          </ul>
        ) : (
          <EmptyNote>No current medicines. Add them on the <a href="/medicines" className="text-brand-400">Medicines</a> page.</EmptyNote>
        )}
      </section>

      {pgx.testing_opportunities.length > 0 && (
        <section className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-start gap-3">
            <Dna size={16} className="text-sky-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-white">A one-time gene test could personalise your medicines</p>
              <p className="text-xs text-stone-400 mt-0.5">
                {pgx.testing_opportunities.map(o => `${o.gene} (for ${o.drug})`).join(' · ')}
              </p>
            </div>
          </div>
          <button onClick={onEditProfile} className="btn-secondary text-[11px] px-3 py-1.5 shrink-0">I have results</button>
        </section>
      )}

      <p className="text-[10px] text-stone-500 leading-relaxed">
        Gene rules from <a href="https://cpicpgx.org/guidelines/" target="_blank" rel="noreferrer" className="underline hover:text-brand-400">CPIC</a>.
        {' '}Never start, stop or change a medicine without your doctor.
      </p>
    </div>
  )
}
