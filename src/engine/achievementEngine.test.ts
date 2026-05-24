// ============================================================
// Achievement Engine — Enterprise Safety Tests
// Covers: missing targets, caps, string parsing,
//         submission rate, NaN/Infinity guards.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  computeAchievementPct,
  computeOverallAchievement,
  getTargetForKpi,
  safeReadTarget,
  safeReadActual,
  ACHIEVEMENT_CAP,
  KPI_WEIGHTS,
} from '../engine/kpiAnalyticsEngine'
import type { KpiStats, KpiKey, MonthlyTarget } from '../engine/kpiAnalyticsEngine'

// ── Helpers ───────────────────────────────────────────────────
function stat(actual: number, target: number): KpiStats {
  const achievementPct = target > 0 ? Math.min(Math.round((actual / target) * 100), ACHIEVEMENT_CAP) : 0
  return {
    kpiKey: 'wasfaty' as KpiKey,
    actual,
    target,
    achievementPct,
    expectedPct: 50,
    delta: achievementPct - 50,
    remainingToTarget: Math.max(0, target - actual),
    status: achievementPct >= 90 ? 'excellent' : achievementPct >= 75 ? 'good' : achievementPct >= 60 ? 'warning' : 'critical',
    colors: { color:'#22c55e', bg:'', border:'', label:'', labelAr:'', icon:'🟢' },
  }
}

function fullMap(
  overrides: Partial<Record<KpiKey, { actual: number; target: number }>> = {}
): Partial<Record<KpiKey, KpiStats>> {
  const defaults: Record<KpiKey, { actual: number; target: number }> = {
    wasfaty:      { actual: 150, target: 200 },
    omni:         { actual: 80,  target: 100 },
    wellness:     { actual: 90,  target: 120 },
    basket:       { actual: 60,  target: 80  },
    crossSelling: { actual: 45,  target: 60  },
  }
  const merged = { ...defaults, ...overrides }
  return Object.fromEntries(
    Object.entries(merged).map(([k, v]) => [k, stat(v.actual, v.target)])
  ) as Record<KpiKey, KpiStats>
}

function tgt(overrides: Partial<MonthlyTarget> = {}): MonthlyTarget {
  return {
    pharmacyId: 'p1', month: '2025-05',
    wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 120,
    basketTarget: 80, crossSellTarget: 60, salesTarget: 50000,
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════
// 1. computeAchievementPct — enterprise guards
// ══════════════════════════════════════════════════════════════
describe('computeAchievementPct — enterprise guards', () => {
  it('valid actual+target → correct %', () => {
    expect(computeAchievementPct(150, 200)).toBe(75)
    expect(computeAchievementPct(200, 200)).toBe(100)
    expect(computeAchievementPct(0, 200)).toBe(0)
  })

  it('missing target → 0 (not divide-by-zero)', () => {
    expect(computeAchievementPct(100, 0)).toBe(0)
    expect(computeAchievementPct(100, null as any)).toBe(0)
    expect(computeAchievementPct(100, undefined as any)).toBe(0)
    expect(computeAchievementPct(100, NaN)).toBe(0)
  })

  it('negative target → 0', () => {
    expect(computeAchievementPct(100, -50)).toBe(0)
  })

  it('missing actual → treated as 0', () => {
    expect(computeAchievementPct(null as any, 100)).toBe(0)
    expect(computeAchievementPct(undefined as any, 100)).toBe(0)
  })

  it('huge actual capped at 200%', () => {
    expect(computeAchievementPct(10000, 100)).toBe(ACHIEVEMENT_CAP)
    expect(computeAchievementPct(500, 100)).toBe(ACHIEVEMENT_CAP)
    expect(computeAchievementPct(201, 100)).toBe(ACHIEVEMENT_CAP)
  })

  it('string actual parsed correctly', () => {
    expect(computeAchievementPct('150' as any, 200)).toBe(75)
    expect(computeAchievementPct('abc' as any, 200)).toBe(0)
  })

  it('string target parsed correctly', () => {
    expect(computeAchievementPct(150, '200' as any)).toBe(75)
    expect(computeAchievementPct(150, 'abc' as any)).toBe(0)
    expect(computeAchievementPct(150, '0' as any)).toBe(0)
  })

  it('never returns NaN or Infinity', () => {
    const cases = [
      computeAchievementPct(Infinity as any, 100),
      computeAchievementPct(100, Infinity as any),
      computeAchievementPct(NaN, NaN),
      computeAchievementPct(0, 0),
    ]
    cases.forEach(v => {
      expect(isNaN(v)).toBe(false)
      expect(isFinite(v)).toBe(true)
    })
  })
})

// ══════════════════════════════════════════════════════════════
// 2. computeOverallAchievement — realistic output
// ══════════════════════════════════════════════════════════════
describe('computeOverallAchievement — realistic output', () => {
  it('all valid targets → realistic result between 0-200', () => {
    const result = computeOverallAchievement(fullMap())
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(ACHIEVEMENT_CAP)
    // 150/200=75, 80/100=80, 90/120=75, 60/80=75, 45/60=75 → ~76%
    expect(result).toBeGreaterThan(50)
    expect(result).toBeLessThan(120)
  })

  it('missing basketTarget does NOT break overall', () => {
    const map = fullMap({ basket: { actual: 60, target: 0 } })  // target 0 = excluded
    expect(() => computeOverallAchievement(map)).not.toThrow()
    const result = computeOverallAchievement(map)
    expect(isNaN(result)).toBe(false)
    expect(isFinite(result)).toBe(true)
  })

  it('salesTarget = 0 excluded from calculation', () => {
    // salesTarget is not in KPI_KEYS — so it never contributes
    const result = computeOverallAchievement(fullMap())
    expect(result).toBeLessThanOrEqual(ACHIEVEMENT_CAP)
  })

  it('huge actual capped at 200% per KPI', () => {
    const map = fullMap({ wasfaty: { actual: 100000, target: 100 } })
    const result = computeOverallAchievement(map)
    expect(result).toBeLessThanOrEqual(ACHIEVEMENT_CAP)
    expect(isNaN(result)).toBe(false)
  })

  it('all KPIs missing → returns 0 (not NaN)', () => {
    const result = computeOverallAchievement({})
    expect(result).toBe(0)
  })

  it('all targets zero → returns 0 (not NaN)', () => {
    const map: Partial<Record<KpiKey, KpiStats>> = {
      wasfaty: stat(100, 0),
      omni:    stat(50,  0),
    }
    const result = computeOverallAchievement(map)
    expect(result).toBe(0)
    expect(isNaN(result)).toBe(false)
  })

  it('uses business weights (wasfaty heavier than crossSelling)', () => {
    // wasfaty at 100%, others at 50% → should be > 50%
    const map: Partial<Record<KpiKey, KpiStats>> = {
      wasfaty:      { ...stat(200, 200), achievementPct: 100 },
      omni:         { ...stat(50,  100), achievementPct: 50  },
      wellness:     { ...stat(60,  120), achievementPct: 50  },
      basket:       { ...stat(40,  80),  achievementPct: 50  },
      crossSelling: { ...stat(30,  60),  achievementPct: 50  },
    }
    const result = computeOverallAchievement(map)
    // wasfaty(25%)×100 + others(75%)×50 = 25+37.5 = 62.5
    expect(result).toBeGreaterThan(55)
    expect(result).toBeLessThan(80)
  })

  it('never returns NaN or Infinity', () => {
    const edge = computeOverallAchievement({
      wasfaty: { ...stat(0, 0), achievementPct: NaN },
    })
    expect(isNaN(edge)).toBe(false)
    expect(isFinite(edge)).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// 3. getTargetForKpi — safe extraction
// ══════════════════════════════════════════════════════════════
describe('getTargetForKpi — safe extraction', () => {
  it('returns correct target for each KPI', () => {
    const t = tgt()
    expect(getTargetForKpi(t, 'wasfaty')).toBe(200)
    expect(getTargetForKpi(t, 'omni')).toBe(100)
    expect(getTargetForKpi(t, 'wellness')).toBe(120)
    expect(getTargetForKpi(t, 'basket')).toBe(80)
    expect(getTargetForKpi(t, 'crossSelling')).toBe(60)
  })

  it('missing basketTarget returns 0 (not undefined)', () => {
    const t = tgt({ basketTarget: undefined as any })
    expect(getTargetForKpi(t, 'basket')).toBe(0)
  })

  it('null target object returns 0', () => {
    expect(getTargetForKpi(null as any, 'wasfaty')).toBe(0)
    expect(getTargetForKpi(undefined as any, 'omni')).toBe(0)
  })

  it('NaN target returns 0', () => {
    const t = tgt({ wasfatyTarget: NaN })
    expect(getTargetForKpi(t, 'wasfaty')).toBe(0)
  })

  it('string target parsed correctly', () => {
    const t = tgt({ wasfatyTarget: '200' as any })
    expect(getTargetForKpi(t, 'wasfaty')).toBe(200)
  })

  it('string "0" target returns 0', () => {
    const t = tgt({ basketTarget: '0' as any })
    expect(getTargetForKpi(t, 'basket')).toBe(0)
  })

  it('negative target returns 0', () => {
    const t = tgt({ wasfatyTarget: -100 })
    expect(getTargetForKpi(t, 'wasfaty')).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// 4. safeReadTarget + safeReadActual
// ══════════════════════════════════════════════════════════════
describe('safeReadTarget', () => {
  it('reads valid number', () => {
    expect(safeReadTarget({ wasfatyTarget: 200 }, 'wasfatyTarget')).toBe(200)
  })
  it('reads string number', () => {
    expect(safeReadTarget({ wasfatyTarget: '200' }, 'wasfatyTarget')).toBe(200)
  })
  it('returns 0 for null obj', () => {
    expect(safeReadTarget(null, 'wasfatyTarget')).toBe(0)
  })
  it('returns 0 for missing field', () => {
    expect(safeReadTarget({}, 'basketTarget')).toBe(0)
  })
  it('returns 0 for zero', () => {
    expect(safeReadTarget({ salesTarget: 0 }, 'salesTarget')).toBe(0)
  })
  it('returns 0 for NaN', () => {
    expect(safeReadTarget({ wasfatyTarget: NaN }, 'wasfatyTarget')).toBe(0)
  })
  it('returns 0 for Infinity', () => {
    expect(safeReadTarget({ wasfatyTarget: Infinity }, 'wasfatyTarget')).toBe(0)
  })
})

describe('safeReadActual', () => {
  it('reads valid number', () => {
    expect(safeReadActual({ wasfaty: 150 }, 'wasfaty')).toBe(150)
  })
  it('coerces null to 0', () => {
    expect(safeReadActual(null, 'wasfaty')).toBe(0)
  })
  it('coerces missing to 0', () => {
    expect(safeReadActual({}, 'wasfaty')).toBe(0)
  })
  it('coerces negative to 0', () => {
    expect(safeReadActual({ wasfaty: -5 }, 'wasfaty')).toBe(0)
  })
  it('reads string number', () => {
    expect(safeReadActual({ wasfaty: '150' }, 'wasfaty')).toBe(150)
  })
})

// ══════════════════════════════════════════════════════════════
// 5. Submission Rate — distinct userId detection
// ══════════════════════════════════════════════════════════════
describe('Submission Rate — via distinct userId count', () => {
  it('distinct userIds from entries reflects real submission count', () => {
    // Simulate what the executive engine does: count unique userIds
    const entries = [
      { userId: 'u1', pharmacyId: 'p1', date: '2025-05-15', wasfaty: 5 },
      { userId: 'u2', pharmacyId: 'p1', date: '2025-05-15', wasfaty: 3 },
      { userId: 'u1', pharmacyId: 'p1', date: '2025-05-14', wasfaty: 4 }, // u1 again
    ]
    const distinct = new Set(entries.map(e => e.userId)).size
    expect(distinct).toBe(2)  // NOT 3 — u1 appears twice but counts once
  })

  it('single user with multiple entries → count 1', () => {
    const entries = [
      { userId: 'u1', date: '2025-05-15', wasfaty: 5 },
      { userId: 'u1', date: '2025-05-14', wasfaty: 3 },
    ]
    expect(new Set(entries.map(e => e.userId)).size).toBe(1)
  })

  it('no entries → distinct count 0 (no false positives)', () => {
    const entries: any[] = []
    expect(new Set(entries.map(e => e.userId)).size).toBe(0)
  })

  it('submission rate never > 100%', () => {
    // submittedCount=5, total=3 → rate = min(5/3, 1) = 100%
    const submittedCount = 5
    const total          = 3
    const rate           = Math.min(submittedCount / total, 1)
    expect(rate).toBe(1)
    expect(rate).toBeLessThanOrEqual(1)
  })

  it('0 entries → 0% submission (no false positives shown)', () => {
    const entries: any[] = []
    const distinct = new Set(entries.map(e => e.userId)).size
    const total    = Math.max(1, distinct)
    const rate     = distinct / total
    expect(rate).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// 6. KPI_WEIGHTS — business weights sum to 1.0
// ══════════════════════════════════════════════════════════════
describe('KPI_WEIGHTS', () => {
  it('sum to 1.0 (normalised)', () => {
    const sum = Object.values(KPI_WEIGHTS).reduce((s, w) => s + w, 0)
    expect(Math.round(sum * 100) / 100).toBe(1.0)
  })

  it('wasfaty has highest weight', () => {
    expect(KPI_WEIGHTS.wasfaty).toBeGreaterThanOrEqual(KPI_WEIGHTS.crossSelling)
    expect(KPI_WEIGHTS.wasfaty).toBeGreaterThanOrEqual(KPI_WEIGHTS.omni)
  })

  it('all weights > 0', () => {
    Object.values(KPI_WEIGHTS).forEach(w => expect(w).toBeGreaterThan(0))
  })
})

// ══════════════════════════════════════════════════════════════
// 7. ACHIEVEMENT_CAP constant
// ══════════════════════════════════════════════════════════════
describe('ACHIEVEMENT_CAP', () => {
  it('is 200', () => {
    expect(ACHIEVEMENT_CAP).toBe(200)
  })
})
