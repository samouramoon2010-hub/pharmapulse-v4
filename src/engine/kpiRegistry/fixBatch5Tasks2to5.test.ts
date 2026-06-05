// ============================================================
// Regression Tests — Fix Batch 5
//
// Task 2: subscribeAllKpiEntries / subscribeAllEntries removed
// Task 3: STB-04 — trendData and chart are registry-driven
// Task 4: STB-05 — crossSelling key unified (no cross_selling)
// Task 5: subscribeRecentTargets added; all consumers migrated
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Task 2: Deprecated subscription layer removed ─────────────

describe('Task 2 — subscribeAllKpiEntries / subscribeAllEntries removed', () => {
  it('subscribeAllKpiEntries is NOT exported from kpiService', async () => {
    const svc = await import('../../services/kpiService')
    expect((svc as Record<string, unknown>).subscribeAllKpiEntries).toBeUndefined()
  })

  it('subscribeAllEntries is NOT in kpiStore', async () => {
    const { useKpiStore } = await import('../../store/kpiStore')
    expect((useKpiStore.getState() as Record<string, unknown>).subscribeAllEntries).toBeUndefined()
  })

  it('kpiService source does not contain subscribeAllKpiEntries definition', async () => {
    const src = await import('../../services/kpiService.js?raw')
    // Should not contain the function definition (comments referencing the name are acceptable)
    expect(src.default).not.toMatch(/^export function subscribeAllKpiEntries/m)
  })

  it('subscribeRecentKpiEntries is still exported (replacement is intact)', async () => {
    const svc = await import('../../services/kpiService')
    expect(typeof svc.subscribeRecentKpiEntries).toBe('function')
  })

  it('fetchKpiEntriesRange is still exported (replacement is intact)', async () => {
    const svc = await import('../../services/kpiService')
    expect(typeof svc.fetchKpiEntriesRange).toBe('function')
  })

  it('subscribeRecentEntries is still in kpiStore', async () => {
    const { useKpiStore } = await import('../../store/kpiStore')
    expect(typeof useKpiStore.getState().subscribeRecentEntries).toBe('function')
  })
})

// ── Task 3: STB-04 — trendData is registry-driven ─────────────

describe('Task 3 — STB-04: trendData and chart are registry-driven', () => {
  it('DashboardPage source contains KPI_KEYS.slice(0, 3) for chart legend', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain('KPI_KEYS.slice(0, 3)')
  })

  it('DashboardPage source does NOT contain hardcoded trend array', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).not.toContain("['wasfaty','omni','wellness']")
  })

  it('DashboardPage trendData uses KPI_KEYS.forEach (registry-driven accumulation)', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain('KPI_KEYS.forEach')
  })

  it('DashboardPage trendData deps include KPI_KEYS', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    // The useMemo dependency array should include KPI_KEYS
    expect(src.default).toContain('[myEntries, KPI_KEYS]')
  })

  // Pure logic: verify KPI_KEYS-driven accumulation produces same result as hardcoded
  it('registry-driven accumulation equals hardcoded for legacy KPI keys', () => {
    const entries = [
      { wasfaty: 5, omni: 3, wellness: 2, crossSelling: 1, basket: 4 },
      { wasfaty: 10, omni: 7, wellness: 4, crossSelling: 2, basket: 8 },
    ]

    // Legacy hardcoded approach
    const legacy = {
      wasfaty:      entries.reduce((s, e) => s + (e.wasfaty      || 0), 0),
      omni:         entries.reduce((s, e) => s + (e.omni         || 0), 0),
      wellness:     entries.reduce((s, e) => s + (e.wellness     || 0), 0),
      crossSelling: entries.reduce((s, e) => s + (e.crossSelling || 0), 0),
    }

    // New registry-driven approach
    const keys = ['wasfaty', 'omni', 'wellness', 'crossSelling']
    const registryDriven: Record<string, number> = {}
    keys.forEach((k) => {
      registryDriven[k] = entries.reduce((s, e) => s + (Number((e as Record<string,number>)[k]) || 0), 0)
    })

    expect(registryDriven.wasfaty).toBe(legacy.wasfaty)
    expect(registryDriven.omni).toBe(legacy.omni)
    expect(registryDriven.wellness).toBe(legacy.wellness)
    expect(registryDriven.crossSelling).toBe(legacy.crossSelling)
  })

  it('custom KPI key is accumulated by registry-driven approach', () => {
    const entries = [
      { nps: 8, wasfaty: 5 },
      { nps: 9, wasfaty: 3 },
    ] as Record<string, number>[]
    const keys = ['wasfaty', 'nps']
    const point: Record<string, number> = {}
    keys.forEach((k) => {
      point[k] = entries.reduce((s, e) => s + (Number(e[k]) || 0), 0)
    })
    expect(point.nps).toBe(17)
    expect(point.wasfaty).toBe(8)
  })

  it('KPI not in registry produces zero (safe, not crash)', () => {
    const entries = [{ wasfaty: 5 }] as Record<string, number>[]
    const keys = ['wasfaty', 'removedKpi']
    const point: Record<string, number> = {}
    keys.forEach((k) => {
      point[k] = entries.reduce((s, e) => s + (Number(e[k]) || 0), 0)
    })
    expect(point.removedKpi).toBe(0) // missing key → 0, not crash
  })
})

// ── Task 4: STB-05 — crossSelling key unified ─────────────────

describe('Task 4 — STB-05: crossSelling key unified across codebase', () => {
  it('settingsStore DASHBOARD_CARDS uses crossSelling (not cross_selling)', async () => {
    const src = await import('../../store/settingsStore.js?raw')
    expect(src.default).toContain('crossSelling:')
    expect(src.default).not.toMatch(/\bcross_selling\b/)
  })

  it('DashboardPage CARD_DATA uses crossSelling key (not cross_selling)', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    // CARD_DATA key must be crossSelling
    expect(src.default).not.toContain("cross_selling: {")
  })

  it('settingsStore exports DASHBOARD_CARDS with crossSelling property', async () => {
    const { DASHBOARD_CARDS } = await import('../../store/settingsStore.js')
    expect(DASHBOARD_CARDS).toHaveProperty('crossSelling')
    expect(DASHBOARD_CARDS).not.toHaveProperty('cross_selling')
  })

  it('crossSelling card has correct label and Arabic label', async () => {
    const { DASHBOARD_CARDS } = await import('../../store/settingsStore.js')
    const card = DASHBOARD_CARDS.crossSelling as { label: string; labelAr: string }
    expect(card.label).toBe('Cross Selling')
    expect(card.labelAr).toBe('البيع المتقاطع')
  })

  it('engine KPI_META still uses crossSelling (camelCase) — no regression', async () => {
    const { KPI_META } = await import('../../engine')
    expect(KPI_META).toHaveProperty('crossSelling')
  })

  it('kpiAnalyticsEngine source uses crossSelling (camelCase) throughout', async () => {
    const src = await import('../../engine/kpiAnalyticsEngine.ts?raw')
    expect(src.default).toContain("crossSelling")
    // No snake_case version in engine
    expect(src.default).not.toMatch(/'cross_selling'/)
  })
})

// ── Task 5: subscribeRecentTargets added and consumers migrated ─

describe('Task 5 — subscribeRecentTargets: bounded target subscription', () => {

  describe('kpiService — subscribeRecentTargets function', () => {
    it('subscribeRecentTargets is exported from kpiService', async () => {
      const svc = await import('../../services/kpiService')
      expect(typeof svc.subscribeRecentTargets).toBe('function')
    })

    it('kpiService source contains where month >= fromMonth', async () => {
      const src = await import('../../services/kpiService.js?raw')
      expect(src.default).toContain("where('month', '>=', fromMonth)")
    })

    it('subscribeRecentTargets uses a rolling month window (not unbounded)', async () => {
      const src = await import('../../services/kpiService.js?raw')
      expect(src.default).toContain('subscribeRecentTargets')
      expect(src.default).toContain('months = 6')
    })

    it('subscribeAllTargets still exported (deprecated, not yet removed)', async () => {
      const svc = await import('../../services/kpiService')
      expect(typeof svc.subscribeAllTargets).toBe('function')
    })
  })

  describe('kpiStore — subscribeRecentTargets wired', () => {
    it('subscribeRecentTargets is in kpiStore', async () => {
      const { useKpiStore } = await import('../../store/kpiStore')
      expect(typeof useKpiStore.getState().subscribeRecentTargets).toBe('function')
    })
  })

  describe('Consumer migration — source text verification', () => {
    it('DashboardPage uses subscribeRecentTargets (not subscribeAllTargets)', async () => {
      const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
      expect(src.default).toContain('subscribeRecentTargets')
      expect(src.default).not.toContain('subscribeAllTargets')
    })

    it('ExecutiveDashboard uses subscribeRecentTargets', async () => {
      const src = await import('../../pages/executive/ExecutiveDashboard.jsx?raw')
      expect(src.default).toContain('subscribeRecentTargets')
      expect(src.default).not.toContain('subscribeAllTargets')
    })

    it('TeamPage admin path uses subscribeRecentTargets', async () => {
      const src = await import('../../pages/manager/TeamPage.jsx?raw')
      expect(src.default).toContain('subscribeRecentTargets')
      expect(src.default).not.toContain('subscribeAllTargets')
    })

    it('TargetsPage uses subscribeRecentTargets', async () => {
      const src = await import('../../pages/shared/TargetsPage.jsx?raw')
      expect(src.default).toContain('subscribeRecentTargets')
      expect(src.default).not.toContain('subscribeAllTargets')
    })

    it('ReportsPage uses subscribeRecentTargets', async () => {
      const src = await import('../../pages/shared/ReportsPage.jsx?raw')
      expect(src.default).toContain('subscribeRecentTargets')
      expect(src.default).not.toContain('subscribeAllTargets')
    })
  })

  describe('Month window arithmetic', () => {
    // Mirrors the fromMonth calculation in subscribeRecentTargets
    function computeTargetFromMonth(months = 6): string {
      const from = new Date()
      from.setMonth(from.getMonth() - months)
      return `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`
    }

    function currentMonth(): string {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }

    it('6-month window from-date is before the current month', () => {
      const from = computeTargetFromMonth(6)
      expect(from < currentMonth()).toBe(true)
    })

    it('6-month window covers the TargetsPage max lookback of 2 months', () => {
      const twoMonthsAgo = computeTargetFromMonth(2)
      const sixMonthsAgo = computeTargetFromMonth(6)
      // 6-month window starts earlier than 2-month → covers it
      expect(sixMonthsAgo <= twoMonthsAgo).toBe(true)
    })

    it('fromMonth format matches yyyy-MM (same as target.month field)', () => {
      const from = computeTargetFromMonth(6)
      expect(from).toMatch(/^\d{4}-\d{2}$/)
    })

    it('currentMonth is always within the 6-month window', () => {
      const from = computeTargetFromMonth(6)
      const curr = currentMonth()
      expect(curr >= from).toBe(true)
    })
  })
})
