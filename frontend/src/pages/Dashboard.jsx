import React, { useState, useEffect, useCallback } from 'react'
import api from '../utils/api'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Clock,
  Sparkles,
  ArrowRight,
  Activity,
  FileText,
  FileSearch,
  Pill,
  Utensils,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  FlaskConical,
  Target,
  Zap,
  BarChart2,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  TrendingDown as TrendDown,
  Info,
  X,
  Network,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import { format } from 'date-fns'
import SkeletonLoader from '../components/SkeletonLoader'
import EmptyState from '../components/EmptyState'

function safeFormatDate(dateVal, formatStr = 'MMM d, yy') {
  if (!dateVal) return ''
  try {
    const d = new Date(dateVal)
    if (isNaN(d.getTime())) return ''
    return format(d, formatStr)
  } catch {
    return ''
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error(`ErrorBoundary caught in [${this.props.name}]:`, error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="card p-4 bg-rose-500/10 border-rose-500/20 text-rose-200 text-xs space-y-1">
          <div className="font-bold flex items-center gap-1.5 text-rose-400">
            <AlertCircle size={14} /> Failed to render {this.props.name || 'section'}
          </div>
          <p className="font-mono text-[11px] opacity-80">{this.state.error?.message || String(this.state.error)}</p>
        </div>
      )
    }
    return this.props.children
  }
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [biomarkerNames, setBiomarkerNames] = useState([])
  const [allBiomarkers, setAllBiomarkers] = useState([])
  const [riskScores, setRiskScores] = useState(null)
  const [anomalies, setAnomalies] = useState([])
  const [anomalyDismissed, setAnomalyDismissed] = useState(false)
  const [reports, setReports] = useState([])
  const [medicines, setMedicines] = useState([])
  const [manualLogs, setManualLogs] = useState([])

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    setLoading(true)
    setAnomalyDismissed(false)
    try {
      const [namesRes, allBiomarkersRes, riskRes, anomaliesRes, reportsRes, medicinesRes, logsRes] = await Promise.all([
        api.get('/biomarkers/names').catch(() => ({ data: [] })),
        api.get('/biomarkers/').catch(() => ({ data: [] })),
        api.get('/biomarkers/risk-scores').catch(() => ({ data: null })),
        api.get('/biomarkers/anomalies').catch(() => ({ data: [] })),
        api.get('/reports/').catch(() => ({ data: [] })),
        api.get('/medicines/').catch(() => ({ data: [] })),
        api.get('/logs/').catch(() => ({ data: [] })),
      ])

      setBiomarkerNames(namesRes.data || [])
      setAllBiomarkers(allBiomarkersRes.data || [])
      setRiskScores(riskRes.data || null)
      setAnomalies(anomaliesRes.data || [])
      setReports(reportsRes.data || [])
      setMedicines(medicinesRes.data || [])
      setManualLogs(logsRes.data || [])
    } catch (e) {
      console.error('Error loading dashboard data:', e)
    } finally {
      setLoading(false)
    }
  }

  // Calculate "What Changed" comparison between latest & previous available biomarker values
  const biomarkerChanges = biomarkerNames.map(name => {
    const history = allBiomarkers
      .filter(b => b.name.toLowerCase() === name.toLowerCase())
      .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))

    if (history.length === 0) return null

    const latest = history[history.length - 1]
    const previous = history.length > 1 ? history[history.length - 2] : null

    let deltaText = 'Stable'
    let status = 'stable' // 'increased' | 'decreased' | 'stable' | 'single'
    let explanation = `Single recorded reading of ${latest.value} ${latest.unit}.`

    if (previous) {
      const valDiff = latest.value - previous.value
      if (valDiff > 0) {
        status = 'increased'
        deltaText = `Changed (+${valDiff.toFixed(1)})`
        explanation = `${name} increased from ${previous.value} to ${latest.value} ${latest.unit} compared with your previous available report.`
      } else if (valDiff < 0) {
        status = 'decreased'
        deltaText = `Changed (${valDiff.toFixed(1)})`
        explanation = `${name} decreased from ${previous.value} to ${latest.value} ${latest.unit} compared with your previous available report.`
      } else {
        status = 'stable'
        deltaText = 'Stable'
        explanation = `${name} remained unchanged at ${latest.value} ${latest.unit} compared with your previous report.`
      }
    }

    return {
      name,
      latest,
      previous,
      status,
      deltaText,
      explanation
    }
  }).filter(Boolean)

  // Construct Health Story observations
  const observations = []
  const changedItems = biomarkerChanges.filter(c => c.previous && c.status !== 'stable')
  const totalBiomarkers = biomarkerNames.length

  if (changedItems.length > 0) {
    observations.push({
      text: `${changedItems.length} biomarker${changedItems.length > 1 ? 's' : ''} changed compared with your previous available report.`,
      highlight: true
    })
  }
  if (reports.length > 0) {
    const latestReport = reports[0]
    observations.push({
      text: `Latest laboratory report uploaded on ${safeFormatDate(latestReport.uploaded_at, 'MMM d, yyyy')} with ${latestReport.biomarker_count || 'several'} extracted markers.`,
      highlight: false
    })
  }
  if (biomarkerChanges.filter(c => c.status === 'stable').length > 0) {
    observations.push({
      text: `Some health areas have remained stable across your available records.`,
      highlight: false
    })
  }

  // Construct Health Timeline
  const timelineEvents = []

  reports.forEach(r => {
    timelineEvents.push({
      type: 'LAB REPORT',
      icon: FileText,
      title: r.filename,
      subtitle: `${r.biomarker_count || 'Multiple'} biomarkers extracted`,
      date: new Date(r.uploaded_at),
      badgeColor: 'border-sky-500/30 text-sky-400 bg-sky-500/10'
    })
  })

  medicines.forEach(m => {
    timelineEvents.push({
      type: 'MEDICINE',
      icon: Pill,
      title: m.drug_name,
      subtitle: m.dosage ? `Dose: ${m.dosage}` : 'Medication recorded',
      date: new Date(m.start_date),
      badgeColor: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
    })
  })

  manualLogs.forEach(l => {
    timelineEvents.push({
      type: 'HEALTH LOG',
      icon: Activity,
      title: l.log_type.replace('_', ' ').toUpperCase(),
      subtitle: `Logged value: ${l.value}${l.unit ? ' ' + l.unit : ''}`,
      date: new Date(l.logged_at),
      badgeColor: 'border-amber-500/30 text-amber-400 bg-amber-500/10'
    })
  })

  timelineEvents.sort((a, b) => b.date - a.date)

  // Construct Important Health Areas
  const healthAreas = [
    {
      key: 'blood_sugar',
      title: 'BLOOD SUGAR',
      description: biomarkerChanges.some(c => c.name.toLowerCase().includes('hba1c') || c.name.toLowerCase().includes('glucose'))
        ? 'Recent glucose-related biomarkers present in your history.'
        : 'Glucose markers monitored.',
      status: riskScores?.diabetes?.score > 50 ? 'Attention' : 'Stable',
      statusClass: riskScores?.diabetes?.score > 50 ? 'risk-yellow' : 'risk-green'
    },
    {
      key: 'cardiovascular',
      title: 'CARDIOVASCULAR',
      description: biomarkerChanges.some(c => c.name.toLowerCase().includes('cholesterol') || c.name.toLowerCase().includes('triglycerides'))
        ? 'Cardiovascular markers recorded in available reports.'
        : 'Lipid profile indicators recorded.',
      status: riskScores?.cardiovascular?.score > 60 ? 'Attention' : 'Stable',
      statusClass: riskScores?.cardiovascular?.score > 60 ? 'risk-yellow' : 'risk-green'
    },
    {
      key: 'kidney',
      title: 'KIDNEY',
      description: biomarkerChanges.some(c => c.name.toLowerCase().includes('creatinine') || c.name.toLowerCase().includes('egfr'))
        ? 'Renal function indicators present in history.'
        : 'Renal panel markers monitored.',
      status: riskScores?.kidney?.score > 60 ? 'Attention' : 'Stable',
      statusClass: riskScores?.kidney?.score > 60 ? 'risk-yellow' : 'risk-green'
    },
    {
      key: 'liver',
      title: 'LIVER',
      description: 'Hepatic enzymes and protein markers stable across reports.',
      status: 'Stable',
      statusClass: 'risk-green'
    }
  ]

  if (loading) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div className="h-8 w-48 bg-white/5 rounded animate-pulse" />
        <SkeletonLoader rows={4} />
      </div>
    )
  }

  const hasData = totalBiomarkers > 0 || reports.length > 0 || manualLogs.length > 0

  return (
    <div className="p-6 md:p-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.07] pb-5">
        <div>
          <div className="flex items-center gap-2 text-brand-400 text-xs font-mono font-medium tracking-wider uppercase mb-1">
            <Sparkles size={14} /> Longitudinal Personal Health Intelligence
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Health Dashboard</h1>
          <p className="text-sm text-stone-400 mt-1">Your entire health history. One intelligent story.</p>
        </div>

        <button
          onClick={loadDashboardData}
          className="btn-secondary self-start sm:self-auto text-xs px-3 py-2"
        >
          <RefreshCw size={13} /> Refresh Data
        </button>
      </div>

      {!hasData ? (
        <EmptyState
          icon={Activity}
          title="Your health story is just getting started"
          description="Upload your first laboratory report or add health logs to build your personal health intelligence timeline over time."
          action={() => window.location.href = '/add-records'}
          actionLabel="Add First Health Record"
        />
      ) : (
        <div className="space-y-8">
          {/* 1A. HEALTH STORY */}
          <section className="card bg-gradient-to-br from-[#161a29] to-[#11131f] border-white/[0.1] relative overflow-hidden p-6 md:p-8">
            <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 space-y-4">
              <div className="text-[11px] font-mono font-semibold tracking-widest text-brand-400 uppercase">
                YOUR HEALTH STORY
              </div>
              <h2 className="text-xl md:text-2xl font-serif font-medium text-stone-100 leading-snug italic">
                “Your recent health records show several changes worth understanding.”
              </h2>

              <div className="pt-2 space-y-2.5">
                {observations.length > 0 ? (
                  observations.map((obs, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-sm text-stone-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 shrink-0" />
                      <span>{obs.text}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-stone-400">
                    Upload more health records to build a clearer picture over time.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* 1B. WHAT CHANGED */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">What changed?</h2>
                <p className="text-xs text-stone-400 mt-0.5">Comparison between latest available health values and previous records</p>
              </div>
            </div>

            {biomarkerChanges.length === 0 ? (
              <div className="card text-stone-400 text-sm text-center py-8">
                No previous report available for comparison yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {biomarkerChanges.slice(0, 6).map((change) => (
                  <div key={change.name} className="card card-hover flex flex-col justify-between space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-mono uppercase text-stone-400 tracking-wider font-semibold">{change.name}</span>
                        <div className="flex items-baseline gap-2 mt-1">
                          {change.previous ? (
                            <>
                              <span className="text-stone-400 text-sm font-mono">{change.previous.value}</span>
                              <ArrowRight size={13} className="text-stone-500" />
                              <span className="text-xl font-bold font-mono text-white">{change.latest.value}</span>
                              <span className="text-xs text-stone-400">{change.latest.unit}</span>
                            </>
                          ) : (
                            <>
                              <span className="text-xl font-bold font-mono text-white">{change.latest.value}</span>
                              <span className="text-xs text-stone-400">{change.latest.unit}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                        change.status === 'increased'
                          ? 'border-amber-500/30 text-amber-300 bg-amber-500/10'
                          : change.status === 'decreased'
                          ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                          : 'border-white/10 text-stone-400 bg-white/[0.04]'
                      }`}>
                        {change.deltaText}
                      </span>
                    </div>

                    <p className="text-xs text-stone-300 leading-relaxed bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.04]">
                      {change.explanation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 1C. HEALTH TIMELINE */}
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Health Timeline</h2>
              <p className="text-xs text-stone-400 mt-0.5">A longitudinal timeline of your personal health events</p>
            </div>

            {timelineEvents.length === 0 ? (
              <div className="card text-stone-400 text-sm text-center py-8">
                Your health timeline will appear here as you add records.
              </div>
            ) : (
              <div className="card p-6">
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-white/10">
                  {timelineEvents.slice(0, 5).map((evt, idx) => {
                    const IconComponent = evt.icon
                    return (
                      <div key={idx} className="relative flex items-start gap-4 group">
                        {/* Bullet */}
                        <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full bg-stone-950 border-2 border-brand-500 group-hover:scale-125 transition-transform" />

                        <div className="flex-1 bg-white/[0.02] border border-white/[0.05] hover:border-white/10 rounded-xl p-3.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-white/[0.05] text-stone-300">
                              <IconComponent size={16} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border uppercase ${evt.badgeColor}`}>
                                  {evt.type}
                                </span>
                                <span className="text-sm font-semibold text-white">{evt.title}</span>
                              </div>
                              <p className="text-xs text-stone-400 mt-0.5">{evt.subtitle}</p>
                            </div>
                          </div>

                          <div className="text-xs font-mono text-stone-400 shrink-0">
                            {safeFormatDate(evt.date, 'MMM d, yyyy')}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 1D. ANOMALY ALERT BANNER */}
          {anomalies.length > 0 && !anomalyDismissed && (
            <ErrorBoundary name="Anomaly Alerts">
              <section>
                <AnomalyAlertBanner anomalies={anomalies} onDismiss={() => setAnomalyDismissed(true)} />
              </section>
            </ErrorBoundary>
          )}

          {/* 1E. RISK SCORE GAUGES */}
          {riskScores && Object.keys(riskScores).length > 0 && (
            <ErrorBoundary name="Risk Score Gauges">
              <RiskScoreGauges riskScores={riskScores} />
            </ErrorBoundary>
          )}

          {/* 1F. IMPORTANT HEALTH AREAS */}
          <ErrorBoundary name="Important Health Areas">
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Important Health Areas</h2>
                <p className="text-xs text-stone-400 mt-0.5">Compact intelligent interpretation across organ systems</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {healthAreas.map(area => (
                  <div key={area.key} className="card card-hover flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono font-bold text-stone-300 uppercase tracking-wider">{area.title}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${area.statusClass}`}>
                          {area.status}
                        </span>
                      </div>
                      <p className="text-xs text-stone-400 leading-relaxed">
                        "{area.description}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </ErrorBoundary>

          {/* 1G. BIOMARKER STORY — Interactive */}
          <ErrorBoundary name="Biomarker Story">
            <BiomarkerStory biomarkerNames={biomarkerNames} allBiomarkers={allBiomarkers} />
          </ErrorBoundary>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   ANOMALY ALERT BANNER
   ───────────────────────────────────────────────────────────────────────── */
function AnomalyAlertBanner({ anomalies, onDismiss }) {
  const top = anomalies.slice(0, 4)
  const hasHigh = top.some(a => a.severity === 'high')

  return (
    <div
      className="relative rounded-2xl border p-5 overflow-hidden"
      style={{
        background: hasHigh ? 'rgba(244,63,94,0.06)' : 'rgba(245,158,11,0.06)',
        borderColor: hasHigh ? 'rgba(244,63,94,0.3)' : 'rgba(245,158,11,0.3)',
      }}
    >
      {/* dismiss */}
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 text-stone-400 hover:text-white transition-colors"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-3 mb-4">
        <div
          className="p-2.5 rounded-xl shrink-0"
          style={{
            background: hasHigh ? 'rgba(244,63,94,0.12)' : 'rgba(245,158,11,0.12)',
            color: hasHigh ? '#f43f5e' : '#f59e0b',
          }}
        >
          <ShieldAlert size={20} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">
            {anomalies.length} Unusual Reading{anomalies.length > 1 ? 's' : ''} Detected
          </h3>
          <p className="text-xs text-stone-400 mt-0.5">
            Statistical anomalies found in your biomarker history — values that deviate significantly from your personal baseline.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {top.map((a, i) => {
          const isHigh = a.severity === 'high'
          const color  = isHigh ? '#f43f5e' : '#f59e0b'
          const bg     = isHigh ? 'rgba(244,63,94,0.08)' : 'rgba(245,158,11,0.08)'
          const border = isHigh ? 'rgba(244,63,94,0.2)' : 'rgba(245,158,11,0.2)'
          return (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl p-3"
              style={{ background: bg, border: `1px solid ${border}` }}
            >
              <div className="text-center min-w-[52px]">
                <div className="text-xl font-bold font-mono" style={{ color }}>{a.value}</div>
                <div className="text-[9px] text-stone-500 mt-0.5">z={a.z_score?.toFixed(1)}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate">{a.name}</div>
                <div className="text-[10px] text-stone-400">
                  {safeFormatDate(a.recorded_at, 'MMM d, yyyy')}
                </div>
              </div>
              <span
                className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0"
                style={{ color, borderColor: border, background: bg }}
              >
                {isHigh ? 'High' : 'Medium'}
              </span>
            </div>
          )
        })}
      </div>

      {anomalies.length > 4 && (
        <p className="text-xs text-stone-500 mt-3 text-center">
          + {anomalies.length - 4} more anomalies — review your biomarker history below.
        </p>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   RISK SCORE GAUGES
   ───────────────────────────────────────────────────────────────────────── */
const RISK_DOMAIN_ICONS = {
  diabetes:       { icon: Activity,     color: '#6366f1' },
  cardiovascular: { icon: Activity,     color: '#f43f5e' },
  kidney:         { icon: FlaskConical, color: '#06b6d4' },
  liver:          { icon: FlaskConical, color: '#f59e0b' },
  thyroid:        { icon: Zap,          color: '#a78bfa' },
  anemia:         { icon: Activity,     color: '#fb923c' },
  inflammation:   { icon: ShieldAlert,  color: '#f43f5e' },
}

function getRiskColor(score) {
  if (score >= 67) return '#f43f5e'
  if (score >= 34) return '#f59e0b'
  return '#10b981'
}

function RiskGauge({ domain, label, score, factors }) {
  const [expanded, setExpanded] = useState(false)
  const safeScore = Math.max(0, Math.min(100, Math.round(score || 0)))
  const color = getRiskColor(safeScore)
  
  // Semi-circle SVG arc: radius = 38, center at (50, 48)
  // Arc length for 180 degrees = Math.PI * 38 = 119.38
  const radius = 38
  const circumference = Math.PI * radius
  const strokeDashoffset = circumference * (1 - safeScore / 100)

  return (
    <div
      className="card card-hover flex flex-col items-center cursor-pointer select-none relative"
      style={{ padding: '16px 12px' }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="relative w-full flex flex-col items-center justify-center" style={{ height: 90 }}>
        <svg viewBox="0 0 100 58" className="w-28 h-16 overflow-visible">
          {/* Background track */}
          <path
            d="M 12 50 A 38 38 0 0 1 88 50"
            fill="none"
            stroke="rgba(255, 255, 255, 0.07)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Active colored arc */}
          <path
            d="M 12 50 A 38 38 0 0 1 88 50"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
          />
        </svg>

        {/* Score in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1 pointer-events-none">
          <span className="text-2xl font-bold font-mono leading-none" style={{ color }}>
            {safeScore}
          </span>
          <span className="text-[9px] text-stone-500 mt-0.5">/ 100</span>
        </div>
      </div>

      {/* Label */}
      <p className="text-[10px] font-mono font-semibold text-stone-300 uppercase tracking-wider text-center mt-1 leading-tight">
        {label.replace(' Risk', '')}
      </p>

      {/* Risk badge */}
      <span
        className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border mt-2"
        style={{
          color: gaugeColor,
          borderColor: `${gaugeColor}40`,
          background: `${gaugeColor}12`,
        }}
      >
        {score >= 67 ? 'High' : score >= 34 ? 'Moderate' : 'Low'}
      </span>

      {/* Expand arrow */}
      <ChevronRight
        size={12}
        className="mt-2 text-stone-500 transition-transform"
        style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
      />

      {/* Expanded factors */}
      {expanded && factors && factors.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 z-30 mt-2 rounded-xl border p-3 space-y-1.5 shadow-2xl"
          style={{
            background: '#161a29',
            borderColor: `${gaugeColor}30`,
            minWidth: 180,
          }}
          onClick={e => e.stopPropagation()}
        >
          <p className="text-[9px] font-mono font-semibold text-stone-500 uppercase tracking-wider mb-2">
            Contributing Factors
          </p>
          {factors.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-stone-300 truncate">{f.factor || f.name || f}</span>
              {f.points != null && (
                <span className="text-[10px] font-mono font-bold shrink-0" style={{ color: gaugeColor }}>
                  +{f.points}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RiskScoreGauges({ riskScores }) {
  const domains = Object.entries(riskScores)
  const overall = Math.round(domains.reduce((sum, [, v]) => sum + (v.score || 0), 0) / domains.length)
  const overallColor = getRiskColor(overall)

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-brand-400 text-[11px] font-mono font-semibold tracking-widest uppercase mb-1">
            <ShieldCheck size={13} /> AI Risk Intelligence
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Health Risk Assessment</h2>
          <p className="text-xs text-stone-400 mt-0.5">
            AI-computed risk scores across 7 health domains based on your biomarker history · click any gauge for details
          </p>
        </div>
        {/* Overall pill */}
        <div
          className="flex items-center gap-3 rounded-2xl border px-4 py-2.5 self-start sm:self-auto shrink-0"
          style={{ background: `${overallColor}10`, borderColor: `${overallColor}30` }}
        >
          <div>
            <div className="text-[10px] text-stone-500 font-mono uppercase tracking-wider">Overall Risk</div>
            <div className="text-2xl font-bold font-mono" style={{ color: overallColor }}>{overall}</div>
          </div>
          <div
            className="text-[11px] font-bold uppercase px-2.5 py-1 rounded-full border"
            style={{ color: overallColor, borderColor: `${overallColor}40`, background: `${overallColor}15` }}
          >
            {overall >= 67 ? 'High' : overall >= 34 ? 'Moderate' : 'Low'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {domains.map(([domain, data]) => (
          <RiskGauge
            key={domain}
            domain={domain}
            label={data.label || domain}
            score={data.score || 0}
            factors={data.factors || []}
          />
        ))}
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-stone-600 text-center pt-1">
        <Info size={10} className="inline mr-1" />
        Risk scores are informational estimates based on available biomarker data. Not a medical diagnosis.
      </p>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   BIOMARKER STORY — Full interactive panel
   ───────────────────────────────────────────────────────────────────────── */

// Status helpers
function getRangeStatus(value, refMin, refMax) {
  if (refMin == null && refMax == null) return 'unknown'
  if (refMax != null && value > refMax) return 'high'
  if (refMin != null && value < refMin) return 'low'
  return 'normal'
}

function statusMeta(status) {
  switch (status) {
    case 'high':   return { label: 'Above Range', color: '#f43f5e', bg: 'rgba(244,63,94,0.08)',   border: 'rgba(244,63,94,0.3)',   badge: 'risk-red'    }
    case 'low':    return { label: 'Below Range', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', badge: 'risk-yellow' }
    case 'normal': return { label: 'In Range',    color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.3)',  badge: 'risk-green'  }
    default:       return { label: 'No Range',    color: '#6366f1', bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.3)',  badge: 'risk-blue'   }
  }
}

// Custom animated dot on the line
function CustomDot({ cx, cy, payload, refMin, refMax, activeIndex, index, dataKey }) {
  if (cx == null || cy == null || !Number.isFinite(cx) || !Number.isFinite(cy) || !payload || payload[dataKey] == null) return null
  const status = getRangeStatus(payload[dataKey], refMin, refMax)
  const meta   = statusMeta(status)
  const isActive = index === activeIndex
  const r = isActive ? 7 : 5
  return (
    <g key={`dot-${index}`}>
      <circle cx={cx} cy={cy} r={r + 3} fill={meta.color} fillOpacity={isActive ? 0.18 : 0.08} />
      <circle cx={cx} cy={cy} r={r} fill={meta.color} stroke="#0b0d14" strokeWidth={2} />
    </g>
  )
}

// Custom tooltip
function BiomarkerTooltip({ active, payload, label, refMin, refMax, unit }) {
  if (!active || !payload?.length) return null
  const item   = payload[0]
  const val    = item?.value ?? item?.payload?.forecastValue
  const isForecast = item?.dataKey === 'forecastValue' || item?.payload?.forecastValue != null
  const status = getRangeStatus(val, refMin, refMax)
  const meta   = isForecast
    ? { label: 'Projected', color: '#818cf8', bg: 'rgba(129,140,248,0.1)', border: 'rgba(129,140,248,0.3)' }
    : statusMeta(status)
  return (
    <div style={{ background: '#161a29', border: `1px solid ${meta.border}`, borderRadius: 12, padding: '12px 16px', minWidth: 180 }}>
      <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4, fontFamily: 'monospace' }}>{label}</p>
      <p style={{ color: meta.color, fontSize: 22, fontWeight: 700, fontFamily: 'monospace', margin: 0 }}>
        {val} <span style={{ fontSize: 12, opacity: 0.7 }}>{unit}</span>
      </p>
      <span style={{
        display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 600,
        padding: '2px 8px', borderRadius: 20, border: `1px solid ${meta.border}`,
        background: meta.bg, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.07em'
      }}>
        {meta.label}
      </span>
      {refMin != null && refMax != null && (
        <p style={{ color: '#64748b', fontSize: 10, marginTop: 6, fontFamily: 'monospace' }}>
          Reference: {refMin} – {refMax} {unit}
        </p>
      )}
    </div>
  )
}

// Mini sparkline card for the biomarker grid
function BiomarkerCard({ name, history, isSelected, onClick }) {
  if (!history.length) return null
  const latest   = history[history.length - 1]
  const prev     = history.length > 1 ? history[history.length - 2] : null
  const delta    = prev ? latest.value - prev.value : null
  const status   = getRangeStatus(latest.value, latest.ref_min, latest.ref_max)
  const meta     = statusMeta(status)
  const sparkData = history.map(h => ({ v: h.value }))

  return (
    <button
      onClick={onClick}
      className={`card card-hover text-left transition-all w-full ${isSelected ? 'ring-2 ring-brand-500/60' : ''}`}
      style={isSelected ? { borderColor: 'rgba(234,88,12,0.4)' } : {}}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider leading-tight">{name}</span>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.badge}`}>{meta.label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span style={{ color: meta.color }} className="text-xl font-bold font-mono leading-none">{latest.value}</span>
        <span className="text-[10px] text-stone-400 mb-0.5">{latest.unit}</span>
        {delta !== null && Number.isFinite(delta) && (
          <span className={`text-[10px] font-semibold ml-auto mb-0.5 ${delta > 0 ? 'text-rose-400' : delta < 0 ? 'text-emerald-400' : 'text-stone-400'}`}>
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta).toFixed(1)}
          </span>
        )}
      </div>
      {/* Mini sparkline */}
      {sparkData.length > 1 && (
        <div className="mt-2 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <Line type="monotone" dataKey="v" stroke={meta.color} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {latest.ref_min != null && latest.ref_max != null && (
        <p className="text-[9px] text-stone-500 mt-1.5 font-mono">
          Ref: {latest.ref_min} – {latest.ref_max} {latest.unit}
        </p>
      )}
    </button>
  )
}

function BiomarkerStory({ biomarkerNames, allBiomarkers }) {
  const [selectedBiomarker, setSelectedBiomarker] = useState('')
  const [biomarkerHistory, setBiomarkerHistory]   = useState([])
  const [searchQuery, setSearchQuery]             = useState('')
  const [activeIndex, setActiveIndex]             = useState(null)
  const [category, setCategory]                   = useState('All')
  const [forecast, setForecast]                   = useState(null)
  const [forecastLoading, setForecastLoading]     = useState(false)

  // Category buckets
  const CATEGORIES = {
    'All':        () => true,
    'Glucose':    n => /glucose|hba1c|sugar|insulin/i.test(n),
    'Lipids':     n => /cholesterol|ldl|hdl|triglyceride|vldl/i.test(n),
    'Blood':      n => /hemoglobin|rbc|wbc|platelet|mch|mcv|hematocrit|ferritin|iron/i.test(n),
    'Kidney':     n => /creatinine|bun|egfr|uric/i.test(n),
    'Liver':      n => /sgpt|sgot|alt|ast|bilirubin|alkaline|protein|albumin/i.test(n),
    'Thyroid':    n => /tsh|t3|t4|thyroid/i.test(n),
    'Vitamins':   n => /vitamin|b12|d3|folate/i.test(n),
    'Vitals':     n => /bp|blood pressure|systolic|diastolic|bmi|pulse|weight/i.test(n),
    'Inflammation': n => /crp|esr|fibrinogen/i.test(n),
  }

  const categoryFilter = CATEGORIES[category] || (() => true)
  const filteredNames = biomarkerNames.filter(n =>
    categoryFilter(n) && n.toLowerCase().includes(searchQuery.toLowerCase())
  )

  useEffect(() => {
    if (biomarkerNames.length > 0 && !selectedBiomarker) {
      setSelectedBiomarker(biomarkerNames[0])
    }
  }, [biomarkerNames])

  useEffect(() => {
    if (selectedBiomarker) {
      const history = allBiomarkers
        .filter(b => b.name.toLowerCase() === selectedBiomarker.toLowerCase())
        .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
      setBiomarkerHistory(history)
      setActiveIndex(history.length - 1)
    }
  }, [selectedBiomarker, allBiomarkers])

  // Fetch forecast when biomarker selected and has ≥2 readings
  useEffect(() => {
    if (!selectedBiomarker) return
    const history = allBiomarkers
      .filter(b => b.name.toLowerCase() === selectedBiomarker.toLowerCase())
    if (history.length < 2) { setForecast(null); return }
    setForecastLoading(true)
    setForecast(null)
    api.get(`/biomarkers/forecast/${encodeURIComponent(selectedBiomarker)}`)
      .then(r => setForecast(r.data))
      .catch(() => setForecast(null))
      .finally(() => setForecastLoading(false))
  }, [selectedBiomarker, allBiomarkers])

  if (biomarkerNames.length === 0) {
    return (
      <section className="card p-6 text-center space-y-2">
        <FlaskConical size={32} className="mx-auto text-stone-500" />
        <p className="text-sm text-stone-400">Upload lab reports to see your biomarker trends here.</p>
      </section>
    )
  }

  // Latest reading & metadata MUST be defined before chartData mapping
  const latest   = biomarkerHistory[biomarkerHistory.length - 1]
  const refMin   = latest?.ref_min ?? null
  const refMax   = latest?.ref_max ?? null
  const unit     = latest?.unit || ''
  const status   = latest ? getRangeStatus(latest.value, refMin, refMax) : 'unknown'
  const meta     = statusMeta(status)

  // Chart data — merge historical + forecast
  const historicalChartData = biomarkerHistory.map(h => ({
    date:     safeFormatDate(h.recorded_at, 'MMM d, yy'),
    value:    h.value,
    ref_min:  h.ref_min,
    ref_max:  h.ref_max,
  }))

  const forecastChartData = forecast?.forecast?.map(f => ({
    date:          safeFormatDate(f.date, 'MMM d, yy'),
    forecastValue: f.value,
    ref_min:       refMin,
    ref_max:       refMax,
  })) || []

  // Bridge point: last historical carries forecastValue too so lines connect
  const bridgedHistorical = historicalChartData.map((d, i) =>
    i === historicalChartData.length - 1 && forecastChartData.length > 0
      ? { ...d, forecastValue: d.value }
      : d
  )

  const chartData = [...bridgedHistorical, ...forecastChartData]

  // Trend across full history
  const first    = biomarkerHistory[0]
  const totalDelta = first && latest ? latest.value - first.value : null
  const totalPct   = first && first.value !== 0 ? ((totalDelta / first.value) * 100).toFixed(1) : null

  // y-axis domain with padding — safe against empty or non-finite values
  const allVals = chartData.map(d => d.value ?? d.forecastValue).filter(v => v != null && !isNaN(v))
  const minVal  = allVals.length > 0 ? Math.min(...allVals) : 0
  const maxVal  = allVals.length > 0 ? Math.max(...allVals) : 100
  const yPad    = (maxVal - minVal) * 0.4 || 2
  const calcMin = Math.min(minVal, refMin ?? Infinity) - yPad
  const calcMax = Math.max(maxVal, refMax ?? -Infinity) + yPad
  const yMin    = Number.isFinite(calcMin) ? Math.max(0, calcMin) : 0
  const yMax    = Number.isFinite(calcMax) ? calcMax : 100

  // History for all biomarkers (for the grid)
  const allHistories = {}
  biomarkerNames.forEach(name => {
    allHistories[name] = allBiomarkers
      .filter(b => b.name.toLowerCase() === name.toLowerCase())
      .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
  })

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-brand-400 text-[11px] font-mono font-semibold tracking-widest uppercase mb-1">
            <BarChart2 size={13} /> Biomarker Intelligence
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Your biomarkers tell a story</h2>
          <p className="text-xs text-stone-400 mt-0.5">
            {biomarkerNames.length} biomarkers tracked · select any to explore its journey
          </p>
        </div>
        {/* Controls */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search biomarkers…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input sm:w-48 text-xs"
          />
          <a
            href="/correlations"
            className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5 shrink-0"
            title="Open Biomarker Correlation Heatmap"
          >
            <Network size={13} className="text-brand-400" />
            <span className="hidden sm:inline">Correlation Heatmap</span>
          </a>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {Object.keys(CATEGORIES).map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`text-[10px] font-semibold px-3 py-1 rounded-full border transition-all ${
              category === cat
                ? 'bg-brand-500 border-brand-500 text-white'
                : 'border-white/10 text-stone-400 hover:border-white/20 hover:text-stone-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* LEFT — Biomarker grid */}
        <div className="xl:col-span-2 space-y-3">
          <p className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">
            {filteredNames.length} markers · click to inspect
          </p>
          <div className="grid grid-cols-2 gap-2.5 max-h-[560px] overflow-y-auto pr-1">
            {filteredNames.map(name => (
              <BiomarkerCard
                key={name}
                name={name}
                history={allHistories[name] || []}
                isSelected={name === selectedBiomarker}
                onClick={() => setSelectedBiomarker(name)}
              />
            ))}
          </div>
        </div>

        {/* RIGHT — Detail chart */}
        <div className="xl:col-span-3 space-y-4">

          {/* Selected biomarker header */}
          <div className="card p-4 flex flex-wrap items-center gap-4">
            <div style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
                 className="p-3 rounded-xl">
              <FlaskConical size={20} style={{ color: meta.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white truncate">{selectedBiomarker}</h3>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.badge}`}>
                  {meta.label}
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                {biomarkerHistory.length} reading{biomarkerHistory.length !== 1 ? 's' : ''} recorded
                {refMin != null && refMax != null && ` · Reference: ${refMin} – ${refMax} ${unit}`}
              </p>
            </div>
            {/* Stat pills */}
            <div className="flex gap-3 ml-auto">
              {latest && (
                <div className="text-center">
                  <div style={{ color: meta.color }} className="text-2xl font-bold font-mono leading-none">
                    {latest.value}
                  </div>
                  <div className="text-[10px] text-stone-400 mt-0.5">{unit} · latest</div>
                </div>
              )}
              {totalDelta !== null && (
                <div className="text-center">
                  <div className={`text-lg font-bold font-mono leading-none ${totalDelta > 0 ? 'text-rose-400' : totalDelta < 0 ? 'text-emerald-400' : 'text-stone-400'}`}>
                    {totalDelta > 0 ? '+' : ''}{totalDelta.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-stone-400 mt-0.5">
                    {totalPct ? `${totalPct}%` : ''} overall
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="card p-5">
            {/* Forecast header row */}
            {biomarkerHistory.length >= 2 && (
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                {forecastLoading && (
                  <span className="text-[10px] text-stone-500 font-mono flex items-center gap-1">
                    <RefreshCw size={10} className="animate-spin" /> Loading forecast…
                  </span>
                )}
                {forecast && !forecastLoading && (
                  <>
                    <span className="flex items-center gap-1.5 text-[10px] font-mono text-stone-400">
                      <span className="inline-block w-6 border-t-2 border-dashed border-indigo-400/70" />
                      AI 90-day forecast
                    </span>
                    {forecast.slope != null && (
                      <span className={`flex items-center gap-1 text-[10px] font-semibold ${forecast.slope > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {forecast.slope > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {forecast.slope > 0 ? 'Rising trend' : 'Falling trend'}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            {biomarkerHistory.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-8">No data for this biomarker.</p>
            ) : biomarkerHistory.length === 1 ? (
              <div className="py-8 text-center">
                <div style={{ color: meta.color }} className="text-4xl font-bold font-mono">{latest.value}</div>
                <div className="text-stone-400 text-sm mt-1">{unit}</div>
                <div className={`inline-block mt-3 text-xs font-semibold px-3 py-1 rounded-full border ${meta.badge}`}>{meta.label}</div>
                {refMin != null && refMax != null && (
                  <p className="text-xs text-stone-500 mt-2 font-mono">Reference range: {refMin} – {refMax} {unit}</p>
                )}
                <p className="text-xs text-stone-500 mt-4">Upload more reports to see the trend chart.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={chartData}
                  onMouseMove={e => { if (e.activeTooltipIndex != null) setActiveIndex(e.activeTooltipIndex) }}
                  onMouseLeave={() => setActiveIndex(biomarkerHistory.length - 1)}
                  margin={{ top: 16, right: 24, bottom: 4, left: 0 }}
                >
                  <defs>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={meta.color} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={meta.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.05)" />

                  {/* Reference band — normal zone shaded green */}
                  {refMin != null && refMax != null && (
                    <ReferenceArea
                      y1={refMin} y2={refMax}
                      fill="rgba(16,185,129,0.07)"
                      stroke="rgba(16,185,129,0.25)"
                      strokeDasharray="4 2"
                      label={{
                        value: `Normal Zone (${refMin}–${refMax} ${unit})`,
                        position: 'insideTopLeft',
                        fill: 'rgba(16,185,129,0.6)',
                        fontSize: 10,
                        fontFamily: 'monospace',
                      }}
                    />
                  )}

                  {/* Individual reference lines */}
                  {refMax != null && (
                    <ReferenceLine
                      y={refMax} stroke="rgba(244,63,94,0.5)" strokeDasharray="6 3" strokeWidth={1.5}
                      label={{ value: `Max ${refMax}`, position: 'right', fill: 'rgba(244,63,94,0.7)', fontSize: 10 }}
                    />
                  )}
                  {refMin != null && (
                    <ReferenceLine
                      y={refMin} stroke="rgba(245,158,11,0.5)" strokeDasharray="6 3" strokeWidth={1.5}
                      label={{ value: `Min ${refMin}`, position: 'right', fill: 'rgba(245,158,11,0.7)', fontSize: 10 }}
                    />
                  )}

                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    domain={[Math.max(0, yMin), yMax]}
                    tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                    axisLine={false} tickLine={false} width={44}
                  />
                  <Tooltip content={<BiomarkerTooltip refMin={refMin} refMax={refMax} unit={unit} />} />

                  {/* Historical line */}
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={meta.color}
                    strokeWidth={2.5}
                    dot={(props) => (
                      <CustomDot
                        {...props}
                        refMin={refMin}
                        refMax={refMax}
                        activeIndex={activeIndex}
                        dataKey="value"
                      />
                    )}
                    activeDot={false}
                    connectNulls={false}
                  />

                  {/* Forecast dashed line */}
                  {forecast && forecastChartData.length > 0 && (
                    <Line
                      type="monotone"
                      dataKey="forecastValue"
                      stroke="#818cf8"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={(dotProps) => {
                        const { cx, cy, payload, index } = dotProps || {}
                        if (!Number.isFinite(cx) || !Number.isFinite(cy) || payload?.forecastValue == null) return null
                        return (
                          <circle
                            key={`fc-dot-${index}`}
                            cx={cx}
                            cy={cy}
                            r={4}
                            fill="#818cf8"
                            stroke="#0b0d14"
                            strokeWidth={1.5}
                          />
                        )
                      }}
                      activeDot={false}
                      connectNulls={true}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}

            {/* Forecast warning */}
            {forecast?.warning && (
              <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
                   style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}>
                <Info size={13} className="shrink-0 mt-0.5" />
                <span>{forecast.warning}</span>
              </div>
            )}
          </div>

          {/* Timeline of readings */}
          {biomarkerHistory.length > 1 && (
            <div className="card p-4 space-y-3">
              <div className="text-[10px] font-mono font-semibold text-stone-500 uppercase tracking-wider">Reading History</div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {[...biomarkerHistory].reverse().map((h, idx) => {
                  const s = getRangeStatus(h.value, h.ref_min, h.ref_max)
                  const m = statusMeta(s)
                  const isLatest = idx === 0
                  return (
                    <div key={h.id} className="flex items-center justify-between gap-4 text-xs py-1.5 border-b border-white/[0.05] last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                        <span className="text-stone-400 font-mono">{safeFormatDate(h.recorded_at, 'MMM d, yyyy')}</span>
                        {isLatest && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/20 font-semibold">Latest</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold" style={{ color: m.color }}>{h.value}</span>
                        <span className="text-stone-500">{h.unit}</span>
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${m.badge}`}>{m.label}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Summary insight box */}
          {biomarkerHistory.length > 1 && (
            <div className="card p-4 flex gap-3" style={{ borderColor: meta.border, background: meta.bg }}>
              <Zap size={16} style={{ color: meta.color }} className="shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed" style={{ color: meta.color }}>
                <span className="font-bold">{selectedBiomarker}</span> has been tracked across {' '}
                <span className="font-bold">{biomarkerHistory.length} reports</span> from {' '}
                <span className="font-bold">{safeFormatDate(biomarkerHistory[0].recorded_at, 'MMM d, yyyy')}</span> to {' '}
                <span className="font-bold">{safeFormatDate(biomarkerHistory[biomarkerHistory.length - 1].recorded_at, 'MMM d, yyyy')}</span>.
                {totalDelta !== null && Math.abs(totalDelta) > 0 && (
                  <> Overall it has {totalDelta > 0 ? 'increased' : 'decreased'} by{' '}
                  <span className="font-bold">{Math.abs(totalDelta).toFixed(1)} {unit}</span>
                  {totalPct && <> ({Math.abs(Number(totalPct))}%)</>}.</>
                )}
                {refMin != null && refMax != null && (
                  <> The reference range is <span className="font-bold">{refMin}–{refMax} {unit}</span>
                  , and your latest reading is <span className="font-bold">{meta.label.toLowerCase()}</span>.</>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
