// ============================================================
// Data Ownership
// Consistent ownership metadata attached to every write.
// Backward-compatible — enriches new writes, doesn't touch old docs.
// ============================================================

import { serverTimestamp } from 'firebase/firestore'

// ── Ownership metadata shape ──────────────────────────────────

export interface OwnershipMetadata {
  createdBy:   string          // UID of creator
  createdAt:   unknown         // serverTimestamp()
  updatedBy:   string          // UID of last editor
  updatedAt:   unknown         // serverTimestamp()
  pharmacyId?: string          // branch affiliation
  branchId?:   string          // alias for pharmacyId (future migration)
}

export interface PartialOwnership {
  updatedBy:  string
  updatedAt:  unknown          // serverTimestamp()
}

// ── Factory: create ownership block for new documents ────────
export function createOwnership(
  actorUid:   string,
  pharmacyId?: string,
): OwnershipMetadata {
  const base: OwnershipMetadata = {
    createdBy: actorUid,
    createdAt: serverTimestamp(),
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  }
  if (pharmacyId) {
    base.pharmacyId = pharmacyId
    base.branchId   = pharmacyId   // mirrors pharmacyId — future separation ready
  }
  return base
}

// ── Factory: update ownership block for existing documents ───
export function updateOwnership(actorUid: string): PartialOwnership {
  return {
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  }
}

// ── Attach to payload ─────────────────────────────────────────
export function withCreateOwnership<T extends Record<string, unknown>>(
  payload:    T,
  actorUid:   string,
  pharmacyId?: string,
): T & OwnershipMetadata {
  return { ...payload, ...createOwnership(actorUid, pharmacyId) }
}

export function withUpdateOwnership<T extends Record<string, unknown>>(
  payload:   T,
  actorUid:  string,
): T & PartialOwnership {
  return { ...payload, ...updateOwnership(actorUid) }
}

// ── Read helpers (backward-compat: handle missing fields) ─────

export function getOwnerId(doc: Record<string, unknown>): string | null {
  return (doc.createdBy as string) ?? (doc.userId as string) ?? null
}

export function getOwnerBranchId(doc: Record<string, unknown>): string | null {
  return (doc.branchId as string) ?? (doc.pharmacyId as string) ?? null
}

export function isDocumentOwner(
  doc:     Record<string, unknown>,
  uid:     string,
): boolean {
  return getOwnerId(doc) === uid
}

export function isDocumentBranchOwner(
  doc:        Record<string, unknown>,
  pharmacyId: string,
): boolean {
  return getOwnerBranchId(doc) === pharmacyId
}

// ── Audit snapshot: captures before/after for audit_logs ─────
export function auditSnapshot<T extends Record<string, unknown>>(
  before: T | null,
  after:  T | null,
): { before: T | null; after: T | null } {
  // Strip server timestamps (non-serializable) for audit storage
  const clean = (obj: T | null): T | null => {
    if (!obj) return null
    const result = { ...obj }
    for (const key of ['createdAt', 'updatedAt'] as (keyof T)[]) {
      // Replace Firestore Timestamp objects with ISO strings if possible
      const val = result[key]
      if (val && typeof val === 'object' && 'toDate' in (val as object)) {
        (result as Record<string, unknown>)[key as string] =
          (val as { toDate: () => Date }).toDate().toISOString()
      }
    }
    return result
  }
  return { before: clean(before), after: clean(after) }
}
