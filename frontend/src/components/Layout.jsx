import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard, Upload, Activity,
  Pill, FileText, LogOut, Heart, Utensils
} from 'lucide-react'
import ChatWidget from './ChatWidget'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload', icon: Upload, label: 'Upload Report' },
  { to: '/logs', icon: Activity, label: 'Health Logs' },
  { to: '/medicines', icon: Pill, label: 'Medicines' },
  { to: '/summary', icon: FileText, label: 'Summary' },
  { to: '/nutrition', icon: Utensils, label: 'Nutrition Plan' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-stone-900 border-r border-stone-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-stone-800 flex items-center gap-2">
          <Heart className="text-brand-500" size={22} />
          <span className="font-semibold text-white tracking-tight">HealthIQ</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-500/15 text-brand-400 font-medium'
                    : 'text-stone-400 hover:text-white hover:bg-stone-800'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-stone-800">
          <div className="px-3 py-2 text-xs text-stone-500 truncate">{user?.email}</div>
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-stone-400 hover:text-white hover:bg-stone-800 transition-colors w-full">
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-stone-950">
        <div className="max-w-5xl mx-auto w-full">
          <Outlet />
        </div>
      </main>

      {/* Global Chat Widget */}
      <ChatWidget />
    </div>
  )
}
