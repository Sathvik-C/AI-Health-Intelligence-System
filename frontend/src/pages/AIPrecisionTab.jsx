import { useCallback, useEffect, useRef, useState } from 'react'
import { LayoutList, Calculator, Pill, CalendarClock, Info } from 'lucide-react'
import api from '../utils/api'
import SkeletonLoader from '../components/SkeletonLoader'
import SummaryCard from '../components/ai/SummaryCard'
import OverviewSection from '../components/ai/OverviewSection'
import RiskSection from '../components/ai/RiskSection'
import MedicinesSection from '../components/ai/MedicinesSection'
import PlanSection from '../components/ai/PlanSection'
import ProfileModal from '../components/ai/ProfileModal'

/**
 * Tab 2 of the Dashboard — AI Insights & Precision Medicine.
 * UX: one-glance summary on top, then ONE section at a time (Overview · Risk checks ·
 * Medicines · Next steps). Details open on demand (rows expand, risk cards open a side sheet).
 *  - /precision/report   deterministic Python calculators
 *  - /ai-insights/       cached insights; /ai-insights/generate (rules) or ?use_ai=true (Gemini rewrite)
 */
export default function AIPrecisionTab() {
  const [report, setReport] = useState(null)
  const [reportError, setReportError] = useState('')
  const [insights, setInsights] = useState(null)
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [booting, setBooting] = useState(true)
  const [section, setSection] = useState('overview')
  const autoTried = useRef(false)

  const loadReport = useCallback(async () => {
    try {
      const r = await api.get('/precision/report')
      setReport(r.data)
      setReportError('')
    } catch (e) {
      setReportError(e.response?.data?.detail || 'Could not load your precision report.')
    }
  }, [])

  // Default: Python rules (instant, no Gemini call). useAi=true is the "Rewrite with AI" button.
  const generate = useCallback(async (force = false, useAi = false) => {
    setGenLoading(true)
    setGenError('')
    try {
      const r = await api.post('/ai-insights/generate', null, { params: { force, use_ai: useAi } })
      setInsights(r.data)
    } catch (e) {
      setGenError(e.response?.data?.detail || 'Could not generate insights.')
    } finally {
      setGenLoading(false)
    }
  }, [])

  useEffect(() => {
    (async () => {
      await loadReport()
      try {
        const r = await api.get('/ai-insights/')
        if (r.data?.insights) setInsights(r.data)
        else if (!autoTried.current && r.data?.facts_available > 1) {
          autoTried.current = true
          generate(false) // first visit: generate once automatically
        }
      } catch { /* the Generate button stays available */ }
      setBooting(false)
    })()
  }, [loadReport, generate])

  const onProfileSaved = async () => {
    await loadReport()
    setInsights(prev => (prev ? { ...prev, is_stale: true } : prev))
  }

  if (booting) return <SkeletonLoader rows={4} />

  const ins = insights?.insights
  const factsById = Object.fromEntries((insights?.facts || []).map(f => [f.id, f]))
  const attention = (ins?.key_findings || []).filter(f => f.severity === 'act' || f.severity === 'watch').length
  const riskFlags = (report?.calculators || []).filter(c => c.level === 'watch' || c.level === 'act').length
  const medFlags = report
    ? report.pharmacogenomics.interactions.filter(i => i.severity === 'high' || i.severity === 'moderate').length
      + report.drug_lab_checks.filter(c => c.severity === 'high' || c.severity === 'moderate').length
    : 0

  const SECTIONS = [
    { id: 'overview', label: 'Overview', short: 'Overview', icon: LayoutList, count: attention },
    { id: 'risk', label: 'Risk checks', short: 'Risks', icon: Calculator, count: riskFlags },
    { id: 'meds', label: 'Medicines', short: 'Meds', icon: Pill, count: medFlags },
    { id: 'plan', label: 'Next steps', short: 'Plan', icon: CalendarClock, count: report?.monitoring_plan?.length || 0, neutral: true },
  ]

  return (
    <div className="space-y-4">
      <SummaryCard
        data={insights}
        loading={genLoading}
        error={genError}
        onGenerate={generate}
        profile={report?.profile_completeness}
        onEditProfile={() => setProfileOpen(true)}
      />

      {/* Section switcher — sticks to the top while scrolling */}
      <nav
        role="tablist"
        aria-label="AI insights sections"
        className="ai-sticky-nav sticky top-0 z-20 -mx-1 px-1 py-2 bg-[#0b0d14]/90 backdrop-blur-md"
      >
        <div className="flex gap-1 p-1 rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-x-auto">
          {SECTIONS.map(({ id, label, short, icon: Icon, count, neutral }) => {
            const active = section === id
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                aria-label={label}
                onClick={() => setSection(id)}
                className={`flex-1 min-w-max flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  active ? 'bg-brand-500 text-white shadow-sm' : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.05]'
                }`}
              >
                <Icon size={13} className="hidden sm:block" /> <span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span>
                {count > 0 && (
                  <span className={`text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full inline-flex items-center justify-center ${
                    active ? 'bg-white/25 text-white' : neutral ? 'bg-white/[0.08] text-stone-300' : 'bg-amber-500/20 text-amber-400'
                  }`}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {reportError && <div className="card p-4 text-xs text-rose-300">{reportError}</div>}

      {report && (
        <div role="tabpanel">
          {section === 'overview' && <OverviewSection insights={ins} factsById={factsById} />}
          {section === 'risk' && <RiskSection report={report} insights={ins} factsById={factsById} onEditProfile={() => setProfileOpen(true)} />}
          {section === 'meds' && <MedicinesSection report={report} onEditProfile={() => setProfileOpen(true)} />}
          {section === 'plan' && <PlanSection report={report} insights={ins} />}
        </div>
      )}

      <p className="text-[10px] text-stone-500 text-center flex items-center justify-center gap-1 pt-2">
        <Info size={10} /> Educational support only — not a diagnosis. AI text can be wrong; check with your doctor.
      </p>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} onSaved={onProfileSaved} />
    </div>
  )
}
