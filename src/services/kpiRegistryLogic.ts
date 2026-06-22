// ============================================================
// KPI Registry Logic — pure functions, no Firebase
// Extracted from kpiRegistryService.ts for testability.
// ============================================================

import { DEFAULT_KPI_REGISTRY, KPI_ENGINE_REVERSE_MAP } from '../engine/kpiRegistry'
import type { KpiDefinition, KpiRegistry } from '../engine/kpiRegistry'
import type { KpiUiStatus } from '../engine/kpiRegistry'

/** Protected core KPI keys — cannot be archived via service */
export const PROTECTED_CORE_KEYS = new Set([
  'wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling',
])

/**
 * Merge a remote Firestore registry snapshot with the default registry.
 * Pure function — no side effects.
 */
export function mergeRemoteRegistryWithDefaults(
  remote: KpiRegistry,
): KpiRegistry {
  const merged: KpiRegistry = { ...DEFAULT_KPI_REGISTRY }
  for (const [key, def] of Object.entries(remote)) {
    if (!def.key || !def.label) continue
    merged[key] = def
  }
  return merged
}

/**
 * Convert a Firestore document to a KpiDefinition + uiStatus.
 * Safe for unknown/partial documents.
 */
export function docToKpiDefinition(
  data: Record<string, unknown>,
): { def: KpiDefinition; uiStatus: KpiUiStatus } | null {
  try {
    if (!data.key || !data.label) return null
    const uiStatus = (data.uiStatus as KpiUiStatus) ?? (data.isActive ? 'ACTIVE' : 'ARCHIVED')
    const def: KpiDefinition = {
      key:        String(data.key),
      label:      String(data.label),
      shortLabel: String(data.shortLabel ?? data.label),
      labelAr:    String(data.labelAr ?? ''),
      // aliasFor: persisted in Firestore so engineKey resolution survives edits.
      // omnihealth.aliasFor = 'omni', wellnessCard.aliasFor = 'wellness'.
      // Must be read back to prevent entry field name regression after any edit.
      ...(data.aliasFor != null ? { aliasFor: String(data.aliasFor) } : {}),
      category:   (data.category as KpiDefinition['category']) ?? 'commercial',
      valueType:  (data.valueType as KpiDefinition['valueType']) ?? 'count',
      unit:       String(data.unit ?? 'units'),
      unitAr:     String(data.unitAr ?? 'وحدة'),
      direction:  (data.direction as KpiDefinition['direction']) ?? 'higher_is_better',
      targetType: (data.targetType as KpiDefinition['targetType']) ?? 'absolute',
      weight:     Number(data.weight ?? 0),
      isActive:   Boolean(data.isActive ?? true),
      isCore:     Boolean(data.isCore ?? false),
      thresholds: {
        healthy:  Number(data.thresholdHealthy  ?? 90),
        watch:    Number(data.thresholdWatch    ?? 75),
        risk:     Number(data.thresholdRisk     ?? 55),
        critical: Number(data.thresholdCritical ?? 35),
      },
      visibility: {
        dashboardEnabled:  Boolean(data.dashboardEnabled  ?? true),
        teamEnabled:       Boolean(data.teamEnabled       ?? false),
        executiveEnabled:  Boolean(data.executiveEnabled  ?? false),
        regionalEnabled:   Boolean(data.regionalEnabled   ?? false),
        targetInputEnabled: Boolean(data.targetInputEnabled ?? false),
      },
      sortOrder:   Number(data.sortOrder ?? 999),
      description: String(data.description ?? ''),
      // Lifecycle + governance fields (Milestone 1A / 3 / 3.5)
      // Default: 'production_evaluation' — all pre-existing KPIs are production
      // This default is critical: Firestore docs written before Milestone 3 have
      // no lifecycleStage field; we must not treat them as non-production KPIs.
      lifecycleStage: (data.lifecycleStage as KpiDefinition['lifecycleStage']) ?? 'production_evaluation',
      isPrimary:        Boolean(data.isPrimary ?? false),
      coachingAction:   String(data.coachingAction   ?? ''),
      coachingActionAr: String(data.coachingActionAr ?? ''),
    }
    return { def, uiStatus }
  } catch {
    return null
  }
}

/**
 * Build a Firestore document payload from a KpiDefinition.
 * Exported for testing (without serverTimestamp).
 */
export function buildDocPayloadSync(
  def:      KpiDefinition,
  uiStatus: KpiUiStatus,
  updatedBy: string,
): Record<string, unknown> {
  return {
    key:          def.key,
    label:        def.label,
    shortLabel:   def.shortLabel,
    labelAr:      def.labelAr,
    ...(def.aliasFor != null ? { aliasFor: def.aliasFor } : {}),
    category:     def.category,
    valueType:    def.valueType,
    unit:         def.unit,
    unitAr:       def.unitAr,
    direction:    def.direction,
    targetType:   def.targetType,
    weight:       def.weight,
    isActive:     uiStatus !== 'ARCHIVED',
    isCore:       def.isCore,
    uiStatus,
    thresholdHealthy:  def.thresholds.healthy,
    thresholdWatch:    def.thresholds.watch,
    thresholdRisk:     def.thresholds.risk,
    thresholdCritical: def.thresholds.critical,
    dashboardEnabled:   def.visibility.dashboardEnabled,
    teamEnabled:        def.visibility.teamEnabled,
    executiveEnabled:   def.visibility.executiveEnabled,
    regionalEnabled:    def.visibility.regionalEnabled,
    targetInputEnabled: def.visibility.targetInputEnabled ?? false,
    sortOrder: def.sortOrder ?? 999,
    // Lifecycle + governance fields (Milestone 3 / 3.5)
    lifecycleStage:   def.lifecycleStage   ?? 'production_evaluation',
    isPrimary:        def.isPrimary        ?? false,
    coachingAction:   def.coachingAction   ?? '',
    coachingActionAr: def.coachingActionAr ?? '',
    // UI metadata — preserved for display consistency
    description: def.description ?? '',
    updatedBy,
  }
}

// ══════════════════════════════════════════════════════════════
// KPI ENTRY PERSISTENCE SAFETY LAYER
// Pure functions — no Firebase, no side-effects.
// Used by kpiService.js to sanitize saveKpiEntry payloads.
// ══════════════════════════════════════════════════════════════

/**
 * sanitizeKpiValue — shared numeric value sanitizer.
 *
 * Single source of truth for KPI value coercion.
 * Used by both sanitizeKpiEntryFields() and buildKpiValuesMap()
 * to guarantee identical sanitization in both paths.
 *
 * Rules:
 *   undefined / null                → 0
 *   NaN / Infinity / -Infinity      → 0  (excluded — not a valid KPI reading)
 *   Symbol (un-coercible)           → 0
 *   non-numeric string (e.g. 'abc') → 0
 *   numeric string (e.g. '120')     → 120
 *   negative number                 → clamped to 0
 *   valid finite number             → returned as-is
 */
export function sanitizeKpiValue(raw: unknown): number {
  if (raw === undefined || raw === null) return 0
  // Symbol and other un-coercible types throw on Number() — catch them
  try {
    // Reject objects and arrays early
    if (typeof raw === 'object') return 0
    const n = Number(raw)
    if (!isFinite(n) || isNaN(n)) return 0
    // Clamp negative to 0 (match existing sanitizeKpiEntryFields behaviour)
    return Math.max(0, n)
  } catch {
    return 0
  }
}

/**
 * Metadata and system fields that must NEVER be treated as KPI values.
 * Any key in this set is skipped during KPI field sanitization.
 */
export const ENTRY_METADATA_FIELDS = new Set([
  // Identity
  'userId', 'pharmacyId', 'branchId', 'date', 'id', '__id',
  // Timestamps
  'createdAt', 'updatedAt', 'stagedAt', 'validatedAt', 'committedAt',
  // Ownership / audit
  'createdBy', 'submittedBy', 'actorId', 'actorRole',
  // Misc
  'notes', 'status', 'source', 'batchId', 'stagingId',
])

/**
 * Build the set of allowed KPI engine keys from the live registry.
 * Returns engine keys (aliasFor ?? key) for all active, dashboard-visible KPIs.
 *
 * This is the runtime allowlist for saveKpiEntry payloads.
 * Any key NOT in this set is rejected as unsafe.
 *
 * @param registry - Live merged registry (defaults to DEFAULT_KPI_REGISTRY)
 * @returns Set of safe engine key strings
 */
export function buildAllowedEntryKeys(registry: KpiRegistry = DEFAULT_KPI_REGISTRY): Set<string> {
  const keys = new Set<string>()
  for (const kpi of Object.values(registry)) {
    // Only active KPIs enter evaluation actuals
    if (!kpi.isActive) continue

    // Pre-Milestone 4 hardening: only production_evaluation KPIs may enter
    // official kpiActuals. Pilot, shadow, draft, and archived KPIs are excluded.
    //
    // Safe default for legacy Firestore docs written before lifecycleStage existed:
    // treat missing field as 'production_evaluation' (same default as docToKpiDefinition).
    // This preserves backward compatibility — existing production KPI entries continue
    // to be aggregated correctly even if their Firestore doc lacks the field.
    const stage = kpi.lifecycleStage ?? 'production_evaluation'
    if (stage !== 'production_evaluation') continue

    const engineKey = kpi.aliasFor ?? kpi.key
    keys.add(engineKey)
  }
  return keys
}

/**
 * Sanitize a raw KPI entry record into a safe Firestore payload.
 *
 * Rules:
 *   - Metadata fields (userId, pharmacyId, date, timestamps…) are passed through as-is
 *   - KPI value fields are validated: must be finite numbers, clamped ≥ 0
 *   - Strings are coerced: Number('5') → 5, Number('') || 0 → 0
 *   - NaN / Infinity / -Infinity are rejected (field excluded from payload)
 *   - Fields not in the registry allowlist AND not in metadata are excluded
 *   - Empty string KPI values become 0 (Number('') === 0 → 0)
 *
 * Backward compatible: wasfaty, omni, wellness, basket, crossSelling always
 * in the DEFAULT allowlist via DEFAULT_KPI_REGISTRY.
 *
 * @param raw      - Raw input object (from form or import)
 * @param registry - Live registry for allowed key resolution
 * @returns Clean { [engineKey]: number } KPI fields only (metadata excluded)
 */
export function sanitizeKpiEntryFields(
  raw:      Record<string, unknown>,
  registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): Record<string, number> {
  const allowedKeys = buildAllowedEntryKeys(registry)
  const result: Record<string, number> = {}

  for (const [key, rawValue] of Object.entries(raw)) {
    // Skip metadata fields — they are handled separately in the service
    if (ENTRY_METADATA_FIELDS.has(key)) continue

    // Skip keys not in the registry allowlist
    if (!allowedKeys.has(key)) continue

    // Reject null, undefined, objects, arrays — field excluded (not set to 0)
    if (rawValue === null || rawValue === undefined) continue
    if (typeof rawValue === 'object') continue

    // Coerce to number and validate — field excluded if not a valid finite number
    // (NaN, Infinity, non-numeric strings are excluded, not set to 0)
    // This matches the original behaviour: invalid fields are absent from result.
    let n: number
    try {
      n = Number(rawValue)
    } catch {
      continue
    }
    if (!isFinite(n) || isNaN(n)) continue

    // Use shared sanitizer for the final value (clamps negatives to 0)
    result[key] = sanitizeKpiValue(n)
  }

  return result
}

// ── buildKpiValuesMap ──────────────────────────────────────────

/**
 * buildKpiValuesMap
 *
 * Converts a flat { engineKey: number } map (output of sanitizeKpiEntryFields)
 * into the registry-keyed { registryKey: number } shape for the kpiValues
 * document field.
 *
 * Translation examples:
 *   omni        → omnihealth    (KPI_ENGINE_REVERSE_MAP)
 *   wellness    → wellnessCard  (KPI_ENGINE_REVERSE_MAP)
 *   wasfaty     → wasfaty       (no alias — direct)
 *   basket      → basket        (no alias — direct)
 *   crossSelling → crossSelling (no alias — direct)
 *
 * Uses the registry's KPI_ENGINE_REVERSE_MAP as the authoritative
 * alias source — no hardcoded alias literals here.
 *
 * Applies the same sanitizeKpiValue as sanitizeKpiEntryFields to
 * guarantee consistency between flat fields and kpiValues.
 *
 * Development assertion: in non-production builds, verifies that
 * the sanitized value for each production KPI is identical whether
 * accessed via the flat field or via kpiValues. Any drift is a bug.
 *
 * @param safeKpiValues - Output of sanitizeKpiEntryFields()
 *                        { [engineKey]: number } — already sanitized
 * @param _registry     - Reserved for future use (registry-driven alias resolution)
 * @returns { [registryKey]: number } — the kpiValues Firestore field
 */
export function buildKpiValuesMap(
  safeKpiValues: Record<string, number>,
  _registry: KpiRegistry = DEFAULT_KPI_REGISTRY,
): Record<string, number> {
  const result: Record<string, number> = {}

  for (const [engineKey, value] of Object.entries(safeKpiValues)) {
    // Resolve engine key → registry business key via the authoritative reverse map
    const registryKey = KPI_ENGINE_REVERSE_MAP[engineKey] ?? engineKey

    // Re-apply shared sanitizer for defense-in-depth
    // (safeKpiValues should already be clean, but this is a safety net)
    result[registryKey] = sanitizeKpiValue(value)
  }

  // Development assertion: verify no drift between engine values and registry values
  // for the 5 production KPIs. This catches any alias resolution bug at dev time.
  if (import.meta.env?.DEV) {
    const PRODUCTION_ENGINE_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
    for (const engineKey of PRODUCTION_ENGINE_KEYS) {
      const registryKey  = KPI_ENGINE_REVERSE_MAP[engineKey] ?? engineKey
      const engineValue  = safeKpiValues[engineKey]  ?? 0
      const registryValue = result[registryKey]       ?? 0
      if (engineValue !== registryValue) {
        console.error(
          `[buildKpiValuesMap] Drift detected for ${engineKey}:`,
          `flat=${engineValue} kpiValues.${registryKey}=${registryValue}`,
          '— this is a bug in alias resolution'
        )
      }
    }
  }

  return result
}
