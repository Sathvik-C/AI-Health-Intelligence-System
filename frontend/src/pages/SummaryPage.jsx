import { useState } from 'react'
import api from '../utils/api'
import { FileText, Loader, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info } from 'lucide-react'

export default function SummaryPage() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generateSummary = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/summary/generate')
      setSummary(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to generate summary')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Health Summary</h1>
        <p className="text-sm text-slate-400 mt-0.5">AI-generated overview of your health trends</p>
      </div>

      <div className="card flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-300 font-medium">Generate AI Summary</p>
          <p className="text-xs text-slate-400 mt-0.5">Analyzes all your biomarker history and highlights key trends</p>
        </div>
        <button onClick={generateSummary} disabled={loading} className="btn-primary flex items-center gap-2 shrink-0">
          {loading ? <><Loader size={14} className="animate-spin" /> Generating…</> : <><FileText size={14} /> Generate</>}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {summary && (
        <div className="space-y-4">
          {/* Overall */}
          {summary.overall_assessment && (
            <div className="card border-brand-500/30 bg-brand-500/5">
              <div className="flex items-center gap-2 mb-2">
                <Info size={15} className="text-brand-400" />
                <h2 className="text-sm font-semibold text-white">Overall Assessment</h2>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{summary.overall_assessment}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Improvements */}
            {summary.key_improvements?.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={15} className="text-emerald-400" />
                  <h2 className="text-sm font-semibold text-white">Key Improvements</h2>
                </div>
                <ul className="space-y-2">
                  {summary.key_improvements.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <TrendingUp size={12} className="text-emerald-400 mt-1 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Worsening */}
            {summary.worsening_indicators?.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={15} className="text-red-400" />
                  <h2 className="text-sm font-semibold text-white">Worsening Indicators</h2>
                </div>
                <ul className="space-y-2">
                  {summary.worsening_indicators.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <TrendingDown size={12} className="text-red-400 mt-1 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Risk Trends */}
            {summary.risk_trends?.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={15} className="text-amber-400" />
                  <h2 className="text-sm font-semibold text-white">Risk Trends</h2>
                </div>
                <ul className="space-y-2">
                  {summary.risk_trends.map((item, i) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-amber-400 mt-1 shrink-0">⚠</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Important Changes */}
            {summary.important_changes?.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Info size={15} className="text-blue-400" />
                  <h2 className="text-sm font-semibold text-white">Important Changes</h2>
                </div>
                <ul className="space-y-2">
                  {summary.important_changes.map((item, i) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                      <span className="text-blue-400 mt-1 shrink-0">→</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 text-center">
            ⚠️ This summary is for informational purposes only. Always consult a qualified healthcare provider for medical advice.
          </p>
        </div>
      )}
    </div>
  )
}
