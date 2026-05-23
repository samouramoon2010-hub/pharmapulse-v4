// ============================================================
// Live Analytics Layer — Public API v2
// ============================================================

export type {
  LiveAnalyticsInput,
  ActivityFeedItem,
  ActivityType,
  ActivitySeverity,
  KpiHealthSignal,
  KpiHealthState,
  LiveAlert,
  AlertType,
  AlertPriority,
  KpiMomentumSignal,
  BranchMomentum,
  MomentumDirection,
  BranchOperationalStatus,
  OperationalStatus,
  PrioritySignal,
  LiveAnalyticsResult,
  MasterOperationalState,
  OperationalStatusAssessment,
} from './liveAnalyticsTypes'

export { KPI_HEALTH_COLORS } from './liveAnalyticsTypes'

// Engines
export { computeKpiHealth, computeOverallHealth }           from './kpiHealthEngine'
export { generateActivityFeed }                             from './activityFeedEngine'
export { generateLiveAlerts, countSuppressedAlerts }        from './liveAlertEngine'
export { computeLiveMomentum }                              from './liveMomentumEngine'
export { assessOperationalStatus }                          from './operationalStatusEngine'

// Main entry points
export { generateLiveAnalytics, buildLiveInput }            from './liveAnalyticsGenerator'
