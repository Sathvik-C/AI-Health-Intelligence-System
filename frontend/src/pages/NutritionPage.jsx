import { useState, useEffect } from 'react'
import api from '../utils/api'
import { Utensils, Loader, AlertTriangle, ChevronRight, Apple, Beef, Coffee, Salad, Info, Sparkles, RefreshCw } from 'lucide-react'
import EmptyState from '../components/EmptyState'

export default function NutritionPage() {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPlan()
  }, [])

  const fetchPlan = async () => {
    setFetching(true)
    try {
      const res = await api.get('/nutrition/plan')
      if (res.data) setPlan(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setFetching(false)
    }
  }

  const generatePlan = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/nutrition/generate')
      setPlan(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to generate personalized diet template.')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="p-6 md:p-8 flex justify-center items-center h-64">
        <Loader className="animate-spin text-brand-400" size={28} />
      </div>
    )
  }

  const currentDayData = plan?.daily_plan || (plan?.weekly_plan ? plan.weekly_plan[0] : null)

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.07] pb-5">
        <div>
          <div className="flex items-center gap-2 text-brand-400 text-xs font-mono font-medium tracking-wider uppercase mb-1">
            <Utensils size={14} /> Health Biomarker Nutrition Workspace
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Nutrition</h1>
          <p className="text-sm text-stone-400 mt-1">
            Personalized dietary template designed to support biomarker stability and health goals.
          </p>
        </div>

        <button
          onClick={generatePlan}
          disabled={loading}
          className="btn-primary text-xs px-4 py-2 self-start sm:self-auto"
        >
          {loading ? (
            <><Loader size={14} className="animate-spin" /> Generating Plan...</>
          ) : (
            <><Sparkles size={14} /> Generate Nutrition Plan</>
          )}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl text-xs bg-rose-500/10 text-rose-300 border border-rose-500/20 flex items-center gap-3">
          <AlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!plan && !loading && !error && (
        <EmptyState
          icon={Utensils}
          title="No active nutrition plan generated"
          description="Build a daily meal plan from your latest lab results — every change is linked to a specific result."
          action={generatePlan}
          actionLabel="Generate Nutrition Plan"
        />
      )}

      {plan && (
        <div className="space-y-6">
          {/* AI Reasoning Summary Banner */}
          <div className="card bg-gradient-to-br from-brand-500/10 to-transparent border-brand-500/30 p-6 space-y-2">
            <div className="flex items-center gap-2 text-brand-400 font-mono text-xs font-bold uppercase tracking-wider">
              <Info size={15} /> Biomarker-Driven Dietary Rationale
            </div>
            <p className="text-sm text-stone-200 leading-relaxed font-medium">
              {plan.summary_reasoning}
            </p>
            {plan.adjustments?.length > 0 && (
              <ul className="pt-2 space-y-1.5">
                {plan.adjustments.map((a, i) => (
                  <li key={i} className="text-xs text-stone-300 leading-relaxed">
                    <span className="font-semibold text-stone-100">Because {a.because}:</span> {a.change}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {currentDayData && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Meal Cards Stream */}
              <div className="lg:col-span-8 space-y-4">
                <MealCard icon={<Coffee className="text-amber-400" />} title="Breakfast" meal={currentDayData.meals?.breakfast} />
                <MealCard icon={<Salad className="text-emerald-400" />} title="Lunch" meal={currentDayData.meals?.lunch} />
                <MealCard icon={<Apple className="text-rose-400" />} title="Snack" meal={currentDayData.meals?.snack} />
                <MealCard icon={<Beef className="text-red-400" />} title="Dinner" meal={currentDayData.meals?.dinner} />
              </div>

              {/* Daily Macro Distribution */}
              <div className="lg:col-span-4">
                <div className="card p-5 space-y-4 sticky top-6">
                  <h3 className="text-sm font-bold text-white tracking-tight border-b border-white/[0.07] pb-3">
                    Daily Nutritional Breakdown
                  </h3>

                  <div className="space-y-3 font-mono text-xs">
                    <MacroRow label="Target Calories" value={currentDayData.macros?.calories} color="text-white" />
                    <div className="h-px bg-white/[0.06]" />
                    <MacroRow label="Protein" value={currentDayData.macros?.protein} color="text-brand-400" />
                    <MacroRow label="Carbohydrates" value={currentDayData.macros?.carbs} color="text-amber-400" />
                    <MacroRow label="Healthy Fats" value={currentDayData.macros?.fats} color="text-emerald-400" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MealCard({ icon, title, meal }) {
  if (!meal) return null
  return (
    <div className="card card-hover p-5 border-white/[0.07] flex items-start gap-4">
      <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 shrink-0">
        {icon}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-stone-400 uppercase tracking-wider">{title}</span>
          <ChevronRight size={12} className="text-stone-600" />
          <h3 className="text-sm font-bold text-white">{meal.name}</h3>
        </div>
        <p className="text-xs text-stone-300 leading-relaxed pt-1">{meal.description}</p>
      </div>
    </div>
  )
}

function MacroRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-stone-400">{label}</span>
      <span className={`font-bold text-sm ${color}`}>{value || '—'}</span>
    </div>
  )
}
