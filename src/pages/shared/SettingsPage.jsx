// ============================================================
// Settings Page v4 — Appearance + Dashboard + KPI + System
// ============================================================
import React, { useState, useEffect, useMemo } from 'react'
import {
  Palette, LayoutDashboard, Target, Bell, Info, Code2,
  Database, Zap, Shield, ChevronRight, Check,
} from 'lucide-react'
import { useSettingsStore, THEME_META, SIDEBAR_MODE, DASHBOARD_CARDS } from '../../store/settingsStore'
import { useAuthStore } from '../../store/authStore'
import { useToastStore } from '../../components/ui/Toast'
import Logo from '../../components/brand/Logo'
import { subscribeKpiRegistry }                       from '../../services/kpiRegistryService'
import { DEFAULT_KPI_REGISTRY, getKpisForSurface }    from '../../engine/kpiRegistry'

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      className="w-11 h-6 rounded-full relative flex-shrink-0 transition-all duration-300"
      style={{ background: value ? 'var(--brand-500)' : 'var(--bg-hover)', border:'1px solid var(--border)' }}>
      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300"
           style={{ right: value ? '2px' : 'calc(100% - 22px)' }} />
    </button>
  )
}

function Row({ title, description, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b last:border-0"
         style={{ borderColor:'var(--border)' }}>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color:'var(--text-primary)' }}>{title}</div>
        {description && <div className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="card card-p">
      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b" style={{ borderColor:'var(--border)' }}>
        {Icon && <Icon className="w-5 h-5" style={{ color:'var(--brand-400)' }} />}
        <h2 className="section-title">{title}</h2>
      </div>
      {children}
    </div>
  )
}

const SECTIONS = ['appearance','dashboard','kpi','notifications','system','developer']
const SECTION_LABELS = {
  appearance:    { icon: Palette,         label: 'Appearance'   },
  dashboard:     { icon: LayoutDashboard, label: 'Dashboard'    },
  kpi:           { icon: Target,          label: 'KPI Settings' },
  notifications: { icon: Bell,            label: 'Notifications' },
  system:        { icon: Info,            label: 'System Info'  },
  developer:     { icon: Code2,           label: 'Developer'    },
}

export default function SettingsPage() {
  const {
    theme, setTheme,
    sidebarMode, toggleSidebar,
    compactMode, toggleCompact,
    reducedMotion, toggleReducedMotion,
    fontSize, setFontSize,
    dashboardCards, setDashboardCards,
  } = useSettingsStore()

  const { userProfile } = useAuthStore()
  const toast = useToastStore()
  const [active, setActive] = useState('appearance')

  // ── Live registry for dynamic KPI visibility list ─────────
  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)
  useEffect(() => {
    return subscribeKpiRegistry(
      (reg) => setLiveRegistry(reg),
      ()    => setLiveRegistry(DEFAULT_KPI_REGISTRY),
    )
  }, [])

  // Active dashboard-visible KPIs from live registry
  const registryKpiCards = useMemo(() =>
    getKpisForSurface(liveRegistry, 'dashboardEnabled').map((kpi) => {
      const engineKey = kpi.aliasFor ?? kpi.key
      return {
        key:     engineKey,
        label:   kpi.label || engineKey,
        labelAr: kpi.labelAr || kpi.label || engineKey,
        isCore:  kpi.isCore ?? false,
      }
    }),
    [liveRegistry]
  )

  const toggleDashCard = (key) => {
    if (dashboardCards.includes(key)) {
      if (dashboardCards.length <= 2) { toast.warning('Minimum 2 cards required'); return }
      setDashboardCards(dashboardCards.filter((c) => c !== key))
    } else {
      setDashboardCards([...dashboardCards, key])
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold" style={{ color:'var(--text-primary)' }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color:'var(--text-muted)' }}>
          Preferences, appearance, and system configuration
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar p-1 rounded-2xl"
           style={{ background:'var(--bg-hover)', border:'1px solid var(--border)' }}>
        {SECTIONS.map((s) => {
          const { icon: Icon, label } = SECTION_LABELS[s]
          return (
            <button key={s} onClick={() => setActive(s)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold
                         flex-shrink-0 transition-all"
              style={{
                background: active === s ? 'var(--bg-card)' : 'transparent',
                color: active === s ? 'var(--brand-300)' : 'var(--text-muted)',
                boxShadow: active === s ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
              }}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Appearance ── */}
      {active === 'appearance' && (
        <Section icon={Palette} title="Appearance">
          {/* Theme grid */}
          <p className="text-xs mb-3" style={{ color:'var(--text-muted)' }}>Select theme</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {Object.entries(THEME_META).map(([key, meta]) => (
              <button key={key} onClick={() => { setTheme(key); toast.success(`Theme: ${meta.label}`) }}
                className="relative rounded-xl p-3.5 text-right transition-all overflow-hidden"
                style={{
                  background: theme === key ? 'var(--bg-active)' : 'var(--bg-hover)',
                  border: `1px solid ${theme === key ? 'var(--border-brand)' : 'var(--border)'}`,
                }}>
                {/* Swatch */}
                <div className="w-full h-8 rounded-lg mb-2"
                     style={{ background: `linear-gradient(135deg, ${meta.preview}, ${meta.preview}90)` }} />
                <div className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>
                  {meta.labelAr}
                </div>
                <div className="text-xs" style={{ color:'var(--text-muted)' }}>{meta.label}</div>
                {theme === key && (
                  <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          <Row title="Sidebar" description="Expand or collapse the sidebar">
            <Toggle value={sidebarMode === SIDEBAR_MODE.EXPANDED} onChange={toggleSidebar} />
          </Row>
          <Row title="Compact Mode" description="Reduce spacing for more content">
            <Toggle value={compactMode} onChange={toggleCompact} />
          </Row>
          <Row title="Reduce Motion" description="Disable animations for performance">
            <Toggle value={reducedMotion} onChange={toggleReducedMotion} />
          </Row>
          <Row title="Font Size" description="Adjust text size">
            <div className="flex gap-1">
              {['S','M','L'].map((s, i) => {
                const val = ['small','normal','large'][i]
                return (
                  <button key={s} onClick={() => setFontSize(val)}
                    className="w-8 h-8 rounded-lg text-xs font-bold transition-all"
                    style={{
                      background: fontSize === val ? 'var(--brand-500)' : 'var(--bg-hover)',
                      border:'1px solid var(--border)',
                      color: fontSize === val ? 'white' : 'var(--text-secondary)',
                    }}>
                    {s}
                  </button>
                )
              })}
            </div>
          </Row>
        </Section>
      )}

      {/* ── Dashboard ── */}
      {active === 'dashboard' && (
        <Section icon={LayoutDashboard} title="Dashboard Preferences">
          {/* Widget cards — static (overall achievement, branch rank etc.) */}
          <p className="text-xs mb-4" style={{ color:'var(--text-muted)' }}>
            Choose which cards to display. Minimum 2 cards.
          </p>
          <div className="space-y-2">
            {Object.entries(DASHBOARD_CARDS).map(([key, meta]) => {
              const active = dashboardCards.includes(key)
              return (
                <button key={key} onClick={() => toggleDashCard(key)}
                  className="flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all"
                  style={{
                    background: active ? 'var(--bg-active)' : 'var(--bg-hover)',
                    border:`1px solid ${active ? 'var(--border-brand)' : 'var(--border)'}`,
                  }}>
                  <div className="text-right">
                    <div className="text-sm font-medium" style={{ color:'var(--text-primary)' }}>{meta.labelAr}</div>
                    <div className="text-xs" style={{ color:'var(--text-muted)' }}>{meta.label}</div>
                  </div>
                  <div className="w-5 h-5 rounded-md flex items-center justify-center transition-all"
                       style={{ background: active ? 'var(--brand-500)' : 'transparent', border:`1px solid ${active ? 'var(--brand-500)' : 'var(--border-hover)'}` }}>
                    {active && <Check className="w-3 h-3 text-white" />}
                  </div>
                </button>
              )
            })}
          </div>

          {/* ── Dynamic KPI visibility — registry-driven ── */}
          <div className="mt-6">
            <div className="text-xs font-semibold mb-3 flex items-center gap-2"
                 style={{ color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
              <Target style={{ width:11, height:11 }} />
              Active KPIs ({registryKpiCards.length})
            </div>
            <p className="text-xs mb-3" style={{ color:'var(--text-muted)' }}>
              KPIs active in your registry. Manage via Admin → KPI Registry.
            </p>
            <div className="space-y-1.5">
              {registryKpiCards.map(({ key, label, labelAr, isCore }) => (
                <div key={key}
                  className="flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{ background:'var(--bg-hover)', border:'1px solid var(--border)' }}>
                  <div className="flex items-center gap-2.5 text-right">
                    <div style={{ width:6, height:6, borderRadius:'50%', background: isCore ? 'var(--brand-500)' : '#a1a1aa', flexShrink:0 }} />
                    <div>
                      <div className="text-xs font-medium" style={{ color:'var(--text-primary)' }}>{labelAr}</div>
                      <div style={{ fontSize:'10px', color:'var(--text-muted)', fontFamily:'monospace' }}>{key}</div>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: isCore ? 'rgba(0,210,173,0.10)' : 'rgba(161,161,170,0.10)', color: isCore ? 'var(--brand-400)' : '#a1a1aa', border: `1px solid ${isCore ? 'rgba(0,210,173,0.20)' : 'rgba(161,161,170,0.20)'}` }}>
                    {isCore ? 'Core' : 'Custom'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* ── KPI ── */}
      {active === 'kpi' && (
        <Section icon={Target} title="KPI Settings">
          <div className="rounded-xl p-4" style={{ background:'var(--bg-hover)', border:'1px solid var(--border)' }}>
            <h4 className="text-sm font-semibold mb-3" style={{ color:'var(--text-primary)' }}>
              Traffic Light Thresholds
            </h4>
            {[
              { label:'Excellent', desc:'Ahead of schedule by ≥5%', color:'#22c55e', icon:'🟢' },
              { label:'Good',      desc:'Within ±5% of expected',   color:'#1a9a7e', icon:'🔵' },
              { label:'Warning',   desc:'Behind by 5–15%',          color:'#f59e0b', icon:'🟡' },
              { label:'Critical',  desc:'Behind by >15%',           color:'#ef4444', icon:'🔴' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 py-2 border-b last:border-0"
                   style={{ borderColor:'var(--border)' }}>
                <span style={{ fontSize:16 }}>{item.icon}</span>
                <div>
                  <div className="text-sm font-medium" style={{ color: item.color }}>{item.label}</div>
                  <div className="text-xs" style={{ color:'var(--text-muted)' }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl p-4" style={{ background:'var(--bg-hover)', border:'1px solid var(--border)' }}>
            <h4 className="text-sm font-semibold mb-2" style={{ color:'var(--text-primary)' }}>Daily Mission</h4>
            <p className="text-xs" style={{ color:'var(--text-muted)' }}>
              Auto-generated from your weakest KPI. Rule-based engine — AI-ready for future upgrade.
            </p>
          </div>
        </Section>
      )}

      {/* ── Notifications ── */}
      {active === 'notifications' && (
        <Section icon={Bell} title="Notifications">
          <div className="rounded-xl p-4 text-center" style={{ background:'var(--bg-hover)' }}>
            <Bell className="w-8 h-8 mx-auto mb-2" style={{ color:'var(--text-muted)' }} />
            <p className="text-sm" style={{ color:'var(--text-muted)' }}>
              Push notifications — coming in next phase
            </p>
          </div>
        </Section>
      )}

      {/* ── System ── */}
      {active === 'system' && (
        <Section icon={Info} title="System Information">
          {[
            { label:'Application',  value:'PharmaPulse' },
            { label:'Version',      value:'v4.0.0' },
            { label:'Mode',         value:'Production' },
            { label:'Database',     value:'Cloud Firestore' },
            { label:'Auth',         value:'Firebase Authentication' },
            { label:'User UID',     value: userProfile?.uid, mono:true },
            { label:'Role',         value: userProfile?.role },
            { label:'Build',        value:'2025' },
          ].map((item) => (
            <Row key={item.label} title={item.label}>
              <span className={`text-sm ${item.mono ? 'font-mono text-xs' : 'font-medium'}`}
                    style={{ color: item.mono ? 'var(--brand-300)' : 'var(--text-primary)' }}>
                {item.value || '—'}
              </span>
            </Row>
          ))}
        </Section>
      )}

      {/* ── Developer ── */}
      {active === 'developer' && (
        <Section icon={Code2} title="Developer">
          <div className="text-center py-6 space-y-5">
            <Logo size={48} className="justify-center" />
            <div>
              <div className="text-xl font-bold" style={{ color:'var(--text-primary)' }}>
                Samir Goda
              </div>
              <div className="text-sm mt-0.5" style={{ color:'var(--brand-300)' }}>
                Enterprise Software Engineer
              </div>
              <div className="text-xs mt-2" style={{ color:'var(--text-muted)' }}>
                Designed & Developed PharmaPulse from the ground up
              </div>
            </div>
            <div className="rounded-2xl p-4 text-sm space-y-1"
                 style={{ background:'var(--bg-hover)', border:'1px solid var(--border)' }}>
              {['React 19 + Vite 6','Firebase Auth + Firestore','Zustand + TailwindCSS',
                'Recharts + Framer Motion','6 Themes · Traffic Light · Run Rate','Daily Mission Engine'].map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background:'var(--brand-500)' }} />
                  <span style={{ color:'var(--text-secondary)' }}>{t}</span>
                </div>
              ))}
            </div>
            <p className="text-xs" style={{ color:'var(--text-muted)' }}>
              © 2025 PharmaPulse · All rights reserved
            </p>
          </div>
        </Section>
      )}
    </div>
  )
}
