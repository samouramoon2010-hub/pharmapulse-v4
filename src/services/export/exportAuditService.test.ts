import { describe, it, expect, vi, beforeEach } from 'vitest'

const { logActionMock, docsMock } = vi.hoisted(() => ({
  logActionMock: vi.fn(async (_params: Record<string, unknown>) => {}),
  docsMock: [] as Array<{ data: () => Record<string, unknown> }>,
}))

vi.mock('../firebase', () => ({ db: {}, COL: { AUDIT_LOGS: 'audit_logs' } }))
vi.mock('../auditService', () => ({
  logAction: logActionMock,
  AUDIT_ACTION: { EXPORT: 'export' },
}))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: docsMock })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
}))

import { recordExportAudit, listRecentExportAudits } from './exportAuditService'
import type { ExportAuditRecord } from './exportTypes'

const RECORD: ExportAuditRecord = {
  templateId: 'branch-performance', templateName: 'Branch Performance Workbook',
  actorUid: 'admin-1', actorRole: 'admin', scopeLabel: 'Branch B001', format: 'xlsx',
  generatedAt: '2026-06-15T00:00:00.000Z', rowCount: 5, workbookVersion: '1.0',
  status: 'SUCCESS', fileName: 'PharmaPulse_branch-performance_B001_2026-06-15.xlsx',
}

describe('DX-10 — Export Audit Service', () => {
  beforeEach(() => {
    logActionMock.mockClear()
    docsMock.length = 0
  })

  it('recordExportAudit calls the existing logAction() — no new Firestore collection', async () => {
    await recordExportAudit(RECORD)
    expect(logActionMock).toHaveBeenCalledTimes(1)
    const call = logActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(call.action).toBe('export')
    expect(call.collection).toBe('export')
    expect(call.userId).toBe('admin-1')
  })

  it('never persists workbook contents or raw row data — only the documented metadata fields', async () => {
    await recordExportAudit(RECORD)
    const call = logActionMock.mock.calls[0][0] as Record<string, unknown>
    const metaKeys = Object.keys(call.meta as Record<string, unknown>)
    expect(metaKeys).toEqual(['templateId', 'templateName', 'scopeLabel', 'format', 'generatedAt', 'rowCount', 'workbookVersion', 'status', 'failureCategory', 'fileName'])
    expect(call.before).toBeUndefined()
    expect(call.after).toBeUndefined()
  })

  it('a failed export records its failureCategory', async () => {
    await recordExportAudit({ ...RECORD, status: 'BLOCKED', failureCategory: 'ROW_LIMIT_EXCEEDED' })
    const call = logActionMock.mock.calls[0][0] as Record<string, unknown>
    expect((call.meta as Record<string, unknown>).failureCategory).toBe('ROW_LIMIT_EXCEEDED')
  })

  it('listRecentExportAudits reconstructs ExportAuditRecord from logAction\'s stored shape', async () => {
    docsMock.push({ data: () => ({ userId: 'admin-1', userRole: 'admin', meta: { templateId: 'branch-performance', templateName: 'X', scopeLabel: 'S', format: 'xlsx', generatedAt: 'g', rowCount: 3, workbookVersion: '1.0', status: 'SUCCESS', fileName: 'f.xlsx' } }) })
    const results = await listRecentExportAudits(10)
    expect(results).toHaveLength(1)
    expect(results[0].actorUid).toBe('admin-1')
    expect(results[0].rowCount).toBe(3)
  })

  it('an empty audit_logs result returns an empty array, never throws', async () => {
    const results = await listRecentExportAudits(10)
    expect(results).toEqual([])
  })
})
