// ============================================================
// Phase 4B — Registry Enrichment + Resolver Layer
//
// Verifies:
//  1.  KpiDefinition has actualField and targetField fields
//  2.  All 11 registry KPIs define actualField
//  3.  All 11 registry KPIs define targetField
//  4.  getKpiActualField is exported from kpiAnalyticsEngine
//  5.  getKpiTargetField is exported from kpiAnalyticsEngine
//  6.  getKpiActualField uses registry when provided (registry-first)
//  7.  getKpiActualField falls back to hardcoded map without registry
//  8.  getKpiActualField strict mode throws for unknown key
//  9.  getKpiThresholds is exported
// 10.  getCoachingActionForKey is exported
// 11.  normalizeArabicNumerals is exported
// 12.  Arabic-Indic digits convert correctly
// 13.  ASCII digits pass through unchanged
// 14.  computeAchievementPct signature unchanged, not wired to normalizer
// 15.  kpiAnalyticsEngine has no dashboard imports
// 16.  kpiAnalyticsEngine has no React/UI imports
// 17.  kpiAnalyticsEngine has no Firestore imports
// 18.  kpiAnalyticsEngine has no dynamic reader imports
// 19.  phase4b adds no surface migration
// 20.  dynamicKpiRegionalWiring.test.ts not referenced in new engine code
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import {
  getKpiActualField,
  getKpiTargetField,
  getKpiThresholds,
  getCoachingActionForKey,
  normalizeArabicNumerals,
} from '../kpiAnalyticsEngine'

const typesSrc   = () => import('./kpiRegistryTypes?raw').then((m) => m.default)
const engineSrc  = () => import('../kpiAnalyticsEngine?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1. KpiDefinition has new fields
// ════════════════════════════════════════════════════════════

describe('4B Task 1 — KpiDefinition new fields', () => {
  it('KpiDefinition has actualField (test 1)', async () => {
    const src = await typesSrc()
    expect(src).toContain('actualField')
    expect(src).toContain('targetField')
    expect(src).toContain('defaultCap')
    expect(src).toContain('icon')
    expect(src).toContain('colorHex')
    expect(src).toContain('tags')
  })
})

// ════════════════════════════════════════════════════════════
// 2-3. All 11 registry KPIs define actualField and targetField
// ════════════════════════════════════════════════════════════

describe('4B Task 2-3 — Registry KPI field coverage', () => {
  it('all 11 registry KPIs define actualField (test 2)', () => {
    const entries = Object.entries(DEFAULT_KPI_REGISTRY)
    expect(entries.length).toBe(11)
    for (const [key, kpi] of entries) {
      expect((kpi as any).actualField, `${key}.actualField`).toBeDefined()
      expect((kpi as any).actualField, `${key}.actualField`).not.toBe('')
    }
  })

  it('all 11 registry KPIs define targetField (test 3)', () => {
    for (const [key, kpi] of Object.entries(DEFAULT_KPI_REGISTRY)) {
      expect((kpi as any).targetField, `${key}.targetField`).toBeDefined()
      expect((kpi as any).targetField, `${key}.targetField`).not.toBe('')
    }
  })
})

// ════════════════════════════════════════════════════════════
// 4-5. Resolver functions are exported
// ════════════════════════════════════════════════════════════

describe('4B Task 3 — Resolver exports exist', () => {
  it('getKpiActualField is exported (test 4)', () => {
    expect(typeof getKpiActualField).toBe('function')
  })

  it('getKpiTargetField is exported (test 5)', () => {
    expect(typeof getKpiTargetField).toBe('function')
  })
})

// ════════════════════════════════════════════════════════════
// 6-8. getKpiActualField registry-first + fallback + strict
// ════════════════════════════════════════════════════════════

describe('4B Task 3/8 — getKpiActualField behavior', () => {
  it('registry-first: omni resolves via omnihealth.actualField (test 6)', () => {
    const result = getKpiActualField('omni', DEFAULT_KPI_REGISTRY as any)
    expect(result).toBe('omni')
  })

  it('registry-first: wasfaty resolves from registry (test 6b)', () => {
    const result = getKpiActualField('wasfaty', DEFAULT_KPI_REGISTRY as any)
    expect(result).toBe('wasfaty')
  })

  it('fallback: wasfaty resolves without registry (test 7)', () => {
    expect(getKpiActualField('wasfaty')).toBe('wasfaty')
    expect(getKpiActualField('omni')).toBe('omni')
    expect(getKpiActualField('wellness')).toBe('wellness')
    expect(getKpiActualField('basket')).toBe('basket')
    expect(getKpiActualField('crossSelling')).toBe('crossSelling')
  })

  it('ultimate fallback: unknown key returns engine key itself (test 7b)', () => {
    expect(getKpiActualField('newDynamicKpi')).toBe('newDynamicKpi')
  })

  it('strict mode throws for unknown key (test 8)', () => {
    expect(() => getKpiActualField('unknownKpi', undefined, true)).toThrow(
      "getKpiActualField: unknown engine key 'unknownKpi'"
    )
  })

  it('strict mode does NOT throw for known keys (test 8b)', () => {
    expect(() => getKpiActualField('wasfaty', undefined, true)).not.toThrow()
  })
})

describe('4B Task 3/8 — getKpiTargetField behavior', () => {
  it('registry-first: crossSelling resolves crossSellTarget (test 6c)', () => {
    const result = getKpiTargetField('crossSelling', DEFAULT_KPI_REGISTRY as any)
    expect(result).toBe('crossSellTarget')
  })

  it('fallback: all 5 core keys return correct target fields (test 7c)', () => {
    expect(getKpiTargetField('wasfaty')).toBe('wasfatyTarget')
    expect(getKpiTargetField('omni')).toBe('omniTarget')
    expect(getKpiTargetField('wellness')).toBe('wellnessTarget')
    expect(getKpiTargetField('basket')).toBe('basketTarget')
    expect(getKpiTargetField('crossSelling')).toBe('crossSellTarget')
  })

  it('ultimate fallback: unknown key returns engineKey + Target (test 7d)', () => {
    expect(getKpiTargetField('newKpi')).toBe('newKpiTarget')
  })

  it('strict mode throws for unknown key in getKpiTargetField (test 8c)', () => {
    expect(() => getKpiTargetField('unknownKpi', undefined, true)).toThrow(
      "getKpiTargetField: unknown engine key 'unknownKpi'"
    )
  })
})

// ════════════════════════════════════════════════════════════
// 9-10. Threshold and coaching resolvers exist
// ════════════════════════════════════════════════════════════

describe('4B Task 4-5 — Threshold and coaching resolvers', () => {
  it('getKpiThresholds is exported (test 9)', () => {
    expect(typeof getKpiThresholds).toBe('function')
  })

  it('getKpiThresholds returns correct values for wasfaty (test 9b)', () => {
    const t = getKpiThresholds('wasfaty')
    expect(t.healthy).toBe(95)
    expect(t.watch).toBe(80)
    expect(t.risk).toBe(65)
    expect(t.critical).toBe(45)
  })

  it('getKpiThresholds returns STANDARD fallback for unknown key (test 9c)', () => {
    const t = getKpiThresholds('unknownKpi')
    expect(t).toEqual({ healthy: 95, watch: 80, risk: 60, critical: 40 })
  })

  it('getCoachingActionForKey is exported (test 10)', () => {
    expect(typeof getCoachingActionForKey).toBe('function')
  })

  it('getCoachingActionForKey returns coaching text for core keys (test 10b)', () => {
    for (const key of ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']) {
      const action = getCoachingActionForKey(key)
      expect(action, `${key} coaching action`).toBeTruthy()
      expect(action.length).toBeGreaterThan(10)
    }
  })

  it('getCoachingActionForKey returns empty string for unknown key (test 10c)', () => {
    expect(getCoachingActionForKey('unknownKpi')).toBe('')
  })
})

// ════════════════════════════════════════════════════════════
// 11-13. normalizeArabicNumerals
// ════════════════════════════════════════════════════════════

describe('4B Task 6 — normalizeArabicNumerals', () => {
  it('normalizeArabicNumerals is exported (test 11)', () => {
    expect(typeof normalizeArabicNumerals).toBe('function')
  })

  it('converts Arabic-Indic digit sequences (test 12)', () => {
    expect(normalizeArabicNumerals('١٢٣٤٥')).toBe('12345')
    expect(normalizeArabicNumerals('٢٥٠٠')).toBe('2500')
    expect(normalizeArabicNumerals('٠')).toBe('0')
    expect(normalizeArabicNumerals('٩')).toBe('9')
  })

  it('converts Arabic decimal separator (test 12b)', () => {
    expect(normalizeArabicNumerals('٣٠٫٥')).toBe('30.5')
  })

  it('all 10 Arabic-Indic digits convert correctly (test 12c)', () => {
    expect(normalizeArabicNumerals('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789')
  })

  it('ASCII digits pass through unchanged (test 13)', () => {
    expect(normalizeArabicNumerals('12345')).toBe('12345')
    expect(normalizeArabicNumerals('2500')).toBe('2500')
    expect(normalizeArabicNumerals('30.5')).toBe('30.5')
    expect(normalizeArabicNumerals('0')).toBe('0')
  })
})

// ════════════════════════════════════════════════════════════
// 14-20. Guardrails — engine and surface integrity
// ════════════════════════════════════════════════════════════

describe('4B Task 9 — Guardrails', () => {
  it('computeAchievementPct signature unchanged (test 14)', async () => {
    const src = await engineSrc()
    expect(src).toContain('export function computeAchievementPct(')
    const idx = src.indexOf('export function computeAchievementPct(')
    expect(idx).toBeGreaterThan(-1)
    const nextFnIdx = src.indexOf('export function', idx + 1)
    const block = src.slice(idx, nextFnIdx > idx ? nextFnIdx : idx + 600)
    // normalizeArabicNumerals must NOT be called inside computeAchievementPct
    expect(block).not.toContain('normalizeArabicNumerals')
  })

  it('kpiAnalyticsEngine has no dashboard imports (test 15)', async () => {
    const src = await engineSrc()
    expect(src).not.toContain('DashboardPage')
    expect(src).not.toContain("from '../pages/dashboard'")
    expect(src).not.toContain("from '../../pages/dashboard'")
  })

  it('kpiAnalyticsEngine has no React or UI imports (test 16)', async () => {
    const src = await engineSrc()
    expect(src).not.toContain("from 'react'")
    expect(src).not.toContain("import React")
    expect(src).not.toContain('useEffect')
    expect(src).not.toContain('useState')
  })

  it('kpiAnalyticsEngine has no Firestore imports (test 17)', async () => {
    const src = await engineSrc()
    expect(src).not.toContain("from 'firebase/firestore'")
    expect(src).not.toContain("from '../services/firebase'")
    expect(src).not.toContain("from '../../services/firebase'")
  })

  it('kpiAnalyticsEngine has no dynamic reader imports (test 18)', async () => {
    const src = await engineSrc()
    // No import statements for live-registry hooks or services
    expect(src).not.toContain("import.*subscribeKpiRegistry")
    expect(src).not.toMatch(/^import[^'"]*subscribeKpiRegistry/m)
    expect(src).not.toMatch(/^import[^'"]*useKpiRegistry/m)
    expect(src).not.toMatch(/^import[^'"]*fetchKpiRegistry/m)
    // No import from kpiRegistryService (the Firestore subscription layer)
    expect(src).not.toContain("from '../services/kpiRegistryService'")
    expect(src).not.toContain("from '../../services/kpiRegistryService'")
  })

  it('phase4b adds no surface migration (test 19)', async () => {
    const src = await engineSrc()
    expect(src).not.toContain('PerformancePage')
    expect(src).not.toContain('BranchIntelligencePage')
    expect(src).not.toContain('PharmacistIntelligencePage')
    expect(src).not.toContain('DashboardPage')
    expect(src).not.toContain('TeamPage')
    expect(src).not.toContain('ReportsPage')
  })

  it('dynamicKpiRegionalWiring not referenced in engine additions (test 20)', async () => {
    const src = await engineSrc()
    expect(src).not.toContain('dynamicKpiRegionalWiring')
  })
})
