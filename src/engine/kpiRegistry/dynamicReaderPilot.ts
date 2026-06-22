// ============================================================
// Dynamic KPI Controlled Cutover — Phase 2: Production Reader Pilot
//
// First real production consumer of the Dynamic Reader primitives
// built in dynamicKpiFoundation.ts (Phase A-D) and promoted in
// kpiAnalyticsEngine.ts Section 2B (Phase 4E-1).
//
// Pilot surface: Dashboard (DashboardPage.jsx), chosen per the
// bundle's preferred order. Pilot KPIs: the 5 named in
// PARITY_VALIDATION_TARGETS (Smart List/sl, NDF, Wellness Card,
// OmniHealth, Sales).
//
// Architecture — Dynamic Reader becomes the source for a KPI only
// if ALL of the following hold:
//   1. The KPI is one of the 5 pilot business keys.
//   2. Its registry entry is isActive.
//   3. A real (never fabricated) entry+target sample proves parity
//      (validateNamedKpiParity / isSafeToExposeDynamically).
// Otherwise the Legacy Reader is used — automatically, silently,
// with no error ever propagating to the UI. This satisfies "Dynamic
// readers may become authoritative only where parity is proven and
// rollback is immediate."
//
// Parity here is a structural property of the live registry's field
// mapping (actualField/targetField vs the engine key), not a
// per-document property — so a single real sample is representative
// of every document for that KPI. No data is invented to test it;
// if no real sample is available yet, every pilot KPI safely
// defaults to the Legacy Reader (parity unverified).
// ============================================================

import { readKpiActual, readKpiTarget } from '../kpiAnalyticsEngine'
import {
  PARITY_VALIDATION_TARGETS,
  validateNamedKpiParity,
  isSafeToExposeDynamically,
  type KpiParityResult,
} from './dynamicKpiFoundation'
import type { KpiRegistry } from './kpiRegistryTypes'

// Kept as the default/legacy surface identifier — existing Dashboard call
// sites that don't pass a surface argument keep this exact value.
export const PILOT_SURFACE = 'dashboard' as const

/**
 * Multi-Surface Controlled Cutover — every surface/engine piloting the
 * Dynamic Reader registers its name here.
 *
 * 'branchIntelligence' now applies to the Team Intelligence Engine
 * (pharmacistPerformanceEngine.ts) directly — Protected Engines Migration
 * Phase A unblocked it by adding an optional registry parameter.
 * 'rankingEngine', 'executiveBI', 'trendEngine', 'riskEngine', and
 * 'liveAnalytics' were added for Protected Engines Migration Phases B-D.
 */
export type PilotSurfaceName =
  | 'dashboard'
  | 'regionalIntelligence'
  | 'branchIntelligence'
  | 'rankingEngine'
  | 'executiveBI'
  | 'trendEngine'
  | 'riskEngine'
  | 'liveAnalytics'

export type PilotSource = 'dynamic' | 'legacy'
export type PilotParityState = 'PASS' | 'BLOCKED' | 'UNVERIFIED'

export interface PilotKpiSource {
  businessKey: string
  engineKey:   string
  source:      PilotSource
  parity:      PilotParityState
  reason:      string
}

export interface PilotPolicy {
  surface:           PilotSurfaceName
  parityResults:     KpiParityResult[] | null
  sources:           PilotKpiSource[]
  /** engineKey -> source, for O(1) lookup from the reader functions below */
  bySourceEngineKey: Record<string, PilotSource>
}

/** Map each of the 5 pilot business keys to its engine key under the given registry. */
function pilotEngineKeyMap(registry: KpiRegistry): Record<string, string> {
  const map: Record<string, string> = {}
  for (const businessKey of Object.values(PARITY_VALIDATION_TARGETS)) {
    const def = registry[businessKey]
    if (def) map[businessKey] = def.aliasFor ?? def.key
  }
  return map
}

/**
 * Build the pilot policy from a single real entry+target sample.
 * Never fabricates sampleEntry/sampleTarget — pass null/undefined
 * when no real document is available, and every pilot KPI will
 * correctly fall back to the Legacy Reader (parity UNVERIFIED).
 */
export function buildPilotPolicy(
  sampleEntry:  Record<string, unknown> | null | undefined,
  sampleTarget: Record<string, unknown> | null | undefined,
  registry:     KpiRegistry,
  surface:      PilotSurfaceName = PILOT_SURFACE,
): PilotPolicy {
  const engineKeyMap = pilotEngineKeyMap(registry)

  let parityResults: KpiParityResult[] | null = null
  if (sampleEntry && sampleTarget) {
    try {
      parityResults = validateNamedKpiParity(sampleEntry, sampleTarget, registry)
    } catch {
      // A faulty sample must never break the dashboard — fall back to
      // "unverified", which routes every pilot KPI to the Legacy Reader.
      parityResults = null
    }
  }

  const sources: PilotKpiSource[] = Object.entries(engineKeyMap).map(([businessKey, engineKey]) => {
    const def    = registry[businessKey]
    const active = def?.isActive === true

    if (!active) {
      return {
        businessKey, engineKey, source: 'legacy', parity: 'UNVERIFIED',
        reason: 'KPI is not active in the live registry — Legacy Reader used.',
      }
    }
    if (!parityResults) {
      return {
        businessKey, engineKey, source: 'legacy', parity: 'UNVERIFIED',
        reason: 'No live parity sample available yet — Legacy Reader used.',
      }
    }

    const result = parityResults.find((r) => r.key === businessKey)
    const safe   = result?.match === true && isSafeToExposeDynamically(parityResults, businessKey)

    return {
      businessKey, engineKey,
      source: safe ? 'dynamic' : 'legacy',
      parity: result ? (result.match ? 'PASS' : 'BLOCKED') : 'UNVERIFIED',
      reason: safe
        ? 'Parity proven against a live sample — Dynamic Reader is authoritative.'
        : 'Parity not proven — Legacy Reader remains authoritative (automatic fallback).',
    }
  })

  const bySourceEngineKey: Record<string, PilotSource> = {}
  for (const s of sources) bySourceEngineKey[s.engineKey] = s.source

  return { surface, parityResults, sources, bySourceEngineKey }
}

/**
 * Read the actual value for one entry document, honoring the pilot
 * policy. Any Dynamic Reader failure falls back to the exact legacy
 * computation (Number(entry[engineKey]) || 0) — a reader fault can
 * never surface as a UI error.
 */
export function readPilotActual(
  entry:     Record<string, unknown>,
  engineKey: string,
  registry:  KpiRegistry,
  policy:    PilotPolicy,
): number {
  const source = policy.bySourceEngineKey[engineKey] ?? 'legacy'
  if (source === 'dynamic') {
    try {
      return readKpiActual(entry, engineKey, registry)
    } catch {
      // fall through to legacy below
    }
  }
  return Number(entry[engineKey]) || 0
}

/**
 * Sum the actual value for one engine key across multiple entry documents,
 * honoring the pilot policy for every entry. Mirrors sumKpi()'s aggregation
 * shape exactly, but gated per-KPI by proven parity instead of unconditional
 * registry resolution — for surfaces (e.g. Regional Intelligence) that
 * aggregate many entries rather than reading a single document.
 */
export function sumPilotActual(
  entries:   Record<string, unknown>[],
  engineKey: string,
  registry:  KpiRegistry,
  policy:    PilotPolicy,
): number {
  return entries.reduce((s, e) => s + readPilotActual(e, engineKey, registry, policy), 0)
}

/**
 * Read the target value for the current target document, honoring the
 * pilot policy. legacyFallback must reproduce the surface's own existing
 * (pre-pilot) target-resolution logic exactly, so non-pilot KPIs and any
 * KPI without proven parity are completely unaffected by this module.
 */
export function readPilotTarget(
  targetDoc:      Record<string, unknown> | null | undefined,
  engineKey:      string,
  registry:       KpiRegistry,
  policy:         PilotPolicy,
  legacyFallback: () => number,
): number {
  const source = policy.bySourceEngineKey[engineKey] ?? 'legacy'
  if (source === 'dynamic' && targetDoc) {
    try {
      return readKpiTarget(targetDoc, engineKey, registry)
    } catch {
      // fall through to legacy below
    }
  }
  return legacyFallback()
}

/** Convenience: how many pilot KPIs are currently using the Dynamic Reader. */
export function countDynamicSourcesUsed(policy: PilotPolicy): number {
  return policy.sources.filter((s) => s.source === 'dynamic').length
}

/** Convenience: how many pilot KPIs are currently falling back to the Legacy Reader. */
export function countLegacyFallbacksUsed(policy: PilotPolicy): number {
  return policy.sources.filter((s) => s.source === 'legacy').length
}
