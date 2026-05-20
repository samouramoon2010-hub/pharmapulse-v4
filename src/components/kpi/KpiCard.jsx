// ============================================================
// KpiCard - Displays a single KPI metric
// ============================================================

import React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatKpiValue, getAchievementColor } from '../../utils/helpers'

export default function KpiCard({ kpi, entry, showTarget = true, compact = false }) {
  const value = entry?.value ?? null
  const target = entry?.target ?? kpi?.target ?? 0
  const achievement = entry?.achievement ?? (value !== null && target > 0
    ? Math.round((value / target) * 100) : null)

  // Progress percentage capped at 100% visually
  const progressPct = Math.min(achievement ?? 0, 100)

  // Color based on achievement
  const getBarColor = (pct) => {
    if (pct >= 100) return '#22c55e'
    if (pct >= 80) return kpi?.color || '#1a9a7e'
    if (pct >= 60) return '#eab308'
    return '#ef4444'
  }

  const TrendIcon = achievement > 95 ? TrendingUp : achievement > 70 ? Minus : TrendingDown
  const trendColor = achievement > 95 ? 'text-green-400' : achievement > 70 ? 'text-slate-400' : 'text-red-400'

  return (
    <div className="kpi-card group">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
            style={{ background: `${kpi?.color || '#1a9a7e'}22`, border: `1px solid ${kpi?.color || '#1a9a7e'}44` }}
          >
            <span style={{ color: kpi?.color || '#1a9a7e' }}>
              {kpi?.icon ? '📊' : '📈'}
            </span>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-200 leading-none">{kpi?.name}</div>
            {!compact && (
              <div className="text-xs text-slate-500 mt-0.5 capitalize">{kpi?.period === 'daily' ? 'يومي' : kpi?.period === 'monthly' ? 'شهري' : kpi?.period}</div>
            )}
          </div>
        </div>

        {achievement !== null && (
          <div className={`flex items-center gap-1 text-xs font-bold ${getAchievementColor(achievement)}`}>
            <TrendIcon className={`w-3 h-3 ${trendColor}`} />
            {achievement}%
          </div>
        )}
      </div>

      {/* Value */}
      <div className="mb-3">
        <span className="text-2xl font-bold text-white">
          {value !== null ? formatKpiValue(value, kpi?.type, kpi?.unit) : '—'}
        </span>
        {showTarget && target > 0 && (
          <span className="text-xs text-slate-500 mr-2">
            / {formatKpiValue(target, kpi?.type, kpi?.unit)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {achievement !== null && (
        <div className="space-y-1">
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progressPct}%`,
                background: getBarColor(achievement),
                boxShadow: achievement >= 80 ? `0 0 8px ${getBarColor(achievement)}60` : 'none',
              }}
            />
          </div>
          {!compact && (
            <div className="flex justify-between text-xs text-slate-600">
              <span>0</span>
              <span>الهدف {formatKpiValue(target, kpi?.type, kpi?.unit)}</span>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {value === null && (
        <div className="text-xs text-slate-600 text-center py-2 border border-dashed border-slate-800 rounded-lg">
          لم يتم الإدخال بعد
        </div>
      )}
    </div>
  )
}
