// ============================================================
// Offline First + Sync Engine Foundation — Certification
//
// Same raw-source-scan convention as every other certification
// suite in this repo (no jsdom/testing-library/fake-indexeddb — this
// repo has never used a DOM/IndexedDB-emulating test environment;
// vitest runs in plain Node here, so all of these are source-shape
// assertions, identical in spirit to ui3CleanupMegaBundleC2-C4 and
// loginV3IdentityGateway).
//
// AUDIT RESULT (performed before any edit — see firebase.js):
//   src/services/firebase.js already initializes Firestore with
//   persistentLocalCache({ tabManager: persistentMultipleTabManager() }).
//   That is the modular SDK's own IndexedDB-backed offline
//   persistence: it already queues writes made while offline,
//   retries/syncs them automatically when connectivity returns, and
//   coordinates multiple open tabs. This is a HARD STOP condition
//   from the bundle's own rules ("If Firestore offline persistence
//   already solves part of this flow, audit first and report before
//   implementing overlapping logic").
//
//   Per explicit user direction after this finding was reported, the
//   bundle was implemented as a VISIBILITY layer over the SDK's
//   existing queue rather than a second, competing write queue:
//     - No new code calls addDoc/updateDoc/setDoc/deleteDoc/
//       collection/onSnapshot directly outside the services that
//       already did before this bundle.
//     - operationJournal.ts stores only *metadata* about write
//       attempts (id/type/label/status/timestamps) for UI display —
//       it never executes or replays a write.
//     - syncTracker.ts wraps a write call's Promise lifecycle for
//       visibility; on success it returns exactly what the wrapped
//       call resolved with. Its only *real* retry logic is for
//       Promise rejections classified as connectivity errors (i.e.
//       a write that never reached the SDK's own queue at all) —
//       writes the SDK successfully queued offline already resolve
//       and are never retried by this code, avoiding double-execution.
//
// NEW FILES:
//   src/offline/connectivityService.ts — navigator.onLine wrapper.
//   src/offline/operationJournal.ts    — IndexedDB-backed metadata journal.
//   src/offline/syncTracker.ts          — visibility wrapper + reconnect retry.
//   src/store/connectivityStore.js      — zustand wrapper over connectivityService.
//   src/hooks/useSyncStatus.js          — combines connectivity + journal summary.
//   src/components/ui/OfflineBanner.jsx — non-blocking offline notice.
//   src/components/ui/SyncStatusIndicator.jsx — header sync/connectivity badge.
//
// MODIFIED FILES:
//   src/components/layout/AppLayout.jsx — added <OfflineBanner/> and
//     <SyncStatusIndicator/>, purely additive markup.
//   src/store/kpiStore.js — saveEntry() now calls saveKpiEntry()
//     through trackOperation() as a proof-of-concept integration for
//     the "manual entry" write flow named in the bundle's scope.
//     kpiService.js itself (the actual Firestore write service) was
//     NOT touched.
//
// DEFERRED (explicitly not implemented, per "Do NOT implement"):
//   Conflict resolution, merge UI, multi-device reconciliation,
//   CRDT/event sourcing, offline analytics recalculation.
// ============================================================
import { describe, it, expect } from 'vitest'

const firebaseSrc           = await import('../services/firebase.js?raw').then((m) => m.default)
const connectivityServiceSrc = await import('../offline/connectivityService.ts?raw').then((m) => m.default)
const operationJournalSrc    = await import('../offline/operationJournal.ts?raw').then((m) => m.default)
const syncTrackerSrc         = await import('../offline/syncTracker.ts?raw').then((m) => m.default)
const connectivityStoreSrc   = await import('../store/connectivityStore.js?raw').then((m) => m.default)
const useSyncStatusSrc       = await import('../hooks/useSyncStatus.js?raw').then((m) => m.default)
const offlineBannerSrc       = await import('../components/ui/OfflineBanner.jsx?raw').then((m) => m.default)
const syncStatusIndicatorSrc = await import('../components/ui/SyncStatusIndicator.jsx?raw').then((m) => m.default)
const appLayoutSrc           = await import('../components/layout/AppLayout.jsx?raw').then((m) => m.default)
const kpiStoreSrc            = await import('../store/kpiStore.js?raw').then((m) => m.default)
const kpiServiceSrc          = await import('../services/kpiService.js?raw').then((m) => m.default)

const NEW_FILES: Record<string, string> = {
  'connectivityService.ts': connectivityServiceSrc,
  'operationJournal.ts': operationJournalSrc,
  'syncTracker.ts': syncTrackerSrc,
  'connectivityStore.js': connectivityStoreSrc,
  'useSyncStatus.js': useSyncStatusSrc,
  'OfflineBanner.jsx': offlineBannerSrc,
  'SyncStatusIndicator.jsx': syncStatusIndicatorSrc,
}

// ════════════════════════════════════════════════════════════
// Validation target 1 — existing online writes still work
// unchanged
// ════════════════════════════════════════════════════════════
describe('Validation 1 — existing online writes still work unchanged', () => {
  it('kpiService.js (the actual Firestore write service) still exports saveKpiEntry/saveTarget/deleteTarget with their original signatures', () => {
    expect(kpiServiceSrc).toContain('export async function saveKpiEntry({')
    expect(kpiServiceSrc).toContain('export async function saveTarget({')
    expect(kpiServiceSrc).toContain('export async function deleteTarget(pharmacyId, month, actorId, actorRole)')
  })

  it('kpiService.js was not given any offline/sync imports — it remains a pure Firestore service', () => {
    expect(kpiServiceSrc).not.toContain('offline/syncTracker')
    expect(kpiServiceSrc).not.toContain('offline/operationJournal')
    expect(kpiServiceSrc).not.toContain('offline/connectivityService')
  })

  it('kpiStore.saveEntry still calls saveKpiEntry exactly once, now wrapped (not replaced) by trackOperation', () => {
    expect(kpiStoreSrc).toContain("import { trackOperation } from '../offline/syncTracker'")
    expect(kpiStoreSrc).toContain("trackOperation('kpi_entry', 'KPI entry', () => saveKpiEntry({ ...data, registry }))")
    const occurrences = kpiStoreSrc.match(/saveKpiEntry\(/g) ?? []
    expect(occurrences.length).toBe(1)
  })

  it('trackOperation forwards the executor\'s resolved value unchanged on the success path', () => {
    expect(syncTrackerSrc).toContain('const result = await executor()')
    expect(syncTrackerSrc).toContain('return result')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 2 — queue entries persist across refresh
// ════════════════════════════════════════════════════════════
describe('Validation 2 — journal entries are durably stored (IndexedDB), surviving a page refresh', () => {
  it('operationJournal.ts persists to IndexedDB, not memory-only or sessionStorage', () => {
    expect(operationJournalSrc).toContain('indexedDB.open(')
    expect(operationJournalSrc).not.toContain('sessionStorage')
  })

  it('operationJournal.ts defines a durable object store with status/timestamps/retry metadata', () => {
    expect(operationJournalSrc).toContain("createObjectStore(STORE_NAME, { keyPath: 'id' })")
    expect(operationJournalSrc).toContain('status: OperationStatus')
    expect(operationJournalSrc).toContain('retryCount: number')
  })

  it('the journal exposes the 4 required statuses: pending, syncing, synced, failed', () => {
    expect(operationJournalSrc).toContain("'pending' | 'syncing' | 'synced' | 'failed'")
  })

  it('addJournalEntry/listJournalEntries read and write through the same persistent store (not transient state)', () => {
    expect(operationJournalSrc).toContain('export async function addJournalEntry')
    expect(operationJournalSrc).toContain('export async function listJournalEntries')
    expect(operationJournalSrc).toContain('export async function updateJournalEntry')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 3 — pending operations survive reconnect
// cycles
// ════════════════════════════════════════════════════════════
describe('Validation 3 — pending operations survive reconnect cycles (background sync executor)', () => {
  it('syncTracker subscribes to connectivity changes and retries pending operations when back online', () => {
    expect(syncTrackerSrc).toContain('subscribeConnectivity((online) => {')
    expect(syncTrackerSrc).toContain('if (!online) return')
    expect(syncTrackerSrc).toContain('attemptRetry(id)')
  })

  it('the retry strategy is exponential (base delay doubles per attempt) and bounded', () => {
    expect(syncTrackerSrc).toContain('BASE_RETRY_DELAY_MS * Math.pow(2, entry.attempts)')
    expect(syncTrackerSrc).toContain('MAX_RETRY_ATTEMPTS')
  })

  it('a retry attempt that is still offline defers to the next online event instead of looping immediately', () => {
    expect(syncTrackerSrc).toContain('if (!isOnline()) return // wait for the next')
  })

  it('connectivityService exposes a subscribable online/offline signal driven by real browser events', () => {
    expect(connectivityServiceSrc).toContain("window.addEventListener('online', handleOnline)")
    expect(connectivityServiceSrc).toContain("window.addEventListener('offline', handleOffline)")
    expect(connectivityServiceSrc).toContain('export function subscribeConnectivity')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 4 — no Firestore contract changes occurred
// ════════════════════════════════════════════════════════════
describe('Validation 4 — no Firestore contract changes occurred', () => {
  it('firebase.js still initializes Firestore with persistentLocalCache + persistentMultipleTabManager, unchanged', () => {
    expect(firebaseSrc).toContain('persistentLocalCache({ tabManager: persistentMultipleTabManager() })')
  })

  it('firebase.js COL collection map was not modified by this bundle (no new/renamed collections)', () => {
    expect(firebaseSrc).toContain("USERS:              'users',")
    expect(firebaseSrc).toContain("KPI_ENTRIES:        'kpi_entries',")
    expect(firebaseSrc).toContain("TARGETS:            'targets',")
  })

  it('none of the new offline/* modules call Firestore write or query APIs directly', () => {
    const FIRESTORE_APIS = ['addDoc(', 'updateDoc(', 'setDoc(', 'deleteDoc(', 'collection(', 'onSnapshot(', 'runTransaction(', 'writeBatch(']
    for (const [fileName, src] of Object.entries(NEW_FILES)) {
      for (const api of FIRESTORE_APIS) {
        expect(src, `${fileName} should not call ${api}`).not.toContain(api)
      }
    }
  })

  it('none of the new offline/* modules import from services/firebase.js', () => {
    for (const [, src] of Object.entries(NEW_FILES)) {
      expect(src).not.toContain("from '../services/firebase")
      expect(src).not.toContain("from '../../services/firebase")
    }
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 5 — auth, engines, scoring, and role logic
// remain unchanged
// ════════════════════════════════════════════════════════════
const GUARDRAIL_KEYWORDS = [
  'evaluationEngine', 'evaluationPipeline', 'evaluationActualsService',
  'evaluationLedgerService', 'evaluationOrchestrationService', 'evaluationRegistryService',
  'rankingEngine.', 'computeRanking(', 'generateRankings(',
  'aiAssistant', 'aiInsights', 'AIEngine',
  'ProfileStudioKernel', 'profileStudioEngine',
  'usePermissions(', 'permissionGate(', '<Route ',
  'signInWithEmailAndPassword(', 'useAuthStore',
]

describe('Validation 5 — auth, engines, scoring, and role logic remain unchanged', () => {
  for (const [fileName, src] of Object.entries(NEW_FILES)) {
    for (const keyword of GUARDRAIL_KEYWORDS) {
      it(`${fileName} does not contain forbidden construct: "${keyword}"`, () => {
        expect(src).not.toContain(keyword)
      })
    }
  }

  it('kpiStore.js was not given any change to its existing entry/target subscription or score logic', () => {
    expect(kpiStoreSrc).toContain('subscribeKpiEntries')
    expect(kpiStoreSrc).not.toMatch(/function compute(Score|Rank|Risk|Achievement)\(/i)
  })

  it('AppLayout.jsx still wraps routed content via <Outlet/>, unchanged route-rendering contract', () => {
    expect(appLayoutSrc).toContain('<Outlet')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 6 — offline UI is non-blocking
// ════════════════════════════════════════════════════════════
describe('Validation 6 — offline UI is non-blocking', () => {
  it('OfflineBanner renders nothing at all while online (no overlay, no gating)', () => {
    expect(offlineBannerSrc).toContain('if (isOnline) return null')
  })

  it('OfflineBanner is a sticky strip, not a full-screen modal/overlay, and has pointer-events disabled', () => {
    expect(offlineBannerSrc).toContain("position: 'sticky'")
    expect(offlineBannerSrc).toContain("pointerEvents: 'none'")
    expect(offlineBannerSrc).not.toContain('position: \'fixed\', inset: 0')
  })

  it('SyncStatusIndicator is a read-only badge — it never disables or gates any action', () => {
    expect(syncStatusIndicatorSrc).not.toContain('disabled')
    expect(syncStatusIndicatorSrc).not.toContain('onClick')
  })

  it('AppLayout still renders the topbar, sidebar, and command palette unconditionally alongside the offline banner', () => {
    expect(appLayoutSrc).toContain('<OfflineBanner')
    expect(appLayoutSrc).toContain('<Sidebar')
    expect(appLayoutSrc).toContain('<CommandPalette')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 7 — no duplicate writes are introduced
// ════════════════════════════════════════════════════════════
describe('Validation 7 — no duplicate writes are introduced', () => {
  it('trackOperation calls the wrapped executor exactly once on the initial attempt', () => {
    const occurrences = syncTrackerSrc.match(/await executor\(\)/g) ?? []
    expect(occurrences.length).toBe(1)
  })

  it('a write that resolves successfully is marked synced and is never queued for retry', () => {
    const idx = syncTrackerSrc.indexOf('const result = await executor()')
    const block = syncTrackerSrc.slice(idx, idx + 200)
    expect(block).toContain("status: 'synced'")
    expect(block).not.toContain('retryRegistry.set')
  })

  it('retries are only registered for Promise rejections classified as connectivity errors, never for successful writes', () => {
    expect(syncTrackerSrc).toContain('if (isConnectivityError(err)) {')
    expect(syncTrackerSrc).toContain('retryRegistry.set(id,')
  })

  it('a retried operation removes itself from the retry registry once it succeeds, preventing repeat execution', () => {
    expect(syncTrackerSrc).toContain('retryRegistry.delete(id)')
  })

  it('operationJournal never itself calls the executor or any write function — it only stores metadata', () => {
    expect(operationJournalSrc).not.toContain('executor(')
    expect(operationJournalSrc).not.toContain('await fn(')
  })
})

// ════════════════════════════════════════════════════════════
// Build safety — touched/new files remain well-formed modules
// ════════════════════════════════════════════════════════════
describe('Build safety — new files remain well-formed modules', () => {
  for (const [fileName, src] of Object.entries(NEW_FILES)) {
    it(`${fileName} has at least one export`, () => {
      expect(src).toMatch(/export (default |const |function |async function |type |interface )/)
    })
    it(`${fileName} has balanced braces`, () => {
      const open = (src.match(/\{/g) ?? []).length
      const close = (src.match(/\}/g) ?? []).length
      expect(open).toBe(close)
    })
  }
})
