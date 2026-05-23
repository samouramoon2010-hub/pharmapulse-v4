// ============================================================
// Team Intelligence Card — Phase 3D Light UI Integration
// Renders processed TeamTrendSummary + coaching priorities.
// No engine logic here — pure render of pre-computed data.
// ============================================================
import React, { useState } from 'react'
import { Users, TrendingUp, AlertTriangle, Award, ChevronDown, ChevronUp } from 'lucide-react'

// ── Colour maps ────────────────────────────────────────────────
const VOLATILITY_COLORS = {
  low:      { color:'#22c55e', bg:'rgba(34,197,94,0.08)',  border:'rgba(34,197,94,0.18)'  },
  moderate: { color:'#00d2ad', bg:'rgba(0,210,173,0.08)', border:'rgba(0,210,173,0.18)' },
  high:     { color:'#f59e0b', bg:'rgba(245,158,11,0.08)', border:'rgba(245,158,11,0.18)' },
  critical: { color:'#ef4444', bg:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.18)'  },
}
const PRIORITY_COLORS = {
  immediate: { color:'#ef4444', bg:'rgba(239,68,68,0.08)', label:'Immediate' },
  near_term: { color:'#f59e0b', bg:'rgba(245,158,11,0.08)',label:'Near Term' },
  routine:   { color:'#00d2ad', bg:'rgba(0,210,173,0.08)',label:'Routine'   },
  recognition:{ color:'#22c55e',bg:'rgba(34,197,94,0.08)', label:'Recognition'},
}
const RISK_COLORS = {
  none:   { color:'var(--text-muted)',  label:'None'   },
  low:    { color:'#60a5fa',           label:'Low'    },
  medium: { color:'#f59e0b',           label:'Medium' },
  high:   { color:'#ef4444',           label:'High'   },
}
const MOMENTUM_ICON = {
  accelerating: '▲▲', improving: '▲', stable: '→',
  cooling: '▼', needs_support: '▼▼',
}
const RECOVERY_LABEL = {
  not_applicable: '—', emerging: 'Emerging', sustained: 'Sustained', strong: 'Strong ✓',
}

const ROW = { display:'flex', alignItems:'center', gap:'8px', padding:'6px 0', borderBottom:'1px solid var(--border-subtle)' }

export default function TeamIntelligenceCard({ teamResult, loading }) {
  const [expanded, setExpanded] = useState(false)
  if (loading || !teamResult) return null

  const { teamHealth, teamTrendSummary, coachingRecommendations, pharmacistSummaries } = teamResult
  if (!teamHealth || !teamTrendSummary) return null

  const volatilityCfg = VOLATILITY_COLORS[teamTrendSummary.teamVolatilitySignal] || VOLATILITY_COLORS.low
  const topCoaching   = (coachingRecommendations || []).slice(0, 3)
  const atRisk        = (pharmacistSummaries || []).filter(s => s.operationalRisk === 'high' || s.operationalRisk === 'medium')
  const improving     = (pharmacistSummaries || []).filter(s => s.improvingAfterSupport || s.momentumDirection === 'accelerating' || s.momentumDirection === 'improving')
  const topPerformers = [...(pharmacistSummaries || [])].sort((a, b) => b.performanceScore - a.performanceScore).slice(0, 3)

  return (
    <div style={{
      background:'var(--bg-surface)', border:`1px solid ${volatilityCfg.border}`,
      borderRadius:'10px', overflow:'hidden',
      boxShadow:'inset 0 1px 0 rgba(255,255,255,0.04)',
    }}>
      {/* Header */}
      <div style={{
        padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between',
        background:'var(--bg-canvas)', borderBottom:'1px solid var(--border-subtle)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <Users style={{ width:13, height:13, color:'var(--text-muted)' }} strokeWidth={1.75} />
          <span style={{ fontSize:'10px', fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--text-primary)', fontFamily:"'Inter',sans-serif" }}>
            Team Intelligence
          </span>
          <span style={{ fontSize:'9px', color:'var(--text-muted)', fontFamily:"'Inter',sans-serif" }}>
            {teamHealth.memberCount} member{teamHealth.memberCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          {/* Volatility badge */}
          <span style={{
            fontSize:'9px', fontWeight:600, padding:'1px 7px', borderRadius:'99px',
            fontFamily:"'Inter',sans-serif",
            background: volatilityCfg.bg, border:`1px solid ${volatilityCfg.border}`, color: volatilityCfg.color,
          }}>
            {teamTrendSummary.teamVolatilitySignal.toUpperCase()}
          </span>
          {/* Expand toggle */}
          <button onClick={() => setExpanded(e => !e)}
            style={{ width:24, height:24, borderRadius:'5px', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center' }}
            onMouseEnter={e => e.currentTarget.style.background='var(--bg-overlay)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            {expanded
              ? <ChevronUp style={{ width:12, height:12 }} />
              : <ChevronDown style={{ width:12, height:12 }} />}
          </button>
        </div>
      </div>

      {/* Compact row — always visible */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'1px', background:'var(--border-subtle)' }}
           className="sm:grid-cols-4">
        {[
          {
            label: 'Momentum',
            value: `${MOMENTUM_ICON[teamTrendSummary.teamMomentumDirection] || '→'} ${teamTrendSummary.momentumDelta > 0 ? '+' : ''}${teamTrendSummary.momentumDelta}%`,
            color: teamTrendSummary.momentumDelta > 5 ? '#22c55e' : teamTrendSummary.momentumDelta < -5 ? '#ef4444' : 'var(--text-secondary)',
          },
          {
            label: 'Stability',
            value: `${teamTrendSummary.stabilityScore}/100`,
            color: teamTrendSummary.stabilityScore >= 70 ? '#22c55e' : teamTrendSummary.stabilityScore >= 45 ? '#f59e0b' : '#ef4444',
          },
          {
            label: 'Improving',
            value: `${improving.length} / ${teamHealth.memberCount}`,
            color: improving.length > 0 ? '#00d2ad' : 'var(--text-muted)',
          },
          {
            label: 'Need Support',
            value: atRisk.length > 0 ? `${atRisk.length}` : '—',
            color: atRisk.length > 0 ? '#f59e0b' : 'var(--text-muted)',
          },
        ].map(item => (
          <div key={item.label} style={{ padding:'8px 12px', background:'var(--bg-surface)', textAlign:'center' }}>
            <div style={{ fontSize:'9px', color:'var(--text-muted)', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:'3px', fontFamily:"'Inter',sans-serif" }}>
              {item.label}
            </div>
            <div style={{ fontSize:'13px', fontWeight:600, color: item.color, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Stress alert — always visible when detected */}
      {teamTrendSummary.repeatedOperationalStress && (
        <div style={{
          display:'flex', alignItems:'center', gap:'8px', padding:'7px 14px',
          fontSize:'11px', color:'#fbbf24',
          background:'rgba(245,158,11,0.06)', borderBottom:'1px solid rgba(245,158,11,0.15)',
        }}>
          <AlertTriangle style={{ width:12, height:12, flexShrink:0 }} />
          <span>{teamTrendSummary.stressDetail || `Operational stress detected (${teamTrendSummary.stressPattern})`}</span>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:'12px' }}>

          {/* Top Improving Pharmacists */}
          {improving.length > 0 && (
            <div>
              <div style={{ fontSize:'9px', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:'#00d2ad', marginBottom:'6px', fontFamily:"'Inter',sans-serif", display:'flex', alignItems:'center', gap:'5px' }}>
                <TrendingUp style={{ width:10, height:10 }} /> Improving
              </div>
              {improving.slice(0, 3).map(s => (
                <div key={s.userId} style={ROW}>
                  <div style={{ width:5, height:5, borderRadius:'50%', background:'#00d2ad', flexShrink:0 }} />
                  <span style={{ flex:1, fontSize:'11px', color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {s.displayName || s.userId}
                  </span>
                  <span style={{ fontSize:'10px', fontWeight:600, color:'#00d2ad', fontVariantNumeric:'tabular-nums' }}>
                    {MOMENTUM_ICON[s.momentumDirection]} {s.performanceScore}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Operational Risks */}
          {atRisk.length > 0 && (
            <div>
              <div style={{ fontSize:'9px', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:'#f59e0b', marginBottom:'6px', fontFamily:"'Inter',sans-serif", display:'flex', alignItems:'center', gap:'5px' }}>
                <AlertTriangle style={{ width:10, height:10 }} /> Needs Support
              </div>
              {atRisk.slice(0, 3).map(s => {
                const riskCfg = RISK_COLORS[s.operationalRisk] || RISK_COLORS.none
                return (
                  <div key={s.userId} style={ROW}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:riskCfg.color, flexShrink:0 }} />
                    <span style={{ flex:1, fontSize:'11px', color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {s.displayName || s.userId}
                    </span>
                    <span style={{ fontSize:'10px', color:riskCfg.color, fontWeight:500 }}>
                      {riskCfg.label} risk · {s.performanceScore}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Coaching Priorities */}
          {topCoaching.length > 0 && (
            <div>
              <div style={{ fontSize:'9px', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'6px', fontFamily:"'Inter',sans-serif" }}>
                Coaching Priorities
              </div>
              {topCoaching.map(rec => {
                const prioCfg = PRIORITY_COLORS[rec.priority] || PRIORITY_COLORS.routine
                return (
                  <div key={rec.id} style={{ ...ROW, flexDirection:'column', alignItems:'flex-start', gap:'3px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', width:'100%' }}>
                      <span style={{
                        fontSize:'8px', fontWeight:600, padding:'1px 6px', borderRadius:'99px',
                        fontFamily:"'Inter',sans-serif",
                        background: prioCfg.bg, color: prioCfg.color,
                        border:`1px solid ${prioCfg.color}22`,
                        flexShrink:0,
                      }}>
                        {prioCfg.label}
                      </span>
                      <span style={{ fontSize:'11px', fontWeight:500, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                        {rec.title}
                      </span>
                    </div>
                    <span style={{ fontSize:'10px', color:'var(--text-muted)', lineHeight:1.4, paddingRight:'4px' }}>
                      {rec.detail}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Recovery trend */}
          {teamTrendSummary.recoveryTrend !== 'not_applicable' && (
            <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 8px', borderRadius:'6px', background:'rgba(0,210,173,0.06)', border:'1px solid rgba(0,210,173,0.15)' }}>
              <Award style={{ width:12, height:12, color:'#00d2ad', flexShrink:0 }} />
              <span style={{ fontSize:'11px', color:'var(--text-secondary)' }}>
                Recovery: <strong style={{ color:'#00d2ad' }}>{RECOVERY_LABEL[teamTrendSummary.recoveryTrend]}</strong>
                {teamTrendSummary.recoveringMemberCount > 0 && ` · ${teamTrendSummary.recoveringMemberCount} member${teamTrendSummary.recoveringMemberCount > 1 ? 's' : ''}`}
              </span>
            </div>
          )}

          {/* KPI weaknesses */}
          {teamTrendSummary.teamKpiWeaknesses?.length > 0 && (
            <div>
              <div style={{ fontSize:'9px', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'5px', fontFamily:"'Inter',sans-serif" }}>
                Team KPI Gaps
              </div>
              {teamTrendSummary.teamKpiWeaknesses.slice(0, 3).map(w => (
                <div key={w.kpiKey} style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
                  <span style={{ fontSize:'10px', color:'var(--text-secondary)', width:'72px', textAlign:'right', flexShrink:0 }}>{w.kpiKey}</span>
                  <div style={{ flex:1, height:'3px', background:'var(--border-subtle)', borderRadius:'99px', overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:'99px', background:'#f59e0b', width:`${Math.min(w.avgAch, 100)}%`, transition:'width 0.5s' }} />
                  </div>
                  <span style={{ fontSize:'10px', fontWeight:600, color:'#f59e0b', width:'30px', textAlign:'left', fontVariantNumeric:'tabular-nums' }}>
                    {w.avgAch}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
