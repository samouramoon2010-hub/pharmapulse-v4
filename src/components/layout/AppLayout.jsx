// ============================================================
// AppLayout — Enterprise shell v4
// ============================================================
import React, { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Menu, Bell, ChevronDown, Palette, Calendar, Search } from 'lucide-react'
import Sidebar   from './Sidebar'
import MobileNav from './MobileNav'
import { useAuthStore }    from '../../store/authStore'
import { useSettingsStore, SIDEBAR_MODE, THEME_META, applyTheme } from '../../store/settingsStore'
import { ToastContainer }  from '../ui/Toast'
import { useAutoLogout }   from '../../hooks/useAutoLogout'
import CommandPalette, { useCommandPalette } from '../ui/CommandPalette'

const ROLE_LABELS = { admin:'Admin', manager:'Manager', pharmacist:'Pharmacist' }
const DAYS_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function DateChip() {
  const now  = new Date()
  const day  = now.getDate()
  const mon  = now.toLocaleString('en', { month: 'short' })
  const wday = DAYS_EN[now.getDay()].slice(0,3)
  return (
    <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono tabular-nums"
         style={{ color:'var(--text-muted)', letterSpacing:'0.01em' }}>
      <span style={{ color:'var(--text-secondary)', fontWeight:500 }}>{wday}</span>
      <span style={{ color:'var(--border-strong)' }}>·</span>
      <span>{mon} {day}</span>
    </div>
  )
}

function ThemeSwitcher() {
  const { theme, setTheme } = useSettingsStore()
  const [open, setOpen] = useState(false)
  const ref  = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    setTimeout(() => document.addEventListener('click', handler), 0)
    return () => document.removeEventListener('click', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="btn btn-ghost btn-icon" title="Theme">
        <Palette className="w-4 h-4" style={{ color:'var(--text-muted)' }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1.5 rounded-xl overflow-hidden z-50 animate-slide-down"
             style={{
               background:'var(--modal-bg)',
               border:'1px solid var(--border-hover)',
               boxShadow:'0 16px 40px rgba(0,0,0,0.5)',
               minWidth:'170px',
             }}>
          {Object.entries(THEME_META).map(([key, meta]) => (
            <button key={key}
              onClick={() => { setTheme(key); setOpen(false) }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-right transition-colors"
              style={{ color: theme === key ? 'var(--brand-300)' : 'var(--text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
              {/* Color swatch */}
              <div className="w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0"
                   style={{ background: meta.preview }} />
              <span className="flex-1">{meta.labelAr}</span>
              {theme === key && (
                <div className="w-1.5 h-1.5 rounded-full" style={{ background:'var(--brand-400)' }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate  = useNavigate()
  const { userProfile }  = useAuthStore()
  const { sidebarMode, theme } = useSettingsStore()

  useAutoLogout()
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette()

  // Apply theme on mount
  useEffect(() => { applyTheme(theme) }, [])

  const collapsed = sidebarMode === SIDEBAR_MODE.COLLAPSED
  const sidebarW  = collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-w)'

  return (
    <div className="min-h-screen" style={{ background:'var(--bg-base)' }}>
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex flex-col min-h-screen transition-all duration-300"
           style={{ paddingRight:`clamp(0px, calc(100vw - 1023px), ${sidebarW})` }}>

        {/* ── Topbar ── */}
        <header className="sticky top-0 z-20 flex items-center gap-4 px-4 lg:px-5"
                style={{
                  height:'var(--topbar-h)',
                  background:'var(--topbar-bg)',
                  borderBottom:'1px solid var(--border-subtle)',
                  backdropFilter:'blur(24px)',
                  WebkitBackdropFilter:'blur(24px)',
                }}>
          <button onClick={() => setMobileOpen(true)} className="lg:hidden btn btn-ghost btn-icon -mr-1">
            <Menu className="w-4 h-4" />
          </button>

          {/* Date chip */}
          <DateChip />

          {/* Command bar trigger */}
          <button onClick={() => setCmdOpen(true)} className="cmd-trigger hidden md:flex">
            <Search style={{width:12,height:12}} />
            <span>Search or jump to...</span>
            <kbd style={{padding:'1px 5px',borderRadius:'4px',background:'var(--bg-overlay)',border:'1px solid var(--border-subtle)',fontFamily:'monospace',fontSize:'9px',marginRight:'auto'}}>⌘K</kbd>
          </button>

          {/* Separator */}
          <div className="hidden sm:block h-4 w-px" style={{ background:'var(--border-default)' }} />

          {/* Status pill */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs"
               style={{ color:'var(--text-muted)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            Live
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-0.5 mr-auto">
            <ThemeSwitcher />

            <button onClick={() => navigate('/notifications')}
              className="btn btn-ghost btn-icon relative">
              <Bell className="w-[15px] h-[15px]" style={{ color:'var(--text-muted)' }} strokeWidth={1.75} />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                    style={{ background:'#ef4444' }} />
            </button>

            {/* Divider */}
            <div className="w-px h-5 mx-1" style={{ background:'var(--border-subtle)' }} />

            {/* User */}
            <button onClick={() => navigate('/settings')}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all"
              onMouseEnter={(e) => e.currentTarget.style.background='var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background='transparent'}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center font-semibold flex-shrink-0"
                   style={{
                     background:'var(--brand-500)',
                     color:'#09090b',
                     fontSize:'10px',
                   }}>
                {userProfile?.displayName?.[0] || 'U'}
              </div>
              <span className="hidden sm:block text-xs font-medium" style={{ color:'var(--text-secondary)' }}>
                {userProfile?.displayName?.split(' ')[0]}
              </span>
              <ChevronDown className="w-3 h-3 hidden sm:block" style={{ color:'var(--text-muted)' }} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 page-enter"
              style={{ paddingBottom:'calc(1.5rem + var(--mobile-nav-h))' }}>
          <Outlet />
        </main>

        {/* Footer — desktop only */}
        <footer className="hidden lg:flex px-6 py-3 items-center justify-between text-[11px]"
                style={{ color:'var(--text-muted)', borderTop:'1px solid var(--border)' }}>
          <span>PharmaPulse Enterprise KPI System</span>
          <span>Designed & Developed by{' '}
            <span style={{ color:'var(--brand-300)', fontWeight:600 }}>Samir Goda</span>
          </span>
        </footer>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />

      {cmdOpen && <CommandPalette onClose={() => setCmdOpen(false)} />}
      <ToastContainer />
    </div>
  )
}
