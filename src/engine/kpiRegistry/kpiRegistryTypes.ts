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
}

// ── Registry map ──────────────────────────────────────────────

/** The full KPI registry: business key → KpiDefinition */
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
 * Validate that all active core KPI weights sum to 1.0 (±0.01 tolerance).
 */
export function validateWeights(registry: KpiRegistry): boolean {
  const total = Object.values(registry)
    .filter((kpi) => kpi.isActive && kpi.isCore)
    .reduce((sum, kpi) => sum + kpi.weight, 0)
  return Math.abs(total - 1.0) <= 0.01
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
