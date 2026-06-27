// ============================================================
// AppLayout — Enterprise shell v4
// ============================================================
import React, { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Menu, Bell, ChevronDown, Palette, Calendar, Search, Sparkles, User, Settings, LogOut } from 'lucide-react'
import Sidebar   from './Sidebar'
import MobileNav from './MobileNav'
import { LogoIcon } from '../brand/Logo'
import { useAuthStore }    from '../../store/authStore'
import { useSettingsStore, SIDEBAR_MODE, THEME_META, applyTheme } from '../../store/settingsStore'
import { ToastContainer }  from '../ui/Toast'
import { useAutoLogout }   from '../../hooks/useAutoLogout'
import CommandPalette, { useCommandPalette } from '../ui/CommandPalette'
import FuturisticAmbientLayer from '../ui/FuturisticAmbientLayer'
import OfflineBanner from '../ui/OfflineBanner'
import SyncStatusIndicator from '../ui/SyncStatusIndicator'
import { useTheme } from '../../theme/useTheme'
import { getRoleLabel } from '../../constants/roleScope'

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
      <button onClick={() => setOpen(!open)} className="btn btn-ghost btn-icon" title="Theme"
        aria-haspopup="menu" aria-expanded={open} aria-label="Theme switcher">
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

// ── Theme T1 quick toggle ────────────────────────────────────
// Minimal, visual-only header control for the new Theme Engine
// (T1-D). Cycles Corporate -> Executive -> Futuristic -> Medical ->
// AMOLED -> Apple -> Cyber. Deliberately separate from the existing
// ThemeSwitcher dropdown above (the older, untouched 9-preset
// runtime theme system) — no Settings Center, no dropdown, just a
// single click-to-cycle button showing the current theme name.
function ThemeT1QuickToggle() {
  const { activeTheme, cycleTheme } = useTheme()
  return (
    <button
      onClick={cycleTheme}
      data-testid="theme-t1-toggle"
      className="btn btn-ghost btn-icon"
      title={`Theme: ${activeTheme.name} — click to cycle`}
      style={{ display: 'flex', alignItems: 'center', gap: '5px', width: 'auto', padding: '0 8px' }}
    >
      <Sparkles className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
      <span className="hidden lg:inline text-xs" style={{ color: 'var(--text-muted)' }}>
        {activeTheme.name}
      </span>
    </button>
  )
}

// ── Profile menu ─────────────────────────────────────────────
// Replaces the bare avatar-button-that-navigates-to-/settings with a
// real dropdown: profile/settings, theme, sign out. PR-1D1.
function ProfileMenu() {
  const navigate = useNavigate()
  const { userProfile, logout } = useAuthStore()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const escHandler = (e) => { if (e.key === 'Escape') setOpen(false) }
    setTimeout(() => document.addEventListener('click', handler), 0)
    document.addEventListener('keydown', escHandler)
    return () => {
      document.removeEventListener('click', handler)
      document.removeEventListener('keydown', escHandler)
    }
  }, [open])

  const roleLabel = getRoleLabel(userProfile?.role)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all"
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
        <div className="w-6 h-6 rounded-full flex items-center justify-center font-semibold flex-shrink-0"
             style={{ background: 'var(--brand-500)', color: '#09090b', fontSize: '10px' }}>
          {userProfile?.displayName?.[0] || 'U'}
        </div>
        <span className="hidden sm:flex flex-col items-start leading-none">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {userProfile?.displayName?.split(' ')[0]}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {roleLabel}
          </span>
        </span>
        <ChevronDown className="w-3 h-3 hidden sm:block" style={{ color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div role="menu" aria-label="Account"
             className="absolute top-full left-0 mt-1.5 rounded-xl overflow-hidden z-50 animate-slide-down"
             style={{
               background: 'var(--modal-bg)',
               border: '1px solid var(--border-hover)',
               boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
               minWidth: '190px',
             }}>
          <button role="menuitem" onClick={() => { setOpen(false); navigate('/settings') }}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-right"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <User className="w-3.5 h-3.5" /> Profile
          </button>
          <button role="menuitem" onClick={() => { setOpen(false); navigate('/settings') }}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-right"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <Settings className="w-3.5 h-3.5" /> Settings
          </button>
          <div className="h-px" style={{ background: 'var(--border-subtle)' }} />
          <button role="menuitem" onClick={() => { setOpen(false); logout() }}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-right"
            style={{ color: 'var(--status-danger, #ef4444)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
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

  // PR-1E1 — the mobile drawer ("More") can be opened from either the
  // topbar hamburger or the bottom nav's More button. lastTriggerRef
  // remembers whichever one opened it, so closing restores focus to the
  // control the user actually used, not always the same element.
  const hamburgerRef   = useRef(null)
  const moreTriggerRef = useRef(null)
  const lastTriggerRef = useRef(null)
  const openMobileDrawer = (triggerRef) => { lastTriggerRef.current = triggerRef.current; setMobileOpen(true) }
  const closeMobileDrawer = () => {
    setMobileOpen(false)
    requestAnimationFrame(() => lastTriggerRef.current?.focus())
  }

  useAutoLogout()
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette()

  // Apply theme on mount
  useEffect(() => { applyTheme(theme) }, [])

  const collapsed = sidebarMode === SIDEBAR_MODE.COLLAPSED
  const sidebarW  = collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-w)'

  return (
    <div className="min-h-screen" style={{ background:'var(--bg-base)', position:'relative' }}>
      {/* Futuristic theme ambient background — renders only when theme === pharmapulse-futuristic */}
      <FuturisticAmbientLayer />

      <Sidebar mobileOpen={mobileOpen} onClose={closeMobileDrawer} />

      {/* PR-1E6 Final Pass — the previous clamp(0px, calc(100vw - 1023px),
          sidebarW) ramped padding-right linearly from 0 to sidebarW as the
          viewport grew from 1024px to (1023px + sidebarW) — e.g. 1024px to
          1279px with the 256px expanded sidebar — so main content was
          partially hidden under the fixed-position <aside> for any
          viewport in that range (confirmed via real-browser measurement at
          1024px: aside occupied 256px, but main's own padding-right was
          only 1px). Multiplying the vw delta by a large factor turns the
          ramp into a hard step right at the lg breakpoint (1024px), where
          the sidebar itself switches from hidden to shown. */}
      <div className="flex flex-col min-h-screen transition-all duration-300"
           style={{ paddingRight:`clamp(0px, calc((100vw - 1023px) * 999), ${sidebarW})` }}>

        {/* Offline First Bundle — non-blocking offline notice */}
        <OfflineBanner />

        {/* ── Topbar ──
            PR-1E5: sticky header sits at the very top of the viewport, so
            in an iOS standalone PWA with a notch/Dynamic Island, content
            could render under it. height/paddingTop add the safe-area
            inset on top of the existing fixed height — env() defaults to
            0px on devices without an inset, so this is a no-op everywhere
            else. */}
        <header className="sticky top-0 z-20 flex items-center gap-4 px-4 lg:px-5"
                style={{
                  height:'calc(var(--topbar-h) + env(safe-area-inset-top))',
                  paddingTop:'env(safe-area-inset-top)',
                  background:'var(--topbar-bg)',
                  borderBottom:'1px solid var(--border-subtle)',
                  backdropFilter:'blur(24px)',
                  WebkitBackdropFilter:'blur(24px)',
                }}>
          <button ref={hamburgerRef} onClick={() => openMobileDrawer(hamburgerRef)}
            className="lg:hidden btn btn-ghost btn-icon -mr-1"
            aria-label="Open navigation menu" aria-haspopup="dialog" aria-expanded={mobileOpen}
            aria-controls="mobile-more-drawer">
            <Menu className="w-4 h-4" />
          </button>

          {/* Product identity — command header mark (UI3-C) */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <LogoIcon size={18} />
            <span className="hidden md:inline text-xs font-semibold tracking-wide"
                  style={{ color: 'var(--text-secondary)' }}>
              PharmaPulse
            </span>
          </div>

          <div className="hidden sm:block h-4 w-px" style={{ background: 'var(--border-default)' }} />

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

          {/* Connectivity/sync status — single consolidated indicator
              (PR-1D1: previously duplicated by a hardcoded "Live" pill) */}
          <SyncStatusIndicator />

          {/* Right actions */}
          <div className="flex items-center gap-0.5 mr-auto">
            <ThemeSwitcher />
            <ThemeT1QuickToggle />

            <button onClick={() => navigate('/notifications')}
              aria-label="Notifications"
              className="btn btn-ghost btn-icon relative">
              <Bell className="w-[15px] h-[15px]" style={{ color:'var(--text-muted)' }} strokeWidth={1.75} />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                    style={{ background:'#ef4444' }} />
            </button>

            {/* Divider */}
            <div className="w-px h-5 mx-1" style={{ background:'var(--border-subtle)' }} />

            <ProfileMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 page-enter"
              style={{ paddingBottom:'calc(1.5rem + var(--mobile-nav-h) + env(safe-area-inset-bottom))' }}>
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
      <MobileNav
        onOpenMore={() => openMobileDrawer(moreTriggerRef)}
        moreOpen={mobileOpen}
        moreTriggerRef={moreTriggerRef}
      />

      {cmdOpen && <CommandPalette onClose={() => setCmdOpen(false)} />}
      <ToastContainer />
    </div>
  )
}
