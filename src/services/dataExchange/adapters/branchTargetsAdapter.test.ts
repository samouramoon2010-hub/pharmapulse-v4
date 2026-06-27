import { describe, it, expect, vi, beforeEach } from 'vitest'

const targetDocs = new Map<string, Record<string, unknown>>()
const auditCalls: Array<Record<string, unknown>> = []

vi.mock('../../firebase', () => ({
  db: {}, auth: { currentUser: { uid: 'admin-1' } },
  COL: { TARGETS: 'targets', AUDIT_LOGS: 'audit_logs' },
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db, _col, id) => ({ id })),
  setDoc: vi.fn(async (ref: { id: string }, data: Record<string, unknown>) => {
    targetDocs.set(ref.id, { ...(targetDocs.get(ref.id) ?? {}), ...data })
  }),
  getDoc: vi.fn(async (ref: { id: string }) => {
    const data = targetDocs.get(ref.id)
    return { exists: () => data != null, data: () => data, id: ref.id }
  }),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../auditService', () => ({
  logAction: vi.fn(async (p: Record<string, unknown>) => { auditCalls.push(p) }),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
}))

import { createBranchTargetsAdapter, normalizeMonthInput } from './branchTargetsAdapter'
import { createImportJob, runValidation, commitJob } from '../importJobEngine'
import { DEFAULT_KPI_REGISTRY } from '../../../engine/kpiRegistry'
import type { ImportValidationContext, ImportAuthorizationContext } from '../importDomainAdapter'

const vCtx: ImportValidationContext = { actorUid: 'admin-1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext = { actorUid: 'admin-1', actorRole: 'admin' }
const ctx = { actorUid: 'admin-1', actorRole: 'admin', jobId: 'job-1' }

const BRANCH_ACTIVE   = { id: 'ph-1', code: 'B1', name: 'Branch One', active: true }
const BRANCH_INACTIVE = { id: 'ph-2', code: 'B2', name: 'Branch Two', active: false }

beforeEach(() => { targetDocs.clear(); auditCalls.length = 0 })

async function runRow(row: Record<string, unknown>, actorRole = 'admin') {
  const adapter = createBranchTargetsAdapter({ actorRole, existingBranches: [BRANCH_ACTIVE, BRANCH_INACTIVE], registry: DEFAULT_KPI_REGISTRY })
  const raw = adapter.parseRow(row, 1, { domain: 'BRANCH_TARGET' })
  const job0 = createImportJob({ jobId: 'job-1', domain: 'BRANCH_TARGET', createdBy: 'admin-1' })
  const { job, rows } = await runValidation(job0, adapter, [raw], { ...vCtx, actorRole }, { ...aCtx, actorRole })
  return { adapter, job, row: rows[0] }
}

describe('DX-5a — Branch Targets adapter', () => {
  it('normalizes common month variants', () => {
    expect(normalizeMonthInput('2026-06')).toBe('2026-06')
    expect(normalizeMonthInput('2026/06')).toBe('2026-06')
    expect(normalizeMonthInput('2026-6')).toBe('2026-06')
    expect(normalizeMonthInput('not-a-month')).toBeNull()
  })

  it('creates a valid branch target and commits it via the real saveTarget()', async () => {
    const { adapter, job, row } = await runRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '300000' })
    expect(row.classification).toBe('VALID')
    const { result } = await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    expect(result.committed).toBe(1)
    expect(targetDocs.get('ph-1_2026-06')).toMatchObject({ pharmacyId: 'ph-1', month: '2026-06', wasfatyTarget: 300000 })
  })

  it('rejects an unknown branch', async () => {
    const { row } = await runRow({ month: '2026-06', 'branch code': 'ZZ', 'kpi key': 'wasfaty', 'target value': '100' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNKNOWN_BRANCH')).toBe(true)
  })

  it('rejects an inactive branch', async () => {
    const { row } = await runRow({ month: '2026-06', 'branch code': 'B2', 'kpi key': 'wasfaty', 'target value': '100' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'INACTIVE_BRANCH')).toBe(true)
  })

  it('rejects an unknown KPI', async () => {
    const { row } = await runRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'doesNotExist', 'target value': '100' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNKNOWN_KPI')).toBe(true)
  })

  it('rejects a KPI that is not target-enabled', async () => {
    const registry = { ...DEFAULT_KPI_REGISTRY, notTargetable: { ...DEFAULT_KPI_REGISTRY.sales, key: 'notTargetable', visibility: { ...DEFAULT_KPI_REGISTRY.sales.visibility, targetInputEnabled: false } } }
    const adapter = createBranchTargetsAdapter({ actorRole: 'admin', existingBranches: [BRANCH_ACTIVE], registry })
    const raw = adapter.parseRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'notTargetable', 'target value': '100' }, 1, { domain: 'BRANCH_TARGET' })
    const job0 = createImportJob({ jobId: 'job-2', domain: 'BRANCH_TARGET', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'TARGET_NOT_ENABLED')).toBe(true)
  })

  it('rejects an archived KPI', async () => {
    const registry = { ...DEFAULT_KPI_REGISTRY, archivedKpi: { ...DEFAULT_KPI_REGISTRY.sales, key: 'archivedKpi', lifecycleStage: 'archived' as const, visibility: { ...DEFAULT_KPI_REGISTRY.sales.visibility, targetInputEnabled: true } } }
    const adapter = createBranchTargetsAdapter({ actorRole: 'admin', existingBranches: [BRANCH_ACTIVE], registry })
    const raw = adapter.parseRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'archivedKpi', 'target value': '100' }, 1, { domain: 'BRANCH_TARGET' })
    const job0 = createImportJob({ jobId: 'job-3', domain: 'BRANCH_TARGET', createdBy: 'admin-1' })
    const { rows } = await runValidation(job0, adapter, [raw], vCtx, aCtx)
    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'ARCHIVED_KPI')).toBe(true)
  })

  it('rejects an invalid month', async () => {
    const { row } = await runRow({ month: 'June 2026', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '100' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'INVALID_MONTH')).toBe(true)
  })

  it('rejects a negative target value', async () => {
    const { row } = await runRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '-5' })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'NEGATIVE_TARGET_VALUE')).toBe(true)
  })

  it('accepts an explicit zero target distinctly from a missing one', async () => {
    const { row: zeroRow } = await runRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '0' })
    expect(zeroRow.classification).toBe('VALID')
    expect((zeroRow.staged as { value: number }).value).toBe(0)

    const { row: missingRow } = await runRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '' })
    expect(missingRow.classification).toBe('ERROR')
  })

  it('detects a duplicate row within the file (same branch+kpi+month)', async () => {
    const adapter = createBranchTargetsAdapter({ actorRole: 'admin', existingBranches: [BRANCH_ACTIVE], registry: DEFAULT_KPI_REGISTRY })
    const rows = [
      { month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '100' },
      { month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '200' },
    ].map((r, i) => adapter.parseRow(r, i + 1, { domain: 'BRANCH_TARGET' }))
    const job0 = createImportJob({ jobId: 'job-dup', domain: 'BRANCH_TARGET', createdBy: 'admin-1' })
    const { rows: staged } = await runValidation(job0, adapter, rows, vCtx, aCtx)
    expect(staged[0].classification).toBe('VALID')
    expect(staged[1].classification).toBe('DUPLICATE')
  })

  it('shows an UPDATE preview with old vs new value, and SKIP when unchanged', async () => {
    targetDocs.set('ph-1_2026-06', { pharmacyId: 'ph-1', month: '2026-06', wasfatyTarget: 100 })

    const { row: updateRow } = await runRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '250' })
    expect(updateRow.classification).toBe('UPDATE')

    const { row: skipRow } = await runRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '100' })
    expect(skipRow.classification).toBe('SKIP')
  })

  it('is idempotent — re-importing the identical file twice never duplicates the document', async () => {
    const { adapter, job, row } = await runRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '300000' })
    await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    const { row: secondRow } = await runRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '300000' })
    expect(secondRow.classification).toBe('SKIP')
    expect(targetDocs.size).toBe(1)
  })

  it('denies a non-admin actor', async () => {
    const { row } = await runRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '100' }, 'manager')
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNAUTHORIZED_ROW')).toBe(true)
  })

  it('writes an audit entry on commit', async () => {
    const { adapter, job, row } = await runRow({ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '300000' })
    await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    expect(auditCalls.length).toBeGreaterThan(0)
    expect(auditCalls[0]).toMatchObject({ collection: 'targets' })
  })
})
