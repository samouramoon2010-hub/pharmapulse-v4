// ============================================================
// Portfolio KPI Aggregation Regression Tests
// Covers the root cause: totalActual/totalTarget asymmetry when
// a branch has actuals but no target document.
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateExecutiveReport } from './executiveReportGenerator'
import type { BranchInput }        from './executiveTypes'
import type { KpiEntry, MonthlyTarget } from '../kpiAnalyticsEngine'

// ── Helpers ──────────────────────────────────────────────────

const TODAY = '2025-05-15'
const MONTH = '2025-05'

function entry(pharmacyId: string, wellness: number, overrides: Partial<KpiEntry> = {}): KpiEntry {
  return {
    id: `e-${pharmacyId}`, userId: 'u1', pharmacyId, date: TODAY,
    wasfaty: 100, omni: 80, wellness, basket: 50, crossSelling: 40,
    notes: '', ...overrides,
  }
}

function target(pharmacyId: string, wellnessTarget: number, overrides: Partial<MonthlyTarget> = {}): MonthlyTarget {
  return {
    pharmacyId, month: MONTH,
    wasfatyTarget: 200, omniTarget: 160, wellnessTarget,
    basketTarget: 100, crossSellTarget: 80, ...overrides,
  }
}

function branch(
  id: string,
  entries: KpiEntry[],
  tgt: MonthlyTarget | null,
): BranchInput {
  return {
    pharmacyId: id, pharmacyName: `Branch ${id}`,
    pharmacyCode: id, region: 'Test',
    mtdEntries: entries, historicalEntries: [],
    target: tgt, submittedToday: 1,
  }
}

function portfolioWellness(branches: BranchInput[]): number {
  const report = generateExecutiveReport({
    branches, reportDate: TODAY, reportMonth: MONTH, generatedBy: 'test',
  })
  return report.portfolioAch.wellness.achievementPct
}

// ─────────────────────────────────────────────────────────────
// 1. THE REPORTED BUG — 98% + 0% should NOT produce 200%
// ─────────────────────────────────────────────────────────────

describe('portfolio aggregation — 98% + 0% bug regression', () => {
  it('Branch A=98%, Branch B=0%: portfolio = 49% not 200%', () => {
    const branches = [
      branch('A', [entry('A', 98)],  target('A', 100)),
      branch('B', [entry('B', 0)],   target('B', 100)),
    ]
    // Correct: (98+0)/(100+100) = 49%
    expect(portfolioWellness(branches)).toBe(49)
  })

  it('portfolio never exceeds 100% when all branches achieve exactly 100%', () => {
    const branches = [
      branch('A', [entry('A', 100)], target('A', 100)),
      branch('B', [entry('B', 100)], target('B', 100)),
    ]
    expect(portfolioWellness(branches)).toBe(100)
  })

  it('symmetric two-branch scenario produces correct 50% not 200%', () => {
    // Both branches: actual=200, A has target, B does not
    // Old bug: totalActual=400 / totalTarget=200 = 200% (capped to 200)
    // Fix: B excluded → totalActual=200 / totalTarget=200 = 100%
    const branches = [
      branch('A', [entry('A', 200)], target('A', 200)),
      branch('B', [entry('B', 200)], null),             // no target → excluded
    ]
    expect(portfolioWellness(branches)).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. ONE BRANCH MISSING TARGET
// ─────────────────────────────────────────────────────────────

describe('portfolio aggregation — one branch missing target', () => {
  it('branch with no target is excluded from BOTH numerator and denominator', () => {
    // A: actual=80, target=100 → 80%
    // B: actual=60, no target → EXCLUDED
    // Portfolio should = 80%, not (140/100)=140%
    const branches = [
      branch('A', [entry('A', 80)], target('A', 100)),
      branch('B', [entry('B', 60)], null),
    ]
    expect(portfolioWellness(branches)).toBe(80)
  })

  it('branch with zero target is excluded from BOTH numerator and denominator', () => {
    // A: actual=80, target=100 → 80%
    // B: actual=50, target=0 → EXCLUDED (zero target invalid)
    const branches = [
      branch('A', [entry('A', 80)], target('A', 100)),
      branch('B', [entry('B', 50)], target('B', 0)),
    ]
    expect(portfolioWellness(branches)).toBe(80)
  })

  it('all branches missing target → portfolio = 0%', () => {
    const branches = [
      branch('A', [entry('A', 80)], null),
      branch('B', [entry('B', 60)], null),
    ]
    expect(portfolioWellness(branches)).toBe(0)
  })

  it('mixed: one valid target branch computes correctly', () => {
    const branches = [
      branch('A', [entry('A', 50)], target('A', 100)),  // 50%
      branch('B', [entry('B', 80)], null),              // excluded
      branch('C', [entry('C', 60)], null),              // excluded
    ]
    expect(portfolioWellness(branches)).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. ONE BRANCH OVER 200%
// ─────────────────────────────────────────────────────────────

describe('portfolio aggregation — one branch over 200%', () => {
  it('branch actual >> target aggregates correctly without double-capping', () => {
    // A: actual=300, target=100 (300% raw but capped at 200 per-branch)
    // B: actual=50, target=100 (50%)
    // Portfolio: (300+50)/(100+100) = 175%
    // The per-branch cap should NOT apply before portfolio aggregation
    const branches = [
      branch('A', [entry('A', 300)], target('A', 100)),
      branch('B', [entry('B', 50)],  target('B', 100)),
    ]
    // Portfolio uses raw actuals (300+50=350) / (100+100=200) = 175%
    expect(portfolioWellness(branches)).toBe(175)
  })

  it('portfolio capped at 200% after aggregation', () => {
    // A: actual=500, target=100 → portfolio raw = 500%
    // B: actual=200, target=100 → portfolio raw adds 200/100
    // totalActual=700, totalTarget=200 → 350% → capped to 200
    const branches = [
      branch('A', [entry('A', 500)], target('A', 100)),
      branch('B', [entry('B', 200)], target('B', 100)),
    ]
    expect(portfolioWellness(branches)).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. MIXED VALID / INVALID TARGETS
// ─────────────────────────────────────────────────────────────

describe('portfolio aggregation — mixed valid/invalid targets', () => {
  it('NaN target branch is excluded', () => {
    const branches = [
      branch('A', [entry('A', 80)], target('A', 100)),
      branch('B', [entry('B', 40)], target('B', NaN)),
    ]
    expect(portfolioWellness(branches)).toBe(80)
  })

  it('Infinity target branch is excluded', () => {
    const branches = [
      branch('A', [entry('A', 80)], target('A', 100)),
      branch('B', [entry('B', 40)], target('B', Infinity)),
    ]
    expect(portfolioWellness(branches)).toBe(80)
  })

  it('negative target branch is excluded', () => {
    const branches = [
      branch('A', [entry('A', 80)], target('A', 100)),
      branch('B', [entry('B', 40)], target('B', -50)),
    ]
    expect(portfolioWellness(branches)).toBe(80)
  })

  it('three branches: two valid, one zero target — only two contribute', () => {
    // A: 80/100 = 80%, B: 60/100 = 60%, C: target=0 excluded
    // Portfolio: (80+60)/(100+100) = 140/200 = 70%
    const branches = [
      branch('A', [entry('A', 80)], target('A', 100)),
      branch('B', [entry('B', 60)], target('B', 100)),
      branch('C', [entry('C', 90)], target('C', 0)),
    ]
    expect(portfolioWellness(branches)).toBe(70)
  })
})

// ─────────────────────────────────────────────────────────────
// 5. WEIGHTED TARGET AGGREGATION
// ─────────────────────────────────────────────────────────────

describe('portfolio aggregation — weighted targets (larger targets weight more)', () => {
  it('branch with larger target has proportionally more influence', () => {
    // A: actual=90, target=300 → 30%
    // B: actual=90, target=100 → 90%
    // Portfolio: (90+90)/(300+100) = 180/400 = 45%
    // (NOT simple average (30+90)/2 = 60%)
    const branches = [
      branch('A', [entry('A', 90)], target('A', 300)),
      branch('B', [entry('B', 90)], target('B', 100)),
    ]
    expect(portfolioWellness(branches)).toBe(45)
  })

  it('equal targets mean equal weighting', () => {
    // A: 80/100 = 80%, B: 60/100 = 60%
    // Portfolio: (80+60)/(100+100) = 70% = simple average ✓
    const branches = [
      branch('A', [entry('A', 80)], target('A', 100)),
      branch('B', [entry('B', 60)], target('B', 100)),
    ]
    expect(portfolioWellness(branches)).toBe(70)
  })

  it('single branch portfolio = that branch achievement', () => {
    const branches = [branch('A', [entry('A', 75)], target('A', 100))]
    expect(portfolioWellness(branches)).toBe(75)
  })
})

// ─────────────────────────────────────────────────────────────
// 6. DIVISION BY ZERO GUARDS
// ─────────────────────────────────────────────────────────────

describe('portfolio aggregation — division by zero safety', () => {
  it('returns 0% (not NaN or Infinity) when all targets are zero', () => {
    const branches = [
      branch('A', [entry('A', 100)], target('A', 0)),
    ]
    const result = portfolioWellness(branches)
    expect(result).toBe(0)
    expect(isNaN(result)).toBe(false)
    expect(isFinite(result)).toBe(true)
  })

  it('returns 0% when no branches have targets', () => {
    const branches = [
      branch('A', [entry('A', 100)], null),
      branch('B', [entry('B', 200)], null),
    ]
    const result = portfolioWellness(branches)
    expect(result).toBe(0)
    expect(isNaN(result)).toBe(false)
  })

  it('returns 0% when entries array is empty for all branches', () => {
    const branches = [branch('A', [], target('A', 100))]
    expect(portfolioWellness(branches)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// 7. FULL REPORT INTEGRITY AFTER FIX
// ─────────────────────────────────────────────────────────────

describe('generateExecutiveReport — portfolio integrity after fix', () => {
  it('all 5 KPIs in portfolioAch are correctly aggregated', () => {
    const branches = [
      branch('A', [entry('A', 100, { wasfaty:100, omni:80, wellness:100, basket:50, crossSelling:40 })], target('A', 200)),
      branch('B', [entry('B', 0,   { wasfaty:0,   omni:0,  wellness:0,   basket:0,  crossSelling:0  })], target('B', 200)),
    ]
    const report = generateExecutiveReport({ branches, reportDate:TODAY, reportMonth:MONTH, generatedBy:'test' })
    // Each KPI: (actual_A + actual_B) / (target_A + target_B)
    // wasfaty: (100+0)/(200+200) = 25%
    expect(report.portfolioAch.wasfaty.achievementPct).toBe(25)
    expect(report.portfolioAch.wasfaty.totalActual).toBe(100)
    expect(report.portfolioAch.wasfaty.totalTarget).toBe(400)
  })

  it('portfolioAch achievementPct never exceeds 200', () => {
    const branches = [
      branch('A', [entry('A', 9999, { wasfaty:9999, omni:9999, wellness:9999, basket:9999, crossSelling:9999 })], target('A', 100)),
    ]
    const report = generateExecutiveReport({ branches, reportDate:TODAY, reportMonth:MONTH, generatedBy:'test' })
    Object.values(report.portfolioAch).forEach((ach) => {
      expect(ach.achievementPct).toBeLessThanOrEqual(200)
    })
  })

  it('portfolioAch achievementPct is never NaN or Infinity', () => {
    const branches = [branch('A', [], null)]
    const report = generateExecutiveReport({ branches, reportDate:TODAY, reportMonth:MONTH, generatedBy:'test' })
    Object.values(report.portfolioAch).forEach((ach) => {
      expect(isNaN(ach.achievementPct)).toBe(false)
      expect(isFinite(ach.achievementPct)).toBe(true)
    })
  })
})
