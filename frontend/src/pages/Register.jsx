import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'

export default function Register() {
  const [form, setForm] = useState({ email: '', password: '', fullName: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(form.email.trim().toLowerCase(), form.password, form.fullName.trim())
      navigate('/login')
    } catch (err) {
      if (!err.response) {
        setError('Cannot connect to backend server. Make sure the API service is reachable.')
      } else {
        setError(err.response?.data?.detail || 'Registration failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d14] flex flex-col items-center justify-center p-6 relative overflow-hidden select-none">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-8">
        {/* Hero Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white font-bold text-xl shadow-glow-brand">
              H
            </div>
            <span className="text-2xl font-bold tracking-tight text-white">HealthIQ</span>
          </div>

          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-serif italic text-stone-200">
              “Your entire health history. One intelligent story.”
            </h1>
            <p className="text-xs text-stone-400 font-mono">
              Create Your Personal Health Intelligence Account
            </p>
          </div>
        </div>

        {/* Register Card */}
        <div className="card p-7 bg-[#121520]/90 border-white/[0.1] shadow-2xl backdrop-blur-md space-y-6">
          <div className="border-b border-white/[0.07] pb-4">
            <h2 className="text-base font-bold text-white tracking-tight">Create Account</h2>
            <p className="text-xs text-stone-400 mt-0.5">Start building your longitudinal personal health history</p>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg text-xs bg-rose-500/10 text-rose-300 border border-rose-500/20 flex items-center gap-2.5">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input
                required
                className="input"
                placeholder="Jane Smith"
                value={form.fullName}
                onChange={e => setForm({ ...form, fullName: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Email Address</label>
              <input
                required
                type="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                className="input"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10 font-mono text-xs"
                  placeholder="Minimum 8 characters"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-xs tracking-wider uppercase font-mono mt-2"
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          <div className="pt-2 text-center text-xs text-stone-400 border-t border-white/[0.06]">
            Already registered?{' '}
            <Link to="/login" className="text-brand-400 font-semibold hover:underline">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}