// ============================================================
// Universal AI Intake — Phase 2 Production Repository
//
// firebase-admin-backed implementation of ConnectorRepository +
// the existing-reference-data reader used by connectorIntakeService.
// Lives OUTSIDE src/ deliberately — Vite's client build never scans
// this directory, so firebase-admin (Node-only: fs/net/gRPC) never
// reaches the browser bundle.
//
// Collection name strings are duplicated here rather than imported
// from src/services/dataExchange/dxFirebaseTypes.ts, because that
// file re-exports the CLIENT `db` singleton from src/services/
// firebase.js — importing it here would pull the client Firebase SDK
// into this Node-only module graph. These are plain string literals,
// not business logic, so duplicating them is safe and intentional.
//
// NOT initialized or exercised against real Firestore this session —
// see AI_INTAKE_PHASE_2_LIMITATIONS.md. As of Phase 2.1 the Admin-SDK
// write path itself (AdminFirestoreCommitExecutor, see
// netlify/lib/adminFirestoreCommitExecutor.ts) is fully
// implemented and covers all 8 domains; execute() is still gated
// behind assertProductionWriteAllowed() regardless, which is never
// enabled this session — see AI_INTAKE_PHASE_2_1_TEST_REPORT.md.
// ============================================================

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import type { ConnectorRepository, StoredIntakeSession } from '../../src/services/connector/repositories/connectorRepository'
import type { IntakeExistingData } from '../../src/services/dataExchange/intakeDomainRegistry'
import type { IdempotencyRecord } from '../../src/services/connector/connectorIdempotencyService'
import type { ConnectorAuditRecord } from '../../src/services/connector/connectorAuditService'

const COL = {
  REGIONS: 'regions', DISTRICTS: 'districts', PHARMACIES: 'pharmacies', USERS: 'users',
  KPI_REGISTRY: 'kpi_registry', IMPORT_JOBS: 'import_jobs',
  CONNECTOR_IDEMPOTENCY: 'connector_idempotency',
  CONNECTOR_REQUESTS_SEEN: 'connector_requests_seen',
  CONNECTOR_RATE_LIMITS: 'connector_rate_limits',
  CONNECTOR_APPROVALS_CONSUMED: 'connector_approvals_consumed',
  CONNECTOR_AUDIT_LOGS: 'connector_audit_logs',
}

let cachedApp: ReturnType<typeof initializeApp> | null = null

/** Lazily initializes the Admin SDK from a service-account JSON held
 *  ONLY in an environment variable (Netlify dashboard secret) — never
 *  a file, never committed. Throws (fail closed) if unset, rather
 *  than silently falling back to any default credential lookup. */
function getAdminApp() {
  if (cachedApp) return cachedApp
  if (getApps().length > 0) { cachedApp = getApps()[0] as any; return cachedApp! }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — connector cannot initialize the Admin SDK')
  }
  const serviceAccount = JSON.parse(raw)
  cachedApp = initializeApp({ credential: cert(serviceAccount) })
  return cachedApp
}

function getDb(): Firestore {
  return getFirestore(getAdminApp())
}

/** The Admin SDK rejects `undefined` field values outright (unlike
 *  the in-memory test repository, which never validates this) — every
 *  optional field on a ConnectorAuditRecord/StoredIntakeSession/
 *  IdempotencyRecord (e.g. `sessionId` on a reference-data-only audit
 *  entry, `approvedAt`/`executedAt` before those events happen) must
 *  be stripped before a write, not passed through as literal
 *  `undefined`. Discovered against real Firestore during Phase 2.3
 *  external verification — the in-memory repository's tests never
 *  caught this because plain JS objects don't enforce it. */
function clean<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

/** Exposed so pharmapulse-connector.ts can wire the same Admin SDK
 *  Firestore instance into createAdminFirestoreCommitExecutor() —
 *  one Admin app per function invocation, shared by the repository
 *  and the commit executor, never a second independent connection. */
export function getAdminFirestore(): Firestore {
  return getDb()
}

export function createFirestoreConnectorRepository(): ConnectorRepository {
  const db = getDb()

  return {
    async saveSession(session: StoredIntakeSession) {
      await db.collection(COL.IMPORT_JOBS).doc(session.job.jobId).set(clean(session.job as any), { merge: true })
      const batch = db.batch()
      const rowsRef = db.collection(COL.IMPORT_JOBS).doc(session.job.jobId).collection('rows')
      for (const row of session.rows) batch.set(rowsRef.doc((row as any).rowId), clean(row as any), { merge: true })
      await batch.commit()
    },
    async getSession(sessionId) {
      const jobSnap = await db.collection(COL.IMPORT_JOBS).doc(sessionId).get()
      if (!jobSnap.exists) return null
      const rowsSnap = await db.collection(COL.IMPORT_JOBS).doc(sessionId).collection('rows').get()
      return { job: jobSnap.data() as any, rows: rowsSnap.docs.map((d) => d.data() as any) }
    },
    async listSessions(filter) {
      let query = db.collection(COL.IMPORT_JOBS) as any
      if (filter?.sourceTypePrefix) {
        // Firestore has no native "startsWith" on an arbitrary string field
        // beyond a range query; connector source types are a small closed
        // enum (see connectorTypes.ts ConnectorSourceType), so exact-match
        // is sufficient here rather than a range-query workaround.
      }
      const snap = await query.get()
      const jobs = snap.docs.map((d: any) => d.data())
      const filtered = filter?.sourceTypePrefix ? jobs.filter((j: any) => j.intakeSourceType?.startsWith(filter.sourceTypePrefix)) : jobs
      return filtered.map((job: any) => ({ job, rows: [] }))
    },

    async hasSeenRequestId(clientId, requestId) {
      const snap = await db.collection(COL.CONNECTOR_REQUESTS_SEEN).doc(`${clientId}_${requestId}`).get()
      if (!snap.exists) return false
      const data = snap.data() as any
      return new Date(data.expiresAt).getTime() > Date.now()
    },
    async recordRequestId(clientId, requestId, expiresAt) {
      await db.collection(COL.CONNECTOR_REQUESTS_SEEN).doc(`${clientId}_${requestId}`).set({ clientId, requestId, expiresAt })
    },

    async getIdempotencyRecord(key) {
      const snap = await db.collection(COL.CONNECTOR_IDEMPOTENCY).doc(key).get()
      return snap.exists ? (snap.data() as IdempotencyRecord) : null
    },
    async putIdempotencyRecord(record) {
      await db.collection(COL.CONNECTOR_IDEMPOTENCY).doc(record.key).set(clean(record as any))
    },

    async incrementAndGet(bucketKey, windowMs, now) {
      const ref = db.collection(COL.CONNECTOR_RATE_LIMITS).doc(bucketKey)
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const data = snap.exists ? (snap.data() as any) : null
        if (!data || now - data.windowStart >= windowMs) {
          tx.set(ref, { count: 1, windowStart: now })
          return 1
        }
        tx.update(ref, { count: FieldValue.increment(1) })
        return data.count + 1
      })
    },

    async isApprovalConsumed(approvalId) {
      const snap = await db.collection(COL.CONNECTOR_APPROVALS_CONSUMED).doc(approvalId).get()
      return snap.exists
    },
    async markApprovalConsumed(approvalId) {
      await db.collection(COL.CONNECTOR_APPROVALS_CONSUMED).doc(approvalId).set({ consumedAt: new Date().toISOString() })
    },

    async writeAuditRecord(record: ConnectorAuditRecord) {
      await db.collection(COL.CONNECTOR_AUDIT_LOGS).add(clean(record as any))
    },

    async getReferenceRecords(referenceType, opts) {
      const collectionByType: Record<string, string> = {
        regions: COL.REGIONS, groups: COL.DISTRICTS, pharmacies: COL.PHARMACIES,
        users: COL.USERS, kpi_definitions: COL.KPI_REGISTRY,
      }
      const collectionName = collectionByType[referenceType]
      if (!collectionName) return []

      let query: FirebaseFirestore.Query = db.collection(collectionName)
      if (opts.exactCode) query = query.where('code', '==', opts.exactCode)
      const snap = await query.limit(opts.limit ?? 50).get()
      let records = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      if (opts.searchText) {
        const needle = opts.searchText.toLowerCase()
        records = records.filter((r) => JSON.stringify(r).toLowerCase().includes(needle))
      }
      return records
    },
  }
}

/** Admin-SDK equivalent of fetchIntakeExistingData() (client-SDK,
 *  src/services/dataExchange/intakeDomainRegistry.ts) — same output
 *  shape, different read mechanics. This IS the "thin I/O shim"
 *  distinction documented in AI_INTAKE_PHASE_2_ARCHITECTURE.md: field
 *  mapping/validation logic stays 100% in the shared Phase 1 adapters;
 *  only the terminal Firestore read differs by runtime. */
export async function fetchExistingDataAdmin(): Promise<IntakeExistingData> {
  const db = getDb()
  const [regionsSnap, districtsSnap, pharmaciesSnap, usersSnap, kpiRegistrySnap] = await Promise.all([
    db.collection(COL.REGIONS).get(),
    db.collection(COL.DISTRICTS).get(),
    db.collection(COL.PHARMACIES).get(),
    db.collection(COL.USERS).get(),
    db.collection(COL.KPI_REGISTRY).get(),
  ])

  const regions = regionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  const groups = districtsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  const branches = pharmaciesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))

  const pharmacistsByEmployeeId = new Map<string, any>()
  const pharmacistsByEmail = new Map<string, any>()
  const primaryAssignmentByEmployeeId = new Map<string, string>()
  for (const doc of usersSnap.docs) {
    const data = doc.data() as any
    const employeeId = data.employeeId?.trim()
    if (!employeeId || data.authStatus === 'CLAIMED') continue
    const record = {
      id: doc.id, employeeId, email: data.email?.toLowerCase() || null,
      role: data.role || 'pharmacist', pharmacyId: data.pharmacyId ?? null,
      authStatus: data.authStatus ?? 'ACTIVE', hasIdentityAmbiguity: false,
      active: data.active ?? true,
    }
    pharmacistsByEmployeeId.set(employeeId, record)
    if (record.email) pharmacistsByEmail.set(record.email, record)
    if (record.pharmacyId) primaryAssignmentByEmployeeId.set(employeeId, record.pharmacyId)
  }

  const kpiRegistry: Record<string, any> = {}
  for (const doc of kpiRegistrySnap.docs) kpiRegistry[doc.id] = { key: doc.id, ...(doc.data() as any) }

  return {
    onboarding: { groups, regions, branches, pharmacistsByEmployeeId, pharmacistsByEmail, primaryAssignmentByEmployeeId },
    regions: regions.map((r: any) => ({ id: r.id, code: r.code, name: r.name, active: r.active !== false })),
    kpiRegistry,
  }
}
