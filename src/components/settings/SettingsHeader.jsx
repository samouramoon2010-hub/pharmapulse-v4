// ============================================================
// SettingsHeader — top bar of the full-screen Settings Center
// (Phase T2-A)
//
// Pure presentational. No business logic, no data fetching.
// ============================================================
import React from 'react'
import { Settings as SettingsIcon } from 'lucide-react'

export default function SettingsHeader() {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '18px 24px',
      borderBottom: '1px solid var(--border-subtle)',
      flexShrink: 0,
    }}>
      <SettingsIcon style={{ width: 18, height: 18, color: 'var(--text-muted)' }} strokeWidth={1.75} />
      <div>
        <h1 style={{ fontSize: 'var(--font-title, 18px)', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
          Settings
        </h1>
        <p style={{ fontSize: 'var(--font-caption, 12px)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
          Preferences, appearance, and system configuration
        </p>
      </div>
    </header>
  )
}
