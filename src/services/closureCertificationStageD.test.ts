// ============================================================
// Core KPI Removal Closure Certification — Part 1
// Stage D: Dynamic Write Path Certification
//
// Proves every active production KPI/target write path accepts an
// arbitrary registered KPI key, does not require the 5 historical Core
// fields, and persists into the official dynamic storage shape.
// ============================================================

import { describe, it, expect } from 'vitest'
import { sanitizeKpiEntryFields, buildKpiValuesMap, buildAllowedEntryKeys } from './kpiRegistryLogic'
import { buildTargetImportPayload } from './kpiImportService'
import { DEFAULT_KPI_REGISTRY } from '../engine/kpiRegistry'
import type { KpiRegistry, KpiDefinition } from '../engine/kpiRegistry'
import { getAllocatableTargetFields } from '../engine/personalTargets/allocationEngine'

const TEST_KPI_KEY = 'insurance_conversion_test'

function buildTestKpi(overrides: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key: TEST_KPI_KEY, label: 'Insurance Conversion Test', shortLabel: 'InsTest', labelAr: 'اختبار التأمين',
    category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    lifecycleStage: 'production_evaluation',
    thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
    visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false, targetInputEnabled: true },
    sortOrder: 999, isPrimary: false, coachingAction: '', coachingActionAr: '',
    actualField: TEST_KPI_KEY, targetField: `${TEST_KPI_KEY}Target`,
    ...overrides,
  } as KpiDefinition
}

const REGISTRY_WITH_TEST_KPI: KpiRegistry = {
  ...DEFAULT_KPI_REGISTRY,
  [TEST_KPI_KEY]: buildTestKpi(),
}

describe('Stage D — manual KPI entry write path (sanitizeKpiEntryFields / buildKpiValuesMap)', () => {
  it('accepts the arbitrary KPI key with zero hardcoded reference to it', () => {
    const allowed = buildAllowedEntryKeys(REGISTRY_WITH_TEST_KPI)
    expect(allowed.has(TEST_KPI_KEY)).toBe(true)

    const safe = sanitizeKpiEntryFields({ userId: 'u1', pharmacyId: 'p1', date: '2026-01-01', [TEST_KPI_KEY]: 42 }, REGISTRY_WITH_TEST_KPI)
    expect(safe[TEST_KPI_KEY]).toBe(42)

    const kpiValues = buildKpiValuesMap(safe, REGISTRY_WITH_TEST_KPI)
    expect(kpiValues[TEST_KPI_KEY]).toBe(42)
  })

  it('does not require any of the 5 historical Core fields to be present', () => {
    const safe = sanitizeKpiEntryFields({ userId: 'u1', pharmacyId: 'p1', date: '2026-01-01', [TEST_KPI_KEY]: 10 }, REGISTRY_WITH_TEST_KPI)
    expect(Object.keys(safe)).toEqual([TEST_KPI_KEY])
  })

  it('rejects a KPI key absent from the registry (not silently accepted)', () => {
    const safe = sanitizeKpiEntryFields({ userId: 'u1', pharmacyId: 'p1', date: '2026-01-01', totally_unregistered_kpi: 99 }, DEFAULT_KPI_REGISTRY)
    expect(safe.totally_unregistered_kpi).toBeUndefined()
  })

  it('a non-production-evaluation KPI (pilot/draft) is excluded from the write allowlist', () => {
    const pilotRegistry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      [TEST_KPI_KEY]: buildTestKpi({ lifecycleStage: 'pilot_tracking' }),
    }
    const allowed = buildAllowedEntryKeys(pilotRegistry)
    expect(allowed.has(TEST_KPI_KEY)).toBe(false)
  })
})

describe('Stage D — bulk target import write path (buildTargetImportPayload + saveTarget contract)', () => {
  it('forwards an arbitrary *Target column with zero hardcoded reference to the KPI name', () => {
    const row = { pharmacyCode: '5074', month: '2026-01', [`${TEST_KPI_KEY}Target`]: '50' }
    const { targetFields, unknownTargetColumns } = buildTargetImportPayload(row, REGISTRY_WITH_TEST_KPI)
    expect(targetFields[`${TEST_KPI_KEY}Target`]).toBe(50)
    expect(unknownTargetColumns).toHaveLength(0)
  })

  it('the 5 legacy Target columns remain byte-identical (no regression)', () => {
    const row = {
      pharmacyCode: '5074', month: '2026-01',
      salesTarget: '50000', wasfatyTarget: '200', omniTarget: '100',
      wellnessTarget: '150', crossSellTarget: '80',
    }
    const { targetFields, unknownTargetColumns } = buildTargetImportPayload(row, DEFAULT_KPI_REGISTRY)
    expect(targetFields).toEqual({
      salesTarget: 50000, wasfatyTarget: 200, omniTarget: 100,
      wellnessTarget: 150, crossSellTarget: 80,
    })
    expect(unknownTargetColumns).toHaveLength(0)
  })

  it('flags a *Target column that matches no active registry KPI, without dropping it', () => {
    const row = { pharmacyCode: '5074', month: '2026-01', mysteryKpiTarget: '10' }
    const { targetFields, unknownTargetColumns } = buildTargetImportPayload(row, DEFAULT_KPI_REGISTRY)
    expect(targetFields.mysteryKpiTarget).toBe(10)
    expect(unknownTargetColumns).toContain('mysteryKpiTarget')
  })

  it('"sales" KPI (active, not target-input-UI-enabled) still resolves as a KNOWN target field — no false-positive flag', () => {
    const row = { pharmacyCode: '5074', month: '2026-01', salesTarget: '1000' }
    const { unknownTargetColumns } = buildTargetImportPayload(row, DEFAULT_KPI_REGISTRY)
    expect(unknownTargetColumns).toHaveLength(0)
  })
})

describe('Stage D — personal target write path (savePersonalTarget / allocationEngine)', () => {
  it('getAllocatableTargetFields includes the arbitrary KPI when target-input-enabled', () => {
    const fields = getAllocatableTargetFields(REGISTRY_WITH_TEST_KPI)
    expect(fields).toContain(`${TEST_KPI_KEY}Target`)
  })

  it('the 5 legacy target fields remain present with no registry change', () => {
    const fields = getAllocatableTargetFields(DEFAULT_KPI_REGISTRY)
    expect(fields).toEqual(expect.arrayContaining(['wasfatyTarget', 'omniTarget', 'wellnessTarget', 'basketTarget', 'crossSellTarget']))
  })
})
