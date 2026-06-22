// ============================================================
// Phase 4B — Parity Tests
//
// Verifies that for every core engine key:
//   • getKpiTargetField(key, registry) === getKpiTargetField(key) [both paths agree]
//   • getKpiTargetField(key, registry) === KPI_META[key].targetField [matches legacy]
//   • getKpiActualField(key, registry) === getKpiActualField(key)   [both paths agree]
//   • getKpiThresholds(key, registry)  toEqual getKpiThresholds(key) [both paths agree]
//   • getCoachingActionForKey returns non-empty for all keys
//
// No mismatches — all parity assertions must pass.
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import {
  KPI_META,
  getKpiActualField,
  getKpiTargetField,
  getKpiThresholds,
  getCoachingActionForKey,
} from '../kpiAnalyticsEngine'

const CORE_ENGINE_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'] as const

// ════════════════════════════════════════════════════════════
// targetField parity
// ════════════════════════════════════════════════════════════

describe('4B Parity — targetField', () => {
  for (const key of CORE_ENGINE_KEYS) {
    it(`${key}: registry path and fallback path agree`, () => {
      const withRegistry = getKpiTargetField(key, DEFAULT_KPI_REGISTRY as any)
      const noRegistry   = getKpiTargetField(key)
      expect(withRegistry).toBe(noRegistry)
    })

    it(`${key}: matches KPI_META.targetField`, () => {
      const fromResolver = getKpiTargetField(key, DEFAULT_KPI_REGISTRY as any)
      expect(fromResolver).toBe(KPI_META[key].targetField)
    })
  }

  it('crossSelling targetField is crossSellTarget (not crossSellingTarget)', () => {
    expect(getKpiTargetField('crossSelling')).toBe('crossSellTarget')
    expect(getKpiTargetField('crossSelling', DEFAULT_KPI_REGISTRY as any)).toBe('crossSellTarget')
  })

  it('omni targetField is omniTarget (resolves via omnihealth.aliasFor)', () => {
    expect(getKpiTargetField('omni', DEFAULT_KPI_REGISTRY as any)).toBe('omniTarget')
  })

  it('wellness targetField is wellnessTarget (resolves via wellnessCard.aliasFor)', () => {
    expect(getKpiTargetField('wellness', DEFAULT_KPI_REGISTRY as any)).toBe('wellnessTarget')
  })
})

// ════════════════════════════════════════════════════════════
// actualField parity
// ════════════════════════════════════════════════════════════

describe('4B Parity — actualField', () => {
  for (const key of CORE_ENGINE_KEYS) {
    it(`${key}: registry path and fallback path agree`, () => {
      const withRegistry = getKpiActualField(key, DEFAULT_KPI_REGISTRY as any)
      const noRegistry   = getKpiActualField(key)
      expect(withRegistry).toBe(noRegistry)
    })
  }

  it('all 5 core actual fields equal their engine keys', () => {
    for (const key of CORE_ENGINE_KEYS) {
      expect(getKpiActualField(key)).toBe(key)
    }
  })

  it('non-core registry KPIs resolve actual fields correctly', () => {
    // Non-core KPIs: engine key = registry key (no alias)
    expect(getKpiActualField('sales', DEFAULT_KPI_REGISTRY as any)).toBe('sales')
    expect(getKpiActualField('sl',    DEFAULT_KPI_REGISTRY as any)).toBe('sl')
    expect(getKpiActualField('ndf',   DEFAULT_KPI_REGISTRY as any)).toBe('ndf')
  })

  it('pilot KPI insuranceConversion resolves actual field from registry', () => {
    expect(
      getKpiActualField('insuranceConversion', DEFAULT_KPI_REGISTRY as any)
    ).toBe('insuranceConversion')
  })
})

// ════════════════════════════════════════════════════════════
// thresholds parity
// ════════════════════════════════════════════════════════════

describe('4B Parity — thresholds', () => {
  for (const key of CORE_ENGINE_KEYS) {
    it(`${key}: registry path and fallback path agree`, () => {
      const withRegistry = getKpiThresholds(key, DEFAULT_KPI_REGISTRY as any)
      const noRegistry   = getKpiThresholds(key)
      expect(withRegistry).toEqual(noRegistry)
    })
  }

  it('wasfaty uses PRESCRIPTION thresholds (healthy=95, watch=80, risk=65, critical=45)', () => {
    const t = getKpiThresholds('wasfaty', DEFAULT_KPI_REGISTRY as any)
    expect(t).toEqual({ healthy: 95, watch: 80, risk: 65, critical: 45 })
  })

  it('basket uses REVENUE thresholds (healthy=95, watch=85, risk=70, critical=50)', () => {
    const t = getKpiThresholds('basket', DEFAULT_KPI_REGISTRY as any)
    expect(t).toEqual({ healthy: 95, watch: 85, risk: 70, critical: 50 })
  })

  it('omni uses STANDARD thresholds (healthy=95, watch=80, risk=60, critical=40)', () => {
    const t = getKpiThresholds('omni', DEFAULT_KPI_REGISTRY as any)
    expect(t).toEqual({ healthy: 95, watch: 80, risk: 60, critical: 40 })
  })
})

// ════════════════════════════════════════════════════════════
// coaching action parity
// ════════════════════════════════════════════════════════════

describe('4B Parity — coaching actions', () => {
  it('all 5 core keys return non-empty coaching text (fallback path)', () => {
    for (const key of CORE_ENGINE_KEYS) {
      const action = getCoachingActionForKey(key)
      expect(action, `${key} fallback coaching`).toBeTruthy()
      expect(action.length).toBeGreaterThan(10)
    }
  })

  it('all 11 registry KPIs have non-empty coaching via registry path', () => {
    for (const [bizKey, kpi] of Object.entries(DEFAULT_KPI_REGISTRY)) {
      const engineKey = (kpi as any).aliasFor ?? bizKey
      const action = getCoachingActionForKey(engineKey, DEFAULT_KPI_REGISTRY as any)
      expect(action, `${bizKey} registry coaching`).toBeTruthy()
      expect(action.length).toBeGreaterThan(10)
    }
  })
})

// ════════════════════════════════════════════════════════════
// Cross-check: all non-core registry KPIs have targetField
// ════════════════════════════════════════════════════════════

describe('4B Parity — non-core and pilot KPIs have field resolution', () => {
  const NON_CORE_KEYS = ['sales', 'sl', 'ndf', 'inbody', 'liberation', 'insuranceConversion']

  it('non-core KPIs resolve targetField from registry', () => {
    for (const key of NON_CORE_KEYS) {
      const field = getKpiTargetField(key, DEFAULT_KPI_REGISTRY as any)
      expect(field, `${key}.targetField`).toBeTruthy()
      expect(field).not.toBe('')
      // Should end with Target by convention
      expect(field.toLowerCase()).toContain('target')
    }
  })

  it('non-core KPIs resolve actualField from registry', () => {
    for (const key of NON_CORE_KEYS) {
      const field = getKpiActualField(key, DEFAULT_KPI_REGISTRY as any)
      expect(field, `${key}.actualField`).toBeTruthy()
      expect(field).not.toBe('')
    }
  })
})
