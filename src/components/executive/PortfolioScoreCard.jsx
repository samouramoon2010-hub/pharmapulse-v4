// ============================================================
// PortfolioScoreCard — renders pre-computed portfolio score
// Receives processed ExecutiveReport output. No analytics here.
// ============================================================
import React from 'react'
import { Award, Building2, TrendingUp, AlertTriangle } from 'lucide-react'
import { GRADE_COLORS, GRADE_BG, GRADE_BORDER } from '../../engine/executive'


const RISK_LABEL = {
  onTrack:    { label: 'On Track',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)'   },
  lowRisk:    { label: 'Low Risk',    color: '#00d2ad', bg: 'rgba(0,210,173,0.08)'   },
  mediumRisk: { label: 'Medium Risk', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
  highRisk:   { label: 'High Risk',   color: '#ef4444', bg: 'rgba(239,68,68,0.08)'   },
}

export default function PortfolioScoreCard({  report  }) {
  const { portfolioScore, portfolioGrade, totalBranches, activeBranches, riskDistribution } = report
  const gradeColor  = GRADE_COLORS[portfolioGrade]
  const gradeBg     = GRADE_BG[portfolioGrade]
  const gradeBorder = GRADE_BORDER[portfolioGrade]

  const stats = [
    { icon: Building2,     label: 'Total Branches',  value: totalBranches  },
    { icon: TrendingUp,    label: 'Active Branches',  value: activeBranches },
    { icon: AlertTriangle, label: 'High Risk',        value: riskDistribution.highRisk  },
    { icon: Award,         label: 'On Track',         value: riskDistribution.onTrack   },
  ]

  return (
    <div className="card" style={{
      padding: '20px',
      border: `1px solid ${gradeBorder}`,
      background: 'var(--bg-surface)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div className="section-title">Portfolio Score</div>
          <div className="section-subtitle">{report.reportMonth} · Generated {new Date(report.generatedAt).toLocaleTimeString()}</div>
        </div>
        {/* Grade badge */}
        <div style={{
          width: 56, height: 56,
          borderRadius: '12px',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: gradeBg,
          border: `1px solid ${gradeBorder}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1, color: gradeColor, fontVariantNumeric: 'tabular-nums' }}>
            {portfolioGrade}
          </span>
          <span style={{ fontSize: '10px', color: gradeColor, opacity: 0.7, marginTop: '1px' }}>Grade</span>
        </div>
      </div>

      {/* Score bar */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Composite score</span>
          <span style={{ fontSize: '24px', fontWeight: 700, color: gradeColor, fontVariantNumeric: 'tabular-nums' }}>
            {portfolioScore}<span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '2px' }}>/100</span>
          </span>
        </div>
        <div style={{ height: '4px', background: 'var(--bg-hover)', borderRadius: '99px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${portfolioScore}%`,
            background: gradeColor,
            borderRadius: '99px',
            transition: 'width 0.6s ease',
          }} />
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} style={{
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <Icon style={{ width: 14, height: 14, color: 'var(--text-muted)', flexShrink: 0 }} strokeWidth={1.75} />
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {value}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
