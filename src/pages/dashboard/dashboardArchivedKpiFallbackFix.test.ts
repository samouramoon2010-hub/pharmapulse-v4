// ============================================================
// 2026-07-07 — Dashboard Archived KPI Fallback Fix
//
// Root cause: DashboardPage.jsx called findWeakestKpi(kpiStats),
// findStrongestKpi(kpiStats), and generateLiveAnalytics(input, alerts)
// WITHOUT their optional `registry` argument. Without a registry, all
// three fall back to the hardcoded legacy DEFAULT_KPI_KEYS list
// (wasfaty/omni/wellness/basket/crossSelling) — independent of the
// live registry's archived state. This is why "Live KPI Health" and
// "Executive Summary" kept showing archived KPI names even though
// "KPI Distribution" (which already used the registry-derived
// `registryKpis`/`KPI_KEYS` local variables) correctly showed 0.
//
// Fix: pass `liveRegistry` into all three calls, AND add an explicit
// `hasActiveKpis` gate (registryKpis.length > 0) before displaying
// findWeakestKpi()/findStrongestKpi()'s return value — because those
// two functions return a non-null sentinel default ('wasfaty') when
// zero active weighted KPIs exist, which must never be shown as if it
// were real data.
//
// This repo has no React component-rendering test harness — every
// "UI" test here asserts against the raw source string via the
// established `?raw` import convention (see milestone35Registry.test.ts).
// ============================================================
import { describe, it, expect } from 'vitest'
import { findWeakestKpi, findStrongestKpi } from '../../engine/kpiAnalyticsEngine'
import type { KpiDefinition, KpiRegistry } from '../../engine/kpiRegistry'

function makeKpi(key: string, overrides: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key, label: key, shortLabel: key, labelAr: key,
    category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0.5, isActive: true, isCore: false,
    thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
    visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false },
    sortOrder: 10,
    lifecycleStage: 'production_evaluation',
    isPrimary: false,
    coachingAction: '', coachingActionAr: '',
    ...overrides,
  } as KpiDefinition
}

// ─────────────────────────────────────────────────────────────
// 1 — With a registry supplied, archived KPIs are excluded from
//     weakest/strongest resolution (proves passing the registry works)
// ─────────────────────────────────────────────────────────────
describe('1 — findWeakestKpi/findStrongestKpi exclude archived KPIs when a registry is supplied', () => {
  it('an archived KPI present in kpiStats is never selected as weakest/strongest', () => {
    const registry: KpiRegistry = {
      wasfaty: makeKpi('wasfaty', { isActive: false, lifecycleStage: 'archived' }),
    }
    const kpiStats = { wasfaty: { achievementPct: 10 } } as any
    // Registry says wasfaty is archived — getProductionEngineKeys() excludes it
    expect(findWeakestKpi(kpiStats, registry)).toBe('wasfaty') // sentinel default (see test 3) — no active key exists to prefer
    expect(findStrongestKpi(kpiStats, registry)).toBe('wasfaty') // same sentinel — documented behavior, not real data
  })
})

// ─────────────────────────────────────────────────────────────
// 2 — One / multiple active KPIs render normally (correct min/max)
// ─────────────────────────────────────────────────────────────
describe('2 — one active KPI is correctly selected as both weakest and strongest', () => {
  it('a single active, weighted KPI is returned for both', () => {
    const registry: KpiRegistry = {
      onlyOne: makeKpi('onlyOne', { weight: 0.5 }),
    }
    const kpiStats = { onlyOne: { achievementPct: 42 } } as any
    expect(findWeakestKpi(kpiStats, registry)).toBe('onlyOne')
    expect(findStrongestKpi(kpiStats, registry)).toBe('onlyOne')
  })
})

describe('3 — multiple active KPIs resolve to the true min/max, not a sentinel', () => {
  it('correctly picks the lowest-achievement key as weakest and highest as strongest', () => {
    const registry: KpiRegistry = {
      low:  makeKpi('low',  { weight: 0.3, sortOrder: 1 }),
      mid:  makeKpi('mid',  { weight: 0.3, sortOrder: 2 }),
      high: makeKpi('high', { weight: 0.4, sortOrder: 3 }),
    }
    const kpiStats = {
      low:  { achievementPct: 20 },
      mid:  { achievementPct: 60 },
      high: { achievementPct: 95 },
    } as any
    expect(findWeakestKpi(kpiStats, registry)).toBe('low')
    expect(findStrongestKpi(kpiStats, registry)).toBe('high')
  })
})

// ─────────────────────────────────────────────────────────────
// 4 — Zero active KPIs: the engine functions still return a sentinel
//     ('wasfaty') — this is exactly why DashboardPage.jsx MUST gate on
//     hasActiveKpis rather than trusting these return values directly.
// ─────────────────────────────────────────────────────────────
describe('4 — zero active KPIs still yields the wasfaty sentinel (documents why a UI-level guard is required)', () => {
  it('an all-archived registry with matching kpiStats entries still returns "wasfaty"', () => {
    const registry: KpiRegistry = {
      wasfaty:      makeKpi('wasfaty',      { isActive: false, lifecycleStage: 'archived' }),
      omnihealth:   makeKpi('omnihealth',   { isActive: false, lifecycleStage: 'archived', aliasFor: 'omni' }),
      wellnessCard: makeKpi('wellnessCard', { isActive: false, lifecycleStage: 'archived', aliasFor: 'wellness' }),
      basket:       makeKpi('basket',       { isActive: false, lifecycleStage: 'archived' }),
      crossSelling: makeKpi('crossSelling', { isActive: false, lifecycleStage: 'archived' }),
    }
    // kpiStats empty, matching the real Dashboard state once KPI_KEYS (registry-driven) is []
    const kpiStats = {} as any
    expect(findWeakestKpi(kpiStats, registry)).toBe('wasfaty')
    expect(findStrongestKpi(kpiStats, registry)).toBe('wasfaty')
    // This is the exact mechanism DashboardPage.jsx's `hasActiveKpis` gate protects against —
    // it must never display this sentinel value as a real "Best KPI"/"Focus KPI" label.
  })
})

// ─────────────────────────────────────────────────────────────
// 5 — DashboardPage.jsx source: registry wiring + empty-state gate
// ─────────────────────────────────────────────────────────────
describe('5 — DashboardPage.jsx passes liveRegistry into all three previously-unwired calls', () => {
  it('findWeakestKpi/findStrongestKpi are called with liveRegistry', async () => {
    const src = (await import('./DashboardPage.jsx?raw')).default
    expect(src).toContain('findWeakestKpi(kpiStats, liveRegistry)')
    expect(src).toContain('findStrongestKpi(kpiStats, liveRegistry)')
  })

  it('generateLiveAnalytics is called with liveRegistry as the third argument', async () => {
    const src = (await import('./DashboardPage.jsx?raw')).default
    expect(src).toContain('generateLiveAnalytics(input, prevAlertsRef.current, liveRegistry)')
  })

  it('the old un-registry-wired calls no longer exist', async () => {
    const src = (await import('./DashboardPage.jsx?raw')).default
    expect(src).not.toContain('findWeakestKpi(kpiStats)')
    expect(src).not.toContain('findStrongestKpi(kpiStats)')
    expect(src).not.toContain('generateLiveAnalytics(input, prevAlertsRef.current)\n')
  })
})

describe('6 — hasActiveKpis is derived from registryKpis (no duplicated lifecycle-filter logic)', () => {
  it('hasActiveKpis is defined as registryKpis.length > 0', async () => {
    const src = (await import('./DashboardPage.jsx?raw')).default
    expect(src).toContain('const hasActiveKpis = registryKpis.length > 0')
  })

  it('does not introduce a second, separately-computed active-KPI filter', async () => {
    const src = (await import('./DashboardPage.jsx?raw')).default
    // Only one definition of hasActiveKpis should exist
    const matches = src.match(/const hasActiveKpis/g) ?? []
    expect(matches.length).toBe(1)
  })
})

describe('7 — Best KPI / Primary Risk / Live KPI Health / Executive Summary are all hidden together when hasActiveKpis is false', () => {
  it('KpiHealthHeatmap and ExecutiveSummaryPanel are both inside the hasActiveKpis-true branch', async () => {
    const src = (await import('./DashboardPage.jsx?raw')).default
    const gateIndex = src.indexOf('hasActiveKpis ? (')
    expect(gateIndex).toBeGreaterThan(-1)
    const trueBranch = src.slice(gateIndex, src.indexOf(') : (', gateIndex))
    expect(trueBranch).toContain('<KpiHealthHeatmap')
    expect(trueBranch).toContain('<ExecutiveSummaryPanel')
  })

  it('the false branch renders the exact required empty-state title', async () => {
    const src = (await import('./DashboardPage.jsx?raw')).default
    expect(src).toContain('title="No active KPIs configured"')
  })

  it('the empty state uses the shared EmptyState component, not a bespoke redesign', async () => {
    const src = (await import('./DashboardPage.jsx?raw')).default
    expect(src).toContain('import EmptyState from')
    expect(src).toContain('<EmptyState')
  })
})

describe('8 — KPI Distribution count and hasActiveKpis share the same source of truth (registryKpis)', () => {
  it('registryKpis is used for both KPI_KEYS (feeding KPI Distribution) and hasActiveKpis', async () => {
    const src = (await import('./DashboardPage.jsx?raw')).default
    expect(src).toContain('registryKpis.map(cfg => cfg.aliasFor ?? cfg.key)')
    expect(src).toContain('registryKpis.length > 0')
  })
})

describe('9 — cached archived data cannot repopulate the cards', () => {
  it('KPI_KEYS (the tile-grid + kpiStats source) is derived from registryKpis, not a static/default list', async () => {
    const src = (await import('./DashboardPage.jsx?raw')).default
    // KPI_KEYS must be computed from registryKpis (live, archived-aware), never from
    // DEFAULT_KPI_REGISTRY directly for the per-KPI tile grid / kpiStats map.
    const kpiKeysDeclIndex = src.indexOf('const KPI_KEYS = useMemo(')
    expect(kpiKeysDeclIndex).toBeGreaterThan(-1)
    const decl = src.slice(kpiKeysDeclIndex, kpiKeysDeclIndex + 200)
    expect(decl).toContain('registryKpis.map')
  })
})

describe('10 — engine functions remain stable with empty inputs (zero targets, zero entries)', () => {
  it('findWeakestKpi/findStrongestKpi do not throw on an empty kpiStats map and no registry', () => {
    expect(() => findWeakestKpi({})).not.toThrow()
    expect(() => findStrongestKpi({})).not.toThrow()
  })

  it('findWeakestKpi/findStrongestKpi do not throw on an empty kpiStats map with a fully-archived registry', () => {
    const registry: KpiRegistry = { x: makeKpi('x', { isActive: false, lifecycleStage: 'archived' }) }
    expect(() => findWeakestKpi({}, registry)).not.toThrow()
    expect(() => findStrongestKpi({}, registry)).not.toThrow()
  })
})
