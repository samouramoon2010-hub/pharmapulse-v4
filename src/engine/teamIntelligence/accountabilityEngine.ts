// ============================================================
// Accountability Engine
// Tracks operational reliability with supportive framing.
// Identifies: submission patterns, repeated underperformance,
// and — critically — improvement and recovery signals.
//
// Language principle:
//   "missed submissions" → "data gaps to address"
//   "underperformer"    → "member needing support"
//   "low submission"    → "submission habit to develop"
// Pure function — no Firebase, no React.
// ============================================================

import { format, subDays, differenceInDays } from 'date-fns'
import { KPI_META, KPI_KEYS, sumKpi, computeAchievementPct, getProductionEngineKeys } from '../kpiAnalyticsEngine'

// Protected Engines Migration Phase A — Team Intelligence Engine
// (Accountability). registry optional; omitted at every current call
// site, so behavior is unchanged today.
//
// NOTE: hasConsistentUnderperformance() below is intentionally NOT
// migrated — it resolves the target field via the ad-hoc convention
// `${k}Target`, which for 'crossSelling' produces 'crossSellingTarget'
// (not the canonical 'crossSellTarget' used everywhere else in this
// codebase, including KPI_META and the registry). Routing that lookup
// through the registry-aware reader would read a *different* field than
// this function has always read, which would be a real behavior change,
// not just an internal implementation swap. Left untouched until that
// pre-existing naming quirk is reviewed on its own.
import { buildPilotPolicy, readPilotActual, type PilotPolicy } from '../kpiRegistry/dynamicReaderPilot'
import type { KpiRegistry } from '../kpiRegistry'

import type { PharmacistInput, AccountabilityInsight } from './teamIntelligenceTypes'

// ── Working days in a month (simplified: exclude Fridays) ────
function workingDaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  const days   = new Date(y, m, 0).getDate()
  let working  = 0
  for (let d = 1; d <= days; d++) {
    const dow = new Date(y, m - 1, d).getDay()
    if (dow !== 5) working++  // exclude Friday (Saudi work week)
  }
  return working
}

// ── Detect submission trend ──────────────────────────────────
function detectSubmissionTrend(
  entries:     PharmacistInput['mtdEntries'],
  now:         Date,
): 'improving' | 'stable' | 'declining' {
  const sortedDates = [...new Set(entries.map((e) => e.date))].sort()
  if (sortedDates.length < 4) return 'stable'

  const mid    = Math.floor(sortedDates.length / 2)
  const first  = sortedDates.slice(0, mid)
  const second = sortedDates.slice(mid)

  // Compare submission density in first vs second half
  const firstDensity  = first.length / mid
  const secondDensity = second.length / (sortedDates.length - mid)

  if (secondDensity > firstDensity + 0.1) return 'improving'
  if (secondDensity < firstDensity - 0.1) return 'declining'
  return 'stable'
}

// ── Longest gap between submissions ─────────────────────────
function longestGap(entries: PharmacistInput['mtdEntries']): number {
  const dates = [...new Set(entries.map((e) => e.date))].sort()
  if (dates.length < 2) return dates.length === 0 ? 99 : 0

  let maxGap = 0
  for (let i = 1; i < dates.length; i++) {
    const gap = differenceInDays(
      new Date(dates[i]),
      new Date(dates[i - 1]),
    ) - 1
    maxGap = Math.max(maxGap, gap)
  }
  return maxGap
}

// ── Detect consistent underperformance (3+ weeks below 60%) ──
function hasConsistentUnderperformance(
  entries:  PharmacistInput['mtdEntries'],
  target:   PharmacistInput['target'],
): boolean {
  if (!target || entries.length < 9) return false  // need enough data

  // Divide month into thirds and check each third
  const sorted    = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const chunkSize = Math.ceil(sorted.length / 3)
  let belowCount  = 0

  for (let c = 0; c < 3; c++) {
    const chunk = sorted.slice(c * chunkSize, (c + 1) * chunkSize)
    if (!chunk.length) continue

    const overall = KPI_KEYS.reduce((sum, k) => {
      const actual  = chunk.reduce((s, e) => s + (Number(e[k]) || 0), 0)
      const tgt     = (target as any)[`${k}Target`] ?? 0
      if (!tgt) return sum
      return sum + computeAchievementPct(actual, tgt)
    }, 0) / KPI_KEYS.filter((k) => ((target as any)[`${k}Target`] || 0) > 0).length

    if (overall < 60) belowCount++
  }

  return belowCount >= 3  // all three thirds below 60%
}

// ── Detect improvement streak ────────────────────────────────
function improvementStreak(
  entries:   PharmacistInput['mtdEntries'],
  target:    PharmacistInput['target'],
  registry?: KpiRegistry,
  policy?:   PilotPolicy,
): number {
  if (entries.length < 2) return 0

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))

  // Check consecutive days of improving total KPI
  const keys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  let streak = 0
  for (let i = sorted.length - 1; i >= 1; i--) {
    const readActual = (entry: PharmacistInput['mtdEntries'][number], k: typeof KPI_KEYS[number]) =>
      registry && policy
        ? readPilotActual(entry as Record<string, unknown>, k, registry, policy)
        : Number(entry[k]) || 0
    const todayTotal = keys.reduce((s, k) => s + readActual(sorted[i], k), 0)
    const prevTotal  = keys.reduce((s, k) => s + readActual(sorted[i - 1], k), 0)
    if (todayTotal >= prevTotal) streak++
    else break
  }
  return streak
}

// ── Main function ─────────────────────────────────────────────
export function computeAccountabilityInsights(
  inputs:    PharmacistInput[],
  month:     string,
  now?:      Date,
  registry?: KpiRegistry,
): AccountabilityInsight[] {
  const ref         = now ?? new Date()
  const possibleDays = workingDaysInMonth(month)

  // Pilot policy built once from a real entry+target sample already on
  // hand (first input with at least one entry and a target).
  const sampleHolder = inputs.find(i => i.mtdEntries.length > 0 && i.target)
  const policy = registry
    ? buildPilotPolicy(sampleHolder?.mtdEntries[0] ?? null, sampleHolder?.target ?? null, registry, 'branchIntelligence')
    : undefined

  return inputs.map((input): AccountabilityInsight => {
    const uid         = input.userId ?? (input as any).profile?.uid
    const displayName = input.displayName ?? (input as any).profile?.displayName
    const entries     = input.mtdEntries

    // Submission analysis
    const activeDates    = new Set(entries.map((e) => e.date))
    const activeDays     = activeDates.size
    const submissionRate = Math.round((activeDays / possibleDays) * 100)
    const missedDays     = Math.max(0, possibleDays - activeDays)
    const gapDays        = longestGap(entries)
    const subTrend       = detectSubmissionTrend(entries, ref)

    // Underperformance analysis
    const isUnderperforming = hasConsistentUnderperformance(entries, input.target)

    // Recovery analysis
    const impStreak     = improvementStreak(entries, input.target, registry, policy)
    const isImproving   = impStreak >= 2
    const prevScore     = (input as any).previousScore
    const improvingVsPrev = typeof prevScore === 'number' && prevScore >= 0
      ? ((input as any).currentScore ?? 0) > prevScore
      : false

    // Support flag: needs support if submission low OR consistent underperformance
    const needsSupport = submissionRate < 70 || isUnderperforming
    const supportDetail = needsSupport
      ? submissionRate < 70
        ? `Data entry support needed — ${activeDays} of ${possibleDays} possible days submitted`
        : `Consistent performance challenge across ${month} — suggest 1:1 support conversation`
      : ''

    return {
      userId:                    uid,
      displayName,
      submissionRate,
      missedDays,
      consistentUnderperformance: isUnderperforming,
      showingImprovement:         isImproving || improvingVsPrev,
      improvementStreak:          impStreak,
      needsOperationalSupport:    needsSupport,
      supportDetail,
    }
  })
}
