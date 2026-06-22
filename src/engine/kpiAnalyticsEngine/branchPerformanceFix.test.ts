// ============================================================
// ReportsPage — Branch Performance Regression Tests
//
// Root cause that was fixed:
//   branchSummary built kpiStatsMap[key] = { achievementPct }
//   without the `target` field.
//   computeOverallAchievement guards: if (!stat.target) → excluded.
//   Every KPI was excluded → totalWeight = 0 → returned 0 for every branch.
//
// These tests exercise computeOverallAchievement directly with the
// same shape branchSummary now produces, proving:
//   1. achievement > 0 when entries and targets exist
//   2. KPIs with zero/missing target are still safely excluded
//   3. Old (broken) shape always produced 0
//   4. New (fixed) shape produces the correct weighted average
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  computeOverallAchievement,
  computeAchievementPct,
  KPI_KEYS,
} from '../../engine/kpiAnalyticsEngine'

// ── Helper: build a kpiStatsMap the OLD (broken) way ──────────

function buildBrokenStatsMap(
  entries: Record<string, number>,
  targets: Record<string, number>,
): Record<string, unknown> {
  const map: Record<string, unknown> = {}
  for (const key of KPI_KEYS) {
    const actual = entries[key] ?? 0
    const target = targets[key + 'Target'] ?? 0
    // OLD shape — missing target and actual fields
    map[key] = { achievementPct: computeAchievementPct(actual, target) }
  }
  return map
}

// ── Helper: build a kpiStatsMap the NEW (fixed) way ───────────

function buildFixedStatsMap(
  entries: Record<string, number>,
  targets: Record<string, number>,
): Record<string, unknown> {
  const map: Record<string, unknown> = {}
  for (const key of KPI_KEYS) {
    const actual = entries[key] ?? 0
    const target = targets[key + 'Target'] ?? 0
    // NEW shape — includes target and actual
    map[key] = {
      achievementPct: computeAchievementPct(actual, target),
      target,
      actual,
    }
  }
  return map
}

// ── Fixtures ──────────────────────────────────────────────────

const FULL_ACTUALS = {
  wasfaty: 800, omni: 40, wellness: 30, basket: 250, crossSelling: 20,
}

// buildFixedStatsMap uses key+'Target' convention (e.g. 'crossSelling'+'Target').
// The real ReportsPage uses getTargetFieldName() which maps 'crossSelling' → 'crossSellTarget'.
// These tests exercise computeOverallAchievement directly so we use the simpler key+'Target' form.
const FULL_TARGETS = {
  wasfatyTarget: 1000, omniTarget: 50, wellnessTarget: 40,
  basketTarget:  300,  crossSellingTarget: 25,
}

// ════════════════════════════════════════════════════════════════
// 1. Old shape always returns 0 — confirms the root cause
// ════════════════════════════════════════════════════════════════

describe('branchSummary — old broken shape', () => {
  it('old shape (no target field) returns 0 regardless of actual achievement', () => {
    const map = buildBrokenStatsMap(FULL_ACTUALS, FULL_TARGETS) as any
    // Each stat has achievementPct = real value, but stat.target is undefined
    expect(map['wasfaty'].achievementPct).toBeGreaterThan(0)  // achievementPct is set
    expect(map['wasfaty'].target).toBeUndefined()              // target is missing

    // computeOverallAchievement excludes every KPI → returns 0
    const result = computeOverallAchievement(map)
    expect(result).toBe(0)
  })

  it('old shape returns 0 even when 100% achievement on all KPIs', () => {
    const perfectActuals = { wasfaty: 1000, omni: 50, wellness: 40, basket: 300, crossSelling: 25 }
    const map = buildBrokenStatsMap(perfectActuals, FULL_TARGETS)
    expect(computeOverallAchievement(map)).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════
// 2. Fixed shape returns correct achievement — the regression guard
// ════════════════════════════════════════════════════════════════

describe('branchSummary — fixed shape', () => {
  it('fixed shape returns > 0 when entries and targets exist', () => {
    const map = buildFixedStatsMap(FULL_ACTUALS, FULL_TARGETS) as any
    const result = computeOverallAchievement(map)
    expect(result).toBeGreaterThan(0)
  })

  it('fixed shape: 100% actual/target produces ~100 achievement', () => {
    const perfectActuals = { wasfaty: 1000, omni: 50, wellness: 40, basket: 300, crossSelling: 25 }
    const map = buildFixedStatsMap(perfectActuals, FULL_TARGETS)
    const result = computeOverallAchievement(map)
    expect(result).toBe(100)
  })

  it('fixed shape: 80% on all KPIs produces ~80 overall achievement', () => {
    const actuals = { wasfaty: 800, omni: 40, wellness: 32, basket: 240, crossSelling: 20 }
    // Each is exactly 80% of its target
    const map = buildFixedStatsMap(actuals, FULL_TARGETS)
    const result = computeOverallAchievement(map)
    expect(result).toBeCloseTo(80, 0)
  })

  it('fixed shape numerical example: wasfaty 80%, omni 100%, others 0 with targets', () => {
    // Use the engine's actual target field name convention (key+'Target').
    // In buildFixedStatsMap, crossSelling → looks up 'crossSellingTarget' (not 'crossSellTarget').
    // To avoid the aliasing complexity in this unit test, use only the 5 exact engine keys
    // and map them as key+'Target' which is what buildFixedStatsMap does.
    const actuals = { wasfaty: 800, omni: 50, wellness: 0, basket: 0, crossSelling: 0 }
    const targets = {
      wasfatyTarget: 1000, omniTarget: 50, wellnessTarget: 40,
      basketTarget: 300, crossSellingTarget: 25,  // key+'Target' convention used by buildFixedStatsMap
    }
    const map = buildFixedStatsMap(actuals, targets)
    const result = computeOverallAchievement(map)
    // wasfaty: 80% × 0.25 = 20, omni: 100% × 0.20 = 20
    // wellness: 0% × 0.20 = 0, basket: 0% × 0.20 = 0, crossSelling: 0% × 0.15 = 0
    // totalWeight = 1.0, weightedSum = 40 → result = 40
    expect(result).toBe(40)
  })
})

// ════════════════════════════════════════════════════════════════
// 3. KPIs with missing/zero target are safely excluded
// ════════════════════════════════════════════════════════════════

describe('branchSummary — zero/missing target exclusion', () => {
  it('KPI with target=0 is excluded (no divide-by-zero, no NaN)', () => {
    // Only wasfaty has a target; all others have target=0
    const partialTargets = { wasfatyTarget: 1000 }
    const map = buildFixedStatsMap(FULL_ACTUALS, partialTargets) as any
    const result = computeOverallAchievement(map)
    // Only wasfaty contributes: 80% × 0.25 weight, totalWeight = 0.25
    // result = (0.25 × 80) / 0.25 = 80
    expect(result).toBe(80)
    expect(Number.isFinite(result)).toBe(true)
    expect(isNaN(result)).toBe(false)
  })

  it('branch with no targets at all returns 0 (not NaN/Infinity)', () => {
    const map = buildFixedStatsMap(FULL_ACTUALS, {})
    const result = computeOverallAchievement(map)
    expect(result).toBe(0)
    expect(Number.isFinite(result)).toBe(true)
  })

  it('branch with no entries and no targets returns 0', () => {
    const map = buildFixedStatsMap({}, {})
    expect(computeOverallAchievement(map)).toBe(0)
  })

  it('partial targets: only KPIs with target > 0 contribute to the weighted average', () => {
    // wasfaty and omni have targets; the rest do not
    const partialTargets = { wasfatyTarget: 1000, omniTarget: 50 }
    const actuals        = { wasfaty: 1000, omni: 50 }   // 100% on both
    const map = buildFixedStatsMap(actuals, partialTargets)
    const result = computeOverallAchievement(map)
    // Both at 100%, weights 0.25 and 0.20, totalWeight = 0.45
    // (0.25×100 + 0.20×100) / 0.45 = 45/0.45 = 100
    expect(result).toBe(100)
  })
})

// ════════════════════════════════════════════════════════════════
// 4. Source-level confirmation: fixed line is in ReportsPage.jsx
// ════════════════════════════════════════════════════════════════

describe('ReportsPage source guard', () => {
  it('ReportsPage.jsx includes target field in kpiStatsMap', async () => {
    const src = await import('../../pages/shared/ReportsPage.jsx?raw')
    // The fixed line must include both target and actual
    expect(src.default).toContain('target,   // required by computeOverallAchievement')
    expect(src.default).toContain('actual,   // included for KpiStats consistency')
  })

  it('ReportsPage.jsx no longer uses the broken single-field shape', async () => {
    const src = await import('../../pages/shared/ReportsPage.jsx?raw')
    // The old broken one-liner must not appear
    expect(src.default).not.toContain(
      'kpiStatsMap[key] = { achievementPct: computeAchievementPct(actual, target) }'
    )
  })
})
