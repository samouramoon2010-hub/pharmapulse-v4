// ============================================================
// KPI Registry — Phase 1A Integrity Tests
//
// Purpose: validate that the DEFAULT_KPI_REGISTRY is complete,
// consistent, and synchronized with the engine's KPI_KEYS.
//
// These tests are the CI safety net for Phase 1A:
//   A. All KPI_KEYS from kpiAnalyticsEngine.ts exist in the registry
//   B. Every registry KPI has required metadata fields
//   C. Exactly one KPI has isPrimary === true
//   D. The primary KPI is active
//   E. No duplicate registry keys
//   F. No duplicate engine keys (aliasFor values)
//
// Production behaviour is NOT tested here — this file covers
// registry completeness only. Evaluation, ranking, and dashboard
// outputs are unchanged and tested in their own suites.
// ============================================================

import { describe, it, expect } from 'vitest'
import { KPI_KEYS } from '../kpiAnalyticsEngine'
import {
  DEFAULT_KPI_REGISTRY,
  KPI_ENGINE_ALIAS_MAP,
  DEFAULT_CORE_KPI_KEYS,
  DEFAULT_ACTIVE_KPI_KEYS,
} from './defaultKpiRegistry'
import type { KpiDefinition } from './kpiRegistryTypes'
import {
  validateWeights,
  validateThresholds,
  getPrimaryKpi,
  getActiveKpis,
} from './kpiRegistryTypes'

// Helpers
const allKpis = Object.values(DEFAULT_KPI_REGISTRY) as KpiDefinition[]
const coreKpis = allKpis.filter((k) => k.isCore)
const activeKpis = allKpis.filter((k) => k.isActive)

// ─────────────────────────────────────────────────────────────
// A. KPI_KEYS ↔ registry synchronisation
// ─────────────────────────────────────────────────────────────
describe('A — KPI_KEYS ↔ registry sync', () => {
  it('every engine KPI_KEY resolves to a registry entry', () => {
    // KPI_KEYS uses engine keys: wasfaty, omni, wellness, basket, crossSelling
    // Registry uses business keys: wasfaty, omnihealth, wellnessCard, basket, crossSelling
    // omni → resolved via KPI_ENGINE_ALIAS_MAP reverse lookup
    // wellness → same
    const engineToRegistry: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(KPI_ENGINE_ALIAS_MAP).map(([biz, eng]) => [eng, biz])
      ),
    }

    KPI_KEYS.forEach((engineKey) => {
      const registryKey = engineToRegistry[engineKey] ?? engineKey
      expect(
        DEFAULT_KPI_REGISTRY[registryKey],
        `Engine key '${engineKey}' has no registry entry (expected registry key: '${registryKey}')`
      ).toBeDefined()
    })
  })

  it('KPI_KEYS has exactly 5 entries (wasfaty, omni, wellness, basket, crossSelling)', () => {
    expect(KPI_KEYS).toHaveLength(5)
    expect(KPI_KEYS).toContain('wasfaty')
    expect(KPI_KEYS).toContain('omni')
    expect(KPI_KEYS).toContain('wellness')
    expect(KPI_KEYS).toContain('basket')
    expect(KPI_KEYS).toContain('crossSelling')
  })

  it('all 5 core engine KPIs are isCore:true in the registry', () => {
    const coreEngineKeys = new Set(
      coreKpis.map((k) => k.aliasFor ?? k.key)
    )
    KPI_KEYS.forEach((engineKey) => {
      expect(
        coreEngineKeys.has(engineKey),
        `Engine key '${engineKey}' is not marked isCore in registry`
      ).toBe(true)
    })
  })

  it('DEFAULT_CORE_KPI_KEYS covers all 5 production KPIs', () => {
    // Core keys use business names (omnihealth, wellnessCard)
    expect(DEFAULT_CORE_KPI_KEYS).toHaveLength(5)
    expect(DEFAULT_CORE_KPI_KEYS).toContain('wasfaty')
    expect(DEFAULT_CORE_KPI_KEYS).toContain('omnihealth')
    expect(DEFAULT_CORE_KPI_KEYS).toContain('wellnessCard')
    expect(DEFAULT_CORE_KPI_KEYS).toContain('basket')
    expect(DEFAULT_CORE_KPI_KEYS).toContain('crossSelling')
  })
})

// ─────────────────────────────────────────────────────────────
// B. Required metadata fields on every registry KPI
// ─────────────────────────────────────────────────────────────
describe('B — Required metadata completeness', () => {
  it('every KPI has a non-empty key', () => {
    allKpis.forEach((kpi) => {
      expect(kpi.key, `KPI missing key`).toBeTruthy()
      expect(typeof kpi.key).toBe('string')
    })
  })

  it('every KPI has a non-empty label', () => {
    allKpis.forEach((kpi) => {
      expect(kpi.label, `KPI '${kpi.key}' missing label`).toBeTruthy()
    })
  })

  it('every KPI has a non-empty labelAr', () => {
    allKpis.forEach((kpi) => {
      expect(kpi.labelAr, `KPI '${kpi.key}' missing labelAr`).toBeTruthy()
    })
  })

  it('every KPI has a non-empty shortLabel', () => {
    allKpis.forEach((kpi) => {
      expect(kpi.shortLabel, `KPI '${kpi.key}' missing shortLabel`).toBeTruthy()
    })
  })

  it('every KPI has a non-empty unit', () => {
    allKpis.forEach((kpi) => {
      expect(kpi.unit, `KPI '${kpi.key}' missing unit`).toBeTruthy()
    })
  })

  it('every KPI has a non-empty unitAr', () => {
    allKpis.forEach((kpi) => {
      expect(kpi.unitAr, `KPI '${kpi.key}' missing unitAr`).toBeTruthy()
    })
  })

  it('every KPI has a defined isPrimary boolean', () => {
    allKpis.forEach((kpi) => {
      expect(
        typeof kpi.isPrimary,
        `KPI '${kpi.key}' missing isPrimary field`
      ).toBe('boolean')
    })
  })

  it('every KPI has a non-empty coachingAction', () => {
    allKpis.forEach((kpi) => {
      expect(
        kpi.coachingAction,
        `KPI '${kpi.key}' missing coachingAction`
      ).toBeTruthy()
      expect(
        kpi.coachingAction.length,
        `KPI '${kpi.key}' coachingAction is too short`
      ).toBeGreaterThan(10)
    })
  })

  it('every KPI has a non-empty coachingActionAr', () => {
    allKpis.forEach((kpi) => {
      expect(
        kpi.coachingActionAr,
        `KPI '${kpi.key}' missing coachingActionAr`
      ).toBeTruthy()
      expect(
        kpi.coachingActionAr.length,
        `KPI '${kpi.key}' coachingActionAr is too short`
      ).toBeGreaterThan(10)
    })
  })

  it('every KPI has valid thresholds', () => {
    allKpis.forEach((kpi) => {
      expect(
        validateThresholds(kpi),
        `KPI '${kpi.key}' has invalid thresholds: ${JSON.stringify(kpi.thresholds)}`
      ).toBe(true)
    })
  })

  it('every KPI has a positive sortOrder', () => {
    allKpis.forEach((kpi) => {
      expect(kpi.sortOrder, `KPI '${kpi.key}' invalid sortOrder`).toBeGreaterThan(0)
    })
  })

  it('every KPI has a valid category', () => {
    const validCategories = [
      'prescription', 'digital', 'wellness',
      'commercial', 'operational', 'health_program',
    ]
    allKpis.forEach((kpi) => {
      expect(
        validCategories,
        `KPI '${kpi.key}' has invalid category '${kpi.category}'`
      ).toContain(kpi.category)
    })
  })

  it('every KPI has a valid visibility object', () => {
    allKpis.forEach((kpi) => {
      expect(typeof kpi.visibility.dashboardEnabled).toBe('boolean')
      expect(typeof kpi.visibility.teamEnabled).toBe('boolean')
      expect(typeof kpi.visibility.executiveEnabled).toBe('boolean')
      expect(typeof kpi.visibility.regionalEnabled).toBe('boolean')
    })
  })
})

// ─────────────────────────────────────────────────────────────
// C. Exactly one primary KPI
// ─────────────────────────────────────────────────────────────
describe('C — Primary KPI invariant', () => {
  it('exactly one KPI has isPrimary === true', () => {
    const primaryKpis = allKpis.filter((k) => k.isPrimary === true)
    expect(
      primaryKpis,
      `Expected exactly 1 primary KPI, found ${primaryKpis.length}: ${primaryKpis.map((k) => k.key).join(', ')}`
    ).toHaveLength(1)
  })

  it('the primary KPI is wasfaty', () => {
    const primaryKpis = allKpis.filter((k) => k.isPrimary === true)
    expect(primaryKpis[0]?.key).toBe('wasfaty')
  })

  it('all non-primary KPIs have isPrimary === false', () => {
    const nonPrimary = allKpis.filter((k) => k.key !== 'wasfaty')
    nonPrimary.forEach((kpi) => {
      expect(
        kpi.isPrimary,
        `KPI '${kpi.key}' should have isPrimary:false but has isPrimary:${kpi.isPrimary}`
      ).toBe(false)
    })
  })

  it('getPrimaryKpi() returns the wasfaty definition', () => {
    const primary = getPrimaryKpi(DEFAULT_KPI_REGISTRY)
    expect(primary).toBeDefined()
    expect(primary?.key).toBe('wasfaty')
  })
})

// ─────────────────────────────────────────────────────────────
// D. Primary KPI must be active
// ─────────────────────────────────────────────────────────────
describe('D — Primary KPI is active', () => {
  it('the primary KPI (wasfaty) has isActive === true', () => {
    expect(DEFAULT_KPI_REGISTRY.wasfaty.isActive).toBe(true)
  })

  it('the primary KPI (wasfaty) has isCore === true', () => {
    expect(DEFAULT_KPI_REGISTRY.wasfaty.isCore).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// E. No duplicate registry keys
// ─────────────────────────────────────────────────────────────
describe('E — No duplicate registry keys', () => {
  it('all registry key values are unique', () => {
    const keys = allKpis.map((k) => k.key)
    const uniqueKeys = new Set(keys)
    expect(
      uniqueKeys.size,
      `Duplicate keys found: ${keys.filter((k, i) => keys.indexOf(k) !== i).join(', ')}`
    ).toBe(keys.length)
  })

  it('all registry object keys match their entry.key field', () => {
    Object.entries(DEFAULT_KPI_REGISTRY).forEach(([mapKey, def]) => {
      expect(
        def.key,
        `Registry map key '${mapKey}' does not match entry.key '${def.key}'`
      ).toBe(mapKey)
    })
  })

  it('all sortOrder values are unique', () => {
    const orders = allKpis.map((k) => k.sortOrder)
    const uniqueOrders = new Set(orders)
    expect(
      uniqueOrders.size,
      `Duplicate sortOrder values found`
    ).toBe(orders.length)
  })
})

// ─────────────────────────────────────────────────────────────
// F. No duplicate engine keys (aliasFor values)
// ─────────────────────────────────────────────────────────────
describe('F — No duplicate engine keys', () => {
  it('no two KPIs share the same aliasFor value', () => {
    const aliases = allKpis
      .filter((k) => k.aliasFor != null)
      .map((k) => k.aliasFor!)
    const uniqueAliases = new Set(aliases)
    expect(
      uniqueAliases.size,
      `Duplicate aliasFor values: ${aliases.filter((a, i) => aliases.indexOf(a) !== i).join(', ')}`
    ).toBe(aliases.length)
  })

  it('no registry key appears as an aliasFor value of another entry', () => {
    const registryKeys = new Set(allKpis.map((k) => k.key))
    const aliases = allKpis.filter((k) => k.aliasFor).map((k) => k.aliasFor!)
    aliases.forEach((alias) => {
      expect(
        registryKeys.has(alias),
        `aliasFor value '${alias}' conflicts with an existing registry key`
      ).toBe(false)
    })
  })

  it('KPI_ENGINE_ALIAS_MAP is consistent with registry aliasFor fields', () => {
    // Every entry in KPI_ENGINE_ALIAS_MAP should match registry.aliasFor
    Object.entries(KPI_ENGINE_ALIAS_MAP).forEach(([bizKey, engineKey]) => {
      const def = DEFAULT_KPI_REGISTRY[bizKey]
      expect(def, `KPI_ENGINE_ALIAS_MAP key '${bizKey}' not in registry`).toBeDefined()
      expect(
        def.aliasFor,
        `KPI '${bizKey}' aliasFor is '${def.aliasFor}' but KPI_ENGINE_ALIAS_MAP says '${engineKey}'`
      ).toBe(engineKey)
    })
  })

  it('all registry entries with aliasFor appear in KPI_ENGINE_ALIAS_MAP', () => {
    allKpis
      .filter((k) => k.aliasFor != null)
      .forEach((kpi) => {
        expect(
          KPI_ENGINE_ALIAS_MAP[kpi.key],
          `KPI '${kpi.key}' has aliasFor:'${kpi.aliasFor}' but is missing from KPI_ENGINE_ALIAS_MAP`
        ).toBe(kpi.aliasFor)
      })
  })
})

// ─────────────────────────────────────────────────────────────
// G. Weight invariants
// ─────────────────────────────────────────────────────────────
describe('G — Weight invariants', () => {
  it('active core KPI weights sum to 1.0 (±0.01)', () => {
    expect(validateWeights(DEFAULT_KPI_REGISTRY)).toBe(true)
  })

  it('non-core KPIs have weight === 0', () => {
    allKpis
      .filter((k) => !k.isCore)
      .forEach((kpi) => {
        expect(
          kpi.weight,
          `Non-core KPI '${kpi.key}' should have weight:0 but has weight:${kpi.weight}`
        ).toBe(0)
      })
  })

  it('core KPIs have positive weight', () => {
    coreKpis.forEach((kpi) => {
      expect(
        kpi.weight,
        `Core KPI '${kpi.key}' should have weight > 0`
      ).toBeGreaterThan(0)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// H. Registry total count
// ─────────────────────────────────────────────────────────────
describe('H — Registry completeness counts', () => {
  it('registry has at least 10 KPI entries', () => {
    expect(allKpis.length).toBeGreaterThanOrEqual(10)
  })

  it('registry has exactly 5 core KPIs', () => {
    expect(coreKpis).toHaveLength(5)
  })

  it('all active KPI keys appear in DEFAULT_ACTIVE_KPI_KEYS', () => {
    activeKpis.forEach((kpi) => {
      expect(
        DEFAULT_ACTIVE_KPI_KEYS,
        `Active KPI '${kpi.key}' missing from DEFAULT_ACTIVE_KPI_KEYS`
      ).toContain(kpi.key)
    })
  })

  it('getActiveKpis() returns all active KPIs sorted by sortOrder', () => {
    const active = getActiveKpis(DEFAULT_KPI_REGISTRY)
    expect(active.length).toBeGreaterThanOrEqual(10)
    // Verify sorted
    for (let i = 1; i < active.length; i++) {
      expect(active[i].sortOrder).toBeGreaterThan(active[i - 1].sortOrder)
    }
  })
})

// ─────────────────────────────────────────────────────────────
// I. Lifecycle stage — Milestone 1A additions
// ─────────────────────────────────────────────────────────────
import {
  isProductionEvaluationKpi,
  isPilotTrackingKpi,
  isShadowEvaluationKpi,
  isArchivedKpi,
  canTransitionKpiLifecycle,
  type KpiLifecycleStage,
} from './kpiRegistryTypes'

describe('I — lifecycleStage field completeness', () => {
  it('every KPI has a lifecycleStage field', () => {
    allKpis.forEach((kpi) => {
      expect(
        kpi.lifecycleStage,
        `KPI '${kpi.key}' missing lifecycleStage`
      ).toBeTruthy()
    })
  })

  it('every CORE production KPI has lifecycleStage === production_evaluation', () => {
    // Only core KPIs (isCore: true) must be production_evaluation
    // Non-core KPIs may be pilot_tracking (e.g. insuranceConversion)
    coreKpis.forEach((kpi) => {
      expect(
        kpi.lifecycleStage,
        `Core KPI '${kpi.key}' should be production_evaluation but is '${kpi.lifecycleStage}'`
      ).toBe('production_evaluation')
    })
  })

  it('insuranceConversion is the only pilot_tracking KPI (Milestone 3)', () => {
    const pilotKpis = allKpis.filter((k) => k.lifecycleStage === 'pilot_tracking')
    expect(pilotKpis.map((k) => k.key)).toContain('insuranceConversion')
    // Only insuranceConversion should be pilot at this stage
    pilotKpis.forEach((k) => {
      expect(k.key).toBe('insuranceConversion')
    })
  })

  it('no KPI is in shadow_evaluation (Milestone 1A baseline)', () => {
    const shadowKpis = allKpis.filter((k) => k.lifecycleStage === 'shadow_evaluation')
    expect(shadowKpis).toHaveLength(0)
  })

  it('no KPI is in draft (Milestone 1A baseline)', () => {
    const draftKpis = allKpis.filter((k) => k.lifecycleStage === 'draft')
    expect(draftKpis).toHaveLength(0)
  })

  it('no KPI is archived (Milestone 1A baseline — all current KPIs are active)', () => {
    const archivedKpis = allKpis.filter((k) => k.lifecycleStage === 'archived')
    expect(archivedKpis).toHaveLength(0)
  })
})

describe('I — lifecycle predicate functions', () => {
  it('isProductionEvaluationKpi returns true for wasfaty', () => {
    expect(isProductionEvaluationKpi(DEFAULT_KPI_REGISTRY.wasfaty)).toBe(true)
  })

  it('isProductionEvaluationKpi returns true for all core KPIs', () => {
    coreKpis.forEach((kpi) => {
      expect(
        isProductionEvaluationKpi(kpi),
        `${kpi.key} should be production_evaluation`
      ).toBe(true)
    })
  })

  it('isPilotTrackingKpi returns true for insuranceConversion only', () => {
    const ins = allKpis.find((k) => k.key === 'insuranceConversion')
    expect(ins).toBeDefined()
    expect(isPilotTrackingKpi(ins!)).toBe(true)
    // All other KPIs should not be pilot
    allKpis
      .filter((k) => k.key !== 'insuranceConversion')
      .forEach((kpi) => {
        expect(isPilotTrackingKpi(kpi), `${kpi.key} should not be pilot`).toBe(false)
      })
  })

  it('isShadowEvaluationKpi returns false for all current KPIs', () => {
    allKpis.forEach((kpi) => {
      expect(isShadowEvaluationKpi(kpi)).toBe(false)
    })
  })

  it('isArchivedKpi returns false for all current KPIs', () => {
    allKpis.forEach((kpi) => {
      expect(isArchivedKpi(kpi)).toBe(false)
    })
  })
})

describe('I — canTransitionKpiLifecycle transition rules', () => {
  // Allowed transitions
  const ALLOWED: [KpiLifecycleStage, KpiLifecycleStage][] = [
    ['draft',               'pilot_tracking'],
    ['draft',               'archived'],
    ['pilot_tracking',      'shadow_evaluation'],
    ['pilot_tracking',      'archived'],
    ['shadow_evaluation',   'production_evaluation'],
    ['shadow_evaluation',   'pilot_tracking'],
    ['production_evaluation','archived'],
    ['archived',            'pilot_tracking'],
  ]

  ALLOWED.forEach(([from, to]) => {
    it(`ALLOWED: ${from} → ${to}`, () => {
      expect(canTransitionKpiLifecycle(from, to)).toBe(true)
    })
  })

  // Blocked transitions
  const BLOCKED: [KpiLifecycleStage, KpiLifecycleStage][] = [
    ['pilot_tracking',      'production_evaluation'],
    ['draft',               'production_evaluation'],
    ['draft',               'shadow_evaluation'],
    ['production_evaluation','draft'],
    ['production_evaluation','pilot_tracking'],
    ['production_evaluation','shadow_evaluation'],
    ['archived',            'production_evaluation'],
    ['archived',            'draft'],
    ['archived',            'shadow_evaluation'],
  ]

  BLOCKED.forEach(([from, to]) => {
    it(`BLOCKED: ${from} → ${to}`, () => {
      expect(canTransitionKpiLifecycle(from, to)).toBe(false)
    })
  })

  it('no-op transition (same stage) returns false', () => {
    const stages: KpiLifecycleStage[] = [
      'draft', 'pilot_tracking', 'shadow_evaluation',
      'production_evaluation', 'archived',
    ]
    stages.forEach((stage) => {
      expect(canTransitionKpiLifecycle(stage, stage)).toBe(false)
    })
  })
})
