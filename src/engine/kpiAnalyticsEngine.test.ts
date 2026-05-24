// ============================================================
// KPI Analytics Engine — Unit Tests (run with: npx vitest)
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  getDayProgress,
  computeAchievementPct,
  getTrafficLight,
  computeRemainingToTarget,
  computePace,
  computeForecast,
  computeGapAnalysis,
  computeTrendDirection,
  computeRiskLevel,
  findWeakestKpi,
  computeOverallAchievement,
  buildPharmacistProfile,
  buildDailyMission,
  KpiStats,
} from './kpiAnalyticsEngine'

// ── Mock date: Day 15 of a 30-day month ──────────────────────
function mockDate(day = 15): Date {
  return new Date(2025, 4, day)   // May 2025 (30 days)
}

// ── getDayProgress ────────────────────────────────────────────
describe('getDayProgress', () => {
  it('returns correct values for day 15 of 30', () => {
    const dp = getDayProgress(mockDate(15))
    expect(dp.currentDay).toBe(15)
    expect(dp.totalDays).toBe(31)  // May has 31 days
    expect(dp.daysRemaining).toBe(16)
    expect(dp.ratio).toBeCloseTo(15 / 31, 2)
  })

  it('returns 100% pct on last day', () => {
    const dp = getDayProgress(mockDate(31))
    expect(dp.ratio).toBeCloseTo(1, 2)
  })
})

// ── computeAchievementPct ─────────────────────────────────────
describe('computeAchievementPct', () => {
  it('returns 50% when actual = half target', () => {
    expect(computeAchievementPct(50, 100)).toBe(50)
  })
  it('returns 0 when target is 0', () => {
    expect(computeAchievementPct(50, 0)).toBe(0)
  })
  it('returns 120 when exceeding target', () => {
    expect(computeAchievementPct(120, 100)).toBe(120)
  })
})

// ── getTrafficLight ───────────────────────────────────────────
describe('getTrafficLight', () => {
  // dayRatio = 0.5 → expected = 50%
  const dr = 0.5
  it('excellent when ahead by +5%', () => {
    expect(getTrafficLight(56, dr)).toBe('excellent')  // 56 - 50 = +6
  })
  it('good when within ±5%', () => {
    expect(getTrafficLight(52, dr)).toBe('good')       // 52 - 50 = +2
    expect(getTrafficLight(47, dr)).toBe('good')       // 47 - 50 = -3
  })
  it('warning when behind 5–15%', () => {
    expect(getTrafficLight(40, dr)).toBe('warning')    // 40 - 50 = -10
  })
  it('critical when behind > 15%', () => {
    expect(getTrafficLight(30, dr)).toBe('critical')   // 30 - 50 = -20
  })
})

// ── computeRemainingToTarget ──────────────────────────────────
describe('computeRemainingToTarget', () => {
  it('returns positive when behind', () => {
    expect(computeRemainingToTarget(80, 200)).toBe(120)
  })
  it('returns 0 when at or above target', () => {
    expect(computeRemainingToTarget(200, 200)).toBe(0)
    expect(computeRemainingToTarget(250, 200)).toBe(0)
  })
})

// ── computePace ───────────────────────────────────────────────
describe('computePace', () => {
  it('ON_PACE when current rate matches required', () => {
    const dp = getDayProgress(mockDate(15))
    // target=300, actual=150 → current=10/day, required=150/16=9.375
    const result = computePace(150, 300, dp)
    expect(result.paceStatus).toBe('ON_PACE')
    expect(result.paceRatio).toBeGreaterThanOrEqual(0.95)
  })

  it('CRITICAL when pace ratio < 0.5', () => {
    const dp = getDayProgress(mockDate(15))
    // target=300, actual=20 → current=~1.3/day, required=~17.5/day → ratio~0.07
    const result = computePace(20, 300, dp)
    expect(result.paceStatus).toBe('CRITICAL')
  })

  it('EXCEEDING when well ahead', () => {
    const dp = getDayProgress(mockDate(15))
    // target=100, actual=100 → remaining=0
    const result = computePace(100, 100, dp)
    expect(result.requiredDailyPace).toBe(0)
    expect(result.paceStatus).toBe('EXCEEDING')
  })
})

// ── computeForecast ───────────────────────────────────────────
describe('computeForecast', () => {
  it('projects correct EOM at steady rate', () => {
    const dp = getDayProgress(mockDate(15))
    // actual=150, day 15 → rate=10/day → forecast = 10 × 31 = 310
    const result = computeForecast(150, 200, dp)
    expect(result.forecastEOM).toBe(310)
    expect(result.forecastAchPct).toBe(155)  // 310/200×100
  })

  it('optimistic > realistic > pessimistic', () => {
    const dp = getDayProgress(mockDate(10))
    const result = computeForecast(100, 300, dp)
    expect(result.optimistic).toBeGreaterThan(result.realistic)
    expect(result.realistic).toBeGreaterThan(result.pessimistic)
  })
})

// ── computeGapAnalysis ────────────────────────────────────────
describe('computeGapAnalysis', () => {
  it('negative relativeGapPct when behind expected', () => {
    const dp  = getDayProgress(mockDate(15))
    // expected = 200 × 0.484 ≈ 96, actual = 70
    const gap = computeGapAnalysis(70, 200, dp)
    expect(gap.relativeGapPct).toBeLessThan(0)
  })

  it('absoluteGap = target - actual', () => {
    const dp  = getDayProgress(mockDate(15))
    const gap = computeGapAnalysis(80, 200, dp)
    expect(gap.absoluteGap).toBe(120)
  })
})

// ── computeTrendDirection ─────────────────────────────────────
describe('computeTrendDirection', () => {
  it('ACCELERATING when recent > previous by > 5%', () => {
    const previous = Array(7).fill(10)
    const recent   = Array(7).fill(12)   // +20%
    expect(computeTrendDirection([...previous, ...recent])).toBe('ACCELERATING')
  })

  it('DETERIORATING when recent < previous by > 5%', () => {
    const previous = Array(7).fill(10)
    const recent   = Array(7).fill(8)    // -20%
    expect(computeTrendDirection([...previous, ...recent])).toBe('DETERIORATING')
  })

  it('STABLE with no data change', () => {
    const values = Array(14).fill(10)
    expect(computeTrendDirection(values)).toBe('STABLE')
  })
})

// ── computeRiskLevel ─────────────────────────────────────────
describe('computeRiskLevel', () => {
  it('HIGH_RISK when 3+ critical', () => {
    expect(computeRiskLevel(['critical','critical','critical','good','good']))
      .toBe('HIGH_RISK')
  })
  it('MEDIUM_RISK when 1 critical', () => {
    expect(computeRiskLevel(['critical','good','good','good','good']))
      .toBe('MEDIUM_RISK')
  })
  it('LOW_RISK when 1 warning', () => {
    expect(computeRiskLevel(['warning','good','good','good','good']))
      .toBe('LOW_RISK')
  })
  it('ON_TRACK when all good/excellent', () => {
    expect(computeRiskLevel(['good','excellent','good','excellent','good']))
      .toBe('ON_TRACK')
  })
})

// ── findWeakestKpi ────────────────────────────────────────────
describe('findWeakestKpi', () => {
  it('returns the KPI with lowest achievementPct', () => {
    const map: Partial<Record<string, KpiStats>> = {
      wasfaty:      { achievementPct: 90 } as KpiStats,
      omni:         { achievementPct: 45 } as KpiStats,  // weakest
      wellness:     { achievementPct: 80 } as KpiStats,
      basket:       { achievementPct: 70 } as KpiStats,
      crossSelling: { achievementPct: 95 } as KpiStats,
    }
    expect(findWeakestKpi(map as any)).toBe('omni')
  })
})

// ── computeOverallAchievement ─────────────────────────────────
describe('computeOverallAchievement', () => {
  it('returns business-weighted average excluding zero-target KPIs', () => {
    // Must include target > 0 for KPI to be counted
    const map: Partial<Record<string, KpiStats>> = {
      wasfaty:      { achievementPct: 100, target: 200 } as KpiStats,
      omni:         { achievementPct: 80,  target: 100 } as KpiStats,
      wellness:     { achievementPct: 60,  target: 120 } as KpiStats,
      basket:       { achievementPct: 40,  target: 80  } as KpiStats,
      crossSelling: { achievementPct: 20,  target: 60  } as KpiStats,
    }
    // wasfaty(0.25)×100 + omni(0.20)×80 + wellness(0.20)×60 + basket(0.20)×40 + crossSelling(0.15)×20 = 64
    const result = computeOverallAchievement(map as any)
    expect(result).toBe(64)
  })

  it('excludes KPI when target is 0 or missing', () => {
    const map: Partial<Record<string, KpiStats>> = {
      wasfaty: { achievementPct: 100, target: 200 } as KpiStats,
      omni:    { achievementPct: 80,  target: 0   } as KpiStats,  // excluded
    }
    // Only wasfaty counts (weight=0.25/0.25=1.0) → 100%
    expect(computeOverallAchievement(map as any)).toBe(100)
  })
})

// ── buildPharmacistProfile ────────────────────────────────────
describe('buildPharmacistProfile', () => {
  it('builds a complete profile with no target', () => {
    const entries = [
      { userId:'u1', pharmacyId:'p1', date:'2025-05-01', wasfaty:5, omni:3, wellness:4, basket:200, crossSelling:2 },
      { userId:'u1', pharmacyId:'p1', date:'2025-05-02', wasfaty:7, omni:4, wellness:3, basket:180, crossSelling:3 },
    ]
    const profile = buildPharmacistProfile('u1', entries, null, entries, mockDate(15))
    expect(profile.pharmacistId).toBe('u1')
    expect(profile.kpiAnalyses).toHaveLength(5)
    expect(profile.mission).toBeTruthy()
    expect(profile.overallAch).toBeGreaterThanOrEqual(0)
  })
})

// ── buildDailyMission ─────────────────────────────────────────
describe('buildDailyMission', () => {
  it('mission focuses on weakest KPI', () => {
    const statsMap: Partial<Record<string, KpiStats>> = {
      wasfaty:      { achievementPct:90, remainingToTarget:10, target:100 } as KpiStats,
      omni:         { achievementPct:30, remainingToTarget:70, target:100 } as KpiStats,
      wellness:     { achievementPct:80, remainingToTarget:20, target:100 } as KpiStats,
      basket:       { achievementPct:75, remainingToTarget:25, target:100 } as KpiStats,
      crossSelling: { achievementPct:85, remainingToTarget:15, target:100 } as KpiStats,
    }
    const mission = buildDailyMission(statsMap as any, {})
    expect(mission?.focusKpi).toBe('omni')
    expect(mission?._aiReady).toBe(true)
  })
})
