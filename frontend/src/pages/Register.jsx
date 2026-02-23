import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Heart, AlertCircle, Eye, EyeOff } from 'lucide-react'

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
      await register(form.email, form.password, form.fullName)
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Heart className="text-brand-500" size={28} />
          <span className="text-2xl font-semibold text-white">HealthIQ</span>
        </div>
        <div className="card">
          <h1 className="text-lg font-semibold mb-5">Create your account</h1>
          {error && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded-lg px-3 py-2 text-sm mb-4">
              <AlertCircle size={15} /> {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={form.fullName} onChange={e => setForm(f => ({...f, fullName: e.target.value}))} placeholder="Jane Smith" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="you@example.com" required />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({...f, password: e.target.value}))}
                  placeholder="min 8 characters"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p className="text-sm text-slate-400 text-center mt-4">
            Already have an account? <Link to="/login" className="text-brand-400 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}