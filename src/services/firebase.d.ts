// ============================================================
// Type declaration for services/firebase.js (DX-2/DX-3 Closure Patch
// Part 1 — TypeScript closure).
//
// Path-specific, accurate to the real runtime exports — not a
// wildcard `declare module '*.js'`, not `any`. `db`/`auth`/the default
// export are typed against the official `firebase/*` SDK types (the
// values genuinely are SDK instances at runtime — initializeFirestore/
// getFirestore/getAuth/initializeApp all return these exact types).
// `COL` is a plain string-constant map; every key here matches a key
// actually defined in firebase.js — keep these in sync if a key is
// added there.
// ============================================================
import type { Firestore } from 'firebase/firestore'
import type { Auth } from 'firebase/auth'
import type { FirebaseApp } from 'firebase/app'

export declare const db: Firestore
export declare const auth: Auth

export declare const COL: {
  USERS:                  string
  PHARMACIES:              string
  KPI_ENTRIES:             string
  TARGETS:                 string
  AUDIT_LOGS:              string
  NOTIFICATIONS:           string
  LEADERBOARD:             string
  KPI_REGISTRY:            string
  KPI_AUDIT_LOGS:          string
  DAILY_SUMMARIES:         string
  MONTHLY_SUMMARIES:       string
  FORECAST_SNAPSHOTS:      string
  RISK_SNAPSHOTS:          string
  RANKING_HISTORY:         string
  STAGING_ENTRIES:         string
  DISTRICTS:               string
  REGIONS:                 string
  PERSONAL_TARGETS:        string
  EVALUATION_PROFILES:     string
  EVALUATION_RESULTS:      string
  CLASSIFICATIONS:         string
  RANKING_SNAPSHOTS:       string
  DEMO_BATCHES:            string
  SHADOW_EVALUATION_LOGS:  string
  SYSTEM_CONFIG:           string
  IMPORT_JOBS:             string
}

declare const app: FirebaseApp
export default app
