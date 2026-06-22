// ============================================================
// Live Analytics Generator v2
// Orchestrates all engines. Phase 2: uses operational status
// engine, passes recentAlerts for cooldown, tracks suppression.
// Pure function — no Firebase, no React.
// ============================================================

import { computeKpiHealth, computeOverallHealth } from './kpiHealthEngine'
import { generateActivityFeed }                    from './activityFeedEngine'
import { generateLiveAlerts, countSuppressedAlerts } from './liveAlertEngine'
import { computeLiveMomentum }                     from './liveMomentumEngine'
import { assessOperationalStatus }                 from './operationalStatusEngine'
import { getKpiWeightForKey }                      from '../kpiAnalyticsEngine'
import { format }                                  from 'date-fns'

import type { LiveAnalyticsInput }                 from './liveAnalyticsTypes'
import type {
  LiveAnalyticsResult,
  BranchOperationalStatus,
  OperationalStatus,
  PrioritySignal,
  LiveAlert,
  MasterOperationalState,
} from './liveAnalyticsTypes'

// Protected Engines Migration Phase D — Live Analytics orchestrator.
// registry is optional and simply passed through to the 4 sub-engines
// that accept it. No current caller of generateLiveAnalytics() passes a
// registry, so behavior is unchanged.
import type { KpiRegistry } from '../kpiRegistry'

let _signalCounter = 0

// ── Map master state → legacy OperationalStatus ──────────────
// Keeps backward-compat with existing Dashboard code
function toOperationalStatus(state: MasterOperationalState): OperationalStatus {
  switch (state) {
    case 'stable':               return 'NOMINAL'
    case 'monitoring':           return 'MONITORING'
    case 'intervention_required':return 'INTERVENTION'
    case 'critical_operation':   return 'CRITICAL'
  }
}

// ── Priority signals ──────────────────────────────────────────
function buildPrioritySignals(
  input:    LiveAnalyticsInput,
  health:   ReturnType<typeof computeKpiHealth>,
  momentum: ReturnType<typeof computeLiveMomentum>,
): PrioritySignal[] {
  const signals: PrioritySignal[] = []

  const sorted = [...health].sort((a, b) => a.achievementPct - b.achievementPct)
  const worst  = sorted[0]
  if (worst && worst.state !== 'healthy' && worst.state !== 'recovering' && worst.target > 0) {
    signals.push({
      id:       `sig-${++_signalCounter}`,
      strength: worst.state === 'critical' ? 'strong' : 'moderate',
      label:    `${worst.label} needs focus`,
      detail:   `${worst.achievementPct}% vs ${worst.expectedPct}% expected — ${worst.state}`,
      kpiKey:   worst.kpiKey,
      value:    worst.achievementPct,
    })
  }

  const near = health.find((h) => h.achievementPct >= 88 && h.achievementPct < 100 && h.target > 0)
  if (near) {
    signals.push({
      id:       `sig-${++_signalCounter}`,
      strength: 'moderate',
      label:    `${near.label} within reach`,
      detail:   `${near.achievementPct}% — ${(near.target - near.mtdValue).toLocaleString()} to go`,
      kpiKey:   near.kpiKey,
      value:    near.achievementPct,
    })
  }

  // Only include high-confidence momentum signals
  const surge = momentum.kpiMomentum.find(
    (m) => m.direction === 'surging' && m.momentumConfidence >= 0.5 && !m.isAnomaly
  )
  if (surge) {
    signals.push({
      id:       `sig-${++_signalCounter}`,
      strength: 'moderate',
      label:    `${surge.label} surging`,
      detail:   `+${surge.smoothedDelta}% (smoothed WoW)`,
      kpiKey:   surge.kpiKey,
      value:    surge.smoothedDelta,
    })
  }

  const stall = momentum.kpiMomentum.find(
    (m) => m.direction === 'stalling' && m.momentumConfidence >= 0.5 && m.sustainedDays >= 3
  )
  if (stall) {
    signals.push({
      id:       `sig-${++_signalCounter}`,
      strength: 'strong',
      label:    `${stall.label} stalling`,
      detail:   `${stall.smoothedDelta}% smoothed WoW — ${stall.sustainedDays} days`,
      kpiKey:   stall.kpiKey,
      value:    stall.smoothedDelta,
    })
  }

  return signals.slice(0, 5)
}

// ── Main generator ────────────────────────────────────────────
export function generateLiveAnalytics(
  input:         LiveAnalyticsInput,
  recentAlerts?: LiveAlert[],          // Phase 2: pass for cooldown checking
  registry?:     KpiRegistry,
): LiveAnalyticsResult {
  const prevAlerts = recentAlerts ?? []

  // 1. Compute all signals
  // Core KPI Dependency Removal — Stage F: kpiHealth widens to every active
  // production_evaluation KPI for display when a registry is supplied. The
  // aggregates below (overallHealth, counts, priority signals,
  // operationalAssessment) are weight-gated — only KPIs with registry
  // weight > 0 feed them — so they stay byte-identical with the live
  // DEFAULT_KPI_REGISTRY today (every non-Core KPI there has weight 0).
  const kpiHealth    = computeKpiHealth(input, registry)
  const weightedHealth = registry
    ? kpiHealth.filter((h) => getKpiWeightForKey(h.kpiKey, registry) > 0)
    : kpiHealth
  const activityFeed = generateActivityFeed(input, registry)
  // generateLiveAlerts derives KPI_CRITICAL/FORECAST_MISS/MILESTONE_NEAR/
  // TARGET_HIT alerts directly from whatever health array it's given —
  // feeding it the full widened kpiHealth would let a weight-0 KPI (e.g.
  // 'sales', which has a target in the live registry's branch fixtures)
  // generate new alerts and shift alertScore/operationalAssessment. Pass
  // the weight-gated subset to keep that aggregate zero-drift, same as
  // overallHealth above.
  const alerts       = generateLiveAlerts(input, weightedHealth, prevAlerts, registry)
  const momentum     = computeLiveMomentum(input, registry)

  // 2. Operational assessment (Phase 2 master state)
  const operationalAssessment = assessOperationalStatus(
    weightedHealth, alerts, momentum,
  )

  // 3. Aggregate
  const overallHealth        = computeOverallHealth(weightedHealth)
  const criticalKpiCount     = weightedHealth.filter((h) => h.state === 'critical').length
  const activeAlertCount     = alerts.filter((a) => !a.dismissed).length
  const hasSubmittedToday    = input.todayEntries.length > 0
  const suppressedAlertCount = countSuppressedAlerts(input, weightedHealth, alerts, prevAlerts, registry)

  const prioritySignals = buildPrioritySignals(input, weightedHealth, momentum)

  // Legacy op status (mapped for backward compat)
  const legacyOpStatus = toOperationalStatus(operationalAssessment.state)
  const riskCount  = weightedHealth.filter((h) => h.state === 'risk').length
  const watchCount = weightedHealth.filter((h) => h.state === 'watch' || h.state === 'unstable').length

  const operationalStatus: BranchOperationalStatus = {
    pharmacyId:      input.pharmacyId,
    pharmacyName:    input.pharmacyName,
    status:          legacyOpStatus,
    submittedToday:  hasSubmittedToday,
    kpiHealth,
    activeAlerts:    alerts.filter((a) => !a.dismissed),
    momentum,
    prioritySignals,
    lastUpdated:     input.now.toISOString(),
  }

  return {
    userId:      input.userId,
    pharmacyId:  input.pharmacyId,
    generatedAt: input.now.toISOString(),
    kpiHealth,
    activityFeed,
    alerts,
    momentum,
    operationalStatus,
    prioritySignals,
    hasSubmittedToday,
    overallHealth,
    criticalKpiCount,
    activeAlertCount,
    operationalAssessment,
    suppressedAlertCount,
  }
}

// ── Convenience: build input from store data ──────────────────
export function buildLiveInput(
  userId:       string,
  pharmacyId:   string,
  pharmacyName: string,
  role:         LiveAnalyticsInput['role'],
  allEntries:   LiveAnalyticsInput['mtdEntries'],
  target:       LiveAnalyticsInput['target'],
): LiveAnalyticsInput {
  const now       = new Date()
  const today     = format(now, 'yyyy-MM-dd')
  const monthStr  = format(now, 'yyyy-MM')
  const monthFrom = `${monthStr}-01`
  const monthLast = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthTo   = `${monthStr}-${String(monthLast).padStart(2,'0')}`

  const todayEntries      = allEntries.filter((e) => e.date === today)
  const mtdEntries        = allEntries.filter((e) => e.date >= monthFrom && e.date <= monthTo)
  const historicalEntries = [...allEntries].sort((a, b) => a.date.localeCompare(b.date)).slice(-60)

  return {
    userId, pharmacyId, pharmacyName, role,
    todayEntries, mtdEntries, historicalEntries,
    target, now,
  }
}
