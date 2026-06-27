// ============================================================
// Organization Onboarding Orchestrator (DX-2/DX-3, Part 6 & 7)
//
// Sequences Groups -> Branches -> Pharmacists -> Assignments through
// the unmodified DX-1 Import Job Engine, passing each domain's
// successfully committed identities forward as the next domain's
// dependency-resolution set. This is built entirely on top of DX-1's
// existing generic capabilities (runValidation/commitJob/knownIds-style
// resolvable maps) — no engine changes were needed or made.
//
// Multi-sheet detection: sheet names are matched against the same
// alias style used for column headers (EN/AR, case-insensitive).
// Only a flat 4-sheet workbook shape is supported, matching Part 7's
// explicit "do not support arbitrary nested workbook structures."
// ============================================================

import type { GuardContext } from '../security/accessGuard'
import { createImportJob, runValidation, commitJob } from './importJobEngine'
import type { ImportDomain, ImportJob, StagedImportRow, ImportJobResult } from './importJobTypes'
import type { ImportValidationContext, ImportAuthorizationContext, ImportCommitContext } from './importDomainAdapter'
import type { FirestoreStagingRepository } from './firestoreStagingRepository'

import { createGroupsAdapter } from './adapters/groupsAdapter'
import type { GroupsAdapterDeps, GroupStaged } from './adapters/groupsAdapter'
import { createBranchesAdapter } from './adapters/branchesAdapter'
import type { BranchesAdapterDeps, BranchStaged } from './adapters/branchesAdapter'
import { createPharmacistsAdapter } from './adapters/pharmacistsAdapter'
import type { PharmacistsAdapterDeps, PharmacistStaged } from './adapters/pharmacistsAdapter'
import { createAssignmentsAdapter } from './adapters/assignmentsAdapter'
import type { AssignmentsAdapterDeps } from './adapters/assignmentsAdapter'

export const ONBOARDING_DOMAIN_ORDER: ImportDomain[] = ['GROUP', 'BRANCH', 'PHARMACIST', 'ASSIGNMENT']

// ── Multi-sheet detection (Part 7) ─────────────────────────────
const SHEET_NAME_ALIASES: Record<string, ImportDomain> = {
  groups: 'GROUP', group: 'GROUP', 'المجموعات': 'GROUP',
  branches: 'BRANCH', branch: 'BRANCH', 'الفروع': 'BRANCH',
  pharmacists: 'PHARMACIST', pharmacist: 'PHARMACIST', users: 'PHARMACIST', 'الصيادلة': 'PHARMACIST',
  assignments: 'ASSIGNMENT', assignment: 'ASSIGNMENT', 'التكليفات': 'ASSIGNMENT',
}

export function detectSheetDomain(sheetName: string): ImportDomain | null {
  return SHEET_NAME_ALIASES[sheetName.trim().toLowerCase()] ?? null
}

export interface SheetMapping {
  sheetName: string
  domain:    ImportDomain | null   // null = unresolved, requires manual mapping
}

/** Maps every sheet in a workbook to a domain, using aliases first and
 *  falling back to an explicit manual mapping supplied by the caller
 *  (Part 7: "allow manual sheet-to-domain mapping"). */
export function resolveSheetMappings(
  sheetNames:     string[],
  manualMapping:  Record<string, ImportDomain> = {},
): SheetMapping[] {
  return sheetNames.map((sheetName) => ({
    sheetName,
    domain: manualMapping[sheetName] ?? detectSheetDomain(sheetName),
  }))
}

// ── Orchestration ────────────────────────────────────────────────

export interface OnboardingExistingData {
  groups:       GroupsAdapterDeps['existingGroups']
  regions:      GroupsAdapterDeps['existingRegions']
  branches:     BranchesAdapterDeps['existingBranches']
  pharmacistsByEmployeeId: PharmacistsAdapterDeps['existingByEmployeeId']
  pharmacistsByEmail:      PharmacistsAdapterDeps['existingByEmail']
  primaryAssignmentByEmployeeId: AssignmentsAdapterDeps['existingPrimaryByEmployeeId']
}

export interface OnboardingRows {
  groupRows?:       Record<string, unknown>[]
  branchRows?:      Record<string, unknown>[]
  pharmacistRows?:  Record<string, unknown>[]
  assignmentRows?:  Record<string, unknown>[]
}

export interface DomainOutcome<TStaged> {
  job:    ImportJob
  rows:   StagedImportRow<TStaged>[]
  result: ImportJobResult
}

export interface OnboardingJobResult {
  groups?:       DomainOutcome<GroupStaged>
  branches?:     DomainOutcome<BranchStaged>
  pharmacists?:  DomainOutcome<PharmacistStaged>
  assignments?:  DomainOutcome<unknown>
}

export interface RunOnboardingParams {
  jobIdPrefix: string
  guardCtx:    GuardContext
  actorRole:   string
  rows:        OnboardingRows
  existing:    OnboardingExistingData
}

async function runOneDomain<TRaw, TStaged>(
  domain:      ImportDomain,
  jobId:       string,
  adapter:     ReturnType<typeof createGroupsAdapter> | ReturnType<typeof createBranchesAdapter> | ReturnType<typeof createPharmacistsAdapter> | ReturnType<typeof createAssignmentsAdapter>,
  excelRows:   Record<string, unknown>[],
  guardCtx:    GuardContext,
  actorRole:   string,
): Promise<DomainOutcome<TStaged>> {
  const job0 = createImportJob({ jobId, domain, createdBy: guardCtx.uid })
  const parsedRaw = excelRows.map((row, i) => adapter.parseRow(row, i + 1, { domain }))

  const validationCtx: ImportValidationContext = { actorUid: guardCtx.uid, actorRole, pharmacyId: guardCtx.pharmacyId, batchId: jobId }
  const authCtx: ImportAuthorizationContext     = { actorUid: guardCtx.uid, actorRole, pharmacyId: guardCtx.pharmacyId }

  const { job: validated, rows } = await runValidation(job0, adapter as never, parsedRaw as never, validationCtx, authCtx)

  if (validated.status === 'FAILED') {
    return { job: validated, rows: rows as StagedImportRow<TStaged>[], result: {
      jobId: validated.jobId, status: validated.status, totalRows: rows.length,
      committed: 0, skipped: 0, failed: 0, remaining: 0, batches: [],
    } }
  }

  const commitCtx: ImportCommitContext = { actorUid: guardCtx.uid, actorRole, jobId: validated.jobId }
  // chunkSize: 1 — these onboarding domains commit through existing
  // single-document services (createDistrict/createPharmacy/setDoc/
  // transferUser), not a Firestore writeBatch, so each row is its own
  // "batch" — this gives exact per-row partial-failure reporting using
  // DX-1's existing, unmodified chunking mechanism.
  const { job: committed, rows: finalRows, result } = await commitJob(validated, adapter as never, rows as never, commitCtx, { chunkSize: 1 })

  return { job: committed, rows: finalRows as StagedImportRow<TStaged>[], result }
}

/**
 * Runs the full Groups -> Branches -> Pharmacists -> Assignments
 * onboarding job in dependency order. Each domain only proceeds against
 * dependency references that resolve to either a pre-existing record or
 * a record successfully committed by an earlier domain in THIS SAME
 * call — never a record that merely validated but failed to commit.
 */
export async function runOrganizationOnboardingJob(params: RunOnboardingParams): Promise<OnboardingJobResult> {
  const { jobIdPrefix, guardCtx, actorRole, rows, existing } = params
  const result: OnboardingJobResult = {}

  // ── 1. Groups ──
  const resolvableGroupCodes = new Map<string, string>(existing.groups.map((g) => [g.code.toUpperCase(), g.id]))
  if (rows.groupRows) {
    const adapter = createGroupsAdapter({ guardCtx, actorRole, existingGroups: existing.groups, existingRegions: existing.regions })
    const outcome = await runOneDomain<unknown, GroupStaged>('GROUP', `${jobIdPrefix}-groups`, adapter, rows.groupRows, guardCtx, actorRole)
    result.groups = outcome
    for (const row of outcome.rows) {
      if (row.state === 'COMMITTED' && row.staged && row.committedResult) {
        const { id } = row.committedResult as { id: string }
        resolvableGroupCodes.set(row.staged.code, id)
      }
    }
  }

  // ── 2. Branches ──
  const resolvableBranchCodes = new Map<string, string>(existing.branches.map((b) => [b.code, b.id]))
  if (rows.branchRows) {
    const adapter = createBranchesAdapter({
      guardCtx, actorRole, existingBranches: existing.branches,
      resolvableGroupCodes,
    })
    const outcome = await runOneDomain<unknown, BranchStaged>('BRANCH', `${jobIdPrefix}-branches`, adapter, rows.branchRows, guardCtx, actorRole)
    result.branches = outcome
    for (const row of outcome.rows) {
      if (row.state === 'COMMITTED' && row.staged) resolvableBranchCodes.set(row.staged.code, row.staged.code)
    }
  }

  // ── 3. Pharmacists ──
  const resolvablePharmacistIds = new Map<string, string>(
    [...existing.pharmacistsByEmployeeId.entries()].map(([empId, rec]) => [empId, rec.id]),
  )
  if (rows.pharmacistRows) {
    const adapter = createPharmacistsAdapter({
      guardCtx, actorRole,
      existingByEmployeeId: existing.pharmacistsByEmployeeId,
      existingByEmail: existing.pharmacistsByEmail,
      resolvableBranchCodes,
    })
    const outcome = await runOneDomain<unknown, PharmacistStaged>('PHARMACIST', `${jobIdPrefix}-pharmacists`, adapter, rows.pharmacistRows, guardCtx, actorRole)
    result.pharmacists = outcome
    for (const row of outcome.rows) {
      if (row.state === 'COMMITTED' && row.staged) resolvablePharmacistIds.set(row.staged.employeeId, `pending_${row.staged.employeeId}`)
    }
  }

  // ── 4. Assignments ──
  if (rows.assignmentRows) {
    const adapter = createAssignmentsAdapter({
      guardCtx, actorRole, resolvablePharmacistIds, resolvableBranchCodes,
      existingPrimaryByEmployeeId: existing.primaryAssignmentByEmployeeId,
    })
    const outcome = await runOneDomain<unknown, unknown>('ASSIGNMENT', `${jobIdPrefix}-assignments`, adapter, rows.assignmentRows, guardCtx, actorRole)
    result.assignments = outcome
  }

  return result
}

// ============================================================
// Closure Patch Part 4/6 — Preview/Commit separation
//
// validateOnboardingJob() never calls commitJob/commitBatch — it is
// pure validation + Firestore staging persistence (import_jobs/rows),
// exactly like DX-1's existing runValidation(). It uses TENTATIVE
// cross-domain resolution (existing records UNION same-file rows that
// will be created) purely so a branch referencing a brand-new group
// in the same file previews as CREATE instead of a false
// DEPENDENCY_BLOCKED error — the placeholder values are never
// persisted as real foreign keys because nothing is committed here.
//
// commitOnboardingJob() re-validates everything against a FRESH
// existing-data snapshot (supplied by the caller, who must re-fetch
// immediately before calling) to compute a fresh signature; if it
// doesn't match the signature captured at Preview time, the commit is
// refused and the mismatch is reported (Part 6 stale-preview
// protection) — no Firestore writes happen on a stale preview. If it
// matches, this delegates to the already-existing, already-tested
// runOrganizationOnboardingJob() for the actual real-ID-threaded
// commit, so no part of DX-1's commit/state-machine logic is
// duplicated or rewritten.
// ============================================================

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/** Pure, deterministic, non-cryptographic fingerprint (FNV-1a). Used only
 *  to detect "did the preview go stale before commit" — never for
 *  security or identity. */
function fingerprint(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(16)
}

export function computeRowsSignature(rows: StagedImportRow<unknown>[]): string {
  const normalized = [...rows]
    .map((r) => ({ rowId: r.rowId, identityKey: r.identityKey, classification: r.classification, staged: r.staged }))
    .sort((a, b) => a.rowId.localeCompare(b.rowId))
  return fingerprint(stableStringify(normalized))
}

async function validateOneDomain<TStaged>(
  domain:    ImportDomain,
  jobId:     string,
  adapter:   ReturnType<typeof createGroupsAdapter> | ReturnType<typeof createBranchesAdapter> | ReturnType<typeof createPharmacistsAdapter> | ReturnType<typeof createAssignmentsAdapter>,
  excelRows: Record<string, unknown>[],
  guardCtx:  GuardContext,
  actorRole: string,
): Promise<{ job: ImportJob; rows: StagedImportRow<TStaged>[] }> {
  const job0 = createImportJob({ jobId, domain, createdBy: guardCtx.uid })
  const parsedRaw = excelRows.map((row, i) => adapter.parseRow(row, i + 1, { domain }))

  const validationCtx: ImportValidationContext = { actorUid: guardCtx.uid, actorRole, pharmacyId: guardCtx.pharmacyId, batchId: jobId }
  const authCtx: ImportAuthorizationContext     = { actorUid: guardCtx.uid, actorRole, pharmacyId: guardCtx.pharmacyId }

  const { job: validated, rows } = await runValidation(job0, adapter as never, parsedRaw as never, validationCtx, authCtx)
  return { job: validated, rows: rows as StagedImportRow<TStaged>[] }
}

export interface DomainPreviewSummary {
  domain:             ImportDomain
  totalRows:          number
  creates:            number
  updates:            number
  unchanged:          number
  duplicates:         number
  conflicts:          number
  errors:             number
  dependencyBlocked:  number
  /** PHARMACIST domain only — rows that will be staged as
   *  PENDING_INVITATION (no Firebase Auth account created by this
   *  import). Zero for every other domain. */
  pendingAuthPharmacists: number
}

export interface OnboardingPreviewResult {
  previewSignature: string
  domains:          DomainPreviewSummary[]
  jobs:             { groups?: ImportJob; branches?: ImportJob; pharmacists?: ImportJob; assignments?: ImportJob }
  /** Staged rows per domain job, keyed by jobId — kept alongside the
   *  per-domain summary so validateOnboardingJob() can persist them
   *  without re-running validation, and so the UI can render row-level
   *  detail (Part 5: "review row details"). */
  rowsByJobId:      Record<string, StagedImportRow<unknown>[]>
  /** False if ANY domain has a row classified ERROR or CONFLICT — the
   *  UI's Commit button must stay disabled until this is true and the
   *  user has resolved/excluded every blocking row (Part 5). */
  readyToCommit:    boolean
}

function summarizeDomainPreview(domain: ImportDomain, rows: StagedImportRow<unknown>[]): DomainPreviewSummary {
  const summary: DomainPreviewSummary = {
    domain, totalRows: rows.length, creates: 0, updates: 0, unchanged: 0,
    duplicates: 0, conflicts: 0, errors: 0, dependencyBlocked: 0, pendingAuthPharmacists: 0,
  }
  for (const row of rows) {
    switch (row.classification) {
      case 'VALID':    summary.creates++; break
      case 'WARNING':  summary.creates++; break
      case 'UPDATE':   summary.updates++; break
      case 'SKIP':     summary.unchanged++; break
      case 'DUPLICATE': summary.duplicates++; break
      case 'CONFLICT': summary.conflicts++; break
      case 'ERROR':    summary.errors++
        if (row.issues.some((i) => i.code === 'DEPENDENCY_BLOCKED')) summary.dependencyBlocked++
        break
    }
    if (domain === 'PHARMACIST' && (row.classification === 'VALID' || row.classification === 'WARNING')) {
      summary.pendingAuthPharmacists++
    }
  }
  return summary
}

/**
 * Pure validation pass (no Firestore writes at all, not even staging) —
 * shared by validateOnboardingJob() (which persists the result) and
 * commitOnboardingJob() (which only needs a fresh signature to compare
 * against, and must never leave extra staging artifacts behind on every
 * commit attempt).
 */
async function computeOnboardingPreview(params: RunOnboardingParams): Promise<OnboardingPreviewResult> {
  const { jobIdPrefix, guardCtx, actorRole, rows, existing } = params
  const domains: DomainPreviewSummary[] = []
  const jobs: { groups?: ImportJob; branches?: ImportJob; pharmacists?: ImportJob; assignments?: ImportJob } = {}
  const allRows: StagedImportRow<unknown>[] = []

  // Tentative (same-file, not-yet-real) resolution — existing-only is
  // never enough for a preview, because a branch may reference a group
  // that is itself only a CREATE row in this same file. The placeholder
  // value is discarded; commitOnboardingJob() re-resolves with real IDs.
  const resolvableGroupCodes = new Map<string, string>(existing.groups.map((g) => [g.code.toUpperCase(), g.id]))
  if (rows.groupRows) {
    const adapter = createGroupsAdapter({ guardCtx, actorRole, existingGroups: existing.groups, existingRegions: existing.regions })
    const { job, rows: domainRows } = await validateOneDomain<GroupStaged>('GROUP', `${jobIdPrefix}-groups`, adapter, rows.groupRows, guardCtx, actorRole)
    jobs.groups = job
    allRows.push(...(domainRows as StagedImportRow<unknown>[]))
    domains.push(summarizeDomainPreview('GROUP', domainRows as StagedImportRow<unknown>[]))
    for (const row of domainRows) {
      if (row.staged && (row.classification === 'VALID' || row.classification === 'WARNING' || row.classification === 'UPDATE')) {
        resolvableGroupCodes.set(row.staged.code.toUpperCase(), `PREVIEW:${row.staged.code}`)
      }
    }
  }

  const resolvableBranchCodes = new Map<string, string>(existing.branches.map((b) => [b.code, b.id]))
  if (rows.branchRows) {
    const adapter = createBranchesAdapter({ guardCtx, actorRole, existingBranches: existing.branches, resolvableGroupCodes })
    const { job, rows: domainRows } = await validateOneDomain<BranchStaged>('BRANCH', `${jobIdPrefix}-branches`, adapter, rows.branchRows, guardCtx, actorRole)
    jobs.branches = job
    allRows.push(...(domainRows as StagedImportRow<unknown>[]))
    domains.push(summarizeDomainPreview('BRANCH', domainRows as StagedImportRow<unknown>[]))
    for (const row of domainRows) {
      if (row.staged && (row.classification === 'VALID' || row.classification === 'WARNING' || row.classification === 'UPDATE')) {
        resolvableBranchCodes.set(row.staged.code, `PREVIEW:${row.staged.code}`)
      }
    }
  }

  // Newly-onboarded pharmacists always commit to a deterministic doc ID
  // (pending_${employeeId}) regardless of WHEN they actually commit —
  // unlike groups/branches, this is already the real ID, not a
  // placeholder, so assignments can reference a same-file new pharmacist
  // with no extra tentative-resolution step.
  const resolvablePharmacistIds = new Map<string, string>(
    [...existing.pharmacistsByEmployeeId.entries()].map(([empId, rec]) => [empId, rec.id]),
  )
  if (rows.pharmacistRows) {
    const adapter = createPharmacistsAdapter({
      guardCtx, actorRole,
      existingByEmployeeId: existing.pharmacistsByEmployeeId,
      existingByEmail: existing.pharmacistsByEmail,
      resolvableBranchCodes,
    })
    const { job, rows: domainRows } = await validateOneDomain<PharmacistStaged>('PHARMACIST', `${jobIdPrefix}-pharmacists`, adapter, rows.pharmacistRows, guardCtx, actorRole)
    jobs.pharmacists = job
    allRows.push(...(domainRows as StagedImportRow<unknown>[]))
    domains.push(summarizeDomainPreview('PHARMACIST', domainRows as StagedImportRow<unknown>[]))
    for (const row of domainRows) {
      if (row.staged && (row.classification === 'VALID' || row.classification === 'WARNING' || row.classification === 'UPDATE')) {
        resolvablePharmacistIds.set(row.staged.employeeId, `pending_${row.staged.employeeId}`)
      }
    }
  }

  if (rows.assignmentRows) {
    const adapter = createAssignmentsAdapter({
      guardCtx, actorRole, resolvablePharmacistIds, resolvableBranchCodes,
      existingPrimaryByEmployeeId: existing.primaryAssignmentByEmployeeId,
    })
    const { job, rows: domainRows } = await validateOneDomain<unknown>('ASSIGNMENT', `${jobIdPrefix}-assignments`, adapter, rows.assignmentRows, guardCtx, actorRole)
    jobs.assignments = job
    allRows.push(...(domainRows as StagedImportRow<unknown>[]))
    domains.push(summarizeDomainPreview('ASSIGNMENT', domainRows as StagedImportRow<unknown>[]))
  }

  const previewSignature = computeRowsSignature(allRows)

  const rowsByJobId: Record<string, StagedImportRow<unknown>[]> = {}
  for (const job of Object.values(jobs)) {
    if (!job) continue
    rowsByJobId[job.jobId] = allRows.filter((r) => r.jobId === job.jobId)
  }

  const readyToCommit = allRows.every((r) => r.classification !== 'ERROR' && r.classification !== 'CONFLICT')
    && Object.values(jobs).every((j) => j && j.status === 'READY')

  return { previewSignature, domains, jobs, rowsByJobId, readyToCommit }
}

/**
 * Validates (but never commits) Groups -> Branches -> Pharmacists ->
 * Assignments, persists every domain's job + staged rows to Firestore
 * staging, and returns a structured preview the UI can render (Part 5)
 * without ever writing to a production collection (Part 4-A).
 */
export async function validateOnboardingJob(
  params: RunOnboardingParams,
  repo:   FirestoreStagingRepository,
): Promise<OnboardingPreviewResult> {
  const preview = await computeOnboardingPreview(params)

  // Persist every domain job (with its signature) + staged rows — this
  // is the ONLY Firestore write validateOnboardingJob performs, and it
  // touches only the import_jobs staging collection, never Groups/
  // Branches/Pharmacists/Assignments production collections (Part 4-A).
  for (const [key, job] of Object.entries(preview.jobs) as Array<[keyof typeof preview.jobs, ImportJob | undefined]>) {
    if (!job) continue
    const jobWithSignature: ImportJob = { ...job, previewSignature: preview.previewSignature }
    preview.jobs[key] = jobWithSignature
    await repo.saveJob(jobWithSignature)
    const rowsForJob = preview.rowsByJobId[job.jobId] ?? []
    if (rowsForJob.length > 0) await repo.saveStagedRows(job.jobId, rowsForJob)
  }

  return preview
}

function jobIdForDomain(jobIdPrefix: string, domain: ImportDomain): string {
  switch (domain) {
    case 'GROUP':      return `${jobIdPrefix}-groups`
    case 'BRANCH':     return `${jobIdPrefix}-branches`
    case 'PHARMACIST': return `${jobIdPrefix}-pharmacists`
    case 'ASSIGNMENT': return `${jobIdPrefix}-assignments`
    default:           return `${jobIdPrefix}-${domain.toLowerCase()}`
  }
}

export interface CommitOnboardingParams extends RunOnboardingParams {
  /** The previewSignature returned by validateOnboardingJob() for this
   *  same jobIdPrefix. `existing` here MUST be freshly re-fetched from
   *  Firestore immediately before calling — this function recomputes a
   *  fresh signature from it and refuses to commit if it differs from
   *  what the user actually saw and confirmed (Part 6). */
  expectedPreviewSignature: string
}

export interface CommitOnboardingOutcome {
  stale:        boolean
  staleReason?: string
  /** Present only when `stale` is false and the commit actually ran. */
  result?:      OnboardingJobResult
}

/**
 * Confirm/Commit (Part 4-B). Refuses to write anything if the freshly
 * re-validated data no longer matches what was previewed (Part 6 — a
 * stale preview never silently commits). Otherwise delegates to the
 * already-existing, already-tested runOrganizationOnboardingJob() for
 * the real-ID-threaded, dependency-ordered commit — no DX-1 commit
 * logic is duplicated.
 */
export async function commitOnboardingJob(
  params: CommitOnboardingParams,
  repo:   FirestoreStagingRepository,
): Promise<CommitOnboardingOutcome> {
  const { jobIdPrefix, guardCtx, actorRole, rows, existing, expectedPreviewSignature } = params

  // Refuse a second commit outright — never re-attempt a write against a
  // job that already finished committing.
  for (const domain of ONBOARDING_DOMAIN_ORDER) {
    const jobId = jobIdForDomain(jobIdPrefix, domain)
    const persisted = await repo.loadJob(jobId)
    if (persisted && (persisted.status === 'COMPLETED' || persisted.status === 'PARTIALLY_COMPLETED')) {
      return { stale: true, staleReason: `Job ${jobId} already committed (status ${persisted.status}) — refusing to commit twice.` }
    }
  }

  // Re-validate everything against the FRESH existing-data snapshot
  // supplied by the caller, using the same tentative cross-domain
  // resolution as the preview, to compute a fresh signature comparable
  // to the one the user actually confirmed. Pure — no staging writes,
  // so retrying a stale commit never leaves duplicate staging artifacts.
  const fresh = await computeOnboardingPreview({ jobIdPrefix, guardCtx, actorRole, rows, existing })

  if (fresh.previewSignature !== expectedPreviewSignature) {
    return {
      stale: true,
      staleReason: 'Existing Firestore records changed since this preview was generated. Revalidate before committing.',
    }
  }

  const result = await runOrganizationOnboardingJob({ jobIdPrefix, guardCtx, actorRole, rows, existing })

  // Persist the final committed/failed status of every domain job that
  // actually ran — this is what makes the "refuse a second commit" guard
  // above effective on a SUBSEQUENT call. Without this, the staging
  // collection would still show the pre-commit READY status forever and
  // a second commit attempt would silently re-run and re-commit.
  for (const outcome of Object.values(result)) {
    if (outcome) await repo.saveJob(outcome.job)
  }

  return { stale: false, result }
}
