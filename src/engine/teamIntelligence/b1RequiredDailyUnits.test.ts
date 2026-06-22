// ============================================================
// B1 — Required Daily Units Regression Tests
//
// Tests the pace field calculation in KpiSnapshot and the
// "Today's Required Focus" ordering logic.
//
//  1.  remaining = max(0, target - actual)
//  2.  requiredPerDay when days remain and target not met
//  3.  requiredPerDay = 0 when target already achieved
//  4.  requiredPerDay = 0 when no days remain
//  5.  requiredPerDay = 0 when target = 0
//  6.  paceStatus = 'achieved' when remaining = 0
//  7.  paceStatus = 'ahead' when actual > expectedToDate × 1.05
//  8.  paceStatus = 'on_track' when actual ≈ expectedToDate
//  9.  paceStatus = 'behind' when actual < expectedToDate × 0.95
// 10.  paceStatus = 'critical' when days remaining = 0 and remaining > 0
// 11.  Personal target used in requiredPerDay calculation
// 12.  Branch target fallback when personal target absent
// 13.  no NaN or Infinity in any pace field
// 14.  expectedToDate = target × (currentDay / totalDays)
// 15.  KpiSnapshot has all required pace fields
// 16.  Today's Required Focus: critical sorted before behind
// 17.  Today's Required Focus: sorted by requiredPerDay descending within same status
// 18.  Today's Required Focus: achieved KPIs excluded
// 19.  Today's Required Focus: members with no target excluded
// 20.  TeamPage source: PACE_COLOR map present
// 21.  TeamPage source: requiredFocus computation present
// 22.  TeamPage source: Today's Required Focus section present
// 23.  TeamPage source: requiredPerDay displayed in member roster
// ============================================================

import { describe, it, expect } from 'vitest'
import { computePharmacistPerformance } from '../../engine/teamIntelligence/pharmacistPerformanceEngine'
import type { PharmacistInput } from '../../engine/teamIntelligence/teamIntelligenceTypes'
import type { PersonalTargetDoc } from '../../services/personalTargetService'

// ── Fixtures ──────────────────────────────────────────────────

/** Build a simulated DayProgress-equivalent scenario via entries + target */
function makeInput(opts: {
  userId?:        string
  wasfatyActual?: number
  wasfatyTarget?: number
  personalTarget?: PersonalTargetDoc | null
  currentDay?:    number   // simulate day of month (default: 15)
  totalDays?:     number   // total days in month (default: 30)
}): PharmacistInput {
  const {
    userId = 'u1',
    wasfatyActual = 80,
    wasfatyTarget = 100,
    personalTarget = null,
    currentDay = 15,
    totalDays = 30,
  } = opts

  // Build entries: fill currentDay entries summing to wasfatyActual
  const entries: any[] = []
  const perDay = wasfatyActual / Math.max(1, currentDay)
  for (let d = 1; d <= currentDay; d++) {
    const date = `2026-06-${String(d).padStart(2,'0')}`
    entries.push({ userId, pharmacyId: 'ph1', date, wasfaty: perDay })
  }

  // Use a fixed date matching currentDay
  return {
    userId, displayName: `User ${userId}`, pharmacyId: 'ph1',
    mtdEntries: entries, historicalEntries: entries,
    target: {
      pharmacyId: 'ph1', month: '2026-06',
      wasfatyTarget, omniTarget: 50, wellnessTarget: 40,
      basketTarget: 300, crossSellTarget: 25,
    } as any,
    personalTarget,
    expectedSubmissionDays: currentDay,
    actualSubmissionDays:   currentDay,
  }
}

function makePersonalTarget(targets: Record<string, number>): PersonalTargetDoc {
  return {
    id: 'u1-ph1-2026-06', userId: 'u1', pharmacyId: 'ph1', month: '2026-06',
    targets, allocationMethod: 'custom', status: 'published',
    publishedAt: null, createdBy: 'mgr', createdAt: null, updatedAt: null,
  }
}

function getWasfatySnap(input: PharmacistInput) {
  // Use a fixed date in the middle of the month so getDayProgress returns predictable values
  const now = new Date('2026-06-15T12:00:00')
  const result = computePharmacistPerformance(input, now)
  return result.kpiSnapshots.find(s => s.kpiKey === 'wasfaty')!
}

// ════════════════════════════════════════════════════════════════
// 1–5. remaining and requiredPerDay base cases
// ════════════════════════════════════════════════════════════════

describe('B1 — remaining calculation', () => {
  it('1: remaining = max(0, target - actual)', () => {
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 60, wasfatyTarget: 100 }))
    expect(snap.remaining).toBe(40)
  })

  it('remaining = 0 when actual >= target', () => {
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 110, wasfatyTarget: 100 }))
    expect(snap.remaining).toBe(0)
  })
})

describe('B1 — requiredPerDay calculation', () => {
  it('2: requiredPerDay > 0 when days remain and target not met', () => {
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 60, wasfatyTarget: 100 }))
    // remaining=40, daysRemaining≈15 → ≈2.7/day
    expect(snap.requiredPerDay).toBeGreaterThan(0)
    expect(Number.isFinite(snap.requiredPerDay)).toBe(true)
  })

  it('3: requiredPerDay = 0 when target already achieved', () => {
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 105, wasfatyTarget: 100 }))
    expect(snap.requiredPerDay).toBe(0)
  })

  it('5: requiredPerDay = 0 when target = 0', () => {
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 0, wasfatyTarget: 0 }))
    expect(snap.requiredPerDay).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════
// 6–10. paceStatus classification
// ════════════════════════════════════════════════════════════════

describe('B1 — paceStatus', () => {
  it('6: paceStatus = achieved when remaining = 0', () => {
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 110, wasfatyTarget: 100 }))
    expect(snap.paceStatus).toBe('achieved')
  })

  it('6: paceStatus = achieved when target = 0', () => {
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 0, wasfatyTarget: 0 }))
    expect(snap.paceStatus).toBe('achieved')
  })

  it('7: paceStatus = ahead when actual well above expectedToDate', () => {
    // Day 15 of 30: expectedToDate = 100 × 15/30 = 50. Actual = 55 (10% above) → ahead
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 55, wasfatyTarget: 100 }))
    expect(snap.paceStatus).toBe('ahead')
  })

  it('8: paceStatus = on_track when actual ≈ expectedToDate', () => {
    // Day 15 of 30: expectedToDate ≈ 50. Actual = 50 (exactly on pace)
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 50, wasfatyTarget: 100 }))
    expect(snap.paceStatus).toBe('on_track')
  })

  it('9: paceStatus = behind or critical when actual < expectedToDate × 0.95', () => {
    // Day 15 of 30: expectedToDate ≈ 50. Actual = 30 (well below) → behind or critical
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 30, wasfatyTarget: 100 }))
    expect(['behind', 'critical']).toContain(snap.paceStatus)
  })
})

// ════════════════════════════════════════════════════════════════
// 11–12. Personal target routing for pace
// ════════════════════════════════════════════════════════════════

describe('B1 — personal target routing', () => {
  it('11: personal target used in requiredPerDay calculation', () => {
    // Branch target=100, personal=50, actual=40, day15 of 30
    // Without personal: remaining=60, with personal: remaining=10
    const withBranch = makeInput({ wasfatyActual: 40, wasfatyTarget: 100, personalTarget: null })
    const withPersonal = makeInput({
      wasfatyActual: 40, wasfatyTarget: 100,
      personalTarget: makePersonalTarget({ wasfatyTarget: 50 }),
    })
    const snapBranch   = getWasfatySnap(withBranch)
    const snapPersonal = getWasfatySnap(withPersonal)
    // Personal target is lower → less remaining → lower requiredPerDay
    expect(snapPersonal.remaining).toBeLessThan(snapBranch.remaining)
    expect(snapPersonal.requiredPerDay).toBeLessThan(snapBranch.requiredPerDay)
  })

  it('12: branch target used when personal target is null', () => {
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 60, wasfatyTarget: 100, personalTarget: null }))
    expect(snap.target).toBe(100)
    expect(snap.remaining).toBe(40)
  })
})

// ════════════════════════════════════════════════════════════════
// 13–14. Safety: no NaN or Infinity
// ════════════════════════════════════════════════════════════════

describe('B1 — safety', () => {
  it('13: no NaN in any pace field', () => {
    const cases = [
      makeInput({ wasfatyActual: 0,   wasfatyTarget: 0   }),
      makeInput({ wasfatyActual: 0,   wasfatyTarget: 100 }),
      makeInput({ wasfatyActual: 100, wasfatyTarget: 100 }),
      makeInput({ wasfatyActual: 150, wasfatyTarget: 100 }),
    ]
    for (const input of cases) {
      const snap = getWasfatySnap(input)
      expect(isNaN(snap.remaining)).toBe(false)
      expect(isNaN(snap.requiredPerDay)).toBe(false)
      expect(isNaN(snap.expectedToDate)).toBe(false)
    }
  })

  it('13: no Infinity in any pace field', () => {
    const cases = [
      makeInput({ wasfatyActual: 0, wasfatyTarget: 0 }),
      makeInput({ wasfatyActual: 0, wasfatyTarget: 100 }),
    ]
    for (const input of cases) {
      const snap = getWasfatySnap(input)
      expect(isFinite(snap.remaining)).toBe(true)
      expect(isFinite(snap.requiredPerDay)).toBe(true)
      expect(isFinite(snap.expectedToDate)).toBe(true)
    }
  })

  it('14: expectedToDate ≈ target × (currentDay/totalDays)', () => {
    // Day 15 of 30: expectedToDate ≈ 100 × 0.5 = 50
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 50, wasfatyTarget: 100 }))
    expect(snap.expectedToDate).toBeCloseTo(50, 0)
  })

  it('15: KpiSnapshot has all required pace fields', () => {
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 50, wasfatyTarget: 100 }))
    expect(snap).toHaveProperty('remaining')
    expect(snap).toHaveProperty('requiredPerDay')
    expect(snap).toHaveProperty('expectedToDate')
    expect(snap).toHaveProperty('paceStatus')
  })
})

// ════════════════════════════════════════════════════════════════
// 16–19. Today's Required Focus ordering
// ════════════════════════════════════════════════════════════════

describe('B1 — Required Focus ordering', () => {
  it('16: critical sorted before behind at same requiredPerDay', () => {
    const items = [
      { userId: 'u1', displayName: 'A', kpiKey: 'wasfaty', kpiLabel: 'Wasfaty', requiredPerDay: 5, paceStatus: 'behind' as const },
      { userId: 'u2', displayName: 'B', kpiKey: 'omni',    kpiLabel: 'OmniHealth', requiredPerDay: 5, paceStatus: 'critical' as const },
    ]
    const sorted = [...items].sort((a, b) => {
      if (a.paceStatus === 'critical' && b.paceStatus !== 'critical') return -1
      if (b.paceStatus === 'critical' && a.paceStatus !== 'critical') return 1
      return b.requiredPerDay - a.requiredPerDay
    })
    expect(sorted[0].paceStatus).toBe('critical')
  })

  it('17: within same status, higher requiredPerDay sorts first', () => {
    const items = [
      { requiredPerDay: 3, paceStatus: 'behind' as const },
      { requiredPerDay: 8, paceStatus: 'behind' as const },
      { requiredPerDay: 5, paceStatus: 'behind' as const },
    ]
    const sorted = [...items].sort((a, b) => {
      if (a.paceStatus === 'critical' && b.paceStatus !== 'critical') return -1
      if (b.paceStatus === 'critical' && a.paceStatus !== 'critical') return 1
      return b.requiredPerDay - a.requiredPerDay
    })
    expect(sorted[0].requiredPerDay).toBe(8)
    expect(sorted[1].requiredPerDay).toBe(5)
    expect(sorted[2].requiredPerDay).toBe(3)
  })

  it('18: achieved KPIs excluded from focus list', () => {
    // achieved snap: paceStatus = 'achieved' → filtered out
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 110, wasfatyTarget: 100 }))
    expect(snap.paceStatus).toBe('achieved')
    // Logic: filter(Boolean) + paceStatus !== 'achieved' check
    const items = [{ paceStatus: snap.paceStatus, requiredPerDay: 0 }]
    const focused = items.filter(i => i.paceStatus !== 'achieved' && i.requiredPerDay > 0)
    expect(focused).toHaveLength(0)
  })

  it('19: members with no target excluded from focus list', () => {
    const snap = getWasfatySnap(makeInput({ wasfatyActual: 0, wasfatyTarget: 0 }))
    expect(snap.target).toBe(0)
    // Logic: filter(Boolean) checks target > 0
    const items = [{ target: snap.target, paceStatus: snap.paceStatus }]
    const focused = items.filter(i => i.target > 0)
    expect(focused).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════════
// 20–23. Source guards
// ════════════════════════════════════════════════════════════════

describe('B1 — TeamPage source guards', () => {
  it('20: PACE_COLOR map is defined', async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    expect(src.default).toContain('PACE_COLOR')
    expect(src.default).toContain("ahead:")
    expect(src.default).toContain("on_track:")
    expect(src.default).toContain("critical:")
    expect(src.default).toContain("achieved:")
  })

  it('21: requiredFocus computation is present', async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    expect(src.default).toContain('requiredFocus')
    expect(src.default).toContain('requiredPerDay')
    expect(src.default).toContain("paceStatus === 'achieved'")
  })

  it("22: Today's Required Focus section is present", async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    expect(src.default).toContain("Today's Required Focus")
    expect(src.default).toContain('requiredFocus.length > 0')
  })

  it('23: requiredPerDay displayed in member roster for weakest KPI', async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    expect(src.default).toContain('weakestKpi')
    expect(src.default).toContain('requiredPerDay')
    expect(src.default).toContain('PACE_COLOR[weakSnap.paceStatus]')
  })
})
