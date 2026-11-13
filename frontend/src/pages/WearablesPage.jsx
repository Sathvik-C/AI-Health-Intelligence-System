import { useState, useEffect, useRef } from 'react'
import api from '../utils/api'
import {
  Watch,
  Heart,
  Flame,
  Footprints,
  Moon,
  Activity,
  ShieldAlert,
  RefreshCw,
  UploadCloud,
  FileText,
  Sparkles,
  PlusCircle,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  Calendar,
  Zap,
  TrendingUp,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import SkeletonLoader from '../components/SkeletonLoader'
import EmptyState from '../components/EmptyState'

export default function WearablesPage() {
  const [summary, setSummary] = useState(null)
  const [trends, setTrends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [days, setDays] = useState(30)

  // Import Modal & Actions State
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importTab, setImportTab] = useState('upload') // 'upload' | 'sample' | 'manual'
  const [selectedFile, setSelectedFile] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionMessage, setActionMessage] = useState(null) // { type: 'success' | 'error', text: '' }
  const fileInputRef = useRef(null)

  // Manual Entry Form State
  const [manualForm, setManualForm] = useState({
    date: new Date().toISOString().split('T')[0],
    steps: 8500,
    resting_heart_rate: 68,
    sleep_hours: 7.5,
    calories_burned: 2200,
    distance_km: 6.5,
    active_minutes: 50,
    activity_type: 'Walking',
  })

  // Sample Generator State
  const [sampleDays, setSampleDays] = useState(60)

  useEffect(() => {
    loadWearableData(days)
  }, [days])

  const loadWearableData = async (targetDays = days) => {
    setLoading(true)
    setError(false)
    try {
      const [sumRes, trendRes] = await Promise.all([
        api.get('/wearable/summary').catch(() => ({ data: null })),
        api.get('/wearable/trends', { params: { days: targetDays } }).catch(() => ({ data: [] })),
      ])

      setSummary(sumRes.data)
      setTrends(trendRes.data || [])
    } catch (e) {
      console.error('Failed to load wearable data:', e)
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  // Handle File Upload
  const handleFileUpload = async (e) => {
    e.preventDefault()
    if (!selectedFile) {
      setActionMessage({ type: 'error', text: 'Please select a CSV or JSON file to upload.' })
      return
    }

    setIsSubmitting(true)
    setActionMessage(null)

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const res = await api.post('/wearable/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setActionMessage({
        type: 'success',
        text: res.data.message || 'Wearables data successfully imported!',
      })
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadWearableData()
      setTimeout(() => {
        setIsImportOpen(false)
        setActionMessage(null)
      }, 1600)
    } catch (err) {
      console.error(err)
      setActionMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to import file. Please check the file formatting.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Sample Data Generation
  const handleGenerateSample = async () => {
    setIsSubmitting(true)
    setActionMessage(null)
    try {
      const res = await api.post('/wearable/sample', null, {
        params: { days: sampleDays },
      })
      setActionMessage({
        type: 'success',
        text: res.data.message || `Generated ${sampleDays} days of sample wearable data.`,
      })
      await loadWearableData()
      setTimeout(() => {
        setIsImportOpen(false)
        setActionMessage(null)
      }, 1600)
    } catch (err) {
      console.error(err)
      setActionMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to generate sample data.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Single Manual Entry
  const handleManualSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setActionMessage(null)

    try {
      const res = await api.post('/wearable/entry', {
        date: manualForm.date,
        steps: Number(manualForm.steps) || 0,
        resting_heart_rate: Number(manualForm.resting_heart_rate) || 68,
        sleep_hours: Number(manualForm.sleep_hours) || 7.0,
        calories_burned: Number(manualForm.calories_burned) || 2000,
        distance_km: Number(manualForm.distance_km) || 5.0,
        active_minutes: Number(manualForm.active_minutes) || 45,
        activity_type: manualForm.activity_type || 'Walking',
      })
      setActionMessage({
        type: 'success',
        text: res.data.message || 'Daily wearable entry recorded successfully.',
      })
      await loadWearableData()
      setTimeout(() => {
        setIsImportOpen(false)
        setActionMessage(null)
      }, 1400)
    } catch (err) {
      console.error(err)
      setActionMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to save daily entry.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Download Template
  const handleDownloadTemplate = () => {
    window.open(`${api.defaults.baseURL || ''}/wearable/template`, '_blank')
  }

  // Handle Clear Wearables Data
  const handleClearData = async () => {
    if (!window.confirm('Are you sure you want to delete all synchronized wearable data? This cannot be undone.')) {
      return
    }

    try {
      await api.delete('/wearable/clear')
      setSummary(null)
      setTrends([])
      await loadWearableData()
    } catch (err) {
      console.error(err)
      alert('Failed to clear wearable data.')
    }
  }

  if (loading && !summary && trends.length === 0) {
    return (
      <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-white/5 rounded animate-pulse" />
        <SkeletonLoader rows={3} />
      </div>
    )
  }

  const hasWearableData = Boolean(summary || (trends && trends.length > 0))

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.07] pb-5">
        <div>
          <div className="flex items-center gap-2 text-sky-400 text-xs font-mono font-medium tracking-wider uppercase mb-1">
            <Watch size={14} /> Supporting Lifestyle Data
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Lifestyle History</h1>
          <p className="text-sm text-stone-400 mt-1">
            Longitudinal background context from Apple Health, Garmin, Fitbit, and passive wearable sensors.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => {
              setIsImportOpen(true)
              setActionMessage(null)
            }}
            className="btn-primary text-xs px-3.5 py-2 flex items-center gap-2"
          >
            <UploadCloud size={14} /> Import Wearables
          </button>

          <button
            onClick={() => loadWearableData()}
            className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
            title="Refresh current metrics"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Sync
          </button>

          {hasWearableData && (
            <button
              onClick={handleClearData}
              className="p-2 rounded-lg border border-rose-500/20 text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
              title="Clear all wearable data"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Critical Health Boundary Disclaimer Box */}
      <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-4 flex items-start gap-3 text-xs text-sky-300/90 leading-relaxed">
        <ShieldAlert size={18} className="text-sky-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-sky-300 mr-1">Lifestyle Context Guidance:</span>
          Wearable data provides secondary lifestyle context (rest, daily steps, baseline heart rate). Wearable metrics are not diagnostic indicators and are never used by HealthIQ to infer medical conditions or disease causation.
        </div>
      </div>

      {!hasWearableData ? (
        <div className="card p-10 border-dashed border-white/10 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mx-auto shadow-inner">
            <Watch size={28} />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-semibold text-white tracking-tight">No Wearable History Synchronized</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Import export files from Apple Health, Fitbit, Garmin, or Google Fit to track lifestyle context alongside clinical laboratory records.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
            <button
              onClick={() => {
                setImportTab('upload')
                setIsImportOpen(true)
              }}
              className="btn-primary text-xs px-4 py-2.5 flex items-center gap-2"
            >
              <UploadCloud size={14} /> Import CSV / JSON File
            </button>
            <button
              onClick={() => {
                setImportTab('sample')
                setIsImportOpen(true)
              }}
              className="btn-secondary text-xs px-4 py-2.5 flex items-center gap-2"
            >
              <Sparkles size={14} className="text-amber-400" /> Generate Demo Dataset
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="p-2.5 rounded-lg border border-white/10 text-stone-400 hover:text-white hover:bg-white/5 text-xs flex items-center gap-1.5"
            >
              <Download size={13} /> Sample Template
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Section: Latest Metrics Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5 border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider">Resting Heart Rate</span>
                <Heart size={16} className="text-rose-400" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-white">
                  {summary?.resting_heart_rate || '—'}
                </span>
                <span className="text-xs text-stone-400">bpm</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-stone-500">
                <span>Avg: {summary?.average_heart_rate ? `${summary.average_heart_rate} bpm` : '—'}</span>
                <span>Max: {summary?.max_heart_rate ? `${summary.max_heart_rate} bpm` : '—'}</span>
              </div>
            </div>

            <div className="card p-5 border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider">Sleep Duration</span>
                <Moon size={16} className="text-indigo-400" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-white">
                  {summary?.sleep_hours !== undefined ? summary.sleep_hours : '—'}
                </span>
                <span className="text-xs text-stone-400">hrs/night</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-stone-500">
                <span>Deep: {summary?.deep_sleep_hours || '1.6'}h</span>
                <span>REM: {summary?.rem_sleep_hours || '1.5'}h</span>
              </div>
            </div>

            <div className="card p-5 border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider">Daily Movement</span>
                <Footprints size={16} className="text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-white">
                  {summary?.steps ? Number(summary.steps).toLocaleString() : '—'}
                </span>
                <span className="text-xs text-stone-400">steps</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-stone-500">
                <span>{summary?.distance_km ? `${summary.distance_km} km` : '—'}</span>
                <span>{summary?.active_minutes ? `${summary.active_minutes} min active` : '—'}</span>
              </div>
            </div>

            <div className="card p-5 border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider">Total Calories</span>
                <Flame size={16} className="text-amber-400" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono text-white">
                  {summary?.calories_burned ? Number(summary.calories_burned).toLocaleString() : '—'}
                </span>
                <span className="text-xs text-stone-400">kcal/day</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-stone-500">
                <span>Activity: {summary?.activity_type || 'Walking'}</span>
                <span>{summary?.date || ''}</span>
              </div>
            </div>
          </div>

          {/* Section: Trend Horizon Selector & Historical Charts */}
          {trends.length > 0 && (
            <div className="space-y-6">
              {/* Controls bar */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">Longitudinal Sensor Trends</h2>
                  <p className="text-xs text-stone-400 mt-0.5">Continuous passive sensor readings over your chosen window</p>
                </div>

                <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg p-1 text-xs">
                  {[7, 14, 30, 60, 90].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDays(d)}
                      className={`px-3 py-1 rounded-md font-mono text-xs transition-all ${
                        days === d
                          ? 'bg-sky-500 text-white font-medium shadow-sm'
                          : 'text-stone-400 hover:text-white'
                      }`}
                    >
                      {d}D
                    </button>
                  ))}
                </div>
              </div>

              {/* Heart Rate Trend Chart */}
              <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                  <div className="flex items-center gap-2">
                    <Heart size={16} className="text-rose-400" />
                    <div>
                      <h3 className="text-sm font-semibold text-white">Resting & Peak Heart Rate</h3>
                      <p className="text-[11px] text-stone-400">Baseline resting heart rate (bpm) vs daily maximum</p>
                    </div>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} />
                      <YAxis domain={['auto', 'auto']} tick={{ fill: '#71717a', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          background: '#121520',
                          borderColor: 'rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: '#a1a1aa', fontSize: '11px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Line
                        type="monotone"
                        dataKey="resting_heart_rate"
                        stroke="#f43f5e"
                        strokeWidth={2}
                        dot={false}
                        name="Resting HR (bpm)"
                      />
                      <Line
                        type="monotone"
                        dataKey="average_heart_rate"
                        stroke="#38bdf8"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        name="Average HR (bpm)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Steps and Active Volume Chart */}
              <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                  <div className="flex items-center gap-2">
                    <Footprints size={16} className="text-emerald-400" />
                    <div>
                      <h3 className="text-sm font-semibold text-white">Daily Steps & Activity Volume</h3>
                      <p className="text-[11px] text-stone-400">Step count with 8,000 steps baseline guide</p>
                    </div>
                  </div>
                </div>

                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#71717a', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          background: '#121520',
                          borderColor: 'rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: '#a1a1aa', fontSize: '11px' }}
                      />
                      <Bar dataKey="steps" fill="#10b981" radius={[4, 4, 0, 0]} name="Steps Count" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Sleep Duration Chart */}
              <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
                  <div className="flex items-center gap-2">
                    <Moon size={16} className="text-indigo-400" />
                    <div>
                      <h3 className="text-sm font-semibold text-white">Sleep Duration & Quality</h3>
                      <p className="text-[11px] text-stone-400">Total sleep hours per night</p>
                    </div>
                  </div>
                </div>

                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} />
                      <YAxis domain={[4, 10]} tick={{ fill: '#71717a', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          background: '#121520',
                          borderColor: 'rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: '#a1a1aa', fontSize: '11px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Line
                        type="monotone"
                        dataKey="sleep_hours"
                        stroke="#818cf8"
                        strokeWidth={2}
                        dot={false}
                        name="Total Sleep (hrs)"
                      />
                      <Line
                        type="monotone"
                        dataKey="deep_sleep_hours"
                        stroke="#6366f1"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        dot={false}
                        name="Deep Sleep (hrs)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== IMPORT WEARABLES MODAL ===================== */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="card w-full max-w-xl bg-[#121520] border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                  <Watch size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Import Wearable Health Data</h3>
                  <p className="text-xs text-stone-400">Connect files from Apple Health, Garmin, Fitbit, or custom export</p>
                </div>
              </div>
              <button
                onClick={() => setIsImportOpen(false)}
                className="text-stone-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-white/[0.08] px-5 bg-white/[0.02]">
              <button
                onClick={() => {
                  setImportTab('upload')
                  setActionMessage(null)
                }}
                className={`py-3 px-4 text-xs font-medium border-b-2 transition-all flex items-center gap-2 ${
                  importTab === 'upload'
                    ? 'border-sky-500 text-sky-400'
                    : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                <UploadCloud size={14} /> File Upload (CSV/JSON)
              </button>
              <button
                onClick={() => {
                  setImportTab('sample')
                  setActionMessage(null)
                }}
                className={`py-3 px-4 text-xs font-medium border-b-2 transition-all flex items-center gap-2 ${
                  importTab === 'sample'
                    ? 'border-sky-500 text-sky-400'
                    : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                <Sparkles size={14} /> 1-Click Demo Dataset
              </button>
              <button
                onClick={() => {
                  setImportTab('manual')
                  setActionMessage(null)
                }}
                className={`py-3 px-4 text-xs font-medium border-b-2 transition-all flex items-center gap-2 ${
                  importTab === 'manual'
                    ? 'border-sky-500 text-sky-400'
                    : 'border-transparent text-stone-400 hover:text-stone-200'
                }`}
              >
                <PlusCircle size={14} /> Single Entry
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {actionMessage && (
                <div
                  className={`p-3.5 rounded-lg text-xs flex items-center gap-2.5 ${
                    actionMessage.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                  }`}
                >
                  {actionMessage.type === 'success' ? (
                    <CheckCircle2 size={16} className="shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="shrink-0" />
                  )}
                  <span>{actionMessage.text}</span>
                </div>
              )}

              {/* TAB 1: FILE UPLOAD */}
              {importTab === 'upload' && (
                <form onSubmit={handleFileUpload} className="space-y-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                      selectedFile
                        ? 'border-sky-500/50 bg-sky-500/5'
                        : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.json,.tsv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setSelectedFile(e.target.files[0])
                          setActionMessage(null)
                        }
                      }}
                    />

                    <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto mb-3">
                      <UploadCloud size={24} />
                    </div>

                    {selectedFile ? (
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">{selectedFile.name}</p>
                        <p className="text-xs text-stone-400">
                          {(selectedFile.size / 1024).toFixed(1)} KB • Ready to import
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-stone-200">
                          Drop your wearable export file here, or <span className="text-sky-400 underline">browse</span>
                        </p>
                        <p className="text-xs text-stone-400">
                          Supports Apple Health, Fitbit, Garmin, Google Fit, Whoop (.CSV or .JSON up to 25MB)
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-400 pt-1">
                    <span>Need the standard CSV structure?</span>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="text-sky-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <Download size={12} /> Download Sample CSV Template
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={!selectedFile || isSubmitting}
                    className="btn-primary w-full py-2.5 text-xs font-medium uppercase font-mono tracking-wider disabled:opacity-50"
                  >
                    {isSubmitting ? 'Importing Data...' : 'Upload & Process Wearables'}
                  </button>
                </form>
              )}

              {/* TAB 2: SAMPLE DATA GENERATOR */}
              {importTab === 'sample' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 leading-relaxed space-y-1.5">
                    <p className="font-semibold text-amber-200 flex items-center gap-1.5">
                      <Sparkles size={14} /> Instant Realistic Demonstration
                    </p>
                    <p>
                      Generates coherent longitudinal wearable data simulating Apple Watch / Garmin metrics
                      with continuous steps, circadian resting heart rate rhythms, and sleep architecture ending at today.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="label">Timeline Horizon</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[30, 60, 90].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setSampleDays(d)}
                          className={`p-3 rounded-lg border text-xs font-mono font-semibold transition-all ${
                            sampleDays === d
                              ? 'border-sky-500 bg-sky-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-stone-400 hover:text-white'
                          }`}
                        >
                          {d} Days History
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateSample}
                    disabled={isSubmitting}
                    className="btn-primary w-full py-2.5 text-xs font-medium uppercase font-mono tracking-wider"
                  >
                    {isSubmitting ? 'Generating Dataset...' : `Generate ${sampleDays}-Day Wearable Dataset`}
                  </button>
                </div>
              )}

              {/* TAB 3: SINGLE MANUAL ENTRY */}
              {importTab === 'manual' && (
                <form onSubmit={handleManualSubmit} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Log Date</label>
                      <input
                        type="date"
                        required
                        className="input text-xs font-mono"
                        value={manualForm.date}
                        onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="label">Primary Activity</label>
                      <select
                        className="input text-xs"
                        value={manualForm.activity_type}
                        onChange={(e) => setManualForm({ ...manualForm, activity_type: e.target.value })}
                      >
                        <option value="Walking">Walking</option>
                        <option value="Running">Running</option>
                        <option value="Cycling">Cycling</option>
                        <option value="Gym">Gym Workout</option>
                        <option value="Yoga">Yoga</option>
                        <option value="Rest">Rest Day</option>
                      </select>
                    </div>

                    <div>
                      <label className="label">Daily Steps</label>
                      <input
                        type="number"
                        required
                        className="input text-xs font-mono"
                        placeholder="8500"
                        value={manualForm.steps}
                        onChange={(e) => setManualForm({ ...manualForm, steps: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="label">Resting HR (bpm)</label>
                      <input
                        type="number"
                        required
                        className="input text-xs font-mono"
                        placeholder="68"
                        value={manualForm.resting_heart_rate}
                        onChange={(e) => setManualForm({ ...manualForm, resting_heart_rate: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="label">Sleep Duration (hrs)</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        className="input text-xs font-mono"
                        placeholder="7.5"
                        value={manualForm.sleep_hours}
                        onChange={(e) => setManualForm({ ...manualForm, sleep_hours: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="label">Calories Burned (kcal)</label>
                      <input
                        type="number"
                        required
                        className="input text-xs font-mono"
                        placeholder="2200"
                        value={manualForm.calories_burned}
                        onChange={(e) => setManualForm({ ...manualForm, calories_burned: e.target.value })}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn-primary w-full py-2.5 text-xs font-medium uppercase font-mono tracking-wider mt-2"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Wearable Entry'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
