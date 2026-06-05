// ============================================================
// Evaluation Actuals Service — ER-2B
//
// Aggregates real kpi_entries for a user+month into the
// Record<engineKey, number> format the Evaluation Engine expects.
//
// Design:
//   kpi_entries are stored keyed by engineKey (aliasFor ?? key).
//   e.g. 'omni', not 'omnihealth'; 'wellness', not 'wellnessCard'.
//   The aggregation service SUMS all entry fields for the month.
//   No aliasFor translation is needed during aggregation — entries
//   are already in engineKey form when written by kpiService.
//
// Registry-aware:
//   The allowed set of engineKeys is derived from the live registry.
//   Custom/dynamic KPIs (sales, sl, ndf, inbody…) are included
//   automatically when present in the registry and in entries.
//   No KPI_KEYS. No KPI_WEIGHTS. No hardcoded lists.
//
// Non-goals:
//   No scoring. No ranking. No coaching.
// ============================================================

import {
  collection, query, where, orderBy, getDocs,
} from 'firebase/firestore'
import { db, COL } from './firebase'
import { buildAllowedEntryKeys, ENTRY_METADATA_FIELDS }
  from './kpiRegistryLogic'
import type { KpiRegistry } from '../engine/kpiRegistry'

// ── Types ─────────────────────────────────────────────────────

/**
 * KPI actuals keyed by engineKey for one user+month.
 * Passed directly to EvaluationEngineInput.kpiActuals.
 *
 * Example:
 *   {
 *     wasfaty:     31250,
 *     omni:        412,
 *     wellness:    88,
 *     basket:      1940,
 *     crossSelling: 74,
 *     sales:       98000,
 *     sl:          120,
 *     ndf:         14,
 *   }
 */
export type KpiActualsMap = Record<string, number>

export interface AggregationResult {
  actuals:      KpiActualsMap
  entryCount:   number         // total kpi_entries found for the period
  dateRange:    { from: string; to: string }
  hasData:      boolean        // true if at least one entry has a non-zero KPI value
}

// ── Month date helpers ────────────────────────────────────────

/** Convert 'yyyy-MM' to first and last day strings for Firestore range queries */
function monthDateRange(month: string): { from: string; to: string } {
  const [yyyy, mm] = month.split('-').map(Number)
  const lastDay    = new Date(yyyy, mm, 0).getDate()   // day 0 of next month = last day of this month
  const pad        = (n: number) => String(n).padStart(2, '0')
  return {
    from: `${yyyy}-${pad(mm)}-01`,
    to:   `${yyyy}-${pad(mm)}-${lastDay}`,
  }
}

// ── Main aggregation function ─────────────────────────────────

/**
 * Aggregate all kpi_entries for a specific user+month.
 * Returns the SUM of each KPI field across all entries in the month.
 *
 * Uses the live registry to determine which fields are valid engineKeys.
 * Fields not in the registry allowlist are silently ignored.
 * Metadata fields (userId, date, timestamps…) are always skipped.
 *
 * @param userId    - Pharmacist's user ID
 * @param pharmacyId - Branch ID (used for Firestore filter)
 * @param month     - 'yyyy-MM'
 * @param registry  - Live KPI Registry for allowlist derivation
 */
export async function aggregateKpiActuals(
  userId:     string,
  pharmacyId: string,
  month:      string,
  registry:   KpiRegistry,
): Promise<AggregationResult> {
  const { from, to } = monthDateRange(month)


  // Fetch all entries for this user+pharmacy+month
  const q = query(
    collection(db, COL.KPI_ENTRIES),
    where('userId',     '==', userId),
    where('pharmacyId', '==', pharmacyId),
    where('date', '>=', from),
    where('date', '<=', to),
    orderBy('date', 'desc'),
  )
  const snap     = await getDocs(q)
  const entries  = snap.docs.map((d) => d.data() as Record<string, unknown>)


  // Build allowed engine key set from registry (no KPI_KEYS, no hardcoding).
  // Key contract:
  //   Entry field names use ENGINE keys (aliasFor ?? key):
  //     omnihealth.aliasFor = 'omni'      → entry stores 'omni'
  //     wellnessCard.aliasFor = 'wellness' → entry stores 'wellness'
  //     basket, crossSelling, wasfaty     → entry stores these directly (no alias)
  //   The resulting kpiActuals map uses engine keys.
  //   The evaluationEngine reads kpiActuals[engineKey] — same key space.
  //   No translation is needed between aggregation and engine.
  const allowedKeys = buildAllowedEntryKeys(registry)

  // Accumulate sums keyed by engineKey
  const totals: Record<string, number> = {}
  let hasData = false

  for (const entry of entries) {
    for (const [field, rawValue] of Object.entries(entry)) {
      // Skip metadata fields
      if (ENTRY_METADATA_FIELDS.has(field)) continue

      // Skip fields not in the registry allowlist
      if (!allowedKeys.has(field)) continue

      const n = Number(rawValue)
      if (!isFinite(n) || isNaN(n) || n < 0) continue

      totals[field] = (totals[field] ?? 0) + n
      if (n > 0) hasData = true
    }
  }

  return {
    actuals:    totals,
    entryCount: entries.length,
    dateRange:  { from, to },
    hasData,
  }
}

// ── Branch target fetch ───────────────────────────────────────

/**
 * Fetch the branch monthly target document for a pharmacy+month.
 * Target doc ID is '{pharmacyId}_{month}' (existing kpiService convention).
 * Returns null if not found.
 */
export async function fetchBranchTarget(
  pharmacyId: string,
  month:      string,
): Promise<Record<string, unknown> | null> {
  const { doc, getDoc } = await import('firebase/firestore')
  const docId  = `${pharmacyId}_${month}`
  const snap   = await getDoc(doc(db, COL.TARGETS, docId))
  return snap.exists() ? snap.data() as Record<string, unknown> : null
}

// ── Published personal target fetch ──────────────────────────

/**
 * Fetch the published personal target for a user+pharmacy+month.
 * Returns null if not found OR if the target is still in draft status.
 * Draft targets are explicitly excluded — pharmacists must not be evaluated
 * against targets they have not been shown.
 */
export async function fetchPublishedPersonalTarget(
  userId:     string,
  pharmacyId: string,
  month:      string,
) {
  const { fetchMyPersonalTarget } = await import('./personalTargetService')
  const doc = await fetchMyPersonalTarget(userId, pharmacyId, month)
  // Only return published targets — drafts are excluded
  return doc?.status === 'published' ? doc : null
}

// ── Pre-flight validation ─────────────────────────────────────

export interface PreflightResult {
  valid:   boolean
  errors:  string[]
  warnings: string[]
}

/**
 * Validate that all required inputs exist before running an evaluation.
 * Does NOT run the evaluation — only checks preconditions.
 * Prevents writing an invalid/empty ledger doc.
 *
 * @param userId
 * @param pharmacyId
 * @param userRole
 * @param month
 * @param profileId  - optional: if provided, checks that profile exists and is published
 */
export async function preflightEvaluationCheck(
  userId:     string,
  pharmacyId: string,
  userRole:   string,
  month:      string,
  profileId?: string,   // ER-2B fix: when provided, skip role-based profile check
): Promise<PreflightResult> {
  const errors:   string[] = []
  const warnings: string[] = []

  if (!userId)     errors.push('User ID is required')
  if (!pharmacyId) errors.push('Branch ID is required — user may not have a pharmacyId assigned')
  if (!userRole)   errors.push('User role is required')
  if (!month)      errors.push('Month is required')

  if (errors.length > 0) return { valid: false, errors, warnings }

  // Check profile exists
  if (profileId) {
    // Explicit profile selected — just verify it exists and is published
    const { fetchEvaluationProfile } = await import('./evaluationRegistryService')
    const profile = await fetchEvaluationProfile(profileId)
    if (!profile) {
      errors.push(`Evaluation profile "${profileId}" not found`)
    } else if (profile.status !== 'published') {
      errors.push(
        `Profile "${profile.name}" is ${profile.status} — only published profiles can be used for evaluation`
      )
    }
  } else {
    // Role-based fallback — check active profile exists for this role+month
    const { fetchActiveProfileForMonth } = await import('./evaluationRegistryService')
    const profile = await fetchActiveProfileForMonth(userRole, month)
    if (!profile) {
      errors.push(
        `No published evaluation profile found for role "${userRole}" in ${month}. ` +
        `Select a profile explicitly or create and publish one in the Evaluation Registry.`
      )
    }
  }

  // Check branch target exists (warning, not error — engine handles null gracefully)
  const branchTarget = await fetchBranchTarget(pharmacyId, month)
  if (!branchTarget) {
    warnings.push(
      `No branch target found for ${month}. ` +
      `All target resolutions will return 0 unless personal targets are set.`
    )
  }

  return { valid: errors.length === 0, errors, warnings }
}
