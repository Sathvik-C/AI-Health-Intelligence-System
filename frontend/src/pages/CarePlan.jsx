import { useState, useEffect, useCallback } from 'react'
import {
  Stethoscope,
  Calendar,
  Clock,
  Plus,
  Trash2,
  CheckCircle2,
  Clock3,
  AlertCircle,
  Pill,
  FlaskConical,
  FileText,
  UserCheck,
  ChevronRight,
  RefreshCw,
  Edit3,
  Check,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Info
} from 'lucide-react'
import api from '../utils/api'
import { format, parseISO, isValid, differenceInDays } from 'date-fns'

// Helper for formatting date strings
function safeFormatDate(dateStr, fmt = 'MMM d, yyyy') {
  if (!dateStr) return 'N/A'
  try {
    const d = parseISO(dateStr)
    return isValid(d) ? format(d, fmt) : dateStr
  } catch {
    return dateStr
  }
}

export default function CarePlan() {
  const [consultations, setConsultations] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('notes') // 'notes' | 'prescriptions' | 'tests' | 'followup'

  // Mode: 'doctor' allows editing and creating notes/prescriptions/tests; 'patient' is read-only view with interactive sync
  const [roleMode, setRoleMode] = useState(() => localStorage.getItem('careplan_role') || 'patient')

  // Modals & form state
  const [showNewModal, setShowNewModal] = useState(false)
  const [newConsultForm, setNewConsultForm] = useState({
    doctor_name: '',
    doctor_specialty: '',
    consultation_date: format(new Date(), 'yyyy-MM-dd'),
    soap_subjective: '',
    soap_objective: '',
    soap_assessment: '',
    soap_plan: '',
    lifestyle_notes: '',
    follow_up_date: '',
    follow_up_time: '',
  })

  // Sub-items forms
  const [showAddRx, setShowAddRx] = useState(false)
  const [rxForm, setRxForm] = useState({
    drug_name: '',
    previous_dosage: '',
    new_dosage: '',
    frequency: 'Once daily with meals',
    change_type: 'added',
    reason: '',
  })

  const [showAddTest, setShowAddTest] = useState(false)
  const [testForm, setTestForm] = useState({
    test_name: '',
    due_date: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
    frequency: 'once',
    instructions: '10-12 hours fasting required before sample collection',
  })

  // Action status / notifications
  const [syncStatus, setSyncStatus] = useState({})
  const [savingNotes, setSavingNotes] = useState(false)

  // Toggle role mode
  const handleRoleToggle = (mode) => {
    setRoleMode(mode)
    localStorage.setItem('careplan_role', mode)
  }

  // Fetch consultations list
  const fetchConsultations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/consultations/')
      const data = res.data || []
      setConsultations(data)
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id)
      }
    } catch (err) {
      console.error(err)
      setError('Failed to load consultation records.')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    fetchConsultations()
  }, [fetchConsultations])

  // Current active consultation
  const activeConsultation = consultations.find((c) => c.id === selectedId) || consultations[0]

  // Create new consultation
  const handleCreateConsultation = async (e) => {
    e.preventDefault()
    if (!newConsultForm.doctor_name.trim()) return

    try {
      await api.post('/consultations/', {
        ...newConsultForm,
        status: 'active',
        prescriptions: [],
        scheduled_tests: [],
      })
      setShowNewModal(false)
      setNewConsultForm({
        doctor_name: '',
        doctor_specialty: '',
        consultation_date: format(new Date(), 'yyyy-MM-dd'),
        soap_subjective: '',
        soap_objective: '',
        soap_assessment: '',
        soap_plan: '',
        lifestyle_notes: '',
        follow_up_date: '',
        follow_up_time: '',
      })
      await fetchConsultations()
    } catch (err) {
      console.error(err)
      alert('Failed to save consultation.')
    }
  }

  // Update SOAP notes
  const handleUpdateNotes = async () => {
    if (!activeConsultation) return
    setSavingNotes(true)
    try {
      await api.put(`/consultations/${activeConsultation.id}`, {
        soap_subjective: activeConsultation.soap_subjective,
        soap_objective: activeConsultation.soap_objective,
        soap_assessment: activeConsultation.soap_assessment,
        soap_plan: activeConsultation.soap_plan,
        lifestyle_notes: activeConsultation.lifestyle_notes,
      })
      setSyncStatus((prev) => ({ ...prev, notes: 'Saved successfully!' }))
      setTimeout(() => setSyncStatus((prev) => ({ ...prev, notes: null })), 2500)
    } catch (err) {
      console.error(err)
      alert('Failed to update notes.')
    } finally {
      setSavingNotes(false)
    }
  }

  // Add prescription change
  const handleAddRx = async (e) => {
    e.preventDefault()
    if (!activeConsultation || !rxForm.drug_name.trim()) return
    try {
      await api.post(`/consultations/${activeConsultation.id}/prescriptions`, rxForm)
      setShowAddRx(false)
      setRxForm({
        drug_name: '',
        previous_dosage: '',
        new_dosage: '',
        frequency: 'Once daily with meals',
        change_type: 'added',
        reason: '',
      })
      await fetchConsultations()
    } catch (err) {
      console.error(err)
      alert('Failed to add prescription change.')
    }
  }

  // Sync prescription to daily medicines
  const handleSyncRx = async (rxId, drugName) => {
    if (!activeConsultation) return
    try {
      setSyncStatus((prev) => ({ ...prev, [rxId]: 'syncing' }))
      await api.post(`/consultations/${activeConsultation.id}/prescriptions/${rxId}/sync`)
      setSyncStatus((prev) => ({ ...prev, [rxId]: 'synced' }))
      await fetchConsultations()
    } catch (err) {
      console.error(err)
      setSyncStatus((prev) => ({ ...prev, [rxId]: 'error' }))
    }
  }

  // Delete prescription
  const handleDeleteRx = async (rxId) => {
    if (!activeConsultation || !window.confirm('Delete this prescription change?')) return
    try {
      await api.delete(`/consultations/${activeConsultation.id}/prescriptions/${rxId}`)
      await fetchConsultations()
    } catch (err) {
      console.error(err)
    }
  }

  // Add scheduled test
  const handleAddTest = async (e) => {
    e.preventDefault()
    if (!activeConsultation || !testForm.test_name.trim()) return
    try {
      await api.post(`/consultations/${activeConsultation.id}/tests`, testForm)
      setShowAddTest(false)
      setTestForm({
        test_name: '',
        due_date: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
        frequency: 'once',
        instructions: '10-12 hours fasting required before sample collection',
      })
      await fetchConsultations()
    } catch (err) {
      console.error(err)
      alert('Failed to add scheduled test.')
    }
  }

  // Toggle test completed
  const handleToggleTest = async (testId, currentVal) => {
    if (!activeConsultation) return
    try {
      await api.put(`/consultations/${activeConsultation.id}/tests/${testId}`, {
        completed: !currentVal,
      })
      await fetchConsultations()
    } catch (err) {
      console.error(err)
    }
  }

  // Delete test
  const handleDeleteTest = async (testId) => {
    if (!activeConsultation || !window.confirm('Remove this scheduled test?')) return
    try {
      await api.delete(`/consultations/${activeConsultation.id}/tests/${testId}`)
      await fetchConsultations()
    } catch (err) {
      console.error(err)
    }
  }

  // Seed sample initial consultation if user has none
  const handleSeedDemo = async () => {
    try {
      setLoading(true)
      const res = await api.post('/consultations/', {
        doctor_name: 'Dr. Sarah Jenkins',
        doctor_specialty: 'Endocrinology & Metabolic Health',
        consultation_date: format(new Date(), 'yyyy-MM-dd'),
        soap_subjective: 'Patient reports mild afternoon fatigue. Fasting self-checks have ranged 115-128 mg/dL. Denies hypoglycemia episodes or GI intolerance.',
        soap_objective: 'BP 124/82 mmHg, Pulse 72 bpm regular. BMI 26.4. Lab review: HbA1c 6.8%, Fasting Glucose 122 mg/dL, LDL 118 mg/dL, eGFR >90.',
        soap_assessment: 'Type 2 Diabetes Mellitus with sub-optimal glycemic control. Mild hyperlipidemia. Renal function well-preserved.',
        soap_plan: '1. Titrate Metformin upward for target HbA1c <6.5%.\n2. Add Rosuvastatin 5mg daily for lipid optimization.\n3. Continue lifestyle modifications: target 150 min aerobic exercise weekly.',
        lifestyle_notes: 'Recommend Mediterranean-style dietary plan: prioritize leafy greens, legumes, and omega-3 rich fatty fish. Limit simple refined carbohydrates after 7 PM.',
        follow_up_date: format(new Date(Date.now() + 60 * 86400000), 'yyyy-MM-dd'),
        follow_up_time: '10:30 AM',
        status: 'active',
        prescriptions: [
          {
            drug_name: 'Metformin XR',
            previous_dosage: '500 mg daily',
            new_dosage: '850 mg twice daily',
            frequency: 'Twice daily with meals',
            change_type: 'modified',
            reason: 'Step-up titration to achieve glycemic target HbA1c <6.5%',
          },
          {
            drug_name: 'Rosuvastatin',
            previous_dosage: null,
            new_dosage: '5 mg daily',
            frequency: 'Once daily at bedtime',
            change_type: 'added',
            reason: 'Primary cardiovascular prevention given LDL 118 mg/dL',
          },
          {
            drug_name: 'Vitamin D3 (Cholecalciferol)',
            previous_dosage: null,
            new_dosage: '60,000 IU',
            frequency: 'Once weekly for 8 weeks',
            change_type: 'added',
            reason: 'Repletion for mild insufficiency (22 ng/mL)',
          },
        ],
        scheduled_tests: [
          {
            test_name: 'HbA1c & Fasting Lipid Panel',
            due_date: format(new Date(Date.now() + 60 * 86400000), 'yyyy-MM-dd'),
            frequency: 'once',
            instructions: '10-12 hours overnight fasting mandatory. Take morning medications after blood draw.',
          },
          {
            test_name: 'Comprehensive Metabolic Panel (CMP + eGFR)',
            due_date: format(new Date(Date.now() + 90 * 86400000), 'yyyy-MM-dd'),
            frequency: 'once',
            instructions: 'Routine monitoring of hepatic and renal parameters post-dosage adjustment.',
          },
        ],
      })
      await fetchConsultations()
    } catch (err) {
      console.error(err)
      alert('Failed to generate demo consultation.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* ── Header & Mode Switcher ────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Stethoscope size={18} className="text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Doctor Consultation & Care Plan
            </h1>
          </div>
          <p className="text-stone-400 text-xs sm:text-sm pl-10">
            Collaborative clinical workspace — physician consultation notes, prescription changes, and scheduled investigations
          </p>
        </div>

        {/* Action Controls & Role Switcher */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          {/* Doctor vs Patient Mode Pill */}
          <div className="flex items-center bg-white/[0.04] border border-white/[0.08] p-1 rounded-xl">
            <button
              onClick={() => handleRoleToggle('patient')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                roleMode === 'patient'
                  ? 'bg-brand-500 text-white shadow-sm font-semibold'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <UserCheck size={13} />
              <span>Patient View</span>
            </button>
            <button
              onClick={() => handleRoleToggle('doctor')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                roleMode === 'doctor'
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <Stethoscope size={13} />
              <span>Doctor Desk</span>
            </button>
          </div>

          {roleMode === 'doctor' && (
            <button
              onClick={() => setShowNewModal(true)}
              className="btn-primary text-xs flex items-center gap-1.5 py-1.5"
            >
              <Plus size={14} />
              <span>New Consultation</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Consultation Selector Tabs (Timeline Bar) ───────────────────── */}
      {consultations.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {consultations.map((c) => {
            const isSelected = activeConsultation?.id === c.id
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border text-xs font-medium transition-all shrink-0 ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm'
                    : 'bg-white/[0.02] border-white/[0.07] text-stone-400 hover:text-stone-200 hover:bg-white/[0.05]'
                }`}
              >
                <Stethoscope size={13} className={isSelected ? 'text-emerald-400' : 'text-stone-500'} />
                <div className="text-left">
                  <span className="font-semibold block text-stone-200">{c.doctor_name}</span>
                  <span className="text-[10px] text-stone-400 block font-mono">
                    {safeFormatDate(c.consultation_date)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Empty State ──────────────────────────────────────────────── */}
      {!loading && consultations.length === 0 && (
        <div className="card p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Stethoscope size={32} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">No Consultation Records Yet</h3>
            <p className="text-xs text-stone-400 max-w-md mt-1 leading-relaxed">
              Log clinical notes after doctor visits to track medication alterations, scheduled investigations, and follow-up guidance in one unified care plan.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <button
              onClick={() => setShowNewModal(true)}
              className="btn-primary text-xs"
            >
              <Plus size={14} className="mr-1 inline" /> Log First Consultation
            </button>
            <button
              onClick={handleSeedDemo}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <Sparkles size={14} className="text-brand-400" />
              <span>Load Realistic Sample Consultation</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Active Consultation Workspace ────────────────────────────── */}
      {activeConsultation && (
        <div className="space-y-6">
          {/* Header Summary Card */}
          <div className="card p-5 bg-gradient-to-r from-surface-100 to-surface-200 border-white/[0.09] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Stethoscope size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white">{activeConsultation.doctor_name}</h2>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {activeConsultation.status || 'Active Plan'}
                  </span>
                </div>
                <p className="text-xs text-stone-400 mt-0.5">
                  {activeConsultation.doctor_specialty || 'General Practitioner'} · Consulted on{' '}
                  <span className="font-semibold text-stone-200">
                    {safeFormatDate(activeConsultation.consultation_date, 'MMMM d, yyyy')}
                  </span>
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-3">
              <div className="card px-3 py-1.5 text-center bg-white/[0.02]">
                <span className="text-[10px] font-mono uppercase text-stone-400 block">Rx Updates</span>
                <span className="text-sm font-bold font-mono text-emerald-400">
                  {activeConsultation.prescriptions?.length || 0}
                </span>
              </div>
              <div className="card px-3 py-1.5 text-center bg-white/[0.02]">
                <span className="text-[10px] font-mono uppercase text-stone-400 block">Tests Due</span>
                <span className="text-sm font-bold font-mono text-sky-400">
                  {activeConsultation.scheduled_tests?.filter((t) => !t.completed).length || 0}
                </span>
              </div>
              {activeConsultation.follow_up_date && (
                <div className="card px-3 py-1.5 text-center bg-white/[0.02]">
                  <span className="text-[10px] font-mono uppercase text-stone-400 block">Follow-up</span>
                  <span className="text-xs font-semibold text-amber-400">
                    {safeFormatDate(activeConsultation.follow_up_date, 'MMM d')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Sub-Tab Navigation Bar ───────────────────────────────── */}
          <div className="flex border-b border-white/[0.08] gap-4">
            <button
              onClick={() => setActiveTab('notes')}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'notes'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <FileText size={14} />
              <span>Clinical Notes (SOAP)</span>
            </button>
            <button
              onClick={() => setActiveTab('prescriptions')}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'prescriptions'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <Pill size={14} />
              <span>Prescription Changes ({activeConsultation.prescriptions?.length || 0})</span>
            </button>
            <button
              onClick={() => setActiveTab('tests')}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'tests'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <FlaskConical size={14} />
              <span>Scheduled Investigations ({activeConsultation.scheduled_tests?.length || 0})</span>
            </button>
            <button
              onClick={() => setActiveTab('followup')}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === 'followup'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <Calendar size={14} />
              <span>Follow-up & Instructions</span>
            </button>
          </div>

          {/* ── TAB 1: Clinical SOAP Notes ───────────────────────────── */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Clinical SOAP Documentation</h3>
                  <p className="text-xs text-stone-400">
                    Standard structured clinical record: Subjective, Objective, Assessment, Plan
                  </p>
                </div>
                {roleMode === 'doctor' && (
                  <button
                    onClick={handleUpdateNotes}
                    disabled={savingNotes}
                    className="btn-primary text-xs flex items-center gap-1.5 py-1 px-3"
                  >
                    {savingNotes ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                    <span>{savingNotes ? 'Saving…' : 'Save Clinical Notes'}</span>
                  </button>
                )}
              </div>

              {syncStatus.notes && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 size={14} /> {syncStatus.notes}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Subjective */}
                <div className="card p-4 space-y-2 border-l-4 border-l-sky-500">
                  <div className="flex items-center gap-2 text-sky-400 text-xs font-mono font-bold uppercase tracking-wider">
                    <span>🗣️ Subjective (Patient Report)</span>
                  </div>
                  {roleMode === 'doctor' ? (
                    <textarea
                      rows={4}
                      value={activeConsultation.soap_subjective || ''}
                      onChange={(e) => {
                        const val = e.target.value
                        setConsultations((prev) =>
                          prev.map((c) => (c.id === activeConsultation.id ? { ...c, soap_subjective: val } : c))
                        )
                      }}
                      className="input text-xs w-full"
                      placeholder="Symptoms reported, patient history, adherence..."
                    />
                  ) : (
                    <p className="text-xs text-stone-300 leading-relaxed whitespace-pre-line">
                      {activeConsultation.soap_subjective || 'No subjective details recorded.'}
                    </p>
                  )}
                </div>

                {/* Objective */}
                <div className="card p-4 space-y-2 border-l-4 border-l-emerald-500">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider">
                    <span>🔬 Objective (Clinical Observations & Labs)</span>
                  </div>
                  {roleMode === 'doctor' ? (
                    <textarea
                      rows={4}
                      value={activeConsultation.soap_objective || ''}
                      onChange={(e) => {
                        const val = e.target.value
                        setConsultations((prev) =>
                          prev.map((c) => (c.id === activeConsultation.id ? { ...c, soap_objective: val } : c))
                        )
                      }}
                      className="input text-xs w-full"
                      placeholder="Physical exam findings, vital signs, key lab findings..."
                    />
                  ) : (
                    <p className="text-xs text-stone-300 leading-relaxed whitespace-pre-line">
                      {activeConsultation.soap_objective || 'No objective findings recorded.'}
                    </p>
                  )}
                </div>

                {/* Assessment */}
                <div className="card p-4 space-y-2 border-l-4 border-l-amber-500">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase tracking-wider">
                    <span>📋 Assessment (Diagnosis & Synthesis)</span>
                  </div>
                  {roleMode === 'doctor' ? (
                    <textarea
                      rows={4}
                      value={activeConsultation.soap_assessment || ''}
                      onChange={(e) => {
                        const val = e.target.value
                        setConsultations((prev) =>
                          prev.map((c) => (c.id === activeConsultation.id ? { ...c, soap_assessment: val } : c))
                        )
                      }}
                      className="input text-xs w-full"
                      placeholder="Diagnoses, disease trajectories, response to prior therapy..."
                    />
                  ) : (
                    <p className="text-xs text-stone-300 leading-relaxed whitespace-pre-line">
                      {activeConsultation.soap_assessment || 'No assessment recorded.'}
                    </p>
                  )}
                </div>

                {/* Plan */}
                <div className="card p-4 space-y-2 border-l-4 border-l-indigo-500">
                  <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono font-bold uppercase tracking-wider">
                    <span>📐 Plan (Treatment & Clinical Next Steps)</span>
                  </div>
                  {roleMode === 'doctor' ? (
                    <textarea
                      rows={4}
                      value={activeConsultation.soap_plan || ''}
                      onChange={(e) => {
                        const val = e.target.value
                        setConsultations((prev) =>
                          prev.map((c) => (c.id === activeConsultation.id ? { ...c, soap_plan: val } : c))
                        )
                      }}
                      className="input text-xs w-full"
                      placeholder="Therapeutic changes, education, scheduled investigations..."
                    />
                  ) : (
                    <p className="text-xs text-stone-300 leading-relaxed whitespace-pre-line">
                      {activeConsultation.soap_plan || 'No plan recorded.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 2: Prescription Changes (Rx Diff) ────────────────── */}
          {activeTab === 'prescriptions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Active Prescription Changes (Rx Diff)</h3>
                  <p className="text-xs text-stone-400">
                    Step-by-step medication modifications decided during consultation — click "Sync" to update your daily tracker
                  </p>
                </div>
                {roleMode === 'doctor' && (
                  <button
                    onClick={() => setShowAddRx(true)}
                    className="btn-primary text-xs flex items-center gap-1.5 py-1 px-3"
                  >
                    <Plus size={13} />
                    <span>Add Medication Change</span>
                  </button>
                )}
              </div>

              {/* Prescription Cards List */}
              {activeConsultation.prescriptions?.length === 0 ? (
                <div className="card p-8 text-center text-stone-400 text-xs">
                  No medication adjustments made in this consultation session.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeConsultation.prescriptions.map((rx) => {
                    const isAdded = rx.change_type === 'added'
                    const isModified = rx.change_type === 'modified'
                    const isStopped = rx.change_type === 'stopped'
                    const badgeClass = isAdded
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : isModified
                      ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                      : isStopped
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      : 'bg-stone-500/10 text-stone-400 border-stone-500/20'

                    return (
                      <div
                        key={rx.id}
                        className="card p-4 flex flex-col justify-between space-y-3 card-hover border-white/[0.08]"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-sm text-white">{rx.drug_name}</span>
                            <span
                              className={`text-[9px] font-mono uppercase font-bold px-2 py-0.5 rounded-full border shrink-0 ${badgeClass}`}
                            >
                              {rx.change_type}
                            </span>
                          </div>

                          {/* Dosage Diff Display */}
                          <div className="bg-white/[0.03] p-2 rounded-lg border border-white/[0.06] text-xs space-y-1">
                            {isModified && rx.previous_dosage && (
                              <div className="flex items-center gap-2 text-stone-400 line-through text-[11px]">
                                <span>Previous:</span>
                                <span>{rx.previous_dosage}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-stone-200 font-semibold">
                              <span>Target:</span>
                              <span className="text-brand-400 font-mono">
                                {rx.new_dosage || rx.previous_dosage || 'As directed'}
                              </span>
                            </div>
                            {rx.frequency && (
                              <div className="text-[10px] text-stone-400">
                                Frequency: <span className="text-stone-300">{rx.frequency}</span>
                              </div>
                            )}
                          </div>

                          {rx.reason && (
                            <p className="text-[11px] text-stone-400 italic">
                              "{rx.reason}"
                            </p>
                          )}
                        </div>

                        {/* Card Footer: Sync Button & Doctor Actions */}
                        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                          {rx.synced_to_medicines ? (
                            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 font-semibold">
                              <CheckCircle2 size={12} /> Synced to Daily Schedule
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSyncRx(rx.id, rx.drug_name)}
                              disabled={syncStatus[rx.id] === 'syncing'}
                              className="btn-secondary text-[10px] py-1 px-2.5 flex items-center gap-1 text-brand-300 hover:text-white"
                            >
                              <RefreshCw size={11} className={syncStatus[rx.id] === 'syncing' ? 'animate-spin' : ''} />
                              <span>{syncStatus[rx.id] === 'syncing' ? 'Syncing...' : 'Sync to Medicine Tracker'}</span>
                            </button>
                          )}

                          {roleMode === 'doctor' && (
                            <button
                              onClick={() => handleDeleteRx(rx.id)}
                              className="p-1 rounded text-stone-500 hover:text-rose-400 transition-colors"
                              title="Delete prescription"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: Scheduled Tests ───────────────────────────────── */}
          {activeTab === 'tests' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Scheduled Clinical Investigations</h3>
                  <p className="text-xs text-stone-400">
                    Required diagnostic lab tests recommended by your doctor for upcoming evaluation
                  </p>
                </div>
                {roleMode === 'doctor' && (
                  <button
                    onClick={() => setShowAddTest(true)}
                    className="btn-primary text-xs flex items-center gap-1.5 py-1 px-3"
                  >
                    <Plus size={13} />
                    <span>Schedule Lab Test</span>
                  </button>
                )}
              </div>

              {activeConsultation.scheduled_tests?.length === 0 ? (
                <div className="card p-8 text-center text-stone-400 text-xs">
                  No upcoming lab investigations scheduled in this consultation.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeConsultation.scheduled_tests.map((t) => {
                    const daysRemaining = t.due_date ? differenceInDays(parseISO(t.due_date), new Date()) : null
                    const isOverdue = daysRemaining !== null && daysRemaining < 0 && !t.completed
                    const isDueSoon = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0 && !t.completed

                    return (
                      <div
                        key={t.id}
                        className={`card p-4 flex items-start justify-between gap-3 transition-all ${
                          t.completed
                            ? 'opacity-60 bg-white/[0.01]'
                            : isOverdue
                            ? 'border-rose-500/40 bg-rose-500/[0.03]'
                            : isDueSoon
                            ? 'border-amber-500/40 bg-amber-500/[0.03]'
                            : 'border-white/[0.08]'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => handleToggleTest(t.id, t.completed)}
                            className={`w-5 h-5 rounded-md border mt-0.5 flex items-center justify-center transition-all ${
                              t.completed
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-stone-500 hover:border-emerald-400 text-transparent'
                            }`}
                            title={t.completed ? 'Mark incomplete' : 'Mark test completed'}
                          >
                            <Check size={13} />
                          </button>

                          <div className="space-y-1">
                            <span
                              className={`text-sm font-semibold block ${
                                t.completed ? 'line-through text-stone-400' : 'text-white'
                              }`}
                            >
                              {t.test_name}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-stone-400">
                              <Calendar size={12} className="text-stone-500" />
                              <span>Due: {safeFormatDate(t.due_date)}</span>
                              {!t.completed && daysRemaining !== null && (
                                <span
                                  className={`text-[10px] font-mono font-semibold px-2 py-0.2 rounded-full ${
                                    isOverdue
                                      ? 'bg-rose-500/15 text-rose-400'
                                      : isDueSoon
                                      ? 'bg-amber-500/15 text-amber-400'
                                      : 'bg-sky-500/15 text-sky-400'
                                  }`}
                                >
                                  {isOverdue
                                    ? `Overdue by ${Math.abs(daysRemaining)}d`
                                    : daysRemaining === 0
                                    ? 'Due today'
                                    : `In ${daysRemaining} days`}
                                </span>
                              )}
                            </div>
                            {t.instructions && (
                              <p className="text-[11px] text-stone-400 leading-relaxed">
                                <span className="font-semibold text-stone-300">Prep:</span> {t.instructions}
                              </p>
                            )}
                          </div>
                        </div>

                        {roleMode === 'doctor' && (
                          <button
                            onClick={() => handleDeleteTest(t.id)}
                            className="p-1 rounded text-stone-500 hover:text-rose-400"
                            title="Delete test"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 4: Follow-up & Lifestyle Guidance ─────────────────── */}
          {activeTab === 'followup' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Follow-up Appointment Card */}
              <div className="card p-5 space-y-3 border-l-4 border-l-amber-500">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase tracking-wider">
                  <Calendar size={15} />
                  <span>Next Clinical Appointment</span>
                </div>
                {activeConsultation.follow_up_date ? (
                  <div className="space-y-2">
                    <div className="text-xl font-bold font-mono text-white">
                      {safeFormatDate(activeConsultation.follow_up_date, 'EEEE, MMMM d, yyyy')}
                    </div>
                    {activeConsultation.follow_up_time && (
                      <div className="flex items-center gap-2 text-xs text-stone-300">
                        <Clock size={13} className="text-stone-400" />
                        <span>Scheduled Time: {activeConsultation.follow_up_time}</span>
                      </div>
                    )}
                    <p className="text-xs text-stone-400">
                      With <strong className="text-stone-200">{activeConsultation.doctor_name}</strong> (
                      {activeConsultation.doctor_specialty || 'General Practitioner'})
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-stone-400">No specific follow-up appointment date specified.</p>
                )}
              </div>

              {/* Lifestyle & Dietary Directives */}
              <div className="card p-5 space-y-3 border-l-4 border-l-emerald-500">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider">
                  <Sparkles size={15} />
                  <span>Physician Lifestyle Directives</span>
                </div>
                <p className="text-xs text-stone-300 leading-relaxed whitespace-pre-line">
                  {activeConsultation.lifestyle_notes ||
                    'General wellness recommendations: Maintain consistent sleep hygiene, limit processed sodium intake, and stay hydrated.'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: Create New Consultation ───────────────────────────── */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-lg w-full bg-[#121520] border-white/10 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Stethoscope size={18} className="text-emerald-400" />
                <span>New Doctor Consultation</span>
              </h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateConsultation} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Physician Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Sarah Jenkins"
                    value={newConsultForm.doctor_name}
                    onChange={(e) => setNewConsultForm({ ...newConsultForm, doctor_name: e.target.value })}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="label">Specialty</label>
                  <input
                    type="text"
                    placeholder="e.g. Endocrinology"
                    value={newConsultForm.doctor_specialty}
                    onChange={(e) => setNewConsultForm({ ...newConsultForm, doctor_specialty: e.target.value })}
                    className="input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Consultation Date</label>
                  <input
                    type="date"
                    value={newConsultForm.consultation_date}
                    onChange={(e) => setNewConsultForm({ ...newConsultForm, consultation_date: e.target.value })}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="label">Next Follow-Up Date</label>
                  <input
                    type="date"
                    value={newConsultForm.follow_up_date}
                    onChange={(e) => setNewConsultForm({ ...newConsultForm, follow_up_date: e.target.value })}
                    className="input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="label">Clinical Assessment & Summary</label>
                <textarea
                  rows={3}
                  placeholder="Primary diagnosis, clinical status, and response to treatment..."
                  value={newConsultForm.soap_assessment}
                  onChange={(e) => setNewConsultForm({ ...newConsultForm, soap_assessment: e.target.value })}
                  className="input text-xs"
                />
              </div>

              <div>
                <label className="label">Treatment Plan</label>
                <textarea
                  rows={3}
                  placeholder="Recommended therapeutic steps, medications, and labs..."
                  value={newConsultForm.soap_plan}
                  onChange={(e) => setNewConsultForm({ ...newConsultForm, soap_plan: e.target.value })}
                  className="input text-xs"
                />
              </div>

              <div>
                <label className="label">Dietary & Lifestyle Advice</label>
                <textarea
                  rows={2}
                  placeholder="Nutritional recommendations, physical activity..."
                  value={newConsultForm.lifestyle_notes}
                  onChange={(e) => setNewConsultForm({ ...newConsultForm, lifestyle_notes: e.target.value })}
                  className="input text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary text-xs">
                  Create Consultation Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Add Prescription Change ───────────────────────────── */}
      {showAddRx && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-md w-full bg-[#121520] border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Pill size={16} className="text-brand-400" />
                <span>Add Medication Adjustment</span>
              </h3>
              <button onClick={() => setShowAddRx(false)} className="text-stone-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddRx} className="space-y-3">
              <div>
                <label className="label">Drug Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Metformin XR"
                  value={rxForm.drug_name}
                  onChange={(e) => setRxForm({ ...rxForm, drug_name: e.target.value })}
                  className="input text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Action Type</label>
                  <select
                    value={rxForm.change_type}
                    onChange={(e) => setRxForm({ ...rxForm, change_type: e.target.value })}
                    className="input text-xs"
                  >
                    <option value="added">Added (New)</option>
                    <option value="modified">Modified Dosage</option>
                    <option value="stopped">Discontinued</option>
                    <option value="continued">Continued</option>
                  </select>
                </div>
                <div>
                  <label className="label">Target Dosage</label>
                  <input
                    type="text"
                    placeholder="e.g. 850 mg"
                    value={rxForm.new_dosage}
                    onChange={(e) => setRxForm({ ...rxForm, new_dosage: e.target.value })}
                    className="input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="label">Frequency / Timing</label>
                <input
                  type="text"
                  placeholder="e.g. Twice daily with meals"
                  value={rxForm.frequency}
                  onChange={(e) => setRxForm({ ...rxForm, frequency: e.target.value })}
                  className="input text-xs"
                />
              </div>

              <div>
                <label className="label">Clinical Justification</label>
                <input
                  type="text"
                  placeholder="e.g. HbA1c elevation past 6.5%"
                  value={rxForm.reason}
                  onChange={(e) => setRxForm({ ...rxForm, reason: e.target.value })}
                  className="input text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button type="button" onClick={() => setShowAddRx(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" className="btn-primary text-xs">
                  Add to Care Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Schedule Investigation ───────────────────────────── */}
      {showAddTest && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-md w-full bg-[#121520] border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FlaskConical size={16} className="text-sky-400" />
                <span>Schedule Diagnostic Investigation</span>
              </h3>
              <button onClick={() => setShowAddTest(false)} className="text-stone-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddTest} className="space-y-3">
              <div>
                <label className="label">Investigation Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HbA1c & Lipid Profile"
                  value={testForm.test_name}
                  onChange={(e) => setTestForm({ ...testForm, test_name: e.target.value })}
                  className="input text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Target Due Date *</label>
                  <input
                    type="date"
                    required
                    value={testForm.due_date}
                    onChange={(e) => setTestForm({ ...testForm, due_date: e.target.value })}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="label">Repeat Frequency</label>
                  <select
                    value={testForm.frequency}
                    onChange={(e) => setTestForm({ ...testForm, frequency: e.target.value })}
                    className="input text-xs"
                  >
                    <option value="once">Once</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Every 3 Months</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Patient Preparation & Instructions</label>
                <input
                  type="text"
                  placeholder="e.g. 10-12 hours overnight fasting required"
                  value={testForm.instructions}
                  onChange={(e) => setTestForm({ ...testForm, instructions: e.target.value })}
                  className="input text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button type="button" onClick={() => setShowAddTest(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" className="btn-primary text-xs">
                  Schedule Test
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

