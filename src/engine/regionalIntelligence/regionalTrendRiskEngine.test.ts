// ============================================================
// Regional Trend & Risk Engine Tests
// Covers: improving, declining, volatile, recovery, stable,
//         sustained stress, high-risk concentration,
//         weak KPI cluster, inactive branch concentration,
//         and empty data safety.
// ============================================================

import { describe, it, expect } from 'vitest'
import { analyzeRegionalTrend, analyzeAllRegionalTrends } from './regionalTrendEngine'
import { assessRegionalRisk,  assessAllRegionalRisks  }  from './regionalRiskEngine'

import type {
  RegionalRollupSummary,
  RegionalTrendAnalysis,
  RegionalKpiAverage,
  RegionalRiskConcentration,
  RecoverySignal,
  DataQualityFlag,
} from './regionalTypes'
import type { KpiKey } from '../kpiAnalyticsEngine'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const ALL_KPI_KEYS: KpiKey[] = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']

function makeKpiAverage(kpiKey: KpiKey, meanAchievementPct: number, spreadPct = 10): RegionalKpiAverage {
  return {
    kpiKey,
    meanActual:           meanAchievementPct,
    meanTarget:           100,
    meanAchievementPct,
    contributingBranches: 3,
    status:               meanAchievementPct >= 90 ? 'excellent' : meanAchievementPct >= 75 ? 'good' : meanAchievementPct >= 60 ? 'warning' : 'critical',
    spreadPct,
  }
}

function makeAllKpiAverages(achPct: number, spreadPct = 10): RegionalKpiAverage[] {
  return ALL_KPI_KEYS.map((k) => makeKpiAverage(k, achPct, spreadPct))
}

function makeRiskConcentration(overrides: Partial<RegionalRiskConcentration> = {}): RegionalRiskConcentration {
  const onTrack    = overrides.onTrack    ?? 2
  const lowRisk    = overrides.lowRisk    ?? 1
  const mediumRisk = overrides.mediumRisk ?? 0
  const highRisk   = overrides.highRisk   ?? 0
  const total      = onTrack + lowRisk + mediumRisk + highRisk
  return {
    onTrack, lowRisk, mediumRisk, highRisk,
    highRiskPct: total > 0 ? Math.round((highRisk / total) * 100) : 0,
    ...overrides,
  }
}

let rollupSeq = 0
function makeRollup(overrides: {
  regionName?:         string
  regionalScore?:      number
  regionalRiskLevel?:  RegionalRollupSummary['regionalRiskLevel']
  riskConcentration?:  Partial<RegionalRiskConcentration>
  kpiAverages?:        RegionalKpiAverage[]
  recoverySignals?:    RecoverySignal[]
  dataQualityFlags?:   DataQualityFlag[]
  branchCount?:        number
  activeBranches?:     number
  inactiveBranches?:   number
  noTargetBranches?:   number
  weakestKpis?:        KpiKey[]
  strongestKpis?:      KpiKey[]
} = {}): RegionalRollupSummary {
  rollupSeq++
  const branchCount     = overrides.branchCount     ?? 5
  const activeBranches  = overrides.activeBranches  ?? 5
  const inactiveBranches = overrides.inactiveBranches ?? 0
  const riskCon = makeRiskConcentration(overrides.riskConcentration)
  return {
    regionName:           overrides.regionName    ?? `Region-${rollupSeq}`,
    branchCount,
    activeBranches,
    inactiveBranches,
    noTargetBranches:     overrides.noTargetBranches ?? 0,
    regionalScore:        overrides.regionalScore  ?? 70,
    regionalRiskLevel:    overrides.regionalRiskLevel ?? 'ON_TRACK',
    riskConcentration:    riskCon,
    kpiAverages:          overrides.kpiAverages    ?? makeAllKpiAverages(75),
    weakestKpis:          overrides.weakestKpis    ?? ['crossSelling'],
    strongestKpis:        overrides.strongestKpis  ?? ['wasfaty'],
    recoverySignals:      overrides.recoverySignals ?? [],
    dataQualityFlags:     overrides.dataQualityFlags ?? [],
    generatedAt:          '2025-05-15T10:00:00.000Z',
  }
}

function makeRecoverySignal(strength: RecoverySignal['strength'] = 'STRONG'): RecoverySignal {
  return {
    branchId:              'b1',
    branchName:            'Test Branch',
    strength,
    momentumDirection:     'IMPROVING',
    branchScore:           72,
    overallAchievementPct: 65,
  }
}

// ─────────────────────────────────────────────────────────────
// 1. TREND ENGINE — EMPTY DATA SAFETY
// ─────────────────────────────────────────────────────────────

describe('analyzeRegionalTrend — empty / no-previous safety', () => {
  it('does not throw with only current rollup (no previous)', () => {
    expect(() => analyzeRegionalTrend({ current: makeRollup() })).not.toThrow()
  })

  it('returns STABLE when no previous period is available', () => {
    const result = analyzeRegionalTrend({ current: makeRollup() })
    expect(result.trendDirection).toBe('STABLE')
  })

  it('recoverySignal is false when no strong recovery signals', () => {
    const result = analyzeRegionalTrend({ current: makeRollup() })
    expect(result.recoverySignal).toBe(false)
  })

  it('sustainedStressSignal is false for a healthy region', () => {
    const result = analyzeRegionalTrend({ current: makeRollup() })
    expect(result.sustainedStressSignal).toBe(false)
  })

  it('returns valid ISO timestamp', () => {
    const result = analyzeRegionalTrend({ current: makeRollup() })
    expect(() => new Date(result.generatedAt)).not.toThrow()
  })

  it('analyzeAllRegionalTrends returns [] for empty input', () => {
    expect(analyzeAllRegionalTrends([])).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────
// 2. IMPROVING REGION
// ─────────────────────────────────────────────────────────────

describe('analyzeRegionalTrend — improving region', () => {
  function makeImproving() {
    const previous = makeRollup({ regionName: 'North', regionalScore: 60, riskConcentration: { highRisk: 3, highRiskPct: 60, onTrack: 1, lowRisk: 1, mediumRisk: 0 } })
    const current  = makeRollup({ regionName: 'North', regionalScore: 72, riskConcentration: { highRisk: 1, highRiskPct: 20, onTrack: 3, lowRisk: 1, mediumRisk: 0 } })
    return analyzeRegionalTrend({ current, previous })
  }

  it('trendDirection is IMPROVING when score rose significantly', () => {
    expect(makeImproving().trendDirection).toBe('IMPROVING')
  })

  it('momentumScore is positive for an improving region', () => {
    expect(makeImproving().momentumScore).toBeGreaterThan(0)
  })

  it('trendNarrative mentions improvement', () => {
    const narrative = makeImproving().trendNarrative.toLowerCase()
    expect(narrative).toMatch(/improv/)
  })

  it('sustainedStressSignal is false for an improving region', () => {
    expect(makeImproving().sustainedStressSignal).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. DECLINING REGION
// ─────────────────────────────────────────────────────────────

describe('analyzeRegionalTrend — declining region', () => {
  function makeDeclining() {
    const previous = makeRollup({ regionName: 'South', regionalScore: 80, riskConcentration: { highRisk: 1, highRiskPct: 20, onTrack: 3, lowRisk: 1, mediumRisk: 0 } })
    const current  = makeRollup({ regionName: 'South', regionalScore: 62, riskConcentration: { highRisk: 3, highRiskPct: 60, onTrack: 1, lowRisk: 0, mediumRisk: 1 } })
    return analyzeRegionalTrend({ current, previous })
  }

  it('trendDirection is DECLINING when score fell significantly', () => {
    expect(makeDeclining().trendDirection).toBe('DECLINING')
  })

  it('momentumScore is negative for a declining region', () => {
    expect(makeDeclining().momentumScore).toBeLessThan(0)
  })

  it('trendNarrative contains constructive guidance', () => {
    const narrative = makeDeclining().trendNarrative.toLowerCase()
    // Should contain action language — no punitive framing
    expect(narrative).toMatch(/review|recommend|coaching|support|focus/)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. VOLATILE REGION
// ─────────────────────────────────────────────────────────────

describe('analyzeRegionalTrend — volatile region', () => {
  function makeVolatile() {
    // High KPI spread (> 30%) across multiple KPIs
    const kpiAverages = ALL_KPI_KEYS.map((k) => makeKpiAverage(k, 65, 45))  // spreadPct=45
    const current     = makeRollup({
      regionName:   'East',
      kpiAverages,
      recoverySignals: [],  // no recovery = VOLATILE wins over RECOVERY
    })
    return analyzeRegionalTrend({ current })
  }

  it('trendDirection is VOLATILE when >= 2 KPIs have high spread', () => {
    expect(makeVolatile().trendDirection).toBe('VOLATILE')
  })

  it('stabilityScore is low for a volatile region', () => {
    expect(makeVolatile().stabilityScore).toBeLessThan(60)
  })

  it('trendNarrative mentions variability or inconsistency', () => {
    const narrative = makeVolatile().trendNarrative.toLowerCase()
    expect(narrative).toMatch(/variab|inconsist|spread|stability/)
  })
})

// ─────────────────────────────────────────────────────────────
// 5. RECOVERY REGION
// ─────────────────────────────────────────────────────────────

describe('analyzeRegionalTrend — recovery region', () => {
  function makeRecovery() {
    // Previous: was in distress
    const previous = makeRollup({
      regionName:        'West',
      regionalScore:     55,
      regionalRiskLevel: 'HIGH_RISK',
      riskConcentration: { highRisk: 3, highRiskPct: 60, onTrack: 1, lowRisk: 0, mediumRisk: 1 },
    })
    // Current: score rising + strong recovery signals + lower risk
    const current = makeRollup({
      regionName:        'West',
      regionalScore:     64,
      regionalRiskLevel: 'MEDIUM_RISK',
      riskConcentration: { highRisk: 2, highRiskPct: 40, onTrack: 2, lowRisk: 1, mediumRisk: 0 },
      recoverySignals:   [makeRecoverySignal('STRONG')],
    })
    return analyzeRegionalTrend({ current, previous })
  }

  it('trendDirection is RECOVERY with strong signal and score rising', () => {
    expect(makeRecovery().trendDirection).toBe('RECOVERY')
  })

  it('recoverySignal is true', () => {
    expect(makeRecovery().recoverySignal).toBe(true)
  })

  it('momentumScore is positive in recovery', () => {
    expect(makeRecovery().momentumScore).toBeGreaterThan(0)
  })

  it('trendNarrative mentions recovery or positive momentum', () => {
    const narrative = makeRecovery().trendNarrative.toLowerCase()
    expect(narrative).toMatch(/recover|positive|momentum/)
  })

  it('recoverySignal is false when region was already fully on-track', () => {
    const previous = makeRollup({
      regionName:        'Clean',
      regionalScore:     85,
      regionalRiskLevel: 'ON_TRACK',
    })
    const current = makeRollup({
      regionName:      'Clean',
      regionalScore:   88,
      recoverySignals: [makeRecoverySignal('STRONG')],
    })
    const result = analyzeRegionalTrend({ current, previous })
    // Already fully on-track last period — not a recovery
    expect(result.recoverySignal).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 6. SUSTAINED STRESS DETECTION
// ─────────────────────────────────────────────────────────────

describe('analyzeRegionalTrend — sustained stress', () => {
  it('sustainedStressSignal fires when >= 40% HIGH_RISK, score < 60, no STRONG recovery', () => {
    const current = makeRollup({
      regionName:        'Stressed',
      regionalScore:     48,
      riskConcentration: { highRisk: 3, highRiskPct: 60, onTrack: 1, lowRisk: 0, mediumRisk: 1 },
      recoverySignals:   [],
    })
    const result = analyzeRegionalTrend({ current })
    expect(result.sustainedStressSignal).toBe(true)
  })

  it('sustainedStressSignal does not fire when score >= 60', () => {
    const current = makeRollup({
      regionName:        'Borderline',
      regionalScore:     62,
      riskConcentration: { highRisk: 3, highRiskPct: 60, onTrack: 1, lowRisk: 0, mediumRisk: 1 },
      recoverySignals:   [],
    })
    const result = analyzeRegionalTrend({ current })
    expect(result.sustainedStressSignal).toBe(false)
  })

  it('sustainedStressSignal does not fire when STRONG recovery signal present', () => {
    const current = makeRollup({
      regionName:        'Recovering',
      regionalScore:     50,
      riskConcentration: { highRisk: 3, highRiskPct: 60, onTrack: 1, lowRisk: 0, mediumRisk: 1 },
      recoverySignals:   [makeRecoverySignal('STRONG')],
    })
    const result = analyzeRegionalTrend({ current })
    expect(result.sustainedStressSignal).toBe(false)
  })

  it('trendNarrative mentions pressure or escalation for stressed region', () => {
    const current = makeRollup({
      regionName:        'Stressed',
      regionalScore:     48,
      riskConcentration: { highRisk: 3, highRiskPct: 60, onTrack: 1, lowRisk: 0, mediumRisk: 1 },
      recoverySignals:   [],
    })
    const result = analyzeRegionalTrend({ current })
    const narrative = result.trendNarrative.toLowerCase()
    expect(narrative).toMatch(/stress|pressure|escalat|advisable/)
  })
})

// ─────────────────────────────────────────────────────────────
// 7. STABILITY SCORE
// ─────────────────────────────────────────────────────────────

describe('analyzeRegionalTrend — stabilityScore', () => {
  it('stabilityScore is between 0 and 100', () => {
    const result = analyzeRegionalTrend({ current: makeRollup() })
    expect(result.stabilityScore).toBeGreaterThanOrEqual(0)
    expect(result.stabilityScore).toBeLessThanOrEqual(100)
  })

  it('high spread lowers stabilityScore', () => {
    const lowSpread  = makeRollup({ kpiAverages: makeAllKpiAverages(75, 5) })
    const highSpread = makeRollup({ kpiAverages: makeAllKpiAverages(75, 50) })
    const r1 = analyzeRegionalTrend({ current: lowSpread })
    const r2 = analyzeRegionalTrend({ current: highSpread })
    expect(r1.stabilityScore).toBeGreaterThan(r2.stabilityScore)
  })

  it('high inactive rate lowers stabilityScore', () => {
    const active   = makeRollup({ branchCount: 5, inactiveBranches: 0 })
    const inactive = makeRollup({ branchCount: 5, inactiveBranches: 4 })
    const r1 = analyzeRegionalTrend({ current: active })
    const r2 = analyzeRegionalTrend({ current: inactive })
    expect(r1.stabilityScore).toBeGreaterThan(r2.stabilityScore)
  })
})

// ─────────────────────────────────────────────────────────────
// 8. analyzeAllRegionalTrends
// ─────────────────────────────────────────────────────────────

describe('analyzeAllRegionalTrends — multi-region', () => {
  it('returns one analysis per region, sorted alphabetically', () => {
    const rollups = [
      makeRollup({ regionName: 'West' }),
      makeRollup({ regionName: 'East' }),
      makeRollup({ regionName: 'Central' }),
    ]
    const result = analyzeAllRegionalTrends(rollups)
    expect(result).toHaveLength(3)
    expect(result.map((r) => r.regionName)).toEqual(['Central', 'East', 'West'])
  })

  it('matches current to previous by regionName', () => {
    const previous = [makeRollup({ regionName: 'Alpha', regionalScore: 60 })]
    const current  = [makeRollup({ regionName: 'Alpha', regionalScore: 75 })]
    const result   = analyzeAllRegionalTrends(current, previous)
    expect(result[0].trendDirection).toBe('IMPROVING')
  })

  it('regions with no matching previous default to STABLE', () => {
    const current  = [makeRollup({ regionName: 'NewRegion' })]
    const previous = [makeRollup({ regionName: 'OtherRegion' })]
    const result   = analyzeAllRegionalTrends(current, previous)
    expect(result[0].trendDirection).toBe('STABLE')
  })
})

// ─────────────────────────────────────────────────────────────
// 9. RISK ENGINE — EMPTY / SAFE DATA
// ─────────────────────────────────────────────────────────────

describe('assessRegionalRisk — empty / safe data', () => {
  it('does not throw for a clean healthy region', () => {
    expect(() => assessRegionalRisk(makeRollup())).not.toThrow()
  })

  it('returns [] for assessAllRegionalRisks with empty input', () => {
    expect(assessAllRegionalRisks([])).toEqual([])
  })

  it('no executive warnings for a clean region', () => {
    const result = assessRegionalRisk(makeRollup({
      regionalScore:     80,
      riskConcentration: { highRisk: 0, highRiskPct: 0, onTrack: 5, lowRisk: 0, mediumRisk: 0 },
      inactiveBranches:  0,
    }))
    expect(result.executiveWarnings).toHaveLength(0)
  })

  it('no risk reasons for a clean region', () => {
    const result = assessRegionalRisk(makeRollup({
      regionalScore:     85,
      riskConcentration: { highRisk: 0, highRiskPct: 0, onTrack: 5, lowRisk: 0, mediumRisk: 0 },
      kpiAverages:       makeAllKpiAverages(82),
      inactiveBranches:  0,
      dataQualityFlags:  [],
    }))
    expect(result.riskReasons).toHaveLength(0)
  })

  it('returns valid ISO timestamp', () => {
    const result = assessRegionalRisk(makeRollup())
    expect(() => new Date(result.generatedAt)).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────
// 10. HIGH-RISK CONCENTRATION
// ─────────────────────────────────────────────────────────────

describe('assessRegionalRisk — high-risk concentration', () => {
  it('detects HIGH_RISK_CONCENTRATION when >= 40% branches are HIGH_RISK', () => {
    const rollup = makeRollup({
      branchCount:       5,
      riskConcentration: { highRisk: 3, highRiskPct: 60, onTrack: 1, lowRisk: 1, mediumRisk: 0 },
    })
    const result = assessRegionalRisk(rollup)
    const reason = result.riskReasons.find((r) => r.code === 'HIGH_RISK_CONCENTRATION')
    expect(reason).toBeDefined()
    expect(reason?.value).toBe(60)
  })

  it('no HIGH_RISK_CONCENTRATION when < 40% branches are HIGH_RISK', () => {
    const rollup = makeRollup({
      riskConcentration: { highRisk: 1, highRiskPct: 20, onTrack: 4, lowRisk: 0, mediumRisk: 0 },
    })
    const result = assessRegionalRisk(rollup)
    const reason = result.riskReasons.find((r) => r.code === 'HIGH_RISK_CONCENTRATION')
    expect(reason).toBeUndefined()
  })

  it('CRITICAL executive warning when >= 60% branches are HIGH_RISK', () => {
    const rollup = makeRollup({
      branchCount:       5,
      riskConcentration: { highRisk: 4, highRiskPct: 80, onTrack: 0, lowRisk: 1, mediumRisk: 0 },
    })
    const result  = assessRegionalRisk(rollup)
    const warning = result.executiveWarnings.find((w) => w.severity === 'CRITICAL')
    expect(warning).toBeDefined()
    expect(warning?.title.toLowerCase()).toMatch(/majority|attention/)
  })

  it('ELEVATED executive warning when 40–59% branches are HIGH_RISK', () => {
    const rollup = makeRollup({
      branchCount:       5,
      riskConcentration: { highRisk: 2, highRiskPct: 40, onTrack: 2, lowRisk: 1, mediumRisk: 0 },
    })
    const result  = assessRegionalRisk(rollup)
    const warning = result.executiveWarnings.find((w) => w.severity === 'ELEVATED')
    expect(warning).toBeDefined()
  })

  it('regionalRiskLevel is upgraded to HIGH_RISK when 3+ risk reasons and base is MEDIUM_RISK', () => {
    // Build a scenario with multiple risk reasons firing
    const rollup = makeRollup({
      regionName:        'MultiRisk',
      regionalRiskLevel: 'MEDIUM_RISK',
      regionalScore:     45,
      branchCount:       5,
      riskConcentration: { highRisk: 3, highRiskPct: 60, onTrack: 1, lowRisk: 0, mediumRisk: 1 },
      kpiAverages:       makeAllKpiAverages(45),   // weak KPI cluster
      inactiveBranches:  2,                         // high inactive
    })
    const result = assessRegionalRisk(rollup)
    expect(result.regionalRiskLevel).toBe('HIGH_RISK')
  })
})

// ─────────────────────────────────────────────────────────────
// 11. WEAK KPI CLUSTER DETECTION
// ─────────────────────────────────────────────────────────────

describe('assessRegionalRisk — weak KPI cluster', () => {
  it('detects WEAK_KPI_CLUSTER when >= 2 KPIs are below 60% mean achievement', () => {
    const kpiAverages = [
      makeKpiAverage('wasfaty',      45),   // weak
      makeKpiAverage('omni',         50),   // weak
      makeKpiAverage('wellness',     80),
      makeKpiAverage('basket',       85),
      makeKpiAverage('crossSelling', 90),
    ]
    const rollup = makeRollup({ kpiAverages })
    const result = assessRegionalRisk(rollup)
    const reason = result.riskReasons.find((r) => r.code === 'WEAK_KPI_CLUSTER')
    expect(reason).toBeDefined()
    expect(reason?.value).toBe(2)
  })

  it('no WEAK_KPI_CLUSTER when only 1 KPI is below threshold', () => {
    const kpiAverages = [
      makeKpiAverage('wasfaty',      45),   // only one weak
      makeKpiAverage('omni',         78),
      makeKpiAverage('wellness',     82),
      makeKpiAverage('basket',       85),
      makeKpiAverage('crossSelling', 88),
    ]
    const rollup = makeRollup({ kpiAverages })
    const result = assessRegionalRisk(rollup)
    const reason = result.riskReasons.find((r) => r.code === 'WEAK_KPI_CLUSTER')
    expect(reason).toBeUndefined()
  })

  it('WEAK_KPI_CLUSTER includes KPI names in description', () => {
    const kpiAverages = [
      makeKpiAverage('wasfaty',      40),
      makeKpiAverage('omni',         45),
      makeKpiAverage('wellness',     55),
      makeKpiAverage('basket',       80),
      makeKpiAverage('crossSelling', 85),
    ]
    const rollup = makeRollup({ kpiAverages })
    const result = assessRegionalRisk(rollup)
    const reason = result.riskReasons.find((r) => r.code === 'WEAK_KPI_CLUSTER')
    expect(reason?.description.toLowerCase()).toMatch(/wasfaty|omni|wellness/)
  })

  it('priorityFocusAreas include the weakest KPI keys', () => {
    const rollup = makeRollup({
      weakestKpis:  ['crossSelling', 'basket'],
      kpiAverages:  makeAllKpiAverages(75),
    })
    const result = assessRegionalRisk(rollup)
    const kpiFocus = result.priorityFocusAreas.find((a) => a.kpiKeys && a.kpiKeys.length > 0)
    expect(kpiFocus).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 12. INACTIVE BRANCH CONCENTRATION
// ─────────────────────────────────────────────────────────────

describe('assessRegionalRisk — inactive branch concentration', () => {
  it('detects HIGH_INACTIVE_BRANCHES when >= 30% branches have NO_DATA', () => {
    // Regional-level: use dataQualityFlags from rollup (HIGH_INACTIVE_RATE flag)
    // Plus direct inactive count check
    const rollup = makeRollup({
      branchCount:      5,
      inactiveBranches: 2,   // 40% inactive
      dataQualityFlags: [{
        code:        'HIGH_INACTIVE_RATE',
        severity:    'WARNING',
        description: '2 of 5 branches (40%) have no data this period.',
        value:       40,
      }],
    })
    const result = assessRegionalRisk(rollup)
    const reason = result.riskReasons.find((r) => r.code === 'HIGH_INACTIVE_BRANCHES')
    expect(reason).toBeDefined()
    expect(reason?.value).toBe(40)
  })

  it('no HIGH_INACTIVE_BRANCHES when < 30% inactive', () => {
    const rollup = makeRollup({
      branchCount:      5,
      inactiveBranches: 1,   // 20%
    })
    const result = assessRegionalRisk(rollup)
    const reason = result.riskReasons.find((r) => r.code === 'HIGH_INACTIVE_BRANCHES')
    expect(reason).toBeUndefined()
  })

  it('priority focus area for inactive branches when reason fires', () => {
    const rollup = makeRollup({
      branchCount:      5,
      inactiveBranches: 3,   // 60%
      dataQualityFlags: [{
        code:        'HIGH_INACTIVE_RATE',
        severity:    'WARNING',
        description: '3 of 5 branches (60%) have no data.',
        value:       60,
      }],
    })
    const result     = assessRegionalRisk(rollup)
    const submission = result.priorityFocusAreas.find(
      (a) => a.area.toLowerCase().includes('submission') || a.area.toLowerCase().includes('inactive'),
    )
    expect(submission).toBeDefined()
    expect(submission?.urgency).toBe('MEDIUM')
  })

  it('detects DATA_QUALITY_RISK from REGION_LOW_DATA_QUALITY flag', () => {
    const rollup = makeRollup({
      dataQualityFlags: [{
        code:        'REGION_LOW_DATA_QUALITY',
        severity:    'WARNING',
        description: '2 of 5 branches (40%) have data quality errors.',
        value:       40,
      }],
    })
    const result = assessRegionalRisk(rollup)
    const reason = result.riskReasons.find((r) => r.code === 'DATA_QUALITY_RISK')
    expect(reason).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 13. RISK + TREND INTEGRATION
// ─────────────────────────────────────────────────────────────

describe('assessRegionalRisk — with trend analysis', () => {
  it('detects RECOVERY_STALLED when declining with no recovery signals', () => {
    const rollup = makeRollup({
      regionName:        'Stalled',
      riskConcentration: { highRisk: 2, highRiskPct: 40, onTrack: 2, lowRisk: 1, mediumRisk: 0 },
      recoverySignals:   [],
    })
    const trend: RegionalTrendAnalysis = {
      regionName:           'Stalled',
      trendDirection:       'DECLINING',
      momentumScore:        -30,
      stabilityScore:       55,
      recoverySignal:       false,
      sustainedStressSignal: false,
      trendNarrative:       '',
      generatedAt:          new Date().toISOString(),
    }
    const result = assessRegionalRisk(rollup, trend)
    const reason = result.riskReasons.find((r) => r.code === 'RECOVERY_STALLED')
    expect(reason).toBeDefined()
  })

  it('ELEVATED warning fires for sustained stress', () => {
    const rollup = makeRollup({
      regionName:        'SustainedStress',
      regionalScore:     50,
      riskConcentration: { highRisk: 3, highRiskPct: 60, onTrack: 1, lowRisk: 0, mediumRisk: 1 },
      recoverySignals:   [],
    })
    const trend: RegionalTrendAnalysis = {
      regionName:            'SustainedStress',
      trendDirection:        'STABLE',
      momentumScore:         -10,
      stabilityScore:        50,
      recoverySignal:        false,
      sustainedStressSignal: true,
      trendNarrative:        '',
      generatedAt:           new Date().toISOString(),
    }
    const result  = assessRegionalRisk(rollup, trend)
    const warning = result.executiveWarnings.find(
      (w) => w.description.toLowerCase().includes('stress') || w.description.toLowerCase().includes('pressure'),
    )
    expect(warning).toBeDefined()
  })

  it('assessAllRegionalRisks matches rollups to trends by name', () => {
    const rollups = [makeRollup({ regionName: 'Alpha' })]
    const trends  = [{
      regionName: 'Alpha',
      trendDirection: 'DECLINING' as const,
      momentumScore: -40,
      stabilityScore: 35,
      recoverySignal: false,
      sustainedStressSignal: false,
      trendNarrative: '',
      generatedAt: new Date().toISOString(),
    }]
    const result = assessAllRegionalRisks(rollups, trends)
    expect(result).toHaveLength(1)
    expect(result[0].regionName).toBe('Alpha')
  })
})

// ─────────────────────────────────────────────────────────────
// 14. EXECUTIVE LANGUAGE VALIDATION
// ─────────────────────────────────────────────────────────────

describe('Executive language — no punitive framing', () => {
  const PUNITIVE_WORDS = ['fail', 'bad', 'poor', 'terrible', 'blame', 'unacceptable', 'worst']

  it('trendNarrative contains no punitive language', () => {
    const scenarios = [
      makeRollup({ regionalScore: 30, riskConcentration: { highRisk: 5, highRiskPct: 100, onTrack: 0, lowRisk: 0, mediumRisk: 0 } }),
      makeRollup({ regionalScore: 80 }),
      makeRollup({ kpiAverages: makeAllKpiAverages(40) }),
    ]
    for (const rollup of scenarios) {
      const trend   = analyzeRegionalTrend({ current: rollup })
      const lower   = trend.trendNarrative.toLowerCase()
      PUNITIVE_WORDS.forEach((word) => {
        expect(lower).not.toContain(word)
      })
    }
  })

  it('executiveWarning descriptions contain no punitive language', () => {
    const rollup = makeRollup({
      riskConcentration: { highRisk: 5, highRiskPct: 100, onTrack: 0, lowRisk: 0, mediumRisk: 0 },
    })
    const result = assessRegionalRisk(rollup)
    result.executiveWarnings.forEach((w) => {
      const lower = (w.title + ' ' + w.description).toLowerCase()
      PUNITIVE_WORDS.forEach((word) => {
        expect(lower).not.toContain(word)
      })
    })
  })

  it('priorityFocusArea actions use constructive language', () => {
    const rollup = makeRollup({
      weakestKpis:       ['crossSelling', 'omni'],
      kpiAverages:       makeAllKpiAverages(45),
      riskConcentration: { highRisk: 3, highRiskPct: 60, onTrack: 1, lowRisk: 0, mediumRisk: 1 },
      inactiveBranches:  2,
      branchCount:       5,
    })
    const result = assessRegionalRisk(rollup)
    result.priorityFocusAreas.forEach((area) => {
      const lower = area.action.toLowerCase()
      PUNITIVE_WORDS.forEach((word) => {
        expect(lower).not.toContain(word)
      })
      // Should contain action words
      expect(lower).toMatch(/review|activate|schedule|engage|follow|monitor|plan|reinforce/)
    })
  })

  it('priorityFocusAreas capped at 3', () => {
    const rollup = makeRollup({
      weakestKpis:       ['crossSelling', 'omni'],
      kpiAverages:       makeAllKpiAverages(45),
      riskConcentration: { highRisk: 4, highRiskPct: 80, onTrack: 0, lowRisk: 0, mediumRisk: 1 },
      inactiveBranches:  3,
      branchCount:       5,
      dataQualityFlags:  [{ code: 'REGION_LOW_DATA_QUALITY', severity: 'WARNING', description: 'x', value: 40 }],
    })
    const result = assessRegionalRisk(rollup)
    expect(result.priorityFocusAreas.length).toBeLessThanOrEqual(3)
  })
})
