// ============================================================
// Operational Status Engine
// Derives the master operational state for a branch from
// all live signals combined.
// Pure function — no Firebase, no React.
// ============================================================

import type {
  KpiHealthSignal,
  LiveAlert,
  BranchMomentum,
  MasterOperationalState,
  OperationalStatusAssessment,
} from './liveAnalyticsTypes'

// ── Signal weights ────────────────────────────────────────────
const HEALTH_WEIGHT = 0.45
const ALERT_WEIGHT  = 0.35
const MOMENTUM_WEIGHT = 0.20

// ── Health signal score (0..100) ─────────────────────────────
function healthScore(health: KpiHealthSignal[]): number {
  if (!health.length) return 50  // no data = neutral

  const STATE_SCORE: Record<string, number> = {
    healthy:    100,
    recovering:  75,
    watch:       60,
    unstable:    45,
    risk:        30,
    critical:     0,
  }

  const withTarget  = health.filter((h) => h.target > 0)
  if (!withTarget.length) return 50

  const avg = withTarget.reduce((sum, h) => sum + (STATE_SCORE[h.state] ?? 50), 0)
    / withTarget.length

  return Math.round(avg)
}

// ── Alert signal score (0..100; lower = worse) ───────────────
function alertScore(alerts: LiveAlert[]): number {
  const active = alerts.filter((a) => !a.dismissed)
  if (!active.length) return 100

  const PRIORITY_PENALTY: Record<string, number> = {
    critical: 40,
    warning:  20,
    info:      5,
  }

  const totalPenalty = active.reduce(
    (sum, a) => sum + (PRIORITY_PENALTY[a.priority] ?? 10),
    0
  )
  return Math.max(0, 100 - totalPenalty)
}

// ── Momentum score (0..100) ──────────────────────────────────
function momentumScore(momentum: BranchMomentum): number {
  const DIRECTION_SCORE: Record<string, number> = {
    surging:   100,
    improving:  75,
    stable:     60,
    cooling:    40,
    stalling:   15,
  }
  return DIRECTION_SCORE[momentum.overallDirection] ?? 50
}

// ── Map composite score to master state ──────────────────────
function scoreToState(composite: number): MasterOperationalState {
  if (composite >= 80) return 'stable'
  if (composite >= 55) return 'monitoring'
  if (composite >= 30) return 'intervention_required'
  return 'critical_operation'
}

// ── Build critical factors list ───────────────────────────────
function buildCriticalFactors(
  health:   KpiHealthSignal[],
  alerts:   LiveAlert[],
  momentum: BranchMomentum,
): string[] {
  const factors: string[] = []

  // Critical KPIs
  const criticalKpis = health.filter((h) => h.state === 'critical' && h.target > 0)
  if (criticalKpis.length) {
    factors.push(`${criticalKpis.length} critical KPI${criticalKpis.length > 1 ? 's' : ''}: ${criticalKpis.map((h) => h.label).join(', ')}`)
  }

  // High-priority alerts
  const critAlerts = alerts.filter((a) => a.priority === 'critical' && !a.dismissed)
  if (critAlerts.length) {
    factors.push(`${critAlerts.length} critical alert${critAlerts.length > 1 ? 's' : ''} active`)
  }

  // Stalling momentum
  if (momentum.overallDirection === 'stalling') {
    factors.push(`Momentum stalling (${momentum.overallDelta}% WoW)`)
  }

  // Unstable KPIs
  const unstable = health.filter((h) => h.state === 'unstable')
  if (unstable.length) {
    factors.push(`${unstable.length} KPI${unstable.length > 1 ? 's' : ''} showing unstable pattern`)
  }

  return factors
}

// ── Build recommended actions ─────────────────────────────────
function buildRecommendedActions(
  state:    MasterOperationalState,
  health:   KpiHealthSignal[],
  alerts:   LiveAlert[],
): string[] {
  const actions: string[] = []

  switch (state) {
    case 'critical_operation':
      actions.push('Immediate manager review required')
      const critKpis = health.filter((h) => h.state === 'critical').map((h) => h.label)
      if (critKpis.length) actions.push(`Focus on: ${critKpis.slice(0, 2).join(', ')}`)
      if (alerts.some((a) => a.type === 'MISSING_ENTRY')) actions.push('Submit today\'s KPI data immediately')
      break

    case 'intervention_required':
      actions.push('Review KPI performance with team')
      const riskKpis = health.filter((h) => h.state === 'risk').map((h) => h.label)
      if (riskKpis.length) actions.push(`At-risk KPIs: ${riskKpis.slice(0, 2).join(', ')}`)
      break

    case 'monitoring':
      const watchKpis = health.filter((h) => h.state === 'watch' || h.state === 'unstable')
      if (watchKpis.length) actions.push(`Monitor: ${watchKpis.slice(0, 2).map((h) => h.label).join(', ')}`)
      actions.push('Maintain current pace')
      break

    case 'stable':
      const recovering = health.filter((h) => h.state === 'recovering')
      if (recovering.length) {
        actions.push(`${recovering.map((h) => h.label).join(', ')} recovering — maintain momentum`)
      } else {
        actions.push('On track — maintain current performance')
      }
      break
  }

  return actions
}

// ── Dominant signal summary ───────────────────────────────────
function buildDominantSignal(
  state:    MasterOperationalState,
  health:   KpiHealthSignal[],
  momentum: BranchMomentum,
  composite: number,
): string {
  const withTarget = health.filter((h) => h.target > 0)
  if (!withTarget.length) return 'No target data available'

  const critCount = withTarget.filter((h) => h.state === 'critical').length
  const goodCount = withTarget.filter((h) => h.state === 'healthy' || h.state === 'recovering').length

  switch (state) {
    case 'stable':
      return goodCount === withTarget.length
        ? 'All KPIs on track'
        : `${goodCount}/${withTarget.length} KPIs on track — ${momentum.overallDirection}`
    case 'monitoring':
      return `Performance needs attention — composite ${composite}/100`
    case 'intervention_required':
      return `${critCount} critical KPI${critCount > 1 ? 's' : ''} — immediate action needed`
    case 'critical_operation':
      return `Critical operations state — ${critCount} KPI${critCount > 1 ? 's' : ''} at critical level`
  }
}

// ── Main function ─────────────────────────────────────────────
export function assessOperationalStatus(
  health:   KpiHealthSignal[],
  alerts:   LiveAlert[],
  momentum: BranchMomentum,
  previousState?: MasterOperationalState,
): OperationalStatusAssessment {
  // Weighted composite score
  const hs = healthScore(health)
  const as_ = alertScore(alerts)
  const ms = momentumScore(momentum)

  const composite = Math.round(
    hs * HEALTH_WEIGHT + as_ * ALERT_WEIGHT + ms * MOMENTUM_WEIGHT
  )

  const state           = scoreToState(composite)
  const criticalFactors = buildCriticalFactors(health, alerts, momentum)
  const recommended     = buildRecommendedActions(state, health, alerts)
  const dominantSignal  = buildDominantSignal(state, health, momentum, composite)

  return {
    state,
    confidence:         Math.min(0.95, 0.4 + (health.filter((h) => h.target > 0).length / 5) * 0.55),
    dominantSignal,
    criticalFactors,
    recommendedActions: recommended,
    stateChangedFrom:   previousState !== state ? previousState : undefined,
    stateChangedAt:     previousState !== state ? new Date().toISOString() : undefined,
  }
}
