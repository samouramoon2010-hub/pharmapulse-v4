import { describe, it, expect, vi, beforeEach } from 'vitest'

const personalTargetDocs = new Map<string, Record<string, unknown>>()
const auditCalls: Array<Record<string, unknown>> = []

vi.mock('../../firebase', () => ({
  db: {},
  COL: { PERSONAL_TARGETS: 'personal_targets', AUDIT_LOGS: 'audit_logs' },
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db, _col, id) => ({ id })),
  setDoc: vi.fn(async (ref: { id: string }, data: Record<string, unknown>) => {
    personalTargetDocs.set(ref.id, { ...(personalTargetDocs.get(ref.id) ?? {}), ...data })
  }),
  getDoc: vi.fn(async (ref: { id: string }) => {
    const data = personalTargetDocs.get(ref.id)
    return { exists: () => data != null, data: () => data, id: ref.id }
  }),
  query: vi.fn(() => ({})), where: vi.fn(() => ({})), orderBy: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}), getDocs: vi.fn(async () => ({ docs: [] })),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn(async () => {}) })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../auditService', () => ({
  logAction: vi.fn(async (p: Record<string, unknown>) => { auditCalls.push(p) }),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
}))

import { createPharmacistTargetsAdapter } from './pharmacistTargetsAdapter'
import { createImportJob, runValidation, commitJob } from '../importJobEngine'
import { DEFAULT_KPI_REGISTRY } from '../../../engine/kpiRegistry'
import type { ExistingPharmacistRecord } from './pharmacistsAdapter'
import type { ImportValidationContext, ImportAuthorizationContext } from '../importDomainAdapter'

const vCtx: ImportValidationContext = { actorUid: 'admin-1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext = { actorUid: 'admin-1', actorRole: 'admin' }
const ctx = { actorUid: 'admin-1', actorRole: 'admin', jobId: 'job-1' }

const BRANCH = { id: 'ph-1', code: 'B1', active: true }
const OTHER_BRANCH = { id: 'ph-2', code: 'B2', active: true }

const ACTIVE_PHARMACIST: ExistingPharmacistRecord = {
  id: 'auth-emp1', employeeId: 'EMP1', email: 'emp1@x.com', role: 'pharmacist',
  pharmacyId: 'ph-1', authStatus: 'ACTIVE', active: true,
}
const INACTIVE_PHARMACIST: ExistingPharmacistRecord = {
  id: 'auth-emp2', employeeId: 'EMP2', email: 'emp2@x.com', role: 'pharmacist',
  pharmacyId: 'ph-1', authStatus: 'ACTIVE', active: false,
}
const AMBIGUOUS_PHARMACIST: ExistingPharmacistRecord = {
  id: 'pending_EMP3', employeeId: 'EMP3', email: null, role: 'pharmacist',
  pharmacyId: 'ph-1', authStatus: 'PENDING_INVITATION', active: true, hasIdentityAmbiguity: true,
}

function buildDeps(actorRole = 'admin') {
  return {
    actorRole,
    existingBranches: [BRANCH, OTHER_BRANCH],
    registry: DEFAULT_KPI_REGISTRY,
    pharmacistsByEmployeeId: new Map([
      ['EMP1', ACTIVE_PHARMACIST], ['EMP2', INACTIVE_PHARMACIST], ['EMP3', AMBIGUOUS_PHARMACIST],
    ]),
    pharmacistsByEmail: new Map([['emp1@x.com', ACTIVE_PHARMACIST]]),
  }
}

beforeEach(() => { personalTargetDocs.clear(); auditCalls.length = 0 })

async function runRow(row: Record<string, unknown>, actorRole = 'admin') {
  const adapter = createPharmacistTargetsAdapter(buildDeps(actorRole))
  const raw = adapter.parseRow(row, 1, { domain: 'PHARMACIST_TARGET' })
  const job0 = createImportJob({ jobId: 'job-1', domain: 'PHARMACIST_TARGET', createdBy: 'admin-1' })
  const { job, rows } = await runValidation(job0, adapter, [raw], { ...vCtx, actorRole }, { ...aCtx, actorRole })
  return { adapter, job, row: rows[0] }
}

describe('DX-5b — Pharmacist Targets adapter', () => {
  it('resolves an active pharmacist by employee ID and commits via the real savePersonalTarget()', async () => {
    const { adapter, job, row } = await runRow({ month: '2026-06', 'pharmacist identifier': 'EMP1', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '100000' })
    expect(row.classification).toBe('VALID')
    const { result } = await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    expect(result.committed).toBe(1)
    expect(personalTargetDocs.get('auth-emp1_ph-1_2026-06')).toMatchObject({
      userId: 'auth-emp1', pharmacyId: 'ph-1', month: '2026-06', targets: { wasfatyTarget: 100000 },
    })
  })

  it('resolves a pharmacist by email when employee ID is not given', async () => {
    const { row } = await runRow({ month: '2026-06', 'pharmacist identifier': 'emp1@x.com', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '1000' })
    expect(row.classification).toBe('VALID')
  })

  it('rejects an unknown pharmacist identifier', async () => {
    const { row } = await runRow({ month: '2026-06', 'pharmacist identifier': 'GHOST', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '1000' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNKNOWN_PHARMACIST')).toBe(true)
  })

  it('a CLAIMED record never resolves — it is simply absent from the lookup maps, read as unknown', async () => {
    // fetchExistingOnboardingData() already excludes CLAIMED docs from the
    // maps this adapter consumes — simulate that by using an identifier
    // that ONLY ever existed as a CLAIMED record (never in the deps maps).
    const { row } = await runRow({ month: '2026-06', 'pharmacist identifier': 'EMP_CLAIMED_OLD', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '1000' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNKNOWN_PHARMACIST')).toBe(true)
  })

  it('rejects an inactive pharmacist', async () => {
    const { row } = await runRow({ month: '2026-06', 'pharmacist identifier': 'EMP2', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '1000' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'INACTIVE_PHARMACIST')).toBe(true)
  })

  it('flags an identity-ambiguous pharmacist as CONFLICT, requiring manual review', async () => {
    const { row } = await runRow({ month: '2026-06', 'pharmacist identifier': 'EMP3', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '1000' })
    expect(row.classification).toBe('CONFLICT')
  })

  it('rejects a pharmacist/branch mismatch', async () => {
    const { row } = await runRow({ month: '2026-06', 'pharmacist identifier': 'EMP1', 'branch code': 'B2', 'kpi key': 'wasfaty', 'target value': '1000' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'PHARMACIST_BRANCH_MISMATCH')).toBe(true)
  })

  it('detects a duplicate row within the file (same pharmacist+branch+month+kpi)', async () => {
    const adapter = createPharmacistTargetsAdapter(buildDeps())
    const rows = [
      { month: '2026-06', 'pharmacist identifier': 'EMP1', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '100' },
      { month: '2026-06', 'pharmacist identifier': 'EMP1', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '200' },
    ].map((r, i) => adapter.parseRow(r, i + 1, { domain: 'PHARMACIST_TARGET' }))
    const job0 = createImportJob({ jobId: 'job-dup', domain: 'PHARMACIST_TARGET', createdBy: 'admin-1' })
    const { rows: staged } = await runValidation(job0, adapter, rows, vCtx, aCtx)
    expect(staged[0].classification).toBe('VALID')
    expect(staged[1].classification).toBe('DUPLICATE')
  })

  it('accumulates multiple KPI rows for the same pharmacist+month into one doc without clobbering', async () => {
    const adapter = createPharmacistTargetsAdapter(buildDeps())
    const job0 = createImportJob({ jobId: 'job-multi', domain: 'PHARMACIST_TARGET', createdBy: 'admin-1' })
    const rawRows = [
      { month: '2026-06', 'pharmacist identifier': 'EMP1', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '100000' },
      { month: '2026-06', 'pharmacist identifier': 'EMP1', 'branch code': 'B1', 'kpi key': 'basket', 'target value': '50' },
    ].map((r, i) => adapter.parseRow(r, i + 1, { domain: 'PHARMACIST_TARGET' }))
    const { job, rows } = await runValidation(job0, adapter, rawRows, vCtx, aCtx)
    expect(rows.every((r) => r.classification === 'VALID')).toBe(true)
    await commitJob(job, adapter, rows, ctx, { chunkSize: 1 })

    const doc = personalTargetDocs.get('auth-emp1_ph-1_2026-06')
    expect(doc?.targets).toEqual({ wasfatyTarget: 100000, basketTarget: 50 })
  })

  it('is idempotent — re-importing the identical file twice never duplicates the document', async () => {
    const { adapter, job, row } = await runRow({ month: '2026-06', 'pharmacist identifier': 'EMP1', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '100000' })
    await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    const { row: secondRow } = await runRow({ month: '2026-06', 'pharmacist identifier': 'EMP1', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '100000' })
    expect(secondRow.classification).toBe('SKIP')
    expect(personalTargetDocs.size).toBe(1)
  })

  it('denies a non-admin actor', async () => {
    const { row } = await runRow({ month: '2026-06', 'pharmacist identifier': 'EMP1', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '1000' }, 'manager')
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNAUTHORIZED_ROW')).toBe(true)
  })

  it('writes an audit entry on commit, and the new doc starts as draft', async () => {
    const { adapter, job, row } = await runRow({ month: '2026-06', 'pharmacist identifier': 'EMP1', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '100000' })
    await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    expect(auditCalls.length).toBeGreaterThan(0)
    expect(personalTargetDocs.get('auth-emp1_ph-1_2026-06')).toMatchObject({ status: 'draft' })
  })
})
