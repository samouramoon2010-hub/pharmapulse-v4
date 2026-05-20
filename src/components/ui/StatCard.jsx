// ============================================================
// StatCard — animated KPI summary card
// ============================================================
import React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export default function StatCard({
  label, value, sub, icon: Icon, color = '#1a9a7e',
  trend, trendLabel, suffix = '', delay = 0, loading = false,
}) {
  if (loading) {
    return (
      <div className="stat-card" style={{ animationDelay: `${delay}ms` }}>
        <div className="skeleton w-10 h-10 rounded-xl" />
        <div className="skeleton w-20 h-7 rounded" />
        <div className="skeleton w-28 h-4 rounded" />
      </div>
    )
  }

  const trendPositive = trend > 0
  const trendNeutral  = !trend

  return (
    <div className="stat-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
          {Icon && <Icon className="w-5 h-5" style={{ color }} />}
        </div>
        {trend !== undefined && !trendNeutral && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
            trendPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {trendPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>

      <div>
        <div className="text-2xl font-bold text-white font-display tracking-tight">
          {value}{suffix}
        </div>
        <div className="text-sm text-slate-400 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-slate-600 mt-1">{sub}</div>}
        {trendLabel && <div className="text-xs text-slate-600 mt-1">{trendLabel}</div>}
      </div>
    </div>
  )
}
