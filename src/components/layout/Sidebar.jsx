// ============================================================
// Sidebar — Premium Enterprise (monochrome, compact)
// ============================================================
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, TrendingUp, Users, Building2,
  Map, Layers, UserCheck, ClipboardCheck, PlayCircle,
  Target, BarChart2, FileSpreadsheet, ShieldCheck, Settings,
  LogOut, Bell, X, PanelLeftClose, PanelLeft, BarChart3, Database,
  GitBranch, Trophy, FlaskConical, Sparkles, CheckSquare, ListTodo, BookOpen, Bot,
} from 'lucide-react'
import { useAuthStore }    from '../../store/authStore'
import { useSettingsStore, SIDEBAR_MODE } from '../../store/settingsStore'
import Logo, { LogoIcon } from '../brand/Logo'
import { useI18n }         from '../../hooks/useI18n'
import PersonalIdentitySignature, { isSignatureIdentity } from '../identity/PersonalIdentitySignature'
import { getRoleLabel } from '../../constants/roleScope'

// UI3-D — Linear-style 3-group taxonomy: Intelligence Operations /
// Data Architecture / Platform. "Actions" (and a couple of small
// role-specific groups like "My Work"/"People") stay as their own
// groups since they don't conceptually fit any of the 3 — every
// existing route from before this regroup is still present and
// permission-gated exactly as before; only group labels/order moved.
const NAV_CONFIG = {
  admin: [
    { group: '', items: [
      { icon: LayoutDashboard, label: 'Dashboard',  path: '/dashboard', exact: true },
    ]},
    { group: 'Intelligence Operations', items: [
      { icon: BarChart3,  label: 'Executive BI', path: '/executive' },
      { icon: Trophy,     label: 'Rankings',     path: '/admin/rankings' },
      { icon: Bot,        label: 'Assistant',    path: '/assistant' },
    ]},
    { group: 'Data Architecture', items: [
      { icon: Database,        label: 'KPI Registry',          path: '/admin/kpis' },
      // PR-1C: developer-only migration/parity diagnostic — not business
      // navigation. Stays a real, reachable route for engineers in dev
      // mode; filtered out of the rendered nav below in production.
      { icon: FlaskConical,    label: 'Dynamic KPI Shadow',    path: '/admin/dynamic-kpi-shadow', devOnly: true },
      { icon: BookOpen,        label: 'Profile Studio',        path: '/profile-studio' },
      // ER-0 — Evaluation Registry (Evaluation Ledger analog)
      { icon: ClipboardCheck,  label: 'Evaluation Registry',   path: '/admin/evaluation-registry' },
      // ER-2A — Evaluation execution
      { icon: PlayCircle,      label: 'Run Evaluation',        path: '/admin/evaluation-run' },
      { icon: FileSpreadsheet, label: 'Import',                path: '/import' },
      // DX-2/DX-3 — Data Exchange Studio: Organization Onboarding
      { icon: FileSpreadsheet, label: 'Data Exchange Studio',   path: '/data-exchange' },
      { icon: FileSpreadsheet, label: 'Export Studio',          path: '/export-studio' },
      { icon: Building2,       label: 'Pharmacies',            path: '/pharmacies' },
      { icon: Users,           label: 'Users',                 path: '/users' },
      // RBAC Phase 1 — Territory Infrastructure
      { icon: Map,    label: 'Regions',   path: '/admin/regions' },
      { icon: Layers, label: 'Districts', path: '/admin/districts' },
      // RF-0 — Branch Classification Foundation
      { icon: GitBranch, label: 'Branch Classifications', path: '/admin/classifications' },
      // RF-0E — Demo Data Seeder
      { icon: FlaskConical, label: 'Demo Data', path: '/admin/demo-data' },
    ]},
    { group: 'Actions / Work', items: [
      { icon: CheckSquare, label: 'My Actions', path: '/actions/my'    },
      { icon: ListTodo,    label: 'Task Board', path: '/actions/tasks' },
    ]},
    { group: 'Platform', items: [
      { icon: TrendingUp,      label: 'Reports',          path: '/reports' },
      { icon: Target,          label: 'Targets',          path: '/targets' },
      { icon: UserCheck,       label: 'Personal Targets', path: '/personal-targets' },
      { icon: ShieldCheck,     label: 'Audit Log',        path: '/audit' },
      { icon: Bell,            label: 'Notifications',    path: '/notifications' },
      { icon: Settings,        label: 'Settings',         path: '/settings' },
    ]},
  ],
  manager: [
    { group: '', items: [
      { icon: LayoutDashboard, label: 'Dashboard',  path: '/dashboard', exact: true },
    ]},
    { group: 'My Work', items: [
      { icon: ClipboardList, label: 'KPI Entry', path: '/entry' },
    ]},
    { group: 'Intelligence Operations', items: [
      { icon: BarChart3,  label: 'Executive BI', path: '/executive' },
      { icon: Users,      label: 'Team',         path: '/team' },
      { icon: Bot,        label: 'Assistant',    path: '/assistant' },
    ]},
    { group: 'Data Architecture', items: [
      { icon: BookOpen,   label: 'Profile Studio',   path: '/profile-studio' },
    ]},
    { group: 'Actions / Work', items: [
      { icon: CheckSquare, label: 'My Actions', path: '/actions/my'    },
      { icon: ListTodo,    label: 'Task Board', path: '/actions/tasks' },
    ]},
    { group: 'Platform', items: [
      { icon: TrendingUp, label: 'Reports',          path: '/reports' },
      { icon: Target,     label: 'Targets',          path: '/targets' },
      { icon: UserCheck,  label: 'Personal Targets', path: '/personal-targets' },
      { icon: Bell,       label: 'Notifications',    path: '/notifications' },
      { icon: Settings,   label: 'Settings',         path: '/settings' },
    ]},
  ],
  pharmacist: [
    { group: '', items: [
      { icon: LayoutDashboard, label: 'Dashboard',   path: '/dashboard', exact: true },
    ]},
    { group: 'My Work', items: [
      { icon: ClipboardList, label: 'KPI Entry',   path: '/entry' },
    ]},
    { group: 'Intelligence Operations', items: [
      { icon: TrendingUp, label: 'Performance',     path: '/performance' },
      { icon: Sparkles,   label: 'My Intelligence', path: '/my-intelligence' },
    ]},
    { group: 'Actions / Work', items: [
      { icon: CheckSquare, label: 'My Actions', path: '/actions/my' },
    ]},
    { group: 'Platform', items: [
      { icon: Bell,     label: 'Notifications', path: '/notifications' },
      { icon: Settings, label: 'Settings',      path: '/settings' },
    ]},
  ],
}

// branch_manager: forward-compat alias for manager nav, minus the two
// items 'manager' can reach but 'branch_manager' cannot (PR-1E6 fix —
// PS_ROLES in App.jsx only authorizes the 'manager' role value, not its
// canonical 'branch_manager' counterpart, so showing these links here
// previously sent branch_manager to /unauthorized on click).
NAV_CONFIG.branch_manager = NAV_CONFIG.manager
  .map((g) => ({ ...g, items: g.items.filter((item) => item.path !== '/profile-studio' && item.path !== '/assistant') }))
  .filter((g) => g.items.length > 0)

// district_supervisor: territory oversight nav (Phase 3A).
// No KPI Entry — supervisors manage territory, not individual data entry.
// No Personal Targets — supervisors have no pharmacyId.
NAV_CONFIG.district_supervisor = [
  { group: '', items: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', exact: true },
  ]},
  { group: 'Intelligence Operations', items: [
    { icon: BarChart3, label: 'Executive BI', path: '/executive' },
    { icon: Users, label: 'Team', path: '/team' },
    { icon: Bot, label: 'Assistant', path: '/assistant' },
  ]},
  { group: 'Data Architecture', items: [
    { icon: UserCheck, label: 'People', path: '/users' },
    { icon: BookOpen, label: 'Profile Studio', path: '/profile-studio' },
  ]},
  { group: 'Actions / Work', items: [
    { icon: CheckSquare, label: 'My Actions', path: '/actions/my' },
    { icon: ListTodo, label: 'Task Board', path: '/actions/tasks' },
  ]},
  { group: 'Platform', items: [
    { icon: TrendingUp, label: 'Reports', path: '/reports' },
    { icon: Target, label: 'Targets', path: '/targets' },
    { icon: Bell, label: 'Notifications', path: '/notifications' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ]},
]
// Phase 3A-1B: regional_manager gets district_supervisor's nav, minus
// Profile Studio/Assistant (PR-1E6 fix — PS_ROLES in App.jsx does not
// authorize 'regional_manager' for either route; same defect class as
// branch_manager above).
NAV_CONFIG.regional_manager = NAV_CONFIG.district_supervisor
  .map((g) => ({ ...g, items: g.items.filter((item) => item.path !== '/profile-studio' && item.path !== '/assistant') }))
  .filter((g) => g.items.length > 0)

// general_manager: executive nav + Actions Layer (Phase 3C-3D).
NAV_CONFIG.general_manager = [
  { group: '', items: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', exact: true },
  ]},
  { group: 'Intelligence Operations', items: [
    { icon: BarChart3,  label: 'Executive BI',   path: '/executive' },
    { icon: Users,      label: 'Team',           path: '/team' },
    { icon: Bot,        label: 'Assistant',      path: '/assistant' },
  ]},
  { group: 'Data Architecture', items: [
    { icon: BookOpen,   label: 'Profile Studio', path: '/profile-studio' },
  ]},
  { group: 'Actions / Work', items: [
    { icon: CheckSquare, label: 'My Actions', path: '/actions/my'    },
    { icon: ListTodo,    label: 'Task Board', path: '/actions/tasks' },
  ]},
  { group: 'Platform', items: [
    { icon: TrendingUp, label: 'Reports',        path: '/reports' },
    { icon: Target,     label: 'Targets',        path: '/targets' },
    { icon: Bell,        label: 'Notifications', path: '/notifications' },
    { icon: Settings,    label: 'Settings',      path: '/settings' },
  ]},
]

// PR-1C: items marked devOnly never render in a production build —
// they stay reachable by direct URL for engineers in dev mode, but never
// sit beside ordinary business navigation in production.
function resolveNav(role) {
  const groups = NAV_CONFIG[role] || NAV_CONFIG.pharmacist
  if (process.env.NODE_ENV !== 'production') return groups
  return groups
    .map((g) => ({ ...g, items: g.items.filter((item) => !item.devOnly) }))
    .filter((g) => g.items.length > 0)
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
  const { t } = useI18n()
  const closeButtonRef = useRef(null)

  // PR-1E1 — More drawer accessibility: Escape closes it, and opening it
  // moves focus into the drawer (onto its close button) rather than
  // leaving focus stranded on whichever trigger was clicked.
  useEffect(() => {
    if (!mobileOpen) return
    closeButtonRef.current?.focus()
    const escHandler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', escHandler)
    return () => document.removeEventListener('keydown', escHandler)
  }, [mobileOpen])

  // Nav label i18n map — translates known sidebar labels to current language.
  // Unknown labels fall through unchanged (safe for any hardcoded label).
  const navLabel = (label) => {
    const KEY_MAP = {
      'Dashboard':    t('nav.dashboard'),
      'Reports':      t('nav.reports'),
      'Targets':      t('nav.targets'),
      'Team':         t('nav.team'),
      'Performance':  t('nav.performance'),
      'KPI Entry':    t('nav.entry'),
      'Settings':     t('nav.settings'),
    }
    return KEY_MAP[label] ?? label
  }

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
              {isSignatureIdentity(userProfile?.displayName) ? (
                <PersonalIdentitySignature name={userProfile.displayName} />
              ) : (
                <>
                  <div className="text-xs font-semibold truncate leading-none"
                       style={{ color: 'var(--text-primary)' }}>
                    {userProfile?.displayName}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {getRoleLabel(role)}
                  </div>
                </>
              )}
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
                const translatedItem = { ...item, label: navLabel(item.label) }
                return collapsed && !isMobile
                  ? <NavCollapsed key={item.path} item={translatedItem} active={active} onClick={() => go(item.path)} />
                  : <NavExpanded  key={item.path} item={translatedItem} active={active} onClick={() => go(item.path)} />
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
          <aside id="mobile-more-drawer" role="dialog" aria-modal="true" aria-label="More navigation"
                 className="absolute right-0 top-0 bottom-0 animate-sidebar-in"
                 style={{
                   width: '260px',
                   background: 'var(--sidebar-bg)',
                   borderLeft: '1px solid var(--border-subtle)',
                   paddingBottom: 'env(safe-area-inset-bottom)',
                 }}>
            <button ref={closeButtonRef} onClick={onClose} aria-label="Close navigation menu"
                    className="absolute top-3.5 left-3 btn btn-ghost btn-icon">
              <X className="w-4 h-4" />
            </button>
            <Content isMobile />
          </aside>
        </div>
      )}
    </>
  )
}
