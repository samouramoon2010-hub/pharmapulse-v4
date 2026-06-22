// ============================================================
// Regression Test — BUG-01
// deleteTarget() called deleteDoc() which was NOT imported
// from 'firebase/firestore'. Any call to deleteTarget() would
// throw ReferenceError: deleteDoc is not defined at runtime.
//
// Fix: added deleteDoc to the Firestore import block in
// kpiService.js.
//
// These tests verify:
//   1. deleteTarget resolves when the target document exists.
//   2. deleteTarget throws a known error when doc is absent.
//   3. deleteTarget calls deleteDoc exactly once.
//   4. deleteTarget logs the DELETE audit action.
//   5. deleteDoc is present in the firestore module (contract).
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks (vi.mock is hoisted — no top-level variables inside) ─
vi.mock('../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'actor-uid' } },
  COL: {
    TARGETS:            'targets',
    AUDIT_LOGS:         'audit_logs',
    KPI_ENTRIES:        'kpi_entries',
    USERS:              'users',
    PHARMACIES:         'pharmacies',
    DAILY_SUMMARIES:    'daily_summaries',
    FORECAST_SNAPSHOTS: 'forecast_snapshots',
    RISK_SNAPSHOTS:     'risk_snapshots',
    RANKING_HISTORY:    'ranking_history',
  },
}))

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  setDoc:          vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  deleteDoc:       vi.fn(async () => {}),        // ← The fixed import
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LOGIN:  'login',
    LOGOUT: 'logout',
  },
}))

vi.mock('../services/historyService', () => ({
  triggerHistorySnapshots: vi.fn(async () => {}),
}))

// ── Imports under test ────────────────────────────────────────
import { deleteTarget }                    from '../services/kpiService'
import { logAction }                        from '../services/auditService'
import { deleteDoc, getDoc }                from 'firebase/firestore'

// ── Fixtures ──────────────────────────────────────────────────
const PHARMACY_ID = 'pharmacy-001'
const MONTH       = '2025-05'
const ACTOR_ID    = 'admin-uid'
const ACTOR_ROLE  = 'admin'

const EXISTING_TARGET_DATA = {
  pharmacyId:     PHARMACY_ID,
  month:          MONTH,
  wasfatyTarget:  500,
  omniTarget:     200,
  wellnessTarget: 100,
}

// ── Tests ─────────────────────────────────────────────────────

describe('BUG-01 Regression — deleteTarget: deleteDoc must be imported', () => {

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves without throwing when target document exists', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data:   () => EXISTING_TARGET_DATA,
    } as any)

    await expect(
      deleteTarget(PHARMACY_ID, MONTH, ACTOR_ID, ACTOR_ROLE)
    ).resolves.toBeUndefined()
  })

  it('calls deleteDoc exactly once when target exists', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data:   () => EXISTING_TARGET_DATA,
    } as any)

    await deleteTarget(PHARMACY_ID, MONTH, ACTOR_ID, ACTOR_ROLE)

    expect(deleteDoc).toHaveBeenCalledTimes(1)
  })

  it('calls logAction with DELETE action and correct metadata', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data:   () => EXISTING_TARGET_DATA,
    } as any)

    await deleteTarget(PHARMACY_ID, MONTH, ACTOR_ID, ACTOR_ROLE)

    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action:     'delete',
        collection: 'targets',
        docId:      `${PHARMACY_ID}_${MONTH}`,
        userId:     ACTOR_ID,
        userRole:   ACTOR_ROLE,
        before:     EXISTING_TARGET_DATA,
      })
    )
  })

  it('throws the Arabic "not found" message when target does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false,
      data:   () => null,
    } as any)

    await expect(
      deleteTarget(PHARMACY_ID, MONTH, ACTOR_ID, ACTOR_ROLE)
    ).rejects.toThrow('الهدف غير موجود')
  })

  it('does NOT call deleteDoc when target document does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false,
      data:   () => null,
    } as any)

    await deleteTarget(PHARMACY_ID, MONTH, ACTOR_ID, ACTOR_ROLE).catch(() => {})

    expect(deleteDoc).not.toHaveBeenCalled()
  })

  it('does NOT call logAction when target document does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false,
      data:   () => null,
    } as any)

    await deleteTarget(PHARMACY_ID, MONTH, ACTOR_ID, ACTOR_ROLE).catch(() => {})

    expect(logAction).not.toHaveBeenCalled()
  })

  // ── Contract guard: deleteDoc must be in the module export ────
  // If deleteDoc is removed from the import in kpiService.js again,
  // this test documents what breaks and why.
  it('deleteDoc is exported from firebase/firestore mock (contract guard)', async () => {
    const firestoreModule = await import('firebase/firestore')
    expect(typeof firestoreModule.deleteDoc).toBe('function')
  })
})
