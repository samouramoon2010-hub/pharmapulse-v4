// ============================================================
// KpiDistributionDonut — KPI Distribution (Phase UI3.2-D)
//
// Display-only. Groups already-computed per-KPI achievement status
// (kpiStats[k].status) into 4 buckets — On Track / Behind Pace /
// At Risk / No Data — and renders them as a donut chart. No new
// scoring: the bucket counts are the caller's responsibility
// (DashboardPage.jsx derives them from kpiStats, already-computed).
// ============================================================
import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { CHART_TOKENS } from '../../design/tokens'

export const DISTRIBUTION_BUCKETS = ['onTrack', 'behindPace', 'atRisk', 'noData']

const BUCKET_META = {
  onTrack:    { label: 'On Track',    color: '#22c55e' },
  behindPace: { label: 'Behind Pace', color: '#f59e0b' },
  atRisk:     { label: 'At Risk',     color: '#ef4444' },
  noData:     { label: 'No Data',     color: CHART_TOKENS.axisTick },
}

export default function KpiDistributionDonut({ counts }) {
  const total = DISTRIBUTION_BUCKETS.reduce((sum, key) => sum + (counts?.[key] ?? 0), 0)
  const data = DISTRIBUTION_BUCKETS
    .map((key) => ({ key, value: counts?.[key] ?? 0, ...BUCKET_META[key] }))
    .filter((d) => d.value > 0)

  return (
    <div data-testid="kpi-distribution-donut" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ position: 'relative', width: '96px', height: '96px', flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.length > 0 ? data : [{ key: 'noData', value: 1, ...BUCKET_META.noData }]}
                 dataKey="value" nameKey="label" innerRadius={32} outerRadius={46} startAngle={90} endAngle={-270}
                 stroke="none">
              {(data.length > 0 ? data : [{ key: 'noData' }]).map((d) => (
                <Cell key={d.key} fill={data.length > 0 ? BUCKET_META[d.key].color : 'var(--border-subtle)'} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          textAlign: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {total}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total KPIs
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
        {DISTRIBUTION_BUCKETS.map((key) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: BUCKET_META[key].color, flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{BUCKET_META[key].label}</span>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {counts?.[key] ?? 0}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
