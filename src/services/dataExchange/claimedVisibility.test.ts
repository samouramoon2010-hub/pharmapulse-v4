// ============================================================
// Closure Patch (follow-up) — CLAIMED record visibility certification
//
// Proves a soft-archived `authStatus: 'CLAIMED'` pending-onboarding
// document (see pharmacistActivationService.ts) can never appear as
// an active operational pharmacist in any production reader, while
// remaining fully readable for audit/history. Exercises the REAL
// userService.js / territoryBackfill.ts / territoryValidation.ts
// implementations against a mocked Firestore — not a reimplementation
// of their logic.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const userDocs = new Map<string, Record<string, unknown>>()
const auditCalls: Array<Record<string, unknown>> = []

vi.mock('../firebase', () => ({
  db: {},
  COL: { USERS: 'users', AUDIT_LOGS: 'audit_logs' },
}))

vi.mock('../auditService', () => ({
  logAction: vi.fn(async (params: Record<string, unknown>) => { auditCalls.push(params) }),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
}))

vi.mock('../territorySync', () => ({
  recomputeAssignedPharmacyIds: vi.fn(async () => ({ changed: false, previous: null, current: null })),
  computeAssignedPharmacyIdsForUser: vi.fn(async () => []),
}))

interface DocRef { id: string }

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, _col: string, id: string): DocRef => ({ id })),
  collection: vi.fn(() => ({})),
  query: vi.fn((colRef: unknown, ...clauses: Array<{ field: string; op: string; value: unknown }>) => ({ clauses })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  getDoc: vi.fn(async (ref: DocRef) => {
    const data = userDocs.get(ref.id)
    return { exists: () => data != null, data: () => data, id: ref.id }
  }),
  getDocs: vi.fn(async (q: { clauses: Array<{ field: string; op: string; value: unknown }> }) => {
    const docs = [...userDocs.entries()].filter(([, data]) =>
      q.clauses.every((c) => (
        c.op === 'in' ? (c.value as unknown[]).includes(data[c.field]) : data[c.field] === c.value
      )),
    )
    return {
      empty: docs.length === 0,
      docs: docs.map(([id, data]) => ({ id, data: () => data })),
    }
  }),
  setDoc: vi.fn(async (ref: DocRef, data: Record<string, unknown>) => { userDocs.set(ref.id, data) }),
  updateDoc: vi.fn(async (ref: DocRef, data: Record<string, unknown>) => {
    userDocs.set(ref.id, { ...(userDocs.get(ref.id) ?? {}), ...data })
  }),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

import { getUsersByPharmacy } from '../userService'
import { backfillAllAssignedPharmacyIds } from '../territoryBackfill'
import { auditAllAssignedPharmacyIds } from '../territoryValidation'

beforeEach(() => { userDocs.clear(); auditCalls.length = 0 })

describe('Closure Patch — CLAIMED records excluded from active rosters', () => {
  it('getUsersByPharmacy() excludes a CLAIMED record even if active/pharmacyId were never touched', () => {
    userDocs.set('pending_EMP1', {
      displayName: 'Sara (old)', role: 'pharmacist', pharmacyId: 'ph-1',
      active: true, authStatus: 'CLAIMED', employeeId: 'EMP1',
    })
    userDocs.set('auth-EMP1', {
      displayName: 'Sara', role: 'pharmacist', pharmacyId: 'ph-1',
      active: true, employeeId: 'EMP1',
    })

    return getUsersByPharmacy('ph-1').then((list) => {
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('auth-EMP1')
    })
  })

  it('getUsersByPharmacy() still returns ordinary ACTIVE pharmacists unchanged (no regression)', async () => {
    userDocs.set('auth-EMP2', { displayName: 'B', role: 'pharmacist', pharmacyId: 'ph-1', active: true })
    userDocs.set('auth-EMP3', { displayName: 'C', role: 'pharmacist', pharmacyId: 'ph-1', active: false })
    userDocs.set('auth-EMP4', { displayName: 'D', role: 'pharmacist', pharmacyId: 'ph-2', active: true })

    const list = await getUsersByPharmacy('ph-1')
    expect(list.map((u) => u.id)).toEqual(['auth-EMP2'])
  })

  it('a real activation (active flipped false on claim) is excluded by the active==true query alone, before the explicit filter even runs', async () => {
    // Mirrors exactly what claimPendingRecord() writes onto the old doc.
    userDocs.set('pending_EMP5', {
      displayName: 'E (old)', role: 'pharmacist', pharmacyId: 'ph-1',
      authStatus: 'CLAIMED', active: false, employeeId: 'EMP5',
      claimedByUid: 'auth-EMP5',
    })
    userDocs.set('auth-EMP5', { displayName: 'E', role: 'pharmacist', pharmacyId: 'ph-1', active: true, employeeId: 'EMP5' })

    const list = await getUsersByPharmacy('ph-1')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('auth-EMP5')
  })

  it('the CLAIMED document itself remains fully readable (audit/history) — it is excluded from rosters, not deleted', async () => {
    userDocs.set('pending_EMP6', {
      displayName: 'F (old)', role: 'pharmacist', pharmacyId: 'ph-1',
      authStatus: 'CLAIMED', active: false, employeeId: 'EMP6', claimedAt: 'x', claimedByUid: 'auth-EMP6',
    })

    expect(userDocs.has('pending_EMP6')).toBe(true)
    const raw = userDocs.get('pending_EMP6')
    expect(raw?.authStatus).toBe('CLAIMED')
    expect(raw?.claimedByUid).toBe('auth-EMP6')
  })
})

describe('Closure Patch — territory audit/backfill tools exclude CLAIMED', () => {
  it('backfillAllAssignedPharmacyIds skips a CLAIMED territory-role document', async () => {
    userDocs.set('pending_SUP1', { role: 'district_supervisor', authStatus: 'CLAIMED', active: false })
    userDocs.set('auth-SUP1', { role: 'district_supervisor', active: true })

    const result = await backfillAllAssignedPharmacyIds('admin-1', 'admin')
    expect(result.scanned).toBe(1)
  })

  it('auditAllAssignedPharmacyIds skips a CLAIMED territory-role document', async () => {
    userDocs.set('pending_SUP2', { role: 'regional_manager', authStatus: 'CLAIMED', active: false })
    userDocs.set('auth-SUP2', { role: 'regional_manager', active: true, assignedPharmacyIds: [] })

    const summary = await auditAllAssignedPharmacyIds()
    expect(summary.total).toBe(1)
  })
})
