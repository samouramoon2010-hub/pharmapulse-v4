// ============================================================
// Team Intelligence Layer — Type Definitions
// Phase 3A: operational team intelligence, not HR evaluation.
//
// Language is supportive and operational throughout.
// No punitive metrics, no surveillance outputs.
// ============================================================

import type {
  KpiKey, KpiEntry, MonthlyTarget,
  TrafficLightStatus, TrendDirection,
} from '../kpiAnalyticsEngine'

export type { KpiKey, KpiEntry, MonthlyTarget, TrafficLightStatus, TrendDirection }

// ══════════════════════════════════════════════════════════════
// 1. SHARED PRIMITIVES
// ══════════════════════════════════════════════════════════════

export type TeamStatus =
  | 'stable'               // team operating well
  | 'monitoring'           // minor signals to watch
  | 'intervention_required'// one or more members need support
  | 'critical_operation'   // team-level operational risk

export type CoachingPriority = 'immediate' | 'near_term' | 'routine' | 'recognition'

export type OperationalRisk = 'none' | 'low' | 'medium' | 'high'

export type MomentumDirection = 'accelerating' | 'improving' | 'stable' | 'cooling' | 'needs_support'

// ── Reusable per-KPI snapshot ─────────────────────────────────
export interface KpiSnapshot {
  kpiKey:         KpiKey
  label:          string
  actual:         number
  target:         number
  achievementPct: number
  status:         TrafficLightStatus
}

// ══════════════════════════════════════════════════════════════
// 2. PHARMACIST PERFORMANCE SUMMARY
// ══════════════════════════════════════════════════════════════

/** Input for computing one pharmacist's operational summary */
export interface PharmacistInput {
  userId:      string
  displayName: string
  pharmacyId:  string

  /** All MTD KPI entries for this pharmacist */
  mtdEntries: KpiEntry[]

  /** Historical entries sorted asc (last 30 days) */
  historicalEntries?: KpiEntry[]

  /** Branch monthly target */
  target: MonthlyTarget | null

  /** Total days pharmacist was expected to submit this month */
  expectedSubmissionDays: number

  /** Days pharmacist actually submitted */
  actualSubmissionDays: number
}

export interface PharmacistPerformanceSummary {
  // Identity
  userId:      string
  displayName: string
  pharmacyId:  string

  // Core scores (0–100)
  performanceScore: number   // weighted achievement across KPIs
  consistencyScore: number   // submission regularity × low variance

  // Momentum
  momentumDirection: MomentumDirection
  momentumDelta:     number              // smoothed WoW change %

  // KPI profile
  strongestKpi: KpiKey
  weakestKpi:   KpiKey
  kpiSnapshots: KpiSnapshot[]
  overallAchPct: number

  // Operational signals
  operationalRisk:    OperationalRisk
  coachingPriority:   CoachingPriority
  coachingFocusAreas: KpiKey[]          // KPIs to focus coaching on

  // Accountability (operational, not punitive)
  submissionRate:      number            // 0–100 %
  activeDays:          number            // distinct days with submissions
  missedDays:          number
  improvingAfterSupport: boolean         // was previously low, now trending up
  // Coaching helpers (computed, backward-compat)
  isImproving:         boolean           // alias for improvingAfterSupport
  scoreVsPrevious:     number            // delta vs previous period (0 if unknown)

  // Meta
  month:       string
  computedAt:  string
}

// ══════════════════════════════════════════════════════════════
// 3. TEAM HEALTH SUMMARY
// ══════════════════════════════════════════════════════════════

export interface TeamSignal {
  type:    'strength' | 'weakness' | 'unstable' | 'risk'
  label:   string
  detail:  string
  kpiKey?: KpiKey
  affectedMemberCount?: number
}

export interface TeamHealthSummary {
  pharmacyId:  string
  month:       string

  // Overall state
  overallTeamStatus: TeamStatus
  teamStatusConfidence: number          // 0–1

  // Team-level scores
  teamPerformanceScore: number          // avg of member scores
  teamConsistencyScore: number          // avg of member consistency
  teamMomentumDirection: MomentumDirection

  // Signals
  operationalStrengths: TeamSignal[]
  operationalWeaknesses: TeamSignal[]
  unstableTeamSignals: TeamSignal[]

  // Distribution
  memberCount:        number
  activeMembers:      number            // submitted at least once this month
  highPerformers:     string[]          // userIds with score ≥ 80
  needsSupportList:   string[]          // userIds with high coaching priority

  // KPI-level team picture
  teamKpiSnapshot: KpiSnapshot[]        // aggregated across all members

  // Meta
  computedAt: string
}

// ══════════════════════════════════════════════════════════════
// 4. COACHING RECOMMENDATION
// ══════════════════════════════════════════════════════════════

export interface CoachingRecommendation {
  id:          string
  priority:    CoachingPriority
  title:       string
  detail:      string
  kpiKey?:     KpiKey
  targetUserId?: string             // null = team-level
  targetUserName?: string
  rationale:   string
  /** AI-ready hook: replace detail generation with LLM */
  _aiReady:    true
}

// ══════════════════════════════════════════════════════════════
// 5. ACCOUNTABILITY INSIGHT (operational, not punitive)
// ══════════════════════════════════════════════════════════════

export interface AccountabilityInsight {
  userId:         string
  displayName:    string
  // Operational reliability signals
  submissionRate: number             // % days submitted
  missedDays:     number
  consistentUnderperformance: boolean // 3+ consecutive weeks below 60%
  // Recovery signals
  showingImprovement: boolean
  improvementStreak:  number         // consecutive days improving
  // Support flag
  needsOperationalSupport: boolean
  supportDetail:  string
}


// ══════════════════════════════════════════════════════════════
// 8. TEAM TREND SUMMARY (Phase 3C)
// ══════════════════════════════════════════════════════════════

export type VolatilityLevel = 'low' | 'moderate' | 'high' | 'critical'
export type StressPattern   = 'none' | 'transient' | 'persistent' | 'escalating'
export type RecoveryTrend   = 'not_applicable' | 'emerging' | 'sustained' | 'strong'

export interface TeamTrendSummary {
  // Momentum
  teamMomentumDirection: MomentumDirection
  momentumDelta:         number      // smoothed WoW %
  momentumConfidence:    number      // 0–1, based on member count + consistency

  // Stability (0–100: 100 = perfectly consistent team)
  stabilityScore:        number
  stabilityDetail:       string

  // Improvement consistency: how many members improving vs total
  improvementConsistency: number     // 0–100 %
  sustainedImprovingCount: number    // members improving ≥ 2 consecutive periods
  improvingMemberIds:    string[]

  // Repeated operational stress
  repeatedOperationalStress: boolean
  stressPattern:             StressPattern
  stressDetail:              string
  atRiskMemberIds:           string[]

  // Recovery trend
  recoveryTrend:         RecoveryTrend
  recoveringMemberCount: number
  recoveringMemberIds:   string[]

  // Volatility signal
  teamVolatilitySignal:  VolatilityLevel
  volatilityDetail:      string
  isPolarised:           boolean     // top vs bottom gap > 40 pts

  // KPI profile
  teamKpiStrengths:  Array<{ kpiKey: string; avgAch: number }>
  teamKpiWeaknesses: Array<{ kpiKey: string; avgAch: number; affectedCount: number }>

  // Meta
  memberCount:    number
  computedAt:     string
}

// ══════════════════════════════════════════════════════════════
// 6. TEAM INTELLIGENCE RESULT
// ══════════════════════════════════════════════════════════════

export interface TeamIntelligenceResult {
  pharmacyId:  string
  month:       string
  generatedAt: string

  // Per-member summaries
  pharmacistSummaries: PharmacistPerformanceSummary[]

  // Team-level health
  teamHealth: TeamHealthSummary

  // Coaching outputs
  coachingRecommendations: CoachingRecommendation[]

  // Accountability insights (supportive framing)
  accountabilityInsights: AccountabilityInsight[]

  // Quick-access flags
  hasImmediateCoachingNeeds: boolean
  teamOperationalRisk:       OperationalRisk
  topPerformer:              string | null   // userId
  mostImproved:              string | null   // userId

  // Phase 3 additions (generator outputs)
  coachingFocusSummary:      string
  teamMomentum:              { direction: MomentumDirection; delta: number; confidence: number }
  teamStability:             { isStable: boolean; cv: number; isPolarised: boolean; detail: string }
  improvingMemberIds:        string[]
  atRiskMemberIds:           string[]
  topPerformerIds:           string[]
  operationalStressDetected: boolean
  teamKpiProfile:            { strengths: Array<{ kpiKey: string; avgAch: number }>; weaknesses: Array<{ kpiKey: string; avgAch: number; affectedCount: number }> }

  // Phase 3C: Team trend intelligence
  teamTrendSummary:          TeamTrendSummary
}

// ══════════════════════════════════════════════════════════════
// 7. GENERATOR INPUT
// ══════════════════════════════════════════════════════════════

export interface TeamIntelligenceInput {
  pharmacyId:  string
  month:       string
  pharmacists: PharmacistInput[]
}
