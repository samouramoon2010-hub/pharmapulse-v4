// ============================================================
// Ranking Eligibility — RF-1A
//
// Pure eligibility functions.
// No Firestore. No React. No side effects.
//
// Rules:
//   Branch eligible when:
//     classificationId exists AND !== 'unclassified'
//     AND evaluationStatus is 'complete' or 'partial'
//     AND cappedScore is a finite number
//     AND profileId and profileVersion are present
//     AND periodId is present
//
//   Pharmacist eligible when:
//     entityId present
//     AND evaluationStatus is 'complete' or 'partial'
//     AND cappedScore is a finite number
//     AND profileId and profileVersion are present
//     AND periodId is present
//
// Float pharmacists:
//   Eligible but placed in 'float-pool' cohort.
//   Full allocation logic deferred to RF-1C.
// ============================================================

import { UNRANKED_CLASSIFICATION_ID } from './constants'
import type { RankingInputRecord } from './types'

// ── Result type ───────────────────────────────────────────────

export interface EligibilityResult {
  eligible: boolean
  reason:   string   // human-readable, English, for trace/debugging
}

// ── Branch eligibility ────────────────────────────────────────

/**
 * Determine whether a branch input record is eligible for ranking.
 *
 * @pure — deterministic, no I/O
 */
export function checkBranchEligibility(record: RankingInputRecord): EligibilityResult {
  if (!record.entityId?.trim()) {
    return { eligible: false, reason: 'Missing entityId (pharmacyId)' }
  }
  if (!record.periodId?.trim()) {
    return { eligible: false, reason: 'Missing periodId' }
  }
  if (!record.profileId?.trim()) {
    return { eligible: false, reason: 'Missing profileId' }
  }
  if (!record.profileVersion || record.profileVersion < 1) {
    return { eligible: false, reason: 'Missing or invalid profileVersion' }
  }
  if (!record.classificationId?.trim()) {
    return { eligible: false, reason: 'Missing classificationId — branch not classified' }
  }
  if (record.classificationId === UNRANKED_CLASSIFICATION_ID) {
    return { eligible: false, reason: `Branch is '${UNRANKED_CLASSIFICATION_ID}' — excluded from official rankings` }
  }
  if (record.evaluationStatus === 'invalid') {
    return { eligible: false, reason: `Evaluation status is 'invalid' — required KPIs missing` }
  }
  if (!Number.isFinite(record.cappedScore)) {
    return { eligible: false, reason: 'cappedScore is not a finite number' }
  }
  if (record.cappedScore < 0 || record.cappedScore > 100) {
    return { eligible: false, reason: `cappedScore ${record.cappedScore} is outside valid range [0, 100]` }
  }
  if (!record.sourceEvaluationId?.trim()) {
    return { eligible: false, reason: 'Missing sourceEvaluationId — no evaluation result linked' }
  }
  return { eligible: true, reason: 'All eligibility checks passed' }
}

// ── Pharmacist eligibility ────────────────────────────────────

/**
 * Determine whether a pharmacist input record is eligible for ranking.
 *
 * Float pharmacists are eligible but land in 'float-pool' cohort.
 *
 * @pure — deterministic, no I/O
 */
export function checkPharmacistEligibility(record: RankingInputRecord): EligibilityResult {
  if (!record.entityId?.trim()) {
    return { eligible: false, reason: 'Missing entityId (userId)' }
  }
  if (!record.periodId?.trim()) {
    return { eligible: false, reason: 'Missing periodId' }
  }
  if (!record.profileId?.trim()) {
    return { eligible: false, reason: 'Missing profileId' }
  }
  if (!record.profileVersion || record.profileVersion < 1) {
    return { eligible: false, reason: 'Missing or invalid profileVersion' }
  }
  if (record.evaluationStatus === 'invalid') {
    return { eligible: false, reason: `Evaluation status is 'invalid' — required KPIs missing` }
  }
  if (!Number.isFinite(record.cappedScore)) {
    return { eligible: false, reason: 'cappedScore is not a finite number' }
  }
  if (record.cappedScore < 0 || record.cappedScore > 100) {
    return { eligible: false, reason: `cappedScore ${record.cappedScore} is outside valid range [0, 100]` }
  }
  if (!record.sourceEvaluationId?.trim()) {
    return { eligible: false, reason: 'Missing sourceEvaluationId — no evaluation result linked' }
  }
  // classificationId is not required for pharmacists (float-pool has no classification)
  return { eligible: true, reason: 'All eligibility checks passed' }
}

// ── Batch helpers ─────────────────────────────────────────────

export interface PartitionedRecords {
  eligible: RankingInputRecord[]
  excluded: Array<{ record: RankingInputRecord; reason: string }>
}

/**
 * Partition a list of branch records into eligible and excluded sets.
 * @pure
 */
export function partitionBranchRecords(records: RankingInputRecord[]): PartitionedRecords {
  const eligible: RankingInputRecord[] = []
  const excluded: Array<{ record: RankingInputRecord; reason: string }> = []
  for (const record of records) {
    const result = checkBranchEligibility(record)
    if (result.eligible) eligible.push(record)
    else excluded.push({ record, reason: result.reason })
  }
  return { eligible, excluded }
}

/**
 * Partition a list of pharmacist records into eligible and excluded sets.
 * @pure
 */
export function partitionPharmacistRecords(records: RankingInputRecord[]): PartitionedRecords {
  const eligible: RankingInputRecord[] = []
  const excluded: Array<{ record: RankingInputRecord; reason: string }> = []
  for (const record of records) {
    const result = checkPharmacistEligibility(record)
    if (result.eligible) eligible.push(record)
    else excluded.push({ record, reason: result.reason })
  }
  return { eligible, excluded }
}
