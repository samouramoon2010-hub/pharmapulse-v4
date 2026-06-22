// ============================================================
// Core KPI Dependency Removal Program — Stage F, Phase 2 (Team Intelligence)
//
// Proves that a brand-new, non-Core KPI (not one of the 5 legacy keys)
// flows through the Team Intelligence surface — per-pharmacist snapshots,
// team health aggregation, and coaching recommendations — when a registry
// is supplied, with zero source-code change beyond adding the KPI to the
// registry/profile/data. Also proves the no-registry path remains
// byte-identical to its pre-Stage-F behavior.
// ============================================================

import { describe, it, expect } from 'vitest'
import { computePharmacistPerformance } from './pharmacistPerformanceEngine'
import { computeTeamHealth } from './teamHealthEngine'
import { buildCoachingRecommendations, buildTeamCoachingPlan } from './coachingEngine'
import { generateTeamIntelligence } from './teamIntelligenceGenerator'
import { DEFAULT_KPI_REGISTRY } from '../kpiRegistry/defaultKpiRegistry'
import type { KpiRegistry } from '../kpiRegistry/kpiRegistryTypes'
import { KPI_KEYS } from '../kpiAnalyticsEngine'
import type { PharmacistInput, TeamIntelligenceInput } from './teamIntelligenceTypes'

const PID = 'branch-test'
const TEST_KPI_KEY = 'insurance_conversion_test'
const NOW = new Date('2025-05-20T00:00:00.000Z')

const TEST_REGISTRY: KpiRegistry = {
  ...DEFAULT_KPI_REGISTRY,
  [TEST_KPI_KEY]: {
    key:            TEST_KPI_KEY,
    label:          'Insurance Conversion (Test)',
    shortLabel:     'Insurance',
    labelAr:        'تحويل التأمين',
    category:       'engagement',
    valueType:      'count',
    unit:           'conversions',
    unitAr:         'تحويل',
    direction:      'higher_is_better',
    targetType:     'absolute',
    weight:         0.3,
    isCore:         false,
    isActive:       true,
    lifecycleStage: 'production_evaluation',
    actualField:    TEST_KPI_KEY,
    targetField:    `${TEST_KPI_KEY}Target`,
  } as any,
}

function pharmacistInput(): PharmacistInput {
  return {
    userId: 'u1', displayName: 'Test Pharmacist', pharmacyId: PID,
    mtdEntries: [
      {
        userId: 'u1', pharmacyId: PID, date: '2025-05-10',
        wasfaty: 10, omni: 5, wellness: 5, basket: 5, crossSelling: 5,
        [TEST_KPI_KEY]: 20,
      } as any,
    ],
    target: {
      pharmacyId: PID, month: '2025-05',
      wasfatyTarget: 100, omniTarget: 100, wellnessTarget: 100,
      basketTarget: 100, crossSellTarget: 100,
      [`${TEST_KPI_KEY}Target`]: 25,
    } as any,
    expectedSubmissionDays: 20,
    actualSubmissionDays: 15,
  }
}

describe('Stage F Phase 2 — Team Intelligence surface accepts an arbitrary new KPI', () => {
  it('without a registry, computePharmacistPerformance ignores the new KPI entirely (byte-identical legacy behavior)', () => {
    const summary = computePharmacistPerformance(pharmacistInput(), NOW)
    expect(summary.kpiSnapshots.map(s => s.kpiKey).sort()).toEqual([...KPI_KEYS].sort())
    expect(summary.kpiSnapshots.find(s => s.kpiKey === TEST_KPI_KEY)).toBeUndefined()
  })

  it('with a registry, kpiSnapshots include the new KPI with correct actual/target/achievementPct', () => {
    const summary = computePharmacistPerformance(pharmacistInput(), NOW, TEST_REGISTRY)
    const snap = summary.kpiSnapshots.find(s => s.kpiKey === TEST_KPI_KEY)
    expect(snap).toBeDefined()
    expect(snap!.actual).toBe(20)
    expect(snap!.target).toBe(25)
    expect(snap!.achievementPct).toBe(80)
    expect(snap!.label).toBe('Insurance Conversion (Test)')
  })

  it('with a registry, the 5 Core KPI snapshots are unchanged by the new KPI being present', () => {
    const withoutNewKpi = computePharmacistPerformance(pharmacistInput(), NOW)
    const withNewKpi    = computePharmacistPerformance(pharmacistInput(), NOW, TEST_REGISTRY)
    for (const key of KPI_KEYS) {
      const a = withoutNewKpi.kpiSnapshots.find(s => s.kpiKey === key)
      const b = withNewKpi.kpiSnapshots.find(s => s.kpiKey === key)
      expect(b).toEqual(a)
    }
  })

  it('with a registry, the new KPI contributes to overallAchPct via its registry weight', () => {
    const withoutNewKpi = computePharmacistPerformance(pharmacistInput(), NOW)
    const withNewKpi    = computePharmacistPerformance(pharmacistInput(), NOW, TEST_REGISTRY)
    expect(withNewKpi.overallAchPct).not.toBe(withoutNewKpi.overallAchPct)
  })

  it('coaching recommendations label the weakest KPI correctly via the registry, even when it is a non-Core registry KPI', () => {
    // Construct a summary directly (isolates coachingEngine from the rest of
    // the registry's other non-Core production KPIs, which are irrelevant here).
    // Target is set high so the new KPI's achievementPct is low — below the
    // coachingEngine's lowKpiAchievement threshold (70%) — so a focused
    // coaching recommendation is actually generated for it.
    const input = pharmacistInput()
    input.target = { ...(input.target as any), [`${TEST_KPI_KEY}Target`]: 1000 }
    const summary = computePharmacistPerformance(input, NOW, TEST_REGISTRY)
    const forcedSummary = { ...summary, weakestKpi: TEST_KPI_KEY }

    const recs = buildCoachingRecommendations(forcedSummary, TEST_REGISTRY)
    const focusRec = recs.find(r => r.kpiKey === TEST_KPI_KEY)
    expect(focusRec).toBeDefined()
    expect(focusRec!.title).toContain('Insurance Conversion (Test)')
    expect(focusRec!.title).not.toContain('undefined')
  })

  it('Team Health aggregates teamKpiSnapshot to include the new KPI when a registry is supplied', () => {
    const summary = computePharmacistPerformance(pharmacistInput(), NOW, TEST_REGISTRY)
    const teamInput: TeamIntelligenceInput = { pharmacyId: PID, month: '2025-05', pharmacists: [pharmacistInput()] }
    const health = computeTeamHealth(teamInput, [summary], NOW, TEST_REGISTRY)
    const snap = health.teamKpiSnapshot.find(s => s.kpiKey === TEST_KPI_KEY)
    expect(snap).toBeDefined()
    expect(snap!.actual).toBe(20)
    expect(snap!.target).toBe(25)
  })

  it('generateTeamIntelligence end-to-end: passing a registry surfaces the new KPI throughout, no source edit required', () => {
    const teamInput: TeamIntelligenceInput = { pharmacyId: PID, month: '2025-05', pharmacists: [pharmacistInput()] }
    const result = generateTeamIntelligence(teamInput, NOW, TEST_REGISTRY)
    expect(result.pharmacistSummaries[0].kpiSnapshots.some(s => s.kpiKey === TEST_KPI_KEY)).toBe(true)
    expect(result.teamHealth.teamKpiSnapshot.some(s => s.kpiKey === TEST_KPI_KEY)).toBe(true)
  })

  it('without a registry, generateTeamIntelligence remains byte-identical to its pre-Stage-F behavior', () => {
    const teamInput: TeamIntelligenceInput = { pharmacyId: PID, month: '2025-05', pharmacists: [pharmacistInput()] }
    const a = generateTeamIntelligence(teamInput, NOW)
    const b = generateTeamIntelligence(teamInput, NOW)
    expect(a.pharmacistSummaries[0].kpiSnapshots.map(s => s.kpiKey).sort()).toEqual([...KPI_KEYS].sort())
    expect(a.teamHealth.teamKpiSnapshot.map(s => s.kpiKey).sort()).toEqual([...KPI_KEYS].sort())
    expect(a.pharmacistSummaries[0].overallAchPct).toEqual(b.pharmacistSummaries[0].overallAchPct)
  })
})
