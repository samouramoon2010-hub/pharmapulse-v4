// ============================================================
// BranchDrilldown — renders selected branch executive summary
// Receives pre-computed BranchExecutiveSummary. No analytics.
// ============================================================
import React from 'react'
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { GRADE_COLORS, GRADE_BG, GRADE_BORDER } from '../../engine/executive'
import { TRAFFIC_COLORS } from '../../engine'

const RISK_CFG = {
  ON_TRACK:    { label: 'On Track',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)'   },
  LOW_RISK:    { label: 'Low Risk',    color: '#00d2ad', bg: 'rgba(0,210,173,0.08)',   border: 'rgba(0,210,173,0.2)'   },
  MEDIUM_RISK: { label: 'Medium Risk', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)'  },
  HIGH_RISK:   { label: 'High Risk',   color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)'   },
}

function TrendIcon({ direction }) {
  if (direction === 'ACCELERATING' || direction === 'IMPROVING')
    return <TrendingUp style={{ width: 12, height: 12, color: '#22c55e' }} />
  if (direction === 'DECLINING' || direction === 'DETERIORATING')
    return <TrendingDown style={{ width: 12, height: 12, color: '#ef4444' }} />
  return <Minus style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
}

export default function BranchDrilldown({ branch, onClose }) {
  const gradeColor  = GRADE_COLORS[branch.score.grade]
  const gradeBg     = GRADE_BG[branch.score.grade]
  const gradeBorder = GRADE_BORDER[branch.score.grade]
  const riskCfg     = RISK_CFG[branch.riskProfile.riskLevel] ?? RISK_CFG.LOW_RISK

  return (
    <div className="card" style={{ padding: '20px', background: 'var(--bg-surface)', border: `1px solid ${gradeBorder}` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
            {branch.pharmacyName}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {branch.pharmacyCode} · {branch.region || 'No region'} · {branch.reportMonth}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: 44, height: 44, borderRadius: '10px',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: gradeBg, border: `1px solid ${gradeBorder}`,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '18px', fontWeight: 700, color: gradeColor, lineHeight: 1 }}>{branch.score.grade}</span>
            <span style={{ fontSize: '9px', color: gradeColor, opacity: 0.7 }}>Grade</span>
          </div>
          {onClose && (
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: '6px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border-subtle)',
              background: 'transparent', cursor: 'pointer',
              color: 'var(--text-muted)',
            }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      </div>

      {/* Score + adjustments */}
      <div style={{
        display: 'flex', gap: '8px', marginBottom: '16px',
        padding: '10px 12px', borderRadius: '8px',
        background: gradeBg, border: `1px solid ${gradeBorder}`,
      }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: gradeColor, fontVariantNumeric: 'tabular-nums' }}>
            {branch.score.adjusted}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Adj. score</div>
        </div>
        <div style={{ width: '1px', background: 'var(--border-subtle)' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {branch.overallAchPct}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Achievement</div>
        </div>
        <div style={{ width: '1px', background: 'var(--border-subtle)' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <TrendIcon direction={branch.trend.direction} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {branch.trend.direction.charAt(0) + branch.trend.direction.slice(1).toLowerCase()}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Trend</div>
        </div>
      </div>

      {/* Risk badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '5px 10px', borderRadius: '8px', marginBottom: '14px',
        background: riskCfg.bg, border: `1px solid ${riskCfg.border}`,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: riskCfg.color }} />
        <span style={{ fontSize: '12px', fontWeight: 500, color: riskCfg.color }}>{riskCfg.label}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          · {branch.riskProfile.criticalCount} critical, {branch.riskProfile.warningCount} warnings
        </span>
      </div>

      {/* KPI breakdown */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
          KPI Breakdown
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {branch.score.kpiBreakdown.map(({ kpiKey, label, achievementPct, status }) => {
            const cfg    = TRAFFIC_COLORS[status] ?? TRAFFIC_COLORS.good
            const isWeak = branch.weakestKpi === kpiKey
            const isBest = branch.strongestKpi === kpiKey
            return (
              <div key={kpiKey} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 8px', borderRadius: '6px',
                background: isWeak ? 'rgba(239,68,68,0.04)' : isBest ? 'rgba(34,197,94,0.04)' : 'transparent',
                border: `1px solid ${isWeak ? 'rgba(239,68,68,0.12)' : isBest ? 'rgba(34,197,94,0.12)' : 'transparent'}`,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>{label}</span>
                {isWeak && <span style={{ fontSize: '10px', color: '#ef4444' }}>↓ Weakest</span>}
                {isBest && <span style={{ fontSize: '10px', color: '#22c55e' }}>↑ Strongest</span>}
                <span style={{ fontSize: '12px', fontWeight: 700, color: cfg.color, fontVariantNumeric: 'tabular-nums' }}>
                  {achievementPct}%
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top recommendation */}
      {branch.recommendations.length > 0 && (
        <div style={{
          padding: '10px 12px', borderRadius: '8px',
          background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
            Top Action
          </div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '3px' }}>
            {branch.recommendations[0].title}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            {branch.recommendations[0].body}
          </div>
        </div>
      )}
    </div>
  )
}
