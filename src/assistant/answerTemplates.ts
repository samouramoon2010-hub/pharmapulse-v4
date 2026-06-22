// ============================================================
// Assistant — Answer Templates (Phase 7C)
//
// One deterministic template function per question intent. Every
// sentence is plain string interpolation over fields already present
// in the AssistantContext — no computation happens here, and no
// template ever invents a number that isn't already in context.
// When the required context field is missing, the template says so
// explicitly rather than guessing.
//
// No Firestore. No React. No UI. No AI.
// ============================================================

import type { AssistantContext } from './assistantTypes'
import { extractGroundedFacts } from './assistantGrounding'
import type { GroundedFact } from './assistantGrounding'

export interface TemplateOutput {
  text:     string
  evidence: GroundedFact[]
}

function evidenceFor(context: AssistantContext, sources: GroundedFact['source'][]): GroundedFact[] {
  return extractGroundedFacts(context).filter((f) => sources.includes(f.source))
}

export function explainScoreTemplate(context: AssistantContext): TemplateOutput {
  const entry = context?.ledgerEntry
  if (!entry) return { text: 'No evaluation data is available yet for this entity/period.', evidence: [] }

  const rankPart = context.rankingEntry
    ? ` It ranks #${context.rankingEntry.rank} (${context.rankingEntry.percentile.toFixed(0)}th percentile, quartile ${context.rankingEntry.quartile}).`
    : ''
  const weakness = context.opportunities?.items.find((i) => i.category === 'BIGGEST_WEAKNESS')
  const weaknessPart = weakness ? ` ${weakness.description}` : ''

  return {
    text: `${context.entityId} scored ${entry.score.toFixed(1)}% for ${entry.periodId}.${rankPart}${weaknessPart}`,
    evidence: evidenceFor(context, ['ledger', 'ranking', 'opportunity']),
  }
}

export function explainDropTemplate(context: AssistantContext): TemplateOutput {
  const entry = context?.ledgerEntry
  const previous = context?.previousLedgerEntry
  if (!entry || !previous) {
    return { text: 'A previous-period evaluation is required to explain a drop, and none is available in this context.', evidence: [] }
  }

  const delta = entry.score - previous.score
  if (delta >= 0) {
    return { text: `${context.entityId} did not drop — the score moved from ${previous.score.toFixed(1)}% to ${entry.score.toFixed(1)}% (+${delta.toFixed(1)}).`, evidence: evidenceFor(context, ['ledger']) }
  }

  const decline = context.opportunities?.items.find((i) => i.category === 'LARGEST_DECLINE')
  const declinePart = decline ? ` The largest contributor was: ${decline.description}` : ''

  return {
    text: `${context.entityId} dropped from ${previous.score.toFixed(1)}% to ${entry.score.toFixed(1)}% (${delta.toFixed(1)} points) between ${previous.periodId} and ${entry.periodId}.${declinePart}`,
    evidence: evidenceFor(context, ['ledger', 'opportunity']),
  }
}

export function comparePeriodsTemplate(context: AssistantContext): TemplateOutput {
  const entry = context?.ledgerEntry
  const previous = context?.previousLedgerEntry
  if (!entry || !previous) {
    return { text: 'Two periods of evaluation data are required for a comparison, and only one (or none) is available.', evidence: [] }
  }
  const delta = entry.score - previous.score
  const direction = delta > 0 ? 'improved' : delta < 0 ? 'declined' : 'stayed flat'
  return {
    text: `Comparing ${previous.periodId} to ${entry.periodId}: the score ${direction} from ${previous.score.toFixed(1)}% to ${entry.score.toFixed(1)}% (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} points).`,
    evidence: evidenceFor(context, ['ledger']),
  }
}

export function explainRankingTemplate(context: AssistantContext): TemplateOutput {
  const rankingEntry = context?.rankingEntry
  if (!rankingEntry) return { text: 'No ranking data is available for this entity/period.', evidence: [] }

  return {
    text: `${context.entityId} is ranked #${rankingEntry.rank} out of ${context.ranking?.entries.length ?? '?'} `
      + `with a score of ${rankingEntry.score.toFixed(1)}% — the ${rankingEntry.percentile.toFixed(0)}th percentile, quartile ${rankingEntry.quartile}.`,
    evidence: evidenceFor(context, ['ranking']),
  }
}

export function findOpportunitiesTemplate(context: AssistantContext): TemplateOutput {
  const items = context?.opportunities?.items ?? []
  if (items.length === 0) return { text: 'No opportunity findings are available for this entity/period.', evidence: [] }

  const sentences = items.map((i) => i.description)
  return { text: sentences.join(' '), evidence: evidenceFor(context, ['opportunity']) }
}

export function explainRecommendationsTemplate(context: AssistantContext): TemplateOutput {
  const items = context?.recommendations?.items ?? []
  if (items.length === 0) return { text: 'No recommendations are available for this entity/period.', evidence: [] }

  const top = items[0]
  return {
    text: `The top recommendation is: "${top.title}" (priority: ${top.priority}, expected gain: ${top.expectedGain.toFixed(1)} points). ${top.description}`,
    evidence: evidenceFor(context, ['recommendation']),
  }
}

export function whatIfTemplate(context: AssistantContext): TemplateOutput {
  const entry = context?.ledgerEntry
  if (!entry) return { text: 'A baseline evaluation is required before exploring a what-if scenario.', evidence: [] }

  const top = context.recommendations?.items?.[0]
  if (!top) {
    return {
      text: `The current score is ${entry.score.toFixed(1)}%. Run the Impact Simulator with specific KPI targets to see a projected score for a what-if scenario.`,
      evidence: evidenceFor(context, ['ledger']),
    }
  }

  const projected = Math.min(100, entry.score + top.expectedGain)
  return {
    text: `If "${top.title}" is fully addressed, the projected score could rise from ${entry.score.toFixed(1)}% to approximately ${projected.toFixed(1)}% `
      + `(based on the recommendation's expected gain of ${top.expectedGain.toFixed(1)} points). Run the Impact Simulator for an exact what-if projection.`,
    evidence: evidenceFor(context, ['ledger', 'recommendation']),
  }
}

export function profileExplanationTemplate(context: AssistantContext): TemplateOutput {
  const metadata = context?.profileMetadata
  const basketCount = context?.trace?.baskets.length ?? 0
  if (!metadata) {
    return { text: `This evaluation uses profile ${context?.profileId ?? 'unknown'} version ${context?.profileVersion ?? 'unknown'}, with ${basketCount} basket(s).`, evidence: evidenceFor(context, ['trace']) }
  }
  return {
    text: `This evaluation uses "${metadata.name}" (version ${metadata.version}, status ${metadata.status}), with ${basketCount} basket(s) in its methodology.`,
    evidence: evidenceFor(context, ['profile', 'trace']),
  }
}

export function unknownTemplate(): TemplateOutput {
  return {
    text: 'I can answer questions about score explanations, score drops, period comparisons, ranking, opportunities, recommendations, what-if scenarios, and profile methodology. Try rephrasing your question around one of those topics.',
    evidence: [],
  }
}
