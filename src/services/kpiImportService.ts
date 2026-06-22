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
import { DEFAULT_KPI_REGISTRY }  from '../engine/kpiRegistry'
import type { KpiRegistry }      from '../engine/kpiRegistry'

import type {
  RawIngestionRow,
  StagedKpiRecord,
  ValidationResult,
  IngestionBatch,
  IngestionCommitResult,
} from './ingestion/ingestionTypes'

import type { GuardContext } from './security/accessGuard'

// ── Excel column name mappings — structural (non-KPI) fields ──
// Maps Excel header variations → RawIngestionRow identity fields.
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
}

// ── Legacy KPI column aliases — explicit legacy adapter ────────
// Core KPI Dependency Removal — Stage C: the 5 original Core KPIs keep
// their exact historical header spellings so old Excel/CSV exports keep
// importing unchanged. This is the ONLY place legacy KPI names are
// hardcoded; any KPI added to the registry after this point does NOT
// get an entry here — its column header is resolved dynamically below.
const LEGACY_KPI_COLUMN_MAP: Record<string, keyof RawIngestionRow> = {
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

const LEGACY_ENGINE_KEYS = new Set(['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'])

/**
 * Resolve an Excel/CSV column header to an active KPI Registry engine key.
 * Accepts the registry business key, its engine key (aliasFor), or its
 * English/Arabic label — case-insensitive. This is what lets an arbitrary
 * new KPI be imported with zero source-code changes: the column header
 * just has to match the KPI's registry key or label.
 *
 * The legacy 5 Core KPIs are excluded here — they're already resolved via
 * LEGACY_KPI_COLUMN_MAP above to preserve byte-identical behavior.
 */
function resolveDynamicKpiColumn(header: string, registry: KpiRegistry): string | null {
  const lower = header.trim().toLowerCase()
  for (const kpi of Object.values(registry)) {
    if (!kpi.isActive) continue
    const engineKey = kpi.aliasFor ?? kpi.key
    if (LEGACY_ENGINE_KEYS.has(engineKey)) continue
    if (kpi.key.toLowerCase() === lower)                return engineKey
    if (engineKey.toLowerCase() === lower)              return engineKey
    if (kpi.label && kpi.label.toLowerCase() === lower) return engineKey
    if (kpi.labelAr && kpi.labelAr === header.trim())   return engineKey
  }
  return null
}

const NUMERIC_VALUE_RE = /^-?[\d,]+(\.\d+)?$/

// ── 1. Parse Excel rows → RawIngestionRow[] ───────────────────
export function parseExcelRowsToRaw(
  rows:       Record<string, unknown>[],
  sourceFile: string,
  registry:   KpiRegistry = DEFAULT_KPI_REGISTRY,
): RawIngestionRow[] {
  return rows.map((row, idx) => {
    const raw: RawIngestionRow = { rowIndex: idx + 2, sourceFile }

    for (const [key, val] of Object.entries(row)) {
      const trimmedKey = key.trim()
      const strVal     = String(val ?? '').trim()

      // 1. Structural identity fields — unchanged
      const structuralField = COLUMN_MAP[trimmedKey]
      if (structuralField) {
        (raw as Record<string, unknown>)[structuralField] = strVal
        continue
      }

      // 2. The 5 legacy Core KPI fields — explicit legacy adapter
      const legacyField = LEGACY_KPI_COLUMN_MAP[trimmedKey]
      if (legacyField) {
        (raw as Record<string, unknown>)[legacyField] = strVal
        continue
      }

      // 3. Any other active KPI Registry entry — dynamic, no hardcoded names
      const engineKey = resolveDynamicKpiColumn(trimmedKey, registry)
      if (engineKey) {
        if (!raw.rawKpiValues) raw.rawKpiValues = {}
        raw.rawKpiValues[engineKey] = strVal
        continue
      }

      // 4. Looks like an attempted KPI reading (purely numeric) but matched
      //    no active registry key — flag it instead of silently dropping it
      //    into extras with no signal (Stage C: "reject or flag unknown
      //    KPI keys... do not silently map unknown KPI values to Core fields").
      if (strVal !== '' && trimmedKey.toLowerCase() !== 'notes' && NUMERIC_VALUE_RE.test(strVal)) {
        if (!raw.unknownKpiColumns) raw.unknownKpiColumns = []
        raw.unknownKpiColumns.push(trimmedKey)
      }

      // Store unmapped columns in extras
      if (!raw.rawExtras) raw.rawExtras = {}
      raw.rawExtras[trimmedKey] = strVal
    }

    return raw
  })
}

// ── 1b. Bulk Target import — registry-driven field resolution ──
// Core KPI Dependency Removal — Closure Certification (Stage D):
// bulk target import previously cherry-picked the 5 legacy `*Target`
// fields by name. saveTarget() itself already accepts ANY key ending in
// "Target" (no hardcoded allowlist) — this helper just forwards that
// same dynamic contract to the bulk import path instead of re-imposing
// a fixed list, while flagging `*Target` columns that don't match any
// active registry KPI's targetField (informational only — the value is
// still forwarded, since saveTarget's own naming convention is the
// actual contract; this only flags likely typos for the admin to review).
export interface TargetImportResult {
  targetFields:         Record<string, number>
  unknownTargetColumns: string[]
}

export function buildTargetImportPayload(
  row:      Record<string, unknown>,
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): TargetImportResult {
  const knownTargetFields = new Set(
    Object.values(registry)
      .filter((kpi) => kpi.isActive && kpi.targetField)
      .map((kpi) => kpi.targetField as string),
  )

  const targetFields: Record<string, number> = {}
  const unknownTargetColumns: string[] = []

  for (const [key, val] of Object.entries(row)) {
    if (!key.endsWith('Target')) continue
    targetFields[key] = Number(val) || 0
    if (!knownTargetFields.has(key)) unknownTargetColumns.push(key)
  }

  return { targetFields, unknownTargetColumns }
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
