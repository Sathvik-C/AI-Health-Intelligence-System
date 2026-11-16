import { useState, useEffect } from 'react'
import api from '../utils/api'
import { Activity, Plus, Trash2, Calendar, Clock, Filter, LineChart as ChartIcon } from 'lucide-react'
import { format } from 'date-fns'
import EmptyState from '../components/EmptyState'

const LOG_TYPES = [
  { value: 'glucose', label: 'Fasting Glucose', unit: 'mg/dL' },
  { value: 'blood_pressure', label: 'Blood Pressure', unit: 'mmHg', hasSecond: true, placeholder: 'Systolic', placeholder2: 'Diastolic' },
  { value: 'weight', label: 'Weight', unit: 'kg' },
  { value: 'pulse', label: 'Pulse Rate', unit: 'bpm' },
]
// Only these four feed the app's analysis (heart-risk calculator, BMI, AI Insights).
// Sleep and steps come from Wearables. Older entries of other types still appear under "All".

export default function LogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeFilter, setActiveFilter] = useState('all')

  const [form, setForm] = useState({
    log_type: 'glucose',
    value: '',
    value2: '',
  })

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    setLoading(true)
    try {
      const res = await api.get('/logs/')
      setLogs(res.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleAddLog = async (e) => {
    e.preventDefault()
    if (!form.value) return

    setSaving(true)
    const selectedType = LOG_TYPES.find(t => t.value === form.log_type)

    try {
      await api.post('/logs/', {
        log_type: form.log_type,
        value: parseFloat(form.value),
        value2: form.value2 ? parseFloat(form.value2) : null,
        unit: selectedType?.unit,
      })

      setForm(f => ({ ...f, value: '', value2: '' }))
      loadLogs()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteLog = async (id) => {
    try {
      await api.delete(`/logs/${id}`)
      loadLogs()
    } catch (e) {
      console.error(e)
    }
  }

  const filteredLogs = (activeFilter === 'all'
    ? logs
    : logs.filter(l => l.log_type === activeFilter)
  ).sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at))

  const selectedTypeObj = LOG_TYPES.find(t => t.value === form.log_type)

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.07] pb-5">
        <div>
          <div className="flex items-center gap-2 text-brand-400 text-xs font-mono font-medium tracking-wider uppercase mb-1">
            <Activity size={14} /> Personal Health Journal
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Health Logs</h1>
          <p className="text-sm text-stone-400 mt-1">
            Home readings of blood pressure, glucose, weight and pulse — used by your heart-risk check, BMI and AI Insights.
          </p>
        </div>
      </div>

      {/* Add Log Form */}
      <div className="card p-5 bg-[#121520] border-white/[0.08]">
        <h2 className="text-sm font-bold text-white tracking-tight mb-4">Record New Journal Entry</h2>

        <form onSubmit={handleAddLog} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-4">
            <label className="label">Measurement Type</label>
            <select
              className="input text-xs"
              value={form.log_type}
              onChange={e => setForm({ ...form, log_type: e.target.value })}
            >
              {LOG_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label className="label">
              {selectedTypeObj?.placeholder || 'Value'} ({selectedTypeObj?.unit})
            </label>
            <input
              required
              type="number"
              step="any"
              className="input font-mono text-xs"
              placeholder="0.0"
              value={form.value}
              onChange={e => setForm({ ...form, value: e.target.value })}
            />
          </div>

          {selectedTypeObj?.hasSecond && (
            <div className="sm:col-span-3">
              <label className="label">{selectedTypeObj?.placeholder2}</label>
              <input
                type="number"
                step="any"
                className="input font-mono text-xs"
                placeholder="0.0"
                value={form.value2}
                onChange={e => setForm({ ...form, value2: e.target.value })}
              />
            </div>
          )}

          <div className={`${selectedTypeObj?.hasSecond ? 'sm:col-span-2' : 'sm:col-span-5'} flex justify-end`}>
            <button
              type="submit"
              disabled={saving || !form.value}
              className="btn-primary text-xs w-full py-2.5"
            >
              <Plus size={14} /> Add Entry
            </button>
          </div>
        </form>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => setActiveFilter('all')}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all shrink-0 ${
            activeFilter === 'all'
              ? 'bg-brand-500 text-white shadow-sm'
              : 'bg-white/[0.04] text-stone-400 border border-white/[0.08] hover:text-white'
          }`}
        >
          All Entries ({logs.length})
        </button>

        {LOG_TYPES.map(t => {
          const count = logs.filter(l => l.log_type === t.value).length
          if (count === 0) return null
          return (
            <button
              key={t.value}
              onClick={() => setActiveFilter(t.value)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all shrink-0 ${
                activeFilter === t.value
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-white/[0.04] text-stone-400 border border-white/[0.08] hover:text-white'
              }`}
            >
              {t.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Journal Entries Stream */}
      {filteredLogs.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No log entries recorded yet"
          description="Log fasting glucose, blood pressure, weight or pulse above."
        />
      ) : (
        <div className="space-y-3">
          {filteredLogs.map(log => {
            const typeInfo = LOG_TYPES.find(t => t.value === log.log_type)
            return (
              <div
                key={log.id}
                className="card card-hover p-4 flex items-center justify-between bg-white/[0.02] border-white/[0.06]"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
                    <Activity size={18} />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold uppercase text-stone-400 tracking-wider">
                        {typeInfo?.label || log.log_type.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="text-lg font-bold font-mono text-white">
                        {log.value}{log.value2 ? `/${log.value2}` : ''}
                      </span>
                      <span className="text-xs text-stone-400">{log.unit}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right text-xs font-mono text-stone-400">
                    <div>{format(new Date(log.logged_at), 'MMM d, yyyy')}</div>
                    <div className="text-[10px] text-stone-500">{format(new Date(log.logged_at), 'HH:mm')}</div>
                  </div>

                  <button
                    onClick={() => handleDeleteLog(log.id)}
                    className="text-stone-500 hover:text-rose-400 p-2 transition-colors rounded-lg hover:bg-rose-500/10"
                    title="Delete Entry"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
