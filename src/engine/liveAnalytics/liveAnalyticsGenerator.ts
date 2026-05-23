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
import { KPI_KEYS, KPI_META }                     from '../kpiAnalyticsEngine'
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
): LiveAnalyticsResult {
  const prevAlerts = recentAlerts ?? []

  // 1. Compute all signals
  const kpiHealth    = computeKpiHealth(input)
  const activityFeed = generateActivityFeed(input)
  const alerts       = generateLiveAlerts(input, kpiHealth, prevAlerts)
  const momentum     = computeLiveMomentum(input)

  // 2. Operational assessment (Phase 2 master state)
  const operationalAssessment = assessOperationalStatus(
    kpiHealth, alerts, momentum,
  )

  // 3. Aggregate
  const overallHealth        = computeOverallHealth(kpiHealth)
  const criticalKpiCount     = kpiHealth.filter((h) => h.state === 'critical').length
  const activeAlertCount     = alerts.filter((a) => !a.dismissed).length
  const hasSubmittedToday    = input.todayEntries.length > 0
  const suppressedAlertCount = countSuppressedAlerts(input, kpiHealth, alerts, prevAlerts)

  const prioritySignals = buildPrioritySignals(input, kpiHealth, momentum)

  // Legacy op status (mapped for backward compat)
  const legacyOpStatus = toOperationalStatus(operationalAssessment.state)
  const riskCount  = kpiHealth.filter((h) => h.state === 'risk').length
  const watchCount = kpiHealth.filter((h) => h.state === 'watch' || h.state === 'unstable').length

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
