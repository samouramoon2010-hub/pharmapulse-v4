// ============================================================
// Assistant — Question Intent Types (Phase 7B)
//
// TypeScript-only data model for the deterministic question router.
//
// No Firestore. No React. No executable logic. No AI.
// ============================================================

export type QuestionIntent =
  | 'explain_score'
  | 'explain_drop'
  | 'compare_periods'
  | 'explain_ranking'
  | 'find_opportunities'
  | 'explain_recommendations'
  | 'what_if'
  | 'profile_explanation'
  | 'unknown'

export interface RoutedQuestion {
  intent:          QuestionIntent
  rawQuestion:     string
  matchedKeywords: string[]
}
