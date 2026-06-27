// ============================================================
// KPI Archive Dependency Guard — PR-1C
//
// Before this module, archiveKpiDefinition() in kpiRegistryService.ts
// had no dependency check at all: a KPI could be archived while still
// referenced by a published Evaluation Profile, while still carrying
// months of targets/actuals, or while still appearing in computed
// evaluation results. This module answers "is it safe to archive this
// KPI key right now?" with an exact, typed list of blockers so the UI
// can show "Used in 2 active evaluation profiles" instead of a
// disabled button with no explanation.
//
// This performs full collection scans (evaluation_profiles, targets,
// kpi_entries, evaluation_results) and filters in memory, because
// these documents store KPI values under dynamic per-KPI-key fields
// (targets/kpi_entries) or inside nested arrays (profiles/results) —
// neither of which Firestore can filter server-side without a new
// per-KPI index. Acceptable here because this check only runs when an
// admin explicitly requests to archive one KPI — not on every page load.
// ============================================================
import { collection, getDocs } from 'firebase/firestore'
import { db, COL } from './firebase'

export type KpiArchiveDependencyType =
  | 'active_profile' | 'draft_profile' | 'targets' | 'actuals' | 'evaluation_results'

export interface KpiArchiveDependency {
  type:               KpiArchiveDependencyType
  count:              number
  reason:             string
  recommendedAction:  string
}

export interface KpiArchiveCheckResult {
  safe:          boolean
  dependencies:  KpiArchiveDependency[]
}

interface ProfileLikeDoc {
  status?: string
  baskets?: Record<string, { elements?: Array<{ kpiKey?: string }> }>
}

interface LedgerLikeDoc {
  basketResults?: Array<{ elements?: Array<{ kpiKey?: string }> }>
}

function profileReferencesKpi(doc: ProfileLikeDoc, kpiKey: string): boolean {
  const baskets = doc.baskets ?? {}
  return Object.values(baskets).some((basket) =>
    (basket.elements ?? []).some((el) => el.kpiKey === kpiKey),
  )
}

function ledgerReferencesKpi(doc: LedgerLikeDoc, kpiKey: string): boolean {
  return (doc.basketResults ?? []).some((basket) =>
    (basket.elements ?? []).some((el) => el.kpiKey === kpiKey),
  )
}

/**
 * Checks whether a KPI key is safe to archive.
 *
 * Returns every blocker found — never just the first one — so the UI
 * can show the complete dependency picture in one pass.
 */
export async function checkKpiArchiveDependencies(kpiKey: string): Promise<KpiArchiveCheckResult> {
  const dependencies: KpiArchiveDependency[] = []

  const [profilesSnap, targetsSnap, entriesSnap, resultsSnap] = await Promise.all([
    getDocs(collection(db, COL.EVALUATION_PROFILES)),
    getDocs(collection(db, COL.TARGETS)),
    getDocs(collection(db, COL.KPI_ENTRIES)),
    getDocs(collection(db, COL.EVALUATION_RESULTS)),
  ])

  let activeProfileCount = 0
  let draftProfileCount  = 0
  profilesSnap.forEach((d) => {
    const data = d.data() as ProfileLikeDoc
    if (!profileReferencesKpi(data, kpiKey)) return
    if (data.status === 'published') activeProfileCount++
    else if (data.status === 'draft') draftProfileCount++
  })

  if (activeProfileCount > 0) {
    dependencies.push({
      type:              'active_profile',
      count:             activeProfileCount,
      reason:            `Used in ${activeProfileCount} active evaluation profile${activeProfileCount === 1 ? '' : 's'}`,
      recommendedAction: 'Remove this KPI from the profile (creates a new version) before archiving it.',
    })
  }
  if (draftProfileCount > 0) {
    dependencies.push({
      type:              'draft_profile',
      count:             draftProfileCount,
      reason:            `Used in ${draftProfileCount} draft evaluation profile${draftProfileCount === 1 ? '' : 's'}`,
      recommendedAction: 'Remove this KPI from the draft profile before archiving it.',
    })
  }

  let targetsCount = 0
  targetsSnap.forEach((d) => {
    const data = d.data() as Record<string, unknown>
    if (data[kpiKey] !== undefined && data[kpiKey] !== null) targetsCount++
  })
  if (targetsCount > 0) {
    dependencies.push({
      type:              'targets',
      count:             targetsCount,
      reason:            `Has ${targetsCount} monthly target${targetsCount === 1 ? '' : 's'} set`,
      recommendedAction: 'Historical targets are preserved automatically — archiving does not delete them, but confirm no future targets are still being planned for this KPI.',
    })
  }

  let actualsCount = 0
  entriesSnap.forEach((d) => {
    const data = d.data() as Record<string, unknown>
    if (data[kpiKey] !== undefined && data[kpiKey] !== null) actualsCount++
  })
  if (actualsCount > 0) {
    dependencies.push({
      type:              'actuals',
      count:             actualsCount,
      reason:            'Has historical actuals',
      recommendedAction: 'Historical actuals are preserved automatically and remain visible in reports — this is informational, not a hard block.',
    })
  }

  let resultsCount = 0
  resultsSnap.forEach((d) => {
    const data = d.data() as LedgerLikeDoc
    if (ledgerReferencesKpi(data, kpiKey)) resultsCount++
  })
  if (resultsCount > 0) {
    dependencies.push({
      type:              'evaluation_results',
      count:             resultsCount,
      reason:            `Referenced by ${resultsCount} computed evaluation result${resultsCount === 1 ? '' : 's'}`,
      recommendedAction: 'Historical evaluation results are preserved automatically — this is informational, not a hard block.',
    })
  }

  // Only active/draft profile references are hard blockers — targets,
  // actuals, and evaluation results are historical data that archiving
  // never deletes, so they are surfaced for awareness but do not block.
  const safe = activeProfileCount === 0 && draftProfileCount === 0

  return { safe, dependencies }
}
