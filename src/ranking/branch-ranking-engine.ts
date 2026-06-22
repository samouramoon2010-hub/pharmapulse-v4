// ============================================================
// Branch Ranking Engine — RF-1A
//
// Pure branch ranking snapshot generator.
// No Firestore. No React. No side effects.
//
// Input:
//   - periodId, profileId, profileVersion
//   - branch evaluation records (RankingInputRecord[])
//   - classification already resolved by RF-0 (stored in record.classificationId)
//
// Output:
//   - one RankingEngineOutput per classification cohort
//   - unclassified branches excluded (with trace)
//   - ranks assigned within cohort only
//   - deterministic — same input = same output
// ============================================================

import { buildBranchCohortKey, buildBranchSnapshotDocId } from './ranking-key'
import { partitionBranchRecords }                          from './eligibility'
import { sortWithTieBreak }                                from './tie-break'
import { GOVERNANCE_VERSION, RANKING_RULE_VERSION }        from './constants'
import type {
  RankingInputRecord, BranchRankingSnapshot,
  RankingEngineOutput, RankingCohort, ExcludedRecord,
} from './types'

// ── Entry point ───────────────────────────────────────────────

export interface BranchRankingInput {
  periodId:       string
  profileId:      string
  profileVersion: number
  records:        RankingInputRecord[]
  /** Wall-clock time for generatedAt (ISO string). Pass new Date().toISOString() in production. */
  generatedAt?:   string
}

/**
 * Generate branch ranking snapshots for all eligible cohorts.
 *
 * Branches are grouped by classificationId; each group forms one cohort.
 * Unclassified branches are excluded from all cohorts.
 *
 * @pure — no I/O, deterministic
 */
export function generateBranchRankingSnapshots(
  input: BranchRankingInput,
): RankingEngineOutput<BranchRankingSnapshot>[] {
  const { periodId, profileId, profileVersion, records } = input
  const generatedAt = input.generatedAt ?? new Date().toISOString()

  // ── Step 1: partition eligible vs excluded ───────────────────
  const { eligible, excluded } = partitionBranchRecords(records)

  const globalExcluded: ExcludedRecord[] = excluded.map(({ record, reason }) => ({
    entityId:    record.entityId,
    entityName:  record.entityName,
    reason,
  }))

  // ── Step 2: group by classificationId ────────────────────────
  const groups = new Map<string, RankingInputRecord[]>()
  for (const record of eligible) {
    const key = record.classificationId
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(record)
  }

  // ── Step 3: rank within each cohort ──────────────────────────
  const outputs: RankingEngineOutput<BranchRankingSnapshot>[] = []

  for (const [classificationId, cohortRecords] of groups) {
    const cohortId = buildBranchCohortKey({ periodId, profileId, profileVersion, classificationId })
    const sorted   = sortWithTieBreak(cohortRecords)

    const cohort: RankingCohort = {
      cohortId,
      entityType:       'branch',
      periodId,
      profileId,
      profileVersion,
      classificationId,
      memberCount:      sorted.length,
    }

    const snapshots: BranchRankingSnapshot[] = sorted.map(({ record, tieBreakTrace }, idx) => {
      const rank = idx + 1
      const snapshotId = buildBranchSnapshotDocId({
        periodId, profileId, profileVersion,
        classificationId, branchId: record.entityId,
      })
      return {
        snapshotId,
        entityType:          'branch',
        entityId:            record.entityId,
        entityName:          record.entityName,
        pharmacyId:          record.entityId,
        cohortId,
        periodId,
        profileId,
        profileVersion,
        classificationId,
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
        // Governance (RF-1C)
        governanceVersion:   GOVERNANCE_VERSION,
        rankingRuleVersion:  RANKING_RULE_VERSION,
      }
    })

    outputs.push({ cohort, snapshots, excluded: globalExcluded })
  }

  // If no eligible records at all, return a single output with empty snapshots
  if (outputs.length === 0) {
    return [{
      cohort: {
        cohortId:         `${periodId}::${profileId}::${profileVersion}::__empty__`,
        entityType:       'branch',
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

  // Sort outputs deterministically by classificationId for stable test snapshots
  return outputs.sort((a, b) =>
    a.cohort.classificationId.localeCompare(b.cohort.classificationId)
  )
}
