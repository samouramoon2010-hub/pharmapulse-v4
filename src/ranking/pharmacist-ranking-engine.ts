// ============================================================
// Pharmacist Ranking Engine — RF-1A
//
// Pure pharmacist ranking snapshot generator.
// No Firestore. No React. No side effects.
//
// Cohort grouping:
//   full-time pharmacists → cohortId based on home branch classificationId
//   float pharmacists     → cohortId = 'float-pool' (stub; full impl in RF-1C)
//   contract pharmacists  → treated as full-time for now
//
// Full Work Assignment allocation (float pharmacy multi-branch split) is
// NOT implemented here. RF-1C will add that logic without changing this file.
// ============================================================

import { buildPharmacistCohortKey, buildPharmacistSnapshotDocId } from './ranking-key'
import { partitionPharmacistRecords }                              from './eligibility'
import { sortWithTieBreak }                                        from './tie-break'
import { FLOAT_POOL_COHORT_ID }                                    from './constants'
import type {
  RankingInputRecord, PharmacistRankingSnapshot,
  RankingEngineOutput, RankingCohort, ExcludedRecord,
} from './types'

// ── Entry point ───────────────────────────────────────────────

export interface PharmacistRankingInput {
  periodId:       string
  profileId:      string
  profileVersion: number
  records:        RankingInputRecord[]   // entityType should be 'pharmacist'
  generatedAt?:   string
}

/**
 * Generate pharmacist ranking snapshots for all eligible cohorts.
 *
 * Full-time pharmacists are grouped by their home branch's classificationId.
 * Float pharmacists are placed in 'float-pool' (stub — no allocation logic).
 *
 * @pure — no I/O, deterministic
 */
export function generatePharmacistRankingSnapshots(
  input: PharmacistRankingInput,
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

  // ── Step 2: resolve cohort ID per pharmacist ─────────────────
  // Float → 'float-pool'
  // Full-time/contract → home branch classificationId (from pharmacistCohortId if set,
  //   otherwise falls back to classificationId field)
  const groups = new Map<string, RankingInputRecord[]>()

  for (const record of eligible) {
    let cohortKey: string

    if (record.employmentType === 'float') {
      cohortKey = FLOAT_POOL_COHORT_ID
    } else {
      // pharmacistCohortId overrides classificationId when explicitly set
      cohortKey = record.pharmacistCohortId ?? record.classificationId ?? FLOAT_POOL_COHORT_ID
    }

    if (!groups.has(cohortKey)) groups.set(cohortKey, [])
    groups.get(cohortKey)!.push(record)
  }

  // ── Step 3: rank within each cohort ──────────────────────────
  const outputs: RankingEngineOutput<PharmacistRankingSnapshot>[] = []

  for (const [pharmacistCohortId, cohortRecords] of groups) {
    const cohortId = buildPharmacistCohortKey({ periodId, profileId, profileVersion, pharmacistCohortId })
    const sorted   = sortWithTieBreak(cohortRecords)

    const cohort: RankingCohort = {
      cohortId,
      entityType:       'pharmacist',
      periodId,
      profileId,
      profileVersion,
      classificationId: pharmacistCohortId,
      memberCount:      sorted.length,
    }

    const snapshots: PharmacistRankingSnapshot[] = sorted.map(({ record, tieBreakTrace }, idx) => {
      const rank = idx + 1
      // pharmacyId is conveyed through entityName convention or a separate field;
      // for now we use record.classificationId as the home branch proxy.
      // RF-1C will add a proper pharmacyId field to RankingInputRecord.
      const pharmacyId = (record as RankingInputRecord & { pharmacyId?: string }).pharmacyId
        ?? record.classificationId ?? ''

      const snapshotId = buildPharmacistSnapshotDocId({
        periodId, profileId, profileVersion,
        pharmacistCohortId, pharmacistId: record.entityId,
      })

      return {
        snapshotId,
        entityType:          'pharmacist',
        entityId:            record.entityId,
        entityName:          record.entityName,
        userId:              record.entityId,
        pharmacyId,
        pharmacistCohortId,
        employmentType:      record.employmentType ?? 'full-time',
        cohortId,
        periodId,
        profileId,
        profileVersion,
        classificationId:    pharmacistCohortId,
        currentRank:         rank,
        cohortSize:          sorted.length,
        cappedScore:         record.cappedScore,
        uncappedScore:       record.uncappedScore,
        strategicKpiScore:   record.strategicKpiScore,
        consistencyScore:    record.consistencyScore,
        volatilityScore:     record.volatilityScore,
        tieBreakTrace,
        sourceEvaluationId:  record.sourceEvaluationId,
        generatedAt,
      }
    })

    outputs.push({ cohort, snapshots, excluded: globalExcluded })
  }

  // If no eligible records, return an empty output
  if (outputs.length === 0) {
    return [{
      cohort: {
        cohortId:         `${periodId}::${profileId}::${profileVersion}::__empty__`,
        entityType:       'pharmacist',
        periodId,
        profileId,
        profileVersion,
        classificationId: '__empty__',
        memberCount:      0,
      },
      snapshots: [],
      excluded:  globalExcluded,
    }]
  }

  return outputs.sort((a, b) =>
    a.cohort.classificationId.localeCompare(b.cohort.classificationId)
  )
}
