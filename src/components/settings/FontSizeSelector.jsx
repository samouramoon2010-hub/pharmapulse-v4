// ============================================================
// FontSizeSelector — compact / standard / large (Phase T2-F)
//
// Reads/writes fontScale via useTheme(). Only updates CSS variables
// (--font-*). The critical-insight floor (13px) is enforced inside
// design/appearanceTokens.ts itself (--font-body never drops below
// 13px in any mode) — this component just exposes the 3 modes.
// ============================================================
import React from 'react'
import { useTheme } from '../../theme/useTheme'
import { FONT_SCALE_MODES } from '../../design/appearanceTokens'

const LABELS = { compact: 'Compact', standard: 'Standard', large: 'Large' }
const PREVIEW_SIZE = { compact: '12px', standard: '14px', large: '17px' }

export default function FontSizeSelector() {
  const { fontScale, setFontScale } = useTheme()

  return (
    <div data-testid="font-size-selector" style={{ display: 'flex', gap: '8px' }}>
      {FONT_SCALE_MODES.map((mode) => {
        const active = mode === fontScale
        return (
          <button
            key={mode}
            data-testid={`font-scale-option-${mode}`}
            onClick={() => setFontScale(mode)}
            style={{
              flex: 1,
              height: 'var(--density-control-height, 34px)',
              borderRadius: 'var(--radius-button, 8px)',
              border: `1px solid ${active ? 'var(--border-brand, var(--brand-500))' : 'var(--border-subtle)'}`,
              background: active ? 'var(--bg-active)' : 'var(--bg-hover)',
              color: active ? 'var(--brand-300)' : 'var(--text-secondary)',
              fontWeight: active ? 700 : 500,
              fontSize: PREVIEW_SIZE[mode],
              cursor: 'pointer',
            }}
          >
            Aa <span style={{ fontSize: '10px', opacity: 0.7 }}>{LABELS[mode]}</span>
          </button>
        )
      })}
    </div>
  )
}
