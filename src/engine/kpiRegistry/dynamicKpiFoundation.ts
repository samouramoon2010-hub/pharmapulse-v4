// ============================================================
// Dynamic KPI Foundation — Controlled Cutover Bundle, Phase A-D
//
// Goal: begin the transition from hardcoded Core KPIs to a fully
// registry-driven KPI architecture WITHOUT changing production
// behaviour. This module is purely additive — shadow infrastructure
// that runs alongside the legacy path. It does not replace, call,
// or alter the Evaluation Engine, Profile Studio, or Import Engine.
//
// Architecture model (per bundle spec):
//   1. KPI Registry      = what exists           (kpiRegistryTypes.ts)
//   2. Evaluation Profile = how it is scored      (Evaluation Engine — untouched)
//   3. Display Profile    = where it appears      (Scope C, this file)
//   4. Import Mapping     = how it is ingested    (Profile Studio — untouched)
//
// Cutover phase covered here: A (Dynamic Readers Foundation),
// B (Shadow Mode), C (Display Profile Foundation), D (Parity
// Validation). Phase E (Legacy Core KPI Deprecation) and the
// Controlled Cutover activation step are explicitly NOT in scope —
// legacy readers remain authoritative until a future, separately
// approved bundle flips the switch.
//
// No Firestore contract changes. No new persisted fields. Every
// function here is pure and derives its output entirely from data
// already passed in or already present on KpiDefinition.
// ============================================================

import {
  computeKpiStatsDynamic,
  compareStaticVsDynamicKpi,
  getProductionEngineKeys,
  type DayProgress,
  type KpiStats,
} from '../kpiAnalyticsEngine'

import {
  getActiveKpis,
  getKpisForSurface,
  type KpiRegistry,
  type KpiDefinition,
  type KpiVisibility,
} from './kpiRegistryTypes'

import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'

// ══════════════════════════════════════════════════════════════
// SCOPE A — DYNAMIC READERS FOUNDATION: DEPENDENCY AUDIT
// ══════════════════════════════════════════════════════════════

/**
 * How a hardcoded-KPI call site is classified for this bundle.
 *
 *   ALREADY_DYNAMIC          - reads keys from the live registry already;
 *                               no migration needed.
 *   MIGRATED                 - was hardcoded, replaced with a registry-driven
 *                               reader in a prior approved bundle (Stabilization Pass).
 *   EVALUATION_ENGINE_GUARDED - feeds scoring, ranking, or Executive BI.
 *                               Touching it would change Evaluation Engine
 *                               behaviour — explicitly a Hard Stop in this
 *                               bundle. Deferred to a future, separately
 *                               approved migration with its own GO/NO-GO.
 *   DISPLAY_DEFERRED_BY_DESIGN - a pure display surface that intentionally
 *                               renders core-only KPIs until the upstream
 *                               engine that feeds it is extended (documented
 *                               in the surface's own source comments).
 *   BLOCKED_BY_PROTECTED_DEPENDENCY - the surface itself has no hardcoded
 *                               assumption of its own, but its KPI values
 *                               originate inside a protected engine (e.g.
 *                               Team Intelligence). Piloting it would
 *                               require modifying that protected engine —
 *                               deferred until that engine's own migration
 *                               is separately approved.
 */
export type KpiDependencyClassification =
  | 'ALREADY_DYNAMIC'
  | 'MIGRATED'
  | 'EVALUATION_ENGINE_GUARDED'
  | 'DISPLAY_DEFERRED_BY_DESIGN'
  | 'BLOCKED_BY_PROTECTED_DEPENDENCY'

export interface KpiDependencySite {
  file: string
  dependsOn: string
  classification: KpiDependencyClassification
  note: string
}

/**
 * Structured audit of every call site found depending on KPI_KEYS,
 * the local isCoreKpiKey() guard, or other hardcoded core-KPI
 * assumptions, as required by Scope A.
 *
 * This is a documentation-only, testable structured data object —
 * the same pattern used for COHORT_SIMULATION_READINESS. It records
 * the audit result rather than performing a live migration, so the
 * "replace only where safe" instruction is honoured: nothing in the
 * EVALUATION_ENGINE_GUARDED tier is touched by this bundle.
 */
export const KPI_DEPENDENCY_AUDIT: readonly KpiDependencySite[] = [
  {
    file: 'src/pages/dashboard/DashboardPage.jsx',
    dependsOn: 'local KPI_KEYS const',
    classification: 'ALREADY_DYNAMIC',
    note: 'Shadows the import with a local const derived from the live registry (aliasFor ?? key). No migration needed.',
  },
  {
    file: 'src/components/executive/RegionalIntelligencePanel.jsx',
    dependsOn: 'KPI_KEYS import',
    classification: 'MIGRATED',
    note: 'Migrated to getProductionEngineKeys(liveRegistry) during the Stabilization Pass.',
  },
  {
    file: 'src/engine/regionalIntelligence/heatmapSelectors.ts',
    dependsOn: 'local isCoreKpiKey() guard',
    classification: 'MIGRATED',
    note: 'Guard removed during the Stabilization Pass; replaced with a findKpiSummary() presence check so dynamic KPIs reach the heatmap.',
  },
  {
    file: 'src/engine/regionalIntelligence/branchRollupEngine.ts',
    dependsOn: 'sumKpi() / getTargetForKpi() called without a registry',
    classification: 'MIGRATED',
    note: 'Multi-Surface Controlled Cutover: buildKpiRollupSummaries() now builds a pilot policy from a real entry+target sample and routes each of the 5 named pilot KPIs through sumPilotActual()/readPilotTarget() — Dynamic Reader only when parity is proven, Legacy Reader otherwise. Non-pilot keys and computeExecutiveScore()\'s inputs are unaffected (proven parity means identical numbers either way).',
  },
  {
    file: 'src/engine/teamIntelligence/pharmacistPerformanceEngine.ts',
    dependsOn: 'dailyKpi() direct field access (Number(e[kpiKey])); computePharmacistPerformance() has no registry parameter',
    classification: 'MIGRATED',
    note: 'Protected Engines Migration Phase A resolved this: computePharmacistPerformance() now accepts an optional registry, gated by dynamicReaderPilot. See the consolidated Team Intelligence entry below for the full Phase A scope.',
  },
  {
    file: 'src/engine/branchIntelligence/branchIntelligenceSelectors.ts + branchIntelligenceViewModelBuilder.ts',
    dependsOn: 'KPI_KEYS (iterates pre-computed PharmacistPerformanceSummary.kpiSnapshots — no direct document field access of its own)',
    classification: 'ALREADY_DYNAMIC',
    note: 'Branch Intelligence Registry Wiring Bundle: these two files never read a raw KPI field directly — they only consume pre-computed PharmacistPerformanceSummary.kpiSnapshots and BranchExecutiveSummary.score.kpiBreakdown, both of which are now registry-aware upstream (see useBranchIntelligenceData.js entry below). No code change was needed or made here; KPI_KEYS iteration is the compatibility-layer convention, unchanged.',
  },
  {
    file: 'src/pages/branch/useBranchIntelligenceData.js',
    dependsOn: 'generateTeamIntelligence() / generateBranchSummary() called without a registry',
    classification: 'MIGRATED',
    note: 'Branch Intelligence Registry Wiring Bundle: subscribes to the live KPI registry (subscribeKpiRegistry, mirroring Dashboard/Regional Intelligence) and threads it into generateTeamIntelligence() and generateBranchSummary(). This was the last unwired call site from Protected Engines Migration Phase A — Branch Intelligence is now fully registry-driven end-to-end, completing the chain alongside Dashboard, Regional Intelligence, Team Intelligence, Ranking, Executive BI, Trend, Risk, and Live Analytics.',
  },
  {
    file: 'src/components/executive/PortfolioKpiHeatmap.jsx',
    dependsOn: 'KPI_KEYS import',
    classification: 'DISPLAY_DEFERRED_BY_DESIGN',
    note: 'Renders report.portfolioAch, which executiveReportGenerator only populates for the 5 core KPIs. Migrating the iteration key alone would not surface any new KPI (the lookup would just miss) and would require extending the Executive/Evaluation Engine — out of scope and a Hard Stop in this bundle. Documented in the component’s own header comment as a deferred limitation.',
  },
  {
    file: 'src/engine/evaluationEngine/evaluationEngine.ts',
    dependsOn: 'KPI_KEYS',
    classification: 'EVALUATION_ENGINE_GUARDED',
    note: 'Drives scoring directly. Touching this is the Evaluation Engine Hard Stop.',
  },
  {
    file: 'src/engine/executive/executiveScore.ts + riskEngine.ts + trendEngine.ts',
    dependsOn: 'KPI_KEYS / sumKpi() / extractDailyValues() / direct field access called without a registry',
    classification: 'MIGRATED',
    note: 'Protected Engines Migration Phase C: registry is now an optional parameter threaded through computeExecutiveScore, computeBranchRiskProfile, and computeBranchTrend, gated by dynamicReaderPilot (Dynamic Reader only when parity proven, Legacy Reader otherwise). The score/risk/trend formulas themselves are completely unchanged — only the underlying actual/target reads they consume are routed through the pilot policy. No call site passes a registry yet, so production behavior is unchanged.',
  },
  {
    file: 'src/engine/teamIntelligence/pharmacistPerformanceEngine.ts + teamHealthEngine.ts + accountabilityEngine.ts',
    dependsOn: 'KPI_KEYS / sumKpi() / direct field access called without a registry',
    classification: 'MIGRATED',
    note: 'Protected Engines Migration Phase A: registry is now an optional parameter threaded through computePharmacistPerformance, computeTeamHealth, and computeAccountabilityInsights, gated by dynamicReaderPilot (Dynamic Reader only when parity proven, Legacy Reader otherwise). No call site passes a registry yet, so production behavior is unchanged. accountabilityEngine.ts\'s hasConsistentUnderperformance() was intentionally left unmigrated — it resolves the crossSelling target field via a pre-existing ad-hoc convention that diverges from KPI_META/the registry; migrating it would be a real behavior change, not just an implementation swap.',
  },
  {
    file: 'src/engine/teamIntelligence/coachingEngine.ts',
    dependsOn: 'KPI_META (label lookups only)',
    classification: 'ALREADY_DYNAMIC',
    note: 'Reads only KPI_META labels from an already-computed PharmacistPerformanceSummary — never reads a raw KPI field itself. No migration needed.',
  },
  {
    file: 'src/engine/liveAnalytics/kpiHealthEngine.ts + activityFeedEngine.ts + liveAlertEngine.ts + liveMomentumEngine.ts + liveAnalyticsGenerator.ts',
    dependsOn: 'KPI_KEYS / sumKpi() / direct field access called without a registry',
    classification: 'MIGRATED',
    note: 'Protected Engines Migration Phase D: registry is now an optional parameter threaded through computeKpiHealth, generateActivityFeed, generateLiveAlerts, countSuppressedAlerts, computeLiveMomentum, and the generateLiveAnalytics orchestrator, gated by dynamicReaderPilot. Alert thresholds, health-state derivation, and momentum formulas are completely unchanged — only the underlying actual/target reads they consume are routed through the pilot policy. No call site passes a registry yet, so production behavior is unchanged.',
  },
  {
    file: 'src/ranking/branch-kpi-engine.ts',
    dependsOn: 'KPI_KEYS (kpiBreakdown display loop only — the ranking score itself is untouched)',
    classification: 'MIGRATED',
    note: 'Protected Engines Migration Phase B: registry is now an optional parameter threaded through computeBranchKpiScore/scoreBranches, gated by dynamicReaderPilot. The ranking SCORE (overallAchievementPct, from buildBranchSummary) is never routed through the pilot policy — only the supplementary per-KPI kpiBreakdown display data is. No call site passes a registry yet, so production behavior and ranking results are unchanged.',
  },
] as const

/** Convenience filter — sites still safe to consider for a future migration. */
export function getDeferredEvaluationEngineSites(): readonly KpiDependencySite[] {
  return KPI_DEPENDENCY_AUDIT.filter(
    (site) => site.classification === 'EVALUATION_ENGINE_GUARDED',
  )
}

/** Convenience filter — sites already completed (no further work needed). */
export function getCompletedDependencySites(): readonly KpiDependencySite[] {
  return KPI_DEPENDENCY_AUDIT.filter(
    (site) => site.classification === 'ALREADY_DYNAMIC' || site.classification === 'MIGRATED',
  )
}

/** Convenience filter — sites blocked only by a protected dependency, not by their own logic. */
export function getBlockedByProtectedDependencySites(): readonly KpiDependencySite[] {
  return KPI_DEPENDENCY_AUDIT.filter(
    (site) => site.classification === 'BLOCKED_BY_PROTECTED_DEPENDENCY',
  )
}

// ══════════════════════════════════════════════════════════════
// SCOPE B — SHADOW MODE DYNAMIC READERS
// ══════════════════════════════════════════════════════════════

/**
 * One KPI's shadow comparison result: legacy (no-registry) read
 * vs dynamic (registry-driven) read, computed in parallel.
 *
 * This never overwrites or feeds back into the legacy value —
 * it is a read-only comparison record for parity checking.
 */
export interface ShadowKpiReading {
  key: string
  legacy: KpiStats
  dynamic: KpiStats
  parity: ReturnType<typeof compareStaticVsDynamicKpi>
}

export interface ShadowKpiReport {
  generatedAt: string
  registryKeysUsed: string[]
  readings: ShadowKpiReading[]
  allParityMatched: boolean
}

/**
 * Compute legacy + dynamic KPI stats for every production-evaluation
 * key in the given registry, in parallel, without ever writing back
 * to or overwriting the legacy value.
 *
 * Legacy path = computeKpiStatsDynamic() called WITHOUT a registry
 * (falls back to the static field-name resolution that production
 * currently uses). Dynamic path = the same function called WITH the
 * registry (registry-first field resolution).
 *
 * Use only for shadow evaluation, parity dashboards, and tests.
 * Never call this from a production scoring or ranking path.
 */
export function buildShadowKpiReport(
  entry: Record<string, unknown>,
  targetDoc: Record<string, unknown>,
  dayProgress: DayProgress,
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): ShadowKpiReport {
  const registryKeysUsed = getProductionEngineKeys(registry)

  const readings: ShadowKpiReading[] = registryKeysUsed.map((key) => {
    const legacy = computeKpiStatsDynamic(entry, targetDoc, key, dayProgress)
    const dynamic = computeKpiStatsDynamic(entry, targetDoc, key, dayProgress, registry)
    const parity = compareStaticVsDynamicKpi(entry, targetDoc, key, registry)
    return { key, legacy, dynamic, parity }
  })

  return {
    generatedAt: new Date().toISOString(),
    registryKeysUsed,
    readings,
    allParityMatched: readings.every((r) => r.parity.actualMatches && r.parity.targetMatches),
  }
}

// ══════════════════════════════════════════════════════════════
// SCOPE C — DISPLAY PROFILE FOUNDATION
// ══════════════════════════════════════════════════════════════

/**
 * Where and how a KPI should appear, derived entirely from existing
 * KpiDefinition fields (visibility, category, sortOrder, isCore).
 * No new Firestore contract — this is a pure view projected from
 * data already stored on the registry document.
 */
export interface KpiDisplayProfile {
  key: string
  label: string
  shortLabel: string
  category: KpiDefinition['category']
  sortOrder: number
  isCore: boolean
  visibility: KpiVisibility
  /** Convenience flag: visible on the executive ranking surface. Today this
   *  mirrors isCore, since ranking columns are core-only until a future
   *  Controlled Cutover bundle extends ranking to non-core KPIs. */
  rankingVisible: boolean
}

function toDisplayProfile(kpi: KpiDefinition): KpiDisplayProfile {
  return {
    key: kpi.key,
    label: kpi.label,
    shortLabel: kpi.shortLabel,
    category: kpi.category,
    sortOrder: kpi.sortOrder,
    isCore: kpi.isCore,
    visibility: kpi.visibility,
    rankingVisible: kpi.isCore,
  }
}

/** Build display profiles for every active KPI in the registry, sorted by sortOrder. */
export function buildDisplayProfiles(
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): KpiDisplayProfile[] {
  return getActiveKpis(registry).map(toDisplayProfile)
}

/** Build display profiles filtered to a single platform surface. */
export function buildDisplayProfilesForSurface(
  registry: KpiRegistry,
  surface: keyof KpiVisibility,
): KpiDisplayProfile[] {
  return getKpisForSurface(registry, surface).map(toDisplayProfile)
}

// ══════════════════════════════════════════════════════════════
// SCOPE D — PARITY VALIDATION
// ══════════════════════════════════════════════════════════════

/**
 * The 5 KPIs named in the bundle's parity-validation requirement,
 * mapped to their actual registry keys. "Smart List" has no exact
 * label match in DEFAULT_KPI_REGISTRY; the closest production KPI
 * by key/shortLabel is `sl` (label "Service Level", shortLabel "SL").
 * Mapped here for parity-check purposes only — this does not rename
 * or relabel the registry entry.
 */
export const PARITY_VALIDATION_TARGETS: Record<string, string> = {
  'Smart List': 'sl',
  NDF: 'ndf',
  'Wellness Card': 'wellnessCard',
  OmniHealth: 'omnihealth',
  Sales: 'sales',
}

export interface KpiParityResult {
  label: string
  key: string
  match: boolean
  detail: ReturnType<typeof compareStaticVsDynamicKpi>
}

/**
 * Run the legacy-vs-dynamic parity comparison for the 5 named KPIs.
 * A KPI "matches" when actual, target, and achievement are identical
 * between the static (no-registry) and dynamic (registry-driven) read
 * paths — proving the registry-driven path produces the same numbers
 * as production today.
 */
export function validateNamedKpiParity(
  entry: Record<string, unknown>,
  targetDoc: Record<string, unknown>,
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): KpiParityResult[] {
  return Object.entries(PARITY_VALIDATION_TARGETS).map(([label, key]) => {
    const detail = compareStaticVsDynamicKpi(entry, targetDoc, key, registry)
    return {
      label,
      key,
      match: detail.actualMatches && detail.targetMatches && detail.achievementMatches,
      detail,
    }
  })
}

/**
 * Gate function for the future Controlled Cutover: a KPI is only safe
 * to expose via a dynamic reader once its parity result matches. This
 * function never activates anything by itself — it only reports a
 * boolean the (not-yet-built) Controlled Cutover bundle can branch on.
 */
export function isSafeToExposeDynamically(results: KpiParityResult[], key: string): boolean {
  const result = results.find((r) => r.key === key)
  return result?.match === true
}

/** True only when every named KPI's parity result matches. */
export function allNamedKpiParityMatched(results: KpiParityResult[]): boolean {
  return results.every((r) => r.match)
}
