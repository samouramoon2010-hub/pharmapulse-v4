// ============================================================
// KPI Entry userId Fix — Regression Test
//
// Root cause: payload.userId was set from the `uid` const computed
// at render time: auth?.currentUser?.uid || userProfile?.uid || userProfile?.id
// When auth resolved AFTER the component first rendered, uid held
// userProfile?.uid (e.g. "0uPy4...") while auth.currentUser.uid
// was "0C8h..." — two different values.
// Firestore isOwnData() = request.resource.data.userId == request.auth.uid
// → "0uPy4..." == "0C8h..." → false → PERMISSION_DENIED.
//
// Fix: always read auth.currentUser.uid AT SAVE TIME (not from the
// render-time uid const). Added saveUid = auth?.currentUser?.uid in
// handleSave(), used for payload.userId and actorId.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setDoc } from 'firebase/firestore'

vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: '0C8hPmFvHRXp2sst2k41DBe3uV72' } },  // the Auth UID
  COL: {
    USERS: 'users', PHARMACIES: 'pharmacies', KPI_ENTRIES: 'kpi_entries',
    TARGETS: 'targets', AUDIT_LOGS: 'audit_logs', NOTIFICATIONS: 'notifications',
    LEADERBOARD: 'leaderboard', KPI_REGISTRY: 'kpi_registry',
    DAILY_SUMMARIES: 'daily_summaries', MONTHLY_SUMMARIES: 'monthly_summaries',
    FORECAST_SNAPSHOTS: 'forecast_snapshots', RISK_SNAPSHOTS: 'risk_snapshots',
    RANKING_HISTORY: 'ranking_history', STAGING_ENTRIES: 'staging_entries',
    DISTRICTS: 'districts', REGIONS: 'regions',
    PERSONAL_TARGETS: 'personal_targets',
    EVALUATION_PROFILES: 'evaluation_profiles',
    EVALUATION_RESULTS:  'evaluation_results',
  },
}))
vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  setDoc:          vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  deleteDoc:       vi.fn(async () => {}),
  writeBatch:      vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => {}) })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  Timestamp:       { now: vi.fn(() => ({ toDate: () => new Date() })) },
}))
vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))
vi.mock('../../services/historyService', () => ({
  triggerHistorySnapshots: vi.fn(async () => {}),
}))

describe('KPI Entry userId fix — manager save payload', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(setDoc).mockResolvedValue(undefined as any)
  })

  it('saveKpiEntry payload.userId equals auth.currentUser.uid, not the passed userId arg', async () => {
    const AUTH_UID  = '0C8hPmFvHRXp2sst2k41DBe3uV72'  // real Auth UID
    const WRONG_UID = '0uPy4tusCnvfELv1oyb5'            // userProfile.uid (different)

    const payloads: unknown[] = []
    vi.mocked(setDoc).mockImplementationOnce(async (_ref, data) => {
      payloads.push(data)
    })

    const { saveKpiEntry } = await import('../../services/kpiService.js')
    // Pass the wrong userId (simulating the old render-time uid const value)
    await saveKpiEntry({
      userId:    WRONG_UID,   // ← this was the bug: userProfile.uid ≠ auth uid
      pharmacyId: '5074',
      date:       '2026-06-04',
      wasfaty:    100,
      actorId:    WRONG_UID,
      actorRole:  'manager',
    })

    const doc = payloads[0] as Record<string, unknown>
    // The service must override with auth.currentUser.uid
    expect(doc.userId).toBe(AUTH_UID)
    expect(doc.userId).not.toBe(WRONG_UID)
  })

  it('doc path uses auth.currentUser.uid — isOwnData() will pass', async () => {
    const AUTH_UID = '0C8hPmFvHRXp2sst2k41DBe3uV72'
    // The doc ID format is: userId_pharmacyId_date
    // It must use the Auth UID so request.auth.uid matches payload.userId
    const { doc: mockDoc } = await import('firebase/firestore')
    const docPaths: string[] = []
    vi.mocked(mockDoc).mockImplementation((_db, col, id) => {
      if (col === 'kpi_entries') docPaths.push(id as string)
      return {} as any
    })

    const { saveKpiEntry } = await import('../../services/kpiService.js')
    await saveKpiEntry({
      userId:    'WRONG_OLD_ID',
      pharmacyId: '5074',
      date:       '2026-06-04',
      wasfaty:    100,
      actorId:    'WRONG_OLD_ID',
      actorRole:  'manager',
    })

    // The doc path must start with the Auth UID
    const kpiPath = docPaths.find((p) => p.includes('5074'))
    expect(kpiPath).toBeDefined()
    expect(kpiPath!.startsWith(AUTH_UID)).toBe(true)
    expect(kpiPath!.startsWith('WRONG_OLD_ID')).toBe(false)
  })
})
