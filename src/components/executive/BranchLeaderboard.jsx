// ============================================================
// BranchLeaderboard — renders pre-computed branch rankings
// Receives processed ExecutiveReport output. No analytics here.
// ============================================================
import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Minus } from 'lucide-react'
import { GRADE_COLORS, GRADE_BG, GRADE_BORDER } from '../../engine/executive'

const RISK_CFG = {
  ON_TRACK:    { label: 'On Track',  color: '#22c55e' },
  LOW_RISK:    { label: 'Low Risk',  color: '#00d2ad' },
  MEDIUM_RISK: { label: 'Med Risk',  color: '#f59e0b' },
  HIGH_RISK:   { label: 'High Risk', color: '#ef4444' },
}

const TREND_CFG = {
  ACCELERATING:  { color: '#22c55e', label: '↑↑' },
  IMPROVING:     { color: '#00d2ad', label: '↑'  },
  STABLE:        { color: '#a1a1aa', label: '→'  },
  DECLINING:     { color: '#f59e0b', label: '↓'  },
  DETERIORATING: { color: '#ef4444', label: '↓↓' },
}

export default function BranchLeaderboard({ report, onSelectBranch, selectedId }) {
  const [showAll, setShowAll] = useState(false)

  const branches  = report.allBranches
  const displayed = showAll ? branches : branches.slice(0, 8)

  return (
    <div className="card" style={{ padding: '20px', background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div className="section-title">Branch Rankings</div>
          <div className="section-subtitle">{branches.length} branches · ranked by executive score</div>
        </div>
      </div>

      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 52px 60px 80px 64px',
        gap: '8px', padding: '6px 10px',
        borderBottom: '1px solid var(--border-subtle)', marginBottom: '4px',
      }}>
        {['#', 'Branch', 'Score', 'Ach%', 'Risk', 'Trend'].map((h) => (
          <span key={h} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {h}
          </span>
        ))}
      </div>

      {/* Branch rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {displayed.map((branch, idx) => {
          const isSelected  = branch.pharmacyId === selectedId
          const gradeColor  = GRADE_COLORS[branch.score.grade]
          const gradeBg     = GRADE_BG[branch.score.grade]
          const gradeBorder = GRADE_BORDER[branch.score.grade]
          const riskCfg     = RISK_CFG[branch.riskProfile.riskLevel] ?? { label: '–', color: 'var(--text-muted)' }
          const trendCfg    = TREND_CFG[branch.trend.direction] ?? TREND_CFG.STABLE
          const rank        = idx + 1
          const isTop3      = rank <= 3
          const isBottom3   = rank > branches.length - 3 && !isTop3

          return (
            <button
              key={branch.pharmacyId}
              onClick={() => onSelectBranch && onSelectBranch(branch)}
              style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr 52px 60px 80px 64px',
                gap: '8px', alignItems: 'center',
                padding: '8px 10px', borderRadius: '6px',
                border: `1px solid ${isSelected ? gradeBorder : 'transparent'}`,
                background: isSelected ? gradeBg : 'transparent',
                cursor: onSelectBranch ? 'pointer' : 'default',
                transition: 'background 0.15s',
                width: '100%', textAlign: 'left',
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
            >
              {/* Rank */}
              <span style={{
                fontSize: '12px', fontWeight: 700,
                color: isTop3 ? gradeColor : isBottom3 ? '#ef4444' : 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {rank}
              </span>

              {/* Branch name */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {branch.pharmacyName}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{branch.pharmacyCode}</div>
              </div>

              {/* Score + grade */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: gradeColor, fontVariantNumeric: 'tabular-nums' }}>
                  {branch.score.adjusted}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: 700,
                  padding: '1px 4px', borderRadius: '4px',
                  background: gradeBg, color: gradeColor, border: `1px solid ${gradeBorder}`,
                }}>
                  {branch.score.grade}
                </span>
              </div>

              {/* Achievement % */}
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {branch.overallAchPct}%
              </span>

              {/* Risk */}
              <span style={{ fontSize: '11px', fontWeight: 500, color: riskCfg.color, whiteSpace: 'nowrap' }}>
                {riskCfg.label}
              </span>

              {/* Trend */}
              <span style={{ fontSize: '12px', fontWeight: 700, color: trendCfg.color }}>
                {trendCfg.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Show more */}
      {branches.length > 8 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          style={{
            marginTop: '12px', width: '100%', padding: '8px', borderRadius: '6px',
            border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer',
            fontSize: '12px', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
        >
          {showAll
            ? <><ChevronUp style={{ width: 12, height: 12 }} /> Show less</>
            : <><ChevronDown style={{ width: 12, height: 12 }} /> Show all {branches.length} branches</>
          }
        </button>
      )}
    </div>
  )
}
