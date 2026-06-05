// ============================================================
// KPI Store — realtime Firestore entries + targets
// ============================================================
import { create } from 'zustand'
import {
  subscribeKpiEntries,
  subscribeRecentKpiEntries, fetchKpiEntriesRange,
  saveKpiEntry, subscribeTargets, subscribeAllTargets, subscribeRecentTargets, saveTarget,
} from '../services/kpiService'

export const useKpiStore = create((set, get) => ({
  entries:  [],
  targets:  [],
  loading:  true,

  // ── Subscribe entries ─────────────────────────────────────
  subscribeMyEntries: (userId, pharmacyId) => {
    return subscribeKpiEntries({ userId, pharmacyId }, (list) =>
      set({ entries: list, loading: false })
    )
  },

  subscribePharmacyEntries: (pharmacyId) => {
    return subscribeKpiEntries({ pharmacyId }, (list) =>
      set({ entries: list, loading: false })
    )
  },


  // Rolling 90-day real-time listener for live/operational admin views.
  // Use this instead of subscribeAllEntries for any view whose data
  // requirements fit within the rolling window (Dashboard, Executive,
  // Team, Targets). Pass a custom `days` value if a wider window is needed.
  subscribeRecentEntries: (days = 90) => {
    return subscribeRecentKpiEntries((list) =>
      set({ entries: list, loading: false }),
    days)
  },

  // On-demand historical fetch for analysis views (e.g. Reports with
  // custom date range). Does NOT update the Zustand store — returns the
  // data directly to the caller so each fetch is scoped and disposable.
  fetchEntriesRange: (fromDate, toDate, options = {}) => {
    return fetchKpiEntriesRange(fromDate, toDate, options)
  },

  // ── Save entry ────────────────────────────────────────────
  // registry: optional live KpiRegistry from caller (e.g. KpiEntryPage).
  // When provided, sanitizeKpiEntryFields uses it as the allowlist so
  // custom KPIs added via Firestore registry are persisted correctly.
  // Falls back to DEFAULT_KPI_REGISTRY when omitted.
  saveEntry: async (data, registry) => {
    return saveKpiEntry({ ...data, registry })
  },

  // ── Targets ───────────────────────────────────────────────
  subscribeMyTargets: (pharmacyId) => {
    return subscribeTargets(pharmacyId, (list) => set({ targets: list }))
  },

  // @deprecated — unbounded target listener. Use subscribeRecentTargets instead.
  subscribeAllTargets: () => {
    return subscribeAllTargets((list) => set({ targets: list }))
  },

  // Bounded 6-month rolling target subscription.
  // Covers all current consumers: Dashboard (currentMonth),
  // TeamPage (currentMonth), TargetsPage (±2 months),
  // ExecutiveDashboard (currentMonth), ReportsPage (currentMonth).
  subscribeRecentTargets: (months = 6) => {
    return subscribeRecentTargets((list) => set({ targets: list }), months)
  },

  saveTarget: async (data) => {
    return saveTarget(data)
  },

  // ── Computed helpers ──────────────────────────────────────
  getTodayEntry: (userId, pharmacyId, date) => {
    return get().entries.find(
      (e) => e.userId === userId && e.pharmacyId === pharmacyId && e.date === date
    )
  },

  getEntriesForDate: (date) => get().entries.filter((e) => e.date === date),

  getEntriesForPharmacy: (pharmacyId) =>
    get().entries.filter((e) => e.pharmacyId === pharmacyId),

  getTargetForMonth: (pharmacyId, month) =>
    get().targets.find((t) => t.pharmacyId === pharmacyId && t.month === month),
}))
