// ============================================================
// Dashboard Hero Audit — Team Status + Forecast Fix Tests
//
// Issue 1: Team Status "No team data"
//   Root cause: teamIntelligence = null when admin (no pharmacyId) or entries unloaded.
//   Fix: 3-state display — 'ready' (manager with data), 'admin' (→ "See Exec BI"),
//        'loading' (manager waiting for entries).
//
// Issue 2: Forecast EOM = 197% (single-KPI wasfaty forecast)
//   Root cause: hero used forecastMap.wasfaty alone — a single-KPI projection.
//   Fix: weighted overall forecast using computeOverallAchievement on forecast values.
//
// Tests:
//   1.  teamHeroState logic — admin → 'admin'
//   2.  teamHeroState logic — manager with no data → 'loading'
//   3.  teamHeroState logic — manager with team data → 'ready'
//   4.  Source: "See Exec BI" label for admin state
//   5.  Source: no longer shows raw "No team data" for all null cases
//   6.  Source: forecastStatsMap built from KPI_KEYS with target > 0
//   7.  Source: computeOverallAchievement used for weighted forecast
//   8.  Weighted forecast < single-KPI forecast when KPIs diverge
//   9.  Weighted forecast uses target guard (excludes target=0 KPIs)
//  10.  Forecast = 0 when no KPIs have targets
//  11.  Forecast math: weighted avg of forecastAchPct values
//  12.  Single-KPI wasfaty pattern no longer in hero
// ============================================================

import { describe, it, expect } from 'vitest'
import { computeOverallAchievement, ACHIEVEMENT_CAP } from '../../engine/kpiAnalyticsEngine'

// ── Shared helpers ────────────────────────────────────────────

/** Simulate teamHeroState derivation */
function deriveTeamHeroState(opts: {
  isAdmin: boolean
  teamIntelligence: unknown | null
}): 'admin' | 'loading' | 'ready' {
  const { isAdmin, teamIntelligence } = opts
  if (isAdmin)             return 'admin'
  if (!teamIntelligence)   return 'loading'
  return 'ready'
}

/** Simulate forecastStatsMap + computeOverallAchievement */
function computeWeightedForecast(opts: {
  kpiKeys: string[]
  forecastAchPct: Record<string, number>
  targets: Record<string, number>
}): number {
  const { kpiKeys, forecastAchPct, targets } = opts
  const statsMap: Record<string, { achievementPct: number; target: number }> = {}
  for (const k of kpiKeys) {
    if ((targets[k] ?? 0) > 0) {
      statsMap[k] = {
        achievementPct: forecastAchPct[k] ?? 0,
        target: targets[k],
      }
    }
  }
  return computeOverallAchievement(statsMap as any)
}

// ════════════════════════════════════════════════════════════════
// Issue 1 — Team Status state logic
// ════════════════════════════════════════════════════════════════

describe('Hero Audit — Issue 1: Team Status', () => {
  it("1: admin → teamHeroState = 'admin' (no pharmacyId, use Exec BI)", () => {
    expect(deriveTeamHeroState({ isAdmin: true, teamIntelligence: null })).toBe('admin')
  })

  it("2: manager + no team data yet → teamHeroState = 'loading'", () => {
    expect(deriveTeamHeroState({ isAdmin: false, teamIntelligence: null })).toBe('loading')
  })

  it("3: manager + team data present → teamHeroState = 'ready'", () => {
    const fakeTI = { teamHealth: { overallTeamStatus: 'healthy' } }
    expect(deriveTeamHeroState({ isAdmin: false, teamIntelligence: fakeTI })).toBe('ready')
  })

  it('4: source shows "See Exec BI" for admin state', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain("See Exec BI")
  })

  it('5: raw "No team data" string is no longer rendered', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).not.toContain('"No team data"')
    expect(src.default).not.toContain("'No team data'")
  })

  it('6: teamHeroState is derived in the hero block', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain('teamHeroState')
    expect(src.default).toContain("scope?.type === 'all'") // Phase 2G-1: isAdmin replaced by scope type check
    expect(src.default).toContain("!teamIntelligence ? 'loading'")
  })
})

// ════════════════════════════════════════════════════════════════
// Issue 2 — Forecast 197% root cause and fix
// ════════════════════════════════════════════════════════════════

describe('Hero Audit — Issue 2: Forecast calculation', () => {
  it('7: source uses computeOverallAchievement for weighted forecast', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    const heroBlock = src.default.slice(
      src.default.indexOf('Executive Hero Section'),
      src.default.indexOf('Page header')
    )
    expect(heroBlock).toContain('computeOverallAchievement(forecastStatsMap)')
    expect(heroBlock).toContain('forecastStatsMap')
  })

  it('8: weighted forecast < single-KPI wasfaty when other KPIs underperform', () => {
    // wasfaty forecast = 197%, but omni/wellness/basket/crossSelling = 60%
    // Weighted result should be much lower than 197%
    const result = computeWeightedForecast({
      kpiKeys: ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'],
      forecastAchPct: { wasfaty: 197, omni: 60, wellness: 60, basket: 60, crossSelling: 60 },
      targets: { wasfaty: 500, omni: 50, wellness: 40, basket: 300, crossSelling: 25 },
    })
    expect(result).toBeLessThan(197)
    expect(result).toBeGreaterThan(0)
  })

  it('9: target=0 KPIs are excluded from weighted forecast', () => {
    const result = computeWeightedForecast({
      kpiKeys: ['wasfaty', 'omni'],
      forecastAchPct: { wasfaty: 100, omni: 200 },
      targets: { wasfaty: 500, omni: 0 },  // omni has no target
    })
    // Only wasfaty contributes — result = 100% (wasfaty weight 0.25, only contributor)
    expect(result).toBe(100)
  })

  it('10: forecast = 0 when no KPIs have valid targets', () => {
    const result = computeWeightedForecast({
      kpiKeys: ['wasfaty', 'omni'],
      forecastAchPct: { wasfaty: 100, omni: 100 },
      targets: { wasfaty: 0, omni: 0 },
    })
    expect(result).toBe(0)
  })

  it('11: weighted forecast math — all KPIs at 150% → result = 150%', () => {
    const result = computeWeightedForecast({
      kpiKeys: ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'],
      forecastAchPct: { wasfaty: 150, omni: 150, wellness: 150, basket: 150, crossSelling: 150 },
      targets: { wasfaty: 500, omni: 50, wellness: 40, basket: 300, crossSelling: 25 },
    })
    expect(result).toBe(150)
  })

  it('12: single-KPI wasfaty pattern removed from hero source', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    const heroBlock = src.default.slice(
      src.default.indexOf('Executive Hero Section'),
      src.default.indexOf('Page header')
    )
    // The old single-KPI pattern should be gone
    expect(heroBlock).not.toContain('forecastMap.wasfaty ? ')
    expect(heroBlock).not.toContain("fcKey   = forecastMap.wasfaty")
  })

  it('ACHIEVEMENT_CAP is still 200 and still applies', () => {
    expect(ACHIEVEMENT_CAP).toBe(200)
    const result = computeWeightedForecast({
      kpiKeys: ['wasfaty'],
      forecastAchPct: { wasfaty: 200 },
      targets: { wasfaty: 500 },
    })
    expect(result).toBe(200)
  })
})
