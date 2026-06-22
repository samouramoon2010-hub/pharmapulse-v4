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
import type { ShadowEvaluationResult } from '../engine/evaluationPipeline/index'
import type { EvaluationResult }     from '../engine/evaluationEngine/evaluationEngineTypes'
// Static imports — previously dynamic, which risked silent failure when the
// VitePWA service worker served a stale cached chunk after a deployment.
import { runShadowEvaluation,
         resolveEvaluationPipeline,
         buildPipelineContext,
         executePipeline,
         pipelineResultToEvaluationResult } from '../engine/evaluationPipeline/index'
import { buildShadowLog, writeShadowEvaluationLog } from './shadowEvaluationLogService'
import { getActiveEngine }                  from './evaluationEngineConfigService'
import type { EvaluationEngineMode }        from './evaluationEngineConfigService'
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
  /**
   * Source context for the shadow evaluation log.
   * 'single_user' — triggered from the Single User evaluation tab (default).
   * 'bulk'         — triggered from the Bulk Branch evaluation service.
   * Correct labelling is required for shadow validation sprint queries that
   * need to distinguish bulk vs single-user parity patterns.
   * Defaults to 'single_user' when absent for backwards compatibility.
   */
  shadowSource?: 'single_user' | 'bulk'
}

export interface RunEvaluationOutcome {
  ledgerDoc:      EvaluationLedgerDoc
  profile:        EvaluationProfile
  kpiActuals:     KpiActualsMap
  branchTarget:   MonthlyTarget | null
  personalTarget: PersonalTargetDoc | null
  entryCount:     number
  warnings:       string[]
  /**
   * Shadow evaluation result.
   *
   * When activeEngine = 'v1' (default):
   *   V1 is official. V2 runs in shadow. direction = v1_vs_v2.
   *
   * When activeEngine = 'v2' (Limited Rollout scope):
   *   V2 is official. V1 runs as reverse shadow. direction = v2_vs_v1.
   *
   * The shadow result is NEVER written to the official ledger.
   * undefined if the shadow run errored out unexpectedly.
   */
  shadow?:        ShadowEvaluationResult
  /**
   * Which engine produced the official ledger doc for this evaluation.
   * 'v1' in all current production evaluations.
   * 'v2' only when Limited Rollout scope matches.
   */
  activeEngine:   'v1' | 'v2'
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

  // ── 6. Determine active engine for this scope ───────────────
  // Reads system_config/evaluation from Firestore.
  // Safe: any error falls back to 'v1' — never blocks an evaluation.
  let activeEngine: 'v1' | 'v2' = 'v1'
  try {
    activeEngine = await getActiveEngine({ pharmacyId, month })
    // Explicit, named mode derived from activeEngine for diagnostics — see
    // EvaluationEngineMode in evaluationEngineConfigService.ts. Does not
    // change resolution: 'v2_shadow' is the named default (V1 official,
    // V2 always running in shadow); 'v2_official' is the promoted state.
    const engineMode: EvaluationEngineMode = activeEngine === 'v2' ? 'v2_official' : 'v2_shadow'
    console.debug('[engine] activeEngine resolved', { activeEngine, engineMode, userId, month })
  } catch {
    // getActiveEngine has its own internal catch; this outer guard is belt-and-suspenders.
    console.error('[engine] getActiveEngine threw unexpectedly — using v1 fallback')
    activeEngine = 'v1'
  }

  // ── 7. Run official engine + write ledger ─────────────────────
  const { writeEvaluationResult } = await import('./evaluationLedgerService')

  let officialResult: EvaluationResult
  let ledgerDoc: EvaluationLedgerDoc

  if (activeEngine === 'v2') {
    // ── V2 official path (Limited Rollout scope) ───────────────
    // Run V2 pipeline. If it fails for any reason, fall back to V1.
    // NEVER write a partial or failed V2 result to the official ledger.
    let v2Succeeded = false
    try {
      console.debug('[engine] V2 official — building pipeline context', { userId, month })
      const resolved  = resolveEvaluationPipeline(profile)
      const pipeCtx   = buildPipelineContext({
        userId, pharmacyId, month, role: userRole,
        profile, kpiActuals, personalTarget, branchTarget, registry,
      })
      const pipeRes   = executePipeline(pipeCtx, resolved.steps)

      if (!pipeRes.success) {
        // Pipeline had step errors — stale context guard: do not write partial result
        const errDetail = pipeRes.errors.join('; ')
        console.error('[engine] V2 pipeline step failed — falling back to V1', { errors: pipeRes.errors })
        warnings.push(`V2 pipeline failed (${errDetail}) — falling back to V1 official`)
        activeEngine = 'v1'   // reclassify so the V1 path below runs
      } else {
        officialResult = pipelineResultToEvaluationResult(pipeRes, {
          personalTargetUsed: !!personalTarget,
          calculatedAt:       Date.now(),
        })
        ledgerDoc = await writeEvaluationResult(
          {
            result:          officialResult,
            profileSnapshot: profile,
            personalTarget,
            branchTarget,
            kpiActuals,
            calculatedBy,
            engineVersion:   'v2',
          },
          actorRole,
        )
        v2Succeeded = true
        console.debug('[engine] V2 official ledger written', { docId: ledgerDoc.id })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[engine] V2 official path threw — falling back to V1', { error: msg })
      warnings.push(`V2 engine error (${msg}) — falling back to V1 official`)
      activeEngine = 'v1'   // reclassify so the V1 path below runs
    }

    // If V2 succeeded we're done with the official path.
    // If it failed, fall through to V1 (activeEngine was reset to 'v1' above).
    if (!v2Succeeded) {
      // Reset to allow V1 path below
    }
  }

  if (activeEngine === 'v1') {
    // ── V1 official path (default + V2 fallback) ───────────────
    const { runEvaluation } = await import('../engine/evaluationEngine/evaluationEngine')
    officialResult = runEvaluation({
      userId, pharmacyId, month,
      role:    userRole,
      profile,
      kpiActuals,
      personalTarget,
      branchTarget,
      registry,
    })
    ledgerDoc = await writeEvaluationResult(
      {
        result:          officialResult,
        profileSnapshot: profile,
        personalTarget,
        branchTarget,
        kpiActuals,
        calculatedBy,
        engineVersion:   'v1',
      },
      actorRole,
    )
  }

  // TypeScript narrowing: both branches above assign officialResult and ledgerDoc.
  // The combination of the two if-blocks above guarantees both are set.
  const finalResult  = officialResult!
  const finalLedger  = ledgerDoc!

  // ── 8. Shadow evaluation (bidirectional) ──────────────────────
  // V1 official → V2 shadow (forward,  direction = v1_vs_v2)
  // V2 official → V1 shadow (reverse,  direction = v2_vs_v1)
  // Shadow result is NEVER written to the official ledger.
  let shadow: ShadowEvaluationResult | undefined
  try {
    if (activeEngine === 'v1') {
      // Forward shadow: compare V1 official vs V2
      console.debug('[shadow] Step 8 — running V2 shadow evaluation', { userId, month })
      shadow = runShadowEvaluation(finalResult, {
        userId, pharmacyId, month,
        role:    userRole,
        profile,
        kpiActuals,
        personalTarget,
        branchTarget,
        registry,
      })
    } else {
      // Reverse shadow: compare V2 official vs V1
      console.debug('[shadow] Step 8 — running V1 reverse shadow evaluation', { userId, month })
      const { runEvaluation } = await import('../engine/evaluationEngine/evaluationEngine')
      const v1ShadowResult    = runEvaluation({
        userId, pharmacyId, month,
        role:    userRole,
        profile,
        kpiActuals,
        personalTarget,
        branchTarget,
        registry,
      })
      // Wrap V1 shadow result in ShadowEvaluationResult shape for unified logging
      const { compareEvaluationResults } = await import('../engine/evaluationPipeline/index')
      const comparison = compareEvaluationResults(finalResult, v1ShadowResult)
      const icon = comparison.severity === 'none' ? '✅' :
                   comparison.severity === 'minor' ? '⚠️' : '❌'
      shadow = {
        ran:        true,
        v2Result:   v1ShadowResult as any,   // reverse: v1 result stored in v2Result slot for unified diff
        comparison,
        pipelineId: 'legacy-band-score',
        summary:    `V1 Reverse Shadow: ${icon} ` +
                    (comparison.matched ? 'Matched' :
                     `${comparison.differences.length} difference(s) — severity: ${comparison.severity}`),
      }
    }

    console.debug('[shadow] Step 8 — shadow result', {
      ran:       shadow?.ran,
      severity:  shadow?.comparison?.severity ?? 'n/a',
      direction: activeEngine === 'v1' ? 'v1_vs_v2' : 'v2_vs_v1',
      summary:   shadow?.summary,
    })
    if (shadow?.ran && shadow.comparison && !shadow.comparison.matched) {
      warnings.push(`Shadow: ${shadow.summary}`)
    }
  } catch (err) {
    console.error('[shadow] Step 8 — unexpected error in shadow evaluation:', err)
    warnings.push('Shadow evaluation failed — official result is unaffected')
  }

  // ── 9. Persist shadow log ─────────────────────────────────────
  let shadowLedgerDocId: string | null = null
  if (shadow) {
    const logSource = opts.shadowSource ?? 'single_user'
    console.debug('[shadow] Step 9 — building shadow log', {
      source: logSource, officialEngine: activeEngine,
    })
    try {
      const log = buildShadowLog({
        userId, pharmacyId, month, role: userRole,
        profileId:      profile.id,
        profileVersion: profile.version,
        ledgerDocId:    finalLedger.id,
        source:         logSource,
        officialEngine: activeEngine,       // 'v1' or 'v2' — determines direction
        shadow,
        v1: finalResult,
        warnings,
      })
      console.debug('[shadow] Step 9 — calling writeShadowEvaluationLog')
      shadowLedgerDocId = await writeShadowEvaluationLog(log)
      if (shadowLedgerDocId) {
        console.debug('[shadow] Step 9 — shadow log written ✓', { docId: shadowLedgerDocId })
      } else {
        console.warn('[shadow] Step 9 — writeShadowEvaluationLog returned null')
      }
    } catch (err) {
      console.error('[shadow] Step 9 — unexpected error persisting shadow log:', err)
    }
  } else {
    console.warn('[shadow] Step 9 — skipped: shadow is undefined')
  }

  return {
    ledgerDoc:     finalLedger,
    profile,
    kpiActuals,
    branchTarget,
    personalTarget,
    entryCount:    aggregation.entryCount,
    warnings,
    shadow,
    activeEngine,
  }
}
