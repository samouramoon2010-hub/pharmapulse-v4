// ============================================================
// Export Studio — Download Service (DX-10)
//
// The only place that writes a file to disk. Always validates first
// — per the closure spec, "If validation fails, do not download the
// file." Never persists workbook contents anywhere (see
// exportAuditService.ts for what IS persisted: metadata only).
// ============================================================
import * as XLSX from 'xlsx'
import type { ExportDataset, ExportValidationResult } from './exportTypes'
import { validateExportDataset } from './exportValidation'
import { buildExportWorkbook, buildExportFileName } from './workbookBuilder'

export interface ExportDownloadOutcome {
  downloaded: boolean
  fileName: string
  validation: ExportValidationResult
}

export function downloadExportWorkbook(dataset: ExportDataset): ExportDownloadOutcome {
  const validation = validateExportDataset(dataset)
  const fileName = buildExportFileName(dataset, 'xlsx')
  if (!validation.valid) {
    return { downloaded: false, fileName, validation }
  }
  const wb = buildExportWorkbook(dataset)
  XLSX.writeFile(wb, fileName)
  return { downloaded: true, fileName, validation }
}
