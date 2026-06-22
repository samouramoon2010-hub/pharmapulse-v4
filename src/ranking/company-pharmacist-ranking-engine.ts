// ============================================================
// Company-Wide Pharmacist Ranking Engine — RF-1C
//
// Governance decision (approved):
//   Pharmacists compete company-wide — NOT by branch classification.
//   All eligible pharmacists share a single cohort: 'company-wide'.
//
// Why company-wide and not by classification?
//   Branch classification is a property of the pharmacy, not the pharmacist.
//   A pharmacist's rank should reflect their personal performance against
//   company benchmarks, not the tier of their assigned branch.
//   This prevents a pharmacist in a 'neighbourhood' branch from being
//   judged against a smaller pool, creating unfair rank inflation.
//
// Tie-break order (RF-1C governance):
//   1. cappedScore DESC          (normalizedFinalScorePct)
//   2. achievementPct DESC       (mean basket achievement%)
//   3. uncappedScore DESC        (raw finalScore)
//   4. kpisAbove100Count DESC    (KPI elements ≥ 100%)
//   5. entityId ASC              (deterministic fallback)
//
// Float pharmacists: deferred to RF-1D. Currently placed in
// FLOAT_POOL_COHORT_ID and excluded from company-wide pool.
//
// Pure: no Firestore, no React, no side effects.
// ============================================================

import { buildPharmacistCohortKey, buildPharmacistSnapshotDocId } from './ranking-key'
import { partitionPharmacistRecords }                              from './eligibility'
import { sortWithTieBreak }                                        from './tie-break'
import {
  COMPANY_WIDE_COHORT_ID,
  FLOAT_POOL_COHORT_ID,
  GOVERNANCE_VERSION,
  RANKING_RULE_VERSION,
}                                                                  from './constants'
import type {
  RankingInputRecord, PharmacistRankingSnapshot,
  RankingEngineOutput, RankingCohort, ExcludedRecord,
} from './types'

// ── Entry point ───────────────────────────────────────────────

export interface CompanyPharmacistRankingInput {
  periodId:       string
  profileId:      string
  profileVersion: number
  records:        RankingInputRecord[]   // entityType must be 'pharmacist'
  generatedAt?:   string
}

/**
 * Generate company-wide pharmacist ranking snapshots.
 *
 * All eligible full-time and contract pharmacists are placed in a
 * single 'company-wide' cohort. Float pharmacists are placed in
 * FLOAT_POOL_COHORT_ID (not mixed with the main pool).
 *
 * @pure — no I/O, deterministic
 */
export function generateCompanyPharmacistRankingSnapshots(
  input: CompanyPharmacistRankingInput,
): RankingEngineOutput<PharmacistRankingSnapshot>[] {
  const { periodId, profileId, profileVersion, records } = input
  const generatedAt = input.generatedAt ?? new Date().toISOString()

  // ── Step 1: partition eligible vs excluded ───────────────────
  const { eligible, excluded } = partitionPharmacistRecords(records)

  const globalExcluded: ExcludedRecord[] = excluded.map(({ record, reason }) => ({
    entityId:    record.entityId,
    entityName:  record.entityName,
    reason,
  }))

  // ── Step 2: group — company-wide vs float-pool ───────────────
  const companyPool: RankingInputRecord[] = []
  const floatPool:   RankingInputRecord[] = []

  for (const record of eligible) {
    if (record.employmentType === 'float') {
      floatPool.push(record)
    } else {
      companyPool.push(record)
    }
  }

  const outputs: RankingEngineOutput<PharmacistRankingSnapshot>[] = []

  // ── Step 3a: rank company-wide pool ──────────────────────────
  if (companyPool.length > 0) {
    outputs.push(
      rankPool(companyPool, COMPANY_WIDE_COHORT_ID, { periodId, profileId, profileVersion, generatedAt, globalExcluded })
    )
  }

  // ── Step 3b: float pool (stub — deferred RF-1D) ──────────────
  if (floatPool.length > 0) {
    outputs.push(
      rankPool(floatPool, FLOAT_POOL_COHORT_ID, { periodId, profileId, profileVersion, generatedAt, globalExcluded })
    )
  }

  // No eligible records at all
  if (outputs.length === 0) {
    return [{
      cohort: {
        cohortId:         buildPharmacistCohortKey({ periodId, profileId, profileVersion, pharmacistCohortId: COMPANY_WIDE_COHORT_ID }),
        entityType:       'pharmacist',
        periodId,
        profileId,
        profileVersion,
        classificationId: COMPANY_WIDE_COHORT_ID,
        memberCount:      0,
      },
      snapshots: [],
      excluded:  globalExcluded,
    }]
  }

  return outputs
}

// ── Internal pool ranker ──────────────────────────────────────

function rankPool(
  poolRecords:    RankingInputRecord[],
  cohortKey:      string,
  ctx: {
    periodId:       string
    profileId:      string
    profileVersion: number
    generatedAt:    string
    globalExcluded: ExcludedRecord[]
  },
): RankingEngineOutput<PharmacistRankingSnapshot> {
  const { periodId, profileId, profileVersion, generatedAt, globalExcluded } = ctx

  const cohortId = buildPharmacistCohortKey({
    periodId, profileId, profileVersion, pharmacistCohortId: cohortKey,
  })

  const sorted = sortWithTieBreak(poolRecords)

  const cohort: RankingCohort = {
    cohortId,
    entityType:       'pharmacist',
    periodId,
    profileId,
    profileVersion,
    classificationId: cohortKey,
    memberCount:      sorted.length,
  }

  const snapshots: PharmacistRankingSnapshot[] = sorted.map(({ record, tieBreakTrace }, idx) => {
    const rank       = idx + 1
    const pharmacyId = record.pharmacyId ?? ''

    const snapshotId = buildPharmacistSnapshotDocId({
      periodId, profileId, profileVersion,
      pharmacistCohortId: cohortKey,
      pharmacistId:       record.entityId,
    })

    return {
      // Base snapshot fields
      snapshotId,
      entityType:          'pharmacist',
      entityId:            record.entityId,
      entityName:          record.entityName,
      cohortId,
      periodId,
      profileId,
      profileVersion,
      classificationId:    cohortKey,
      currentRank:         rank,
      cohortSize:          sorted.length,
      cappedScore:         record.cappedScore,
      uncappedScore:       record.uncappedScore,
      tieBreakTrace,
      sourceEvaluationId:  record.sourceEvaluationId,
      generatedAt,

      // Governance (RF-1C)
      governanceVersion:   GOVERNANCE_VERSION,
      rankingRuleVersion:  RANKING_RULE_VERSION,

      // Pharmacist-specific fields
      userId:              record.entityId,
      pharmacyId,
      pharmacistCohortId:  cohortKey,
      employmentType:      record.employmentType ?? 'full-time',

      // Achievement metrics (required for pharmacist snapshots)
      achievementPct:      record.achievementPct ?? 0,
      kpisAbove100Count:   record.kpisAbove100Count ?? 0,
    }
  })

  return { cohort, snapshots, excluded: globalExcluded }
}
