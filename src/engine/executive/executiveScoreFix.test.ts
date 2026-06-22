// ============================================================
// Executive Score Fix — Regression Tests
// Phase 4C-X-2 Critical Fix
//
// Root cause:
//   computeExecutiveScore() built kpiStatsMap as
//     { achievementPct } — missing target field.
//   computeOverallAchievement() checks !stat.target → excluded all KPIs
//   → overall = 0 always → grade = F regardless of KPI performance.
//
// Fix:
//   { achievementPct, target } — one field added.
//
// These tests prove the fix works and guard against regression.
// ============================================================

import { describe, it, expect } from 'vitest'
import { computeExecutiveScore, scoreToGrade } from './executiveScore'
import { computeOverallAchievement, KPI_KEYS }  from '../kpiAnalyticsEngine'
import {
  runBranchShadowPipeline,
} from './dynamicExecutiveDataPath'
import type { BranchInput, KpiEntry, MonthlyTarget } from './executiveTypes'

// ── Fixtures ──────────────────────────────────────────────────

function makeEntry(userId: string, date: string, vals: Partial<Record<string,number>> = {}): KpiEntry {
  return {
    id: `${userId}_${date}`, userId, pharmacyId: 'ph1', date,
    wasfaty: 15, omni: 8, wellness: 10, basket: 250, crossSelling: 5,
    ...vals,
  } as any
}

function makeTarget(overrides: Partial<MonthlyTarget> = {}): MonthlyTarget {
  return {
    pharmacyId: 'ph1', month: '2025-05',
    wasfatyTarget: 800, omniTarget: 400,
    wellnessTarget: 500, basketTarget: 1200,
    crossSellTarget: 200,
    ...overrides,
  } as any
}

const DAYS = Array.from({ length: 20 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - i)
  return d.toISOString().split('T')[0]
})

function makeBranch(overrides: Partial<BranchInput> = {}): BranchInput {
  const entries = DAYS.map((date) => makeEntry('user1', date))
  return {
    pharmacyId: 'ph1', pharmacyName: 'Main Branch',
    pharmacyCode: 'PH1', region: 'Region A',
    mtdEntries: entries,
    historicalEntries: entries,
    target: makeTarget(),
    pharmacistCount: 2,
    submittedToday: 2,
    ...overrides,
  }
}

// ── full-target branch: 300/800 wasfaty = 37.5%, etc. ─────────
const ACTIVE_BRANCH     = makeBranch()

// ── branch hitting 100% on all KPIs ──────────────────────────
const DAYS_40 = Array.from({ length: 40 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - i)
  return d.toISOString().split('T')[0]
})
const HIGH_BRANCH = makeBranch({
  mtdEntries: DAYS_40.map((date) =>
    makeEntry('u1', date, { wasfaty: 20, omni: 10, wellness: 12, basket: 30, crossSelling: 5 })
  ),
  target: makeTarget({ wasfatyTarget: 400, omniTarget: 200, wellnessTarget: 240, basketTarget: 600, crossSellTarget: 100 }),
})

// ══════════════════════════════════════════════════════════════
// 1 — Core fix: overall is no longer always 0
// ══════════════════════════════════════════════════════════════

describe('executiveScore fix — overall no longer always 0', () => {
  it('overall > 0 for a branch with valid actuals and targets', () => {
    const score = computeExecutiveScore(ACTIVE_BRANCH)
    expect(score.overall).toBeGreaterThan(0)
  })

  it('overall is a meaningful KPI-based percentage (not just adjustments)', () => {
    const score = computeExecutiveScore(ACTIVE_BRANCH)
    // With 300/800 wasfaty etc., overall should be around 30-50%
    expect(score.overall).toBeGreaterThanOrEqual(10)
    expect(score.overall).toBeLessThanOrEqual(100)
  })

  it('overall branch with high achievement scores well above 0', () => {
    const score = computeExecutiveScore(HIGH_BRANCH)
    expect(score.overall).toBeGreaterThan(50)
  })

  it('overall = 0 only when all targets are 0 or missing', () => {
    const noTarget = makeBranch({ target: null })
    expect(computeExecutiveScore(noTarget).overall).toBe(0)
  })

  it('overall = 0 only when branch has no entries', () => {
    const empty = makeBranch({ mtdEntries: [] })
    expect(computeExecutiveScore(empty).overall).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — adjusted includes KPI achievement + adjustments
// ══════════════════════════════════════════════════════════════

describe('executiveScore fix — adjusted reflects KPI performance', () => {
  it('adjusted is higher than adjustments alone (confirms KPI contribution)', () => {
    const score = computeExecutiveScore(ACTIVE_BRANCH)
    // Before fix: adjusted max = 0 + 5 + 5 + 5 = 10
    // After fix: adjusted includes overall (KPI achievement) + adjustments
    expect(score.adjusted).toBeGreaterThan(10)
  })

  it('adjusted = clamp(0, 100, overall + adjustments)', () => {
    const score = computeExecutiveScore(ACTIVE_BRANCH)
    const expected = Math.min(100, Math.max(0,
      score.overall + score.adjustments.submissionRate +
      score.adjustments.consistency + score.adjustments.trend
    ))
    expect(score.adjusted).toBe(expected)
  })

  it('high-performing branch gets adjusted significantly > 10', () => {
    const score = computeExecutiveScore(HIGH_BRANCH)
    expect(score.adjusted).toBeGreaterThan(50)
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — Grade reflects KPI performance
// ══════════════════════════════════════════════════════════════

describe('executiveScore fix — grade reflects KPI performance', () => {
  it('high-performing branch no longer gets Grade F', () => {
    const score = computeExecutiveScore(HIGH_BRANCH)
    expect(score.grade).not.toBe('F')
  })

  it('grade is derived from adjusted (KPI achievement + adjustments)', () => {
    const score = computeExecutiveScore(HIGH_BRANCH)
    expect(score.grade).toBe(scoreToGrade(score.adjusted))
  })

  it('zero-target branch still gets F (no data = no achievement)', () => {
    const score = computeExecutiveScore(makeBranch({ target: null }))
    expect(score.grade).toBe('F')
  })

  it('kpiBreakdown achievementPct values are positive (unaffected by fix)', () => {
    const score = computeExecutiveScore(ACTIVE_BRANCH)
    // kpiBreakdown.achievementPct comes from computeKpiStats which applies
    // getDayProgress() scaling — not a raw actual/target ratio.
    // Just verify the field is present and non-negative.
    const wasfatyBreakdown = score.kpiBreakdown.find((k) => k.kpiKey === 'wasfaty')
    expect(wasfatyBreakdown).toBeDefined()
    expect(wasfatyBreakdown!.achievementPct).toBeGreaterThanOrEqual(0)
    expect(wasfatyBreakdown!.actual).toBeGreaterThan(0)
    expect(wasfatyBreakdown!.target).toBe(800)
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — computeOverallAchievement receives target correctly
// ══════════════════════════════════════════════════════════════

describe('executiveScore fix — target field passes guard in computeOverallAchievement', () => {
  it('manually: statsMap without target → overall = 0', () => {
    const noTargetMap: any = {
      wasfaty: { achievementPct: 80 },
      omni:    { achievementPct: 90 },
      wellness: { achievementPct: 85 },
      basket:  { achievementPct: 75 },
      crossSelling: { achievementPct: 70 },
    }
    expect(computeOverallAchievement(noTargetMap)).toBe(0)   // confirms the bug
  })

  it('manually: statsMap WITH target → overall > 0', () => {
    const withTargetMap: any = {
      wasfaty: { achievementPct: 80, target: 800 },
      omni:    { achievementPct: 90, target: 400 },
      wellness: { achievementPct: 85, target: 500 },
      basket:  { achievementPct: 75, target: 1200 },
      crossSelling: { achievementPct: 70, target: 200 },
    }
    expect(computeOverallAchievement(withTargetMap)).toBeGreaterThan(0)   // fix works
  })

  it('computeExecutiveScore now passes target through to computeOverallAchievement', () => {
    // If target is now in kpiStatsMap, overall must equal a sensible weighted result
    const score = computeExecutiveScore(ACTIVE_BRANCH)
    const manualMap: any = {}
    for (const k of score.kpiBreakdown) {
      manualMap[k.kpiKey] = { achievementPct: k.achievementPct, target: k.target }
    }
    const expected = computeOverallAchievement(manualMap)
    expect(score.overall).toBe(expected)
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — Shadow parity: legacy now matches dynamic for valid data
// ══════════════════════════════════════════════════════════════

describe('executiveScore fix — shadow parity improves', () => {
  it('legacy overall > 0 after fix (was always 0 before)', () => {
    const pipeline = runBranchShadowPipeline(ACTIVE_BRANCH)
    expect(pipeline.legacyResult.overall).toBeGreaterThan(0)
  })

  it('legacy and dynamic overall are now in the same ballpark', () => {
    const pipeline = runBranchShadowPipeline(ACTIVE_BRANCH)
    // Both should compute from the same actuals/targets — delta should be small
    expect(Math.abs(pipeline.shadowReport.delta)).toBeLessThanOrEqual(1)
  })

  it('shadow report match=true for valid data after fix', () => {
    const pipeline = runBranchShadowPipeline(ACTIVE_BRANCH)
    expect(pipeline.shadowReport.match).toBe(true)
  })

  it('shadow report match=true for high-performing branch', () => {
    const pipeline = runBranchShadowPipeline(HIGH_BRANCH)
    expect(pipeline.shadowReport.match).toBe(true)
  })

  it('shadow report match=true for null-target branch', () => {
    const noTarget = makeBranch({ target: null })
    const pipeline = runBranchShadowPipeline(noTarget)
    expect(pipeline.shadowReport.match).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — branchRollupEngine branchScore reflects the fix
// ══════════════════════════════════════════════════════════════

describe('executiveScore fix — source guard: target now in kpiStatsMap', () => {
  it('executiveScore.ts includes target in kpiStatsMap', () => {
    const { readFileSync } = require('fs')
    const { resolve }      = require('path')
    const src = readFileSync(resolve(__dirname, './executiveScore.ts'), 'utf8')
    expect(src).toContain('target: k.target')
  })

  it('executiveScore.ts kpiStatsMap type includes target field', () => {
    const { readFileSync } = require('fs')
    const { resolve }      = require('path')
    const src = readFileSync(resolve(__dirname, './executiveScore.ts'), 'utf8')
    expect(src).toContain('achievementPct: number; target: number')
  })

  it('adjusted score is capped at 100', () => {
    const score = computeExecutiveScore(HIGH_BRANCH)
    expect(score.adjusted).toBeLessThanOrEqual(100)
  })

  it('adjusted score is not negative', () => {
    const score = computeExecutiveScore(makeBranch({ submittedToday: 0, pharmacistCount: 10 }))
    expect(score.adjusted).toBeGreaterThanOrEqual(0)
  })
})
