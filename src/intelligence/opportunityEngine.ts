// ============================================================
// Opportunity Engine (Phase 6A)
//
// Pure, deterministic functions that extract structural findings
// from a ledger entry's existing trace (produced by simulateProfile
// via the evaluation runner) plus an optional previous-period entry
// and benchmark average. Never recomputes a score — only reads the
// already-computed trace/score/comparison kernels.
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import { compareLedgerEntries } from '../evaluationLedger/evaluationSnapshot'
import type { EvaluationLedgerEntry } from '../evaluationLedger/evaluationLedgerTypes'
import type { ProfileSimTrace, BasketSimTrace, ElementSimTrace, RuleSimTrace } from '../profileStudio/simulationTrace'
import type { OpportunityAnalysisInput, OpportunityItem, OpportunityResult } from './opportunityTypes'

// ── Trace flattening helpers ─────────────────────────────────────

interface FlatRule { ruleId: string; kpiKey: string; score: number; weightedScore: number }
interface FlatElement { elementId: string; label: string; score: number; weight: number; weightedContribution: number }
interface FlatBasket { basketId: string; label: string; score: number; weight: number; weightedContribution: number }

function flatBaskets(trace: ProfileSimTrace | undefined): FlatBasket[] {
  return (trace?.baskets ?? []).map((b: BasketSimTrace) => ({
    basketId: b.basketId, label: b.label, score: b.score, weight: b.weight, weightedContribution: b.weightedContribution,
  }))
}

function flatElements(trace: ProfileSimTrace | undefined): FlatElement[] {
  const out: FlatElement[] = []
  for (const b of trace?.baskets ?? []) {
    for (const e of b.elements ?? []) {
      out.push({ elementId: e.elementId, label: e.label, score: e.score, weight: e.weight, weightedContribution: e.weightedContribution })
    }
  }
  return out
}

function flatRules(trace: ProfileSimTrace | undefined): FlatRule[] {
  const out: FlatRule[] = []
  for (const b of trace?.baskets ?? []) {
    for (const e of b.elements ?? []) {
      for (const r of e.rules ?? []) {
        out.push({ ruleId: r.ruleId, kpiKey: r.kpiKey, score: r.finalNodeScore, weightedScore: r.weightedScore })
      }
    }
  }
  return out
}

// ── Individual finders (each never throws — returns null on no data) ──

/** The basket with the lowest raw score — the entity's clearest current weakness. */
export function findBiggestWeakness(trace: ProfileSimTrace | undefined): OpportunityItem | null {
  try {
    const baskets = flatBaskets(trace)
    if (baskets.length === 0) return null
    const weakest = baskets.reduce((min, b) => (b.score < min.score ? b : min))
    return {
      category: 'BIGGEST_WEAKNESS', level: 'basket', targetId: weakest.basketId, targetLabel: weakest.label,
      value: weakest.score,
      description: `${weakest.label} is the weakest basket at ${weakest.score.toFixed(1)}% — the lowest score across all baskets.`,
    }
  } catch { return null }
}

/** The element with the greatest weighted headroom — weight × (100 − score). */
export function findBiggestOpportunity(trace: ProfileSimTrace | undefined): OpportunityItem | null {
  try {
    const elements = flatElements(trace)
    if (elements.length === 0) return null
    const scored = elements.map((e) => ({ ...e, headroom: e.weight * (100 - e.score) }))
    const top = scored.reduce((max, e) => (e.headroom > max.headroom ? e : max))
    return {
      category: 'BIGGEST_OPPORTUNITY', level: 'element', targetId: top.elementId, targetLabel: top.label,
      value: top.headroom,
      description: `${top.label} carries the largest improvement headroom — closing its gap to 100% would add the most weighted score of any element.`,
    }
  } catch { return null }
}

/** The rule whose weighted contribution to the overall score is smallest. */
export function findLowestContributingKpi(trace: ProfileSimTrace | undefined): OpportunityItem | null {
  try {
    const rules = flatRules(trace)
    if (rules.length === 0) return null
    const lowest = rules.reduce((min, r) => (r.weightedScore < min.weightedScore ? r : min))
    return {
      category: 'LOWEST_CONTRIBUTING_KPI', level: 'rule', targetId: lowest.ruleId, targetLabel: lowest.kpiKey,
      value: lowest.weightedScore,
      description: `${lowest.kpiKey} contributes the least to the overall score among all KPIs (weighted score ${lowest.weightedScore.toFixed(2)}).`,
    }
  } catch { return null }
}

/** The rule whose weighted contribution to the overall score is largest. */
export function findHighestContributingKpi(trace: ProfileSimTrace | undefined): OpportunityItem | null {
  try {
    const rules = flatRules(trace)
    if (rules.length === 0) return null
    const highest = rules.reduce((max, r) => (r.weightedScore > max.weightedScore ? r : max))
    return {
      category: 'HIGHEST_CONTRIBUTING_KPI', level: 'rule', targetId: highest.ruleId, targetLabel: highest.kpiKey,
      value: highest.weightedScore,
      description: `${highest.kpiKey} contributes the most to the overall score among all KPIs (weighted score ${highest.weightedScore.toFixed(2)}).`,
    }
  } catch { return null }
}

/** The gap between this entity's score and the peer-group average. */
export function findLargestScoreGap(entry: EvaluationLedgerEntry, benchmarkAverage?: number): OpportunityItem | null {
  try {
    if (typeof benchmarkAverage !== 'number' || !Number.isFinite(benchmarkAverage)) return null
    const gap = entry.score - benchmarkAverage
    return {
      category: 'LARGEST_SCORE_GAP', level: 'profile', targetId: entry.entityId, targetLabel: entry.entityId,
      value: gap,
      description: gap < 0
        ? `${entry.entityId} trails the peer-group average by ${Math.abs(gap).toFixed(1)} points.`
        : `${entry.entityId} leads the peer-group average by ${gap.toFixed(1)} points.`,
    }
  } catch { return null }
}

/** The basket/element with the largest negative score delta vs. the previous period. */
export function findLargestDecline(entry: EvaluationLedgerEntry, previousEntry?: EvaluationLedgerEntry): OpportunityItem | null {
  try {
    if (!previousEntry) return null
    const cmp = compareLedgerEntries(previousEntry, entry)
    const all = [...cmp.basketDeltas, ...cmp.elementDeltas]
    if (all.length === 0) return null
    const worst = all.reduce((min, d) => (d.delta < min.delta ? d : min))
    if (worst.delta >= 0) return null
    return {
      category: 'LARGEST_DECLINE', level: cmp.basketDeltas.includes(worst as any) ? 'basket' : 'element',
      targetId: worst.id, targetLabel: worst.id, value: worst.delta,
      description: `${worst.id} declined by ${Math.abs(worst.delta).toFixed(1)} points compared to the previous period.`,
    }
  } catch { return null }
}

/** The basket/element with the largest positive score delta vs. the previous period. */
export function findLargestImprovement(entry: EvaluationLedgerEntry, previousEntry?: EvaluationLedgerEntry): OpportunityItem | null {
  try {
    if (!previousEntry) return null
    const cmp = compareLedgerEntries(previousEntry, entry)
    const all = [...cmp.basketDeltas, ...cmp.elementDeltas]
    if (all.length === 0) return null
    const best = all.reduce((max, d) => (d.delta > max.delta ? d : max))
    if (best.delta <= 0) return null
    return {
      category: 'LARGEST_IMPROVEMENT', level: cmp.basketDeltas.includes(best as any) ? 'basket' : 'element',
      targetId: best.id, targetLabel: best.id, value: best.delta,
      description: `${best.id} improved by ${best.delta.toFixed(1)} points compared to the previous period.`,
    }
  } catch { return null }
}

/**
 * Runs every finder and aggregates the non-null results. Never throws —
 * missing data (no trace, no previous entry, no benchmark) simply
 * produces fewer items, never an error.
 */
export function analyzeOpportunities(input: OpportunityAnalysisInput): OpportunityResult {
  try {
    const trace = input?.entry?.trace
    const finders: (OpportunityItem | null)[] = [
      findBiggestWeakness(trace),
      findBiggestOpportunity(trace),
      findLargestScoreGap(input.entry, input.benchmarkAverage),
      findLowestContributingKpi(trace),
      findHighestContributingKpi(trace),
      findLargestDecline(input.entry, input.previousEntry),
      findLargestImprovement(input.entry, input.previousEntry),
    ]
    return {
      entityId:    input.entry.entityId,
      entityType:  input.entry.entityType,
      items:       finders.filter((i): i is OpportunityItem => i !== null),
      generatedAt: new Date().toISOString(),
    }
  } catch {
    return { entityId: input?.entry?.entityId ?? '', entityType: input?.entry?.entityType ?? 'branch', items: [], generatedAt: new Date().toISOString() }
  }
}
