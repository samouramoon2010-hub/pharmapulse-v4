// ============================================================
// AchievementCircle - Circular progress for overall achievement
// ============================================================

import React from 'react'

export default function AchievementCircle({ pct = 0, size = 120, label = 'الإنجاز الكلي' }) {
  const r = (size - 20) / 2
  const circumference = 2 * Math.PI * r
  const capped = Math.min(pct, 100)
  const offset = circumference - (capped / 100) * circumference

  const getColor = (p) => {
    if (p >= 100) return '#22c55e'
    if (p >= 80) return '#1a9a7e'
    if (p >= 60) return '#eab308'
    return '#ef4444'
  }

  const color = getColor(pct)

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {/* Track */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="#1e293b" strokeWidth={8}
          />
          {/* Progress */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s ease-out', filter: `drop-shadow(0 0 6px ${color}80)` }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Sora, sans-serif' }}>
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  )
}
