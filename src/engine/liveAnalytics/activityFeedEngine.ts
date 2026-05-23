// ============================================================
// Activity Feed Engine v2
// Phase 2: event severity scoring, dedup, meaningful grouping.
// Pure function — no Firebase, no React.
// ============================================================

import { format, formatDistanceToNow, parseISO, subDays, differenceInHours } from 'date-fns'
import { KPI_META, KPI_KEYS, sumKpi, computeAchievementPct, getDayProgress } from '../kpiAnalyticsEngine'
import type { LiveAnalyticsInput, ActivityFeedItem, ActivityType, ActivitySeverity } from './liveAnalyticsTypes'
import type { MonthlyTarget } from '../kpiAnalyticsEngine'

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
function todayEntryEvents(input: LiveAnalyticsInput): ActivityFeedItem[] {
  const { todayEntries, target, now } = input
  if (!todayEntries.length) return []

  const dp  = getDayProgress(now)
  const ts  = now.toISOString()

  return KPI_KEYS
    .map((k) => {
      const val = todayEntries.reduce((s, e) => s + (Number(e[k]) || 0), 0)
      if (val <= 0) return null

      const tgt = target
        ? (Number((target as any)[KPI_META[k].targetField] ?? 0))
        : 0
      const mtd = sumKpi(input.mtdEntries, k)
      const ach = tgt > 0 ? computeAchievementPct(mtd, tgt) : 0

      return makeItem(
        'KPI_ENTRY', 'info',
        `${KPI_META[k].en} — ${val.toLocaleString()} today`,
        tgt > 0 ? `MTD: ${mtd.toLocaleString()} · ${ach}% of target` : 'Recorded',
        ts,
        { kpiKey: k, value: val },
      )
    })
    .filter((i): i is ActivityFeedItem => i !== null)
}

// ── Milestone events ──────────────────────────────────────────
function milestoneEvents(input: LiveAnalyticsInput): ActivityFeedItem[] {
  const { mtdEntries, target, now } = input
  if (!target) return []
  const ts = now.toISOString()
  const MILESTONES = [50, 75, 90, 100]
  const results: ActivityFeedItem[] = []

  for (const k of KPI_KEYS) {
    const actual = sumKpi(mtdEntries, k)
    const tgt    = Number((target as any)[KPI_META[k].targetField] ?? 0)
    if (!tgt) continue
    const pct = computeAchievementPct(actual, tgt)

    if (pct >= 100) {
      results.push(makeItem(
        'TARGET_HIT', 'success',
        `${KPI_META[k].en} — Target Hit! 🎯`,
        `${actual.toLocaleString()} / ${tgt.toLocaleString()} — ${pct}%`,
        ts,
        { kpiKey: k, value: pct },
      ))
    } else {
      const nearest = MILESTONES.filter((m) => m <= pct && m < 100 && m >= 50).pop()
      if (nearest) {
        results.push(makeItem(
          'MILESTONE', 'success',
          `${KPI_META[k].en} — ${nearest}% reached`,
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
function paceChangeEvents(input: LiveAnalyticsInput): ActivityFeedItem[] {
  const { mtdEntries, now } = input
  const results: ActivityFeedItem[] = []
  const today     = format(now, 'yyyy-MM-dd')
  const yesterday = format(subDays(now, 1), 'yyyy-MM-dd')

  for (const k of KPI_KEYS) {
    const todayVal = mtdEntries.filter((e) => e.date === today)
      .reduce((s, e) => s + (Number(e[k]) || 0), 0)
    const yestVal  = mtdEntries.filter((e) => e.date === yesterday)
      .reduce((s, e) => s + (Number(e[k]) || 0), 0)

    if (!yestVal || yestVal < 3 || !todayVal) continue  // suppress noise

    const changePct = Math.round(((todayVal - yestVal) / yestVal) * 100)
    if (Math.abs(changePct) < 15) continue

    const improving = changePct > 0
    results.push(makeItem(
      'PACE_CHANGE',
      improving ? 'success' : 'warning',
      `${KPI_META[k].en} ${improving ? '▲' : '▼'} ${Math.abs(changePct)}% vs yesterday`,
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
export function generateActivityFeed(input: LiveAnalyticsInput): ActivityFeedItem[] {
  const all = [
    ...milestoneEvents(input),    // highest priority — milestones first
    ...paceChangeEvents(input),
    ...todayEntryEvents(input),
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
