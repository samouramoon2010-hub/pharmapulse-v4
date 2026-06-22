// ============================================================
// Branch Classification — RF-0
//
// Data model only. No scoring, no sorting, no ranking.
//
// Temporal design:
//   A branch can be reclassified over time.
//   Monthly rankings must use the classification that applied
//   IN that month, not today's value.
//
//   Two storage levels:
//     1. pharmacies/{id}.branchClassification   — current pointer (fast reads)
//     2. pharmacies/{id}/classificationHistory  — effective-dated log (ranking)
//
// Non-goals for RF-0:
//   No ranking. No leaderboards. No scoring. No UI.
//   ranking-contract.ts defines only the future key shape.
// ============================================================

// ── Classification registry entry ────────────────────────────

/** A single entry in the `classifications` Firestore collection. */
export interface BranchClassification {
  /** Firestore document ID (also stored as a field for self-description). */
  id: string

  /** Human-readable label shown in UI (English). */
  label: string

  /** Arabic label for RTL UI. */
  labelAr?: string

  /** Optional description of what this classification means. */
  description?: string

  /** Sort order for display (ascending). */
  order: number

  /**
   * Whether this classification can be assigned to branches.
   * Soft-retire by setting active:false — existing assignments
   * are preserved; new assignments are blocked.
   */
  active: boolean

  /**
   * System classifications (e.g. 'unclassified') cannot be deleted
   * via admin UI. Admin-only code can still hard-delete if needed.
   */
  system?: boolean

  /** Schema version for this document (forward-compat). */
  schemaVersion: number

  createdAt?:  unknown  // serverTimestamp()
  updatedAt?:  unknown  // serverTimestamp()
}

// ── Pharmacy classification fields ───────────────────────────
// These are ADDITIVE fields on the existing `pharmacies/{id}` document.
// Old clients that don't know about classification keep working unchanged.

/**
 * The additive classification fields added to `pharmacies/{id}`.
 * Merged onto the existing pharmacy document — never replaces it.
 */
export interface PharmacyClassificationFields {
  /**
   * FK → `classifications.id`.
   * null   = explicitly unclassified (distinct from "never set").
   * The sentinel value UNCLASSIFIED_ID ('unclassified') is used during
   * migration backfill; null means "admin hasn't acted yet".
   */
  branchClassification: string | null

  /** When this value was last set (ISO or serverTimestamp). */
  branchClassificationSetAt: string | null

  /**
   * Who/what set this value.
   * 'admin'     = set via admin UI
   * 'migration' = set by the backfill migration
   * 'system'    = reserved for future automation
   */
  branchClassificationSource: ClassificationSource

  /**
   * Schema version guard for the pharmacy document.
   * Used by the migration to detect already-migrated documents
   * and skip them (idempotency).
   */
  schemaVersion: number
}

export type ClassificationSource = 'admin' | 'migration' | 'system'

// ── Classification history entry ──────────────────────────────
// Stored at: pharmacies/{id}/classificationHistory/{autoId}

/**
 * A single entry in the `classificationHistory` subcollection.
 * Effective-dated record so the Ranking Engine can use the
 * classification that applied IN a given month.
 */
export interface ClassificationHistoryEntry {
  /** Firestore auto-ID (also the document ID). */
  id?: string

  /** FK → `classifications.id` */
  classificationId: string

  /**
   * First month this classification applied, inclusive.
   * Format: 'YYYY-MM'
   */
  effectiveFrom: string

  /**
   * Last month this classification applied, inclusive.
   * null = still current (open-ended).
   * Set when a new classification supersedes this entry.
   * Format: 'YYYY-MM' | null
   */
  effectiveTo: string | null

  /** Who/what set this classification. */
  source: ClassificationSource

  /** Wall-clock time of the assignment. */
  setAt: unknown  // serverTimestamp()

  /** Auth UID of the admin who made the assignment. */
  setBy?: string | null
}

// ── Resolver input/output ─────────────────────────────────────

/**
 * Minimal pharmacy shape the resolver needs.
 * Intentionally narrow — the resolver never reads full pharmacy docs.
 */
export interface PharmacyForResolution {
  id:                   string
  branchClassification: string | null
  branchClassificationSetAt?: string | null
  branchClassificationSource?: ClassificationSource
  classificationHistory?: ClassificationHistoryEntry[]
}

/**
 * Result returned by resolveBranchClassification().
 */
export interface ClassificationResolution {
  /** The resolved classification ID. */
  classificationId: string

  /**
   * The source of this resolution:
   * 'current'   = from pharmacy.branchClassification (no month given, or history miss)
   * 'history'   = from classificationHistory for the requested month
   * 'fallback'  = UNCLASSIFIED_ID used because no value was found
   */
  source: 'current' | 'history' | 'fallback'

  /**
   * The month this resolution applies to, if a month was requested.
   * null when resolving "current" classification.
   */
  month: string | null
}

// ── Forward-compatible ranking key contract ───────────────────
// See ranking-contract.ts for the full contract.
// Imported here for type co-location only.

/**
 * The stable key shape the Ranking Engine will use.
 * Guaranteed by ranking-contract.ts — not implemented here.
 */
export interface RankingKeyComponents {
  profileId:            string
  profileVersion:       number
  month:                string    // 'YYYY-MM'
  branchClassification: string
}
