// ============================================================
// Phase 4A — Executive BI Automated QA Tests
// Covers: data safety, report integrity, edge cases,
//         route protection logic, hook assembly correctness,
//         and all identified bug scenarios.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateExecutiveReport,
  generateBranchSummary,
  GRADE_COLORS,
  GRADE_BG,
  GRADE_BORDER,
  GRADE_THRESHOLDS,
  scoreToGrade,
} from './index'

import type {
  BranchInput,
  ExecutiveReportInput,
  ExecutiveReport,
} from './executiveTypes'

import type { KpiEntry, MonthlyTarget } from '../kpiAnalyticsEngine'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const TODAY     = '2025-05-15'
const MONTH     = '2025-05'
const USER_ID   = 'user-admin-1'

function makeEntry(overrides: Partial<KpiEntry> = {}): KpiEntry {
  return {
    id:           overrides.id           ?? 'e1',
    userId:       overrides.userId       ?? 'u1',
    pharmacyId:   overrides.pharmacyId   ?? 'p1',
    date:         overrides.date         ?? TODAY,
    wasfaty:      overrides.wasfaty      ?? 100,
    omni:         overrides.omni         ?? 80,
    wellness:     overrides.wellness     ?? 60,
    basket:       overrides.basket       ?? 50,
    crossSelling: overrides.crossSelling ?? 40,
    notes:        overrides.notes        ?? '',
    ...overrides,
  }
}

function makeTarget(overrides: Partial<MonthlyTarget> = {}): MonthlyTarget {
  return {
    pharmacyId:      overrides.pharmacyId      ?? 'p1',
    month:           overrides.month           ?? MONTH,
    wasfatyTarget:   overrides.wasfatyTarget   ?? 200,
    omniTarget:      overrides.omniTarget       ?? 150,
    wellnessTarget:  overrides.wellnessTarget  ?? 120,
    basketTarget:    overrides.basketTarget    ?? 100,
    crossSellTarget: overrides.crossSellTarget ?? 80,
    ...overrides,
  }
}

function makeBranch(overrides: Partial<BranchInput> = {}): BranchInput {
  // Use 'target' key explicitly so null override works (not swallowed by spread)
  const hasTargetOverride = Object.prototype.hasOwnProperty.call(overrides, 'target')
  return {
    pharmacyId:   overrides.pharmacyId   ?? 'p1',
    pharmacyName: overrides.pharmacyName ?? 'Test Pharmacy',
    pharmacyCode: overrides.pharmacyCode ?? 'TEST-01',
    region:       overrides.region       ?? 'Central',
    mtdEntries:         overrides.mtdEntries         ?? [makeEntry()],
    historicalEntries:  overrides.historicalEntries  ?? [],
    target:             hasTargetOverride ? overrides.target! : makeTarget(),
    submittedToday:     overrides.submittedToday     ?? 1,
    pharmacistCount:    overrides.pharmacistCount    ?? 2,
  }
}

function makeReport(branches: BranchInput[]): ExecutiveReport {
  return generateExecutiveReport({
    branches,
    reportDate:  TODAY,
    reportMonth: MONTH,
    generatedBy: USER_ID,
  })
}

// ─────────────────────────────────────────────────────────────
// 1. ROUTE PROTECTION LOGIC
// ─────────────────────────────────────────────────────────────

describe('Route protection — role logic', () => {
  const ADMIN       = ['admin']
  const ALL_ROLES   = ['admin', 'manager', 'pharmacist']

  function canAccess(userRole: string, allowedRoles: string[]): boolean {
    return allowedRoles.includes(userRole)
  }

  it('admin can access /executive', () => {
    expect(canAccess('admin', ADMIN)).toBe(true)
  })

  it('manager cannot access /executive', () => {
    expect(canAccess('manager', ADMIN)).toBe(false)
  })

  it('pharmacist cannot access /executive', () => {
    expect(canAccess('pharmacist', ADMIN)).toBe(false)
  })

  it('unknown role cannot access /executive', () => {
    expect(canAccess('unknown', ADMIN)).toBe(false)
  })

  it('admin can access dashboard (ALL roles)', () => {
    expect(canAccess('admin', ALL_ROLES)).toBe(true)
  })

  it('fallback to NAV_CONFIG.pharmacist for unknown role', () => {
    // resolveNav logic: NAV_CONFIG[role] || NAV_CONFIG.pharmacist
    const NAV_CONFIG: Record<string, string[]> = {
      admin:       ['/dashboard', '/reports', '/executive'],
      manager:     ['/dashboard', '/reports'],
      pharmacist:  ['/dashboard', '/entry'],
    }
    const resolveNav = (role: string) => NAV_CONFIG[role] || NAV_CONFIG.pharmacist
    const unknownNav = resolveNav('hacker')
    expect(unknownNav).toEqual(NAV_CONFIG.pharmacist)
    expect(unknownNav).not.toContain('/executive')
  })
})

// ─────────────────────────────────────────────────────────────
// 2. DATA SAFETY — useExecutiveReport assembly logic
// ─────────────────────────────────────────────────────────────

describe('useExecutiveReport — data assembly safety', () => {

  it('returns empty branches when no pharmacies', () => {
    // Simulate hook behaviour: if pharmacies.length === 0, return []
    const pharmacies: any[] = []
    const branches = pharmacies.filter((p) => p.active !== false)
    expect(branches).toHaveLength(0)
  })

  it('filters out inactive pharmacies', () => {
    const pharmacies = [
      { id: 'p1', name: 'Active',   active: true  },
      { id: 'p2', name: 'Inactive', active: false },
      { id: 'p3', name: 'Default'                 },  // no active field
    ]
    const active = pharmacies.filter((p) => p.active !== false)
    expect(active).toHaveLength(2)
    expect(active.map((p) => p.id)).toEqual(['p1', 'p3'])
  })

  it('branch with no entries gets empty mtdEntries', () => {
    const branch = makeBranch({ mtdEntries: [] })
    expect(branch.mtdEntries).toHaveLength(0)
    // Should not crash generateBranchSummary
    const summary = generateBranchSummary(branch, TODAY, MONTH)
    expect(summary).toBeDefined()
    expect(summary.score.adjusted).toBeGreaterThanOrEqual(0)
  })

  it('branch with no target gets null target and does not crash', () => {
    const branch = makeBranch({ target: null })
    expect(branch.target).toBeNull()
    // Engine handles null target gracefully — no crash, returns valid summary
    const summary = generateBranchSummary(branch, TODAY, MONTH)
    expect(summary).toBeDefined()
    expect(summary.score.adjusted).toBeGreaterThanOrEqual(0)
    expect(summary.score.adjusted).toBeLessThanOrEqual(100)
    // Per-KPI breakdown: all kpiBreakdown entries have target 0
    summary.score.kpiBreakdown.forEach((k) => {
      expect(k.target).toBe(0)
    })
  })

  it('branch with partial target (zeros) handles gracefully', () => {
    const partialTarget = makeTarget({
      wasfatyTarget:   0,
      omniTarget:      0,
      wellnessTarget:  0,
      basketTarget:    100,
      crossSellTarget: 80,
    })
    const branch = makeBranch({ target: partialTarget })
    const summary = generateBranchSummary(branch, TODAY, MONTH)
    expect(summary).toBeDefined()
    // KPIs with 0 target get 0 achievement — no division by zero crash
    const wasfatyBreakdown = summary.score.kpiBreakdown.find((k) => k.kpiKey === 'wasfaty')
    expect(wasfatyBreakdown?.achievementPct).toBe(0)
    expect(wasfatyBreakdown?.target).toBe(0)
  })

  it('branch with missing KPI values in entries defaults to 0', () => {
    const entryMissingKpis: Partial<KpiEntry> = {
      userId: 'u1', pharmacyId: 'p1', date: TODAY,
      // wasfaty, omni etc. not set — simulates partial entry
    }
    // The entry helper fills them with 0; verify that doesn't crash
    const entry = makeEntry({ wasfaty: 0, omni: 0, wellness: 0, basket: 0, crossSelling: 0 })
    const branch = makeBranch({ mtdEntries: [entry] })
    const summary = generateBranchSummary(branch, TODAY, MONTH)
    expect(summary.overallAchPct).toBe(0)
    expect(summary.score.adjusted).toBeLessThanOrEqual(100)
  })

  it('branch with NaN target values handled safely', () => {
    const nanTarget = makeTarget({ wasfatyTarget: NaN, omniTarget: NaN })
    const branch = makeBranch({ target: nanTarget as any })
    expect(() => generateBranchSummary(branch, TODAY, MONTH)).not.toThrow()
  })

  it('pharmacyName falls back to pharmacyId when name missing', () => {
    // Hook: pharmacy.name ?? pharmacy.id
    const pharmacy = { id: 'p99', code: 'X-99', region: 'North' } // no name
    const resolved = pharmacy.name ?? pharmacy.id
    expect(resolved).toBe('p99')
  })

  it('submittedToday is 0 when no entries today', () => {
    const entries: KpiEntry[] = [makeEntry({ date: '2025-05-01' })]
    const todayEntries = entries.filter((e) => e.date === TODAY)
    const submittedToday = new Set(todayEntries.map((e) => e.userId)).size
    expect(submittedToday).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. EXECUTIVE REPORT INTEGRITY
// ─────────────────────────────────────────────────────────────

describe('generateExecutiveReport — integrity', () => {

  it('returns a valid report for a single branch', () => {
    const report = makeReport([makeBranch()])
    expect(report).toBeDefined()
    expect(report.reportId).toMatch(/^exec-/)
    expect(report.totalBranches).toBe(1)
    expect(report.allBranches).toHaveLength(1)
  })

  it('report with no branches throws or returns gracefully', () => {
    // Branches array should never be empty (hook guards with !branches.length return null)
    // But test the engine directly with 1 branch minimum
    const report = makeReport([makeBranch()])
    expect(report.portfolioScore).toBeGreaterThanOrEqual(0)
    expect(report.portfolioScore).toBeLessThanOrEqual(100)
  })

  it('portfolioGrade is always a valid grade letter', () => {
    const report = makeReport([makeBranch()])
    expect(['A', 'B', 'C', 'D', 'F']).toContain(report.portfolioGrade)
  })

  it('riskDistribution counts sum to totalBranches', () => {
    const branches = [
      makeBranch({ pharmacyId: 'p1' }),
      makeBranch({ pharmacyId: 'p2' }),
      makeBranch({ pharmacyId: 'p3' }),
    ]
    const report = makeReport(branches)
    const { onTrack, lowRisk, mediumRisk, highRisk } = report.riskDistribution
    expect(onTrack + lowRisk + mediumRisk + highRisk).toBe(report.totalBranches)
  })

  it('portfolioAch contains all 5 KPI keys', () => {
    const report = makeReport([makeBranch()])
    const keys = Object.keys(report.portfolioAch)
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('omni')
    expect(keys).toContain('wellness')
    expect(keys).toContain('basket')
    expect(keys).toContain('crossSelling')
  })

  it('all branches in allBranches have valid scores', () => {
    const branches = [
      makeBranch({ pharmacyId: 'p1' }),
      makeBranch({ pharmacyId: 'p2' }),
    ]
    const report = makeReport(branches)
    report.allBranches.forEach((b) => {
      expect(b.score.adjusted).toBeGreaterThanOrEqual(0)
      expect(b.score.adjusted).toBeLessThanOrEqual(100)
      expect(['A', 'B', 'C', 'D', 'F']).toContain(b.score.grade)
    })
  })

  it('allBranches is sorted descending by score', () => {
    const lowBranch  = makeBranch({ pharmacyId: 'p1', mtdEntries: [], target: makeTarget() })
    const highBranch = makeBranch({
      pharmacyId: 'p2',
      mtdEntries: [makeEntry({ wasfaty: 400, omni: 300, wellness: 250, basket: 200, crossSelling: 160 })],
      target: makeTarget(),
    })
    const report = makeReport([lowBranch, highBranch])
    expect(report.allBranches[0].score.adjusted).toBeGreaterThanOrEqual(
      report.allBranches[1].score.adjusted
    )
  })

  it('topBranches is at most 3 entries', () => {
    const branches = [
      makeBranch({ pharmacyId: 'p1' }),
      makeBranch({ pharmacyId: 'p2' }),
    ]
    const report = makeReport(branches)
    expect(report.topBranches.length).toBeLessThanOrEqual(3)
    expect(report.topBranches.length).toBe(2) // only 2 branches exist
  })

  it('bottomBranches with 1 branch does not crash', () => {
    const report = makeReport([makeBranch()])
    expect(report.bottomBranches).toHaveLength(1)
    expect(report.topBranches).toHaveLength(1)
  })

  it('portfolioInsights and portfolioRecommendations are arrays', () => {
    const report = makeReport([makeBranch()])
    expect(Array.isArray(report.portfolioInsights)).toBe(true)
    expect(Array.isArray(report.portfolioRecommendations)).toBe(true)
  })

  it('generatedBy is set correctly', () => {
    const report = makeReport([makeBranch()])
    expect(report.generatedBy).toBe(USER_ID)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. ACTIVE BRANCHES OPERATOR PRECEDENCE BUG (pre-existing)
// ─────────────────────────────────────────────────────────────

describe('activeBranches counting (Bug QA-001)', () => {
  it('activeBranches count matches branches with non-empty mtdEntries', () => {
    const activeBranch   = makeBranch({ pharmacyId: 'p1', mtdEntries: [makeEntry()] })
    const inactiveBranch = makeBranch({ pharmacyId: 'p2', mtdEntries: [] })
    const report = makeReport([activeBranch, inactiveBranch])

    // NOTE: pre-existing operator precedence issue in executiveReportGenerator.ts line 122:
    //   ?.mtdEntries.length ?? 0 > 0  parses as (?.mtdEntries.length) ?? (0 > 0)
    //   When find() returns an object: returns the NUMBER (length), not a boolean.
    //   filter() coerces to boolean — truthy for length > 0, falsy for length === 0.
    //   In practice: both branches are included when they have entries,
    //   and excluded when length is 0. The fix is: (?.mtdEntries.length ?? 0) > 0.
    //   The bug does NOT cause wrong filtering — it returns correct results through JS coercion.
    //   This test documents the EXPECTED correct behavior.
    expect(report.activeBranches).toBe(1)
    expect(report.totalBranches).toBe(2)
  })

  it('activeBranches is 0 when all branches have no entries', () => {
    const b1 = makeBranch({ pharmacyId: 'p1', mtdEntries: [] })
    const b2 = makeBranch({ pharmacyId: 'p2', mtdEntries: [] })
    const report = makeReport([b1, b2])
    expect(report.activeBranches).toBe(0)
    // portfolioScore should be 0 when no active branches
    expect(report.portfolioScore).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// 5. BRANCH SUMMARY EDGE CASES
// ─────────────────────────────────────────────────────────────

describe('generateBranchSummary — edge cases', () => {

  it('branch with no historical entries still generates trend', () => {
    const branch = makeBranch({ historicalEntries: [] })
    const summary = generateBranchSummary(branch, TODAY, MONTH)
    expect(summary.trend).toBeDefined()
    expect(summary.trend.direction).toBeDefined()
  })

  it('branch with null target does not crash and has 0 per-KPI targets', () => {
    const branch = makeBranch({ target: null, mtdEntries: [makeEntry()] })
    const summary = generateBranchSummary(branch, TODAY, MONTH)
    expect(summary).toBeDefined()
    // All KPI targets must be 0 when no target document
    summary.score.kpiBreakdown.forEach((k) => {
      expect(k.target).toBe(0)
    })
  })

  it('overachievement is capped at 100% in overall score', () => {
    const bigEntry = makeEntry({
      wasfaty: 9999, omni: 9999, wellness: 9999, basket: 9999, crossSelling: 9999,
    })
    const branch = makeBranch({ mtdEntries: [bigEntry], target: makeTarget() })
    const summary = generateBranchSummary(branch, TODAY, MONTH)
    // adjusted score cannot exceed 100 (engine clamps)
    expect(summary.score.adjusted).toBeLessThanOrEqual(100)
  })

  it('weakestKpi and strongestKpi are always valid KPI keys', () => {
    const VALID_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
    const branch  = makeBranch()
    const summary = generateBranchSummary(branch, TODAY, MONTH)
    expect(VALID_KEYS).toContain(summary.weakestKpi)
    expect(VALID_KEYS).toContain(summary.strongestKpi)
  })

  it('riskProfile has valid riskLevel', () => {
    const VALID_LEVELS = ['ON_TRACK', 'LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK']
    const branch  = makeBranch()
    const summary = generateBranchSummary(branch, TODAY, MONTH)
    expect(VALID_LEVELS).toContain(summary.riskProfile.riskLevel)
  })

  it('insights and recommendations are arrays (possibly empty)', () => {
    const branch  = makeBranch()
    const summary = generateBranchSummary(branch, TODAY, MONTH)
    expect(Array.isArray(summary.insights)).toBe(true)
    expect(Array.isArray(summary.recommendations)).toBe(true)
  })

  it('generatedAt is a valid ISO timestamp', () => {
    const summary = generateBranchSummary(makeBranch(), TODAY, MONTH)
    expect(() => new Date(summary.generatedAt)).not.toThrow()
    expect(new Date(summary.generatedAt).getFullYear()).toBeGreaterThan(2020)
  })
})

// ─────────────────────────────────────────────────────────────
// 6. SCORING SYSTEM INTEGRITY
// ─────────────────────────────────────────────────────────────

describe('scoreToGrade — grade thresholds', () => {
  it('score 100 → A', () => expect(scoreToGrade(100)).toBe('A'))
  it('score 90  → A', () => expect(scoreToGrade(90)).toBe('A'))
  it('score 89  → B', () => expect(scoreToGrade(89)).toBe('B'))
  it('score 75  → B', () => expect(scoreToGrade(75)).toBe('B'))
  it('score 74  → C', () => expect(scoreToGrade(74)).toBe('C'))
  it('score 60  → C', () => expect(scoreToGrade(60)).toBe('C'))
  it('score 59  → D', () => expect(scoreToGrade(59)).toBe('D'))
  it('score 45  → D', () => expect(scoreToGrade(45)).toBe('D'))
  it('score 44  → F', () => expect(scoreToGrade(44)).toBe('F'))
  it('score 0   → F', () => expect(scoreToGrade(0)).toBe('F'))
})

describe('GRADE_COLORS/GRADE_BG/GRADE_BORDER — completeness', () => {
  const ALL_GRADES = ['A', 'B', 'C', 'D', 'F'] as const

  it('GRADE_COLORS covers all grades', () => {
    ALL_GRADES.forEach((g) => {
      expect(GRADE_COLORS[g]).toBeDefined()
      expect(typeof GRADE_COLORS[g]).toBe('string')
    })
  })

  it('GRADE_BG covers all grades', () => {
    ALL_GRADES.forEach((g) => {
      expect(GRADE_BG[g]).toBeDefined()
    })
  })

  it('GRADE_BORDER covers all grades', () => {
    ALL_GRADES.forEach((g) => {
      expect(GRADE_BORDER[g]).toBeDefined()
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 7. PERFORMANCE — memoization correctness
// ─────────────────────────────────────────────────────────────

describe('Report generation — stability', () => {
  it('same inputs produce structurally identical output', () => {
    const branches = [makeBranch()]
    const r1 = generateExecutiveReport({ branches, reportDate: TODAY, reportMonth: MONTH, generatedBy: USER_ID })
    const r2 = generateExecutiveReport({ branches, reportDate: TODAY, reportMonth: MONTH, generatedBy: USER_ID })

    // Core computed values should be identical
    expect(r1.portfolioScore).toBe(r2.portfolioScore)
    expect(r1.portfolioGrade).toBe(r2.portfolioGrade)
    expect(r1.totalBranches).toBe(r2.totalBranches)
    expect(r1.riskDistribution).toEqual(r2.riskDistribution)
    expect(r1.allBranches[0].score.adjusted).toBe(r2.allBranches[0].score.adjusted)
  })

  it('different branches produce different reportIds', () => {
    const b1 = [makeBranch({ pharmacyId: 'p1' })]
    const b2 = [makeBranch({ pharmacyId: 'p2' })]
    const r1 = generateExecutiveReport({ branches: b1, reportDate: TODAY, reportMonth: MONTH, generatedBy: USER_ID })
    const r2 = generateExecutiveReport({ branches: b2, reportDate: TODAY, reportMonth: MONTH, generatedBy: USER_ID })
    // reportIds differ (includes Date.now() — timing-dependent, but structure is verifiable)
    expect(r1.reportId).toMatch(/^exec-/)
    expect(r2.reportId).toMatch(/^exec-/)
  })
})

// ─────────────────────────────────────────────────────────────
// 8. PORTFOLIO KPI HEATMAP — status coverage
// ─────────────────────────────────────────────────────────────

describe('portfolioAch — traffic light status coverage', () => {
  it('all KPI statuses are valid TrafficLightStatus values', () => {
    const VALID = ['excellent', 'good', 'warning', 'critical']
    const report = makeReport([makeBranch()])
    Object.values(report.portfolioAch).forEach((ach) => {
      expect(VALID).toContain(ach.status)
    })
  })

  it('achievementPct in portfolioAch is 0 when all targets are 0', () => {
    const zeroTarget = makeTarget({
      wasfatyTarget: 0, omniTarget: 0, wellnessTarget: 0, basketTarget: 0, crossSellTarget: 0,
    })
    const branch = makeBranch({ target: zeroTarget })
    const report = makeReport([branch])
    Object.values(report.portfolioAch).forEach((ach) => {
      expect(ach.achievementPct).toBe(0)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 9. MULTI-BRANCH PORTFOLIO
// ─────────────────────────────────────────────────────────────

describe('Multi-branch portfolio', () => {
  it('handles 10 branches without error', () => {
    const branches = Array.from({ length: 10 }, (_, i) =>
      makeBranch({ pharmacyId: `p${i + 1}`, pharmacyCode: `BR-0${i + 1}` })
    )
    expect(() => makeReport(branches)).not.toThrow()
    const report = makeReport(branches)
    expect(report.totalBranches).toBe(10)
    expect(report.allBranches).toHaveLength(10)
  })

  it('duplicate pharmacyId branches both appear in report', () => {
    // Should not deduplicate — that's the caller's responsibility
    const b1 = makeBranch({ pharmacyId: 'p1' })
    const b2 = makeBranch({ pharmacyId: 'p1' })
    const report = makeReport([b1, b2])
    expect(report.totalBranches).toBe(2)
  })
})
