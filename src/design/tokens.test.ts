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
    expect(COLORS.bgCanvas).toBe('#09090b')
    expect(COLORS.bgSurface).toBe('#141417')
    expect(COLORS.bgElevated).toBe('#1c1c20')
    expect(COLORS.bgOverlay).toBe('#222226')
  })

  it('defines text hierarchy', () => {
    expect(COLORS.textPrimary).toBeTruthy()
    expect(COLORS.textSecondary).toBeTruthy()
    expect(COLORS.textMuted).toBeTruthy()
    expect(COLORS.textBrand).toBeTruthy()
  })

  it('defines brand teal palette', () => {
    expect(COLORS.brand500).toBe('#00d2ad')
    expect(COLORS.brand400).toBe('#26e8b4')
  })

  it('defines semantic status colors', () => {
    expect(COLORS.success).toBe('#22c55e')
    expect(COLORS.warning).toBe('#f59e0b')
    expect(COLORS.danger).toBe('#ef4444')
    expect(COLORS.info).toBe('#3b82f6')
  })

  it('kpiFallback is #a1a1aa (the canonical fallback)', () => {
    expect(COLORS.kpiFallback).toBe('#a1a1aa')
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
    expect(KPI_FALLBACK_COLOR).toBe('#a1a1aa')
  })

  it('BRAND_COLOR equals COLORS.brand500', () => {
    expect(BRAND_COLOR).toBe(COLORS.brand500)
    expect(BRAND_COLOR).toBe('#00d2ad')
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

  it('excellent is green', () => expect(KPI_TRAFFIC_COLORS.excellent.color).toBe('#22c55e'))
  it('good is brand teal', () => expect(KPI_TRAFFIC_COLORS.good.color).toBe('#00d2ad'))
  it('warning is amber',   () => expect(KPI_TRAFFIC_COLORS.warning.color).toBe('#f59e0b'))
  it('critical is red',    () => expect(KPI_TRAFFIC_COLORS.critical.color).toBe('#ef4444'))
})

describe('getTrafficConfig — safe lookup helper', () => {
  it('returns correct config for known status', () => {
    expect(getTrafficConfig('excellent').color).toBe('#22c55e')
    expect(getTrafficConfig('critical').color).toBe('#ef4444')
  })

  it('falls back to good config for unknown status', () => {
    expect(getTrafficConfig('unknown').color).toBe('#00d2ad')
  })

  it('falls back to good for undefined', () => {
    expect(getTrafficConfig(undefined).color).toBe('#00d2ad')
  })

  it('never returns undefined color', () => {
    for (const s of ['excellent', 'good', 'warning', 'critical', 'unknown', '', undefined]) {
      expect(getTrafficConfig(s as string | undefined).color).toBeTruthy()
    }
  })
})

describe('getTrafficColor — safe color string helper', () => {
  it('returns color string for known status', () => {
    expect(getTrafficColor('warning')).toBe('#f59e0b')
  })

  it('returns brand color for unknown status (falls back to good)', () => {
    expect(getTrafficColor('nonexistent')).toBe('#00d2ad')
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
    expect(EXECUTIVE_COLORS.momentum).toBe('#22c55e')
    expect(EXECUTIVE_COLORS.declining).toBe('#ef4444')
  })
})

// ── Cross-system consistency ──────────────────────────────

describe('Token consistency — cross-system alignment', () => {
  it('kpiFallback matches KPI_COLORS.default', () => {
    expect(COLORS.kpiFallback).toBe(KPI_COLORS.default)
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

  it('brand500 matches textBrand', () => {
    expect(COLORS.brand500).toBe(COLORS.textBrand)
  })
})
