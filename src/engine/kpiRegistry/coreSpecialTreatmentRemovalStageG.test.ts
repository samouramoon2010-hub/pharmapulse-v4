// ============================================================
// Core KPI Dependency Removal Program — Stage G
// Remove Core Special Treatment
//
// Proves that isCore no longer has any production behavioral effect
// beyond being ordinary registry data, and that the Core KPIs' existing
// behavior (target-input visibility, weight-sum validation) is now
// driven by explicit registry fields rather than an isCore special case.
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import { validateWeights } from './kpiRegistryTypes'
import { getTargetInputConfigs } from './kpiUiAdapter'
import { getVisibleTargetKpis } from './kpiMetaResolver'
import type { KpiRegistry, KpiDefinition } from './kpiRegistryTypes'

const TEST_KPI_KEY = 'insurance_conversion_test'

function buildCustomKpi(key: string, overrides: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key, label: 'Test KPI', shortLabel: 'Test', labelAr: 'اختبار',
    category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    lifecycleStage: 'production_evaluation',
    thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
    visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false },
    sortOrder: 999,
    ...overrides,
  } as KpiDefinition
}

describe('Stage G — target-input visibility no longer special-cases isCore', () => {
  it('the 5 Core KPIs still get target-input visibility, now via explicit visibility.targetInputEnabled', () => {
    for (const key of ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']) {
      expect(DEFAULT_KPI_REGISTRY[key].visibility.targetInputEnabled).toBe(true)
    }
    const configs = getTargetInputConfigs()
    for (const key of ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']) {
      expect(configs.find((c) => c.key === key)?.isVisibleForTargetInput).toBe(true)
    }
  })

  it('an ordinary non-core KPI gets target-input visibility purely from visibility.targetInputEnabled, with isCore: false', () => {
    const registry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      [TEST_KPI_KEY]: buildCustomKpi(TEST_KPI_KEY, {
        isCore: false,
        visibility: { dashboardEnabled: true, teamEnabled: true, executiveEnabled: false, regionalEnabled: false, targetInputEnabled: true },
      }),
    }
    const configs = getTargetInputConfigs(registry)
    expect(configs.find((c) => c.key === TEST_KPI_KEY)?.isVisibleForTargetInput).toBe(true)

    const visible = getVisibleTargetKpis(registry)
    expect(visible.production.some((k) => k.key === TEST_KPI_KEY)).toBe(true)
  })

  it('a non-core KPI without targetInputEnabled does NOT get target-input visibility, regardless of isCore', () => {
    const registry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      [TEST_KPI_KEY]: buildCustomKpi(TEST_KPI_KEY, { isCore: false }),
    }
    const configs = getTargetInputConfigs(registry)
    // getTargetInputConfigs filters out non-visible entries entirely.
    expect(configs.find((c) => c.key === TEST_KPI_KEY)).toBeUndefined()
  })

  it('flipping isCore alone (with targetInputEnabled unset) changes nothing — isCore has no behavioral effect on visibility', () => {
    const asCore: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      [TEST_KPI_KEY]: buildCustomKpi(TEST_KPI_KEY, { isCore: true }),
    }
    const asNonCore: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      [TEST_KPI_KEY]: buildCustomKpi(TEST_KPI_KEY, { isCore: false }),
    }
    const coreVisible    = getTargetInputConfigs(asCore).find((c) => c.key === TEST_KPI_KEY)
    const nonCoreVisible = getTargetInputConfigs(asNonCore).find((c) => c.key === TEST_KPI_KEY)
    expect(coreVisible).toBeUndefined()
    expect(nonCoreVisible).toBeUndefined()
  })
})

describe('Stage G — weight-sum validation no longer isCore-only', () => {
  it('default registry weights remain valid (zero drift)', () => {
    expect(validateWeights(DEFAULT_KPI_REGISTRY)).toBe(true)
  })

  it('a non-core KPI with a nonzero weight now counts toward the weight-sum invariant', () => {
    const registry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      [TEST_KPI_KEY]: buildCustomKpi(TEST_KPI_KEY, { isCore: false, weight: 0.3 }),
    }
    // Core weights already sum to 1.0; adding a non-core 0.3 must now
    // invalidate the sum — under the old isCore-only check this was
    // silently ignored.
    expect(validateWeights(registry)).toBe(false)
  })

  it('a core KPI and a non-core KPI with the same nonzero weight have identical effect on validateWeights', () => {
    const withCore: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      [TEST_KPI_KEY]: buildCustomKpi(TEST_KPI_KEY, { isCore: true, weight: 0.3 }),
    }
    const withNonCore: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      [TEST_KPI_KEY]: buildCustomKpi(TEST_KPI_KEY, { isCore: false, weight: 0.3 }),
    }
    expect(validateWeights(withCore)).toBe(validateWeights(withNonCore))
    expect(validateWeights(withCore)).toBe(false)
  })
})

describe('Stage G — getCoreEngineKeys has no remaining production call sites', () => {
  it('BranchIntelligencePage.jsx no longer imports getCoreEngineKeys (dead import removed)', async () => {
    const src = await import('../../pages/branch/BranchIntelligencePage?raw').then((m) => m.default)
    expect(src).not.toContain('getCoreEngineKeys')
  })
})
