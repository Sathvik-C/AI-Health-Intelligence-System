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
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Medicines</h1>
        <p className="text-sm text-slate-400 mt-0.5">Track your medication timeline</p>
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
          <p className="text-slate-500 text-sm">No medicines added yet.</p>
        ) : (
          <div className="relative pl-6 space-y-4">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-800" />
            {medicines.map(m => (
              <div key={m.id} className="relative">
                <div className={`absolute -left-4 top-3 w-2.5 h-2.5 rounded-full border-2 ${
                  isActive(m) ? 'border-emerald-400 bg-emerald-400' : 'border-slate-600 bg-slate-800'
                }`} />
                <div className="card ml-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Pill size={15} className={isActive(m) ? 'text-emerald-400' : 'text-slate-500'} />
                      <div>
                        <p className="text-sm font-semibold text-white">{m.drug_name}</p>
                        {m.dosage && <p className="text-xs text-slate-400">{m.dosage}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${isActive(m) ? 'risk-green' : 'text-slate-400 bg-slate-800'}`}>
                        {isActive(m) ? 'Active' : 'Completed'}
                      </span>
                      <button onClick={() => handleDelete(m.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-slate-400">
                    <span>Start: {format(new Date(m.start_date), 'MMM d, yyyy')}</span>
                    {m.end_date && <span>End: {format(new Date(m.end_date), 'MMM d, yyyy')}</span>}
                  </div>
                  {m.notes && <p className="text-xs text-slate-500 mt-1">{m.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
