// ============================================================
// Live Analytics Layer — Type Definitions
// Operational monitoring signals from live KPI data.
// ============================================================

import type { KpiKey, RiskLevel, TrafficLightStatus, KpiEntry, MonthlyTarget } from '../kpiAnalyticsEngine'

export type { KpiKey, RiskLevel, TrafficLightStatus, KpiEntry, MonthlyTarget }

// ══════════════════════════════════════════════════════════════
// 1. INPUT
// ══════════════════════════════════════════════════════════════

export interface LiveAnalyticsInput {
  userId:       string
  pharmacyId:   string
  pharmacyName: string
  role:         'admin' | 'manager' | 'pharmacist'

  /** Today's entries for this user/branch */
  todayEntries: KpiEntry[]

  /** Month-to-date entries */
  mtdEntries:   KpiEntry[]

  /** Historical entries sorted asc (last 14 days min) */
  historicalEntries: KpiEntry[]

  /** Current month target */
  target: MonthlyTarget | null

  /** Current timestamp */
  now: Date
}

// ══════════════════════════════════════════════════════════════
// 2. ACTIVITY FEED
// ══════════════════════════════════════════════════════════════

export type ActivityType =
  | 'KPI_ENTRY'       // new KPI submitted
  | 'TARGET_HIT'      // KPI reached 100%
  | 'MILESTONE'       // notable % milestone (50, 75, 90%)
  | 'PACE_CHANGE'     // pace improved or dropped significantly
  | 'RISK_CHANGE'     // risk level changed
  | 'DAY_PROGRESS'    // daily progress checkpoint

export type ActivitySeverity = 'info' | 'success' | 'warning' | 'critical'

export interface ActivityFeedItem {
  id:          string
  type:        ActivityType
  severity:    ActivitySeverity
  title:       string
  body:        string
  kpiKey?:     KpiKey
  value?:      number
  timestamp:   string          // ISO
  relativeTime: string         // "just now", "2h ago"
  icon:        string          // emoji
}

// ══════════════════════════════════════════════════════════════
// 3. KPI HEALTH
// ══════════════════════════════════════════════════════════════

export type KpiHealthState =
  | 'healthy'    // on track, pace good
  | 'recovering' // was behind, now improving consistently
  | 'watch'      // slightly behind, needs attention
  | 'unstable'   // fluctuating — neither improving nor declining consistently
  | 'risk'       // behind with slow pace
  | 'critical'   // significantly behind, recovery unlikely

export interface KpiHealthSignal {
  kpiKey:         KpiKey
  label:          string
  state:          KpiHealthState
  achievementPct: number
  expectedPct:    number       // where we should be today
  delta:          number       // actual - expected
  paceRatio:      number       // current/required pace
  forecastAchPct: number
  todayValue:     number
  mtdValue:       number
  target:         number
  // Pulse direction: is it getting better or worse vs yesterday?
  pulse:          'up' | 'down' | 'flat'
  pulseValue:     number       // today vs yesterday delta
}

export const KPI_HEALTH_COLORS: Record<KpiHealthState, {
  color: string; bg: string; border: string; label: string
}> = {
  healthy:   { color:'#22c55e', bg:'rgba(34,197,94,0.08)',   border:'rgba(34,197,94,0.18)',   label:'Healthy'   },
  recovering:{ color:'#00d2ad', bg:'rgba(0,210,173,0.08)',   border:'rgba(0,210,173,0.18)',   label:'Recovering'},
  watch:     { color:'#60a5fa', bg:'rgba(96,165,250,0.08)',  border:'rgba(96,165,250,0.18)',  label:'Watch'     },
  unstable:  { color:'#c084fc', bg:'rgba(192,132,252,0.08)', border:'rgba(192,132,252,0.18)', label:'Unstable'  },
  risk:      { color:'#f59e0b', bg:'rgba(245,158,11,0.08)',  border:'rgba(245,158,11,0.18)',  label:'Risk'      },
  critical:  { color:'#ef4444', bg:'rgba(239,68,68,0.08)',   border:'rgba(239,68,68,0.18)',   label:'Critical'  },
}

// ══════════════════════════════════════════════════════════════
// 4. LIVE ALERTS
// ══════════════════════════════════════════════════════════════

export type AlertType =
  | 'MISSING_ENTRY'       // today's KPI not yet submitted
  | 'KPI_CRITICAL'        // KPI has gone critical
  | 'PACE_DROP'           // pace dropped significantly vs yesterday
  | 'FORECAST_MISS'       // projected EOM < 70%
  | 'MILESTONE_NEAR'      // within 5% of hitting target
  | 'TARGET_HIT'          // KPI hit 100%+
  | 'CONSECUTIVE_DECLINE' // 3+ days declining

export type AlertPriority = 'critical' | 'warning' | 'info'

export interface LiveAlert {
  id:          string
  type:        AlertType
  priority:    AlertPriority
  title:       string
  message:     string
  kpiKey?:     KpiKey
  value?:      number
  action?:     string          // CTA label
  actionRoute?: string         // navigate destination
  timestamp:   string
  dismissed:   boolean
  // Quality fields (Phase 2)
  fingerprint:       string    // hash for dedup/cooldown
  confidenceScore:   number    // 0..1 — how reliable is this alert
  cooldownMinutes:   number    // suppress same fingerprint for N minutes
  suppressionReason?: string   // why it was suppressed
}

// ══════════════════════════════════════════════════════════════
// 5. MOMENTUM
// ══════════════════════════════════════════════════════════════

export type MomentumDirection = 'surging' | 'improving' | 'stable' | 'cooling' | 'stalling'

export interface KpiMomentumSignal {
  kpiKey:             KpiKey
  label:              string
  direction:          MomentumDirection
  todayVsYesterday:   number   // % change
  weekVsPrevWeek:     number   // % change (smoothed)
  streakDays:         number   // consecutive up or down days
  streakDirection:    'up' | 'down' | 'none'
  // Phase 2 quality fields
  momentumConfidence: number   // 0..1 — based on data density
  isAnomaly:         boolean   // spike vs sustained change
  smoothedDelta:     number    // 3-period EMA smoothed change
  sustainedDays:     number    // consecutive days above/below avg
}

export interface BranchMomentum {
  pharmacyId:      string
  overallDirection: MomentumDirection
  overallDelta:     number     // avg delta across KPIs
  kpiMomentum:      KpiMomentumSignal[]
  dominantKpi:      KpiKey     // KPI with most momentum
}

// ══════════════════════════════════════════════════════════════
// 6. BRANCH OPERATIONAL STATUS
// ══════════════════════════════════════════════════════════════

export type OperationalStatus =
  | 'NOMINAL'       // everything on track
  | 'MONITORING'    // 1-2 KPIs need attention
  | 'INTERVENTION'  // 3+ KPIs at risk
  | 'CRITICAL'      // majority at critical level

export interface BranchOperationalStatus {
  pharmacyId:        string
  pharmacyName:      string
  status:            OperationalStatus
  submittedToday:    boolean
  kpiHealth:         KpiHealthSignal[]
  activeAlerts:      LiveAlert[]
  momentum:          BranchMomentum
  prioritySignals:   PrioritySignal[]
  lastUpdated:       string
}

// ══════════════════════════════════════════════════════════════
// 7. PRIORITY SIGNALS
// ══════════════════════════════════════════════════════════════

export type SignalStrength = 'strong' | 'moderate' | 'weak'

export interface PrioritySignal {
  id:       string
  strength: SignalStrength
  label:    string
  detail:   string
  kpiKey?:  KpiKey
  value?:   number
}

// ══════════════════════════════════════════════════════════════
// 9. OPERATIONAL STATUS ENGINE (Phase 2)
// ══════════════════════════════════════════════════════════════

export type MasterOperationalState =
  | 'stable'                // all KPIs on track, no active alerts
  | 'monitoring'            // 1-2 watch/risk KPIs, low-priority alerts
  | 'intervention_required' // critical KPI or high-priority alert
  | 'critical_operation'    // multiple critical KPIs, urgent action needed

export interface OperationalStatusAssessment {
  state:              MasterOperationalState
  confidence:         number                  // 0..1
  dominantSignal:     string                  // human-readable summary
  criticalFactors:    string[]                // what's driving this state
  recommendedActions: string[]
  stateChangedFrom?:  MasterOperationalState  // previous state
  stateChangedAt?:    string
}

// ══════════════════════════════════════════════════════════════
// 8. FULL LIVE ANALYTICS RESULT
// ══════════════════════════════════════════════════════════════

export interface LiveAnalyticsResult {
  userId:      string
  pharmacyId:  string
  generatedAt: string

  // Core outputs
  kpiHealth:       KpiHealthSignal[]
  activityFeed:    ActivityFeedItem[]
  alerts:          LiveAlert[]
  momentum:        BranchMomentum
  operationalStatus: BranchOperationalStatus
  prioritySignals: PrioritySignal[]

  // Summary flags
  hasSubmittedToday: boolean
  overallHealth:     KpiHealthState
  criticalKpiCount:  number
  activeAlertCount:  number
  // Phase 2
  operationalAssessment: OperationalStatusAssessment
  suppressedAlertCount:  number
}
