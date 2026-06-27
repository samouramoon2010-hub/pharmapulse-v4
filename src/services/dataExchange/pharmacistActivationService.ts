// ============================================================
// Pharmacist Activation / Pending-Record Claim (DX-2/DX-3 Closure Patch)
//
// ── Part 1 audit finding (proven, not assumed) ──────────────────
// Profile resolution everywhere in this codebase (authStore._fetchProfile,
// every Firestore rule via userDoc()) reads `users/{request.auth.uid}` —
// i.e. the user document's ID. Bulk import (pharmacistsAdapter.ts)
// deliberately writes to `users/pending_${employeeId}` — a synthetic ID
// that is NEVER a real Firebase Auth UID (Auth UIDs are opaque
// Firebase-generated strings; `pending_EMP123` cannot collide with one).
//
// The existing createUser() (userService.js) creates a NEW Auth account
// and writes a BRAND NEW `users/{newAuthUid}` document — it has no
// awareness of any pending record. Run unmodified against an employeeId
// that already has a pending record, this WOULD produce two documents:
// the original `pending_${employeeId}` (now orphaned) and the new
// `users/{newAuthUid}` (the real one). Confirmed by direct reading of
// createUser()'s implementation — it unconditionally does
// `setDoc(doc(db, COL.USERS, uid), profile)` with the just-created Auth
// uid, with no read-before-write check against any other document.
//
// kpi_entries / evaluation_results / daily_summaries / audit "self"
// actions CANNOT already reference a pending doc's ID, because every
// write path for those collections requires `request.auth.uid` to match
// the acting identity (isOwnData() / guardOwnUserId()), and a pending
// doc's ID is by construction never a real Firebase Auth UID — no live
// session can ever have `auth.uid === 'pending_EMP123'`. The ONE
// pre-activation reference that genuinely can exist is
// `personal_targets`, whose doc ID embeds `userId` and which an admin
// can allocate to a pending pharmacist by selecting them from a branch
// roster before they've ever logged in — handled by
// migratePersonalTargetsReferences() below.
//
// ── Design: no new server/Admin SDK infrastructure ──────────────
// Activation reuses the existing createUser() (Auth + fresh Firestore
// doc) UNCHANGED, then claims the pending record via a single Firestore
// client-SDK transaction (runTransaction) — a standard Firestore client
// capability, not server infrastructure. Two concurrent claim attempts
// for the same employeeId race on the SAME transaction; only one can
// flip `pending_${employeeId}.authStatus` away from 'PENDING_INVITATION'
// — the loser re-reads inside the transaction, sees it already claimed,
// and becomes a safe no-op. No Hard Stop applies.
//
// The pending record is never hard-deleted (Firestore rules deny
// arbitrary deletes on most collections already, and this codebase's
// established convention is soft-archive over delete — see KPI Registry
// archiveKpiDefinition()). It is marked `authStatus: 'CLAIMED'` and
// excluded from existingByEmployeeId/existingByEmail lookups going
// forward (see fetchExistingOnboardingData.ts) so it never re-collides
// with the now-real identity.
// ============================================================

import {
  doc, getDoc, runTransaction, serverTimestamp,
  collection, query, where, getDocs, writeBatch, deleteDoc,
} from 'firebase/firestore'
import { db, COL } from './dxFirebaseTypes'
import { logAction, AUDIT_ACTION } from './dxAuditTypes'
import { createUser } from './dxUserTypes'

export interface ActivatePendingPharmacistParams {
  employeeId: string
  displayName: string
  email: string
  password: string
  role: string
  pharmacyId?: string | null
  actorId: string
  actorRole: string
}

export interface ActivationResult {
  uid: string
  claimed: boolean          // true if a pending record existed and was claimed
  alreadyClaimed: boolean   // true if activation was retried and the pending record was already claimed by a prior attempt
}

function pendingDocId(employeeId: string): string {
  return `pending_${employeeId}`
}

/**
 * Claims a pending operational record into the real, Auth-linked user
 * document. Idempotent and safe under concurrent retries — see module
 * header. Does NOT create the Auth account itself; call this AFTER
 * createUser() has already produced `newUid`.
 */
async function claimPendingRecord(
  newUid: string,
  employeeId: string,
  actorId: string,
  actorRole: string,
): Promise<{ claimed: boolean; alreadyClaimed: boolean }> {
  const pendingRef = doc(db, COL.USERS, pendingDocId(employeeId))
  const newRef     = doc(db, COL.USERS, newUid)

  const outcome = await runTransaction(db, async (tx) => {
    const pendingSnap = await tx.get(pendingRef)
    if (!pendingSnap.exists()) return { claimed: false, alreadyClaimed: false }

    const pending = pendingSnap.data() as Record<string, unknown>
    if (pending.authStatus !== 'PENDING_INVITATION') {
      // Already claimed by an earlier (possibly concurrent) attempt —
      // safe no-op, never a second claim.
      return { claimed: false, alreadyClaimed: true }
    }

    const newSnap = await tx.get(newRef)
    if (!newSnap.exists()) {
      throw new Error(`Cannot claim pending record — target user ${newUid} does not exist`)
    }

    // Operational fields from the pending onboarding record win — they
    // are the original onboarding source of truth. Identity/contact
    // fields (email, displayName) from the just-created real account win.
    tx.set(newRef, {
      employeeId:  pending.employeeId ?? employeeId,
      pharmacyId:  pending.pharmacyId ?? newSnap.data().pharmacyId ?? null,
      role:        pending.role ?? newSnap.data().role,
      joiningDate: pending.joiningDate ?? null,
      leavingDate: pending.leavingDate ?? null,
      activatedFromPendingId: pendingRef.id,
      updatedAt:   serverTimestamp(),
    }, { merge: true })

    // Never hard-delete — mark CLAIMED so it's excluded from future
    // identity lookups (fetchExistingOnboardingData.ts) without losing
    // the audit trail of where this pharmacist originated. Also flip
    // `active: false` (Closure Patch Part 2 — CLAIMED visibility audit):
    // the claim above does not touch this old doc's `active`/`pharmacyId`
    // fields, so without this, any reader that queries on `active ==
    // true` directly (not through the central getUsersByPharmacy()
    // boundary) would still match this now-superseded document
    // alongside the new real one. The CLAIMED doc stays fully readable
    // for audit/history — only its operational-roster eligibility
    // changes.
    tx.set(pendingRef, {
      authStatus:    'CLAIMED',
      claimedByUid:  newUid,
      claimedAt:     serverTimestamp(),
      active:        false,
    }, { merge: true })

    return { claimed: true, alreadyClaimed: false }
  })

  if (outcome.claimed) {
    await logAction({
      action: AUDIT_ACTION.UPDATE, collection: COL.USERS, docId: newUid,
      userId: actorId, userRole: actorRole,
      meta: { operation: 'activate_pending_pharmacist', pendingDocId: pendingRef.id, employeeId },
    })
    // Best-effort, non-blocking — see module header. Personal targets
    // pre-allocated to the pending doc ID are the only collection that
    // can reference it before activation; migrate them, but a failure
    // here does not fail the activation itself (the identity claim above
    // already succeeded and is the load-bearing guarantee).
    await migratePersonalTargetsReferences(pendingRef.id, newUid, actorId, actorRole).catch((e) =>
      console.error('[pharmacistActivationService] personal_targets migration failed (non-fatal):', e),
    )
  }

  return outcome
}

/** Best-effort migration of personal_targets docs keyed by the old
 *  pending user ID — doc ID embeds userId, so this is a copy+delete,
 *  not a field update. See module header for why this is the only
 *  collection that can pre-reference a pending pharmacist.
 *
 *  pharmacyId/month are read from the DOCUMENT DATA, never parsed back
 *  out of the old doc ID — `personalTargetId()` builds IDs as
 *  `${userId}_${pharmacyId}_${month}`, and a pending user ID is itself
 *  `pending_${employeeId}` (already containing an underscore), so a
 *  naive `id.split('_')` misaligns every field after the first. */
async function migratePersonalTargetsReferences(
  oldUserId: string,
  newUserId: string,
  actorId:   string,
  actorRole: string,
): Promise<void> {
  const snap = await getDocs(query(collection(db, COL.PERSONAL_TARGETS), where('userId', '==', oldUserId)))
  if (snap.empty) return

  const batch = writeBatch(db)
  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown> & { pharmacyId: string; month: string }
    const newDocId = `${newUserId}_${data.pharmacyId}_${data.month}`
    batch.set(doc(db, COL.PERSONAL_TARGETS, newDocId), { ...data, userId: newUserId })
    batch.delete(docSnap.ref)
  }
  await batch.commit()

  await logAction({
    action: AUDIT_ACTION.UPDATE, collection: COL.PERSONAL_TARGETS,
    userId: actorId, userRole: actorRole,
    meta: { operation: 'migrate_personal_targets_on_activation', oldUserId, newUserId, count: snap.docs.length },
  })
}

/**
 * Activates a pharmacist: creates the real Firebase Auth account + fresh
 * Firestore profile via the EXISTING, unmodified createUser(), then
 * claims any pending onboarding record for the same employeeId.
 *
 * If no pending record exists for this employeeId, this is exactly
 * equivalent to calling createUser() directly — existing manual user
 * creation behavior for employees who were never bulk-imported is
 * completely unchanged.
 */
export async function activatePendingPharmacist(
  params: ActivatePendingPharmacistParams,
): Promise<ActivationResult> {
  const { employeeId, actorId, actorRole, ...createUserParams } = params

  const { uid } = await createUser({
    ...createUserParams,
    employeeId,
    actorId,
    actorRole,
  })

  const { claimed, alreadyClaimed } = await claimPendingRecord(uid, employeeId, actorId, actorRole)
  return { uid, claimed, alreadyClaimed }
}

/** Read-only check — used by the Pharmacists adapter / UI to classify
 *  identity conflicts without performing any write. */
export async function findPendingPharmacistRecord(
  employeeId: string,
): Promise<({ id: string } & Record<string, unknown>) | null> {
  const snap = await getDoc(doc(db, COL.USERS, pendingDocId(employeeId)))
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Record<string, unknown>) } as { id: string } & Record<string, unknown>) : null
}

export async function deletePendingPharmacistIfNeverClaimed(employeeId: string): Promise<boolean> {
  const ref = doc(db, COL.USERS, pendingDocId(employeeId))
  const snap = await getDoc(ref)
  if (!snap.exists()) return false
  if (snap.data().authStatus !== 'PENDING_INVITATION') return false   // never delete a claimed record
  await deleteDoc(ref)
  return true
}
