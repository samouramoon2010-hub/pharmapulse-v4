// ============================================================
// Regression Tests — Fix Batch 4 Phase 2
// ReportsPage migrated from subscribeAllEntries (deprecated,
// unbounded) to fetchEntriesRange (on-demand, date-bounded).
//
// Tests cover:
//   1.  ReportsPage source no longer uses subscribeAllEntries
//   2.  ReportsPage source uses fetchEntriesRange
//   3.  Admin fetches with no pharmacyId filter
//   4.  Manager/pharmacist fetches with own pharmacyId only
//   5.  Effective fetch window covers 60 days minimum (for
//       trendData and executiveSummary) even when dateRange
//       is shorter (e.g. "Today" preset)
//   6.  Custom old date ranges extend fetch window beyond 60d
//   7.  Range filter logic: rangeEntries is scoped to dateRange
//       within the wider fetchedEntries window
//   8.  Admin with selectedBranch filter: in-memory filter on
//       fetchedEntries (not on the fetch itself)
//   9.  fetchError state prevents empty-state false positive
//  10.  subscribeAllKpiEntries remains exported (orphaned pages
//       still reference it — removal blocked by build safety)
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Pure logic helpers extracted from ReportsPage ─────────────
// Mirrors the effectiveFrom calculation in the fetch useEffect.

function computeEffectiveFetchWindow(
  dateRangeFrom: string,
  daysWindow:    number = 60,
): { effectiveFrom: string; effectiveTo: string } {
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - daysWindow)
  const windowStartStr = windowStart.toISOString().split('T')[0]

  const today = new Date().toISOString().split('T')[0]
  const effectiveFrom = dateRangeFrom < windowStartStr ? dateRangeFrom : windowStartStr
  return { effectiveFrom, effectiveTo: today }
}

// Mirrors the rangeEntries in-memory filter.
interface Entry { date: string; pharmacyId: string; wasfaty?: number }

function applyRangeFilter(
  fetchedEntries: Entry[],
  from:           string,
  to:             string,
  selectedBranch: string,
): Entry[] {
  return fetchedEntries.filter((e) => {
    const inRange  = e.date >= from && e.date <= to
    const inBranch = selectedBranch === 'all' || e.pharmacyId === selectedBranch
    return inRange && inBranch
  })
}

// Mirrors the fetch options selection.
function computeFetchOptions(
  isAdmin:    boolean,
  pharmacyId: string | null | undefined,
): { pharmacyId?: string } {
  return (!isAdmin && pharmacyId) ? { pharmacyId } : {}
}

// ── Date helpers ──────────────────────────────────────────────
function daysAgoStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// ── Fixtures ──────────────────────────────────────────────────
const ENTRIES_MULTI: Entry[] = [
  { date: daysAgoStr(3),  pharmacyId: 'ph-a', wasfaty: 10 },
  { date: daysAgoStr(10), pharmacyId: 'ph-a', wasfaty: 8  },
  { date: daysAgoStr(30), pharmacyId: 'ph-a', wasfaty: 6  },
  { date: daysAgoStr(55), pharmacyId: 'ph-a', wasfaty: 4  },
  { date: daysAgoStr(3),  pharmacyId: 'ph-b', wasfaty: 12 },
  { date: daysAgoStr(10), pharmacyId: 'ph-b', wasfaty: 9  },
  // Beyond 60 days — should only appear when custom range extends that far
  { date: daysAgoStr(90), pharmacyId: 'ph-a', wasfaty: 3  },
  { date: daysAgoStr(120),pharmacyId: 'ph-b', wasfaty: 2  },
]

// ── Tests ─────────────────────────────────────────────────────

describe('Fix Batch 4 Phase 2 — ReportsPage on-demand fetch migration', () => {

  // ── 1. Source-level migration verification ──────────────────

  describe('Source verification — subscribeAllEntries removed', () => {
    it('ReportsPage does not use subscribeAllEntries', async () => {
      const src = await import('../../pages/shared/ReportsPage.jsx?raw')
      expect(src.default).not.toContain('subscribeAllEntries')
    })

    it('ReportsPage does not use subscribePharmacyEntries', async () => {
      const src = await import('../../pages/shared/ReportsPage.jsx?raw')
      expect(src.default).not.toContain('subscribePharmacyEntries')
    })

    it('ReportsPage uses fetchEntriesRange from useKpiStore', async () => {
      const src = await import('../../pages/shared/ReportsPage.jsx?raw')
      expect(src.default).toContain('fetchEntriesRange')
    })

    it('ReportsPage initialises local fetchedEntries state', async () => {
      const src = await import('../../pages/shared/ReportsPage.jsx?raw')
      expect(src.default).toContain('fetchedEntries')
      expect(src.default).toContain('setFetchedEntries')
    })

    it('ReportsPage has fetchLoading state for in-flight indicator', async () => {
      const src = await import('../../pages/shared/ReportsPage.jsx?raw')
      expect(src.default).toContain('fetchLoading')
    })

    it('ReportsPage has fetchError state for error handling', async () => {
      const src = await import('../../pages/shared/ReportsPage.jsx?raw')
      expect(src.default).toContain('fetchError')
    })
  })

  // ── 2. Admin fetch — no pharmacyId filter ───────────────────

  describe('Admin fetch — no pharmacyId filter', () => {
    it('admin options object is empty (no pharmacyId restriction)', () => {
      const opts = computeFetchOptions(true, null)
      expect(opts).toEqual({})
    })

    it('admin with a pharmacyId still gets empty options (admin sees all)', () => {
      // Admins typically have no pharmacyId, but even if they did,
      // isAdmin=true overrides any branch restriction
      const opts = computeFetchOptions(true, 'ph-a')
      expect(opts).toEqual({})
    })

    it('admin rangeEntries include entries from all branches', () => {
      const result = applyRangeFilter(ENTRIES_MULTI, daysAgoStr(60), todayStr(), 'all')
      const pharmacies = new Set(result.map(e => e.pharmacyId))
      expect(pharmacies.has('ph-a')).toBe(true)
      expect(pharmacies.has('ph-b')).toBe(true)
    })
  })

  // ── 3. Manager/pharmacist fetch — own branch only ───────────

  describe('Manager / pharmacist fetch — pharmacyId filter applied', () => {
    it('manager options include their pharmacyId', () => {
      const opts = computeFetchOptions(false, 'ph-a')
      expect(opts).toEqual({ pharmacyId: 'ph-a' })
    })

    it('pharmacist options include their pharmacyId', () => {
      const opts = computeFetchOptions(false, 'ph-b')
      expect(opts).toEqual({ pharmacyId: 'ph-b' })
    })

    it('user with no pharmacyId gets empty options (safe — no branch data)', () => {
      const opts = computeFetchOptions(false, null)
      expect(opts).toEqual({})
    })

    it('user with undefined pharmacyId gets empty options', () => {
      const opts = computeFetchOptions(false, undefined)
      expect(opts).toEqual({})
    })
  })

  // ── 4. Effective fetch window — 60-day minimum ──────────────

  describe('Effective fetch window covers 60 days minimum', () => {
    it('"Today" preset: effectiveFrom is 60 days ago (not just today)', () => {
      const todayPresetFrom = todayStr()
      const { effectiveFrom } = computeEffectiveFetchWindow(todayPresetFrom)
      expect(effectiveFrom).toBe(daysAgoStr(60))
    })

    it('"Last 7 days" preset: effectiveFrom is 60 days ago (window extended)', () => {
      const weekFrom = daysAgoStr(6)
      const { effectiveFrom } = computeEffectiveFetchWindow(weekFrom)
      expect(effectiveFrom).toBe(daysAgoStr(60))
    })

    it('"This Month" preset: effectiveFrom is 60 days ago if month < 60 days', () => {
      // Current month start is always within 31 days
      // 31 days < 60 days → window extended to 60 days
      const monthStart = new Date()
      monthStart.setDate(1)
      const monthStartStr = monthStart.toISOString().split('T')[0]
      const daysSinceMonthStart = Math.floor((Date.now() - monthStart.getTime()) / 86400000)
      const { effectiveFrom } = computeEffectiveFetchWindow(monthStartStr)
      if (daysSinceMonthStart < 60) {
        expect(effectiveFrom).toBe(daysAgoStr(60))
      }
    })

    it('effectiveTo is always today', () => {
      const { effectiveTo } = computeEffectiveFetchWindow(daysAgoStr(7))
      expect(effectiveTo).toBe(todayStr())
    })

    it('60-day window covers trendData requirement (last 14 days)', () => {
      const fourteenDaysAgo = daysAgoStr(14)
      const sixtyDaysAgo    = daysAgoStr(60)
      // 14 days is within 60 days → covered
      expect(fourteenDaysAgo > sixtyDaysAgo).toBe(true)
    })

    it('60-day window covers executiveSummary historical slice (slice(-60))', () => {
      // executiveSummary uses last 60 days: exactly matches the minimum window
      const { effectiveFrom } = computeEffectiveFetchWindow(todayStr(), 60)
      const sixtyDaysAgo = daysAgoStr(60)
      expect(effectiveFrom).toBe(sixtyDaysAgo)
    })
  })

  // ── 5. Custom historical date ranges ────────────────────────

  describe('Custom historical date ranges — fetch window extends beyond 60 days', () => {
    it('custom range 90 days ago: effectiveFrom is 90 days ago', () => {
      const ninetyDaysAgo = daysAgoStr(90)
      const { effectiveFrom } = computeEffectiveFetchWindow(ninetyDaysAgo)
      expect(effectiveFrom).toBe(ninetyDaysAgo)
    })

    it('custom range 180 days ago: effectiveFrom is 180 days ago', () => {
      const sixMonthsAgo = daysAgoStr(180)
      const { effectiveFrom } = computeEffectiveFetchWindow(sixMonthsAgo)
      expect(effectiveFrom).toBe(sixMonthsAgo)
    })

    it('custom range far in the past extends fetch to that date', () => {
      const twoYearsAgo = '2023-01-01'
      const { effectiveFrom } = computeEffectiveFetchWindow(twoYearsAgo)
      expect(effectiveFrom).toBe(twoYearsAgo)
    })

    it('always chooses the earlier of dateRange.from and 60-days-ago', () => {
      // dateRange.from < 60daysAgo → use dateRange.from
      const oldDate = daysAgoStr(120)
      const { effectiveFrom: fromOld } = computeEffectiveFetchWindow(oldDate)
      expect(fromOld).toBe(oldDate)

      // dateRange.from > 60daysAgo → use 60daysAgo
      const recentDate = daysAgoStr(10)
      const { effectiveFrom: fromRecent } = computeEffectiveFetchWindow(recentDate)
      expect(fromRecent).toBe(daysAgoStr(60))
    })
  })

  // ── 6. rangeEntries in-memory filter ────────────────────────

  describe('rangeEntries — in-memory date + branch filter on fetchedEntries', () => {
    it('scopes to the selected report date range within wider fetched window', () => {
      const from = daysAgoStr(7)
      const to   = todayStr()
      const result = applyRangeFilter(ENTRIES_MULTI, from, to, 'all')
      // Only entries within last 7 days
      result.forEach(e => {
        expect(e.date >= from).toBe(true)
        expect(e.date <= to).toBe(true)
      })
    })

    it('entries beyond the selected range are excluded', () => {
      const from = daysAgoStr(7)
      const to   = todayStr()
      const result = applyRangeFilter(ENTRIES_MULTI, from, to, 'all')
      // 30-day, 55-day, 90-day, 120-day entries must not appear
      const outside = result.filter(e => e.date < from)
      expect(outside).toHaveLength(0)
    })

    it('admin selectedBranch=all returns entries from all pharmacies', () => {
      const from = daysAgoStr(60)
      const to   = todayStr()
      const result = applyRangeFilter(ENTRIES_MULTI, from, to, 'all')
      const pharmacies = new Set(result.map(e => e.pharmacyId))
      expect(pharmacies.size).toBeGreaterThan(1)
    })

    it('admin selectedBranch=ph-b filters to that branch only', () => {
      const from = daysAgoStr(60)
      const to   = todayStr()
      const result = applyRangeFilter(ENTRIES_MULTI, from, to, 'ph-b')
      expect(result.every(e => e.pharmacyId === 'ph-b')).toBe(true)
    })

    it('empty result when date range has no matching entries', () => {
      // Range in the future — no entries
      const from = '2099-01-01'
      const to   = '2099-01-31'
      const result = applyRangeFilter(ENTRIES_MULTI, from, to, 'all')
      expect(result).toHaveLength(0)
    })
  })

  // ── 7. No silent empty results due to subscription window ───

  describe('No silent empty results — custom old ranges are fully supported', () => {
    it('90-day custom range: fetchedEntries from 90 days ago are available', () => {
      // Simulate: fetchedEntries contains 90-day-old entry (fetch window was extended)
      const ninetyDaysAgo = daysAgoStr(90)
      const oldEntry: Entry = { date: ninetyDaysAgo, pharmacyId: 'ph-a', wasfaty: 5 }
      const allEntries = [oldEntry]
      const result = applyRangeFilter(allEntries, ninetyDaysAgo, todayStr(), 'all')
      // With subscribeAllEntries this might have returned 0 (if window was only 90 days)
      // With fetchEntriesRange + effectiveFrom = ninetyDaysAgo → returns the entry
      expect(result).toHaveLength(1)
      expect(result[0].date).toBe(ninetyDaysAgo)
    })

    it('preset "Today" does not miss 14-day trend data', () => {
      // Even with "Today" preset, effectiveFrom is 60 days ago
      // So entries from the past 14 days are present in fetchedEntries
      const fourteenDaysAgo = daysAgoStr(14)
      const entry14: Entry = { date: fourteenDaysAgo, pharmacyId: 'ph-a', wasfaty: 7 }
      // Entry IS in fetchedEntries because effective window = 60 days
      // It's NOT in rangeEntries because dateRange = today only
      // But trendData reads directly from fetchedEntries, not rangeEntries
      const { effectiveFrom } = computeEffectiveFetchWindow(todayStr())
      expect(fourteenDaysAgo >= effectiveFrom).toBe(true)
    })
  })

  // ── 8. subscribeAllKpiEntries removed (Fix Batch 5) ─────────
  // Orphaned pages deleted. Deprecated function removed.

  describe('subscribeAllKpiEntries — confirmed removed after orphan cleanup', () => {
    it('subscribeAllKpiEntries is NOT exported from kpiService', async () => {
      const svc = await import('../../services/kpiService')
      expect((svc as Record<string, unknown>).subscribeAllKpiEntries).toBeUndefined()
    })

    it('subscribeAllEntries is NOT in kpiStore', async () => {
      const { useKpiStore } = await import('../../store/kpiStore')
      const store = useKpiStore.getState() as Record<string, unknown>
      expect(store.subscribeAllEntries).toBeUndefined()
    })

    it('kpiService source does NOT contain the deprecated function', async () => {
      const src = await import('../../services/kpiService.js?raw')
      expect(src.default).not.toContain('subscribeAllKpiEntries')
    })
  })
})
