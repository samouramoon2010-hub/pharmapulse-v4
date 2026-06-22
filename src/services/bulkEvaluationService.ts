// ============================================================
// Bulk Evaluation Service — RF-1D-A
//
// Runs evaluation for all eligible users in a single branch
// for a selected month + evaluation profile.
//
// Architecture:
//   - Calls runEvaluationForUserMonth() per user — NO engine duplication
//   - Profile and branch target are fetched ONCE, not N times per user
//   - Registry fetched once via fetchKpiRegistryOnce()
//   - Processes users sequentially (avoids Firestore rate limits)
//   - Single-user failure does NOT abort the batch (partial success allowed)
//
// Eligible roles (RF-1C inclusion rule — individual contributors):
//   pharmacist, manager, branch_manager
//
// Excluded roles:
//   admin, supervisor, regional_manager, hub_store_manager
//   (hub_store_manager to be handled via evaluationCohort in RF-1D-B)
//
// Idempotency:
//   'skip'    — default: skip user if evaluation already exists for
//               same userId + month + profileId + profileVersion
//   're-run'  — create new ledger doc regardless (append-only; safe)
//
// Non-goals (RF-1D-A scope):
//   - supervisor/group bulk evaluation
//   - company-wide bulk evaluation
//   - scheduled evaluation
//   - auto ranking generation
//   - evaluationCohort schema
//   - hub store manager special logic
//   - float allocation
// ============================================================

import { runEvaluationForUserMonth } from './evaluationOrchestrationService'
import { fetchKpiRegistryOnce }       from './kpiRegistryService'
import { fetchEvaluationResultsForUserMonth } from './evaluationLedgerService'
import { requireLiveRegistry }       from '../engine/kpiRegistry/registryGuard'

// ── Eligible roles ─────────────────────────────────────────────

/**
 * Roles that are evaluated as individual contributors against personal KPI targets.
 * Mirrors the inclusion rule introduced in RF-1C (Samir fix).
 *
 * NOTE: 'role' on the user document is an ACCESS CONTROL role, not an evaluation
 * cohort designation. This is a proxy until RF-1D-B introduces 'evaluationCohort'.
 */
export const BULK_ELIGIBLE_ROLES = ['pharmacist', 'manager', 'branch_manager'] as const
export type BulkEligibleRole = typeof BULK_ELIGIBLE_ROLES[number]

export const BULK_EXCLUDED_ROLES = [
  'admin', 'supervisor', 'regional_manager', 'hub_store_manager',
] as const

export function isEligibleForBulkEvaluation(
  user: { role?: string; active?: boolean },
): boolean {
  if (!user.active) return false
  return BULK_ELIGIBLE_ROLES.includes(user.role as BulkEligibleRole)
}

// ── Types ──────────────────────────────────────────────────────

export type BulkIdempotencyMode = 'skip' | 're-run'

export interface BulkEvaluationOptions {
  pharmacyId:    string
  month:         string
  profileId:     string            // required — no role-based fallback in bulk mode
  generatedBy:   string            // admin userId
  actorRole:     string            // 'admin'
  idempotency:   BulkIdempotencyMode
}

export interface BulkEvaluationUserResult {
  userId:        string
  displayName:   string
  role:          string
  status:        'success' | 'skipped' | 'failed'
  ledgerDocId?:  string
  finalScore?:   number
  rating?:       string
  entryCount?:   number
  warnings:      string[]
  error?:        string
  skippedReason?: string
  /** V2 shadow comparison severity for this user ('none' | 'minor' | 'major' | 'error' | undefined) */
  shadowSeverity?: string
}

export interface BulkShadowSummary {
  total:   number   // evaluations where shadow ran (ran=true or ran=false)
  matched: number   // severity='none'
  minor:   number   // severity='minor'
  major:   number   // severity='major'
  failed:  number   // ran=false (shadow itself errored)
}

export interface BulkEvaluationReport {
  pharmacyId:     string
  month:          string
  profileId:      string
  profileVersion: number
  generatedAt:    string           // ISO
  generatedBy:    string
  totalEligible:  number
  succeeded:      number
  skipped:        number
  failed:         number
  results:        BulkEvaluationUserResult[]
  /**
   * Aggregate of V2 shadow comparison results across all evaluated users.
   * Populated after bulk run completes.
   * undefined if no shadow runs occurred.
   */
  shadowSummary?: BulkShadowSummary
}

// ── Main entry point ───────────────────────────────────────────

/**
 * Run bulk evaluation for all eligible users in a branch.
 *
 * Steps:
 *   1. Fetch all active users for the branch
 *   2. Filter to eligible roles (client-side — no extra Firestore index needed)
 *   3. Fetch profile once (not per-user)
 *   4. Fetch KPI registry once
 *   5. For each eligible user (sequential):
 *      a. Idempotency check
 *      b. runEvaluationForUserMonth()
 *      c. Collect result
 *   6. Return BulkEvaluationReport
 */
export async function runBranchBulkEvaluation(
  opts: BulkEvaluationOptions,
): Promise<BulkEvaluationReport> {
  const { pharmacyId, month, profileId, generatedBy, actorRole, idempotency } = opts
  const generatedAt = new Date().toISOString()

  // ── Step 1: fetch all active users for the branch ─────────────
  const { getUsersByPharmacy } = await import('./userService')
  const allUsers = await getUsersByPharmacy(pharmacyId) as Array<{
    id: string; displayName?: string; role?: string; active?: boolean
  }>

  // ── Step 2: filter to eligible roles ─────────────────────────
  const eligible = allUsers.filter(isEligibleForBulkEvaluation)

  const report: BulkEvaluationReport = {
    pharmacyId,
    month,
    profileId,
    profileVersion: 0,             // will be set once profile is fetched
    generatedAt,
    generatedBy,
    totalEligible: eligible.length,
    succeeded: 0,
    skipped:   0,
    failed:    0,
    results:   [],
  }

  if (eligible.length === 0) {
    return report
  }

  // ── Step 3: fetch profile ONCE ────────────────────────────────
  // Validates profile exists and is published before touching any users.
  const { fetchEvaluationProfile } = await import('./evaluationRegistryService')
  const profile = await fetchEvaluationProfile(profileId)
  if (!profile) {
    throw new Error(`Evaluation profile "${profileId}" not found`)
  }
  if (profile.status !== 'published') {
    throw new Error(
      `Profile "${profile.name}" is ${profile.status} — only published profiles can be used for evaluation`
    )
  }
  report.profileVersion = profile.version

  // ── Step 4: fetch KPI registry ONCE ──────────────────────────
  // Core KPI Dependency Removal — No Silent Core Fallback Closure:
  // require the registry to have actually resolved (not omitted) at
  // this orchestrator boundary. fetchKpiRegistryOnce() never resolves
  // to null/undefined in practice (it falls back to a copy of
  // DEFAULT_KPI_REGISTRY on error), so this never fires in real
  // production — it documents and enforces the contract. An empty
  // object ({}) is intentionally NOT rejected: getProductionEngineKeys
  // already returns [] (zero active KPIs) for it, not the Core list.
  const registry = requireLiveRegistry(await fetchKpiRegistryOnce(), 'bulkEvaluationService.runBulkEvaluation')

  // ── Step 5: evaluate each user sequentially ───────────────────
  const shadowCounts = { total: 0, matched: 0, minor: 0, major: 0, failed: 0 }

  for (const user of eligible) {
    const displayName = user.displayName ?? 'Unknown User'
    const role        = user.role ?? 'pharmacist'

    // ── 5a: idempotency check ──────────────────────────────────
    if (idempotency === 'skip') {
      try {
        const existing = await fetchEvaluationResultsForUserMonth(user.id, month)
        const alreadyDone = existing.some(
          (doc) =>
            doc.profileId      === profileId &&
            doc.profileVersion === profile.version,
        )
        if (alreadyDone) {
          report.results.push({
            userId:        user.id,
            displayName,
            role,
            status:        'skipped',
            warnings:      [],
            skippedReason: `Evaluation already exists for ${month} / ${profile.name} v${profile.version}`,
          })
          report.skipped++
          continue
        }
      } catch {
        // If we can't check, proceed with evaluation (safe: append-only)
      }
    }

    // ── 5b: run evaluation ─────────────────────────────────────
    try {
      const outcome = await runEvaluationForUserMonth({
        userId:       user.id,
        pharmacyId,
        userRole:     role,
        month,
        registry,
        calculatedBy: generatedBy,
        actorRole,
        profileId,
        shadowSource: 'bulk',
      })

      // Collect shadow severity for this user
      const shadowSev = outcome.shadow?.ran
        ? (outcome.shadow.comparison?.severity ?? 'none')
        : outcome.shadow
          ? 'error'
          : undefined

      if (outcome.shadow) {
        shadowCounts.total++
        if (!outcome.shadow.ran)                                   shadowCounts.failed++
        else if (outcome.shadow.comparison?.severity === 'none')  shadowCounts.matched++
        else if (outcome.shadow.comparison?.severity === 'minor') shadowCounts.minor++
        else if (outcome.shadow.comparison?.severity === 'major') shadowCounts.major++
      }

      report.results.push({
        userId:       user.id,
        displayName,
        role,
        status:       'success',
        ledgerDocId:  outcome.ledgerDoc.id,
        finalScore:   outcome.ledgerDoc.finalScore,
        rating:       outcome.ledgerDoc.rating,
        entryCount:   outcome.entryCount,
        warnings:     outcome.warnings,
        shadowSeverity: shadowSev,
      })
      report.succeeded++

    } catch (err) {
      // Single-user failure does NOT abort the batch
      report.results.push({
        userId:      user.id,
        displayName,
        role,
        status:      'failed',
        warnings:    [],
        error:       err instanceof Error ? err.message : String(err),
      })
      report.failed++
    }
  }

  // Attach shadow summary if any shadow runs occurred
  if (shadowCounts.total > 0) {
    report.shadowSummary = shadowCounts
  }

  return report
}

// ── Preview helper (no writes) ────────────────────────────────

export interface BulkEvaluationPreview {
  eligible:         Array<{ userId: string; displayName: string; role: string }>
  ineligible:       Array<{ userId: string; displayName: string; role: string; reason: string }>
  totalUsers:       number
  eligibleCount:    number
  ineligibleCount:  number
}

/**
 * Preview which users will be evaluated without running any evaluations.
 * Used by the UI to show a confirmation before executing the batch.
 */
export async function previewBranchBulkEvaluation(
  pharmacyId: string,
): Promise<BulkEvaluationPreview> {
  const { getUsersByPharmacy } = await import('./userService')
  const allUsers = await getUsersByPharmacy(pharmacyId) as Array<{
    id: string; displayName?: string; role?: string; active?: boolean
  }>

  const eligible:   BulkEvaluationPreview['eligible']   = []
  const ineligible: BulkEvaluationPreview['ineligible'] = []

  for (const u of allUsers) {
    const name = u.displayName ?? 'Unknown User'
    const role = u.role ?? 'unknown'

    if (!u.active) {
      ineligible.push({ userId: u.id, displayName: name, role, reason: 'Inactive user' })
    } else if (BULK_EXCLUDED_ROLES.includes(role as any)) {
      ineligible.push({ userId: u.id, displayName: name, role, reason: `Role '${role}' excluded from individual ranking` })
    } else if (!BULK_ELIGIBLE_ROLES.includes(role as BulkEligibleRole)) {
      ineligible.push({ userId: u.id, displayName: name, role, reason: `Role '${role}' not in eligible list` })
    } else {
      eligible.push({ userId: u.id, displayName: name, role })
    }
  }

  return {
    eligible,
    ineligible,
    totalUsers:      allUsers.length,
    eligibleCount:   eligible.length,
    ineligibleCount: ineligible.length,
  }
}
