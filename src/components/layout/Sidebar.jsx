// ============================================================
// Sidebar — Premium Enterprise (monochrome, compact)
// ============================================================
import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, TrendingUp, Users, Building2,
  Target, BarChart2, FileSpreadsheet, ShieldCheck, Settings,
  LogOut, Bell, X, PanelLeftClose, PanelLeft, BarChart3, Database,
} from 'lucide-react'
import { useAuthStore }    from '../../store/authStore'
import { useSettingsStore, SIDEBAR_MODE } from '../../store/settingsStore'
import Logo, { LogoIcon } from '../brand/Logo'

const NAV_CONFIG = {
  admin: [
    { group: '', items: [
      { icon: LayoutDashboard, label: 'Dashboard',  path: '/dashboard', exact: true },
    ]},
    { group: 'Analytics', items: [
      { icon: TrendingUp,      label: 'Reports',      path: '/reports' },
      { icon: Target,          label: 'Targets',      path: '/targets' },
      { icon: BarChart3,       label: 'Executive BI', path: '/executive' },
    ]},
    { group: 'Administration', items: [
      { icon: Building2,       label: 'Pharmacies', path: '/pharmacies' },
      { icon: Users,           label: 'Users',      path: '/users' },
      { icon: FileSpreadsheet, label: 'Import',     path: '/import' },
      { icon: Database,       label: 'KPI Registry', path: '/admin/kpis' },
    ]},
    { group: 'System', items: [
      { icon: ShieldCheck,     label: 'Audit Log',      path: '/audit' },
      { icon: Bell,            label: 'Notifications',   path: '/notifications' },
      { icon: Settings,        label: 'Settings',        path: '/settings' },
    ]},
  ],
  manager: [
    { group: '', items: [
      { icon: LayoutDashboard, label: 'Dashboard',  path: '/dashboard', exact: true },
    ]},
    { group: 'Analytics', items: [
      { icon: TrendingUp, label: 'Reports',  path: '/reports' },
      { icon: Target,     label: 'Targets',  path: '/targets' },
      { icon: Users,      label: 'Team',     path: '/team' },
    ]},
    { group: 'System', items: [
      { icon: Bell,     label: 'Notifications', path: '/notifications' },
      { icon: Settings, label: 'Settings',      path: '/settings' },
    ]},
  ],
  pharmacist: [
    { group: '', items: [
      { icon: LayoutDashboard, label: 'Dashboard',   path: '/dashboard', exact: true },
    ]},
    { group: 'My Work', items: [
      { icon: ClipboardList, label: 'KPI Entry',    path: '/entry' },
      { icon: TrendingUp,    label: 'Performance',  path: '/performance' },
    ]},
    { group: 'System', items: [
      { icon: Bell,     label: 'Notifications', path: '/notifications' },
      { icon: Settings, label: 'Settings',      path: '/settings' },
    ]},
  ],
}

const ROLE_LABELS = { admin:'Admin', manager:'Manager', pharmacist:'Pharmacist' }

function resolveNav(role) {
  return NAV_CONFIG[role] || NAV_CONFIG.pharmacist
}

// Tooltip for collapsed mode
function Tooltip({ label }) {
  return (
    <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 z-50 pointer-events-none"
         style={{
           background: 'var(--bg-overlay)',
           border: '1px solid var(--border-default)',
           borderRadius: '6px',
           padding: '4px 10px',
           fontSize: '12px',
           fontWeight: 500,
           color: 'var(--text-primary)',
           whiteSpace: 'nowrap',
           boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
         }}>
      {label}
    </div>
  )
}

function NavExpanded({ item, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`nav-item w-full text-right ${active ? 'active' : ''}`}
      style={{ justifyContent: 'flex-start' }}>
      <item.icon className="w-[15px] h-[15px] flex-shrink-0" strokeWidth={1.75} />
      <span className="flex-1 text-right">{item.label}</span>
    </button>
  )
}

function NavCollapsed({ item, active, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div className="relative flex justify-center"
         onMouseEnter={() => setHovered(true)}
         onMouseLeave={() => setHovered(false)}>
      <button onClick={onClick}
        className={`nav-item-icon ${active ? 'active' : ''}`}>
        <item.icon className="w-[15px] h-[15px]" strokeWidth={1.75} />
      </button>
      {hovered && <Tooltip label={item.label} />}
    </div>
  )
}

export default function Sidebar({ mobileOpen, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { userProfile, logout } = useAuthStore()
  const { sidebarMode, toggleSidebar } = useSettingsStore()

  const role       = userProfile?.role || 'pharmacist'
  const navGroups  = resolveNav(role)
  const collapsed  = sidebarMode === SIDEBAR_MODE.COLLAPSED

  const isActive = (path, exact) =>
    exact ? location.pathname === path : location.pathname.startsWith(path)

  const go = (path) => { navigate(path); onClose?.() }
  const handleLogout = async () => { await logout(); navigate('/login') }

  const Content = ({ isMobile = false }) => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div className="flex-shrink-0 flex items-center"
           style={{
             height: 'var(--topbar-h)',
             padding: collapsed && !isMobile ? '0 14px' : '0 14px',
             borderBottom: '1px solid var(--border-subtle)',
             justifyContent: collapsed && !isMobile ? 'center' : 'space-between',
           }}>
        {collapsed && !isMobile
          ? <LogoIcon size={30} />
          : <>
              <Logo size={30} showText />
              {!isMobile && (
                <button onClick={toggleSidebar}
                  className="btn btn-ghost btn-icon -mr-1 opacity-30 hover:opacity-70">
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              )}
            </>
        }
      </div>

      {/* User card */}
      {(!collapsed || isMobile) && (
        <div className="flex-shrink-0 mx-3 mt-3 px-2.5 py-2 rounded-lg"
             style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-900
                            font-bold text-xs flex-shrink-0"
                 style={{ background: 'var(--brand-500)', fontSize: '10px' }}>
              {userProfile?.displayName?.[0] || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate leading-none"
                   style={{ color: 'var(--text-primary)' }}>
                {userProfile?.displayName}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {ROLE_LABELS[role] || role}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collapsed avatar */}
      {collapsed && !isMobile && (
        <div className="flex justify-center mt-3 flex-shrink-0">
          <div className="w-7 h-7 rounded-full flex items-center justify-center
                          text-zinc-900 font-bold text-xs"
               style={{ background: 'var(--brand-500)', fontSize: '10px' }}>
            {userProfile?.displayName?.[0] || 'U'}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto no-scrollbar py-3"
           style={{ padding: collapsed && !isMobile ? '12px 10px' : '12px' }}>
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
            {group.group && !collapsed && (
              <div className="section-label px-2 mb-1.5">{group.group}</div>
            )}
            {group.group && collapsed && !isMobile && (
              <div className="my-3 mx-1 border-t" style={{ borderColor: 'var(--border-subtle)' }} />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.path, item.exact)
                return collapsed && !isMobile
                  ? <NavCollapsed key={item.path} item={item} active={active} onClick={() => go(item.path)} />
                  : <NavExpanded  key={item.path} item={item} active={active} onClick={() => go(item.path)} />
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Expand button */}
      {collapsed && !isMobile && (
        <div className="flex justify-center pb-2 flex-shrink-0">
          <div className="relative group">
            <button onClick={toggleSidebar} className="nav-item-icon opacity-25 hover:opacity-60">
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Logout */}
      <div className="flex-shrink-0 pb-3"
           style={{
             padding: collapsed && !isMobile ? '0 10px 12px' : '0 12px 12px',
             borderTop: '1px solid var(--border-subtle)',
             paddingTop: '8px',
           }}>
        {collapsed && !isMobile ? (
          <div className="relative flex justify-center group">
            <button onClick={handleLogout} className="nav-item-icon hover:bg-red-500/8"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color='#f87171'}
                    onMouseLeave={(e) => e.currentTarget.style.color='var(--text-muted)'}>
              <LogOut className="w-[15px] h-[15px]" strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <button onClick={handleLogout}
            className="nav-item w-full text-right"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background='rgba(239,68,68,0.07)'; e.currentTarget.style.color='#f87171' }}
            onMouseLeave={(e) => { e.currentTarget.style.background=''; e.currentTarget.style.color='var(--text-muted)' }}>
            <LogOut className="w-[15px] h-[15px] flex-shrink-0" strokeWidth={1.75} />
            <span className="flex-1">Sign Out</span>
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex flex-col fixed right-0 top-0 bottom-0 z-30"
             style={{
               width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-w)',
               background: 'var(--sidebar-bg)',
               borderLeft: '1px solid var(--border-subtle)',
               backdropFilter: 'blur(24px)',
               transition: 'width 250ms cubic-bezier(0.4,0,0.2,1)',
             }}>
        <Content />
      </aside>

      {/* Mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <aside className="absolute right-0 top-0 bottom-0 animate-sidebar-in"
                 style={{
                   width: '260px',
                   background: 'var(--sidebar-bg)',
                   borderLeft: '1px solid var(--border-subtle)',
                 }}>
            <button onClick={onClose} className="absolute top-3.5 left-3 btn btn-ghost btn-icon">
              <X className="w-4 h-4" />
            </button>
            <Content isMobile />
          </aside>
        </div>
      )}
    </>
  )
}
