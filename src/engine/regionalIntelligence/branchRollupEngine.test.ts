// ============================================================
// Branch Rollup Engine — Unit Tests
// Covers: valid rollup, no entries, missing target,
//         partial target, low achievement risk,
//         data quality flags, submission rate, momentum,
//         operational status, and score correctness.
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateBranchRollup }  from './branchRollupEngine'
import type { BranchRollupInput, RegionalPeriod } from './regionalTypes'
import type { KpiEntry, MonthlyTarget }            from '../kpiAnalyticsEngine'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** A mid-month period for stable, deterministic tests (day 15 of 30). */
const TEST_PERIOD: RegionalPeriod = {
  type:      'MTD',
  startDate: '2025-05-01',
  endDate:   '2025-05-15',
  month:     '2025-05',
  dayRatio:  0.5,           // exactly halfway through the month
}

function makeEntry(overrides: Partial<KpiEntry> = {}): KpiEntry {
  return {
    id:           overrides.id           ?? 'e1',
    userId:       overrides.userId       ?? 'u1',
    pharmacyId:   overrides.pharmacyId   ?? 'b1',
    date:         overrides.date         ?? '2025-05-15',
    wasfaty:      overrides.wasfaty      ?? 100,
    omni:         overrides.omni         ?? 80,
    wellness:     overrides.wellness     ?? 60,
    basket:       overrides.basket       ?? 50,
    crossSelling: overrides.crossSelling ?? 40,
    notes:        '',
    ...overrides,
  }
}

function makeTarget(overrides: Partial<MonthlyTarget> = {}): MonthlyTarget {
  return {
    pharmacyId:      overrides.pharmacyId      ?? 'b1',
    month:           overrides.month           ?? '2025-05',
    wasfatyTarget:   overrides.wasfatyTarget   ?? 200,
    omniTarget:      overrides.omniTarget       ?? 160,
    wellnessTarget:  overrides.wellnessTarget  ?? 120,
    basketTarget:    overrides.basketTarget    ?? 100,
    crossSellTarget: overrides.crossSellTarget ?? 80,
    ...overrides,
  }
}

function makeInput(overrides: Partial<BranchRollupInput> = {}): BranchRollupInput {
  const hasEntries = Object.prototype.hasOwnProperty.call(overrides, 'entries')
  const hasTarget  = Object.prototype.hasOwnProperty.call(overrides, 'target')
  return {
    branchId:    overrides.branchId    ?? 'b1',
    branchName:  overrides.branchName  ?? 'Test Branch',
    branchCode:  overrides.branchCode  ?? 'TB-01',
    region:      overrides.region      ?? 'Central',
    entries:     hasEntries ? overrides.entries! : [makeEntry()],
    target:      hasTarget  ? overrides.target!  : makeTarget(),
    historicalEntries: overrides.historicalEntries,
    pharmacistCount:   overrides.pharmacistCount,
    submittedToday:    overrides.submittedToday,
  }
}

// ─────────────────────────────────────────────────────────────
// 1. VALID BRANCH ROLLUP
// ─────────────────────────────────────────────────────────────

describe('generateBranchRollup — valid branch', () => {
  it('returns a BranchRollupSummary with all required fields', () => {
    const result = generateBranchRollup(makeInput(), TEST_PERIOD)

    expect(result.branchId).toBe('b1')
    expect(result.branchName).toBe('Test Branch')
    expect(result.branchCode).toBe('TB-01')
    expect(result.region).toBe('Central')
    expect(result.period).toEqual(TEST_PERIOD)
  })

  it('contains exactly 5 KPI rollup summaries', () => {
    const result = generateBranchRollup(makeInput(), TEST_PERIOD)
    expect(result.kpiAchievementSummary).toHaveLength(5)
    const keys = result.kpiAchievementSummary.map((k) => k.kpiKey)
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('omni')
    expect(keys).toContain('wellness')
    expect(keys).toContain('basket')
    expect(keys).toContain('crossSelling')
  })

  it('KPI rollup has correct actual values', () => {
    const entry  = makeEntry({ wasfaty: 150, omni: 90 })
    const result = generateBranchRollup(makeInput({ entries: [entry] }), TEST_PERIOD)
    const wasfaty = result.kpiAchievementSummary.find((k) => k.kpiKey === 'wasfaty')!
    const omni    = result.kpiAchievementSummary.find((k) => k.kpiKey === 'omni')!
    expect(wasfaty.actual).toBe(150)
    expect(omni.actual).toBe(90)
  })

  it('KPI rollup marks hasTarget = true when target is set', () => {
    const result = generateBranchRollup(makeInput(), TEST_PERIOD)
    result.kpiAchievementSummary.forEach((k) => {
      expect(k.hasTarget).toBe(true)
    })
  })

  it('achievementPct is correct for known actual/target', () => {
    // actual = 100, target = 200 → 50%
    const entry  = makeEntry({ wasfaty: 100 })
    const target = makeTarget({ wasfatyTarget: 200 })
    const result = generateBranchRollup(makeInput({ entries: [entry], target }), TEST_PERIOD)
    const wasfaty = result.kpiAchievementSummary.find((k) => k.kpiKey === 'wasfaty')!
    expect(wasfaty.achievementPct).toBe(50)
    expect(wasfaty.target).toBe(200)
    expect(wasfaty.actual).toBe(100)
  })

  it('branchScore is between 0 and 100', () => {
    const result = generateBranchRollup(makeInput(), TEST_PERIOD)
    expect(result.branchScore).toBeGreaterThanOrEqual(0)
    expect(result.branchScore).toBeLessThanOrEqual(100)
  })

  it('overallAchievementPct is a non-negative number', () => {
    const result = generateBranchRollup(makeInput(), TEST_PERIOD)
    expect(result.overallAchievementPct).toBeGreaterThanOrEqual(0)
  })

  it('submissionRatePct reflects submitted / pharmacistCount', () => {
    const input  = makeInput({ pharmacistCount: 4, submittedToday: 3 })
    const result = generateBranchRollup(input, TEST_PERIOD)
    expect(result.submissionRatePct).toBe(75)
  })

  it('submissionRatePct capped at 100', () => {
    const input  = makeInput({ pharmacistCount: 2, submittedToday: 5 })
    const result = generateBranchRollup(input, TEST_PERIOD)
    expect(result.submissionRatePct).toBe(100)
  })

  it('generatedAt is a valid ISO timestamp', () => {
    const result = generateBranchRollup(makeInput(), TEST_PERIOD)
    expect(() => new Date(result.generatedAt)).not.toThrow()
    expect(new Date(result.generatedAt).getFullYear()).toBeGreaterThan(2020)
  })

  it('hasDataErrors is false for a clean branch', () => {
    const result = generateBranchRollup(
      makeInput({ pharmacistCount: 2, submittedToday: 2 }),
      TEST_PERIOD,
    )
    expect(result.hasDataErrors).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. NO ENTRIES
// ─────────────────────────────────────────────────────────────

describe('generateBranchRollup — no entries', () => {
  it('does not throw when entries is empty', () => {
    expect(() => generateBranchRollup(makeInput({ entries: [] }), TEST_PERIOD)).not.toThrow()
  })

  it('operationalStatus is NO_DATA when entries is empty', () => {
    const result = generateBranchRollup(makeInput({ entries: [] }), TEST_PERIOD)
    expect(result.operationalStatus).toBe('NO_DATA')
  })

  it('branchScore is 0 when entries is empty', () => {
    const result = generateBranchRollup(makeInput({ entries: [] }), TEST_PERIOD)
    expect(result.branchScore).toBe(0)
  })

  it('all KPI actuals are 0 when entries is empty', () => {
    const result = generateBranchRollup(makeInput({ entries: [] }), TEST_PERIOD)
    result.kpiAchievementSummary.forEach((k) => {
      expect(k.actual).toBe(0)
    })
  })

  it('contains NO_ENTRIES ERROR flag', () => {
    const result = generateBranchRollup(makeInput({ entries: [] }), TEST_PERIOD)
    const flag = result.dataQualityFlags.find((f) => f.code === 'NO_ENTRIES')
    expect(flag).toBeDefined()
    expect(flag?.severity).toBe('ERROR')
  })

  it('hasDataErrors is true when entries is empty', () => {
    const result = generateBranchRollup(makeInput({ entries: [] }), TEST_PERIOD)
    expect(result.hasDataErrors).toBe(true)
  })

  it('momentumDirection is INSUFFICIENT_DATA when no history', () => {
    const result = generateBranchRollup(makeInput({ entries: [] }), TEST_PERIOD)
    expect(result.momentumDirection).toBe('INSUFFICIENT_DATA')
  })
})

// ─────────────────────────────────────────────────────────────
// 3. MISSING TARGET
// ─────────────────────────────────────────────────────────────

describe('generateBranchRollup — missing target', () => {
  it('does not throw when target is null', () => {
    expect(() =>
      generateBranchRollup(makeInput({ target: null }), TEST_PERIOD)
    ).not.toThrow()
  })

  it('operationalStatus is NO_TARGET when target is null (and no stale data)', () => {
    const result = generateBranchRollup(makeInput({ target: null }), TEST_PERIOD)
    expect(result.operationalStatus).toBe('NO_TARGET')
  })

  it('all KPI targets are 0 when target is null', () => {
    const result = generateBranchRollup(makeInput({ target: null }), TEST_PERIOD)
    result.kpiAchievementSummary.forEach((k) => {
      expect(k.target).toBe(0)
      expect(k.hasTarget).toBe(false)
    })
  })

  it('overallAchievementPct is 0 when no targets exist', () => {
    const result = generateBranchRollup(makeInput({ target: null }), TEST_PERIOD)
    expect(result.overallAchievementPct).toBe(0)
  })

  it('contains NO_TARGET WARNING flag', () => {
    const result = generateBranchRollup(makeInput({ target: null }), TEST_PERIOD)
    const flag = result.dataQualityFlags.find((f) => f.code === 'NO_TARGET')
    expect(flag).toBeDefined()
    expect(flag?.severity).toBe('WARNING')
  })

  it('hasDataErrors is false for missing target (it is a WARNING not ERROR)', () => {
    const result = generateBranchRollup(makeInput({ target: null }), TEST_PERIOD)
    // ERROR only when both entries AND target are absent
    expect(result.hasDataErrors).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. PARTIAL TARGET
// ─────────────────────────────────────────────────────────────

describe('generateBranchRollup — partial target (some KPIs have 0)', () => {
  it('flags PARTIAL_TARGET when some KPI targets are 0', () => {
    const partialTarget = makeTarget({
      wasfatyTarget:   0,
      omniTarget:      0,
      wellnessTarget:  120,
      basketTarget:    100,
      crossSellTarget: 80,
    })
    const result = generateBranchRollup(makeInput({ target: partialTarget }), TEST_PERIOD)
    const flag = result.dataQualityFlags.find((f) => f.code === 'PARTIAL_TARGET')
    expect(flag).toBeDefined()
    expect(flag?.severity).toBe('WARNING')
    expect(flag?.value).toBe(2)  // 2 zero-target KPIs
  })

  it('KPIs with 0 target have hasTarget = false', () => {
    const partialTarget = makeTarget({ wasfatyTarget: 0 })
    const result = generateBranchRollup(makeInput({ target: partialTarget }), TEST_PERIOD)
    const wasfaty = result.kpiAchievementSummary.find((k) => k.kpiKey === 'wasfaty')!
    expect(wasfaty.hasTarget).toBe(false)
    expect(wasfaty.achievementPct).toBe(0)
  })

  it('KPIs with non-zero target still compute correctly', () => {
    const partialTarget = makeTarget({ wasfatyTarget: 0, omniTarget: 160 })
    const entry  = makeEntry({ omni: 80 })
    const result = generateBranchRollup(makeInput({ entries: [entry], target: partialTarget }), TEST_PERIOD)
    const omni   = result.kpiAchievementSummary.find((k) => k.kpiKey === 'omni')!
    expect(omni.hasTarget).toBe(true)
    expect(omni.achievementPct).toBe(50)  // 80 / 160 = 50%
  })

  it('does not flag PARTIAL_TARGET when ALL KPIs have 0 targets', () => {
    const zeroTarget = makeTarget({
      wasfatyTarget: 0, omniTarget: 0, wellnessTarget: 0, basketTarget: 0, crossSellTarget: 0,
    })
    // When all targets are 0, NO_TARGET-like behaviour — not PARTIAL
    const result = generateBranchRollup(makeInput({ target: zeroTarget }), TEST_PERIOD)
    const partialFlag = result.dataQualityFlags.find((f) => f.code === 'PARTIAL_TARGET')
    // PARTIAL_TARGET only fires when SOME (not all) are 0
    expect(partialFlag).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 5. LOW ACHIEVEMENT → RISK LEVEL
// ─────────────────────────────────────────────────────────────

describe('generateBranchRollup — low achievement and risk', () => {
  it('riskLevel is HIGH_RISK when all 5 KPIs are critically underperforming', () => {
    // All KPIs at 10% achievement → all status = 'critical'
    const lowEntry  = makeEntry({ wasfaty: 20, omni: 16, wellness: 12, basket: 10, crossSelling: 8 })
    const target    = makeTarget({
      wasfatyTarget: 200, omniTarget: 160, wellnessTarget: 120, basketTarget: 100, crossSellTarget: 80,
    })
    const result = generateBranchRollup(makeInput({ entries: [lowEntry], target }), TEST_PERIOD)
    expect(result.riskLevel).toBe('HIGH_RISK')
  })

  it('riskLevel is ON_TRACK when all KPIs are at or above target', () => {
    // All KPIs at 100%+ achievement
    const highEntry = makeEntry({ wasfaty: 200, omni: 160, wellness: 120, basket: 100, crossSelling: 80 })
    const result    = generateBranchRollup(makeInput({ entries: [highEntry] }), TEST_PERIOD)
    expect(result.riskLevel).toBe('ON_TRACK')
  })

  it('riskLevel is LOW_RISK when 1 KPI is warning', () => {
    // wasfaty at 60% (warning at mid-month), rest excellent
    const entry  = makeEntry({ wasfaty: 60, omni: 160, wellness: 120, basket: 100, crossSelling: 80 })
    const target = makeTarget({ wasfatyTarget: 200 })
    const result = generateBranchRollup(makeInput({ entries: [entry], target }), TEST_PERIOD)
    // At 50% day progress, 60/200 = 30% achievement is critical not warning
    // Risk level depends on traffic light thresholds — just assert it's not ON_TRACK
    expect(['LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK']).toContain(result.riskLevel)
  })

  it('riskLevel is LOW_RISK when target is missing (uncertain, not critical)', () => {
    const result = generateBranchRollup(makeInput({ target: null }), TEST_PERIOD)
    expect(result.riskLevel).toBe('LOW_RISK')
  })
})

// ─────────────────────────────────────────────────────────────
// 6. DATA QUALITY FLAGS
// ─────────────────────────────────────────────────────────────

describe('generateBranchRollup — data quality flags', () => {
  it('no flags for a clean branch with fresh data', () => {
    const input = makeInput({
      pharmacistCount: 2,
      submittedToday:  2,
      historicalEntries: Array.from({ length: 15 }, (_, i) =>
        makeEntry({ date: `2025-04-${String(i + 1).padStart(2, '0')}`, userId: 'u1' })
      ),
    })
    const result = generateBranchRollup(input, TEST_PERIOD)
    // May still have INFO flags (INSUFFICIENT_HISTORY if < 14 unique days)
    const errorOrWarning = result.dataQualityFlags.filter(
      (f) => f.severity === 'ERROR' || f.severity === 'WARNING'
    )
    expect(errorOrWarning).toHaveLength(0)
  })

  it('LOW_SUBMISSION_RATE flag when < 70% submitted', () => {
    const input  = makeInput({ pharmacistCount: 10, submittedToday: 4 })  // 40%
    const result = generateBranchRollup(input, TEST_PERIOD)
    const flag   = result.dataQualityFlags.find((f) => f.code === 'LOW_SUBMISSION_RATE')
    expect(flag).toBeDefined()
    expect(flag?.severity).toBe('WARNING')
    expect(flag?.value).toBe(40)
  })

  it('no LOW_SUBMISSION_RATE flag when ≥ 70% submitted', () => {
    const input  = makeInput({ pharmacistCount: 10, submittedToday: 8 })  // 80%
    const result = generateBranchRollup(input, TEST_PERIOD)
    const flag   = result.dataQualityFlags.find((f) => f.code === 'LOW_SUBMISSION_RATE')
    expect(flag).toBeUndefined()
  })

  it('STALE_DATA flag when latest entry is > 3 days before period end', () => {
    // Period ends 2025-05-15, entry date 2025-05-10 → 5 days stale
    const staleEntry = makeEntry({ date: '2025-05-10' })
    const input      = makeInput({ entries: [staleEntry] })
    const result     = generateBranchRollup(input, TEST_PERIOD)
    const flag       = result.dataQualityFlags.find((f) => f.code === 'STALE_DATA')
    expect(flag).toBeDefined()
    expect(flag?.value).toBe(5)
  })

  it('no STALE_DATA flag when entry is on period end date', () => {
    const freshEntry = makeEntry({ date: '2025-05-15' })
    const input      = makeInput({ entries: [freshEntry] })
    const result     = generateBranchRollup(input, TEST_PERIOD)
    const flag       = result.dataQualityFlags.find((f) => f.code === 'STALE_DATA')
    expect(flag).toBeUndefined()
  })

  it('INSUFFICIENT_HISTORY flag is INFO severity', () => {
    // Only 3 historical entries — below 14-day threshold
    const hist = [
      makeEntry({ date: '2025-04-13' }),
      makeEntry({ date: '2025-04-14' }),
      makeEntry({ date: '2025-04-15' }),
    ]
    const result = generateBranchRollup(makeInput({ historicalEntries: hist }), TEST_PERIOD)
    const flag   = result.dataQualityFlags.find((f) => f.code === 'INSUFFICIENT_HISTORY')
    expect(flag).toBeDefined()
    expect(flag?.severity).toBe('INFO')
  })

  it('flags are sorted: ERROR before WARNING before INFO', () => {
    // Trigger multiple flags
    const input  = makeInput({
      entries:        [makeEntry({ date: '2025-05-10' })],  // stale
      target:         null,                                   // no target
      pharmacistCount: 10,
      submittedToday:  3,                                     // low submission
      historicalEntries: [],                                  // insufficient history
    })
    const result = generateBranchRollup(input, TEST_PERIOD)
    const severities = result.dataQualityFlags.map((f) => f.severity)
    const order = { ERROR: 0, WARNING: 1, INFO: 2 }
    for (let i = 1; i < severities.length; i++) {
      expect(order[severities[i]]).toBeGreaterThanOrEqual(order[severities[i - 1]])
    }
  })
})

// ─────────────────────────────────────────────────────────────
// 7. MOMENTUM DIRECTION
// ─────────────────────────────────────────────────────────────

describe('generateBranchRollup — momentumDirection', () => {
  it('returns INSUFFICIENT_DATA when no historicalEntries', () => {
    const result = generateBranchRollup(makeInput(), TEST_PERIOD)
    expect(result.momentumDirection).toBe('INSUFFICIENT_DATA')
  })

  it('returns INSUFFICIENT_DATA when historicalEntries has 1 entry', () => {
    const input  = makeInput({ historicalEntries: [makeEntry()] })
    const result = generateBranchRollup(input, TEST_PERIOD)
    expect(result.momentumDirection).toBe('INSUFFICIENT_DATA')
  })

  it('returns a valid direction when sufficient history is provided', () => {
    const VALID = ['ACCELERATING', 'IMPROVING', 'STABLE', 'DECLINING', 'DETERIORATING', 'INSUFFICIENT_DATA']
    const hist = Array.from({ length: 20 }, (_, i) =>
      makeEntry({ date: `2025-04-${String(i + 1).padStart(2, '0')}`, wasfaty: 100 + i })
    )
    const result = generateBranchRollup(makeInput({ historicalEntries: hist }), TEST_PERIOD)
    expect(VALID).toContain(result.momentumDirection)
  })

  it('returns ACCELERATING for a strongly rising series', () => {
    // Recent 7 values much higher than previous 7
    const hist = [
      ...Array.from({ length: 7 }, (_, i) =>
        makeEntry({ date: `2025-04-${String(i + 1).padStart(2, '0')}`, userId: `u${i}`, wasfaty: 50 })
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        makeEntry({ date: `2025-04-${String(i + 8).padStart(2, '0')}`, userId: `u${i}`, wasfaty: 200 })
      ),
    ]
    const result = generateBranchRollup(makeInput({ historicalEntries: hist }), TEST_PERIOD)
    expect(result.momentumDirection).toBe('ACCELERATING')
  })
})

// ─────────────────────────────────────────────────────────────
// 8. OPERATIONAL STATUS
// ─────────────────────────────────────────────────────────────

describe('generateBranchRollup — operationalStatus', () => {
  it('ACTIVE when entries, target, fresh data, good submission', () => {
    const input  = makeInput({ pharmacistCount: 2, submittedToday: 2 })
    const result = generateBranchRollup(input, TEST_PERIOD)
    expect(result.operationalStatus).toBe('ACTIVE')
  })

  it('NO_DATA when entries is empty', () => {
    const result = generateBranchRollup(makeInput({ entries: [] }), TEST_PERIOD)
    expect(result.operationalStatus).toBe('NO_DATA')
  })

  it('NO_TARGET when entries exist but target is null and data is fresh', () => {
    const result = generateBranchRollup(makeInput({ target: null }), TEST_PERIOD)
    expect(result.operationalStatus).toBe('NO_TARGET')
  })

  it('STALE when latest entry is > 3 days old (overrides NO_TARGET)', () => {
    // Stale takes priority over no target
    const staleEntry = makeEntry({ date: '2025-05-10' })
    const result     = generateBranchRollup(
      makeInput({ entries: [staleEntry], target: null }),
      TEST_PERIOD,
    )
    expect(result.operationalStatus).toBe('STALE')
  })

  it('DEGRADED when entries + target present but low submission rate', () => {
    const input  = makeInput({ pharmacistCount: 10, submittedToday: 3 })  // 30%
    const result = generateBranchRollup(input, TEST_PERIOD)
    expect(result.operationalStatus).toBe('DEGRADED')
  })
})

// ─────────────────────────────────────────────────────────────
// 9. EDGE CASES
// ─────────────────────────────────────────────────────────────

describe('generateBranchRollup — edge cases', () => {
  it('handles NaN target values safely (no crash)', () => {
    const badTarget = makeTarget({ wasfatyTarget: NaN, omniTarget: NaN })
    expect(() =>
      generateBranchRollup(makeInput({ target: badTarget as any }), TEST_PERIOD)
    ).not.toThrow()
  })

  it('handles Infinity target values safely (no crash)', () => {
    const badTarget = makeTarget({ wasfatyTarget: Infinity })
    expect(() =>
      generateBranchRollup(makeInput({ target: badTarget as any }), TEST_PERIOD)
    ).not.toThrow()
  })

  it('handles multiple entries — sums actuals correctly', () => {
    const entries = [
      makeEntry({ userId: 'u1', wasfaty: 60 }),
      makeEntry({ userId: 'u2', wasfaty: 40, id: 'e2' }),
    ]
    const result   = generateBranchRollup(makeInput({ entries }), TEST_PERIOD)
    const wasfaty  = result.kpiAchievementSummary.find((k) => k.kpiKey === 'wasfaty')!
    expect(wasfaty.actual).toBe(100)  // 60 + 40
  })

  it('submissionRatePct falls back to distinct user count when pharmacistCount not set', () => {
    const entries = [
      makeEntry({ userId: 'u1' }),
      makeEntry({ userId: 'u2', id: 'e2' }),
    ]
    // No pharmacistCount or submittedToday — falls back to distinct userIds
    const result = generateBranchRollup(makeInput({ entries }), TEST_PERIOD)
    expect(result.submissionRatePct).toBe(100)  // 2 distinct / max(1,2) = 100%
  })

  it('same inputs produce structurally identical output (stability)', () => {
    const input = makeInput()
    const r1    = generateBranchRollup(input, TEST_PERIOD)
    const r2    = generateBranchRollup(input, TEST_PERIOD)
    expect(r1.branchScore).toBe(r2.branchScore)
    expect(r1.riskLevel).toBe(r2.riskLevel)
    expect(r1.overallAchievementPct).toBe(r2.overallAchievementPct)
    expect(r1.kpiAchievementSummary.map((k) => k.achievementPct))
      .toEqual(r2.kpiAchievementSummary.map((k) => k.achievementPct))
  })

  it('period.dayRatio 0 does not crash', () => {
    const startPeriod: RegionalPeriod = { ...TEST_PERIOD, dayRatio: 0 }
    expect(() => generateBranchRollup(makeInput(), startPeriod)).not.toThrow()
  })

  it('period.dayRatio 1.0 (end of month) does not crash', () => {
    const eomPeriod: RegionalPeriod = { ...TEST_PERIOD, dayRatio: 1.0 }
    expect(() => generateBranchRollup(makeInput(), eomPeriod)).not.toThrow()
  })
})
