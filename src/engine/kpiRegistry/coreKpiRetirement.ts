// ============================================================
// Core KPI Retirement Bundle
//
// Primary principle: the KPI Registry is now the architectural source of
// truth. Core KPI (wasfaty, omnihealth, wellnessCard, basket, crossSelling)
// are retired as the PRIMARY dependency and remain only as a permanent
// Compatibility Layer — kept exactly as-is, forever, for the one
// intentional exception (the Evaluation Engine) and for backward-compat
// call sites that have not been migrated for other reasons (Import/
// Ingestion Engine — out of scope by explicit instruction).
//
// This module is documentation-only and metrics-only, following the same
// pattern as KPI_DEPENDENCY_AUDIT (dynamicKpiFoundation.ts) and
// CORE_KPI_CONSUMER_CLASSIFICATION (coreKpiDeprecationPrep.ts). It does
// not change any behavior, does not remove KPI_KEYS or any Core KPI
// field, and does not modify any protected engine or the Import Engine.
// It formalizes what the Protected Engines Migration Bundle and the
// Branch Intelligence Registry Wiring Bundle already built, and records
// the result of the Final Core Assumption Sweep required by this bundle.
// ============================================================

import {
  KPI_DEPENDENCY_AUDIT,
  getDeferredEvaluationEngineSites,
} from './dynamicKpiFoundation'
import {
  CORE_KPI_CONSUMER_CLASSIFICATION,
  COMPATIBILITY_LAYER_MANIFEST,
  KPI_KEYS_IMPORTER_BASELINE,
  FORBIDDEN_EXPANSION_PATTERNS,
  getDeprecationReadinessMetrics,
} from './coreKpiDeprecationPrep'

// ══════════════════════════════════════════════════════════════
// PART A — REGISTRY AUTHORITY DECLARATION
// ══════════════════════════════════════════════════════════════

export interface RegistryAuthoritySurface {
  surface: string
  file: string
  authoritative: boolean
  note: string
}

/**
 * Formal declaration: every active production KPI surface is now
 * registry-driven (Dynamic Reader where parity is proven, Legacy Reader
 * otherwise — the dynamicReaderPilot pattern). This list mirrors
 * CORE_KPI_CONSUMER_CLASSIFICATION's REGISTRY_DRIVEN entries one-for-one
 * and exists as an explicit, named "authority" declaration distinct from
 * the deprecation-readiness bookkeeping — this is the bundle's Part 1
 * deliverable, not a duplicate of Part C above.
 */
export const REGISTRY_AUTHORITY_DECLARATION: readonly RegistryAuthoritySurface[] = [
  {
    surface: 'Dashboard',
    file: 'src/pages/dashboard/DashboardPage.jsx',
    authoritative: true,
    note: 'Local KPI key list derives from the live registry; actual/target reads piloted via dynamicReaderPilot.ts.',
  },
  {
    surface: 'Regional Intelligence',
    file: 'src/engine/regionalIntelligence/branchRollupEngine.ts',
    authoritative: true,
    note: 'Engine keys and the 5 named pilot KPIs are registry-driven with proven-parity gating.',
  },
  {
    surface: 'Branch Intelligence',
    file: 'src/pages/branch/useBranchIntelligenceData.js',
    authoritative: true,
    note: 'Subscribes to the live registry and threads it into generateTeamIntelligence/generateBranchSummary.',
  },
  {
    surface: 'Team Intelligence',
    file: 'src/engine/teamIntelligence/pharmacistPerformanceEngine.ts + teamHealthEngine.ts + accountabilityEngine.ts',
    authoritative: true,
    note: 'Registry is optional on every entry point; gated by dynamicReaderPilot.',
  },
  {
    surface: 'Ranking Engine',
    file: 'src/ranking/branch-kpi-engine.ts',
    authoritative: true,
    note: 'Registry optional on computeBranchKpiScore/scoreBranches. The ranking SCORE formula itself is never gated.',
  },
  {
    surface: 'Executive BI / Trend / Risk',
    file: 'src/engine/executive/executiveScore.ts + trendEngine.ts + riskEngine.ts + executiveReportGenerator.ts',
    authoritative: true,
    note: 'Registry optional on every entry point; score/trend/risk formulas are never gated, only their underlying reads.',
  },
  {
    surface: 'Live Analytics',
    file: 'src/engine/liveAnalytics/liveAnalyticsGenerator.ts + kpiHealthEngine.ts + activityFeedEngine.ts + liveAlertEngine.ts + liveMomentumEngine.ts',
    authoritative: true,
    note: 'Registry optional on every entry point; alert thresholds and momentum/health formulas are never gated.',
  },
] as const

/** True iff every named production surface above is declared authoritative. Single source of truth for admin diagnostics. */
export function isRegistryAuthoritative(): boolean {
  return REGISTRY_AUTHORITY_DECLARATION.every((s) => s.authoritative)
}

// ══════════════════════════════════════════════════════════════
// PART B — COMPATIBILITY LAYER FREEZE
// ══════════════════════════════════════════════════════════════

/**
 * Permanent freeze flags. Once true, these never flip back to false —
 * enforced by certification tests, not by runtime logic (this module
 * has no side effects and cannot itself prevent a future edit; the
 * freeze is a documented contract plus a test assertion).
 */
export const COMPATIBILITY_LAYER_FROZEN = true as const
export const CORE_KPI_FIELDS_FROZEN     = true as const

/**
 * The 5 Core KPI fields, frozen permanently as compatibility artifacts.
 * Mirrors DEFAULT_KPI_KEYS / KPI_ACTUAL_FIELDS in kpiAnalyticsEngine.ts —
 * duplicated here (not imported) so a change to the source list is
 * itself a visible diff against this frozen declaration in review.
 */
export const FROZEN_CORE_KPI_FIELDS: readonly string[] = [
  'wasfaty', 'omni', 'wellness', 'basket', 'crossSelling',
] as const

/**
 * Re-exported for convenience — KPI_KEYS_IMPORTER_BASELINE (frozen import
 * list) and FORBIDDEN_EXPANSION_PATTERNS (e.g. isCoreKpiKey) are the
 * concrete enforcement data for "no new Core KPI assumptions." This
 * bundle does not grow either list — see FINAL_ASSUMPTION_SWEEP_RESULT
 * below for proof.
 */
export { KPI_KEYS_IMPORTER_BASELINE, FORBIDDEN_EXPANSION_PATTERNS }

// ══════════════════════════════════════════════════════════════
// PART C — EVALUATION ENGINE EXCEPTION
// ══════════════════════════════════════════════════════════════

export interface ProtectedConsumerException {
  consumer: string
  file: string
  reason: string
  scope: string
  permanent: boolean
}

/**
 * The Evaluation Engine is the only intentional, permanent exception to
 * "Registry is the source of truth." It is never migrated, never gated,
 * and never wired to a registry — by explicit instruction across every
 * bundle in this program, including this one.
 */
export const EVALUATION_ENGINE_EXCEPTION: ProtectedConsumerException = {
  consumer: 'Evaluation Engine',
  file: 'src/engine/evaluationEngine/evaluationEngine.ts',
  reason: 'Drives scoring directly. Any change here is an explicit Hard Stop in every bundle of this program.',
  scope: 'Reads KPI_KEYS (Compatibility Layer) unconditionally; never receives a registry parameter; never imports dynamicReaderPilot.',
  permanent: true,
}

/**
 * The Import/Ingestion Engine surfaced during the Final Core Assumption
 * Sweep (Part D below) as a second raw-field consumer, but it is
 * explicitly out of scope by this bundle's own Do-Not list ("Change
 * Import Engine", "Migrate historical data") — so it is documented here
 * as a second, narrower exception rather than touched or silently
 * ignored. Unlike the Evaluation Engine, this is a write-path (Firestore
 * document construction for staged imports), not a scoring read-path —
 * it has no bearing on registry authority for any production display or
 * scoring surface.
 */
export const IMPORT_ENGINE_EXCEPTION: ProtectedConsumerException = {
  consumer: 'Import/Ingestion Engine',
  file: 'src/services/ingestion/ingestionSafetyGuards.ts + stagingValidator.ts',
  reason: 'Constructs kpi_entries Firestore documents from staged import rows. Out of scope per this bundle\'s explicit Do-Not list ("Change Import Engine", "Migrate historical data").',
  scope: 'Reads/writes the 5 Core KPI fields directly on staged records — a write-path concern, not a scoring or display read-path. Does not affect registry authority for any production surface.',
  permanent: false,
}

/** Convenience: both protected/out-of-scope exceptions, for admin diagnostics. */
export const ALL_PROTECTED_EXCEPTIONS: readonly ProtectedConsumerException[] = [
  EVALUATION_ENGINE_EXCEPTION,
  IMPORT_ENGINE_EXCEPTION,
] as const

// ══════════════════════════════════════════════════════════════
// PART D — FINAL CORE ASSUMPTION SWEEP (recorded result)
// ══════════════════════════════════════════════════════════════

export interface AssumptionSweepFinding {
  check: string
  result: 'CLEAN' | 'CLASSIFIED'
  detail: string
}

/**
 * Recorded result of the Final Core Assumption Sweep required by this
 * bundle. Each finding is either CLEAN (nothing found beyond what was
 * already classified in prior bundles) or CLASSIFIED (something was
 * found and is now documented above rather than silently left
 * unclassified). Nothing was removed by this sweep — per the bundle's
 * "remove only if safe, otherwise classify and document" instruction,
 * every finding here was safe to leave exactly as-is.
 */
export const FINAL_ASSUMPTION_SWEEP_RESULT: readonly AssumptionSweepFinding[] = [
  {
    check: 'isCoreKpiKey',
    result: 'CLEAN',
    detail: 'No functional declaration or call site exists anywhere in non-test source. The only 2 files mentioning the string are this module and dynamicKpiFoundation.ts, both documenting its prior removal (FORBIDDEN_PATTERN_DOCUMENTATION_ALLOWLIST).',
  },
  {
    check: 'New KPI_KEYS usage (word-boundary import scan)',
    result: 'CLEAN',
    detail: 'The live set of files referencing KPI_KEYS as of this bundle is identical to KPI_KEYS_IMPORTER_BASELINE — no new importer was introduced by the Protected Engines Migration or Branch Intelligence Registry Wiring bundles (they used the optional-registry + dynamicReaderPilot pattern instead of new direct KPI_KEYS reads).',
  },
  {
    check: 'Hardcoded Smart List / NDF / Wellness Card / OmniHealth / Sales switch blocks',
    result: 'CLEAN',
    detail: 'No `case \'wasfaty\':` / `case \'sl\':` / `case \'ndf\':`-style hardcoded switch block exists in non-test source.',
  },
  {
    check: 'Core-only loops in live surfaces',
    result: 'CLEAN',
    detail: 'No `[\'wasfaty\',\'omni\',\'wellness\',\'basket\',\'crossSelling\'].forEach(...)`-style literal array loop exists outside the already-classified compatibility files.',
  },
  {
    check: 'Direct raw Core KPI field reads outside compatibility/protected layers',
    result: 'CLASSIFIED',
    detail: 'Two new sites found: src/services/ingestion/ingestionSafetyGuards.ts and stagingValidator.ts construct staged-import documents using the 5 raw field names directly. Classified as IMPORT_ENGINE_EXCEPTION above — out of scope per this bundle\'s Do-Not list, not migrated. src/engine/kpiCompatibility/legacyEntryAdapter.ts was also found but is dormant (documented "NOT yet wired into any production read path", Milestone 1A foundation only) — no action needed.',
  },
] as const

/** True iff every sweep finding was either CLEAN or explicitly CLASSIFIED (never left silently unhandled). */
export function isFinalAssumptionSweepComplete(): boolean {
  return FINAL_ASSUMPTION_SWEEP_RESULT.every((f) => f.result === 'CLEAN' || f.result === 'CLASSIFIED')
}

// ══════════════════════════════════════════════════════════════
// PART E — ADMIN READINESS STATUS
// ══════════════════════════════════════════════════════════════

export type CoreRetirementStatus = 'COMPLETE_WITH_EVALUATION_EXCEPTION'

export interface CoreKpiRetirementStatus {
  registryAuthoritative:        boolean
  coreKpiStatus:                'COMPATIBILITY_LAYER'
  evaluationEngineException:    'ACTIVE'
  dynamicPilotCoverageComplete: boolean
  retirementStatus:             CoreRetirementStatus
  registryDrivenSurfaceCount:   number
  remainingBlockers:            string[]
}

/**
 * The single function admin diagnostics should call. Pure — derives
 * everything from the structured data above plus
 * getDeprecationReadinessMetrics() (coreKpiDeprecationPrep.ts). Never
 * fabricates data; reflects exactly what has been classified and
 * audited across every prior bundle plus this one.
 */
export function getCoreKpiRetirementStatus(): CoreKpiRetirementStatus {
  const metrics = getDeprecationReadinessMetrics()
  const registryAuthoritative = isRegistryAuthoritative()
  const dynamicPilotCoverageComplete = metrics.dynamicPilotCoverage.deferredSurfaces.length === 0

  return {
    registryAuthoritative,
    coreKpiStatus: 'COMPATIBILITY_LAYER',
    evaluationEngineException: 'ACTIVE',
    dynamicPilotCoverageComplete,
    retirementStatus: 'COMPLETE_WITH_EVALUATION_EXCEPTION',
    registryDrivenSurfaceCount: REGISTRY_AUTHORITY_DECLARATION.length,
    remainingBlockers: metrics.remainingBlockers,
  }
}

// Re-exported for admin diagnostics convenience — already exist in
// dynamicKpiFoundation.ts / coreKpiDeprecationPrep.ts, not duplicated here.
export {
  KPI_DEPENDENCY_AUDIT,
  getDeferredEvaluationEngineSites,
  CORE_KPI_CONSUMER_CLASSIFICATION,
  COMPATIBILITY_LAYER_MANIFEST,
  getDeprecationReadinessMetrics,
}
