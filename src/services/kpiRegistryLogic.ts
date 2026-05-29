// ============================================================
// KPI Registry Logic — pure functions, no Firebase
// Extracted from kpiRegistryService.ts for testability.
// ============================================================

import { DEFAULT_KPI_REGISTRY } from '../engine/kpiRegistry'
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
    if (!kpi.isActive) continue
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

    // Reject null, undefined, objects, arrays — only primitives allowed
    if (rawValue === null || rawValue === undefined) continue
    if (typeof rawValue === 'object') continue

    // Coerce to number
    const n = Number(rawValue)

    // Reject NaN and Infinity
    if (!isFinite(n) || isNaN(n)) continue

    // Clamp negative to 0
    result[key] = Math.max(0, n)
  }

  return result
}
