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
  saveEntry: async (data) => {
    return saveKpiEntry(data)
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
