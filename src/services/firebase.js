// ============================================================
// Firebase — Production Only
// No Demo mode, no Mock data
// ============================================================
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'
import {
  getFirestore, initializeFirestore,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore'

// ── Collection names ─────────────────────────────────────────
export const COL = {
  USERS:         'users',
  PHARMACIES:    'pharmacies',
  KPI_ENTRIES:   'kpi_entries',
  TARGETS:       'targets',
  AUDIT_LOGS:    'audit_logs',
  NOTIFICATIONS: 'notifications',
  LEADERBOARD:   'leaderboard',
}

// ── Config from .env ─────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(app)
setPersistence(auth, browserLocalPersistence).catch(() => {})

let db
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
} catch {
  db = getFirestore(app)
}
export { db }
export default app
