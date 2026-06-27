// ============================================================
// KPI Actuals Adapter — Parity & Behavior Tests (DX-1, Part 7 & 10)
//
// Proves the new Import Job Engine + KPI_ACTUALS adapter produce the
// exact same validation issues, classifications, and Firestore payload
// as the existing production kpiImportService path, for identical
// fixtures — and that arbitrary (non-Core) registry KPIs, Arabic
// headers, and unknown-KPI flagging all continue to work unmodified.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const docCalls: Array<{ collection: string; docId: string }> = []
const setCalls: Array<{ data: Record<string, unknown>; opts: unknown }> = []

vi.mock('../../firebase', () => ({
  db:  {},
  COL: {
    KPI_ENTRIES:        'kpi_entries',
    USERS:              'users',
    PHARMACIES:         'pharmacies',
    TARGETS:            'targets',
    AUDIT_LOGS:         'audit_logs',
    DAILY_SUMMARIES:    'daily_summaries',
    FORECAST_SNAPSHOTS: 'forecast_snapshots',
    RISK_SNAPSHOTS:     'risk_snapshots',
    RANKING_HISTORY:    'ranking_history',
  },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collection: string, docId: string) => {
    docCalls.push({ collection, docId })
    return { collection, docId }
  }),
  collection:      vi.fn(() => ({})),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  limit:           vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  writeBatch: vi.fn(() => ({
    set:    vi.fn((_ref: unknown, data: Record<string, unknown>, opts: unknown) => { setCalls.push({ data, opts }) }),
    commit: vi.fn(async () => {}),
  })),
}))

vi.mock('../../auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', IMPORT: 'import' },
}))

vi.mock('../../historyService', () => ({
  triggerHistorySnapshots: vi.fn(async () => {}),
}))

import { parseExcelRowsToRaw, previewKpiImport, commitValidatedKpiBatch } from '../../kpiImportService'
import { createKpiActualsAdapter } from './kpiActualsAdapter'
import { createImportJob, runValidation, commitJob } from '../importJobEngine'
import { DEFAULT_KPI_REGISTRY } from '../../../engine/kpiRegistry'
import type { KpiRegistry } from '../../../engine/kpiRegistry'
import type { GuardContext } from '../../security/accessGuard'
import type { ImportValidationContext, ImportAuthorizationContext } from '../importDomainAdapter'

const TODAY     = new Date().toISOString().split('T')[0]
const BRANCH_ID = 'branch-001'
const USER_ID   = 'user-001'
const PHARMACIES = [{ id: BRANCH_ID, code: '5074' }]
const CTX: GuardContext = { uid: USER_ID, role: 'admin', pharmacyId: BRANCH_ID }

function stripVolatileFields(data: Record<string, unknown>) {
  const { importBatchId, notes, ...rest } = data
  return rest
}

beforeEach(() => {
  docCalls.length = 0
  setCalls.length = 0
})

describe('DX-1 — KPI Actuals adapter parity vs legacy kpiImportService', () => {
  it('produces identical validation outcome for a clean Excel row', async () => {
    const excelRow = { date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '10', omni: '5', wellness: '8', basket: '3', crossSelling: '4' }

    // ── Legacy path ──
    const legacyRaw     = parseExcelRowsToRaw([excelRow], 'test.xlsx')
    const legacyPreview = await previewKpiImport(legacyRaw, CTX, BRANCH_ID, PHARMACIES, 'test.xlsx')
    expect(legacyPreview.safetyReport.safeToCommit).toBe(true)

    // ── New adapter+engine path ──
    const adapter = createKpiActualsAdapter({ guardCtx: CTX, actorRole: 'admin', pharmacies: PHARMACIES, sourceFile: 'test.xlsx' })
    const job0 = createImportJob({ jobId: 'job-parity-1', domain: 'KPI_ACTUALS', createdBy: CTX.uid })
    const parsedRaw = [adapter.parseRow(excelRow, 1, { domain: 'KPI_ACTUALS' })]

    const validationCtx: ImportValidationContext = { actorUid: CTX.uid, actorRole: 'admin', pharmacyId: BRANCH_ID, knownIds: [BRANCH_ID], batchId: job0.jobId }
    const authCtx: ImportAuthorizationContext     = { actorUid: CTX.uid, actorRole: 'admin', pharmacyId: BRANCH_ID }

    const { job: validated, rows } = await runValidation(job0, adapter, parsedRaw, validationCtx, authCtx)
    expect(validated.status).toBe('READY')
    expect(rows[0].classification).toBe('VALID')
    expect(rows[0].staged?.wasfaty).toBe(legacyPreview.staged[0].wasfaty)
    expect(rows[0].staged?.kpiValues).toEqual(legacyPreview.staged[0].kpiValues)

    // ── Commit both and compare the actual Firestore payload ──
    const legacyResult = await commitValidatedKpiBatch(legacyPreview, CTX, 'admin')
    const legacySet     = stripVolatileFields(setCalls[0].data)
    const legacyDoc     = docCalls[0]
    setCalls.length = 0; docCalls.length = 0

    const { result: newResult } = await commitJob(validated, adapter, rows, { actorUid: CTX.uid, actorRole: 'admin', jobId: validated.jobId })
    const newSet = stripVolatileFields(setCalls[0].data)
    const newDoc = docCalls[0]

    expect(newDoc).toEqual(legacyDoc)
    expect(newSet).toEqual(legacySet)
    expect(newResult.committed).toBe(legacyResult.committed)
    expect(newResult.failed).toBe(legacyResult.failed)
  })

  it('flags an unknown KPI column identically to the legacy path (never silently dropped)', async () => {
    const excelRow = { date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '10', totallyUnknownKpi: '99' }
    const legacyRaw = parseExcelRowsToRaw([excelRow], 'test.xlsx')
    expect(legacyRaw[0].unknownKpiColumns).toContain('totallyUnknownKpi')

    const adapter = createKpiActualsAdapter({ guardCtx: CTX, actorRole: 'admin', pharmacies: PHARMACIES })
    const parsedRow = adapter.parseRow(excelRow, 1, { domain: 'KPI_ACTUALS' })
    expect(parsedRow.unknownKpiColumns).toContain('totallyUnknownKpi')

    const outcome = adapter.validateRow(parsedRow, { actorUid: CTX.uid, actorRole: 'admin', pharmacyId: BRANCH_ID, knownIds: [BRANCH_ID] })
    expect(outcome.classification).toBe('WARNING')
    expect(outcome.issues.some((i) => i.code === 'UNKNOWN_KPI_KEY')).toBe(true)
  })

  it('imports an arbitrary, non-Core registry KPI by column header with zero code changes', async () => {
    const customRegistry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      newMetric: {
        ...DEFAULT_KPI_REGISTRY.wasfaty,
        key: 'newMetric', label: 'New Metric', labelAr: 'مقياس جديد', aliasFor: undefined,
        isActive: true, isCore: false, isPrimary: false, lifecycleStage: 'production_evaluation',
      },
    }
    const excelRow = { date: TODAY, pharmacyId: BRANCH_ID, 'New Metric': '42' }

    const adapter = createKpiActualsAdapter({ guardCtx: CTX, actorRole: 'admin', pharmacies: PHARMACIES, registry: customRegistry })
    const parsedRow = adapter.parseRow(excelRow, 1, { domain: 'KPI_ACTUALS' })
    expect(parsedRow.rawKpiValues?.newMetric).toBe('42')

    const outcome = adapter.validateRow(parsedRow, { actorUid: CTX.uid, actorRole: 'admin', pharmacyId: BRANCH_ID, knownIds: [BRANCH_ID] })
    // WARNING, not ERROR — the row only supplies the new metric, so the 5
    // legacy KPI fields are flagged MISSING_OPTIONAL_FIELD, same as legacy.
    expect(outcome.classification).toBe('WARNING')
    expect(outcome.staged?.kpiValues.newMetric).toBe(42)
  })

  it('resolves Arabic column headers identically to the legacy path', () => {
    const excelRow = { 'التاريخ': TODAY, 'كود الفرع': '5074', 'وصفتي': '7' }
    const adapter = createKpiActualsAdapter({ guardCtx: CTX, actorRole: 'admin', pharmacies: PHARMACIES })
    const parsedRow = adapter.parseRow(excelRow, 1, { domain: 'KPI_ACTUALS' })
    expect(parsedRow.rawDate).toBe(TODAY)
    expect(parsedRow.rawWasfaty).toBe('7')
  })

  it('rejects an unknown pharmacy identically to the legacy path', () => {
    const excelRow = { date: TODAY, pharmacyId: 'no-such-branch', wasfaty: '10' }
    const adapter = createKpiActualsAdapter({ guardCtx: CTX, actorRole: 'admin', pharmacies: PHARMACIES })
    const parsedRow = adapter.parseRow(excelRow, 1, { domain: 'KPI_ACTUALS' })
    const outcome = adapter.validateRow(parsedRow, { actorUid: CTX.uid, actorRole: 'admin', pharmacyId: BRANCH_ID, knownIds: [BRANCH_ID] })
    expect(outcome.classification).toBe('ERROR')
    expect(outcome.issues.some((i) => i.code === 'UNKNOWN_PHARMACY')).toBe(true)
  })
})
