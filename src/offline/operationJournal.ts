// ============================================================
// Operation Journal — Offline First Bundle, Phase B
//
// IMPORTANT — this is NOT a write queue. It does not execute,
// replay, or retry any write. The actual write execution, queuing,
// retry, and backoff for every Firestore call in this app is
// already handled by the Firestore SDK's own persistentLocalCache
// (see src/services/firebase.js) — that IndexedDB-backed mechanism
// is the durable queue. Building a second one here would create two
// systems racing to perform the same write (the exact "duplicate
// writes" risk this bundle's safety rules forbid).
//
// What this module DOES do: keep a small IndexedDB-backed journal of
// *metadata* about write attempts (id, type, label, status,
// timestamps) purely so the UI (pending-changes badge, sync status
// indicator) has something to read that survives a page refresh.
// The journal is written to by syncTracker.ts as a side-effect of
// the real write promise's lifecycle — it never decides whether a
// write happens, only records what already did/will happen.
//
// Status values: 'pending' | 'syncing' | 'synced' | 'failed'
// ============================================================

export type OperationStatus = 'pending' | 'syncing' | 'synced' | 'failed'

export interface JournalEntry {
  id: string
  type: string
  label: string
  status: OperationStatus
  createdAt: number
  updatedAt: number
  retryCount: number
  errorMessage?: string
}

const DB_NAME    = 'pharmapulse-offline'
const DB_VERSION = 1
const STORE_NAME = 'operation_journal'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror   = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => T
): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, mode)
      const store = tx.objectStore(STORE_NAME)
      const result = fn(store)
      tx.oncomplete = () => resolve(result)
      tx.onerror    = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** Adds a new journal entry. Safe no-op if IndexedDB is unavailable. */
export async function addJournalEntry(entry: JournalEntry): Promise<void> {
  await withStore('readwrite', (store) => { store.put(entry) })
}

/** Updates the status (and optional error) of an existing entry. */
export async function updateJournalEntry(
  id: string,
  patch: Partial<Pick<JournalEntry, 'status' | 'retryCount' | 'errorMessage' | 'updatedAt'>>
): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const existing = getReq.result as JournalEntry | undefined
        if (existing) {
          store.put({ ...existing, ...patch, updatedAt: patch.updatedAt ?? Date.now() })
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror    = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** Returns all journal entries, newest first. Empty array if unavailable. */
export async function listJournalEntries(): Promise<JournalEntry[]> {
  const result = await withStore('readonly', (store) => {
    return new Promise<JournalEntry[]>((resolve) => {
      const entries: JournalEntry[] = []
      const cursorReq = store.openCursor()
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor) {
          entries.push(cursor.value as JournalEntry)
          cursor.continue()
        } else {
          resolve(entries)
        }
      }
      cursorReq.onerror = () => resolve(entries)
    })
  })
  const entries = (await result) ?? []
  return entries.sort((a, b) => b.createdAt - a.createdAt)
}

/** Removes journal entries already marked 'synced' — keeps the journal small. */
export async function pruneSyncedEntries(): Promise<void> {
  const entries = await listJournalEntries()
  const syncedIds = entries.filter((e) => e.status === 'synced').map((e) => e.id)
  if (syncedIds.length === 0) return
  await withStore('readwrite', (store) => {
    for (const id of syncedIds) store.delete(id)
  })
}
