// ============================================================
// Regional Intelligence — Public API
// Import from this file, not from individual modules.
// ============================================================

// ── Types ─────────────────────────────────────────────────────
export type {
  // Period
  RegionalPeriodType,
  RegionalPeriod,

  // Input
  BranchRollupInput,

  // KPI rollup
  KpiRollupSummary,

  // Enums / union types
  RegionalRiskLevel,
  RegionalMomentumDirection,
  BranchOperationalStatus,

  // Data quality
  DataQualityFlagCode,
  DataQualitySeverity,
  DataQualityFlag,

  // Branch output
  BranchRollupSummary,

  // Regional rollup output
  RegionalKpiAverage,
  RegionalRiskConcentration,
  RecoverySignalStrength,
  RecoverySignal,
  RegionalRollupSummary,

  // Trend engine types
  RegionalTrendDirection,
  RegionalTrendInput,
  RegionalTrendAnalysis,

  // Risk engine types
  RegionalRiskReasonCode,
  RegionalRiskReason,
  RegionalPriorityFocusArea,
  RegionalExecutiveWarning,
  RegionalRiskAssessment,

  // Unified generator types
  RegionalIntelligenceInput,
  PortfolioRegionalSummary,
  ExecutiveFocusArea,
  PortfolioDataQualityWarning,
  RegionalIntelligenceOutput,
} from './regionalTypes'

// ── Engine functions ──────────────────────────────────────────
export { generateBranchRollup }      from './branchRollupEngine'
export { generateRegionalRollups }   from './regionalRollupEngine'
export {
  analyzeRegionalTrend,
  analyzeAllRegionalTrends,
}                                    from './regionalTrendEngine'
export {
  assessRegionalRisk,
  assessAllRegionalRisks,
}                                    from './regionalRiskEngine'

// ── Unified generator ─────────────────────────────────────────
export { generateRegionalIntelligence } from './regionalIntelligenceGenerator'
