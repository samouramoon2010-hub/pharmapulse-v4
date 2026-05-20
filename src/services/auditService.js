// ============================================================
// Audit Service — Production Firestore
// ============================================================
import {
  collection, addDoc, serverTimestamp,
  query, orderBy, limit, onSnapshot, where,
} from 'firebase/firestore'
import { db, COL } from './firebase'

export const AUDIT_ACTION = {
  LOGIN:        'login',
  LOGOUT:       'logout',
  CREATE:       'create',
  UPDATE:       'update',
  DELETE:       'delete',
  APPROVE:      'approve',
  REJECT:       'reject',
  IMPORT:       'import',
  BULK_APPROVE: 'bulk_approve',
}

export async function logAction({
  action, collection: col, docId,
  userId, userRole, before = null, after = null, meta = {},
}) {
  try {
    await addDoc(collection(db, COL.AUDIT_LOGS), {
      action,
      collection: col || null,
      docId:      docId || null,
      userId:     userId || null,
      userRole:   userRole || null,
      before:     before || null,
      after:      after  || null,
      meta:       meta   || {},
      timestamp:  serverTimestamp(),
    })
  } catch (e) {
    console.warn('[auditService] Failed to log:', e.message)
  }
}

export function subscribeAuditLogs({ n = 100, userId: filterUser, col: filterCol } = {}) {
  return (callback) => {
    const q = query(
      collection(db, COL.AUDIT_LOGS),
      orderBy('timestamp', 'desc'),
      limit(n),
    )
    return onSnapshot(q, (snap) => {
      let logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      if (filterUser) logs = logs.filter((l) => l.userId === filterUser)
      if (filterCol)  logs = logs.filter((l) => l.collection === filterCol)
      callback(logs)
    })
  }
}
