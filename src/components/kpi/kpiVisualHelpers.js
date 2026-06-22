// ============================================================
// KPI Visual Helpers — shared between Dashboard and Branch
// Intelligence (Phase 5A extraction).
//
// Pure functions only — no React, no Firestore, no Date.
// Originally defined inline in DashboardPage.jsx (Enterprise UX
// Sprint Phase Next / KPI Card Polish Sprint). Extracted verbatim
// here so both DashboardPage and BranchIntelligencePage import the
// SAME functions — no forking, no duplicate color/status logic.
// ============================================================

// Phase 1B: colors sourced from registry resolver.
// FALLBACK_COLORS and DEFAULT_KPI_COLOR exported here for backward
// compatibility — Dashboard and BranchIntelligencePage import from
// this file and their import statements are unchanged.
export { getAllKpiColors as _getAllKpiColors, DEFAULT_KPI_COLOR } from '../../engine/kpiRegistry/kpiMetaResolver'
export { getKpiColor } from '../../engine/kpiRegistry/kpiMetaResolver'

// FALLBACK_COLORS kept as a static object for components that
// destructure it as a map (e.g. FALLBACK_COLORS[k]).
// Values are identical to the registry resolver — no visual change.
export const FALLBACK_COLORS = {
  wasfaty: '#6366f1', omni: '#ef4444', wellness: '#f59e0b',
  basket: '#22c55e', crossSelling: '#8b5cf6',
}

// ── Enterprise Status Color System ────────────────────────────
// 5-tier system, replacing "Neon Green Fatigue" where every KPI >=100%
// (144%, 178%, 200%) used the same bright #22c55e at full opacity.
//
//   Critical          → red     (#ef4444) — severe underperformance
//   Behind Pace       → amber   (#f59e0b/#f97316) — needs intervention
//   On Pace           → cyan    (#00d2ad) — healthy trajectory
//   Exceeding Pace    → green   (#22c55e) — above pace, NOT YET at 100% target
//   Target Achieved   → muted grey-green (#6b9c84) — done, de-emphasized
//
// Labels are pace-explicit (not absolute achievement) because a KPI can be
// at 39% and still be "On Pace" when only 37% of the month has elapsed.
export const KPI_STATUS_BADGE = {
  ACHIEVED:             { label: 'Target Achieved', color: '#6b9c84', bg: 'rgba(107,156,132,0.06)', border: 'rgba(107,156,132,0.18)' },
  EXCEEDING:            { label: 'Exceeding Pace',  color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.22)'  },
  ON_PACE:              { label: 'On Pace',         color: '#00d2ad', bg: 'rgba(0,210,173,0.08)', border: 'rgba(0,210,173,0.22)'  },
  SLIGHTLY_BEHIND:      { label: 'Slightly Behind', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.28)' },
  SIGNIFICANTLY_BEHIND: { label: 'Behind Pace',     color: '#f97316', bg: 'rgba(249,115,22,0.08)',  border: 'rgba(249,115,22,0.28)' },
  CRITICAL:             { label: 'Critical',        color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.28)'  },
}

/**
 * Derive status badge for a single KPI from its stats + pace.
 * Target reached (>=100%) → ACHIEVED (muted), not bright EXCEEDING green.
 * EXCEEDING is reserved for KPIs tracking above pace but not yet at 100%.
 *
 * @param stats { target, achievementPct } — kpiStats[k]
 * @param pace  { paceStatus } | undefined — paceMap[k]
 */
export function kpiBadge(stats, pace) {
  if (!stats || stats.target <= 0) return null
  if (stats.achievementPct >= 100) return KPI_STATUS_BADGE.ACHIEVED
  const ps = pace?.paceStatus
  if (ps === 'EXCEEDING') return KPI_STATUS_BADGE.EXCEEDING
  return KPI_STATUS_BADGE[ps] ?? KPI_STATUS_BADGE.CRITICAL
}

/**
 * Hero-level status color for cards without a per-KPI badge (Forecast EOM,
 * Team Status, Branch Health). Same 5-tier mapping applied to a raw %.
 */
export function enterpriseStatusColor(pct, expectedPct) {
  if (pct >= 100) return KPI_STATUS_BADGE.ACHIEVED.color
  if (pct == null || expectedPct == null) return KPI_STATUS_BADGE.ON_PACE.color
  const delta = pct - expectedPct
  if (delta >= 5)   return KPI_STATUS_BADGE.EXCEEDING.color
  if (delta >= -5)  return KPI_STATUS_BADGE.ON_PACE.color
  if (delta >= -15) return KPI_STATUS_BADGE.SLIGHTLY_BEHIND.color
  if (delta >= -30) return KPI_STATUS_BADGE.SIGNIFICANTLY_BEHIND.color
  return KPI_STATUS_BADGE.CRITICAL.color
}

/**
 * Pace context line — shows ±pts vs expected to explain why a low-%
 * KPI can be "On Pace".
 *
 * @param stats      { target, achievementPct } — kpiStats[k]
 * @param expectedPct number — Math.round(dayRatio * 100), or
 *                     viewModel.expectedPace.kpiExpectedPct[k] in
 *                     Branch Intelligence (Phase 4C source)
 */
export function kpiVsExpected(stats, expectedPct) {
  if (!stats || stats.target <= 0) return null
  const delta = stats.achievementPct - expectedPct
  if (delta >= 0) return { text: `+${delta}pts vs expected`, color: '#22c55e' }
  return { text: `${delta}pts vs expected`, color: '#f59e0b' }
}

/**
 * Required Daily Pace — display-layer guard, used by components that
 * derive remainingGap/remainingDays from props rather than reading an
 * already-engine-computed paceMap entry (e.g. KpiCard, which is only
 * given entry/target and an optional daysRemaining prop).
 *
 * requiredDaily = remainingGap / remainingDays, rounded to 1 decimal.
 *
 * Guards (never divide by zero, never return Infinity/NaN):
 *   - remainingGap null/undefined  → null   (not applicable — no gap to pace)
 *   - remainingGap <= 0            → 0      (target already met)
 *   - remainingDays null/undefined → null   (caller didn't supply day data)
 *   - remainingDays <= 0 or non-finite → 0  (no time left / bad input)
 *   - division result non-finite   → 0
 */
export function computeRequiredDailyPace(remainingGap, remainingDays) {
  if (remainingGap === null || remainingGap === undefined) return null
  const gap = Number(remainingGap)
  if (!Number.isFinite(gap) || gap <= 0) return 0

  if (remainingDays === null || remainingDays === undefined) return null
  const days = Number(remainingDays)
  if (!Number.isFinite(days) || days <= 0) return 0

  const pace = gap / days
  if (!Number.isFinite(pace)) return 0
  return Math.round(pace * 10) / 10
}
