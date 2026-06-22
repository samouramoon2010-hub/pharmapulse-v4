// ============================================================
// User Service — Production Firebase Auth + Firestore
//
// createUser:
//   1. Firebase Identity Toolkit REST API → creates Auth account → returns UID
//   2. setDoc(users/{UID}) in Firestore with same UID
//   3. Admin session is NOT affected (returnSecureToken not used)
// ============================================================
import {
  doc, setDoc, updateDoc, getDoc, getDocs,
  collection, query, where, serverTimestamp,
} from 'firebase/firestore'
import { sendPasswordResetEmail } from 'firebase/auth'
import { db, auth, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'
import { recomputeAssignedPharmacyIds } from './territorySync'

const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

// ── Firebase Auth REST API ────────────────────────────────────
async function createFirebaseAuthUser(email, password) {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  if (!apiKey || apiKey === 'your-api-key') {
    throw new Error('VITE_FIREBASE_API_KEY غير مضبوط في ملف .env')
  }

  const res  = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, returnSecureToken: true }),
    }
  )
  const data = await res.json()

  if (!res.ok || !data?.localId) {
    const MAP = {
      EMAIL_EXISTS:             'البريد الإلكتروني مسجّل مسبقاً في Firebase Auth',
      INVALID_EMAIL:            'البريد الإلكتروني غير صالح',
      WEAK_PASSWORD:            'كلمة المرور ضعيفة — 6 أحرف على الأقل',
      OPERATION_NOT_ALLOWED:    'تسجيل Email/Password غير مفعّل في Firebase Console',
      TOO_MANY_ATTEMPTS_TRY_LATER: 'محاولات كثيرة — انتظر ثم أعد المحاولة',
    }
    const code = data?.error?.message || 'UNKNOWN'
    throw new Error(MAP[code] || `Firebase Auth Error: ${code}`)
  }
  return data.localId
}


// ── RBAC Phase 0: compute initial accessScopes from role + pharmacyId ──────
// This is advisory-only in Phase 0 — scopes are stored but not enforced.
// The scope engine and enforcement are built in future phases.
function computeInitialScopes(role, pharmacyId) {
  if (role === 'admin') return ['tenant:default']
  if (pharmacyId)       return [`store:${pharmacyId}`]
  return []
}

// ── Create user: Auth + Firestore ─────────────────────────────
export async function createUser({
  displayName, email, password,
  role, status = 'active',
  pharmacyId = null, regionId = null,
  // RBAC Phase 1: optional territory fields
  districtId = null, regionIds = null,
  // Phase 1B: cache fields — stored but not yet consumed by any runtime logic.
  // recomputeAssignedPharmacyIds() (Phase 1B-3) will populate these after territory assignment.
  assignedPharmacyIds = null,
  assignedDistrictIds = [],
  phone = '', employeeId = '',
  sendWelcomeEmail = true,
  actorId, actorRole,
}) {
  // ── 3A-1C1: territory role guard ─────────────────────────────
  // Must run BEFORE createFirebaseAuthUser to prevent orphan Auth accounts
  // when a forbidden role or out-of-scope pharmacy is detected.
  // Service layer is the final enforcement point before Firebase Auth is touched.
  const TERRITORY_ROLES_SVC = ['district_supervisor', 'regional_manager']
  const SUPERVISOR_CREATABLE_SVC = ['pharmacist', 'manager', 'branch_manager']
  if (TERRITORY_ROLES_SVC.includes(actorRole)) {
    if (!SUPERVISOR_CREATABLE_SVC.includes(role)) {
      throw new Error(`Role '${role}' cannot be created by ${actorRole}`)
    }
    if (!pharmacyId) {
      throw new Error('pharmacyId is required for territory role user creation')
    }
    if (!actorId) {
      throw new Error('actorId is required for territory role user creation')
    }
    const actorSnap = await getDoc(doc(db, COL.USERS, actorId))
    const actorAssigned = actorSnap.data()?.assignedPharmacyIds || []
    if (!actorAssigned.includes(pharmacyId)) {
      throw new Error('Branch not in your assigned territory')
    }
  }

  // Step 1: Auth
  const uid = await createFirebaseAuthUser(email, password)

  // Step 2: Firestore
  const profile = clean({
    displayName:  displayName.trim(),
    email:        email.trim().toLowerCase(),
    role,
    status,
    active:       status === 'active',
    pharmacyId:   pharmacyId || null,
    regionId:     regionId   || null,
    // ── RBAC Phase 1: territory assignment fields ────────────
    // Optional — only populated for district_supervisor and regional_manager.
    // Existing users without these fields remain valid (treated as null/[]).
    districtId:   districtId || null,
    regionIds:    regionIds  || [],
    // ── Phase 1B: territory cache fields ────────────────────
    // Stored on user documents; populated by recomputeAssignedPharmacyIds() in Phase 1B-3.
    // null = "all access" sentinel (admin/GM) or "not applicable" (branch/pharmacist).
    // Not consumed by any runtime logic until Phase 2 scope resolver is wired in.
    assignedPharmacyIds: assignedPharmacyIds,
    assignedDistrictIds: assignedDistrictIds || [],
    phone:        phone?.trim()      || '',
    employeeId:   employeeId?.trim() || '',
    createdAt:    serverTimestamp(),
    createdBy:    actorId || null,
    updatedAt:    serverTimestamp(),
    // ── RBAC Phase 0 fields ──────────────────────────────────
    // Advisory-only in Phase 0: stored but not yet enforced.
    // Missing on existing documents — treated as defaults by readers.
    tenantId:        'default',
    accessScopes:    computeInitialScopes(role, pharmacyId),
    temporaryScopes: [],
    scopeVersion:    1,
  })

  try {
    await setDoc(doc(db, COL.USERS, uid), profile)
  } catch (e) {
    console.error(`[userService] Auth created UID:${uid} but Firestore failed:`, e.message)
    throw new Error(`Auth OK (UID:${uid}) — Firestore فشل: ${e.message}`)
  }

  if (sendWelcomeEmail) {
    await sendPasswordResetEmail(auth, email).catch(() => {})
  }

  await logAction({
    action: AUDIT_ACTION.CREATE, collection: COL.USERS,
    docId: uid, userId: actorId, userRole: actorRole, after: { ...profile, uid },
  })
  return { uid, ...profile }
}

export async function updateUserProfile(uid, data, actorId, actorRole) {
  const before = (await getDoc(doc(db, COL.USERS, uid))).data() || null

  // 3A-1C2: territory roles may only edit displayName/phone/employeeId of users
  // inside their assignedPharmacyIds. Strip any forbidden fields before writing.
  const TERRITORY_ROLES_UPDATE = ['district_supervisor', 'regional_manager']
  if (TERRITORY_ROLES_UPDATE.includes(actorRole)) {
    const targetPharmacyId = before?.pharmacyId
    if (!targetPharmacyId) throw new Error('Target user has no pharmacyId — cannot be edited by territory role')
    if (!actorId) throw new Error('actorId is required for territory role user update')
    const actorSnap = await getDoc(doc(db, COL.USERS, actorId))
    const actorAssigned = actorSnap.data()?.assignedPharmacyIds || []
    if (!actorAssigned.includes(targetPharmacyId)) throw new Error('User not in your assigned territory')
    const ALLOWED_UPDATE_FIELDS = ['displayName', 'phone', 'employeeId']
    data = Object.fromEntries(Object.entries(data).filter(([k]) => ALLOWED_UPDATE_FIELDS.includes(k)))
  }

  await updateDoc(doc(db, COL.USERS, uid), clean({ ...data, updatedAt: serverTimestamp() }))
  await logAction({ action: AUDIT_ACTION.UPDATE, collection: COL.USERS, docId: uid, userId: actorId, userRole: actorRole, before, after: data })

  // Best-effort: recompute territory cache when any field that determines access scope changes.
  // Failure is logged but must not fail the profile update itself.
  const TERRITORY_FIELDS = ['role', 'districtId', 'regionIds']
  if (TERRITORY_FIELDS.some((f) => f in data)) {
    recomputeAssignedPharmacyIds(uid, actorId, actorRole).catch((e) =>
      console.error('[userService] recompute assignedPharmacyIds failed for uid', uid, e),
    )
  }
}

export async function toggleUserStatus(uid, actorId, actorRole) {
  const snap = await getDoc(doc(db, COL.USERS, uid))
  if (!snap.exists()) throw new Error('المستخدم غير موجود')

  // 3A-1C3: territory roles may only toggle pharmacist/manager/branch_manager
  // inside their assignedPharmacyIds. Admin/role/pharmacyId never changed here.
  const TERRITORY_ROLES_TOGGLE = ['district_supervisor', 'regional_manager']
  const SUPERVISOR_TOGGLEABLE_SVC = ['pharmacist', 'manager', 'branch_manager']
  if (TERRITORY_ROLES_TOGGLE.includes(actorRole)) {
    const targetRole = snap.data().role
    if (!SUPERVISOR_TOGGLEABLE_SVC.includes(targetRole)) {
      throw new Error(`Role '${targetRole}' cannot be toggled by ${actorRole}`)
    }
    if (!actorId) throw new Error('actorId is required for territory role toggle')
    const actorSnap = await getDoc(doc(db, COL.USERS, actorId))
    const actorAssigned = actorSnap.data()?.assignedPharmacyIds || []
    const targetPharmacyId = snap.data().pharmacyId
    if (!actorAssigned.includes(targetPharmacyId)) {
      throw new Error('User not in your assigned territory')
    }
  }

  const newActive = !snap.data().active
  await updateDoc(doc(db, COL.USERS, uid), {
    active: newActive, status: newActive ? 'active' : 'inactive', updatedAt: serverTimestamp(),
  })
  await logAction({ action: AUDIT_ACTION.UPDATE, collection: COL.USERS, docId: uid, userId: actorId, userRole: actorRole, after: { active: newActive } })
}

export async function transferUser(uid, destinationPharmacyId, actorId, actorRole) {
  const snap = await getDoc(doc(db, COL.USERS, uid))
  if (!snap.exists()) throw new Error('المستخدم غير موجود')

  // 3A-1C4: territory roles may only transfer pharmacist/manager/branch_manager
  // between branches within their assignedPharmacyIds. Source and destination
  // must both be within the actor's assigned territory.
  const TERRITORY_ROLES_TRANSFER = ['district_supervisor', 'regional_manager']
  const SUPERVISOR_TRANSFERABLE_SVC = ['pharmacist', 'manager', 'branch_manager']
  if (TERRITORY_ROLES_TRANSFER.includes(actorRole)) {
    const targetRole = snap.data().role
    if (!SUPERVISOR_TRANSFERABLE_SVC.includes(targetRole)) {
      throw new Error(`Role '${targetRole}' cannot be transferred by ${actorRole}`)
    }
    if (!actorId) throw new Error('actorId is required for territory role transfer')
    const actorSnap = await getDoc(doc(db, COL.USERS, actorId))
    const actorAssigned = actorSnap.data()?.assignedPharmacyIds || []
    const sourcePharmacyId = snap.data().pharmacyId
    if (!actorAssigned.includes(sourcePharmacyId)) {
      throw new Error('User not in your assigned territory')
    }
    if (!actorAssigned.includes(destinationPharmacyId)) {
      throw new Error('Destination branch not in your assigned territory')
    }
  }

  await updateDoc(doc(db, COL.USERS, uid), {
    pharmacyId: destinationPharmacyId, updatedAt: serverTimestamp(),
  })
  await logAction({ action: AUDIT_ACTION.UPDATE, collection: COL.USERS, docId: uid, userId: actorId, userRole: actorRole, after: { pharmacyId: destinationPharmacyId } })
  recomputeAssignedPharmacyIds(uid, actorId, actorRole).catch((e) =>
    console.error('[userService] recompute assignedPharmacyIds failed for uid', uid, e),
  )
}

export async function promoteBranchManager(uid, newRole, actorId, actorRole) {
  const snap = await getDoc(doc(db, COL.USERS, uid))
  if (!snap.exists()) throw new Error('المستخدم غير موجود')

  // 3A-1C5: only pharmacist ↔ branch_manager transitions are allowed.
  // Territory actors must also verify target is inside their assignedPharmacyIds.
  const TERRITORY_ROLES_PROMOTE = ['district_supervisor', 'regional_manager']
  const SUPERVISOR_PROMOTABLE_SVC = ['pharmacist', 'branch_manager']
  const targetRole = snap.data().role
  if (!SUPERVISOR_PROMOTABLE_SVC.includes(targetRole)) {
    throw new Error(`Role '${targetRole}' cannot be promoted/demoted`)
  }
  if (!SUPERVISOR_PROMOTABLE_SVC.includes(newRole)) {
    throw new Error(`Target role '${newRole}' is not allowed for this operation`)
  }
  if (TERRITORY_ROLES_PROMOTE.includes(actorRole)) {
    if (!actorId) throw new Error('actorId is required for territory role promotion')
    const actorSnap = await getDoc(doc(db, COL.USERS, actorId))
    const actorAssigned = actorSnap.data()?.assignedPharmacyIds || []
    const targetPharmacyId = snap.data().pharmacyId
    if (!actorAssigned.includes(targetPharmacyId)) {
      throw new Error('User not in your assigned territory')
    }
  }

  await updateDoc(doc(db, COL.USERS, uid), {
    role: newRole, updatedAt: serverTimestamp(),
  })
  await logAction({ action: AUDIT_ACTION.UPDATE, collection: COL.USERS, docId: uid, userId: actorId, userRole: actorRole, after: { role: newRole } })
  recomputeAssignedPharmacyIds(uid, actorId, actorRole).catch((e) =>
    console.error('[userService] recompute assignedPharmacyIds failed for uid', uid, e),
  )
}

export async function emailExistsInFirestore(email) {
  const q = query(collection(db, COL.USERS), where('email', '==', email.toLowerCase()))
  return !(await getDocs(q)).empty
}

export async function employeeIdExists(employeeId, excludeUid = null) {
  const trimmed = employeeId?.trim()
  if (!trimmed) return false
  const q    = query(collection(db, COL.USERS), where('employeeId', '==', trimmed))
  const snap = await getDocs(q)
  if (snap.empty) return false
  if (excludeUid && snap.docs.length === 1 && snap.docs[0].id === excludeUid) return false
  return true
}

// ── Get users by pharmacy (PT-1 — personal targets) ──────────
// Returns all active pharmacist users assigned to a given pharmacy.
// Used by the Personal Targets page to build the allocation table.
export async function getUsersByPharmacy(pharmacyId) {
  const { collection, query, where, getDocs } = await import('firebase/firestore')
  const { db, COL } = await import('./firebase')
  const q    = query(
    collection(db, COL.USERS),
    where('pharmacyId', '==', pharmacyId),
    where('active', '==', true),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
