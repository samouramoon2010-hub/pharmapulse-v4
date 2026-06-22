// ============================================================
// AppearancePreviewPanel — live preview mockup (Phase T2-G)
//
// Static, safe preview labels only — no fake production data, no
// real KPI/business values. Every visual reacts immediately to
// theme/density/radius/font changes because it consumes only CSS
// variables (var(--color-*), var(--density-*), var(--radius-*),
// var(--font-*)) — the same ones ThemeProvider writes to the
// document — plus the live chart palette from useTheme().activeTheme.
// ============================================================
import React from 'react'
import { useTheme } from '../../theme/useTheme'

const STATUS = [
  { label: 'On track', tone: 'var(--color-success, #1E8E5A)' },
  { label: 'At risk',   tone: 'var(--color-warning, #C77700)' },
]

export default function AppearancePreviewPanel() {
  const { activeTheme } = useTheme()

  return (
    <div
      data-testid="appearance-preview-panel"
      style={{
        borderRadius: 'var(--radius-panel, 14px)',
        border: '1px solid var(--color-border, var(--border-subtle))',
        background: 'var(--color-background, var(--bg-canvas))',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', height: '180px' }}>
        {/* Mini sidebar */}
        <div style={{
          width: '64px', flexShrink: 0,
          background: 'var(--color-surface, var(--bg-surface))',
          borderRight: '1px solid var(--color-border, var(--border-subtle))',
          padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '6px',
        }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              height: '8px', borderRadius: '3px',
              background: i === 0 ? 'var(--color-primary)' : 'var(--color-muted-text, var(--text-muted))',
              opacity: i === 0 ? 1 : 0.25,
            }} />
          ))}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Mini header */}
          <div style={{
            height: '28px', flexShrink: 0,
            background: 'var(--color-surface, var(--bg-surface))',
            borderBottom: '1px solid var(--color-border, var(--border-subtle))',
            display: 'flex', alignItems: 'center', padding: '0 10px',
          }}>
            <div style={{ width: '60px', height: '6px', borderRadius: '3px', background: 'var(--color-muted-text, var(--text-muted))', opacity: 0.4 }} />
          </div>

          <div style={{ flex: 1, padding: 'var(--density-card-padding, 16px)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* KPI card preview */}
            <div style={{
              borderRadius: 'var(--radius-card, 12px)',
              border: '1px solid var(--color-border, var(--border-subtle))',
              background: 'var(--color-card, var(--bg-elevated))',
              padding: '10px 12px',
            }}>
              <div style={{ fontSize: 'var(--font-caption, 11px)', color: 'var(--color-muted-text, var(--text-muted))', marginBottom: '4px' }}>
                Sample KPI
              </div>
              <div style={{ fontSize: 'var(--font-title, 18px)', fontWeight: 700, color: 'var(--color-text, var(--text-primary))', fontVariantNumeric: 'tabular-nums' }}>
                72%
              </div>
            </div>

            {/* Table row preview */}
            <div style={{
              height: 'var(--density-row-height, 32px)',
              borderRadius: 'var(--radius-input, 6px)',
              border: '1px solid var(--color-border, var(--border-subtle))',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 10px',
              fontSize: 'var(--font-body, 13px)', color: 'var(--color-text, var(--text-primary))',
            }}>
              <span>Row 1</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-muted-text, var(--text-muted))' }}>128</span>
            </div>

            {/* Status badges */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {STATUS.map((s) => (
                <span key={s.label} style={{
                  fontSize: 'var(--font-caption, 11px)', fontWeight: 600,
                  padding: '2px 8px', borderRadius: '99px',
                  color: s.tone, background: 'var(--color-card, var(--bg-elevated))',
                  border: `1px solid ${s.tone}`,
                }}>
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chart palette preview */}
      <div style={{
        display: 'flex', gap: '4px', padding: '10px 12px',
        borderTop: '1px solid var(--color-border, var(--border-subtle))',
      }}>
        {activeTheme.chartPalette.map((color, i) => (
          <div key={i} style={{ flex: 1, height: '10px', borderRadius: '3px', background: color }} />
        ))}
      </div>
    </div>
  )
}
