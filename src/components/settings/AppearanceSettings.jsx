// ============================================================
// AppearanceSettings — Settings Center Appearance section
// (Phase T2-B)
//
// Composes ThemeSelector, DensitySelector, RadiusSelector,
// FontSizeSelector, and AppearancePreviewPanel. Everything reads
// from / writes to useTheme() — no duplicate theme state.
// ============================================================
import React from 'react'
import { RotateCcw } from 'lucide-react'
import { useTheme } from '../../theme/useTheme'
import ThemeSelector from './ThemeSelector'
import DensitySelector from './DensitySelector'
import RadiusSelector from './RadiusSelector'
import FontSizeSelector from './FontSizeSelector'
import AppearancePreviewPanel from './AppearancePreviewPanel'

function SubLabel({ children }) {
  return (
    <div style={{
      fontSize: 'var(--font-caption, 11px)', fontWeight: 600,
      color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
      marginBottom: '8px',
    }}>
      {children}
    </div>
  )
}

export default function AppearanceSettings() {
  const { resetAppearance } = useTheme()

  return (
    <div data-testid="appearance-settings" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <SubLabel>Theme</SubLabel>
        <ThemeSelector />
      </div>

      <div>
        <SubLabel>Live preview</SubLabel>
        <AppearancePreviewPanel />
      </div>

      <div>
        <SubLabel>Density</SubLabel>
        <DensitySelector />
      </div>

      <div>
        <SubLabel>Corner radius</SubLabel>
        <RadiusSelector />
      </div>

      <div>
        <SubLabel>Font size</SubLabel>
        <FontSizeSelector />
      </div>

      <div>
        <button
          onClick={resetAppearance}
          data-testid="reset-appearance-btn"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            height: 'var(--density-control-height, 34px)', padding: '0 14px',
            borderRadius: 'var(--radius-button, 8px)',
            border: '1px solid var(--border-subtle)', background: 'var(--bg-hover)',
            color: 'var(--text-secondary)', fontSize: 'var(--font-caption, 12px)', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RotateCcw style={{ width: 13, height: 13 }} />
          Reset appearance
        </button>
      </div>
    </div>
  )
}
