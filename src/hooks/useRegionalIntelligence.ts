// ============================================================
// useRegionalIntelligence — Regional Intelligence Hook
// Reuses already-loaded store data — zero extra Firestore reads.
// Assembles BranchRollupInput[], calls generateBranchRollup()
// for each branch, then generateRegionalIntelligence().
// No business logic here — all analytics in the engine layer.
// ============================================================

import { useMemo } from 'react'
import { format, getDaysInMonth } from 'date-fns'

import { useKpiStore }      from '../store/kpiStore'
import { usePharmacyStore } from '../store/pharmacyStore'

import {
  filterToCurrentMonth,
  filterByDateRange,
} from '../engine'

import {
  generateBranchRollup,
  generateRegionalIntelligence,
} from '../engine/regionalIntelligence'

import type {
  BranchRollupInput,
  RegionalPeriod,
  RegionalIntelligenceOutput,
} from '../engine/regionalIntelligence'

import type { KpiEntry, MonthlyTarget } from '../engine'

// ── Date helpers ──────────────────────────────────────────────

function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function currentMonthStr(): string {
  return format(new Date(), 'yyyy-MM')
}

function monthStartStr(): string {
  return format(new Date(), 'yyyy-MM-') + '01'
}

function sixtyDaysAgoStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 60)
  return format(d, 'yyyy-MM-dd')
}

function buildCurrentPeriod(): RegionalPeriod {
  const now         = new Date()
  const dayOfMonth  = now.getDate()
  const daysInMonth = getDaysInMonth(now)
  return {
    type:      'MTD',
    startDate: monthStartStr(),
    endDate:   todayStr(),
    month:     currentMonthStr(),
    dayRatio:  Math.min(1, dayOfMonth / daysInMonth),
  }
}

// ── Hook return shape ─────────────────────────────────────────

export interface UseRegionalIntelligenceResult {
  intelligence: RegionalIntelligenceOutput | null
  loading:      boolean
  /** True when stores have data but no branches found */
  empty:        boolean
}

// ── Main hook ─────────────────────────────────────────────────

export function useRegionalIntelligence(): UseRegionalIntelligenceResult {
  const { entries, targets, loading: kpiLoading }  = useKpiStore()
  const { pharmacies, loading: pharmacyLoading }   = usePharmacyStore()

  const loading = kpiLoading || pharmacyLoading

  // ── Build reporting period ────────────────────────────────
  // Captured once per render; stable within the same day.
  // The engine period is not in useMemo deps because it only changes
  // at day boundaries — and when the day changes, entries/pharmacies
  // will also change, triggering the intelligence memo to re-run.
  const today_         = todayStr()
  const currentMonth_  = currentMonthStr()
  const historyStart_  = sixtyDaysAgoStr()

  const period = useMemo<RegionalPeriod>(
    () => buildCurrentPeriod(),
    // Explicit date string dep — re-runs the period when the date changes
    [today_], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ── Assemble BranchRollupInput[] ─────────────────────────
  // Reuses the same store data already loaded by useExecutiveReport.
  // Zero additional Firestore reads.
  const branchInputs = useMemo<BranchRollupInput[]>(() => {
    if (loading || !pharmacies.length) return []

    const today        = today_
    const historyStart = historyStart_
    const currentMonth = currentMonth_

    return pharmacies
      .filter((p) => p.active !== false)
      .map((pharmacy): BranchRollupInput => {
        const pharmacyEntries = (entries as KpiEntry[]).filter(
          (e) => e.pharmacyId === pharmacy.id,
        )

        const mtdEntries = filterToCurrentMonth(pharmacyEntries)

        const historicalEntries = filterByDateRange(
          pharmacyEntries,
          historyStart,
          today,
        ).sort((a, b) => a.date.localeCompare(b.date))

        const target = (targets as MonthlyTarget[]).find(
          (t) => t.pharmacyId === pharmacy.id && t.month === currentMonth,
        ) ?? null

        const todayEntries   = pharmacyEntries.filter((e) => e.date === today)
        const submittedToday = new Set(todayEntries.map((e) => e.userId)).size

        return {
          branchId:         pharmacy.id,
          branchName:       pharmacy.name ?? pharmacy.id,
          branchCode:       pharmacy.code ?? pharmacy.id,
          region:           pharmacy.region ?? '',
          entries:          mtdEntries,
          historicalEntries,
          target,
          submittedToday,
        }
      })
  }, [entries, targets, pharmacies, loading, today_, currentMonth_, historyStart_])

  // ── Build BranchRollupSummary[] + generate intelligence ──
  // Both steps are pure engine calls — no business logic here.
  const intelligence = useMemo<RegionalIntelligenceOutput | null>(() => {
    if (!branchInputs.length) return null

    const rollupSummaries = branchInputs.map((input) =>
      generateBranchRollup(input, period),
    )

    return generateRegionalIntelligence({
      branchRollups: rollupSummaries,
      period,
    })
  }, [branchInputs, period])

  return {
    intelligence,
    loading,
    empty: !loading && !intelligence,
  }
}
