// ============================================================
// SettingsSidebar — left navigation rail of the Settings Center
// (Phase T2-A)
//
// VS Code / Notion-inspired: a narrow, always-visible vertical list
// of sections (not a dropdown, not a modal). Pure presentational —
// receives the active section id and a change callback.
// ============================================================
import React from 'react'
import {
  SlidersHorizontal, Palette, Bot, Bell, ShieldCheck, Lock, Gauge, Info,
} from 'lucide-react'

export const SETTINGS_SECTIONS = [
  { id: 'general',       label: 'General',       icon: SlidersHorizontal, functional: true  },
  { id: 'appearance',    label: 'Appearance',     icon: Palette,           functional: true  },
  { id: 'ai-providers',  label: 'AI Providers',   icon: Bot,               functional: false },
  { id: 'notifications', label: 'Notifications',  icon: Bell,              functional: false },
  { id: 'security',      label: 'Security',       icon: ShieldCheck,       functional: false },
  { id: 'privacy',       label: 'Privacy',        icon: Lock,              functional: false },
  { id: 'performance',   label: 'Performance',    icon: Gauge,             functional: false },
  { id: 'about',         label: 'About',          icon: Info,              functional: true  },
]

export default function SettingsSidebar({ activeId, onSelect }) {
  return (
    <nav style={{
      width: '220px', flexShrink: 0,
      borderRight: '1px solid var(--border-subtle)',
      padding: '16px 10px',
      display: 'flex', flexDirection: 'column', gap: '2px',
      overflowY: 'auto',
    }}>
      {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => {
        const active = id === activeId
        return (
          <button
            key={id}
            data-testid={`settings-nav-${id}`}
            onClick={() => onSelect(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '0 12px',
              height: 'var(--density-control-height, 34px)',
              borderRadius: 'var(--radius-button, 8px)',
              border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
              background: active ? 'var(--bg-active)' : 'transparent',
              color: active ? 'var(--brand-300)' : 'var(--text-secondary)',
              borderLeft: active ? '2px solid var(--brand-500)' : '2px solid transparent',
              fontSize: 'var(--font-body, 13px)', fontWeight: active ? 600 : 500,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
          >
            <Icon style={{ width: 14, height: 14, flexShrink: 0 }} strokeWidth={1.75} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
