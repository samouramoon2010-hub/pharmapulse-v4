// ============================================================
// KPI Import Service
// Connects the ingestion safety layer to the actual Firestore write.
//
// Flow:
//   Raw Excel rows
//     → parseExcelRowsToRaw()
//     → validateBatch()        [stagingValidator]
//     → assessBatchSafety()    [ingestionSafetyGuards]
//     → deduplicateStaged()
//     → ImportPreview returned to UI  ← user sees this
//     → commitValidatedKpiBatch()     ← user confirms
//         → partitionForCommit()
//         → stagedToKpiEntry()
//         → writeBatch() to Firestore
//         → triggerHistorySnapshots() [historyService]
//         → logAction()              [auditService]
// ============================================================

import * as XLSX from 'xlsx'
import { doc, writeBatch, serverTimestamp, getDoc, getDocs, collection, query, where } from 'firebase/firestore'
import { db, COL } from './firebase'
import { logAction, AUDIT_ACTION } from './auditService'
import { triggerHistorySnapshots } from './historyService'

import { validateBatch }        from './ingestion/stagingValidator'
import {
  assessBatchSafety,
  deduplicateStaged,
  partitionForCommit,
  stagedToKpiEntry,
  buildCommitResult,
}                               from './ingestion/ingestionSafetyGuards'
import { withCreateOwnership }  from './security/dataOwnership'
import { guardKpiEntryWrite, assertGuard } from './security/accessGuard'

import type {
  RawIngestionRow,
  StagedKpiRecord,
  ValidationResult,
  IngestionBatch,
  IngestionCommitResult,
} from './ingestion/ingestionTypes'

import type { GuardContext } from './security/accessGuard'

// ── Excel column name mappings ────────────────────────────────
// Maps Excel header variations → RawIngestionRow fields
const COLUMN_MAP: Record<string, keyof RawIngestionRow> = {
  // Date
  'date':            'rawDate',
  'Date':            'rawDate',
  'التاريخ':         'rawDate',

  // PharmacyId / code
  'pharmacyId':      'rawPharmacyId',
  'pharmacy_id':     'rawPharmacyId',
  'pharmacyCode':    'rawPharmacyCode',
  'branchCode':      'rawPharmacyCode',
  'كود الفرع':       'rawPharmacyCode',

  // KPIs
  'wasfaty':         'rawWasfaty',
  'Wasfaty':         'rawWasfaty',
  'وصفتي':           'rawWasfaty',

  'omni':            'rawOmni',
  'omniHealth':      'rawOmni',
  'OmniHealth':      'rawOmni',
  'أومني':           'rawOmni',

  'wellness':        'rawWellness',
  'Wellness':        'rawWellness',
  'ويلنس':           'rawWellness',

  'basket':          'rawBasket',
  'basketSize':      'rawBasket',
  'BasketSize':      'rawBasket',
  'متوسط السلة':    'rawBasket',

  'crossSelling':    'rawCrossSelling',
  'cross_selling':   'rawCrossSelling',
  'CrossSelling':    'rawCrossSelling',
  'البيع المتقاطع': 'rawCrossSelling',
}

// ── 1. Parse Excel rows → RawIngestionRow[] ───────────────────
export function parseExcelRowsToRaw(
  rows:       Record<string, unknown>[],
  sourceFile: string,
): RawIngestionRow[] {
  return rows.map((row, idx) => {
    const raw: RawIngestionRow = { rowIndex: idx + 2, sourceFile }

    for (const [key, val] of Object.entries(row)) {
      const mapped = COLUMN_MAP[key.trim()]
      if (mapped) {
        (raw as Record<string, unknown>)[mapped] = String(val ?? '').trim()
      } else {
        // Store unmapped columns in extras
        if (!raw.rawExtras) raw.rawExtras = {}
        raw.rawExtras[key] = String(val ?? '').trim()
      }
    }

    return raw
  })
}

// ── 2. Resolve pharmacyId from code ──────────────────────────
// Builds code → pharmacyId map from pharmacies known to the client
export function buildPharmacyCodeMap(
  pharmacies: Array<{ id: string; code: string }>
): Record<string, string> {
  return Object.fromEntries(
    pharmacies.map((p) => [p.code?.toLowerCase(), p.id])
  )
}

export function resolvePharmacyId(
  raw:      RawIngestionRow,
  codeMap:  Record<string, string>,
  fallback: string,  // caller's own pharmacyId
): string | null {
  // 1. Direct pharmacyId in row
  if (raw.rawPharmacyId) return raw.rawPharmacyId

  // 2. Lookup by branch code
  if (raw.rawPharmacyCode) {
    const id = codeMap[raw.rawPharmacyCode.toLowerCase()]
    if (id) return id
  }

  // 3. Fallback to caller's branch (pharmacist importing own data)
  if (fallback) return fallback

  return null
}

// ── 3. Import Preview result ──────────────────────────────────
export interface ImportPreview {
  batchId:      string
  totalRows:    number
  validRows:    ValidationResult[]
  invalidRows:  ValidationResult[]
  warningRows:  ValidationResult[]   // valid but with warnings
  duplicates:   number               // rows deduped within batch
  safetyReport: ReturnType<typeof assessBatchSafety>
  staged:       StagedKpiRecord[]    // valid + deduped, ready to commit
}

// ── 4. Preview (validate without writing) ────────────────────
export async function previewKpiImport(
  rawRows:     RawIngestionRow[],
  ctx:         GuardContext,
  pharmacyId:  string,
  pharmacies:  Array<{ id: string; code: string }>,
  sourceFile?: string,
  source:      import('./ingestion/ingestionTypes').IngestionSource = 'EXCEL_UPLOAD',
): Promise<ImportPreview> {
  const batchId    = `batch-${Date.now()}-${ctx.uid.slice(0, 6)}`
  const codeMap    = buildPharmacyCodeMap(pharmacies)
  const knownIds   = pharmacies.map((p) => p.id)

  // Resolve pharmacyId for each row
  const resolvedRows = rawRows.map((raw) => ({
    ...raw,
    rawPharmacyId: resolvePharmacyId(raw, codeMap, pharmacyId) ?? raw.rawPharmacyId,
  }))

  // Validate batch
  const { results, summary } = validateBatch(
    resolvedRows,
    ctx.uid,
    pharmacyId,
    source,
    batchId,
    knownIds,
  )

  // Partition valid/invalid/warning
  const validRows:   ValidationResult[] = results.filter((r) => r.isValid && r.warnings.length === 0)
  const warningRows: ValidationResult[] = results.filter((r) => r.isValid && r.warnings.length > 0)
  const invalidRows: ValidationResult[] = results.filter((r) => !r.isValid)

  // Build staged records from valid results
  const allValid: StagedKpiRecord[] = results
    .filter((r) => r.isValid && r.coerced)
    .map((r) => r.coerced as StagedKpiRecord)

  // Deduplicate within batch
  const deduped    = deduplicateStaged(allValid)
  const duplicates = allValid.length - deduped.length

  // Safety report
  const safetyReport = assessBatchSafety(batchId, deduped, ctx)

  return {
    batchId,
    totalRows:   rawRows.length,
    validRows,
    invalidRows,
    warningRows,
    duplicates,
    safetyReport,
    staged: deduped,
  }
}

// ── 5. Commit validated batch to Firestore ────────────────────
export async function commitValidatedKpiBatch(
  preview:   ImportPreview,
  ctx:       GuardContext,
  actorRole: string,
): Promise<IngestionCommitResult> {
  // Final safety gate
  if (!preview.safetyReport.safeToCommit) {
    throw new Error(
      `Batch rejected: ${preview.safetyReport.blockers.join('; ')}`
    )
  }

  if (preview.staged.length === 0) {
    throw new Error('No valid records to commit')
  }

  // Partition again at commit time (re-validate guards)
  const { safe, unsafe } = partitionForCommit(preview.staged, ctx)

  const commitErrors: Array<{ stagingId: string; error: string }> = [
    ...unsafe.map((u) => ({ stagingId: u.record.stagingId, error: u.reason ?? 'Guard failed' })),
  ]

  let committed = 0
  let skipped   = 0

  // Write in batches of 400 (Firestore limit 500)
  const BATCH_SIZE = 400
  const allChunks  = []
  for (let i = 0; i < safe.length; i += BATCH_SIZE) {
    allChunks.push(safe.slice(i, i + BATCH_SIZE))
  }

  for (const chunk of allChunks) {
    const batch = writeBatch(db)

    for (const staged of chunk) {
      try {
        // Build the kpi_entries payload
        const entry    = stagedToKpiEntry(staged, ctx.uid)
        const enriched = withCreateOwnership(entry, ctx.uid, staged.pharmacyId)

        // Document ID: deterministic — prevents true duplicates at DB level
        const docId = `${staged.submittedBy}_${staged.pharmacyId}_${staged.date}`
        const ref   = doc(db, COL.KPI_ENTRIES, docId)

        batch.set(ref, {
          ...enriched,
          importedAt:    serverTimestamp(),
        }, { merge: true })

        committed++
      } catch (e) {
        commitErrors.push({ stagingId: staged.stagingId, error: (e as Error).message })
        skipped++
      }
    }

    await batch.commit()
  }

  // Audit log
  await logAction({
    action:     AUDIT_ACTION.IMPORT,
    collection: COL.KPI_ENTRIES,
    userId:     ctx.uid,
    userRole:   actorRole,
    meta: {
      batchId:    preview.batchId,
      committed,
      skipped,
      failed:     commitErrors.length,
      source:     'EXCEL_UPLOAD',
    },
  })

  // Trigger history snapshots for unique pharmacies (fire-and-forget)
  const uniquePharmacies = [...new Set(safe.map((s) => s.pharmacyId))]
  const today = new Date().toISOString().split('T')[0]
  for (const pid of uniquePharmacies) {
    triggerHistorySnapshots(ctx.uid, pid, today, ctx.uid, actorRole)
      .catch((e) => console.warn('[kpiImportService] History snapshot error:', e))
  }

  return buildCommitResult(preview.batchId, committed, skipped, commitErrors)
}

// ── 6. OCR-safe entry point (same pipeline, different source) ──
// OCR output arrives as Record<string, string> — same raw shape.
// Must pass identical validation before any write.
export async function previewOcrImport(
  ocrRows:    Record<string, string>[],
  ctx:        GuardContext,
  pharmacyId: string,
  pharmacies: Array<{ id: string; code: string }>,
): Promise<ImportPreview> {
  // Convert OCR rows to RawIngestionRow using same parser
  const rawRows = parseExcelRowsToRaw(
    ocrRows as Record<string, unknown>[],
    'OCR_SCAN',
  )
  // Tag source correctly
  rawRows.forEach((r) => { r.sourceFile = 'OCR_SCAN' })

  return previewKpiImport(rawRows, ctx, pharmacyId, pharmacies, 'OCR_SCAN', 'OCR_SCAN')
}

// ── 7. Read Excel file → raw rows (kept from importService) ───
export function readExcelFile(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb    = XLSX.read((e.target as FileReader).result, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        resolve(rows as Record<string, unknown>[])
      } catch {
        reject(new Error('Failed to read Excel file — ensure it is a valid .xlsx'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to load file'))
    reader.readAsArrayBuffer(file)
  })
}
