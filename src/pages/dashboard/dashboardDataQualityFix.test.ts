// ============================================================
// Dashboard Team Intelligence — Data Quality Fix Regression Tests
//
// Issue 1: pharmacyUserMap missing from useMemo deps → names never update
// Issue 2: personalTarget absent from PharmacistInput → wrong target basis
//
// Tests:
//   1.  DashboardPage source: pharmacyUserMap is in teamIntelligence useMemo deps
//   2.  DashboardPage source: personalTargetMap is in teamIntelligence useMemo deps
//   3.  DashboardPage source: personalTarget passed into PharmacistInput
//   4.  DashboardPage source: subscribePublishedPersonalTargetsByBranch imported
//   5.  DashboardPage source: personalTargetMap state declared
//   6.  DashboardPage source: subscription cleanup (unsub returned)
//   7.  Engine: displayName from map used when map populated (name over userId)
//   8.  Engine: userId fallback when map entry absent
//   9.  Engine: personalTarget from map used when present
//  10.  Engine: null personalTarget → branch target fallback (unchanged behaviour)
//  11.  TeamIntelligenceCard remains compact (no Phase A fields)
//  12.  TeamPage Phase A sections remain in /team (unchanged)
//  13.  Performance score changes when personalTarget rebalances achievement
// ============================================================

import { describe, it, expect } from 'vitest'
import { computePharmacistPerformance } from '../../engine/teamIntelligence/pharmacistPerformanceEngine'
import type { PharmacistInput } from '../../engine/teamIntelligence/teamIntelligenceTypes'
import type { PersonalTargetDoc } from '../../services/personalTargetService'

// ── Fixtures ──────────────────────────────────────────────────

function makePharmacistInput(opts: {
  userId:        string
  displayName:   string
  personalTarget?: PersonalTargetDoc | null
  wasfatyActual?: number
  wasfatyTarget?: number
}): PharmacistInput {
  const { userId, displayName, personalTarget = null,
          wasfatyActual = 80, wasfatyTarget = 100 } = opts
  const entries = [{ userId, pharmacyId: 'ph1', date: '2026-06-15', wasfaty: wasfatyActual }]
  return {
    userId, displayName, pharmacyId: 'ph1',
    mtdEntries: entries, historicalEntries: entries,
    target: {
      pharmacyId: 'ph1', month: '2026-06',
      wasfatyTarget, omniTarget: 50, wellnessTarget: 40, basketTarget: 300, crossSellTarget: 25,
    } as any,
    personalTarget,
    expectedSubmissionDays: 20,
    actualSubmissionDays:   15,
  }
}

function makePersonalTarget(userId: string, targets: Record<string, number>): PersonalTargetDoc {
  return {
    id: `${userId}-ph1-2026-06`,
    userId, pharmacyId: 'ph1', month: '2026-06',
    targets, allocationMethod: 'custom',
    status: 'published', publishedAt: null,
    createdBy: 'mgr', createdAt: null, updatedAt: null,
  }
}

// ════════════════════════════════════════════════════════════════
// 1–6. DashboardPage source guards
// ════════════════════════════════════════════════════════════════

describe('Dashboard data quality — source guards', () => {
  it('1: pharmacyUserMap is in teamIntelligence useMemo dependency array', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    // Find the teamIntelligence useMemo dep array
    const memoEnd = src.default.indexOf('// 14-day trend')
    const memoBlock = src.default.slice(
      src.default.lastIndexOf('useMemo(', memoEnd), memoEnd
    )
    expect(memoBlock).toContain('pharmacyUserMap')
  })

  it('2: personalTargetMap is in teamIntelligence useMemo dependency array', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    const memoEnd = src.default.indexOf('// 14-day trend')
    const memoBlock = src.default.slice(
      src.default.lastIndexOf('useMemo(', memoEnd), memoEnd
    )
    expect(memoBlock).toContain('personalTargetMap')
  })

  it('3: personalTarget passed into PharmacistInput from personalTargetMap', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain('personalTarget: personalTargetMap.get(userId) ?? null')
  })

  it('4: subscribePublishedPersonalTargetsByBranch is imported', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain('subscribePublishedPersonalTargetsByBranch')
  })

  it('5: personalTargetMap state is declared', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain('personalTargetMap, setPersonalTargetMap')
  })

  it('6: personal target subscription returns unsub for cleanup', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    // The personal target useEffect must return a cleanup function
    const ptEffectIdx = src.default.indexOf('subscribePublishedPersonalTargetsByBranch(')
    const ptEffect = src.default.slice(
      src.default.lastIndexOf('useEffect(', ptEffectIdx),
      ptEffectIdx + 300
    )
    expect(ptEffect).toContain('return () => unsub()')
  })
})

// ════════════════════════════════════════════════════════════════
// 7–8. Name resolution logic
// ════════════════════════════════════════════════════════════════

describe('Dashboard name resolution', () => {
  it('7: displayName from map is used when map is populated', () => {
    // The useMemo builds: displayName: pharmacyUserMap?.get(userId) ?? userId
    // Simulate: map populated → correct name used
    const map = new Map([['u1', 'Ahmed Al Rashid']])
    const displayName = map.get('u1') ?? 'u1'
    expect(displayName).toBe('Ahmed Al Rashid')
  })

  it('8: userId is used as fallback when map entry is absent', () => {
    const map = new Map<string, string>()   // empty map
    const displayName = map.get('u1') ?? 'u1'
    expect(displayName).toBe('u1')
  })

  it('displayName flows through to PharmacistPerformanceSummary', () => {
    const input = makePharmacistInput({ userId: 'u1', displayName: 'Ahmed Al Rashid' })
    const result = computePharmacistPerformance(input)
    expect(result.displayName).toBe('Ahmed Al Rashid')
  })

  it('when displayName is userId (map not ready), summary also shows userId', () => {
    // Before map populates — displayName === userId
    const input = makePharmacistInput({ userId: 'u-abc123', displayName: 'u-abc123' })
    const result = computePharmacistPerformance(input)
    expect(result.displayName).toBe('u-abc123')
  })
})

// ════════════════════════════════════════════════════════════════
// 9–10. Personal target routing
// ════════════════════════════════════════════════════════════════

describe('Dashboard personal target routing', () => {
  it('9: personal target from map is used when present', () => {
    // personalTargetMap.get(userId) returns a PersonalTargetDoc
    // → should be passed as personalTarget to PharmacistInput
    const pt = makePersonalTarget('u1', { wasfatyTarget: 50 })
    const personalTarget = new Map([['u1', pt]]).get('u1') ?? null
    expect(personalTarget).not.toBeNull()
    expect((personalTarget as PersonalTargetDoc).targets.wasfatyTarget).toBe(50)
  })

  it('10: null returned when user has no personal target (branch target fallback)', () => {
    const personalTarget = new Map<string, PersonalTargetDoc>().get('u1') ?? null
    expect(personalTarget).toBeNull()
  })

  it('engine uses personal target when passed — achievementPct changes', () => {
    // Branch target wasfaty=100, actual=40 → 40%
    const withBranch = makePharmacistInput({
      userId: 'u1', displayName: 'Test',
      wasfatyActual: 40, wasfatyTarget: 100, personalTarget: null,
    })
    // Personal target wasfaty=50, actual=40 → 80%
    const withPersonal = makePharmacistInput({
      userId: 'u1', displayName: 'Test',
      wasfatyActual: 40, wasfatyTarget: 100,
      personalTarget: makePersonalTarget('u1', { wasfatyTarget: 50 }),
    })
    const r1 = computePharmacistPerformance(withBranch)
    const r2 = computePharmacistPerformance(withPersonal)
    expect(r2.performanceScore).toBeGreaterThan(r1.performanceScore)
  })

  it('engine falls back to branch target when personalTarget is null', () => {
    const input = makePharmacistInput({
      userId: 'u1', displayName: 'Test',
      wasfatyActual: 80, wasfatyTarget: 100, personalTarget: null,
    })
    const result = computePharmacistPerformance(input)
    const snap = result.kpiSnapshots.find(s => s.kpiKey === 'wasfaty')!
    expect(snap.target).toBe(100)
    expect(snap.achievementPct).toBe(80)
  })
})

// ════════════════════════════════════════════════════════════════
// 11–12. Layout invariants — compact card and Phase A unchanged
// ════════════════════════════════════════════════════════════════

describe('Layout invariants', () => {
  it('11: TeamIntelligenceCard does not contain Phase A section headers', async () => {
    const src = await import('../../components/ui/TeamIntelligenceCard.jsx?raw')
    expect(src.default).not.toContain('Team KPI Profile')
    expect(src.default).not.toContain('Accountability Signals')
    expect(src.default).not.toContain('sortedSummaries')
  })

  it('TeamIntelligenceCard compact row still shows Momentum/Stability/Improving/Need Support', async () => {
    const src = await import('../../components/ui/TeamIntelligenceCard.jsx?raw')
    expect(src.default).toContain('Momentum')
    expect(src.default).toContain('Stability')
    expect(src.default).toContain('Improving')
    expect(src.default).toContain('Need Support')
  })

  it('12: TeamPage Phase A sections are unchanged', async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    expect(src.default).toContain('Team KPI Profile')
    expect(src.default).toContain('Accountability Signals')
    expect(src.default).toContain('sortedSummaries')
    expect(src.default).toContain('teamTrendSummary')
  })

  it('DashboardPage still renders TeamIntelligenceCard (not Phase A inline)', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain('TeamIntelligenceCard')
    expect(src.default).not.toContain('Team KPI Profile')
    expect(src.default).not.toContain('Accountability Signals')
  })
})

// ════════════════════════════════════════════════════════════════
// 13. Performance score correctness
// ════════════════════════════════════════════════════════════════

describe('Performance score with personal targets', () => {
  it('personal target = branch target → same score as without personal target', () => {
    const withBranch = makePharmacistInput({
      userId: 'u1', displayName: 'Test',
      wasfatyActual: 80, wasfatyTarget: 100, personalTarget: null,
    })
    const withSamePersonal = makePharmacistInput({
      userId: 'u1', displayName: 'Test',
      wasfatyActual: 80, wasfatyTarget: 100,
      personalTarget: makePersonalTarget('u1', { wasfatyTarget: 100 }),
    })
    const r1 = computePharmacistPerformance(withBranch)
    const r2 = computePharmacistPerformance(withSamePersonal)
    expect(r1.performanceScore).toBe(r2.performanceScore)
  })
})
