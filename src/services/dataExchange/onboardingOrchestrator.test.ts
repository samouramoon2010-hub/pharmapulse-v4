// ============================================================
// Onboarding Orchestrator — multi-sheet + dependency-order tests
// (DX-2/DX-3, Part 6, 7, 11)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const addDocCalls: Array<{ data: Record<string, unknown> }> = []
const setDocCalls: Array<{ id: string; data: Record<string, unknown> }> = []
const updateDocCalls: Array<{ id: string; data: Record<string, unknown> }> = []

vi.mock('../firebase', () => ({
  db: {},
  COL: { USERS: 'users', PHARMACIES: 'pharmacies', DISTRICTS: 'districts', REGIONS: 'regions', AUDIT_LOGS: 'audit_logs' },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(async (_ref, data) => { addDocCalls.push({ data }); return { id: `new-${addDocCalls.length}` } }),
  setDoc: vi.fn(async (ref, data) => { setDocCalls.push({ id: ref.id, data }) }),
  updateDoc: vi.fn(async (ref, data) => { updateDocCalls.push({ id: ref.id, data }) }),
  getDoc: vi.fn(async (ref: { collection: string }) => {
    if (ref.collection === 'districts') return { exists: () => true, data: () => ({ pharmacyIds: [], regionId: 'region-1', supervisorUid: null }) }
    if (ref.collection === 'users')     return { exists: () => true, data: () => ({ role: 'pharmacist', pharmacyId: null, assignedPharmacyIds: [] }) }
    return { exists: () => false, data: () => null }
  }),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../auditService', () => ({ logAction: vi.fn(async () => {}), AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' } }))
vi.mock('../territorySync', () => ({ recomputeAssignedPharmacyIds: vi.fn(async () => {}) }))

import { resolveSheetMappings, detectSheetDomain, runOrganizationOnboardingJob } from './onboardingOrchestrator'
import type { GuardContext } from '../security/accessGuard'

const ADMIN: GuardContext = { uid: 'admin-1', role: 'admin', pharmacyId: null }

beforeEach(() => { addDocCalls.length = 0; setDocCalls.length = 0; updateDocCalls.length = 0 })

describe('DX-2/DX-3 — Multi-sheet detection (Part 7)', () => {
  it('detects domains from EN and AR sheet names', () => {
    expect(detectSheetDomain('Branches')).toBe('BRANCH')
    expect(detectSheetDomain('الفروع')).toBe('BRANCH')
    expect(detectSheetDomain('Pharmacists')).toBe('PHARMACIST')
    expect(detectSheetDomain('Unrelated Sheet')).toBeNull()
  })

  it('falls back to manual mapping for an unresolved sheet name', () => {
    const mappings = resolveSheetMappings(['Sheet1', 'Branches'], { Sheet1: 'GROUP' })
    expect(mappings).toEqual([
      { sheetName: 'Sheet1', domain: 'GROUP' },
      { sheetName: 'Branches', domain: 'BRANCH' },
    ])
  })

  it('does not silently guess a domain it cannot resolve', () => {
    const mappings = resolveSheetMappings(['Mystery Sheet'])
    expect(mappings[0].domain).toBeNull()
  })
})

describe('DX-2/DX-3 — Dependency-ordered onboarding job (Part 6, 11)', () => {
  it('commits Groups -> Branches -> Pharmacists -> Assignments in order, resolving each domain against the previous domain\'s committed identities', async () => {
    const result = await runOrganizationOnboardingJob({
      jobIdPrefix: 'onboard-1', guardCtx: ADMIN, actorRole: 'admin',
      rows: {
        groupRows:      [{ code: 'RUH-N', name: 'North Riyadh', region: 'RUH' }],
        branchRows:     [{ code: '7001', name: 'New Branch', group: 'RUH-N' }],
        pharmacistRows: [{ 'employee id': 'EMP1', name: 'Sara', role: 'pharmacist', branch: '7001' }],
        assignmentRows: [{ 'employee id': 'EMP1', branch: '7001' }],
      },
      existing: {
        groups: [], regions: [{ id: 'region-1', code: 'RUH' }], branches: [],
        pharmacistsByEmployeeId: new Map(), pharmacistsByEmail: new Map(),
        primaryAssignmentByEmployeeId: new Map(),
      },
    })

    expect(result.groups?.result.committed).toBe(1)
    expect(result.branches?.result.committed).toBe(1)
    expect(result.pharmacists?.result.committed).toBe(1)
    expect(result.assignments?.result.committed).toBe(1)

    // The branch row must have resolved the group created earlier in
    // THIS SAME job (not a pre-existing one) before being committed.
    expect(result.branches?.rows[0].classification).toBe('VALID')
    // The assignment must have used the pharmacist created earlier in
    // this same job (synthetic pending_EMP1 doc id).
    expect(updateDocCalls.some((c) => c.id === 'pending_EMP1')).toBe(true)
  })

  it('blocks a Branch row whose Group failed to commit in the same job, with a clear dependency reason', async () => {
    const result = await runOrganizationOnboardingJob({
      jobIdPrefix: 'onboard-2', guardCtx: ADMIN, actorRole: 'admin',
      rows: {
        groupRows:  [{ code: 'BAD', name: 'Bad Group', region: 'NONEXISTENT-REGION' }],
        branchRows: [{ code: '7002', name: 'Blocked Branch', group: 'BAD' }],
      },
      existing: {
        groups: [], regions: [], branches: [],
        pharmacistsByEmployeeId: new Map(), pharmacistsByEmail: new Map(),
        primaryAssignmentByEmployeeId: new Map(),
      },
    })

    expect(result.groups?.rows[0].classification).toBe('ERROR')   // unknown region — group never committed
    expect(result.branches?.rows[0].classification).toBe('ERROR')
    expect(result.branches?.rows[0].issues.some((i) => i.code === 'DEPENDENCY_BLOCKED')).toBe(true)
  })

  it('blocks a Pharmacist row whose Branch failed in the same job', async () => {
    const result = await runOrganizationOnboardingJob({
      jobIdPrefix: 'onboard-3', guardCtx: ADMIN, actorRole: 'admin',
      rows: {
        branchRows:     [{ code: '7003', group: 'NOPE' }],   // missing name -> ERROR, never committed
        pharmacistRows: [{ 'employee id': 'EMP2', name: 'X', role: 'pharmacist', branch: '7003' }],
      },
      existing: {
        groups: [], regions: [], branches: [],
        pharmacistsByEmployeeId: new Map(), pharmacistsByEmail: new Map(),
        primaryAssignmentByEmployeeId: new Map(),
      },
    })

    expect(result.branches?.rows[0].classification).toBe('ERROR')
    expect(result.pharmacists?.rows[0].classification).toBe('ERROR')
    expect(result.pharmacists?.rows[0].issues.some((i) => i.code === 'DEPENDENCY_BLOCKED')).toBe(true)
  })

  it('blocks an Assignment row whose Pharmacist failed in the same job', async () => {
    const result = await runOrganizationOnboardingJob({
      jobIdPrefix: 'onboard-4', guardCtx: ADMIN, actorRole: 'admin',
      rows: {
        pharmacistRows: [{ 'employee id': 'EMP3', name: 'X', role: 'admin' }],   // disallowed role -> ERROR
        assignmentRows: [{ 'employee id': 'EMP3', branch: 'whatever' }],
      },
      existing: {
        groups: [], regions: [], branches: [],
        pharmacistsByEmployeeId: new Map(), pharmacistsByEmail: new Map(),
        primaryAssignmentByEmployeeId: new Map(),
      },
    })

    expect(result.pharmacists?.rows[0].classification).toBe('ERROR')
    expect(result.assignments?.rows[0].classification).toBe('ERROR')
    expect(result.assignments?.rows[0].issues.some((i) => i.code === 'DEPENDENCY_BLOCKED')).toBe(true)
  })

  it('a partially failed domain does not corrupt an already-committed parent domain — exact counts per domain', async () => {
    const result = await runOrganizationOnboardingJob({
      jobIdPrefix: 'onboard-5', guardCtx: ADMIN, actorRole: 'admin',
      rows: {
        groupRows: [
          { code: 'OK-1', name: 'Good Group', region: 'RUH' },
          { code: 'BAD-1', name: 'Bad Group', region: 'GHOST' },
        ],
      },
      existing: {
        groups: [], regions: [{ id: 'region-1', code: 'RUH' }], branches: [],
        pharmacistsByEmployeeId: new Map(), pharmacistsByEmail: new Map(),
        primaryAssignmentByEmployeeId: new Map(),
      },
    })

    expect(result.groups?.result.committed).toBe(1)
    expect(result.groups?.rows.find((r) => r.identityKey === 'OK-1')?.state).toBe('COMMITTED')
    expect(result.groups?.rows.find((r) => r.classification === 'ERROR')).toBeTruthy()
  })
})
