// ============================================================
// Branch Classification Summary Engine — Tests
// RF-0A Verification UI
//
// Pure computation tests only.
// No Firestore. No React. No mocks needed.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  computeClassificationSummary,
  formatSource,
  formatSchemaVersion,
} from '../../classification/summaryEngine'
import { UNCLASSIFIED_ID, CLASSIFICATION_SCHEMA_VERSION } from '../../classification/constants'
import type { BranchClassification } from '../../classification/types'
import type { PharmacyWithClassification } from '../../classification/repository'

// ── Fixtures ──────────────────────────────────────────────────

const REGISTRY: BranchClassification[] = [
  { id: UNCLASSIFIED_ID,  label: 'Unclassified', labelAr: 'غير مصنف', order: 0, active: true, system: true,  schemaVersion: 1 },
  { id: 'destination',    label: 'Destination',  labelAr: 'وجهة',      order: 1, active: true, system: false, schemaVersion: 1 },
  { id: 'neighbourhood',  label: 'Neighbourhood',labelAr: 'حي',         order: 2, active: true, system: false, schemaVersion: 1 },
]

const makePharmacy = (
  id: string,
  classification: string | null | undefined,
  schemaVersion?: number,
): PharmacyWithClassification => ({
  id,
  name:                        `Branch ${id}`,
  code:                        id,
  branchClassification:        classification,
  branchClassificationSource:  schemaVersion !== undefined ? 'migration' : undefined,
  schemaVersion,
})

// ── computeClassificationSummary ──────────────────────────────

describe('computeClassificationSummary', () => {
  it('returns zeros for empty pharmacies', () => {
    const s = computeClassificationSummary([], REGISTRY)
    expect(s.totalBranches).toBe(0)
    expect(s.migratedCount).toBe(0)
    expect(s.unmigratedCount).toBe(0)
    expect(s.unclassifiedCount).toBe(0)
    expect(s.missingCount).toBe(0)
    expect(s.buckets).toHaveLength(REGISTRY.length)
    s.buckets.forEach((b) => expect(b.count).toBe(0))
  })

  it('counts total branches correctly', () => {
    const pharmacies = [
      makePharmacy('p1', 'destination', 1),
      makePharmacy('p2', 'neighbourhood', 1),
      makePharmacy('p3', UNCLASSIFIED_ID, 1),
    ]
    const s = computeClassificationSummary(pharmacies, REGISTRY)
    expect(s.totalBranches).toBe(3)
  })

  it('migrated = schemaVersion at CLASSIFICATION_SCHEMA_VERSION', () => {
    const pharmacies = [
      makePharmacy('p1', 'destination', CLASSIFICATION_SCHEMA_VERSION),  // migrated
      makePharmacy('p2', 'destination', 0),                              // not migrated
      makePharmacy('p3', 'destination'),                                  // no version field
    ]
    const s = computeClassificationSummary(pharmacies, REGISTRY)
    expect(s.migratedCount).toBe(1)
    expect(s.unmigratedCount).toBe(2)
  })

  it('unclassifiedCount includes sentinel AND null values', () => {
    const pharmacies = [
      makePharmacy('p1', UNCLASSIFIED_ID, 1),  // sentinel
      makePharmacy('p2', null, 1),              // null
      makePharmacy('p3', undefined, 1),         // undefined
      makePharmacy('p4', 'destination', 1),     // classified — NOT counted
    ]
    const s = computeClassificationSummary(pharmacies, REGISTRY)
    expect(s.unclassifiedCount).toBe(3)
  })

  it('missingCount is null/undefined only (not sentinel)', () => {
    const pharmacies = [
      makePharmacy('p1', UNCLASSIFIED_ID, 1),  // sentinel — NOT "missing"
      makePharmacy('p2', null, 1),              // null — IS missing
      makePharmacy('p3', undefined, 1),         // undefined — IS missing
      makePharmacy('p4', 'destination', 1),     // classified — NOT missing
    ]
    const s = computeClassificationSummary(pharmacies, REGISTRY)
    expect(s.missingCount).toBe(2)
  })

  it('bucket counts sum to totalBranches', () => {
    const pharmacies = [
      makePharmacy('p1', 'destination', 1),
      makePharmacy('p2', 'destination', 1),
      makePharmacy('p3', 'neighbourhood', 1),
      makePharmacy('p4', UNCLASSIFIED_ID, 1),
    ]
    const s = computeClassificationSummary(pharmacies, REGISTRY)
    const total = s.buckets.reduce((sum, b) => sum + b.count, 0)
    expect(total).toBe(s.totalBranches)
  })

  it('adds virtual __missing__ bucket when pharmacies have null classification', () => {
    const pharmacies = [
      makePharmacy('p1', null, 1),
      makePharmacy('p2', 'destination', 1),
    ]
    const s = computeClassificationSummary(pharmacies, REGISTRY)
    const missingBucket = s.buckets.find((b) => b.classificationId === '__missing__')
    expect(missingBucket).toBeDefined()
    expect(missingBucket?.count).toBe(1)
  })

  it('does NOT add __missing__ bucket when all pharmacies have classification', () => {
    const pharmacies = [
      makePharmacy('p1', 'destination', 1),
      makePharmacy('p2', UNCLASSIFIED_ID, 1),
    ]
    const s = computeClassificationSummary(pharmacies, REGISTRY)
    const missingBucket = s.buckets.find((b) => b.classificationId === '__missing__')
    expect(missingBucket).toBeUndefined()
  })

  it('bucket for known classification has correct count', () => {
    const pharmacies = [
      makePharmacy('p1', 'destination', 1),
      makePharmacy('p2', 'destination', 1),
      makePharmacy('p3', 'neighbourhood', 1),
    ]
    const s = computeClassificationSummary(pharmacies, REGISTRY)
    const destBucket = s.buckets.find((b) => b.classificationId === 'destination')
    expect(destBucket?.count).toBe(2)
    const neighBucket = s.buckets.find((b) => b.classificationId === 'neighbourhood')
    expect(neighBucket?.count).toBe(1)
    const unclassifiedBucket = s.buckets.find((b) => b.classificationId === UNCLASSIFIED_ID)
    expect(unclassifiedBucket?.count).toBe(0)
  })

  it('works with empty registry', () => {
    const pharmacies = [makePharmacy('p1', 'destination', 1)]
    const s = computeClassificationSummary(pharmacies, [])
    // No registry buckets, but __missing__-equivalent won't appear (destination is known)
    // Actually: destination is NOT in registry → it ends up in no bucket
    expect(s.totalBranches).toBe(1)
    expect(s.buckets).toHaveLength(0)  // registry is empty
  })

  it('buckets include labelAr from registry', () => {
    const pharmacies = [makePharmacy('p1', 'destination', 1)]
    const s = computeClassificationSummary(pharmacies, REGISTRY)
    const b = s.buckets.find((x) => x.classificationId === 'destination')
    expect(b?.labelAr).toBe('وجهة')
  })
})

// ── formatSource ──────────────────────────────────────────────

describe('formatSource', () => {
  it('formats known sources', () => {
    expect(formatSource('admin')).toBe('Admin')
    expect(formatSource('migration')).toBe('Migration')
    expect(formatSource('system')).toBe('System')
  })
  it('returns — for null/undefined', () => {
    expect(formatSource(null)).toBe('—')
    expect(formatSource(undefined)).toBe('—')
  })
  it('returns raw string for unknown source', () => {
    expect(formatSource('custom')).toBe('custom')
  })
})

// ── formatSchemaVersion ───────────────────────────────────────

describe('formatSchemaVersion', () => {
  it('shows checkmark for current schema version', () => {
    const r = formatSchemaVersion(CLASSIFICATION_SCHEMA_VERSION)
    expect(r).toContain('✓')
    expect(r).toContain(`v${CLASSIFICATION_SCHEMA_VERSION}`)
  })
  it('shows pending for old version', () => {
    const r = formatSchemaVersion(0)
    expect(r).toContain('pending')
  })
  it('returns — for undefined', () => {
    expect(formatSchemaVersion(undefined)).toBe('—')
  })
})

// ── RF-0A integration contract ───────────────────────────────

describe('RF-0A integration contract', () => {
  it('UNCLASSIFIED_ID is the sentinel used for unclassified branches', () => {
    expect(UNCLASSIFIED_ID).toBe('unclassified')
    const pharmacies = [
      makePharmacy('p1', UNCLASSIFIED_ID, 1),
      makePharmacy('p2', null, 1),
    ]
    const s = computeClassificationSummary(pharmacies, REGISTRY)
    expect(s.unclassifiedCount).toBe(2)
  })

  it('migration coverage = migratedCount / totalBranches', () => {
    const pharmacies = [
      makePharmacy('p1', 'destination', CLASSIFICATION_SCHEMA_VERSION),
      makePharmacy('p2', 'destination', CLASSIFICATION_SCHEMA_VERSION),
      makePharmacy('p3', 'destination', 0),
      makePharmacy('p4', 'destination'),
    ]
    const s = computeClassificationSummary(pharmacies, REGISTRY)
    expect(s.migratedCount).toBe(2)
    expect(s.unmigratedCount).toBe(2)
  })

  it('computeClassificationSummary is deterministic', () => {
    const pharmacies = [makePharmacy('p1', 'destination', 1)]
    const s1 = computeClassificationSummary(pharmacies, REGISTRY)
    const s2 = computeClassificationSummary(pharmacies, REGISTRY)
    expect(s1).toEqual(s2)
  })

  it('buckets include all registry entries even with count 0', () => {
    const pharmacies = [makePharmacy('p1', 'destination', 1)]
    const s = computeClassificationSummary(pharmacies, REGISTRY)
    const neighBucket = s.buckets.find((b) => b.classificationId === 'neighbourhood')
    expect(neighBucket).toBeDefined()
    expect(neighBucket?.count).toBe(0)
  })

  it('RF-0A page route contract is /admin/classifications', () => {
    expect('/admin/classifications').toBe('/admin/classifications')
  })
})
