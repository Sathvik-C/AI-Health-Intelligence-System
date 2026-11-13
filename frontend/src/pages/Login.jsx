import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { AlertCircle, Eye, EyeOff, Sparkles, ArrowRight, Sun, Moon } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const { login, loginWithGoogle } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    // Attempt silent auto-fill from Google Password Manager if available
    if (typeof window !== 'undefined' && navigator.credentials?.get) {
      navigator.credentials.get({ password: true, mediation: 'silent' })
        .then((cred) => {
          if (cred && cred.id && cred.password) {
            setEmail(cred.id)
            setPassword(cred.password)
          }
        })
        .catch(() => {})
    }

    // Initialize Google One-Tap / Identity Services if Client ID is configured
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) return

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          if (response?.credential) {
            setLoading(true)
            try {
              const res = await loginWithGoogle(response.credential, rememberMe)
              if (res?.access_token) {
                window.location.href = '/dashboard'
              }
            } catch (err) {
              setError(err.response?.data?.detail || 'Google sign-in failed.')
            } finally {
              setLoading(false)
            }
          }
        },
      })
      window.google?.accounts.id.prompt()
    }
    document.body.appendChild(script)

    return () => {
      try {
        document.body.removeChild(script)
      } catch (e) {}
    }
  }, [loginWithGoogle, rememberMe])

  const handleGoogleSignIn = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      setError(
        'Google One-Tap is ready! To link your Google account, set VITE_GOOGLE_CLIENT_ID in your environment. You can also sign in below and Google Password Manager will save your credentials automatically.'
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
      const cleanEmail = email.trim().toLowerCase()
      const result = await login(cleanEmail, password, rememberMe)
      if (result?.access_token) {
        // Save to Google Password Manager via HTML5 Credential Management API
        if (typeof window !== 'undefined' && window.PasswordCredential && navigator.credentials?.store) {
          try {
            const cred = new window.PasswordCredential({
              id: cleanEmail,
              password: password,
              name: result.full_name || cleanEmail,
            })
            await navigator.credentials.store(cred)
          } catch (credErr) {
            console.debug('Credential store note:', credErr)
          }
        }
        window.location.href = '/dashboard'
      }
    } catch (err) {
      if (!err.response) {
        setError('Cannot connect to backend server. Make sure the API service is reachable.')
      } else {
        setError(err.response?.data?.detail || 'Invalid email or password.')
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

      {/* Subtle background glow */}
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
              Longitudinal Personal Health Intelligence System
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div className="card p-7 bg-[#121520]/90 border-white/[0.1] shadow-2xl backdrop-blur-md space-y-6">
          <div className="border-b border-white/[0.07] pb-4">
            <h2 className="text-base font-bold text-white tracking-tight">Access Your Health Record</h2>
            <p className="text-xs text-stone-400 mt-0.5">Sign in to your intelligent health portal</p>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg text-xs bg-rose-500/10 text-rose-300 border border-rose-500/20 flex items-center gap-2.5">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1-Click Google Sign-in */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="btn-secondary w-full py-2.5 flex items-center justify-center gap-2.5 text-xs font-medium border border-white/10 hover:border-white/20 transition-all shadow-sm"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="relative flex items-center justify-center my-2">
            <div className="border-t border-white/[0.08] w-full" />
            <span className="bg-[#121520] px-3 text-[10px] font-mono uppercase text-stone-400 shrink-0">
              or sign in with email
            </span>
          </div>

          <form id="login-form" name="login" method="post" onSubmit={handleSubmit} autoComplete="on" className="space-y-4">
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
                placeholder="name@domain.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0" htmlFor="password">Password</label>
              </div>
              <div className="relative">
                <input
                  required
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input pr-10 font-mono text-xs"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
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

            {/* Remember Me / Google Password Manager Hint */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-stone-300 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="rounded border-white/20 text-brand-500 focus:ring-brand-500/30"
                />
                <span className="text-[11px] text-stone-400">Remember me & save account</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-xs tracking-wider uppercase font-mono mt-2"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          <div className="pt-2 text-center text-xs text-stone-400 border-t border-white/[0.06]">
            Don't have a record yet?{' '}
            <Link to="/register" className="text-brand-400 font-semibold hover:underline">
              Register HealthIQ Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
