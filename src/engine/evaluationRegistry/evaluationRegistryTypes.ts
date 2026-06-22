// ============================================================
// Evaluation Registry Types — ER-0
//
// Type definitions for the Evaluation Registry architecture.
// This is the canonical source-of-truth schema for all future
// evaluation and ranking logic.
//
// Architecture:
//   Evaluation Registry (ER-0)  ← THIS FILE
//   ↓  Evaluation Engine        (future)
//   ↓  Evaluation Ledger        (future)
//   ↓  Ranking Engine           (future)
//   ↓  Performance Center       (future)
//   ↓  Coaching Layer           (future)
//
// Non-goals for ER-0:
//   - No evaluation calculations
//   - No scoring logic
//   - No ranking
//   - No coaching
//   - No performance center
// ============================================================

// ── Status lifecycle ──────────────────────────────────────────

export type EvaluationProfileStatus = 'draft' | 'published' | 'archived'

// ── Threshold bands ───────────────────────────────────────────

/**
 * A single performance band within a threshold rule.
 * min/max are achievement percentages (0–200+).
 *
 * Example:
 *   { min: 0,   max: 69.99, label: 'Below Expectation', score: 1 }
 *   { min: 70,  max: 99.99, label: 'Meet Expectation',  score: 2 }
 *   { min: 100, max: 999,   label: 'Exceed Expectation', score: 3 }
 */
export interface ThresholdBand {
  /** Lower bound (inclusive) — achievement percentage */
  min:    number
  /** Upper bound (exclusive except for the highest band) — achievement percentage */
  max:    number
  /** Display label */
  label:  string
  /** Arabic display label */
  labelAr?: string
  /** Numeric score awarded for this band. Higher = better. No scoring engine in ER-0. */
  score:  number
  /** Optional CSS colour hint for UI rendering */
  color?: string
}

/**
 * A reusable threshold rule defining performance bands.
 * Rules are shared across baskets and profiles — changing one rule
 * updates all references.
 *
 * Stored as embedded objects in ER-0; a dedicated collection
 * (threshold_rules/{id}) is deferred to ER-1 if sharing is needed.
 */
export interface ThresholdRule {
  id:          string
  name:        string
  description?: string
  bands:       ThresholdBand[]
}

/** Default three-band threshold rule applied when a basket has no override */
export const DEFAULT_THRESHOLD_RULE: ThresholdRule = {
  id:    'default',
  name:  'Standard Threshold',
  bands: [
    { min: 0,   max: 70,  label: 'Below Expectation', labelAr: 'دون التوقعات',    score: 1, color: '#ef4444' },
    { min: 70,  max: 100, label: 'Meet Expectation',  labelAr: 'يلبي التوقعات',   score: 2, color: '#f59e0b' },
    { min: 100, max: 999, label: 'Exceed Expectation',labelAr: 'يتجاوز التوقعات', score: 3, color: '#22c55e' },
  ],
}

// ── Basket element ────────────────────────────────────────────

/**
 * A single KPI reference within a basket.
 * Linked to the live KPI Registry via kpiKey — no value copies.
 *
 * weight: fraction of the basket's total weight this KPI contributes.
 *   All elements within a basket must sum to 1.0.
 * required: if true, the basket score is invalid when this KPI has no data.
 */
export interface BasketElement {
  /** Registry key from the KPI Registry (e.g. 'wasfaty', 'omnihealth') */
  kpiKey:    string
  /** Fraction of basket weight (0–1). All elements in basket must sum to 1.0. */
  weight:    number
  /** Whether this KPI must have data for the basket score to be valid */
  required:  boolean
  /** Optional per-element threshold override. Defaults to basket's thresholdRule. */
  thresholdOverride?: ThresholdRule
  /**
   * Optional per-element achievement cap (percentage).
   * When set, actual/target × 100 is clamped to this value before threshold
   * matching and basket aggregation.
   * Example: 130 → any achievement above 130% is treated as 130%.
   * Raw achievementPct is still preserved in ElementResult for reporting.
   * Takes precedence over EvaluationBasket.achievementCapPct.
   * null / absent = no cap (backwards-compatible default).
   */
  achievementCapPct?: number | null
  /** Optional metadata for display or future use */
  metadata?: Record<string, unknown>
}

// ── Evaluation basket ─────────────────────────────────────────

/**
 * A basket groups related KPIs under a common category.
 * Baskets are the primary structural unit of an EvaluationProfile.
 *
 * Examples:
 *   Profit Basket   — basket, crossSelling
 *   Guest Basket    — wasfaty, omni
 *   Wellness Basket — wellness, inbody
 *   Revenue Basket  — sales, sl
 *
 * No hardcoded KPI list — all KPIs come from BasketElement.kpiKey
 * which is resolved against the live KPI Registry at evaluation time.
 */
export interface EvaluationBasket {
  id:          string
  name:        string
  nameAr?:     string
  description?: string
  /** Fraction of the total profile weight this basket contributes (0–1) */
  weight:      number
  /** KPI elements in this basket */
  elements:    BasketElement[]
  /** Threshold rule applied to this basket's aggregate score */
  thresholdRule: ThresholdRule
  /** Stable sort order for display */
  sortOrder:   number
  /** Whether this basket is active in the current profile */
  active:      boolean
  /**
   * Optional basket-level achievement cap (percentage).
   * Applied to any element that does NOT have its own element-level
   * achievementCapPct set.
   * Example: 150 → elements without an element-level cap are clamped at 150%.
   * null / absent = no basket-level cap (backwards-compatible default).
   */
  achievementCapPct?: number | null
}

// ── Evaluation profile ────────────────────────────────────────

/**
 * An EvaluationProfile defines the structure of a periodic evaluation.
 * It is the template from which individual evaluations are run.
 *
 * Versioning:
 *   Each published profile is immutable. Editing a published profile
 *   creates a new version (new document) with version = previous + 1.
 *   Historical versions are preserved indefinitely.
 *
 * Status lifecycle:
 *   draft → published → archived
 *   (published is immutable — must create new version to edit)
 *
 * basketIds: ordered list of basket IDs for display ordering.
 *   The baskets themselves are embedded in the document for immutability.
 */
export interface EvaluationProfile {
  id:            string
  name:          string
  nameAr?:       string
  description?:  string

  /** Role(s) this profile applies to. Matches ROLES from constants. */
  role:          string | string[]

  /** Profile version number. Starts at 1. Increments on each publish+edit. */
  version:       number

  /** ISO date string (yyyy-MM-dd) — first month this profile is effective */
  effectiveFrom: string

  /**
   * ISO date string (yyyy-MM-dd) — last month this profile is effective.
   * null = indefinitely active.
   */
  effectiveTo:   string | null

  status:        EvaluationProfileStatus

  /** Ordered basket IDs for display ordering */
  basketIds:     string[]

  /**
   * Embedded baskets — copied into the profile document at publish time.
   * Embedding ensures historical immutability: changes to baskets after
   * publish do not retroactively alter published profiles.
   * Keyed by basket id for O(1) lookup.
   */
  baskets:       Record<string, EvaluationBasket>

  /** Default threshold rule for baskets that don't override it */
  defaultThresholdRule: ThresholdRule

  metadata?: Record<string, unknown>

  createdBy:     string | null
  createdAt:     unknown
  updatedAt:     unknown
  publishedAt:   unknown | null
  archivedAt:    unknown | null

  /** ID of the profile this version was created from (null for v1) */
  previousVersionId: string | null
}

// ── Profile version record ────────────────────────────────────

/**
 * Lightweight record created at publish time for version history display.
 * Stored embedded in the profile document — no separate collection in ER-0.
 * A dedicated version history collection is deferred to ER-1.
 */
export interface EvaluationProfileVersion {
  versionId:    string   // = profile.id
  version:      number
  status:       EvaluationProfileStatus
  publishedAt:  unknown
  publishedBy:  string | null
  snapshotName: string   // profile.name at time of publish
  effectiveFrom: string
  effectiveTo:   string | null
}

// ── Validation ────────────────────────────────────────────────

export interface EvaluationProfileValidationResult {
  valid:    boolean
  errors:   string[]
  warnings: string[]
}

/**
 * Validates that:
 *   1. Profile has at least one basket
 *   2. All basket weights sum to 1.0 (±0.01)
 *   3. Each basket has at least one element
 *   4. All basket element weights sum to 1.0 (±0.01) per basket
 *   5. effectiveFrom is a valid date
 *   6. role is non-empty
 *
 * No scoring logic. Pure validation only.
 */
export function validateEvaluationProfile(
  profile: Partial<EvaluationProfile>,
): EvaluationProfileValidationResult {
  const errors:   string[] = []
  const warnings: string[] = []

  if (!profile.name?.trim())   errors.push('Profile name is required')
  if (!profile.role ||
      (Array.isArray(profile.role) && profile.role.length === 0))
    errors.push('At least one role must be assigned')
  if (!profile.effectiveFrom)  errors.push('Effective from date is required')

  const baskets = profile.baskets ? Object.values(profile.baskets) : []
  if (baskets.length === 0) {
    errors.push('At least one basket is required')
  } else {
    // Basket weight sum
    const basketWeightSum = baskets
      .filter((b) => b.active)
      .reduce((s, b) => s + b.weight, 0)
    if (Math.abs(basketWeightSum - 1.0) > 0.01) {
      errors.push(`Active basket weights must sum to 1.0 (currently ${basketWeightSum.toFixed(3)})`)
    }

    // Per-basket element weight sum + threshold validation + duplicate kpiKey
    for (const basket of baskets) {
      if (!basket.active) continue
      if (basket.elements.length === 0) {
        errors.push(`Basket "${basket.name}" has no elements`)
        continue
      }
      const elementWeightSum = basket.elements.reduce((s, e) => s + e.weight, 0)
      if (Math.abs(elementWeightSum - 1.0) > 0.01) {
        errors.push(`Basket "${basket.name}" element weights must sum to 1.0 (currently ${elementWeightSum.toFixed(3)})`)
      }
      // ER-1.5: duplicate kpiKey check — same KPI cannot appear twice in one basket
      const seen = new Set<string>()
      for (const el of basket.elements) {
        if (seen.has(el.kpiKey)) {
          errors.push(`Basket "${basket.name}" contains duplicate KPI "${el.kpiKey}"`)
        }
        seen.add(el.kpiKey)
      }
      // Threshold band validation for this basket's rule
      if (basket.thresholdRule) {
        const tv = validateThresholdRule(basket.thresholdRule)
        tv.errors.forEach((e) => errors.push(`Basket "${basket.name}" threshold: ${e}`))
      }
    }
  }

  if (profile.effectiveFrom && profile.effectiveTo) {
    if (profile.effectiveTo <= profile.effectiveFrom) {
      warnings.push('effectiveTo should be after effectiveFrom')
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ── ER-1: Extended threshold presets ─────────────────────────

/** Five-band threshold rule for SMARTS-style profiles */
export const FIVE_BAND_THRESHOLD_RULE: ThresholdRule = {
  id:    'five-band',
  name:  'SMARTS Five-Band',
  bands: [
    { min: 0,   max: 70,  label: 'Significant Below Expectation', labelAr: 'أقل بشكل ملحوظ',      score: 1, color: '#dc2626' },
    { min: 70,  max: 90,  label: 'Below Expectation',             labelAr: 'دون التوقعات',           score: 2, color: '#ef4444' },
    { min: 90,  max: 100, label: 'Meet Expectation',              labelAr: 'يلبي التوقعات',          score: 3, color: '#f59e0b' },
    { min: 100, max: 115, label: 'Exceed Expectation',            labelAr: 'يتجاوز التوقعات',        score: 4, color: '#22c55e' },
    { min: 115, max: 999, label: 'Significant Exceed Expectation',labelAr: 'يتجاوز بشكل ملحوظ',      score: 5, color: '#16a34a' },
  ],
}

/**
 * Composite-score rating rule — used for the FINAL overall evaluation rating.
 *
 * Domain: normalizedFinalScorePct (0–100), computed as:
 *   (finalScore − minPossible) / (maxPossible − minPossible) × 100
 *
 * This rule is intentionally separate from FIVE_BAND_THRESHOLD_RULE:
 *   • FIVE_BAND is calibrated for individual KPI achievement % (can exceed 100%,
 *     common to see 110–130% when a pharmacist overachieves a target).
 *   • COMPOSITE_SCORE_RATING_RULE is calibrated for a 0–100 clamped composite
 *     score where 100% = all baskets at maximum band, 0% = all at minimum band.
 *
 * Why FIVE_BAND is wrong for composite scores:
 *   normalizedFinalScorePct is structurally clamped to [0, 100].
 *   FIVE_BAND's "Significant Exceed" threshold (≥115%) is therefore unreachable,
 *   and "Exceed" (≥100%) is only reachable at the exact maximum — the top 10%
 *   of the reachable range maps to "Meet" and the next 20% to "Below".
 *   A finalScore of 4.4/5.0 (normalizedFinalScorePct = 85%) would incorrectly
 *   show "Below Expectation" with FIVE_BAND.
 *
 * With COMPOSITE_SCORE_RATING_RULE: 85% → "Exceed Expectation" ✓
 */
export const COMPOSITE_SCORE_RATING_RULE: ThresholdRule = {
  id:    'composite-score',
  name:  'Composite Score Rating',
  bands: [
    { min: 0,  max: 50,  label: 'Significant Below Expectation', labelAr: 'أقل بشكل ملحوظ',   score: 1, color: '#dc2626' },
    { min: 50, max: 70,  label: 'Below Expectation',             labelAr: 'دون التوقعات',        score: 2, color: '#ef4444' },
    { min: 70, max: 85,  label: 'Meet Expectation',              labelAr: 'يلبي التوقعات',       score: 3, color: '#f59e0b' },
    { min: 85, max: 95,  label: 'Exceed Expectation',            labelAr: 'يتجاوز التوقعات',     score: 4, color: '#22c55e' },
    { min: 95, max: 101, label: 'Significant Exceed Expectation',labelAr: 'يتجاوز بشكل ملحوظ',   score: 5, color: '#16a34a' },
  ],
}

// ── Threshold validation ──────────────────────────────────────

export interface ThresholdValidationResult {
  valid:    boolean
  errors:   string[]
}

/**
 * Validates a ThresholdRule's bands:
 *   1. At least one band
 *   2. All min/max are finite numbers
 *   3. min < max for each band
 *   4. No overlapping ranges
 *   5. Bands sorted ascending by min
 */
export function validateThresholdRule(rule: ThresholdRule): ThresholdValidationResult {
  const errors: string[] = []
  if (!rule.bands || rule.bands.length === 0) {
    return { valid: false, errors: ['At least one threshold band is required'] }
  }
  for (let i = 0; i < rule.bands.length; i++) {
    const b = rule.bands[i]
    if (!isFinite(b.min) || !isFinite(b.max)) {
      errors.push(`Band ${i + 1}: min and max must be valid numbers`)
      continue
    }
    if (b.min >= b.max) {
      errors.push(`Band ${i + 1} ("${b.label}"): min (${b.min}) must be less than max (${b.max})`)
    }
    if (!b.label?.trim()) {
      errors.push(`Band ${i + 1}: label is required`)
    }
    // Check overlap with next band
    if (i < rule.bands.length - 1) {
      const next = rule.bands[i + 1]
      if (isFinite(b.max) && isFinite(next.min) && b.max > next.min) {
        errors.push(`Band ${i + 1} ("${b.label}") overlaps with band ${i + 2} ("${next.label}")`)
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

// ── SMARTS 2026 starter template ──────────────────────────────

/**
 * Returns a starter draft profile shaped for SMARTS 2026.
 * All KPI references use live registry keys — no hardcoded values.
 * This is configuration only; no scoring or execution logic.
 *
 * The template is a STARTING POINT — admins adjust weights,
 * add/remove elements, and set their own threshold rules before publishing.
 */
export function createSmarts2026Template(): Partial<EvaluationProfile> {
  // Basket-level threshold: FIVE_BAND (KPI achievement % domain, can exceed 100%)
  const rule = FIVE_BAND_THRESHOLD_RULE

  // Profile-level rating: COMPOSITE_SCORE_RATING_RULE (normalizedFinalScorePct domain, clamped 0–100)
  // See COMPOSITE_SCORE_RATING_RULE for the full explanation of why these are different.

  const makeBasket = (
    id: string, name: string, nameAr: string,
    weight: number, sortOrder: number,
    elements: BasketElement[],
  ): EvaluationBasket => ({
    id, name, nameAr, weight,
    description: '',
    elements,
    thresholdRule: { ...rule },
    sortOrder,
    active: true,
  })

  const el = (kpiKey: string, weight: number, required = true): BasketElement =>
    ({ kpiKey, weight, required })

  const satisfactionBasket = makeBasket(
    'satisfaction', 'Satisfaction', 'رضا العملاء', 0.20, 1,
    [
      el('wasfaty', 0.50),
      el('omnihealth', 0.50),
    ],
  )

  const profitBasket = makeBasket(
    'profit', 'Profit', 'الربحية', 0.20, 2,
    [
      el('basket', 0.60),
      el('crossSelling', 0.40),
    ],
  )

  const omniGuestBasket = makeBasket(
    'omni-guest', 'Omni Guest', 'ضيف أومني', 0.20, 3,
    [
      el('omnihealth', 0.60, true),
      el('ndf', 0.40, false),
    ],
  )

  const wellnessBasket = makeBasket(
    'wellness-card', 'Wellness Card', 'بطاقة ويلنس', 0.20, 4,
    [
      el('wellnessCard', 0.60),
      el('inbody', 0.40, false),
    ],
  )

  const revenueBasket = makeBasket(
    'revenue', 'Revenue', 'الإيرادات', 0.20, 5,
    [
      el('sales', 0.70, false),
      el('sl', 0.30, false),
    ],
  )

  const baskets: Record<string, EvaluationBasket> = {
    satisfaction:  satisfactionBasket,
    profit:        profitBasket,
    'omni-guest':  omniGuestBasket,
    'wellness-card': wellnessBasket,
    revenue:       revenueBasket,
  }

  return {
    name:                 'SMARTS 2026 — Pharmacist Evaluation',
    nameAr:               'سمارتس 2026 — تقييم الصيدلاني',
    description:          'Starter template for SMARTS 2026 evaluation profile. Adjust weights and elements before publishing.',
    role:                 'pharmacist',
    effectiveFrom:        '2026-01',
    effectiveTo:          null,
    basketIds:            ['satisfaction', 'profit', 'omni-guest', 'wellness-card', 'revenue'],
    baskets,
    defaultThresholdRule: COMPOSITE_SCORE_RATING_RULE,
  }
}

/**
 * Check whether a profile is immutable (cannot be directly edited).
 * Published and archived profiles are immutable — create a new version instead.
 */
export function isProfileImmutable(status: EvaluationProfileStatus): boolean {
  return status === 'published' || status === 'archived'
}

/**
 * Check whether a profile version is currently effective for a given month.
 * Used by the future Evaluation Engine to select the correct profile for a run.
 *
 * @param profile - The EvaluationProfile to check
 * @param month   - 'yyyy-MM' — the evaluation month
 */
export function isProfileEffectiveForMonth(
  profile: EvaluationProfile,
  month:   string,
): boolean {
  if (profile.status !== 'published') return false
  if (profile.effectiveFrom > month)  return false
  if (profile.effectiveTo && profile.effectiveTo < month) return false
  return true
}

// ── ER-1.5: KPI type import for checkProfileKpiCompatibility ──
import type { KpiRegistry } from '../kpiRegistry'

// ── ER-1.5: SMARTS template KPI safety check ─────────────────

/**
 * Checks each KPI key referenced in an evaluation profile's basket elements
 * against the provided live registry. Returns warnings for any key that is:
 *   - missing from the registry entirely
 *   - present but inactive (isActive === false)
 *
 * Pure function. Does not throw. Safe to call with any registry state.
 * Used to surface warnings in the Basket Builder UI before publish.
 *
 * @param profile  - The profile whose basket elements to check
 * @param registry - The live KpiRegistry (from subscribeKpiRegistry)
 * @returns Array of human-readable warning strings (empty = all keys are safe)
 */
export function checkProfileKpiCompatibility(
  profile:  Partial<EvaluationProfile>,
  registry: KpiRegistry,
): string[] {
  const warnings: string[] = []
  const baskets = profile.baskets ? Object.values(profile.baskets) : []

  for (const basket of baskets) {
    if (!basket.active) continue
    for (const el of basket.elements) {
      const kpi = registry[el.kpiKey]
      if (!kpi) {
        warnings.push(
          `Basket "${basket.name}": KPI "${el.kpiKey}" is not in the live registry — ` +
          `it will be ignored by the Evaluation Engine until added.`
        )
      } else if (!kpi.isActive) {
        warnings.push(
          `Basket "${basket.name}": KPI "${el.kpiKey}" (${kpi.label}) is inactive — ` +
          `activate it in the KPI Registry before publishing this profile.`
        )
      }
    }
  }

  return warnings
}
