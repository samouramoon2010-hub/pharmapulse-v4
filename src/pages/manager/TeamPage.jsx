// ============================================================
// Team Intelligence Page
// Phase 3: operational team intelligence, not HR evaluation.
// Connected to Team Intelligence Engine.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import { Users, TrendingUp, Heart, Award, AlertTriangle, BookOpen } from 'lucide-react'
import { format } from 'date-fns'
import { useAuthStore }     from '../../store/authStore'
import { useKpiStore }      from '../../store/kpiStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import EmptyState           from '../../components/ui/EmptyState'
import { SkeletonStatCard, SkeletonChart } from '../../components/ui/SkeletonCard'
import {
  getTrafficLight, TRAFFIC_COLORS,
  computeAchievementPct,
} from '../../engine'
import { generateTeamIntelligence } from '../../engine/teamIntelligence'

const CARD = {
  background:'var(--bg-surface)', border:'1px solid var(--border-subtle)',
  borderRadius:'10px', padding:'14px 16px',
  boxShadow:'inset 0 1px 0 rgba(255,255,255,0.04)',
}

const PRIORITY_COLOR = { immediate:'#ef4444', near_term:'#f59e0b', routine:'#00d2ad', recognition:'#22c55e' }
const PRIORITY_LABEL = { immediate:'Immediate', near_term:'Near Term', routine:'Routine', recognition:'Recognition' }

const MOMENTUM_COLOR = {
  accelerating:'#22c55e', improving:'#00d2ad', stable:'#60a5fa',
  cooling:'#f59e0b', needs_support:'#ef4444',
}
const RISK_COLOR = { none:'var(--text-muted)', low:'#60a5fa', medium:'#f59e0b', high:'#ef4444' }
const STATUS_COLOR = {
  stable:'#22c55e', monitoring:'#00d2ad',
  intervention_required:'#f59e0b', critical_operation:'#ef4444',
}

export default function TeamPage() {
  const { userProfile }    = useAuthStore()
  const { entries, targets, subscribeAllEntries, subscribeAllTargets } = useKpiStore()
  const { pharmacies, subscribe: subPh } = usePharmacyStore()

  const [members,  setMembers]  = useState([])
  const [loading,  setLoading]  = useState(true)

  const role      = userProfile?.role
  const isAdmin   = role === 'admin'
  const pharmacyId = userProfile?.pharmacyId
  const month     = format(new Date(), 'yyyy-MM')

  useEffect(() => {
    const u1 = subPh()
    const u2 = subscribeAllEntries()
    const u3 = subscribeAllTargets()
    const t  = setTimeout(() => setLoading(false), 600)
    return () => { u1(); u2?.(); u3?.(); clearTimeout(t) }
  }, [userProfile?.uid])

  const pharmacy = useMemo(() =>
    pharmacies.find((p) => p.id === pharmacyId) || pharmacies[0],
    [pharmacies, pharmacyId]
  )

  // Build team intelligence from current data
  const teamIntelligence = useMemo(() => {
    if (loading || !entries.length) return null
    const now = new Date()
    const monthFrom = `${month}-01`
    const monthLast = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const monthTo   = `${month}-${String(monthLast).padStart(2,'0')}`
    const target    = targets.find((t) => t.pharmacyId === pharmacyId && t.month === month) || null

    // Group entries by userId
    const userGroups = new Map()
    entries.filter((e) => e.date >= monthFrom && e.date <= monthTo)
      .forEach((e) => {
        if (!userGroups.has(e.userId)) userGroups.set(e.userId, [])
        userGroups.get(e.userId).push(e)
      })

    if (!userGroups.size) return null

    const pharmacists = Array.from(userGroups.entries()).map(([uid, mtd]) => ({
      userId: uid, displayName: `User ${uid.slice(0,6)}`,
      pharmacyId: pharmacyId || '',
      mtdEntries: mtd, historicalEntries: mtd, target,
    }))

    try {
      return generateTeamIntelligence({
        pharmacyId: pharmacyId || 'all',
        month,
        pharmacists,
      }, now)
    } catch (e) {
      console.warn('[TeamPage] Engine error:', e)
      return null
    }
  }, [loading, entries, targets, pharmacyId, month, pharmacies])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px' }} className="sm:grid-cols-4">
          {Array.from({length:4}).map((_,i) => <SkeletonStatCard key={i} />)}
        </div>
        <SkeletonChart height={200} />
      </div>
    )
  }

  if (!teamIntelligence) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="page-header">
          <div><div className="page-title">Team Intelligence</div></div>
        </div>
        <EmptyState icon={Users}
          title="No team data this month"
          description="Team intelligence requires at least one pharmacist with KPI entries for this month" />
      </div>
    )
  }

  const { teamHealth, coachingRecommendations, accountabilityInsights,
          teamMomentum, teamStability, pharmacistSummaries } = teamIntelligence

  // teamHealth.status → teamHealth.overallTeamStatus (correct field name from TeamHealthSummary)
  // All accesses guarded with nullish fallback in case engine returns an unexpected value.
  const teamStatus = teamHealth.overallTeamStatus ?? teamHealth.status ?? 'stable'
  const statusCfg = {
    stable:                { color:'#22c55e', label:'Stable'               },
    monitoring:            { color:'#00d2ad', label:'Monitoring'           },
    intervention_required: { color:'#f59e0b', label:'Intervention Required'},
    critical_operation:    { color:'#ef4444', label:'Critical Operation'   },
  }[teamStatus] ?? { color:'#a1a1aa', label: teamStatus ?? 'Unknown' }

  // TeamHealthSummary uses: memberCount, teamPerformanceScore, teamConsistencyScore, activeMembers
  // The page previously used: teamSize, avgPerformance, avgConsistency — none existed on the type.
  const teamSize       = teamHealth.memberCount          ?? 0
  const avgPerformance = teamHealth.teamPerformanceScore ?? 0
  const avgConsistency = teamHealth.teamConsistencyScore ?? 0
  const activeMembers  = teamHealth.activeMembers        ?? 0

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Team Intelligence</div>
          <div className="page-subtitle">
            {teamSize} member{teamSize !== 1 ? 's' : ''} · {format(new Date(), 'MMMM yyyy')}
            <span style={{ color:'var(--border-default)', margin:'0 6px' }}>·</span>
            <span style={{ color: statusCfg.color }}>{statusCfg.label}</span>
          </div>
        </div>
      </div>

      {/* Team status strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px' }} className="sm:grid-cols-4">
        {[
          { label:'Team Status',    value: statusCfg.label,             color: statusCfg.color },
          { label:'Avg Performance',value: `${avgPerformance}%`,         color:'var(--brand-400)' },
          { label:'Avg Consistency',value: `${avgConsistency}%`,         color:'#6366f1' },
          { label:'Active Members', value: `${activeMembers}/${teamSize}`,color:'var(--text-secondary)' },
        ].map((s) => (
          <div key={s.label} style={CARD}>
            <div style={{ fontSize:'9px', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'5px', fontFamily:"'Inter',sans-serif" }}>
              {s.label}
            </div>
            <div style={{ fontSize:'1.2rem', fontWeight:600, letterSpacing:'-0.03em', color:s.color, fontVariantNumeric:'tabular-nums' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Momentum + Stability */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
        <div style={CARD}>
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'10px', fontFamily:"'Inter',sans-serif", display:'flex', alignItems:'center', gap:'5px' }}>
            <TrendingUp style={{ width:11, height:11 }} /> Team Momentum
          </div>
          <div style={{ fontSize:'1rem', fontWeight:600, color: MOMENTUM_COLOR[teamMomentum?.direction] || 'var(--text-secondary)', textTransform:'capitalize', marginBottom:'4px' }}>
            {teamMomentum?.direction?.replace('_', ' ')}
          </div>
          <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>
            {teamMomentum?.delta > 0 ? '+' : ''}{teamMomentum?.delta}% avg weekly change
          </div>
          {teamIntelligence.operationalStressDetected && (
            <div style={{ marginTop:'8px', fontSize:'10px', color:'#f87171', display:'flex', alignItems:'center', gap:'4px' }}>
              <AlertTriangle style={{ width:10, height:10 }} /> Operational stress detected
            </div>
          )}
        </div>

        <div style={CARD}>
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'10px', fontFamily:"'Inter',sans-serif", display:'flex', alignItems:'center', gap:'5px' }}>
            <Heart style={{ width:11, height:11 }} /> Team Stability
          </div>
          <div style={{ fontSize:'1rem', fontWeight:600, color: teamStability?.isStable ? '#22c55e' : '#f59e0b', marginBottom:'4px' }}>
            {teamStability?.isStable ? 'Stable' : 'Variable'}
          </div>
          <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>{teamStability?.detail}</div>
        </div>
      </div>

      {/* Pharmacist summaries */}
      {pharmacistSummaries.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
            Member Operational Summary
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
            {pharmacistSummaries.map((s) => {
              const riskCol = RISK_COLOR[s.operationalRisk]
              return (
                <div key={s.userId} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'6px 0', borderBottom:'1px solid var(--border-subtle)' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'12px', fontWeight:500, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {s.displayName}
                    </div>
                    <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'1px' }}>
                      {s.activeDays} days active · {s.submissionRate}% submission rate
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:'13px', fontWeight:600, color: TRAFFIC_COLORS[getTrafficLight(s.performanceScore, 1)]?.color, fontVariantNumeric:'tabular-nums' }}>
                      {s.performanceScore}%
                    </div>
                    <div style={{ fontSize:'9px', color: riskCol, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                      {s.operationalRisk} risk
                    </div>
                  </div>
                  <div style={{ width:'4px', height:'28px', borderRadius:'2px', background: MOMENTUM_COLOR[s.momentumDirection] || 'var(--border-subtle)', flexShrink:0 }} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Coaching recommendations */}
      {coachingRecommendations.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif", display:'flex', alignItems:'center', gap:'5px' }}>
            <BookOpen style={{ width:11, height:11 }} /> Coaching Priorities
            <span style={{ fontSize:'9px', background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', borderRadius:'99px', padding:'0 6px', marginRight:'auto' }}>
              {teamIntelligence.coachingFocusSummary}
            </span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
            {coachingRecommendations.slice(0, 5).map((r) => (
              <div key={r.id} style={{ display:'flex', alignItems:'flex-start', gap:'8px', fontSize:'12px', padding:'5px 0', borderBottom:'1px solid var(--border-subtle)' }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background: PRIORITY_COLOR[r.priority], flexShrink:0, marginTop:5 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <span style={{ fontWeight:500, color:'var(--text-primary)' }}>{r.title}</span>
                  {' '}
                  <span style={{ color:'var(--text-muted)', fontSize:'11px' }}>{r.detail}</span>
                </div>
                <span style={{ fontSize:'9px', fontWeight:500, padding:'1px 6px', borderRadius:'99px', flexShrink:0, fontFamily:"'Inter',sans-serif",
                  background:`${PRIORITY_COLOR[r.priority]}14`, border:`1px solid ${PRIORITY_COLOR[r.priority]}30`, color: PRIORITY_COLOR[r.priority] }}>
                  {PRIORITY_LABEL[r.priority]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
