// ============================================================
// useRegionalIntelligence — Regional Intelligence Hook
// Reuses already-loaded store data — zero extra Firestore reads.
// Assembles BranchRollupInput[], calls generateBranchRollup()
// for each branch, then generateRegionalIntelligence().
// No business logic here — all analytics in the engine layer.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { format, getDaysInMonth } from 'date-fns'

import { useKpiStore }      from '../store/kpiStore'
import { usePharmacyStore } from '../store/pharmacyStore'
import { useScopeProfile }         from './useScopeProfile'
import { filterAllowedPharmacies } from '../services/scopeResolver'

import {
  filterToCurrentMonth,
  filterByDateRange,
} from '../engine'

import {
  generateBranchRollup,
  generateRegionalIntelligence,
} from '../engine/regionalIntelligence'

import { subscribeKpiRegistry } from '../services/kpiRegistryService'
import { DEFAULT_KPI_REGISTRY } from '../engine/kpiRegistry'

import type {
  BranchRollupInput,
  BranchRollupSummary,
  RegionalPeriod,
  RegionalIntelligenceOutput,
} from '../engine/regionalIntelligence'

import type { KpiRegistry } from '../engine/kpiRegistry'
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
  intelligence:  RegionalIntelligenceOutput | null
  branchRollups: BranchRollupSummary[]
  /** Live KPI registry — dynamic/custom production KPIs included automatically. */
  liveRegistry:  KpiRegistry
  loading:       boolean
  /** True when stores have data but no branches found */
  empty:         boolean
}

// ── Main hook ─────────────────────────────────────────────────

export function useRegionalIntelligence(): UseRegionalIntelligenceResult {
  const { entries, targets, loading: kpiLoading }  = useKpiStore()
  const { pharmacies, loading: pharmacyLoading }   = usePharmacyStore()
  const { scope, loading: scopeLoading }           = useScopeProfile()

  const loading = kpiLoading || pharmacyLoading || scopeLoading

  // ── Live KPI registry — dynamic/custom production KPIs ───
  // Same subscribe-with-fallback pattern used by other pages
  // (TargetsPage, SettingsPage, DashboardPage, etc.).
  const [liveRegistry, setLiveRegistry] = useState<KpiRegistry>(DEFAULT_KPI_REGISTRY)
  useEffect(() => {
    return subscribeKpiRegistry(
      (reg) => setLiveRegistry(reg),
      () => setLiveRegistry(DEFAULT_KPI_REGISTRY),
    )
  }, [])

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

  // ── Phase 2G-2: scope-driven pharmacy list ────────────────
  // Mirrors the fix in useExecutiveReport — same scope resolver pattern.
  // scope null → [] (loading); all → full list; single → own branch;
  // list → assigned branches; none → [].
  const scopedPharmacies = useMemo(() => {
    if (!scope) return []
    return filterAllowedPharmacies(scope, pharmacies)
  }, [scope, pharmacies])

  // ── Assemble BranchRollupInput[] ─────────────────────────
  // Reuses the same store data already loaded by useExecutiveReport.
  // Zero additional Firestore reads.
  const branchInputs = useMemo<BranchRollupInput[]>(() => {
    if (loading || !scopedPharmacies.length) return []

    const today        = today_
    const historyStart = historyStart_
    const currentMonth = currentMonth_

    return scopedPharmacies
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
  }, [entries, targets, scopedPharmacies, loading, today_, currentMonth_, historyStart_])

  // ── Build BranchRollupSummary[] + generate intelligence ──
  // Both steps are pure engine calls — no business logic here.
  const [branchRollups, intelligence] = useMemo<[BranchRollupSummary[], RegionalIntelligenceOutput | null]>(() => {
    if (!branchInputs.length) return [[], null]

    const rollupSummaries = branchInputs.map((input) =>
      generateBranchRollup(input, period, liveRegistry),
    )

    return [
      rollupSummaries,
      generateRegionalIntelligence({
        branchRollups: rollupSummaries,
        period,
        registry: liveRegistry,
      }),
    ]
  }, [branchInputs, period, liveRegistry])

  return {
    intelligence,
    branchRollups,
    liveRegistry,
    loading,
    empty: !loading && !intelligence,
  }
}
