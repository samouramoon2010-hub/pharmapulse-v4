// ============================================================
// Universal AI Intake — Phase 2.1 Shared Commit-Operation Contract
//
// A framework-neutral, SDK-agnostic description of "what Firestore
// write should happen for this row" — produced once by
// buildCommitPlan.ts (reusing Phase 1's adapter validation, no
// duplicated business rules), then consumed by either SDK's executor.
// Pure types + a closed allowlist — no firebase-admin, no
// firebase/firestore import anywhere in this file.
// ============================================================

import type { ImportDomain } from '../../dataExchange/importJobTypes'

export type CommitOperationType = 'create' | 'update' | 'upsert' | 'skip'

// The ONLY Firestore collections a commit operation may ever target.
// Resolved server-side from `entityType` — never accepted as a string
// from connector input. Adding a domain requires a code change here,
// not a connector request field.
export const COLLECTION_ALLOWLIST: Record<ImportDomain, string | null> = {
  REGION: 'regions',
  GROUP: 'districts',
  BRANCH: 'pharmacies',
  PHARMACIST: 'users',
  ASSIGNMENT: 'users', // no separate collection — updates the same user doc's pharmacyId
  KPI_REGISTRY: 'kpi_registry',
  BRANCH_TARGET: 'targets',
  PHARMACIST_TARGET: 'personal_targets',
  BRANCH_ACTUALS: 'kpi_entries',
  PHARMACIST_ACTUALS: 'kpi_entries',
  // Legacy DX-1 domain, superseded by BRANCH_ACTUALS/PHARMACIST_ACTUALS
  // (see importJobTypes.ts) — the connector/commit-plan path never
  // builds an operation for it, same treatment as HISTORICAL.
  KPI_ACTUALS: null,
  HISTORICAL: null,
}

export function resolveCollectionKey(entityType: ImportDomain): string {
  const key = COLLECTION_ALLOWLIST[entityType]
  if (!key) throw new Error(`No commit collection is allowlisted for entity type "${entityType}"`)
  return key
}

export interface CommitOperationAuditMeta {
  entityType:   ImportDomain
  sourceRowId:  string
  actorUid:     string
  actorRole:    string
}

/**
 * One canonical, validated write instruction. `documentId` is
 * undefined only for a brand-new auto-ID document (REGION/GROUP/
 * BRANCH creates, which use Firestore auto-IDs client-side too — see
 * AI_INTAKE_PHASE_2_1_COMMIT_ARCHITECTURE.md's audit). Every other
 * domain has a deterministic ID computed here, identically to its
 * Phase 1 adapter.
 */
export interface CommitOperation {
  type:            CommitOperationType
  entityType:      ImportDomain
  collectionKey:   string          // resolved via resolveCollectionKey(), never client-supplied
  documentId?:     string          // deterministic ID, or undefined = auto-ID on create
  /** For domains where a write only ever touches ONE nested field of a
   *  larger shared document (KPI Targets/Actuals) — the executor reads
   *  the full existing sub-map, mutates this one key, and writes the
   *  full map back, exactly matching the Phase 1 client-side adapters'
   *  own documented "read full map, write full map" pattern. Absent
   *  for domains that write flat top-level fields only. */
  nestedMapField?: { path: string; key: string; value: unknown }
  /** For the BRANCH-to-district membership link (Phase 2.2 side-effect
   *  parity — see AI_INTAKE_PHASE_2_2's side-effect review): an atomic
   *  Firestore arrayUnion on a top-level array field. Unlike
   *  nestedMapField this needs no read-modify-write — Firestore's
   *  arrayUnion is server-side atomic and naturally idempotent (adding
   *  an id already present is a no-op), so it is safe even under
   *  concurrent writes. */
  arrayUnionField?: { path: string; value: unknown }
  data:            Record<string, unknown>
  merge:           boolean
  identityKey:     string          // same natural key the Phase 1 adapter already computed
  sourceRowId:     string
  idempotencyKey:  string          // buildCommitOperationKey(jobId, identityKey) — reused from importJobTypes.ts
  audit:           CommitOperationAuditMeta
}

export interface CommitPlanFailure {
  sourceRowId: string
  reason:      string
}

export interface CommitPlan {
  jobId:              string
  entityType:          ImportDomain
  operations:          CommitOperation[]
  skips:               CommitPlanFailure[]
  conflicts:           CommitPlanFailure[]
  validationFailures:  CommitPlanFailure[]
  expectedCreateCount: number
  expectedUpdateCount: number
  /** Reuses computeRowsSignature() over the same rows the approval
   *  token was issued against — guarantees "commit-plan signature
   *  matches approved preview" without a second signature scheme. */
  planSignature:       string
}
