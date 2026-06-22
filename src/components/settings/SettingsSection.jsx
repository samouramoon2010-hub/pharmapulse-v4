// ============================================================
// SettingsSection — reusable section shell for the Settings Center
// (Phase T2-A)
//
// Pure presentational wrapper: icon + title + optional description
// + children. Used by every section (functional Appearance and the
// coming-soon stubs alike) so they all share one visual language.
// ============================================================
import React from 'react'

export default function SettingsSection({ icon: Icon, title, description, children }) {
  return (
    <section style={{ maxWidth: '760px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '20px' }}>
        {Icon && (
          <div style={{
            width: 32, height: 32, borderRadius: 'var(--radius-panel, 10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', flexShrink: 0,
          }}>
            <Icon style={{ width: 16, height: 16, color: 'var(--brand-400)' }} strokeWidth={1.75} />
          </div>
        )}
        <div>
          <h2 style={{ fontSize: 'var(--font-title, 18px)', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {title}
          </h2>
          {description && (
            <p style={{ fontSize: 'var(--font-body, 13px)', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

// ── Coming-soon stub, shared by every non-Appearance section ──
// Premium, reassuring — not a giant blank box (UI 3.0 empty-state
// convention: compact, icon, title, one line of body text).
export function ComingSoonNotice({ icon: Icon, title = 'Coming soon', description }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      padding: '28px 20px', borderRadius: 'var(--radius-panel, 12px)',
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', gap: '8px',
    }}>
      {Icon && (
        <div style={{
          width: 36, height: 36, borderRadius: 'var(--radius-panel, 10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', marginBottom: '4px',
        }}>
          <Icon style={{ width: 16, height: 16, color: 'var(--text-muted)' }} strokeWidth={1.5} />
        </div>
      )}
      <div style={{ fontSize: 'var(--font-body, 13px)', fontWeight: 600, color: 'var(--text-secondary)' }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: 'var(--font-caption, 12px)', color: 'var(--text-muted)', maxWidth: '320px', lineHeight: 1.5 }}>
          {description}
        </div>
      )}
    </div>
  )
}
