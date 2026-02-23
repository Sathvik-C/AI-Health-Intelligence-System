import { createContext, useContext, useState } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })

  const login = async (email, password) => {
    const params = new URLSearchParams()
    params.append('username', email)
    params.append('password', password)
    const { data } = await api.post('/auth/login', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    try { console.debug('[auth] login response', data) } catch (e) {}
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data))
    try { console.debug('[auth] token saved', !!data.access_token) } catch (e) {}
    setUser(data)
    return data
  }

  const register = async (email, password, fullName) => {
    const { data } = await api.post('/auth/register', { email, password, full_name: fullName })
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data))
    setUser(data)
    return data
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
