// ============================================================
// KpiCard — Dense, action-driven KPI card (Phase UI3-E)
//
// Display-only. All values it shows are either passed in directly
// (value/target/achievement) or trivial derived arithmetic for
// presentation (gap = target - value, pace = gap / daysRemaining).
// No business/scoring logic — that stays in the engine layer.
//
// New fields (daysRemaining, previousAchievement, trend) are all
// optional; the card simply omits a row when the data needed to
// render it isn't supplied, so it never shows a fake/placeholder
// number and never grows empty space waiting on data nobody passed.
// ============================================================

import React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatKpiValue, formatNumber } from '../../utils/helpers'
import { getStatusToken } from '../../design/tokens'
import { computeRequiredDailyPace } from './kpiVisualHelpers'

function achievementStatus(achievement) {
  if (achievement === null) return 'neutral'
  if (achievement >= 100) return 'positive'
  if (achievement >= 80) return 'positive'
  if (achievement >= 60) return 'caution'
  return 'negative'
}

// Display-only label per tone — mirrors the official KPI card
// template's status badge text (docs/ui3/kpi-card-blueprint.md).
// Not a new business classification: it labels the same tone
// achievementStatus() already derives.
const STATUS_LABEL = {
  positive: 'On Track',
  caution:  'Behind Pace',
  negative: 'At Risk',
  neutral:  'No Data',
}

export default function KpiCard({
  kpi, entry, showTarget = true, compact = false,
  daysRemaining,        // optional: days left in the period (caller-computed, calendar-only)
  previousAchievement,  // optional: last period's achievement %, for trajectory delta
  trend,                // optional: array of recent values for the mini trend placeholder
}) {
  const value = entry?.value ?? null
  const target = entry?.target ?? kpi?.target ?? 0
  const achievement = entry?.achievement ?? (value !== null && target > 0
    ? Math.round((value / target) * 100) : null)

  const progressPct = Math.min(achievement ?? 0, 100)
  const status = achievementStatus(achievement)
  const statusToken = getStatusToken(status)

  // Derived display-only arithmetic — not business rules.
  const gap = (value !== null && target > 0) ? Math.max(target - value, 0) : null
  const requiredDailyPace = computeRequiredDailyPace(gap, daysRemaining)
  const paceDelta = (achievement !== null && typeof previousAchievement === 'number')
    ? achievement - previousAchievement
    : null

  const TrendIcon = achievement > 95 ? TrendingUp : achievement > 70 ? Minus : TrendingDown
  const statusLabel = STATUS_LABEL[status]

  return (
    <div className="kpi-card group" style={{ borderRadius: 'var(--radius-card, 8px)', padding: 'var(--density-card-padding, 16px)' }}>
      {/* Header */}
      <div className="flex items-start justify-between" style={{ marginBottom: '12px' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
            style={kpi?.color
              ? { background: `${kpi?.color}22`, border: `1px solid ${kpi?.color}44` }
              // No per-KPI color assigned — fall back to the active theme's
              // brand accent (var(--brand-400)) instead of a hardcoded hex,
              // so the badge follows whichever theme the user has selected
              // (Corporate/Executive/Futuristic/Medical/AMOLED/Apple/Cyber)
              // rather than always showing the same fixed teal-green.
              : { background: 'color-mix(in srgb, var(--brand-400) 13%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-400) 27%, transparent)' }}
          >
            <span style={{ color: kpi?.color || 'var(--brand-400)' }}>
              {kpi?.icon ? '📊' : '📈'}
            </span>
          </div>
          <div>
            <div className="text-sm font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>{kpi?.name}</div>
            {!compact && (
              <div className="text-xs mt-0.5 capitalize" style={{ color: 'var(--text-muted)' }}>{kpi?.period === 'daily' ? 'يومي' : kpi?.period === 'monthly' ? 'شهري' : kpi?.period}</div>
            )}
          </div>
        </div>

        {/* Status badge */}
        {achievement !== null && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '11px', fontWeight: 600, color: statusToken.color,
            background: statusToken.bg, border: `1px solid ${statusToken.border}`,
            borderRadius: '999px', padding: '2px 8px', flexShrink: 0, whiteSpace: 'nowrap',
          }}>
            <TrendIcon className="w-3 h-3" style={{ color: statusToken.color }} />
            {statusLabel}
          </span>
        )}
      </div>

      {/* Large achievement % — the dominant number (kpi-card-blueprint.md) */}
      <div style={{ marginBottom: '10px' }}>
        <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--font-display, 28px)' }}>
          {achievement !== null ? `${achievement}%` : '—'}
        </span>
        {value !== null && (
          <span className="text-xs mr-2" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {formatKpiValue(value, kpi?.type, kpi?.unit)}
            {showTarget && target > 0 ? ` / ${formatKpiValue(target, kpi?.type, kpi?.unit)}` : ''}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {achievement !== null && (
        <div style={{ marginBottom: '10px' }}>
          <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ background: 'var(--bg-overlay)' }}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progressPct}%`,
                background: statusToken.color,
                boxShadow: achievement >= 80 ? `0 0 8px ${statusToken.color}60` : 'none',
              }}
            />
          </div>
        </div>
      )}

      {/* Dense data grid: actual / target / gap / required pace */}
      {value !== null && !compact && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5" style={{ marginBottom: gap !== null || paceDelta !== null || trend ? '10px' : 0 }}>
          <div>
            <div className="metric-label" style={{ fontSize: '10px' }}>Actual</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {formatKpiValue(value, kpi?.type, kpi?.unit)}
            </div>
          </div>
          <div>
            <div className="metric-label" style={{ fontSize: '10px' }}>Target</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {target > 0 ? formatKpiValue(target, kpi?.type, kpi?.unit) : '—'}
            </div>
          </div>
          {gap !== null && (
            <div>
              <div className="metric-label" style={{ fontSize: '10px' }}>Remaining gap</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: gap > 0 ? statusToken.color : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {gap > 0 ? formatKpiValue(gap, kpi?.type, kpi?.unit) : '0'}
              </div>
            </div>
          )}
          {requiredDailyPace !== null && (
            <div>
              <div className="metric-label" style={{ fontSize: '10px' }}>Required daily pace</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(requiredDailyPace, { maximumFractionDigits: 1 })}{kpi?.unit ? ` ${kpi.unit}` : ''}/day
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trajectory delta + mini trend placeholder */}
      {(paceDelta !== null || trend) && (
        <div className="flex items-center justify-between" style={{ fontSize: '11px' }}>
          {paceDelta !== null && (
            <span style={{ color: paceDelta >= 0 ? 'var(--status-success)' : 'var(--status-critical)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {paceDelta >= 0 ? '▲' : '▼'} {Math.abs(paceDelta)}pt vs last period
            </span>
          )}
          {trend && Array.isArray(trend) && trend.length > 0 && (
            <span data-testid="kpi-mini-trend" style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '14px' }}>
              {trend.slice(-8).map((v, i) => (
                <span key={i} style={{
                  width: '3px',
                  height: `${Math.max(2, Math.min(14, (v / (target || 1)) * 14))}px`,
                  background: 'var(--border-strong)',
                  borderRadius: '1px',
                }} />
              ))}
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {value === null && (
        <div className="text-xs text-center py-2 rounded-lg" style={{ color: 'var(--text-muted)', border: '1px dashed var(--border-subtle)' }}>
          لم يتم الإدخال بعد
        </div>
      )}
    </div>
  )
}
