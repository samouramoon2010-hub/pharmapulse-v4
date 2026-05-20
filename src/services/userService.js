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

// ── Create user: Auth + Firestore ─────────────────────────────
export async function createUser({
  displayName, email, password,
  role, status = 'active',
  pharmacyId = null, regionId = null,
  phone = '', employeeId = '',
  sendWelcomeEmail = true,
  actorId, actorRole,
}) {
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
    phone:        phone?.trim()      || '',
    employeeId:   employeeId?.trim() || '',
    createdAt:    serverTimestamp(),
    createdBy:    actorId || null,
    updatedAt:    serverTimestamp(),
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
  await updateDoc(doc(db, COL.USERS, uid), clean({ ...data, updatedAt: serverTimestamp() }))
  await logAction({ action: AUDIT_ACTION.UPDATE, collection: COL.USERS, docId: uid, userId: actorId, userRole: actorRole, before, after: data })
}

export async function toggleUserStatus(uid, actorId, actorRole) {
  const snap = await getDoc(doc(db, COL.USERS, uid))
  if (!snap.exists()) throw new Error('المستخدم غير موجود')
  const newActive = !snap.data().active
  await updateDoc(doc(db, COL.USERS, uid), {
    active: newActive, status: newActive ? 'active' : 'inactive', updatedAt: serverTimestamp(),
  })
  await logAction({ action: AUDIT_ACTION.UPDATE, collection: COL.USERS, docId: uid, userId: actorId, userRole: actorRole, after: { active: newActive } })
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
