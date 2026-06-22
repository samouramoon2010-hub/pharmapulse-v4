// ============================================================
// Sync Tracker — Offline First Bundle, Phases B + C
//
// trackOperation() wraps a single write call for VISIBILITY only:
//   - it never decides whether the write happens or re-shapes its
//     arguments/return value — callers get back exactly what the
//     wrapped function would have returned.
//   - it records a journal entry so the UI can show a pending-
//     changes badge / sync status / last-sync time that survives a
//     page refresh.
//
// Retry policy (the one piece of *real* retry logic owned by this
// bundle, not by the Firestore SDK):
//   Firestore's persistentLocalCache already retries/queues writes
//   that get queued while offline — those write Promises resolve
//   successfully once durably cached locally, so they never reach
//   our catch block. The only failures that land here are either
//   (a) genuine logic/permission errors — never retried automatically,
//   or (b) transport-level failures where the request never reached
//   Firestore's own queue (e.g. a fetch failing outright while
//   completely offline) — these ARE retried automatically, with
//   exponential backoff, once connectivity returns.
// ============================================================
import { addJournalEntry, updateJournalEntry, listJournalEntries, pruneSyncedEntries } from './operationJournal'
import { isOnline, subscribeConnectivity } from './connectivityService'

const BASE_RETRY_DELAY_MS = 2000
const MAX_RETRY_ATTEMPTS  = 5

// In-memory registry of retryable executors, keyed by journal entry id.
// Not persisted — if the page reloads mid-retry, the journal entry
// still shows 'pending' (truthful: the original write never confirmed),
// but the retry executor itself is re-armed only for operations
// tracked again after reload. This is a visibility journal, not a
// durable replay log, by design (see operationJournal.ts header).
const retryRegistry = new Map<string, { executor: () => Promise<unknown>; attempts: number }>()

function isConnectivityError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  const code = (err as { code?: string })?.code
  return (
    message.includes('network') ||
    message.includes('unavailable') ||
    message.includes('offline') ||
    code === 'unavailable'
  )
}

function genId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

async function attemptRetry(id: string) {
  const entry = retryRegistry.get(id)
  if (!entry) return
  if (entry.attempts >= MAX_RETRY_ATTEMPTS) {
    await updateJournalEntry(id, { status: 'failed', errorMessage: 'Max retry attempts reached', updatedAt: Date.now() })
    retryRegistry.delete(id)
    return
  }

  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, entry.attempts)
  entry.attempts += 1
  await updateJournalEntry(id, { retryCount: entry.attempts, updatedAt: Date.now() })

  setTimeout(async () => {
    if (!isOnline()) return // wait for the next 'online' event instead
    try {
      await entry.executor()
      await updateJournalEntry(id, { status: 'synced', updatedAt: Date.now() })
      retryRegistry.delete(id)
    } catch (err) {
      if (isConnectivityError(err) && isOnline()) {
        await attemptRetry(id)
      } else {
        await updateJournalEntry(id, {
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
          updatedAt: Date.now(),
        })
        retryRegistry.delete(id)
      }
    }
  }, delay)
}

// Background sync executor — retries every still-pending operation
// once connectivity returns.
subscribeConnectivity((online) => {
  if (!online) return
  for (const id of retryRegistry.keys()) {
    attemptRetry(id)
  }
  pruneSyncedEntries()
})

/**
 * Wraps a write call for visibility tracking. Returns exactly what
 * `executor()` resolves/rejects with — never alters the outcome.
 */
export async function trackOperation<T>(
  type: string,
  label: string,
  executor: () => Promise<T>
): Promise<T> {
  const id = genId()
  const now = Date.now()
  await addJournalEntry({
    id, type, label,
    status: isOnline() ? 'syncing' : 'pending',
    createdAt: now, updatedAt: now, retryCount: 0,
  })

  try {
    const result = await executor()
    await updateJournalEntry(id, { status: 'synced', updatedAt: Date.now() })
    return result
  } catch (err) {
    if (isConnectivityError(err)) {
      await updateJournalEntry(id, { status: 'pending', updatedAt: Date.now() })
      retryRegistry.set(id, { executor: executor as () => Promise<unknown>, attempts: 0 })
      if (isOnline()) attemptRetry(id)
    } else {
      await updateJournalEntry(id, {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        updatedAt: Date.now(),
      })
    }
    throw err
  }
}

/** Returns the current pending+syncing count and the most recent synced timestamp. */
export async function getSyncSummary() {
  const entries = await listJournalEntries()
  const pendingCount = entries.filter((e) => e.status === 'pending' || e.status === 'syncing').length
  const failedCount  = entries.filter((e) => e.status === 'failed').length
  const lastSynced   = entries
    .filter((e) => e.status === 'synced')
    .reduce((max, e) => Math.max(max, e.updatedAt), 0)
  return { pendingCount, failedCount, lastSyncedAt: lastSynced || null, entries }
}
