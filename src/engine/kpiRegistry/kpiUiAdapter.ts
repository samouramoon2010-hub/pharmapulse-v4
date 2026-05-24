// ============================================================
// KPI UI Adapter
// Converts KpiDefinition[] from the registry into render-ready
// UI configuration objects for forms, tables, and display.
//
// Pure functions only — no React, no Firestore, no side effects.
// All engine key resolution uses kpiRegistryAdapter helpers.
// ============================================================

import {
  DEFAULT_KPI_REGISTRY,
  DEFAULT_ACTIVE_KPI_KEYS,
} from './defaultKpiRegistry'

import {
  getActiveKpis,
  getKpisForSurface,
} from './kpiRegistryTypes'

import {
  toEngineKey,
  mapRegistryTargetsToEngineTargets,
} from './kpiRegistryAdapter'

import type { KpiDefinition, KpiRegistry, KpiVisibility } from './kpiRegistryTypes'
import type { EngineTarget, RegistryTarget } from './kpiRegistryAdapter'

// ══════════════════════════════════════════════════════════════
// SECTION 1 — KPI STATUS MODEL
// ══════════════════════════════════════════════════════════════

/**
 * Lifecycle status for a KPI in the registry.
 * Governs form visibility and historical readability.
 *
 * ACTIVE        — displayed and editable in all enabled surfaces
 * ARCHIVED      — hidden from new input forms; still readable for
 *                 historical display and existing Firestore documents
 * HIDDEN_FROM_INPUT — collected in background, not shown in target forms
 *
 * No KPI definition is ever deleted — only status-changed.
 * Management UI to be built in a later phase.
 */
export type KpiUiStatus = 'ACTIVE' | 'ARCHIVED' | 'HIDDEN_FROM_INPUT'

// ══════════════════════════════════════════════════════════════
// SECTION 2 — TARGET INPUT SURFACE
// ══════════════════════════════════════════════════════════════

/**
 * Extended visibility that adds target-input control.
 * targetInputEnabled = true means the KPI should appear
 * in the Monthly Target form.
 *
 * For backward compatibility this is derived from:
 *   isActive && isCore → always target-input enabled (core KPIs)
 *   isActive && !isCore → targetInputEnabled = false (collected but not targeted)
 * This can be overridden per-KPI in a future admin UI.
 */
function isTargetInputEnabled(kpi: KpiDefinition): boolean {
  // Core KPIs always appear in target forms
  if (kpi.isCore) return true
  // Non-core KPIs: check the explicit targetInputEnabled flag on visibility
  // Allows admin to enable target input for custom non-core KPIs via KpiEditorModal
  if (kpi.visibility.targetInputEnabled === true) return true
  return false
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — TARGET FIELD NAME MAPPING
// ══════════════════════════════════════════════════════════════

/**
 * Map from registry key → Firestore target field name.
 * Must exactly match MonthlyTarget interface in kpiAnalyticsEngine.ts.
 *
 * This is the canonical source of truth for target field names.
 * Used by both the form (reading/writing state) and the adapter
 * (building the Firestore payload).
 */
const TARGET_FIELD_MAP: Record<string, string> = {
  // Core KPIs — engine keys (same as registry key where no alias)
  wasfaty:      'wasfatyTarget',
  omnihealth:   'omniTarget',      // registry key → omniTarget (via omni alias)
  wellnessCard: 'wellnessTarget',  // registry key → wellnessTarget (via wellness alias)
  basket:       'basketTarget',
  crossSelling: 'crossSellTarget',
  // Non-core active KPIs (available when targetInputEnabled)
  sales:        'salesTarget',
  sl:           'slTarget',
  ndf:          'ndfTarget',
  inbody:       'inbodyTarget',
  liberation:   'liberationTarget',
} as const

/**
 * Get the Firestore target field name for a registry key.
 * Falls back to `${engineKey}Target` if not in the explicit map.
 */
export function getTargetFieldName(registryKey: string): string {
  return TARGET_FIELD_MAP[registryKey] ?? `${toEngineKey(registryKey)}Target`
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — UI CONFIG SHAPE
// ══════════════════════════════════════════════════════════════

/**
 * Render-ready UI configuration for a single KPI.
 * Consumed by form fields, table columns, and display chips.
 */
export interface KpiUiConfig {
  // ── Identity ───────────────────────────────────────────────
  /** Registry key (business-facing) */
  key:             string

  /** Resolved engine key (for KpiEntry/engine operations) */
  engineKey:       string

  /** Firestore target document field name */
  targetFieldName: string

  // ── Labels ─────────────────────────────────────────────────
  label:       string
  shortLabel:  string
  labelAr:     string

  // ── Value semantics ────────────────────────────────────────
  unit:         string
  unitAr:       string
  valueType:    KpiDefinition['valueType']

  /**
   * Decimal places for display.
   * currency → 2, percentage → 1, count/number → 0
   */
  precision:     number

  /**
   * Format pattern for display libraries.
   * 'number' | 'currency_sar' | 'percent_0' | 'percent_1'
   */
  displayFormat: string

  // ── Form configuration ─────────────────────────────────────
  /** Placeholder text for target input fields */
  inputPlaceholder: string

  /** Short hint shown below the input */
  inputHint:        string

  /** Whether a non-zero value is required for form validation */
  isRequired:       boolean

  /** Whether this KPI appears in the Monthly Target form */
  isVisibleForTargetInput: boolean

  // ── Grouping ───────────────────────────────────────────────
  category:   KpiDefinition['category']

  /** Display section label for grouping in complex forms */
  uiSection:  string

  /** Stable 1-based position in the target form */
  inputOrder: number

  // ── Status ─────────────────────────────────────────────────
  uiStatus:   KpiUiStatus
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — PRECISION & FORMAT DERIVATION
// ══════════════════════════════════════════════════════════════

function derivePrecision(kpi: KpiDefinition): number {
  switch (kpi.valueType) {
    case 'currency':    return 2
    case 'percentage':  return 1
    default:            return 0   // count / number
  }
}

function deriveDisplayFormat(kpi: KpiDefinition): string {
  switch (kpi.valueType) {
    case 'currency':    return 'currency_sar'
    case 'percentage':  return 'percent_1'
    default:            return 'number'
  }
}

const SECTION_LABELS: Record<KpiDefinition['category'], string> = {
  prescription:   'Prescription',
  digital:        'Digital Health',
  wellness:       'Wellness',
  commercial:     'Commercial',
  operational:    'Operational',
  health_program: 'Health Programmes',
}

function deriveUiSection(kpi: KpiDefinition): string {
  return SECTION_LABELS[kpi.category] ?? kpi.category
}

function deriveInputHint(kpi: KpiDefinition): string {
  switch (kpi.valueType) {
    case 'currency':   return `Monthly target in ${kpi.unit}`
    case 'percentage': return `Target percentage (0–100)`
    default:           return `Monthly target in ${kpi.unit}`
  }
}

function deriveInputPlaceholder(kpi: KpiDefinition): string {
  switch (kpi.valueType) {
    case 'currency':   return '0.00'
    case 'percentage': return '0'
    default:           return '0'
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — CORE CONVERTER
// ══════════════════════════════════════════════════════════════

/**
 * Convert a single KpiDefinition to a KpiUiConfig.
 * inputOrder is 1-based position within the target form's active list.
 */
export function toKpiUiConfig(
  kpi:        KpiDefinition,
  inputOrder: number,
): KpiUiConfig {
  const engineKey       = kpi.aliasFor ?? kpi.key
  const targetFieldName = getTargetFieldName(kpi.key)
  const targetEnabled   = isTargetInputEnabled(kpi)

  return {
    key:             kpi.key,
    engineKey,
    targetFieldName,
    label:           kpi.label,
    shortLabel:      kpi.shortLabel,
    labelAr:         kpi.labelAr,
    unit:            kpi.unit,
    unitAr:          kpi.unitAr,
    valueType:       kpi.valueType,
    precision:       derivePrecision(kpi),
    displayFormat:   deriveDisplayFormat(kpi),
    inputPlaceholder: deriveInputPlaceholder(kpi),
    inputHint:       deriveInputHint(kpi),
    isRequired:      kpi.isCore,
    isVisibleForTargetInput: kpi.isActive && targetEnabled,
    category:        kpi.category,
    uiSection:       deriveUiSection(kpi),
    inputOrder,
    uiStatus:        kpi.isActive ? 'ACTIVE' : 'ARCHIVED',
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Get render-ready UI configs for the Monthly Target form.
 * Returns only KPIs where isVisibleForTargetInput = true,
 * sorted by inputOrder.
 *
 * Replaces the hardcoded KPI_FIELDS array in TargetsPage.jsx.
 *
 * @param registry - Registry to use (defaults to DEFAULT_KPI_REGISTRY)
 * @returns Ordered array of KpiUiConfig for target input rendering
 *
 * @example
 * const configs = getTargetInputConfigs()
 * // → [{ key:'wasfaty', targetFieldName:'wasfatyTarget', label:'Wasfaty', ... }, ...]
 * configs.map(cfg => renderTargetInput(cfg))
 */
export function getTargetInputConfigs(
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): KpiUiConfig[] {
  const activeKpis = getActiveKpis(registry)
  let order = 0
  return activeKpis
    .map((kpi) => {
      order++
      return toKpiUiConfig(kpi, order)
    })
    .filter((cfg) => cfg.isVisibleForTargetInput)
    .sort((a, b) => a.inputOrder - b.inputOrder)
}

/**
 * Get UI configs for all active KPIs on a specific surface.
 *
 * @param surface  - Visibility surface key
 * @param registry - Registry to use (defaults to DEFAULT_KPI_REGISTRY)
 */
export function getKpiUiConfigsForSurface(
  surface:  keyof KpiVisibility,
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): KpiUiConfig[] {
  const surfaceKpis = getKpisForSurface(registry, surface)
  return surfaceKpis.map((kpi, idx) => toKpiUiConfig(kpi, idx + 1))
}

/**
 * Get a single KpiUiConfig by registry key or engine key.
 * Returns undefined for unknown keys.
 */
export function getKpiUiConfig(
  key:      string,
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): KpiUiConfig | undefined {
  // Direct registry key
  if (key in registry) {
    const kpi = registry[key]
    const order = DEFAULT_ACTIVE_KPI_KEYS.indexOf(key) + 1
    return toKpiUiConfig(kpi, order)
  }
  // Engine key lookup — find registry entry whose aliasFor matches
  const entry = Object.values(registry).find((k) => k.aliasFor === key)
  if (entry) {
    const order = DEFAULT_ACTIVE_KPI_KEYS.indexOf(entry.key) + 1
    return toKpiUiConfig(entry, order)
  }
  return undefined
}

// ══════════════════════════════════════════════════════════════
// SECTION 8 — TARGET PAYLOAD BUILDER
// ══════════════════════════════════════════════════════════════

/**
 * Build a Firestore-ready MonthlyTarget payload from a form state
 * object that uses registry field names (targetFieldName values).
 *
 * The form state object is keyed by targetFieldName (e.g. 'wasfatyTarget')
 * so it's already in the right shape for Firestore.
 *
 * Shadow check: this function should produce the same payload as the
 * old hardcoded saveTarget() calls in TargetsPage.jsx.
 *
 * @param pharmacyId - Pharmacy document ID
 * @param month      - 'yyyy-MM' string
 * @param formValues - { [targetFieldName]: number } from form state
 * @param configs    - Target input configs (from getTargetInputConfigs)
 * @returns Engine-compatible target payload
 */
export function buildTargetPayload(
  pharmacyId: string,
  month:      string,
  formValues: Record<string, number>,
  configs:    KpiUiConfig[],
): EngineTarget {
  const registryTarget: RegistryTarget = { pharmacyId, month }

  for (const cfg of configs) {
    const rawValue = formValues[cfg.targetFieldName] ?? 0
    const value    = isNaN(rawValue) ? 0 : Math.max(0, Number(rawValue))
    // Map targetFieldName back to registry key for the adapter
    // e.g. 'wasfatyTarget' → 'wasfaty', 'omniTarget' → 'omnihealth'
    registryTarget[cfg.key] = value
  }

  return mapRegistryTargetsToEngineTargets(registryTarget)
}

/**
 * Build the initial form state for a target form from an existing
 * MonthlyTarget document (or empty defaults).
 *
 * Returns { [targetFieldName]: number } keyed by targetFieldName.
 *
 * @param existing - Existing MonthlyTarget document or null
 * @param configs  - Target input configs
 */
export function buildFormInitialState(
  existing: Record<string, unknown> | null,
  configs:  KpiUiConfig[],
): Record<string, number> {
  const state: Record<string, number> = {}
  for (const cfg of configs) {
    const raw = existing?.[cfg.targetFieldName] ?? 0
    state[cfg.targetFieldName] = isNaN(Number(raw)) ? 0 : Number(raw)
  }
  return state
}

// ══════════════════════════════════════════════════════════════
// SECTION 9 — SHADOW COMPARISON
// ══════════════════════════════════════════════════════════════

/**
 * Shadow comparison utility.
 * Verifies that the registry-driven target payload matches the
 * legacy hardcoded payload for existing active core KPIs.
 *
 * Returns true when the payloads are equivalent (same field names
 * and values for all fields present in the legacy format).
 *
 * Used in tests to guarantee backward compatibility.
 */
export function shadowComparePayloads(
  legacy:       Record<string, unknown>,
  registryDriven: Record<string, unknown>,
): { matches: boolean; diffs: string[] } {
  const CORE_FIELDS = [
    'pharmacyId', 'month',
    'wasfatyTarget', 'omniTarget', 'wellnessTarget',
    'basketTarget', 'crossSellTarget',
  ]

  const diffs: string[] = []
  for (const field of CORE_FIELDS) {
    if (legacy[field] !== registryDriven[field]) {
      diffs.push(`${field}: legacy=${legacy[field]}, registry=${registryDriven[field]}`)
    }
  }

  return { matches: diffs.length === 0, diffs }
}
