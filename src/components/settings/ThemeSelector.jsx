// ============================================================
// ThemeSelector — theme grid for the Settings Center Appearance
// section (Phase T2-C)
//
// Reads activeTheme/availableThemes/setTheme from useTheme() — the
// single source of truth shared with the header quick toggle
// (T1-D/T2-I). No duplicate theme state, no custom theme creation.
// ============================================================
import React from 'react'
import { useTheme } from '../../theme/useTheme'
import { THEME_PRESETS } from '../../design/themeRegistry'
import ThemePreviewCard from './ThemePreviewCard'

// Short, human descriptions for the selector only — additive UI copy,
// not a change to the certified themePresets.ts data contract.
const THEME_DESCRIPTIONS = {
  corporate:  'Clean, light, and professional — the default look.',
  executive:  'Dark navy with a teal accent for a premium feel.',
  futuristic: 'Deep space dark with a glowing cyan accent.',
  medical:    'Light, calm, and high-contrast for clinical settings.',
  amoled:     'True black background, ideal for OLED screens.',
  apple:      'Light, minimal, and familiar — inspired by iOS.',
  cyber:      'High-energy dark theme with magenta/cyan neon accents.',
}

export default function ThemeSelector() {
  const { activeThemeId, availableThemes, setTheme } = useTheme()

  return (
    <div data-testid="theme-selector" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
      {availableThemes.map((meta) => (
        <ThemePreviewCard
          key={meta.id}
          meta={meta}
          preset={THEME_PRESETS[meta.id]}
          description={THEME_DESCRIPTIONS[meta.id]}
          isActive={meta.id === activeThemeId}
          onApply={() => setTheme(meta.id)}
        />
      ))}
    </div>
  )
}
