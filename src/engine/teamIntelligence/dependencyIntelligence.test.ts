// ============================================================
// Unit tests — Dependency Intelligence Engine
// Sprint 1: Team Dependency Intelligence + Single Performer Risk
//
// Covers:
//   1. computeTier — threshold boundaries
//   2. computeDependencyIntelligence — KPI scope filtering
//   3. computeDependencyIntelligence — per-KPI dependency entry
//   4. computeDependencyIntelligence — branch roll-up (max severity)
//   5. computeDependencyIntelligence — summary text by tier
//   6. computeDependencyIntelligence — counts correctness
//   7. computeDependencyIntelligence — edge cases
// ============================================================

import { describe, it, expect } from 'vitest'
import { computeTier, computeDependencyIntelligence } from './dependencyIntelligenceEngine'
import type { KpiContributionEntry } from '../branchIntelligence/branchIntelligenceTypes'

// ── Test fixture helpers ────────────────────────────────────────

function mkEntry(
  pharmacistId: string,
  pharmacistName: string,
  actual: number,
  contributionPct: number,
  isTopContributor = false,
): KpiContributionEntry {
  return {
    pharmacistId,
    pharmacistName,
    actual,
    target:              100,
    achievementPct:      contributionPct,
    contributionPct,
    contributionRank:    isTopContributor ? 1 : 2,
    isLowestContributor: false,
    isTopContributor,
    paceStatus:          'critical',
  }
}

// Minimal valid contributionByKpi with one active KPI (two pharmacists, 60/40 split)
const FIFTY_FIFTY = [
  mkEntry('p1', 'Dr. Samir',  50, 50, true),
  mkEntry('p2', 'Dr. Hend',   50, 50, false),
]

const HIGH_CONCENTRATION = [
  mkEntry('p1', 'Dr. Ahmed',  70, 70, true),
  mkEntry('p2', 'Dr. Layla',  30, 30, false),
]

const CRITICAL_CONCENTRATION = [
  mkEntry('p1', 'Dr. Samir',  85, 85, true),
  mkEntry('p2', 'Dr. Hend',   15, 15, false),
]

const SOLO_PHARMACIST = [
  mkEntry('p1', 'Dr. Samir', 100, 100, true),
]

const INACTIVE_ENTRIES = [
  mkEntry('p1', 'Dr. Samir', 0, 0, false),
  mkEntry('p2', 'Dr. Hend',  0, 0, false),
]

// ══════════════════════════════════════════════════════════════
// Section 1 — computeTier boundary tests
// ══════════════════════════════════════════════════════════════

describe('computeTier — thresholds', () => {
  it('0% → healthy', () => {
    expect(computeTier(0)).toBe('healthy')
  })

  it('39.9% → healthy', () => {
    expect(computeTier(39.9)).toBe('healthy')
  })

  it('40% → moderate', () => {
    expect(computeTier(40)).toBe('moderate')
  })

  it('59.9% → moderate', () => {
    expect(computeTier(59.9)).toBe('moderate')
  })

  it('60% → high', () => {
    expect(computeTier(60)).toBe('high')
  })

  it('79.9% → high', () => {
    expect(computeTier(79.9)).toBe('high')
  })

  it('80% → critical', () => {
    expect(computeTier(80)).toBe('critical')
  })

  it('100% → critical', () => {
    expect(computeTier(100)).toBe('critical')
  })
})

// ══════════════════════════════════════════════════════════════
// Section 2 — KPI scope filtering
// ══════════════════════════════════════════════════════════════

describe('computeDependencyIntelligence — KPI scope filtering', () => {
  it('excludes KPIs with totalActual = 0', () => {
    const result = computeDependencyIntelligence({
      wasfaty:      FIFTY_FIFTY,
      omni:         INACTIVE_ENTRIES,  // total actual = 0 → excluded
    })
    expect(result.kpiDependencies).toHaveLength(1)
    expect(result.kpiDependencies[0].kpiKey).toBe('wasfaty')
  })

  it('includes KPIs with at least one pharmacist with actual > 0', () => {
    const oneActive = [
      mkEntry('p1', 'Dr. Samir', 100, 100, true),
      mkEntry('p2', 'Dr. Hend',    0,   0, false),
    ]
    const result = computeDependencyIntelligence({ wasfaty: oneActive })
    expect(result.kpiDependencies).toHaveLength(1)
  })

  it('returns empty kpiDependencies when all KPIs are inactive', () => {
    const result = computeDependencyIntelligence({ wasfaty: INACTIVE_ENTRIES })
    expect(result.kpiDependencies).toHaveLength(0)
    expect(result.branchDependencyTier).toBe('healthy')
  })

  it('returns empty result for empty contributionByKpi', () => {
    const result = computeDependencyIntelligence({})
    expect(result.kpiDependencies).toHaveLength(0)
    expect(result.branchDependencyTier).toBe('healthy')
    expect(result.criticalKpiCount).toBe(0)
    expect(result.highKpiCount).toBe(0)
    expect(result.moderateKpiCount).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// Section 3 — per-KPI dependency entry correctness
// ══════════════════════════════════════════════════════════════

describe('computeDependencyIntelligence — per-KPI entry', () => {
  it('50/50 split → highestContributionPct = 50, tier = moderate', () => {
    const result = computeDependencyIntelligence({ wasfaty: FIFTY_FIFTY })
    const entry = result.kpiDependencies[0]
    expect(entry.highestContributionPct).toBe(50)
    expect(entry.dependencyTier).toBe('moderate')
  })

  it('70/30 split → highestContributionPct = 70, tier = high', () => {
    const result = computeDependencyIntelligence({ wasfaty: HIGH_CONCENTRATION })
    const entry = result.kpiDependencies[0]
    expect(entry.highestContributionPct).toBe(70)
    expect(entry.dependencyTier).toBe('high')
  })

  it('85/15 split → highestContributionPct = 85, tier = critical', () => {
    const result = computeDependencyIntelligence({ wasfaty: CRITICAL_CONCENTRATION })
    const entry = result.kpiDependencies[0]
    expect(entry.highestContributionPct).toBe(85)
    expect(entry.dependencyTier).toBe('critical')
  })

  it('solo pharmacist → 100% → critical', () => {
    const result = computeDependencyIntelligence({ wasfaty: SOLO_PHARMACIST })
    const entry = result.kpiDependencies[0]
    expect(entry.highestContributionPct).toBe(100)
    expect(entry.dependencyTier).toBe('critical')
    expect(entry.teamSize).toBe(1)
  })

  it('populates topContributorName from isTopContributor entry', () => {
    const result = computeDependencyIntelligence({ wasfaty: HIGH_CONCENTRATION })
    const entry = result.kpiDependencies[0]
    expect(entry.topContributorName).toBe('Dr. Ahmed')
    expect(entry.topContributorId).toBe('p1')
  })

  it('topContributorName is null when no entry has isTopContributor = true', () => {
    const entries = [
      mkEntry('p1', 'Dr. Samir', 60, 60, false),
      mkEntry('p2', 'Dr. Hend',  40, 40, false),
    ]
    const result = computeDependencyIntelligence({ wasfaty: entries })
    expect(result.kpiDependencies[0].topContributorName).toBeNull()
  })

  it('teamSize reflects number of entries for that KPI', () => {
    const result = computeDependencyIntelligence({ wasfaty: HIGH_CONCENTRATION })
    expect(result.kpiDependencies[0].teamSize).toBe(2)
  })
})

// ══════════════════════════════════════════════════════════════
// Section 4 — branch-level roll-up (max severity wins)
// ══════════════════════════════════════════════════════════════

describe('computeDependencyIntelligence — branch roll-up', () => {
  it('all healthy KPIs → branchDependencyTier = healthy', () => {
    const result = computeDependencyIntelligence({
      wasfaty:      [mkEntry('p1', 'Dr. A', 60, 35, true), mkEntry('p2', 'Dr. B', 80, 35, false)],
      omni:         [mkEntry('p1', 'Dr. A', 50, 30, true), mkEntry('p2', 'Dr. B', 70, 35, false)],
    })
    expect(result.branchDependencyTier).toBe('healthy')
  })

  it('one critical KPI makes branch critical regardless of others', () => {
    const result = computeDependencyIntelligence({
      wasfaty:      FIFTY_FIFTY,             // moderate
      omni:         CRITICAL_CONCENTRATION,  // critical
    })
    expect(result.branchDependencyTier).toBe('critical')
  })

  it('high KPI without critical → branchDependencyTier = high', () => {
    const result = computeDependencyIntelligence({
      wasfaty:      FIFTY_FIFTY,          // moderate
      omni:         HIGH_CONCENTRATION,   // high
    })
    expect(result.branchDependencyTier).toBe('high')
  })

  it('moderate-only KPIs → branchDependencyTier = moderate', () => {
    const result = computeDependencyIntelligence({ wasfaty: FIFTY_FIFTY })
    expect(result.branchDependencyTier).toBe('moderate')
  })
})

// ══════════════════════════════════════════════════════════════
// Section 5 — KPI counts correctness
// ══════════════════════════════════════════════════════════════

describe('computeDependencyIntelligence — counts', () => {
  it('counts are correct across a mixed-tier set', () => {
    const healthy = [
      mkEntry('p1', 'Dr. A', 50, 30, true),
      mkEntry('p2', 'Dr. B', 50, 30, false),
      mkEntry('p3', 'Dr. C', 50, 25, false),
    ]
    const result = computeDependencyIntelligence({
      wasfaty:      CRITICAL_CONCENTRATION,  // critical
      omni:         HIGH_CONCENTRATION,      // high
      wellness:     FIFTY_FIFTY,             // moderate
      basket:       healthy,                 // healthy
    })
    expect(result.criticalKpiCount).toBe(1)
    expect(result.highKpiCount).toBe(1)
    expect(result.moderateKpiCount).toBe(1)
    expect(result.kpiDependencies).toHaveLength(4)
  })

  it('criticalKpiCount = 0 when no critical KPIs', () => {
    const result = computeDependencyIntelligence({ wasfaty: FIFTY_FIFTY })
    expect(result.criticalKpiCount).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// Section 6 — summary text
// ══════════════════════════════════════════════════════════════

describe('computeDependencyIntelligence — summaryText', () => {
  it('healthy tier → "No concentration risk" message', () => {
    const result = computeDependencyIntelligence({})
    expect(result.summaryText).toContain('No concentration risk')
  })

  it('critical tier → mentions pharmacist name when available', () => {
    const result = computeDependencyIntelligence({ wasfaty: CRITICAL_CONCENTRATION })
    expect(result.summaryText).toContain('Dr. Samir')
    expect(result.summaryText).toContain('1 KPI')
  })

  it('critical tier → neutral tone (no "carrying alone" phrasing)', () => {
    const result = computeDependencyIntelligence({ wasfaty: CRITICAL_CONCENTRATION })
    expect(result.summaryText).not.toContain('carrying alone')
    expect(result.summaryText).toContain('Consider improving team contribution balance')
  })

  it('high tier → mentions contribution concentration', () => {
    const result = computeDependencyIntelligence({ wasfaty: HIGH_CONCENTRATION })
    expect(result.summaryText).toContain('high contribution concentration')
  })

  it('moderate tier → mentions "moderate contribution concentration"', () => {
    const result = computeDependencyIntelligence({ wasfaty: FIFTY_FIFTY })
    expect(result.summaryText).toContain('moderate contribution concentration')
  })

  it('critical tier with multiple critical KPIs → plural phrasing', () => {
    const result = computeDependencyIntelligence({
      wasfaty: CRITICAL_CONCENTRATION,
      omni:    SOLO_PHARMACIST,
    })
    expect(result.summaryText).toContain('2 KPIs')
  })
})

// ══════════════════════════════════════════════════════════════
// Section 7 — edge cases
// ══════════════════════════════════════════════════════════════

describe('computeDependencyIntelligence — edge cases', () => {
  it('does not mutate the input contributionByKpi map', () => {
    const input = { wasfaty: [...HIGH_CONCENTRATION] }
    const originalLength = input.wasfaty.length
    computeDependencyIntelligence(input)
    expect(input.wasfaty).toHaveLength(originalLength)
  })

  it('handles entries with empty array gracefully', () => {
    const result = computeDependencyIntelligence({ wasfaty: [] })
    expect(result.kpiDependencies).toHaveLength(0)
  })

  it('contributionPct of exactly 40 → moderate (boundary inclusive)', () => {
    const at40 = [
      mkEntry('p1', 'Dr. A', 40, 40, true),
      mkEntry('p2', 'Dr. B', 60, 60, false),
    ]
    // highest is 60 → high; but for 40 explicitly:
    expect(computeTier(40)).toBe('moderate')
  })

  it('contributionPct of exactly 60 → high (boundary inclusive)', () => {
    expect(computeTier(60)).toBe('high')
  })

  it('contributionPct of exactly 80 → critical (boundary inclusive)', () => {
    expect(computeTier(80)).toBe('critical')
  })
})
