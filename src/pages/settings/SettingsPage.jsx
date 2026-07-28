// ============================================================
// SettingsPage — Settings Center (Phase T2-A)
//
// Full-screen, VS Code / Notion-inspired settings shell. Replaces
// the old tabbed src/pages/shared/SettingsPage.jsx at the /settings
// route. Only Appearance is newly functional in this bundle —
// General and About fold in the EXISTING working features from the
// old page (language switch, dashboard card picker, KPI threshold
// reference, system/developer info) so nothing regresses. AI
// Providers / Notifications / Security / Privacy / Performance are
// premium "coming soon" stubs — explicitly no real AI connection,
// no API key UI, no backend wiring yet.
//
// No business logic changes — every value shown here is read from
// the existing useSettingsStore / useI18n / KPI registry, exactly
// as the old page did.
// ============================================================
import React, { useState, useEffect, useMemo } from 'react'
import {
  SlidersHorizontal, Palette, Bot, Bell, ShieldCheck, Lock, Gauge, Info, Check, Target, FlaskConical, DatabaseBackup,
} from 'lucide-react'
import SettingsHeader from '../../components/settings/SettingsHeader'
import SettingsSidebar, { SETTINGS_SECTIONS } from '../../components/settings/SettingsSidebar'
import SettingsSection, { ComingSoonNotice } from '../../components/settings/SettingsSection'
import AppearanceSettings from '../../components/settings/AppearanceSettings'
import PersonalAiSettingsSection from '../../components/settings/PersonalAiSettingsSection'
import BackupSettingsSection from '../../components/settings/BackupSettingsSection'
import DemoDataPage from '../admin/DemoDataPage'
import { useSettingsStore, DASHBOARD_CARDS, SIDEBAR_MODE } from '../../store/settingsStore'
import { useAuthStore } from '../../store/authStore'
import { useToastStore } from '../../components/ui/Toast'
import Logo from '../../components/brand/Logo'
import { subscribeKpiRegistry } from '../../services/kpiRegistryService'
import { DEFAULT_KPI_REGISTRY, getKpisForSurface } from '../../engine/kpiRegistry'
import { useI18n } from '../../hooks/useI18n'
import { LANGUAGE_META } from '../../i18n/index'
import { KPI_TRAFFIC_COLORS } from '../../design/tokens'

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      className="w-11 h-6 rounded-full relative flex-shrink-0 transition-all duration-300"
      style={{ background: value ? 'var(--brand-500)' : 'var(--bg-hover)', border: '1px solid var(--border)' }}>
      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300"
           style={{ right: value ? '2px' : 'calc(100% - 22px)' }} />
    </button>
  )
}

function Row({ title, description, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0"
         style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="min-w-0">
        <div style={{ fontSize: 'var(--font-body, 13px)', fontWeight: 500, color: 'var(--text-primary)' }}>{title}</div>
        {description && <div style={{ fontSize: 'var(--font-caption, 11px)', color: 'var(--text-muted)', marginTop: '2px' }}>{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// ── General — folded from the old page: language + sidebar/motion + dashboard cards ──
function GeneralSettings() {
  const {
    sidebarMode, toggleSidebar, reducedMotion, toggleReducedMotion,
    dashboardCards, setDashboardCards,
  } = useSettingsStore()
  const { t, lang, setLang } = useI18n()
  const toast = useToastStore()

  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)
  useEffect(() => subscribeKpiRegistry(
    (reg) => setLiveRegistry(reg),
    () => setLiveRegistry(DEFAULT_KPI_REGISTRY),
  ), [])

  const registryKpiCards = useMemo(() => getKpisForSurface(liveRegistry, 'dashboardEnabled').map((kpi) => ({
    key: kpi.aliasFor ?? kpi.key,
    label: kpi.label || kpi.key,
    isCore: kpi.isCore ?? false,
  })), [liveRegistry])

  const toggleDashCard = (key) => {
    if (dashboardCards.includes(key)) {
      if (dashboardCards.length <= 2) { toast.warning('Minimum 2 cards required'); return }
      setDashboardCards(dashboardCards.filter((c) => c !== key))
    } else {
      setDashboardCards([...dashboardCards, key])
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Language */}
      <div>
        <div style={{ fontSize: 'var(--font-caption, 11px)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          {t('settings.language')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {Object.entries(LANGUAGE_META).map(([code, meta]) => {
            const isActive = lang === code
            return (
              <button key={code} onClick={() => setLang(code)}
                className="flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all"
                style={{
                  background: isActive ? 'var(--bg-active)' : 'var(--bg-hover)',
                  border: `1px solid ${isActive ? 'var(--border-brand)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-input, 8px)',
                }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: meta.dir === 'rtl' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ fontSize: 'var(--font-body, 13px)', fontWeight: 600, color: 'var(--text-primary)' }}>{meta.nativeName}</div>
                  <div style={{ fontSize: 'var(--font-caption, 11px)', color: 'var(--text-muted)' }}>{meta.label} · {meta.dir.toUpperCase()}</div>
                </div>
                {isActive && (
                  <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'var(--brand-500)' }}>
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sidebar / motion */}
      <div>
        <Row title="Sidebar" description="Expand or collapse the sidebar">
          <Toggle value={sidebarMode === SIDEBAR_MODE.EXPANDED} onChange={toggleSidebar} />
        </Row>
        <Row title="Reduce Motion" description="Disable animations for performance">
          <Toggle value={reducedMotion} onChange={toggleReducedMotion} />
        </Row>
      </div>

      {/* Dashboard cards */}
      <div>
        <div style={{ fontSize: 'var(--font-caption, 11px)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          Dashboard cards
        </div>
        <p style={{ fontSize: 'var(--font-caption, 12px)', color: 'var(--text-muted)', marginBottom: '10px' }}>
          Choose which cards to display. Minimum 2 cards.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {Object.entries(DASHBOARD_CARDS).map(([key, meta]) => {
            const active = dashboardCards.includes(key)
            return (
              <button key={key} onClick={() => toggleDashCard(key)}
                className="flex items-center justify-between w-full px-4 py-3 transition-all"
                style={{
                  background: active ? 'var(--bg-active)' : 'var(--bg-hover)',
                  border: `1px solid ${active ? 'var(--border-brand)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-input, 8px)',
                }}>
                <div>
                  <div style={{ fontSize: 'var(--font-body, 13px)', fontWeight: 500, color: 'var(--text-primary)' }}>{meta.label}</div>
                </div>
                {active && (
                  <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'var(--brand-500)' }}>
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: 'var(--font-caption, 11px)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Target style={{ width: 11, height: 11 }} /> Active KPIs ({registryKpiCards.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {registryKpiCards.map(({ key, label, isCore }) => (
              <div key={key} className="flex items-center justify-between px-3 py-2" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-input, 6px)' }}>
                <span style={{ fontSize: 'var(--font-caption, 12px)', color: 'var(--text-primary)' }}>{label}</span>
                <span style={{ fontSize: 'var(--font-caption, 10px)', padding: '1px 6px', borderRadius: '99px', color: isCore ? 'var(--brand-400)' : 'var(--text-muted)', background: isCore ? 'rgba(0,210,173,0.10)' : 'var(--bg-overlay)' }}>
                  {isCore ? 'Core' : 'Custom'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── About — folded from the old page: KPI legend + system info + developer credits ──
function AboutSettings() {
  const { userProfile } = useAuthStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="rounded-xl p-4" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-panel, 12px)' }}>
        <h4 style={{ fontSize: 'var(--font-body, 13px)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
          Traffic Light Thresholds
        </h4>
        {[
          { status: 'excellent', desc: 'Ahead of schedule by ≥5%' },
          { status: 'good',      desc: 'Within ±5% of expected' },
          { status: 'warning',   desc: 'Behind by 5–15%' },
          { status: 'critical',  desc: 'Behind by >15%' },
        ].map((item) => {
          const token = KPI_TRAFFIC_COLORS[item.status]
          return (
            <div key={item.status} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--border-subtle)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: token.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 'var(--font-body, 13px)', fontWeight: 500, color: token.color }}>{token.label}</div>
                <div style={{ fontSize: 'var(--font-caption, 11px)', color: 'var(--text-muted)' }}>{item.desc}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-xl p-4" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-panel, 12px)' }}>
        <h4 style={{ fontSize: 'var(--font-body, 13px)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>System Information</h4>
        {[
          { label: 'Application', value: 'PharmaPulse' },
          { label: 'Mode', value: 'Production' },
          { label: 'Database', value: 'Cloud Firestore' },
          { label: 'Auth', value: 'Firebase Authentication' },
          { label: 'User UID', value: userProfile?.uid },
          { label: 'Role', value: userProfile?.role },
        ].map((item) => (
          <Row key={item.label} title={item.label}>
            <span style={{ fontSize: 'var(--font-caption, 12px)', fontWeight: 500, color: 'var(--text-primary)' }}>{item.value || '—'}</span>
          </Row>
        ))}
      </div>

      <div className="text-center py-4" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <Logo size={40} />
        <div>
          <div style={{ fontSize: 'var(--font-title, 16px)', fontWeight: 700, color: 'var(--text-primary)' }}>Samir Goda</div>
          <div style={{ fontSize: 'var(--font-caption, 12px)', color: 'var(--brand-300)' }}>Enterprise Software Engineer</div>
        </div>
        <p style={{ fontSize: 'var(--font-caption, 11px)', color: 'var(--text-muted)' }}>© 2025 PharmaPulse · All rights reserved</p>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [activeId, setActiveId] = useState('appearance')
  const { userProfile } = useAuthStore()
  const isAdmin = userProfile?.role === 'admin'

  return (
    <div data-testid="settings-center" style={{
      display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - var(--topbar-h, 52px))',
      marginTop: 'calc(-1.5rem)', marginLeft: '-1.5rem', marginRight: '-1.5rem',
      background: 'var(--bg-canvas)',
    }}>
      <SettingsHeader />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <SettingsSidebar activeId={activeId} onSelect={setActiveId} isAdmin={isAdmin} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {activeId === 'general' && (
            <SettingsSection icon={SlidersHorizontal} title="General" description="Language and general app preferences.">
              <GeneralSettings />
            </SettingsSection>
          )}
          {activeId === 'appearance' && (
            <SettingsSection icon={Palette} title="Appearance" description="Theme, density, corner radius, and font size — applied instantly across the app.">
              <AppearanceSettings />
            </SettingsSection>
          )}
          {activeId === 'ai-providers' && (
            <SettingsSection icon={Bot} title="AI Providers" description="Connect your own AI provider — your key stays on this device and is billed to your own account.">
              <PersonalAiSettingsSection />
            </SettingsSection>
          )}
          {activeId === 'notifications' && (
            <SettingsSection icon={Bell} title="Notifications" description="Choose what you get notified about.">
              <ComingSoonNotice icon={Bell} title="Notifications — coming soon" description="Push notification preferences arrive in a future update." />
            </SettingsSection>
          )}
          {activeId === 'security' && (
            <SettingsSection icon={ShieldCheck} title="Security" description="Manage sign-in and account security.">
              <ComingSoonNotice icon={ShieldCheck} title="Security — coming soon" description="Session and sign-in security controls arrive in a future update." />
            </SettingsSection>
          )}
          {activeId === 'privacy' && (
            <SettingsSection icon={Lock} title="Privacy" description="Control what data is shared.">
              <ComingSoonNotice icon={Lock} title="Privacy — coming soon" description="Privacy controls arrive in a future update." />
            </SettingsSection>
          )}
          {activeId === 'performance' && (
            <SettingsSection icon={Gauge} title="Performance" description="Tune the app for your device.">
              <ComingSoonNotice icon={Gauge} title="Performance — coming soon" description="Performance tuning controls arrive in a future update." />
            </SettingsSection>
          )}
          {activeId === 'admin-tools' && isAdmin && (
            <SettingsSection icon={FlaskConical} title="Admin Tools" description="Demo data seeding for testing and demos — never affects real production data outside its own demo batches.">
              <DemoDataPage />
            </SettingsSection>
          )}
          {activeId === 'backup' && isAdmin && (
            <SettingsSection icon={DatabaseBackup} title="Data Backup" description="Download an on-demand snapshot of production data.">
              <BackupSettingsSection />
            </SettingsSection>
          )}
          {activeId === 'about' && (
            <SettingsSection icon={Info} title="About" description="App, system, and reference information.">
              <AboutSettings />
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  )
}

export { SETTINGS_SECTIONS }
