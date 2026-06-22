// ============================================================
// Profile Studio — Firestore Service Layer (Phase 1B)
//
// Implements persistence for all 5 Profile Studio collections:
//   profileStudioProfiles        (mutable)
//   profileStudioSnapshots       (append-only)
//   profileStudioAuditLogs       (append-only)
//   profileStudioPublishPackages (append-only)
//   profileStudioSimulationRuns  (append-only)
//
// Every mutating function:
//   1. Validates caller role via persistenceGuards
//   2. Validates document schema via persistenceSchema validators
//   3. Writes to Firestore (never mutates input objects)
//   4. Auto-creates an audit log entry on profile mutations
//
// NO UI. NO React. NO routes. NO sidebar. NO AI. NO engine.
// ============================================================

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'

import { db } from '../services/firebase'

import type {
  ProfileStudioRole,
  ProfileStudioProfileDoc,
  ProfileStudioSnapshotDoc,
  ProfileStudioAuditLogDoc,
  ProfileStudioPublishPackageDoc,
  ProfileStudioSimulationRunDoc,
  ProfileAuditAction,
} from './persistenceTypes'

import {
  canCreateProfile,
  canEditProfile,
  canApproveProfile,
  canPublishProfile,
  canArchiveProfile,
  canRunSimulation,
  canReadProfile,
} from './persistenceGuards'

import {
  validatePersistenceSchema,
} from './persistenceSchema'

import type { ProfileStatus } from './types'

// ════════════════════════════════════════════════════════════
// SECTION 1 — Collection name constants (Profile Studio only)
// ════════════════════════════════════════════════════════════

export const PS_COL = {
  PROFILES:         'profileStudioProfiles',
  SNAPSHOTS:        'profileStudioSnapshots',
  AUDIT_LOGS:       'profileStudioAuditLogs',
  PUBLISH_PACKAGES: 'profileStudioPublishPackages',
  SIMULATION_RUNS:  'profileStudioSimulationRuns',
} as const

// ════════════════════════════════════════════════════════════
// SECTION 2 — Internal helpers
// ════════════════════════════════════════════════════════════

function colRef(name: string) {
  return collection(db, name)
}

function docRef(name: string, id: string) {
  return doc(db, name, id)
}

/** Converts unknown Firestore data to a plain object (strips Timestamps). */
function toPlain(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v instanceof Timestamp) {
      out[k] = v.toDate().toISOString()
    } else {
      out[k] = v
    }
  }
  return out
}

function requirePermission(condition: boolean, message: string): void {
  if (!condition) throw new Error(`PERMISSION_DENIED: ${message}`)
}

function requireValid(
  collectionName: Parameters<typeof validatePersistenceSchema>[0],
  doc: Record<string, unknown>,
): void {
  const result = validatePersistenceSchema(collectionName, doc)
  if (!result.valid) {
    const msgs = result.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.code}${i.field ? ` (${i.field})` : ''}: ${i.message}`)
      .join('; ')
    throw new Error(`SCHEMA_INVALID: ${msgs}`)
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 3 — Audit log (internal writer, not exported directly)
// ════════════════════════════════════════════════════════════

/**
 * Appends a record to `profileStudioAuditLogs`.
 * Called automatically by every mutating service function.
 * Never throws — audit failures are logged to console to avoid
 * masking the primary operation result.
 */
async function writeAuditLog(
  entry: Omit<ProfileStudioAuditLogDoc, 'auditId'>,
): Promise<void> {
  try {
    const payload = {
      ...entry,
      performedAt: serverTimestamp(),
    }
    await addDoc(colRef(PS_COL.AUDIT_LOGS), payload)
  } catch (err) {
    console.error('[ProfileStudio] audit log write failed:', err)
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 4 — profileStudioProfiles API
// ════════════════════════════════════════════════════════════

/**
 * Creates a new profile document in `profileStudioProfiles`.
 *
 * Requires: role `admin`.
 * Validates schema before write.
 * Appends a CREATE_DRAFT audit log entry.
 *
 * @returns The created document including its Firestore-assigned id.
 */
export async function createProfileDocument(
  profile: Omit<ProfileStudioProfileDoc, 'createdAt' | 'updatedAt'> & {
    createdAt?: string
    updatedAt?: string
  },
  actor: { uid: string; role: ProfileStudioRole },
): Promise<ProfileStudioProfileDoc> {
  requirePermission(canCreateProfile(actor.role), `Role "${actor.role}" cannot create profiles`)

  const docId    = profile.id
  const now      = new Date().toISOString()
  const payload: Record<string, unknown> = {
    ...profile,
    createdBy:  actor.uid,
    approvedBy: null,
    publishedBy: null,
    publishedAt: null,
    createdAt:   serverTimestamp(),
    updatedAt:   serverTimestamp(),
  }

  requireValid('profileStudioProfiles', { ...profile, createdAt: now, updatedAt: now })

  await setDoc(docRef(PS_COL.PROFILES, docId), payload)

  await writeAuditLog({
    profileId:      docId,
    action:         'CREATE_DRAFT',
    previousStatus: null,
    newStatus:      (profile.status ?? 'DRAFT') as ProfileStatus,
    performedBy:    actor.uid,
    performedAt:    now,
    metadata:       {},
  })

  return { ...(profile as ProfileStudioProfileDoc), createdAt: now, updatedAt: now }
}

/**
 * Reads a single profile document by ID.
 *
 * Requires: any authenticated role.
 * Returns null when the document does not exist.
 */
export async function getProfileDocument(
  profileId: string,
  actor: { uid: string; role: ProfileStudioRole },
): Promise<ProfileStudioProfileDoc | null> {
  requirePermission(canReadProfile(actor.role), `Role "${actor.role}" cannot read profiles`)

  const snap = await getDoc(docRef(PS_COL.PROFILES, profileId))
  if (!snap.exists()) return null

  return toPlain(snap.data() as Record<string, unknown>) as unknown as ProfileStudioProfileDoc
}

/**
 * Lists profile documents, with optional status filter.
 *
 * Requires: any authenticated role.
 */
export async function listProfileDocuments(
  actor:   { uid: string; role: ProfileStudioRole },
  filters?: { status?: ProfileStatus },
): Promise<ProfileStudioProfileDoc[]> {
  requirePermission(canReadProfile(actor.role), `Role "${actor.role}" cannot list profiles`)

  let q = query(colRef(PS_COL.PROFILES), orderBy('createdAt', 'desc'))
  if (filters?.status) {
    q = query(colRef(PS_COL.PROFILES), where('status', '==', filters.status), orderBy('createdAt', 'desc'))
  }

  const snap = await getDocs(q)
  return snap.docs.map((d) => toPlain(d.data() as Record<string, unknown>) as unknown as ProfileStudioProfileDoc)
}

/**
 * Applies a partial update to a profile document.
 *
 * Requires: role `admin` for general edits.
 * `general_manager` may update only the approve/publish field subset.
 * Validates that the status allows edits (DRAFT/VALIDATED/SIMULATED)
 * unless the patch itself carries a status transition (approve/publish).
 * Appends a VALIDATE or SIMULATE audit log entry as appropriate.
 */
export async function updateProfileDocument(
  profileId: string,
  patch: Partial<ProfileStudioProfileDoc> & { _action?: ProfileAuditAction },
  actor:    { uid: string; role: ProfileStudioRole },
): Promise<void> {
  // Determine the action type from the patch
  const action: ProfileAuditAction = patch._action ?? 'VALIDATE'

  // Approve/publish operations are allowed for admin + general_manager
  const isApproveOp = action === 'APPROVE'
  const isPublishOp = action === 'PUBLISH'

  if (isApproveOp) {
    requirePermission(canApproveProfile(actor.role), `Role "${actor.role}" cannot approve profiles`)
  } else if (isPublishOp) {
    requirePermission(canPublishProfile(actor.role), `Role "${actor.role}" cannot publish profiles`)
  } else {
    requirePermission(canEditProfile(actor.role), `Role "${actor.role}" cannot edit profiles`)
  }

  const { _action: _removed, ...cleanPatch } = patch

  const payload: Record<string, unknown> = {
    ...cleanPatch,
    updatedAt: serverTimestamp(),
  }

  await updateDoc(docRef(PS_COL.PROFILES, profileId), payload)

  await writeAuditLog({
    profileId,
    action,
    previousStatus: null,
    newStatus:      (cleanPatch.status ?? null) as ProfileStatus | null,
    performedBy:    actor.uid,
    performedAt:    new Date().toISOString(),
    metadata:       {},
  })
}

/**
 * Archives a profile by setting its status to ARCHIVED.
 *
 * Requires: role `admin`.
 * ARCHIVED is a terminal state — no further edits are allowed.
 * Appends an ARCHIVE audit log entry.
 */
export async function archiveProfileDocument(
  profileId: string,
  actor:     { uid: string; role: ProfileStudioRole },
  notes?:    string,
): Promise<void> {
  requirePermission(canArchiveProfile(actor.role), `Role "${actor.role}" cannot archive profiles`)

  await updateDoc(docRef(PS_COL.PROFILES, profileId), {
    status:    'ARCHIVED' as ProfileStatus,
    updatedAt: serverTimestamp(),
  })

  await writeAuditLog({
    profileId,
    action:         'ARCHIVE',
    previousStatus: null,
    newStatus:      'ARCHIVED',
    performedBy:    actor.uid,
    performedAt:    new Date().toISOString(),
    notes,
    metadata:       {},
  })
}

// ════════════════════════════════════════════════════════════
// SECTION 5 — profileStudioSnapshots API
// ════════════════════════════════════════════════════════════

/**
 * Creates an immutable snapshot document.
 *
 * Requires: role `admin` or `general_manager`.
 * Snapshots are append-only — this function has no update counterpart.
 * Validates schema before write.
 * Appends a SNAPSHOT_CREATED audit log entry.
 *
 * @returns The snapshot document with Firestore-assigned id.
 */
export async function createProfileSnapshotDocument(
  snapshot: Omit<ProfileStudioSnapshotDoc, 'createdAt'> & { createdAt?: string },
  actor:    { uid: string; role: ProfileStudioRole },
): Promise<ProfileStudioSnapshotDoc> {
  requirePermission(
    canApproveProfile(actor.role) || canPublishProfile(actor.role),
    `Role "${actor.role}" cannot create snapshots`,
  )

  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    ...snapshot,
    immutable:  true as const,
    createdAt:  serverTimestamp(),
  }

  requireValid('profileStudioSnapshots', { ...snapshot, createdAt: now, immutable: true })

  const ref = await addDoc(colRef(PS_COL.SNAPSHOTS), payload)

  await writeAuditLog({
    profileId:      snapshot.profileId,
    action:         'SNAPSHOT_CREATED',
    previousStatus: null,
    newStatus:      snapshot.status as ProfileStatus,
    performedBy:    actor.uid,
    performedAt:    now,
    metadata:       { snapshotId: ref.id },
  })

  return { ...(snapshot as ProfileStudioSnapshotDoc), createdAt: now }
}

// ════════════════════════════════════════════════════════════
// SECTION 6 — profileStudioAuditLogs API
// ════════════════════════════════════════════════════════════

/**
 * Lists audit log entries for a given profile, newest first.
 *
 * Requires: any authenticated role with profile:read (all roles).
 * Read-only — audit logs have no update/delete counterpart.
 */
export async function listAuditLogs(
  profileId: string,
  actor:     { uid: string; role: ProfileStudioRole },
): Promise<ProfileStudioAuditLogDoc[]> {
  requirePermission(canReadProfile(actor.role), `Role "${actor.role}" cannot list audit logs`)

  const q = query(
    colRef(PS_COL.AUDIT_LOGS),
    where('profileId', '==', profileId),
    orderBy('performedAt', 'desc'),
  )

  const snap = await getDocs(q)
  return snap.docs.map((d) => toPlain(d.data() as Record<string, unknown>) as unknown as ProfileStudioAuditLogDoc)
}

/**
 * Writes an audit log entry directly (for callers that need manual control).
 *
 * In most cases the mutating service functions write audit logs automatically.
 * This function is for exceptional cases such as EXPORT or IMPORT events.
 *
 * Requires: any authenticated role.
 * Audit logs are append-only — no update counterpart.
 */
export async function createAuditLogDocument(
  log:   Omit<ProfileStudioAuditLogDoc, 'auditId'>,
  actor: { uid: string; role: ProfileStudioRole },
): Promise<void> {
  requirePermission(canReadProfile(actor.role), `Role "${actor.role}" is not a valid Profile Studio role`)

  const payload = {
    ...log,
    performedAt: serverTimestamp(),
  }

  await addDoc(colRef(PS_COL.AUDIT_LOGS), payload)
}

// ════════════════════════════════════════════════════════════
// SECTION 7 — profileStudioPublishPackages API
// ════════════════════════════════════════════════════════════

/**
 * Creates an immutable publish package document.
 *
 * Requires: role `admin` or `general_manager`.
 * Publish packages are append-only.
 * Validates schema before write.
 * Appends a PUBLISH audit log entry.
 *
 * @returns The package document with Firestore-assigned id.
 */
export async function createPublishPackageDocument(
  pkg:   Omit<ProfileStudioPublishPackageDoc, 'publishedAt'> & { publishedAt?: string },
  actor: { uid: string; role: ProfileStudioRole },
): Promise<ProfileStudioPublishPackageDoc> {
  requirePermission(canPublishProfile(actor.role), `Role "${actor.role}" cannot create publish packages`)

  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    ...pkg,
    publishedBy: actor.uid,
    publishedAt: serverTimestamp(),
  }

  requireValid('profileStudioPublishPackages', { ...pkg, publishedAt: now })

  const ref = await addDoc(colRef(PS_COL.PUBLISH_PACKAGES), payload)

  await writeAuditLog({
    profileId:      pkg.profileId,
    action:         'PUBLISH',
    previousStatus: null,
    newStatus:      'PUBLISHED',
    performedBy:    actor.uid,
    performedAt:    now,
    metadata:       { packageId: ref.id },
  })

  return { ...(pkg as ProfileStudioPublishPackageDoc), publishedAt: now }
}

// ════════════════════════════════════════════════════════════
// SECTION 8 — profileStudioSimulationRuns API
// ════════════════════════════════════════════════════════════

/**
 * Creates an append-only simulation run document.
 *
 * Requires: role `admin`, `district_supervisor`, or `manager`.
 * Pharmacist cannot create simulation runs.
 * Validates schema before write.
 *
 * @returns The simulation run document with Firestore-assigned id.
 */
export async function createSimulationRunDocument(
  run:   Omit<ProfileStudioSimulationRunDoc, 'executedAt'> & { executedAt?: string },
  actor: { uid: string; role: ProfileStudioRole },
): Promise<ProfileStudioSimulationRunDoc> {
  requirePermission(canRunSimulation(actor.role), `Role "${actor.role}" cannot create simulation runs`)

  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    ...run,
    executedBy: actor.uid,
    executedAt: serverTimestamp(),
  }

  requireValid('profileStudioSimulationRuns', { ...run, executedAt: now })

  await addDoc(colRef(PS_COL.SIMULATION_RUNS), payload)

  return { ...(run as ProfileStudioSimulationRunDoc), executedAt: now }
}

/**
 * Lists snapshot documents for a given profile, newest first.
 *
 * Requires: role `admin` or `general_manager` (the same roles that
 * may create snapshots). Read-only — no update/delete counterpart,
 * snapshots remain append-only.
 */
export async function listProfileSnapshots(
  profileId: string,
  actor:     { uid: string; role: ProfileStudioRole },
): Promise<ProfileStudioSnapshotDoc[]> {
  requirePermission(
    canApproveProfile(actor.role) || canPublishProfile(actor.role),
    `Role "${actor.role}" cannot list snapshots`,
  )

  const q = query(
    colRef(PS_COL.SNAPSHOTS),
    where('profileId', '==', profileId),
    orderBy('createdAt', 'desc'),
  )

  const snap = await getDocs(q)
  return snap.docs.map((d) => toPlain(d.data() as Record<string, unknown>) as unknown as ProfileStudioSnapshotDoc)
}

/**
 * Lists simulation run documents for a given profile.
 *
 * Requires: role `admin` or `general_manager` for full list;
 * `district_supervisor`/`manager` may query — Firestore rules further
 * restrict per-document visibility to their own runs.
 * Pharmacist cannot list simulation runs.
 *
 * The Firestore rule for `district_supervisor`/`manager` is
 * `resource.data.executedBy == uid()` — a per-document condition that
 * cannot be satisfied by a query that only filters on `profileId`.
 * Firestore rejects such a query outright with "Missing or insufficient
 * permissions" because it cannot prove every possible matched document
 * would pass the rule. Adding `where('executedBy', '==', actor.uid)`
 * for those two roles makes the query itself satisfy the rule.
 * admin/general_manager are unaffected — their rule branches have no
 * per-document condition, so they keep the unrestricted query.
 */
export async function listSimulationRuns(
  profileId: string,
  actor:     { uid: string; role: ProfileStudioRole },
): Promise<ProfileStudioSimulationRunDoc[]> {
  requirePermission(
    canRunSimulation(actor.role) || canApproveProfile(actor.role),
    `Role "${actor.role}" cannot list simulation runs`,
  )

  const isOwnRunsOnly = actor.role === 'district_supervisor' || actor.role === 'manager'

  const q = isOwnRunsOnly
    ? query(
        colRef(PS_COL.SIMULATION_RUNS),
        where('profileId', '==', profileId),
        where('executedBy', '==', actor.uid),
        orderBy('executedAt', 'desc'),
      )
    : query(
        colRef(PS_COL.SIMULATION_RUNS),
        where('profileId', '==', profileId),
        orderBy('executedAt', 'desc'),
      )

  const snap = await getDocs(q)
  return snap.docs.map((d) => toPlain(d.data() as Record<string, unknown>) as unknown as ProfileStudioSimulationRunDoc)
}
