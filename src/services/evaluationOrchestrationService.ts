// ============================================================
// Evaluation Orchestration — ER-2B / Profile-Selection Fix
//
// runEvaluationForUserMonth() is the single public entry point
// for the complete end-to-end evaluation flow.
//
// Profile resolution priority (ER-2B fix):
//   1. If profileId is provided → fetch that specific published profile.
//      The evaluated user's stored role is NOT used for profile lookup.
//      This allows a manager to be evaluated using a pharmacist profile.
//   2. If profileId is absent → fall back to role-based
//      fetchActiveProfileForMonth(userRole, month) (original behaviour).
//
// Ranking architecture note:
//   Future Ranking MUST group ledger documents by:
//     profileId + profileVersion + month
//   NOT by userRole alone.
//   userRole in the ledger = organisational identity of who was evaluated.
//   profileId  in the ledger = which evaluation model was applied.
//   These are intentionally separate fields.
//
// Non-goals: No ranking. No coaching. No batch. No Cloud Functions.
// ============================================================

import type { KpiRegistry }          from '../engine/kpiRegistry'
import type { EvaluationLedgerDoc }  from './evaluationLedgerService'
import type { MonthlyTarget }        from '../engine/kpiAnalyticsEngine'
import type { PersonalTargetDoc }    from './personalTargetService'
import type { EvaluationProfile }    from '../engine/evaluationRegistry/evaluationRegistryTypes'
import type { KpiActualsMap }        from './evaluationActualsService'

// ── Input / Output types ──────────────────────────────────────

export interface RunEvaluationOptions {
  userId:      string
  pharmacyId:  string
  userRole:    string
  month:       string
  registry:    KpiRegistry
  calculatedBy: string
  actorRole:   string
  /**
   * ER-2B fix: Explicit profile selection.
   * When provided, the profile with this ID is fetched directly.
   * The evaluated user's userRole is NOT used for profile lookup.
   * When absent, falls back to fetchActiveProfileForMonth(userRole, month).
   *
   * This decouples "who is being evaluated" from "which profile to apply",
   * which is required when a manager is evaluated using a pharmacist profile.
   */
  profileId?:  string
}

export interface RunEvaluationOutcome {
  ledgerDoc:      EvaluationLedgerDoc
  profile:        EvaluationProfile
  kpiActuals:     KpiActualsMap
  branchTarget:   MonthlyTarget | null
  personalTarget: PersonalTargetDoc | null
  entryCount:     number
  warnings:       string[]
}

// ── Orchestrator ──────────────────────────────────────────────

/**
 * Run a full evaluation for a single user+month.
 *
 * Fetches all required data from Firestore, passes it to the
 * pure runEvaluation() engine, writes the result to the ledger,
 * and returns the full outcome for display.
 *
 * Throws on hard failures (no profile found, userId/pharmacyId missing).
 * Returns warnings (no branch target) without throwing.
 *
 * @throws Error if pre-flight validation fails
 * @throws Error if no active/specified profile is found
 */
export async function runEvaluationForUserMonth(
  opts: RunEvaluationOptions,
): Promise<RunEvaluationOutcome> {
  const {
    userId, pharmacyId, userRole, month, registry,
    calculatedBy, actorRole, profileId,
  } = opts

  const warnings: string[] = []

  // ── 1. Pre-flight validation ──────────────────────────────────
  const { preflightEvaluationCheck, aggregateKpiActuals,
          fetchBranchTarget, fetchPublishedPersonalTarget } =
    await import('./evaluationActualsService')

  // Pass profileId so preflight can skip role-based profile check
  // when an explicit profile has been selected
  const preflight = await preflightEvaluationCheck(
    userId, pharmacyId, userRole, month, profileId,
  )
  if (!preflight.valid) {
    throw new Error(`Evaluation pre-flight failed:\n${preflight.errors.join('\n')}`)
  }
  warnings.push(...preflight.warnings)

  // ── 2. Fetch profile ──────────────────────────────────────────
  // Priority: explicit profileId → role-based lookup (fallback)
  const {
    fetchEvaluationProfile,
    fetchActiveProfileForMonth,
  } = await import('./evaluationRegistryService')

  let profile: EvaluationProfile | null = null

  if (profileId) {
    // Explicit selection — fetch by ID and verify it is published
    profile = await fetchEvaluationProfile(profileId)
    if (!profile) {
      throw new Error(`Evaluation profile "${profileId}" not found`)
    }
    if (profile.status !== 'published') {
      throw new Error(
        `Profile "${profile.name}" is ${profile.status} — only published profiles can be used for evaluation`
      )
    }
  } else {
    // Fallback: role-based lookup (original ER-2B behaviour)
    profile = await fetchActiveProfileForMonth(userRole, month)
    if (!profile) {
      throw new Error(
        `No published evaluation profile found for role "${userRole}" in ${month}`
      )
    }
  }

  // ── 3. Aggregate real kpi_entries ────────────────────────────
  const aggregation = await aggregateKpiActuals(userId, pharmacyId, month, registry)
  const kpiActuals  = aggregation.actuals

  if (!aggregation.hasData) {
    warnings.push(
      `No KPI entry data found for this user in ${month}. ` +
      `All actuals are zero — evaluation will show 0% achievement.`
    )
  }

  // ── 4. Fetch branch target ────────────────────────────────────
  const rawTarget    = await fetchBranchTarget(pharmacyId, month)
  const branchTarget = rawTarget as MonthlyTarget | null

  // ── 5. Fetch published personal target ───────────────────────
  const personalTarget = await fetchPublishedPersonalTarget(userId, pharmacyId, month)

  // ── 6. Run pure engine ────────────────────────────────────────
  // Engine is unchanged — userRole is the evaluated user's identity,
  // profile is the explicitly selected or role-resolved evaluation model.
  const { runEvaluation } = await import('../engine/evaluationEngine/evaluationEngine')
  const engineResult = runEvaluation({
    userId,
    pharmacyId,
    month,
    role:    userRole,    // ledger identity — not profile lookup
    profile,             // may differ from userRole when explicitly selected
    kpiActuals,
    personalTarget,
    branchTarget,
    registry,
  })

  // ── 7. Write to immutable ledger ──────────────────────────────
  const { writeEvaluationResult } = await import('./evaluationLedgerService')
  const ledgerDoc = await writeEvaluationResult(
    {
      result:          engineResult,
      profileSnapshot: profile,
      personalTarget,
      branchTarget,
      kpiActuals,
      calculatedBy,
    },
    actorRole,
  )

  return {
    ledgerDoc,
    profile,
    kpiActuals,
    branchTarget,
    personalTarget,
    entryCount:  aggregation.entryCount,
    warnings,
  }
}
