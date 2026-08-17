import { useState, useEffect } from 'react'
import api from '../utils/api'
import { Plus, Trash2, Pill } from 'lucide-react'
import { format } from 'date-fns'

export default function MedicinesPage() {
  const [medicines, setMedicines] = useState([])
  const [form, setForm] = useState({ drug_name: '', dosage: '', start_date: '', end_date: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadMedicines() }, [])

  const loadMedicines = async () => {
    try {
      const res = await api.get('/medicines/')
      setMedicines(res.data)
    } catch (e) {}
  }

  const handleAdd = async () => {
    if (!form.drug_name || !form.start_date) return
    setSaving(true)
    try {
      await api.post('/medicines/', {
        drug_name: form.drug_name,
        dosage: form.dosage || null,
        start_date: form.start_date,
        end_date: form.end_date || null,
        notes: form.notes || null,
      })
      setForm({ drug_name: '', dosage: '', start_date: '', end_date: '', notes: '' })
      loadMedicines()
    } catch (e) {}
    setSaving(false)
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/medicines/${id}`)
      loadMedicines()
    } catch (e) {}
  }

  const isActive = (med) => !med.end_date || new Date(med.end_date) >= new Date()

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Medicines</h1>
        <p className="text-sm text-stone-400 mt-0.5">Track your medication timeline</p>
      </div>

      {/* Add form */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-white">Add Medicine</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="label">Drug Name *</label>
            <input className="input" value={form.drug_name} onChange={e => setForm(f => ({...f, drug_name: e.target.value}))} placeholder="e.g. Metformin" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="label">Dosage</label>
            <input className="input" value={form.dosage} onChange={e => setForm(f => ({...f, dosage: e.target.value}))} placeholder="e.g. 500mg twice daily" />
          </div>
          <div>
            <label className="label">Start Date *</label>
            <input className="input" type="date" value={form.start_date} onChange={e => setForm(f => ({...f, start_date: e.target.value}))} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input className="input" type="date" value={form.end_date} onChange={e => setForm(f => ({...f, end_date: e.target.value}))} />
          </div>
          <div className="col-span-2">
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Additional notes…" />
          </div>
        </div>
        <button onClick={handleAdd} disabled={saving} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> Add Medicine
        </button>
      </div>

      {/* Medicine list */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Medication Timeline</h2>
        {medicines.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-center border-2 border-dashed border-stone-800/60 rounded-2xl bg-stone-900/30">
            <div className="w-14 h-14 rounded-full bg-stone-800/80 flex items-center justify-center mb-4 shadow-inner">
              <Pill size={28} className="text-stone-500" />
            </div>
            <p className="text-stone-300 text-sm font-medium">No medicines tracked yet</p>
            <p className="text-stone-500 text-xs mt-1 max-w-xs">Add your first medication above to start building your interactive timeline.</p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-5">
            <div className="absolute left-2 top-4 bottom-4 w-px bg-stone-800" />
            {medicines.map((m, idx) => (
              <div key={m.id} className="relative group">
                {/* Timeline Dot */}
                <div className="absolute -left-4 top-4 flex items-center justify-center">
                  <div className={`w-3 h-3 rounded-full border-2 z-10 transition-colors duration-300 ${
                    isActive(m) ? 'border-brand-400 bg-brand-400 shadow-[0_0_10px_rgba(var(--color-brand-400),0.5)]' : 'border-stone-600 bg-stone-900 group-hover:border-stone-500'
                  }`} />
                  {isActive(m) && (
                    <div className="absolute w-3 h-3 rounded-full bg-brand-400/40 animate-ping" />
                  )}
                </div>

                <div className={`card ml-3 transition-all duration-300 border hover:border-stone-700 ${isActive(m) ? 'bg-stone-900/80 border-stone-800 shadow-lg' : 'bg-stone-900/40 border-transparent hover:bg-stone-900/60'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isActive(m) ? 'bg-brand-500/10 text-brand-400' : 'bg-stone-800/50 text-stone-500'}`}>
                        <Pill size={16} />
                      </div>
                      <div>
                        <p className={`text-sm font-semibold transition-colors ${isActive(m) ? 'text-white' : 'text-stone-300'}`}>{m.drug_name}</p>
                        {m.dosage && <p className="text-xs text-stone-400 mt-0.5 font-medium">{m.dosage}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${isActive(m) ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30' : 'text-stone-500 bg-stone-800/50 border border-stone-700/50'}`}>
                        {isActive(m) ? 'Active' : 'Completed'}
                      </span>
                      <button onClick={() => handleDelete(m.id)} className="text-stone-600 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-6 mt-4 pt-3 border-t border-stone-800/50 text-xs text-stone-400">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-stone-500 uppercase font-semibold">Start</span>
                      <span className="text-stone-300">{format(new Date(m.start_date), 'MMM d, yyyy')}</span>
                    </div>
                    {m.end_date && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-stone-500 uppercase font-semibold">End</span>
                        <span className="text-stone-300">{format(new Date(m.end_date), 'MMM d, yyyy')}</span>
                      </div>
                    )}
                  </div>
                  {m.notes && (
                    <div className="mt-3 text-xs text-stone-400 bg-stone-950/50 p-2.5 rounded-md border border-stone-800/50">
                      <span className="text-stone-500 font-semibold mr-1">Notes:</span> {m.notes}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
