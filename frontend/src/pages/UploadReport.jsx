import { useState, useEffect } from 'react'
import api from '../utils/api'
import { Upload, FileText, Trash2, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { format } from 'date-fns'

export default function UploadReport() {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState(null)
  const [reports, setReports] = useState([])
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => { loadReports() }, [])

  const loadReports = async () => {
    try {
      const res = await api.get('/reports/')
      setReports(res.data)
    } catch (e) {}
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setMessage(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await api.post('/reports/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setMessage({ type: 'success', text: `Uploaded! ${res.data.biomarkers_extracted} biomarkers extracted.` })
      setFile(null)
      loadReports()
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Upload failed' })
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/reports/${id}`)
      loadReports()
    } catch (e) {}
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') setFile(f)
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Upload Lab Report</h1>
        <p className="text-sm text-slate-400 mt-0.5">Upload a PDF to automatically extract biomarkers with AI</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          dragOver ? 'border-brand-500 bg-brand-500/10' : 'border-slate-700 hover:border-slate-600'
        }`}
        onClick={() => document.getElementById('file-input').click()}
      >
        <Upload className="mx-auto mb-3 text-slate-500" size={36} />
        <p className="text-slate-300 font-medium">Drag & drop a PDF here</p>
        <p className="text-slate-500 text-sm mt-1">or click to browse</p>
        <input
          id="file-input"
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={e => setFile(e.target.files[0])}
        />
      </div>

      {file && (
        <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-brand-400" />
            <span className="text-sm text-white">{file.name}</span>
            <span className="text-xs text-slate-400">({(file.size / 1024).toFixed(0)} KB)</span>
          </div>
          <button onClick={handleUpload} disabled={uploading} className="btn-primary flex items-center gap-2">
            {uploading ? <><Loader size={14} className="animate-spin" /> Processing…</> : 'Upload & Extract'}
          </button>
        </div>
      )}

      {message && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
          message.type === 'success' ? 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/20' : 'bg-red-400/10 text-red-300 border border-red-400/20'
        }`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Reports list */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Previous Reports</h2>
        {reports.length === 0 ? (
          <p className="text-slate-500 text-sm">No reports uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {reports.map(r => (
              <div key={r.id} className="card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-brand-400 shrink-0" />
                  <div>
                    <p className="text-sm text-white">{r.filename}</p>
                    <p className="text-xs text-slate-400">{format(new Date(r.uploaded_at), 'MMM d, yyyy')} · {r.biomarker_count} biomarkers</p>
                  </div>
                </div>
                <button onClick={() => handleDelete(r.id)} className="text-slate-500 hover:text-red-400 transition-colors p-1">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
