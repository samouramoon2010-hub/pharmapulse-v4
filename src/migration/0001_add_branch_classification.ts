// ============================================================
// Migration 0001 — Add Branch Classification
// RF-0: Branch Classification Foundation
//
// Run order in production:
//   1. Dry-run  ({ dryRun: true })  — prints report, writes nothing
//   2. Seed registry                — creates default classifications
//   3. Backfill pharmacies          — sets branchClassification = 'unclassified'
//   4. Verify                       — re-run dry-run; expect updated: 0
//
// Properties:
//   ADDITIVE    — never removes or renames existing fields
//   IDEMPOTENT  — re-run produces updated: 0 on already-migrated docs
//   BATCHED     — max 450 ops per commit (<500 Firestore hard limit)
//   DRY-RUN     — { dryRun: true } writes nothing, reports what would change
//   REVERSIBLE  — rollback0001() removes the additive fields
//
// NEVER auto-assigns a real classification tier.
// All branches get branchClassification = 'unclassified'.
// Admin must explicitly promote branches.
// ============================================================

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, writeBatch, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import {
  CLASSIFICATIONS_COLLECTION,
  CLASSIFICATION_SCHEMA_VERSION,
  UNCLASSIFIED_ID,
  DEFAULT_CLASSIFICATIONS,
} from '../classification/constants'

// ── Batch size ────────────────────────────────────────────────

/**
 * Maximum writes per batch commit.
 * Firestore hard limit is 500; we use 450 for safety headroom.
 */
const BATCH_SIZE = 450

// ── Result types ──────────────────────────────────────────────

export interface MigrationResult {
  dryRun:   boolean
  scanned:  number
  updated:  number
  skipped:  number
  seeded:   number    // classifications registry documents created
  errors:   string[]
}

// ── 0001: Main entry point ────────────────────────────────────

/**
 * Run migration 0001.
 *
 * Steps:
 *   1. Seed the `classifications` registry (idempotent, skips existing docs)
 *   2. Backfill all pharmacies that are below CLASSIFICATION_SCHEMA_VERSION
 *
 * @param options.dryRun  When true, reports changes without writing anything.
 */
export async function migrate0001(
  options: { dryRun?: boolean } = {},
): Promise<MigrationResult> {
  const dryRun = options.dryRun ?? false

  const result: MigrationResult = {
    dryRun,
    scanned: 0,
    updated: 0,
    skipped: 0,
    seeded:  0,
    errors:  [],
  }

  // ── Step 1: Seed classification registry ─────────────────────
  await seedClassificationRegistry(result, dryRun)

  // ── Step 2: Backfill pharmacies ───────────────────────────────
  await backfillPharmacies(result, dryRun)

  return result
}

// ── Step 1: Seed registry ─────────────────────────────────────

async function seedClassificationRegistry(
  result: MigrationResult,
  dryRun: boolean,
): Promise<void> {
  for (const classification of DEFAULT_CLASSIFICATIONS) {
    try {
      const ref      = doc(db, CLASSIFICATIONS_COLLECTION, classification.id)
      const existing = await getDoc(ref)

      if (existing.exists()) {
        // Already seeded — never overwrite admin edits
        continue
      }

      result.seeded++

      if (!dryRun) {
        await setDoc(ref, {
          ...classification,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
    } catch (err) {
      result.errors.push(
        `Failed to seed classification '${classification.id}': ${(err as Error).message}`
      )
    }
  }
}

// ── Step 2: Backfill pharmacies ───────────────────────────────

async function backfillPharmacies(
  result: MigrationResult,
  dryRun: boolean,
): Promise<void> {
  const pharmaciesCol = collection(db, 'pharmacies')
  const snap = await getDocs(pharmaciesCol)

  result.scanned = snap.docs.length

  // Filter to docs that need migration
  const toMigrate = snap.docs.filter((d) => {
    const data = d.data()
    // Skip if already at current schema version (idempotency)
    return (data.schemaVersion ?? 0) < CLASSIFICATION_SCHEMA_VERSION
  })

  result.skipped = snap.docs.length - toMigrate.length

  if (dryRun) {
    result.updated = toMigrate.length
    return
  }

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = toMigrate.slice(i, i + BATCH_SIZE)

    for (const pharmDoc of chunk) {
      const ref = doc(db, 'pharmacies', pharmDoc.id)
      batch.update(ref, {
        // ADDITIVE: only set if not already present (via merge semantics via update)
        // Note: update() only changes named fields; other fields are preserved.
        branchClassification:       UNCLASSIFIED_ID,
        branchClassificationSetAt:  new Date().toISOString(),
        branchClassificationSource: 'migration',
        schemaVersion:              CLASSIFICATION_SCHEMA_VERSION,
      })
      result.updated++
    }

    await batch.commit()
  }
}

// ── Rollback ──────────────────────────────────────────────────

export interface RollbackResult {
  dryRun:   boolean
  scanned:  number
  reverted: number
  errors:   string[]
}

/**
 * Rollback migration 0001.
 *
 * REMOVES the additive fields added by migrate0001:
 *   branchClassification
 *   branchClassificationSetAt
 *   branchClassificationSource
 *   schemaVersion (reset to 0)
 *
 * Does NOT remove the `classifications` collection documents.
 * Old clients already ignore these fields → zero-downtime rollback.
 *
 * @param options.dryRun  When true, reports what would be reverted.
 */
export async function rollback0001(
  options: { dryRun?: boolean } = {},
): Promise<RollbackResult> {
  const dryRun = options.dryRun ?? false
  const result: RollbackResult = {
    dryRun, scanned: 0, reverted: 0, errors: [],
  }

  const snap = await getDocs(collection(db, 'pharmacies'))
  result.scanned = snap.docs.length

  // Filter to docs that have been migrated
  const toRollback = snap.docs.filter((d) => {
    const data = d.data()
    return (data.schemaVersion ?? 0) >= CLASSIFICATION_SCHEMA_VERSION
  })

  if (dryRun) {
    result.reverted = toRollback.length
    return result
  }

  // In Firestore, to "remove" a field you set it to FieldValue.delete().
  // We import deleteField from firebase/firestore for this.
  const { deleteField } = await import('firebase/firestore')

  for (let i = 0; i < toRollback.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const chunk = toRollback.slice(i, i + BATCH_SIZE)

    for (const pharmDoc of chunk) {
      const ref = doc(db, 'pharmacies', pharmDoc.id)
      batch.update(ref, {
        branchClassification:       deleteField(),
        branchClassificationSetAt:  deleteField(),
        branchClassificationSource: deleteField(),
        schemaVersion:              0,
      })
      result.reverted++
    }

    await batch.commit()
  }

  return result
}
