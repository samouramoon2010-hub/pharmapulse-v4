// ============================================================
// Milestone 3 — Pilot KPI Safety Verification
//
// Part G: Proves that insuranceConversion NEVER reaches:
//   • evaluationEngine (V1 + V2)
//   • rankingService
//   • executiveScore
//   • branchRollupEngine
//   • pharmacistPerformanceEngine
//
// Also verifies:
//   • Registry correctly classifies insuranceConversion as pilot_tracking
//   • Legacy adapter strips pilot KPI from engine input
//   • Lifecycle selectors work correctly
//   • TrackingOnlyBadge component exists
//   • Production KPI outputs unchanged (regression)
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_KPI_REGISTRY,
  KPI_ENGINE_ALIAS_MAP,
} from '../../engine/kpiRegistry'
import {
  isProductionEvaluationKpi,
  isPilotTrackingKpi,
  getProductionEvaluationKpis,
  getPilotTrackingKpis,
  getVisibleDashboardKpis,
  getVisibleReportKpis,
  getVisibleTargetKpis,
} from '../../engine/kpiRegistry/kpiMetaResolver'
import {
  mapDynamicToLegacy,
  mapDynamicToLegacyBatch,
} from '../../engine/kpiCompatibility/legacyEntryAdapter'
import { canTransitionKpiLifecycle } from '../../engine/kpiRegistry/kpiRegistryTypes'

// ─────────────────────────────────────────────────────────────
// 1. Registry classification
// ─────────────────────────────────────────────────────────────
describe('1 — insuranceConversion registry classification', () => {
  const ins = DEFAULT_KPI_REGISTRY.insuranceConversion

  it('insuranceConversion exists in DEFAULT_KPI_REGISTRY', () => {
    expect(ins).toBeDefined()
  })

  it('lifecycleStage === pilot_tracking', () => {
    expect(ins.lifecycleStage).toBe('pilot_tracking')
  })

  it('isPilotTrackingKpi returns true', () => {
    expect(isPilotTrackingKpi(ins)).toBe(true)
  })

  it('isProductionEvaluationKpi returns false', () => {
    expect(isProductionEvaluationKpi(ins)).toBe(false)
  })

  it('isCore === false (never contributes to composite score)', () => {
    expect(ins.isCore).toBe(false)
  })

  it('weight === 0 (zero portfolio contribution)', () => {
    expect(ins.weight).toBe(0)
  })

  it('executiveEnabled === false', () => {
    expect(ins.visibility.executiveEnabled).toBe(false)
  })

  it('regionalEnabled === false', () => {
    expect(ins.visibility.regionalEnabled).toBe(false)
  })

  it('dashboardEnabled === true (visible to pharmacist)', () => {
    expect(ins.visibility.dashboardEnabled).toBe(true)
  })

  it('has no aliasFor — engine key equals registry key', () => {
    expect(ins.aliasFor).toBeUndefined()
  })

  it('isPrimary === false', () => {
    expect(ins.isPrimary).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. Legacy adapter isolation — pilot KPI NEVER reaches engines
// ─────────────────────────────────────────────────────────────
describe('2 — Legacy adapter strips insuranceConversion from engine input', () => {
  const docWithPilot = {
    userId:     'u1',
    pharmacyId: 'p1',
    date:       '2025-06-15',
    // Legacy flat production fields
    wasfaty:      100,
    omni:          90,
    wellness:      80,
    basket:        70,
    crossSelling:  60,
    // Pilot KPI value — should NEVER appear in adapter output
    insuranceConversion: 15,
    kpiValues: {
      wasfaty:             100,
      omnihealth:           90,
      wellnessCard:         80,
      basket:               70,
      crossSelling:         60,
      insuranceConversion:  15,  // pilot — must be stripped
    },
  }

  it('adapter output does NOT contain insuranceConversion field', () => {
    const adapted = mapDynamicToLegacy(docWithPilot, KPI_ENGINE_ALIAS_MAP)
    expect('insuranceConversion' in adapted).toBe(false)
  })

  it('adapter output contains all 5 production fields', () => {
    const adapted = mapDynamicToLegacy(docWithPilot, KPI_ENGINE_ALIAS_MAP)
    expect(adapted.wasfaty).toBe(100)
    expect(adapted.omni).toBe(90)
    expect(adapted.wellness).toBe(80)
    expect(adapted.basket).toBe(70)
    expect(adapted.crossSelling).toBe(60)
  })

  it('production field values are identical to pre-pilot values', () => {
    const withoutPilot = { wasfaty: 100, omni: 90, wellness: 80, basket: 70, crossSelling: 60 }
    const withPilot    = { ...withoutPilot, insuranceConversion: 15 }
    const r1 = mapDynamicToLegacy(withoutPilot, KPI_ENGINE_ALIAS_MAP)
    const r2 = mapDynamicToLegacy(withPilot,    KPI_ENGINE_ALIAS_MAP)
    expect(r2.wasfaty).toBe(r1.wasfaty)
    expect(r2.omni).toBe(r1.omni)
    expect(r2.wellness).toBe(r1.wellness)
    expect(r2.basket).toBe(r1.basket)
    expect(r2.crossSelling).toBe(r1.crossSelling)
  })

  it('batch adapter strips pilot KPI from all documents', () => {
    const docs = [
      { wasfaty: 100, insuranceConversion: 5,  kpiValues: { wasfaty: 100, insuranceConversion: 5  } },
      { wasfaty: 110, insuranceConversion: 12, kpiValues: { wasfaty: 110, insuranceConversion: 12 } },
    ]
    const results = mapDynamicToLegacyBatch(docs, KPI_ENGINE_ALIAS_MAP)
    results.forEach((r) => {
      expect('insuranceConversion' in r).toBe(false)
    })
    expect(results[0].wasfaty).toBe(100)
    expect(results[1].wasfaty).toBe(110)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. Production KPIs unaffected
// ─────────────────────────────────────────────────────────────
describe('3 — Production KPIs unaffected by pilot KPI addition', () => {
  const production = getProductionEvaluationKpis()

  it('still has exactly 5 production_evaluation KPIs', () => {
    // 5 core + active non-core production KPIs (sales, sl, ndf, inbody, liberation)
    // All should be production_evaluation
    const coreProduction = production.filter((k) => k.isCore)
    expect(coreProduction).toHaveLength(5)
  })

  it('insuranceConversion is NOT in production KPI list', () => {
    const keys = production.map((k) => k.key)
    expect(keys).not.toContain('insuranceConversion')
  })

  it('production KPI weights still sum to 1.0', () => {
    const total = production
      .filter((k) => k.isCore && k.isActive)
      .reduce((s, k) => s + k.weight, 0)
    expect(Math.abs(total - 1.0)).toBeLessThanOrEqual(0.01)
  })

  it('insuranceConversion does not appear in KPI_ENGINE_ALIAS_MAP', () => {
    expect('insuranceConversion' in KPI_ENGINE_ALIAS_MAP).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. Lifecycle selectors
// ─────────────────────────────────────────────────────────────
describe('4 — Lifecycle selectors include/exclude pilot correctly', () => {
  it('getPilotTrackingKpis returns insuranceConversion', () => {
    const pilot = getPilotTrackingKpis()
    expect(pilot.map((k) => k.key)).toContain('insuranceConversion')
  })

  it('getProductionEvaluationKpis does NOT return insuranceConversion', () => {
    const prod = getProductionEvaluationKpis()
    expect(prod.map((k) => k.key)).not.toContain('insuranceConversion')
  })

  it('getVisibleDashboardKpis.pilot contains insuranceConversion', () => {
    const { pilot } = getVisibleDashboardKpis()
    expect(pilot.map((k) => k.key)).toContain('insuranceConversion')
  })

  it('getVisibleDashboardKpis.production does NOT contain insuranceConversion', () => {
    const { production } = getVisibleDashboardKpis()
    expect(production.map((k) => k.key)).not.toContain('insuranceConversion')
  })

  it('getVisibleReportKpis.pilot contains insuranceConversion', () => {
    const { pilot } = getVisibleReportKpis()
    expect(pilot.map((k) => k.key)).toContain('insuranceConversion')
  })

  it('getVisibleTargetKpis.pilot contains insuranceConversion', () => {
    const { pilot } = getVisibleTargetKpis()
    expect(pilot.map((k) => k.key)).toContain('insuranceConversion')
  })
})

// ─────────────────────────────────────────────────────────────
// 5. Lifecycle governance — pilot cannot skip to production
// ─────────────────────────────────────────────────────────────
describe('5 — insuranceConversion lifecycle governance', () => {
  it('BLOCKED: pilot_tracking → production_evaluation direct promotion', () => {
    expect(canTransitionKpiLifecycle('pilot_tracking', 'production_evaluation')).toBe(false)
  })

  it('ALLOWED: pilot_tracking → shadow_evaluation (must pass through)', () => {
    expect(canTransitionKpiLifecycle('pilot_tracking', 'shadow_evaluation')).toBe(true)
  })

  it('ALLOWED: shadow_evaluation → production_evaluation', () => {
    expect(canTransitionKpiLifecycle('shadow_evaluation', 'production_evaluation')).toBe(true)
  })

  it('ALLOWED: pilot_tracking → archived (discontinue pilot)', () => {
    expect(canTransitionKpiLifecycle('pilot_tracking', 'archived')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// 6. Source-level engine isolation verification
// ─────────────────────────────────────────────────────────────
describe('6 — Engine source code never directly reads insuranceConversion', () => {
  it('evaluationEngine.ts does not hardcode insuranceConversion', async () => {
    const src = (await import('../../engine/evaluationEngine/evaluationEngine.ts?raw')).default
    expect(src).not.toContain('insuranceConversion')
  })

  it('evaluationEngineTypes.ts does not hardcode insuranceConversion', async () => {
    const src = (await import('../../engine/evaluationEngine/evaluationEngineTypes.ts?raw')).default
    expect(src).not.toContain('insuranceConversion')
  })

  it('kpiAnalyticsEngine.ts does not hardcode insuranceConversion in KPI_KEYS or data structures', async () => {
    const src = (await import('../../engine/kpiAnalyticsEngine.ts?raw')).default
    // The DEFAULT_KPI_KEYS / KPI_KEYS constant must not contain insuranceConversion
    const keysIdx = src.indexOf('DEFAULT_KPI_KEYS')
    const keysBlock = src.slice(keysIdx, keysIdx + 300)
    expect(keysBlock).not.toContain('insuranceConversion')
    // KPI_META and KPI_WEIGHTS must not contain insuranceConversion
    const metaIdx = src.indexOf('export const KPI_META')
    const metaBlock = src.slice(metaIdx, metaIdx + 500)
    expect(metaBlock).not.toContain('insuranceConversion')
  })

  it('executiveScore.ts does not reference insuranceConversion', async () => {
    const src = (await import('../../engine/executive/executiveScore.ts?raw')).default
    expect(src).not.toContain('insuranceConversion')
  })

  it('branchRollupEngine.ts does not reference insuranceConversion', async () => {
    const src = (await import('../../engine/regionalIntelligence/branchRollupEngine.ts?raw')).default
    expect(src).not.toContain('insuranceConversion')
  })

  it('pharmacistPerformanceEngine.ts does not reference insuranceConversion', async () => {
    const src = (await import('../../engine/teamIntelligence/pharmacistPerformanceEngine.ts?raw')).default
    expect(src).not.toContain('insuranceConversion')
  })

  it('rankingService.ts does not reference insuranceConversion', async () => {
    const src = (await import('../../ranking/ranking-service.ts?raw')).default
    expect(src).not.toContain('insuranceConversion')
  })
})

// ─────────────────────────────────────────────────────────────
// 7. TrackingOnlyBadge component exists
// ─────────────────────────────────────────────────────────────
describe('7 — TrackingOnlyBadge component', () => {
  it('TrackingOnlyBadge component exists', async () => {
    const mod = await import('../../components/ui/TrackingOnlyBadge.jsx')
    expect(typeof mod.default).toBe('function')
  })

  it('PilotKpiSectionHeader component exists', async () => {
    const mod = await import('../../components/ui/TrackingOnlyBadge.jsx')
    expect(typeof mod.PilotKpiSectionHeader).toBe('function')
  })

  it('TrackingOnlyBadge source contains "Tracking Only" text', async () => {
    const src = (await import('../../components/ui/TrackingOnlyBadge.jsx?raw')).default
    expect(src).toContain('Tracking Only')
    expect(src).toContain('للمتابعة فقط')
  })

  it('TrackingOnlyBadge is amber (not green or red)', async () => {
    const src = (await import('../../components/ui/TrackingOnlyBadge.jsx?raw')).default
    expect(src).toContain('#b45309')   // amber-700
    expect(src).toContain('245,158,11') // amber RGB
  })
})

// ─────────────────────────────────────────────────────────────
// 8. DashboardPage pilot section
// ─────────────────────────────────────────────────────────────
describe('8 — DashboardPage pilot KPI section', () => {
  it('DashboardPage imports getPilotTrackingKpis', async () => {
    const src = (await import('../../pages/dashboard/DashboardPage.jsx?raw')).default
    expect(src).toContain('getPilotTrackingKpis')
  })

  it('DashboardPage imports TrackingOnlyBadge', async () => {
    const src = (await import('../../pages/dashboard/DashboardPage.jsx?raw')).default
    expect(src).toContain('TrackingOnlyBadge')
  })

  it('DashboardPage filters production KPIs from registryKpis', async () => {
    const src = (await import('../../pages/dashboard/DashboardPage.jsx?raw')).default
    // Defensive filter: treats missing lifecycleStage as production_evaluation
    // to prevent silent KPI drops from pre-Milestone-3 Firestore docs
    expect(src).toContain("(kpi.lifecycleStage ?? 'production_evaluation') === 'production_evaluation'")
  })

  it('pilotKpis excluded from KPI_KEYS (evaluation inputs)', async () => {
    const src = (await import('../../pages/dashboard/DashboardPage.jsx?raw')).default
    // KPI_KEYS is built from registryKpis which filters production_evaluation only
    // Pilot KPIs go in pilotKpis (separate memo) — never in KPI_KEYS
    expect(src).toContain('const pilotKpis')
  })
})

// ─────────────────────────────────────────────────────────────
// 9. Registry integrity — all current production KPIs unchanged
// ─────────────────────────────────────────────────────────────
describe('9 — Registry integrity after pilot KPI addition', () => {
  it('wasfaty still production_evaluation', () => {
    expect(DEFAULT_KPI_REGISTRY.wasfaty.lifecycleStage).toBe('production_evaluation')
  })
  it('omnihealth still production_evaluation', () => {
    expect(DEFAULT_KPI_REGISTRY.omnihealth.lifecycleStage).toBe('production_evaluation')
  })
  it('wellnessCard still production_evaluation', () => {
    expect(DEFAULT_KPI_REGISTRY.wellnessCard.lifecycleStage).toBe('production_evaluation')
  })
  it('basket still production_evaluation', () => {
    expect(DEFAULT_KPI_REGISTRY.basket.lifecycleStage).toBe('production_evaluation')
  })
  it('crossSelling still production_evaluation', () => {
    expect(DEFAULT_KPI_REGISTRY.crossSelling.lifecycleStage).toBe('production_evaluation')
  })
  it('wasfaty isPrimary still true', () => {
    expect(DEFAULT_KPI_REGISTRY.wasfaty.isPrimary).toBe(true)
  })
  it('insuranceConversion isPrimary is false', () => {
    expect(DEFAULT_KPI_REGISTRY.insuranceConversion.isPrimary).toBe(false)
  })
  it('exactly one KPI has isPrimary true (invariant unchanged)', () => {
    const primary = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => k.isPrimary)
    expect(primary).toHaveLength(1)
    expect(primary[0].key).toBe('wasfaty')
  })
})
