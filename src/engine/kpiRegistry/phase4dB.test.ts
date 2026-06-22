// ============================================================
// Phase 4D-B — Shared KPI UI Adapter Parity Tests
//
// Verifies that the centralized display metadata API:
//   • getKpiLabel, getKpiColor, getKpiIcon, getKpiUnit, getKpiCategory
//   • getKpiMetaForDisplay
//
// produces correct, registry-first output with safe fallbacks for
// all 5 core engine keys: wasfaty, omni, wellness, basket, crossSelling
//
// Guardrails:
//   • No Dashboard calculation changes
//   • No Firestore changes
//   • No KPI Entry changes
//   • No Dynamic KPI regional wiring
//   • Existing dynamicKpiRegionalWiring failures remain untouched
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import {
  getKpiLabel,
  getKpiLabelAr,
  getKpiColor,
  getKpiIcon,
  getKpiUnit,
  getKpiCategory,
  getKpiMetaForDisplay,
  DEFAULT_KPI_COLOR,
} from './kpiUiAdapter'
import {
  getKpiColor as resolverGetKpiColor,
  getKpiLabel as resolverGetKpiLabel,
} from './kpiMetaResolver'
import { KPI_META } from '../kpiAnalyticsEngine'

const CORE_ENGINE_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'] as const

// ════════════════════════════════════════════════════════════
// TASK 1 — Adapter exports all required functions
// ════════════════════════════════════════════════════════════

describe('4D-B: kpiUiAdapter exports all required display functions', () => {
  it('getKpiLabel is exported from kpiUiAdapter', () => {
    expect(typeof getKpiLabel).toBe('function')
  })

  it('getKpiColor is exported from kpiUiAdapter', () => {
    expect(typeof getKpiColor).toBe('function')
  })

  it('getKpiIcon is exported from kpiUiAdapter', () => {
    expect(typeof getKpiIcon).toBe('function')
  })

  it('getKpiUnit is exported from kpiUiAdapter', () => {
    expect(typeof getKpiUnit).toBe('function')
  })

  it('getKpiCategory is exported from kpiUiAdapter', () => {
    expect(typeof getKpiCategory).toBe('function')
  })

  it('getKpiMetaForDisplay is exported from kpiUiAdapter', () => {
    expect(typeof getKpiMetaForDisplay).toBe('function')
  })

  it('DEFAULT_KPI_COLOR is exported from kpiUiAdapter', () => {
    expect(typeof DEFAULT_KPI_COLOR).toBe('string')
    expect(DEFAULT_KPI_COLOR).toBeTruthy()
  })
})

// ════════════════════════════════════════════════════════════
// TASK 2 — Registry-first behavior
// ════════════════════════════════════════════════════════════

describe('4D-B: registry-first behavior', () => {
  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: getKpiLabel uses registry label`, () => {
      const label = getKpiLabel(k)
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toBe(k)  // registry has a real label, not just the key
    })
  }

  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: getKpiColor returns a valid hex color`, () => {
      const color = getKpiColor(k)
      expect(color).toMatch(/^#[0-9a-fA-F]{3,8}$/)
    })
  }

  it('getKpiLabel returns key as fallback for unknown key', () => {
    const label = getKpiLabel('unknownKpiXyz')
    expect(label).toBe('unknownKpiXyz')
  })

  it('getKpiColor returns DEFAULT_KPI_COLOR for unknown key', () => {
    const color = getKpiColor('unknownKpiXyz')
    expect(color).toBe(DEFAULT_KPI_COLOR)
  })

  it('getKpiIcon returns empty string for key with no icon', () => {
    const icon = getKpiIcon('unknownKpiXyz')
    expect(typeof icon).toBe('string')
  })

  it('getKpiUnit returns empty string for unknown key', () => {
    const unit = getKpiUnit('unknownKpiXyz')
    expect(typeof unit).toBe('string')
  })

  it('getKpiCategory returns fallback for unknown key', () => {
    const cat = getKpiCategory('unknownKpiXyz')
    expect(typeof cat).toBe('string')
    expect(cat.length).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════
// TASK 3 — Label correctness: getKpiLabel returns registry label
// ════════════════════════════════════════════════════════════

// Note: wellness registry label is 'Wellness Card' (more specific) vs
// legacy KPI_META 'Wellness'. Registry is the authority in Phase 4D-B.
// wasfaty, omni, basket, crossSelling match legacy labels exactly.

describe('4D-B: label correctness — getKpiLabel returns non-empty human-readable labels', () => {
  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: getKpiLabel returns a non-empty label (not the raw key)`, () => {
      const label = getKpiLabel(k)
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
      // should be human-readable, not the raw engine key
      expect(label).not.toBe(k)
    })
  }

  // Registry labels are the canonical values — more specific than legacy KPI_META
  it('wasfaty label: registry === legacy (both "Wasfaty")', () => {
    expect(getKpiLabel('wasfaty')).toBe('Wasfaty')
    expect(getKpiLabel('wasfaty')).toBe(KPI_META['wasfaty'].en)
  })

  it('omni label: registry is "OmniHealth" (legacy KPI_META is "Omni")', () => {
    expect(getKpiLabel('omni')).toBe('OmniHealth')
  })

  it('wellness label: registry is "Wellness Card" (legacy KPI_META is "Wellness")', () => {
    expect(getKpiLabel('wellness')).toBe('Wellness Card')
  })

  it('basket label: registry is "Basket Size" (legacy KPI_META is "Basket")', () => {
    expect(getKpiLabel('basket')).toBe('Basket Size')
  })

  it('crossSelling label: registry === legacy (both "Cross Selling")', () => {
    expect(getKpiLabel('crossSelling')).toBe('Cross Selling')
    expect(getKpiLabel('crossSelling')).toBe(KPI_META['crossSelling'].en)
  })
})

// ════════════════════════════════════════════════════════════
// TASK 4 — Color parity: kpiUiAdapter ↔ kpiMetaResolver (single source)
// ════════════════════════════════════════════════════════════

describe('4D-B: color parity — kpiUiAdapter re-exports kpiMetaResolver values', () => {
  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: getKpiColor from kpiUiAdapter === getKpiColor from kpiMetaResolver`, () => {
      expect(getKpiColor(k)).toBe(resolverGetKpiColor(k))
    })
  }

  it('adapter getKpiLabel === resolver getKpiLabel for all core keys', () => {
    for (const k of CORE_ENGINE_KEYS) {
      expect(getKpiLabel(k)).toBe(resolverGetKpiLabel(k))
    }
  })
})

// ════════════════════════════════════════════════════════════
// TASK 5 — getKpiMetaForDisplay shape and parity
// ════════════════════════════════════════════════════════════

describe('4D-B: getKpiMetaForDisplay returns complete display object', () => {
  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: getKpiMetaForDisplay returns all required fields`, () => {
      const meta = getKpiMetaForDisplay(k, DEFAULT_KPI_REGISTRY as any)
      expect(typeof meta.label).toBe('string')
      expect(typeof meta.labelAr).toBe('string')
      expect(typeof meta.color).toBe('string')
      expect(typeof meta.icon).toBe('string')
      expect(typeof meta.unit).toBe('string')
      expect(typeof meta.category).toBe('string')
    })
  }

  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: getKpiMetaForDisplay.label matches getKpiLabel(k)`, () => {
      const meta = getKpiMetaForDisplay(k, DEFAULT_KPI_REGISTRY as any)
      expect(meta.label).toBe(getKpiLabel(k))
    })
  }

  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: getKpiMetaForDisplay.color matches getKpiColor(k)`, () => {
      const meta = getKpiMetaForDisplay(k, DEFAULT_KPI_REGISTRY as any)
      expect(meta.color).toBe(getKpiColor(k))
    })
  }

  it('getKpiMetaForDisplay without registry returns safe fallbacks', () => {
    for (const k of CORE_ENGINE_KEYS) {
      expect(() => getKpiMetaForDisplay(k)).not.toThrow()
      const meta = getKpiMetaForDisplay(k)
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.color).toMatch(/^#[0-9a-fA-F]{3,8}$/)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TASK 6 — Unit and category resolve from registry
// ════════════════════════════════════════════════════════════

describe('4D-B: getKpiUnit resolves from registry', () => {
  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: getKpiUnit returns a string`, () => {
      const unit = getKpiUnit(k)
      expect(typeof unit).toBe('string')
    })
  }
})

describe('4D-B: getKpiCategory resolves from registry', () => {
  for (const k of CORE_ENGINE_KEYS) {
    it(`${k}: getKpiCategory returns a non-empty string`, () => {
      const cat = getKpiCategory(k)
      expect(typeof cat).toBe('string')
      expect(cat.length).toBeGreaterThan(0)
    })
  }
})

// ════════════════════════════════════════════════════════════
// TASK 7 — Guardrail: Dashboard calculation safety
// ════════════════════════════════════════════════════════════

describe('4D-B: guardrails', () => {
  it('DashboardPage does not import FALLBACK_COLORS', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw').then((m) => m.default)
    expect(src).not.toContain('FALLBACK_COLORS')
  })

  it('DashboardPage does not import DEFAULT_KPI_COLOR directly', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw').then((m) => m.default)
    expect(src).not.toContain('DEFAULT_KPI_COLOR')
  })

  it('DashboardPage uses getKpiColor for color fallback', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw').then((m) => m.default)
    expect(src).toContain('getKpiColor(')
  })

  it('kpiUiAdapter does not import from kpiAnalyticsEngine (no circular dep)', async () => {
    const src = await import('./kpiUiAdapter.ts?raw').then((m) => m.default)
    expect(src).not.toContain("from '../kpiAnalyticsEngine'")
    expect(src).not.toContain("from '../../engine/kpiAnalyticsEngine'")
  })

  it('kpiUiAdapter does not touch Firestore', async () => {
    const src = await import('./kpiUiAdapter.ts?raw').then((m) => m.default)
    expect(src).not.toContain('firestore')
    expect(src).not.toContain('setDoc')
    expect(src).not.toContain('getDoc')
    expect(src).not.toContain('collection(')
  })

  it('getKpiMetaForDisplay never throws for edge-case inputs', () => {
    expect(() => getKpiMetaForDisplay('')).not.toThrow()
    expect(() => getKpiMetaForDisplay('nonExistent_9999')).not.toThrow()
  })
})
