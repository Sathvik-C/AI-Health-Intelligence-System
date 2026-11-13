import { useState, useEffect, useMemo } from 'react'
import api from '../utils/api'
import {
  Network,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowRight,
  Info,
  Sparkles,
  RefreshCw,
  Sliders,
  Maximize2,
  HelpCircle,
  FlaskConical,
  Check,
} from 'lucide-react'
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { format } from 'date-fns'
import SkeletonLoader from '../components/SkeletonLoader'
import EmptyState from '../components/EmptyState'

// Preset categories
const PRESETS = {
  all: {
    label: 'All Top Biomarkers',
    filter: null, // use top 10-12
  },
  metabolic: {
    label: 'Metabolic & Lipids',
    patterns: [/glucose/i, /hba1c/i, /cholesterol/i, /triglyceride/i, /hdl/i, /ldl/i, /vldl/i, /sugar/i, /insulin/i],
  },
  organ: {
    label: 'Renal & Hepatic',
    patterns: [/creatinine/i, /bun/i, /urea/i, /egfr/i, /alt/i, /ast/i, /sgpt/i, /sgot/i, /bilirubin/i, /albumin/i, /uric/i],
  },
  hematology: {
    label: 'Blood & Inflammation',
    patterns: [/hemoglobin/i, /platelet/i, /wbc/i, /rbc/i, /crp/i, /esr/i, /ferritin/i, /iron/i],
  },
}

function getCorrelationColor(r) {
  if (r == null) return { bg: 'rgba(255, 255, 255, 0.02)', text: '#64748b', border: 'rgba(255, 255, 255, 0.04)' }
  if (r >= 0.7) {
    return { bg: 'rgba(16, 185, 129, 0.35)', text: '#34d399', border: 'rgba(16, 185, 129, 0.5)' }
  } else if (r >= 0.35) {
    return { bg: 'rgba(16, 185, 129, 0.16)', text: '#6ee7b7', border: 'rgba(16, 185, 129, 0.28)' }
  } else if (r <= -0.7) {
    return { bg: 'rgba(244, 63, 94, 0.35)', text: '#fb7185', border: 'rgba(244, 63, 94, 0.5)' }
  } else if (r <= -0.35) {
    return { bg: 'rgba(244, 63, 94, 0.16)', text: '#fda4af', border: 'rgba(244, 63, 94, 0.28)' }
  } else {
    return { bg: 'rgba(255, 255, 255, 0.03)', text: '#94a3b8', border: 'rgba(255, 255, 255, 0.06)' }
  }
}

function getCorrelationBadge(r) {
  if (r == null) return { label: 'Insufficient Data', badgeClass: 'risk-blue' }
  if (r >= 0.7) return { label: 'Strong Positive', badgeClass: 'risk-green', color: '#10b981' }
  if (r >= 0.35) return { label: 'Moderate Positive', badgeClass: 'risk-green', color: '#34d399' }
  if (r <= -0.7) return { label: 'Strong Inverse', badgeClass: 'risk-red', color: '#f43f5e' }
  if (r <= -0.35) return { label: 'Moderate Inverse', badgeClass: 'risk-yellow', color: '#f59e0b' }
  return { label: 'Neutral / Independent', badgeClass: 'risk-blue', color: '#94a3b8' }
}

// Custom tooltip for scatter plot
function ScatterTooltip({ active, payload, nameA, unitA, nameB, unitB }) {
  if (!active || !payload || !payload.length) return null
  const pt = payload[0]?.payload
  return (
    <div className="card p-3 shadow-xl border border-white/20" style={{ background: '#161a29', minWidth: 170 }}>
      <p className="text-[10px] font-mono text-stone-400 mb-1">{pt.date}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-stone-300 truncate max-w-[120px]">{nameA}:</span>
          <span className="font-mono font-bold text-brand-400">{pt.x} {unitA}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-stone-300 truncate max-w-[120px]">{nameB}:</span>
          <span className="font-mono font-bold text-sky-400">{pt.y} {unitB}</span>
        </div>
      </div>
    </div>
  )
}

export default function BiomarkerCorrelations() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [selectedPreset, setSelectedPreset] = useState('all')
  const [activePair, setActivePair] = useState(null)
  const [hoveredCell, setHoveredCell] = useState(null)
  const [customSelected, setCustomSelected] = useState([])
  const [showCustomModal, setShowCustomModal] = useState(false)

  const loadCorrelations = async (namesList = null) => {
    setLoading(true)
    try {
      const params = namesList && namesList.length > 0 ? { names: namesList.join(',') } : {}
      const res = await api.get('/biomarkers/correlations', { params })
      setData(res.data)

      // Auto-select first strong correlation pair if not set
      if (res.data?.top_correlations?.length > 0) {
        const top = res.data.top_correlations[0]
        setActivePair({
          nameA: top.biomarker_a,
          unitA: top.unit_a,
          nameB: top.biomarker_b,
          unitB: top.unit_b,
          r: top.r,
          sampleSize: top.sample_size,
          explanation: top.explanation,
          relationship: top.relationship,
          points: top.points,
        })
      } else if (res.data?.biomarkers?.length >= 2) {
        const nameA = res.data.biomarkers[0].name
        const nameB = res.data.biomarkers[1].name
        const cell = res.data.matrix?.[nameA]?.[nameB]
        setActivePair({
          nameA,
          unitA: res.data.biomarkers[0].unit,
          nameB,
          unitB: res.data.biomarkers[1].unit,
          r: cell?.r,
          sampleSize: cell?.sample_size,
          points: cell?.points || [],
        })
      }
    } catch (e) {
      console.error('Error fetching correlations:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCorrelations()
  }, [])

  // Handle Preset change
  const handlePresetSelect = (key) => {
    setSelectedPreset(key)
    if (key === 'all') {
      loadCorrelations()
    } else {
      const preset = PRESETS[key]
      if (preset && data?.all_available_names) {
        const filtered = data.all_available_names
          .filter(b => preset.patterns.some(p => p.test(b.name)))
          .map(b => b.name)
        if (filtered.length >= 2) {
          loadCorrelations(filtered)
        } else {
          loadCorrelations()
        }
      }
    }
  }

  // Handle Cell Click
  const handleCellClick = (nameA, nameB) => {
    if (!data?.matrix?.[nameA]?.[nameB]) return
    const cell = data.matrix[nameA][nameB]
    const unitA = data.biomarkers.find(b => b.name === nameA)?.unit || ''
    const unitB = data.biomarkers.find(b => b.name === nameB)?.unit || ''
    const badge = getCorrelationBadge(cell.r)

    let explanation = ''
    if (cell.r >= 0.7) {
      explanation = `When ${nameA} increases, ${nameB} demonstrates a strong tendency to increase alongside it.`
    } else if (cell.r >= 0.35) {
      explanation = `${nameA} and ${nameB} show a moderate positive co-directional movement across test reports.`
    } else if (cell.r <= -0.7) {
      explanation = `When ${nameA} increases, ${nameB} shows a strong inverse trend, decreasing systematically.`
    } else if (cell.r <= -0.35) {
      explanation = `${nameA} and ${nameB} exhibit a moderate inverse relationship.`
    } else if (cell.r != null) {
      explanation = `${nameA} and ${nameB} show no significant directional correlation in your recorded history.`
    }

    setActivePair({
      nameA,
      unitA,
      nameB,
      unitB,
      r: cell.r,
      sampleSize: cell.sample_size,
      explanation,
      relationship: badge.label,
      points: cell.points || [],
    })
  }

  // Top correlations list
  const topCorrelations = data?.top_correlations || []
  const biomarkersList = data?.biomarkers || []
  const totalReports = data?.total_reports_analyzed || 0

  if (loading && !data) {
    return (
      <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
        <div className="h-8 w-64 bg-white/5 rounded animate-pulse" />
        <SkeletonLoader rows={5} />
      </div>
    )
  }

  if (!data || biomarkersList.length < 2) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
        <div className="border-b border-white/[0.07] pb-5">
          <h1 className="text-2xl font-bold text-white tracking-tight">Biomarker Correlation Heatmap</h1>
          <p className="text-sm text-stone-400 mt-1">Cross-marker physiological co-movement analysis</p>
        </div>
        <EmptyState
          icon={Network}
          title="Insufficient Longitudinal Data"
          description="Cross-biomarker correlation analysis requires at least 3 uploaded laboratory reports with shared biomarkers to calculate meaningful statistical associations."
          action={() => window.location.href = '/add-records'}
          actionLabel="Upload Laboratory Report"
        />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.07] pb-5">
        <div>
          <div className="flex items-center gap-2 text-brand-400 text-xs font-mono font-medium tracking-wider uppercase mb-1">
            <Network size={14} /> Physiological Associations Intelligence
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Biomarker Correlation Heatmap</h1>
          <p className="text-sm text-stone-400 mt-1">
            Discover which biomarkers move in tandem or inverse directions across your personal health history.
          </p>
        </div>

        {/* Quick Stats Badges */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="card px-3.5 py-2 text-center border-white/[0.08]">
            <div className="text-[10px] text-stone-400 font-mono uppercase tracking-wider">Reports Analyzed</div>
            <div className="text-lg font-bold font-mono text-white leading-tight">{totalReports}</div>
          </div>
          <div className="card px-3.5 py-2 text-center border-brand-500/20 bg-brand-500/5">
            <div className="text-[10px] text-brand-400 font-mono uppercase tracking-wider">Associations</div>
            <div className="text-lg font-bold font-mono text-brand-400 leading-tight">{topCorrelations.length}</div>
          </div>
          <button
            onClick={() => loadCorrelations()}
            className="btn-secondary text-xs px-3 py-2"
            title="Refresh Correlations"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Preset Category Pills & Info Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(PRESETS).map(([key, config]) => (
            <button
              key={key}
              onClick={() => handlePresetSelect(key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                selectedPreset === key
                  ? 'bg-brand-500 border-brand-500 text-white shadow-glow-brand'
                  : 'border-white/10 text-stone-400 hover:border-white/20 hover:text-stone-200 bg-white/[0.02]'
              }`}
            >
              {config.label}
            </button>
          ))}
        </div>

        {/* Color Legend Pill */}
        <div className="flex items-center gap-2 text-[11px] font-mono text-stone-400 bg-white/[0.02] border border-white/[0.05] px-3 py-1.5 rounded-lg">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
            Inverse (r &lt; -0.35)
          </span>
          <span className="text-stone-600">|</span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-stone-700" />
            Neutral
          </span>
          <span className="text-stone-600">|</span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            Positive (r &gt; +0.35)
          </span>
        </div>
      </div>

      {/* Main Grid: Heatmap Matrix + Scatter Plot Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Heatmap Matrix Card */}
        <div className="xl:col-span-7 card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <Network size={16} className="text-brand-400" /> Pearson Correlation Matrix
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Click any cell to inspect scatter points and clinical relationship
              </p>
            </div>
            {hoveredCell && (
              <div className="text-right text-xs font-mono">
                <span className="text-stone-300 font-semibold">{hoveredCell.nameA}</span>
                <span className="text-stone-500"> × </span>
                <span className="text-stone-300 font-semibold">{hoveredCell.nameB}</span>
                <div className="text-[10px]" style={{ color: getCorrelationColor(hoveredCell.r).text }}>
                  r = {hoveredCell.r != null ? (hoveredCell.r > 0 ? `+${hoveredCell.r}` : hoveredCell.r) : 'N/A'} (n={hoveredCell.sampleSize})
                </div>
              </div>
            )}
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto pb-2">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-left text-[10px] font-mono uppercase text-stone-500 w-36 min-w-[130px]">
                    Biomarker
                  </th>
                  {biomarkersList.map(col => (
                    <th
                      key={col.name}
                      className="p-1.5 text-center text-[10px] font-mono text-stone-400 max-w-[65px] min-w-[56px] truncate"
                      title={col.name}
                    >
                      {col.name.length > 8 ? col.name.slice(0, 7) + '…' : col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {biomarkersList.map(row => (
                  <tr key={row.name} className="border-t border-white/[0.04] hover:bg-white/[0.01]">
                    <td
                      className="p-2 text-xs font-medium text-stone-300 truncate max-w-[130px] pr-2"
                      title={`${row.name} (${row.unit})`}
                    >
                      {row.name}
                    </td>
                    {biomarkersList.map(col => {
                      const cell = data.matrix?.[row.name]?.[col.name]
                      const r = cell?.r
                      const isDiagonal = row.name === col.name
                      const isSelected =
                        activePair &&
                        ((activePair.nameA === row.name && activePair.nameB === col.name) ||
                         (activePair.nameA === col.name && activePair.nameB === row.name))
                      const style = getCorrelationColor(r)

                      return (
                        <td key={col.name} className="p-1 text-center">
                          <button
                            onClick={() => handleCellClick(row.name, col.name)}
                            onMouseEnter={() => setHoveredCell({ nameA: row.name, nameB: col.name, r, sampleSize: cell?.sample_size })}
                            onMouseLeave={() => setHoveredCell(null)}
                            disabled={r == null}
                            className={`w-full h-9 rounded flex items-center justify-center font-mono text-xs font-semibold transition-all select-none ${
                              isSelected
                                ? 'ring-2 ring-brand-400 ring-offset-2 ring-offset-[#0b0d14]'
                                : 'hover:scale-105'
                            } ${isDiagonal ? 'opacity-40 cursor-default' : ''}`}
                            style={{
                              background: style.bg,
                              color: style.text,
                              border: `1px solid ${style.border}`,
                            }}
                            title={
                              r != null
                                ? `${row.name} × ${col.name}\nr = ${r > 0 ? `+${r}` : r} (${cell.sample_size} reports)`
                                : `${row.name} × ${col.name}\nInsufficient overlapping reports (<3)`
                            }
                          >
                            {isDiagonal ? '1.0' : r != null ? (r > 0 ? `+${r.toFixed(2)}` : r.toFixed(2)) : '—'}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-[11px] text-stone-500 font-mono pt-2 border-t border-white/[0.05]">
            <span>Showing {biomarkersList.length} × {biomarkersList.length} matrix</span>
            <span>Values indicate Pearson coefficient r [-1.0 to +1.0]</span>
          </div>
        </div>

        {/* Scatter Plot & Inspector Card */}
        <div className="xl:col-span-5 space-y-6">
          {activePair ? (
            <div className="card p-5 space-y-4 border-brand-500/30">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-mono uppercase text-brand-400 tracking-wider font-semibold">
                    Relationship Inspector
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    {activePair.nameA} <span className="text-stone-500 font-normal">vs.</span> {activePair.nameB}
                  </h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {activePair.sampleSize} shared lab reports · {activePair.relationship}
                  </p>
                </div>

                {/* Pearson Badge */}
                <div className="text-right shrink-0">
                  <div
                    className="text-2xl font-bold font-mono leading-none"
                    style={{ color: getCorrelationColor(activePair.r).text }}
                  >
                    {activePair.r != null ? (activePair.r > 0 ? `+${activePair.r}` : activePair.r) : 'N/A'}
                  </div>
                  <span
                    className={`inline-block text-[9px] font-semibold px-2 py-0.5 rounded-full border mt-1.5 ${
                      getCorrelationBadge(activePair.r).badgeClass
                    }`}
                  >
                    {getCorrelationBadge(activePair.r).label}
                  </span>
                </div>
              </div>

              {/* Scatter Chart */}
              <div className="h-56 w-full pt-2">
                {activePair.points && activePair.points.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name={activePair.nameA}
                        unit={activePair.unitA ? ` ${activePair.unitA}` : ''}
                        tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                        axisLine={false}
                        tickLine={false}
                        label={{
                          value: `${activePair.nameA} (${activePair.unitA})`,
                          position: 'insideBottom',
                          offset: -12,
                          fill: '#94a3b8',
                          fontSize: 10,
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name={activePair.nameB}
                        unit={activePair.unitB ? ` ${activePair.unitB}` : ''}
                        tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                        label={{
                          value: `${activePair.nameB} (${activePair.unitB})`,
                          angle: -90,
                          position: 'insideLeft',
                          offset: 10,
                          fill: '#94a3b8',
                          fontSize: 10,
                        }}
                      />
                      <ZAxis range={[50, 50]} />
                      <Tooltip
                        content={
                          <ScatterTooltip
                            nameA={activePair.nameA}
                            unitA={activePair.unitA}
                            nameB={activePair.nameB}
                            unitB={activePair.unitB}
                          />
                        }
                      />
                      <Scatter
                        name="Reports"
                        data={activePair.points}
                        fill={getCorrelationColor(activePair.r).text}
                        stroke="#0b0d14"
                        strokeWidth={2}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-stone-500">
                    No overlapping data points available for this pair.
                  </div>
                )}
              </div>

              {/* Clinical Interpretation Box */}
              <div className="card p-3.5 bg-white/[0.02] border border-white/[0.05] space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-400">
                  <Sparkles size={13} />
                  <span>Physiological Interpretation</span>
                </div>
                <p className="text-xs text-stone-300 leading-relaxed">
                  {activePair.explanation ||
                    `These markers exhibit a ${activePair.relationship.toLowerCase()} trend across ${activePair.sampleSize} comparative reports.`}
                </p>
              </div>
            </div>
          ) : (
            <div className="card p-8 text-center text-stone-400 text-sm">
              Select any cell on the heatmap to inspect its comparative scatter plot.
            </div>
          )}

          {/* Quick Understanding Guide */}
          <div className="card p-4 space-y-2 border-white/[0.05]">
            <div className="flex items-center gap-2 text-xs font-semibold text-stone-300">
              <Info size={14} className="text-brand-400" />
              <span>Why Correlation Analysis Matters</span>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed">
              Biomarkers do not exist in isolation. Co-movements (such as HbA1c trending upwards alongside Fasting Glucose, or HDL dropping as Triglycerides spike) uncover systemic metabolic shifts earlier than isolated threshold readings.
            </p>
          </div>
        </div>
      </div>

      {/* Top Biomarker Associations (Ranked Feed) */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Top Detected Biomarker Associations</h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Strongest co-directional and inverse relationships identified in your longitudinal records
          </p>
        </div>

        {topCorrelations.length === 0 ? (
          <div className="card text-center py-8 text-sm text-stone-400">
            No strong correlations (|r| &ge; 0.35) detected yet with 3+ matching dates.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topCorrelations.slice(0, 6).map((corr, idx) => {
              const badge = getCorrelationBadge(corr.r)
              const colorInfo = getCorrelationColor(corr.r)
              const isSelected =
                activePair &&
                activePair.nameA === corr.biomarker_a &&
                activePair.nameB === corr.biomarker_b

              return (
                <div
                  key={idx}
                  onClick={() =>
                    setActivePair({
                      nameA: corr.biomarker_a,
                      unitA: corr.unit_a,
                      nameB: corr.biomarker_b,
                      unitB: corr.unit_b,
                      r: corr.r,
                      sampleSize: corr.sample_size,
                      explanation: corr.explanation,
                      relationship: corr.relationship,
                      points: corr.points,
                    })
                  }
                  className={`card card-hover cursor-pointer p-4 flex flex-col justify-between space-y-3 transition-all ${
                    isSelected ? 'ring-2 ring-brand-400' : ''
                  }`}
                  style={{
                    borderColor: isSelected ? 'rgba(234, 88, 12, 0.5)' : undefined,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                        <span className="truncate max-w-[110px]">{corr.biomarker_a}</span>
                        <span className="text-stone-500 font-normal">↔</span>
                        <span className="truncate max-w-[110px]">{corr.biomarker_b}</span>
                      </div>
                      <span className="text-[10px] font-mono text-stone-500">
                        {corr.sample_size} reports comparative
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className="text-lg font-bold font-mono leading-none"
                        style={{ color: colorInfo.text }}
                      >
                        {corr.r > 0 ? `+${corr.r}` : corr.r}
                      </div>
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${badge.badgeClass}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-stone-300 leading-relaxed bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.04]">
                    {corr.explanation}
                  </p>

                  <div className="flex items-center justify-between text-[10px] font-mono text-brand-400 pt-1">
                    <span>Inspect relationship</span>
                    <ArrowRight size={12} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
