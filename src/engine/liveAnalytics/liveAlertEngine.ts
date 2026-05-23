// ============================================================
// Live Alert Engine v2 — Alert Quality Engine
// Phase 2: reduces false positives, deduplicates, cooldown.
// Pure function — no Firebase, no React.
// ============================================================

import { format, subDays, differenceInMinutes, parseISO } from 'date-fns'
import { KPI_META, KPI_KEYS, getDayProgress } from '../kpiAnalyticsEngine'
import type { LiveAnalyticsInput, KpiHealthSignal } from './liveAnalyticsTypes'
import type { LiveAlert, AlertType, AlertPriority } from './liveAnalyticsTypes'

// ── Alert fingerprint (for cooldown / dedup) ──────────────────
function fingerprint(type: AlertType, kpiKey?: string): string {
  return kpiKey ? `${type}:${kpiKey}` : type
}

// ── Confidence scoring per alert type ─────────────────────────
// Low confidence = noisy / easy to false-positive
const ALERT_CONFIDENCE: Record<AlertType, number> = {
  MISSING_ENTRY:       0.95,  // very reliable once past 10am
  KPI_CRITICAL:        0.90,  // reliable when truly critical
  PACE_DROP:           0.75,  // noisy but has other guards (day5+, healthy guard, min value)
  FORECAST_MISS:       0.85,  // reliable when model is stable
  MILESTONE_NEAR:      0.90,  // reliable
  TARGET_HIT:          0.99,  // 100% reliable — factual
  CONSECUTIVE_DECLINE: 0.80,  // requires 3 days evidence
}

// ── Cooldown windows (minutes) ────────────────────────────────
// How long to suppress same fingerprint after firing
const ALERT_COOLDOWN: Record<AlertType, number> = {
  MISSING_ENTRY:       60,   // re-alert hourly
  KPI_CRITICAL:        30,   // re-alert every 30min
  PACE_DROP:           120,  // cooldown 2h — very noisy
  FORECAST_MISS:       60,
  MILESTONE_NEAR:      240,  // only once per 4h
  TARGET_HIT:          999,  // fire once per day max
  CONSECUTIVE_DECLINE: 240,
}

// ── Minimum confidence threshold ─────────────────────────────
const MIN_CONFIDENCE = 0.70   // suppress alerts below this

// ── Alert factory ─────────────────────────────────────────────
function makeAlert(
  type:      AlertType,
  priority:  AlertPriority,
  title:     string,
  message:   string,
  extras:    Partial<LiveAlert> = {},
): LiveAlert {
  const fp = fingerprint(type, extras.kpiKey)
  return {
    id:               `alert-${type}-${Date.now()}`,
    type,
    priority,
    title,
    message,
    timestamp:        new Date().toISOString(),
    dismissed:        false,
    fingerprint:      fp,
    confidenceScore:  ALERT_CONFIDENCE[type] ?? 0.5,
    cooldownMinutes:  ALERT_COOLDOWN[type] ?? 60,
    ...extras,
  }
}

// ── Cooldown check against recent alert history ───────────────
// recentAlerts: previously fired alerts (session or last 4h)
function isOnCooldown(
  fp:           string,
  recentAlerts: LiveAlert[],
): boolean {
  const prev = recentAlerts.find((a) => a.fingerprint === fp && !a.dismissed)
  if (!prev) return false
  const ageMin = differenceInMinutes(new Date(), parseISO(prev.timestamp))
  return ageMin < (prev.cooldownMinutes ?? 60)
}

// ══════════════════════════════════════════════════════════════
// ALERT GENERATORS
// ══════════════════════════════════════════════════════════════

function missingEntryAlert(input: LiveAnalyticsInput): LiveAlert | null {
  const { todayEntries, now } = input
  const hour = now.getHours()

  if (hour < 10) return null            // too early
  if (todayEntries.length > 0) return null

  const urgency = hour >= 16 ? 'critical' : 'warning'
  return makeAlert(
    'MISSING_ENTRY', urgency,
    'No KPI Entry Today',
    hour >= 16
      ? 'End of day approaching — please submit today\'s KPI data.'
      : 'No data submitted yet today.',
    { action:'Enter KPIs', actionRoute:'/entry' },
  )
}

function criticalKpiAlerts(health: KpiHealthSignal[]): LiveAlert[] {
  return health
    .filter((h) => h.state === 'critical' && h.target > 0)
    .map((h) => makeAlert(
      'KPI_CRITICAL', 'critical',
      `${h.label} — Critical`,
      `${h.achievementPct}% of target (expected ${h.expectedPct}%). Pace ratio: ${Math.round(h.paceRatio * 100)}%.`,
      { kpiKey: h.kpiKey, value: h.achievementPct, action:'View Dashboard', actionRoute:'/dashboard' },
    ))
}

function forecastMissAlerts(health: KpiHealthSignal[]): LiveAlert[] {
  // Only fire when BOTH achievement AND forecast are bad (reduces false positives)
  return health
    .filter((h) =>
      h.forecastAchPct < 70 &&
      h.target > 0 &&
      h.state !== 'healthy' &&
      h.state !== 'recovering' &&
      h.achievementPct < h.expectedPct  // actually behind, not just forecasted
    )
    .map((h) => makeAlert(
      'FORECAST_MISS', h.forecastAchPct < 50 ? 'critical' : 'warning',
      `${h.label} — Forecast Miss`,
      `Projected ${h.forecastAchPct}% by month end. Current: ${h.achievementPct}% of target.`,
      { kpiKey: h.kpiKey, value: h.forecastAchPct },
    ))
}

function milestoneNearAlerts(health: KpiHealthSignal[]): LiveAlert[] {
  return health
    .filter((h) => h.achievementPct >= 90 && h.achievementPct < 100 && h.target > 0)
    .map((h) => {
      const remaining = h.target - h.mtdValue
      return makeAlert(
        'MILESTONE_NEAR', 'info',
        `${h.label} — Almost There!`,
        `${h.achievementPct}% — ${remaining.toLocaleString()} more to hit target.`,
        { kpiKey: h.kpiKey, value: h.achievementPct, action:'Enter KPIs', actionRoute:'/entry' },
      )
    })
}

function targetHitAlerts(health: KpiHealthSignal[]): LiveAlert[] {
  return health
    .filter((h) => h.achievementPct >= 100 && h.target > 0)
    .map((h) => makeAlert(
      'TARGET_HIT', 'info',
      `${h.label} — Target Hit! 🎯`,
      `${h.mtdValue.toLocaleString()} of ${h.target.toLocaleString()} — ${h.achievementPct}%`,
      { kpiKey: h.kpiKey, value: h.achievementPct },
    ))
}

// IMPROVED: requires 3 consecutive days AND a minimum absolute value
// Prevents firing on near-zero data (0→0→0 trivially "declines")
function consecutiveDeclineAlerts(input: LiveAnalyticsInput): LiveAlert[] {
  const { mtdEntries, now } = input
  const results: LiveAlert[] = []

  for (const k of KPI_KEYS) {
    const days = Array.from({ length: 4 }, (_, i) => {
      const d = format(subDays(now, i), 'yyyy-MM-dd')
      return mtdEntries.filter((e) => e.date === d)
        .reduce((s, e) => s + (Number(e[k as keyof typeof e]) || 0), 0)
    }).reverse()

    // Require: 3-day decline AND minimum value (not near-zero noise)
    const hasMinValue = days[0] >= 3
    const isDecline = days[3] < days[2] && days[2] < days[1] && days[1] < days[0] && hasMinValue

    if (!isDecline) continue

    results.push(makeAlert(
      'CONSECUTIVE_DECLINE', 'warning',
      `${KPI_META[k].en} — 3-Day Decline`,
      `${KPI_META[k].en} declining for 3 consecutive days. Review today's submission.`,
      { kpiKey: k },
    ))
  }

  return results
}

// IMPROVED: only fires when pace dropped by >20% vs yesterday AND current pace is meaningful
function paceDropAlerts(input: LiveAnalyticsInput, health: KpiHealthSignal[]): LiveAlert[] {
  const { mtdEntries, now } = input
  const results: LiveAlert[] = []
  const today     = format(now, 'yyyy-MM-dd')
  const yesterday = format(subDays(now, 1), 'yyyy-MM-dd')
  const dp        = getDayProgress(now)

  // Only emit pace drops when we're past day 5 of the month (enough data)
  if (dp.currentDay < 5) return []

  for (const h of health) {
    if (h.target <= 0) continue

    const todayVal = mtdEntries.filter((e) => e.date === today)
      .reduce((s, e) => s + (Number(e[h.kpiKey as keyof typeof e]) || 0), 0)
    const yestVal  = mtdEntries.filter((e) => e.date === yesterday)
      .reduce((s, e) => s + (Number(e[h.kpiKey as keyof typeof e]) || 0), 0)

    if (!yestVal || yestVal < 3) continue  // suppress near-zero noise

    const pctDrop = ((yestVal - todayVal) / yestVal) * 100
    if (pctDrop < 20) continue  // below threshold — not meaningful

    // Don't fire if KPI is already healthy overall
    if (h.state === 'healthy' || h.state === 'recovering') continue

    results.push(makeAlert(
      'PACE_DROP', 'warning',
      `${h.label} — Pace Drop`,
      `${Math.round(pctDrop)}% drop vs yesterday (${yestVal} → ${todayVal}). Monitor closely.`,
      { kpiKey: h.kpiKey, value: Math.round(pctDrop) },
    ))
  }

  return results
}

// ══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ══════════════════════════════════════════════════════════════

export function generateLiveAlerts(
  input:        LiveAnalyticsInput,
  health:       KpiHealthSignal[],
  recentAlerts: LiveAlert[] = [],  // Phase 2: pass previous alerts for cooldown
): LiveAlert[] {
  const ORDER: Record<AlertPriority, number> = { critical:0, warning:1, info:2 }

  const candidates: LiveAlert[] = [
    missingEntryAlert(input),
    ...criticalKpiAlerts(health),
    ...forecastMissAlerts(health),
    ...milestoneNearAlerts(health),
    ...targetHitAlerts(health),
    ...consecutiveDeclineAlerts(input),
    ...paceDropAlerts(input, health),
  ].filter((a): a is LiveAlert => a !== null)

  // ── Quality filters ───────────────────────────────────────
  const seen    = new Set<string>()
  const result: LiveAlert[] = []

  for (const alert of candidates.sort((a, b) => ORDER[a.priority] - ORDER[b.priority])) {
    // 1. Confidence filter
    if ((alert.confidenceScore ?? 1) < MIN_CONFIDENCE) {
      continue
    }

    // 2. Fingerprint dedup (within this generation pass)
    if (seen.has(alert.fingerprint)) continue
    seen.add(alert.fingerprint)

    // 3. Cooldown check
    if (isOnCooldown(alert.fingerprint, recentAlerts)) {
      continue
    }

    result.push(alert)
    if (result.length >= 8) break   // max 8 active alerts
  }

  return result
}

/** Count how many candidates were suppressed */
export function countSuppressedAlerts(
  input:        LiveAnalyticsInput,
  health:       KpiHealthSignal[],
  active:       LiveAlert[],
  recentAlerts: LiveAlert[] = [],
): number {
  // Re-generate without filters to count total candidates
  const all: LiveAlert[] = [
    missingEntryAlert(input),
    ...criticalKpiAlerts(health),
    ...forecastMissAlerts(health),
    ...milestoneNearAlerts(health),
    ...targetHitAlerts(health),
    ...consecutiveDeclineAlerts(input),
    ...paceDropAlerts(input, health),
  ].filter((a): a is LiveAlert => a !== null)

  return Math.max(0, all.length - active.length)
}
