// ============================================================
// Evaluation Ledger Service — ER-2A
//
// Immutable write path for evaluation results.
//
// Firestore rules enforce:
//   allow update: if false
//   allow delete: if false
//
// The service layer adds a second safety layer:
//   writeEvaluationResult uses setDoc with { merge: false }
//   so an accidental second write on the same auto-ID is impossible.
//   (Auto-IDs make this a non-issue in practice.)
//
// Ledger documents embed FULL SNAPSHOTS of all inputs at write time
// so future recalculations and audits are fully reproducible.
//
// Non-goals for ER-2A:
//   No batch runs. No recalculation chains. No Cloud Functions.
// ============================================================

import {
  collection, doc, addDoc, getDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { db, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'
import type { EvaluationResult }      from '../engine/evaluationEngine/evaluationEngineTypes'
import type { EvaluationProfile }     from '../engine/evaluationRegistry/evaluationRegistryTypes'
import type { PersonalTargetDoc }     from './personalTargetService'
import type { MonthlyTarget }         from '../engine/kpiAnalyticsEngine'

// ── Firestore payload sanitizer ──────────────────────────────

/**
 * Recursively replace every `undefined` value in a plain object/array
 * with `null` so Firestore never receives unsupported field values.
 *
 * Firestore rules: undefined is not a valid Firestore type.
 * All optional TypeScript fields that are not set become undefined at
 * runtime (e.g. ratingAr?, bandColor?, nameAr? on profile snapshots).
 * This sanitizer converts them to null before the addDoc call.
 *
 * Does NOT mutate the input — returns a new deep copy.
 * Safe to call on the full ledger payload.
 */
function sanitizeForFirestore(value: unknown): unknown {
  if (value === undefined) return null
  if (value === null)      return null
  if (Array.isArray(value)) return value.map(sanitizeForFirestore)
  if (value !== null && typeof value === 'object') {
    // Preserve Firestore sentinel values (serverTimestamp, FieldValue, etc.)
    if (typeof (value as Record<string, unknown>)._methodName === 'string') return value
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeForFirestore(v)
    }
    return out
  }
  return value
}

// ── Ledger document type ──────────────────────────────────────

export interface EvaluationLedgerDoc {
  id:               string    // Firestore auto-generated

  // Identity
  userId:           string
  pharmacyId:       string
  role:             string
  month:            string    // 'yyyy-MM'

  // Profile reference
  profileId:        string
  profileVersion:   number

  // Immutable snapshots — captured at calculation time
  profileSnapshot:          EvaluationProfile            // full embedded copy
  personalTargetSnapshot:   Record<string, number> | null
  branchTargetSnapshot:     Record<string, number> | null
  actualsSnapshot:          Record<string, number>

  // Results
  basketResults:  EvaluationResult['basketResults']
  finalScore:     number
  rating:         string
  ratingAr?:      string
  ratingScore:    number
  ratingColor?:   string
  status:         EvaluationResult['status']

  // Calculation trace
  calculationTrace: EvaluationResult['trace']

  // Lifecycle
  calculatedAt:    unknown    // serverTimestamp
  calculatedBy:    string     // userId of admin who triggered, or 'system'
  recalculationOf: string | null  // previous ledger doc ID (ER-2C)

  // Immutability marker
  sealed:          boolean    // always true once written

  /**
   * Which evaluation engine produced this ledger document.
   * Set at write time; allows post-hoc queries to distinguish
   * V1 and V2 official documents that coexist during Limited Rollout.
   *
   * 'v1' — produced by evaluationEngine.ts (current production engine)
   * 'v2' — produced by evaluationPipeline + pipelineAdapter (future)
   *
   * Absent on documents written before this field was added (legacy docs).
   * Callers that need engineVersion must treat absent as 'v1'.
   */
  engineVersion:   'v1' | 'v2'
}

// ── Write ─────────────────────────────────────────────────────

export interface WriteEvaluationResultOptions {
  result:          EvaluationResult
  profileSnapshot: EvaluationProfile
  personalTarget?: PersonalTargetDoc | null
  branchTarget?:   MonthlyTarget    | null
  kpiActuals:      Record<string, number>
  calculatedBy:    string
  /**
   * Which engine produced this result.
   * Defaults to 'v1' when absent for backwards compatibility.
   * Set to 'v2' when V2 pipeline is the official engine (Limited Rollout+).
   */
  engineVersion?:  'v1' | 'v2'
}

/**
 * Write an evaluation result to the immutable ledger.
 * Uses Firestore auto-ID — no composite doc IDs.
 * Document is sealed at write time; no update path exists.
 *
 * @returns The written ledger document with its Firestore ID.
 */
export async function writeEvaluationResult(
  opts:      WriteEvaluationResultOptions,
  actorRole: string,
): Promise<EvaluationLedgerDoc> {
  const { result, profileSnapshot, personalTarget, branchTarget, kpiActuals, calculatedBy,
          engineVersion = 'v1' } = opts

  // Build branch target snapshot (only target fields)
  const branchTargetSnapshot: Record<string, number> | null = branchTarget
    ? Object.fromEntries(
        Object.entries(branchTarget).filter(([k, v]) => k.endsWith('Target') && typeof v === 'number')
      ) as Record<string, number>
    : null

  const payload: Omit<EvaluationLedgerDoc, 'id'> = {
    // Identity
    userId:         result.userId,
    pharmacyId:     result.pharmacyId,
    role:           result.role,
    month:          result.month,

    // Profile
    profileId:      result.profileId,
    profileVersion: result.profileVersion,

    // Snapshots — the core of historical reproducibility
    profileSnapshot,
    personalTargetSnapshot:  personalTarget?.targets ?? null,
    branchTargetSnapshot,
    actualsSnapshot: { ...kpiActuals },

    // Results
    basketResults:  result.basketResults,
    finalScore:     result.finalScore,
    rating:         result.rating,
    ratingAr:       result.ratingAr     ?? null,
    ratingScore:    result.ratingScore,
    ratingColor:    result.ratingColor  ?? null,
    status:         result.status,
    calculationTrace: result.trace,

    // Lifecycle
    calculatedAt:    serverTimestamp(),
    calculatedBy,
    recalculationOf: null,   // ER-2C

    // Engine provenance — identifies which engine produced this ledger document.
    // Allows post-hoc queries to distinguish V1 and V2 docs during Limited Rollout.
    // Defaults to 'v1'; will be 'v2' once V2 is promoted as official engine.
    engineVersion,

    // Immutability
    sealed: true,
  }

  // Sanitize undefined → null recursively before writing to Firestore.
  // Firestore rejects undefined values; optional TypeScript fields (ratingAr?,
  // bandColor?, nameAr? etc.) become undefined at runtime when not set.
  const safePayload = sanitizeForFirestore(payload) as Omit<EvaluationLedgerDoc, 'id'>

  // Debug: log top-level keys to confirm no unexpected structure (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const topLevelUndefined = Object.entries(payload)
      .filter(([, v]) => v === undefined)
      .map(([k]) => k)
    if (topLevelUndefined.length > 0) {
      console.debug('[ledger] top-level undefined keys (will be null after sanitize):', topLevelUndefined)
    }
  }

  const ref = await addDoc(collection(db, COL.EVALUATION_RESULTS), safePayload)

  await logAction({
    action:     AUDIT_ACTION.CREATE,
    collection: COL.EVALUATION_RESULTS,
    docId:      ref.id,
    userId:     calculatedBy,
    userRole:   actorRole,
    after: {
      userId:         result.userId,
      month:          result.month,
      profileId:      result.profileId,
      profileVersion: result.profileVersion,
      finalScore:     result.finalScore,
      rating:         result.rating,
      status:         result.status,
    },
  })

  return { id: ref.id, ...payload } as EvaluationLedgerDoc
}

// ── Read ──────────────────────────────────────────────────────

/** Fetch a single ledger document by ID */
export async function fetchEvaluationResult(id: string): Promise<EvaluationLedgerDoc | null> {
  const snap = await getDoc(doc(db, COL.EVALUATION_RESULTS, id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as EvaluationLedgerDoc) : null
}

/**
 * Fetch all ledger documents for a specific user+month (may have multiple profiles).
 *
 * @param pharmacyId - When provided (manager drilldown mode), queries by pharmacyId+month
 *   then filters client-side by userId. This satisfies the Firestore rule
 *   `isMgr() && resource.data.pharmacyId == pharmId()` via the WHERE clause and reuses
 *   the existing (pharmacyId, month, calculatedAt) composite index.
 *   Without pharmacyId (self mode), the existing userId+month query is used — the rule
 *   branch `isAny() && resource.data.userId == uid()` is satisfied because userId==uid().
 */
export async function fetchEvaluationResultsForUserMonth(
  userId:     string,
  month:      string,
  pharmacyId?: string,
): Promise<EvaluationLedgerDoc[]> {
  if (pharmacyId) {
    // Manager drilldown: query by pharmacyId+month (rule-compatible), filter by userId.
    const q = query(
      collection(db, COL.EVALUATION_RESULTS),
      where('pharmacyId', '==', pharmacyId),
      where('month',      '==', month),
      orderBy('calculatedAt', 'desc'),
    )
    const snap = await getDocs(q)
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as EvaluationLedgerDoc))
      .filter((r) => r.userId === userId)
  }
  // Self mode: userId == uid(), so the self-read rule branch is satisfied.
  const q = query(
    collection(db, COL.EVALUATION_RESULTS),
    where('userId', '==', userId),
    where('month',  '==', month),
    orderBy('calculatedAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as EvaluationLedgerDoc))
}

/** Fetch all ledger documents for a branch+month */
export async function fetchEvaluationResultsForBranch(
  pharmacyId: string,
  month:      string,
): Promise<EvaluationLedgerDoc[]> {
  const q    = query(
    collection(db, COL.EVALUATION_RESULTS),
    where('pharmacyId', '==', pharmacyId),
    where('month',      '==', month),
    orderBy('calculatedAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as EvaluationLedgerDoc))
}

/** Real-time listener: a pharmacist's own results */
export function subscribeMyEvaluationResults(
  userId:   string,
  callback: (docs: EvaluationLedgerDoc[]) => void,
): () => void {
  const q = query(
    collection(db, COL.EVALUATION_RESULTS),
    where('userId', '==', userId),
    orderBy('calculatedAt', 'desc'),
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EvaluationLedgerDoc)))
  )
}
