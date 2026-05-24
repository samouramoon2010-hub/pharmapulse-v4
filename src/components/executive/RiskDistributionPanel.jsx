// ============================================================
// RiskDistributionPanel — renders pre-computed risk buckets
// Receives processed ExecutiveReport output. No analytics here.
// ============================================================
import React from 'react'


const BUCKETS = [
  {
    key:    'onTrack'   ,
    label:  'On Track',
    color:  '#22c55e',
    bg:     'rgba(34,197,94,0.08)',
    border: 'rgba(34,197,94,0.2)',
    dot:    '#22c55e',
  },
  {
    key:    'lowRisk'   ,
    label:  'Low Risk',
    color:  '#00d2ad',
    bg:     'rgba(0,210,173,0.08)',
    border: 'rgba(0,210,173,0.2)',
    dot:    '#00d2ad',
  },
  {
    key:    'mediumRisk',
    label:  'Medium Risk',
    color:  '#f59e0b',
    bg:     'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.2)',
    dot:    '#f59e0b',
  },
  {
    key:    'highRisk'  ,
    label:  'High Risk',
    color:  '#ef4444',
    bg:     'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.2)',
    dot:    '#ef4444',
  },
]

export default function RiskDistributionPanel({  report  }) {
  const { riskDistribution, totalBranches } = report

  const total = Math.max(1, totalBranches)

  return (
    <div className="card" style={{ padding: '20px', background: 'var(--bg-surface)' }}>
      <div style={{ marginBottom: '16px' }}>
        <div className="section-title">Risk Distribution</div>
        <div className="section-subtitle">All {totalBranches} branches · {report.reportMonth}</div>
      </div>

      {/* Segmented bar */}
      <div style={{
        display: 'flex', height: '8px', borderRadius: '99px',
        overflow: 'hidden', gap: '2px', marginBottom: '16px',
        background: 'var(--bg-hover)',
      }}>
        {BUCKETS.map(({ key, color }) => {
          const count = riskDistribution[key]
          const pct   = (count / total) * 100
          if (!pct) return null
          return (
            <div key={key} style={{
              width: `${pct}%`, background: color,
              borderRadius: '99px', transition: 'width 0.5s ease',
            }} />
          )
        })}
      </div>

      {/* Legend rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {BUCKETS.map(({ key, label, color, bg, border, dot }) => {
          const count = riskDistribution[key]
          const pct   = Math.round((count / total) * 100)
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', borderRadius: '8px',
              background: count > 0 ? bg : 'transparent',
              border: `1px solid ${count > 0 ? border : 'var(--border-subtle)'}`,
              transition: 'background 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: count > 0 ? dot : 'var(--text-muted)',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: '13px', color: count > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: count > 0 ? 500 : 400 }}>
                  {label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pct}%</span>
                <span style={{
                  fontSize: '13px', fontWeight: 700,
                  color: count > 0 ? color : 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: '20px', textAlign: 'right',
                }}>
                  {count}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
