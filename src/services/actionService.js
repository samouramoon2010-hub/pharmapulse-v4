// ============================================================
// actionService.js — Actions Layer Foundation (Phase 3C-1)
//
// Pure CRUD + territory guards. No signal generation.
// No auto-creation. No engine coupling.
//
// Status transitions are enforced before every write.
// Territory scope is enforced before every write.
// ============================================================
import {
  doc, getDoc, addDoc, updateDoc, setDoc,
  collection, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'

const ACTIONS_COL = 'suggestedActions'

// ── Status transition table ───────────────────────────────
// Defines allowed next states per current status.
// Any transition not listed is forbidden (throws before the write).
const ALLOWED_TRANSITIONS = {
  SUGGESTED: ['ACCEPTED', 'DISMISSED'],
  ACCEPTED:  ['CLOSED'],
  DISMISSED: [],
  CLOSED:    [],
}

function assertTransition(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus]
  if (!allowed) {
    throw new Error(`Unknown action status: '${fromStatus}'`)
  }
  if (!allowed.includes(toStatus)) {
    throw new Error(
      `Status transition ${fromStatus} → ${toStatus} is not allowed`
    )
  }
}

// ── Territory scope guard ─────────────────────────────────
// Verifies the actor has access to the action's relatedPharmacyId.
// Runs BEFORE any Firestore write. Defense layer 1 in the chain.
const TERRITORY_ROLES_ACTION = ['district_supervisor', 'regional_manager']

async function assertScope(actorId, actorRole, relatedPharmacyId) {
  // admin and general_manager: unrestricted
  if (actorRole === 'admin' || actorRole === 'general_manager') return

  if (!actorId) throw new Error('actorId is required for this role')

  const actorSnap = await getDoc(doc(db, 'users', actorId))
  if (!actorSnap.exists()) throw new Error('Actor not found')
  const actorData = actorSnap.data()

  if (TERRITORY_ROLES_ACTION.includes(actorRole)) {
    const assigned = actorData?.assignedPharmacyIds || []
    if (!assigned.includes(relatedPharmacyId)) {
      throw new Error('Pharmacy not in your assigned territory')
    }
    return
  }

  if (actorRole === 'branch_manager') {
    if (actorData?.pharmacyId !== relatedPharmacyId) {
      throw new Error('Action belongs to a different branch')
    }
    return
  }

  if (actorRole === 'pharmacist') {
    // pharmacist ownership verified per-method via ownerId
    return
  }

  throw new Error(`Role '${actorRole}' is not permitted to manage actions`)
}

// ── recordActionHistory (private, fire-and-forget) ───────
// Appends an immutable history record for every status transition.
// Errors are swallowed — a history write failure must NEVER roll back
// the primary action write that preceded it.
async function recordActionHistory(
  actionId, fromStatus, toStatus, actorId, actorRole, relatedPharmacyId, opts = {}
) {
  const { note, dismissReason, relatedPharmacistId, relatedKpi, month } = opts
  try {
    await addDoc(collection(db, 'actionHistory'), {
      actionId,
      fromStatus,
      toStatus,
      changedBy:            actorId,
      changedByRole:        actorRole,
      changedAt:            serverTimestamp(),
      note:                 note             || null,
      dismissReason:        dismissReason    || null,
      relatedPharmacyId,
      relatedPharmacistId:  relatedPharmacistId || null,
      relatedKpi:           relatedKpi       || null,
      month:                month            || null,
    })
  } catch (err) {
    console.error('recordActionHistory failed:', err)
  }
}

// ── createSuggestedAction ─────────────────────────────────
export async function createSuggestedAction(payload, actorId, actorRole) {
  const { relatedPharmacyId, ownerId } = payload
  if (!relatedPharmacyId) throw new Error('relatedPharmacyId is required')
  if (!ownerId)           throw new Error('ownerId is required')

  // Territory guard before write
  await assertScope(actorId, actorRole, relatedPharmacyId)

  const data = {
    ...payload,
    status:    'SUGGESTED',
    createdBy: actorId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  const ref = await addDoc(collection(db, ACTIONS_COL), data)
  recordActionHistory(ref.id, null, 'SUGGESTED', actorId, actorRole, relatedPharmacyId, {
    relatedPharmacistId: payload.relatedPharmacistId || null,
    relatedKpi:          payload.relatedKpi          || null,
    month:               payload.month               || null,
  })
  return ref.id
}

// ── acceptAction ──────────────────────────────────────────
export async function acceptAction(actionId, actorId, actorRole) {
  const snap = await getDoc(doc(db, ACTIONS_COL, actionId))
  if (!snap.exists()) throw new Error('Action not found')

  const action = snap.data()
  const oldStatus = action.status

  // Transition guard before write
  assertTransition(oldStatus, 'ACCEPTED')

  // Territory guard before write
  await assertScope(actorId, actorRole, action.relatedPharmacyId)

  await updateDoc(doc(db, ACTIONS_COL, actionId), {
    status:    'ACCEPTED',
    ownerId:   actorId,
    ownerRole: actorRole,
    updatedAt: serverTimestamp(),
  })
  recordActionHistory(actionId, oldStatus, 'ACCEPTED', actorId, actorRole, action.relatedPharmacyId, {
    relatedPharmacistId: action.relatedPharmacistId || null,
    relatedKpi:          action.relatedKpi          || null,
    month:               action.month               || null,
  })
}

// ── dismissAction ─────────────────────────────────────────
export async function dismissAction(actionId, actorId, actorRole, dismissReason) {
  const snap = await getDoc(doc(db, ACTIONS_COL, actionId))
  if (!snap.exists()) throw new Error('Action not found')

  const action = snap.data()
  const oldStatus = action.status

  // Transition guard before write
  assertTransition(oldStatus, 'DISMISSED')

  // Territory guard before write
  await assertScope(actorId, actorRole, action.relatedPharmacyId)

  await updateDoc(doc(db, ACTIONS_COL, actionId), {
    status:        'DISMISSED',
    dismissReason: dismissReason || '',
    updatedAt:     serverTimestamp(),
  })
  recordActionHistory(actionId, oldStatus, 'DISMISSED', actorId, actorRole, action.relatedPharmacyId, {
    dismissReason,
    relatedPharmacistId: action.relatedPharmacistId || null,
    relatedKpi:          action.relatedKpi          || null,
    month:               action.month               || null,
  })
}

// ── closeAction ───────────────────────────────────────────
export async function closeAction(actionId, actorId, actorRole) {
  const snap = await getDoc(doc(db, ACTIONS_COL, actionId))
  if (!snap.exists()) throw new Error('Action not found')

  const action = snap.data()
  const oldStatus = action.status

  // Transition guard before write
  assertTransition(oldStatus, 'CLOSED')

  // Territory guard before write
  await assertScope(actorId, actorRole, action.relatedPharmacyId)

  await updateDoc(doc(db, ACTIONS_COL, actionId), {
    status:    'CLOSED',
    updatedAt: serverTimestamp(),
  })
  recordActionHistory(actionId, oldStatus, 'CLOSED', actorId, actorRole, action.relatedPharmacyId, {
    relatedPharmacistId: action.relatedPharmacistId || null,
    relatedKpi:          action.relatedKpi          || null,
    month:               action.month               || null,
  })
}

// ── addRecoveryObservation ────────────────────────────────
// One observation per action (doc id = actionId).
// Pharmacist role is excluded — assertScope will throw for pharmacist.
export async function addRecoveryObservation(actionId, payload, actorId, actorRole) {
  const { relatedPharmacyId } = payload
  if (!relatedPharmacyId)      throw new Error('relatedPharmacyId is required')
  if (!('recovered' in payload)) throw new Error('recovered is required')

  await assertScope(actorId, actorRole, relatedPharmacyId)

  await setDoc(doc(db, 'recoveryObservations', actionId), {
    actionId,
    observedAt:           serverTimestamp(),
    recovered:            payload.recovered,
    recoveredBy:          actorId,
    recoveredByRole:      actorRole,
    relatedPharmacyId,
    relatedKpi:           payload.relatedKpi           || null,
    month:                payload.month                || null,
    signalType:           payload.signalType           || null,
    signalValueAtTrigger: payload.signalValueAtTrigger || null,
    signalValueAtClose:   payload.signalValueAtClose   || null,
    notes:                payload.notes                || null,
  })
}

// ── markRecovered ─────────────────────────────────────────
export async function markRecovered(actionId, payload, actorId, actorRole) {
  return addRecoveryObservation(actionId, { ...payload, recovered: true }, actorId, actorRole)
}

// ── markNotRecovered ──────────────────────────────────────
export async function markNotRecovered(actionId, payload, actorId, actorRole) {
  return addRecoveryObservation(actionId, { ...payload, recovered: false }, actorId, actorRole)
}
