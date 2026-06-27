// ============================================================
// Export Studio — Import Audit Dataset Builder (DX-10)
//
// Pure function. Takes already-fetched ImportJob[] (e.g. from
// listRecentImportJobs(), the same source backing Data Exchange
// Studio's admin-only Import History section) and produces an
// ExportDataset. No Firestore access here — the caller fetches and
// is responsible for the same admin-only gating documented in
// firestoreStagingRepository.ts.
// ============================================================
import type { ImportJob } from '../../dataExchange/importJobTypes'
import type { ExportDataset, ExportSheetData, ExportDefinitionRow } from '../exportTypes'

const RETRY_ELIGIBLE_DOMAINS = new Set(['BRANCH_ACTUALS', 'PHARMACIST_ACTUALS'])

export interface ImportAuditDatasetParams {
  jobs: ImportJob[]
  generatedBy: string
  generatedAt?: string
}

function buildJobsSheet(jobs: ImportJob[]): ExportSheetData {
  return {
    sheetName: 'Import Jobs',
    columns: [
      { key: 'date', header: 'Date', unit: 'number', numeric: false },
      { key: 'domain', header: 'Domain', unit: 'number', numeric: false },
      { key: 'fileName', header: 'File Name', unit: 'number', numeric: false },
      { key: 'status', header: 'Status', unit: 'number', numeric: false },
      { key: 'total', header: 'Total Rows', unit: 'count', numeric: true },
      { key: 'committed', header: 'Committed', unit: 'count', numeric: true },
      { key: 'failed', header: 'Failed', unit: 'count', numeric: true },
    ],
    rows: jobs.map((j) => ({
      date: j.createdAt ?? '',
      domain: j.domain,
      fileName: j.fileMeta?.fileName ?? '',
      status: j.status,
      total: j.rowCounts.parsed,
      committed: j.rowCounts.committed,
      failed: j.rowCounts.failed,
    })),
  }
}

function buildFailedRetryableSheet(jobs: ImportJob[]): ExportSheetData {
  return {
    sheetName: 'Failed & Retryable Summary',
    columns: [
      { key: 'jobId', header: 'Job ID', unit: 'number', numeric: false },
      { key: 'domain', header: 'Domain', unit: 'number', numeric: false },
      { key: 'status', header: 'Status', unit: 'number', numeric: false },
      { key: 'committed', header: 'Committed', unit: 'count', numeric: true },
      { key: 'failed', header: 'Failed', unit: 'count', numeric: true },
      { key: 'remaining', header: 'Remaining', unit: 'count', numeric: true },
      { key: 'retryEligible', header: 'Retry Eligible', unit: 'number', numeric: false },
    ],
    rows: jobs
      .filter((j) => j.rowCounts.failed > 0 || j.status === 'PARTIALLY_COMPLETED')
      .map((j) => ({
        jobId: j.jobId,
        domain: j.domain,
        status: j.status,
        committed: j.rowCounts.committed,
        failed: j.rowCounts.failed,
        remaining: j.rowCounts.remaining,
        retryEligible: RETRY_ELIGIBLE_DOMAINS.has(j.domain) && j.status === 'PARTIALLY_COMPLETED' ? 'Yes' : 'No',
      })),
    notes: ['Job-level summary only — per-row error categories are not included (see template known limitations).'],
  }
}

function buildDomainSummarySheet(jobs: ImportJob[]): ExportSheetData {
  const counts = new Map<string, { domain: string; status: string; jobCount: number }>()
  for (const j of jobs) {
    const key = `${j.domain}::${j.status}`
    const existing = counts.get(key)
    if (existing) existing.jobCount += 1
    else counts.set(key, { domain: j.domain, status: j.status, jobCount: 1 })
  }
  return {
    sheetName: 'Domain Summary',
    columns: [
      { key: 'domain', header: 'Domain', unit: 'number', numeric: false },
      { key: 'status', header: 'Status', unit: 'number', numeric: false },
      { key: 'jobCount', header: 'Job Count', unit: 'count', numeric: true },
    ],
    rows: [...counts.values()],
  }
}

const DEFINITIONS: ExportDefinitionRow[] = [
  {
    metric: 'Status', definition: 'The current state of an import job.', formula: 'N/A',
    unit: 'category', source: 'import_jobs.status', exclusions: 'N/A', capBehavior: 'N/A',
    missingTargetBehavior: 'N/A', rankingScope: 'N/A', periodLogic: 'Most recent jobs first',
    notes: 'DRAFT, VALIDATING, COMMITTING, COMPLETED, PARTIALLY_COMPLETED, FAILED, CANCELLED.',
  },
  {
    metric: 'Retry Eligible', definition: 'Whether a job\'s remaining failed rows can be retried.', formula: 'domain in {BRANCH_ACTUALS, PHARMACIST_ACTUALS} AND status = PARTIALLY_COMPLETED',
    unit: 'boolean', source: 'Derived', exclusions: 'All other domains never support retry (see DATA_EXCHANGE_CLOSURE_MATRIX.md).',
    capBehavior: 'N/A', missingTargetBehavior: 'N/A', rankingScope: 'N/A', periodLogic: 'N/A',
    notes: 'Matches the closure matrix\'s documented per-domain retry capability exactly — never broadened here.',
  },
]

export function buildImportAuditDataset(params: ImportAuditDatasetParams): ExportDataset {
  const { jobs, generatedBy, generatedAt = new Date().toISOString() } = params
  const sheets = [buildJobsSheet(jobs), buildFailedRetryableSheet(jobs), buildDomainSummarySheet(jobs)]
  const rowCount = sheets.reduce((sum, s) => sum + s.rows.length, 0)

  return {
    meta: {
      templateId: 'import-audit',
      templateName: 'Import Audit Workbook',
      workbookVersion: '1.0',
      scopeLabel: 'Admin — all import jobs',
      periodLabel: `${jobs.length} most recent jobs`,
      generatedAt,
      generatedBy,
      rowCount,
      warnings: jobs.length === 0 ? ['No import jobs found.'] : [],
    },
    sheets,
    definitions: DEFINITIONS,
  }
}
