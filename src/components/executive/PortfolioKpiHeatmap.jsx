// ============================================================
// PortfolioKpiHeatmap — renders pre-computed portfolio KPI data
// Receives processed ExecutiveReport output. No analytics here.
//
// INTENTIONALLY CORE-ANALYTICS-ONLY (by design):
//   Uses KPI_KEYS + KPI_META from kpiAnalyticsEngine.
//   Renders only the 5 core KPIs that ExecutiveReport computes.
//   Custom KPIs are not yet scored by the executive engine;
//   they will appear here once executiveEngine is extended.
//   This is documented as a deferred non-blocking limitation.
//
// Phase 5B safety: cfg guaranteed via ?? TRAFFIC_COLORS.good
// fallback — no crash if ach.status is unexpected.
// ============================================================
import React from 'react'
import { TRAFFIC_COLORS, KPI_META, KPI_KEYS } from '../../engine'


export default function PortfolioKpiHeatmap({  report  }) {
  const { portfolioAch } = report

  return (
    <div className="card" style={{ padding: '20px', background: 'var(--bg-surface)' }}>
      <div style={{ marginBottom: '16px' }}>
        <div className="section-title">Portfolio KPI Achievement</div>
        <div className="section-subtitle">Aggregate across all active branches · {report.reportMonth}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {KPI_KEYS.map((kpiKey) => {
          const ach    = portfolioAch[kpiKey]
          if (!ach) return null
          const cfg    = TRAFFIC_COLORS[ach.status] ?? TRAFFIC_COLORS.good ?? { color: '#a1a1aa', bg: 'transparent', border: '#a1a1aa', labelAr: '—' }
          const meta   = KPI_META[kpiKey] ?? { en: kpiKey, ar: kpiKey, unit: '', targetField: '' }
          const pct    = Math.min(ach.achievementPct, 100)

          return (
            <div key={kpiKey} style={{
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-subtle)',
            }}>
              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: cfg.color, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                    {meta.en}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 7px',
                    borderRadius: '99px',
                    color: cfg.color,
                    background: cfg.bg,
                    border: `1px solid ${cfg.border}`,
                    fontWeight: 500,
                  }}>
                    {cfg.labelAr}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: cfg.color, fontVariantNumeric: 'tabular-nums' }}>
                    {ach.achievementPct}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: '3px', background: 'var(--bg-hover)', borderRadius: '99px', overflow: 'hidden', marginBottom: '5px' }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: cfg.color, borderRadius: '99px',
                  transition: 'width 0.5s ease',
                }} />
              </div>

              {/* Bottom row: actual vs target */}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  Actual: {ach.totalActual.toLocaleString()} {meta.unit}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  Target: {ach.totalTarget.toLocaleString()}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
