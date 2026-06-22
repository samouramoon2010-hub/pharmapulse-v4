// ============================================================
// Assistant — Grounding (Phase 7A)
//
// Extracts citable "grounded facts" from an AssistantContext, and
// provides lookups used later by the safety layer to verify that
// anything an answer names (a KPI key, an entity id) actually
// exists in the deterministic context — the mechanism that makes
// "no hallucinated KPI names" enforceable.
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import type { AssistantContext } from './assistantTypes'

export type GroundedFactSource = 'ledger' | 'ranking' | 'benchmark' | 'trend' | 'opportunity' | 'recommendation' | 'trace' | 'profile'

export interface GroundedFact {
  label:  string
  value:  number | string
  source: GroundedFactSource
}

/** Every KPI key present anywhere in the context's trace. Never throws. */
export function listGroundedKpiKeys(context: AssistantContext): string[] {
  try {
    const keys = new Set<string>()
    for (const basket of context?.trace?.baskets ?? []) {
      for (const element of basket.elements ?? []) {
        for (const rule of element.rules ?? []) keys.add(rule.kpiKey)
      }
    }
    return [...keys]
  } catch {
    return []
  }
}

/** Every entityId present in the ranking or benchmark results. Never throws. */
export function listGroundedEntityIds(context: AssistantContext): string[] {
  try {
    const ids = new Set<string>()
    if (context?.entityId) ids.add(context.entityId)
    for (const e of context?.ranking?.entries ?? []) ids.add(e.entityId)
    for (const e of context?.benchmark?.entities ?? []) ids.add(e.entityId)
    return [...ids]
  } catch {
    return []
  }
}

/** True when a KPI key is actually present in the context's trace. Never throws. */
export function isKpiKeyGrounded(context: AssistantContext, kpiKey: string): boolean {
  try {
    return listGroundedKpiKeys(context).includes(kpiKey)
  } catch {
    return false
  }
}

/** True when an entityId is actually present in the context. Never throws. */
export function isEntityIdGrounded(context: AssistantContext, entityId: string): boolean {
  try {
    return listGroundedEntityIds(context).includes(entityId)
  } catch {
    return false
  }
}

/**
 * Extracts every citable fact from the context into a flat list, each
 * tagged with the kernel output it came from. Never throws.
 */
export function extractGroundedFacts(context: AssistantContext): GroundedFact[] {
  const facts: GroundedFact[] = []
  try {
    if (context?.ledgerEntry) {
      facts.push({ label: 'Overall score', value: context.ledgerEntry.score, source: 'ledger' })
    }
    if (context?.rankingEntry) {
      facts.push({ label: 'Rank', value: context.rankingEntry.rank, source: 'ranking' })
      facts.push({ label: 'Percentile', value: context.rankingEntry.percentile, source: 'ranking' })
      facts.push({ label: 'Quartile', value: context.rankingEntry.quartile, source: 'ranking' })
    }
    if (context?.benchmark) {
      facts.push({ label: 'Peer-group average', value: context.benchmark.group.average, source: 'benchmark' })
    }
    if (context?.trend) {
      facts.push({ label: 'Momentum', value: context.trend.momentum, source: 'trend' })
      facts.push({ label: 'Trend direction', value: context.trend.direction, source: 'trend' })
    }
    for (const item of context?.opportunities?.items ?? []) {
      facts.push({ label: item.category, value: item.value, source: 'opportunity' })
    }
    for (const item of context?.recommendations?.items ?? []) {
      facts.push({ label: item.title, value: item.impact, source: 'recommendation' })
    }
    if (context?.profileMetadata) {
      facts.push({ label: 'Profile version', value: context.profileMetadata.version, source: 'profile' })
    }
  } catch {
    return facts
  }
  return facts
}
