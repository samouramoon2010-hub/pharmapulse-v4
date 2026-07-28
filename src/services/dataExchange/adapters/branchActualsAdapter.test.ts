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

import { createBranchActualsAdapter, normalizeDateInput } from './branchActualsAdapter'
import { createImportJob, runValidation, commitJob } from '../importJobEngine'
import { DEFAULT_KPI_REGISTRY } from '../../../engine/kpiRegistry'
import type { ImportValidationContext, ImportAuthorizationContext } from '../importDomainAdapter'

const vCtx: ImportValidationContext     = { actorUid: 'admin-1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext  = { actorUid: 'admin-1', actorRole: 'admin' }
const ctx = { actorUid: 'admin-1', actorRole: 'admin', jobId: 'job-1' }

const BRANCH_ACTIVE       = { id: 'ph-1', code: 'B1', name: 'Branch One', active: true, managerUid: 'mgr-1' }
const BRANCH_INACTIVE     = { id: 'ph-2', code: 'B2', name: 'Branch Two', active: false, managerUid: 'mgr-2' }
const BRANCH_NO_MANAGER   = { id: 'ph-3', code: 'B3', name: 'Branch Three', active: true, managerUid: null }

beforeEach(() => {
  entryDocs.clear()
  auditCalls.length = 0
  jobDocs.clear()
  jobDocs.set('job-1', { jobId: 'job-1', status: 'READY' }) // pre-seeded: see comment above
})

async function runRow(row: Record<string, unknown>, actorRole = 'admin', today?: string) {
  const adapter = createBranchActualsAdapter({
    actorRole, existingBranches: [BRANCH_ACTIVE, BRANCH_INACTIVE, BRANCH_NO_MANAGER],
    registry: DEFAULT_KPI_REGISTRY, today,
  })
  const raw = adapter.parseRow(row, 1, { domain: 'BRANCH_ACTUALS' })
  const job0 = createImportJob({ jobId: 'job-1', domain: 'BRANCH_ACTUALS', createdBy: 'admin-1' })
  const { job, rows } = await runValidation(job0, adapter, [raw], { ...vCtx, actorRole }, { ...aCtx, actorRole })
  return { adapter, job, row: rows[0] }
}

describe('DX-6 — Branch Actuals adapter', () => {
  it('normalizes common date variants', () => {
    expect(normalizeDateInput('2026-06-04')).toBe('2026-06-04')
    expect(normalizeDateInput('2026/06/04')).toBe('2026-06-04')
    expect(normalizeDateInput('2026-6-4')).toBe('2026-06-04')
    expect(normalizeDateInput('not-a-date')).toBeNull()
  })

  it('creates a valid branch actual and commits it via the real saveKpiEntry(), attributed to managerUid', async () => {
    const { adapter, job, row } = await runRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '500' }, 'admin', '2026-06-25')
    expect(row.classification).toBe('VALID')
    const { result } = await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    expect(result.committed).toBe(1)
    const doc = entryDocs.get('mgr-1_ph-1_2026-06-04')
    expect(doc).toMatchObject({ userId: 'mgr-1', pharmacyId: 'ph-1', date: '2026-06-04', wasfaty: 500, importedViaDataExchange: true, importBatchRef: 'job-1' })
  })

  it('rejects an unknown branch', async () => {
    const { row } = await runRow({ date: '2026-06-04', 'branch code': 'ZZ', 'kpi key': 'wasfaty', 'actual value': '100' }, 'admin', '2026-06-25')
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNKNOWN_BRANCH')).toBe(true)
  })

  it('rejects an inactive branch', async () => {
    const { row } = await runRow({ date: '2026-06-04', 'branch code': 'B2', 'kpi key': 'wasfaty', 'actual value': '100' }, 'admin', '2026-06-25')
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'INACTIVE_BRANCH')).toBe(true)
  })

  it('rejects a branch with no assigned manager', async () => {
    const { row } = await runRow({ date: '2026-06-04', 'branch code': 'B3', 'kpi key': 'wasfaty', 'actual value': '100' }, 'admin', '2026-06-25')
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'BRANCH_HAS_NO_MANAGER')).toBe(true)
  })

  it('rejects an unknown KPI', async () => {
    const { row } = await runRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'doesNotExist', 'actual value': '100' }, 'admin', '2026-06-25')
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNKNOWN_KPI')).toBe(true)
  })

  it('rejects an inactive KPI', async () => {
    const registry = { ...DEFAULT_KPI_REGISTRY, inactiveKpi: { ...DEFAULT_KPI_REGISTRY.sales, key: 'inactiveKpi', isActive: false } }
    const adapter = createBranchActualsAdapter({ actorRole: 'admin', existingBranches: [BRANCH_ACTIVE], registry, today: '2026-06-25' })
    const raw = adapter.parseRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'inactiveKpi', 'actual value': '100' }, 1, { domain: 'BRANCH_ACTUALS' })
    const job0 = createImportJob({ jobId: 'job-2', domain: 'BRANCH_ACTUALS', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'INACTIVE_KPI')).toBe(true)
  })

  it('rejects an archived KPI', async () => {
    const registry = { ...DEFAULT_KPI_REGISTRY, archivedKpi: { ...DEFAULT_KPI_REGISTRY.sales, key: 'archivedKpi', lifecycleStage: 'archived' as const } }
    const adapter = createBranchActualsAdapter({ actorRole: 'admin', existingBranches: [BRANCH_ACTIVE], registry, today: '2026-06-25' })
    const raw = adapter.parseRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'archivedKpi', 'actual value': '100' }, 1, { domain: 'BRANCH_ACTUALS' })
    const job0 = createImportJob({ jobId: 'job-3', domain: 'BRANCH_ACTUALS', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'ARCHIVED_KPI')).toBe(true)
  })

  it('rejects a KPI that is not in production_evaluation', async () => {
    const registry = { ...DEFAULT_KPI_REGISTRY, pilotKpi: { ...DEFAULT_KPI_REGISTRY.sales, key: 'pilotKpi', lifecycleStage: 'pilot_tracking' as const } }
    const adapter = createBranchActualsAdapter({ actorRole: 'admin', existingBranches: [BRANCH_ACTIVE], registry, today: '2026-06-25' })
    const raw = adapter.parseRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'pilotKpi', 'actual value': '100' }, 1, { domain: 'BRANCH_ACTUALS' })
    const job0 = createImportJob({ jobId: 'job-4', domain: 'BRANCH_ACTUALS', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'KPI_NOT_PRODUCTION_EVALUATION')).toBe(true)
  })

  it('rejects a KPI that is not dashboard-enabled', async () => {
    const registry = { ...DEFAULT_KPI_REGISTRY, hiddenKpi: { ...DEFAULT_KPI_REGISTRY.sales, key: 'hiddenKpi', visibility: { ...DEFAULT_KPI_REGISTRY.sales.visibility, dashboardEnabled: false } } }
    const adapter = createBranchActualsAdapter({ actorRole: 'admin', existingBranches: [BRANCH_ACTIVE], registry, today: '2026-06-25' })
    const raw = adapter.parseRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'hiddenKpi', 'actual value': '100' }, 1, { domain: 'BRANCH_ACTUALS' })
    const job0 = createImportJob({ jobId: 'job-5', domain: 'BRANCH_ACTUALS', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'DASHBOARD_IMPORT_NOT_ENABLED')).toBe(true)
  })

  it('rejects an invalid date', async () => {
    const { row } = await runRow({ date: 'June 4', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' }, 'admin', '2026-06-25')
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'INVALID_DATE')).toBe(true)
  })

  it('rejects a future-dated actual', async () => {
    const { row } = await runRow({ date: '2026-07-01', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' }, 'admin', '2026-06-25')
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'FUTURE_DATE')).toBe(true)
  })

  it('rejects a negative actual value', async () => {
    const { row } = await runRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '-5' }, 'admin', '2026-06-25')
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'NEGATIVE_ACTUAL_VALUE')).toBe(true)
  })

  it('accepts an explicit zero actual distinctly from a missing one', async () => {
    const { row: zeroRow } = await runRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '0' }, 'admin', '2026-06-25')
    expect(zeroRow.classification).toBe('VALID')
    expect((zeroRow.staged as { value: number }).value).toBe(0)

    const { row: missingRow } = await runRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '' }, 'admin', '2026-06-25')
    expect(missingRow.classification).toBe('ERROR')
  })

  it('detects a duplicate row within the file (same branch+kpi+date)', async () => {
    const adapter = createBranchActualsAdapter({ actorRole: 'admin', existingBranches: [BRANCH_ACTIVE], registry: DEFAULT_KPI_REGISTRY, today: '2026-06-25' })
    const rows = [
      { date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' },
      { date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '200' },
    ].map((r, i) => adapter.parseRow(r, i + 1, { domain: 'BRANCH_ACTUALS' }))
    const job0 = createImportJob({ jobId: 'job-dup', domain: 'BRANCH_ACTUALS', createdBy: 'admin-1' })
    const { rows: staged } = await runValidation(job0, adapter, rows, vCtx, aCtx)
    expect(staged[0].classification).toBe('VALID')
    expect(staged[1].classification).toBe('DUPLICATE')
  })

  it('shows an UPDATE preview with old vs new value, and SKIP when unchanged — never silently overwrites', async () => {
    entryDocs.set('mgr-1_ph-1_2026-06-04', { userId: 'mgr-1', pharmacyId: 'ph-1', date: '2026-06-04', wasfaty: 100 })

    const { row: updateRow } = await runRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '250' }, 'admin', '2026-06-25')
    expect(updateRow.classification).toBe('UPDATE')

    const { row: skipRow } = await runRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' }, 'admin', '2026-06-25')
    expect(skipRow.classification).toBe('SKIP')
  })

  it('is idempotent — re-importing the identical file twice never duplicates the document or double-counts the value', async () => {
    const { adapter, job, row } = await runRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '500' }, 'admin', '2026-06-25')
    await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    const { row: secondRow } = await runRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '500' }, 'admin', '2026-06-25')
    expect(secondRow.classification).toBe('SKIP')
    expect(entryDocs.size).toBe(1)
  })

  it('denies a non-admin actor', async () => {
    const { row } = await runRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '100' }, 'manager', '2026-06-25')
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNAUTHORIZED_ROW')).toBe(true)
  })

  it('writes an audit entry on commit, attributed to the importing admin as actor', async () => {
    const { adapter, job, row } = await runRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '500' }, 'admin', '2026-06-25')
    await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    expect(auditCalls.length).toBeGreaterThan(0)
    expect(auditCalls[0]).toMatchObject({ collection: 'kpi_entries', userId: 'admin-1' })
  })

  it('never writes the entry under the admin actor\'s own uid — always the branch managerUid', async () => {
    const { adapter, job, row } = await runRow({ date: '2026-06-04', 'branch code': 'B1', 'kpi key': 'wasfaty', 'actual value': '500' }, 'admin', '2026-06-25')
    await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    expect(entryDocs.has('admin-1_ph-1_2026-06-04')).toBe(false)
    expect(entryDocs.get('mgr-1_ph-1_2026-06-04')).toMatchObject({ userId: 'mgr-1' })
  })
})
