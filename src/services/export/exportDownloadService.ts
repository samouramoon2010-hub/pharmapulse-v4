// ============================================================
// Export Studio — Download Service (DX-10, exceljs migration)
//
// The only place that writes a file to disk. Always validates first
// — per the closure spec, "If validation fails, do not download the
// file." Never persists workbook contents anywhere (see
// exportAuditService.ts for what IS persisted: metadata only).
//
// exceljs has no browser `writeFile` — serializing to a buffer
// (`workbook.xlsx.writeBuffer()`) is async, so this function is now
// async where the SheetJS-CE version was synchronous. The actual
// download trigger (Blob + temporary <a>) mirrors the pattern already
// used by csvExportService.ts's downloadCsv().
// ============================================================
import type { ExportDataset, ExportValidationResult } from './exportTypes'
import { validateExportDataset } from './exportValidation'
import { buildExportWorkbook, buildExportFileName } from './workbookBuilder'

export interface ExportDownloadOutcome {
  downloaded: boolean
  fileName: string
  validation: ExportValidationResult
}

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function downloadBuffer(buffer: ArrayBuffer, fileName: string, mimeType: string): void {
  const blob = new Blob([buffer], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function downloadExportWorkbook(dataset: ExportDataset): Promise<ExportDownloadOutcome> {
  const validation = validateExportDataset(dataset)
  const fileName = buildExportFileName(dataset, 'xlsx')
  if (!validation.valid) {
    return { downloaded: false, fileName, validation }
  }
  const wb = await buildExportWorkbook(dataset)
  const buffer = await wb.xlsx.writeBuffer()
  downloadBuffer(buffer as ArrayBuffer, fileName, XLSX_MIME_TYPE)
  return { downloaded: true, fileName, validation }
}
