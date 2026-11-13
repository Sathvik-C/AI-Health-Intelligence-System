import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { AlertCircle, Eye, EyeOff, Sun, Moon } from 'lucide-react'

export default function Register() {
  const [form, setForm] = useState({ email: '', password: '', fullName: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { register, loginWithGoogle } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    // Initialize Google One-Tap / Identity Services if Client ID is configured
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) return

    const initGsi = () => {
      if (!window.google?.accounts?.id) return

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          if (response?.credential) {
            setLoading(true)
            setError('')
            try {
              const res = await loginWithGoogle(response.credential, true)
              if (res?.access_token) {
                window.location.href = '/dashboard'
              }
            } catch (err) {
              console.error('Google sign-up error:', err)
              setError(err.response?.data?.detail || 'Google sign-up failed.')
            } finally {
              setLoading(false)
            }
          }
        },
      })

      // Render standard Google button
      const btnContainer = document.getElementById('google-signup-btn')
      if (btnContainer) {
        btnContainer.innerHTML = ''
        window.google.accounts.id.renderButton(btnContainer, {
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          width: '100%',
          text: 'signup_with',
          shape: 'rectangular',
        })
      }

      window.google.accounts.id.prompt()
    }

    if (window.google?.accounts?.id) {
      initGsi()
    } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = initGsi
      document.body.appendChild(script)

      return () => {
        try {
          document.body.removeChild(script)
        } catch (e) {}
      }
    }
  }, [loginWithGoogle, theme])

  const handleGoogleSignIn = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      setError(
        'Google 1-Click Sign-up is ready! To link your Google account, set VITE_GOOGLE_CLIENT_ID in your environment. You can also sign up below and Google Password Manager will prompt to save your account credentials.'
      )
      return
    }

    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt()
    } else {
      setError('Google Sign-in service is initializing. Please try again.')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const cleanEmail = form.email.trim().toLowerCase()
      const cleanName = form.fullName.trim()
      const result = await register(cleanEmail, form.password, cleanName)

      // Save to Google Password Manager via HTML5 Credential Management API
      if (typeof window !== 'undefined' && window.PasswordCredential && navigator.credentials?.store) {
        try {
          const cred = new window.PasswordCredential({
            id: cleanEmail,
            password: form.password,
            name: cleanName || cleanEmail,
          })
          await navigator.credentials.store(cred)
        } catch (credErr) {
          console.debug('Credential store note:', credErr)
        }
      }

      if (result?.access_token) {
        window.location.href = '/dashboard'
      } else {
        navigate('/login')
      }
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
      {/* Theme Toggle in Top Right */}
      <div className="absolute top-5 right-5 z-20">
        <button
          onClick={toggleTheme}
          type="button"
          className="p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white transition-all shadow-sm flex items-center gap-2 text-xs font-medium"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-brand-400" />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>

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

          {/* Google Sign-up Official Button & One-Tap Container */}
          <div className="w-full flex flex-col items-center gap-2">
            <div id="google-signup-btn" className="w-full flex justify-center min-h-[44px]" />
          </div>

          <div className="relative flex items-center justify-center my-2">
            <div className="border-t border-white/[0.08] w-full" />
            <span className="bg-[#121520] px-3 text-[10px] font-mono uppercase text-stone-400 shrink-0">
              or register with email
            </span>
          </div>

          <form id="register-form" name="register" method="post" onSubmit={handleSubmit} autoComplete="on" className="space-y-4">
            <div>
              <label className="label" htmlFor="fullname">Full Name</label>
              <input
                required
                id="fullname"
                name="name"
                autoComplete="name"
                className="input"
                placeholder="Jane Smith"
                value={form.fullName}
                onChange={e => setForm({ ...form, fullName: e.target.value })}
              />
            </div>

            <div>
              <label className="label" htmlFor="username">Email Address</label>
              <input
                required
                id="username"
                name="username"
                type="email"
                autoComplete="username"
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
              <label className="label" htmlFor="new-password">Password</label>
              <div className="relative">
                <input
                  required
                  id="new-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="input pr-10 font-mono text-xs"
                  placeholder="Minimum 8 characters"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
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
              {loading ? 'Creating Account...' : 'Create Account & Save to Google'}
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