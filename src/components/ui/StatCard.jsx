// ============================================================
// StatCard — Premium compact metric card
// No giant icons. Tabular numbers. Status pill. Delta.
// ============================================================
import React, { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

function CountUp({ target, duration = 600, suffix = '' }) {
  const [val, setVal] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    if (typeof target !== 'number') return
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(Math.round(target * eased))
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, duration])
  return <>{val.toLocaleString()}{suffix}</>
}

export default function StatCard({
  label, value, sub, icon: Icon,
  color = 'var(--brand-500)', delay = 0,
  trend, suffix = '', loading = false, animate = true,
}) {
  const isNum = typeof value === 'number'

  if (loading) {
    return (
      <div className="stat-card" style={{ animationDelay:`${delay}ms` }}>
        <div className="skeleton h-2.5 w-16 rounded" />
        <div className="skeleton h-7 w-24 rounded" />
        <div className="skeleton h-2 w-20 rounded" />
      </div>
    )
  }

  const trendPositive = trend > 0
  const hasTrend = trend !== undefined && trend !== 0

  return (
    <div className="stat-card group" style={{ animationDelay:`${delay}ms` }}>
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="metric-label">{label}</span>
        {hasTrend && (
          <span className="inline-flex items-center gap-1"
                style={{
                  fontSize: '10px',
                  fontWeight: 500,
                  fontFamily: 'Inter, sans-serif',
                  color: trendPositive ? 'var(--kpi-excellent)' : 'var(--kpi-critical)',
                }}>
            {trendPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>

      {/* Value */}
      <div className="metric-value">
        {isNum && animate
          ? <CountUp target={value} suffix={suffix} />
          : <>{value}{suffix}</>
        }
      </div>

      {/* Sub label */}
      {sub && (
        <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'-2px' }}>{sub}</div>
      )}

      {/* Bottom accent — 1px color line */}
      <div className="h-px w-8 rounded-full mt-0.5 transition-all duration-300 group-hover:w-full"
           style={{ background: color, opacity: 0.5 }} />
    </div>
  )
}
