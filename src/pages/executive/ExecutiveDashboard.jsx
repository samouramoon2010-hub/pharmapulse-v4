// ============================================================
// Executive Dashboard — Phase 4A
// Admin-only route: /executive
// Orchestrates useExecutiveReport() → renders sub-components.
// Zero business logic in this file — all analytics in engine.
// ============================================================
import React, { useEffect, useState } from 'react'
import { BarChart3, RefreshCw, Calendar } from 'lucide-react'
import { format } from 'date-fns'

import { useKpiStore }      from '../../store/kpiStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useAuthStore }     from '../../store/authStore'
import { useExecutiveReport }        from '../../hooks/useExecutiveReport'
import { useRegionalIntelligence }   from '../../hooks/useRegionalIntelligence'
import { useScopeProfile }           from '../../hooks/useScopeProfile'
import { isPharmacyAllowed }         from '../../services/scopeResolver'

import {
  SkeletonStatCard,
  SkeletonChart,
} from '../../components/ui/SkeletonCard'
import EmptyState from '../../components/ui/EmptyState'

import PortfolioScoreCard    from '../../components/executive/PortfolioScoreCard'
import RiskDistributionPanel from '../../components/executive/RiskDistributionPanel'
import PortfolioKpiHeatmap   from '../../components/executive/PortfolioKpiHeatmap'
import BranchLeaderboard     from '../../components/executive/BranchLeaderboard'
import ExecutiveInsightsFeed from '../../components/executive/ExecutiveInsightsFeed'
import BranchDrilldown            from '../../components/executive/BranchDrilldown'
import RegionalIntelligencePanel  from '../../components/executive/RegionalIntelligencePanel'
import ExecutiveTeamRollup        from '../../components/executive/ExecutiveTeamRollup'
import ExecutiveSummaryPanel      from '../../components/executive/ExecutiveSummaryPanel'

import { useExecutiveTeamRollup } from '../../hooks/useExecutiveTeamRollup'

/** @typedef {import('../../engine/executive').BranchExecutiveSummary} BranchExecutiveSummary */

export default function ExecutiveDashboard() {
  const { subscribeRecentEntries, subscribeRecentTargets } = useKpiStore()
  const { subscribe: subscribePharmacies }            = usePharmacyStore()

  // ── Activate store subscriptions (reused if already active) ──
  useEffect(() => {
    const unsubEntries    = subscribeRecentEntries()
    const unsubTargets    = subscribeRecentTargets()
    const unsubPharmacies = subscribePharmacies()
    return () => {
      unsubEntries()
      unsubTargets()
      unsubPharmacies()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Report data from hook ─────────────────────────────────
  const { report, loading, empty } = useExecutiveReport()
  const { intelligence, branchRollups, liveRegistry } = useRegionalIntelligence()

  // ── Phase 2G-3: scope-aware labels ──────────────────────
  const { userProfile } = useAuthStore()
  const { scope }       = useScopeProfile()

  // Single-scope covers manager + branch_manager (one branch only).
  const isManager = scope?.type === 'single'

  // For single scope, derive branch name/code from the first entry in allBranches.
  const managerBranch = isManager ? report?.allBranches?.[0] : null

  // ── Scope-derived label set ───────────────────────────────
  const pageTitle =
    scope?.type === 'single' ? 'Branch Executive View' :
    scope?.type === 'all'    ? 'Enterprise Executive View' :
    scope?.type === 'list'   ? 'Territory Executive View' :
    'Executive BI'

  const branchCountLabel =
    scope?.type === 'single' ? 'My Branch' :
    scope?.type === 'list'   ? 'My Assigned Branches' :
    'All Branches'

  const selectedBranchLabel =
    scope?.type === 'single' ? 'My Branch' :
    scope?.type === 'list'   ? 'Selected Branch' :
    'Portfolio Branch'

  const pageSubtitle = scope?.type === 'single'
    ? `Branch intelligence · ${managerBranch?.pharmacyName ?? ''} · ${managerBranch?.pharmacyCode ?? ''}`
    : scope
      ? `Portfolio intelligence · ${branchCountLabel} · ${report?.reportMonth ?? ''}`
      : null

  // ── Phase A.1: Team Intelligence Rollup (manager only) ───
  // enabled=false for admin — returns null data, no effect on admin view.
  const teamRollup = useExecutiveTeamRollup()
  // ── Branch drill-down selection ───────────────────────────
  const [selectedBranch, setSelectedBranch] = useState(null)

  const handleSelectBranch = (branch) => {
    if (!scope) return
    if (!isPharmacyAllowed(scope, branch.pharmacyId)) return
    setSelectedBranch((prev) => prev?.pharmacyId === branch.pharmacyId ? null : branch)
  }

  const handleCloseDetail = () => setSelectedBranch(null)

  // ── Loading skeleton ──────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
        <SkeletonChart />
        <SkeletonChart />
      </div>
    )
  }

  // ── Empty state ───────────────────────────────────────────
  if (empty || !report) {
    return (
      <div style={{ padding: '24px' }}>
        <EmptyState
          icon={BarChart3}
          title="No executive data available"
          description="Add pharmacies and KPI targets to generate the Executive BI report."
        />
      </div>
    )
  }

  // ── Executive Summary Panel — UI 3.0 narrative readout ────
  // Pure display formatting over already-computed report fields —
  // no new scoring/ranking/aggregation. allBranches is pre-sorted by
  // score (BranchLeaderboard relies on the same ordering), so its
  // first entry is the top-ranked branch already used elsewhere
  // (see managerBranch above for the single-scope case).
  const topBranch = report?.allBranches?.[0] ?? null
  const kpiLabelFor = (kpiKey) =>
    topBranch?.score?.kpiBreakdown?.find((k) => k.kpiKey === kpiKey)?.label ?? kpiKey

  const summaryBestKpi  = topBranch?.strongestKpi ? kpiLabelFor(topBranch.strongestKpi) : null
  const summaryFocusKpi = topBranch?.weakestKpi   ? kpiLabelFor(topBranch.weakestKpi)   : null

  const riskInsight = report?.portfolioInsights?.find((i) => i.type === 'RISK')
  const oppInsight  = report?.portfolioInsights?.find((i) => i.type === 'OPPORTUNITY')
  const summaryPrimaryRisk    = riskInsight?.body ?? riskInsight?.title ?? null
  const summaryTopOpportunity = oppInsight?.body ?? oppInsight?.title ?? null

  const summaryNarrative = report
    ? `${report.portfolioGrade} grade · ${report.activeBranches}/${report.totalBranches} branches active · `
      + `${report.riskDistribution.highRisk} at high risk, ${report.riskDistribution.onTrack} on track.`
    : null

  // ── Main layout ───────────────────────────────────────────
  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{
            fontSize: '18px', fontWeight: 700,
            color: 'var(--text-primary)', margin: 0, lineHeight: 1,
          }}>
            {pageTitle}
          </h1>
          {pageSubtitle && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {pageSubtitle}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 10px', borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            fontSize: '12px', color: 'var(--text-muted)',
          }}>
            <Calendar style={{ width: 12, height: 12 }} />
            {format(new Date(report.generatedAt), 'dd MMM yyyy, HH:mm')}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 10px', borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            fontSize: '12px', color: 'var(--text-muted)',
          }}>
            <RefreshCw style={{ width: 12, height: 12 }} />
            Live
          </div>
        </div>
      </div>

      {/* Executive Summary — dense narrative readout (UI 3.0) */}
      <ExecutiveSummaryPanel
        overallScore={report.portfolioScore}
        bestKpi={summaryBestKpi}
        focusKpi={summaryFocusKpi}
        primaryRisk={summaryPrimaryRisk}
        topOpportunity={summaryTopOpportunity}
        narrative={summaryNarrative}
      />

      {/* Row 1: Score + Risk */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <PortfolioScoreCard    report={report} isManager={isManager} />
        <RiskDistributionPanel report={report} isManager={isManager} />
      </div>

      {/* Row 2: KPI Heatmap */}
      <PortfolioKpiHeatmap report={report} isManager={isManager} registry={liveRegistry} />

      {/* Row 2.5: Team Intelligence Rollup (manager only — null/no-op for admin) */}
      {teamRollup.enabled && (
        <ExecutiveTeamRollup
          teamIntelligence={teamRollup.teamIntelligence}
          pharmacyId={teamRollup.pharmacyId}
          month={teamRollup.month}
          loading={teamRollup.loading}
        />
      )}

      {/* Row 3: Leaderboard + Drilldown (side-by-side when branch selected) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: selectedBranch ? '1fr 1fr' : '1fr',
        gap: '16px',
        alignItems: 'start',
      }}>
        <BranchLeaderboard
          report={report}
          onSelectBranch={handleSelectBranch}
          selectedId={selectedBranch?.pharmacyId}
          scopeType={scope?.type}
        />
        {selectedBranch && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              {selectedBranchLabel}
            </div>
            <BranchDrilldown
              branch={selectedBranch}
              onClose={handleCloseDetail}
            />
          </div>
        )}
      </div>

      {/* Row 4: Insights + Recommendations */}
      <ExecutiveInsightsFeed report={report} isManager={isManager} />

      {/* Row 5: Regional Intelligence — hidden for single-branch scope */}
      {scope?.type !== 'single' && intelligence && (
        <RegionalIntelligencePanel intelligence={intelligence} branchRollups={branchRollups ?? []} liveRegistry={liveRegistry} />
      )}

    </div>
  )
}
