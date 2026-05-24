// ============================================================
// useExecutiveReport — Executive BI Data Orchestration Hook
// Assembles BranchInput[] from existing store subscriptions,
// calls generateExecutiveReport(), and memoizes the result.
// Zero extra Firestore reads — reuses kpiStore + pharmacyStore.
// No business logic here — all analytics in the engine layer.
// ============================================================

import { useMemo } from 'react'
import { format } from 'date-fns'
import { useKpiStore }      from '../store/kpiStore'
import { usePharmacyStore } from '../store/pharmacyStore'
import { useAuthStore }     from '../store/authStore'

import {
  filterToCurrentMonth,
  filterByDateRange,
} from '../engine'

import {
  generateExecutiveReport,
} from '../engine/executive'

import type {
  BranchInput,
  ExecutiveReport,
} from '../engine/executive'

import type { KpiEntry, MonthlyTarget } from '../engine'

// ── Date helpers ──────────────────────────────────────────────
function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function currentMonthStr(): string {
  return format(new Date(), 'yyyy-MM')
}

function sixtyDaysAgoStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 60)
  return format(d, 'yyyy-MM-dd')
}

// ── Hook return shape ─────────────────────────────────────────
export interface UseExecutiveReportResult {
  report:   ExecutiveReport | null
  loading:  boolean
  /** True when stores have data but no active branches found */
  empty:    boolean
}

// ── Main hook ─────────────────────────────────────────────────
export function useExecutiveReport(): UseExecutiveReportResult {
  const { entries, targets, loading: kpiLoading }       = useKpiStore()
  const { pharmacies, loading: pharmacyLoading }         = usePharmacyStore()
  const { userProfile }                                  = useAuthStore()

  const loading = kpiLoading || pharmacyLoading

  // ── Assemble BranchInput[] from store data ────────────────
  // Memoized — only re-runs when store data changes.
  // All transformation logic uses engine utilities only.
  const branches = useMemo<BranchInput[]>(() => {
    if (loading || !pharmacies.length) return []

    const today         = todayStr()
    const historyStart  = sixtyDaysAgoStr()
    const currentMonth  = currentMonthStr()

    return pharmacies
      .filter((p) => p.active !== false)
      .map((pharmacy): BranchInput => {
        // All entries for this pharmacy
        const pharmacyEntries = (entries as KpiEntry[]).filter(
          (e) => e.pharmacyId === pharmacy.id
        )

        // MTD entries — current month only
        const mtdEntries = filterToCurrentMonth(pharmacyEntries)

        // Historical entries — last 60 days, sorted oldest → newest
        const historicalEntries = filterByDateRange(
          pharmacyEntries,
          historyStart,
          today,
        ).sort((a, b) => a.date.localeCompare(b.date))

        // Target for current month
        const target = (targets as MonthlyTarget[]).find(
          (t) => t.pharmacyId === pharmacy.id && t.month === currentMonth,
        ) ?? null

        // Submission coverage for today
        const todayEntries  = pharmacyEntries.filter((e) => e.date === today)
        const submittedToday = new Set(todayEntries.map((e) => e.userId)).size

        return {
          pharmacyId:      pharmacy.id,
          pharmacyName:    pharmacy.name ?? pharmacy.id,
          pharmacyCode:    pharmacy.code ?? pharmacy.id,
          region:          pharmacy.region ?? '',
          mtdEntries,
          historicalEntries,
          target,
          submittedToday,
          // pharmacistCount not stored on pharmacy doc — engine falls back
          // to distinct submitters as a safe proxy (see executiveScore.ts)
        }
      })
  }, [entries, targets, pharmacies, loading])

  // ── Generate full portfolio report ────────────────────────
  const report = useMemo<ExecutiveReport | null>(() => {
    if (!branches.length) return null

    return generateExecutiveReport({
      branches,
      reportDate:  todayStr(),
      reportMonth: currentMonthStr(),
      generatedBy: userProfile?.id ?? 'system',
    })
  }, [branches, userProfile?.id])

  const empty = !loading && !report

  return { report, loading, empty }
}
