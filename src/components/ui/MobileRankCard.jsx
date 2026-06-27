// ============================================================
// MobileRankCard — PR-1E3, extended PR-1E4
// Shared phone-width card replacing a ranked-table row. Reused by
// ReportsPage's Branch Comparison, RankingsPage's branch/pharmacist
// cohort tables, and (PR-1E4) the admin/operational table conversions
// (KPI Registry, Export Studio history, Evaluation Run results,
// Data Exchange import history, Dynamic KPI Shadow diagnostics) — the
// same row data each table already computes, just rendered as a card
// instead of a `<table>` row (per the locked docs/ui3/mobile-blueprint.md
// rule: card conversion is the required mobile fallback, not horizontal
// scroll). No business logic lives here — every value is passed in
// already computed by the caller. `rank` is optional — admin/operational
// rows that have no rank concept simply omit it.
// `actions` (PR-1E4) is an optional ReactNode rendered as a footer row,
// for rows that need touch-friendly row actions (edit/archive/expand).
// ============================================================
import React from 'react'

export default function MobileRankCard({
  rank, title, subtitle, primaryMetric, secondaryMetrics = [], status, movement, actions,
}) {
  return (
    <div className="card card-p flex flex-col gap-2">
      <div className="flex items-center gap-3">
      {rank != null && (
        <div className="flex items-center justify-center flex-shrink-0 rounded-full font-bold"
             style={{
               width: '32px', height: '32px', fontSize: '12px',
               background: rank === 1 ? '#f59e0b33' : rank === 2 ? '#6b728033' : rank === 3 ? '#cd7c2633' : 'var(--bg-surface)',
               color:      rank === 1 ? '#f59e0b'   : rank === 2 ? '#9ca3af'   : rank === 3 ? '#cd7c26'   : 'var(--text-muted)',
               border: rank <= 3 ? '1px solid currentColor' : '1px solid var(--border-subtle)',
             }}>
          {rank}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{title}</div>
        {subtitle && (
          <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>
        )}
        {secondaryMetrics.length > 0 && (
          <div className="flex gap-3 mt-1 flex-wrap">
            {secondaryMetrics.map((m) => (
              <span key={m.label} className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {m.label}: <span style={{ color: 'var(--text-secondary)' }}>{m.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        {primaryMetric && (
          <>
            <div className="text-sm font-semibold tabular-nums" style={{ color: primaryMetric.color || 'var(--text-primary)' }}>
              {primaryMetric.value}
            </div>
            {primaryMetric.label && (
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{primaryMetric.label}</div>
            )}
          </>
        )}
        {movement}
        {status && (
          <div className="text-[11px] font-medium mt-0.5" style={{ color: status.color || 'var(--text-muted)' }}>
            {status.label}
          </div>
        )}
      </div>
    </div>
      {actions && (
        <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-800/40">
          {actions}
        </div>
      )}
    </div>
  )
}
