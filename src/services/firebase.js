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
  USERS:              'users',
  PHARMACIES:         'pharmacies',
  KPI_ENTRIES:        'kpi_entries',
  TARGETS:            'targets',
  AUDIT_LOGS:         'audit_logs',
  NOTIFICATIONS:      'notifications',
  LEADERBOARD:        'leaderboard',
  KPI_REGISTRY:       'kpi_registry',
  // KPI Registry Audit Trail — Milestone 3.5
  // One document per KPI change event. Append-only — no updates or deletes.
  KPI_AUDIT_LOGS:     'kpi_audit_logs',
  // Historical Data Layer V1
  DAILY_SUMMARIES:    'daily_summaries',
  MONTHLY_SUMMARIES:  'monthly_summaries',
  FORECAST_SNAPSHOTS: 'forecast_snapshots',
  RISK_SNAPSHOTS:     'risk_snapshots',
  RANKING_HISTORY:    'ranking_history',
  // Ingestion Pipeline
  STAGING_ENTRIES:    'staging_entries',
  // RBAC Phase 1 — Territory Infrastructure
  DISTRICTS:          'districts',
  REGIONS:            'regions',
  // Personal Targets — PT-1
  PERSONAL_TARGETS:   'personal_targets',
  // Evaluation Registry — ER-0
  EVALUATION_PROFILES: 'evaluation_profiles',
  // Evaluation Ledger — ER-2A
  EVALUATION_RESULTS:  'evaluation_results',
  // Branch Classification — RF-0
  CLASSIFICATIONS:     'classifications',
  // Ranking Snapshots — RF-1B
  RANKING_SNAPSHOTS:   'ranking_snapshots',
  // Demo Data — RF-0E
  DEMO_BATCHES:        'demo_batches',
  // V2 Shadow Evaluation Logs — diagnostic only, never affects official results
  SHADOW_EVALUATION_LOGS: 'shadow_evaluation_logs',
  // Runtime feature flags — read-only config for operational switches
  SYSTEM_CONFIG:       'system_config',
  // Data Exchange Studio — DX-2/DX-3 Import Job persistence
  IMPORT_JOBS:         'import_jobs',
}

// ── Config from .env ─────────────────────────────────────────
// Guarded because this file gets transitively bundled into the
// Netlify connector/MCP functions (they reuse Phase 1 adapters for
// validation logic — see connectorIntakeService.ts). Those functions
// never touch `auth`/`db` from here (they use the Admin SDK and their
// own repository instead), but esbuild's CJS bundling still evaluates
// this module's top-level code on cold start. `import.meta` is not
// available there, so `import.meta.env` is `undefined` — reading it
// directly used to crash the entire function before any request
// handling ran. This guard makes the module a safe no-op outside a
// real Vite/browser context, with zero behavior change for the actual
// client app (`hasViteEnv` is always true there).
const hasViteEnv = typeof import.meta !== 'undefined' && import.meta.env != null

const firebaseConfig = hasViteEnv ? {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
} : null

let app, auth, db
if (hasViteEnv) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  auth = getAuth(app)
  setPersistence(auth, browserLocalPersistence).catch(() => {})
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    db = getFirestore(app)
  }
}
export { auth, db }
export default app
