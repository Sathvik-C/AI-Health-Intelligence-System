import { useState, useEffect, useCallback } from 'react'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceArea, ResponsiveContainer
} from 'recharts'
import { Activity, TrendingUp, AlertCircle, Info, Layers } from 'lucide-react'
import api from '../utils/api'
import { format, parseISO, isValid } from 'date-fns'

// ─── Constants ────────────────────────────────────────────────────────────────

const WEARABLE_METRICS = [
  { key: 'steps',              label: 'Daily Steps',        unit: 'steps', color: '#6366f1' },
  { key: 'resting_heart_rate', label: 'Resting Heart Rate', unit: 'bpm',   color: '#f43f5e' },
  { key: 'sleep_hours',        label: 'Sleep Duration',     unit: 'hrs',   color: '#8b5cf6' },
  { key: 'active_minutes',     label: 'Active Minutes',     unit: 'min',   color: '#10b981' },
  { key: 'calories_burned',    label: 'Calories Burned',    unit: 'kcal',  color: '#f59e0b' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeDate(str) {
  try {
    const d = parseISO(str)
    return isValid(d) ? d : null
  } catch {
    return null
  }
}

function safeFormat(str, fmt = 'MMM d') {
  const d = safeDate(str)
  return d ? format(d, fmt) : str
}

/** Pearson correlation coefficient between two equal-length numeric arrays */
function pearson(xs, ys) {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, v) => a + v, 0) / n
  const my = ys.reduce((a, v) => a + v, 0) / n
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy
  }
  const denom = Math.sqrt(dx2 * dy2)
  return denom === 0 ? 0 : num / denom
}

function correlationLabel(r) {
  if (r === null) return { text: 'Insufficient shared data', color: 'text-stone-400' }
  const a = Math.abs(r)
  const dir = r > 0 ? 'positive' : 'negative'
  if (a >= 0.7) return { text: `Strong ${dir} correlation (r = ${r.toFixed(2)})`, color: r > 0 ? 'text-green-400' : 'text-red-400' }
  if (a >= 0.4) return { text: `Moderate ${dir} correlation (r = ${r.toFixed(2)})`, color: 'text-amber-400' }
  if (a >= 0.2) return { text: `Weak ${dir} correlation (r = ${r.toFixed(2)})`, color: 'text-stone-300' }
  return { text: `No meaningful correlation (r = ${r.toFixed(2)})`, color: 'text-stone-400' }
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function DualTooltip({ active, payload, label, biomarkerName, biomarkerUnit, wearableMetric }) {
  if (!active || !payload?.length) return null
  const bEntry = payload.find(p => p.dataKey === 'biomarker')
  const wEntry = payload.find(p => p.dataKey === 'wearable')
  return (
    <div className="bg-[#1a1d2e] border border-white/10 rounded-xl p-3 shadow-xl text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-stone-200 mb-2">{label}</p>
      {bEntry && bEntry.value != null && (
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: bEntry.color }} />
          <span className="text-stone-400">{biomarkerName}:</span>
          <span className="text-white font-medium ml-auto">{Number(bEntry.value).toFixed(2)} {biomarkerUnit}</span>
        </div>
      )}
      {wEntry && wEntry.value != null && (
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: wEntry.color }} />
          <span className="text-stone-400">{wearableMetric?.label}:</span>
          <span className="text-white font-medium ml-auto">{Number(wEntry.value).toFixed(1)} {wearableMetric?.unit}</span>
        </div>
      )}
    </div>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
        <Icon size={26} className="text-stone-500" />
      </div>
      <p className="text-stone-300 font-semibold text-sm">{title}</p>
      <p className="text-stone-500 text-xs max-w-xs">{body}</p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WearableOverlay() {
  const [biomarkerNames, setBiomarkerNames] = useState([])
  const [selectedBiomarker, setSelectedBiomarker] = useState('')
  const [selectedWearable, setSelectedWearable] = useState(WEARABLE_METRICS[0].key)
  const [chartData, setChartData] = useState([])
  const [refMin, setRefMin] = useState(null)
  const [refMax, setRefMax] = useState(null)
  const [biomarkerUnit, setBiomarkerUnit] = useState('')
  const [pearsonR, setPearsonR] = useState(null)
  const [sharedCount, setSharedCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [noWearable, setNoWearable] = useState(false)
  const [noBiomarker, setNoBiomarker] = useState(false)

  // Load list of biomarker names on mount
  useEffect(() => {
    api.get('/biomarkers/').then(res => {
      const data = res.data
      const names = [...new Set((Array.isArray(data) ? data : data.biomarkers ?? []).map(b => b.name).filter(Boolean))].sort()
      setBiomarkerNames(names)
      if (names.length > 0) setSelectedBiomarker(names[0])
    }).catch(() => {})
  }, [])

  // Fetch & merge data whenever selections change
  const loadData = useCallback(async () => {
    if (!selectedBiomarker) return
    setLoading(true)
    setError(null)
    setNoWearable(false)
    setNoBiomarker(false)

    try {
      const [bioRes, wearRes] = await Promise.all([
        api.get('/biomarkers/', { params: { name: selectedBiomarker } }),
        api.get('/wearable/trends', { params: { days: 365 } }),
      ])

      // --- Process biomarker data ---
      const bioRaw = Array.isArray(bioRes.data) ? bioRes.data : (bioRes.data.biomarkers ?? [])
      const bioFiltered = bioRaw.filter(b => b.name === selectedBiomarker)
      if (bioFiltered.length === 0) { setNoBiomarker(true); setLoading(false); return }

      // ref range from first entry with valid values
      const ref = bioFiltered.find(b => b.ref_min != null && b.ref_max != null)
      setRefMin(ref ? Number(ref.ref_min) : null)
      setRefMax(ref ? Number(ref.ref_max) : null)
      setBiomarkerUnit(bioFiltered[0]?.unit ?? '')

      // Map date → value (use most recent reading if multiple on same day)
      const bioMap = {}
      bioFiltered.forEach(b => {
        const d = safeDate(b.recorded_at)
        if (!d) return
        const key = format(d, 'yyyy-MM-dd')
        if (!bioMap[key] || b.recorded_at > bioMap[key].recorded_at) {
          bioMap[key] = { value: Number(b.value), recorded_at: b.recorded_at }
        }
      })

      // --- Process wearable data ---
      const wearRaw = Array.isArray(wearRes.data) ? wearRes.data : (wearRes.data.trends ?? [])
      if (wearRaw.length === 0) { setNoWearable(true); setLoading(false); return }

      const wearMap = {}
      const metric = selectedWearable
      wearRaw.forEach(w => {
        const d = safeDate(w.date)
        if (!d) return
        const key = format(d, 'yyyy-MM-dd')
        const val = w[metric]
        if (val != null) wearMap[key] = Number(val)
      })

      // --- Merge ---
      const allKeys = [...new Set([...Object.keys(bioMap), ...Object.keys(wearMap)])].sort()
      const merged = allKeys.map(key => ({
        date: key,
        dateLabel: safeFormat(key),
        biomarker: bioMap[key]?.value ?? null,
        wearable: wearMap[key] ?? null,
      }))
      setChartData(merged)

      // Pearson on shared dates
      const shared = merged.filter(d => d.biomarker != null && d.wearable != null)
      setSharedCount(shared.length)
      const r = pearson(shared.map(d => d.biomarker), shared.map(d => d.wearable))
      setPearsonR(r)
    } catch (err) {
      console.error(err)
      setError('Failed to load data. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [selectedBiomarker, selectedWearable])

  useEffect(() => { loadData() }, [loadData])

  // Derived
  const wearableMetric = WEARABLE_METRICS.find(m => m.key === selectedWearable)
  const corr = correlationLabel(pearsonR)

  // Y-axis domains with padding
  const bioValues = chartData.map(d => d.biomarker).filter(v => v != null)
  const wearValues = chartData.map(d => d.wearable).filter(v => v != null)
  const bioMin = bioValues.length ? Math.min(...bioValues) : 0
  const bioMax = bioValues.length ? Math.max(...bioValues) : 100
  const wearMin = wearValues.length ? Math.min(...wearValues) : 0
  const wearMax = wearValues.length ? Math.max(...wearValues) : 100
  const pad = (v, pct = 0.15) => v * pct

  const bioDomain = [
    Math.max(0, bioMin - pad(bioMax - bioMin || bioMin)),
    bioMax + pad(bioMax - bioMin || bioMax)
  ]
  const wearDomain = [
    Math.max(0, wearMin - pad(wearMax - wearMin || wearMin)),
    wearMax + pad(wearMax - wearMin || wearMax)
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <Layers size={16} className="text-indigo-400" />
            </div>
            <h1 className="text-xl font-bold text-white">Wearable Overlay</h1>
          </div>
          <p className="text-stone-400 text-sm pl-10">
            Lifestyle ↔ Lab Values — overlay wearable metrics with your biomarker history
          </p>
        </div>

        {/* Correlation badge */}
        {pearsonR !== null && sharedCount >= 3 && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-xs font-medium ${corr.color}`}>
            <TrendingUp size={13} />
            <span>{corr.text}</span>
          </div>
        )}
      </div>

      {/* Selectors */}
      <div className="card p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
          <label className="text-[11px] font-mono uppercase tracking-wider text-stone-400">Biomarker</label>
          <select
            value={selectedBiomarker}
            onChange={e => setSelectedBiomarker(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.1] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/30"
          >
            {biomarkerNames.map(name => (
              <option key={name} value={name} className="bg-[#1a1d2e]">{name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
          <label className="text-[11px] font-mono uppercase tracking-wider text-stone-400">Wearable Metric</label>
          <select
            value={selectedWearable}
            onChange={e => setSelectedWearable(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.1] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/30"
          >
            {WEARABLE_METRICS.map(m => (
              <option key={m.key} value={m.key} className="bg-[#1a1d2e]">{m.label} ({m.unit})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Info row */}
      {!loading && !error && chartData.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.07] text-xs text-stone-400">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <span className="font-medium text-stone-300">{selectedBiomarker}</span>
            <span>({biomarkerUnit}) — left axis</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.07] text-xs text-stone-400">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: wearableMetric?.color }} />
            <span className="font-medium text-stone-300">{wearableMetric?.label}</span>
            <span>({wearableMetric?.unit}) — right axis</span>
          </div>
          {sharedCount === 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <AlertCircle size={12} />
              No overlapping dates — showing each trend independently
            </div>
          )}
          {sharedCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.07] text-xs text-stone-400">
              <Info size={12} />
              {sharedCount} shared date{sharedCount !== 1 ? 's' : ''} used for correlation
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="card p-5">
        {loading && (
          <div className="flex items-center justify-center py-20 gap-3">
            <div className="w-5 h-5 border-2 border-brand-500/30 border-t-brand-400 rounded-full animate-spin" />
            <span className="text-stone-400 text-sm">Loading data…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-2 text-red-400 text-sm py-6 justify-center">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {!loading && !error && noBiomarker && (
          <EmptyState
            icon={Activity}
            title={`No data for "${selectedBiomarker}"`}
            body="Add biomarker readings from Add Health Records to see them here."
          />
        )}

        {!loading && !error && noWearable && (
          <EmptyState
            icon={Activity}
            title="No wearable data available"
            body="Upload wearable data from the Wearables page to enable this overlay."
          />
        )}

        {!loading && !error && !noBiomarker && !noWearable && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <defs>
                <linearGradient id="wearGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={wearableMetric?.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={wearableMetric?.color} stopOpacity={0.03} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />

              <XAxis
                dataKey="dateLabel"
                tick={{ fill: '#78716c', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                tickLine={false}
                interval="preserveStartEnd"
              />

              {/* Left Y-axis — biomarker */}
              <YAxis
                yAxisId="left"
                orientation="left"
                domain={bioDomain}
                tick={{ fill: '#78716c', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                tickLine={false}
                tickFormatter={v => Number(v).toFixed(1)}
                label={{ value: biomarkerUnit, angle: -90, position: 'insideLeft', fill: '#78716c', fontSize: 10, dy: 20 }}
              />

              {/* Right Y-axis — wearable */}
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={wearDomain}
                tick={{ fill: '#78716c', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                tickLine={false}
                tickFormatter={v => wearableMetric?.unit === 'steps' ? (v / 1000).toFixed(1) + 'k' : Number(v).toFixed(1)}
                label={{ value: wearableMetric?.unit, angle: 90, position: 'insideRight', fill: '#78716c', fontSize: 10, dy: -20 }}
              />

              {/* Normal zone for biomarker */}
              {refMin != null && refMax != null && (
                <ReferenceArea
                  yAxisId="left"
                  y1={refMin}
                  y2={refMax}
                  fill="rgba(16,185,129,0.07)"
                  stroke="rgba(16,185,129,0.15)"
                  strokeDasharray="4 2"
                />
              )}

              {/* Wearable Area */}
              <Area
                yAxisId="right"
                dataKey="wearable"
                name={wearableMetric?.label}
                stroke={wearableMetric?.color}
                strokeWidth={2}
                fill="url(#wearGrad)"
                dot={false}
                connectNulls
                activeDot={{ r: 4, strokeWidth: 0 }}
              />

              {/* Biomarker Line */}
              <Line
                yAxisId="left"
                dataKey="biomarker"
                name={selectedBiomarker}
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#38bdf8', strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls
              />

              <Tooltip
                content={
                  <DualTooltip
                    biomarkerName={selectedBiomarker}
                    biomarkerUnit={biomarkerUnit}
                    wearableMetric={wearableMetric}
                  />
                }
              />

              <Legend
                wrapperStyle={{ fontSize: 12, color: '#a8a29e', paddingTop: 12 }}
                formatter={(value) => <span style={{ color: '#a8a29e' }}>{value}</span>}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Insight card */}
      {!loading && pearsonR !== null && sharedCount >= 3 && (
        <div className="card p-4 border-l-4 border-indigo-500/50">
          <div className="flex items-start gap-3">
            <TrendingUp size={18} className="text-indigo-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Correlation Insight</p>
              <p className="text-xs text-stone-300 leading-relaxed">
                {pearsonR > 0.4
                  ? `Higher ${wearableMetric?.label} tends to associate with elevated ${selectedBiomarker} levels (r = ${pearsonR.toFixed(2)}).`
                  : pearsonR < -0.4
                    ? `Higher ${wearableMetric?.label} tends to associate with lower ${selectedBiomarker} levels (r = ${pearsonR.toFixed(2)}), suggesting a protective relationship.`
                    : `No strong linear relationship detected between ${wearableMetric?.label} and ${selectedBiomarker} (r = ${pearsonR.toFixed(2)}).`
                }
                {' '}Based on <strong>{sharedCount}</strong> overlapping data point{sharedCount !== 1 ? 's' : ''}.
              </p>
              <p className="text-[10px] text-stone-500 mt-1">
                Informational only — not a medical diagnosis or clinical advice.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No shared dates note */}
      {!loading && !error && chartData.length > 0 && sharedCount === 0 && (
        <div className="card p-4 border-l-4 border-amber-500/40">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-200">No Overlapping Dates</p>
              <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                Your biomarker records and wearable data cover different time ranges. Both trends are shown
                independently on the same chart. Correlation analysis requires at least 3 dates in common.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

