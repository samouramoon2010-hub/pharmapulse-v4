// ============================================================
// KPI Registry Metadata Resolver — Phase 1B
//
// Single authoritative access layer for display-only metadata:
//   • Labels (English + Arabic)
//   • Colors
//   • Coaching actions (English + Arabic)
//
// Design principles:
//   1. Reads from DEFAULT_KPI_REGISTRY — registry is source of truth.
//   2. Handles engine key ↔ registry key translation automatically.
//      Engine keys: wasfaty, omni, wellness, basket, crossSelling
//      Registry keys: wasfaty, omnihealth, wellnessCard, basket, crossSelling
//   3. Never throws — all functions return safe fallbacks.
//   4. Zero side effects — pure functions only.
//   5. Does NOT touch: evaluation, ranking, targets, Firestore,
//      KPI_WEIGHTS, KPI_KEYS, or any calculation path.
//
// Usage:
//   import { getKpiLabel, getKpiColor, getKpiCoachingAction }
//     from '../../engine/kpiRegistry/kpiMetaResolver'
//
// Phase 1B scope: display metadata only.
// Calculations (weights, thresholds, targets) remain in their
// existing locations — they are NOT migrated in this phase.
// ============================================================

import {
  DEFAULT_KPI_REGISTRY,
  KPI_ENGINE_ALIAS_MAP,
  KPI_ENGINE_REVERSE_MAP,
} from './defaultKpiRegistry'
import type { KpiDefinition } from './kpiRegistryTypes'

// Re-export lifecycle predicates for convenience — single import point
export {
  isProductionEvaluationKpi,
  isPilotTrackingKpi,
  isShadowEvaluationKpi,
  isArchivedKpi,
  canTransitionKpiLifecycle,
} from './kpiRegistryTypes'

// ── Fallback constants (preserve existing values exactly) ──────
/** Default color for unrecognized KPI keys — matches tokens.ts KPI_COLORS.default */
export const DEFAULT_KPI_COLOR = '#a1a1aa'

/** Default English label when registry lookup fails */
const DEFAULT_LABEL = (key: string): string => key

/** Default Arabic label when registry lookup fails */
const DEFAULT_LABEL_AR = (key: string): string => key

/** Default coaching action when registry lookup fails */
const DEFAULT_COACHING = (key: string): string =>
  `Focus on ${key} to close the remaining gap.`

/** Default Arabic coaching action when registry lookup fails */
const DEFAULT_COACHING_AR = (key: string): string =>
  `ركز على ${key} لتقليص الفجوة.`

// ── Key resolution ─────────────────────────────────────────────

/**
 * Resolve any KPI key to its registry business key.
 *
 * Accepts:
 *   • Engine keys (omni, wellness) — translated via reverse alias map
 *   • Business/registry keys (omnihealth, wellnessCard, wasfaty, ...) — used directly
 *   • Unknown keys — returned as-is (will result in fallback values)
 *
 * Examples:
 *   resolveRegistryKey('omni')       → 'omnihealth'
 *   resolveRegistryKey('wellness')   → 'wellnessCard'
 *   resolveRegistryKey('wasfaty')    → 'wasfaty'
 *   resolveRegistryKey('omnihealth') → 'omnihealth'
 *   resolveRegistryKey('unknown')    → 'unknown'
 */
export function resolveRegistryKey(kpiKey: string): string {
  // If it's already a known registry key, use it directly
  if (DEFAULT_KPI_REGISTRY[kpiKey]) return kpiKey
  // Try to resolve as an engine alias (omni → omnihealth, wellness → wellnessCard)
  const businessKey = KPI_ENGINE_REVERSE_MAP[kpiKey]
  if (businessKey && DEFAULT_KPI_REGISTRY[businessKey]) return businessKey
  // Unknown key — return as-is, caller will get fallback values
  return kpiKey
}

/**
 * Resolve any KPI key to its engine key.
 *
 * Examples:
 *   resolveEngineKey('omnihealth')  → 'omni'
 *   resolveEngineKey('wellnessCard') → 'wellness'
 *   resolveEngineKey('wasfaty')     → 'wasfaty'
 *   resolveEngineKey('omni')        → 'omni'
 */
export function resolveEngineKey(kpiKey: string): string {
  // If it's already an engine key or direct match, return as-is
  if (KPI_ENGINE_ALIAS_MAP[kpiKey]) return KPI_ENGINE_ALIAS_MAP[kpiKey]
  return kpiKey
}

/**
 * Get the KpiDefinition for any KPI key (engine or registry).
 * Returns undefined if the key cannot be resolved.
 */
export function getKpiDefinition(kpiKey: string): KpiDefinition | undefined {
  const registryKey = resolveRegistryKey(kpiKey)
  return DEFAULT_KPI_REGISTRY[registryKey]
}

// ── Label resolvers ────────────────────────────────────────────

/**
 * Get the English display label for a KPI.
 * Accepts engine keys (omni, wellness) or registry keys (omnihealth, wellnessCard).
 *
 * Fallback: returns the kpiKey itself (safe for display).
 */
export function getKpiLabel(kpiKey: string): string {
  return getKpiDefinition(kpiKey)?.label ?? DEFAULT_LABEL(kpiKey)
}

/**
 * Get the Arabic display label for a KPI.
 * Accepts engine keys or registry keys.
 *
 * Fallback: returns the kpiKey itself.
 */
export function getKpiLabelAr(kpiKey: string): string {
  return getKpiDefinition(kpiKey)?.labelAr ?? DEFAULT_LABEL_AR(kpiKey)
}

/**
 * Get both English and Arabic labels for a KPI.
 * Mirrors the shape returned by KPI_META[key] in kpiAnalyticsEngine.ts.
 *
 * Used to replace: KPI_META[focusKpi] call sites.
 *
 * Fallback: { en: kpiKey, ar: kpiKey }
 */
export function getKpiLabels(kpiKey: string): { en: string; ar: string } {
  const def = getKpiDefinition(kpiKey)
  return {
    en: def?.label    ?? DEFAULT_LABEL(kpiKey),
    ar: def?.labelAr  ?? DEFAULT_LABEL_AR(kpiKey),
  }
}

// ── Color resolver ─────────────────────────────────────────────

/**
 * Predefined display colors for the 5 core KPIs.
 * These match the values in design/tokens.ts KPI_COLORS and
 * components/kpi/kpiVisualHelpers.js FALLBACK_COLORS exactly.
 *
 * Stored here as a lookup for performance — avoids scanning the
 * full registry object on every render cycle.
 */
const KPI_COLOR_MAP: Record<string, string> = {
  // Engine keys
  wasfaty:      '#6366f1',
  omni:         '#ef4444',
  wellness:     '#f59e0b',
  basket:       '#22c55e',
  crossSelling: '#8b5cf6',
  // Registry keys (aliases)
  omnihealth:   '#ef4444',
  wellnessCard: '#f59e0b',
}

/**
 * Get the display color for a KPI.
 * Accepts engine keys or registry keys.
 *
 * Color values are identical to the previous hardcoded FALLBACK_COLORS
 * and design/tokens.ts KPI_COLORS maps — no visual change.
 *
 * Fallback: DEFAULT_KPI_COLOR ('#a1a1aa')
 */
export function getKpiColor(kpiKey: string): string {
  // Direct match (covers both engine keys and registry keys)
  if (KPI_COLOR_MAP[kpiKey]) return KPI_COLOR_MAP[kpiKey]
  // Resolve via alias map and try again
  const registryKey = resolveRegistryKey(kpiKey)
  return KPI_COLOR_MAP[registryKey] ?? DEFAULT_KPI_COLOR
}

// ── Coaching action resolvers ──────────────────────────────────

/**
 * Get the English coaching guidance for a KPI in the behind-pace state.
 * Accepts engine keys or registry keys.
 *
 * This replaces the hardcoded switch statement in PharmacistIntelligencePage
 * and the ACTIONS constant in kpiAnalyticsEngine.ts.
 *
 * Values are identical to the previous hardcoded strings — no text change.
 *
 * Fallback: generic "Focus on {kpiKey} to close the remaining gap."
 */
export function getKpiCoachingAction(kpiKey: string): string {
  return getKpiDefinition(kpiKey)?.coachingAction ?? DEFAULT_COACHING(kpiKey)
}

/**
 * Get the Arabic coaching guidance for a KPI in the behind-pace state.
 * Accepts engine keys or registry keys.
 *
 * Fallback: generic Arabic fallback string.
 */
export function getKpiCoachingActionAr(kpiKey: string): string {
  return getKpiDefinition(kpiKey)?.coachingActionAr ?? DEFAULT_COACHING_AR(kpiKey)
}

// ── Color map export (for components that need the full map) ───

/**
 * Get the full color map for all active KPIs.
 * Returns { [engineKey]: color } — matches the shape of FALLBACK_COLORS.
 * Used by components that need all colors at once.
 */
export function getAllKpiColors(): Record<string, string> {
  return { ...KPI_COLOR_MAP }
}

// ── Additional display metadata resolvers ──────────────────────

/**
 * Get the icon identifier for a KPI.
 * Accepts engine keys or registry keys.
 * Fallback: empty string.
 */
export function getKpiIcon(kpiKey: string): string {
  return getKpiDefinition(kpiKey)?.icon ?? ''
}

/**
 * Get the unit string for a KPI.
 * Accepts engine keys or registry keys.
 * Fallback: empty string.
 */
export function getKpiUnit(kpiKey: string): string {
  return getKpiDefinition(kpiKey)?.unit ?? ''
}

/**
 * Get the category for a KPI.
 * Accepts engine keys or registry keys.
 * Fallback: 'OTHER'.
 */
export function getKpiCategory(kpiKey: string): string {
  return getKpiDefinition(kpiKey)?.category ?? 'OTHER'
}

// ── Lifecycle-aware registry selectors ────────────────────────
//
// Part B — Registry Visibility Rules
// These selectors are the single source of truth for which KPIs
// appear on each platform surface, separated by lifecycle stage.

/**
 * Returns KPIs in production_evaluation stage, sorted by sortOrder.
 * These are the 5 core KPIs that affect evaluation and rankings.
 */
export function getProductionEvaluationKpis(
  registry: import('./kpiRegistryTypes').KpiRegistry = DEFAULT_KPI_REGISTRY
): import('./kpiRegistryTypes').KpiDefinition[] {
  return Object.values(registry)
    .filter((kpi) => kpi.lifecycleStage === 'production_evaluation' && kpi.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Returns KPIs in pilot_tracking stage, sorted by sortOrder.
 * These KPIs are tracked but never affect evaluation or rankings.
 * UI must display the Tracking Only badge for every pilot KPI surface.
 */
export function getPilotTrackingKpis(
  registry: import('./kpiRegistryTypes').KpiRegistry = DEFAULT_KPI_REGISTRY
): import('./kpiRegistryTypes').KpiDefinition[] {
  return Object.values(registry)
    .filter((kpi) => kpi.lifecycleStage === 'pilot_tracking' && kpi.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Returns KPIs in shadow_evaluation stage.
 * Admin-only — not shown to pharmacists or managers.
 */
export function getShadowEvaluationKpis(
  registry: import('./kpiRegistryTypes').KpiRegistry = DEFAULT_KPI_REGISTRY
): import('./kpiRegistryTypes').KpiDefinition[] {
  return Object.values(registry)
    .filter((kpi) => kpi.lifecycleStage === 'shadow_evaluation' && kpi.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Returns all KPIs visible on the Dashboard.
 * Includes production KPIs + pilot KPIs (with Tracking Only badge).
 * Excludes archived and shadow KPIs.
 */
export function getVisibleDashboardKpis(
  registry: import('./kpiRegistryTypes').KpiRegistry = DEFAULT_KPI_REGISTRY
): { production: import('./kpiRegistryTypes').KpiDefinition[]; pilot: import('./kpiRegistryTypes').KpiDefinition[] } {
  const active = Object.values(registry)
    .filter((kpi) => kpi.isActive && kpi.visibility.dashboardEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  return {
    production: active.filter((kpi) => kpi.lifecycleStage === 'production_evaluation'),
    pilot:      active.filter((kpi) => kpi.lifecycleStage === 'pilot_tracking'),
  }
}

/**
 * Returns all KPIs visible in Reports.
 * Includes production + pilot. Each group must be rendered separately.
 */
export function getVisibleReportKpis(
  registry: import('./kpiRegistryTypes').KpiRegistry = DEFAULT_KPI_REGISTRY
): { production: import('./kpiRegistryTypes').KpiDefinition[]; pilot: import('./kpiRegistryTypes').KpiDefinition[] } {
  const active = Object.values(registry)
    .filter((kpi) => kpi.isActive && kpi.visibility.dashboardEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  return {
    production: active.filter((kpi) => kpi.lifecycleStage === 'production_evaluation'),
    pilot:      active.filter((kpi) => kpi.lifecycleStage === 'pilot_tracking'),
  }
}

/**
 * Returns all KPIs visible in Targets.
 * Includes production + pilot (targetInputEnabled and active).
 * Pilot KPI targets are saved but never affect evaluation.
 */
export function getVisibleTargetKpis(
  registry: import('./kpiRegistryTypes').KpiRegistry = DEFAULT_KPI_REGISTRY
): { production: import('./kpiRegistryTypes').KpiDefinition[]; pilot: import('./kpiRegistryTypes').KpiDefinition[] } {
  // Core KPI Dependency Removal — Stage G: targetInputEnabled is ordinary
  // registry data now (see defaultKpiRegistry.ts ALL_SURFACES), so no
  // isCore fallback is needed — byte-identical to the prior behavior.
  const eligible = Object.values(registry)
    .filter((kpi) => kpi.isActive && kpi.visibility.targetInputEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  return {
    production: eligible.filter((kpi) => kpi.lifecycleStage === 'production_evaluation'),
    pilot:      eligible.filter((kpi) => kpi.lifecycleStage === 'pilot_tracking'),
  }
}
