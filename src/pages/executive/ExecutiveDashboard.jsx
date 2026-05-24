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
import { useExecutiveReport }        from '../../hooks/useExecutiveReport'
import { useRegionalIntelligence }   from '../../hooks/useRegionalIntelligence'

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

/** @typedef {import('../../engine/executive').BranchExecutiveSummary} BranchExecutiveSummary */

export default function ExecutiveDashboard() {
  const { subscribeAllEntries, subscribeAllTargets } = useKpiStore()
  const { subscribe: subscribePharmacies }            = usePharmacyStore()

  // ── Activate store subscriptions (reused if already active) ──
  useEffect(() => {
    const unsubEntries    = subscribeAllEntries()
    const unsubTargets    = subscribeAllTargets()
    const unsubPharmacies = subscribePharmacies()
    return () => {
      unsubEntries()
      unsubTargets()
      unsubPharmacies()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Report data from hook ─────────────────────────────────
  const { report, loading, empty } = useExecutiveReport()
  const { intelligence }            = useRegionalIntelligence()

  // ── Branch drill-down selection ───────────────────────────
  const [selectedBranch, setSelectedBranch] = useState(null)

  const handleSelectBranch = (branch) => {
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
            Executive BI
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Portfolio intelligence · {report.totalBranches} branches · {report.reportMonth}
          </p>
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

      {/* Row 1: Score + Risk */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <PortfolioScoreCard    report={report} />
        <RiskDistributionPanel report={report} />
      </div>

      {/* Row 2: KPI Heatmap */}
      <PortfolioKpiHeatmap report={report} />

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
        />
        {selectedBranch && (
          <BranchDrilldown
            branch={selectedBranch}
            onClose={handleCloseDetail}
          />
        )}
      </div>

      {/* Row 4: Insights + Recommendations */}
      <ExecutiveInsightsFeed report={report} />

      {/* Row 5: Regional Intelligence (collapsible) */}
      {intelligence && (
        <RegionalIntelligencePanel intelligence={intelligence} />
      )}

    </div>
  )
}
