// ============================================================
// Team Intelligence Layer — Public API
// Phase 3A + 3B + 3C
// ============================================================

// Types
export type {
  TeamStatus,
  CoachingPriority,
  OperationalRisk,
  MomentumDirection,
  VolatilityLevel,
  StressPattern,
  RecoveryTrend,
  KpiSnapshot,
  PharmacistInput,
  PharmacistPerformanceSummary,
  TeamSignal,
  TeamHealthSummary,
  CoachingRecommendation,
  AccountabilityInsight,
  TeamTrendSummary,
  TeamIntelligenceResult,
  TeamIntelligenceInput,
} from './teamIntelligenceTypes'

// Pharmacist performance engine
export {
  computePharmacistPerformance,
  computeConsistencyScore,
  computePharmacistMomentum,
} from './pharmacistPerformanceEngine'

// Team health engine
export { computeTeamHealth } from './teamHealthEngine'

// Coaching engine
export {
  buildCoachingRecommendations,
  buildTeamCoachingPlan,
} from './coachingEngine'

// Accountability engine
export { computeAccountabilityInsights } from './accountabilityEngine'

// Team trend engine — Phase 3C
export {
  generateTeamTrendSummary,
  computeTeamMomentum,
  computeTeamStability,
  computeTeamKpiProfile,
  identifyImprovingMembers,
  identifyAtRiskMembers,
  identifyTopPerformers,
  detectOperationalStress,
} from './teamTrendEngine'

// Main entry point
export { generateTeamIntelligence } from './teamIntelligenceGenerator'
