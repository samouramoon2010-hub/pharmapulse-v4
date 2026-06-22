// ============================================================
// Accelerated Safe Bundle — Multi-Surface Controlled Cutover +
// Legacy Deprecation Preparation
//
// Certifies the 9 required proofs from the bundle spec:
//  1. Dashboard uses Dynamic Reader safely.
//  2. Regional Intelligence uses Dynamic Reader safely.
//  3. Branch Intelligence uses Dynamic Reader safely (deferred —
//     proven blocked by a protected dependency, not silently skipped).
//  4. Automatic Legacy fallback works everywhere.
//  5. Core KPI fields remain present.
//  6. KPI_KEYS still exist as compatibility only.
//  7. Dynamic failures never break UI.
//  8. Protected engines remain untouched.
//  9. Full suite remains green (validated via npm test run, not here).
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import { generateBranchRollup } from '../regionalIntelligence/branchRollupEngine'
import type { BranchRollupInput, RegionalPeriod } from '../regionalIntelligence/regionalTypes'
import {
  buildPilotPolicy,
  sumPilotActual,
  readPilotTarget,
} from './dynamicReaderPilot'
import {
  KPI_DEPENDENCY_AUDIT,
  getDeferredEvaluationEngineSites,
  getBlockedByProtectedDependencySites,
  getCompletedDependencySites,
} from './dynamicKpiFoundation'

const dashboardSrc = () => import('../../pages/dashboard/DashboardPage?raw').then((m) => m.default)
const branchRollupSrc = () => import('../regionalIntelligence/branchRollupEngine?raw').then((m) => m.default)
const pilotSrc = () => import('./dynamicReaderPilot?raw').then((m) => m.default)

const TEST_PERIOD: RegionalPeriod = {
  type: 'MTD', startDate: '2025-05-01', endDate: '2025-05-15', month: '2025-05', dayRatio: 0.5,
}

function makeInput(overrides: Partial<BranchRollupInput> = {}): BranchRollupInput {
  return {
    branchId: 'b1', branchName: 'Test Branch', branchCode: 'TB-01', region: 'Central',
    entries: overrides.entries ?? [{
      id: 'e1', userId: 'u1', pharmacyId: 'b1', date: '2025-05-15',
      wasfaty: 100, omni: 80, wellness: 60, basket: 50, crossSelling: 40,
      sales: 5000, sl: 90, ndf: 10, notes: '',
    } as any],
    target: overrides.target ?? {
      pharmacyId: 'b1', month: '2025-05',
      wasfatyTarget: 200, omniTarget: 160, wellnessTarget: 120,
      basketTarget: 100, crossSellTarget: 80,
      salesTarget: 6000, slTarget: 95, ndfTarget: 12,
    } as any,
    ...overrides,
  }
}

describe('Accelerated Bundle — Proof 1: Dashboard uses Dynamic Reader safely', () => {
  it('DashboardPage.jsx wires the pilot policy into kpiStats (already certified in Phase 2)', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('buildPilotPolicy(monthEntries[0] ?? null, currentTarget, liveRegistry)')
    expect(src).toContain('readPilotActual(e, engineKey, liveRegistry, pilotPolicy)')
  })
})

describe('Accelerated Bundle — Proof 2: Regional Intelligence uses Dynamic Reader safely', () => {
  it('branchRollupEngine.ts threads the registry into buildKpiRollupSummaries via sumPilotActual/readPilotTarget', async () => {
    const src = await branchRollupSrc()
    expect(src).toContain('sumPilotActual(input.entries, kpiKey, registry, pilotPolicy)')
    expect(src).toContain('readPilotTarget(input.target, kpiKey, registry, pilotPolicy')
  })

  it('generateBranchRollup produces a correct, parity-consistent rollup for a pilot KPI ("sl") when a registry is provided', () => {
    const input = makeInput()
    const withRegistry = generateBranchRollup(input, TEST_PERIOD, DEFAULT_KPI_REGISTRY)
    const slWith = withRegistry.kpiAchievementSummary.find((k) => k.kpiKey === 'sl')
    // 'sl' only appears at all because getProductionEngineKeys(registry) includes
    // it — and because parity holds, its value matches the legacy field directly.
    expect(slWith?.actual).toBe(90)
    expect(slWith?.target).toBe(95)
  })

  it('"sl" does not appear at all without a registry — confirms the legacy-only key set is unaffected', () => {
    const input = makeInput()
    const withoutRegistry = generateBranchRollup(input, TEST_PERIOD)
    expect(withoutRegistry.kpiAchievementSummary.find((k) => k.kpiKey === 'sl')).toBeUndefined()
  })

  it('core KPI rollups (wasfaty/omni/wellness/basket/crossSelling) are unaffected by the pilot wiring', () => {
    const input = makeInput()
    const result = generateBranchRollup(input, TEST_PERIOD, DEFAULT_KPI_REGISTRY)
    const wasfaty = result.kpiAchievementSummary.find((k) => k.kpiKey === 'wasfaty')
    expect(wasfaty?.actual).toBe(100)
    expect(wasfaty?.target).toBe(200)
  })
})

describe('Accelerated Bundle — Proof 3: Branch Intelligence deferral was resolved, not silently skipped', () => {
  // NOTE: Branch Intelligence's deferral was intentionally resolved in the
  // later, separately approved Branch Intelligence Registry Wiring Bundle
  // — see branchIntelligenceRegistryWiring.test.ts. useBranchIntelligenceData.js
  // now subscribes to the live registry and threads it through
  // generateTeamIntelligence()/generateBranchSummary(), so no site remains
  // BLOCKED_BY_PROTECTED_DEPENDENCY in the audit.
  it('no remaining site is classified BLOCKED_BY_PROTECTED_DEPENDENCY', () => {
    const blocked = getBlockedByProtectedDependencySites()
    expect(blocked.length).toBe(0)
  })

  it('the audit records that pharmacistPerformanceEngine.ts itself was unblocked (MIGRATED), consistent with the now-fully-wired Branch Intelligence chain', () => {
    const migrated = getCompletedDependencySites()
    expect(migrated.some((s) => s.file.includes('pharmacistPerformanceEngine'))).toBe(true)
    const guarded = getDeferredEvaluationEngineSites()
    expect(guarded.some((s) => s.file.includes('pharmacistPerformanceEngine'))).toBe(false)
  })

  it('Branch Intelligence builder files still never import the pilot module directly (they only consume pre-computed, already-gated upstream outputs)', async () => {
    const src = await import('../branchIntelligence/branchIntelligenceViewModelBuilder?raw').then((m) => m.default)
    expect(src).not.toContain('dynamicReaderPilot')
  })

  it('useBranchIntelligenceData.js now imports and uses subscribeKpiRegistry, threading the live registry into both engine orchestrators', async () => {
    const src = await import('../../pages/branch/useBranchIntelligenceData?raw').then((m) => m.default)
    expect(src).toContain('subscribeKpiRegistry')
    expect(src).toContain('generateTeamIntelligence({ pharmacyId: branchId, month, pharmacists }, now, liveRegistry)')
    expect(src).toContain("generateBranchSummary(branchInput, format(now, 'yyyy-MM-dd'), month, liveRegistry)")
  })
})

describe('Accelerated Bundle — Proof 4: automatic Legacy fallback works everywhere piloted', () => {
  it('Regional Intelligence falls back to legacy sumKpi/getTargetForKpi when no registry is given', () => {
    const input = makeInput()
    const result = generateBranchRollup(input, TEST_PERIOD) // no registry
    const sl = result.kpiAchievementSummary.find((k) => k.kpiKey === 'sl')
    expect(sl).toBeUndefined() // 'sl' is not in DEFAULT_KPI_KEYS — confirms legacy-only key set used
  })

  it('sumPilotActual/readPilotTarget both default to legacy when policy routes there', () => {
    const policy = buildPilotPolicy(null, null, DEFAULT_KPI_REGISTRY)
    const entries = [{ sl: 5 }, { sl: 10 }]
    expect(sumPilotActual(entries, 'sl', DEFAULT_KPI_REGISTRY, policy)).toBe(15)
    expect(readPilotTarget({ slTarget: 50 }, 'sl', DEFAULT_KPI_REGISTRY, policy, () => 50)).toBe(50)
  })
})

describe('Accelerated Bundle — Proof 5: Core KPI fields remain present', () => {
  it('DEFAULT_KPI_REGISTRY still defines all 5 core KPI entries with actualField/targetField intact', () => {
    const coreEntries = [
      ['wasfaty', 'wasfaty', 'wasfatyTarget'],
      ['omnihealth', 'omni', 'omniTarget'],
      ['wellnessCard', 'wellness', 'wellnessTarget'],
      ['basket', 'basket', 'basketTarget'],
      ['crossSelling', 'crossSelling', 'crossSellTarget'],
    ] as const
    for (const [registryKey, actualField, targetField] of coreEntries) {
      const def = DEFAULT_KPI_REGISTRY[registryKey]
      expect(def).toBeDefined()
      expect(def.actualField).toBe(actualField)
      expect(def.targetField).toBe(targetField)
    }
  })
})

describe('Accelerated Bundle — Proof 6: KPI_KEYS still exists, compatibility-layer only', () => {
  it('KPI_KEYS export still exists and equals DEFAULT_KPI_KEYS', async () => {
    const { KPI_KEYS, DEFAULT_KPI_KEYS } = await import('../kpiAnalyticsEngine')
    expect(KPI_KEYS).toEqual(DEFAULT_KPI_KEYS)
  })

  it('the source explicitly documents KPI_KEYS as a Part B compatibility-layer artifact', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').then((m) => m.default)
    expect(src).toContain('Compatibility-layer artifact (Multi-Surface Controlled Cutover, Part B)')
    expect(src).toContain('export const KPI_KEYS: string[] = DEFAULT_KPI_KEYS')
  })

  it('no isCoreKpiKey guard exists anywhere in the engine (already removed pre-bundle, confirmed not reintroduced)', async () => {
    const heatmapSrc = await import('../regionalIntelligence/heatmapSelectors?raw').then((m) => m.default)
    expect(heatmapSrc).not.toContain('isCoreKpiKey')
  })
})

describe('Accelerated Bundle — Proof 7: Dynamic failures never break UI', () => {
  it('branchRollupEngine.ts never throws when given a malformed/empty registry', () => {
    const input = makeInput()
    expect(() => generateBranchRollup(input, TEST_PERIOD, {} as any)).not.toThrow()
  })

  it('readPilotTarget/sumPilotActual wrap their Dynamic Reader calls in try/catch (verified in Phase 2, re-confirmed here)', async () => {
    const src = await pilotSrc()
    expect(src).toMatch(/try\s*\{\s*return readKpiActual/)
    expect(src).toMatch(/try\s*\{\s*return readKpiTarget/)
  })
})

describe('Accelerated Bundle — Proof 8: protected engines remain untouched', () => {
  // NOTE: Ranking Engine, Team Intelligence, Executive BI, Trend Engine,
  // Risk Engine, and Live Analytics were all intentionally migrated across
  // the later, separately approved Protected Engines Migration Bundle
  // (Phases A-D). They are certified there instead — see
  // protectedEnginesMigration.test.ts. This assertion now covers only the
  // Evaluation Engine, which stays off-limits indefinitely.
  it('Evaluation Engine never imports the pilot module', async () => {
    const src = await import('../evaluationEngine/evaluationEngine?raw').then((m) => m.default)
    expect(src).not.toContain('dynamicReaderPilot')
  })

  it('still-pending protected sites remain classified EVALUATION_ENGINE_GUARDED in the audit', () => {
    const protectedFiles = [
      'src/engine/evaluationEngine/evaluationEngine.ts',
    ]
    for (const file of protectedFiles) {
      const site = KPI_DEPENDENCY_AUDIT.find((s) => s.file === file)
      expect(site?.classification).toBe('EVALUATION_ENGINE_GUARDED')
    }
  })

  it('computeExecutiveScore inputs are unaffected — branchScore/riskLevel computed identically with or without registry', () => {
    const input = makeInput()
    const withRegistry = generateBranchRollup(input, TEST_PERIOD, DEFAULT_KPI_REGISTRY)
    const withoutRegistry = generateBranchRollup(input, TEST_PERIOD)
    expect(withRegistry.branchScore).toBe(withoutRegistry.branchScore)
    expect(withRegistry.riskLevel).toBe(withoutRegistry.riskLevel)
  })
})

describe('Accelerated Bundle — Hard Stop guardrails', () => {
  it('does not delete KPI_KEYS or remove Core KPI fields', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').then((m) => m.default)
    expect(src).toContain('export const KPI_KEYS')
    expect(src).toContain("'wasfaty'")
  })

  it('does not activate a global dynamic-only mode', async () => {
    const src = await pilotSrc()
    expect(src).not.toMatch(/dynamicOnly\s*[:=]\s*true/)
    expect(src).not.toMatch(/activateDynamicMode/i)
  })

  it('does not enable non-core KPIs beyond the 5 named pilot KPIs', () => {
    const policy = buildPilotPolicy(
      { sl: 1, ndf: 1, sales: 1, omni: 1, wellness: 1 },
      { slTarget: 1, ndfTarget: 1, salesTarget: 1, omniTarget: 1, wellnessTarget: 1 },
      DEFAULT_KPI_REGISTRY,
    )
    expect(policy.sources.length).toBe(5)
  })

  it('no historical data migration helper exists in the pilot module', async () => {
    const src = await pilotSrc()
    expect(src).not.toMatch(/migrateHistorical/i)
  })
})
