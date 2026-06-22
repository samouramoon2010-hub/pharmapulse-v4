// ============================================================
// Dashboard KPI Achievement — Regression Tests
//
// Root cause fixed:
//   docToKpiDefinition() was missing lifecycleStage, so KPIs
//   loaded from Firestore had lifecycleStage: undefined.
//   The Milestone 3 filter `.filter(k => k.lifecycleStage ===
//   'production_evaluation')` silently dropped them.
//   Basket and Cross Selling showed in Reports/Executive BI
//   (which don't filter by lifecycleStage) but not Dashboard.
//
// Fix:
//   1. docToKpiDefinition: reads lifecycleStage with default
//      'production_evaluation' (backward-compatible)
//   2. DashboardPage registryKpis filter: uses
//      (lifecycleStage ?? 'production_evaluation') === 'production_evaluation'
//
// These tests verify all 5 production KPIs always appear on
// the Dashboard — both from the default registry AND when
// simulating Firestore docs that have no lifecycleStage.
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import { getKpisForSurface } from '../../engine/kpiRegistry'
import { docToKpiDefinition, mergeRemoteRegistryWithDefaults } from '../../services/kpiRegistryLogic'

// The 5 production engine keys the Dashboard must always render
const REQUIRED_PRODUCTION_ENGINE_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']

// Simulate the Dashboard registryKpis computation
function getDashboardKpis(registry: typeof DEFAULT_KPI_REGISTRY) {
  return getKpisForSurface(registry, 'dashboardEnabled')
    .filter((kpi) => (kpi.lifecycleStage ?? 'production_evaluation') === 'production_evaluation')
}

// ─────────────────────────────────────────────────────────────
// 1. Default registry — all 5 must appear
// ─────────────────────────────────────────────────────────────
describe('1 — Default registry: all 5 production KPIs on Dashboard', () => {
  const dashKpis = getDashboardKpis(DEFAULT_KPI_REGISTRY)
  const engineKeys = dashKpis.map((k) => k.aliasFor ?? k.key)

  it('wasfaty appears in Dashboard KPI list', () => {
    expect(engineKeys).toContain('wasfaty')
  })
  it('omni (omnihealth) appears in Dashboard KPI list', () => {
    expect(engineKeys).toContain('omni')
  })
  it('wellness (wellnessCard) appears in Dashboard KPI list', () => {
    expect(engineKeys).toContain('wellness')
  })
  it('basket appears in Dashboard KPI list', () => {
    expect(engineKeys).toContain('basket')
  })
  it('crossSelling appears in Dashboard KPI list', () => {
    expect(engineKeys).toContain('crossSelling')
  })
  it('Dashboard has at least 5 production KPIs', () => {
    expect(dashKpis.length).toBeGreaterThanOrEqual(5)
  })
  it('insuranceConversion does NOT appear in production Dashboard list', () => {
    expect(engineKeys).not.toContain('insuranceConversion')
  })
})

// ─────────────────────────────────────────────────────────────
// 2. Firestore docs WITHOUT lifecycleStage field (pre-M3 docs)
//    This is the exact regression scenario: basket and crossSelling
//    documents in Firestore had no lifecycleStage field.
// ─────────────────────────────────────────────────────────────
describe('2 — Firestore docs without lifecycleStage: still appear on Dashboard', () => {
  // Simulate old Firestore docs that have no lifecycleStage field
  const legacyFirestoreDocs: Record<string, unknown>[] = [
    { key: 'wasfaty',      label: 'Wasfaty',       shortLabel: 'Wasfaty', labelAr: 'وصفتي',
      isActive: true, isCore: true, weight: 0.25, sortOrder: 10,
      dashboardEnabled: true, teamEnabled: true, executiveEnabled: true, regionalEnabled: true,
      category: 'prescription', valueType: 'count', unit: 'prescriptions', unitAr: 'وصفة',
      direction: 'higher_is_better', targetType: 'absolute',
      thresholdHealthy: 90, thresholdWatch: 75, thresholdRisk: 55, thresholdCritical: 35,
      // No lifecycleStage field — simulates pre-Milestone-3 Firestore document
    },
    { key: 'omnihealth',   label: 'OmniHealth',    shortLabel: 'Omni',   labelAr: 'أومني هيلث',
      aliasFor: 'omni', isActive: true, isCore: true, weight: 0.20, sortOrder: 20,
      dashboardEnabled: true, teamEnabled: true, executiveEnabled: true, regionalEnabled: true,
      category: 'digital', valueType: 'count', unit: 'units', unitAr: 'وحدة',
      direction: 'higher_is_better', targetType: 'absolute',
      thresholdHealthy: 90, thresholdWatch: 75, thresholdRisk: 55, thresholdCritical: 35,
      // No lifecycleStage
    },
    { key: 'wellnessCard', label: 'Wellness Card',  shortLabel: 'Wellness', labelAr: 'بطاقة ويلنس',
      aliasFor: 'wellness', isActive: true, isCore: true, weight: 0.20, sortOrder: 30,
      dashboardEnabled: true, teamEnabled: true, executiveEnabled: true, regionalEnabled: true,
      category: 'wellness', valueType: 'count', unit: 'units', unitAr: 'وحدة',
      direction: 'higher_is_better', targetType: 'absolute',
      thresholdHealthy: 90, thresholdWatch: 75, thresholdRisk: 55, thresholdCritical: 35,
      // No lifecycleStage
    },
    { key: 'basket',       label: 'Basket Size',   shortLabel: 'Basket', labelAr: 'متوسط السلة',
      isActive: true, isCore: true, weight: 0.20, sortOrder: 40,
      dashboardEnabled: true, teamEnabled: true, executiveEnabled: true, regionalEnabled: true,
      category: 'commercial', valueType: 'currency', unit: 'SAR', unitAr: 'ر.س',
      direction: 'higher_is_better', targetType: 'absolute',
      thresholdHealthy: 90, thresholdWatch: 75, thresholdRisk: 55, thresholdCritical: 35,
      // No lifecycleStage — THIS WAS THE BUG
    },
    { key: 'crossSelling', label: 'Cross Selling', shortLabel: 'Cross-Sell', labelAr: 'البيع المتقاطع',
      isActive: true, isCore: true, weight: 0.15, sortOrder: 50,
      dashboardEnabled: true, teamEnabled: true, executiveEnabled: true, regionalEnabled: true,
      category: 'commercial', valueType: 'count', unit: 'transactions', unitAr: 'معاملة',
      direction: 'higher_is_better', targetType: 'absolute',
      thresholdHealthy: 90, thresholdWatch: 75, thresholdRisk: 55, thresholdCritical: 35,
      // No lifecycleStage — THIS WAS THE BUG
    },
  ]

  // Build registry from simulated Firestore docs
  const remoteRegistry: Record<string, ReturnType<typeof docToKpiDefinition>> = {}
  legacyFirestoreDocs.forEach((doc) => {
    const result = docToKpiDefinition(doc)
    if (result) remoteRegistry[result.def.key] = result
  })

  it('docToKpiDefinition gives lifecycleStage:production_evaluation when field absent', () => {
    const basketResult = docToKpiDefinition(legacyFirestoreDocs[3])
    expect(basketResult).not.toBeNull()
    expect(basketResult!.def.lifecycleStage).toBe('production_evaluation')
  })

  it('docToKpiDefinition gives lifecycleStage:production_evaluation for crossSelling', () => {
    const result = docToKpiDefinition(legacyFirestoreDocs[4])
    expect(result).not.toBeNull()
    expect(result!.def.lifecycleStage).toBe('production_evaluation')
  })

  // Build merged registry (remote Firestore docs merged with defaults)
  const mergedRegistry = mergeRemoteRegistryWithDefaults(
    Object.fromEntries(
      Object.entries(remoteRegistry).map(([k, v]) => [k, v!.def])
    )
  )

  const dashKpisFromMerged = getDashboardKpis(mergedRegistry)
  const engineKeysFromMerged = dashKpisFromMerged.map((k) => k.aliasFor ?? k.key)

  it('basket appears in Dashboard from merged registry (no lifecycleStage in Firestore)', () => {
    expect(engineKeysFromMerged).toContain('basket')
  })

  it('crossSelling appears in Dashboard from merged registry (no lifecycleStage in Firestore)', () => {
    expect(engineKeysFromMerged).toContain('crossSelling')
  })

  it('all 5 production engine keys appear in Dashboard from merged registry', () => {
    REQUIRED_PRODUCTION_ENGINE_KEYS.forEach((key) => {
      expect(
        engineKeysFromMerged,
        `Engine key '${key}' missing from Dashboard KPI list`
      ).toContain(key)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 3. Pilot KPI still correctly excluded from production list
// ─────────────────────────────────────────────────────────────
describe('3 — Pilot KPI correctly excluded even after fix', () => {
  const dashKpis = getDashboardKpis(DEFAULT_KPI_REGISTRY)
  const engineKeys = dashKpis.map((k) => k.aliasFor ?? k.key)

  it('insuranceConversion (pilot_tracking) is NOT in production Dashboard list', () => {
    expect(engineKeys).not.toContain('insuranceConversion')
  })

  it('pilot KPIs have lifecycleStage:pilot_tracking (not undefined)', () => {
    const ins = DEFAULT_KPI_REGISTRY.insuranceConversion
    expect(ins.lifecycleStage).toBe('pilot_tracking')
    // pilot_tracking !== production_evaluation → correctly excluded
    expect((ins.lifecycleStage ?? 'production_evaluation') === 'production_evaluation').toBe(false)
  })

  it('undefined lifecycleStage defaults to production (safe for legacy docs)', () => {
    const missingField = undefined
    expect((missingField ?? 'production_evaluation') === 'production_evaluation').toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. docToKpiDefinition reads lifecycleStage correctly
// ─────────────────────────────────────────────────────────────
describe('4 — docToKpiDefinition lifecycle field handling', () => {
  it('returns production_evaluation when field is absent (backward compat)', () => {
    const result = docToKpiDefinition({ key: 'testKpi', label: 'Test', isActive: true })
    expect(result!.def.lifecycleStage).toBe('production_evaluation')
  })

  it('returns pilot_tracking when field is explicitly pilot_tracking', () => {
    const result = docToKpiDefinition({
      key: 'testKpi', label: 'Test', isActive: true,
      lifecycleStage: 'pilot_tracking',
    })
    expect(result!.def.lifecycleStage).toBe('pilot_tracking')
  })

  it('returns production_evaluation when field is explicitly set', () => {
    const result = docToKpiDefinition({
      key: 'testKpi', label: 'Test', isActive: true,
      lifecycleStage: 'production_evaluation',
    })
    expect(result!.def.lifecycleStage).toBe('production_evaluation')
  })

  it('reads isPrimary from Firestore doc', () => {
    const result = docToKpiDefinition({
      key: 'testKpi', label: 'Test', isActive: true,
      isPrimary: true,
    })
    expect(result!.def.isPrimary).toBe(true)
  })

  it('defaults isPrimary to false when field absent', () => {
    const result = docToKpiDefinition({ key: 'testKpi', label: 'Test', isActive: true })
    expect(result!.def.isPrimary).toBe(false)
  })

  it('reads coachingAction from Firestore doc', () => {
    const result = docToKpiDefinition({
      key: 'testKpi', label: 'Test', isActive: true,
      coachingAction: 'Focus on this KPI.',
    })
    expect(result!.def.coachingAction).toBe('Focus on this KPI.')
  })
})

// ─────────────────────────────────────────────────────────────
// 5. DashboardPage source: defensive filter in place
// ─────────────────────────────────────────────────────────────
describe('5 — DashboardPage: defensive lifecycleStage filter', () => {
  it('DashboardPage registryKpis uses (lifecycleStage ?? production_evaluation)', async () => {
    const src = (await import('../../pages/dashboard/DashboardPage.jsx?raw')).default
    expect(src).toContain("(kpi.lifecycleStage ?? 'production_evaluation') === 'production_evaluation'")
  })

  it('DashboardPage separates pilot KPIs into pilotKpis memo', async () => {
    const src = (await import('../../pages/dashboard/DashboardPage.jsx?raw')).default
    expect(src).toContain('const pilotKpis')
    expect(src).toContain('getPilotTrackingKpis')
  })
})
