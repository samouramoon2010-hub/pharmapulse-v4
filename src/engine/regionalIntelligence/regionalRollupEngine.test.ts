// ============================================================
// Regional Rollup Engine — Unit Tests
// Covers: grouping, score average, weakest/strongest KPI,
//         high-risk concentration, inactive branch concentration,
//         recovery signals, data quality flags, empty input,
//         and edge cases.
// ============================================================

import { describe, it, expect } from 'vitest'
import { generateRegionalRollups }  from './regionalRollupEngine'
import type {
  BranchRollupSummary,
  KpiRollupSummary,
  RegionalMomentumDirection,
  RegionalRiskLevel,
  BranchOperationalStatus,
} from './regionalTypes'
import type { KpiKey } from '../kpiAnalyticsEngine'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const ALL_KPI_KEYS: KpiKey[] = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']

function makeKpiSummary(kpiKey: KpiKey, achievementPct: number, hasTarget = true): KpiRollupSummary {
  const actual = achievementPct  // treat as % for simplicity
  const target = hasTarget ? 100 : 0
  return {
    kpiKey,
    actual,
    target,
    achievementPct,
    expectedPct:       50,
    delta:             achievementPct - 50,
    remainingToTarget: Math.max(0, target - actual),
    status:            achievementPct >= 90 ? 'excellent' : achievementPct >= 75 ? 'good' : achievementPct >= 60 ? 'warning' : 'critical',
    hasTarget,
  }
}

function makeAllKpiSummaries(achievementPct: number, hasTarget = true): KpiRollupSummary[] {
  return ALL_KPI_KEYS.map((k) => makeKpiSummary(k, achievementPct, hasTarget))
}

let idSeq = 0
function makeBranchRollup(overrides: {
  branchId?:              string
  region?:                string
  operationalStatus?:     BranchOperationalStatus
  riskLevel?:             RegionalRiskLevel
  branchScore?:           number
  overallAchievementPct?: number
  momentumDirection?:     RegionalMomentumDirection
  kpiAchievements?:       KpiRollupSummary[]
  hasDataErrors?:         boolean
  submissionRatePct?:     number
} = {}): BranchRollupSummary {
  idSeq++
  const score = overrides.branchScore ?? 70
  return {
    branchId:              overrides.branchId    ?? `b${idSeq}`,
    branchName:            `Branch ${idSeq}`,
    branchCode:            `BR-${idSeq}`,
    region:                overrides.region      ?? 'Central',
    period: {
      type:      'MTD',
      startDate: '2025-05-01',
      endDate:   '2025-05-15',
      month:     '2025-05',
      dayRatio:  0.5,
    },
    kpiAchievementSummary: overrides.kpiAchievements ?? makeAllKpiSummaries(score),
    overallAchievementPct: overrides.overallAchievementPct ?? score,
    branchScore:           score,
    riskLevel:             overrides.riskLevel          ?? 'ON_TRACK',
    momentumDirection:     overrides.momentumDirection  ?? 'STABLE',
    operationalStatus:     overrides.operationalStatus  ?? 'ACTIVE',
    dataQualityFlags:      [],
    hasDataErrors:         overrides.hasDataErrors ?? false,
    submissionRatePct:     overrides.submissionRatePct ?? 80,
    generatedAt:           '2025-05-15T10:00:00.000Z',
  }
}

// ─────────────────────────────────────────────────────────────
// 1. EMPTY INPUT
// ─────────────────────────────────────────────────────────────

describe('generateRegionalRollups — empty input', () => {
  it('returns [] for empty array without throwing', () => {
    expect(generateRegionalRollups([])).toEqual([])
  })

  it('return type is always an array', () => {
    expect(Array.isArray(generateRegionalRollups([]))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. GROUPING BY REGION
// ─────────────────────────────────────────────────────────────

describe('generateRegionalRollups — grouping by region', () => {
  it('produces one RegionalRollupSummary per distinct region', () => {
    const rollups = [
      makeBranchRollup({ region: 'North' }),
      makeBranchRollup({ region: 'South' }),
      makeBranchRollup({ region: 'North' }),
    ]
    const result = generateRegionalRollups(rollups)
    expect(result).toHaveLength(2)
    const names = result.map((r) => r.regionName).sort()
    expect(names).toEqual(['North', 'South'])
  })

  it('places branches with empty region under Unassigned', () => {
    const rollups = [
      makeBranchRollup({ region: '' }),
      makeBranchRollup({ region: '  ' }),
    ]
    const result = generateRegionalRollups(rollups)
    expect(result).toHaveLength(1)
    expect(result[0].regionName).toBe('Unassigned')
    expect(result[0].branchCount).toBe(2)
  })

  it('regions are sorted alphabetically', () => {
    const rollups = [
      makeBranchRollup({ region: 'West' }),
      makeBranchRollup({ region: 'East' }),
      makeBranchRollup({ region: 'Central' }),
    ]
    const result = generateRegionalRollups(rollups)
    expect(result.map((r) => r.regionName)).toEqual(['Central', 'East', 'West'])
  })

  it('branchCount matches branches in that region', () => {
    const rollups = [
      makeBranchRollup({ region: 'North' }),
      makeBranchRollup({ region: 'North' }),
      makeBranchRollup({ region: 'North' }),
      makeBranchRollup({ region: 'South' }),
    ]
    const result = generateRegionalRollups(rollups)
    const north  = result.find((r) => r.regionName === 'North')!
    const south  = result.find((r) => r.regionName === 'South')!
    expect(north.branchCount).toBe(3)
    expect(south.branchCount).toBe(1)
  })

  it('single region with all branches', () => {
    const rollups = Array.from({ length: 5 }, () => makeBranchRollup({ region: 'Central' }))
    const result  = generateRegionalRollups(rollups)
    expect(result).toHaveLength(1)
    expect(result[0].branchCount).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. REGIONAL SCORE AVERAGE
// ─────────────────────────────────────────────────────────────

describe('generateRegionalRollups — regional score average', () => {
  it('regionalScore is mean of branch scores', () => {
    const rollups = [
      makeBranchRollup({ region: 'North', branchScore: 80 }),
      makeBranchRollup({ region: 'North', branchScore: 60 }),
    ]
    const result = generateRegionalRollups(rollups)
    expect(result[0].regionalScore).toBe(70)
  })

  it('regionalScore rounds correctly', () => {
    const rollups = [
      makeBranchRollup({ region: 'North', branchScore: 80 }),
      makeBranchRollup({ region: 'North', branchScore: 61 }),
    ]
    const result = generateRegionalRollups(rollups)
    expect(result[0].regionalScore).toBe(71)  // (80+61)/2 = 70.5 → 71
  })

  it('regionalScore excludes NO_DATA branches (they score 0 artificially)', () => {
    const rollups = [
      makeBranchRollup({ region: 'North', branchScore: 80, operationalStatus: 'ACTIVE' }),
      makeBranchRollup({ region: 'North', branchScore: 0,  operationalStatus: 'NO_DATA' }),
    ]
    const result = generateRegionalRollups(rollups)
    // Only the active branch (score=80) counts
    expect(result[0].regionalScore).toBe(80)
  })

  it('regionalScore is 0 when all branches are NO_DATA', () => {
    const rollups = [
      makeBranchRollup({ region: 'North', branchScore: 0, operationalStatus: 'NO_DATA' }),
      makeBranchRollup({ region: 'North', branchScore: 0, operationalStatus: 'NO_DATA' }),
    ]
    const result = generateRegionalRollups(rollups)
    expect(result[0].regionalScore).toBe(0)
  })

  it('activeBranches count excludes NO_DATA', () => {
    const rollups = [
      makeBranchRollup({ region: 'North', operationalStatus: 'ACTIVE' }),
      makeBranchRollup({ region: 'North', operationalStatus: 'NO_DATA' }),
      makeBranchRollup({ region: 'North', operationalStatus: 'NO_TARGET' }),
    ]
    const result = generateRegionalRollups(rollups)
    expect(result[0].activeBranches).toBe(2)
    expect(result[0].inactiveBranches).toBe(1)
    expect(result[0].noTargetBranches).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. WEAKEST / STRONGEST KPI DETECTION
// ─────────────────────────────────────────────────────────────

describe('generateRegionalRollups — weakest/strongest KPI detection', () => {
  it('weakestKpis contains the KPIs with lowest mean achievement', () => {
    const kpis1: KpiRollupSummary[] = [
      makeKpiSummary('wasfaty',      30),  // weakest
      makeKpiSummary('omni',         90),
      makeKpiSummary('wellness',     85),
      makeKpiSummary('basket',       80),
      makeKpiSummary('crossSelling', 40),  // second weakest
    ]
    const kpis2: KpiRollupSummary[] = [
      makeKpiSummary('wasfaty',      40),
      makeKpiSummary('omni',         88),
      makeKpiSummary('wellness',     82),
      makeKpiSummary('basket',       75),
      makeKpiSummary('crossSelling', 50),
    ]
    const rollups = [
      makeBranchRollup({ region: 'North', kpiAchievements: kpis1 }),
      makeBranchRollup({ region: 'North', kpiAchievements: kpis2 }),
    ]
    const result = generateRegionalRollups(rollups)
    // wasfaty avg = (30+40)/2 = 35 — weakest
    // crossSelling avg = (40+50)/2 = 45 — second weakest
    expect(result[0].weakestKpis[0]).toBe('wasfaty')
    expect(result[0].weakestKpis[1]).toBe('crossSelling')
  })

  it('strongestKpis contains the KPIs with highest mean achievement', () => {
    const kpis: KpiRollupSummary[] = [
      makeKpiSummary('wasfaty',      95),  // strongest
      makeKpiSummary('omni',         90),  // second strongest
      makeKpiSummary('wellness',     70),
      makeKpiSummary('basket',       65),
      makeKpiSummary('crossSelling', 50),
    ]
    const rollups = [makeBranchRollup({ region: 'South', kpiAchievements: kpis })]
    const result  = generateRegionalRollups(rollups)
    expect(result[0].strongestKpis[0]).toBe('wasfaty')
    expect(result[0].strongestKpis[1]).toBe('omni')
  })

  it('weakestKpis and strongestKpis each have at most 2 entries', () => {
    const rollups = [makeBranchRollup({ region: 'Central' })]
    const result  = generateRegionalRollups(rollups)
    expect(result[0].weakestKpis.length).toBeLessThanOrEqual(2)
    expect(result[0].strongestKpis.length).toBeLessThanOrEqual(2)
  })

  it('excludes KPIs with no contributing branches from weakest/strongest', () => {
    const kpis: KpiRollupSummary[] = [
      makeKpiSummary('wasfaty',      80, true),
      makeKpiSummary('omni',          0, false),  // no target — excluded
      makeKpiSummary('wellness',     75, true),
      makeKpiSummary('basket',       90, true),
      makeKpiSummary('crossSelling', 60, true),
    ]
    const rollups = [makeBranchRollup({ region: 'East', kpiAchievements: kpis })]
    const result  = generateRegionalRollups(rollups)
    // omni (no target) must not appear in weakest even though its value is 0
    expect(result[0].weakestKpis).not.toContain('omni')
  })

  it('kpiAverages has exactly 5 entries', () => {
    const result = generateRegionalRollups([makeBranchRollup()])
    expect(result[0].kpiAverages).toHaveLength(5)
    const keys = result[0].kpiAverages.map((k) => k.kpiKey)
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('crossSelling')
  })

  it('meanAchievementPct is correct mean across branches', () => {
    const kpis1: KpiRollupSummary[] = [
      makeKpiSummary('wasfaty', 80),
      ...['omni','wellness','basket','crossSelling'].map((k) => makeKpiSummary(k as KpiKey, 80)),
    ]
    const kpis2: KpiRollupSummary[] = [
      makeKpiSummary('wasfaty', 40),
      ...['omni','wellness','basket','crossSelling'].map((k) => makeKpiSummary(k as KpiKey, 40)),
    ]
    const rollups = [
      makeBranchRollup({ region: 'West', kpiAchievements: kpis1 }),
      makeBranchRollup({ region: 'West', kpiAchievements: kpis2 }),
    ]
    const result  = generateRegionalRollups(rollups)
    const wasfaty = result[0].kpiAverages.find((k) => k.kpiKey === 'wasfaty')!
    expect(wasfaty.meanAchievementPct).toBe(60)  // (80 + 40) / 2
  })
})

// ─────────────────────────────────────────────────────────────
// 5. HIGH-RISK CONCENTRATION
// ─────────────────────────────────────────────────────────────

describe('generateRegionalRollups — high-risk concentration', () => {
  it('riskConcentration counts match the input branches', () => {
    const rollups = [
      makeBranchRollup({ region: 'North', riskLevel: 'HIGH_RISK'   }),
      makeBranchRollup({ region: 'North', riskLevel: 'HIGH_RISK'   }),
      makeBranchRollup({ region: 'North', riskLevel: 'MEDIUM_RISK' }),
      makeBranchRollup({ region: 'North', riskLevel: 'ON_TRACK'    }),
    ]
    const result = generateRegionalRollups(rollups)
    const { onTrack, lowRisk, mediumRisk, highRisk } = result[0].riskConcentration
    expect(highRisk).toBe(2)
    expect(mediumRisk).toBe(1)
    expect(onTrack).toBe(1)
    expect(lowRisk).toBe(0)
    expect(onTrack + lowRisk + mediumRisk + highRisk).toBe(4)
  })

  it('highRiskPct is computed correctly', () => {
    const rollups = [
      makeBranchRollup({ region: 'North', riskLevel: 'HIGH_RISK' }),
      makeBranchRollup({ region: 'North', riskLevel: 'HIGH_RISK' }),
      makeBranchRollup({ region: 'North', riskLevel: 'ON_TRACK'  }),
      makeBranchRollup({ region: 'North', riskLevel: 'ON_TRACK'  }),
    ]
    const result = generateRegionalRollups(rollups)
    expect(result[0].riskConcentration.highRiskPct).toBe(50)
  })

  it('regionalRiskLevel is HIGH_RISK when > 50% branches are HIGH_RISK', () => {
    const rollups = [
      makeBranchRollup({ region: 'North', riskLevel: 'HIGH_RISK' }),
      makeBranchRollup({ region: 'North', riskLevel: 'HIGH_RISK' }),
      makeBranchRollup({ region: 'North', riskLevel: 'HIGH_RISK' }),
      makeBranchRollup({ region: 'North', riskLevel: 'ON_TRACK'  }),
    ]  // 75% HIGH_RISK
    const result = generateRegionalRollups(rollups)
    expect(result[0].regionalRiskLevel).toBe('HIGH_RISK')
  })

  it('REGION_HIGH_RISK flag fires when > 50% branches are HIGH_RISK', () => {
    const rollups = [
      makeBranchRollup({ region: 'North', riskLevel: 'HIGH_RISK' }),
      makeBranchRollup({ region: 'North', riskLevel: 'HIGH_RISK' }),
      makeBranchRollup({ region: 'North', riskLevel: 'HIGH_RISK' }),
      makeBranchRollup({ region: 'North', riskLevel: 'ON_TRACK'  }),
    ]
    const result = generateRegionalRollups(rollups)
    const flag   = result[0].dataQualityFlags.find((f) => f.code === 'REGION_HIGH_RISK')
    expect(flag).toBeDefined()
    expect(flag?.severity).toBe('ERROR')
  })

  it('no REGION_HIGH_RISK flag when ≤ 50% branches are HIGH_RISK', () => {
    const rollups = [
      makeBranchRollup({ region: 'North', riskLevel: 'HIGH_RISK' }),
      makeBranchRollup({ region: 'North', riskLevel: 'ON_TRACK'  }),
    ]  // 50% — threshold is STRICTLY > 50%
    const result = generateRegionalRollups(rollups)
    const flag   = result[0].dataQualityFlags.find((f) => f.code === 'REGION_HIGH_RISK')
    expect(flag).toBeUndefined()
  })

  it('regionalRiskLevel is ON_TRACK when all branches are ON_TRACK', () => {
    const rollups = [
      makeBranchRollup({ region: 'South', riskLevel: 'ON_TRACK' }),
      makeBranchRollup({ region: 'South', riskLevel: 'ON_TRACK' }),
      makeBranchRollup({ region: 'South', riskLevel: 'ON_TRACK' }),
    ]
    const result = generateRegionalRollups(rollups)
    expect(result[0].regionalRiskLevel).toBe('ON_TRACK')
  })
})

// ─────────────────────────────────────────────────────────────
// 6. INACTIVE BRANCH CONCENTRATION
// ─────────────────────────────────────────────────────────────

describe('generateRegionalRollups — inactive branch concentration', () => {
  it('inactiveBranches count is correct', () => {
    const rollups = [
      makeBranchRollup({ region: 'East', operationalStatus: 'NO_DATA' }),
      makeBranchRollup({ region: 'East', operationalStatus: 'NO_DATA' }),
      makeBranchRollup({ region: 'East', operationalStatus: 'ACTIVE'  }),
    ]
    const result = generateRegionalRollups(rollups)
    expect(result[0].inactiveBranches).toBe(2)
    expect(result[0].activeBranches).toBe(1)
  })

  it('HIGH_INACTIVE_RATE flag fires when > 30% branches have NO_DATA', () => {
    const rollups = [
      makeBranchRollup({ region: 'East', operationalStatus: 'NO_DATA' }),
      makeBranchRollup({ region: 'East', operationalStatus: 'NO_DATA' }),
      makeBranchRollup({ region: 'East', operationalStatus: 'ACTIVE'  }),
      makeBranchRollup({ region: 'East', operationalStatus: 'ACTIVE'  }),
      makeBranchRollup({ region: 'East', operationalStatus: 'ACTIVE'  }),
    ]  // 40% inactive > 30% threshold
    const result = generateRegionalRollups(rollups)
    const flag   = result[0].dataQualityFlags.find((f) => f.code === 'HIGH_INACTIVE_RATE')
    expect(flag).toBeDefined()
    expect(flag?.severity).toBe('WARNING')
    expect(flag?.value).toBe(40)
  })

  it('no HIGH_INACTIVE_RATE flag when ≤ 30% inactive', () => {
    const rollups = [
      makeBranchRollup({ region: 'East', operationalStatus: 'NO_DATA' }),
      makeBranchRollup({ region: 'East', operationalStatus: 'ACTIVE'  }),
      makeBranchRollup({ region: 'East', operationalStatus: 'ACTIVE'  }),
      makeBranchRollup({ region: 'East', operationalStatus: 'ACTIVE'  }),
    ]  // 25% inactive — below threshold
    const result = generateRegionalRollups(rollups)
    const flag   = result[0].dataQualityFlags.find((f) => f.code === 'HIGH_INACTIVE_RATE')
    expect(flag).toBeUndefined()
  })

  it('HIGH_NO_TARGET_RATE flag fires when > 40% branches have NO_TARGET', () => {
    const rollups = [
      makeBranchRollup({ region: 'West', operationalStatus: 'NO_TARGET' }),
      makeBranchRollup({ region: 'West', operationalStatus: 'NO_TARGET' }),
      makeBranchRollup({ region: 'West', operationalStatus: 'NO_TARGET' }),
      makeBranchRollup({ region: 'West', operationalStatus: 'ACTIVE'    }),
      makeBranchRollup({ region: 'West', operationalStatus: 'ACTIVE'    }),
    ]  // 60% > 40% threshold
    const result = generateRegionalRollups(rollups)
    const flag   = result[0].dataQualityFlags.find((f) => f.code === 'HIGH_NO_TARGET_RATE')
    expect(flag).toBeDefined()
  })

  it('REGION_LOW_DATA_QUALITY flag fires when > 30% branches have errors', () => {
    const rollups = [
      makeBranchRollup({ region: 'North', hasDataErrors: true  }),
      makeBranchRollup({ region: 'North', hasDataErrors: true  }),
      makeBranchRollup({ region: 'North', hasDataErrors: false }),
      makeBranchRollup({ region: 'North', hasDataErrors: false }),
      makeBranchRollup({ region: 'North', hasDataErrors: false }),
    ]  // 40% > 30% threshold
    const result = generateRegionalRollups(rollups)
    const flag   = result[0].dataQualityFlags.find((f) => f.code === 'REGION_LOW_DATA_QUALITY')
    expect(flag).toBeDefined()
    expect(flag?.severity).toBe('WARNING')
  })

  it('data quality flags are sorted: ERROR before WARNING', () => {
    // Trigger both ERROR (REGION_HIGH_RISK) and WARNING (HIGH_INACTIVE_RATE)
    const rollups = [
      makeBranchRollup({ region: 'X', riskLevel: 'HIGH_RISK', operationalStatus: 'NO_DATA' }),
      makeBranchRollup({ region: 'X', riskLevel: 'HIGH_RISK', operationalStatus: 'NO_DATA' }),
      makeBranchRollup({ region: 'X', riskLevel: 'HIGH_RISK', operationalStatus: 'ACTIVE'  }),
      makeBranchRollup({ region: 'X', riskLevel: 'ON_TRACK',  operationalStatus: 'ACTIVE'  }),
    ]
    const result     = generateRegionalRollups(rollups)
    const severities = result[0].dataQualityFlags.map((f) => f.severity)
    const order = { ERROR: 0, WARNING: 1, INFO: 2 }
    for (let i = 1; i < severities.length; i++) {
      expect(order[severities[i]]).toBeGreaterThanOrEqual(order[severities[i - 1]])
    }
  })
})

// ─────────────────────────────────────────────────────────────
// 7. RECOVERY SIGNALS
// ─────────────────────────────────────────────────────────────

describe('generateRegionalRollups — recovery signals', () => {
  it('STRONG signal for a branch with score ≥ 70 and IMPROVING momentum', () => {
    const rollups = [
      makeBranchRollup({
        region:            'North',
        branchScore:       75,
        momentumDirection: 'IMPROVING',
        riskLevel:         'MEDIUM_RISK',
        operationalStatus: 'ACTIVE',
      }),
    ]
    const result  = generateRegionalRollups(rollups)
    const signals = result[0].recoverySignals
    expect(signals).toHaveLength(1)
    expect(signals[0].strength).toBe('STRONG')
  })

  it('MODERATE signal for a branch with score ≥ 50 and STABLE momentum', () => {
    const rollups = [
      makeBranchRollup({
        region:            'North',
        branchScore:       55,
        momentumDirection: 'STABLE',
        riskLevel:         'LOW_RISK',
        operationalStatus: 'ACTIVE',
      }),
    ]
    const result  = generateRegionalRollups(rollups)
    const signals = result[0].recoverySignals
    expect(signals).toHaveLength(1)
    expect(signals[0].strength).toBe('MODERATE')
  })

  it('WEAK signal for a branch with score < 50 and STABLE momentum', () => {
    const rollups = [
      makeBranchRollup({
        region:            'North',
        branchScore:       40,
        momentumDirection: 'STABLE',
        riskLevel:         'HIGH_RISK',
        operationalStatus: 'ACTIVE',
      }),
    ]
    const result  = generateRegionalRollups(rollups)
    const signals = result[0].recoverySignals
    expect(signals).toHaveLength(1)
    expect(signals[0].strength).toBe('WEAK')
  })

  it('no signal for NO_DATA branches', () => {
    const rollups = [
      makeBranchRollup({
        region:            'North',
        branchScore:       80,
        momentumDirection: 'IMPROVING',
        operationalStatus: 'NO_DATA',
      }),
    ]
    const result = generateRegionalRollups(rollups)
    expect(result[0].recoverySignals).toHaveLength(0)
  })

  it('no signal for DECLINING momentum', () => {
    const rollups = [
      makeBranchRollup({
        region:            'North',
        branchScore:       65,
        momentumDirection: 'DECLINING',
        riskLevel:         'MEDIUM_RISK',
        operationalStatus: 'ACTIVE',
      }),
    ]
    const result = generateRegionalRollups(rollups)
    expect(result[0].recoverySignals).toHaveLength(0)
  })

  it('recovery signals are sorted STRONG before MODERATE before WEAK', () => {
    const rollups = [
      makeBranchRollup({ region: 'N', branchScore: 30, momentumDirection: 'STABLE',    riskLevel: 'HIGH_RISK', operationalStatus: 'ACTIVE' }),
      makeBranchRollup({ region: 'N', branchScore: 75, momentumDirection: 'IMPROVING', riskLevel: 'MEDIUM_RISK', operationalStatus: 'ACTIVE' }),
      makeBranchRollup({ region: 'N', branchScore: 55, momentumDirection: 'STABLE',    riskLevel: 'LOW_RISK',  operationalStatus: 'ACTIVE' }),
    ]
    const result    = generateRegionalRollups(rollups)
    const strengths = result[0].recoverySignals.map((s) => s.strength)
    const rank = { STRONG: 2, MODERATE: 1, WEAK: 0 }
    for (let i = 1; i < strengths.length; i++) {
      expect(rank[strengths[i]]).toBeLessThanOrEqual(rank[strengths[i - 1]])
    }
  })
})

// ─────────────────────────────────────────────────────────────
// 8. STRUCTURAL GUARANTEES
// ─────────────────────────────────────────────────────────────

describe('generateRegionalRollups — structural guarantees', () => {
  it('generatedAt is a valid ISO timestamp', () => {
    const result = generateRegionalRollups([makeBranchRollup()])
    expect(() => new Date(result[0].generatedAt)).not.toThrow()
    expect(new Date(result[0].generatedAt).getFullYear()).toBeGreaterThan(2020)
  })

  it('same inputs produce identical core fields (stability)', () => {
    const rollups = [
      makeBranchRollup({ region: 'A', branchScore: 80 }),
      makeBranchRollup({ region: 'A', branchScore: 60 }),
    ]
    const r1 = generateRegionalRollups(rollups)
    const r2 = generateRegionalRollups(rollups)
    expect(r1[0].regionalScore).toBe(r2[0].regionalScore)
    expect(r1[0].regionalRiskLevel).toBe(r2[0].regionalRiskLevel)
    expect(r1[0].branchCount).toBe(r2[0].branchCount)
    expect(r1[0].weakestKpis).toEqual(r2[0].weakestKpis)
  })

  it('no flags for a clean high-performing region', () => {
    const rollups = Array.from({ length: 4 }, () =>
      makeBranchRollup({
        region:            'Clean',
        branchScore:       85,
        riskLevel:         'ON_TRACK',
        operationalStatus: 'ACTIVE',
        hasDataErrors:     false,
      })
    )
    const result = generateRegionalRollups(rollups)
    expect(result[0].dataQualityFlags).toHaveLength(0)
  })

  it('handles a single branch per region', () => {
    const result = generateRegionalRollups([makeBranchRollup({ region: 'Solo' })])
    expect(result[0].branchCount).toBe(1)
    expect(result[0].kpiAverages).toHaveLength(5)
  })
})
