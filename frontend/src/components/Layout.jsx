import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard,
  PlusCircle,
  FileSearch,
  Pill,
  Activity,
  Watch,
  Utensils,
  Sparkles,
  MessageSquareQuote,
  LogOut,
  Shield,
  Menu,
  X,
  ChevronRight
} from 'lucide-react'
import { useState } from 'react'

const NAV_GROUPS = [
  {
    group: 'OVERVIEW',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ]
  },
  {
    group: 'RECORDS',
    items: [
      { to: '/add-records', icon: PlusCircle, label: 'Add Health Records' },
      { to: '/xray', icon: FileSearch, label: 'X-Ray Report' },
      { to: '/ecg', icon: Activity, label: 'ECG Report' },
    ]
  },
  {
    group: 'HEALTH',
    items: [
      { to: '/medicines', icon: Pill, label: 'Medicines' },
      { to: '/logs', icon: Activity, label: 'Health Logs' },
      { to: '/wearables', icon: Watch, label: 'Wearables' },
      { to: '/nutrition', icon: Utensils, label: 'Nutrition' },
    ]
  },
  {
    group: 'INTELLIGENCE',
    items: [
      { to: '/insights', icon: Sparkles, label: 'Health Insights' },
      { to: '/ask', icon: MessageSquareQuote, label: 'Ask Your Health Record' },
    ]
  }
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between select-none">
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white font-bold text-lg shadow-glow-brand">
              H
            </div>
            <div>
              <span className="font-bold text-white text-base tracking-tight block leading-none">HealthIQ</span>
              <span className="text-[10px] text-stone-400 tracking-wider font-mono uppercase mt-0.5 block">Health Intelligence</span>
            </div>
          </div>
          <button 
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-stone-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Grouped */}
        <nav className="p-3.5 space-y-6 overflow-y-auto max-h-[calc(100vh-140px)]">
          {NAV_GROUPS.map((sec) => (
            <div key={sec.group} className="space-y-1">
              <div className="px-3 text-[10px] font-mono uppercase tracking-widest text-stone-500 font-semibold mb-1">
                {sec.group}
              </div>
              {sec.items.map(({ to, icon: Icon, label }) => {
                const isActive = location.pathname === to
                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30 shadow-sm'
                          : 'text-stone-400 hover:text-stone-100 hover:bg-white/[0.04]'
                      }`
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon size={16} className={isActive ? 'text-brand-400' : 'text-stone-400'} />
                      <span>{label}</span>
                    </div>
                    {isActive && <ChevronRight size={12} className="text-brand-400" />}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* User profile footer */}
      <div className="p-3.5 border-t border-white/[0.07] bg-surface-300/40">
        <div className="flex items-center gap-3 px-2 py-1.5 mb-2">
          <div className="w-7 h-7 rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center text-xs font-semibold text-brand-400">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="truncate flex-1">
            <p className="text-xs font-medium text-stone-200 truncate">{user?.full_name || user?.email?.split('@')[0] || 'User'}</p>
            <p className="text-[10px] text-stone-400 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-stone-400 hover:text-stone-200 hover:bg-white/[0.06] transition-colors border border-white/[0.05]"
        >
          <LogOut size={13} />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-[#0b0d14]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 bg-[#0f111a] border-r border-white/[0.07] flex-col shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-64 bg-[#0f111a] border-r border-white/[0.07] z-50 transition-transform duration-300 md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header Bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/[0.07] bg-[#0f111a]">
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileOpen(true)} className="p-1.5 text-stone-400 hover:text-white">
              <Menu size={20} />
            </button>
            <span className="font-bold text-white text-sm">HealthIQ</span>
          </div>
          <span className="text-[10px] font-mono text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">
            PERSONAL HEALTH INTELLIGENCE
          </span>
        </header>

        {/* Scrollable Main Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto w-full min-h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
