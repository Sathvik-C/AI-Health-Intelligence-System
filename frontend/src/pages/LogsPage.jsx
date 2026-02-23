import { useState, useEffect } from 'react'
import api from '../utils/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

const LOG_TYPES = [
  { value: 'blood_pressure', label: 'Blood Pressure', unit: 'mmHg', hasSecond: true, placeholder: 'Systolic', placeholder2: 'Diastolic' },
  { value: 'glucose', label: 'Fasting Glucose', unit: 'mg/dL' },
  { value: 'weight', label: 'Weight', unit: 'kg' },
  { value: 'pulse', label: 'Pulse', unit: 'bpm' },
]

export default function LogsPage() {
  const [form, setForm] = useState({ log_type: 'glucose', value: '', value2: '' })
  const [logs, setLogs] = useState([])
  const [activeType, setActiveType] = useState('glucose')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadLogs() }, [])

  const loadLogs = async () => {
    try {
      const res = await api.get('/logs/')
      setLogs(res.data)
    } catch (e) {}
  }

  const handleAdd = async () => {
    if (!form.value) return
    setSaving(true)
    try {
      await api.post('/logs/', {
        log_type: form.log_type,
        value: parseFloat(form.value),
        value2: form.value2 ? parseFloat(form.value2) : null,
        unit: LOG_TYPES.find(t => t.value === form.log_type)?.unit,
      })
      setForm(f => ({ ...f, value: '', value2: '' }))
      loadLogs()
    } catch (e) {}
    setSaving(false)
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/logs/${id}`)
      loadLogs()
    } catch (e) {}
  }

  const typeLogs = logs.filter(l => l.log_type === activeType).sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at))
  const chartData = typeLogs.map(l => ({ date: format(new Date(l.logged_at), 'MMM d'), value: l.value, value2: l.value2 }))
  const selectedType = LOG_TYPES.find(t => t.value === form.log_type)

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Health Logs</h1>
        <p className="text-sm text-slate-400 mt-0.5">Manually track your vitals over time</p>
      </div>

      {/* Add log form */}
      <div className="card">
        <h2 className="text-sm font-semibold text-white mb-4">Log a Reading</h2>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-32">
            <label className="label">Type</label>
            <select
              className="input"
              value={form.log_type}
              onChange={e => setForm(f => ({ ...f, log_type: e.target.value }))}
            >
              {LOG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-24">
            <label className="label">{selectedType?.placeholder || 'Value'} ({selectedType?.unit})</label>
            <input className="input" type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
          </div>
          {selectedType?.hasSecond && (
            <div className="flex-1 min-w-24">
              <label className="label">{selectedType?.placeholder2}</label>
              <input className="input" type="number" value={form.value2} onChange={e => setForm(f => ({ ...f, value2: e.target.value }))} placeholder="0" />
            </div>
          )}
          <div className="flex items-end">
            <button onClick={handleAdd} disabled={saving} className="btn-primary flex items-center gap-2">
              <Plus size={15} /> Add
            </button>
          </div>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-2">
        {LOG_TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => setActiveType(t.value)}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              activeType === t.value ? 'bg-brand-500 text-white' : 'text-slate-400 border border-slate-700 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      {chartData.length >= 2 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-white mb-4">{LOG_TYPES.find(t => t.value === activeType)?.label} Trend</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
              <Line dataKey="value" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3, fill: '#0ea5e9' }} name="Value" />
              {activeType === 'blood_pressure' && <Line dataKey="value2" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3, fill: '#a78bfa' }} name="Diastolic" />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Log list */}
      <div className="card">
        <h2 className="text-sm font-semibold text-white mb-3">Recent Readings</h2>
        {typeLogs.length === 0 ? (
          <p className="text-slate-500 text-sm">No logs yet for this type.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {[...typeLogs].reverse().map(l => (
              <div key={l.id} className="flex items-center justify-between py-2.5">
                <div>
                  <span className="font-mono font-semibold text-white">{l.value}{l.value2 ? `/${l.value2}` : ''}</span>
                  <span className="text-xs text-slate-400 ml-2">{l.unit}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{format(new Date(l.logged_at), 'MMM d, yyyy HH:mm')}</span>
                  <button onClick={() => handleDelete(l.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
