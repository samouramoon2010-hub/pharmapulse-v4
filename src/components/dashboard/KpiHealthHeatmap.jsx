// ============================================================
// KpiHealthHeatmap — equivalent existing heatmap (Phase UI3.2-E)
//
// DashboardPage is scoped to a single user/branch/list — not the
// multi-branch portfolio matrix src/components/heatmap/Heatmap.jsx
// is built for (that component remains reserved for Executive/
// Branch Intelligence pages, untouched by this bundle). This is the
// "equivalent existing heatmap" the blueprint allows for this scope:
// a compact, color-coded grid of the already-computed per-KPI
// health state (liveAnalytics.kpiHealth) — same data, same colors
// (KPI_HEALTH_COLORS) the old inline "Live KPI Health" badges row
// already used, just laid out as cells instead of pills.
// ============================================================
import React from 'react'
import { KPI_HEALTH_COLORS } from '../../engine/liveAnalytics'
import EmptyState from '../ui/EmptyState'
import { Grid3x3 } from 'lucide-react'

export default function KpiHealthHeatmap({ kpiHealth = [] }) {
  const cells = Array.isArray(kpiHealth) ? kpiHealth : []

  return (
    <div data-testid="kpi-health-heatmap" className="card card-p" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Grid3x3 style={{ width: 13, height: 13, color: 'var(--text-muted)' }} strokeWidth={1.75} />
        <span className="section-title" style={{ fontSize: '12px' }}>Live KPI Health</span>
      </div>

      {cells.length === 0 ? (
        <EmptyState icon={Grid3x3} title="No KPI health data yet" tone="neutral" compact />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '6px' }}>
          {cells.map((h) => {
            const cfg = KPI_HEALTH_COLORS[h.state] ?? KPI_HEALTH_COLORS.warning
            return (
              <div key={h.kpiKey}
                   data-testid={`kpi-health-cell-${h.kpiKey}`}
                   title={`${h.label}: ${h.achievementPct}% current achievement · ${h.state} (Live KPI Health)`}
                   style={{
                     borderRadius: '8px', padding: '8px 6px', textAlign: 'center',
                     background: cfg.bg, border: `1px solid ${cfg.border}`,
                   }}>
                <div style={{ fontSize: '10px', color: cfg.color, fontWeight: 600, marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.label}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: cfg.color, fontVariantNumeric: 'tabular-nums' }}>
                  {h.achievementPct}%
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
