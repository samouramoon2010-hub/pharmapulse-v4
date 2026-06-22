// ============================================================
// RadiusSelector — sharp / soft / rounded (Phase T2-E)
//
// Reads/writes radiusMode via useTheme(). Only updates CSS
// variables (--radius-*); never manually restyles components.
// ============================================================
import React from 'react'
import { useTheme } from '../../theme/useTheme'
import { RADIUS_MODES } from '../../design/appearanceTokens'

const LABELS = { sharp: 'Sharp', soft: 'Soft', rounded: 'Rounded' }
// Preview corner radius per mode — purely illustrative swatch, not the
// real --radius-card value (kept independent so the swatch always
// renders even before the CSS var updates).
const PREVIEW_RADIUS = { sharp: '4px', soft: '12px', rounded: '20px' }

export default function RadiusSelector() {
  const { radiusMode, setRadius } = useTheme()

  return (
    <div data-testid="radius-selector" style={{ display: 'flex', gap: '8px' }}>
      {RADIUS_MODES.map((mode) => {
        const active = mode === radiusMode
        return (
          <button
            key={mode}
            data-testid={`radius-option-${mode}`}
            onClick={() => setRadius(mode)}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
              padding: '10px 6px',
              borderRadius: 'var(--radius-button, 8px)',
              border: `1px solid ${active ? 'var(--border-brand, var(--brand-500))' : 'var(--border-subtle)'}`,
              background: active ? 'var(--bg-active)' : 'var(--bg-hover)',
              color: active ? 'var(--brand-300)' : 'var(--text-secondary)',
              fontSize: 'var(--font-caption, 12px)', fontWeight: active ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            <span style={{
              width: 24, height: 24, background: 'currentColor', opacity: 0.5,
              borderRadius: PREVIEW_RADIUS[mode],
            }} />
            {LABELS[mode]}
          </button>
        )
      })}
    </div>
  )
}
