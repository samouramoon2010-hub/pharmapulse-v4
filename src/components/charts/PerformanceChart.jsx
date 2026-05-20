// ============================================================
// PerformanceChart - Line/Bar chart for KPI trends
// ============================================================

import React from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 shadow-xl text-sm">
      <p className="text-slate-400 mb-2 text-xs">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}: </span>
          <span className="text-white font-semibold">{p.value}</span>
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
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={35}
        />
        <Tooltip content={<CustomTooltip />} />

        {showTarget && (
          type === 'bar'
            ? <Bar dataKey={targetKey} name="الهدف" fill="#1e293b" radius={[4,4,0,0]} />
            : <Line
                type="monotone"
                dataKey={targetKey}
                name="الهدف"
                stroke="#334155"
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
