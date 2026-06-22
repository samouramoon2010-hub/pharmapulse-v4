// ============================================================
// Auth Store — Production Only
// ============================================================
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, updatePassword,
  EmailAuthProvider, reauthenticateWithCredential,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
} from 'firebase/auth'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, COL } from '../services/firebase'
import { logAction, AUDIT_ACTION } from '../services/auditService'

// Fields a user may update on their own profile via updateProfile().
// Sensitive fields (role, active, pharmacyId, regionIds, districtId,
// supervisorId, managerId) are intentionally absent — admin uses
// userService.updateUserProfile() for those.
const SELF_UPDATE_WHITELIST = ['displayName', 'phone']

const AUTH_ERROR_MAP = {
  'auth/user-not-found':         'البريد الإلكتروني غير مسجّل',
  'auth/wrong-password':         'كلمة المرور غير صحيحة',
  'auth/invalid-credential':     'البريد أو كلمة المرور غير صحيحة',
  'auth/too-many-requests':      'تم تجاوز عدد المحاولات — انتظر قليلاً',
  'auth/network-request-failed': 'تحقق من الاتصال بالإنترنت',
  'auth/email-already-in-use':   'البريد مستخدم مسبقاً',
  'auth/weak-password':          'كلمة المرور ضعيفة (6 أحرف كحد أدنى)',
  'no-profile':                  'الحساب غير مرتبط بملف مستخدم — تواصل مع الإدارة',
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user:        null,
      userProfile: null,
      loading:     true,
      error:       null,
      _loggingIn:  false,   // true while login() is in-flight; suppresses duplicate onAuthStateChanged fetch

      init: () => {
        const unsub = onAuthStateChanged(auth, async (fbUser) => {
          // Skip if login() is already fetching the profile — avoids two concurrent
          // _fetchProfile() Firestore reads for the same UID and a non-deterministic
          // set() race where onAuthStateChanged could overwrite login()'s result.
          if (get()._loggingIn) return
          if (fbUser) {
            const profile = await get()._fetchProfile(fbUser.uid)
            set({ user: { uid: fbUser.uid, email: fbUser.email }, userProfile: profile, loading: false })
          } else {
            set({ user: null, userProfile: null, loading: false })
          }
        })
        return unsub
      },

      _fetchProfile: async (uid) => {
        try {
          const snap = await getDoc(doc(db, COL.USERS, uid))
          // Always include both 'id' (Firestore doc id = Auth uid) and
          // explicit 'uid' field so all consumers resolve correctly regardless
          // of whether the Firestore user document stores a 'uid' field.
          return snap.exists() ? { id: snap.id, uid: snap.id, ...snap.data() } : null
        } catch { return null }
      },

      login: async (email, password, rememberMe = true) => {
        // Do NOT set loading:true here — that would unmount <BrowserRouter> (before Fix 1 it
        // also silently dropped the navigate() call). LoginPage owns the submitting spinner.
        set({ error: null, _loggingIn: true })
        try {
          await setPersistence(auth,
            rememberMe ? browserLocalPersistence : browserSessionPersistence
          )
          const { user } = await signInWithEmailAndPassword(auth, email, password)
          const profile  = await get()._fetchProfile(user.uid)
          if (!profile) throw new Error('no-profile')
          await updateDoc(doc(db, COL.USERS, user.uid), { lastLoginAt: serverTimestamp() }).catch(() => {})
          await logAction({ action: AUDIT_ACTION.LOGIN, collection: COL.USERS,
            docId: user.uid, userId: user.uid, userRole: profile.role, meta: { email } })
          set({ user: { uid: user.uid, email: user.email }, userProfile: profile, _loggingIn: false })
          return profile
        } catch (err) {
          const msg = AUTH_ERROR_MAP[err.code] || AUTH_ERROR_MAP[err.message] || err.message || 'خطأ في تسجيل الدخول'
          set({ error: msg, _loggingIn: false })
          throw new Error(msg)
        }
      },

      logout: async () => {
        const { userProfile } = get()
        await logAction({ action: AUDIT_ACTION.LOGOUT, collection: COL.USERS,
          userId: userProfile?.uid, userRole: userProfile?.role })
        await signOut(auth).catch(() => {})
        set({ user: null, userProfile: null, error: null })
      },

      resetPassword: async (email) => {
        await sendPasswordResetEmail(auth, email)
      },

      changePassword: async (currentPw, newPw) => {
        const fbUser     = auth.currentUser
        const credential = EmailAuthProvider.credential(fbUser.email, currentPw)
        await reauthenticateWithCredential(fbUser, credential)
        await updatePassword(fbUser, newPw)
      },

      updateProfile: async (data) => {
        const { user, userProfile } = get()
        if (!user) return
        const safe = Object.fromEntries(
          Object.entries(data).filter(([k]) => SELF_UPDATE_WHITELIST.includes(k))
        )
        await updateDoc(doc(db, COL.USERS, user.uid), { ...safe, updatedAt: serverTimestamp() })
        set({ userProfile: { ...userProfile, ...safe } })
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'pharma-auth-v4',
      partialize: (s) => ({
        userProfile: s.userProfile,
        user: s.user ? { uid: s.user.uid, email: s.user.email } : null,
      }),
    }
  )
)
