// ============================================================
// Admin-triggered manual Firestore backup export.
//
// Why this exists: Firestore's native `gcloud firestore export`
// (scheduled or one-off) requires GCP billing to be enabled on the
// project, which is currently OFF on pharmapulse-646de — see
// docs/production/FIRESTORE_BACKUP_QUICK_RUNBOOK.md. Until the
// owner enables billing, this endpoint is the realistic fallback:
// a read-only, on-demand, admin-only export of every business-data
// collection to a single downloadable JSON file. It never writes,
// deletes, or modifies anything.
//
// Auth: caller must send `Authorization: Bearer <Firebase ID token>`
// for a signed-in user whose `users/{uid}.role === 'admin'` — verified
// against Firestore itself via the Admin SDK, never trusted from the
// client. No connector/AI-agent path touches this function; it is a
// separate, human-triggered endpoint from the pharmapulse-connector/
// pharmapulse-mcp/pharmapulse-action functions.
// ============================================================

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import { BACKUP_COLLECTIONS } from '../../lib/backupCollections'

interface NetlifyEvent {
  httpMethod: string
  headers: Record<string, string | undefined>
}
interface NetlifyResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
}

let cachedApp: ReturnType<typeof initializeApp> | null = null

function getAdminApp() {
  if (cachedApp) return cachedApp
  if (getApps().length > 0) { cachedApp = getApps()[0] as any; return cachedApp! }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set')
  cachedApp = initializeApp({ credential: cert(JSON.parse(raw)) })
  return cachedApp
}

// Firestore Timestamps aren't plain-JSON-serializable — convert to
// ISO 8601 strings so the exported file is portable/human-readable.
// Recurses through arrays and nested maps (the only two structured
// value types Firestore documents in this app actually use).
function serializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(serializeValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serializeValue(v)]))
  }
  return value
}

async function exportAllCollections(db: Firestore): Promise<Record<string, unknown[]>> {
  const result: Record<string, unknown[]> = {}
  for (const name of BACKUP_COLLECTIONS) {
    const snap = await db.collection(name).get()
    result[name] = snap.docs.map((doc) => ({ id: doc.id, ...serializeValue(doc.data()) as object }))
  }
  return result
}

async function isRequestingUserAdmin(idToken: string, db: Firestore): Promise<{ ok: true; uid: string } | { ok: false; reason: string }> {
  let decoded
  try {
    decoded = await getAuth(getAdminApp()).verifyIdToken(idToken)
  } catch {
    return { ok: false, reason: 'Invalid or expired token' }
  }
  const userSnap = await db.collection('users').doc(decoded.uid).get()
  if (!userSnap.exists || userSnap.data()?.role !== 'admin') {
    return { ok: false, reason: 'User is not an admin' }
  }
  return { ok: true, uid: decoded.uid }
}

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  const jsonHeaders = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: jsonHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const authHeader = event.headers.authorization ?? event.headers.Authorization
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null
  if (!idToken) {
    return { statusCode: 401, headers: jsonHeaders, body: JSON.stringify({ error: 'Missing Authorization: Bearer <idToken> header' }) }
  }

  let db: Firestore
  try {
    db = getFirestore(getAdminApp())
  } catch (err: any) {
    return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: err?.message ?? 'Server not configured' }) }
  }

  const authResult = await isRequestingUserAdmin(idToken, db)
  if (!authResult.ok) {
    return { statusCode: 403, headers: jsonHeaders, body: JSON.stringify({ error: authResult.reason }) }
  }

  const collections = await exportAllCollections(db)
  const exportedAt = new Date().toISOString()
  const payload = {
    exportedAt,
    exportedBy: authResult.uid,
    collectionCount: BACKUP_COLLECTIONS.length,
    collections,
  }

  return {
    statusCode: 200,
    headers: {
      ...jsonHeaders,
      'Content-Disposition': `attachment; filename="pharmapulse-backup-${exportedAt.slice(0, 10)}.json"`,
    },
    body: JSON.stringify(payload),
  }
}
