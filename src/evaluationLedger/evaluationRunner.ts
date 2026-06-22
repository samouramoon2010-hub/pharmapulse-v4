// ============================================================
// Evaluation Ledger — Runner (Phase 5B)
//
// Executes a single evaluation by feeding a PUBLISHED profile's
// actuals/targets through the existing simulateProfile() kernel
// and shaping the result into a ledger entry input.
//
// Uses ONLY simulateProfile() from Profile Studio. Never duplicates
// scoring logic. This module is pure — it never writes to Firestore.
// Persisting the produced entry is the caller's job, via
// evaluationLedgerService.createLedgerEntryDocument().
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import { simulateProfile } from '../profileStudio/simulator'
import type { StudioSimulationResult } from '../profileStudio/simulator'
import type { EvaluationProfileDraft } from '../profileStudio/types'

import type { CreateLedgerEntryInput, EvaluationEntityType } from './evaluationLedgerTypes'

export interface RunEvaluationInput {
  /** Must be a PUBLISHED profile draft. */
  profile:    EvaluationProfileDraft
  entityId:   string
  entityType: EvaluationEntityType
  periodId:   string
  actuals:    Record<string, number>
  targets:    Record<string, number>
  metadata?:  Record<string, unknown>
}

export interface RunEvaluationResult {
  success:     boolean
  entry?:      CreateLedgerEntryInput
  simulation?: StudioSimulationResult
  issues:      string[]
}

/**
 * Runs one evaluation and returns a ready-to-persist ledger entry input.
 * Never throws.
 */
export function runEvaluation(input: RunEvaluationInput): RunEvaluationResult {
  try {
    const profile = input?.profile
    const status  = profile?.metadata?.status

    if (status !== 'PUBLISHED') {
      return {
        success: false,
        issues:  [`Profile must be PUBLISHED to run a ledger evaluation (current status: ${status ?? 'unknown'})`],
      }
    }
    if (!input?.entityId || !input?.entityType || !input?.periodId) {
      return { success: false, issues: ['entityId, entityType, and periodId are required'] }
    }

    const simulation = simulateProfile({
      profile,
      actuals: input.actuals ?? {},
      targets: input.targets ?? {},
    })

    const basketScores: Record<string, number> = {}
    for (const [id, basket] of Object.entries(simulation.baskets)) basketScores[id] = basket.score

    const elementScores: Record<string, number> = {}
    const ruleScores:    Record<string, number> = {}
    for (const [id, element] of Object.entries(simulation.elements)) {
      elementScores[id] = element.score
      for (const rule of element.rules) ruleScores[rule.ruleId] = rule.score
    }

    const entry: CreateLedgerEntryInput = {
      entityId:       input.entityId,
      entityType:     input.entityType,
      profileId:      profile.metadata.id,
      profileVersion: profile.metadata.version,
      periodId:       input.periodId,
      score:          simulation.score,
      basketScores,
      elementScores,
      ruleScores,
      trace:          simulation.traces,
      metadata:       { ...(input.metadata ?? {}) },
    }

    return { success: true, entry, simulation, issues: [...simulation.issues] }
  } catch (e) {
    return { success: false, issues: [`runEvaluation failed: ${e instanceof Error ? e.message : String(e)}`] }
  }
}
