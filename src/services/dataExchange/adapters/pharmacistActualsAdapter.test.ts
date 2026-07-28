import { describe, it, expect, vi, beforeEach } from 'vitest'

const entryDocs = new Map<string, Record<string, unknown>>()
// Maintenance Quick Wins — importBatchRef integrity: saveKpiEntry() now
// verifies the referenced import_jobs doc exists before writing. In real
// production this is always true (validateActualsJob()/repo.saveJob()
// persists the job before any commit) — this map + the pre-seeded
// 'job-1' entry below models that same invariant for this adapter-level
// test, which exercises commitJob() directly without the full runner.
const jobDocs   = new Map<string, Record<string, unknown>>()
const auditCalls: Array<Record<string, unknown>> = []

vi.mock('../../firebase', () => ({
  db: {}, auth: { currentUser: { uid: 'admin-1' } },
  COL: { KPI_ENTRIES: 'kpi_entries', AUDIT_LOGS: 'audit_logs', IMPORT_JOBS: 'import_jobs' },
}))

function storeFor(col: string) {
  return col === 'import_jobs' ? jobDocs : entryDocs
}

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn((_db, col, id) => ({ col, id })),
  setDoc:          vi.fn(async (ref: { col: string; id: string }, data: Record<string, unknown>) => {
    const store = storeFor(ref.col)
    store.set(ref.id, { ...(store.get(ref.id) ?? {}), ...data })
  }),
  getDoc:          vi.fn(async (ref: { col: string; id: string }) => {
    const data = storeFor(ref.col).get(ref.id)
    return { exists: () => data != null, data: () => data, id: ref.id }
  }),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../auditService', () => ({
  logAction:    vi.fn(async (p: Record<string, unknown>) => { auditCalls.push(p) }),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
}))

vi.mock('../../historyService', () => ({
  triggerHistorySnapshots: vi.fn(async () => {}),
}))

import { createPharmacistActualsAdapter } from './pharmacistActualsAdapter'
import { createImportJob, runValidation, commitJob } from '../importJobEngine'
import { DEFAULT_KPI_REGISTRY } from '../../../engine/kpiRegistry'
import type { ExistingPharmacistRecord } from './pharmacistsAdapter'
import type { ImportValidationContext, ImportAuthorizationContext } from '../importDomainAdapter'

const vCtx: ImportValidationContext     = { actorUid: 'admin-1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext  = { actorUid: 'admin-1', actorRole: 'admin' }
const ctx = { actorUid: 'admin-1', actorRole: 'admin', jobId: 'job-1' }

const BRANCH_ACTIVE   = { id: 'ph-1', code: 'B1', active: true }
const BRANCH_OTHER     = { id: 'ph-9', code: 'B9', active: true }
const BRANCH_INACTIVE  = { id: 'ph-2', code: 'B2', active: false }

function pharmacist(over: Partial<ExistingPharmacistRecord>): ExistingPharmacistRecord {
  return {
    id: 'user-1', employeeId: 'E100', email: 'p1@example.com', role: 'pharmacist',
    pharmacyId: 'ph-1', authStatus: 'ACTIVE', hasIdentityAmbiguity: false, active: true,
    ...over,
  }
}

function makeDeps(overrides: Partial<{ pharmacists: ExistingPharmacistRecord[] }> = {}) {
  const pharmacists = overrides.pharmacists ?? [pharmacist({})]
  const pharmacistsByEmployeeId = new Map(pharmacists.map((p) => [p.employeeId, p]))
  const pharmacistsByEmail = new Map(pharmacists.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]))
  return {
    actorRole: 'admin',
    existingBranches: [BRANCH_ACTIVE, BRANCH_OTHER, BRANCH_INACTIVE],
    registry: DEFAULT_KPI_REGISTRY,
    pharmacistsByEmployeeId,
    pharmacistsByEmail,
    today: '2026-06-25',
  }
}

beforeEach(() => {
  entryDocs.clear()
  auditCalls.length = 0
  jobDocs.clear()
  jobDocs.set('job-1', { jobId: 'job-1', status: 'READY' }) // pre-seeded: see comment above
})

async function runRow(row: Record<string, unknown>, deps = makeDeps(), actorRole = 'admin') {
  const adapter = createPharmacistActualsAdapter({ ...deps, actorRole })
  const raw = adapter.parseRow(row, 1, { domain: 'PHARMACIST_ACTUALS' })
  const job0 = createImportJob({ jobId: 'job-1', domain: 'PHARMACIST_ACTUALS', createdBy: 'admin-1' })
  const { job, rows } = await runValidation(job0, adapter, [raw], { ...vCtx, actorRole }, { ...aCtx, actorRole })
  return { adapter, job, row: rows[0] }
}

describe('DX-6 — Pharmacist Actuals adapter', () => {
  it('creates a valid pharmacist actual and commits it via the real saveKpiEntry()', async () => {
    const { adapter, job, row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '500' })
    expect(row.classification).toBe('VALID')
    const { result } = await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    expect(result.committed).toBe(1)
    expect(entryDocs.get('user-1_ph-1_2026-06-04')).toMatchObject({ userId: 'user-1', pharmacyId: 'ph-1', date: '2026-06-04', wasfaty: 500, importedViaDataExchange: true, importBatchRef: 'job-1' })
  })

  it('resolves pharmacist identity by employee ID, email, or UID', async () => {
    const { row: byEmployeeId } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' })
    expect(byEmployeeId.classification).toBe('VALID')

    const { row: byEmail } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'p1@example.com', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' })
    expect(byEmail.classification).toBe('VALID')

    const { row: byUid } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'user-1', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' })
    expect(byUid.classification).toBe('VALID')
  })

  it('rejects an unknown pharmacist identifier', async () => {
    const { row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'NOPE', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNKNOWN_PHARMACIST')).toBe(true)
  })

  it('excludes a CLAIMED record — it never appears in the lookup maps, so it reads as unknown', async () => {
    // Simulating CLAIMED exclusion at the source: fetchExistingOnboardingData()
    // never includes a CLAIMED record in pharmacistsByEmployeeId/pharmacistsByEmail
    // in the first place (verified in that module). An empty deps map for this
    // employeeId reproduces exactly that observable behavior here.
    const deps = makeDeps({ pharmacists: [] })
    const { row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' }, deps)
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNKNOWN_PHARMACIST')).toBe(true)
  })

  it('rejects a deactivated pharmacist', async () => {
    const deps = makeDeps({ pharmacists: [pharmacist({ active: false })] })
    const { row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' }, deps)
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'INACTIVE_PHARMACIST')).toBe(true)
  })

  it('flags a pharmacist identity ambiguity as CONFLICT requiring manual review', async () => {
    const deps = makeDeps({ pharmacists: [pharmacist({ hasIdentityAmbiguity: true })] })
    const { row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' }, deps)
    expect(row.classification).toBe('CONFLICT')
    expect(row.issues.some((i) => i.code === 'IDENTITY_REVIEW_REQUIRED')).toBe(true)
  })

  it('rejects a pharmacist/branch mismatch', async () => {
    const { row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B9', 'kpi key': 'wasfaty', 'actual value': '100' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'PHARMACIST_BRANCH_MISMATCH')).toBe(true)
  })

  it('rejects an unknown branch', async () => {
    const { row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'ZZ', 'kpi key': 'wasfaty', 'actual value': '100' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNKNOWN_BRANCH')).toBe(true)
  })

  it('rejects an inactive branch', async () => {
    const deps = makeDeps({ pharmacists: [pharmacist({ pharmacyId: 'ph-2' })] })
    const { row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B2', 'kpi key': 'wasfaty', 'actual value': '100' }, deps)
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'INACTIVE_BRANCH')).toBe(true)
  })

  it('rejects an unknown KPI', async () => {
    const { row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'doesNotExist', 'actual value': '100' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNKNOWN_KPI')).toBe(true)
  })

  it('rejects an archived KPI', async () => {
    const deps = makeDeps()
    deps.registry = { ...DEFAULT_KPI_REGISTRY, archivedKpi: { ...DEFAULT_KPI_REGISTRY.sales, key: 'archivedKpi', lifecycleStage: 'archived' as const } }
    const { row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'archivedKpi', 'actual value': '100' }, deps)
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'ARCHIVED_KPI')).toBe(true)
  })

  it('rejects an invalid date', async () => {
    const { row } = await runRow({ date: 'June 4', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'INVALID_DATE')).toBe(true)
  })

  it('rejects a future-dated actual', async () => {
    const { row } = await runRow({ date: '2026-07-01', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'FUTURE_DATE')).toBe(true)
  })

  it('rejects a negative actual value', async () => {
    const { row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '-5' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'NEGATIVE_ACTUAL_VALUE')).toBe(true)
  })

  it('accepts an explicit zero actual distinctly from a missing one', async () => {
    const { row: zeroRow } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '0' })
    expect(zeroRow.classification).toBe('VALID')
    expect((zeroRow.staged as { value: number }).value).toBe(0)

    const { row: missingRow } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '' })
    expect(missingRow.classification).toBe('ERROR')
  })

  it('detects a duplicate row within the file (same pharmacist+kpi+date)', async () => {
    const deps = makeDeps()
    const adapter = createPharmacistActualsAdapter(deps)
    const rows = [
      { date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' },
      { date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '200' },
    ].map((r, i) => adapter.parseRow(r, i + 1, { domain: 'PHARMACIST_ACTUALS' }))
    const job0 = createImportJob({ jobId: 'job-dup', domain: 'PHARMACIST_ACTUALS', createdBy: 'admin-1' })
    const { rows: staged } = await runValidation(job0, adapter, rows, vCtx, aCtx)
    expect(staged[0].classification).toBe('VALID')
    expect(staged[1].classification).toBe('DUPLICATE')
  })

  it('shows an UPDATE preview with old vs new value, and SKIP when unchanged — never silently overwrites', async () => {
    entryDocs.set('user-1_ph-1_2026-06-04', { userId: 'user-1', pharmacyId: 'ph-1', date: '2026-06-04', wasfaty: 100 })

    const { row: updateRow } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '250' })
    expect(updateRow.classification).toBe('UPDATE')

    const { row: skipRow } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' })
    expect(skipRow.classification).toBe('SKIP')
  })

  it('is idempotent — re-importing the identical file twice never duplicates the document', async () => {
    const { adapter, job, row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '500' })
    await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    const { row: secondRow } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '500' })
    expect(secondRow.classification).toBe('SKIP')
    expect(entryDocs.size).toBe(1)
  })

  it('denies a non-admin actor', async () => {
    const { row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' }, makeDeps(), 'manager')
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNAUTHORIZED_ROW')).toBe(true)
  })

  it('writes an audit entry on commit', async () => {
    const { adapter, job, row } = await runRow({ date: '2026-06-04', 'pharmacist identifier': 'E100', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '500' })
    await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    expect(auditCalls.length).toBeGreaterThan(0)
    expect(auditCalls[0]).toMatchObject({ collection: 'kpi_entries' })
  })
})
