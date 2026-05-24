// ============================================================
// ExecutiveInsightsFeed — renders pre-computed insights & recs
// Receives processed ExecutiveReport output. No analytics here.
// ============================================================
import React, { useState } from 'react'
import { Lightbulb, AlertTriangle, TrendingUp, Target, Star, Info, ChevronDown, ChevronUp, Zap } from 'lucide-react'

const PRIORITY_CFG = {
  CRITICAL: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',    border: 'rgba(239,68,68,0.2)',    label: 'Critical' },
  HIGH:     { color: '#f97316', bg: 'rgba(249,115,22,0.08)',   border: 'rgba(249,115,22,0.2)',   label: 'High'     },
  MEDIUM:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.2)',   label: 'Medium'   },
  INFO:     { color: '#a1a1aa', bg: 'rgba(161,161,170,0.06)',  border: 'rgba(161,161,170,0.15)', label: 'Info'     },
}

const INSIGHT_ICON = {
  ACHIEVEMENT: Star,
  TREND:       TrendingUp,
  RISK:        AlertTriangle,
  OPPORTUNITY: Target,
  MILESTONE:   Star,
}

const ACTION_LABEL = {
  FOCUS_KPI:    'Focus KPI',
  COACH_BRANCH: 'Coach',
  ESCALATE:     'Escalate',
  RECOGNIZE:    'Recognize',
  SET_TARGET:   'Set Target',
  REVIEW_PACE:  'Review Pace',
}

function InsightCard({ insight }) {
  const cfg  = PRIORITY_CFG[insight.priority] ?? PRIORITY_CFG.INFO
  const Icon = INSIGHT_ICON[insight.type] ?? Info

  return (
    <div style={{
      padding: '10px 12px', borderRadius: '8px',
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      display: 'flex', gap: '10px', alignItems: 'flex-start',
    }}>
      <Icon style={{ width: 14, height: 14, color: cfg.color, flexShrink: 0, marginTop: 1 }} strokeWidth={1.75} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{insight.title}</span>
          <span style={{
            fontSize: '10px', fontWeight: 500, padding: '1px 5px', borderRadius: '99px',
            color: cfg.color, background: 'var(--bg-surface)', border: `1px solid ${cfg.border}`,
          }}>
            {cfg.label}
          </span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
          {insight.body}
        </p>
        {insight.pharmacyName && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
            {insight.pharmacyName}
          </span>
        )}
      </div>
    </div>
  )
}

function RecommendationCard({ rec }) {
  const cfg = PRIORITY_CFG[rec.priority] ?? PRIORITY_CFG.INFO

  return (
    <div style={{
      padding: '10px 12px', borderRadius: '8px',
      background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
      display: 'flex', gap: '10px', alignItems: 'flex-start',
    }}>
      <Zap style={{ width: 14, height: 14, color: cfg.color, flexShrink: 0, marginTop: 1 }} strokeWidth={1.75} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{rec.title}</span>
          <span style={{
            fontSize: '10px', fontWeight: 500, padding: '1px 5px', borderRadius: '99px',
            color: 'var(--text-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          }}>
            {ACTION_LABEL[rec.action] ?? rec.action}
          </span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
          {rec.body}
        </p>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: '1.4', fontStyle: 'italic' }}>
          {rec.rationale}
        </p>
      </div>
    </div>
  )
}

const INITIAL_SHOW = 4

export default function ExecutiveInsightsFeed({ report }) {
  const [showAllInsights, setShowAllInsights] = useState(false)
  const [showAllRecs,     setShowAllRecs]     = useState(false)

  const insights = report.portfolioInsights
  const recs     = report.portfolioRecommendations
  const visibleInsights = showAllInsights ? insights : insights.slice(0, INITIAL_SHOW)
  const visibleRecs     = showAllRecs     ? recs     : recs.slice(0, INITIAL_SHOW)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Insights */}
      <div className="card" style={{ padding: '20px', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Lightbulb style={{ width: 15, height: 15, color: 'var(--text-muted)' }} strokeWidth={1.75} />
          <div>
            <div className="section-title">Portfolio Insights</div>
            <div className="section-subtitle">{insights.length} signals detected</div>
          </div>
        </div>
        {insights.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
            No insights available for this period.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {visibleInsights.map((insight) => <InsightCard key={insight.id} insight={insight} />)}
            </div>
            {insights.length > INITIAL_SHOW && (
              <button onClick={() => setShowAllInsights((v) => !v)} style={{
                marginTop: '10px', width: '100%', padding: '7px', borderRadius: '6px',
                border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer',
                fontSize: '12px', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
              }}>
                {showAllInsights
                  ? <><ChevronUp style={{ width: 12, height: 12 }} /> Show less</>
                  : <><ChevronDown style={{ width: 12, height: 12 }} /> {insights.length - INITIAL_SHOW} more insights</>
                }
              </button>
            )}
          </>
        )}
      </div>

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="card" style={{ padding: '20px', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Zap style={{ width: 15, height: 15, color: 'var(--text-muted)' }} strokeWidth={1.75} />
            <div>
              <div className="section-title">Recommended Actions</div>
              <div className="section-subtitle">{recs.length} actions · rule-based engine</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {visibleRecs.map((rec) => <RecommendationCard key={rec.id} rec={rec} />)}
          </div>
          {recs.length > INITIAL_SHOW && (
            <button onClick={() => setShowAllRecs((v) => !v)} style={{
              marginTop: '10px', width: '100%', padding: '7px', borderRadius: '6px',
              border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer',
              fontSize: '12px', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
            }}>
              {showAllRecs
                ? <><ChevronUp style={{ width: 12, height: 12 }} /> Show less</>
                : <><ChevronDown style={{ width: 12, height: 12 }} /> {recs.length - INITIAL_SHOW} more actions</>
              }
            </button>
          )}
        </div>
      )}
    </div>
  )
}
