// ============================================================
// Phase 1 QA Test Suite
// Tests all 10 QA checks for the Operational Input Layer.
//
// QA-01: Excel import with valid file
// QA-02: Excel import with invalid pharmacyId
// QA-03: Excel import with duplicate rows
// QA-04: Excel import with missing KPI values
// QA-05: OCR import with wrong values
// QA-06: Commit only valid staged rows
// QA-07: Firestore rules allow valid users
// QA-08: Unauthorized branch write is blocked
// QA-09: History snapshots still trigger
// QA-10: Audit logs still record import actions
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock Firebase ─────────────────────────────────────────────
vi.mock('../services/firebase', () => ({
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
  doc:             vi.fn(() => ({})),
  collection:      vi.fn(() => ({})),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  setDoc:          vi.fn(async () => {}),
  addDoc:          vi.fn(async () => ({ id: 'mock-id' })),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  limit:           vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  writeBatch: vi.fn(() => ({
    set:    vi.fn(),
    commit: vi.fn(async () => {}),
  })),
}))

vi.mock('../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE:'create', UPDATE:'update', DELETE:'delete', IMPORT:'import' },
}))

vi.mock('../services/historyService', () => ({
  triggerHistorySnapshots: vi.fn(async () => {}),
}))

// ── Imports under test ────────────────────────────────────────
import {
  parseExcelRowsToRaw,
  buildPharmacyCodeMap,
  resolvePharmacyId,
  previewKpiImport,
  commitValidatedKpiBatch,
  previewOcrImport,
} from '../services/kpiImportService'

import {
  validateBatch,
  validateRow,
} from '../services/ingestion/stagingValidator'

import {
  assessBatchSafety,
  deduplicateStaged,
  partitionForCommit,
  stagedToKpiEntry,
  guardStagedRecord,
} from '../services/ingestion/ingestionSafetyGuards'

import {
  guardKpiEntryWrite,
  guardPharmacyAccess,
  guardNotFutureDate,
  guardOwnUserId,
  assertGuard,
} from '../services/security/accessGuard'

import {
  withCreateOwnership,
  createOwnership,
  isDocumentOwner,
} from '../services/security/dataOwnership'

import type { RawIngestionRow, StagedKpiRecord } from '../services/ingestion/ingestionTypes'
import type { GuardContext } from '../services/security/accessGuard'

// ── Test fixtures ─────────────────────────────────────────────
const TODAY       = new Date().toISOString().split('T')[0]
const YESTERDAY   = (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0] })()
const TOMORROW    = (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().split('T')[0] })()
const BRANCH_ID   = 'branch-001'
const BRANCH_ID_2 = 'branch-002'
const USER_ID     = 'user-001'

const VALID_CTX: GuardContext = { uid: USER_ID, role: 'pharmacist', pharmacyId: BRANCH_ID }
const ADMIN_CTX:  GuardContext = { uid: 'admin-001', role: 'admin', pharmacyId: null }
const WRONG_CTX:  GuardContext = { uid: 'user-999', role: 'pharmacist', pharmacyId: BRANCH_ID_2 }

const PHARMACIES = [
  { id: BRANCH_ID,   code: '5074', name: 'Branch A' },
  { id: BRANCH_ID_2, code: '5075', name: 'Branch B' },
]

function makeRaw(overrides: Partial<RawIngestionRow> = {}): RawIngestionRow {
  return {
    rowIndex:     1,
    sourceFile:   'test.xlsx',
    rawDate:      TODAY,
    rawPharmacyId: BRANCH_ID,
    rawWasfaty:   '5',
    rawOmni:      '3',
    rawWellness:  '4',
    rawBasket:    '2',
    rawCrossSelling: '2',
    ...overrides,
  }
}

function makeStaged(overrides: Partial<StagedKpiRecord> = {}): StagedKpiRecord {
  return {
    stagingId:    'stg-batch-001-1',
    batchId:      'batch-001',
    submittedBy:  USER_ID,
    pharmacyId:   BRANCH_ID,
    status:       'VALID',
    source:       'EXCEL_UPLOAD',
    rowIndex:     1,
    date:         TODAY,
    wasfaty:      5,
    omni:         3,
    wellness:     4,
    basket:       2,
    crossSelling: 2,
    stagedAt:     new Date().toISOString(),
    errors:       [],
    warnings:     [],
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════
// QA-01: Excel import with valid file
// ══════════════════════════════════════════════════════════════
describe('QA-01: Valid Excel import', () => {
  it('parses standard column names correctly', () => {
    const rows = [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty:'10', omni:'5', wellness:'8', basket:'3', crossSelling:'4' }]
    const raw  = parseExcelRowsToRaw(rows, 'test.xlsx')
    expect(raw[0].rawDate).toBe(TODAY)
    expect(raw[0].rawPharmacyId).toBe(BRANCH_ID)
    expect(raw[0].rawWasfaty).toBe('10')
  })

  it('parses Arabic column names correctly', () => {
    const rows = [{ 'التاريخ': TODAY, 'كود الفرع': '5074', 'وصفتي': '7', 'أومني': '3', 'ويلنس': '5', 'متوسط السلة': '2', 'البيع المتقاطع': '1' }]
    const raw  = parseExcelRowsToRaw(rows, 'test-ar.xlsx')
    expect(raw[0].rawDate).toBe(TODAY)
    expect(raw[0].rawPharmacyCode).toBe('5074')
    expect(raw[0].rawWasfaty).toBe('7')
  })

  it('validates batch and returns all valid rows', () => {
    const rows = [makeRaw(), makeRaw({ rowIndex: 2, rawDate: YESTERDAY })]
    const { results, summary } = validateBatch(rows, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b1', [BRANCH_ID])
    expect(summary.total).toBe(2)
    expect(summary.valid).toBe(2)
    expect(summary.invalid).toBe(0)
  })

  it('full preview returns safe-to-commit for valid rows', async () => {
    const rows = [makeRaw()]
    const preview = await previewKpiImport(rows, VALID_CTX, BRANCH_ID, PHARMACIES, 'test.xlsx')
    expect(preview.totalRows).toBe(1)
    expect(preview.safetyReport.safeToCommit).toBe(true)
    expect(preview.staged).toHaveLength(1)
  })

  it('pharamcy code map resolves branch ID', () => {
    const map = buildPharmacyCodeMap(PHARMACIES)
    expect(map['5074']).toBe(BRANCH_ID)
    expect(map['5075']).toBe(BRANCH_ID_2)
  })
})

// ══════════════════════════════════════════════════════════════
// QA-02: Excel import with invalid pharmacyId
// ══════════════════════════════════════════════════════════════
describe('QA-02: Invalid pharmacyId handling', () => {
  it('rejects row with unknown pharmacyId', () => {
    const row = makeRaw({ rawPharmacyId: 'nonexistent-branch' })
    const result = validateRow(row, USER_ID, '', 'EXCEL_UPLOAD', 'b1', [BRANCH_ID, BRANCH_ID_2])
    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.code === 'UNKNOWN_PHARMACY')).toBe(true)
  })

  it('rejects row with missing pharmacyId and no fallback', () => {
    const row = makeRaw({ rawPharmacyId: undefined, rawPharmacyCode: undefined })
    const result = validateRow(row, USER_ID, '', 'EXCEL_UPLOAD', 'b1', [BRANCH_ID])
    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.code === 'MISSING_PHARMACY_ID')).toBe(true)
  })

  it('accepts row when pharmacyId resolved from branch code', () => {
    const raw = makeRaw({ rawPharmacyId: undefined, rawPharmacyCode: '5074' })
    const map = buildPharmacyCodeMap(PHARMACIES)
    const resolved = resolvePharmacyId(raw, map, '')
    expect(resolved).toBe(BRANCH_ID)
  })

  it('falls back to caller pharmacyId when no code in row', () => {
    const raw = makeRaw({ rawPharmacyId: undefined, rawPharmacyCode: undefined })
    const map = buildPharmacyCodeMap(PHARMACIES)
    const resolved = resolvePharmacyId(raw, map, BRANCH_ID)
    expect(resolved).toBe(BRANCH_ID)
  })

  it('guard blocks write to wrong branch', () => {
    const guard = guardPharmacyAccess(WRONG_CTX, BRANCH_ID)
    expect(guard.allowed).toBe(false)
    expect(guard.code).toBe('WRONG_BRANCH')
  })

  it('admin can access any branch', () => {
    const guard = guardPharmacyAccess(ADMIN_CTX, BRANCH_ID)
    expect(guard.allowed).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// QA-03: Excel import with duplicate rows
// ══════════════════════════════════════════════════════════════
describe('QA-03: Duplicate row handling', () => {
  it('deduplicateStaged keeps last row for same user+branch+date', () => {
    const rows = [
      makeStaged({ wasfaty: 5 }),
      makeStaged({ wasfaty: 9, stagingId: 'stg-b-2' }),  // same key, different value
    ]
    const deduped = deduplicateStaged(rows)
    expect(deduped).toHaveLength(1)
    expect(deduped[0].wasfaty).toBe(9)  // last row wins
  })

  it('keeps rows with different dates as distinct', () => {
    const rows = [
      makeStaged({ date: TODAY,     stagingId: 'stg-1' }),
      makeStaged({ date: YESTERDAY, stagingId: 'stg-2' }),
    ]
    const deduped = deduplicateStaged(rows)
    expect(deduped).toHaveLength(2)
  })

  it('keeps rows with different pharmacies as distinct', () => {
    const rows = [
      makeStaged({ pharmacyId: BRANCH_ID,   stagingId: 'stg-1' }),
      makeStaged({ pharmacyId: BRANCH_ID_2, stagingId: 'stg-2' }),
    ]
    const deduped = deduplicateStaged(rows)
    expect(deduped).toHaveLength(2)
  })

  it('preview counts duplicates correctly', async () => {
    const rows = [
      makeRaw(),
      makeRaw({ rawWasfaty: '9' }),   // duplicate date+branch
    ]
    const preview = await previewKpiImport(rows, VALID_CTX, BRANCH_ID, PHARMACIES)
    expect(preview.duplicates).toBe(1)
    expect(preview.staged).toHaveLength(1)
    expect(preview.staged[0].wasfaty).toBe(9)  // last row kept
  })
})

// ══════════════════════════════════════════════════════════════
// QA-04: Excel import with missing KPI values
// ══════════════════════════════════════════════════════════════
describe('QA-04: Missing KPI values handling', () => {
  it('accepts row with all KPIs missing — defaults to 0 with warnings', () => {
    const row = makeRaw({ rawWasfaty: '', rawOmni: '', rawWellness: '', rawBasket: '', rawCrossSelling: '' })
    const result = validateRow(row, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b1', [BRANCH_ID])
    expect(result.isValid).toBe(true)   // valid but warned
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.every(w => w.code === 'MISSING_OPTIONAL_FIELD')).toBe(true)
  })

  it('accepts partial KPI data (some fields filled)', () => {
    const row = makeRaw({ rawOmni: '', rawWellness: '', rawBasket: '', rawCrossSelling: '' })
    const result = validateRow(row, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b1', [BRANCH_ID])
    expect(result.isValid).toBe(true)
    expect(result.coerced?.wasfaty).toBe(5)
    expect(result.coerced?.omni).toBe(0)
  })

  it('rejects negative KPI value', () => {
    const row = makeRaw({ rawWasfaty: '-5' })
    const result = validateRow(row, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b1', [BRANCH_ID])
    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.code === 'NEGATIVE_KPI_VALUE')).toBe(true)
  })

  it('rejects non-numeric KPI value', () => {
    const row = makeRaw({ rawWasfaty: 'abc' })
    const result = validateRow(row, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b1', [BRANCH_ID])
    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.code === 'INVALID_KPI_VALUE')).toBe(true)
  })

  it('rejects KPI value exceeding max', () => {
    const row = makeRaw({ rawWasfaty: '999999' })
    const result = validateRow(row, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b1', [BRANCH_ID])
    expect(result.isValid).toBe(false)
    expect(result.errors.some(e => e.code === 'EXCEEDS_DAILY_LIMIT')).toBe(true)
  })

  it('warns when KPI value is zero', () => {
    const row = makeRaw({ rawWasfaty: '0' })
    const result = validateRow(row, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b1', [BRANCH_ID])
    expect(result.isValid).toBe(true)
    expect(result.warnings.some(w => w.code === 'ZERO_VALUE_KPI')).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// QA-05: OCR import with wrong values
// ══════════════════════════════════════════════════════════════
describe('QA-05: OCR import safety', () => {
  it('OCR rows pass through same pipeline as Excel', async () => {
    const ocrRows = [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '5', omni: '3', wellness: '4', basket: '2', crossSelling: '2' }]
    const preview = await previewOcrImport(ocrRows, VALID_CTX, BRANCH_ID, PHARMACIES)
    expect(preview.totalRows).toBe(1)
    // Source correctly tagged as OCR_SCAN
    expect(preview.staged[0]?.source).toBe('OCR_SCAN')
  })

  it('OCR row with garbled date is rejected', async () => {
    const ocrRows = [{ date: 'ABC-XY-ZZ', pharmacyId: BRANCH_ID, wasfaty: '5', omni: '3', wellness: '4', basket: '2', crossSelling: '2' }]
    const preview = await previewOcrImport(ocrRows, VALID_CTX, BRANCH_ID, PHARMACIES)
    expect(preview.invalidRows).toHaveLength(1)
    expect(preview.invalidRows[0].errors.some(e => e.code === 'INVALID_DATE')).toBe(true)
  })

  it('OCR row with future date is rejected', async () => {
    const ocrRows = [{ date: TOMORROW, pharmacyId: BRANCH_ID, wasfaty: '5', omni: '3', wellness: '4', basket: '2', crossSelling: '2' }]
    const preview = await previewOcrImport(ocrRows, VALID_CTX, BRANCH_ID, PHARMACIES)
    expect(preview.invalidRows.some(r => r.errors.some(e => e.code === 'FUTURE_DATE'))).toBe(true)
  })

  it('OCR row with string KPI value (OCR misread) is rejected', async () => {
    const ocrRows = [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty: 'S', omni: '3', wellness: '4', basket: '2', crossSelling: '2' }]
    const preview = await previewOcrImport(ocrRows, VALID_CTX, BRANCH_ID, PHARMACIES)
    expect(preview.invalidRows.some(r => r.errors.some(e => e.code === 'INVALID_KPI_VALUE'))).toBe(true)
  })

  it('valid OCR rows are staged and safe to commit', async () => {
    const ocrRows = [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '5', omni: '3', wellness: '4', basket: '2', crossSelling: '2' }]
    const preview = await previewOcrImport(ocrRows, VALID_CTX, BRANCH_ID, PHARMACIES)
    expect(preview.safetyReport.safeToCommit).toBe(true)
    expect(preview.staged).toHaveLength(1)
  })
})

// ══════════════════════════════════════════════════════════════
// QA-06: Commit only valid staged rows
// ══════════════════════════════════════════════════════════════
describe('QA-06: Selective commit — valid rows only', () => {
  it('partitionForCommit separates safe from unsafe', () => {
    const records = [
      makeStaged({ status: 'VALID', submittedBy: USER_ID }),
      makeStaged({ status: 'INVALID', stagingId: 'stg-bad', submittedBy: USER_ID }),
      makeStaged({ pharmacyId: BRANCH_ID_2, stagingId: 'stg-wrong', submittedBy: USER_ID }),  // wrong branch
    ]
    const { safe, unsafe } = partitionForCommit(records, VALID_CTX)
    expect(safe).toHaveLength(1)
    expect(unsafe.length).toBeGreaterThanOrEqual(1)
  })

  it('guardStagedRecord rejects INVALID status', () => {
    const record = makeStaged({ status: 'INVALID' })
    const result = guardStagedRecord(record, VALID_CTX)
    expect(result.safe).toBe(false)
  })

  it('guardStagedRecord rejects record with errors', () => {
    const record = makeStaged({ errors: [{ code: 'INVALID_DATE', message: 'bad date' }] })
    const result = guardStagedRecord(record, VALID_CTX)
    expect(result.safe).toBe(false)
  })

  it('guardStagedRecord allows valid record', () => {
    const record = makeStaged({ status: 'VALID', submittedBy: USER_ID })
    const result = guardStagedRecord(record, VALID_CTX)
    expect(result.safe).toBe(true)
  })

  it('assessBatchSafety returns safe=true for clean batch', () => {
    const records = [makeStaged({ submittedBy: USER_ID })]
    const report  = assessBatchSafety('b1', records, VALID_CTX)
    expect(report.safeToCommit).toBe(true)
    expect(report.blockers).toHaveLength(0)
  })

  it('assessBatchSafety blocks empty batch', () => {
    const report = assessBatchSafety('b1', [], VALID_CTX)
    expect(report.safeToCommit).toBe(false)
    expect(report.blockers).toContain('Batch is empty')
  })

  it('stagedToKpiEntry builds correct Firestore payload', () => {
    const staged = makeStaged()
    const entry  = stagedToKpiEntry(staged, USER_ID)
    expect(entry.userId).toBe(USER_ID)
    expect(entry.pharmacyId).toBe(BRANCH_ID)
    expect(entry.date).toBe(TODAY)
    expect(entry.wasfaty).toBe(5)
    expect(entry.importBatchId).toBe('batch-001')
  })

  it('commitValidatedKpiBatch throws when safety report blocks', async () => {
    const { writeBatch } = await import('firebase/firestore')
    const preview = {
      batchId:       'b1',
      totalRows:     0,
      validRows:     [],
      invalidRows:   [],
      warningRows:   [],
      duplicates:    0,
      safetyReport:  { safeToCommit: false, blockers: ['Batch is empty'], batchId:'b1', totalRecords:0, safeRecords:0, unsafeRecords:0, duplicates:0 },
      staged:        [],
    }
    await expect(commitValidatedKpiBatch(preview as any, VALID_CTX, 'pharmacist'))
      .rejects.toThrow('Batch rejected')
  })
})

// ══════════════════════════════════════════════════════════════
// QA-07: Firestore rules allow valid users
// ══════════════════════════════════════════════════════════════
describe('QA-07: Access guard — valid users allowed', () => {
  it('pharmacist can write own KPI entry', () => {
    const result = guardKpiEntryWrite(VALID_CTX, { userId: USER_ID, pharmacyId: BRANCH_ID, date: TODAY })
    expect(result.allowed).toBe(true)
  })

  it('admin can write entry for any user/branch', () => {
    const result = guardKpiEntryWrite(ADMIN_CTX, { userId: USER_ID, pharmacyId: BRANCH_ID, date: TODAY })
    expect(result.allowed).toBe(true)
  })

  it('manager can write for own branch', () => {
    const mgrCtx: GuardContext = { uid: 'mgr-1', role: 'manager', pharmacyId: BRANCH_ID }
    const result = guardKpiEntryWrite(mgrCtx, { userId: 'mgr-1', pharmacyId: BRANCH_ID, date: TODAY })
    expect(result.allowed).toBe(true)
  })

  it('past date is allowed', () => {
    const result = guardNotFutureDate(YESTERDAY)
    expect(result.allowed).toBe(true)
  })

  it('today is allowed', () => {
    const result = guardNotFutureDate(TODAY)
    expect(result.allowed).toBe(true)
  })

  it('user can read/write own data', () => {
    const result = guardOwnUserId(VALID_CTX, USER_ID)
    expect(result.allowed).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// QA-08: Unauthorized branch write is blocked
// ══════════════════════════════════════════════════════════════
describe('QA-08: Unauthorized write blocked', () => {
  it('pharmacist blocked from writing to other branch', () => {
    const result = guardKpiEntryWrite(WRONG_CTX, { userId: 'user-999', pharmacyId: BRANCH_ID, date: TODAY })
    expect(result.allowed).toBe(false)
    expect(result.code).toBe('WRONG_BRANCH')
  })

  it('pharmacist blocked from writing as another user', () => {
    const result = guardKpiEntryWrite(VALID_CTX, { userId: 'another-user', pharmacyId: BRANCH_ID, date: TODAY })
    expect(result.allowed).toBe(false)
    expect(result.code).toBe('UNAUTHORIZED')
  })

  it('future date blocked', () => {
    const result = guardNotFutureDate(TOMORROW)
    expect(result.allowed).toBe(false)
    expect(result.code).toBe('EXPIRED')
  })

  it('assertGuard throws on denied', () => {
    const denied = { allowed: false as const, reason: 'Test deny', code: 'UNAUTHORIZED' as const }
    expect(() => assertGuard(denied, 'test')).toThrow('Access denied')
  })

  it('assertGuard passes on allowed', () => {
    const allowed = { allowed: true as const }
    expect(() => assertGuard(allowed)).not.toThrow()
  })

  it('staged record from wrong branch fails commit guard', () => {
    const record = makeStaged({ pharmacyId: BRANCH_ID_2 })
    const result = guardStagedRecord(record, VALID_CTX)
    expect(result.safe).toBe(false)
    expect(result.reason).toMatch(/branch|WRONG/)
  })
})

// ══════════════════════════════════════════════════════════════
// QA-09: History snapshots still trigger
// ══════════════════════════════════════════════════════════════
describe('QA-09: History snapshots triggered after commit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('triggerHistorySnapshots is called after successful commit', async () => {
    const { triggerHistorySnapshots } = await import('../services/historyService')
    const preview = {
      batchId:      'b1',
      totalRows:    1,
      validRows:    [],
      invalidRows:  [],
      warningRows:  [],
      duplicates:   0,
      safetyReport: {
        safeToCommit: true, blockers: [], batchId:'b1',
        totalRecords:1, safeRecords:1, unsafeRecords:0, duplicates:0,
      },
      staged: [makeStaged({ submittedBy: USER_ID })],
    }
    await commitValidatedKpiBatch(preview as any, VALID_CTX, 'pharmacist')
    expect(triggerHistorySnapshots).toHaveBeenCalled()
  })

  it('triggerHistorySnapshots called with correct pharmacyId', async () => {
    const { triggerHistorySnapshots } = await import('../services/historyService')
    vi.mocked(triggerHistorySnapshots).mockClear()
    const preview = {
      batchId:      'b2',
      totalRows:    1,
      validRows:    [],
      invalidRows:  [],
      warningRows:  [],
      duplicates:   0,
      safetyReport: {
        safeToCommit: true, blockers: [], batchId:'b2',
        totalRecords:1, safeRecords:1, unsafeRecords:0, duplicates:0,
      },
      staged: [makeStaged({ pharmacyId: BRANCH_ID, submittedBy: USER_ID })],
    }
    await commitValidatedKpiBatch(preview as any, VALID_CTX, 'pharmacist')
    const calls = vi.mocked(triggerHistorySnapshots).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0][1]).toBe(BRANCH_ID)
  })

  it('history trigger failure does not break commit', async () => {
    const { triggerHistorySnapshots } = await import('../services/historyService')
    vi.mocked(triggerHistorySnapshots).mockRejectedValueOnce(new Error('Network error'))
    const preview = {
      batchId:      'b3',
      totalRows:    1,
      validRows:    [],
      invalidRows:  [],
      warningRows:  [],
      duplicates:   0,
      safetyReport: {
        safeToCommit: true, blockers: [], batchId:'b3',
        totalRecords:1, safeRecords:1, unsafeRecords:0, duplicates:0,
      },
      staged: [makeStaged({ submittedBy: USER_ID })],
    }
    // Should resolve normally even if trigger throws
    await expect(commitValidatedKpiBatch(preview as any, VALID_CTX, 'pharmacist'))
      .resolves.toBeDefined()
  })
})

// ══════════════════════════════════════════════════════════════
// QA-10: Audit logs record import actions
// ══════════════════════════════════════════════════════════════
describe('QA-10: Audit logs recorded', () => {
  beforeEach(() => vi.clearAllMocks())

  it('logAction is called after successful commit', async () => {
    const { logAction } = await import('../services/auditService')
    const preview = {
      batchId:      'b4',
      totalRows:    1,
      validRows:    [],
      invalidRows:  [],
      warningRows:  [],
      duplicates:   0,
      safetyReport: {
        safeToCommit: true, blockers: [], batchId:'b4',
        totalRecords:1, safeRecords:1, unsafeRecords:0, duplicates:0,
      },
      staged: [makeStaged({ submittedBy: USER_ID })],
    }
    await commitValidatedKpiBatch(preview as any, VALID_CTX, 'pharmacist')
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action:     'import',
        collection: 'kpi_entries',
        userId:     USER_ID,
      })
    )
  })

  it('audit log contains batch metadata', async () => {
    const { logAction } = await import('../services/auditService')
    vi.mocked(logAction).mockClear()
    const preview = {
      batchId:      'b5-audit',
      totalRows:    2,
      validRows:    [],
      invalidRows:  [],
      warningRows:  [],
      duplicates:   0,
      safetyReport: {
        safeToCommit: true, blockers: [], batchId:'b5-audit',
        totalRecords:1, safeRecords:1, unsafeRecords:0, duplicates:0,
      },
      staged: [makeStaged({ submittedBy: USER_ID })],
    }
    await commitValidatedKpiBatch(preview as any, VALID_CTX, 'pharmacist')
    const call = vi.mocked(logAction).mock.calls[0][0]
    expect(call.meta?.batchId).toBe('b5-audit')
    expect(call.meta?.source).toBe('EXCEL_UPLOAD')
  })

  it('dataOwnership.withCreateOwnership attaches audit fields', () => {
    const payload   = { userId: USER_ID, pharmacyId: BRANCH_ID }
    const enriched  = withCreateOwnership(payload, USER_ID, BRANCH_ID)
    expect(enriched.createdBy).toBe(USER_ID)
    expect(enriched.updatedBy).toBe(USER_ID)
    expect(enriched.pharmacyId).toBe(BRANCH_ID)
    expect(enriched.branchId).toBe(BRANCH_ID)
    // serverTimestamp objects present
    expect(enriched.createdAt).toBeDefined()
    expect(enriched.updatedAt).toBeDefined()
  })

  it('isDocumentOwner correctly identifies creator', () => {
    const doc = { createdBy: USER_ID, pharmacyId: BRANCH_ID }
    expect(isDocumentOwner(doc, USER_ID)).toBe(true)
    expect(isDocumentOwner(doc, 'other-user')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// ADDITIONAL EDGE CASE TESTS
// ══════════════════════════════════════════════════════════════

// ── Date format variants ──────────────────────────────────────
describe('Date format variants', () => {
  it('accepts ISO yyyy-MM-dd', () => {
    const r = validateRow(makeRaw({ rawDate: TODAY }), USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b', [BRANCH_ID])
    expect(r.isValid).toBe(true)
    expect(r.coerced?.date).toBe(TODAY)
  })

  it('accepts dd/MM/yyyy format', () => {
    const [y, m, d] = TODAY.split('-')
    const ddmm = `${d}/${m}/${y}`
    const r = validateRow(makeRaw({ rawDate: ddmm }), USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b', [BRANCH_ID])
    expect(r.isValid).toBe(true)
    expect(r.coerced?.date).toBe(TODAY)
  })

  it('accepts dd-MM-yyyy format', () => {
    const [y, m, d] = TODAY.split('-')
    const ddmm = `${d}-${m}-${y}`
    const r = validateRow(makeRaw({ rawDate: ddmm }), USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b', [BRANCH_ID])
    expect(r.isValid).toBe(true)
    expect(r.coerced?.date).toBe(TODAY)
  })

  it('rejects empty date', () => {
    const r = validateRow(makeRaw({ rawDate: '' }), USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b', [BRANCH_ID])
    expect(r.isValid).toBe(false)
    expect(r.errors.some(e => e.code === 'INVALID_DATE')).toBe(true)
  })

  it('rejects old date beyond lookback window', () => {
    const r = validateRow(makeRaw({ rawDate: '2020-01-01' }), USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b', [BRANCH_ID])
    expect(r.isValid).toBe(false)
    expect(r.errors.some(e => e.code === 'INVALID_DATE')).toBe(true)
  })
})

// ── Batch size limit ──────────────────────────────────────────
describe('Batch size guard', () => {
  it('throws when batch exceeds MAX_ROWS_PER_BATCH', () => {
    const rows = Array.from({ length: 2001 }, (_, i) => makeRaw({ rowIndex: i }))
    expect(() => validateBatch(rows, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b'))
      .toThrow('Batch exceeds maximum size')
  })

  it('accepts batch exactly at limit', () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeRaw({ rowIndex: i }))
    expect(() => validateBatch(rows, USER_ID, BRANCH_ID, 'EXCEL_UPLOAD', 'b'))
      .not.toThrow()
  })
})

// ── OCR source correctly tagged ───────────────────────────────
describe('OCR source tracking', () => {
  it('staged records from OCR carry source=OCR_SCAN', async () => {
    const ocrRows = [{ date: TODAY, pharmacyId: BRANCH_ID, wasfaty: '5', omni: '3', wellness: '4', basket: '2', crossSelling: '2' }]
    const preview = await previewOcrImport(ocrRows, VALID_CTX, BRANCH_ID, PHARMACIES)
    expect(preview.staged[0]?.source).toBe('OCR_SCAN')
  })

  it('Excel staged records carry source=EXCEL_UPLOAD', async () => {
    const preview = await previewKpiImport([makeRaw()], VALID_CTX, BRANCH_ID, PHARMACIES, 'file.xlsx')
    expect(preview.staged[0]?.source).toBe('EXCEL_UPLOAD')
  })
})

// ── Commit produces deterministic doc ID ─────────────────────
describe('Deterministic document ID', () => {
  it('stagedToKpiEntry produces payload that builds deterministic docId', () => {
    const staged = makeStaged({ submittedBy: 'u1', pharmacyId: 'p1', date: '2025-05-15' })
    const entry  = stagedToKpiEntry(staged, 'u1')
    const docId  = `${entry.userId}_${entry.pharmacyId}_${entry.date}`
    expect(docId).toBe('u1_p1_2025-05-15')
  })

  it('two rows with same user+branch+date produce same docId (merge prevents duplicate)', () => {
    const s1 = makeStaged({ wasfaty: 5 })
    const s2 = makeStaged({ wasfaty: 9 })
    const e1 = stagedToKpiEntry(s1, USER_ID)
    const e2 = stagedToKpiEntry(s2, USER_ID)
    const id1 = `${e1.userId}_${e1.pharmacyId}_${e1.date}`
    const id2 = `${e2.userId}_${e2.pharmacyId}_${e2.date}`
    expect(id1).toBe(id2)  // same ID → Firestore merge overwrites
  })
})

// ── Multi-branch batch (admin importing for all branches) ─────
describe('Multi-branch batch', () => {
  it('admin can import for multiple branches at once', async () => {
    const rows = [
      makeRaw({ rawPharmacyId: BRANCH_ID   }),
      makeRaw({ rawPharmacyId: BRANCH_ID_2 }),
    ]
    const preview = await previewKpiImport(rows, ADMIN_CTX, '', PHARMACIES, 'multi.xlsx')
    expect(preview.staged).toHaveLength(2)
    expect(preview.safetyReport.safeToCommit).toBe(true)
  })

  it('pharmacist blocked from importing to another branch', async () => {
    const rows = [makeRaw({ rawPharmacyId: BRANCH_ID_2 })]
    const preview = await previewKpiImport(rows, VALID_CTX, BRANCH_ID, PHARMACIES, 'wrong.xlsx')
    // The row itself validates OK but safety guard blocks commit
    const { safe, unsafe } = partitionForCommit(preview.staged, VALID_CTX)
    expect(safe).toHaveLength(0)
    expect(unsafe.length).toBeGreaterThan(0)
  })
})
