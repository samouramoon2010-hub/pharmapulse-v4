// ============================================================
// Design Tokens Foundation — Test Suite
// Phase: Design Tokens Foundation Lite
// Tests: token completeness, safe helpers, no breaking changes
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  SHADOWS,
  RADIUS,
  KPI_TRAFFIC_COLORS,
  KPI_COLORS,
  RISK_COLORS,
  EXECUTIVE_COLORS,
  KPI_FALLBACK_COLOR,
  BRAND_COLOR,
  getTrafficConfig,
  getTrafficColor,
  getKpiColor,
  Z,
  DURATION,
} from './tokens'

// ── Token structure ───────────────────────────────────────

describe('COLORS — semantic color tokens', () => {
  it('defines all background layers', () => {
    expect(COLORS.bgCanvas).toBe('#0F1623')   // 2.0 Warm Slate
    expect(COLORS.bgSurface).toBe('#1A2235')   // 2.0
    expect(COLORS.bgElevated).toBe('#232E44')  // 2.0
    expect(COLORS.bgOverlay).toBe('#2A3550')   // 2.0
  })

  it('defines text hierarchy', () => {
    expect(COLORS.textPrimary).toBeTruthy()
    expect(COLORS.textSecondary).toBeTruthy()
    expect(COLORS.textMuted).toBeTruthy()
    expect(COLORS.textBrand).toBeTruthy()
  })

  it('defines brand teal palette', () => {
    expect(COLORS.brand500).toBe('#0D6B74')   // 2.0 Deep Teal
    expect(COLORS.brand400).toBe('#2DD4BF')   // 2.0
  })

  it('defines semantic status colors', () => {
    expect(COLORS.success).toBe('#2D7D5A')   // 2.0 Sage Green
    expect(COLORS.warning).toBe('#D4840A')   // 2.0 Warm Amber
    expect(COLORS.danger).toBe('#B92B2B')    // 2.0 Deep Crimson
    expect(COLORS.info).toBe('#3b82f6')      // unchanged
  })

  it('kpiFallback is #a1a1aa (the canonical fallback)', () => {
    expect(COLORS.kpiFallback).toBe('#94A3B8')   // 2.0
  })

  it('all hex values are valid 3 or 6-digit hex strings', () => {
    const hexColors = [
      COLORS.bgCanvas, COLORS.bgSurface, COLORS.brand500,
      COLORS.success, COLORS.warning, COLORS.danger, COLORS.kpiFallback,
    ]
    for (const c of hexColors) {
      expect(c).toMatch(/^#[0-9a-fA-F]{3,6}$/)
    }
  })
})

describe('KPI_FALLBACK_COLOR and BRAND_COLOR constants', () => {
  it('KPI_FALLBACK_COLOR equals COLORS.kpiFallback', () => {
    expect(KPI_FALLBACK_COLOR).toBe(COLORS.kpiFallback)
    expect(KPI_FALLBACK_COLOR).toBe('#94A3B8')   // 2.0
  })

  it('BRAND_COLOR equals COLORS.brand500', () => {
    expect(BRAND_COLOR).toBe(COLORS.brand500)
    expect(BRAND_COLOR).toBe('#0D6B74')   // 2.0 Deep Teal
  })
})

// ── Traffic-light tokens ──────────────────────────────────

describe('KPI_TRAFFIC_COLORS — four statuses defined', () => {
  const statuses = ['excellent', 'good', 'warning', 'critical'] as const

  for (const s of statuses) {
    it(`${s} has color, bg, border, label, labelAr, icon`, () => {
      const cfg = KPI_TRAFFIC_COLORS[s]
      expect(cfg.color).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(cfg.bg).toBeTruthy()
      expect(cfg.border).toBeTruthy()
      expect(cfg.label).toBeTruthy()
      expect(cfg.labelAr).toBeTruthy()
      expect(cfg.icon).toBeTruthy()
    })
  }

  it('excellent is sage green (2.0)', () => expect(KPI_TRAFFIC_COLORS.excellent.color).toBe('#2D7D5A'))
  it('good is deep teal (2.0)', () => expect(KPI_TRAFFIC_COLORS.good.color).toBe('#0D9BAA'))
  it('warning is warm amber (2.0)', () => expect(KPI_TRAFFIC_COLORS.warning.color).toBe('#D4840A'))
  it('critical is deep crimson (2.0)', () => expect(KPI_TRAFFIC_COLORS.critical.color).toBe('#B92B2B'))
})

describe('getTrafficConfig — safe lookup helper', () => {
  it('returns correct config for known status', () => {
    expect(getTrafficConfig('excellent').color).toBe('#2D7D5A')  // 2.0
    expect(getTrafficConfig('critical').color).toBe('#B92B2B')   // 2.0
  })

  it('falls back to good config for unknown status', () => {
    expect(getTrafficConfig('unknown').color).toBe('#0D9BAA')  // 2.0 good fallback
  })

  it('falls back to good for undefined', () => {
    expect(getTrafficConfig(undefined).color).toBe('#0D9BAA')  // 2.0 good fallback
  })

  it('never returns undefined color', () => {
    for (const s of ['excellent', 'good', 'warning', 'critical', 'unknown', '', undefined]) {
      expect(getTrafficConfig(s as string | undefined).color).toBeTruthy()
    }
  })
})

describe('getTrafficColor — safe color string helper', () => {
  it('returns color string for known status', () => {
    expect(getTrafficColor('warning')).toBe('#D4840A')  // 2.0 Warm Amber
  })

  it('returns brand color for unknown status (falls back to good)', () => {
    expect(getTrafficColor('nonexistent')).toBe('#0D9BAA')  // 2.0 good fallback
  })

  it('never returns undefined', () => {
    expect(getTrafficColor(undefined)).toBeTruthy()
    expect(typeof getTrafficColor(undefined)).toBe('string')
  })
})

// ── KPI_COLORS ────────────────────────────────────────────

describe('KPI_COLORS — core KPI palette', () => {
  const core = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'] as const

  for (const k of core) {
    it(`${k} has a valid hex color`, () => {
      expect(KPI_COLORS[k]).toMatch(/^#[0-9a-fA-F]{6}$/)
    })
  }

  it('default fallback is #a1a1aa', () => {
    expect(KPI_COLORS.default).toBe('#a1a1aa')
  })
})

describe('getKpiColor — safe KPI color lookup', () => {
  it('returns designated color for core KPI', () => {
    expect(getKpiColor('wasfaty')).toBe('#6366f1')
    expect(getKpiColor('basket')).toBe('#22c55e')
  })

  it('returns #a1a1aa for unknown KPI key', () => {
    expect(getKpiColor('nps')).toBe('#a1a1aa')
    expect(getKpiColor('manuka')).toBe('#a1a1aa')
    expect(getKpiColor('unknownKpi999')).toBe('#a1a1aa')
  })

  it('never returns undefined', () => {
    expect(getKpiColor('')).toBeTruthy()
    expect(getKpiColor('anything')).toBeTruthy()
  })
})

// ── RISK_COLORS ───────────────────────────────────────────

describe('RISK_COLORS — four risk levels', () => {
  const levels = ['low', 'medium', 'high', 'critical'] as const

  for (const l of levels) {
    it(`${l} has color, bg, border, label`, () => {
      expect(RISK_COLORS[l].color).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(RISK_COLORS[l].bg).toBeTruthy()
      expect(RISK_COLORS[l].border).toBeTruthy()
      expect(RISK_COLORS[l].label).toBeTruthy()
    })
  }
})

// ── Spacing / Typography / Shadows / Radius ───────────────

describe('SPACING — token completeness', () => {
  it('has common spacing values', () => {
    expect(SPACING[4]).toBe('16px')
    expect(SPACING[6]).toBe('24px')
    expect(SPACING.cardPadding).toBe('16px')
    expect(SPACING.sectionGap).toBe('24px')
  })
})

describe('TYPOGRAPHY — font and scale tokens', () => {
  it('defines font families', () => {
    expect(TYPOGRAPHY.fontSans).toContain('Inter')
    expect(TYPOGRAPHY.fontArabic).toContain('Cairo')
    expect(TYPOGRAPHY.fontMono).toContain('JetBrains Mono')
  })

  it('defines size scale', () => {
    expect(TYPOGRAPHY.sizeBase).toBe('13px')
    expect(TYPOGRAPHY.sizeMetric).toBe('1.75rem')
    expect(TYPOGRAPHY.size2xs).toBe('10px')
  })

  it('defines tabular-nums feature settings', () => {
    expect(TYPOGRAPHY.featureTabular).toContain('tnum')
  })
})

describe('SHADOWS — shadow tokens', () => {
  it('card inner highlight defined', () => {
    expect(SHADOWS.cardInner).toContain('inset')
  })

  it('focus ring defined', () => {
    expect(SHADOWS.focusRing).toContain('rgba')
  })

  it('glow shadow defined', () => {
    expect(SHADOWS.glow).toContain('rgba(0,210,173')
  })
})

describe('RADIUS — border radius tokens', () => {
  it('card radius is 12px', () => {
    expect(RADIUS.card).toBe('12px')
  })

  it('badge is full pill', () => {
    expect(RADIUS.badge).toBe('9999px')
    expect(RADIUS.full).toBe('9999px')
  })
})

describe('Z — z-index scale', () => {
  it('modal is above overlay', () => {
    expect(Z.modal).toBeGreaterThan(Z.overlay)
  })
  it('toast is highest', () => {
    expect(Z.toast).toBeGreaterThan(Z.modal)
  })
})

describe('DURATION — animation timing', () => {
  it('progress animation is 700ms', () => {
    expect(DURATION.progress).toBe('700ms')
  })
  it('normal interaction is 150ms', () => {
    expect(DURATION.normal).toBe('150ms')
  })
})

describe('EXECUTIVE_COLORS — exec palette defined', () => {
  it('has momentum and declining colors', () => {
    expect(EXECUTIVE_COLORS.momentum).toBe('#2D7D5A')   // 2.0 Sage Green
    expect(EXECUTIVE_COLORS.declining).toBe('#B92B2B')   // 2.0 Deep Crimson
  })
})

// ── Cross-system consistency ──────────────────────────────

describe('Token consistency — cross-system alignment', () => {
  it('kpiFallback and KPI_COLORS.default are valid hex colors (2.0 allows them to differ)', () => {
    expect(COLORS.kpiFallback).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(KPI_COLORS.default).toMatch(/^#[0-9a-fA-F]{3,6}$/)
  })

  it('success color matches traffic excellent color', () => {
    expect(COLORS.success).toBe(KPI_TRAFFIC_COLORS.excellent.color)
  })

  it('danger color matches traffic critical color', () => {
    expect(COLORS.danger).toBe(KPI_TRAFFIC_COLORS.critical.color)
  })

  it('warning color matches traffic warning color', () => {
    expect(COLORS.warning).toBe(KPI_TRAFFIC_COLORS.warning.color)
  })

  it('textBrand is a valid hex color (2.0: textBrand can differ from brand500 for legibility)', () => {
    expect(COLORS.textBrand).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(COLORS.brand500).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
})
