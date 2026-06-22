// ============================================================
// KPI Registry — Type Definitions
// Defines the shape of a configurable KPI definition.
// These types describe the registry schema only — no engine
// integration, no Firestore, no UI.
//
// Key design:
//   - Registry keys use BUSINESS names (wasfaty, omnihealth,
//     wellnessCard, basket, crossSelling, sales, sl, ndf,
//     inbody, liberation)
//   - Engine keys (omni, wellness) are internal aliases;
//     aliasFor maps business key → engine key
//   - KPI_ENGINE_ALIAS_MAP provides the forward lookup
//     used by Phase 4C-0B engine integration
// ============================================================

// ── Value type ────────────────────────────────────────────────

/**
 * The semantic type of a KPI's measured value.
 * Controls formatting and unit display throughout the platform.
 */
export type KpiValueType =
  | 'number'      // plain integer count (prescriptions, units)
  | 'currency'    // SAR monetary value
  | 'percentage'  // ratio expressed as 0–100%
  | 'count'       // discrete event count (same as number, distinct intent)

// ── Target type ───────────────────────────────────────────────

/**
 * How the KPI target is expressed.
 */
export type KpiTargetType =
  | 'absolute'
  | 'percentage'
  | 'ratio'

// ── Direction ─────────────────────────────────────────────────

/**
 * Whether higher or lower values indicate better performance.
 */
export type KpiDirection =
  | 'higher_is_better'
  | 'lower_is_better'

// ── Category ──────────────────────────────────────────────────

export type KpiCategory =
  | 'prescription'   // e-prescription fulfilment (Wasfaty, Liberation)
  | 'digital'        // digital health programmes (OmniHealth, NDF)
  | 'wellness'       // wellness & preventive products
  | 'commercial'     // basket size, cross-selling, sales revenue
  | 'operational'    // operational health metrics (SL)
  | 'health_program' // structured health programmes (InBody)

// ── Thresholds ────────────────────────────────────────────────

/**
 * Achievement-percentage thresholds for traffic-light classification.
 * All values are percentages (0–200).
 *
 * Order invariant: healthy >= watch >= risk >= critical >= 0
 */
export interface KpiThresholds {
  /** Minimum achievement % to be considered healthy / on-track */
  healthy:   number
  /** Minimum achievement % to be in "watch" state */
  watch:     number
  /** Minimum achievement % to be in "at-risk" state */
  risk:      number
  /** Achievement % floor — below this is critical */
  critical:  number
}

// ── Visibility flags ──────────────────────────────────────────

/**
 * Controls which platform surfaces a KPI appears on.
 */
export interface KpiVisibility {
  dashboardEnabled:  boolean
  teamEnabled:       boolean
  executiveEnabled:  boolean
  regionalEnabled:   boolean
  /** Whether this KPI appears in the Monthly Target form */
  targetInputEnabled?: boolean
}

// ── KPI Lifecycle Stage ───────────────────────────────────────

/**
 * The lifecycle stage of a KPI in the Hybrid Dynamic KPI Strategy.
 *
 * Stages:
 *   draft               - Definition created, not yet collected. Can be modified freely.
 *   pilot_tracking      - Active for collection and display. Does NOT affect evaluation,
 *                         rankings, or Executive BI. Carries "Tracking Only" badge in UI.
 *   shadow_evaluation   - Included in a shadow evaluation profile. V2 pipeline processes
 *                         it, results written to shadow_evaluation_logs only. Invisible
 *                         to pharmacists and managers.
 *   production_evaluation - Part of the official evaluation profile. Affects scores,
 *                         rankings, and Executive BI. Requires GO/NO-GO sign-off.
 *   archived            - No longer collected. Historical data preserved forever.
 *                         Cannot be deleted.
 *
 * Valid transitions are enforced by canTransitionKpiLifecycle().
 * See lifecycle utilities below for full transition rules.
 */
export type KpiLifecycleStage =
  | 'draft'
  | 'pilot_tracking'
  | 'shadow_evaluation'
  | 'production_evaluation'
  | 'archived'

// ── KPI Definition ────────────────────────────────────────────

/**
 * The full definition of a single KPI in the registry.
 *
 * aliasFor: when set, this registry entry is the business-facing
 * name for an internal engine key. The engine reads and writes
 * data using the aliasFor key (e.g. 'omni'), while the platform
 * UI and analytics use the registry key (e.g. 'omnihealth').
 */
export interface KpiDefinition {
  // ── Identity ───────────────────────────────────────────────
  /** Unique stable business key. Never changes after creation. */
  key:          string

  /** Full display label in English */
  label:        string

  /** Short label for compact displays */
  shortLabel:   string

  /** Arabic label */
  labelAr:      string

  // ── Alias mapping ──────────────────────────────────────────
  /**
   * Internal engine key this business key maps to.
   * Set when the business name differs from the engine field name.
   *
   * Examples:
   *   omnihealth.aliasFor = 'omni'      → engine reads/writes 'omni'
   *   wellnessCard.aliasFor = 'wellness' → engine reads/writes 'wellness'
   *
   * When undefined, the registry key IS the engine key.
   */
  aliasFor?:    string

  // ── Categorisation ─────────────────────────────────────────
  category:     KpiCategory
  valueType:    KpiValueType

  /** Unit of measurement */
  unit:         string
  unitAr:       string

  direction:    KpiDirection
  targetType:   KpiTargetType

  /**
   * Portfolio weight — fraction of composite score this KPI
   * contributes. Active core KPI weights must sum to 1.0.
   */
  weight:       number

  // ── Status ─────────────────────────────────────────────────
  /** Active = collected and processed by engines */
  isActive:     boolean

  /** Core = always active, carries weight in composite score */
  isCore:       boolean

  // ── Thresholds ─────────────────────────────────────────────
  thresholds:   KpiThresholds

  // ── Visibility ─────────────────────────────────────────────
  visibility:   KpiVisibility

  // ── Metadata ───────────────────────────────────────────────
  /** Stable sort order for consistent display. Lower = first. */
  sortOrder:    number
  description?: string

  // ── Primary KPI designation ────────────────────────────────
  /**
   * Whether this KPI is the primary operational KPI.
   *
   * The primary KPI drives momentum direction calculations,
   * consistency scoring proxies, and future registry-driven
   * intelligence — wherever the engine currently hardcodes 'wasfaty'.
   *
   * Invariant: exactly ONE KPI in the registry must have isPrimary: true.
   * That KPI must also be isActive: true.
   * Expected primary KPI: wasfaty.
   *
   * Phase 1A: this field is for registry completeness only.
   * The engine still uses the hardcoded 'wasfaty' constant.
   * Migration to registry-driven primary lookup is a future phase.
   */
  isPrimary:        boolean

  /**
   * English coaching guidance shown when a pharmacist is behind
   * pace on this KPI. Replaces the hardcoded switch statement in
   * PharmacistIntelligencePage.jsx and ACTIONS in kpiAnalyticsEngine.ts
   * once the registry is wired to those call sites.
   *
   * Phase 1A: stored in registry only. UI still uses hardcoded strings.
   */
  coachingAction:   string

  /**
   * Arabic coaching guidance — same purpose as coachingAction,
   * for Arabic-locale display.
   */
  coachingActionAr: string

  // ── Executive analytical metadata (Phase 4C-X-0 foundation) ──
  /**
   * How this KPI is aggregated across entries in the executive context.
   * Optional: defaults to 'SUM' for core KPIs, 'NOT_AGGREGATED' for custom.
   * The dynamicExecutiveAdapter derives this from valueType when absent.
   */
  aggregationType?:  'SUM' | 'AVG' | 'RATIO' | 'NOT_AGGREGATED'

  /**
   * Performance polarity for executive scoring.
   * Optional: defaults to KpiDirection-derived value.
   * 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER'
   */
  polarity?: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER'

  /**
   * Explicit portfolio weight override for executive composite score.
   * Optional: defaults to KpiDefinition.weight.
   * Core KPI portfolio weights must sum to 1.0.
   */
  portfolioWeight?: number

  // ── Lifecycle ──────────────────────────────────────────────
  /**
   * The lifecycle stage of this KPI in the Hybrid Dynamic KPI Strategy.
   *
   * Invariant: all current production KPIs must be 'production_evaluation'.
   * New KPIs start at 'draft' or 'pilot_tracking'.
   * Only 'production_evaluation' KPIs are processed by evaluation engines.
   *
   * The legacy adapter (legacyEntryAdapter.ts) strips any KPI that is not
   * 'production_evaluation' from the engine input — protecting all
   * evaluation, ranking, and Executive BI outputs.
   */
  lifecycleStage: KpiLifecycleStage

  // ── Field resolution (Phase 4B) ────────────────────────────────
  /**
   * Firestore document field name for the actual (measured) value.
   * For aliased KPIs, this equals the engine key (aliasFor ?? key).
   * Examples: wasfaty→'wasfaty', omnihealth→'omni', wellnessCard→'wellness'
   */
  actualField?: string

  /**
   * Firestore document field name for the monthly target value.
   * Examples: wasfaty→'wasfatyTarget', crossSelling→'crossSellTarget'
   */
  targetField?: string

  /** Per-KPI achievement cap. Defaults to global ACHIEVEMENT_CAP (200) when absent. */
  defaultCap?: number

  /** Icon key for UI display (e.g. 'pill', 'heart', 'trending-up') */
  icon?: string

  /** Hex accent color for KPI branding */
  colorHex?: string

  /** Taxonomy tags for grouping, filtering, and admin search */
  tags?: string[]
}

// ── Registry ──────────────────────────────────────────────────

/**
 * A complete KPI registry — a flat map of business key → KpiDefinition.
 * The registry is the single source of truth for all KPI configuration.
 */
export type KpiRegistry = Record<string, KpiDefinition>

// ── Alias map type ────────────────────────────────────────────

/**
 * Maps business registry key → engine key for KPIs that have aliases.
 * Used by Phase 4C-0B engine integration to translate KPI reads/writes.
 */
export type KpiAliasMap = Record<string, string>

// ── Pure utility functions ────────────────────────────────────

/** Get all active KPIs sorted by sortOrder */
export function getActiveKpis(registry: KpiRegistry): KpiDefinition[] {
  return Object.values(registry)
    .filter((kpi) => kpi.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Get all core KPIs sorted by sortOrder */
export function getCoreKpis(registry: KpiRegistry): KpiDefinition[] {
  return Object.values(registry)
    .filter((kpi) => kpi.isCore)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Get KPIs enabled for a specific platform surface */
export function getKpisForSurface(
  registry: KpiRegistry,
  surface: keyof KpiVisibility,
): KpiDefinition[] {
  return Object.values(registry)
    .filter((kpi) => kpi.isActive && kpi.visibility[surface])
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Build the alias map from a registry.
 * Returns { businessKey: engineKey } for all entries that have aliasFor set.
 */
export function buildAliasMap(registry: KpiRegistry): KpiAliasMap {
  return Object.fromEntries(
    Object.values(registry)
      .filter((kpi) => kpi.aliasFor != null)
      .map((kpi) => [kpi.key, kpi.aliasFor!]),
  )
}

/**
 * Resolve a business key to its engine key.
 * Returns the engineKey if aliasFor is set, otherwise returns the key itself.
 */
export function resolveEngineKey(kpi: KpiDefinition): string {
  return kpi.aliasFor ?? kpi.key
}

/**
 * Validate that all active production-evaluation KPI weights sum to 1.0
 * (±0.01 tolerance).
 *
 * Core KPI Dependency Removal — Stage G: no longer an isCore-only check —
 * any active production_evaluation KPI's weight counts toward the
 * invariant, ordinary registry KPIs included. Byte-identical for the
 * default registry today (every non-Core production KPI has weight 0).
 */
export function validateWeights(registry: KpiRegistry): boolean {
  const total = Object.values(registry)
    .filter((kpi) => kpi.isActive && (kpi.lifecycleStage ?? 'production_evaluation') === 'production_evaluation')
    .reduce((sum, kpi) => sum + kpi.weight, 0)
  return Math.abs(total - 1.0) <= 0.01
}

/**
 * Get the primary KPI from the registry.
 * Returns the KpiDefinition where isPrimary === true.
 *
 * Invariant: exactly one active KPI should have isPrimary === true.
 * Falls back to the first active core KPI if none is flagged — this
 * matches current production behaviour (wasfaty is first in sortOrder).
 *
 * Phase 1A: informational only — the engine does not yet read this value.
 */
export function getPrimaryKpi(registry: KpiRegistry): KpiDefinition | undefined {
  return (
    Object.values(registry).find((kpi) => kpi.isPrimary && kpi.isActive) ??
    Object.values(registry)
      .filter((kpi) => kpi.isActive && kpi.isCore)
      .sort((a, b) => a.sortOrder - b.sortOrder)[0]
  )
}

/**
 * Validate thresholds: healthy >= watch >= risk >= critical, all in 0..200.
 */
export function validateThresholds(def: KpiDefinition): boolean {
  const { healthy, watch, risk, critical } = def.thresholds
  return (
    healthy  >= 0 && healthy  <= 200 &&
    watch    >= 0 && watch    <= 200 &&
    risk     >= 0 && risk     <= 200 &&
    critical >= 0 && critical <= 200 &&
    healthy  >= watch &&
    watch    >= risk  &&
    risk     >= critical
  )
}

// ── Lifecycle utility functions ───────────────────────────────
//
// Pure predicate functions for KPI lifecycle stage checks.
// Used by the legacy adapter and UI badge system to determine
// how a KPI should be treated by each platform layer.

/** True when a KPI is part of official evaluation — affects scores and rankings. */
export function isProductionEvaluationKpi(kpi: KpiDefinition): boolean {
  return kpi.lifecycleStage === 'production_evaluation'
}

/** True when a KPI is in pilot mode — collected but not evaluated. */
export function isPilotTrackingKpi(kpi: KpiDefinition): boolean {
  return kpi.lifecycleStage === 'pilot_tracking'
}

/** True when a KPI is in shadow evaluation — processed by V2 only. */
export function isShadowEvaluationKpi(kpi: KpiDefinition): boolean {
  return kpi.lifecycleStage === 'shadow_evaluation'
}

/** True when a KPI has been archived — historical data preserved, not collected. */
export function isArchivedKpi(kpi: KpiDefinition): boolean {
  return kpi.lifecycleStage === 'archived'
}

/**
 * Allowed lifecycle transitions for the Hybrid Dynamic KPI Strategy.
 *
 * The transition table enforces the governance rules from the architecture
 * design. Blocked transitions protect evaluation integrity — specifically,
 * no KPI can reach production_evaluation without passing through
 * shadow_evaluation first.
 *
 * ALLOWED:
 *   draft               → pilot_tracking          (activate for collection)
 *   draft               → archived                (decide against before collection)
 *   pilot_tracking      → shadow_evaluation       (standard promotion)
 *   pilot_tracking      → archived                (pilot discontinued)
 *   shadow_evaluation   → production_evaluation   (formal GO/NO-GO sign-off)
 *   shadow_evaluation   → pilot_tracking          (demote if shadow results concerning)
 *   production_evaluation → archived              (KPI sunset with approval)
 *   archived            → pilot_tracking          (re-activation as new pilot)
 *
 * BLOCKED:
 *   pilot_tracking      → production_evaluation   (must pass shadow first)
 *   draft               → production_evaluation   (must pass pilot + shadow)
 *   draft               → shadow_evaluation       (must be collected first)
 *   production_evaluation → draft                 (data integrity risk)
 *   production_evaluation → pilot_tracking        (data integrity risk)
 *   production_evaluation → shadow_evaluation     (already in production)
 *   archived            → production_evaluation   (must restart from pilot)
 *   archived            → draft                   (archived is terminal except re-pilot)
 *   archived            → shadow_evaluation       (must restart from pilot)
 */
export function canTransitionKpiLifecycle(
  from: KpiLifecycleStage,
  to:   KpiLifecycleStage,
): boolean {
  if (from === to) return false  // no-op transitions not allowed

  const ALLOWED: Partial<Record<KpiLifecycleStage, KpiLifecycleStage[]>> = {
    draft:                ['pilot_tracking', 'archived'],
    pilot_tracking:       ['shadow_evaluation', 'archived'],
    shadow_evaluation:    ['production_evaluation', 'pilot_tracking'],
    production_evaluation:['archived'],
    archived:             ['pilot_tracking'],
  }

  return ALLOWED[from]?.includes(to) ?? false
}
