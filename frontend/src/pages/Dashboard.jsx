import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../utils/api'
import AIPrecisionTab from './AIPrecisionTab'
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
  Stethoscope,
  Calendar,
  LayoutDashboard,
  Dna,
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

const TABS = [
  { id: 'clinical', label: 'Clinical', long: 'Your lab results, trends and risk scores at a glance.', icon: LayoutDashboard },
  { id: 'ai', label: 'AI Insights & Precision', long: 'Plain-language insights and health checks personalised to you.', icon: Dna },
]

export default function Dashboard() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'ai' ? 'ai' : 'clinical'
  const current = TABS.find(t => t.id === tab)
  return (
    <div className="p-4 md:p-7 space-y-4">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Health Dashboard</h1>
          <p className="text-xs text-stone-400 mt-0.5">{current.long}</p>
        </div>
        <div role="tablist" aria-label="Dashboard views" className="flex w-full md:w-auto p-1 rounded-xl border border-white/[0.08] bg-white/[0.03]">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => setParams(id === 'clinical' ? {} : { tab: id })}
                className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  active ? 'bg-brand-500 text-white shadow-sm' : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.05]'
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            )
          })}
        </div>
      </header>
      {tab === 'ai' ? <AIPrecisionTab /> : <ClinicalDashboard />}
    </div>
  )
}

function ClinicalDashboard() {
  const [loading, setLoading] = useState(true)
  const [biomarkerNames, setBiomarkerNames] = useState([])
  const [allBiomarkers, setAllBiomarkers] = useState([])
  const [riskScores, setRiskScores] = useState(null)
  const [anomalies, setAnomalies] = useState([])
  const [anomalyDismissed, setAnomalyDismissed] = useState(false)
  const [reports, setReports] = useState([])
  const [medicines, setMedicines] = useState([])
  const [manualLogs, setManualLogs] = useState([])
  const [upcomingTests, setUpcomingTests] = useState([])

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    setLoading(true)
    setAnomalyDismissed(false)
    try {
      const [namesRes, allBiomarkersRes, riskRes, anomaliesRes, reportsRes, medicinesRes, logsRes, testsRes] = await Promise.all([
        api.get('/biomarkers/names').catch(() => ({ data: [] })),
        api.get('/biomarkers/').catch(() => ({ data: [] })),
        api.get('/biomarkers/risk-scores').catch(() => ({ data: null })),
        api.get('/biomarkers/anomalies').catch(() => ({ data: [] })),
        api.get('/reports/').catch(() => ({ data: [] })),
        api.get('/medicines/').catch(() => ({ data: [] })),
        api.get('/logs/').catch(() => ({ data: [] })),
        api.get('/consultations/upcoming-tests').catch(() => ({ data: [] })),
      ])

      setBiomarkerNames(namesRes.data || [])
      setAllBiomarkers(allBiomarkersRes.data || [])
      setRiskScores(riskRes.data || null)
      setAnomalies(anomaliesRes.data || [])
      setReports(reportsRes.data || [])
      setMedicines(medicinesRes.data || [])
      setManualLogs(logsRes.data || [])
      setUpcomingTests(testsRes.data || [])
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

  // ── Numbers for the summary strip (all computed from the data, nothing hard-coded) ──
  const totalBiomarkers = biomarkerNames.length
  const isOut = (b) => (b.ref_max != null && b.value > b.ref_max) || (b.ref_min != null && b.value < b.ref_min)
  const withRange = biomarkerChanges.filter(c => c.latest.ref_min != null || c.latest.ref_max != null)
  const outOfRange = withRange.filter(c => isOut(c.latest))
  const inRangeNow = withRange.length - outOfRange.length
  const changed = biomarkerChanges.filter(c => c.previous && c.status !== 'stable')
  // Out-of-range first, then the biggest % movers, so what matters is visible without scrolling
  const movers = changed
    .map(c => ({
      ...c,
      out: isOut(c.latest),
      pct: c.previous.value ? ((c.latest.value - c.previous.value) / Math.abs(c.previous.value)) * 100 : 0,
    }))
    .sort((a, b) => (b.out - a.out) || Math.abs(b.pct) - Math.abs(a.pct))
  const latestReport = reports[0]

  // ── Recent activity (reports, medicines, logs) ──
  const timelineEvents = [
    ...reports.map(r => ({ type: 'Lab report', icon: FileText, title: prettyReportName(r.filename), subtitle: `${r.biomarker_count || 'Several'} markers`, date: new Date(r.report_date || r.uploaded_at) })),
    ...medicines.map(m => ({ type: 'Medicine', icon: Pill, title: m.drug_name, subtitle: m.dosage || 'Started', date: new Date(m.start_date) })),
    ...manualLogs.map(l => ({ type: 'Log', icon: Activity, title: l.log_type.replace(/_/g, ' '), subtitle: `${l.value}${l.value2 ? '/' + l.value2 : ''}${l.unit ? ' ' + l.unit : ''}`, date: new Date(l.logged_at) })),
  ].sort((a, b) => b.date - a.date)

  if (loading) {
    return <SkeletonLoader rows={4} />
  }

  const hasData = totalBiomarkers > 0 || reports.length > 0 || manualLogs.length > 0

  if (!hasData) {
    return (
      <EmptyState
        icon={Activity}
        title="Your health story is just getting started"
        description="Upload your first lab report or add health logs to see trends, risk scores and insights here."
        action={() => window.location.href = '/add-records'}
        actionLabel="Add first health record"
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* 1. Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="In normal range"
          value={withRange.length ? `${inRangeNow}/${withRange.length}` : '—'}
          sub="markers on latest report"
          tone={outOfRange.length ? 'neutral' : 'good'}
        />
        <Kpi
          label="Outside range"
          value={outOfRange.length}
          sub={outOfRange.length ? outOfRange.slice(0, 2).map(c => c.name).join(', ') + (outOfRange.length > 2 ? '…' : '') : 'None — all in range'}
          tone={outOfRange.length ? 'warn' : 'good'}
        />
        <Kpi label="Changed since last report" value={changed.length} sub={`of ${totalBiomarkers} markers tracked`} />
        <Kpi
          label="Latest report"
          value={latestReport ? safeFormatDate(latestReport.report_date || latestReport.uploaded_at, 'MMM d, yyyy') : '—'}
          sub={`${reports.length} reports · ${allBiomarkers.length} readings`}
          action={
            <button onClick={loadDashboardData} className="text-stone-500 hover:text-brand-400 p-1 -m-1" title="Refresh data" aria-label="Refresh data">
              <RefreshCw size={13} />
            </button>
          }
        />
      </div>

      {/* 2. Unusual readings (compact) */}
      {anomalies.length > 0 && !anomalyDismissed && (
        <ErrorBoundary name="Anomaly Alerts">
          <AnomalyAlertBanner anomalies={anomalies} onDismiss={() => setAnomalyDismissed(true)} />
        </ErrorBoundary>
      )}

      {/* 3. Risk scores */}
      {riskScores && Object.keys(riskScores).length > 0 && (
        <ErrorBoundary name="Risk Score Gauges">
          <RiskScoreGauges riskScores={riskScores} />
        </ErrorBoundary>
      )}

      {/* 4. Changes + recent activity side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <ErrorBoundary name="Changes">
          <ChangesPanel movers={movers} className="lg:col-span-3" />
        </ErrorBoundary>
        <ErrorBoundary name="Recent activity">
          <ActivityPanel events={timelineEvents} upcomingTests={upcomingTests} className="lg:col-span-2" />
        </ErrorBoundary>
      </div>

      {/* 5. Biomarker explorer */}
      <ErrorBoundary name="Biomarker Story">
        <BiomarkerStory biomarkerNames={biomarkerNames} allBiomarkers={allBiomarkers} />
      </ErrorBoundary>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   COMPACT BUILDING BLOCKS (summary strip, changes list, recent activity)
   ───────────────────────────────────────────────────────────────────────── */
// "08_2026-07-10_Annual_Comprehensive_Health_Screen_—_Fin.pdf" -> "Annual Comprehensive Health Screen — Fin"
function prettyReportName(name = '') {
  const t = name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d+[_\s-]+/, '')
    .replace(/\d{4}-\d{2}-\d{2}[_\s-]*/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t || name
}

function Kpi({ label, value, sub, tone = 'neutral', action }) {
  const valueColor = tone === 'warn' ? 'text-amber-400' : tone === 'good' ? 'text-emerald-400' : 'text-white'
  return (
    <div className="card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-stone-400">{label}</span>
        {action}
      </div>
      <div className={`text-xl md:text-2xl font-bold font-mono tracking-tight mt-1 ${valueColor}`}>{value}</div>
      <div className="text-[11px] text-stone-500 truncate" title={typeof sub === 'string' ? sub : undefined}>{sub}</div>
    </div>
  )
}

function ChangesPanel({ movers, className = '' }) {
  const [all, setAll] = useState(false)
  const shown = all ? movers : movers.slice(0, 6)
  return (
    <section className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[13px] font-semibold text-white">Changes since your last report</h3>
        <span className="text-[11px] text-stone-500">{movers.length} changed</span>
      </div>
      {movers.length === 0 ? (
        <p className="text-xs text-stone-500 py-2">Upload a second report to see what changed.</p>
      ) : (
        <>
          <ul className="divide-y divide-white/[0.06]">
            {shown.map(c => (
              <li key={c.name} className="py-2 flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${c.out ? 'bg-amber-500' : 'bg-emerald-500'}`} title={c.out ? 'Outside reference range' : 'Within reference range'} />
                <span className="text-[13px] text-stone-100 flex-1 min-w-0 truncate">{c.name}</span>
                <span className="text-xs font-mono text-stone-400 shrink-0">
                  {c.previous.value} <ArrowRight size={10} className="inline text-stone-600" /> <b className="text-white">{c.latest.value}</b>
                  <span className="text-stone-500 hidden sm:inline"> {c.latest.unit}</span>
                </span>
                <span className={`text-[10px] font-mono font-semibold w-14 text-right shrink-0 ${c.pct > 0 ? 'text-sky-400' : 'text-violet-400'}`}>
                  {c.pct > 0 ? '▲' : '▼'} {Math.abs(c.pct).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between pt-2">
            <span className="text-[10px] text-stone-500 flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> outside range</span>
              <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> in range</span>
            </span>
            {movers.length > 6 && (
              <button onClick={() => setAll(a => !a)} className="text-[11px] text-brand-400 hover:text-brand-300">
                {all ? 'Show less' : `Show all ${movers.length}`}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function ActivityPanel({ events, upcomingTests, className = '' }) {
  const [all, setAll] = useState(false)
  const shown = all ? events : events.slice(0, 4)
  return (
    <section className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[13px] font-semibold text-white">Recent activity</h3>
        <a href="/care-plan" className="text-[11px] text-stone-500 hover:text-brand-400">Care plan →</a>
      </div>
      {upcomingTests?.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {upcomingTests.slice(0, 2).map(t => (
            <li key={t.id} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 bg-sky-500/10 border border-sky-500/20">
              <FlaskConical size={13} className="text-sky-400 shrink-0" />
              <span className="text-xs text-stone-100 flex-1 min-w-0 truncate">{t.test_name}</span>
              <span className="text-[10px] font-mono text-sky-400 shrink-0">Due {safeFormatDate(t.due_date, 'MMM d')}</span>
            </li>
          ))}
        </ul>
      )}
      {events.length === 0 ? (
        <p className="text-xs text-stone-500 py-2">Your activity will appear here as you add records.</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {shown.map((e, i) => {
            const Icon = e.icon
            return (
              <li key={i} className="py-2 flex items-center gap-2.5">
                <Icon size={14} className="text-stone-400 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-stone-100 truncate capitalize">{e.title}</span>
                  <span className="block text-[10px] text-stone-500">{e.type} · {e.subtitle}</span>
                </span>
                <span className="text-[10px] font-mono text-stone-500 shrink-0">{safeFormatDate(e.date, 'MMM d, yy')}</span>
              </li>
            )
          })}
        </ul>
      )}
      {events.length > 4 && (
        <button onClick={() => setAll(a => !a)} className="text-[11px] text-brand-400 hover:text-brand-300 pt-2">
          {all ? 'Show less' : `Show all ${events.length}`}
        </button>
      )}
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   ANOMALY ALERT BANNER
   ───────────────────────────────────────────────────────────────────────── */
function AnomalyAlertBanner({ anomalies, onDismiss }) {
  const hasHigh = anomalies.some(a => a.severity === 'high')
  return (
    <div className={`rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5 ${
      hasHigh ? 'bg-rose-500/[0.06] border-rose-500/30' : 'bg-amber-500/[0.06] border-amber-500/30'}`}>
      <div className="flex items-center gap-2 shrink-0">
        <ShieldAlert size={16} className={hasHigh ? 'text-rose-400' : 'text-amber-400'} />
        <span className="text-[13px] font-semibold text-white">
          {anomalies.length} unusual reading{anomalies.length > 1 ? 's' : ''}
        </span>
        <span className="text-[11px] text-stone-400 hidden md:inline">— far from your own usual level</span>
      </div>
      <div className="flex flex-wrap gap-1.5 flex-1">
        {anomalies.slice(0, 4).map((a, i) => (
          <span key={i} className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.04] text-stone-300">
            {a.name} <b className="font-mono text-white">{a.value}</b> · {safeFormatDate(a.recorded_at, 'MMM d, yy')}
          </span>
        ))}
        {anomalies.length > 4 && <span className="text-[11px] text-stone-500">+{anomalies.length - 4} more</span>}
      </div>
      <button onClick={onDismiss} className="text-stone-500 hover:text-white self-end sm:self-auto" aria-label="Dismiss"><X size={15} /></button>
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
      className="rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.15] transition-colors flex flex-col items-center cursor-pointer select-none relative"
      style={{ padding: '10px 6px 8px' }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="relative w-full flex flex-col items-center justify-center" style={{ height: 70 }}>
        <svg viewBox="0 0 100 58" className="w-full max-w-[6.5rem] h-14 overflow-visible">
          {/* Background track */}
          <path
            d="M 12 50 A 38 38 0 0 1 88 50"
            fill="none"
            stroke="currentColor"
            className="text-white/[0.08] dark:text-white/[0.07] stroke-stone-200 dark:stroke-white/[0.07]"
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
          color,
          borderColor: `${color}40`,
          background: `${color}12`,
        }}
      >
        {safeScore >= 67 ? 'High' : safeScore >= 34 ? 'Moderate' : 'Low'}
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
          className="absolute top-full left-0 right-0 z-30 mt-2 rounded-xl border p-3 space-y-1.5 shadow-2xl bg-white dark:bg-[#161a29]"
          style={{
            borderColor: `${color}40`,
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
                <span className="text-[10px] font-mono font-bold shrink-0" style={{ color }}>
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
    <section className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-white flex items-center gap-2"><ShieldCheck size={14} className="text-brand-400" /> Risk scores</h3>
          <p className="text-[11px] text-stone-500">Rule-based points (0–100) from your latest labs · tap a gauge to see why</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border px-3 py-1.5 shrink-0" style={{ background: `${overallColor}10`, borderColor: `${overallColor}30` }}>
          <span className="text-[10px] text-stone-500 uppercase tracking-wider">Overall</span>
          <span className="text-lg font-bold font-mono" style={{ color: overallColor }}>{overall}</span>
          <span className="text-[10px] font-bold uppercase" style={{ color: overallColor }}>{overall >= 67 ? 'High' : overall >= 34 ? 'Moderate' : 'Low'}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
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

      <p className="text-[10px] text-stone-500">
        <Info size={10} className="inline mr-1" />
        Informational estimates, not a diagnosis.
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
    <section className="space-y-4 pt-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-white flex items-center gap-2">
            <BarChart2 size={14} className="text-brand-400" /> Explore a biomarker
          </h3>
          <p className="text-[11px] text-stone-500">
            {biomarkerNames.length} tracked · pick one to see its history and trend
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
                      Linear trend · next 3 readings
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
