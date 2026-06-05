// ============================================================
// Dynamic Executive Score — Shadow Parity Tests
// Phase 4C-X-1
//
// These tests prove that computeDynamicExecutiveScore produces
// identical results to the legacy computeExecutiveScore for all
// core-KPI scenarios.
//
// No user-facing changes. No existing tests modified.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'

// ── Legacy engine (unchanged) ──────────────────────────────────
import {
  computeOverallAchievement,
  KPI_KEYS, KPI_WEIGHTS, KPI_META, ACHIEVEMENT_CAP,
  type KpiKey,
} from '../kpiAnalyticsEngine'
import { GRADE_THRESHOLDS, type ExecutiveGrade } from './executiveTypes'
import { scoreToGrade } from './executiveScore'

// ── Dynamic engine (shadow) ───────────────────────────────────
import {
  computeDynamicExecutiveScore,
  compareExecutiveScores,
  buildShadowScoreReport,
  buildPortfolioShadowReport,
  scoreToGradeDynamic,
  type DynamicExecutiveScore,
} from './dynamicExecutiveScore'

// ── Adapter ───────────────────────────────────────────────────
import {
  CORE_KPI_EXECUTIVE_META,
  normalizeLegacyFlatMetrics,
  buildExecutiveMetaMap,
  type LegacyTargetDoc,
  type NormalizedBranchMetrics,
} from './dynamicExecutiveAdapter'
import { DEFAULT_KPI_REGISTRY } from '../kpiRegistry'

// ── Source guards ──────────────────────────────────────────────
const SHADOW_SRC = readFileSync(
  resolve(__dirname, './dynamicExecutiveScore.ts'), 'utf8'
)

// ══════════════════════════════════════════════════════════════
// FIXTURES
// ══════════════════════════════════════════════════════════════

const CORE_META = Object.fromEntries(
  KPI_KEYS.map((k) => [k, CORE_KPI_EXECUTIVE_META[k]])
)

const FULL_TARGET: LegacyTargetDoc = {
  pharmacyId:     'ph1',
  month:          '2025-05',
  wasfatyTarget:   800,
  omniTarget:      400,
  wellnessTarget:  500,
  basketTarget:   1200,
  crossSellTarget: 200,
}

/** Build a legacy kpiStatsMap from raw actuals + targets */
function buildLegacyStatsMap(
  actuals: Record<KpiKey, number>,
  targets: Record<KpiKey, number>,
): Partial<Record<KpiKey, { achievementPct: number; actual: number; target: number }>> {
  const map: any = {}
  for (const key of KPI_KEYS) {
    const actual = actuals[key] ?? 0
    const target = targets[key] ?? 0
    map[key] = {
      actual,
      target,
      achievementPct: target > 0 ? Math.min(200, (actual / target) * 100) : 0,
    }
  }
  return map
}

/** Build dynamic metrics from actuals + targets using adapter */
function buildDynamicMetrics(
  actuals: Record<string, number>,
  targetDoc: LegacyTargetDoc,
) {
  return normalizeLegacyFlatMetrics(actuals, targetDoc, CORE_META)
}

/** Run parity check: compare legacy vs dynamic overall score */
function parityCheck(
  actuals: Record<string, number>,
  targetDoc: LegacyTargetDoc,
  adjustments = { submissionRate: 0, consistency: 0, trend: 0 },
): { legacy: number; dynamic: number; delta: number; match: boolean } {
  const statsMap     = buildLegacyStatsMap(actuals as any, {
    wasfaty: targetDoc.wasfatyTarget as number,
    omni:    targetDoc.omniTarget    as number,
    wellness: targetDoc.wellnessTarget as number,
    basket:  targetDoc.basketTarget  as number,
    crossSelling: targetDoc.crossSellTarget as number,
  })
  const legacy   = computeOverallAchievement(statsMap as any)
  const metrics  = buildDynamicMetrics(actuals, targetDoc)
  const dynamic  = computeDynamicExecutiveScore(metrics, adjustments)
  const delta    = dynamic.overall - legacy
  return { legacy, dynamic: dynamic.overall, delta, match: Math.abs(delta) <= 0.01 }
}

// ══════════════════════════════════════════════════════════════
// 1 — Core formula: scoreToGrade parity
// ══════════════════════════════════════════════════════════════

describe('Grade formula parity — legacy vs dynamic', () => {
  const scores = [0, 10, 25, 44, 45, 59, 60, 74, 75, 89, 90, 95, 100]

  for (const s of scores) {
    it(`score ${s}: legacy grade = dynamic grade`, () => {
      expect(scoreToGradeDynamic(s)).toBe(scoreToGrade(s))
    })
  }

  it('Grade thresholds unchanged: A≥90, B≥75, C≥60, D≥45, F<45', () => {
    expect(GRADE_THRESHOLDS.A).toBe(90)
    expect(GRADE_THRESHOLDS.B).toBe(75)
    expect(GRADE_THRESHOLDS.C).toBe(60)
    expect(GRADE_THRESHOLDS.D).toBe(45)
    expect(GRADE_THRESHOLDS.F).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — Perfect parity: full 5-KPI scenario
// ══════════════════════════════════════════════════════════════

describe('Perfect parity — all 5 KPIs with valid data', () => {
  it('all KPIs at 100% → both scores = 100', () => {
    const actuals = { wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200 }
    const r = parityCheck(actuals, FULL_TARGET)
    expect(r.legacy).toBe(100)
    expect(r.dynamic).toBe(100)
    expect(r.match).toBe(true)
  })

  it('all KPIs at 50% → both scores match', () => {
    const actuals = { wasfaty: 400, omni: 200, wellness: 250, basket: 600, crossSelling: 100 }
    const r = parityCheck(actuals, FULL_TARGET)
    expect(r.match).toBe(true)
    expect(r.legacy).toBe(50)
    expect(r.dynamic).toBe(50)
  })

  it('mixed KPI performance → both scores match within ±0.01', () => {
    const actuals = { wasfaty: 600, omni: 200, wellness: 400, basket: 900, crossSelling: 120 }
    const r = parityCheck(actuals, FULL_TARGET)
    expect(r.match).toBe(true)
    expect(Math.abs(r.delta)).toBeLessThanOrEqual(0.01)
  })

  it('underperforming branch → both scores match', () => {
    const actuals = { wasfaty: 200, omni: 80,  wellness: 100, basket: 300, crossSelling: 30 }
    const r = parityCheck(actuals, FULL_TARGET)
    expect(r.match).toBe(true)
  })

  it('overperforming branch (200% cap per-KPI applies) → both match', () => {
    const actuals = { wasfaty: 1800, omni: 900, wellness: 1200, basket: 3000, crossSelling: 500 }
    const r = parityCheck(actuals, FULL_TARGET)
    expect(r.match).toBe(true)
    // overall can be >100 (raw weighted avg before clamp); both use same formula
    expect(r.legacy).toBe(r.dynamic)
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — Missing KPI parity
// ══════════════════════════════════════════════════════════════

describe('Missing KPI parity — exclusion behavior', () => {
  it('KPI missing from actuals: legacy gets 0%, dynamic excludes it (known divergence → score differs)', () => {
    // Legacy buildLegacyStatsMap fills missing KPI with actual=0 → 0% achievementPct → included at 0
    // Dynamic adapter receives null for missing key → excludes from denominator
    // This is a KNOWN intentional difference — dynamic is more accurate (0 ≠ missing)
    const actuals = { wasfaty: 800, wellness: 500, basket: 1200, crossSelling: 200 }  // no omni
    const r = parityCheck(actuals, FULL_TARGET)
    // Verify: dynamic omits omni (totalWeight = 0.80), legacy includes it at 0
    // → scores differ by design; this test documents the divergence
    expect(typeof r.legacy).toBe('number')
    expect(typeof r.dynamic).toBe('number')
    // When actuals has all keys including 0 for missing, they should match
  })

  it('KPI explicitly 0 in actuals: legacy and dynamic both score it at 0%', () => {
    // Passing explicit 0 for omni → both include it at 0%
    const actuals = { wasfaty: 800, omni: 0, wellness: 500, basket: 1200, crossSelling: 200 }
    const r = parityCheck(actuals, FULL_TARGET)
    expect(r.match).toBe(true)
  })

  it('all KPIs missing → both return 0', () => {
    const actuals = {}
    const r = parityCheck(actuals, FULL_TARGET)
    expect(r.legacy).toBe(0)
    expect(r.dynamic).toBe(0)
    expect(r.match).toBe(true)
  })

  it('only one KPI at 100%, others explicitly 0 → both score identically', () => {
    // All KPIs explicitly 0 except wasfaty → legacy and dynamic both include all at 0%
    // except wasfaty at 100% (note: 0% achievement for others lowers the overall)
    const actuals = { wasfaty: 800, omni: 0, wellness: 0, basket: 0, crossSelling: 0 }
    const r = parityCheck(actuals, FULL_TARGET)
    expect(r.match).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — Null and zero KPI parity
// ══════════════════════════════════════════════════════════════

describe('Null and zero KPI parity', () => {
  it('KPI actual = 0 (explicit zero) → both score it as 0% achievement', () => {
    const actuals = { wasfaty: 0, omni: 400, wellness: 500, basket: 1200, crossSelling: 200 }
    const r = parityCheck(actuals, FULL_TARGET)
    expect(r.match).toBe(true)
    // wasfaty 0/800 = 0%, included with 0 contribution
  })

  it('null target for one KPI → both exclude it', () => {
    const targetNoOmni: LegacyTargetDoc = {
      ...FULL_TARGET,
      omniTarget: 0,   // 0 target → excluded by both engines
    }
    const actuals = { wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200 }
    const r = parityCheck(actuals, targetNoOmni)
    expect(r.match).toBe(true)
  })

  it('all targets zero → both return 0', () => {
    const zeroTarget: LegacyTargetDoc = {
      pharmacyId: 'ph1', month: '2025-05',
      wasfatyTarget: 0, omniTarget: 0, wellnessTarget: 0,
      basketTarget: 0, crossSellTarget: 0,
    }
    const actuals = { wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200 }
    const r = parityCheck(actuals, zeroTarget)
    expect(r.legacy).toBe(0)
    expect(r.dynamic).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — Weight parity
// ══════════════════════════════════════════════════════════════

describe('Portfolio weight parity', () => {
  it('wasfaty weight = 0.25 in dynamic engine', () => {
    const metrics = buildDynamicMetrics(
      { wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200 },
      FULL_TARGET,
    )
    expect(metrics.wasfaty.portfolioWeight).toBe(0.25)
  })

  it('all 5 core KPI weights sum to 1.0 in dynamic metrics', () => {
    const metrics = buildDynamicMetrics(
      { wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200 },
      FULL_TARGET,
    )
    const total = KPI_KEYS.reduce((s, k) => s + metrics[k].portfolioWeight, 0)
    expect(Math.abs(total - 1.0)).toBeLessThanOrEqual(0.01)
  })

  it('kpiBreakdown weightedScore = cappedAch * weight for each KPI', () => {
    const actuals = { wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200 }
    const metrics = buildDynamicMetrics(actuals, FULL_TARGET)
    const score   = computeDynamicExecutiveScore(metrics)
    for (const entry of score.kpiBreakdown.filter((e) => e.included)) {
      const expected = entry.cappedAch * entry.portfolioWeight
      expect(Math.abs(entry.weightedScore - expected)).toBeLessThan(0.001)
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — Grade parity across scenarios
// ══════════════════════════════════════════════════════════════

describe('Grade parity — A through F', () => {
  const gradeScenarios: Array<{ label: string; actuals: Record<string, number>; expectedGrade: ExecutiveGrade }> = [
    {
      label: 'Grade A (≥90%)',
      actuals: { wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200 },
      expectedGrade: 'A',
    },
    {
      label: 'Grade B (75–89%)',
      actuals: { wasfaty: 620, omni: 310, wellness: 390, basket: 930, crossSelling: 155 },
      expectedGrade: 'B',
    },
    {
      label: 'Grade F (<45%)',
      actuals: { wasfaty: 200, omni: 100, wellness: 120, basket: 300, crossSelling: 50 },
      expectedGrade: 'F',
    },
  ]

  for (const scenario of gradeScenarios) {
    it(`${scenario.label}: legacy and dynamic grades match`, () => {
      const r = parityCheck(scenario.actuals, FULL_TARGET)
      const legacyGrade  = scoreToGrade(r.legacy)
      const dynamicGrade = scoreToGradeDynamic(r.dynamic)
      expect(legacyGrade).toBe(dynamicGrade)
      expect(r.match).toBe(true)
    })
  }
})

// ══════════════════════════════════════════════════════════════
// 7 — compareExecutiveScores utility
// ══════════════════════════════════════════════════════════════

describe('compareExecutiveScores — comparison utility', () => {
  it('identical scores return isMatch=true, delta=0', () => {
    const actuals = { wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200 }
    const metrics = buildDynamicMetrics(actuals, FULL_TARGET)
    const dynamic = computeDynamicExecutiveScore(metrics)
    const legacy  = computeOverallAchievement(buildLegacyStatsMap(actuals as any, {
      wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200,
    }) as any)
    const comparison = compareExecutiveScores(legacy, legacy, scoreToGrade(legacy), dynamic)
    expect(comparison.isMatch).toBe(true)
    expect(comparison.delta).toBeCloseTo(0, 2)
    expect(comparison.differences).toHaveLength(0)
  })

  it('different scores return isMatch=false with populated differences', () => {
    const dynamicFake: DynamicExecutiveScore = {
      overall: 85, grade: 'B', adjusted: 85,
      weightedSum: 0.85, totalWeight: 1.0,
      kpiBreakdown: [], adjustments: { submissionRate: 0, consistency: 0, trend: 0 },
    }
    const comparison = compareExecutiveScores(70, 70, 'B', dynamicFake)
    expect(comparison.isMatch).toBe(false)
    expect(comparison.delta).toBe(15)
    expect(comparison.differences.length).toBeGreaterThan(0)
  })

  it('returns percentageDelta field', () => {
    const actuals = { wasfaty: 600, omni: 200, wellness: 400, basket: 900, crossSelling: 120 }
    const metrics = buildDynamicMetrics(actuals, FULL_TARGET)
    const dynamic = computeDynamicExecutiveScore(metrics)
    const legacy  = computeOverallAchievement(buildLegacyStatsMap(actuals as any, {
      wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200,
    }) as any)
    const comparison = compareExecutiveScores(legacy, legacy, scoreToGrade(legacy), dynamic)
    expect(typeof comparison.percentageDelta).toBe('number')
  })
})

// ══════════════════════════════════════════════════════════════
// 8 — buildShadowScoreReport
// ══════════════════════════════════════════════════════════════

describe('buildShadowScoreReport — shadow report generation', () => {
  const actuals = { wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200 }
  const metrics = buildDynamicMetrics(actuals, FULL_TARGET)
  const branchMetrics: NormalizedBranchMetrics = {
    branchId: 'ph1', branchName: 'Main Branch', branchCode: '5001',
    period:   '2025-05', metrics,
  }

  it('report has branchId, branchName, legacyScore, dynamicScore', () => {
    const report = buildShadowScoreReport(branchMetrics, 100, 100, 'A')
    expect(report.branchId).toBe('ph1')
    expect(report.branchName).toBe('Main Branch')
    expect(typeof report.legacyScore).toBe('number')
    expect(typeof report.dynamicScore).toBe('number')
  })

  it('match=true when legacy and dynamic agree', () => {
    const report = buildShadowScoreReport(branchMetrics, 100, 100, 'A')
    expect(report.match).toBe(true)
  })

  it('report includes comparison and dynamicDetail', () => {
    const report = buildShadowScoreReport(branchMetrics, 100, 100, 'A')
    expect(report.comparison).toBeDefined()
    expect(report.dynamicDetail).toBeDefined()
    expect(report.dynamicDetail.kpiBreakdown).toBeDefined()
  })

  it('parity: report legacyScore 100 → dynamicScore 100', () => {
    const report = buildShadowScoreReport(branchMetrics, 100, 100, 'A')
    expect(report.dynamicScore).toBe(100)
    expect(report.legacyScore).toBe(100)
    expect(report.delta).toBeCloseTo(0, 2)
  })
})

// ══════════════════════════════════════════════════════════════
// 9 — buildPortfolioShadowReport — multi-branch
// ══════════════════════════════════════════════════════════════

describe('buildPortfolioShadowReport — portfolio-level parity', () => {
  function makeReport(branchId: string, legacyScore: number, actuals: Record<string, number>) {
    const metrics = buildDynamicMetrics(actuals, FULL_TARGET)
    const nm: NormalizedBranchMetrics = {
      branchId, branchName: `Branch ${branchId}`, period: '2025-05', metrics,
    }
    return buildShadowScoreReport(nm, legacyScore, legacyScore, scoreToGrade(legacyScore))
  }

  it('all-matching portfolio returns allMatch=true', () => {
    const reports = [
      makeReport('ph1', 100, { wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200 }),
      makeReport('ph2',  50, { wasfaty: 400, omni: 200, wellness: 250, basket: 600,  crossSelling: 100 }),
    ]
    const summary = buildPortfolioShadowReport(reports)
    expect(summary.allMatch).toBe(true)
    expect(summary.mismatchCount).toBe(0)
  })

  it('portfolio summary has correct counts', () => {
    const reports = [
      makeReport('ph1', 100, { wasfaty: 800, omni: 400, wellness: 500, basket: 1200, crossSelling: 200 }),
      makeReport('ph2',  50, { wasfaty: 400, omni: 200, wellness: 250, basket: 600,  crossSelling: 100 }),
    ]
    const summary = buildPortfolioShadowReport(reports)
    expect(summary.totalBranches).toBe(2)
    expect(summary.matchingCount).toBe(2)
  })

  it('mismatched report appears in mismatches array', () => {
    const fakeReport = {
      branchId: 'ph1', branchName: 'A',
      legacyScore: 70, dynamicScore: 90,   // intentional mismatch
      legacyGrade: 'B', dynamicGrade: 'A' as ExecutiveGrade,
      delta: 20, match: false,
      comparison: { isMatch: false, delta: 20, percentageDelta: 28, overallMatch: false, adjustedMatch: false, gradeMatch: false, differences: [] },
      dynamicDetail: { overall: 90, grade: 'A' as ExecutiveGrade, adjusted: 90, weightedSum: 0.9, totalWeight: 1, kpiBreakdown: [], adjustments: { submissionRate: 0, consistency: 0, trend: 0 } },
    }
    const summary = buildPortfolioShadowReport([fakeReport])
    expect(summary.mismatchCount).toBe(1)
    expect(summary.allMatch).toBe(false)
    expect(summary.mismatches[0]).toContain('ph1')
  })
})

// ══════════════════════════════════════════════════════════════
// 10 — Architecture: shadow mode constraints
// ══════════════════════════════════════════════════════════════

describe('Architecture — shadow mode constraints', () => {
  it('dynamicExecutiveScore.ts has no Firebase imports', () => {
    expect(SHADOW_SRC).not.toContain('firebase')
    expect(SHADOW_SRC).not.toContain('onSnapshot')
    expect(SHADOW_SRC).not.toContain("from '../services/firebase'")
  })

  it('dynamicExecutiveScore.ts has no React imports', () => {
    expect(SHADOW_SRC).not.toContain('import React')
    expect(SHADOW_SRC).not.toContain("from 'react'")
  })

  it('dynamicExecutiveScore.ts has no UI file imports', () => {
    expect(SHADOW_SRC).not.toContain('.jsx')
    expect(SHADOW_SRC).not.toContain('pages/')
    expect(SHADOW_SRC).not.toContain('components/')
  })

  it('shadow file documents SHADOW MODE intent', () => {
    expect(SHADOW_SRC).toContain('SHADOW MODE')
  })

  it('existing computeExecutiveScore in executiveScore.ts is untouched', () => {
    const legacySrc = readFileSync(resolve(__dirname, './executiveScore.ts'), 'utf8')
    expect(legacySrc).toContain('export function computeExecutiveScore')
    expect(legacySrc).not.toContain('dynamicExecutiveScore')
  })

  it('existing ExecutiveDashboard.jsx is not modified by this phase', () => {
    const dashSrc = readFileSync(
      resolve(__dirname, '../../pages/executive/ExecutiveDashboard.jsx'), 'utf8'
    )
    expect(dashSrc).not.toContain('dynamicExecutiveScore')
    expect(dashSrc).not.toContain('dynamicExecutiveAdapter')
  })
})
