import { useState, useEffect } from 'react'
import api from '../utils/api'
import { Sparkles, Download, Loader, AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp, ShieldAlert, FileText } from 'lucide-react'
import SkeletonLoader from '../components/SkeletonLoader'
import EmptyState from '../components/EmptyState'

export default function HealthInsights() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [showSupporting, setShowSupporting] = useState(false)
  const [biomarkers, setBiomarkers] = useState([])

  useEffect(() => {
    loadSupportingBiomarkers()
  }, [])

  const loadSupportingBiomarkers = async () => {
    try {
      const res = await api.get('/biomarkers/')
      setBiomarkers(res.data || [])
    } catch (e) {
      console.error(e)
    }
  }

  const generateInsights = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/summary/generate')
      setSummary(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to generate health insights summary.')
    } finally {
      setLoading(false)
    }
  }

  const downloadPDF = async () => {
    if (!summary) return
    setDownloading(true)
    setError('')
    try {
      const res = await api.post('/summary/export_pdf', summary, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'HealthIQ_Insights_Summary.pdf')
      document.body.appendChild(link)
      link.click()
      link.parentNode.removeChild(link)
    } catch (e) {
      setError('Failed to download PDF summary report.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.07] pb-5">
        <div>
          <div className="flex items-center gap-2 text-brand-400 text-xs font-mono font-medium tracking-wider uppercase mb-1">
            <Sparkles size={14} /> Deep Intelligence Synthesis
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Health Insights</h1>
          <p className="text-sm text-stone-400 mt-1">
            Comprehensive multi-dimensional analysis of your longitudinal biomarker history.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {summary && (
            <button
              onClick={downloadPDF}
              disabled={downloading}
              className="btn-secondary text-xs px-3.5 py-2"
            >
              {downloading ? <Loader size={13} className="animate-spin" /> : <Download size={13} />} Export PDF
            </button>
          )}

          <button
            onClick={generateInsights}
            disabled={loading}
            className="btn-primary text-xs px-4 py-2"
          >
            {loading ? (
              <><Loader size={14} className="animate-spin" /> Analyzing History...</>
            ) : (
              <><Sparkles size={14} /> Synthesize Insights</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl text-xs bg-rose-500/10 text-rose-300 border border-rose-500/20 flex items-center gap-3">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!summary && !loading && (
        <EmptyState
          icon={Sparkles}
          title="Synthesize deeper health intelligence"
          description="Click 'Synthesize Insights' to run a longitudinal synthesis over your complete health history."
          action={generateInsights}
          actionLabel="Generate Health Insights"
        />
      )}

      {loading && (
        <SkeletonLoader rows={4} />
      )}

      {summary && !loading && (
        <div className="space-y-8">
          {/* Overall Narrative Assessment Card */}
          {summary.overall_assessment && (
            <div className="card bg-gradient-to-br from-brand-500/10 via-surface-100 to-surface-200 border-brand-500/30 p-6 space-y-2">
              <div className="flex items-center gap-2 text-brand-400 font-mono text-xs font-bold uppercase tracking-wider">
                <Info size={15} /> Longitudinal Health Assessment
              </div>
              <p className="text-sm md:text-base text-stone-100 leading-relaxed font-medium">
                {summary.overall_assessment}
              </p>
            </div>
          )}

          {/* 4 MANDATORY INTELLIGENCE SECTIONS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* 1. WHAT CHANGED */}
            <div className="card p-5 space-y-4 border-white/[0.08]">
              <div className="flex items-center gap-2.5 border-b border-white/[0.07] pb-3">
                <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400">
                  <Info size={16} />
                </div>
                <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                  WHAT CHANGED
                </h2>
              </div>

              {summary.important_changes?.length > 0 ? (
                <ul className="space-y-2.5 text-xs text-stone-300 leading-relaxed">
                  {summary.important_changes.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 bg-white/[0.02] p-3 rounded-lg border border-white/[0.04]">
                      <span className="text-brand-400 font-bold shrink-0 mt-0.5">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-stone-500">No major changes detected across recent reports.</p>
              )}
            </div>


            {/* 2. WHAT IMPROVED */}
            <div className="card p-5 space-y-4 border-white/[0.08]">
              <div className="flex items-center gap-2.5 border-b border-white/[0.07] pb-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 size={16} />
                </div>
                <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                  WHAT IMPROVED
                </h2>
              </div>

              {summary.key_improvements?.length > 0 ? (
                <ul className="space-y-2.5 text-xs text-stone-300 leading-relaxed">
                  {summary.key_improvements.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 bg-white/[0.02] p-3 rounded-lg border border-white/[0.04]">
                      <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-stone-500">No test has improved yet — or there is only one report so far.</p>
              )}
            </div>


            {/* 3. WHAT DESERVES ATTENTION */}
            <div className="card p-5 space-y-4 border-white/[0.08]">
              <div className="flex items-center gap-2.5 border-b border-white/[0.07] pb-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <AlertTriangle size={16} />
                </div>
                <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                  WHAT DESERVES ATTENTION
                </h2>
              </div>

              {summary.worsening_indicators?.length > 0 ? (
                <ul className="space-y-2.5 text-xs text-stone-300 leading-relaxed">
                  {summary.worsening_indicators.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 bg-amber-500/[0.03] p-3 rounded-lg border border-amber-500/10">
                      <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-stone-500">No elevated risk indicators detected.</p>
              )}
            </div>


            {/* 4. WHAT SHOULD I UNDERSTAND */}
            <div className="card p-5 space-y-4 border-white/[0.08]">
              <div className="flex items-center gap-2.5 border-b border-white/[0.07] pb-3">
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                  <Sparkles size={16} />
                </div>
                <h2 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
                  WHAT SHOULD I UNDERSTAND
                </h2>
              </div>

              {summary.risk_trends?.length > 0 ? (
                <ul className="space-y-2.5 text-xs text-stone-300 leading-relaxed">
                  {summary.risk_trends.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 bg-white/[0.02] p-3 rounded-lg border border-white/[0.04]">
                      <span className="text-sky-400 font-bold shrink-0 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-stone-500">Maintain routine health monitoring and consult your provider.</p>
              )}
            </div>

          </div>

          {/* Toggleable Supporting Data */}
          <div className="pt-2 space-y-3">
            <button
              onClick={() => setShowSupporting(!showSupporting)}
              className="btn-secondary w-full justify-between text-xs py-2.5"
            >
              <span className="flex items-center gap-2 font-mono">
                <FileText size={14} className="text-brand-400" /> View Supporting Biomarker Data ({biomarkers.length} Data Points)
              </span>
              {showSupporting ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showSupporting && (
              <div className="card p-5 bg-[#0d0f17] border-white/10 space-y-3 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-white/10 text-stone-400 font-mono">
                      <th className="py-2 pr-4">Biomarker</th>
                      <th className="py-2 pr-4 text-right">Value</th>
                      <th className="py-2 pr-4 text-right">Unit</th>
                      <th className="py-2 text-right">Reference Range</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {biomarkers.map((b, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-2 pr-4 text-white font-medium">{b.name}</td>
                        <td className="py-2 pr-4 text-right font-mono font-bold text-brand-300">{b.value}</td>
                        <td className="py-2 pr-4 text-right text-stone-400">{b.unit}</td>
                        <td className="py-2 text-right text-stone-400 font-mono">
                          {b.ref_min != null && b.ref_max != null ? `${b.ref_min} – ${b.ref_max}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
