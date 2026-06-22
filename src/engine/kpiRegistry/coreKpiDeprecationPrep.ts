// ============================================================
// Final Core KPI Deprecation Preparation Bundle
//
// Primary principle: Core KPI are no longer the future architecture.
// They remain only as compatibility artifacts for protected engines.
//
// This module is documentation-only and metrics-only, following the
// same pattern as COHORT_SIMULATION_READINESS and KPI_DEPENDENCY_AUDIT
// in dynamicKpiFoundation.ts. It does not change any behavior, does not
// remove KPI_KEYS or any Core KPI field, and does not modify any
// protected engine. It formalizes what already exists and measures
// deprecation readiness — nothing more.
// ============================================================

import {
  KPI_DEPENDENCY_AUDIT,
  getDeferredEvaluationEngineSites,
  getCompletedDependencySites,
  getBlockedByProtectedDependencySites,
  PARITY_VALIDATION_TARGETS,
} from './dynamicKpiFoundation'

// ══════════════════════════════════════════════════════════════
// PART A — COMPATIBILITY LAYER FORMALIZATION
// ══════════════════════════════════════════════════════════════

export type CompatibilityArtifactKind =
  | 'KEY_LIST'        // a static engine-key list (e.g. KPI_KEYS)
  | 'CORE_FIELD'      // a Core KPI registry entry / document field
  | 'LEGACY_READER'   // a function that reads values without registry awareness

export interface CompatibilityArtifact {
  name: string
  file: string
  kind: CompatibilityArtifactKind
  retainedReason: string
}

/**
 * The formal Compatibility Layer manifest (Part A).
 *
 * Every artifact here is explicitly promoted to "Compatibility Layer"
 * status: kept exactly as-is, forever, for as long as any protected
 * engine depends on it. None of these are deprecated for removal by
 * this bundle — only their architectural ROLE is being formalized
 * (no longer the primary path; retained for backward compatibility).
 */
export const COMPATIBILITY_LAYER_MANIFEST: readonly CompatibilityArtifact[] = [
  {
    name: 'KPI_KEYS',
    file: 'src/engine/kpiAnalyticsEngine.ts',
    kind: 'KEY_LIST',
    retainedReason: 'Stable backward-compat alias for DEFAULT_KPI_KEYS. Every Evaluation Engine, Ranking, Executive BI, Team Intelligence, and Live Analytics call site imports this directly — it must never be deleted while any of those protected engines exist in their current form.',
  },
  {
    name: 'DEFAULT_KPI_KEYS',
    file: 'src/engine/kpiAnalyticsEngine.ts',
    kind: 'KEY_LIST',
    retainedReason: 'The literal 5-key list (wasfaty, omni, wellness, basket, crossSelling) that KPI_KEYS aliases. Source of truth for the legacy-only key set used whenever no registry is supplied.',
  },
  {
    name: 'Core KPI registry entries (wasfaty, omnihealth, wellnessCard, basket, crossSelling)',
    file: 'src/engine/kpiRegistry/defaultKpiRegistry.ts',
    kind: 'CORE_FIELD',
    retainedReason: 'isCore:true entries whose weights sum to 1.0 for the composite score. Their actualField/targetField values intentionally match the legacy engine key/field names so the Compatibility Layer and the Registry-Driven path always agree for these 5 KPIs.',
  },
  {
    name: 'sumKpi() / getTargetForKpi() called without a registry argument',
    file: 'src/engine/kpiAnalyticsEngine.ts',
    kind: 'LEGACY_READER',
    retainedReason: 'Every protected engine call site invokes these without a registry, which is the documented fallback path. Behavior is identical to before any Dynamic KPI work began.',
  },
  {
    name: 'dailyKpi() direct field access (Number(e[kpiKey]))',
    file: 'src/engine/teamIntelligence/pharmacistPerformanceEngine.ts',
    kind: 'LEGACY_READER',
    retainedReason: 'Team Intelligence Engine is a protected area. This is the one remaining raw-field-access pattern outside kpiAnalyticsEngine.ts itself — retained because migrating it would require modifying a protected engine.',
  },
] as const

// ══════════════════════════════════════════════════════════════
// PART B — EXPANSION FREEZE (data only; enforcement lives in tests)
// ══════════════════════════════════════════════════════════════

/**
 * Frozen baseline of every non-test file that references KPI_KEYS as of
 * the Final Core KPI Deprecation Preparation Bundle. Certification tests
 * assert the live grep result is a SUBSET of this list — the list may
 * shrink as files migrate to getProductionEngineKeys(registry), but must
 * never grow. This is the enforcement mechanism for "no new Core KPI
 * assumptions."
 */
export const KPI_KEYS_IMPORTER_BASELINE: readonly string[] = [
  'src/components/executive/PortfolioKpiHeatmap.jsx',
  'src/engine/branchIntelligence/branchIntelligenceSelectors.ts',
  'src/engine/branchIntelligence/branchIntelligenceViewModelBuilder.ts',
  'src/engine/evaluationEngine/evaluationEngine.ts',
  'src/engine/evaluationEngine/evaluationEngineTypes.ts',
  'src/engine/executive/dynamicExecutiveAdapter.ts',
  'src/engine/executive/dynamicExecutiveDataPath.ts',
  'src/engine/executive/executiveReportGenerator.ts',
  'src/engine/executive/executiveScore.ts',
  'src/engine/executive/riskEngine.ts',
  'src/engine/executive/trendEngine.ts',
  'src/engine/historyEngine.ts',
  'src/engine/index.ts',
  'src/engine/kpiAnalyticsEngine.ts',
  'src/engine/kpiRegistry/dynamicKpiFoundation.ts',
  'src/engine/kpiRegistry/coreKpiDeprecationPrep.ts',
  'src/engine/kpiRegistry/coreKpiRetirement.ts',
  'src/engine/kpiRegistry/architectureClosureV1.ts',
  'src/engine/kpiRegistry/kpiMetaResolver.ts',
  'src/engine/kpiRegistry/kpiRegistryAdapter.ts',
  'src/engine/kpiRegistry/registrySyncGuard.ts',
  'src/engine/liveAnalytics/activityFeedEngine.ts',
  'src/engine/liveAnalytics/kpiHealthEngine.ts',
  'src/engine/liveAnalytics/liveAlertEngine.ts',
  'src/engine/liveAnalytics/liveAnalyticsGenerator.ts',
  'src/engine/liveAnalytics/liveMomentumEngine.ts',
  'src/engine/regionalIntelligence/branchRollupEngine.ts',
  'src/engine/regionalIntelligence/regionalRiskEngine.ts',
  'src/engine/regionalIntelligence/regionalRollupEngine.ts',
  'src/engine/teamIntelligence/accountabilityEngine.ts',
  'src/engine/teamIntelligence/coachingEngine.ts',
  'src/engine/teamIntelligence/pharmacistPerformanceEngine.ts',
  'src/engine/teamIntelligence/teamHealthEngine.ts',
  'src/pages/dashboard/DashboardPage.jsx',
  'src/ranking/branch-kpi-engine.ts',
  'src/services/evaluationActualsService.ts',
] as const

/** Forbidden patterns — must never reappear as functional code in non-test source. */
export const FORBIDDEN_EXPANSION_PATTERNS: readonly string[] = [
  'isCoreKpiKey',
]

/**
 * Files explicitly allowed to mention a forbidden pattern in prose/strings
 * because they DOCUMENT its removal rather than reintroducing it as a
 * functional guard. Mirrors a known false-positive class already handled
 * elsewhere in this codebase (a doc comment describing what code does NOT
 * do can otherwise collide with a literal-substring scan).
 */
export const FORBIDDEN_PATTERN_DOCUMENTATION_ALLOWLIST: readonly string[] = [
  'src/engine/kpiRegistry/dynamicKpiFoundation.ts',
  'src/engine/kpiRegistry/coreKpiDeprecationPrep.ts',
  'src/engine/kpiRegistry/coreKpiRetirement.ts',
]

// ══════════════════════════════════════════════════════════════
// PART C — DEPENDENCY CLASSIFICATION
// ══════════════════════════════════════════════════════════════

export type CoreKpiConsumerClassification =
  | 'COMPATIBILITY_LAYER'
  | 'REGISTRY_DRIVEN'
  | 'BLOCKED_BY_PROTECTED_ENGINE'

export interface ProtectedEngineClassification {
  engine: string
  file: string
  classification: CoreKpiConsumerClassification
  currentDependency: string
  note: string
}

/**
 * Classification of every named protected engine plus the surfaces this
 * program has already migrated. As of the Protected Engines Migration
 * Bundle, Ranking Engine, Team Intelligence, Executive BI, Trend Engine,
 * Risk Engine, and Live Analytics were all promoted to REGISTRY_DRIVEN
 * (Phases A-D). Only the Evaluation Engine itself remains an indefinite
 * Hard Stop.
 */
export const CORE_KPI_CONSUMER_CLASSIFICATION: readonly ProtectedEngineClassification[] = [
  {
    engine: 'Ranking Engine',
    file: 'src/ranking/branch-kpi-engine.ts',
    classification: 'REGISTRY_DRIVEN',
    currentDependency: 'KPI_KEYS (ranking score, unchanged) + pilot policy (kpiBreakdown display only)',
    note: 'Protected Engines Migration Phase B: registry is now optional on computeBranchKpiScore/scoreBranches. The ranking score itself (buildBranchSummary) is never gated — zero score drift by construction. No call site passes a registry yet.',
  },
  {
    engine: 'Executive BI',
    file: 'src/engine/executive/executiveScore.ts',
    classification: 'REGISTRY_DRIVEN',
    currentDependency: 'KPI_KEYS (score formula, unchanged) + pilot policy (kpiBreakdown actual/target reads)',
    note: 'Protected Engines Migration Phase C: registry is now optional on computeExecutiveScore. The overall/adjusted score formulas are never gated — zero score drift by construction. No call site passes a registry yet.',
  },
  {
    engine: 'Trend Engine',
    file: 'src/engine/executive/trendEngine.ts',
    classification: 'REGISTRY_DRIVEN',
    currentDependency: 'pilot policy (Dynamic Reader where parity proven, Legacy Reader otherwise)',
    note: 'Protected Engines Migration Phase C: registry is now optional on computeBranchTrend. Trend direction/momentum formulas are unchanged — only the underlying daily values they consume are gated. No call site passes a registry yet.',
  },
  {
    engine: 'Risk Engine',
    file: 'src/engine/executive/riskEngine.ts',
    classification: 'REGISTRY_DRIVEN',
    currentDependency: 'pilot policy (Dynamic Reader where parity proven, Legacy Reader otherwise)',
    note: 'Protected Engines Migration Phase C: registry is now optional on computeBranchRiskProfile. Risk thresholds and flag formulas are unchanged — only the underlying actual/target reads are gated. No call site passes a registry yet.',
  },
  {
    engine: 'Team Intelligence',
    file: 'src/engine/teamIntelligence/pharmacistPerformanceEngine.ts + teamHealthEngine.ts + accountabilityEngine.ts',
    classification: 'REGISTRY_DRIVEN',
    currentDependency: 'pilot policy (Dynamic Reader where parity proven, Legacy Reader otherwise)',
    note: 'Protected Engines Migration Phase A: registry is now optional on computePharmacistPerformance, computeTeamHealth, and computeAccountabilityInsights. This also unblocks the Branch Intelligence pilot deferral noted in the Accelerated Bundle (its values now CAN flow through a registry once a caller passes one). No call site passes a registry yet, so behavior is unchanged.',
  },
  {
    engine: 'Live Analytics',
    file: 'src/engine/liveAnalytics/liveAnalyticsGenerator.ts + kpiHealthEngine.ts + activityFeedEngine.ts + liveAlertEngine.ts + liveMomentumEngine.ts',
    classification: 'REGISTRY_DRIVEN',
    currentDependency: 'pilot policy (Dynamic Reader where parity proven, Legacy Reader otherwise)',
    note: 'Protected Engines Migration Phase D: registry is now optional on generateLiveAnalytics and all 4 sub-engines. Alert thresholds and momentum/health formulas are unchanged — only the underlying actual/target reads are gated. No call site passes a registry yet.',
  },
  {
    engine: 'Dashboard (display)',
    file: 'src/pages/dashboard/DashboardPage.jsx',
    classification: 'REGISTRY_DRIVEN',
    currentDependency: 'getKpisForSurface(liveRegistry) + pilot policy (Dynamic Reader where parity proven)',
    note: 'Migrated: local KPI_KEYS list already derives from the live registry; actual/target reads piloted via dynamicReaderPilot.ts (Phase 2).',
  },
  {
    engine: 'Regional Intelligence (display + rollups)',
    file: 'src/engine/regionalIntelligence/branchRollupEngine.ts',
    classification: 'REGISTRY_DRIVEN',
    currentDependency: 'getProductionEngineKeys(registry) + pilot policy',
    note: 'Migrated: engine keys and the 5 named pilot KPIs are registry-driven with proven-parity gating (Accelerated Bundle Part A).',
  },
  {
    engine: 'Branch Intelligence (display)',
    file: 'src/pages/branch/useBranchIntelligenceData.js',
    classification: 'REGISTRY_DRIVEN',
    currentDependency: 'live registry (subscribeKpiRegistry) threaded into generateTeamIntelligence/generateBranchSummary + pilot policy',
    note: 'Branch Intelligence Registry Wiring Bundle: the last unwired call site is now wired — Branch Intelligence subscribes to the live registry and passes it into both engine orchestrators, completing the chain alongside every other surface above.',
  },
  {
    engine: 'KPI_KEYS itself',
    file: 'src/engine/kpiAnalyticsEngine.ts',
    classification: 'COMPATIBILITY_LAYER',
    currentDependency: 'DEFAULT_KPI_KEYS',
    note: 'The compatibility artifact every protected engine above depends on. See COMPATIBILITY_LAYER_MANIFEST.',
  },
] as const

// ══════════════════════════════════════════════════════════════
// PART D — DEPRECATION READINESS METRICS
// ══════════════════════════════════════════════════════════════

export interface DeprecationReadinessMetrics {
  registryDrivenSurfacesCount:     number
  compatibilityOnlySurfacesCount:  number
  protectedEngineDependenciesCount: number
  dynamicPilotCoverage: {
    pilotedSurfaces:  string[]
    deferredSurfaces: string[]
    pilotedKpiCount:  number
  }
  remainingBlockers: string[]
}

/**
 * Compute the current deprecation-readiness snapshot. Pure — derives
 * everything from the classification/audit data above plus
 * PARITY_VALIDATION_TARGETS. Never fabricates data; reflects exactly
 * what's already been classified and audited in this and prior bundles.
 */
export function getDeprecationReadinessMetrics(): DeprecationReadinessMetrics {
  const registryDriven = CORE_KPI_CONSUMER_CLASSIFICATION.filter(
    (c) => c.classification === 'REGISTRY_DRIVEN',
  )
  const compatibilityOnly = CORE_KPI_CONSUMER_CLASSIFICATION.filter(
    (c) => c.classification === 'COMPATIBILITY_LAYER',
  )
  const protectedEngines = CORE_KPI_CONSUMER_CLASSIFICATION.filter(
    (c) => c.classification === 'BLOCKED_BY_PROTECTED_ENGINE',
  )

  return {
    registryDrivenSurfacesCount:      registryDriven.length,
    compatibilityOnlySurfacesCount:   compatibilityOnly.length,
    protectedEngineDependenciesCount: protectedEngines.length,
    dynamicPilotCoverage: {
      pilotedSurfaces:  ['dashboard', 'regionalIntelligence', 'branchIntelligence'],
      deferredSurfaces: [],
      pilotedKpiCount:  Object.keys(PARITY_VALIDATION_TARGETS).length,
    },
    remainingBlockers: protectedEngines.map((p) => p.engine),
  }
}

// Re-exported for admin diagnostics convenience — these already exist in
// dynamicKpiFoundation.ts and are not duplicated here.
export {
  KPI_DEPENDENCY_AUDIT,
  getDeferredEvaluationEngineSites,
  getCompletedDependencySites,
  getBlockedByProtectedDependencySites,
}
