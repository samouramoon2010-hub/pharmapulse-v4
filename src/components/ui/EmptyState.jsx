// ============================================================
// EmptyState — Context-aware elegant placeholders
// ============================================================
import React from 'react'
import {
  Clock, AlertTriangle, WifiOff, Target,
  BarChart2, Zap, Building2, RefreshCw,
  ClipboardList, TrendingUp,
} from 'lucide-react'

// ── Generic EmptyState (used across pages) ────────────────────
export default function EmptyState({ icon: Icon, title, description, action, compact = false }) {
  return (
    <div className="animate-fade-in" style={{
      display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', textAlign:'center',
      padding: compact ? '24px 16px' : '40px 24px',
    }}>
      {Icon && (
        <div style={{
          width: compact ? 36 : 40, height: compact ? 36 : 40,
          borderRadius: compact ? '8px' : '10px',
          display:'flex', alignItems:'center', justifyContent:'center',
          marginBottom: compact ? '10px' : '12px',
          background:'var(--bg-overlay)',
          border:'1px solid var(--border-subtle)',
        }}>
          <Icon style={{ width: compact ? 16 : 18, height: compact ? 16 : 18, color:'var(--text-muted)' }} strokeWidth={1.5} />
        </div>
      )}
      <div style={{
        fontSize: compact ? '12px' : '13px',
        fontWeight:500,
        color:'var(--text-secondary)',
        marginBottom:'4px',
        fontFamily:"'Inter',sans-serif",
        letterSpacing:'-0.01em',
      }}>
        {title}
      </div>
      {description && (
        <div style={{
          fontSize: compact ? '11px' : '12px',
          color:'var(--text-muted)',
          maxWidth:'240px',
          lineHeight:1.5,
          marginTop:'2px',
        }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop:'14px' }}>{action}</div>}
    </div>
  )
}

// ── Specialised dashboard empty states ────────────────────────

// Waiting for first KPI submission today
export function EmptyTodayEntries({ onNavigate }) {
  return (
    <div className="animate-fade-in" style={{ textAlign:'center', padding:'20px 16px' }}>
      <div style={{
        width:32, height:32, borderRadius:'8px', margin:'0 auto 10px',
        background:'rgba(0,210,173,0.06)', border:'1px solid rgba(0,210,173,0.12)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <Clock style={{ width:15, height:15, color:'var(--brand-400)' }} strokeWidth={1.5} />
      </div>
      <div style={{ fontSize:'12px', fontWeight:500, color:'var(--text-secondary)', marginBottom:'3px', fontFamily:"'Inter',sans-serif" }}>
        Waiting for submissions
      </div>
      <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'10px' }}>
        No KPI entries recorded today yet
      </div>
      {onNavigate && (
        <button onClick={onNavigate}
          style={{ fontSize:'11px', fontWeight:500, color:'var(--brand-400)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', textDecorationColor:'rgba(0,210,173,0.3)' }}>
          Enter KPI now →
        </button>
      )}
    </div>
  )
}

// No targets configured
export function EmptyNoTargets({ onNavigate }) {
  return (
    <div className="animate-fade-in" style={{ textAlign:'center', padding:'20px 16px' }}>
      <div style={{
        width:32, height:32, borderRadius:'8px', margin:'0 auto 10px',
        background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.15)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <Target style={{ width:15, height:15, color:'#fbbf24' }} strokeWidth={1.5} />
      </div>
      <div style={{ fontSize:'12px', fontWeight:500, color:'var(--text-secondary)', marginBottom:'3px', fontFamily:"'Inter',sans-serif" }}>
        No targets configured
      </div>
      <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'10px' }}>
        Set monthly KPI targets to unlock achievement tracking
      </div>
      {onNavigate && (
        <button onClick={onNavigate}
          style={{ fontSize:'11px', fontWeight:500, color:'#fbbf24', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', textDecorationColor:'rgba(245,158,11,0.3)' }}>
          Configure targets →
        </button>
      )}
    </div>
  )
}

// No forecast (no target or no entries)
export function EmptyNoForecast() {
  return (
    <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:'10px' }}>
      <div style={{
        width:24, height:24, borderRadius:'6px', flexShrink:0,
        background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <TrendingUp style={{ width:12, height:12, color:'var(--text-muted)' }} strokeWidth={1.5} />
      </div>
      <div>
        <div style={{ fontSize:'11px', fontWeight:500, color:'var(--text-secondary)', fontFamily:"'Inter',sans-serif" }}>
          No forecast data available
        </div>
        <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'1px' }}>
          Requires targets + at least one KPI entry
        </div>
      </div>
    </div>
  )
}

// No branch assignment
export function EmptyNoBranch() {
  return (
    <div className="animate-fade-in" style={{ textAlign:'center', padding:'32px 20px' }}>
      <div style={{
        width:36, height:36, borderRadius:'8px', margin:'0 auto 12px',
        background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.15)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <Building2 style={{ width:16, height:16, color:'#f87171' }} strokeWidth={1.5} />
      </div>
      <div style={{ fontSize:'13px', fontWeight:500, color:'var(--text-secondary)', marginBottom:'4px', fontFamily:"'Inter',sans-serif" }}>
        No branch assigned
      </div>
      <div style={{ fontSize:'11px', color:'var(--text-muted)', maxWidth:'200px', margin:'0 auto' }}>
        Contact your admin to assign you to a pharmacy branch
      </div>
    </div>
  )
}

// No operational alerts
export function EmptyNoAlerts() {
  return (
    <div className="op-feed-item" style={{ justifyContent:'center', opacity:0.6 }}>
      <div style={{ fontSize:'11px', color:'var(--text-muted)', fontStyle:'italic' }}>
        No operational alerts detected
      </div>
    </div>
  )
}

// Mission not ready
export function EmptyMissionNotReady() {
  return (
    <div className="op-feed">
      <div className="op-feed-header">
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <Zap style={{ width:12, height:12, color:'var(--text-muted)' }} />
          <span style={{ fontSize:'10px', fontWeight:600, color:'var(--text-primary)', textTransform:'uppercase', letterSpacing:'0.04em', fontFamily:"'Inter',sans-serif" }}>
            Daily Mission
          </span>
        </div>
      </div>
      <div style={{ padding:'16px 14px', textAlign:'center' }}>
        <div style={{ fontSize:'11px', fontWeight:500, color:'var(--text-secondary)', marginBottom:'4px' }}>
          Mission not available yet
        </div>
        <div style={{ fontSize:'10px', color:'var(--text-muted)' }}>
          Enter today's KPI data to generate your mission
        </div>
      </div>
    </div>
  )
}

// Error state — Firestore fetch failure
export function ErrorState({ message = 'Failed to load data', onRetry }) {
  return (
    <div className="animate-fade-in" style={{
      display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', textAlign:'center', padding:'32px 20px',
    }}>
      <div style={{
        width:36, height:36, borderRadius:'8px', margin:'0 auto 12px',
        background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.15)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <WifiOff style={{ width:16, height:16, color:'#f87171' }} strokeWidth={1.5} />
      </div>
      <div style={{ fontSize:'13px', fontWeight:500, color:'var(--text-secondary)', marginBottom:'3px', fontFamily:"'Inter',sans-serif" }}>
        {message}
      </div>
      <div style={{ fontSize:'11px', color:'var(--text-muted)', marginBottom:'12px' }}>
        Check connection and try again
      </div>
      {onRetry && (
        <button onClick={onRetry}
          style={{
            display:'flex', alignItems:'center', gap:'5px',
            fontSize:'11px', fontWeight:500,
            color:'var(--text-secondary)', background:'var(--bg-elevated)',
            border:'1px solid var(--border-default)',
            borderRadius:'6px', padding:'5px 12px', cursor:'pointer',
            transition:'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background='var(--bg-overlay)'; e.currentTarget.style.color='var(--text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background='var(--bg-elevated)'; e.currentTarget.style.color='var(--text-secondary)' }}>
          <RefreshCw style={{ width:12, height:12 }} /> Retry
        </button>
      )}
    </div>
  )
}

// Inline empty data cell (for tables)
export function EmptyCell({ label = '—' }) {
  return <span style={{ color:'var(--border-strong)', fontSize:'12px', fontVariantNumeric:'tabular-nums' }}>{label}</span>
}
