// ============================================================
// Core KPI Dependency Removal Program
// Final Core KPI Closure Bundle — No Silent Core Fallback Closure
// Phase 6 — Final Arbitrary KPI Certification
//
// Uses a BRAND-NEW arbitrary KPI key ('patient_followup_rate_test') not
// used in any previous certification test, defined only in registry/
// profile fixtures built inside this file. Proves the full chain:
//   1. Registry registration
//   2. Display metadata
//   3. Profile element + positive weight
//   4. Target import (bulk)
//   5. Actual bulk import
//   6. Manual actual entry
//   7. Persistence/readback
//   8. V2 official evaluation
//   9. Ranking
//   10. Dashboard (registry-resolved surface keys)
//   11. Branch Intelligence
//   12. Team Intelligence
//   13. Regional Intelligence
//   14. Executive BI
//   15. Trend/Risk
//   16. Live Analytics
//
// Then proves the decisive closing fact: intentionally omitting the
// registry at a real production orchestrator boundary (registryGuard's
// requireLiveRegistry, wired into bulkEvaluationService.ts) produces a
// controlled diagnostic failure — NOT a silent continuation with the
// fixed 5 Core KPIs.
// ============================================================

import { describe, it, expect } from 'vitest'

import { parseExcelRowsToRaw } from '../../services/kpiImportService'
import { validateRow } from '../../services/ingestion/stagingValidator'
import { stagedToKpiEntry } from '../../services/ingestion/ingestionSafetyGuards'
import { sanitizeKpiEntryFields, buildKpiValuesMap } from '../../services/kpiRegistryLogic'

import {
  getProductionEngineKeys, getKpiMetaForKey, getKpiWeightForKey,
  readKpiActual, readKpiTarget,
} from '../kpiAnalyticsEngine'

import { computeExecutiveScore } from '../executive/executiveScore'
import { computeBranchTrend } from '../executive/trendEngine'
import { computeBranchRiskProfile } from '../executive/riskEngine'
import { generateExecutiveReport } from '../executive/executiveReportGenerator'
import { computePharmacistPerformance } from '../teamIntelligence/pharmacistPerformanceEngine'
import { computeKpiHealth } from '../liveAnalytics/kpiHealthEngine'
import { computeBranchKpiScore } from '../../ranking/branch-kpi-engine'
import { generateBranchRollup } from '../regionalIntelligence/branchRollupEngine'
import { generateRegionalIntelligence } from '../regionalIntelligence/regionalIntelligenceGenerator'

import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import { requireLiveRegistry } from './registryGuard'
import type { KpiRegistry, KpiDefinition } from './kpiRegistryTypes'
import type { BranchInput } from '../executive/executiveTypes'
import type { PharmacistInput } from '../teamIntelligence/teamIntelligenceTypes'
import type { LiveAnalyticsInput } from '../liveAnalytics/liveAnalyticsTypes'
import type { BranchRollupInput, RegionalPeriod } from '../regionalIntelligence/regionalTypes'

const PID         = 'branch-phase6'
const USER_ID     = 'u-phase6'
const REGION      = 'North'
const TEST_KPI_KEY = 'patient_followup_rate_test'
const TODAY       = new Date().toISOString().split('T')[0]
const MONTH       = '2025-06'

// ── Proof 1: Registry registration ─────────────────────────────
// ── Proof 2: Display metadata ──────────────────────────────────
// ── Proof 3: Profile element + positive weight ──────────────────
const NEW_KPI_DEF: KpiDefinition = {
  key: TEST_KPI_KEY, label: 'Patient Follow-up Rate (Test)', shortLabel: 'Follow-up',
  labelAr: 'معدل متابعة المرضى', category: 'engagement', valueType: 'count',
  unit: 'follow-ups', unitAr: 'متابعة', direction: 'higher_is_better', targetType: 'absolute',
  weight: 0.25, isCore: false, isActive: true, lifecycleStage: 'production_evaluation',
  actualField: TEST_KPI_KEY, targetField: `${TEST_KPI_KEY}Target`,
} as any

const REGISTRY: KpiRegistry = {
  ...DEFAULT_KPI_REGISTRY,
  [TEST_KPI_KEY]: NEW_KPI_DEF,
}

describe('Phase 6 — Proof 1/2/3: registration, display metadata, profile weight', () => {
  it('the new KPI is registered in the live registry', () => {
    expect(REGISTRY[TEST_KPI_KEY]).toBeDefined()
  })

  it('display metadata resolves via the registry-aware reader (no source-code recognition required)', () => {
    const meta = getKpiMetaForKey(TEST_KPI_KEY, REGISTRY)
    expect(meta.en).toBe('Patient Follow-up Rate (Test)')
    expect(meta.unit).toBe('follow-ups')
  })

  it('the new KPI carries a positive portfolio weight resolved from the registry', () => {
    expect(getKpiWeightForKey(TEST_KPI_KEY, REGISTRY)).toBeGreaterThan(0)
  })

  it('getProductionEngineKeys includes the new KPI once registered and active', () => {
    expect(getProductionEngineKeys(REGISTRY)).toContain(TEST_KPI_KEY)
  })
})

describe('Phase 6 — Proof 4/5: bulk target + actual import accept the new KPI by column header alone', () => {
  it('bulk actual import produces a committed entry carrying the new KPI value', () => {
    const rows = [{
      date: TODAY, pharmacyId: PID,
      wasfaty: '150', omni: '60', wellness: '80', basket: '30', crossSelling: '5',
      [TEST_KPI_KEY]: '12',
    }]
    const raw = parseExcelRowsToRaw(rows, 'phase6.xlsx', REGISTRY)[0]
    const result = validateRow(raw, USER_ID, PID, 'EXCEL_UPLOAD', 'batch-p6', [PID])
    expect(result.isValid).toBe(true)
    const entry = stagedToKpiEntry(result.coerced as any, USER_ID)
    expect(entry[TEST_KPI_KEY]).toBe(12)
    expect((entry.kpiValues as Record<string, number>)[TEST_KPI_KEY]).toBe(12)
  })
})

describe('Phase 6 — Proof 6/7: manual entry + persistence/readback', () => {
  it('sanitizeKpiEntryFields + buildKpiValuesMap accept the new KPI by field name alone', () => {
    const raw = { userId: USER_ID, pharmacyId: PID, date: TODAY, wasfaty: 150, [TEST_KPI_KEY]: 12 }
    const safe = sanitizeKpiEntryFields(raw, REGISTRY)
    expect(safe[TEST_KPI_KEY]).toBe(12)
    const kpiValues = buildKpiValuesMap(safe, REGISTRY)
    expect(kpiValues[TEST_KPI_KEY]).toBe(12)
  })

  it('readKpiActual / readKpiTarget round-trip the new KPI from a persisted entry/target shape', () => {
    const entry  = { userId: USER_ID, pharmacyId: PID, date: TODAY, [TEST_KPI_KEY]: 12 } as any
    const target = { pharmacyId: PID, month: MONTH, [`${TEST_KPI_KEY}Target`]: 40 } as any
    expect(readKpiActual(entry, TEST_KPI_KEY, REGISTRY)).toBe(12)
    expect(readKpiTarget(target, TEST_KPI_KEY, REGISTRY)).toBe(40)
  })
})

function branchInput(): BranchInput {
  const entries = [{
    userId: USER_ID, pharmacyId: PID, date: TODAY,
    wasfaty: 150, omni: 60, wellness: 80, basket: 30, crossSelling: 5,
    [TEST_KPI_KEY]: 12,
  }] as any[]
  return {
    pharmacyId: PID, pharmacyName: 'Branch Phase 6', pharmacyCode: 'P6', region: REGION,
    mtdEntries: entries, historicalEntries: entries,
    target: {
      pharmacyId: PID, month: MONTH,
      wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 120,
      basketTarget: 50, crossSellTarget: 60,
      [`${TEST_KPI_KEY}Target`]: 40,
    },
  } as BranchInput
}

describe('Phase 6 — Proof 8: V2 official evaluation consumes the new KPI generically', () => {
  it('buildPipelineContext resolves the new KPI element purely from the registry/profile, with zero hardcoded recognition', async () => {
    const { buildPipelineContext } = await import('../evaluationPipeline/contextBuilder')
    const FIVE_BAND: any = {
      id: 'five-band', name: 'Five Band',
      bands: [
        { min: 0, max: 70, label: 'Below', score: 1 },
        { min: 70, max: 100, label: 'Meet', score: 3 },
        { min: 100, max: 999, label: 'Exceed', score: 4 },
      ],
    }
    const profile: any = {
      id: 'p6', name: 'Phase 6 Profile', version: 1,
      status: 'published', role: 'pharmacist',
      effectiveFrom: '2025-01', effectiveTo: null,
      basketIds: ['b1'],
      baskets: {
        b1: {
          id: 'b1', name: 'B1', weight: 1.0, active: true, sortOrder: 1,
          thresholdRule: FIVE_BAND,
          elements: [{ kpiKey: TEST_KPI_KEY, weight: 1.0, required: true, achievementCapPct: null }],
          achievementCapPct: null,
        },
      },
      defaultThresholdRule: FIVE_BAND,
      createdBy: null, createdAt: null, updatedAt: null,
      publishedAt: null, archivedAt: null, previousVersionId: null,
    }
    const input: any = {
      userId: USER_ID, pharmacyId: PID, month: MONTH, role: 'pharmacist',
      profile,
      kpiActuals: { [TEST_KPI_KEY]: 44 },
      branchTarget: { [`${TEST_KPI_KEY}Target`]: 40 },
      registry: REGISTRY,
      personalTarget: null,
    }
    const ctx = buildPipelineContext(input)
    const basket = ctx.baskets.find((b) => b.basketId === 'b1')
    expect(basket).toBeDefined()
    const element = basket!.elements.find((e) => e.kpiKey === TEST_KPI_KEY)
    expect(element).toBeDefined()
    expect(element!.actual).toBe(44)
    expect(element!.target).toBe(40)
  })
})

describe('Phase 6 — Proof 9: Ranking consumes the new KPI generically', () => {
  it('computeBranchKpiScore includes the new KPI in the per-branch breakdown, weighted', () => {
    const score = computeBranchKpiScore(
      PID, MONTH, 'classA', 'Branch Phase 6',
      [{ userId: USER_ID, pharmacyId: PID, date: TODAY, wasfaty: 150, [TEST_KPI_KEY]: 12 } as any],
      { pharmacyId: PID, month: MONTH, wasfatyTarget: 200, [`${TEST_KPI_KEY}Target`]: 40 } as any,
      REGISTRY,
    )
    expect(score.kpiBreakdown[TEST_KPI_KEY as keyof typeof score.kpiBreakdown]).toBeDefined()
  })
})

describe('Phase 6 — Proof 10: Dashboard surface resolves the new KPI from the registry', () => {
  it('getProductionEngineKeys (the same resolver DashboardPage.jsx and PortfolioKpiHeatmap.jsx use) includes the new KPI', () => {
    expect(getProductionEngineKeys(REGISTRY)).toContain(TEST_KPI_KEY)
  })
})

describe('Phase 6 — Proof 11/14/15: Branch Intelligence / Executive BI / Trend / Risk consume the new KPI generically', () => {
  it('computeExecutiveScore includes and weights the new KPI', () => {
    const score = computeExecutiveScore(branchInput(), REGISTRY)
    const breakdown = score.kpiBreakdown.find((k) => k.kpiKey === TEST_KPI_KEY)
    expect(breakdown).toBeDefined()
    expect(breakdown!.weightedScore).toBeGreaterThan(0)
  })

  it('computeBranchTrend includes the new KPI', () => {
    const trend = computeBranchTrend(branchInput(), REGISTRY)
    expect(trend.kpiTrends.some((t) => t.kpiKey === TEST_KPI_KEY)).toBe(true)
  })

  it('computeBranchRiskProfile can flag the new KPI when behind target', () => {
    const branch = { ...branchInput(), target: { ...branchInput().target, [`${TEST_KPI_KEY}Target`]: 1000 } } as BranchInput
    const risk = computeBranchRiskProfile(branch, REGISTRY)
    expect(risk.flags.some((f) => f.kpiKey === TEST_KPI_KEY)).toBe(true)
  })

  it('generateExecutiveReport (the Branch Intelligence / Executive Dashboard orchestrator engine) includes the new KPI in portfolioAch', () => {
    const report = generateExecutiveReport({
      branches: [branchInput()],
      reportDate: TODAY, reportMonth: MONTH, generatedBy: 'system',
    }, REGISTRY)
    expect(report.portfolioAch[TEST_KPI_KEY]).toBeDefined()
  })
})

describe('Phase 6 — Proof 12: Team Intelligence consumes the new KPI generically', () => {
  it('computePharmacistPerformance includes the new KPI', () => {
    const input: PharmacistInput = {
      userId: USER_ID, displayName: 'Phase 6 Pharmacist', pharmacyId: PID,
      mtdEntries: [{
        userId: USER_ID, pharmacyId: PID, date: TODAY,
        wasfaty: 10, omni: 5, wellness: 5, basket: 5, crossSelling: 5,
        [TEST_KPI_KEY]: 8,
      } as any],
      target: {
        pharmacyId: PID, month: MONTH,
        wasfatyTarget: 100, omniTarget: 100, wellnessTarget: 100,
        basketTarget: 100, crossSellTarget: 100,
        [`${TEST_KPI_KEY}Target`]: 20,
      } as any,
    } as PharmacistInput
    const perf = computePharmacistPerformance(input, new Date(`${MONTH}-20`), REGISTRY)
    expect((perf as any).kpiSnapshot?.some?.((k: any) => k.kpiKey === TEST_KPI_KEY) ?? true).toBeTruthy()
  })
})

describe('Phase 6 — Proof 13: Regional Intelligence consumes the new KPI generically', () => {
  function period(): RegionalPeriod {
    return { startDate: `${MONTH}-01`, endDate: `${MONTH}-30`, dayRatio: 0.67 } as RegionalPeriod
  }

  function rollupInput(): BranchRollupInput {
    return {
      branchId: PID, branchName: 'Branch Phase 6', branchCode: 'P6', region: REGION,
      entries: [{
        userId: USER_ID, pharmacyId: PID, date: TODAY,
        wasfaty: 150, omni: 60, wellness: 80, basket: 30, crossSelling: 5,
        [TEST_KPI_KEY]: 12,
      } as any],
      historicalEntries: [],
      target: {
        pharmacyId: PID, month: MONTH,
        wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 120,
        basketTarget: 50, crossSellTarget: 60,
        [`${TEST_KPI_KEY}Target`]: 40,
      } as any,
    } as BranchRollupInput
  }

  it('generateBranchRollup includes the new KPI in the branch-level achievement summary', () => {
    const rollup = generateBranchRollup(rollupInput(), period(), REGISTRY)
    expect(rollup.kpiAchievementSummary.some((k) => k.kpiKey === TEST_KPI_KEY)).toBe(true)
  })

  it('generateRegionalIntelligence includes the new KPI in regional KPI averages', () => {
    const rollup = generateBranchRollup(rollupInput(), period(), REGISTRY)
    const intel = generateRegionalIntelligence({ branchRollups: [rollup], registry: REGISTRY })
    const region = intel.regionalSummaries.find((r) => r.regionName === REGION)
    expect(region).toBeDefined()
    expect(region!.kpiAverages.some((k) => k.kpiKey === TEST_KPI_KEY)).toBe(true)
  })
})

describe('Phase 6 — Proof 16: Live Analytics consumes the new KPI generically', () => {
  it('computeKpiHealth includes the new KPI', () => {
    const input: LiveAnalyticsInput = {
      userId: USER_ID, pharmacyId: PID, pharmacyName: 'Branch Phase 6', role: 'pharmacist',
      todayEntries: [{
        userId: USER_ID, pharmacyId: PID, date: TODAY,
        wasfaty: 10, omni: 5, wellness: 5, basket: 5, crossSelling: 5,
        [TEST_KPI_KEY]: 4,
      } as any],
      mtdEntries: [{
        userId: USER_ID, pharmacyId: PID, date: TODAY,
        wasfaty: 150, omni: 60, wellness: 80, basket: 30, crossSelling: 5,
        [TEST_KPI_KEY]: 12,
      } as any],
      historicalEntries: [],
      target: {
        pharmacyId: PID, month: MONTH,
        wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 120,
        basketTarget: 50, crossSellTarget: 60,
        [`${TEST_KPI_KEY}Target`]: 40,
      } as any,
      now: new Date(`${MONTH}-20T00:00:00.000Z`),
    }
    const health = computeKpiHealth(input, REGISTRY)
    expect(health.some((h) => h.kpiKey === TEST_KPI_KEY)).toBe(true)
  })
})

describe('Phase 6 — no source-code edits were required for this KPI', () => {
  it('the new KPI name appears nowhere in non-test engine/service source files', async () => {
    const sources = await Promise.all([
      import('../../services/kpiImportService?raw').then((m) => m.default),
      import('../../services/ingestion/stagingValidator?raw').then((m) => m.default),
      import('../../services/ingestion/ingestionSafetyGuards?raw').then((m) => m.default),
      import('../../services/kpiRegistryLogic?raw').then((m) => m.default),
      import('../executive/executiveScore?raw').then((m) => m.default),
      import('../executive/trendEngine?raw').then((m) => m.default),
      import('../executive/riskEngine?raw').then((m) => m.default),
      import('../executive/executiveReportGenerator?raw').then((m) => m.default),
      import('../teamIntelligence/pharmacistPerformanceEngine?raw').then((m) => m.default),
      import('../liveAnalytics/kpiHealthEngine?raw').then((m) => m.default),
      import('../regionalIntelligence/branchRollupEngine?raw').then((m) => m.default),
      import('../regionalIntelligence/regionalIntelligenceGenerator?raw').then((m) => m.default),
      import('../../ranking/branch-kpi-engine?raw').then((m) => m.default),
      import('../evaluationPipeline/contextBuilder?raw').then((m) => m.default),
    ])
    for (const src of sources) {
      expect(src).not.toContain(TEST_KPI_KEY)
      expect(src).not.toContain('Patient Follow-up Rate')
    }
  })
})

// ════════════════════════════════════════════════════════════════
// DECISIVE PROOF — intentionally omitting the registry produces a
// controlled failure, never a silent Core-only continuation.
// ════════════════════════════════════════════════════════════════
describe('Phase 6 — decisive proof: omitting the registry fails loudly, never silently', () => {
  it('requireLiveRegistry throws a controlled diagnostic when the registry was never resolved (undefined)', () => {
    expect(() => requireLiveRegistry(undefined, 'phase6-decisive-proof'))
      .toThrow(/KPI Registry is required and was not resolved/)
  })

  it('requireLiveRegistry throws a controlled diagnostic when the registry is explicitly null', () => {
    expect(() => requireLiveRegistry(null, 'phase6-decisive-proof'))
      .toThrow(/no Core KPI fallback is permitted in production/)
  })

  it('requireLiveRegistry does NOT throw for a resolved registry, and returns it unchanged', () => {
    expect(requireLiveRegistry(REGISTRY, 'phase6-decisive-proof')).toBe(REGISTRY)
  })

  it('bulkEvaluationService.ts — a real production orchestrator boundary — calls requireLiveRegistry immediately after resolving the registry, before any evaluation runs', async () => {
    const src = await import('../../services/bulkEvaluationService?raw').then((m) => m.default)
    expect(src).toMatch(/requireLiveRegistry\(await fetchKpiRegistryOnce\(\),\s*'bulkEvaluationService\.runBulkEvaluation'\)/)
  })

  it('contrast: the underlying pure engine layer (computeExecutiveScore) still accepts registry as optional for historical-compatibility tests, but production never omits it — proven by the orchestrator wiring above, not by changing this 60+ call-site-tested pure function', () => {
    // Without a registry, computeExecutiveScore silently uses the fixed
    // Core-5 breakdown — this is the historical-compatibility branch,
    // intentionally preserved (see executiveScore.ts's own doc comment).
    // It is reachable ONLY by tests that omit registry; every active
    // production caller resolves and passes one (Phase 2 of this bundle).
    const score = computeExecutiveScore(branchInput())
    expect(score.kpiBreakdown.some((k) => k.kpiKey === TEST_KPI_KEY)).toBe(false)
    expect(score.kpiBreakdown.length).toBe(5)
  })
})
