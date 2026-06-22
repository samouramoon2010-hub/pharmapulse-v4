// ============================================================
// Activity Feed Engine v2
// Phase 2: event severity scoring, dedup, meaningful grouping.
// Pure function — no Firebase, no React.
// ============================================================

import { format, formatDistanceToNow, parseISO, subDays, differenceInHours } from 'date-fns'
import { KPI_KEYS, sumKpi, computeAchievementPct, getDayProgress, safeReadTarget,
  getProductionEngineKeys, getKpiMetaForKey } from '../kpiAnalyticsEngine'
import type { LiveAnalyticsInput, ActivityFeedItem, ActivityType, ActivitySeverity } from './liveAnalyticsTypes'
import type { MonthlyTarget } from '../kpiAnalyticsEngine'

// Protected Engines Migration Phase D — Live Analytics (Activity Feed).
// registry is optional: when omitted (every current production call site),
// behavior is byte-identical to before. Actual/target reads feeding feed
// items are routed through the Dynamic Reader only where proven parity
// holds against a real sample; otherwise they fall back to the exact
// pre-migration computation. No call site passes a registry yet.
import { buildPilotPolicy, sumPilotActual, readPilotTarget, type PilotPolicy } from '../kpiRegistry/dynamicReaderPilot'
import type { KpiRegistry } from '../kpiRegistry'

// ── Event severity scoring ─────────────────────────────────────
// Higher score = shown first in feed
const SEVERITY_SCORE: Record<ActivitySeverity, number> = {
  critical: 100,
  warning:  70,
  success:  50,
  info:     10,
}

function relTime(iso: string): string {
  try {
    const d = parseISO(iso)
    const dist = formatDistanceToNow(d, { addSuffix: true })
    return dist === 'less than a minute ago' ? 'just now' : dist
  } catch { return '' }
}

const ICONS: Record<ActivityType, string> = {
  KPI_ENTRY:   '📊',
  TARGET_HIT:  '🎯',
  MILESTONE:   '✅',
  PACE_CHANGE: '⚡',
  RISK_CHANGE: '⚠️',
  DAY_PROGRESS:'📅',
}

let _seq = 0
function makeItem(
  type:      ActivityType,
  severity:  ActivitySeverity,
  title:     string,
  body:      string,
  timestamp: string,
  extras:    Partial<ActivityFeedItem> = {},
): ActivityFeedItem {
  return {
    id:           `feed-${type}-${++_seq}`,
    type,
    severity,
    title,
    body,
    timestamp,
    relativeTime: relTime(timestamp),
    icon:         ICONS[type],
    ...extras,
  }
}

// ── Today's KPI entry events ──────────────────────────────────
// Collapsed: one item per KPI (not one per entry row)
function todayEntryEvents(input: LiveAnalyticsInput, registry?: KpiRegistry, policy?: PilotPolicy): ActivityFeedItem[] {
  const { todayEntries, target, now } = input
  if (!todayEntries.length) return []

  const dp  = getDayProgress(now)
  const ts  = now.toISOString()

  const keys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  return keys
    .map((k) => {
      const val = registry && policy
        ? sumPilotActual(todayEntries as Record<string, unknown>[], k, registry, policy)
        : todayEntries.reduce((s, e) => s + (Number(e[k]) || 0), 0)
      if (val <= 0) return null

      const legacyTarget = () => target
        ? safeReadTarget(target as any, getKpiMetaForKey(k, registry).targetField)
        : 0
      const tgt = registry && policy
        ? readPilotTarget(target as Record<string, unknown> | null | undefined, k, registry, policy, legacyTarget)
        : legacyTarget()
      const mtd = registry && policy
        ? sumPilotActual(input.mtdEntries as Record<string, unknown>[], k, registry, policy)
        : sumKpi(input.mtdEntries, k)
      const ach = tgt > 0 ? computeAchievementPct(mtd, tgt) : 0
      const label = getKpiMetaForKey(k, registry).en

      return makeItem(
        'KPI_ENTRY', 'info',
        `${label} — ${val.toLocaleString()} today`,
        tgt > 0 ? `MTD: ${mtd.toLocaleString()} · ${ach}% of target` : 'Recorded',
        ts,
        { kpiKey: k, value: val },
      )
    })
    .filter((i): i is ActivityFeedItem => i !== null)
}

// ── Milestone events ──────────────────────────────────────────
function milestoneEvents(input: LiveAnalyticsInput, registry?: KpiRegistry, policy?: PilotPolicy): ActivityFeedItem[] {
  const { mtdEntries, target, now } = input
  if (!target) return []
  const ts = now.toISOString()
  const MILESTONES = [50, 75, 90, 100]
  const results: ActivityFeedItem[] = []

  const keys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  for (const k of keys) {
    const actual = registry && policy
      ? sumPilotActual(mtdEntries as Record<string, unknown>[], k, registry, policy)
      : sumKpi(mtdEntries, k)
    const tgt    = registry && policy
      ? readPilotTarget(target as Record<string, unknown> | null | undefined, k, registry, policy, () => safeReadTarget(target as any, getKpiMetaForKey(k, registry).targetField))
      : safeReadTarget(target as any, getKpiMetaForKey(k, registry).targetField)
    if (!tgt) continue
    const pct = computeAchievementPct(actual, tgt)
    const label = getKpiMetaForKey(k, registry).en

    if (pct >= 100) {
      results.push(makeItem(
        'TARGET_HIT', 'success',
        `${label} — Target Hit! 🎯`,
        `${actual.toLocaleString()} / ${tgt.toLocaleString()} — ${pct}%`,
        ts,
        { kpiKey: k, value: pct },
      ))
    } else {
      const nearest = MILESTONES.filter((m) => m <= pct && m < 100 && m >= 50).pop()
      if (nearest) {
        results.push(makeItem(
          'MILESTONE', 'success',
          `${label} — ${nearest}% reached`,
          `${actual.toLocaleString()} of ${tgt.toLocaleString()} this month`,
          ts,
          { kpiKey: k, value: nearest },
        ))
      }
    }
  }
  return results
}

// ── Pace change events (only meaningful shifts) ───────────────
// Only surfaces changes > 15% and only for non-trivial values
function paceChangeEvents(input: LiveAnalyticsInput, registry?: KpiRegistry, policy?: PilotPolicy): ActivityFeedItem[] {
  const { mtdEntries, now } = input
  const results: ActivityFeedItem[] = []
  const today     = format(now, 'yyyy-MM-dd')
  const yesterday = format(subDays(now, 1), 'yyyy-MM-dd')

  const keys = registry ? getProductionEngineKeys(registry) : KPI_KEYS
  for (const k of keys) {
    const sum = (entries: typeof mtdEntries) => registry && policy
      ? sumPilotActual(entries as Record<string, unknown>[], k, registry, policy)
      : entries.reduce((s, e) => s + (Number(e[k]) || 0), 0)
    const todayVal = sum(mtdEntries.filter((e) => e.date === today))
    const yestVal  = sum(mtdEntries.filter((e) => e.date === yesterday))

    if (!yestVal || yestVal < 3 || !todayVal) continue  // suppress noise

    const changePct = Math.round(((todayVal - yestVal) / yestVal) * 100)
    if (Math.abs(changePct) < 15) continue

    const improving = changePct > 0
    const label = getKpiMetaForKey(k, registry).en
    results.push(makeItem(
      'PACE_CHANGE',
      improving ? 'success' : 'warning',
      `${label} ${improving ? '▲' : '▼'} ${Math.abs(changePct)}% vs yesterday`,
      `Today: ${todayVal.toLocaleString()} · Yesterday: ${yestVal.toLocaleString()}`,
      now.toISOString(),
      { kpiKey: k, value: changePct },
    ))
  }
  return results
}

// ── Day progress checkpoint ───────────────────────────────────
function dayProgressEvent(input: LiveAnalyticsInput): ActivityFeedItem {
  const dp = getDayProgress(input.now)
  return makeItem(
    'DAY_PROGRESS', 'info',
    `Day ${dp.currentDay} of ${dp.totalDays}`,
    `${dp.pct}% of month elapsed · ${dp.daysRemaining} days remaining`,
    input.now.toISOString(),
  )
}

// ── Main feed generator ───────────────────────────────────────
export function generateActivityFeed(input: LiveAnalyticsInput, registry?: KpiRegistry): ActivityFeedItem[] {
  // Pilot policy built once from a real entry+target sample already on
  // hand (never fabricated). Omitted entirely when no registry is passed —
  // every call site today omits it, so behavior is unchanged in production.
  const policy: PilotPolicy | undefined = registry
    ? buildPilotPolicy(input.mtdEntries[0] ?? null, input.target ?? null, registry, 'liveAnalytics')
    : undefined

  const all = [
    ...milestoneEvents(input, registry, policy),    // highest priority — milestones first
    ...paceChangeEvents(input, registry, policy),
    ...todayEntryEvents(input, registry, policy),
    dayProgressEvent(input),
  ]

  // Sort by severity score desc, then timestamp desc
  const sorted = all.sort((a, b) => {
    const scoreDiff = (SEVERITY_SCORE[b.severity] ?? 0) - (SEVERITY_SCORE[a.severity] ?? 0)
    if (scoreDiff !== 0) return scoreDiff
    return b.timestamp.localeCompare(a.timestamp)
  })

  // Deduplicate by type+kpiKey
  const seen = new Set<string>()
  return sorted
    .filter((item) => {
      const key = `${item.type}:${item.kpiKey || 'general'}`
      if (item.type === 'KPI_ENTRY') return true  // allow multiple KPI entries
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 20)
}
