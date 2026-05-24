// ============================================================
// KPI Registry Adapter
// Bridges the KPI Registry (business keys) to the KPI Engine
// (internal field keys) in both directions.
//
// Direction A — Registry → Engine (input path):
//   omnihealth → omni, wellnessCard → wellness, rest unchanged
//   Used when: building KpiEntry/MonthlyTarget for the engine
//
// Direction B — Engine → Registry (output path):
//   omni → omnihealth, wellness → wellnessCard, rest unchanged
//   Used when: presenting engine results in the UI layer
//
// Pure functions only — no Firestore, no React, no side effects.
// Existing engine calculations are NOT modified.
// ============================================================

import {
  DEFAULT_KPI_REGISTRY,
  KPI_ENGINE_ALIAS_MAP,
  KPI_ENGINE_REVERSE_MAP,
  DEFAULT_ACTIVE_KPI_KEYS,
  DEFAULT_CORE_ENGINE_KEYS,
} from './defaultKpiRegistry'

import type { KpiRegistry, KpiDefinition } from './kpiRegistryTypes'

// ── Re-exported for convenience ────────────────────────────────
export type { KpiDefinition }

// ── Internal engine key set (the existing KpiKey union values) ─
const ENGINE_KEY_SET = new Set(DEFAULT_CORE_ENGINE_KEYS)

// ══════════════════════════════════════════════════════════════
// SECTION 1 — KEY TRANSLATION
// ══════════════════════════════════════════════════════════════

/**
 * Translate a business/registry key to its engine key.
 *
 * - 'omnihealth'   → 'omni'
 * - 'wellnessCard' → 'wellness'
 * - anything else  → unchanged (key IS the engine key)
 *
 * @param kpiKey - Registry key or engine key
 * @returns Engine key safe to use with kpiAnalyticsEngine
 *
 * @example
 * toEngineKey('omnihealth')   // → 'omni'
 * toEngineKey('wasfaty')      // → 'wasfaty'
 * toEngineKey('unknownKey')   // → 'unknownKey' (pass-through)
 */
export function toEngineKey(kpiKey: string): string {
  return KPI_ENGINE_ALIAS_MAP[kpiKey] ?? kpiKey
}

/**
 * Translate an engine key back to its registry/business key.
 *
 * - 'omni'     → 'omnihealth'
 * - 'wellness' → 'wellnessCard'
 * - anything else → unchanged
 *
 * @param engineKey - Internal engine key (KpiKey type value)
 * @returns Registry key for use in UI and business logic
 *
 * @example
 * toRegistryKey('omni')      // → 'omnihealth'
 * toRegistryKey('basket')    // → 'basket'
 * toRegistryKey('unknown')   // → 'unknown' (pass-through)
 */
export function toRegistryKey(engineKey: string): string {
  return KPI_ENGINE_REVERSE_MAP[engineKey] ?? engineKey
}

// ══════════════════════════════════════════════════════════════
// SECTION 2 — RECORD NORMALIZATION
// ══════════════════════════════════════════════════════════════

/**
 * Normalize a KPI record that may use registry keys, engine keys,
 * or a mix of both into a canonical engine-keyed record.
 *
 * Input:  { omnihealth: 150, wellnessCard: 80, wasfaty: 200 }
 * Output: { omni: 150, wellness: 80, wasfaty: 200 }
 *
 * Rules:
 *   - Registry keys are translated to their engine key via KPI_ENGINE_ALIAS_MAP
 *   - Engine keys and unknown keys are passed through unchanged
 *   - When both the registry key AND engine key are present for the same KPI,
 *     the registry key's value wins (more specific / business intent)
 *   - Zero/falsy values are preserved — no silent dropping
 *
 * @param record - Any key-value map of KPI values
 * @returns New record with engine keys
 */
export function normalizeKpiRecord(record: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {}

  // Pass through all existing entries, translating keys
  for (const [key, value] of Object.entries(record)) {
    const engineKey = toEngineKey(key)
    // Registry key wins over engine key if both are present
    // (set engine key first, then registry key overwrites if present)
    if (!(engineKey in result) || key !== engineKey) {
      result[engineKey] = value
    }
  }

  return result
}

/**
 * Normalize a KPI record from engine keys back to registry keys.
 *
 * Input:  { omni: 150, wellness: 80, wasfaty: 200 }
 * Output: { omnihealth: 150, wellnessCard: 80, wasfaty: 200 }
 *
 * @param record - Engine-keyed KPI values
 * @returns New record with registry keys
 */
export function denormalizeKpiRecord(record: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [key, value] of Object.entries(record)) {
    result[toRegistryKey(key)] = value
  }
  return result
}

// ══════════════════════════════════════════════════════════════
// SECTION 3 — KEY ENUMERATION
// ══════════════════════════════════════════════════════════════

/**
 * Get the list of KPI keys in engine format (for use with kpiAnalyticsEngine).
 * Resolves aliases so the result is always compatible with KpiKey.
 *
 * Returns the existing engine key order:
 *   ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
 *
 * This order is stable and matches KPI_KEYS in kpiAnalyticsEngine.ts.
 */
export function getEngineCompatibleKpiKeys(): string[] {
  return [...DEFAULT_CORE_ENGINE_KEYS]
}

/**
 * Get the list of all active KPI keys in registry format (business keys).
 * These are the keys that appear in the UI and business logic layer.
 *
 * Returns:
 *   ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling',
 *    'sales', 'sl', 'ndf', 'inbody', 'liberation']
 */
export function getRegistryCompatibleKpiKeys(
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): string[] {
  return [...DEFAULT_ACTIVE_KPI_KEYS]
}

// ══════════════════════════════════════════════════════════════
// SECTION 4 — TARGET CONVERSION
// ══════════════════════════════════════════════════════════════

/**
 * Registry-keyed target shape (business-facing).
 * Extends the engine MonthlyTarget to support both key forms.
 */
export interface RegistryTarget {
  pharmacyId:   string
  month:        string
  // Core KPIs — registry keys
  wasfaty?:     number
  omnihealth?:  number   // business name for engine 'omni'
  wellnessCard?: number  // business name for engine 'wellness'
  basket?:      number
  crossSelling?: number
  // Non-core active KPIs
  sales?:       number
  sl?:          number
  ndf?:         number
  inbody?:      number
  liberation?:  number
  // Allow arbitrary additional registry keys
  [key: string]: unknown
}

/**
 * Engine-compatible target shape (matches MonthlyTarget in kpiAnalyticsEngine).
 */
export interface EngineTarget {
  pharmacyId:       string
  month:            string
  wasfatyTarget:    number
  omniTarget:       number
  wellnessTarget:   number
  basketTarget:     number
  crossSellTarget:  number
  salesTarget?:     number
}

/**
 * Convert a registry-keyed target to an engine-compatible MonthlyTarget.
 *
 * Handles both naming conventions:
 *   omnihealth → omniTarget
 *   omni       → omniTarget   (already engine key)
 *   wellnessCard → wellnessTarget
 *   wellness     → wellnessTarget (already engine key)
 *
 * Missing values default to 0 (never NaN, never undefined in output).
 *
 * @param target - Registry-keyed target document
 * @returns Engine-compatible MonthlyTarget object
 */
export function mapRegistryTargetsToEngineTargets(target: RegistryTarget): EngineTarget {
  // Resolve omni value: prefer omnihealth (registry key), fall back to omni (engine key)
  const omniVal    = safeNum(target.omnihealth) || safeNum(target['omni'] as number)
  // Resolve wellness value: prefer wellnessCard, fall back to wellness
  const wellnessVal = safeNum(target.wellnessCard) || safeNum(target['wellness'] as number)

  return {
    pharmacyId:      target.pharmacyId,
    month:           target.month,
    wasfatyTarget:   safeNum(target.wasfaty),
    omniTarget:      omniVal,
    wellnessTarget:  wellnessVal,
    basketTarget:    safeNum(target.basket),
    crossSellTarget: safeNum(target.crossSelling),
    // salesTarget is optional in MonthlyTarget
    ...(target.sales != null ? { salesTarget: safeNum(target.sales) } : {}),
  }
}

/**
 * Convert an engine-compatible target back to registry key form.
 *
 * Useful when reading Firestore MonthlyTarget documents and surfacing
 * them in the UI under business key names.
 *
 * @param engineTarget - MonthlyTarget from Firestore / engine layer
 * @returns Registry-keyed target object
 */
export function mapEngineTargetsToRegistryTargets(
  engineTarget: EngineTarget,
): RegistryTarget {
  return {
    pharmacyId:   engineTarget.pharmacyId,
    month:        engineTarget.month,
    wasfaty:      engineTarget.wasfatyTarget,
    omnihealth:   engineTarget.omniTarget,      // omniTarget → omnihealth
    wellnessCard: engineTarget.wellnessTarget,  // wellnessTarget → wellnessCard
    basket:       engineTarget.basketTarget,
    crossSelling: engineTarget.crossSellTarget,
    ...(engineTarget.salesTarget != null ? { sales: engineTarget.salesTarget } : {}),
  }
}

// ══════════════════════════════════════════════════════════════
// SECTION 5 — RESULT MAPPING
// ══════════════════════════════════════════════════════════════

/**
 * KPI result record keyed by engine keys.
 * Shape returned by most engine calculations.
 */
export type EngineKpiResults = Record<string, number | string | object>

/**
 * KPI result record keyed by registry/business keys.
 * Shape expected by the UI and business logic layer.
 */
export type RegistryKpiResults = Record<string, number | string | object>

/**
 * Map engine output results to registry key form.
 *
 * Works on any Record<string, T> — translates keys, preserves values.
 *
 * Input:  { omni: 150, wellness: 80, basket: 120, ... }
 * Output: { omnihealth: 150, wellnessCard: 80, basket: 120, ... }
 *
 * @param engineResults - Results keyed by engine KPI keys
 * @returns Same results keyed by registry/business keys
 */
export function mapEngineResultsToRegistryResults<T extends object>(
  engineResults: Record<string, T>,
): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [key, value] of Object.entries(engineResults)) {
    out[toRegistryKey(key)] = value
  }
  return out
}

/**
 * Map registry-keyed results to engine key form.
 *
 * Input:  { omnihealth: {...}, wellnessCard: {...}, ... }
 * Output: { omni: {...}, wellness: {...}, ... }
 *
 * @param registryResults - Results keyed by registry/business keys
 * @returns Same results keyed by engine keys
 */
export function mapRegistryResultsToEngineResults<T extends object>(
  registryResults: Record<string, T>,
): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [key, value] of Object.entries(registryResults)) {
    out[toEngineKey(key)] = value
  }
  return out
}

// ══════════════════════════════════════════════════════════════
// SECTION 6 — SAFETY VALIDATION
// ══════════════════════════════════════════════════════════════

/**
 * Check whether a key (registry or engine) is known to the adapter.
 * Returns true for any active registry key or its engine alias.
 */
export function isKnownKpiKey(
  key: string,
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): boolean {
  // Direct registry key match
  if (key in registry) return true
  // Engine key match (key is an alias target)
  if (ENGINE_KEY_SET.has(key)) return true
  // Reverse alias match (key is an engine key for a registry entry)
  if (key in KPI_ENGINE_REVERSE_MAP) return true
  return false
}

/**
 * Safely look up a KpiDefinition by either registry key or engine key.
 * Returns undefined for unknown keys rather than throwing.
 *
 * @param key - Registry key or engine key
 * @param registry - Registry to search (defaults to DEFAULT_KPI_REGISTRY)
 */
export function findKpiDefinition(
  key: string,
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): KpiDefinition | undefined {
  // Direct registry key lookup
  if (key in registry) return registry[key]
  // Engine key lookup via reverse map
  const registryKey = KPI_ENGINE_REVERSE_MAP[key]
  if (registryKey && registryKey in registry) return registry[registryKey]
  return undefined
}

// ══════════════════════════════════════════════════════════════
// SECTION 7 — INTERNAL HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Safely coerce a value to a number.
 * Returns 0 for NaN, Infinity, null, undefined, or non-numeric strings.
 */
function safeNum(val: number | string | null | undefined): number {
  const n = Number(val ?? 0)
  return isNaN(n) || !isFinite(n) ? 0 : n
}
