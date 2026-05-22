// ============================================================
// Skeleton Loaders — Premium shimmer, context-aware
// ============================================================
import React from 'react'

// ── KPI Tile skeleton (matches kpi-tile class) ────────────────
export function SkeletonStatCard() {
  return (
    <div className="kpi-tile" style={{ opacity:0.7 }}>
      <div style={{ display:'flex', gap:'6px', marginBottom:'6px' }}>
        <div className="skeleton rounded" style={{ height:'8px', width:'8px', borderRadius:'50%', flexShrink:0 }} />
        <div className="skeleton rounded" style={{ height:'8px', width:'60px' }} />
      </div>
      <div className="skeleton rounded" style={{ height:'28px', width:'70px', marginBottom:'4px' }} />
      <div className="skeleton rounded" style={{ height:'8px', width:'90px', marginBottom:'8px' }} />
      <div className="skeleton rounded" style={{ height:'3px', width:'100%' }} />
    </div>
  )
}

// ── Table skeleton ────────────────────────────────────────────
export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="tbl-wrap">
      <div style={{ display:'flex', gap:'24px', padding:'8px 12px', borderBottom:'1px solid var(--border-subtle)', background:'var(--bg-canvas)' }}>
        {[14,28,20,16].map((w,i) => (
          <div key={i} className="skeleton rounded" style={{ height:'9px', width:`${w}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display:'flex', alignItems:'center', gap:'16px', padding:'0 12px', height:'40px',
          borderBottom:'1px solid var(--border-subtle)', opacity: 1 - i * 0.1,
        }}>
          <div className="skeleton rounded-full flex-shrink-0" style={{ width:'22px', height:'22px' }} />
          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'5px' }}>
            <div className="skeleton rounded" style={{ height:'10px', width:'36%' }} />
            <div className="skeleton rounded" style={{ height:'8px',  width:'20%' }} />
          </div>
          <div className="skeleton rounded-full" style={{ height:'18px', width:'52px' }} />
          <div className="skeleton rounded-full" style={{ height:'18px', width:'44px' }} />
        </div>
      ))}
    </div>
  )
}

// ── Chart skeleton ────────────────────────────────────────────
export function SkeletonChart({ height = 200 }) {
  return (
    <div className="card card-p">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'16px' }}>
        <div>
          <div className="skeleton rounded" style={{ height:'10px', width:'100px', marginBottom:'5px' }} />
          <div className="skeleton rounded" style={{ height:'8px',  width:'70px' }} />
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          {[0,1,2].map((i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:'4px' }}>
              <div className="skeleton rounded-full" style={{ width:'6px', height:'6px', flexShrink:0 }} />
              <div className="skeleton rounded" style={{ height:'7px', width:'36px' }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:'2px', height }}>
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="skeleton" style={{
            flex:1, borderRadius:'2px 2px 0 0',
            height:`${22 + ((i * 37 + 11) % 78)}%`,
            opacity: 0.6 + (i % 3) * 0.1,
          }} />
        ))}
      </div>
    </div>
  )
}

// ── Op-feed skeleton (mission / forecast panels) ──────────────
export function SkeletonFeed({ rows = 4, title = '' }) {
  return (
    <div className="op-feed">
      <div className="op-feed-header">
        {title
          ? <div style={{ fontSize:'10px', fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', fontFamily:"'Inter',sans-serif" }}>{title}</div>
          : <div className="skeleton rounded" style={{ height:'9px', width:'80px' }} />
        }
        <div className="skeleton rounded-full" style={{ height:'16px', width:'48px' }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="op-feed-item" style={{ opacity: 1 - i * 0.12 }}>
          <div className="skeleton rounded-full flex-shrink-0" style={{ width:'6px', height:'6px', marginTop:'6px' }} />
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
              <div className="skeleton rounded" style={{ height:'9px', width:'60px' }} />
              <div className="skeleton rounded" style={{ height:'9px', width:'28px' }} />
            </div>
            <div className="skeleton rounded" style={{ height:'3px', width:'100%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Operational insights strip skeleton ───────────────────────
export function SkeletonInsightsStrip({ count = 6 }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.min(count,2)},1fr)`, gap:'6px' }}
         className="sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="kpi-tile" style={{ opacity: 0.65 + i * 0.03 }}>
          <div className="skeleton rounded" style={{ height:'8px', width:'55px', marginBottom:'6px' }} />
          <div className="skeleton rounded" style={{ height:'20px', width:'48px', marginBottom:'4px' }} />
          <div className="skeleton rounded" style={{ height:'7px',  width:'36px' }} />
        </div>
      ))}
    </div>
  )
}

// ── Legacy kpi-card skeleton (used in older pages) ────────────
export function SkeletonKpiCard() {
  return (
    <div className="kpi-tile" style={{ opacity:0.65 }}>
      <div className="skeleton rounded" style={{ height:'9px', width:'64px', marginBottom:'6px' }} />
      <div className="skeleton rounded" style={{ height:'24px', width:'56px', marginBottom:'4px' }} />
      <div className="skeleton rounded" style={{ height:'8px',  width:'80px', marginBottom:'8px' }} />
      <div className="skeleton rounded" style={{ height:'3px',  width:'100%' }} />
    </div>
  )
}
