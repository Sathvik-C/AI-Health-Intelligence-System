import { createContext, useContext, useState } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

// Token can be in either localStorage (remember me) or sessionStorage (session only)
function getStoredToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token') || null
}
function getStoredUser() {
  try {
    const raw = localStorage.getItem('user') || sessionStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function saveSession(data, rememberMe) {
  const store = rememberMe ? localStorage : sessionStorage
  const clear = rememberMe ? sessionStorage : localStorage
  store.setItem('token', data.access_token)
  store.setItem('user', JSON.stringify({ ...data, remember_me: rememberMe }))
  // Clear from the other store to avoid stale tokens
  clear.removeItem('token')
  clear.removeItem('user')
}
function clearSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('user')
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser())

  const login = async (email, password, rememberMe = true) => {
    const { data } = await api.post('/auth/login', {
      email,
      password,
      remember_me: rememberMe,
    })
    try { console.debug('[auth] login response', data) } catch (e) {}
    saveSession(data, rememberMe)
    try { console.debug('[auth] token saved to', rememberMe ? 'localStorage' : 'sessionStorage') } catch (e) {}
    setUser(data)
    return data
  }

  const register = async (email, password, fullName) => {
    const { data } = await api.post('/auth/register', { email, password, full_name: fullName })
    // Registration always remembers (30-day token)
    saveSession(data, true)
    setUser(data)
    return data
  }

  const loginWithGoogle = async (credential, rememberMe = true) => {
    const { data } = await api.post('/auth/google', {
      credential,
      remember_me: rememberMe,
    })
    saveSession(data, rememberMe)
    setUser(data)
    return data
  }

  const logout = () => {
    clearSession()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, register, loginWithGoogle, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

