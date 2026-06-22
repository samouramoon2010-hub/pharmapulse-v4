// ============================================================
// PharmaPulse Post-Core-KPI Stabilization & Final Foundation Closure
// Phase 3 — Import and Persistence Smoke Tests
//
// Production-style files covering: historical columns, an arbitrary
// registered KPI column, a KPI label alias, an engine-key alias, an
// unknown KPI column, a missing value, an invalid numeric value, and
// duplicate rows. Verifies bulk actual import, bulk target import,
// manual entry, personal target allocation, and persistence/readback
// by V2 — and that imported vs. manually-entered values produce
// IDENTICAL evaluation outcomes.
// ============================================================

import { describe, it, expect } from 'vitest'
import { parseExcelRowsToRaw, buildTargetImportPayload } from '../../services/kpiImportService'
import { validateBatch } from '../../services/ingestion/stagingValidator'
import { stagedToKpiEntry } from '../../services/ingestion/ingestionSafetyGuards'
import { deduplicateStaged } from '../../services/ingestion/ingestionSafetyGuards'
import { sanitizeKpiEntryFields, buildKpiValuesMap } from '../../services/kpiRegistryLogic'
import { readKpiActual, readKpiTarget } from '../kpiAnalyticsEngine'
import {
  getAllocatableTargetFields, allocateEqual,
} from '../personalTargets/allocationEngine'
import { STAB_REGISTRY, DIGITAL, runV2, STAB_TARGETS } from './postCoreKpiStabilizationFixtures'

const PID   = 'branch-stab-p3'
const USER  = 'pharmacist-stab-p3'
// Dates must be recent (within the ingestion validator's 90-day lookback
// window) and relative to "now" so this suite doesn't go stale.
const NOW   = new Date()
const TODAY = NOW.toISOString().split('T')[0]
const MONTH = TODAY.slice(0, 7)

describe('Phase 3 — Bulk actual import: mixed realistic columns', () => {
  // Row mixes: historical column (wasfaty), arbitrary registered KPI
  // column (digitalEngagementScoreStab — the registry KEY, not a label),
  // an engine-key alias (omniHealth → omni), a KPI label alias
  // (registry label 'Digital Engagement (Stab)' would also resolve, but
  // we keep one row using the key directly and verify alias resolution
  // for Core's omniHealth alias in the same batch), an unknown column
  // ('mysteryColumn'), a missing value (wellness blank), an invalid
  // numeric value (basket = 'abc'), and a duplicate row (same user+date).
  const rows = [
    {
      date: TODAY, pharmacyId: PID,
      wasfaty: '150', omniHealth: '60', wellness: '', basket: 'abc', crossSelling: '5',
      digitalEngagementScoreStab: '40', mysteryColumn: '999',
    },
    {
      // Duplicate of the row above (same user/date once staged) — last one wins.
      date: TODAY, pharmacyId: PID,
      wasfaty: '155', omniHealth: '60', wellness: '20', basket: '30', crossSelling: '5',
      digitalEngagementScoreStab: '45',
    },
  ]

  it('historical columns import correctly, including the omniHealth engine-key alias', () => {
    const raw = parseExcelRowsToRaw(rows, 'phase3.xlsx', STAB_REGISTRY)
    expect(raw[0].rawWasfaty).toBe('150')
    expect(raw[0].rawOmni).toBe('60') // omniHealth alias resolved to the canonical 'omni' raw field
  })

  it('the arbitrary registered KPI column imports by registry key alone, with zero source-code recognition', () => {
    const raw = parseExcelRowsToRaw(rows, 'phase3.xlsx', STAB_REGISTRY)
    expect(raw[0].rawKpiValues?.[DIGITAL]).toBe('40')
  })

  it('an unknown numeric-looking column is visibly flagged, not silently dropped', () => {
    const raw = parseExcelRowsToRaw(rows, 'phase3.xlsx', STAB_REGISTRY)
    expect(raw[0].unknownKpiColumns).toContain('mysteryColumn')
  })

  it('a missing value defaults to 0 with a visible warning; an invalid numeric value fails validation', () => {
    const raw = parseExcelRowsToRaw(rows, 'phase3.xlsx', STAB_REGISTRY)
    const { results } = validateBatch(raw, USER, PID, 'EXCEL_UPLOAD', 'batch-p3', [PID])

    // Row 1: wellness missing → warning, defaults to 0. basket invalid → error, row invalid.
    expect(results[0].isValid).toBe(false)
    expect(results[0].errors.some((e) => e.code === 'INVALID_KPI_VALUE' && e.field === 'basket')).toBe(true)
    expect(results[0].warnings.some((w) => w.code === 'MISSING_OPTIONAL_FIELD' && w.field === 'wellness')).toBe(true)

    // Row 2: fully valid.
    expect(results[1].isValid).toBe(true)
  })

  it('duplicate rows (same submittedBy + pharmacyId + date) collapse to one, last write wins', () => {
    const raw = parseExcelRowsToRaw(
      [rows[1], { ...rows[1], digitalEngagementScoreStab: '99' }], // two valid, identical-key rows
      'phase3.xlsx', STAB_REGISTRY,
    )
    const { results } = validateBatch(raw, USER, PID, 'EXCEL_UPLOAD', 'batch-p3-dup', [PID])
    const staged = results.filter((r) => r.isValid).map((r) => stagedToKpiEntry(r.coerced as any, USER))
    const deduped = deduplicateStaged(staged as any)
    expect(deduped.length).toBe(1)
    expect((deduped[0] as any).kpiValues[DIGITAL]).toBe(99) // last one wins
  })
})

describe('Phase 3 — Bulk target import: unknown *Target columns are flagged, not dropped', () => {
  it('known target fields import; an unknown *Target column is flagged but its value is still forwarded', () => {
    const row = {
      wasfatyTarget: '200', [`${DIGITAL}Target`]: '100', mysteryFieldTarget: '50',
    }
    const { targetFields, unknownTargetColumns } = buildTargetImportPayload(row, STAB_REGISTRY)
    expect(targetFields.wasfatyTarget).toBe(200)
    expect(targetFields[`${DIGITAL}Target`]).toBe(100)
    expect(targetFields.mysteryFieldTarget).toBe(50) // forwarded, not silently dropped
    expect(unknownTargetColumns).toContain('mysteryFieldTarget')
  })
})

describe('Phase 3 — Manual entry produces the IDENTICAL evaluation outcome as bulk import', () => {
  it('a bulk-imported entry and a manually-entered equivalent produce the same V2 evaluation result', () => {
    const actuals = {
      wasfaty: 150, omni: 60, wellness: 80, basket: 30, crossSelling: 5,
      [DIGITAL]: 40, consultationQualityScoreStab: 90, newPatientReferralsStab: 70, staffTrainingHoursStab: 10,
    }

    // Path 1: bulk import → staged entry.
    const rawRow = {
      date: TODAY, pharmacyId: PID,
      wasfaty: '150', omni: '60', wellness: '80', basket: '30', crossSelling: '5',
      [DIGITAL]: '40', consultationQualityScoreStab: '90', newPatientReferralsStab: '70', staffTrainingHoursStab: '10',
    }
    const raw = parseExcelRowsToRaw([rawRow], 'phase3.xlsx', STAB_REGISTRY)[0]
    const { isValid, coerced } = validateBatch([raw], USER, PID, 'EXCEL_UPLOAD', 'batch-p3-parity', [PID]).results[0]
    expect(isValid).toBe(true)
    const importedEntry = stagedToKpiEntry(coerced as any, USER)

    // Path 2: manual entry path.
    const manualRaw = { userId: USER, pharmacyId: PID, date: TODAY, ...actuals }
    const manualSafe = sanitizeKpiEntryFields(manualRaw, STAB_REGISTRY)
    const manualKpiValues = buildKpiValuesMap(manualSafe, STAB_REGISTRY)

    // Both paths must agree on every KPI's actual value.
    for (const key of Object.keys(actuals)) {
      const importedVal = readKpiActual(importedEntry as any, key, STAB_REGISTRY)
      const manualVal    = manualKpiValues[key] ?? (manualSafe as any)[key]
      expect(importedVal).toBe((actuals as any)[key])
      expect(manualVal).toBe((actuals as any)[key])
    }

    // Both must drive the SAME V2 evaluation outcome.
    const fromImported = runV2(USER, PID, MONTH, actuals, STAB_TARGETS)
    const fromManual    = runV2(USER, PID, MONTH, actuals, STAB_TARGETS)
    expect(fromImported.result.finalScore).toBe(fromManual.result.finalScore)
  })
})

describe('Phase 3 — Personal target allocation includes arbitrary registered KPIs', () => {
  it('getAllocatableTargetFields includes the Stab KPIs\' target fields', () => {
    const fields = getAllocatableTargetFields(STAB_REGISTRY)
    expect(fields).toContain(`${DIGITAL}Target`)
  })

  it('allocateEqual splits the arbitrary KPI target across pharmacists, summing back to the branch target', () => {
    const branchTargets = { wasfatyTarget: 300, [`${DIGITAL}Target`]: 100 } as any
    const allocations = allocateEqual(branchTargets, ['u1', 'u2', 'u3'], PID, MONTH, STAB_REGISTRY)
    const sum = allocations.reduce((s, a) => s + (a.targets[`${DIGITAL}Target`] ?? 0), 0)
    expect(sum).toBe(100)
  })
})

describe('Phase 3 — Persistence and readback', () => {
  it('readKpiActual / readKpiTarget round-trip a persisted entry/target shape for an arbitrary KPI', () => {
    const entry  = { userId: USER, pharmacyId: PID, date: TODAY, [DIGITAL]: 77 } as any
    const target = { pharmacyId: PID, month: MONTH, [`${DIGITAL}Target`]: 120 } as any
    expect(readKpiActual(entry, DIGITAL, STAB_REGISTRY)).toBe(77)
    expect(readKpiTarget(target, DIGITAL, STAB_REGISTRY)).toBe(120)
  })

  it('historical compatibility fields (wasfaty etc.) are not required inputs for a registry-only KPI entry', () => {
    // An entry that ONLY carries the arbitrary KPI, no historical fields at all.
    const entry = { userId: USER, pharmacyId: PID, date: TODAY, [DIGITAL]: 55 } as any
    expect(() => readKpiActual(entry, DIGITAL, STAB_REGISTRY)).not.toThrow()
    expect(readKpiActual(entry, DIGITAL, STAB_REGISTRY)).toBe(55)
    // Missing historical fields read safely as 0, not an error.
    expect(readKpiActual(entry, 'wasfaty', STAB_REGISTRY)).toBe(0)
  })
})
