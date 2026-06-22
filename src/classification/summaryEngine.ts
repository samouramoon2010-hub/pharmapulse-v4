// ============================================================
// Branch Classification Summary — RF-0A
//
// Pure computation functions for the verification UI.
// No Firestore. No React. No side effects.
//
// Input: arrays of pharmacies and classification registry entries
// Output: summary counts for display
// ============================================================

import { UNCLASSIFIED_ID, CLASSIFICATION_SCHEMA_VERSION } from './constants'
import type { BranchClassification } from './types'
import type { PharmacyWithClassification } from './repository'

// ── Summary types ─────────────────────────────────────────────

export interface ClassificationBucket {
  classificationId:  string
  label:             string
  labelAr:           string
  count:             number
  active:            boolean
  system:            boolean
}

export interface BranchClassificationSummary {
  totalBranches:      number
  migratedCount:      number   // schemaVersion === CLASSIFICATION_SCHEMA_VERSION
  unmigratedCount:    number   // schemaVersion < CLASSIFICATION_SCHEMA_VERSION or absent
  unclassifiedCount:  number   // branchClassification === UNCLASSIFIED_ID or null/absent
  missingCount:       number   // branchClassification is null or undefined (never set)
  buckets:            ClassificationBucket[]
}

// ── Summary computation ───────────────────────────────────────

/**
 * Compute classification summary from raw pharmacy + registry data.
 *
 * @pure — deterministic, no I/O
 *
 * @param pharmacies  Array of pharmacy documents with classification fields
 * @param registry    Array of classification registry entries
 */
export function computeClassificationSummary(
  pharmacies: PharmacyWithClassification[],
  registry:   BranchClassification[],
): BranchClassificationSummary {
  const totalBranches = pharmacies.length

  // Schema migration coverage
  const migratedCount = pharmacies.filter(
    (p) => (p.schemaVersion ?? 0) >= CLASSIFICATION_SCHEMA_VERSION
  ).length
  const unmigratedCount = totalBranches - migratedCount

  // "missing" = branchClassification field was never set (null or undefined)
  const missingCount = pharmacies.filter(
    (p) => p.branchClassification == null
  ).length

  // "unclassified" = sentinel value OR null/undefined
  const unclassifiedCount = pharmacies.filter(
    (p) => !p.branchClassification || p.branchClassification === UNCLASSIFIED_ID
  ).length

  // Build buckets: one per registry entry + one for "missing" if any
  const countMap = new Map<string, number>()
  for (const pharmacy of pharmacies) {
    const key = pharmacy.branchClassification ?? '__missing__'
    countMap.set(key, (countMap.get(key) ?? 0) + 1)
  }

  const buckets: ClassificationBucket[] = registry.map((cls) => ({
    classificationId: cls.id,
    label:            cls.label,
    labelAr:          cls.labelAr ?? cls.label,
    count:            countMap.get(cls.id) ?? 0,
    active:           cls.active,
    system:           cls.system ?? false,
  }))

  // Add a virtual bucket for completely missing (null/undefined) if any
  const missingBucketCount = countMap.get('__missing__') ?? 0
  if (missingBucketCount > 0) {
    buckets.push({
      classificationId: '__missing__',
      label:            'Never Set',
      labelAr:          'لم يُعيَّن',
      count:            missingBucketCount,
      active:           false,
      system:           true,
    })
  }

  return {
    totalBranches,
    migratedCount,
    unmigratedCount,
    unclassifiedCount,
    missingCount,
    buckets,
  }
}

/**
 * Format a classification source value for display.
 */
export function formatSource(source: string | null | undefined): string {
  if (!source) return '—'
  const map: Record<string, string> = {
    admin:     'Admin',
    migration: 'Migration',
    system:    'System',
  }
  return map[source] ?? source
}

/**
 * Format a schemaVersion for display.
 * Shows checkmark or version number.
 */
export function formatSchemaVersion(v: number | undefined): string {
  if (v === undefined || v === null) return '—'
  if (v >= CLASSIFICATION_SCHEMA_VERSION) return `v${v} ✓`
  return `v${v ?? 0} (pending)`
}
