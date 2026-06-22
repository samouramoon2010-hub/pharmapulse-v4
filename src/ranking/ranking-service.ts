// ============================================================
// Ranking Service — RF-1B / RF-1C-B
//
// Branch ranking (RF-1C-B):
//   Source: kpi_entries + targets
//   Score:  branchActual / branchTarget per KPI (collective achievement)
//   Engine: branch-kpi-engine.ts → buildBranchSummary() from kpiAnalyticsEngine
//
// Pharmacist ranking (RF-1C):
//   Source: evaluation_results (role='pharmacist')
//   Score:  normalizedFinalScorePct from evaluation ledger
//
// Does NOT contain:
//   - Tie-break logic (in tie-break.ts)
//   - Eligibility logic (in eligibility.ts)
//   - Firestore write logic (in repository.ts)
//   - KPI achievement formulas (in kpiAnalyticsEngine.ts)
// ============================================================

import {
  collection, getDocs, query, where, doc, getDoc,
} from 'firebase/firestore'
import { db, COL } from '../services/firebase'
import { generateBranchRankingSnapshots }              from './branch-ranking-engine'
import { generateCompanyPharmacistRankingSnapshots }   from './company-pharmacist-ranking-engine'
import {
  scoreBranches, branchScoreToRankingInput,
  adaptTargetDoc,
}                                                      from './branch-kpi-engine'
import type { KpiEntryDoc, BranchTargetDoc }           from './branch-kpi-engine'
import {
  writeRankingSnapshots,
  getPreviousPeriodSnapshots,
}                                                      from './repository'
import {
  GOVERNANCE_VERSION,
  RANKING_RULE_VERSION,
  COMPANY_WIDE_COHORT_ID,
}                                                      from './constants'
import type {
  RankingInputRecord,
  BranchRankingSnapshot,
  PharmacistRankingSnapshot,
  ExcludedRecord,
}                                                      from './types'
import type { EvaluationLedgerDoc }                   from '../services/evaluationLedgerService'
import type { BasketResult }                          from '../engine/evaluationEngine/evaluationEngineTypes'

// ── Report types ──────────────────────────────────────────────

export interface RankingGenerationReport {
  periodId:          string
  profileId:         string
  profileVersion:    number
  generatedAt:       string    // ISO
  generatedBy:       string
  totalInput:        number
  totalRanked:       number
  totalExcluded:     number
  cohorts:           CohortSummary[]
  excluded:          ExcludedRecord[]
  pharmacistStatus:  'generated' | 'pending_mapping' | 'no_data'
  governanceVersion: number
  rankingRuleVersion: string
  error?:            string
}

export interface CohortSummary {
  cohortId:        string
  classificationId: string
  entityType:       'branch' | 'pharmacist'
  memberCount:      number
}

export interface GenerateRankingOptions {
  periodId:       string
  profileId:      string
  profileVersion: number
  generatedBy:    string        // admin userId
  isPreview?:     boolean       // default true
}

// ── Fetch helpers ─────────────────────────────────────────────

/** Fetch all evaluation ledger docs for a period + profile from Firestore. */
/** Fetch pharmacies with their branchClassification and name fields. */
async function fetchPharmacyClassifications(): Promise<Map<string, { classificationId: string; name: string }>> {
  const snap = await getDocs(collection(db, COL.PHARMACIES))
  const map = new Map<string, { classificationId: string; name: string }>()
  for (const d of snap.docs) {
    const data = d.data()
    map.set(d.id, {
      classificationId: data.branchClassification ?? 'unclassified',
      name:             data.name ?? data.code ?? d.id,
    })
  }
  return map
}


// ── rankMovement enrichment ───────────────────────────────────

function attachRankMovement(
  snapshots: BranchRankingSnapshot[],
  previousMap: Map<string, number>,
): BranchRankingSnapshot[] {
  return snapshots.map((s) => {
    const prev = previousMap.get(s.entityId)
    if (prev === undefined) return { ...s, movementDirection: 'new' as const }
    const delta = s.currentRank - prev
    return {
      ...s,
      previousRank:       prev,
      rankMovement:       delta,
      movementDirection:  (delta < 0 ? 'up' : delta > 0 ? 'down' : 'unchanged') as 'up' | 'down' | 'unchanged',
    }
  })
}

// ── Fetch helpers for branch KPI ranking ─────────────────────

/** Fetch all KPI entries for a given pharmacyId and month. */
async function fetchKpiEntriesForBranch(
  pharmacyId: string,
  month:      string,
): Promise<KpiEntryDoc[]> {
  // Date range for the month
  const [y, m] = month.split('-').map(Number)
  const fromDate = `${month}-01`
  const lastDay  = new Date(y, m, 0).getDate()
  const toDate   = `${month}-${String(lastDay).padStart(2, '0')}`

  const q = query(
    collection(db, COL.KPI_ENTRIES),
    where('pharmacyId', '==', pharmacyId),
    where('date', '>=', fromDate),
    where('date', '<=', toDate),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ ...d.data() } as KpiEntryDoc))
}

/** Fetch branch target document for a pharmacy and month. */
async function fetchBranchTarget(
  pharmacyId: string,
  month:      string,
): Promise<BranchTargetDoc | null> {
  const docId = `${pharmacyId}_${month}`
  const snap  = await getDoc(doc(db, COL.TARGETS, docId))
  return snap.exists() ? ({ pharmacyId, month, ...snap.data() } as BranchTargetDoc) : null
}

// ── Main entry point ──────────────────────────────────────────

/**
 * Generate and persist branch ranking snapshots for a period.
 *
 * RF-1C-B: Branch score is based on collective KPI achievement
 * (sum of all pharmacist actuals vs branch target), not on
 * individual pharmacist evaluation scores.
 *
 * Steps:
 *   1. Fetch all pharmacies with their classifications (RF-0)
 *   2. For each pharmacy: fetch KPI entries + branch target for the period
 *   3. Compute branch KPI score using branch-kpi-engine (reuses kpiAnalyticsEngine)
 *   4. Transform to RankingInputRecord[]
 *   5. Run branch ranking engine (tie-break, cohort grouping)
 *   6. Attach previousRank / rankMovement
 *   7. Write snapshots to Firestore
 */
export async function generateAndPersistBranchRankings(
  opts: GenerateRankingOptions,
): Promise<RankingGenerationReport> {
  const { periodId, profileId, profileVersion, generatedBy, isPreview = true } = opts
  const generatedAt = new Date().toISOString()

  const report: RankingGenerationReport = {
    periodId, profileId, profileVersion,
    generatedAt, generatedBy,
    totalInput:         0,
    totalRanked:        0,
    totalExcluded:      0,
    cohorts:            [],
    excluded:           [],
    pharmacistStatus:   'pending_mapping',
    governanceVersion:  GOVERNANCE_VERSION,
    rankingRuleVersion: RANKING_RULE_VERSION,
  }

  try {
    // ── Step 1: fetch all pharmacies with classifications ──────
    const classMap = await fetchPharmacyClassifications()
    if (classMap.size === 0) {
      report.error = 'No pharmacies found'
      return report
    }

    // ── Step 2: score each pharmacy from KPI data ──────────────
    const branchScoringInputs = await Promise.all(
      [...classMap.entries()].map(async ([pharmacyId, { classificationId, name }]) => {
        const [kpiEntries, targetDoc] = await Promise.all([
          fetchKpiEntriesForBranch(pharmacyId, periodId),
          fetchBranchTarget(pharmacyId, periodId),
        ])
        return {
          pharmacyId, month: periodId, classificationId, pharmacyName: name,
          kpiEntries, targetDoc,
        }
      })
    )

    // ── Step 3: compute branch KPI scores ──────────────────────
    const scores = scoreBranches(branchScoringInputs)
    report.totalInput = scores.length

    // ── Step 4: transform to RankingInputRecord[] ──────────────
    const inputRecords: RankingInputRecord[] = []
    const excluded: ExcludedRecord[] = []

    for (const score of scores) {
      const record = branchScoreToRankingInput(score, `${score.pharmacyId}_${periodId}`)
      if (record) {
        // Attach branch-KPI-specific profile metadata
        record.profileId      = profileId
        record.profileVersion = profileVersion
        inputRecords.push(record)
      } else {
        excluded.push({
          entityId:   score.pharmacyId,
          entityName: score.pharmacyName,
          reason:     score.exclusionReason ?? 'Excluded by branch KPI scoring',
        })
      }
    }

    // Also exclude unclassified branches (handled by eligibility.ts in engine)
    // They will be caught by checkBranchEligibility → added to engine excluded list

    // ── Step 5: run branch ranking engine ─────────────────────
    const outputs = generateBranchRankingSnapshots({
      periodId, profileId, profileVersion,
      records: inputRecords,
      generatedAt,
    })

    // ── Step 6: collect snapshots + excluded ──────────────────
    const allSnapshots: BranchRankingSnapshot[] = []
    const allExcluded: ExcludedRecord[] = [...excluded]

    for (const output of outputs) {
      if (output.snapshots.length > 0) {
        allSnapshots.push(...output.snapshots)
        report.cohorts.push({
          cohortId:         output.cohort.cohortId,
          classificationId: output.cohort.classificationId,
          entityType:       'branch',
          memberCount:      output.snapshots.length,
        })
      }
      for (const ex of output.excluded) {
        if (!allExcluded.some((e) => e.entityId === ex.entityId)) {
          allExcluded.push(ex)
        }
      }
    }

    // ── Step 7: attach previousRank / rankMovement ────────────
    const prevSnaps = await getPreviousPeriodSnapshots(periodId, profileId, profileVersion, 'branch')
    const prevMap   = new Map(prevSnaps.map((s) => [s.entityId, s.currentRank]))
    const enriched  = attachRankMovement(allSnapshots, prevMap)

    // ── Step 8: write to Firestore ────────────────────────────
    // Enrich snapshots with branch KPI metadata before writing
    const enrichedWithMeta = enriched.map((snap) => {
      const score = scores.find((s) => s.pharmacyId === snap.entityId)
      if (!score) return snap
      return {
        ...snap,
        pharmacistCount: score.pharmacistCount,
        branchAchievementPct: score.overallAchievementPct,
        kpiBreakdown: score.kpiBreakdown,
      }
    })

    await writeRankingSnapshots(enrichedWithMeta, generatedBy, isPreview)

    report.totalRanked   = enrichedWithMeta.length
    report.totalExcluded = allExcluded.length
    report.excluded      = allExcluded

  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err)
  }

  return report
}

// ── Pharmacist transform helpers ──────────────────────────────

/**
 * Derive achievementPct (mean basket achievement%) from basketResults.
 * Excludes invalid baskets from the average.
 */
function deriveAchievementPct(basketResults: BasketResult[]): number {
  const valid = basketResults.filter((b) => b.isValid)
  if (valid.length === 0) return 0
  const sum = valid.reduce((acc, b) => acc + b.aggregateAchievementPct, 0)
  return sum / valid.length
}

/**
 * Count KPI elements where achievementPct >= 100.
 */
function deriveKpisAbove100(basketResults: BasketResult[]): number {
  let count = 0
  for (const basket of basketResults) {
    for (const element of basket.elements) {
      if (element.achievementPct >= 100) count++
    }
  }
  return count
}

/**
 * Fetch all users (pharmacists) with their displayName for name enrichment.
 */
async function fetchUserDisplayNames(): Promise<Map<string, string>> {
  const snap = await getDocs(collection(db, COL.USERS))
  const map  = new Map<string, string>()
  for (const d of snap.docs) {
    const data = d.data()
    const name = data.displayName ?? data.name ?? data.email ?? d.id
    map.set(d.id, name)
  }
  return map
}

/**
 * Transform an EvaluationLedgerDoc into a RankingInputRecord for pharmacists.
 *
 * cappedScore     = calculationTrace.normalizedFinalScorePct ?? ratingScore/5*100
 * achievementPct  = mean aggregateAchievementPct across valid baskets
 * kpisAbove100Count = count of elements where achievementPct ≥ 100
 */
function ledgerDocToPharmacistRecord(
  doc: EvaluationLedgerDoc,
  displayName: string,
): RankingInputRecord {
  const trace = doc.calculationTrace as { normalizedFinalScorePct?: number } | undefined
  const cappedScore = typeof trace?.normalizedFinalScorePct === 'number'
    ? trace.normalizedFinalScorePct
    : (doc.ratingScore / 5) * 100

  const basketResults = (doc.basketResults ?? []) as BasketResult[]

  return {
    entityId:            doc.userId,
    entityName:          displayName,
    entityType:          'pharmacist',
    periodId:            doc.month,
    profileId:           doc.profileId,
    profileVersion:      doc.profileVersion,
    classificationId:    COMPANY_WIDE_COHORT_ID,
    pharmacistCohortId:  COMPANY_WIDE_COHORT_ID,
    pharmacyId:          doc.pharmacyId,
    cappedScore:         Math.max(0, Math.min(100, cappedScore)),
    uncappedScore:       doc.finalScore,
    achievementPct:      deriveAchievementPct(basketResults),
    kpisAbove100Count:   deriveKpisAbove100(basketResults),
    sourceEvaluationId:  doc.id,
    evaluationStatus:    doc.status as 'complete' | 'partial' | 'invalid',
    employmentType:      'full-time',   // float deferred to RF-1D
  }
}

// ── movementDirection enrichment ─────────────────────────────

type MovementDirection = 'up' | 'down' | 'unchanged' | 'new'

function deriveMovementDirection(
  currentRank: number,
  previousRank: number | undefined,
): MovementDirection {
  if (previousRank === undefined) return 'new'
  if (currentRank < previousRank)  return 'up'
  if (currentRank > previousRank)  return 'down'
  return 'unchanged'
}

function attachPharmacistMovement(
  snapshots:   PharmacistRankingSnapshot[],
  previousMap: Map<string, number>,
): PharmacistRankingSnapshot[] {
  return snapshots.map((s) => {
    const prev = previousMap.get(s.entityId)
    return {
      ...s,
      previousRank:       prev,
      rankMovement:       prev !== undefined ? s.currentRank - prev : undefined,
      movementDirection:  deriveMovementDirection(s.currentRank, prev),
    }
  })
}

// ── Pharmacist main entry point ───────────────────────────────

/**
 * Generate and persist company-wide pharmacist ranking snapshots.
 */
export async function generateAndPersistPharmacistRankings(
  opts: GenerateRankingOptions,
): Promise<RankingGenerationReport> {
  const { periodId, profileId, profileVersion, generatedBy, isPreview = true } = opts
  const generatedAt = new Date().toISOString()

  const report: RankingGenerationReport = {
    periodId, profileId, profileVersion,
    generatedAt, generatedBy,
    totalInput:         0,
    totalRanked:        0,
    totalExcluded:      0,
    cohorts:            [],
    excluded:           [],
    pharmacistStatus:   'no_data',
    governanceVersion:  GOVERNANCE_VERSION,
    rankingRuleVersion: RANKING_RULE_VERSION,
  }

  try {
    // ── Step 1: fetch individually-evaluated ledger docs ───────
    //
    // INCLUSION RULE (RF-1C hotfix — see audit RF-1C Pharmacist Ranking Inclusion):
    //
    // We filter by the set of roles that represent individual contributors
    // evaluated against personal KPI targets. This deliberately includes
    // 'manager' and 'branch_manager' because ordinary branch managers at
    // non-Hub pharmacies have personal targets, enter individual KPI data,
    // and are evaluated the same way as pharmacists. Excluding them by role
    // was incorrect and prevented users like branch managers from appearing
    // in rankings even when fully evaluated.
    //
    // Excluded by design:
    //   'admin'  — admin accounts run evaluations but are not evaluation subjects
    //   (future) 'supervisor', 'regional_manager' — separate ranking tiers (RF-1D+)
    //
    // NOTE: 'role' on the user document is an ACCESS CONTROL role, not an
    // evaluation cohort designation. The temporary fix uses it as a proxy.
    // RF-1D will introduce 'evaluationCohort' on evaluation_results documents
    // ('individual' | 'hub_store_manager') so inclusion is driven by how the
    // person was evaluated, not by their system access role.
    //
    const INDIVIDUAL_CONTRIBUTOR_ROLES = ['pharmacist', 'manager', 'branch_manager'] as const

    const q = await getDocs(query(
      collection(db, COL.EVALUATION_RESULTS),
      where('month',          '==', periodId),
      where('profileId',      '==', profileId),
      where('profileVersion', '==', profileVersion),
      where('role',           'in', [...INDIVIDUAL_CONTRIBUTOR_ROLES]),
    ))
    const ledgerDocs = q.docs.map((d) => ({ id: d.id, ...d.data() } as EvaluationLedgerDoc))

    if (ledgerDocs.length === 0) {
      report.error = `No individual evaluation records for ${periodId} / ${profileId} v${profileVersion}`
      return report
    }

    // ── Step 2: fetch display names ────────────────────────────
    const nameMap = await fetchUserDisplayNames()

    // ── Step 3: deduplicate per pharmacist (latest finalScore wins) ─
    const byUser = new Map<string, EvaluationLedgerDoc>()
    for (const d of ledgerDocs) {
      const existing = byUser.get(d.userId)
      if (!existing || d.finalScore > existing.finalScore) byUser.set(d.userId, d)
    }

    // ── Step 4: transform ──────────────────────────────────────
    const inputRecords: RankingInputRecord[] = []
    for (const [userId, evalDoc] of byUser) {
      const displayName = nameMap.get(userId) ?? userId
      inputRecords.push(ledgerDocToPharmacistRecord(evalDoc, displayName))
    }
    report.totalInput = inputRecords.length

    // ── Step 5: run company-wide engine ───────────────────────
    const outputs = generateCompanyPharmacistRankingSnapshots({
      periodId, profileId, profileVersion,
      records: inputRecords,
      generatedAt,
    })

    // ── Step 6: collect snapshots + excluded ──────────────────
    const allSnapshots: PharmacistRankingSnapshot[] = []
    const allExcluded:  ExcludedRecord[]             = []

    for (const output of outputs) {
      if (output.snapshots.length > 0) {
        allSnapshots.push(...output.snapshots as PharmacistRankingSnapshot[])
        report.cohorts.push({
          cohortId:         output.cohort.cohortId,
          classificationId: output.cohort.classificationId,
          entityType:       'pharmacist',
          memberCount:      output.snapshots.length,
        })
      }
      for (const ex of output.excluded) {
        if (!allExcluded.some((e) => e.entityId === ex.entityId)) allExcluded.push(ex)
      }
    }

    // ── Step 7: attach movement from previous period ──────────
    const prevSnaps  = await getPreviousPeriodSnapshots(periodId, profileId, profileVersion, 'pharmacist')
    const prevMap    = new Map(prevSnaps.map((s) => [s.entityId, s.currentRank]))
    const enriched   = attachPharmacistMovement(allSnapshots, prevMap)

    // ── Step 8: write to Firestore ────────────────────────────
    await writeRankingSnapshots(enriched, generatedBy, isPreview)

    report.totalRanked      = enriched.length
    report.totalExcluded    = allExcluded.length
    report.excluded         = allExcluded
    report.pharmacistStatus = 'generated'

  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err)
  }

  return report
}

// ── Combined entry point ─────────────────────────────────────

export interface CombinedRankingReport {
  branchReport:      RankingGenerationReport
  pharmacistReport:  RankingGenerationReport
  generatedAt:       string
}

/**
 * Generate both branch and pharmacist rankings in a single operation.
 * Used by the admin Generate button in RankingsPage.
 * Returns a combined report; individual errors are in each sub-report.
 */
export async function generateAndPersistAllRankings(
  opts: GenerateRankingOptions,
): Promise<CombinedRankingReport> {
  const generatedAt = new Date().toISOString()
  const [branchReport, pharmacistReport] = await Promise.all([
    generateAndPersistBranchRankings(opts),
    generateAndPersistPharmacistRankings(opts),
  ])
  return { branchReport, pharmacistReport, generatedAt }
}
