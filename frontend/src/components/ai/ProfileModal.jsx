import { useEffect, useState } from 'react'
import { X, Loader, Save, Wand2, Dna, AlertTriangle, ChevronDown } from 'lucide-react'
import api from '../../utils/api'
import { pretty } from './ui'

const EMPTY = {
  date_of_birth: '', sex: '', height_cm: '', weight_kg: '', waist_cm: '', ancestry: '', smoking_status: '',
  alcohol_use: '', physical_activity: '', parents_with_diabetes: '', family_history_premature_ascvd: '',
  known_conditions: [], on_bp_treatment: '', pgx_results: {},
}

const SELECTS = {
  sex: ['male', 'female'],
  ancestry: ['south_asian', 'east_asian', 'african', 'european', 'hispanic', 'middle_eastern', 'other'],
  smoking_status: ['never', 'former', 'current'],
  alcohol_use: ['none', 'occasional', 'regular'],
  physical_activity: ['vigorous', 'moderate', 'mild', 'sedentary'],
}
const ACTIVITY_HELP = {
  vigorous: 'regular vigorous exercise or strenuous work',
  moderate: 'regular moderate exercise or moderately active work',
  mild: 'occasional / light activity',
  sedentary: 'no exercise, desk-bound',
}

// Convert API profile (nulls) <-> form state (empty strings)
const toForm = (p) => {
  const f = { ...EMPTY }
  Object.keys(EMPTY).forEach(k => {
    const v = p?.[k]
    if (v === null || v === undefined) return
    f[k] = typeof v === 'boolean' ? String(v) : v
  })
  f.known_conditions = p?.known_conditions || []
  f.pgx_results = p?.pgx_results || {}
  return f
}
const num = (v) => (v === '' || v === null ? null : Number(v))
const bool = (v) => (v === '' ? null : v === 'true')
const toPayload = (f) => ({
  date_of_birth: f.date_of_birth || null,
  sex: f.sex || null,
  height_cm: num(f.height_cm), weight_kg: num(f.weight_kg), waist_cm: num(f.waist_cm),
  ancestry: f.ancestry || null, smoking_status: f.smoking_status || null, alcohol_use: f.alcohol_use || null,
  physical_activity: f.physical_activity || null,
  parents_with_diabetes: f.parents_with_diabetes === '' ? null : Number(f.parents_with_diabetes),
  family_history_premature_ascvd: bool(f.family_history_premature_ascvd),
  known_conditions: f.known_conditions,
  on_bp_treatment: bool(f.on_bp_treatment),
  pgx_results: Object.fromEntries(Object.entries(f.pgx_results).filter(([, v]) => v)),
})

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-stone-500 mt-1 block">{hint}</span>}
    </label>
  )
}

function Select({ value, onChange, options, placeholder = 'Not set', labelFor = pretty }) {
  return (
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{labelFor(o)}</option>)}
    </select>
  )
}

export default function ProfileModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY)
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPgx, setShowPgx] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    api.get('/profile/')
      .then(r => { setForm(toForm(r.data.profile)); setMeta(r.data) })
      .catch(e => setError(e.response?.data?.detail || 'Could not load profile'))
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))
  const sug = meta?.suggestions || {}
  const canApply = (sug.date_of_birth && !form.date_of_birth) || (sug.sex && !form.sex)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await api.put('/profile/', toPayload(form))
      onSaved?.()
      onClose()
    } catch (e) {
      const d = e.response?.data?.detail
      setError(Array.isArray(d) ? d.map(x => `${x.loc?.slice(-1)[0]}: ${x.msg}`).join('; ') : (d || 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  const toggleCondition = (c) => setForm(f => ({
    ...f,
    known_conditions: f.known_conditions.includes(c) ? f.known_conditions.filter(x => x !== c) : [...f.known_conditions, c],
  }))

  const pgxCount = Object.values(form.pgx_results || {}).filter(Boolean).length
  const SectionTitle = ({ n, children, hint }) => (
    <div className="flex items-baseline gap-2 mb-2.5">
      <span className="text-[10px] font-mono text-brand-400">{n}</span>
      <h3 className="text-[13px] font-semibold text-white">{children}</h3>
      {hint && <span className="text-[11px] text-stone-500">{hint}</span>}
    </div>
  )

  return (
    <div className="fixed inset-0 !m-0 z-50 flex items-end md:items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm md:p-8" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-t-2xl md:rounded-2xl border border-white/[0.1] bg-[#121520] shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Your health profile</h2>
            <p className="text-[11px] text-stone-400">Makes the risk checks personal. Skip anything you're unsure of.</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-white p-1" aria-label="Close"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-stone-400 text-sm flex items-center justify-center gap-2"><Loader size={15} className="animate-spin" /> Loading…</div>
        ) : (
          <div className="px-5 py-4 space-y-5 overflow-y-auto">
            {canApply && (
              <div className="rounded-xl px-3 py-2.5 bg-sky-500/10 border border-sky-500/20 flex items-center justify-between gap-2">
                <p className="text-[11px] text-sky-300">
                  From your lab report: {sug.date_of_birth && <>born <b>{sug.date_of_birth}</b></>}{sug.date_of_birth && sug.sex && ', '}{sug.sex && <b>{sug.sex}</b>}
                </p>
                <button className="btn-secondary text-[11px] px-2.5 py-1 shrink-0" onClick={() => setForm(f => ({
                  ...f, date_of_birth: f.date_of_birth || sug.date_of_birth || '', sex: f.sex || sug.sex || '',
                }))}><Wand2 size={12} /> Use</button>
              </div>
            )}

            <div>
              <SectionTitle n="01">About you</SectionTitle>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Date of birth"><input type="date" className="input" value={form.date_of_birth} onChange={e => set('date_of_birth')(e.target.value)} /></Field>
                <Field label="Sex"><Select value={form.sex} onChange={set('sex')} options={SELECTS.sex} /></Field>
                <Field label="Ancestry"><Select value={form.ancestry} onChange={set('ancestry')} options={SELECTS.ancestry} /></Field>
                <Field label="Height (cm)"><input type="number" inputMode="decimal" className="input" value={form.height_cm} onChange={e => set('height_cm')(e.target.value)} /></Field>
                <Field label="Weight (kg)"><input type="number" inputMode="decimal" step="0.1" className="input" value={form.weight_kg} onChange={e => set('weight_kg')(e.target.value)} /></Field>
                <Field label="Waist (cm)" hint="At the navel"><input type="number" inputMode="decimal" className="input" value={form.waist_cm} onChange={e => set('waist_cm')(e.target.value)} /></Field>
              </div>
            </div>

            <div>
              <SectionTitle n="02">Lifestyle</SectionTitle>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Smoking"><Select value={form.smoking_status} onChange={set('smoking_status')} options={SELECTS.smoking_status} /></Field>
                <Field label="Alcohol"><Select value={form.alcohol_use} onChange={set('alcohol_use')} options={SELECTS.alcohol_use} /></Field>
                <Field label="Activity" hint={ACTIVITY_HELP[form.physical_activity]}>
                  <Select value={form.physical_activity} onChange={set('physical_activity')} options={SELECTS.physical_activity} />
                </Field>
              </div>
            </div>

            <div>
              <SectionTitle n="03">Family & health history</SectionTitle>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <Field label="Parents with diabetes"><Select value={String(form.parents_with_diabetes)} onChange={set('parents_with_diabetes')} options={['0', '1', '2']} labelFor={v => ({ 0: 'None', 1: 'One', 2: 'Both' }[v])} /></Field>
                <Field label="Early heart disease in family" hint="Men <55, women <65"><Select value={form.family_history_premature_ascvd} onChange={set('family_history_premature_ascvd')} options={['true', 'false']} labelFor={v => (v === 'true' ? 'Yes' : 'No')} /></Field>
                <Field label="On BP medicine?"><Select value={form.on_bp_treatment} onChange={set('on_bp_treatment')} options={['true', 'false']} placeholder="Auto-detect" labelFor={v => (v === 'true' ? 'Yes' : 'No')} /></Field>
              </div>
              <span className="label">Conditions you have</span>
              <div className="flex flex-wrap gap-1.5">
                {(meta?.options?.conditions || []).map(c => {
                  const on = form.known_conditions.includes(c)
                  return (
                    <button key={c} type="button" onClick={() => toggleCondition(c)} aria-pressed={on}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${on ? 'bg-brand-500 border-brand-500 text-white' : 'border-white/10 text-stone-400 hover:text-stone-200'}`}>
                      {pretty(c)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08]">
              <button type="button" onClick={() => setShowPgx(v => !v)} aria-expanded={showPgx}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-left">
                <span className="flex items-center gap-2">
                  <Dna size={14} className="text-brand-400" />
                  <span className="text-[13px] font-semibold text-white">Genetic test results</span>
                  <span className="text-[11px] text-stone-500">optional{pgxCount ? ` · ${pgxCount} entered` : ''}</span>
                </span>
                <ChevronDown size={15} className={`text-stone-500 transition-transform ${showPgx ? 'rotate-180' : ''}`} />
              </button>
              {showPgx && (
                <div className="px-3.5 pb-3.5 space-y-3">
                  <p className="text-[11px] text-stone-500">Only if you have a pharmacogenomic (PGx) report. Leave the rest as "Not tested".</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(meta?.options?.pgx_genes || []).map(g => (
                      <Field key={g.gene} label={g.gene}>
                        <Select value={form.pgx_results[g.gene] || ''} placeholder="Not tested"
                          onChange={v => setForm(f => ({ ...f, pgx_results: { ...f.pgx_results, [g.gene]: v } }))}
                          options={g.values} labelFor={v => pretty(v).replace('metabolizer', 'metaboliser')} />
                      </Field>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-white/[0.07] shrink-0">
          {error ? <p className="text-[11px] text-rose-400 flex items-center gap-1.5"><AlertTriangle size={12} /> {error}</p> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-xs px-4">Cancel</button>
            <button onClick={save} disabled={saving || loading} className="btn-primary text-xs px-4">
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
