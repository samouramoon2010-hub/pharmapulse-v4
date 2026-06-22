// ============================================================
// ExecutiveInsightPanel — Read-only explainable intelligence (Phase 6E)
//
// Fetches ledger entries via the existing listLedgerEntries()
// service, then computes everything through the existing kernels:
// analyzeOpportunities(), computeTrend(), computeBenchmark(),
// buildExecutiveSummary(), generateRecommendations(). No insight,
// opportunity, recommendation, or benchmark math is performed
// inside this component — only fetching, wiring, and rendering.
//
// Read-only. No writes. No Firestore import. No AI.
// ============================================================
import React, { useEffect, useRef, useState } from 'react'
import { BrainCircuit } from 'lucide-react'

import ExecutiveSummaryCard from './ExecutiveSummaryCard'
import StrengthCard from './StrengthCard'
import RiskCard from './RiskCard'
import OpportunityCard from './OpportunityCard'
import RecommendationCard from './RecommendationCard'
import EmptyState, { ErrorState } from '../ui/EmptyState'
import { SkeletonWidget } from '../ui/SkeletonCard'

import { listLedgerEntries } from '../../evaluationLedger/evaluationLedgerService'
import { computeBenchmark } from '../../evaluationLedger/ranking/benchmarkEngine'
import { computeTrend } from '../../evaluationLedger/ranking/trendEngine'
import { analyzeOpportunities } from '../../intelligence/opportunityEngine'
import { buildInsightInput } from '../../intelligence/insightFactory'
import { buildExecutiveSummary } from '../../intelligence/insightEngine'
import { generateRecommendations } from '../../intelligence/recommendationEngine'
import { normalizeError } from '../../profileStudio/profileStudioStore'

export default function ExecutiveInsightPanel({ actor, profileId, entityId, entityType, periodId, previousPeriodId }) {
  const [ownHistory, setOwnHistory] = useState([])
  const [peerEntries, setPeerEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!profileId || !entityId || !actor) return
    cancelledRef.current = false
    setLoading(true)
    setError(null)
    Promise.all([
      listLedgerEntries(actor, { profileId, entityId }),
      listLedgerEntries(actor, { profileId, entityType, periodId }),
    ])
      .then(([own, peers]) => { if (!cancelledRef.current) { setOwnHistory(own); setPeerEntries(peers) } })
      .catch((err) => { if (!cancelledRef.current) setError(normalizeError(err)) })
      .finally(() => { if (!cancelledRef.current) setLoading(false) })
    return () => { cancelledRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, entityId, entityType, periodId])

  if (!profileId || !entityId) return null
  if (loading) return <SkeletonWidget height={260} label="Executive Insight" />
  if (error) return <ErrorState message={error.message} />

  const current = ownHistory.find((e) => e.periodId === periodId)
  const previous = previousPeriodId ? ownHistory.find((e) => e.periodId === previousPeriodId) : undefined

  if (!current) {
    return <EmptyState icon={BrainCircuit} title="No evaluation yet" description="Run an evaluation for this entity and period to generate insights" compact />
  }

  const benchmark = computeBenchmark({ groupId: `${entityType}:${periodId}`, scores: peerEntries.map((e) => ({ entityId: e.entityId, score: e.score })) })
  const opportunityResult = analyzeOpportunities({ entry: current, previousEntry: previous, benchmarkAverage: benchmark.group.average })
  const trend = computeTrend(ownHistory, entityId)
  const insightInput = buildInsightInput({ overallScore: current.score, opportunityResult, trend, benchmarkAverage: benchmark.group.average })
  const summary = buildExecutiveSummary(insightInput)
  const recommendations = generateRecommendations(opportunityResult)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <BrainCircuit style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Executive Intelligence
        </span>
      </div>

      <ExecutiveSummaryCard summary={summary} />

      {summary.strengths.map((item, idx) => <StrengthCard key={`s-${idx}`} item={item} />)}
      {summary.risks.map((item, idx) => <RiskCard key={`r-${idx}`} item={item} />)}
      {summary.opportunities.map((item, idx) => <OpportunityCard key={`o-${idx}`} item={item} />)}

      {recommendations.items.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
            Recommendations
          </div>
          {recommendations.items.map((item) => <RecommendationCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}
