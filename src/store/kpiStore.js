// ============================================================
// KPI Store — realtime Firestore entries + targets
// ============================================================
import { create } from 'zustand'
import {
  subscribeKpiEntries, subscribeAllKpiEntries,
  saveKpiEntry, subscribeTargets, subscribeAllTargets, saveTarget,
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

  subscribeAllEntries: () => {
    return subscribeAllKpiEntries((list) =>
      set({ entries: list, loading: false })
    )
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

  subscribeAllTargets: () => {
    return subscribeAllTargets((list) => set({ targets: list }))
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
