// ============================================================
// PerformanceChart - Line/Bar chart for KPI trends
// ============================================================

import React from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { CHART_TOKENS } from '../../design/tokens'

// Chart chrome (grid/axis/tooltip) is token-driven (UI3-I) — only
// the data series color (caller-supplied `color` prop) varies per
// KPI. No calculation here: this renders whatever data/values are
// passed in.
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: CHART_TOKENS.tooltipBg,
      border: `1px solid ${CHART_TOKENS.tooltipBorder}`,
      borderRadius: '10px',
      padding: '10px 14px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      fontSize: '13px',
    }}>
      <p style={{ color: CHART_TOKENS.axisTick, marginBottom: '6px', fontSize: '11px' }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: CHART_TOKENS.axisTick }}>{p.name}: </span>
          <span style={{ color: CHART_TOKENS.tooltipText, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function PerformanceChart({
  data = [],
  type = 'line',
  dataKey = 'value',
  targetKey = 'target',
  xKey = 'date',
  color = '#1a9a7e',
  showTarget = true,
  height = 250,
  label = 'الأداء',
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-600 text-sm">
        لا توجد بيانات لعرضها
      </div>
    )
  }

  const Chart = type === 'bar' ? BarChart : LineChart

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_TOKENS.grid} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: CHART_TOKENS.axisTick, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_TOKENS.axisTick, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={35}
        />
        <Tooltip content={<CustomTooltip />} />

        {showTarget && (
          type === 'bar'
            ? <Bar dataKey={targetKey} name="الهدف" fill={CHART_TOKENS.targetLine} radius={[4,4,0,0]} />
            : <Line
                type="monotone"
                dataKey={targetKey}
                name="الهدف"
                stroke={CHART_TOKENS.targetLine}
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
              />
        )}

        {type === 'bar'
          ? <Bar dataKey={dataKey} name={label} fill={color} radius={[4,4,0,0]}
              style={{ filter: `drop-shadow(0 2px 4px ${color}40)` }} />
          : <Line
              type="monotone"
              dataKey={dataKey}
              name={label}
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 3, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: color, stroke: '#0f172a', strokeWidth: 2 }}
            />
        }
      </Chart>
    </ResponsiveContainer>
  )
}
