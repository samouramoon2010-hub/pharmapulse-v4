// ============================================================
// ThemePreviewCard — single theme card in the Theme Selector
// (Phase T2-C)
//
// Pure presentational. Shows name, short description, preview
// swatches, dark/light classification, a chart-palette strip,
// active state, and an Apply button. No theme logic here — the
// click handler is a prop, supplied by ThemeSelector via useTheme().
// ============================================================
import React from 'react'
import { Check, Moon, Sun } from 'lucide-react'

export default function ThemePreviewCard({ meta, preset, description, isActive, onApply }) {
  return (
    <div
      data-testid={`theme-preview-card-${meta.id}`}
      style={{
        borderRadius: 'var(--radius-card, 12px)',
        border: `1px solid ${isActive ? 'var(--border-brand, var(--brand-500))' : 'var(--border-subtle)'}`,
        background: 'var(--bg-surface)',
        padding: 'var(--density-card-padding, 16px)',
        display: 'flex', flexDirection: 'column', gap: '10px',
        position: 'relative',
      }}
    >
      {isActive && (
        <div style={{
          position: 'absolute', top: '10px', right: '10px',
          width: 18, height: 18, borderRadius: '50%',
          background: 'var(--brand-500)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Check style={{ width: 11, height: 11, color: '#fff' }} />
        </div>
      )}

      {/* Preview swatches — primary/secondary/background/surface */}
      <div style={{ display: 'flex', height: '36px', borderRadius: 'var(--radius-button, 8px)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
        <div style={{ flex: 1, background: preset.background }} />
        <div style={{ flex: 1, background: preset.surface }} />
        <div style={{ flex: 1, background: preset.primary }} />
        <div style={{ flex: 1, background: preset.secondary }} />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: 'var(--font-body, 13px)', fontWeight: 700, color: 'var(--text-primary)' }}>
            {meta.name}
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '3px',
            fontSize: 'var(--font-caption, 10px)', fontWeight: 600,
            padding: '1px 6px', borderRadius: '99px',
            background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}>
            {meta.isDark ? <Moon style={{ width: 9, height: 9 }} /> : <Sun style={{ width: 9, height: 9 }} />}
            {meta.isDark ? 'Dark' : 'Light'}
          </span>
        </div>
        {description && (
          <p style={{ fontSize: 'var(--font-caption, 12px)', color: 'var(--text-muted)', margin: '3px 0 0', lineHeight: 1.4 }}>
            {description}
          </p>
        )}
      </div>

      {/* Chart palette preview */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {preset.chartPalette.map((color, i) => (
          <div key={i} style={{ width: 14, height: 14, borderRadius: '4px', background: color, flexShrink: 0 }} />
        ))}
      </div>

      <button
        onClick={onApply}
        disabled={isActive}
        data-testid={`theme-apply-${meta.id}`}
        style={{
          marginTop: '2px',
          height: 'var(--density-control-height, 32px)',
          borderRadius: 'var(--radius-button, 8px)',
          border: '1px solid var(--border-subtle)',
          background: isActive ? 'var(--bg-overlay)' : 'var(--brand-500)',
          color: isActive ? 'var(--text-muted)' : '#fff',
          fontSize: 'var(--font-caption, 12px)', fontWeight: 600,
          cursor: isActive ? 'default' : 'pointer',
        }}
      >
        {isActive ? 'Active' : 'Apply'}
      </button>
    </div>
  )
}
