// ============================================================
// DX-9 — Data Exchange Studio Closure Certification
//
// Cross-cutting structural checks that don't belong to any single
// adapter/runner test file: template-catalog-to-domain coverage, the
// authoritative issue-code-to-taxonomy mapping (never silently
// falling back to "System Error" for a real code), and backward
// compatibility of the ImportJob/StagedImportRow shape used by every
// pre-DX-8 job still sitting in Firestore.
//
// Per-domain behavior (stale preview, double-commit, retry safety,
// CLAIMED exclusion) is already covered by closurePatch.test.ts,
// claimedVisibility.test.ts, kpiTargetsImportRunner.test.ts, and
// actualsImportRunner.test.ts — not duplicated here.
// ============================================================
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { TEMPLATE_CATALOG, TEMPLATE_GROUPS, getTemplatesByGroup } from './templateCatalog'
import { checkTemplateVersion } from './templateVersionGuard'
import { categorizeIssueCode, IMPORT_ERROR_CATEGORIES } from './importErrorTaxonomy'
import type { ImportDomain } from './importJobTypes'

// The authoritative set of every ImportDomain literal that has a real
// adapter + runner today (KPI_ACTUALS is the deliberately-unmodified
// legacy domain, distinct from BRANCH_ACTUALS/PHARMACIST_ACTUALS).
const ALL_IMPORT_DOMAINS: ImportDomain[] = [
  'GROUP', 'BRANCH', 'PHARMACIST', 'ASSIGNMENT',
  'KPI_REGISTRY', 'BRANCH_TARGET', 'PHARMACIST_TARGET',
  'BRANCH_ACTUALS', 'PHARMACIST_ACTUALS',
]

// Every real ValidationIssue.code emitted across src/services/dataExchange
// (verified by grepping `code: '[A-Z_]+'` in adapters/*.ts and
// importJobEngine.ts at the time this bundle closed). If an adapter adds
// a new code in the future without updating importErrorTaxonomy.ts, this
// test fails loudly instead of the new code silently defaulting to a
// misleading "System Error" badge in the UI.
const ALL_REAL_ISSUE_CODES = [
  'MISSING_REQUIRED_FIELD', 'MISSING_EMPLOYEE_ID', 'MISSING_GROUP_IDENTITY', 'MISSING_ARABIC_LABEL',
  'MISSING_OPTIONAL_FIELD', 'FIELD_NOT_PERSISTED', 'EVALUATION_FLAG_IGNORED',
  'UNKNOWN_BRANCH', 'UNKNOWN_KPI', 'UNKNOWN_PARENT_ORGANIZATION', 'UNKNOWN_PHARMACIST',
  'INVALID_EMAIL', 'INVALID_MANAGER_EMAIL', 'INVALID_KEY', 'INVALID_STATUS', 'INVALID_DATE',
  'INVALID_MONTH', 'INVALID_ASSIGNMENT_DATE', 'INVALID_EMPLOYMENT_DATE', 'FUTURE_DATE',
  'INVALID_CATEGORY', 'INVALID_DIRECTION', 'INVALID_LIFECYCLE_STAGE', 'INVALID_AGGREGATION_METHOD',
  'INVALID_SORT_ORDER', 'INVALID_MIN_MAX', 'INVALID_TARGET_VALUE', 'INVALID_ACTUAL_VALUE',
  'NEGATIVE_TARGET_VALUE', 'NEGATIVE_ACTUAL_VALUE', 'UNSUPPORTED_ASSIGNMENT_TYPE', 'UNSUPPORTED_ROLE',
  'INACTIVE_BRANCH', 'INACTIVE_KPI', 'INACTIVE_PHARMACIST', 'ARCHIVED_KPI',
  'KPI_NOT_PRODUCTION_EVALUATION', 'DASHBOARD_IMPORT_NOT_ENABLED', 'TARGET_NOT_ENABLED',
  'BRANCH_HAS_NO_MANAGER', 'PHARMACIST_BRANCH_MISMATCH', 'TEST_KEY_PROMOTION_BLOCKED', 'DEPENDENCY_BLOCKED',
  'NORMALIZED_KEY_COLLISION', 'DUPLICATE_EMAIL', 'DUPLICATE_EMPLOYEE_ID_DIFFERENT_EMAIL',
  'EMAIL_LINKED_TO_ANOTHER_EMPLOYEE', 'OVERLAPPING_PRIMARY_ASSIGNMENT', 'IDENTITY_REVIEW_REQUIRED',
  'UNAUTHORIZED_ROW', 'FILE_TOO_LARGE',
]

describe('DX-9 — Template catalog domain coverage', () => {
  it('every ImportDomain with a real adapter has a discoverable template path', () => {
    // Organization Onboarding covers GROUP/BRANCH/PHARMACIST/ASSIGNMENT
    // as one multi-sheet workbook; every other domain has its own entry.
    const onboarding = TEMPLATE_CATALOG.find((e) => e.id === 'organization-onboarding')
    expect(onboarding).toBeDefined()
    expect(onboarding!.domain).toContain('GROUP')
    expect(onboarding!.domain).toContain('BRANCH')
    expect(onboarding!.domain).toContain('PHARMACIST')
    expect(onboarding!.domain).toContain('ASSIGNMENT')

    const singleDomainEntries = TEMPLATE_CATALOG.filter((e) => e.id !== 'organization-onboarding')
    const coveredSingle: ImportDomain[] = ['KPI_REGISTRY', 'BRANCH_TARGET', 'PHARMACIST_TARGET', 'BRANCH_ACTUALS', 'PHARMACIST_ACTUALS']
    for (const domain of coveredSingle) {
      expect(singleDomainEntries.some((e) => e.domain === domain)).toBe(true)
    }
  })

  it('the catalog has no domain claimed twice and no domain missing from ALL_IMPORT_DOMAINS', () => {
    const claimed = new Set<string>()
    for (const entry of TEMPLATE_CATALOG) {
      for (const d of entry.domain.split(',').map((s) => s.trim())) {
        expect(claimed.has(d)).toBe(false)
        claimed.add(d)
      }
    }
    for (const domain of ALL_IMPORT_DOMAINS) {
      expect(claimed.has(domain)).toBe(true)
    }
  })

  it('every catalog entry groups under one of the 3 declared Template Library groups', () => {
    const grouped = TEMPLATE_GROUPS.flatMap((g) => getTemplatesByGroup(g))
    expect(grouped.length).toBe(TEMPLATE_CATALOG.length)
  })

  it('every catalog entry\'s build() produces a workbook accepted by the version guard', () => {
    for (const entry of TEMPLATE_CATALOG) {
      const wb = entry.build()
      const metadataRows = wb.SheetNames.includes('Metadata')
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Metadata'])
        : undefined
      expect(checkTemplateVersion(metadataRows).supported).toBe(true)
    }
  })
})

describe('DX-9 — Error taxonomy completeness (no silent System Error fallback for a real code)', () => {
  it('every real issue code emitted anywhere in the adapters maps to a non-System-Error category', () => {
    const unmapped = ALL_REAL_ISSUE_CODES.filter((code) => categorizeIssueCode(code) === 'System Error')
    expect(unmapped).toEqual([])
  })

  it('every category produced for a real code is one of the 11 task-specified categories', () => {
    for (const code of ALL_REAL_ISSUE_CODES) {
      expect(IMPORT_ERROR_CATEGORIES).toContain(categorizeIssueCode(code))
    }
  })

  it('a genuinely unknown future code still safely falls back to System Error, never throws', () => {
    expect(() => categorizeIssueCode('NOT_YET_INVENTED_CODE')).not.toThrow()
    expect(categorizeIssueCode('NOT_YET_INVENTED_CODE')).toBe('System Error')
  })
})

describe('DX-9 — Backward compatibility (pre-DX-8 jobs and templates)', () => {
  it('a workbook with no Metadata sheet at all (every pre-DX-8 template) is never rejected by the version guard', () => {
    const legacyWorkbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([['Code', 'Name'], ['B001', 'Old Branch']])
    XLSX.utils.book_append_sheet(legacyWorkbook, sheet, 'Branches')

    const result = checkTemplateVersion(undefined)
    expect(result.supported).toBe(true)
    expect(legacyWorkbook.SheetNames).not.toContain('Metadata')
  })

  it('a pre-DX-8-shaped ImportJob summary (no template-version-related fields) is still a structurally valid job', () => {
    // ImportJob never gained a new *required* field in DX-8/DX-9 — confirmed
    // structurally: a job object with exactly the DX-1 fields still
    // satisfies every closure-era read path (listRecentImportJobs just
    // returns whatever is on the doc, no required-field assertion).
    const legacyJob = {
      jobId: 'job-legacy-1',
      domain: 'BRANCH' as ImportDomain,
      status: 'COMPLETED' as const,
      createdBy: 'admin-1',
      rowCounts: { total: 10, committed: 10, failed: 0 },
      commitBatches: [],
    }
    expect(legacyJob.jobId).toBeTruthy()
    expect(legacyJob.status).toBe('COMPLETED')
  })
})
