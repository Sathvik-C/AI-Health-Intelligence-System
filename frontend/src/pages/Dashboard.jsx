import { useState, useEffect } from 'react'
import api from '../utils/api'
import GaugeMeter from '../components/GaugeMeter'
import BiomarkerChart from '../components/BiomarkerChart'
import { AlertTriangle, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

function TrendIndicator({ values }) {
  if (!values || values.length < 2) return <Minus size={14} className="text-slate-500" />
  const last = values[values.length - 1]
  const prev = values[values.length - 2]
  const pct = ((last - prev) / prev * 100).toFixed(1)
  if (last > prev) return <span className="flex items-center gap-1 text-red-400 text-xs"><TrendingUp size={14} />+{pct}%</span>
  if (last < prev) return <span className="flex items-center gap-1 text-emerald-400 text-xs"><TrendingDown size={14} />{pct}%</span>
  return <span className="flex items-center gap-1 text-slate-400 text-xs"><Minus size={14} />0%</span>
}

function statusColor(value, refMin, refMax) {
  if (refMin === null && refMax === null) return ''
  if ((refMax && value > refMax) || (refMin && value < refMin)) return 'risk-red'
  const warnHigh = refMax && value > refMax * 0.9
  const warnLow = refMin && value < refMin * 1.1
  if (warnHigh || warnLow) return 'risk-yellow'
  return 'risk-green'
}

export default function Dashboard() {
  const [biomarkerNames, setBiomarkerNames] = useState([])
  const [selectedBiomarker, setSelectedBiomarker] = useState('')
  const [biomarkers, setBiomarkers] = useState([])
  const [forecast, setForecast] = useState(null)
  const [riskScores, setRiskScores] = useState(null)
  const [anomalies, setAnomalies] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const [doctorMode, setDoctorMode] = useState(false)

  useEffect(() => {
    if (user)loadData()
  }, [])

  useEffect(() => {
    if (selectedBiomarker) {
      loadBiomarkersForName()
      loadForecast()
    }
  }, [selectedBiomarker])

  const loadData = async () => {
    setLoading(true)
    try {
      const [namesRes, riskRes, anomalyRes] = await Promise.all([
        api.get('/biomarkers/names'),
        api.get('/biomarkers/risk-scores'),
        api.get('/biomarkers/anomalies'),
      ])
      setBiomarkerNames(namesRes.data)
      setRiskScores(riskRes.data)
      setAnomalies(anomalyRes.data)
      if (namesRes.data.length > 0) setSelectedBiomarker(namesRes.data[0])
    } catch (e) {}
    setLoading(false)
  }

  const loadBiomarkersForName = async () => {
    try {
      const res = await api.get('/biomarkers', { params: { name: selectedBiomarker } })
      setBiomarkers(res.data)
    } catch (e) {}
  }

  const loadForecast = async () => {
    try {
      const res = await api.get(`/biomarkers/forecast/${encodeURIComponent(selectedBiomarker)}`)
      setForecast(res.data)
    } catch (e) {
      setForecast(null)
    }
  }

  const latestByName = {}
  biomarkers.forEach(b => {
    if (!latestByName[b.name] || new Date(b.recorded_at) > new Date(latestByName[b.name].recorded_at)) {
      latestByName[b.name] = b
    }
  })

  const anomalyIds = new Set(anomalies.filter(a => a.name === selectedBiomarker).map(a => a.biomarker_id))
  const chartHistorical = (forecast?.historical || [])
  const refMin = biomarkers[0]?.ref_min
  const refMax = biomarkers[0]?.ref_max
  const unit = biomarkers[0]?.unit

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Health Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Your health at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDoctorMode(d => !d)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              doctorMode ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            👨‍⚕️ Doctor Mode {doctorMode ? 'ON' : 'OFF'}
          </button>
          <button onClick={loadData} className="btn-ghost flex items-center gap-2">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-500">Loading…</div>
      ) : biomarkerNames.length === 0 ? (
        <div className="card text-center py-12 text-slate-400">
          <p className="text-lg mb-2">No health data yet</p>
          <p className="text-sm">Upload a lab report or add manual logs to get started.</p>
        </div>
      ) : (
        <>
          {/* Anomaly alerts */}
          {anomalies.length > 0 && (
            <div className="flex items-start gap-3 bg-red-400/10 border border-red-400/20 rounded-xl p-4">
              <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-medium text-red-300">Anomalies Detected</p>
                <p className="text-xs text-red-400/80 mt-0.5">
                  {anomalies.map(a => `${a.name} (z=${a.z_score})`).join(' · ')}
                </p>
              </div>
            </div>
          )}

          {/* Risk Scores */}
          {riskScores && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="card flex flex-col items-center py-6">
                <GaugeMeter score={riskScores.diabetes?.score || 0} label="Diabetes Risk" size={140} />
                {!doctorMode && riskScores.diabetes?.factors?.length > 0 && (
                  <div className="mt-4 w-full space-y-1">
                    {riskScores.diabetes.factors.map(f => (
                      <div key={f.name} className="flex justify-between text-xs text-slate-400">
                        <span>{f.name}</span>
                        <span className="font-mono">{f.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="card flex flex-col items-center py-6">
                <GaugeMeter score={riskScores.cardiovascular?.score || 0} label="Cardio Risk" size={140} />
                {!doctorMode && riskScores.cardiovascular?.factors?.length > 0 && (
                  <div className="mt-4 w-full space-y-1">
                    {riskScores.cardiovascular.factors.map(f => (
                      <div key={f.name} className="flex justify-between text-xs text-slate-400">
                        <span>{f.name}</span>
                        <span className="font-mono">{f.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Biomarker Chart */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Biomarker Trend</h2>
              <select
                value={selectedBiomarker}
                onChange={e => setSelectedBiomarker(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-sm text-white rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {biomarkerNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <BiomarkerChart
              historical={chartHistorical}
              forecast={forecast?.forecast || []}
              refMin={refMin}
              refMax={refMax}
              unit={unit}
              anomalyIds={[...anomalyIds]}
            />

            {forecast?.warning && (
              <div className="mt-3 flex items-center gap-2 text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2 text-xs border border-amber-400/20">
                <AlertTriangle size={13} /> {forecast.warning}
              </div>
            )}
          </div>

          {/* Summary table (doctor mode especially) */}
          <div className="card overflow-x-auto">
            <h2 className="text-sm font-semibold text-white mb-3">All Biomarkers — Latest Values</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left py-2 pr-4 font-medium">Biomarker</th>
                  <th className="text-right py-2 pr-4 font-medium">Value</th>
                  <th className="text-right py-2 pr-4 font-medium">Unit</th>
                  <th className="text-right py-2 pr-4 font-medium">Ref Range</th>
                  <th className="text-right py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {biomarkerNames.map(name => {
                  const bm = biomarkers.filter(b => b.name === name)
                  const latest = bm[bm.length - 1]
                  if (!latest) return null
                  const sc = statusColor(latest.value, latest.ref_min, latest.ref_max)
                  return (
                    <tr key={name} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="py-2 pr-4 text-slate-200">{name}</td>
                      <td className="py-2 pr-4 text-right font-mono font-semibold text-white">{latest.value}</td>
                      <td className="py-2 pr-4 text-right text-slate-400">{latest.unit}</td>
                      <td className="py-2 pr-4 text-right text-slate-400">
                        {latest.ref_min != null && latest.ref_max != null ? `${latest.ref_min} – ${latest.ref_max}` : '–'}
                      </td>
                      <td className="py-2 text-right">
                        {sc && (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${sc}`}>
                            {sc === 'risk-green' ? 'Normal' : sc === 'risk-yellow' ? 'Borderline' : 'Critical'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
