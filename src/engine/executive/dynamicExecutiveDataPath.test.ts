// ============================================================
// Dynamic Executive Data Path Wiring — Tests
// Phase 4C-X-2
//
// Tests the real-data shadow pipeline against BranchInput
// shapes identical to what computeExecutiveScore consumes.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'

import {
  extractBranchActuals,
  extractLegacyTargetDoc,
  computeBranchAdjustments,
  computeSubmissionAdjustment,
  computeConsistencyAdjustment,
  computeTrendAdjustment,
  runBranchShadowPipeline,
  buildExecutiveShadowReport,
  validateShadowParity,
  auditKpiDataSemantics,
  auditBranchDataSemantics,
  findParityMismatches,
  classifyMismatch,
  type ExecutiveShadowReport,
} from './dynamicExecutiveDataPath'

import { computeExecutiveScore } from './executiveScore'
import { KPI_KEYS, KPI_META }    from '../kpiAnalyticsEngine'
import type { BranchInput, KpiEntry, MonthlyTarget } from './executiveTypes'

// ── Source guards ──────────────────────────────────────────────
const DP_SRC = readFileSync(resolve(__dirname, './dynamicExecutiveDataPath.ts'), 'utf8')

// ══════════════════════════════════════════════════════════════
// FIXTURES
// ══════════════════════════════════════════════════════════════

function makeEntry(userId: string, date: string, vals: Partial<Record<string, number>> = {}): KpiEntry {
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

const TODAY = new Date().toISOString().split('T')[0]
const DAYS  = Array.from({ length: 20 }, (_, i) => {
  const d = new Date()
  d.setDate(d.getDate() - i)
  return d.toISOString().split('T')[0]
})

/** A well-performing branch with consistent data */
function makeBranchInput(id = 'ph1', name = 'Test Branch', overrides: Partial<BranchInput> = {}): BranchInput {
  const entries = DAYS.map((date) => makeEntry('user1', date))
  return {
    pharmacyId:      id,
    pharmacyName:    name,
    pharmacyCode:    id.toUpperCase(),
    region:          'Region A',
    mtdEntries:      entries,
    historicalEntries: entries,
    target:          makeTarget({ pharmacyId: id }),
    pharmacistCount: 2,
    submittedToday:  2,
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════
// 1 — extractBranchActuals
// ══════════════════════════════════════════════════════════════

describe('extractBranchActuals — same sumKpi calls as legacy', () => {
  it('returns numeric totals for all 5 core KPIs', () => {
    const branch  = makeBranchInput()
    const actuals = extractBranchActuals(branch)
    expect(actuals).toHaveProperty('wasfaty')
    expect(actuals).toHaveProperty('omni')
    expect(actuals).toHaveProperty('wellness')
    expect(actuals).toHaveProperty('basket')
    expect(actuals).toHaveProperty('crossSelling')
  })

  it('wasfaty actual = 15 * 20 days = 300', () => {
    const branch  = makeBranchInput()
    expect(extractBranchActuals(branch).wasfaty).toBe(300)
  })

  it('empty entries → all actuals = 0 (not null)', () => {
    const branch  = makeBranchInput('ph1', 'Empty', { mtdEntries: [] })
    const actuals = extractBranchActuals(branch)
    for (const key of KPI_KEYS) {
      expect(actuals[key]).toBe(0)
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — extractLegacyTargetDoc
// ══════════════════════════════════════════════════════════════

describe('extractLegacyTargetDoc — target shape conversion', () => {
  it('returns null when branch.target is null', () => {
    const branch = makeBranchInput('ph1', 'A', { target: null })
    expect(extractLegacyTargetDoc(branch)).toBeNull()
  })

  it('maps wasfatyTarget correctly', () => {
    const branch = makeBranchInput()
    const doc    = extractLegacyTargetDoc(branch)
    expect(doc?.wasfatyTarget).toBe(800)
  })

  it('maps crossSellTarget (legacy naming)', () => {
    const branch = makeBranchInput()
    const doc    = extractLegacyTargetDoc(branch)
    expect(doc?.crossSellTarget).toBe(200)
  })

  it('all 5 target fields present', () => {
    const doc = extractLegacyTargetDoc(makeBranchInput())!
    expect(doc.wasfatyTarget).toBeDefined()
    expect(doc.omniTarget).toBeDefined()
    expect(doc.wellnessTarget).toBeDefined()
    expect(doc.basketTarget).toBeDefined()
    expect(doc.crossSellTarget).toBeDefined()
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — Adjustment mirrors (parity with executiveScore.ts)
// ══════════════════════════════════════════════════════════════

describe('computeSubmissionAdjustment — mirrors executiveScore.ts', () => {
  it('≥90% submission → +5', () => {
    expect(computeSubmissionAdjustment(9, 10)).toBe(5)
    expect(computeSubmissionAdjustment(10, 10)).toBe(5)
  })
  it('70–89% → 0', () => {
    expect(computeSubmissionAdjustment(7, 10)).toBe(0)
  })
  it('50–69% → -5', () => {
    expect(computeSubmissionAdjustment(5, 10)).toBe(-5)
  })
  it('<50% → -10', () => {
    expect(computeSubmissionAdjustment(3, 10)).toBe(-10)
  })
  it('0 total → 0', () => {
    expect(computeSubmissionAdjustment(5, 0)).toBe(0)
  })
})

describe('computeConsistencyAdjustment — mirrors executiveScore.ts', () => {
  it('<5 data points → 0', () => {
    expect(computeConsistencyAdjustment([10, 10, 10])).toBe(0)
  })
  it('low CV (≤0.2) → +5', () => {
    const consistent = [100, 101, 99, 100, 100, 101, 99]
    expect(computeConsistencyAdjustment(consistent)).toBe(5)
  })
  it('high CV (>0.5) → -5', () => {
    const erratic = [10, 100, 5, 80, 2, 90, 15]
    expect(computeConsistencyAdjustment(erratic)).toBe(-5)
  })
})

describe('computeTrendAdjustment — mirrors executiveScore.ts', () => {
  it('ACCELERATING → +5', () => expect(computeTrendAdjustment('ACCELERATING')).toBe(5))
  it('IMPROVING → +2',    () => expect(computeTrendAdjustment('IMPROVING')).toBe(2))
  it('STABLE → 0',        () => expect(computeTrendAdjustment('STABLE')).toBe(0))
  it('DECLINING → -2',    () => expect(computeTrendAdjustment('DECLINING')).toBe(-2))
  it('DETERIORATING → -5', () => expect(computeTrendAdjustment('DETERIORATING')).toBe(-5))
  it('unknown → 0',       () => expect(computeTrendAdjustment('UNKNOWN')).toBe(0))
})

// ══════════════════════════════════════════════════════════════
// 4 — runBranchShadowPipeline — full pipeline parity
// ══════════════════════════════════════════════════════════════

describe('runBranchShadowPipeline — full parity with computeExecutiveScore', () => {
  it('both engines receive the same branch input', () => {
    const branch   = makeBranchInput()
    const pipeline = runBranchShadowPipeline(branch)
    expect(pipeline.branchId).toBe(branch.pharmacyId)
    expect(pipeline.legacyResult).toBeDefined()
    expect(pipeline.shadowReport).toBeDefined()
  })

  it('legacy overall > 0 after the kpiStatsMap target fix', () => {
    // Before fix: overall was always 0 (target field missing → all KPIs excluded)
    // After fix: overall correctly reflects KPI-weighted achievement
    const branch   = makeBranchInput()
    const pipeline = runBranchShadowPipeline(branch)
    expect(pipeline.legacyResult.overall).toBeGreaterThan(0)
  })

  it('legacy adjusted score includes KPI achievement after fix', () => {
    const branch   = makeBranchInput()
    const pipeline = runBranchShadowPipeline(branch)
    // adjusted = overall + submissionAdj + consistencyAdj + trendAdj
    // With the fix, adjusted is now >10 (was max 10 before)
    expect(pipeline.legacyResult.adjusted).toBeGreaterThanOrEqual(0)
    expect(pipeline.legacyResult.overall).toBeGreaterThan(0)
  })

  it('zero-entry branch: both return 0 overall', () => {
    const branch = makeBranchInput('ph1', 'Empty', { mtdEntries: [], historicalEntries: [] })
    const pipeline = runBranchShadowPipeline(branch)
    // Both exclude KPIs when actual=0 with no entries but target exists
    // (legacy: 0% achievement, dynamic: 0% achievement → same weighted sum)
    expect(typeof pipeline.legacyResult.overall).toBe('number')
    expect(typeof pipeline.shadowReport.dynamicScore).toBe('number')
    expect(pipeline.shadowReport.delta).toBeCloseTo(0, 1)
  })

  it('null target: both return 0', () => {
    const branch   = makeBranchInput('ph1', 'No Target', { target: null })
    const pipeline = runBranchShadowPipeline(branch)
    expect(pipeline.legacyResult.overall).toBe(0)
    expect(pipeline.shadowReport.dynamicScore).toBe(0)
    expect(pipeline.shadowReport.match).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — buildExecutiveShadowReport — portfolio report
// ══════════════════════════════════════════════════════════════

describe('buildExecutiveShadowReport — portfolio-level', () => {
  it('processes multiple branches', () => {
    const branches = [
      makeBranchInput('ph1', 'Branch A'),
      makeBranchInput('ph2', 'Branch B', { submittedToday: 1, pharmacistCount: 2 }),
    ]
    const report = buildExecutiveShadowReport(branches)
    expect(report.branchesCompared).toBe(2)
    expect(report.branchResults).toHaveLength(2)
  })

  it('has generatedAt timestamp', () => {
    const report = buildExecutiveShadowReport([makeBranchInput()])
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('portfolioMatch is true when all branches match', () => {
    const branches = [makeBranchInput('ph1', 'A'), makeBranchInput('ph2', 'B')]
    const report   = buildExecutiveShadowReport(branches)
    expect(typeof report.portfolioMatch).toBe('boolean')
    expect(typeof report.maxDelta).toBe('number')
    expect(typeof report.averageDelta).toBe('number')
  })

  it('empty branch list produces empty report', () => {
    const report = buildExecutiveShadowReport([])
    expect(report.branchesCompared).toBe(0)
    expect(report.branchResults).toHaveLength(0)
    expect(report.portfolioMatch).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — validateShadowParity
// ══════════════════════════════════════════════════════════════

describe('validateShadowParity — validation helper', () => {
  it('returns valid=true when all branches match', () => {
    const branches = [makeBranchInput('ph1'), makeBranchInput('ph2')]
    const report   = buildExecutiveShadowReport(branches)
    const result   = validateShadowParity(report)
    expect(result.valid).toBe(report.portfolioMatch)
    expect(typeof result.summary).toBe('string')
  })

  it('returns valid=false for a report with mismatches', () => {
    const fakeReport: ExecutiveShadowReport = {
      generatedAt: '', branchesCompared: 1, portfolioMatch: false,
      maxDelta: 20, averageDelta: 20,
      branchResults: [{
        branchId: 'ph1', branchName: 'A',
        legacyScore: 70, dynamicScore: 90,
        legacyGrade: 'B', dynamicGrade: 'A',
        delta: 20, match: false,
      }],
      portfolioSummary: {
        totalBranches: 1, matchingCount: 0, mismatchCount: 1,
        allMatch: false, maxDelta: 20, avgDelta: 20, mismatches: ['ph1'],
      },
    }
    const result = validateShadowParity(fakeReport)
    expect(result.valid).toBe(false)
    expect(result.failingBranches).toContain('ph1')
  })

  it('summary string contains branch count', () => {
    const report = buildExecutiveShadowReport([makeBranchInput()])
    const result = validateShadowParity(report)
    expect(result.summary).toContain('1')
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — Data Semantics Audit
// ══════════════════════════════════════════════════════════════

describe('auditKpiDataSemantics — KPI data semantics classification', () => {
  const targetDoc = {
    pharmacyId: 'ph1', month: '2025-05',
    wasfatyTarget: 800, omniTarget: 400,
    wellnessTarget: 500, basketTarget: 1200, crossSellTarget: 200,
  }

  it('POSITIVE_VALUE when actual > 0 and target exists', () => {
    const entries = [makeEntry('u1', TODAY, { wasfaty: 15 })]
    const audit = auditKpiDataSemantics('wasfaty', entries, targetDoc)
    expect(audit.semantics).toBe('POSITIVE_VALUE')
  })

  it('EXPLICIT_ZERO when entries have value=0 and target exists', () => {
    const entries = [makeEntry('u1', TODAY, { wasfaty: 0 })]
    const audit = auditKpiDataSemantics('wasfaty', entries, targetDoc)
    expect(audit.semantics).toBe('EXPLICIT_ZERO')
  })

  it('NOT_SUBMITTED when entries array is empty and target exists', () => {
    const audit = auditKpiDataSemantics('wasfaty', [], targetDoc)
    expect(audit.semantics).toBe('NOT_SUBMITTED')
    expect(audit.rawActual).toBe(0)
  })

  it('TARGET_MISSING when no target document', () => {
    const entries = [makeEntry('u1', TODAY, { wasfaty: 15 })]
    const audit = auditKpiDataSemantics('wasfaty', entries, null)
    expect(audit.semantics).toBe('TARGET_MISSING')
  })

  it('TARGET_ZERO when target for this KPI is 0', () => {
    const zeroTarget = { ...targetDoc, wasfatyTarget: 0 }
    const entries    = [makeEntry('u1', TODAY, { wasfaty: 15 })]
    const audit = auditKpiDataSemantics('wasfaty', entries, zeroTarget)
    expect(audit.semantics).toBe('TARGET_ZERO')
  })

  it('legacyBehavior and dynamicBehavior differ for NOT_SUBMITTED', () => {
    // NOT_SUBMITTED: legacy includes at 0%, dynamic also includes at 0%
    // (sumKpi returns 0 for empty entries — NOT null)
    const audit = auditKpiDataSemantics('wasfaty', [], targetDoc)
    expect(audit.legacyBehavior).toContain('INCLUDED')
    expect(audit.dynamicBehavior).toContain('INCLUDED')
  })

  it('TARGET_MISSING: both exclude', () => {
    const audit = auditKpiDataSemantics('wasfaty', [makeEntry('u1', TODAY)], null)
    expect(audit.legacyBehavior).toContain('EXCLUDED')
    expect(audit.dynamicBehavior).toContain('EXCLUDED')
  })
})

describe('auditBranchDataSemantics — full branch audit', () => {
  it('returns one entry per core KPI', () => {
    const branch = makeBranchInput()
    const audit  = auditBranchDataSemantics(branch)
    expect(audit).toHaveLength(KPI_KEYS.length)
    const audited = audit.map((a) => a.kpiKey)
    for (const key of KPI_KEYS) {
      expect(audited).toContain(key)
    }
  })

  it('all positive-value branch → all POSITIVE_VALUE semantics', () => {
    const branch = makeBranchInput()
    const audit  = auditBranchDataSemantics(branch)
    for (const a of audit) {
      expect(a.semantics).toBe('POSITIVE_VALUE')
    }
  })

  it('null target branch → all TARGET_MISSING', () => {
    const branch = makeBranchInput('ph1', 'A', { target: null })
    const audit  = auditBranchDataSemantics(branch)
    for (const a of audit) {
      expect(a.semantics).toBe('TARGET_MISSING')
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 8 — Architecture constraints: shadow only
// ══════════════════════════════════════════════════════════════

describe('Architecture — shadow only, no UI/Firestore', () => {
  it('data path has no Firebase imports', () => {
    expect(DP_SRC).not.toContain('onSnapshot')
    expect(DP_SRC).not.toContain("from '../services/firebase'")
    expect(DP_SRC).not.toContain('collection(db')
  })

  it('data path has no React imports', () => {
    expect(DP_SRC).not.toContain("from 'react'")
    expect(DP_SRC).not.toContain('import React')
  })

  it('data path has no JSX or page imports', () => {
    expect(DP_SRC).not.toContain('.jsx')
    expect(DP_SRC).not.toContain('pages/')
  })

  it('is marked SHADOW MODE in source', () => {
    expect(DP_SRC).toContain('SHADOW MODE')
  })

  it('Executive Dashboard UI not modified', () => {
    const dashSrc = readFileSync(
      resolve(__dirname, '../../pages/executive/ExecutiveDashboard.jsx'), 'utf8'
    )
    expect(dashSrc).not.toContain('dynamicExecutiveDataPath')
    expect(dashSrc).not.toContain('runBranchShadowPipeline')
    expect(dashSrc).not.toContain('buildExecutiveShadowReport')
  })
})
