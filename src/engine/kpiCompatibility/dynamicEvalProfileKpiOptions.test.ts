// ============================================================
// EvaluationRegistryPage — kpiOptions lifecycle filter tests
//
// Bug fixed:
//   kpiOptions used getActiveKpis(liveRegistry) which includes
//   pilot_tracking and other non-production KPIs. A pilot KPI
//   added to a production evaluation profile would silently
//   receive 0 actuals (excluded by buildAllowedEntryKeys) and
//   degrade evaluation scores.
//
// Fix:
//   kpiOptions now uses getProductionEvaluationKpis(liveRegistry)
//   which filters by lifecycleStage === 'production_evaluation'.
//
// Tests:
//   1. getProductionEvaluationKpis excludes pilot_tracking KPIs
//   2. getProductionEvaluationKpis includes production KPIs
//   3. insuranceConversion is absent from production KPI options
//   4. all 5 core KPIs are present in production KPI options
//   5. EvaluationRegistryPage source uses getProductionEvaluationKpis
//   6. getActiveKpis (old function) would have included pilot KPIs
// ============================================================

import { describe, it, expect } from 'vitest'
import { getActiveKpis, DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import {
  getProductionEvaluationKpis,
  getPilotTrackingKpis,
} from '../../engine/kpiRegistry/kpiMetaResolver'

// ─────────────────────────────────────────────────────────────
// 1. getProductionEvaluationKpis excludes pilot_tracking KPIs
// ─────────────────────────────────────────────────────────────
describe('1 — getProductionEvaluationKpis excludes pilot_tracking KPIs', () => {
  const productionKpis = getProductionEvaluationKpis(DEFAULT_KPI_REGISTRY)
  const productionKeys = productionKpis.map((k) => k.key)

  it('no pilot_tracking KPI appears in the result', () => {
    const pilotKpis = getPilotTrackingKpis(DEFAULT_KPI_REGISTRY)
    pilotKpis.forEach((kpi) => {
      expect(productionKeys, `Pilot KPI '${kpi.key}' must not appear in kpiOptions`).not.toContain(kpi.key)
    })
  })

  it('every returned KPI has lifecycleStage === production_evaluation', () => {
    productionKpis.forEach((kpi) => {
      expect(kpi.lifecycleStage).toBe('production_evaluation')
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 2. getProductionEvaluationKpis includes production KPIs
// ─────────────────────────────────────────────────────────────
describe('2 — getProductionEvaluationKpis includes production_evaluation KPIs', () => {
  const productionKpis = getProductionEvaluationKpis(DEFAULT_KPI_REGISTRY)

  it('returns at least the 5 core production KPIs', () => {
    expect(productionKpis.length).toBeGreaterThanOrEqual(5)
  })

  it('all returned KPIs are active', () => {
    productionKpis.forEach((kpi) => {
      expect(kpi.isActive, `${kpi.key} must be active`).toBe(true)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 3. insuranceConversion is absent from production KPI options
// ─────────────────────────────────────────────────────────────
describe('3 — insuranceConversion is absent from production kpiOptions', () => {
  const productionKpis = getProductionEvaluationKpis(DEFAULT_KPI_REGISTRY)
  const kpiOptions = productionKpis.map((k) => ({ key: k.key, label: k.label }))
  const optionKeys = kpiOptions.map((o) => o.key)

  it('insuranceConversion is NOT in kpiOptions', () => {
    expect(optionKeys).not.toContain('insuranceConversion')
  })

  it('insuranceConversion is pilot_tracking (confirming the reason)', () => {
    expect(DEFAULT_KPI_REGISTRY.insuranceConversion.lifecycleStage).toBe('pilot_tracking')
  })

  it('kpiOptions shape matches expected { key, label } interface', () => {
    kpiOptions.forEach((o) => {
      expect(typeof o.key).toBe('string')
      expect(typeof o.label).toBe('string')
      expect(o.key.length).toBeGreaterThan(0)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 4. all 5 core KPIs are present in production kpiOptions
// ─────────────────────────────────────────────────────────────
describe('4 — all 5 core production KPIs are present in kpiOptions', () => {
  const productionKpis = getProductionEvaluationKpis(DEFAULT_KPI_REGISTRY)
  const optionKeys = productionKpis.map((k) => k.key)

  const coreRegistryKeys = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']

  coreRegistryKeys.forEach((key) => {
    it(`${key} is in kpiOptions`, () => {
      expect(optionKeys).toContain(key)
    })
  })

  it('all 5 core registry keys are present', () => {
    coreRegistryKeys.forEach((key) => {
      expect(optionKeys, `${key} missing from kpiOptions`).toContain(key)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 5. EvaluationRegistryPage source uses getProductionEvaluationKpis
// ─────────────────────────────────────────────────────────────
describe('5 — EvaluationRegistryPage uses getProductionEvaluationKpis (source check)', () => {
  it('imports getProductionEvaluationKpis', async () => {
    const src = (await import('../../pages/admin/EvaluationRegistryPage.tsx?raw')).default
    expect(src).toContain('getProductionEvaluationKpis')
    expect(src).toContain("from '../../engine/kpiRegistry/kpiMetaResolver'")
  })

  it('kpiOptions memo uses getProductionEvaluationKpis not getActiveKpis', async () => {
    const src = (await import('../../pages/admin/EvaluationRegistryPage.tsx?raw')).default
    const memoIdx = src.indexOf('const kpiOptions = useMemo')
    const memoBlock = src.slice(memoIdx, memoIdx + 400)
    expect(memoBlock).toContain('getProductionEvaluationKpis')
    expect(memoBlock).not.toContain('getActiveKpis')
  })
})

// ─────────────────────────────────────────────────────────────
// 6. Regression: getActiveKpis (old path) would include pilot KPIs
// ─────────────────────────────────────────────────────────────
describe('6 — Regression: old getActiveKpis path included pilot KPIs', () => {
  it('getActiveKpis includes insuranceConversion (confirming the bug existed)', () => {
    const allActive = getActiveKpis(DEFAULT_KPI_REGISTRY)
    const keys = allActive.map((k) => k.key)
    // insuranceConversion is active — it would have appeared in kpiOptions before the fix
    expect(keys).toContain('insuranceConversion')
  })

  it('getProductionEvaluationKpis does NOT include insuranceConversion (confirming the fix)', () => {
    const production = getProductionEvaluationKpis(DEFAULT_KPI_REGISTRY)
    const keys = production.map((k) => k.key)
    expect(keys).not.toContain('insuranceConversion')
  })

  it('fix removes exactly the pilot KPIs from options (no production KPIs lost)', () => {
    const allActive  = getActiveKpis(DEFAULT_KPI_REGISTRY)
    const production = getProductionEvaluationKpis(DEFAULT_KPI_REGISTRY)
    const pilots     = getPilotTrackingKpis(DEFAULT_KPI_REGISTRY)

    // Every production KPI must still be in allActive
    production.forEach((kpi) => {
      expect(allActive.map((k) => k.key)).toContain(kpi.key)
    })

    // The difference is exactly the pilot KPIs
    const removed = allActive.filter((k) => !production.find((p) => p.key === k.key))
    const removedKeys  = removed.map((k) => k.key).sort()
    const pilotKeys    = pilots.map((k) => k.key).sort()
    expect(removedKeys).toEqual(pilotKeys)
  })
})
