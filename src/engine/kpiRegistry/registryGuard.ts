// ============================================================
// Registry Guard — Core KPI Dependency Removal
// No Silent Core Fallback Closure
//
// Single, reusable orchestrator-boundary guard. Active production
// hooks/services call this immediately after resolving the live
// KpiRegistry and before invoking any engine. If the registry is
// missing or malformed, it throws a controlled diagnostic failure
// instead of letting the call silently continue with the fixed
// Core KPI list.
//
// Pure function — no Firebase, no React.
// ============================================================

import type { KpiRegistry } from './kpiRegistryTypes'

/**
 * Require a live KpiRegistry value to have been resolved (not omitted)
 * at a production orchestrator/hook/service boundary.
 *
 * Throws a controlled diagnostic error (never a silent Core KPI
 * fallback) when the registry is missing entirely (null/undefined) —
 * i.e. the case that would make a downstream optional-registry engine
 * function silently take its historical-compatibility Core-only
 * fallback branch.
 *
 * Deliberately does NOT reject an empty object ({}). A registry that
 * resolved to {} (e.g. zero KPI documents in Firestore) is a distinct,
 * already-safe condition: getProductionEngineKeys({}) returns [] (zero
 * active KPIs), never the fixed Core list — so it is not a silent Core
 * fallback and downstream code already handles it correctly.
 *
 * @param registry - The live registry resolved by the caller
 *                    (e.g. via subscribeKpiRegistry / fetchKpiRegistryOnce)
 * @param boundaryName - Identifies the calling hook/service in the
 *                        diagnostic message (e.g. 'useExecutiveReport')
 * @returns The same registry, narrowed to non-nullish
 */
export function requireLiveRegistry(
  registry: KpiRegistry | null | undefined,
  boundaryName: string,
): KpiRegistry {
  if (registry == null) {
    throw new Error(
      `[${boundaryName}] KPI Registry is required and was not resolved — no Core KPI fallback is permitted in production.`,
    )
  }
  return registry
}
