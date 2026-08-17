import { useState, useEffect } from 'react'
import api from '../utils/api'
import { Utensils, Loader, AlertTriangle, ChevronRight, Apple, Beef, Coffee, Salad, Info } from 'lucide-react'

export default function NutritionPage() {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPlan()
  }, [])

  const fetchPlan = async () => {
    try {
      const res = await api.get('/nutrition/plan')
      if (res.data) {
        setPlan(res.data)
      }
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
      setError(e.response?.data?.detail || 'Failed to generate plan')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <Loader className="animate-spin text-brand-500" size={32} />
      </div>
    )
  }

  const currentDayData = plan?.daily_plan || (plan?.weekly_plan ? plan.weekly_plan[0] : null)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">AI Nutrition Plan</h1>
          <p className="text-sm text-stone-400 mt-0.5">Personalized daily diet template based on your health biomarkers</p>
        </div>
        <button onClick={generatePlan} disabled={loading} className="btn-primary flex items-center justify-center gap-2 shrink-0">
          {loading ? <><Loader size={14} className="animate-spin" /> Analyzing Health Data...</> : <><Utensils size={14} /> Generate New Plan</>}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {!plan && !loading && !error && (
        <div className="card flex flex-col items-center justify-center p-12 text-center border-dashed">
          <div className="w-16 h-16 bg-stone-800 rounded-full flex items-center justify-center mb-4">
            <Utensils size={28} className="text-stone-400" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No Active Diet Plan</h3>
          <p className="text-sm text-stone-400 max-w-sm mb-6">
            Generate a personalized 7-day meal plan tailored to correct any anomalies in your blood work and logs.
          </p>
          <button onClick={generatePlan} className="btn-primary">Generate AI Plan</button>
        </div>
      )}

      {plan && (
        <div className="space-y-6">
          <div className="card border-brand-500/30 bg-brand-500/5">
            <div className="flex items-center gap-2 mb-2">
              <Info size={15} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-white">Why this diet?</h2>
            </div>
            <p className="text-sm text-stone-300 leading-relaxed">{plan.summary_reasoning}</p>
          </div>

          {currentDayData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <MealCard icon={<Coffee className="text-amber-400" />} title="Breakfast" meal={currentDayData.meals.breakfast} />
                <MealCard icon={<Salad className="text-emerald-400" />} title="Lunch" meal={currentDayData.meals.lunch} />
                <MealCard icon={<Apple className="text-rose-400" />} title="Snack" meal={currentDayData.meals.snack} />
                <MealCard icon={<Beef className="text-red-400" />} title="Dinner" meal={currentDayData.meals.dinner} />
              </div>
              
              <div className="lg:col-span-1">
                <div className="card sticky top-6">
                  <h3 className="text-sm font-semibold text-white mb-4">Daily Macros</h3>
                  <div className="space-y-4">
                    <MacroRow label="Calories" value={currentDayData.macros.calories} color="text-white" />
                    <div className="h-px bg-stone-800" />
                    <MacroRow label="Protein" value={currentDayData.macros.protein} color="text-brand-400" />
                    <MacroRow label="Carbs" value={currentDayData.macros.carbs} color="text-amber-400" />
                    <MacroRow label="Fats" value={currentDayData.macros.fats} color="text-emerald-400" />
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
  if (!meal) return null;
  return (
    <div className="card hover:border-stone-700 transition-colors">
      <div className="flex items-start gap-4">
        <div className="mt-1 bg-stone-800 p-2 rounded-lg">
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-stone-200 uppercase tracking-wider">{title}</h3>
            <ChevronRight size={14} className="text-stone-600" />
            <span className="text-base font-semibold text-white">{meal.name}</span>
          </div>
          <p className="text-sm text-stone-400 leading-relaxed mt-2">{meal.description}</p>
        </div>
      </div>
    </div>
  )
}

function MacroRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-stone-400">{label}</span>
      <span className={`text-base font-bold ${color}`}>{value}</span>
    </div>
  )
}
