// ============================================================
// Branch Classification — RF-0 Constants
//
// Single source of truth for:
//   - Schema version (idempotency guard for migration)
//   - UNCLASSIFIED sentinel (never guess a real tier)
//   - Default seed set (created in Firestore on first migration)
//   - Subcollection name
// ============================================================

import type { BranchClassification } from './types'

// ── Schema versioning ─────────────────────────────────────────

/**
 * Current schema version written to pharmacy documents during migration.
 * Bump this when the pharmacy document shape changes.
 * The migration skips documents already at this version (idempotency).
 */
export const CLASSIFICATION_SCHEMA_VERSION = 1

// ── Sentinel value ────────────────────────────────────────────

/**
 * ID used when a branch has not been explicitly classified.
 * The migration backfill sets all unclassified branches to this value.
 *
 * NEVER auto-assign a real classification tier.
 * Admin must explicitly promote a branch out of 'unclassified'.
 */
export const UNCLASSIFIED_ID = 'unclassified'

// ── Subcollection name ────────────────────────────────────────

/**
 * The subcollection path under `pharmacies/{id}` where history is stored.
 * Centralised here so all consumers use the same string.
 */
export const CLASSIFICATION_HISTORY_SUBCOLLECTION = 'classificationHistory'

// ── Firestore collection name ─────────────────────────────────

/**
 * The top-level Firestore collection for classification definitions.
 * Added to COL in firebase.js via the RF-0 migration step.
 */
export const CLASSIFICATIONS_COLLECTION = 'classifications'

// ── Default seed set ──────────────────────────────────────────

/**
 * Default classification registry seeded during migration.
 *
 * Properties:
 *   - These are STARTING POINTS only; admins can rename/reorder.
 *   - The migration seeds only documents that do not already exist
 *     (idempotent — re-running won't clobber admin edits).
 *   - 'unclassified' is system:true and cannot be deleted via admin UI.
 *   - All other tiers are active and can be retired (active:false).
 *
 * Order reflects a typical operational hierarchy (lower order = more
 * visibility in UIs). The Ranking Engine will group by these IDs.
 */
export const DEFAULT_CLASSIFICATIONS: Omit<BranchClassification, 'createdAt' | 'updatedAt'>[] = [
  {
    id:            UNCLASSIFIED_ID,
    label:         'Unclassified',
    labelAr:       'غير مصنف',
    description:   'Branch has not been assigned a classification tier. Default state after migration.',
    order:         0,
    active:        true,
    system:        true,
    schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
  },
  {
    id:            'destination',
    label:         'Destination',
    labelAr:       'وجهة',
    description:   'High-footfall anchor branch. Typically highest volume and widest service range.',
    order:         1,
    active:        true,
    system:        false,
    schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
  },
  {
    id:            'neighbourhood',
    label:         'Neighbourhood',
    labelAr:       'حي',
    description:   'Community-serving branch with regular local clientele.',
    order:         2,
    active:        true,
    system:        false,
    schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
  },
  {
    id:            'provider',
    label:         'Provider',
    labelAr:       'مزود',
    description:   'Primarily prescription-fulfillment focused. Strong dispensing volume.',
    order:         3,
    active:        true,
    system:        false,
    schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
  },
  {
    id:            'other',
    label:         'Other',
    labelAr:       'أخرى',
    description:   'Does not fit standard tiers. Reviewed case-by-case.',
    order:         4,
    active:        true,
    system:        false,
    schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
  },
]
