// ============================================================
// Evaluation Registry Service — ER-0
//
// CRUD for the `evaluation_profiles` Firestore collection.
//
// Security:
//   - Admin: full read/write
//   - All authenticated users: read published profiles
//     (needed by future Evaluation Engine to select active profile)
//   - No evaluation execution in this service
//
// Immutability:
//   Published profiles cannot be updated — createNewVersion() must
//   be called instead. This is enforced by the service (not only rules).
//
// Non-goals for ER-0:
//   - No evaluation calculations
//   - No scoring
//   - No ranking
//   - No coaching
// ============================================================

import {
  collection, doc, addDoc, setDoc, updateDoc,
  getDoc, getDocs, query, where, orderBy,
  onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { db, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'
import type {
  EvaluationProfile,
  EvaluationProfileStatus,
  EvaluationProfileVersion,
} from '../engine/evaluationRegistry/evaluationRegistryTypes'
import { isProfileImmutable } from '../engine/evaluationRegistry/evaluationRegistryTypes'

const clean = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

// ── Create ────────────────────────────────────────────────────

/**
 * Create a new draft EvaluationProfile.
 * New profiles always start as 'draft'.
 * @returns The created profile document with its Firestore-assigned id.
 */
export async function createEvaluationProfile(
  data:      Partial<EvaluationProfile>,
  actorId:   string,
  actorRole: string,
): Promise<EvaluationProfile> {
  if (!data.name?.trim()) throw new Error('Profile name is required')
  if (!data.role)         throw new Error('Profile role is required')

  const payload = clean({
    name:                 data.name.trim(),
    nameAr:               data.nameAr?.trim() || null,
    description:          data.description?.trim() || null,
    role:                 data.role,
    version:              1,
    effectiveFrom:        data.effectiveFrom || '',
    effectiveTo:          data.effectiveTo   || null,
    status:               'draft' as EvaluationProfileStatus,
    basketIds:            data.basketIds  || [],
    baskets:              data.baskets    || {},
    defaultThresholdRule: data.defaultThresholdRule || null,
    metadata:             data.metadata   || null,
    createdBy:            actorId || null,
    createdAt:            serverTimestamp(),
    updatedAt:            serverTimestamp(),
    publishedAt:          null,
    archivedAt:           null,
    previousVersionId:    null,
  })

  const ref = await addDoc(collection(db, COL.EVALUATION_PROFILES), payload)
  await logAction({
    action:     AUDIT_ACTION.CREATE,
    collection: COL.EVALUATION_PROFILES,
    docId:      ref.id,
    userId:     actorId,
    userRole:   actorRole,
    after:      { name: payload.name, role: payload.role, version: 1 },
  })

  return { id: ref.id, ...payload } as EvaluationProfile
}

// ── Update draft ──────────────────────────────────────────────

/**
 * Update a draft EvaluationProfile.
 * Throws if the profile is published or archived (immutable).
 * To edit a published profile, call createNewVersion() instead.
 */
export async function updateEvaluationProfile(
  id:        string,
  data:      Partial<EvaluationProfile>,
  actorId:   string,
  actorRole: string,
): Promise<void> {
  const snap    = await getDoc(doc(db, COL.EVALUATION_PROFILES, id))
  if (!snap.exists()) throw new Error(`Evaluation profile ${id} not found`)
  const current = snap.data() as EvaluationProfile

  if (isProfileImmutable(current.status)) {
    throw new Error(
      `Cannot edit a ${current.status} profile. Create a new version instead.`
    )
  }

  const before  = { name: current.name, status: current.status, version: current.version }
  const payload = clean({ ...data, updatedAt: serverTimestamp(), updatedBy: actorId || null })

  // Prevent changing immutability-relevant fields on a live draft
  delete (payload as Record<string, unknown>).status     // status changes via publish/archive only
  delete (payload as Record<string, unknown>).version    // version is immutable
  delete (payload as Record<string, unknown>).publishedAt
  delete (payload as Record<string, unknown>).archivedAt

  await updateDoc(doc(db, COL.EVALUATION_PROFILES, id), payload)
  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.EVALUATION_PROFILES,
    docId:      id,
    userId:     actorId,
    userRole:   actorRole,
    before,
    after:      payload,
  })
}

// ── Publish ───────────────────────────────────────────────────

/**
 * Publish a draft EvaluationProfile.
 * Sets status → 'published' and records publishedAt.
 * A published profile is immutable — future edits must create a new version.
 *
 * Validates the profile before publishing: throws if invalid.
 */
export async function publishEvaluationProfile(
  id:        string,
  actorId:   string,
  actorRole: string,
): Promise<void> {
  const snap = await getDoc(doc(db, COL.EVALUATION_PROFILES, id))
  if (!snap.exists()) throw new Error(`Evaluation profile ${id} not found`)
  const current = snap.data() as EvaluationProfile

  if (current.status !== 'draft') {
    throw new Error(`Only draft profiles can be published (current status: ${current.status})`)
  }

  // Import validation inline to avoid circular deps
  const { validateEvaluationProfile } = await import('../engine/evaluationRegistry/evaluationRegistryTypes')
  const validation = validateEvaluationProfile(current)
  if (!validation.valid) {
    throw new Error(`Profile validation failed: ${validation.errors.join('; ')}`)
  }

  const now = serverTimestamp()
  await updateDoc(doc(db, COL.EVALUATION_PROFILES, id), {
    status:      'published',
    publishedAt: now,
    updatedAt:   now,
    updatedBy:   actorId || null,
  })

  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.EVALUATION_PROFILES,
    docId:      id,
    userId:     actorId,
    userRole:   actorRole,
    before:     { status: 'draft' },
    after:      { status: 'published', name: current.name, version: current.version },
  })
}

// ── Archive ───────────────────────────────────────────────────

/**
 * Archive a published EvaluationProfile.
 * Archived profiles are read-only — they are preserved for historical accuracy.
 * Only published profiles can be archived.
 */
export async function archiveEvaluationProfile(
  id:        string,
  actorId:   string,
  actorRole: string,
): Promise<void> {
  const snap = await getDoc(doc(db, COL.EVALUATION_PROFILES, id))
  if (!snap.exists()) throw new Error(`Evaluation profile ${id} not found`)
  const current = snap.data() as EvaluationProfile

  if (current.status !== 'published') {
    throw new Error(`Only published profiles can be archived (current status: ${current.status})`)
  }

  const now = serverTimestamp()
  await updateDoc(doc(db, COL.EVALUATION_PROFILES, id), {
    status:     'archived',
    archivedAt: now,
    updatedAt:  now,
    updatedBy:  actorId || null,
  })

  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.EVALUATION_PROFILES,
    docId:      id,
    userId:     actorId,
    userRole:   actorRole,
    before:     { status: 'published' },
    after:      { status: 'archived', name: current.name },
  })
}

// ── Create new version ────────────────────────────────────────

/**
 * Create a new draft version of a published or archived EvaluationProfile.
 * The new version copies all data from the source and increments the version number.
 * The source profile is unchanged.
 *
 * This is the ONLY way to edit a published profile's content.
 */
export async function createNewVersion(
  sourceId:  string,
  actorId:   string,
  actorRole: string,
): Promise<EvaluationProfile> {
  const snap = await getDoc(doc(db, COL.EVALUATION_PROFILES, sourceId))
  if (!snap.exists()) throw new Error(`Source profile ${sourceId} not found`)
  const source = snap.data() as EvaluationProfile

  if (!isProfileImmutable(source.status)) {
    throw new Error('Can only create a new version from a published or archived profile')
  }

  const payload = clean({
    name:                 source.name,
    nameAr:               source.nameAr || null,
    description:          source.description || null,
    role:                 source.role,
    version:              (source.version || 1) + 1,
    effectiveFrom:        source.effectiveFrom,
    effectiveTo:          source.effectiveTo || null,
    status:               'draft' as EvaluationProfileStatus,
    basketIds:            source.basketIds || [],
    baskets:              source.baskets   || {},
    defaultThresholdRule: source.defaultThresholdRule || null,
    metadata:             source.metadata  || null,
    createdBy:            actorId || null,
    createdAt:            serverTimestamp(),
    updatedAt:            serverTimestamp(),
    publishedAt:          null,
    archivedAt:           null,
    previousVersionId:    sourceId,
  })

  const ref = await addDoc(collection(db, COL.EVALUATION_PROFILES), payload)
  await logAction({
    action:     AUDIT_ACTION.CREATE,
    collection: COL.EVALUATION_PROFILES,
    docId:      ref.id,
    userId:     actorId,
    userRole:   actorRole,
    after:      {
      name:              payload.name,
      version:           payload.version,
      previousVersionId: sourceId,
    },
  })

  return { id: ref.id, ...payload } as EvaluationProfile
}

// ── Subscriptions ─────────────────────────────────────────────

/** Real-time listener: all profiles ordered by version desc */
export function subscribeEvaluationProfiles(
  callback:      (profiles: EvaluationProfile[]) => void,
  onError?:      (err: Error) => void,
): () => void {
  // Use collection() directly — NOT query(collection()).
  // A bare query(collectionRef) wrapper with no constraints has been observed
  // to return empty snapshots silently in some Firebase SDK v12 environments.
  // Using the collection reference directly in onSnapshot is the safe form.
  // Client-side sort replaces the missing orderBy (no composite index needed).
  const colRef = collection(db, COL.EVALUATION_PROFILES)
  return onSnapshot(
    colRef,
    (snap) => {
      const profiles = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as EvaluationProfile))
        .sort((a, b) => {
          const aTs = (a.createdAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0
          const bTs = (b.createdAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0
          return bTs - aTs
        })
      callback(profiles)
    },
    (err) => {
      console.error('[evaluationRegistryService] subscribeEvaluationProfiles error:', err)
      onError?.(err)
    },
  )
}

/** Real-time listener: only published profiles (for Evaluation Engine use) */
export function subscribePublishedProfiles(
  callback: (profiles: EvaluationProfile[]) => void,
): () => void {
  const q = query(
    collection(db, COL.EVALUATION_PROFILES),
    where('status', '==', 'published'),
    orderBy('effectiveFrom', 'desc'),
  )
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EvaluationProfile)))
  )
}

// ── Fetch ─────────────────────────────────────────────────────

/** Fetch all profiles (one-shot) */
export async function fetchEvaluationProfiles(): Promise<EvaluationProfile[]> {
  const q    = query(
    collection(db, COL.EVALUATION_PROFILES),
    orderBy('createdAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as EvaluationProfile))
}

/** Fetch a single profile by id */
export async function fetchEvaluationProfile(id: string): Promise<EvaluationProfile | null> {
  const snap = await getDoc(doc(db, COL.EVALUATION_PROFILES, id))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as EvaluationProfile) : null
}

/**
 * Fetch the currently effective published profile for a given role and month.
 * Returns the most recently effective profile, or null if none found.
 * Used by the future Evaluation Engine.
 */
export async function fetchActiveProfileForMonth(
  role:  string,
  month: string,
): Promise<EvaluationProfile | null> {
  const q    = query(
    collection(db, COL.EVALUATION_PROFILES),
    where('status', '==', 'published'),
    orderBy('effectiveFrom', 'desc'),
  )
  const snap = await getDocs(q)
  const profiles = snap.docs.map((d) => ({ id: d.id, ...d.data() } as EvaluationProfile))

  const roles   = Array.isArray(role) ? role : [role]
  for (const profile of profiles) {
    const profileRoles = Array.isArray(profile.role) ? profile.role : [profile.role]
    const roleMatch    = roles.some((r) => profileRoles.includes(r))
    if (!roleMatch) continue
    if (profile.effectiveFrom > month) continue
    if (profile.effectiveTo && profile.effectiveTo < month) continue
    return profile
  }
  return null
}

// ── ER-1: Basket CRUD on draft profiles ───────────────────────
// All basket mutations update the full profile document (baskets map + basketIds).
// Immutability guard: service throws for published/archived profiles.

/**
 * Add or replace a basket in a draft profile.
 * basketIds order is updated to include the new basket id.
 */
export async function upsertBasket(
  profileId: string,
  basket:    import('../engine/evaluationRegistry/evaluationRegistryTypes').EvaluationBasket,
  actorId:   string,
  actorRole: string,
): Promise<void> {
  const snap = await getDoc(doc(db, COL.EVALUATION_PROFILES, profileId))
  if (!snap.exists()) throw new Error(`Profile ${profileId} not found`)
  const current = snap.data() as import('../engine/evaluationRegistry/evaluationRegistryTypes').EvaluationProfile

  if (isProfileImmutable(current.status)) {
    throw new Error(`Cannot edit a ${current.status} profile`)
  }

  const baskets   = { ...(current.baskets || {}), [basket.id]: basket }
  const basketIds = current.basketIds?.includes(basket.id)
    ? current.basketIds
    : [...(current.basketIds || []), basket.id]

  await updateDoc(doc(db, COL.EVALUATION_PROFILES, profileId), {
    baskets, basketIds, updatedAt: serverTimestamp(), updatedBy: actorId || null,
  })
}

/**
 * Remove a basket from a draft profile.
 */
export async function removeBasket(
  profileId: string,
  basketId:  string,
  actorId:   string,
  actorRole: string,
): Promise<void> {
  const snap = await getDoc(doc(db, COL.EVALUATION_PROFILES, profileId))
  if (!snap.exists()) throw new Error(`Profile ${profileId} not found`)
  const current = snap.data() as import('../engine/evaluationRegistry/evaluationRegistryTypes').EvaluationProfile

  if (isProfileImmutable(current.status)) {
    throw new Error(`Cannot edit a ${current.status} profile`)
  }

  const baskets   = { ...(current.baskets || {}) }
  delete baskets[basketId]
  const basketIds = (current.basketIds || []).filter((id) => id !== basketId)

  await updateDoc(doc(db, COL.EVALUATION_PROFILES, profileId), {
    baskets, basketIds, updatedAt: serverTimestamp(), updatedBy: actorId || null,
  })
}

/**
 * Reorder basket IDs in a draft profile.
 */
export async function reorderBaskets(
  profileId:  string,
  basketIds:  string[],
  actorId:    string,
  actorRole:  string,
): Promise<void> {
  const snap = await getDoc(doc(db, COL.EVALUATION_PROFILES, profileId))
  if (!snap.exists()) throw new Error(`Profile ${profileId} not found`)
  const current = snap.data() as import('../engine/evaluationRegistry/evaluationRegistryTypes').EvaluationProfile

  if (isProfileImmutable(current.status)) {
    throw new Error(`Cannot edit a ${current.status} profile`)
  }

  await updateDoc(doc(db, COL.EVALUATION_PROFILES, profileId), {
    basketIds, updatedAt: serverTimestamp(), updatedBy: actorId || null,
  })
}

// ── ER-1: SMARTS template creation ───────────────────────────

/**
 * Create a draft profile pre-populated with the SMARTS 2026 starter template.
 * Admins must adjust weights, add/remove elements, and publish manually.
 * This is configuration only — no scoring or execution.
 */
export async function createSmarts2026DraftProfile(
  actorId:   string,
  actorRole: string,
): Promise<import('../engine/evaluationRegistry/evaluationRegistryTypes').EvaluationProfile> {
  const { createSmarts2026Template } = await import(
    '../engine/evaluationRegistry/evaluationRegistryTypes'
  )
  const template = createSmarts2026Template()
  return createEvaluationProfile(template, actorId, actorRole)
}

// ── Bulk draft cleanup ────────────────────────────────────────

/**
 * Archive a single DRAFT profile.
 * Drafts cannot be "deleted" (Firestore rule: allow delete: if false).
 * Archiving is the safe, reversible cleanup path.
 *
 * Throws if the profile is not a draft — never touches published profiles.
 */
export async function archiveDraftProfile(
  id:        string,
  actorId:   string,
  actorRole: string,
): Promise<void> {
  const snap = await getDoc(doc(db, COL.EVALUATION_PROFILES, id))
  if (!snap.exists()) throw new Error(`Profile ${id} not found`)
  const current = snap.data() as EvaluationProfile

  if (current.status !== 'draft') {
    throw new Error(
      `archiveDraftProfile: profile "${current.name}" is ${current.status}, not draft. ` +
      `Bulk cleanup only touches drafts.`
    )
  }

  const now = serverTimestamp()
  await updateDoc(doc(db, COL.EVALUATION_PROFILES, id), {
    status:     'archived',
    archivedAt: now,
    updatedAt:  now,
    updatedBy:  actorId || null,
  })

  await logAction({
    action:     AUDIT_ACTION.UPDATE,
    collection: COL.EVALUATION_PROFILES,
    docId:      id,
    userId:     actorId,
    userRole:   actorRole,
    before:     { status: 'draft' },
    after:      { status: 'archived', name: current.name },
  })
}

/**
 * Archive a list of draft profiles in sequence.
 * Skips non-draft profiles silently (logs a warning).
 * Uses Promise.allSettled so one failure does not block the rest.
 *
 * @returns Summary of archived ids and any errors.
 */
export async function archiveDraftProfiles(
  ids:       string[],
  actorId:   string,
  actorRole: string,
): Promise<{ archived: string[]; skipped: string[]; errors: string[] }> {
  const archived: string[] = []
  const skipped:  string[] = []
  const errors:   string[] = []

  const results = await Promise.allSettled(
    ids.map((id) => archiveDraftProfile(id, actorId, actorRole))
  )

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      archived.push(ids[i])
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
      if (msg.includes('not draft')) {
        skipped.push(ids[i])
      } else {
        errors.push(`${ids[i]}: ${msg}`)
      }
    }
  })

  return { archived, skipped, errors }
}

/**
 * Find duplicate draft profiles by name.
 * Returns groups where more than one draft shares the same name.
 * Within each group, profiles are sorted newest-first by createdAt.
 * The first item in each group is the "newest" (keep); the rest are candidates for cleanup.
 */
export function findDuplicateDraftGroups(
  profiles: EvaluationProfile[],
): Record<string, EvaluationProfile[]> {
  const drafts = profiles.filter((p) => p.status === 'draft')
  const byName: Record<string, EvaluationProfile[]> = {}

  for (const p of drafts) {
    const key = p.name?.trim() ?? '(unnamed)'
    if (!byName[key]) byName[key] = []
    byName[key].push(p)
  }

  // Sort each group newest-first, keep only groups with duplicates
  const duplicates: Record<string, EvaluationProfile[]> = {}
  for (const [name, group] of Object.entries(byName)) {
    if (group.length < 2) continue
    duplicates[name] = [...group].sort((a, b) => {
      const aTs = (a.createdAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0
      const bTs = (b.createdAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0
      return bTs - aTs  // newest first
    })
  }
  return duplicates
}
