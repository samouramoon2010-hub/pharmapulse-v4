// ============================================================
// Team Intelligence Page
// Phase 3: operational team intelligence, not HR evaluation.
// Connected to Team Intelligence Engine.
// Phase 2F-1: Scope Resolver wired in. selectedPharmacyId
// replaces direct userProfile.pharmacyId reads. Territory roles
// (district_supervisor, regional_manager) see a branch selector.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Users, TrendingUp, Heart, Award, AlertTriangle, BookOpen, BarChart2, Activity, CheckCircle, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import { useAuthStore }     from '../../store/authStore'
import { useKpiStore }      from '../../store/kpiStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import EmptyState           from '../../components/ui/EmptyState'
import { SkeletonStatCard, SkeletonChart } from '../../components/ui/SkeletonCard'
import {
  getTrafficLight, TRAFFIC_COLORS,
  computeAchievementPct, getDayProgress, getKpiMetaForKey,
} from '../../engine'
import { generateTeamIntelligence } from '../../engine/teamIntelligence'
import { getUsersByPharmacy }        from '../../services/userService'
import { subscribePublishedPersonalTargetsByBranch } from '../../services/personalTargetService'
import { useScopeProfile }           from '../../hooks/useScopeProfile'
import { filterAllowedPharmacies }   from '../../services/scopeResolver'

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
const VOLATILITY_COLOR = { low:'#22c55e', moderate:'#00d2ad', high:'#f59e0b', critical:'#ef4444' }
const RECOVERY_COLOR   = { not_applicable:'var(--text-muted)', emerging:'#60a5fa', sustained:'#00d2ad', strong:'#22c55e' }
const STRESS_COLOR     = { none:'var(--text-muted)', transient:'#60a5fa', persistent:'#f59e0b', escalating:'#ef4444' }
const PRIORITY_ORDER   = { immediate: 0, near_term: 1, routine: 2, recognition: 3 }
const PACE_COLOR = {
  ahead:    '#22c55e',
  on_track: '#00d2ad',
  behind:   '#f59e0b',
  critical: '#ef4444',
  achieved: '#22c55e',
}
const PACE_LABEL = {
  ahead:    'Ahead',
  on_track: 'On track',
  behind:   'Behind',
  critical: 'Critical',
  achieved: '✓ Done',
}

export default function TeamPage() {
  const navigate = useNavigate()
  const { userProfile }    = useAuthStore()
  const {
    entries, targets,
    subscribeRecentEntries, subscribeRecentTargets,
    subscribePharmacyEntries, subscribeMyTargets,
  } = useKpiStore()
  const { pharmacies, subscribe: subPh } = usePharmacyStore()

  const [members,  setMembers]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [userMap,   setUserMap]  = useState(new Map())
  const [personalTargetMap, setPersonalTargetMap] = useState(new Map())
  // ── Phase 2F-1 ───────────────────────────────────────────────
  const [selectedPharmacyId, setSelectedPharmacyId] = useState(null)

  const { scope, loading: scopeLoading, error: scopeError } = useScopeProfile()

  const month             = format(new Date(), 'yyyy-MM')
  const allowedPharmacies = scope ? filterAllowedPharmacies(scope, pharmacies) : []

  // Auto-select branch for single-branch and all-access roles.
  // Territory roles (list) start with no selection — user picks via selector.
  useEffect(() => {
    if (!scope) return
    if (scope.type === 'single') {
      setSelectedPharmacyId(scope.id)
    } else if (scope.type === 'all') {
      setSelectedPharmacyId((prev) => {
        if (prev) return prev
        const first = pharmacies.find((p) => p.active !== false)
        return first?.id ?? null
      })
    }
    // scope.type === 'list': wait for user to pick a branch
    // scope.type === 'none': access denied guard handles it below
  }, [scope, pharmacies])

  useEffect(() => {
    const u1 = subPh()

    // scope.type === 'all' (admin/GM): wide subscription, filter in computation.
    // All other roles: scoped to the selected branch only.
    let u2 = () => {}, u3 = () => {}
    if (scope?.type === 'all') {
      u2 = subscribeRecentEntries()
      u3 = subscribeRecentTargets()
    } else if (selectedPharmacyId) {
      u2 = subscribePharmacyEntries(selectedPharmacyId)
      u3 = subscribeMyTargets(selectedPharmacyId)
    }

    let u4 = () => {}
    if (selectedPharmacyId) {
      u4 = subscribePublishedPersonalTargetsByBranch(selectedPharmacyId, month, (docs) => {
        const map = new Map()
        docs.forEach((d) => map.set(d.userId, d))
        setPersonalTargetMap(map)
      })
    }
    const t = setTimeout(() => setLoading(false), 600)
    return () => { u1(); u2?.(); u3?.(); u4?.(); clearTimeout(t) }
  }, [userProfile?.uid, scope?.type, selectedPharmacyId])

  const pharmacy = useMemo(() =>
    pharmacies.find((p) => p.id === selectedPharmacyId),
    [pharmacies, selectedPharmacyId]
  )

  useEffect(() => {
    if (!selectedPharmacyId) return
    getUsersByPharmacy(selectedPharmacyId)
      .then((users) => {
        const map = new Map()
        users.forEach((u) => map.set(u.id, u.displayName || 'Unknown User'))
        setUserMap(map)
      })
      .catch(() => {})
  }, [selectedPharmacyId])

  const teamIntelligence = useMemo(() => {
    if (loading || !entries.length) return null
    const now = new Date()
    const monthFrom = `${month}-01`
    const monthLast = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const monthTo   = `${month}-${String(monthLast).padStart(2,'0')}`
    const target    = targets.find((t) => t.pharmacyId === selectedPharmacyId && t.month === month) || null

    // scope.type === 'all': wide subscription, filter to selected branch here.
    // All other roles: subscription is already scoped, but filter defensively.
    const userGroups = new Map()
    entries.filter((e) =>
      e.date >= monthFrom && e.date <= monthTo &&
      (scope?.type === 'all' || e.pharmacyId === selectedPharmacyId)
    ).forEach((e) => {
        if (!userGroups.has(e.userId)) userGroups.set(e.userId, [])
        userGroups.get(e.userId).push(e)
      })

    if (!userGroups.size) return null

    const pharmacists = Array.from(userGroups.entries()).map(([uid, mtd]) => {
      const actualSubmissionDays   = new Set(mtd.map((e) => e.date)).size
      const expectedSubmissionDays = getDayProgress(now).currentDay
      return {
        userId: uid, displayName: userMap.get(uid) ?? 'Unknown User',
        pharmacyId: selectedPharmacyId || '',
        mtdEntries: mtd, historicalEntries: mtd, target,
        personalTarget: personalTargetMap.get(uid) ?? null,
        actualSubmissionDays,
        expectedSubmissionDays,
      }
    })

    try {
      return generateTeamIntelligence({
        pharmacyId: selectedPharmacyId || 'all',
        month,
        pharmacists,
      }, now)
    } catch (e) {
      console.warn('[TeamPage] Engine error:', e)
      return null
    }
  }, [loading, entries, targets, selectedPharmacyId, scope?.type, month, pharmacies, userMap, personalTargetMap])

  // ── Scope guard — Phase 2F-1 ─────────────────────────────────
  if (scopeLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Verifying access…
      </div>
    )
  }
  if (scopeError || scope?.type === 'none') {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{
          padding: '16px', borderRadius: '8px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)',
          color: '#ef4444', fontSize: '13px',
        }}>
          Access denied. You do not have permission to view team intelligence.
        </div>
      </div>
    )
  }

  // Branch selector rendered for all-access (admin/GM) and territory roles.
  // Hidden for single-branch roles (manager/branch_manager).
  const showSelector = scope?.type === 'all' || scope?.type === 'list'

  // Territory role with no branch chosen yet — show prompt before any data loads.
  if (scope?.type === 'list' && !selectedPharmacyId) {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="page-header">
          <div><div className="page-title">Team Intelligence</div></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>Branch</label>
          <select
            value=""
            onChange={(e) => setSelectedPharmacyId(e.target.value || null)}
            style={{ height: '34px', fontSize: '12px', minWidth: '160px' }}
          >
            <option value="">Select branch…</option>
            {allowedPharmacies.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <EmptyState icon={Users} title="Select a branch"
          description="Select a branch above to view team intelligence." />
      </div>
    )
  }

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

  const {
    teamHealth, coachingRecommendations, accountabilityInsights,
    teamMomentum, teamStability, pharmacistSummaries,
    teamKpiProfile, teamTrendSummary,
    topPerformerIds, atRiskMemberIds,
  } = teamIntelligence

  // A6: sort roster by coaching priority (immediate first)
  const sortedSummaries = [...pharmacistSummaries].sort(
    (a, b) => (PRIORITY_ORDER[a.coachingPriority] ?? 99) - (PRIORITY_ORDER[b.coachingPriority] ?? 99)
  )

  // B1: "Today's Required Focus" — top 3 member/KPI combinations by urgency.
  // Urgency = requiredPerDay × (1 + criticalBonus).
  // Source: each member's weakestKpi snapshot, sorted descending by requiredPerDay.
  const requiredFocus = pharmacistSummaries
    .map((s) => {
      const snap = s.kpiSnapshots?.find((k) => k.kpiKey === s.weakestKpi)
      if (!snap || snap.target <= 0 || snap.paceStatus === 'achieved') return null
      return {
        userId:      s.userId,
        displayName: s.displayName,
        kpiKey:      s.weakestKpi,
        kpiLabel:    snap.label,
        requiredPerDay: snap.requiredPerDay,
        paceStatus:  snap.paceStatus,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Critical first, then by requiredPerDay descending
      if (a.paceStatus === 'critical' && b.paceStatus !== 'critical') return -1
      if (b.paceStatus === 'critical' && a.paceStatus !== 'critical') return  1
      return b.requiredPerDay - a.requiredPerDay
    })
    .slice(0, 3)

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
        {/* Branch Intelligence action — only rendered when a branch is selected */}
        {selectedPharmacyId && (
          <Link
            to={`/branch/${selectedPharmacyId}/intelligence`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
              border: '1px solid var(--border-subtle)', background: 'transparent',
              color: 'var(--text-secondary)', textDecoration: 'none', flexShrink: 0,
            }}
          >
            Branch Intelligence →
          </Link>
        )}
      </div>

      {/* Branch selector — shown for admin/GM (all) and territory roles (list) */}
      {showSelector && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>Branch</label>
          <select
            value={selectedPharmacyId || ''}
            onChange={(e) => setSelectedPharmacyId(e.target.value || null)}
            style={{ height: '34px', fontSize: '12px', minWidth: '160px' }}
          >
            {allowedPharmacies.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

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
            {sortedSummaries.map((s) => {
              const riskCol    = RISK_COLOR[s.operationalRisk]
              const priColor   = PRIORITY_COLOR[s.coachingPriority] || 'var(--text-muted)'
              const strongMeta = getKpiMetaForKey(s.strongestKpi)
              const weakMeta   = getKpiMetaForKey(s.weakestKpi)
              return (
                <div key={s.userId}
                     onClick={() => navigate(`/pharmacist/${s.userId}/intelligence?branchId=${selectedPharmacyId}&month=${month}`)}
                     style={{ display:'flex', alignItems:'center', gap:'10px', padding:'7px 0', borderBottom:'1px solid var(--border-subtle)', cursor:'pointer' }}>
                  {/* Priority indicator */}
                  <div style={{ width:'3px', height:'36px', borderRadius:'2px', background: priColor, flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'12px', fontWeight:500, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {s.displayName}
                    </div>
                    {/* A3: strongest / weakest KPI */}
                    <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'2px', display:'flex', gap:'8px', flexWrap:'wrap' }}>
                      <span>↑ {strongMeta.en}</span>
                      <span style={{ color: riskCol }}>↓ {weakMeta.en}</span>
                      {/* B1: required daily units for weakest KPI */}
                      {(() => {
                        const weakSnap = s.kpiSnapshots?.find((k) => k.kpiKey === s.weakestKpi)
                        if (!weakSnap || weakSnap.target <= 0) return null
                        if (weakSnap.paceStatus === 'achieved') {
                          return <span style={{ color:'#22c55e' }}>✓ done</span>
                        }
                        return (
                          <span style={{ color: PACE_COLOR[weakSnap.paceStatus] }}>
                            {weakSnap.requiredPerDay}/day
                          </span>
                        )
                      })()}
                    </div>
                    <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'1px' }}>
                      {s.activeDays}d active · {s.submissionRate}% submissions
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

      {/* A5: Named member callouts — top performers and at-risk members */}
      {(topPerformerIds?.length > 0 || atRiskMemberIds?.length > 0) && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          {topPerformerIds?.length > 0 && (
            <div style={CARD}>
              <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'8px', fontFamily:"'Inter',sans-serif", display:'flex', alignItems:'center', gap:'5px' }}>
                <Award style={{ width:11, height:11, color:'#22c55e' }} /> Top Performers
              </div>
              {topPerformerIds.map((uid) => (
                <div key={uid} style={{ fontSize:'12px', color:'#22c55e', fontWeight:500, padding:'2px 0' }}>
                  {userMap.get(uid) ?? 'Unknown User'}
                </div>
              ))}
            </div>
          )}
          {atRiskMemberIds?.length > 0 && (
            <div style={CARD}>
              <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'8px', fontFamily:"'Inter',sans-serif", display:'flex', alignItems:'center', gap:'5px' }}>
                <AlertTriangle style={{ width:11, height:11, color:'#ef4444' }} /> Needs Attention
              </div>
              {atRiskMemberIds.map((uid) => (
                <div key={uid} style={{ fontSize:'12px', color:'#ef4444', fontWeight:500, padding:'2px 0' }}>
                  {userMap.get(uid) ?? 'Unknown User'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* A1: Team KPI Profile — strengths and weaknesses */}
      {(teamKpiProfile?.strengths?.length > 0 || teamKpiProfile?.weaknesses?.length > 0) && (
        <div style={CARD}>
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif", display:'flex', alignItems:'center', gap:'5px' }}>
            <BarChart2 style={{ width:11, height:11 }} /> Team KPI Profile
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
            {teamKpiProfile?.strengths?.length > 0 && (
              <div>
                <div style={{ fontSize:'9px', fontWeight:600, color:'#22c55e', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Strengths</div>
                {teamKpiProfile.strengths.map((k) => (
                  <div key={k.kpiKey} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'3px 0', fontSize:'11px' }}>
                    <span style={{ color:'var(--text-secondary)' }}>{getKpiMetaForKey(k.kpiKey).en}</span>
                    <span style={{ fontWeight:600, color:'#22c55e', fontVariantNumeric:'tabular-nums' }}>{Math.round(k.avgAch)}%</span>
                  </div>
                ))}
              </div>
            )}
            {teamKpiProfile?.weaknesses?.length > 0 && (
              <div>
                <div style={{ fontSize:'9px', fontWeight:600, color:'#ef4444', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Weaknesses</div>
                {teamKpiProfile.weaknesses.map((k) => (
                  <div key={k.kpiKey} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'3px 0', fontSize:'11px' }}>
                    <span style={{ color:'var(--text-secondary)' }}>{getKpiMetaForKey(k.kpiKey).en}</span>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontWeight:600, color:'#ef4444', fontVariantNumeric:'tabular-nums' }}>{Math.round(k.avgAch)}%</span>
                      {k.affectedCount > 0 && (
                        <span style={{ fontSize:'9px', color:'var(--text-muted)', marginLeft:'4px' }}>{k.affectedCount} affected</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* A4: Team Trend Summary */}
      {teamTrendSummary && (
        <div style={CARD}>
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif", display:'flex', alignItems:'center', gap:'5px' }}>
            <Activity style={{ width:11, height:11 }} /> Team Trend
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'8px' }}>
            <div>
              <div style={{ fontSize:'9px', color:'var(--text-muted)', marginBottom:'2px' }}>Volatility</div>
              <div style={{ fontSize:'12px', fontWeight:600, color: VOLATILITY_COLOR[teamTrendSummary.teamVolatilitySignal] || 'var(--text-secondary)', textTransform:'capitalize' }}>
                {teamTrendSummary.teamVolatilitySignal}
              </div>
              {teamTrendSummary.volatilityDetail && (
                <div style={{ fontSize:'9px', color:'var(--text-muted)', marginTop:'2px' }}>{teamTrendSummary.volatilityDetail}</div>
              )}
            </div>
            <div>
              <div style={{ fontSize:'9px', color:'var(--text-muted)', marginBottom:'2px' }}>Recovery</div>
              <div style={{ fontSize:'12px', fontWeight:600, color: RECOVERY_COLOR[teamTrendSummary.recoveryTrend] || 'var(--text-muted)', textTransform:'capitalize' }}>
                {teamTrendSummary.recoveryTrend?.replace('_', ' ')}
              </div>
            </div>
            <div>
              <div style={{ fontSize:'9px', color:'var(--text-muted)', marginBottom:'2px' }}>Stress Pattern</div>
              <div style={{ fontSize:'12px', fontWeight:600, color: STRESS_COLOR[teamTrendSummary.stressPattern] || 'var(--text-muted)', textTransform:'capitalize' }}>
                {teamTrendSummary.stressPattern}
              </div>
              {teamTrendSummary.stressDetail && teamTrendSummary.stressPattern !== 'none' && (
                <div style={{ fontSize:'9px', color:'var(--text-muted)', marginTop:'2px' }}>{teamTrendSummary.stressDetail}</div>
              )}
            </div>
            <div>
              <div style={{ fontSize:'9px', color:'var(--text-muted)', marginBottom:'2px' }}>Polarisation</div>
              <div style={{ fontSize:'12px', fontWeight:600, color: teamTrendSummary.isPolarised ? '#f59e0b' : '#22c55e' }}>
                {teamTrendSummary.isPolarised ? 'Polarised' : 'Balanced'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* A2: Accountability Signals */}
      {accountabilityInsights?.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif", display:'flex', alignItems:'center', gap:'5px' }}>
            <CheckCircle style={{ width:11, height:11 }} /> Accountability Signals
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
            {accountabilityInsights.map((a) => (
              <div key={a.userId} style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'5px 0', borderBottom:'1px solid var(--border-subtle)' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'12px', fontWeight:500, color:'var(--text-primary)' }}>{a.displayName}</div>
                  <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'2px', display:'flex', flexWrap:'wrap', gap:'8px' }}>
                    <span>{a.submissionRate}% submissions</span>
                    {a.missedDays > 0 && <span style={{ color:'#f87171' }}>{a.missedDays} missed days</span>}
                    {a.improvementStreak > 0 && <span style={{ color:'#22c55e' }}>↑ {a.improvementStreak}d streak</span>}
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'3px', alignItems:'flex-end', flexShrink:0 }}>
                  {a.consistentUnderperformance && (
                    <span style={{ fontSize:'9px', fontWeight:500, padding:'1px 5px', borderRadius:'99px', background:'rgba(239,68,68,0.10)', border:'1px solid rgba(239,68,68,0.25)', color:'#ef4444' }}>
                      Consistent Low
                    </span>
                  )}
                  {a.showingImprovement && (
                    <span style={{ fontSize:'9px', fontWeight:500, padding:'1px 5px', borderRadius:'99px', background:'rgba(34,197,94,0.10)', border:'1px solid rgba(34,197,94,0.25)', color:'#22c55e' }}>
                      Improving
                    </span>
                  )}
                  {a.needsOperationalSupport && (
                    <span style={{ fontSize:'9px', fontWeight:500, padding:'1px 5px', borderRadius:'99px', background:'rgba(245,158,11,0.10)', border:'1px solid rgba(245,158,11,0.25)', color:'#f59e0b' }}>
                      Needs Support
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* B1: Today's Required Focus */}
      {requiredFocus.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize:'10px', fontWeight:500, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'12px', fontFamily:"'Inter',sans-serif" }}>
            Today's Required Focus
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            {requiredFocus.map((item, i) => (
              <div key={`${item.userId}-${item.kpiKey}`}
                style={{ display:'flex', alignItems:'center', gap:'10px', padding:'4px 0',
                         borderBottom: i < requiredFocus.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <span style={{ fontSize:'10px', color:'var(--text-muted)', width:'12px', textAlign:'right', flexShrink:0 }}>
                  {i + 1}
                </span>
                <span style={{ flex:1, fontSize:'12px', color:'var(--text-primary)', fontWeight:500,
                               overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {item.displayName}
                </span>
                <span style={{ fontSize:'11px', color:'var(--text-secondary)', flexShrink:0 }}>
                  {item.kpiLabel}
                </span>
                <span style={{ fontSize:'11px', fontWeight:600, color: PACE_COLOR[item.paceStatus],
                               fontVariantNumeric:'tabular-nums', flexShrink:0 }}>
                  {item.requiredPerDay}/day
                </span>
                <span style={{ fontSize:'9px', fontWeight:500, padding:'1px 6px', borderRadius:'99px', flexShrink:0,
                  background: `${PACE_COLOR[item.paceStatus]}15`,
                  border: `1px solid ${PACE_COLOR[item.paceStatus]}30`,
                  color: PACE_COLOR[item.paceStatus] }}>
                  {PACE_LABEL[item.paceStatus]}
                </span>
              </div>
            ))}
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
