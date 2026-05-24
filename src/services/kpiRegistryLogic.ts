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
    updatedBy,
  }
}
