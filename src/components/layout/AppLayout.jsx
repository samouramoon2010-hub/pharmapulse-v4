// ============================================================
// AppLayout — Shell with topbar, sidebar, auto-logout
// ============================================================
import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Menu, Bell, Search, ChevronDown, Settings } from 'lucide-react'
import Sidebar from './Sidebar'
import { useAuthStore } from '../../store/authStore'
import { useNotificationStore } from '../../store/notificationStore'
import { ToastContainer } from '../ui/Toast'
import { useAutoLogout } from '../../hooks/useAutoLogout'
import { ROLE_LABELS } from '../../constants'

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate    = useNavigate()
  const { userProfile } = useAuthStore()
  const { unreadCount, fetchNotifications } = useNotificationStore()

  useAutoLogout()

  useEffect(() => {
    if (userProfile?.uid) fetchNotifications(userProfile.uid)
  }, [userProfile?.uid])

  return (
    <div className="min-h-screen bg-slate-950">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main — offset sidebar on desktop */}
      <div className="flex flex-col min-h-screen transition-all duration-300"
           style={{ paddingRight: 'max(0px, min(var(--sidebar-w), calc(100vw - 1024px + var(--sidebar-w))))' }}>

        {/* Topbar */}
        <header className="sticky top-0 z-20 h-14 flex items-center gap-4 px-4 lg:px-6
                            bg-slate-950/90 backdrop-blur-md border-b border-slate-800/60">
          {/* Mobile menu */}
          <button onClick={() => setMobileOpen(true)}
            className="lg:hidden btn btn-ghost btn-icon -mr-1">
            <Menu className="w-5 h-5" />
          </button>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-xs">
            <div className="relative w-full">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input type="text" placeholder="بحث سريع..."
                className="pr-9 h-9 text-sm bg-slate-900/60 border-slate-700/60
                           focus:bg-slate-900 transition-all" />
            </div>
          </div>

          <div className="flex items-center gap-2 mr-auto">
            {/* Notifications */}
            <button onClick={() => navigate('/notifications')}
              className="btn btn-ghost btn-icon relative">
              <Bell className="w-5 h-5 text-slate-400" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>

            {/* User menu */}
            <button onClick={() => navigate('/settings')}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl
                         hover:bg-slate-800/60 transition-all group">
              <div className="w-7 h-7 rounded-full bg-gradient-brand flex items-center
                              justify-center text-white font-bold text-xs shadow-glow-sm">
                {userProfile?.displayName?.[0] || 'U'}
              </div>
              <div className="hidden sm:block text-right">
                <div className="text-xs font-semibold text-slate-200 leading-none">
                  {userProfile?.displayName?.split(' ')[0]}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {ROLE_LABELS[userProfile?.role] || userProfile?.role}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-600 hidden sm:block" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  )
}
