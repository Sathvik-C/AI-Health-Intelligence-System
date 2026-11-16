import { useState } from 'react'
import { Lock, ChevronRight, Ruler, HeartPulse, Sparkles, ExternalLink, Info, Calculator } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts'
import { Accordion, CALC_META, LevelBadge, Sheet, TriState, fmtDate, pretty } from './ui'
import { InsightRow } from './OverviewSection'

const CHART_REFS = { egfr: [90, 60], fib4: [1.3, 2.67] }

function MiniChart({ calc }) {
  if (!calc.series || calc.series.length < 2) return null
  const hasLab = calc.series.some(p => p.lab_reported != null)
  const data = calc.series.map(p => ({ ...p, d: fmtDate(p.date) }))
  return (
    <div>
      <div className="h-32 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="d" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ background: '#161a29', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 11 }} />
            {(CHART_REFS[calc.id] || []).map(y => <ReferenceLine key={y} y={y} stroke="rgba(245,158,11,0.45)" strokeDasharray="4 3" />)}
            <Line type="monotone" dataKey="value" name="Calculated for you" stroke="#f97316" strokeWidth={2} dot={{ r: 2.5 }} />
            {hasLab && <Line type="monotone" dataKey="lab_reported" name="Printed by lab" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-stone-500 flex gap-3">
        <span><span className="inline-block w-3 border-t-2 border-brand-500 align-middle mr-1" />Calculated for you</span>
        {hasLab && <span><span className="inline-block w-3 border-t-2 border-dashed border-stone-500 align-middle mr-1" />Printed by lab</span>}
      </p>
    </div>
  )
}

const TILE_LABEL = { ok: 'Good', watch: 'Watch', act: 'Discuss soon', info: 'FYI' }

function Tile({ calc, onOpen, onUnlock }) {
  const meta = CALC_META[calc.id] || { title: calc.name, tech: '' }
  if (calc.status === 'insufficient_data') {
    const miss = calc.missing || []
    return (
      <button onClick={miss.length ? onUnlock : onOpen} className="card p-3.5 text-left border-dashed opacity-80 hover:opacity-100 transition-opacity">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-semibold text-stone-300">{meta.title}</span>
          <Lock size={13} className="text-stone-500 shrink-0" />
        </div>
        <p className="text-[11px] text-stone-500 mt-2 leading-snug">
          {miss.length ? <>Needs {miss.slice(0, 2).join(', ')}{miss.length > 2 ? ` +${miss.length - 2}` : ''}</> : calc.why}
        </p>
        {miss.length > 0 && <span className="text-[11px] text-brand-400 mt-1.5 inline-block">Add to profile →</span>}
      </button>
    )
  }
  return (
    <button onClick={onOpen} className="card card-hover p-3.5 text-left group">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-stone-200 leading-snug">{meta.title}</span>
        <LevelBadge level={calc.level} label={TILE_LABEL[calc.level]} />
      </div>
      <div className="flex items-baseline gap-1 mt-2">
        <span className="text-2xl font-bold font-mono text-white tracking-tight">{calc.value}</span>
        <span className="text-[11px] text-stone-500">{calc.unit}</span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="text-[11px] text-stone-400 line-clamp-1">{calc.category}</span>
        <ChevronRight size={13} className="text-stone-600 group-hover:text-brand-400 shrink-0" />
      </div>
    </button>
  )
}

function CalcDetail({ calc }) {
  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-extrabold font-mono text-white">{calc.value}</span>
          <span className="text-xs text-stone-400">{calc.unit}</span>
        </div>
        <LevelBadge level={calc.level} label={TILE_LABEL[calc.level]} />
      </div>
      <p className="text-sm font-semibold text-stone-200 -mt-2">{calc.category}</p>
      <MiniChart calc={calc} />
      {calc.components && (
        <ul className="space-y-1.5">
          {calc.components.map(c => (
            <li key={c.label} className="flex items-start gap-2 text-xs">
              <TriState value={c.present} />
              <span className="text-stone-300">{c.label}<span className="text-stone-500"> — {c.detail}</span></span>
            </li>
          ))}
        </ul>
      )}
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">What this means</p>
        <p className="text-[13px] text-stone-300 leading-relaxed">{calc.plain_language}</p>
      </div>
      {calc.note && (
        <div className="flex gap-2 text-xs leading-relaxed rounded-lg p-3 bg-sky-500/10 border border-sky-500/20 text-sky-300">
          <Info size={14} className="shrink-0 mt-0.5" /> <span>{calc.note}</span>
        </div>
      )}
      {calc.why_personal && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Why it's personal to you</p>
          <p className="text-xs text-stone-300">{calc.why_personal}</p>
        </div>
      )}
      <Accordion title="How it's calculated" icon={Calculator}>
        {calc.inputs && (
          <table className="w-full text-[11px] mb-2">
            <tbody className="divide-y divide-white/[0.05]">
              {calc.inputs.map((inp, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-2 text-stone-400 align-top">{inp.label}</td>
                  <td className="py-1.5 text-right font-mono text-stone-200">
                    {typeof inp.value === 'boolean' ? (inp.value ? 'Yes' : 'No') : pretty(inp.value)} {inp.unit}
                    {inp.date && <span className="text-stone-500"> · {fmtDate(inp.date)}</span>}
                    {inp.note && <span className="block text-[10px] text-stone-500 font-sans">{inp.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[10px] font-mono text-stone-500 leading-relaxed">{calc.formula}</p>
        <ul className="mt-2 space-y-1">
          {(calc.sources || []).map((s, i) => (
            <li key={i} className="text-[10px] text-stone-500">
              <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-brand-400 inline-flex items-start gap-1">
                <ExternalLink size={10} className="mt-0.5 shrink-0" /> {s.label}
              </a>
            </li>
          ))}
        </ul>
      </Accordion>
    </>
  )
}

export default function RiskSection({ report, insights, factsById, onEditProfile }) {
  const [openId, setOpenId] = useState(null)
  const calcs = report.calculators
  const ready = calcs.filter(c => c.status !== 'insufficient_data')
  const locked = calcs.filter(c => c.status === 'insufficient_data')
  const open = calcs.find(c => c.id === openId)
  const thresholds = report.personalised_thresholds
  const differs = thresholds.filter(t => t.status !== 'ok').length
  const enh = report.risk_enhancers
  const present = enh.filter(e => e.present === true).length
  const notes = insights?.precision_insights || []

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-stone-400">
          Standard medical formulas recalculated with <span className="text-stone-200">your</span> age, sex, ancestry and history. Tap a card for details.
        </p>
        <button onClick={onEditProfile} className="text-[11px] text-brand-400 hover:text-brand-300 shrink-0">Edit profile</button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[...ready, ...locked].map(c => (
          <Tile key={c.id} calc={c} onOpen={() => setOpenId(c.id)} onUnlock={onEditProfile} />
        ))}
      </div>

      <div className="space-y-2.5">
        <Accordion
          title="Your thresholds vs. standard lab ranges"
          icon={Ruler}
          meta={<span className="text-[11px] text-stone-500">{differs ? `${differs} to watch` : 'all OK'}</span>}
        >
          {thresholds.length ? (
            <ul className="divide-y divide-white/[0.06]">
              {thresholds.map(t => (
                <li key={t.marker} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-stone-100 font-medium">{t.marker} <span className="font-mono text-stone-300 font-normal">· {t.your_value}</span></p>
                    <p className="text-[11px] text-stone-400 mt-0.5">For you: {t.personal_threshold}</p>
                    <p className="text-[11px] text-stone-500">Lab printed: {t.lab_range}</p>
                  </div>
                  <LevelBadge level={t.status === 'ok' ? 'ok' : 'watch'} label={t.status === 'ok' ? 'OK' : t.status === 'above' ? 'Above' : 'Below'} />
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-stone-500">Add your sex and ancestry to see personal thresholds.</p>}
          {report.derived?.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-3">
              {report.derived.map(d => (
                <span key={d.id} title={d.plain_language} className="text-[11px] px-2.5 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-stone-300">
                  {d.label}: <b className="font-mono text-white">{d.value}</b> {d.unit}
                </span>
              ))}
            </div>
          )}
        </Accordion>

        <Accordion
          title="Things that raise heart risk"
          icon={HeartPulse}
          meta={<span className="text-[11px] text-stone-500">{present} of {enh.length} present</span>}
        >
          <p className="text-[11px] text-stone-500 mb-2">From the 2018 AHA/ACC guideline. These can make your real risk higher than the 10-year estimate.</p>
          <ul className="space-y-1.5">
            {[...enh].sort((a, b) => (b.present === true) - (a.present === true)).map(e => (
              <li key={e.label} className="flex items-start gap-2 text-xs">
                <TriState value={e.present} />
                <span className={e.present ? 'text-stone-100' : 'text-stone-400'}>
                  {e.label}<span className="text-stone-500"> — {e.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-stone-500 mt-2 flex gap-3">
            <span className="inline-flex items-center gap-1"><TriState value={true} /> present</span>
            <span className="inline-flex items-center gap-1"><TriState value={false} /> absent</span>
            <span className="inline-flex items-center gap-1"><TriState value={null} /> unknown</span>
          </p>
        </Accordion>

        {notes.length > 0 && (
          <Accordion title="AI notes on your personal results" icon={Sparkles} meta={<span className="text-[11px] text-stone-500">{notes.length}</span>}>
            <ul className="divide-y divide-white/[0.06]">
              {notes.map((n, i) => <InsightRow key={i} item={n} level="info" factsById={factsById} />)}
            </ul>
          </Accordion>
        )}
      </div>

      <Sheet
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        title={open ? (CALC_META[open.id]?.title || open.name) : ''}
        subtitle={open ? CALC_META[open.id]?.tech : ''}
      >
        {open && <CalcDetail calc={open} />}
      </Sheet>
    </div>
  )
}
