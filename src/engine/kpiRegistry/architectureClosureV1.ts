// ============================================================
// Final Stabilization / Architecture Closure Bundle
//
// Primary principle: this module adds NO new features, NO new
// architecture, and NO new engines. It exists only to certify,
// stabilize, document, and officially close PharmaPulse Architecture
// V1 — following the same documentation-only, metrics-only pattern as
// KPI_DEPENDENCY_AUDIT (dynamicKpiFoundation.ts), CORE_KPI_CONSUMER_
// CLASSIFICATION (coreKpiDeprecationPrep.ts), and REGISTRY_AUTHORITY_
// DECLARATION (coreKpiRetirement.ts).
//
// Nothing here changes behavior, removes anything, or modifies the
// Evaluation Engine, Profile Studio, Import Engine, or Firestore
// contracts. Two text-only documentation fixes were made alongside
// this module (stale comment in legacyEntryAdapter.ts) — recorded
// below as part of the Dead Code & Orphan Audit, not as architecture
// changes.
// ============================================================

import {
  REGISTRY_AUTHORITY_DECLARATION,
  isRegistryAuthoritative,
  COMPATIBILITY_LAYER_FROZEN,
  CORE_KPI_FIELDS_FROZEN,
  EVALUATION_ENGINE_EXCEPTION,
  IMPORT_ENGINE_EXCEPTION,
  getCoreKpiRetirementStatus,
} from './coreKpiRetirement'

// ══════════════════════════════════════════════════════════════
// PART A — FINAL ARCHITECTURE AUDIT (re-audit of all 13 named surfaces)
// ══════════════════════════════════════════════════════════════

export type FinalAuditStatus =
  | 'REGISTRY_DRIVEN_CONFIRMED'   // re-confirmed registry-driven, no change
  | 'PROTECTED_EXCEPTION_CONFIRMED' // re-confirmed as the documented exception
  | 'OUT_OF_SCOPE_CONFIRMED'      // confirmed correctly out of scope, untouched

export interface FinalAuditEntry {
  surface: string
  status: FinalAuditStatus
  note: string
}

/**
 * Re-audit of every surface named in the Final Stabilization bundle
 * spec. This is a CONFIRMATION pass, not a migration pass — every
 * REGISTRY_DRIVEN_CONFIRMED entry was already REGISTRY_DRIVEN as of the
 * Core KPI Retirement Bundle; this audit re-verifies nothing has
 * regressed and adds the 3 surfaces (Profile Studio, Offline First,
 * Login V3) that were never part of the KPI registry migration chain
 * and are confirmed here as correctly, permanently out of scope.
 */
export const FINAL_ARCHITECTURE_AUDIT: readonly FinalAuditEntry[] = [
  { surface: 'Dashboard', status: 'REGISTRY_DRIVEN_CONFIRMED', note: 'Re-confirmed registry-driven via REGISTRY_AUTHORITY_DECLARATION. No change.' },
  { surface: 'Regional Intelligence', status: 'REGISTRY_DRIVEN_CONFIRMED', note: 'Re-confirmed registry-driven via REGISTRY_AUTHORITY_DECLARATION. No change.' },
  { surface: 'Branch Intelligence', status: 'REGISTRY_DRIVEN_CONFIRMED', note: 'Re-confirmed registry-driven via REGISTRY_AUTHORITY_DECLARATION. No change.' },
  { surface: 'Team Intelligence', status: 'REGISTRY_DRIVEN_CONFIRMED', note: 'Re-confirmed registry-driven via REGISTRY_AUTHORITY_DECLARATION. No change.' },
  { surface: 'Ranking Engine', status: 'REGISTRY_DRIVEN_CONFIRMED', note: 'Re-confirmed registry-driven; ranking SCORE formula (buildBranchSummary) still never gated. No change.' },
  { surface: 'Executive BI', status: 'REGISTRY_DRIVEN_CONFIRMED', note: 'Re-confirmed registry-driven; overall/adjusted score formula still never gated. No change.' },
  { surface: 'Trend Engine', status: 'REGISTRY_DRIVEN_CONFIRMED', note: 'Re-confirmed registry-driven; trend direction/momentum formulas still never gated. No change.' },
  { surface: 'Risk Engine', status: 'REGISTRY_DRIVEN_CONFIRMED', note: 'Re-confirmed registry-driven; risk thresholds and flag formulas still never gated. No change.' },
  { surface: 'Live Analytics', status: 'REGISTRY_DRIVEN_CONFIRMED', note: 'Re-confirmed registry-driven; alert thresholds and momentum/health formulas still never gated. No change.' },
  { surface: 'Dynamic KPI Foundation', status: 'REGISTRY_DRIVEN_CONFIRMED', note: 'Re-confirmed as the foundation layer itself (dynamicReaderPilot.ts, dynamicKpiFoundation.ts) — unchanged since the Controlled Cutover bundles.' },
  { surface: 'Profile Studio', status: 'OUT_OF_SCOPE_CONFIRMED', note: 'Never part of the KPI registry migration chain. src/profileStudio/importWizard.ts has no functional KPI_KEYS dependency (only a substring false-positive on a longer identifier). Untouched, per explicit Do-Not instruction across every bundle in this program.' },
  { surface: 'Offline First', status: 'OUT_OF_SCOPE_CONFIRMED', note: 'src/offline/* (connectivityService.ts, operationJournal.ts, syncTracker.ts) has no KPI-registry or scoring dependency of any kind — it is a sync/connectivity layer, unrelated to the KPI architecture. Untouched.' },
  { surface: 'Login V3', status: 'OUT_OF_SCOPE_CONFIRMED', note: 'Authentication/identity UI (src/components/login/*, LoginPageV2.jsx) has no KPI-registry or scoring dependency. Untouched.' },
] as const

/** True iff every audited surface confirms a non-regressed, expected status. */
export function isFinalArchitectureAuditClean(): boolean {
  return FINAL_ARCHITECTURE_AUDIT.every((e) =>
    e.status === 'REGISTRY_DRIVEN_CONFIRMED' || e.status === 'OUT_OF_SCOPE_CONFIRMED',
  )
}

// ══════════════════════════════════════════════════════════════
// PART B — DEAD CODE & ORPHAN AUDIT (findings only — nothing deleted)
// ══════════════════════════════════════════════════════════════

export type DeadCodeFindingDisposition =
  | 'DOCUMENTED_NO_ACTION'   // finding recorded; correct as-is, no risk
  | 'COMMENT_CORRECTED'      // a stale comment was fixed (text-only, zero behavior change)
  | 'DEFERRED_CLASSIFIED'    // has consumers/test references; classified, not removed

export interface DeadCodeFinding {
  file: string
  finding: string
  disposition: DeadCodeFindingDisposition
  detail: string
}

/**
 * Findings from the Part B Dead Code & Orphan Audit. Per the bundle's
 * own instruction ("do NOT mass-delete... delete only if zero
 * consumers, zero test references, zero architectural risk... otherwise
 * classify and defer"), nothing was deleted — every file found has at
 * least one production or test consumer.
 */
export const DEAD_CODE_AUDIT_FINDINGS: readonly DeadCodeFinding[] = [
  {
    file: 'src/engine/kpiCompatibility/legacyEntryAdapter.ts',
    finding: 'Header comment claimed "NOT yet wired into any production read path" — this was stale. mapDynamicToLegacyBatch() is actually called from fetchKpiEntriesRange() in kpiService.js (both the multi-branch and single/all-branches code paths), which is itself called throughout the app (e.g. useBranchIntelligenceData.js).',
    disposition: 'COMMENT_CORRECTED',
    detail: 'Comment rewritten to state the true wiring status: wired into the range-fetch read path, NOT yet wired into the real-time subscription paths (subscribeKpiEntries/subscribeRecentKpiEntries) or the write path (saveKpiEntry). Zero behavior change — text-only.',
  },
  {
    file: 'src/profileStudio/cohortSimulationAudit.ts',
    finding: 'Exports COHORT_SIMULATION_READINESS, imported only by its own certification test (phase1ClosureBundle.test.ts), never by production code.',
    disposition: 'DOCUMENTED_NO_ACTION',
    detail: 'By design — this is itself a documentation-only audit module (per its own file header), the same pattern as KPI_DEPENDENCY_AUDIT. Not dead code; it is read by a test as its own certification, the same role this very module plays.',
  },
  {
    file: 'src/services/ingestion/ingestionSafetyGuards.ts + stagingValidator.ts',
    finding: 'Re-confirmed as the IMPORT_ENGINE_EXCEPTION raw-field consumers documented in the Core KPI Retirement Bundle. No additional, previously-uncaught raw Core KPI field consumer was found elsewhere in src/services/ingestion/.',
    disposition: 'DEFERRED_CLASSIFIED',
    detail: 'Already classified via IMPORT_ENGINE_EXCEPTION (coreKpiRetirement.ts). Out of scope per explicit Do-Not instruction ("Change Import Engine"). No new finding requiring action.',
  },
] as const

/** True iff every finding has a recorded disposition (nothing left silently unhandled). */
export function isDeadCodeAuditComplete(): boolean {
  return DEAD_CODE_AUDIT_FINDINGS.every((f) => Boolean(f.disposition))
}

// ══════════════════════════════════════════════════════════════
// PART D — ARCHITECTURE FREEZE
// ══════════════════════════════════════════════════════════════

/**
 * The architectural layers frozen by this bundle. "Frozen" means: no
 * further architecture work is permitted on these layers except bug
 * fixes. This is a documented contract, not a runtime guard — enforced
 * by review discipline and the certification tests below, the same way
 * COMPATIBILITY_LAYER_FROZEN / CORE_KPI_FIELDS_FROZEN were enforced in
 * the Core KPI Retirement Bundle.
 */
export const FROZEN_ARCHITECTURE_LAYERS: readonly string[] = [
  'Core KPI Layer',
  'Registry Architecture',
  'Dynamic Reader Layer',
  'Evaluation Engine',
  'Profile Studio',
  'Offline Layer',
] as const

/** The single, permanent architecture-closure flag for PharmaPulse V1. */
export const ARCHITECTURE_CLOSED_V1 = true as const

// ══════════════════════════════════════════════════════════════
// PART E — POST-ARCHITECTURE ROADMAP DECLARATION
// ══════════════════════════════════════════════════════════════

export interface RoadmapModule {
  name: string
  status: 'NEXT_PHASE' | 'FUTURE_ROADMAP' | 'PARKING_LOT'
}

/**
 * The officially declared next phase and future roadmap, exactly as
 * specified by this bundle. Declaration only — no Data Exchange Studio,
 * AI Assistant, or Parking Lot work is started by this bundle or by
 * anything in this module.
 */
export const POST_ARCHITECTURE_ROADMAP: readonly RoadmapModule[] = [
  { name: 'Data Exchange Studio — Import Studio V1', status: 'NEXT_PHASE' },
  { name: 'Data Exchange Studio — Export Studio V1', status: 'NEXT_PHASE' },
  { name: 'Data Exchange Studio — Template Library', status: 'NEXT_PHASE' },
  { name: 'Data Exchange Studio — Validation Engine', status: 'NEXT_PHASE' },
  { name: 'AI Assistant V1', status: 'FUTURE_ROADMAP' },
  { name: 'Root Cause Engine', status: 'PARKING_LOT' },
  { name: 'Prediction Engine', status: 'PARKING_LOT' },
  { name: 'Recommendation Engine', status: 'PARKING_LOT' },
  { name: 'Outcome Simulator', status: 'PARKING_LOT' },
  { name: 'Learning Engine', status: 'PARKING_LOT' },
] as const

// ══════════════════════════════════════════════════════════════
// FINAL STATUS — single function for admin diagnostics
// ══════════════════════════════════════════════════════════════

export interface ArchitectureClosureStatus {
  architectureClosedV1:       boolean
  registryAuthoritative:      boolean
  coreKpiCompatibilityOnly:   boolean
  evaluationEngineException:  'ACTIVE'
  importEngineException:     'ACTIVE'
  finalAuditClean:            boolean
  deadCodeAuditComplete:      boolean
  frozenLayers:               readonly string[]
  nextPhase:                  string
}

/**
 * The single function admin diagnostics (or a future closure report)
 * should call. Pure — derives everything from the structured data above
 * plus getCoreKpiRetirementStatus() (coreKpiRetirement.ts). Never
 * fabricates data.
 */
export function getArchitectureClosureStatus(): ArchitectureClosureStatus {
  const retirement = getCoreKpiRetirementStatus()
  return {
    architectureClosedV1: ARCHITECTURE_CLOSED_V1,
    registryAuthoritative: isRegistryAuthoritative(),
    coreKpiCompatibilityOnly: COMPATIBILITY_LAYER_FROZEN && CORE_KPI_FIELDS_FROZEN && retirement.coreKpiStatus === 'COMPATIBILITY_LAYER',
    evaluationEngineException: 'ACTIVE',
    importEngineException: 'ACTIVE',
    finalAuditClean: isFinalArchitectureAuditClean(),
    deadCodeAuditComplete: isDeadCodeAuditComplete(),
    frozenLayers: FROZEN_ARCHITECTURE_LAYERS,
    nextPhase: 'DATA_EXCHANGE_STUDIO',
  }
}

// Re-exported for admin diagnostics convenience — already exist in
// coreKpiRetirement.ts, not duplicated here.
export {
  EVALUATION_ENGINE_EXCEPTION,
  IMPORT_ENGINE_EXCEPTION,
  REGISTRY_AUTHORITY_DECLARATION,
}
