import { useState, useEffect } from 'react'
import api from '../utils/api'
import {
  FileSearch,
  Upload,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Loader,
  Layers,
  Activity,
} from 'lucide-react'
import EmptyState from '../components/EmptyState'

const SESSION_KEY = 'latest_ecg_analysis'

// Order of the groups on the page
const CATEGORY_ORDER = ['Rhythm', 'Conduction']

const LEVEL_STYLE = {
  high: 'risk-red',
  moderate: 'risk-yellow',
  not_detected: 'risk-green',
}

// Renders the patient summary: short heading lines in bold, "- " lines as a list
function SummaryText({ text }) {
  if (!text) return null
  const blocks = text.split(/\n\s*\n/)

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter(Boolean)
        const first = lines[0] || ''
        const isHeading =
          lines.length > 1 && first.length < 60 && !/[.:?]$/.test(first)
        const rest = isHeading ? lines.slice(1) : lines

        return (
          <div key={i} className="space-y-1">
            {isHeading && <div className="text-sm font-semibold text-white">{first}</div>}
            {rest.map((line, j) =>
              line.startsWith('- ') ? (
                <div key={j} className="text-sm text-stone-300 leading-relaxed pl-3">
                  • {line.slice(2)}
                </div>
              ) : (
                <p key={j} className="text-sm text-stone-300 leading-relaxed">
                  {line}
                </p>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ECGReport() {
  const [analysisData, setAnalysisData] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [filename, setFilename] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [showTechnical, setShowTechnical] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setAnalysisData(parsed.data)
        setFilename(parsed.filename)
      } catch (e) {
        console.error(e)
      }
    }
  }, [])

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setUploading(true)
    setError('')
    setFilename(file.name)
    setPreviewUrl(URL.createObjectURL(file))

    const fd = new FormData()
    fd.append('file', file)

    try {
      const res = await api.post('/ecg/analyze', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAnalysisData(res.data)
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ filename: file.name, data: res.data })
      )
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          'ECG analysis failed. Make sure the file is a clear ECG image.'
      )
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  // Group all six observations by category
  const grouped = {}
  ;(analysisData?.observations || []).forEach((obs) => {
    const cat = obs.category || 'Other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(obs)
  })
  const categories = [
    ...CATEGORY_ORDER.filter((c) => grouped[c]),
    ...Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c)),
  ]

  const status = analysisData?.summary?.status
  const statusLabel =
    status === 'attention'
      ? 'Attention Suggested'
      : status === 'inconsistent'
      ? 'Inconsistent Results'
      : 'None of the Six Detected'
  const statusClass =
    status === 'attention' || status === 'inconsistent' ? 'risk-yellow' : 'risk-green'

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.07] pb-5">
        <div>
          <div className="flex items-center gap-2 text-sky-400 text-xs font-mono font-medium tracking-wider uppercase mb-1">
            <Activity size={14} /> Medical Imaging Workspace
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">ECG Analysis</h1>
          <p className="text-sm text-stone-400 mt-1">
            A classification model checks a 12-lead ECG image for six rhythm and conduction patterns.
          </p>
        </div>

        <label className="btn-primary bg-sky-600 hover:bg-sky-500 text-xs px-3.5 py-2 cursor-pointer inline-flex items-center gap-2">
          <Upload size={14} /> Upload ECG Image
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={handleFileUpload}
          />
        </label>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-300/90 leading-relaxed">
        <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-amber-300 mr-1">Medical Research Disclaimer:</span>
          Results are model predictions, not a diagnosis. The model covers only six conditions and
          has no normal category, so a result with nothing detected does not mean the ECG is normal.
          A qualified healthcare professional must review every ECG.
        </div>
      </div>

      {uploading ? (
        <div className="card p-12 flex flex-col items-center justify-center text-center space-y-4">
          <Loader size={32} className="animate-spin text-sky-400" />
          <p className="text-sm text-stone-200 font-medium">Running ConvNeXt-Tiny ECG model...</p>
          <p className="text-xs text-stone-400">Evaluating 6 rhythm and conduction patterns on the ECG image</p>
        </div>
      ) : error ? (
        <div className="card p-6 border-rose-500/30 bg-rose-500/5 text-rose-300 text-xs flex items-center gap-3">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      ) : !analysisData ? (
        <EmptyState
          icon={FileSearch}
          title="No ECG records yet"
          description="Upload a clear 12-lead ECG image to see which of the six patterns the model detects."
          action={() => document.querySelector('input[type="file"]')?.click()}
          actionLabel="Upload ECG Image"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: image preview */}
          <div className="lg:col-span-5 space-y-4">
            <div className="card p-4 bg-[#0d0f17] border-white/10 space-y-3">
              <div className="flex items-center justify-between text-xs text-stone-400 font-mono">
                <span className="truncate max-w-[200px]">{filename || 'ECG image'}</span>
                <span className="text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                  12-Lead
                </span>
              </div>

              <div className="relative rounded-lg overflow-hidden border border-white/10 bg-black flex items-center justify-center min-h-[200px] group">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="ECG preview"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="text-stone-500 text-xs flex flex-col items-center gap-2 p-8">
                    <FileSearch size={32} />
                    <span>Preview not available after reload</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3 text-[10px] text-stone-300 font-mono">
                  Resized to 224x224 • ConvNeXt-Tiny Input
                </div>
              </div>

              <div className="text-[11px] text-stone-400 bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.04]">
                Model Architecture:{' '}
                <span className="font-mono text-stone-200">{analysisData.model}</span>
              </div>
            </div>
          </div>

          {/* Right: results */}
          <div className="lg:col-span-7 space-y-6">
            {/* Overall assessment */}
            <div className="card bg-gradient-to-r from-surface-100 to-surface-200 border-white/10 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-semibold text-stone-400 uppercase tracking-wider">
                  Overall Model Assessment
                </span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusClass}`}>
                  {statusLabel}
                </span>
              </div>
              <p className="text-sm text-stone-200 leading-relaxed font-medium">
                {analysisData.summary?.text}
              </p>
            </div>

            {/* Patient summary */}
            <div className="card p-5 space-y-3 border-white/[0.08]">
              <h2 className="text-sm font-semibold text-white">Summary for you</h2>
              <SummaryText text={analysisData.patient_summary} />
            </div>

            {/* Grouped observations: all six findings */}
            <div className="space-y-5">
              <h2 className="text-sm font-mono font-semibold text-stone-300 uppercase tracking-wider flex items-center gap-2">
                <Layers size={15} className="text-sky-400" /> Model Observations
              </h2>

              {categories.map((category) => (
                <div key={category} className="space-y-3">
                  <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider pl-1 border-l-2 border-sky-400">
                    {category} ({grouped[category].length})
                  </div>

                  <div className="space-y-2.5">
                    {grouped[category].map((obs) => (
                      <div
                        key={obs.code}
                        className="card card-hover p-4 border-white/[0.06] flex flex-col justify-between space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-sm font-semibold text-white">{obs.name}</span>
                            <span className="text-[10px] font-mono text-stone-500 ml-2">
                              ({obs.technical_name})
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                              LEVEL_STYLE[obs.level] || 'risk-green'
                            }`}
                          >
                            {obs.interpretation}
                          </span>
                        </div>
                        <p className="text-xs text-stone-400 leading-relaxed">{obs.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Technical analysis */}
            <div className="pt-2">
              <button
                onClick={() => setShowTechnical(!showTechnical)}
                className="btn-secondary w-full justify-between text-xs py-2.5"
              >
                <span className="flex items-center gap-2 font-mono">
                  <Activity size={14} className="text-sky-400" /> View Technical Analysis (Model Scores)
                </span>
                {showTechnical ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showTechnical && (
                <div className="card mt-3 p-4 bg-[#090b10] border-white/10 space-y-3">
                  <p className="text-xs text-stone-400">
                    Raw uncalibrated outputs from the ECG model across 6 patterns. These are not
                    probabilities of disease:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                    {analysisData.technical_scores &&
                      Object.entries(analysisData.technical_scores).map(([code, score]) => (
                        <div
                          key={code}
                          className="bg-white/[0.03] p-2.5 rounded border border-white/[0.05] flex items-center justify-between"
                        >
                          <span className="text-[11px] text-stone-300 font-mono truncate">{code}</span>
                          <span className="text-xs font-mono font-bold text-sky-400 ml-2">
                            {score.toFixed(3)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <p className="text-[11px] text-stone-500 leading-relaxed">{analysisData.disclaimer}</p>
          </div>
        </div>
      )}
    </div>
  )
}