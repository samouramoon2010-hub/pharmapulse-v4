// ============================================================
// RF-1C-B Branch KPI Scoring Engine — Tests
//
// Business rule being tested:
//   Branch achievement = Σ(all pharmacist actuals) / branch target
//   NOT average of pharmacist evaluation scores
//
// Covers:
//   1.  Branch target 100, actuals 70+20+10 → 100% achievement
//   2.  One strong pharmacist can make branch hit target
//   3.  Branch ranks by collective achievement, not best individual
//   4.  Branch with no target excluded with reason
//   5.  Branch with no KPI entries excluded with reason
//   6.  Unclassified branch excluded from RankingInputRecord conversion
//   7.  Multiple KPIs weighted correctly via computeOverallAchievement
//   8.  pharmacistCount reflects distinct userIds
//   9.  adaptTargetDoc handles crossSellingTarget → crossSellTarget rename
//  10.  adaptKpiEntries converts doc shape to engine KpiEntry shape
//  11.  lastDayOfMonth returns correct date for referenceDate
//  12.  branchScoreToRankingInput maps score to RankingInputRecord
//  13.  cappedScore is clamped at 100 even when overallAch > 100
//  14.  scoreBranches processes multiple branches
//  15.  Pharmacist ranking source unchanged (still evaluation_results)
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  computeBranchKpiScore,
  scoreBranches,
  branchScoreToRankingInput,
  adaptTargetDoc,
  adaptKpiEntries,
  lastDayOfMonth,
} from '../../ranking/branch-kpi-engine'
import type { KpiEntryDoc, BranchTargetDoc } from '../../ranking/branch-kpi-engine'
import { UNRANKED_CLASSIFICATION_ID } from '../../ranking/constants'

// ── Fixtures ──────────────────────────────────────────────────

function makeTarget(overrides: Partial<BranchTargetDoc> = {}): BranchTargetDoc {
  return {
    pharmacyId:         'ph-001',
    month:              '2026-06',
    wasfatyTarget:      100,
    omniTarget:         100,
    wellnessTarget:     100,
    basketTarget:       100,
    crossSellingTarget: 100,
    ...overrides,
  }
}

function makeEntry(userId: string, overrides: Partial<KpiEntryDoc> = {}): KpiEntryDoc {
  return {
    userId,
    pharmacyId:   'ph-001',
    date:         '2026-06-15',
    wasfaty:      10,
    omni:         10,
    wellness:     10,
    basket:       10,
    crossSelling: 10,
    ...overrides,
  }
}

// ════════════════════════════════════════════════════════════════
// 1. Core business rule: collective achievement
// ════════════════════════════════════════════════════════════════

describe('Branch KPI achievement — collective pharmacist actuals', () => {
  it('branch target 100, pharmacists 70+20+10 → branch actual=100 → 100%', () => {
    const target  = makeTarget({ wasfatyTarget: 100 })
    const entries = [
      makeEntry('u1', { wasfaty: 70 }),
      makeEntry('u2', { wasfaty: 20 }),
      makeEntry('u3', { wasfaty: 10 }),
    ]
    const score = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch', entries, target)

    expect(score.kpiBreakdown.wasfaty.actual).toBe(100)
    expect(score.kpiBreakdown.wasfaty.target).toBe(100)
    expect(score.kpiBreakdown.wasfaty.achievementPct).toBe(100)
  })

  it('branch target 100, one pharmacist contributes 100 → 100%', () => {
    const target  = makeTarget({ wasfatyTarget: 100 })
    const entries = [makeEntry('u1', { wasfaty: 100 })]
    const score   = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch', entries, target)

    expect(score.kpiBreakdown.wasfaty.achievementPct).toBe(100)
    expect(score.exclusionReason).toBeUndefined()
  })

  it('partial achievement: actuals 50, target 100 → 50%', () => {
    const target  = makeTarget({ wasfatyTarget: 100 })
    const entries = [
      makeEntry('u1', { wasfaty: 30 }),
      makeEntry('u2', { wasfaty: 20 }),
    ]
    const score = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch', entries, target)

    expect(score.kpiBreakdown.wasfaty.actual).toBe(50)
    expect(score.kpiBreakdown.wasfaty.achievementPct).toBe(50)
  })

  it('overachievement: actuals 150, target 100 → capped at 200%', () => {
    const target  = makeTarget({ wasfatyTarget: 100 })
    const entries = [makeEntry('u1', { wasfaty: 150 })]
    const score   = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch', entries, target)

    expect(score.kpiBreakdown.wasfaty.achievementPct).toBeLessThanOrEqual(200)
  })
})

// ════════════════════════════════════════════════════════════════
// 2. Composite score uses KPI weights
// ════════════════════════════════════════════════════════════════

describe('Branch composite score — weighted achievement', () => {
  it('all KPIs at 100% → overall achievement = 100%', () => {
    // Each entry hits the full target on its own — sum of entries equals target exactly
    const target = makeTarget({
      wasfatyTarget: 100, omniTarget: 100, wellnessTarget: 100,
      basketTarget: 100, crossSellingTarget: 100,
    })
    const entries = [
      makeEntry('u1', { wasfaty: 100, omni: 100, wellness: 100, basket: 100, crossSelling: 100 }),
    ]
    const score = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch', entries, target)

    expect(score.overallAchievementPct).toBe(100)
    expect(score.exclusionReason).toBeUndefined()
  })

  it('overallAchievementPct is a number (not NaN)', () => {
    const target  = makeTarget()
    const entries = [makeEntry('u1')]
    const score   = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch', entries, target)

    expect(Number.isFinite(score.overallAchievementPct)).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════
// 3. Ranking by collective achievement, not best individual
// ════════════════════════════════════════════════════════════════

describe('Branch ranking — collective vs individual', () => {
  it('branch B with lower individual peaks but better collective beats branch A', () => {
    // Branch A: 1 pharmacist scores 200 wasfaty, others 0 → collective = 200/500 = 40%
    const targetA   = makeTarget({ wasfatyTarget: 500 })
    const entriesA  = [
      makeEntry('u1', { wasfaty: 200 }),
      makeEntry('u2', { wasfaty: 0 }),
    ]
    // Branch B: 3 pharmacists each score 60 → collective = 180/200 = 90%
    const targetB   = makeTarget({ pharmacyId: 'ph-002', wasfatyTarget: 200 })
    const entriesB  = [
      { ...makeEntry('u3', { wasfaty: 60 }), pharmacyId: 'ph-002' },
      { ...makeEntry('u4', { wasfaty: 60 }), pharmacyId: 'ph-002' },
      { ...makeEntry('u5', { wasfaty: 60 }), pharmacyId: 'ph-002' },
    ]

    const scoreA = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch A', entriesA, targetA)
    const scoreB = computeBranchKpiScore('ph-002', '2026-06', 'destination', 'Branch B', entriesB, targetB)

    // Branch B should rank higher despite no individual star
    expect(scoreB.kpiBreakdown.wasfaty.achievementPct).toBeGreaterThan(
      scoreA.kpiBreakdown.wasfaty.achievementPct
    )
  })
})

// ════════════════════════════════════════════════════════════════
// 4. Exclusion cases
// ════════════════════════════════════════════════════════════════

describe('Branch exclusion cases', () => {
  it('branch with no target excluded with reason', () => {
    const entries = [makeEntry('u1')]
    const score   = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch', entries, null)

    expect(score.exclusionReason).toBeTruthy()
    expect(score.exclusionReason).toMatch(/target/i)
    expect(score.overallAchievementPct).toBe(0)
  })

  it('branch with no KPI entries excluded with reason', () => {
    const target = makeTarget()
    const score  = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch', [], target)

    expect(score.exclusionReason).toBeTruthy()
    expect(score.exclusionReason).toMatch(/entries/i)
  })

  it('unclassified branch returns null from branchScoreToRankingInput', () => {
    const target  = makeTarget()
    const entries = [makeEntry('u1')]
    const score   = computeBranchKpiScore(
      'ph-001', '2026-06', UNRANKED_CLASSIFICATION_ID, 'Branch', entries, target
    )
    const record = branchScoreToRankingInput(score, 'src-001')

    expect(record).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════
// 7. pharmacistCount
// ════════════════════════════════════════════════════════════════

describe('pharmacistCount', () => {
  it('counts distinct userIds across all entries', () => {
    const target  = makeTarget()
    const entries = [
      makeEntry('u1', { date: '2026-06-01' }),
      makeEntry('u1', { date: '2026-06-02' }),   // same user, different day
      makeEntry('u2', { date: '2026-06-01' }),
      makeEntry('u3', { date: '2026-06-01' }),
    ]
    const score = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch', entries, target)

    expect(score.pharmacistCount).toBe(3)
  })
})

// ════════════════════════════════════════════════════════════════
// 8. adaptTargetDoc — crossSelling field rename
// ════════════════════════════════════════════════════════════════

describe('adaptTargetDoc', () => {
  it('maps crossSellingTarget → crossSellTarget', () => {
    const doc   = makeTarget({ crossSellingTarget: 150 })
    const adapted = adaptTargetDoc(doc)
    expect(adapted.crossSellTarget).toBe(150)
  })

  it('accepts crossSellTarget directly', () => {
    const doc   = { ...makeTarget(), crossSellTarget: 200, crossSellingTarget: undefined }
    const adapted = adaptTargetDoc(doc as BranchTargetDoc)
    expect(adapted.crossSellTarget).toBe(200)
  })

  it('returns 0 for missing target fields', () => {
    const minimal: BranchTargetDoc = { pharmacyId: 'ph', month: '2026-06' }
    const adapted = adaptTargetDoc(minimal)
    expect(adapted.wasfatyTarget).toBe(0)
    expect(adapted.crossSellTarget).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════
// 9. adaptKpiEntries
// ════════════════════════════════════════════════════════════════

describe('adaptKpiEntries', () => {
  it('converts Firestore doc shape to KpiEntry', () => {
    const docs = [makeEntry('u1', { wasfaty: 42 })]
    const adapted = adaptKpiEntries(docs)
    expect(adapted[0].wasfaty).toBe(42)
    expect(adapted[0].userId).toBe('u1')
  })

  it('undefined KPI values default to 0', () => {
    const doc: KpiEntryDoc = { userId: 'u1', pharmacyId: 'ph', date: '2026-06-01' }
    const adapted = adaptKpiEntries([doc])
    expect(adapted[0].wasfaty).toBe(0)
    expect(adapted[0].omni).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════
// 10. lastDayOfMonth
// ════════════════════════════════════════════════════════════════

describe('lastDayOfMonth', () => {
  it('returns last day of June 2026', () => {
    const d = lastDayOfMonth('2026-06')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)   // 0-indexed = June
    expect(d.getDate()).toBe(30)
  })

  it('returns last day of February (non-leap)', () => {
    const d = lastDayOfMonth('2025-02')
    expect(d.getDate()).toBe(28)
  })

  it('returns last day of February (leap year)', () => {
    const d = lastDayOfMonth('2024-02')
    expect(d.getDate()).toBe(29)
  })
})

// ════════════════════════════════════════════════════════════════
// 11. branchScoreToRankingInput
// ════════════════════════════════════════════════════════════════

describe('branchScoreToRankingInput', () => {
  it('maps eligible score to RankingInputRecord with correct entityId', () => {
    const target  = makeTarget()
    const entries = [makeEntry('u1')]
    const score   = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch 1', entries, target)
    const record  = branchScoreToRankingInput(score, 'ph-001_2026-06')

    expect(record).not.toBeNull()
    expect(record!.entityId).toBe('ph-001')
    expect(record!.entityName).toBe('Branch 1')
    expect(record!.entityType).toBe('branch')
  })

  it('cappedScore is clamped to max 100 even when overallAch > 100', () => {
    const target  = makeTarget({ wasfatyTarget: 50, omniTarget: 50, wellnessTarget: 50,
      basketTarget: 50, crossSellingTarget: 50 })
    const entries = [makeEntry('u1', { wasfaty: 200, omni: 200, wellness: 200, basket: 200, crossSelling: 200 })]
    const score   = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch', entries, target)
    const record  = branchScoreToRankingInput(score, 'src')

    expect(record!.cappedScore).toBeLessThanOrEqual(100)
    expect(record!.uncappedScore).toBeGreaterThan(100)   // overachievement preserved
  })

  it('returns null for excluded score', () => {
    const score = computeBranchKpiScore('ph-001', '2026-06', 'destination', 'Branch', [], null)
    expect(branchScoreToRankingInput(score, 'src')).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════
// 12. scoreBranches batch
// ════════════════════════════════════════════════════════════════

describe('scoreBranches', () => {
  it('scores multiple branches in one call', () => {
    const inputs = [
      {
        pharmacyId: 'ph-1', month: '2026-06', classificationId: 'hub',
        pharmacyName: 'B1',
        kpiEntries: [makeEntry('u1', { pharmacyId: 'ph-1' })],
        targetDoc: makeTarget({ pharmacyId: 'ph-1' }),
      },
      {
        pharmacyId: 'ph-2', month: '2026-06', classificationId: 'destination',
        pharmacyName: 'B2',
        kpiEntries: [makeEntry('u2', { pharmacyId: 'ph-2' })],
        targetDoc: makeTarget({ pharmacyId: 'ph-2' }),
      },
    ]
    const scores = scoreBranches(inputs)
    expect(scores).toHaveLength(2)
    expect(scores[0].pharmacyId).toBe('ph-1')
    expect(scores[1].pharmacyId).toBe('ph-2')
  })
})

// ════════════════════════════════════════════════════════════════
// 13. Pharmacist ranking unaffected
// ════════════════════════════════════════════════════════════════

describe('Pharmacist ranking unchanged', () => {
  it('branch-kpi-engine has no pharmacist-specific logic', async () => {
    const src = await import('../../ranking/branch-kpi-engine.ts?raw')
    expect(src.default).not.toContain('evaluation_results')
    expect(src.default).not.toContain('normalizedFinalScorePct')
    expect(src.default).not.toContain('ratingScore')
  })
})
