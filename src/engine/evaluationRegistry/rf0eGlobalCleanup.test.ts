// ============================================================
// RF-0E Global Demo Cleanup — Tests
//
// Covers:
//   1.  deleteAllDemoData removes demo pharmacies
//   2.  deleteAllDemoData removes demo users
//   3.  deleteAllDemoData removes demo KPI entries
//   4.  deleteAllDemoData NEVER deletes real pharmacies
//   5.  deleteAllDemoData NEVER deletes real users
//   6.  isSafeToDelete guard — skips docs without isDemoData:true
//   7.  Verification scan runs after deletion
//   8.  verificationPass === true when all counts are 0
//   9.  verificationPass === false when any count remains
//  10.  deleteDemoBatch only removes matching batchId docs
//  11.  scanAllDemoData counts demo docs per collection
//  12.  scanAllDemoData totalDocs is the sum of all collection counts
//  13.  Cleanup never calls deleteDoc on docs without isDemoData
//  14.  Empty collection returns 0 deleted (no crash)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeBatch, getDocs } from 'firebase/firestore'

// ── Mocks ─────────────────────────────────────────────────────

vi.mock('../../services/firebase', () => ({
  db: {}, auth: null,
  COL: {
    PHARMACIES: 'pharmacies', USERS: 'users', TARGETS: 'targets',
    PERSONAL_TARGETS: 'personal_targets', KPI_ENTRIES: 'kpi_entries',
    EVALUATION_RESULTS: 'evaluation_results', RANKING_SNAPSHOTS: 'ranking_snapshots',
    DEMO_BATCHES: 'demo_batches', AUDIT_LOGS: 'audit_logs',
  },
}))

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn((_db, col) => ({ __col: col })),
  doc:             vi.fn((_db, ...parts) => ({ __path: parts.join('/') })),
  getDoc:          vi.fn(async () => ({ exists: () => false })),
  getDocs:         vi.fn(async () => ({ docs: [], empty: true })),
  setDoc:          vi.fn(async () => {}),
  deleteDoc:       vi.fn(async () => {}),
  addDoc:          vi.fn(async () => ({ id: 'auto' })),
  query:           vi.fn((...a) => a[0]),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  writeBatch:      vi.fn(() => ({ set: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => {}) })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../services/auditService', () => ({
  logAction: vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))

// ── Helpers ───────────────────────────────────────────────────

function makeDemoDoc(batchId = 'DEMO_001') {
  return {
    ref:  { __path: `pharmacies/demo_ph_${batchId}` },
    data: () => ({ name: 'Demo Branch', isDemoData: true, demoBatchId: batchId }),
  }
}

function makeRealDoc() {
  return {
    ref:  { __path: 'pharmacies/real_ph_001' },
    data: () => ({ name: 'Real Branch' }),   // NO isDemoData field
  }
}

function makeGetDocsResponse(docs: ReturnType<typeof makeDemoDoc>[]) {
  return { docs, empty: docs.length === 0 }
}

// ════════════════════════════════════════════════════════════════
// 1–3. deleteAllDemoData removes demo documents
// ════════════════════════════════════════════════════════════════

describe('deleteAllDemoData — removes demo documents', () => {
  beforeEach(() => vi.resetAllMocks())

  it('queues demo pharmacy for deletion', async () => {
    const batch = { delete: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    // First 8 getDocs calls = 8 collections (pharmacies first)
    vi.mocked(getDocs).mockResolvedValue(
      makeGetDocsResponse([makeDemoDoc()]) as any
    )

    const { deleteAllDemoData } = await import('../../demo/demo-cleanup')
    const result = await deleteAllDemoData()

    expect(batch.delete).toHaveBeenCalled()
    expect(result.deleted['pharmacies']).toBe(1)
  })

  it('queues demo users for deletion', async () => {
    const batch = { delete: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    vi.mocked(getDocs)
      .mockResolvedValueOnce(makeGetDocsResponse([]) as any)  // pharmacies empty
      .mockResolvedValue(
        makeGetDocsResponse([makeDemoDoc(), makeDemoDoc()]) as any  // users + rest
      )

    const { deleteAllDemoData } = await import('../../demo/demo-cleanup')
    const result = await deleteAllDemoData()

    expect(result.deleted['users']).toBe(2)
  })

  it('queues demo KPI entries for deletion', async () => {
    const batch = { delete: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    // Return 3 demo docs for kpi_entries (5th collection), empty for others
    vi.mocked(getDocs)
      .mockResolvedValueOnce(makeGetDocsResponse([]) as any)  // pharmacies
      .mockResolvedValueOnce(makeGetDocsResponse([]) as any)  // users
      .mockResolvedValueOnce(makeGetDocsResponse([]) as any)  // targets
      .mockResolvedValueOnce(makeGetDocsResponse([]) as any)  // personal_targets
      .mockResolvedValue(
        makeGetDocsResponse([makeDemoDoc(), makeDemoDoc(), makeDemoDoc()]) as any
      )

    const { deleteAllDemoData } = await import('../../demo/demo-cleanup')
    const result = await deleteAllDemoData()

    expect(result.deleted['kpi_entries']).toBe(3)
  })
})

// ════════════════════════════════════════════════════════════════
// 4–5. deleteAllDemoData NEVER touches real documents
// ════════════════════════════════════════════════════════════════

describe('deleteAllDemoData — NEVER deletes real documents', () => {
  beforeEach(() => vi.resetAllMocks())

  it('skips real pharmacy (no isDemoData field)', async () => {
    const batch = { delete: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    // Mix of 1 real + 1 demo
    vi.mocked(getDocs).mockResolvedValue(
      makeGetDocsResponse([makeRealDoc() as any, makeDemoDoc()]) as any
    )

    const { deleteAllDemoData } = await import('../../demo/demo-cleanup')
    const result = await deleteAllDemoData()

    // Real doc is NEVER passed to batch.delete
    const deletedPaths = (batch.delete.mock.calls as any[]).map((c) => c[0]?.__path ?? '')
    expect(deletedPaths.every((p: string) => !p.includes('real_ph_001'))).toBe(true)
    expect(result.skipped).toBeGreaterThan(0)
  })

  it('skips real user (no isDemoData field)', async () => {
    const batch = { delete: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    const realUser = {
      ref:  { __path: 'users/real_user_uid' },
      data: () => ({ displayName: 'Real Admin', role: 'admin' }),
    }

    vi.mocked(getDocs).mockResolvedValue(
      makeGetDocsResponse([realUser as any]) as any
    )

    const { deleteAllDemoData } = await import('../../demo/demo-cleanup')
    const result = await deleteAllDemoData()

    expect(batch.delete).not.toHaveBeenCalled()
    expect(result.totalDeleted).toBe(0)
  })

  it('isDemoData=false is also skipped (only true is accepted)', async () => {
    const batch = { delete: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    const suspiciousDoc = {
      ref:  { __path: 'pharmacies/suspicious' },
      data: () => ({ isDemoData: false, name: 'Not Demo' }),
    }

    vi.mocked(getDocs).mockResolvedValue(
      makeGetDocsResponse([suspiciousDoc as any]) as any
    )

    const { deleteAllDemoData } = await import('../../demo/demo-cleanup')
    await deleteAllDemoData()

    expect(batch.delete).not.toHaveBeenCalled()
  })
})

// ════════════════════════════════════════════════════════════════
// 7–9. Verification scan
// ════════════════════════════════════════════════════════════════

describe('Verification scan after deletion', () => {
  beforeEach(() => vi.resetAllMocks())

  it('verificationPass is true when all post-deletion counts are 0', async () => {
    const batch = { delete: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    // All collections empty → deletion and post-scan both return empty
    vi.mocked(getDocs).mockResolvedValue(makeGetDocsResponse([]) as any)

    const { deleteAllDemoData } = await import('../../demo/demo-cleanup')
    const result = await deleteAllDemoData()

    expect(result.verificationPass).toBe(true)
    for (const count of Object.values(result.verification)) {
      expect(count).toBe(0)
    }
  })

  it('verificationPass is false when demo docs remain after deletion', async () => {
    const batch = { delete: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    let callCount = 0
    const TOTAL_COLLECTIONS = 8  // number of collections in ALL_DEMO_COLLECTIONS

    // First pass (deletion): all empty
    // Second pass (verification): pharmacies still has a demo doc
    vi.mocked(getDocs).mockImplementation(async () => {
      callCount++
      // After TOTAL_COLLECTIONS calls (deletion pass), simulate remaining doc
      if (callCount > TOTAL_COLLECTIONS) {
        return makeGetDocsResponse([makeDemoDoc()]) as any
      }
      return makeGetDocsResponse([]) as any
    })

    const { deleteAllDemoData } = await import('../../demo/demo-cleanup')
    const result = await deleteAllDemoData()

    expect(result.verificationPass).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════
// 10. deleteDemoBatch only removes matching batchId docs
// ════════════════════════════════════════════════════════════════

describe('deleteDemoBatch — batchId isolation', () => {
  beforeEach(() => vi.resetAllMocks())

  it('only queues docs matching the requested batchId', async () => {
    const batch = { delete: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValue(batch as any)

    const docA = makeDemoDoc('BATCH_A')
    const docB = makeDemoDoc('BATCH_B')

    vi.mocked(getDocs).mockResolvedValue(
      makeGetDocsResponse([docA, docB]) as any
    )

    const { deleteDemoBatch } = await import('../../demo/demo-cleanup')
    const result = await deleteDemoBatch('BATCH_A')

    // Only docA should be queued
    const calls = batch.delete.mock.calls.flat() as any[]
    expect(calls.every((ref: any) => ref.__path?.includes('BATCH_A'))).toBe(true)
    expect(result.total).toBeGreaterThanOrEqual(1)
  })
})

// ════════════════════════════════════════════════════════════════
// 11–12. scanAllDemoData
// ════════════════════════════════════════════════════════════════

describe('scanAllDemoData', () => {
  beforeEach(() => vi.resetAllMocks())

  it('counts demo docs in each collection', async () => {
    vi.mocked(getDocs)
      .mockResolvedValueOnce(makeGetDocsResponse([makeDemoDoc(), makeDemoDoc()]) as any)  // pharmacies=2
      .mockResolvedValue(makeGetDocsResponse([]) as any)  // rest empty

    const { scanAllDemoData } = await import('../../demo/demo-cleanup')
    const result = await scanAllDemoData()

    const pharmacies = result.counts.find((c) => c.collection === 'pharmacies')
    expect(pharmacies?.count).toBe(2)
  })

  it('totalDocs is the sum of all collection counts', async () => {
    vi.mocked(getDocs)
      .mockResolvedValueOnce(makeGetDocsResponse([makeDemoDoc()]) as any)       // pharmacies=1
      .mockResolvedValueOnce(makeGetDocsResponse([makeDemoDoc(), makeDemoDoc()]) as any)  // users=2
      .mockResolvedValue(makeGetDocsResponse([]) as any)

    const { scanAllDemoData } = await import('../../demo/demo-cleanup')
    const result = await scanAllDemoData()

    const explicitTotal = result.counts.reduce((a, c) => a + c.count, 0)
    expect(result.totalDocs).toBe(explicitTotal)
  })
})

// ════════════════════════════════════════════════════════════════
// 14. Empty collections don't crash
// ════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  beforeEach(() => vi.resetAllMocks())

  it('all empty collections — totalDeleted is 0, no crash', async () => {
    vi.mocked(writeBatch).mockReturnValue({ delete: vi.fn(), commit: vi.fn(async () => {}) } as any)
    vi.mocked(getDocs).mockResolvedValue(makeGetDocsResponse([]) as any)

    const { deleteAllDemoData } = await import('../../demo/demo-cleanup')
    const result = await deleteAllDemoData()

    expect(result.totalDeleted).toBe(0)
    expect(result.verificationPass).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('scanAllDemoData on all-empty collections returns totalDocs=0', async () => {
    vi.mocked(getDocs).mockResolvedValue(makeGetDocsResponse([]) as any)

    const { scanAllDemoData } = await import('../../demo/demo-cleanup')
    const result = await scanAllDemoData()

    expect(result.totalDocs).toBe(0)
  })
})
