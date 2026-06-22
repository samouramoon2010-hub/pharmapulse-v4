// ============================================================
// Core KPI Dependency Removal Program — Stage C
// Import/Ingestion Registry Migration
//
// Proves the bulk Excel/CSV import pipeline (parseExcelRowsToRaw →
// validateBatch → stagedToKpiEntry) accepts an arbitrary registry KPI
// by column header/key — with zero source-code changes — while the 5
// legacy Core KPI columns remain byte-identical to prior behavior, and
// unrecognized numeric-looking columns are flagged rather than silently
// dropped.
// ============================================================

import { describe, it, expect } from 'vitest'
import { parseExcelRowsToRaw } from '../kpiImportService'
import { validateRow, validateBatch } from './stagingValidator'
import { stagedToKpiEntry } from './ingestionSafetyGuards'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import type { KpiRegistry, KpiDefinition } from '../../engine/kpiRegistry'

const TEST_KPI_KEY = 'insurance_conversion_test'
const TODAY = new Date().toISOString().split('T')[0]
const USER_ID = 'user-001'
const BRANCH_ID = 'branch-001'

function buildTestKpi(overrides: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key: TEST_KPI_KEY, label: 'Insurance Conversion Test', shortLabel: 'InsTest', labelAr: 'اختبار التأمين',
    category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    lifecycleStage: 'production_evaluation',
    thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
    visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false },
    sortOrder: 999,
    isPrimary: false, coachingAction: '', coachingActionAr: '',
    ...overrides,
  } as KpiDefinition
}

const REGISTRY_WITH_TEST_KPI: KpiRegistry = {
  ...DEFAULT_KPI_REGISTRY,
  [TEST_KPI_KEY]: buildTestKpi(),
}

describe('Stage C — dynamic column resolution accepts an arbitrary KPI key', () => {
  it('a column header matching the new KPI\'s registry key resolves into rawKpiValues — no code change', () => {
    const rows = [{ date: TODAY, pharmacyId: BRANCH_ID, [TEST_KPI_KEY]: '42' }]
    const raw = parseExcelRowsToRaw(rows, 'test.xlsx', REGISTRY_WITH_TEST_KPI)
    expect(raw[0].rawKpiValues?.[TEST_KPI_KEY]).toBe('42')
    expect(raw[0].unknownKpiColumns ?? []).toHaveLength(0)
  })

  it('a column header matching the new KPI\'s English label also resolves', () => {
    const rows = [{ date: TODAY, pharmacyId: BRANCH_ID, 'Insurance Conversion Test': '17' }]
    const raw = parseExcelRowsToRaw(rows, 'test.xlsx', REGISTRY_WITH_TEST_KPI)
    expect(raw[0].rawKpiValues?.[TEST_KPI_KEY]).toBe('17')
  })

  it('the same column is NOT recognized when the KPI is absent from the registry passed in', () => {
    const rows = [{ date: TODAY, pharmacyId: BRANCH_ID, [TEST_KPI_KEY]: '42' }]
    const raw = parseExcelRowsToRaw(rows, 'test.xlsx', DEFAULT_KPI_REGISTRY)
    expect(raw[0].rawKpiValues ?? {}).not.toHaveProperty(TEST_KPI_KEY)
  })

  it('the 5 legacy Core columns remain byte-identical regardless of registry passed in', () => {
    const rows = [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '10', omni: '5', wellness: '8', basket: '3', crossSelling: '4' }]
    const rawDefault = parseExcelRowsToRaw(rows, 'test.xlsx', DEFAULT_KPI_REGISTRY)
    const rawWithTestKpi = parseExcelRowsToRaw(rows, 'test.xlsx', REGISTRY_WITH_TEST_KPI)
    expect(rawDefault[0].rawWasfaty).toBe('10')
    expect(rawWithTestKpi[0].rawWasfaty).toBe('10')
    expect(rawDefault[0]).toEqual(rawWithTestKpi[0])
  })
})

describe('Stage C — unknown KPI columns are flagged, not silently dropped', () => {
  it('a numeric-looking unrecognized column is flagged in unknownKpiColumns', () => {
    const rows = [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '5', mysteryMetric: '99' }]
    const raw = parseExcelRowsToRaw(rows, 'test.xlsx', DEFAULT_KPI_REGISTRY)
    expect(raw[0].unknownKpiColumns).toContain('mysteryMetric')
    expect(raw[0].rawExtras?.mysteryMetric).toBe('99')
  })

  it('validateRow surfaces a UNKNOWN_KPI_KEY warning for flagged columns', () => {
    const raw = parseExcelRowsToRaw(
      [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '5', omni: '3', wellness: '4', basket: '2', crossSelling: '2', mysteryMetric: '99' }],
      'test.xlsx', DEFAULT_KPI_REGISTRY,
    )[0]
    const result = validateRow(raw, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'batch-1', [BRANCH_ID])
    expect(result.isValid).toBe(true)
    expect(result.warnings.some((w) => w.code === 'UNKNOWN_KPI_KEY' && w.field === 'mysteryMetric')).toBe(true)
  })

  it('a non-numeric unrecognized column (e.g. notes) is NOT flagged as an unknown KPI key', () => {
    const rows = [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '5', notes: 'some text' }]
    const raw = parseExcelRowsToRaw(rows, 'test.xlsx', DEFAULT_KPI_REGISTRY)
    expect(raw[0].unknownKpiColumns ?? []).toHaveLength(0)
  })
})

describe('Stage C — arbitrary KPI value flows through staging into the dynamic kpiValues map', () => {
  it('validateRow includes the new KPI in coerced.kpiValues, alongside the 5 legacy fields', () => {
    const rows = [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '10', omni: '5', wellness: '8', basket: '3', crossSelling: '4', [TEST_KPI_KEY]: '42' }]
    const raw = parseExcelRowsToRaw(rows, 'test.xlsx', REGISTRY_WITH_TEST_KPI)[0]
    const result = validateRow(raw, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'batch-1', [BRANCH_ID])
    expect(result.isValid).toBe(true)
    expect(result.coerced?.kpiValues).toMatchObject({
      wasfaty: 10, omni: 5, wellness: 8, basket: 3, crossSelling: 4,
      [TEST_KPI_KEY]: 42,
    })
    // Legacy named fields stay populated too — backward compatible
    expect(result.coerced?.wasfaty).toBe(10)
  })

  it('a legacy-only row (no new KPI column) produces a kpiValues map with exactly the 5 legacy keys — zero drift', () => {
    const rows = [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '10', omni: '5', wellness: '8', basket: '3', crossSelling: '4' }]
    const raw = parseExcelRowsToRaw(rows, 'test.xlsx', REGISTRY_WITH_TEST_KPI)[0]
    const result = validateRow(raw, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'batch-1', [BRANCH_ID])
    expect(Object.keys(result.coerced?.kpiValues ?? {}).sort()).toEqual(
      ['basket', 'crossSelling', 'omni', 'wasfaty', 'wellness'].sort()
    )
  })

  it('stagedToKpiEntry carries the new KPI value into the Firestore kpiValues payload', () => {
    const raw = parseExcelRowsToRaw(
      [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '10', omni: '5', wellness: '8', basket: '3', crossSelling: '4', [TEST_KPI_KEY]: '42' }],
      'test.xlsx', REGISTRY_WITH_TEST_KPI,
    )[0]
    const result = validateRow(raw, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'batch-1', [BRANCH_ID])
    const entry = stagedToKpiEntry(result.coerced as NonNullable<typeof result.coerced> as any, USER_ID)
    expect((entry.kpiValues as Record<string, number>)[TEST_KPI_KEY]).toBe(42)
    // Legacy values are still present and correct in the same payload
    expect((entry.kpiValues as Record<string, number>).wasfaty).toBe(10)
    expect(entry.wasfaty).toBe(10)
  })

  it('stagedToKpiEntry also dual-writes the new KPI as a flat field — what evaluation engines actually read', () => {
    const raw = parseExcelRowsToRaw(
      [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '10', omni: '5', wellness: '8', basket: '3', crossSelling: '4', [TEST_KPI_KEY]: '42' }],
      'test.xlsx', REGISTRY_WITH_TEST_KPI,
    )[0]
    const result = validateRow(raw, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'batch-1', [BRANCH_ID])
    const entry = stagedToKpiEntry(result.coerced as NonNullable<typeof result.coerced> as any, USER_ID)
    expect(entry[TEST_KPI_KEY]).toBe(42)
  })

  it('validateBatch end-to-end: a full batch with one legacy row and one row carrying the new KPI', () => {
    const raws = parseExcelRowsToRaw(
      [
        { date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '10', omni: '5', wellness: '8', basket: '3', crossSelling: '4' },
        { date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '11', omni: '6', wellness: '9', basket: '4', crossSelling: '5', [TEST_KPI_KEY]: '7' },
      ],
      'test.xlsx', REGISTRY_WITH_TEST_KPI,
    )
    const { results, summary } = validateBatch(raws, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'batch-2', [BRANCH_ID])
    expect(summary.valid).toBe(2)
    expect(results[0].coerced?.kpiValues?.[TEST_KPI_KEY]).toBeUndefined()
    expect(results[1].coerced?.kpiValues?.[TEST_KPI_KEY]).toBe(7)
  })
})
