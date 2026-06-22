// ============================================================
// PortfolioKpiHeatmap — renders pre-computed portfolio KPI data
// Receives processed ExecutiveReport output. No analytics here.
//
// Core KPI Dependency Removal — No Silent Core Fallback Closure:
// renders every key present in report.portfolioAch (already
// resolved by the executive engine from the live registry passed
// in by ExecutiveDashboard.jsx). Falls back to the fixed Core list
// only when no registry is supplied, mirroring the engine's own
// optional-registry contract.
//
// Phase 5B safety: cfg guaranteed via ?? TRAFFIC_COLORS.good
// fallback — no crash if ach.status is unexpected.
// ============================================================
import React from 'react'
import { TRAFFIC_COLORS, KPI_KEYS, getProductionEngineKeys, getKpiMetaForKey } from '../../engine'
import { formatNumber } from '../../utils/helpers'


export default function PortfolioKpiHeatmap({  report, isManager, registry  }) {
  const { portfolioAch } = report
  const kpiKeys = registry ? getProductionEngineKeys(registry) : KPI_KEYS

  return (
    <div className="card" style={{ padding: '20px', background: 'var(--bg-surface)' }}>
      <div style={{ marginBottom: '16px' }}>
        <div className="section-title">{isManager ? 'Branch KPI Achievement' : 'Portfolio KPI Achievement'}</div>
        <div className="section-subtitle">{isManager ? report.reportMonth : `Aggregate across all active branches · ${report.reportMonth}`}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {kpiKeys.map((kpiKey) => {
          const ach    = portfolioAch[kpiKey]
          if (!ach) return null
          const cfg    = TRAFFIC_COLORS[ach.status] ?? TRAFFIC_COLORS.good ?? { color: '#a1a1aa', bg: 'transparent', border: '#a1a1aa', label: '—' }
          const meta   = getKpiMetaForKey(kpiKey, registry)
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
                    {cfg.label}
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
                  Actual: {formatNumber(ach.totalActual)} {meta.unit}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  Target: {formatNumber(ach.totalTarget)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
