// ============================================================
// buildAllowedEntryKeys — Lifecycle Hardening Tests
//
// Pre-Milestone 4 hardening:
//   buildAllowedEntryKeys now requires lifecycleStage ===
//   'production_evaluation' in addition to isActive:true.
//
//   Pilot, shadow, draft, and archived KPIs are structurally
//   excluded from official kpiActuals — not just governance-
//   dependent. A misconfigured evaluation profile that tried to
//   include a pilot KPI would receive 0 from kpiActuals rather
//   than the pilot KPI's actual value.
//
// Tests:
//   1. production_evaluation KPI is included
//   2. pilot_tracking KPI is excluded
//   3. shadow_evaluation KPI is excluded
//   4. draft KPI is excluded
//   5. archived KPI is excluded
//   6. missing lifecycleStage defaults to production_evaluation (legacy docs)
//   7. 5 core production KPIs unchanged
// ============================================================

import { describe, it, expect } from 'vitest'
import { buildAllowedEntryKeys } from '../../services/kpiRegistryLogic'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import type { KpiDefinition, KpiRegistry } from '../../engine/kpiRegistry'
import type { KpiLifecycleStage } from '../../engine/kpiRegistry/kpiRegistryTypes'

// ── Test fixture builder ──────────────────────────────────────
function makeKpi(
  key: string,
  stage: KpiLifecycleStage | undefined,
  isActive = true,
): KpiDefinition {
  return {
    key,
    label:      `Test ${key}`,
    shortLabel: key,
    labelAr:    key,
    category:   'commercial',
    valueType:  'count',
    unit:       'units',
    unitAr:     'وحدة',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0,
    isActive,
    isCore:     false,
    thresholds: { healthy: 90, watch: 70, risk: 50, critical: 30 },
    visibility: {
      dashboardEnabled:   true,
      teamEnabled:        false,
      executiveEnabled:   false,
      regionalEnabled:    false,
      targetInputEnabled: false,
    },
    sortOrder:        999,
    description:      '',
    lifecycleStage:   stage!,   // undefined simulates legacy doc
    isPrimary:        false,
    coachingAction:   '',
    coachingActionAr: '',
  }
}

function registryWith(...kpis: KpiDefinition[]): KpiRegistry {
  return Object.fromEntries(kpis.map((k) => [k.key, k]))
}

// ─────────────────────────────────────────────────────────────
// Test 1: production_evaluation KPI is included
// ─────────────────────────────────────────────────────────────
describe('1 — production_evaluation KPI is included in allowed keys', () => {
  it('active production_evaluation KPI key is in the allowed set', () => {
    const kpi = makeKpi('prodKpi', 'production_evaluation')
    const keys = buildAllowedEntryKeys(registryWith(kpi))
    expect(keys.has('prodKpi')).toBe(true)
  })

  it('engine key alias is resolved correctly for production KPI', () => {
    const kpi = { ...makeKpi('omnihealth', 'production_evaluation'), aliasFor: 'omni' } as KpiDefinition
    const keys = buildAllowedEntryKeys(registryWith(kpi))
    expect(keys.has('omni')).toBe(true)         // engine key
    expect(keys.has('omnihealth')).toBe(false)  // registry key not added
  })
})

// ─────────────────────────────────────────────────────────────
// Test 2: pilot_tracking KPI is excluded
// ─────────────────────────────────────────────────────────────
describe('2 — pilot_tracking KPI is excluded from allowed keys', () => {
  it('active pilot_tracking KPI is NOT in the allowed set', () => {
    const kpi = makeKpi('insuranceConversion', 'pilot_tracking')
    const keys = buildAllowedEntryKeys(registryWith(kpi))
    expect(keys.has('insuranceConversion')).toBe(false)
  })

  it('pilot_tracking KPI with isActive:true is still excluded', () => {
    const kpi = makeKpi('guestConversion', 'pilot_tracking', true)
    expect(kpi.isActive).toBe(true) // confirm isActive is not the reason
    const keys = buildAllowedEntryKeys(registryWith(kpi))
    expect(keys.has('guestConversion')).toBe(false)
  })

  it('real insuranceConversion from DEFAULT_KPI_REGISTRY is excluded', () => {
    const keys = buildAllowedEntryKeys(DEFAULT_KPI_REGISTRY)
    expect(keys.has('insuranceConversion')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 3: shadow_evaluation KPI is excluded
// ─────────────────────────────────────────────────────────────
describe('3 — shadow_evaluation KPI is excluded from allowed keys', () => {
  it('shadow_evaluation KPI is NOT in the allowed set', () => {
    const kpi = makeKpi('shadowKpi', 'shadow_evaluation')
    const keys = buildAllowedEntryKeys(registryWith(kpi))
    expect(keys.has('shadowKpi')).toBe(false)
  })

  it('shadow KPI exclusion is independent of isActive', () => {
    const active   = makeKpi('shadowA', 'shadow_evaluation', true)
    const inactive = makeKpi('shadowB', 'shadow_evaluation', false)
    const keys = buildAllowedEntryKeys(registryWith(active, inactive))
    expect(keys.has('shadowA')).toBe(false)
    expect(keys.has('shadowB')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 4: draft KPI is excluded
// ─────────────────────────────────────────────────────────────
describe('4 — draft KPI is excluded from allowed keys', () => {
  it('draft KPI is NOT in the allowed set', () => {
    const kpi = makeKpi('newKpiDraft', 'draft')
    const keys = buildAllowedEntryKeys(registryWith(kpi))
    expect(keys.has('newKpiDraft')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 5: archived KPI is excluded
// ─────────────────────────────────────────────────────────────
describe('5 — archived KPI is excluded from allowed keys', () => {
  it('archived KPI is NOT in the allowed set', () => {
    const kpi = makeKpi('oldKpi', 'archived', false)
    const keys = buildAllowedEntryKeys(registryWith(kpi))
    expect(keys.has('oldKpi')).toBe(false)
  })

  it('archived KPI with isActive:true is still excluded (lifecycle takes priority)', () => {
    // A KPI could theoretically have isActive:true but lifecycleStage:'archived'
    // (inconsistent state). Lifecycle check must still exclude it.
    const kpi = makeKpi('inconsistentKpi', 'archived', true)
    const keys = buildAllowedEntryKeys(registryWith(kpi))
    expect(keys.has('inconsistentKpi')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 6: legacy docs missing lifecycleStage default safely
// ─────────────────────────────────────────────────────────────
describe('6 — missing lifecycleStage defaults to production_evaluation (backward compat)', () => {
  it('KPI without lifecycleStage field IS included (safe legacy default)', () => {
    // Simulate a KPI loaded from a pre-Milestone-3 Firestore doc
    // where the lifecycleStage field was never written.
    const legacyKpi = {
      ...makeKpi('legacyCore', undefined as any),
      // Explicitly remove lifecycleStage to simulate missing field
    }
    delete (legacyKpi as any).lifecycleStage

    const keys = buildAllowedEntryKeys(registryWith(legacyKpi))
    // Missing field → defaults to production_evaluation → included
    expect(keys.has('legacyCore')).toBe(true)
  })

  it('KPI with lifecycleStage:undefined is treated as production (same as missing)', () => {
    const kpi = makeKpi('undefinedStage', undefined as any)
    const keys = buildAllowedEntryKeys(registryWith(kpi))
    expect(keys.has('undefinedStage')).toBe(true)
  })

  it('default is production_evaluation not pilot (no false exclusion of old KPIs)', () => {
    // This test guards against accidentally using null-coalescing to 'pilot_tracking'
    // or any other non-production default
    const kpi = makeKpi('oldProdKpi', undefined as any)
    const keys = buildAllowedEntryKeys(registryWith(kpi))
    expect(keys.has('oldProdKpi')).toBe(true)  // must be included, not excluded
  })
})

// ─────────────────────────────────────────────────────────────
// Test 7: 5 core production KPIs unchanged
// ─────────────────────────────────────────────────────────────
describe('7 — 5 core production KPIs remain in allowed keys', () => {
  const keys = buildAllowedEntryKeys(DEFAULT_KPI_REGISTRY)

  // All 5 production engine keys must still be present
  it("wasfaty is in allowed keys", () => {
    expect(keys.has('wasfaty')).toBe(true)
  })

  it("omni (omnihealth alias) is in allowed keys", () => {
    expect(keys.has('omni')).toBe(true)
    expect(keys.has('omnihealth')).toBe(false) // registry key not added, only engine key
  })

  it("wellness (wellnessCard alias) is in allowed keys", () => {
    expect(keys.has('wellness')).toBe(true)
    expect(keys.has('wellnessCard')).toBe(false)
  })

  it("basket is in allowed keys", () => {
    expect(keys.has('basket')).toBe(true)
  })

  it("crossSelling is in allowed keys", () => {
    expect(keys.has('crossSelling')).toBe(true)
  })

  it("all 5 production engine keys are present (regression guard)", () => {
    const required = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
    required.forEach((k) => {
      expect(keys.has(k), `${k} missing from allowed keys`).toBe(true)
    })
  })

  it("no pilot KPI engine key is in allowed keys from DEFAULT_KPI_REGISTRY", () => {
    // insuranceConversion has no aliasFor, so its engine key === registry key
    expect(keys.has('insuranceConversion')).toBe(false)
  })

  it("allowed key count matches number of active production KPIs", () => {
    // DEFAULT_KPI_REGISTRY active production KPIs:
    // core: wasfaty, omni(via omnihealth), wellness(via wellnessCard), basket, crossSelling
    // non-core production: sales, sl, ndf, inbody, liberation
    // pilot: insuranceConversion (excluded)
    const productionKpis = Object.values(DEFAULT_KPI_REGISTRY).filter(
      (kpi) => kpi.isActive && (kpi.lifecycleStage ?? 'production_evaluation') === 'production_evaluation'
    )
    expect(keys.size).toBe(productionKpis.length)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 8 — formerly-protected core KPIs are excluded from KPI Entry
// and Target creation once archived (2026-07-07 owner decision:
// PROTECTED_CORE_KEYS no longer blocks archival in
// kpiRegistryService.ts; buildAllowedEntryKeys itself never had a
// core-key exception — the existing isActive/lifecycleStage checks
// already apply uniformly. This test proves that continues to hold
// once these specific 5 keys are archived.)
// ─────────────────────────────────────────────────────────────
describe('8 — previously-protected core KPIs are excluded once archived', () => {
  const coreKeys = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']

  it.each(coreKeys)('%s excluded from allowed entry keys once archived', (key) => {
    const base = DEFAULT_KPI_REGISTRY[key]
    const archived = { ...base, isActive: false, lifecycleStage: 'archived' as KpiLifecycleStage }
    const keys = buildAllowedEntryKeys(registryWith(archived))
    const engineKey = archived.aliasFor ?? archived.key
    expect(keys.has(engineKey)).toBe(false)
  })

  it('archiving all 5 core keys together leaves the allowed set empty (no other KPIs in registry)', () => {
    const archivedRegistry = registryWith(
      ...coreKeys.map((key) => ({
        ...DEFAULT_KPI_REGISTRY[key],
        isActive: false,
        lifecycleStage: 'archived' as KpiLifecycleStage,
      })),
    )
    const keys = buildAllowedEntryKeys(archivedRegistry)
    expect(keys.size).toBe(0)
  })

  it('a Target-form-relevant field (targetInputEnabled) does not override archived exclusion', () => {
    // Targets UI reads the same live merged registry as KPI Entry. A KPI
    // that still has targetInputEnabled:true from its pre-archive state
    // must still be excluded once isActive/lifecycleStage mark it archived —
    // there is no separate "targets" allowlist that could disagree.
    const archivedWasfaty = {
      ...DEFAULT_KPI_REGISTRY.wasfaty,
      isActive: false,
      lifecycleStage: 'archived' as KpiLifecycleStage,
    }
    expect(archivedWasfaty.visibility.targetInputEnabled).toBe(true) // unchanged historical flag
    const keys = buildAllowedEntryKeys(registryWith(archivedWasfaty))
    expect(keys.has('wasfaty')).toBe(false) // still excluded — isActive/lifecycleStage wins
  })
})
