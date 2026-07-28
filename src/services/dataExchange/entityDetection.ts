// ============================================================
// Universal AI Intake — entity auto-detection (Phase 1)
//
// Scores a parsed header row against every domain's existing
// HEADER_ALIASES (already aggregated in headerResolution.ts's
// DOMAIN_FIELD_ALIASES — single source of truth, not duplicated
// here) and returns the best-matching import domain plus a
// confidence percentage. Reuses the same exact-alias matcher
// (findAliasMatch) every adapter already uses for column mapping —
// no new fuzzy-matching algorithm, no new alias lists.
// ============================================================

import { findAliasMatch } from './adapters/columnAliasUtils'
import { DOMAIN_FIELD_ALIASES } from './headerResolution'
import type { ImportDomain } from './importJobTypes'

export interface EntityDetectionCandidate {
  domain:      ImportDomain
  matched:     number
  total:       number
  /** 0-100, rounded — resolved headers ÷ total headers for this domain. */
  confidence:  number
}

export interface EntityDetectionResult {
  best:        EntityDetectionCandidate | null
  candidates:  EntityDetectionCandidate[]   // sorted, highest confidence first
}

/**
 * Score a header row against every domain with a HEADER_ALIASES map.
 * A header row with zero recognizable columns yields best: null — the
 * caller must fall back to a manual domain selector, never guess.
 */
export function detectEntityType(headerRow: string[]): EntityDetectionResult {
  const cleanHeaders = headerRow.filter((h) => h != null && String(h).trim() !== '')
  const candidates: EntityDetectionCandidate[] = []

  if (cleanHeaders.length === 0) {
    return { best: null, candidates: [] }
  }

  for (const [domain, aliasMap] of Object.entries(DOMAIN_FIELD_ALIASES)) {
    const matched = cleanHeaders.filter((h) => findAliasMatch(h, aliasMap) !== undefined).length
    if (matched === 0) continue
    candidates.push({
      domain: domain as ImportDomain,
      matched,
      total: cleanHeaders.length,
      confidence: Math.round((matched / cleanHeaders.length) * 100),
    })
  }

  candidates.sort((a, b) => b.confidence - a.confidence || b.matched - a.matched)

  return { best: candidates[0] ?? null, candidates }
}
