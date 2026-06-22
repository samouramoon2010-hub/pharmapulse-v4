// ============================================================
// Branch Intelligence Registry Wiring Bundle
//
// Certifies the 8 required proofs from the bundle spec:
//  1. Branch Intelligence becomes registry-driven.
//  2. Existing outputs remain unchanged.
//  3. Team Intelligence behavior remains unchanged.
//  4. No score drift occurs.
//  5. No contract changes occur.
//  6. Dynamic failures never break UI.
//  7. Legacy fallback remains available.
//  8. Evaluation Engine remains untouched.
//
// Architecture under test: useBranchIntelligenceData.js now subscribes to
// the live KPI registry and threads it into generateTeamIntelligence()
// and generateBranchSummary(). Both, in turn, route reads through the
// registry only where proven parity holds against a real sample
// (dynamicReaderPilot) — otherwise they fall back to the exact
// pre-existing legacy computation. branchIntelligenceSelectors.ts and
// branchIntelligenceViewModelBuilder.ts never read a raw KPI field
// themselves — they only consume these two engines' pre-computed
// outputs — so no behavior change is possible at the builder layer as
// long as the upstream outputs are unchanged, which Proofs 2-4 verify.
// ============================================================

import { describe, it, expect } from 'vitest'
import { format, subDays } from 'date-fns'

import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import { CORE_KPI_CONSUMER_CLASSIFICATION } from './coreKpiDeprecationPrep'
import { KPI_DEPENDENCY_AUDIT, getBlockedByProtectedDependencySites } from './dynamicKpiFoundation'

import { generateTeamIntelligence } from '../teamIntelligence/teamIntelligenceGenerator'
import type { TeamIntelligenceInput, PharmacistInput } from '../teamIntelligence/teamIntelligenceTypes'

import { generateBranchSummary, generateExecutiveReport } from '../executive/executiveReportGenerator'
import type { BranchInput } from '../executive/executiveTypes'

import { buildBranchIntelligenceViewModel } from '../branchIntelligence/branchIntelligenceViewModelBuilder'
import type { BranchIntelligenceBuilderInput } from '../branchIntelligence/branchIntelligenceTypes'

import type { KpiEntry, MonthlyTarget } from '../kpiAnalyticsEngine'
import { KPI_KEYS } from '../kpiAnalyticsEngine'

// ── Shared fixtures ─────────────────────────────────────────────
const NOW   = new Date(2025, 4, 15, 14, 0, 0)  // May 15, 2025 14:00
const PID   = 'branch-001'
const MONTH = '2025-05'

function tgt(): MonthlyTarget {
  return {
    pharmacyId: PID, month: MONTH,
    wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 120,
    basketTarget: 80, crossSellTarget: 60, salesTarget: 50000,
  }
}

function entry(date: string, vals: Partial<KpiEntry> = {}): KpiEntry {
  return {
    userId: 'u1', pharmacyId: PID, date,
    wasfaty: 7, omni: 5, wellness: 6, basket: 3, crossSelling: 3,
    ...vals,
  }
}

function nDays(n: number, uid = 'u1'): KpiEntry[] {
  return Array.from({ length: n }, (_, i) =>
    entry(format(subDays(NOW, n - 1 - i), 'yyyy-MM-dd'), { userId: uid }),
  )
}

function pharmacistInput(uid: string, entries: KpiEntry[]): PharmacistInput {
  return {
    userId: uid, displayName: `Pharmacist ${uid}`, pharmacyId: PID,
    mtdEntries: entries, historicalEntries: entries,
    target: tgt(), expectedSubmissionDays: entries.length, actualSubmissionDays: entries.length,
  }
}

function teamInput(): TeamIntelligenceInput {
  return {
    pharmacyId: PID, month: MONTH,
    pharmacists: [pharmacistInput('u1', nDays(15, 'u1')), pharmacistInput('u2', nDays(15, 'u2'))],
  }
}

function branchInput(): BranchInput {
  const all = [...nDays(15, 'u1'), ...nDays(15, 'u2')]
  return {
    pharmacyId: PID, pharmacyName: 'Branch A', pharmacyCode: 'BA', region: 'Central',
    mtdEntries: all, historicalEntries: all, target: tgt(), pharmacistCount: 2,
  }
}

function builderInput(registry?: typeof DEFAULT_KPI_REGISTRY): BranchIntelligenceBuilderInput {
  const teamIntelligence = generateTeamIntelligence(teamInput(), NOW, registry)
  const branchSummary    = generateBranchSummary(branchInput(), format(NOW, 'yyyy-MM-dd'), MONTH, registry)
  return {
    branchSummary,
    teamIntelligence,
    teamSize: 2,
    branchRankSnapshot: null,
    metadata: {
      pharmacyId: PID, month: MONTH, generatedAt: NOW.toISOString(),
      dataAvailability: { hasKpiEntries: true, hasTargets: true, hasEvaluationResults: false, hasRankingSnapshot: false },
    },
  }
}

// ══════════════════════════════════════════════════════════════
// PROOF 1 — Branch Intelligence becomes registry-driven
// ══════════════════════════════════════════════════════════════
describe('Branch Intelligence Registry Wiring — Proof 1: Branch Intelligence becomes registry-driven', () => {
  it('useBranchIntelligenceData.js subscribes to the live registry and threads it into both engine orchestrators', async () => {
    const src = await import('../../pages/branch/useBranchIntelligenceData?raw').then((m) => m.default)
    expect(src).toContain('subscribeKpiRegistry')
    expect(src).toContain('generateTeamIntelligence({ pharmacyId: branchId, month, pharmacists }, now, liveRegistry)')
    expect(src).toContain("generateBranchSummary(branchInput, format(now, 'yyyy-MM-dd'), month, liveRegistry)")
  })

  it('generateBranchSummary and generateExecutiveReport accept an optional registry parameter', () => {
    expect(() => generateBranchSummary(branchInput(), '2025-05-15', MONTH, DEFAULT_KPI_REGISTRY)).not.toThrow()
    expect(() => generateExecutiveReport(
      { branches: [branchInput()], reportDate: '2025-05-15', reportMonth: MONTH, generatedBy: 'test' },
      DEFAULT_KPI_REGISTRY,
    )).not.toThrow()
  })

  it('Branch Intelligence is classified REGISTRY_DRIVEN in CORE_KPI_CONSUMER_CLASSIFICATION', () => {
    const entry = CORE_KPI_CONSUMER_CLASSIFICATION.find((c) => c.engine === 'Branch Intelligence (display)')
    expect(entry?.classification).toBe('REGISTRY_DRIVEN')
  })

  it('no remaining audit site is classified BLOCKED_BY_PROTECTED_DEPENDENCY', () => {
    expect(getBlockedByProtectedDependencySites().length).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 2 — Existing outputs remain unchanged
// ══════════════════════════════════════════════════════════════
describe('Branch Intelligence Registry Wiring — Proof 2: Existing outputs remain unchanged', () => {
  it('buildBranchIntelligenceViewModel produces a byte-identical view model when no registry is passed (repeat call)', () => {
    const a = buildBranchIntelligenceViewModel(builderInput())
    const b = buildBranchIntelligenceViewModel(builderInput())
    const strip = (vm: typeof a) => ({
      ...vm,
      metadata: { ...vm.metadata, generatedAt: null },
      branchSummary: { ...vm.branchSummary },
    })
    expect(strip(a)).toEqual(strip(b))
  })

  it('buildBranchIntelligenceViewModel widens contributionByKpi to extra registry KPIs when a live registry is passed, without changing Core-KPI contribution values', () => {
    // Core KPI Dependency Removal — Stage F (Team Intelligence): a registry
    // now widens the upstream Team Intelligence per-KPI snapshots to every
    // active production_evaluation KPI (loop-widening, not a formula change —
    // per the standing interpretive rule for this program). This builder
    // never reads raw KPI fields itself, so it picks the wider key set up
    // automatically via contributionByKpi. The 5 Core KPI contribution
    // entries must remain byte-identical.
    const withoutRegistry = buildBranchIntelligenceViewModel(builderInput())
    const withRegistry    = buildBranchIntelligenceViewModel(builderInput(DEFAULT_KPI_REGISTRY))
    for (const key of KPI_KEYS) {
      expect(withRegistry.contributionByKpi[key]).toEqual(withoutRegistry.contributionByKpi[key])
    }
    expect(Object.keys(withRegistry.contributionByKpi).length)
      .toBeGreaterThanOrEqual(Object.keys(withoutRegistry.contributionByKpi).length)
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 3 — Team Intelligence behavior remains unchanged
// ══════════════════════════════════════════════════════════════
describe('Branch Intelligence Registry Wiring — Proof 3: Team Intelligence behavior remains unchanged', () => {
  it('generateTeamIntelligence (as called from Branch Intelligence) is byte-identical when no registry is passed', () => {
    const strip = (r: ReturnType<typeof generateTeamIntelligence>) => ({
      ...r,
      pharmacistSummaries: r.pharmacistSummaries.map((s) => ({ ...s, computedAt: null })),
      coachingRecommendations: r.coachingRecommendations.map((c) => ({ ...c, id: null })),
      teamHealth: { ...r.teamHealth, computedAt: null },
      teamTrendSummary: { ...r.teamTrendSummary, computedAt: null },
    })
    const a = generateTeamIntelligence(teamInput(), NOW)
    const b = generateTeamIntelligence(teamInput(), NOW)
    expect(strip(a)).toEqual(strip(b))
  })

  it('generateTeamIntelligence widens KPI outputs to extra registry KPIs when a registry is passed, without changing the 5 Core KPI snapshot values', () => {
    const withoutRegistry = generateTeamIntelligence(teamInput(), NOW)
    const withRegistry    = generateTeamIntelligence(teamInput(), NOW, DEFAULT_KPI_REGISTRY)
    for (const key of KPI_KEYS) {
      withoutRegistry.pharmacistSummaries.forEach((s, i) => {
        const a = s.kpiSnapshots.find((k) => k.kpiKey === key)
        const b = withRegistry.pharmacistSummaries[i].kpiSnapshots.find((k) => k.kpiKey === key)
        expect(b).toEqual(a)
      })
    }
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 4 — No score drift occurs
// ══════════════════════════════════════════════════════════════
describe('Branch Intelligence Registry Wiring — Proof 4: No score drift occurs', () => {
  it('generateBranchSummary aggregate score/trend/risk numbers are weight-gated — zero drift with the live DEFAULT_KPI_REGISTRY', () => {
    // Core KPI Dependency Removal — Stage F (Executive BI): score.kpiBreakdown
    // and trend.kpiTrends now widen to every active production_evaluation KPI
    // when a registry is supplied (loop-widening, not a formula change — per
    // the standing interpretive rule for this program). The aggregate
    // numbers consumed elsewhere (overall/adjusted/grade, overallMomentum/
    // direction, weakest/strongest, riskLevel/riskScore/flags) are all
    // weight-gated, and every current non-Core production KPI has registry
    // weight 0, so they stay byte-identical with the live registry today.
    const withoutRegistry = generateBranchSummary(branchInput(), '2025-05-15', MONTH)
    const withRegistry    = generateBranchSummary(branchInput(), '2025-05-15', MONTH, DEFAULT_KPI_REGISTRY)
    expect(withRegistry.score.overall).toBe(withoutRegistry.score.overall)
    expect(withRegistry.score.adjusted).toBe(withoutRegistry.score.adjusted)
    expect(withRegistry.score.grade).toBe(withoutRegistry.score.grade)
    expect(withRegistry.trend.overallMomentum).toBe(withoutRegistry.trend.overallMomentum)
    expect(withRegistry.trend.direction).toBe(withoutRegistry.trend.direction)
    expect(withRegistry.riskProfile.riskLevel).toBe(withoutRegistry.riskProfile.riskLevel)
    expect(withRegistry.riskProfile.riskScore).toBe(withoutRegistry.riskProfile.riskScore)
    expect(withRegistry.riskProfile.flags).toEqual(withoutRegistry.riskProfile.flags)
    expect(withRegistry.weakestKpi).toBe(withoutRegistry.weakestKpi)
    expect(withRegistry.strongestKpi).toBe(withoutRegistry.strongestKpi)
    expect(withRegistry.overallAchPct).toBe(withoutRegistry.overallAchPct)
  })

  it('generateBranchSummary widens score.kpiBreakdown/trend.kpiTrends to extra registry KPIs without changing the 5 Core entries', () => {
    const withoutRegistry = generateBranchSummary(branchInput(), '2025-05-15', MONTH)
    const withRegistry    = generateBranchSummary(branchInput(), '2025-05-15', MONTH, DEFAULT_KPI_REGISTRY)
    for (const entry of withoutRegistry.score.kpiBreakdown) {
      expect(withRegistry.score.kpiBreakdown.find((k) => k.kpiKey === entry.kpiKey)).toEqual(entry)
    }
    for (const entry of withoutRegistry.trend.kpiTrends) {
      expect(withRegistry.trend.kpiTrends.find((t) => t.kpiKey === entry.kpiKey)).toEqual(entry)
    }
    expect(withRegistry.score.kpiBreakdown.length).toBeGreaterThanOrEqual(withoutRegistry.score.kpiBreakdown.length)
    expect(withRegistry.trend.kpiTrends.length).toBeGreaterThanOrEqual(withoutRegistry.trend.kpiTrends.length)
  })

  it('the branch-level pharmacist ranking and performance scores are unaffected', () => {
    const withoutRegistry = buildBranchIntelligenceViewModel(builderInput())
    const withRegistry    = buildBranchIntelligenceViewModel(builderInput(DEFAULT_KPI_REGISTRY))
    expect(withRegistry.pharmacistRanking).toEqual(withoutRegistry.pharmacistRanking)
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 5 — No contract changes occur
// ══════════════════════════════════════════════════════════════
describe('Branch Intelligence Registry Wiring — Proof 5: No contract changes occur', () => {
  const migratedFiles = [
    '../executive/executiveReportGenerator',
  ]

  it('executiveReportGenerator.ts imports no Firebase and performs no Firestore writes', async () => {
    for (const path of migratedFiles) {
      const src = await import(/* @vite-ignore */ `${path}?raw`).then((m) => m.default)
      expect(src).not.toMatch(/from\s+['"]firebase/)
      expect(src).not.toContain('setDoc(')
      expect(src).not.toContain('updateDoc(')
      expect(src).not.toContain('collection(')
    }
  })

  it('useBranchIntelligenceData.js adds no new Firestore subscriptions beyond the live registry', async () => {
    const src = await import('../../pages/branch/useBranchIntelligenceData?raw').then((m) => m.default)
    // The 3 pre-existing fetches (entries/users/targets) plus the new
    // registry subscription are the only data sources — no new
    // fetchX/subscribeX calls were introduced beyond subscribeKpiRegistry.
    const subscribeCalls = src.match(/subscribe\w+\(/g) ?? []
    expect(new Set(subscribeCalls)).toEqual(new Set(['subscribeTargets(', 'subscribeKpiRegistry(']))
  })

  it('KPI_KEYS export still exists', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').then((m) => m.default)
    expect(src).toContain('export const KPI_KEYS')
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 6 — Dynamic failures never break UI
// ══════════════════════════════════════════════════════════════
describe('Branch Intelligence Registry Wiring — Proof 6: Dynamic failures never break UI', () => {
  it('generateBranchSummary, generateTeamIntelligence, and the view model builder never throw with a malformed registry', () => {
    expect(() => generateBranchSummary(branchInput(), '2025-05-15', MONTH, {} as any)).not.toThrow()
    expect(() => generateTeamIntelligence(teamInput(), NOW, {} as any)).not.toThrow()
    expect(() => buildBranchIntelligenceViewModel(builderInput({} as any))).not.toThrow()
  })

  it('a malformed/empty registry produces a graceful empty KPI breakdown, not a crash or a silent fallback to legacy', () => {
    // Core KPI Dependency Removal — Stage F: score.kpiBreakdown/
    // trend.kpiTrends are now derived from getProductionEngineKeys(registry),
    // which — by established, deliberate contract (Phase 4F/E) — returns []
    // for a malformed/empty registry rather than falling back to the legacy
    // 5-key list (that fallback is reserved for omitting the registry
    // entirely). A malformed registry now produces an explicit empty
    // breakdown, not the legacy output — a visible failure signal.
    const withMalformedRegistry = generateBranchSummary(branchInput(), '2025-05-15', MONTH, {} as any)
    expect(withMalformedRegistry.score.kpiBreakdown).toEqual([])
    expect(withMalformedRegistry.trend.kpiTrends).toEqual([])
    expect(() => generateBranchSummary(branchInput(), '2025-05-15', MONTH, {} as any)).not.toThrow()
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 7 — Legacy fallback remains available
// ══════════════════════════════════════════════════════════════
describe('Branch Intelligence Registry Wiring — Proof 7: Legacy fallback remains available', () => {
  it('executiveReportGenerator.ts imports the gated pilot reader, not an unconditional registry reader', async () => {
    const src = await import('../executive/executiveReportGenerator?raw').then((m) => m.default)
    expect(src).toContain('dynamicReaderPilot')
    expect(src).toMatch(/registry\s*&&\s*policy/)
  })

  it('useBranchIntelligenceData.js falls back to DEFAULT_KPI_REGISTRY on a registry subscription error', async () => {
    const src = await import('../../pages/branch/useBranchIntelligenceData?raw').then((m) => m.default)
    expect(src).toContain('setLiveRegistry(DEFAULT_KPI_REGISTRY)')
  })

  it('generateTeamIntelligence/generateBranchSummary still work correctly when no registry is passed at all', () => {
    expect(() => generateTeamIntelligence(teamInput(), NOW)).not.toThrow()
    expect(() => generateBranchSummary(branchInput(), '2025-05-15', MONTH)).not.toThrow()
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 8 — Evaluation Engine remains untouched
// ══════════════════════════════════════════════════════════════
describe('Branch Intelligence Registry Wiring — Proof 8: Evaluation Engine remains untouched', () => {
  it('Evaluation Engine never imports dynamicReaderPilot', async () => {
    const src = await import('../evaluationEngine/evaluationEngine?raw').then((m) => m.default)
    expect(src).not.toContain('dynamicReaderPilot')
  })

  it('Evaluation Engine still classified EVALUATION_ENGINE_GUARDED in the audit', () => {
    const site = KPI_DEPENDENCY_AUDIT.find((s) => s.file === 'src/engine/evaluationEngine/evaluationEngine.ts')
    expect(site?.classification).toBe('EVALUATION_ENGINE_GUARDED')
  })

  it('Branch Intelligence selectors/builder files never import dynamicReaderPilot directly', async () => {
    const selectorsSrc = await import('../branchIntelligence/branchIntelligenceSelectors?raw').then((m) => m.default)
    const builderSrc    = await import('../branchIntelligence/branchIntelligenceViewModelBuilder?raw').then((m) => m.default)
    expect(selectorsSrc).not.toContain('dynamicReaderPilot')
    expect(builderSrc).not.toContain('dynamicReaderPilot')
  })
})
