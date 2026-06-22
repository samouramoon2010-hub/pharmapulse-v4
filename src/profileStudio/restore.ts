// ============================================================
// Profile Studio — Rollback / Restore Kernel (Phase 1 Closure)
//
// Restores an old ProfileSnapshot into a brand-new DRAFT profile.
// Never overwrites the snapshot or any existing profile document —
// the snapshot remains in profileStudioSnapshots untouched, and the
// restored profile is a NEW document with a NEW id.
//
// Hard safety rules:
//   - Output status is always DRAFT, regardless of the snapshot's
//     captured status (even if the snapshot was PUBLISHED).
//   - A new profile id is generated — the original profile document
//     is never mutated or replaced.
//   - No activation: the caller must run the normal lifecycle
//     (DRAFT → VALIDATED → SIMULATED → APPROVED → PUBLISHED) from
//     scratch to ever make a restored profile live again.
//   - Pure function — no Firestore reads/writes. Persisting the
//     restored draft is the caller's responsibility, via the
//     existing createProfileDocument() service.
// ============================================================

import type { EvaluationProfileDraft } from './types'
import type { ProfileSnapshot } from './exporter'
import { PROFILE_STATUS } from './lifecycle'
import { generateProfileId } from './profileFactory'

export interface RestoreFromSnapshotOptions {
  /** Optional override for the restored draft's display name. */
  name?:      string
  restoredBy?: string
}

export interface RestoreFromSnapshotResult {
  /** A brand-new DRAFT profile, deep-cloned from the snapshot's payload. */
  profile: EvaluationProfileDraft
  /** The snapshot this restore was sourced from — for audit/notes only. */
  sourceSnapshotId: string
  sourceVersion:     string
}

/**
 * Builds a new DRAFT profile from a frozen snapshot.
 *
 * - Deep-clones the snapshot's profile payload (the snapshot itself is
 *   never mutated).
 * - Assigns a fresh profile id (`restored_<ts>_<n>`) — history (the
 *   original profile document and the snapshot) is left intact.
 * - Forces status to DRAFT and resets createdAt/updatedAt.
 * - Bumps the version with a "-restored" suffix so it is visibly
 *   distinguishable from the original lineage without colliding with
 *   normal semantic versioning.
 */
export function restoreProfileFromSnapshot(
  snapshot: ProfileSnapshot,
  options:  RestoreFromSnapshotOptions = {},
): RestoreFromSnapshotResult {
  const cloned = JSON.parse(JSON.stringify(snapshot.profile)) as EvaluationProfileDraft
  const now = new Date().toISOString()
  const newId = generateProfileId('restored')

  const profile: EvaluationProfileDraft = {
    ...cloned,
    metadata: {
      ...cloned.metadata,
      id:        newId,
      name:      options.name ?? `${cloned.metadata.name} (restored)`,
      version:   `${snapshot.version}-restored`,
      status:    PROFILE_STATUS.DRAFT,
      createdBy: options.restoredBy ?? cloned.metadata.createdBy,
      createdAt: now,
      updatedAt: now,
    },
  }

  return {
    profile,
    sourceSnapshotId: snapshot.snapshotId,
    sourceVersion:    snapshot.version,
  }
}
