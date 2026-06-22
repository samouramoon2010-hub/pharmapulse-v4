// ============================================================
// DensitySelector — compact / comfortable / spacious (Phase T2-D)
//
// Reads/writes densityMode via useTheme() — the same provider that
// owns the active theme (single source of truth, no parallel store).
// Only updates CSS variables (--density-*); never rewrites a
// component's own styling.
// ============================================================
import React from 'react'
import { useTheme } from '../../theme/useTheme'
import { DENSITY_MODES } from '../../design/appearanceTokens'

const LABELS = { compact: 'Compact', comfortable: 'Comfortable', spacious: 'Spacious' }

export default function DensitySelector() {
  const { densityMode, setDensity } = useTheme()

  return (
    <div data-testid="density-selector" style={{ display: 'flex', gap: '8px' }}>
      {DENSITY_MODES.map((mode) => {
        const active = mode === densityMode
        return (
          <button
            key={mode}
            data-testid={`density-option-${mode}`}
            onClick={() => setDensity(mode)}
            style={{
              flex: 1,
              height: 'var(--density-control-height, 34px)',
              borderRadius: 'var(--radius-button, 8px)',
              border: `1px solid ${active ? 'var(--border-brand, var(--brand-500))' : 'var(--border-subtle)'}`,
              background: active ? 'var(--bg-active)' : 'var(--bg-hover)',
              color: active ? 'var(--brand-300)' : 'var(--text-secondary)',
              fontSize: 'var(--font-caption, 12px)', fontWeight: active ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {LABELS[mode]}
          </button>
        )
      })}
    </div>
  )
}
