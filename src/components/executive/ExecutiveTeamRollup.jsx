// ============================================================
// ExecutiveTeamRollup — Phase A.1
//
// Team Intelligence Rollup section inside Executive BI.
// Shown ONLY when userProfile.role === 'manager'.
// Admin view is completely unaffected.
//
// Data: TeamIntelligenceResult from useExecutiveTeamRollup()
//   (which re-uses useBranchIntelligenceData — zero new engine code).
//
// Sections:
//   A. Team Snapshot    — aggregate health, scores, momentum
//   B. Top Performer    — best pharmacist this month
//   C. Needs Attention  — lowest performer(s)
//   D. Accountability   — submission reliability flags
//   E. Coaching         — top coaching recommendations
//   F. Member Summary   — compact per-pharmacist list
//
// Rules:
//   - No evaluation scoring fields (rating, score from eval engine).
//   - No evaluation engine data.
//   - No AI / generated text.
//   - All data is direct passthrough from TeamIntelligenceResult.
// ============================================================

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'

import { getKpiLabel } from '../../engine/kpiRegistry/kpiMetaResolver'

// Phase 1B: KPI_LABELS replaced by getKpiLabel() from registry resolver.
// The resolver handles engine key aliases (omni→OmniHealth, wellness→Wellness)
// and returns the same strings as the previous hardcoded map.
// No calculation change — display only.

const RISK_COLORS = {
  none:   '#22c55e',
  low:    '#86efac',
  medium: '#f59e0b',
  high:   '#ef4444',
}

const MOMENTUM_META = {
  improving:  { arrow: '↑', color: '#22c55e', label: 'Improving' },
  stable:     { arrow: '→', color: '#f59e0b', label: 'Stable' },
  declining:  { arrow: '↓', color: '#ef4444', label: 'Declining' },
}

const TEAM_STATUS_COLORS = {
  excellent: '#22c55e',
  good:      '#86efac',
  moderate:  '#f59e0b',
  poor:      '#ef4444',
  critical:  '#dc2626',
}

// ── Shared primitives ─────────────────────────────────────────

function SectionHeader({ title }) {
  return (
    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
                   textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
      {title}
    </div>
  )
}

function Card({ children, style }) {
  return (
    <div style={{
      border: '1px solid var(--border-subtle)', borderRadius: '10px',
      padding: '12px 14px', background: 'var(--bg-elevated)',
      ...style,
    }}>
      {children}
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                   fontSize: '12px', padding: '2px 0' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: color ?? 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function Pill({ label, color, bg }) {
  return (
    <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '99px',
                   color: color ?? 'var(--text-muted)', background: bg ?? 'var(--bg-base)',
                   border: '1px solid var(--border-subtle)' }}>
      {label}
    </span>
  )
}

// ── A. Team Snapshot ──────────────────────────────────────────

function TeamSnapshot({ teamIntelligence }) {
  const h = teamIntelligence.teamHealth
  const m = MOMENTUM_META[h.teamMomentumDirection] ?? MOMENTUM_META.stable
  const statusColor = TEAM_STATUS_COLORS[h.overallTeamStatus] ?? '#f59e0b'

  return (
    <div>
      <SectionHeader title="Team Snapshot" />
      <Card>
        <Row label="Team Status"
             value={h.overallTeamStatus.charAt(0).toUpperCase() + h.overallTeamStatus.slice(1)}
             color={statusColor} />
        <Row label="Active Members" value={h.activeMembers} />
        <Row label="Avg Performance" value={`${h.teamPerformanceScore}%`} />
        <Row label="Avg Consistency" value={`${h.teamConsistencyScore}%`} />
        <Row label="Team Momentum" value={`${m.arrow} ${m.label}`} color={m.color} />
      </Card>
    </div>
  )
}

// ── B. Top Performer ──────────────────────────────────────────

function TopPerformer({ summaries, pharmacyId, month }) {
  const navigate = useNavigate()
  const top = [...summaries].sort((a, b) => b.performanceScore - a.performanceScore)[0]
  if (!top) return null

  const m = MOMENTUM_META[top.momentumDirection] ?? MOMENTUM_META.stable

  const handleClick = () => {
    // Requirement 5: navigate to Pharmacist Intelligence for this pharmacist
    navigate(`/pharmacist/${top.userId}/intelligence?branchId=${pharmacyId}&month=${month}`)
  }

  return (
    <div>
      <SectionHeader title="Top Performer" />
      <Card style={{ cursor: 'pointer' }} onClick={handleClick}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {top.displayName}
          </span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#22c55e' }}>
            {top.performanceScore}%
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
          <Pill label={getKpiLabel(top.strongestKpi)} color="#22c55e" bg="rgba(34,197,94,0.08)" />
          <Pill label={`Risk: ${top.operationalRisk}`} color={RISK_COLORS[top.operationalRisk]} />
          <Pill label={`${m.arrow} ${m.label}`} color={m.color} />
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Click to view full intelligence</div>
      </Card>
    </div>
  )
}

// ── C. Needs Attention ────────────────────────────────────────

function NeedsAttention({ summaries, pharmacyId, month }) {
  const navigate = useNavigate()
  // Bottom 2 by performance, only if below 70% or high-risk
  const flagged = [...summaries]
    .sort((a, b) => a.performanceScore - b.performanceScore)
    .filter((s) => s.performanceScore < 70 || s.operationalRisk === 'high')
    .slice(0, 2)

  if (!flagged.length) return (
    <div>
      <SectionHeader title="Needs Attention" />
      <Card>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
          All team members are on track.
        </div>
      </Card>
    </div>
  )

  return (
    <div>
      <SectionHeader title="Needs Attention" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {flagged.map((s) => {
          const weakSnap = s.kpiSnapshots?.find((k) => k.kpiKey === s.weakestKpi)
          return (
            <Card key={s.userId}
                  style={{ cursor: 'pointer', borderColor: 'rgba(239,68,68,0.28)' }}
                  onClick={() => navigate(`/pharmacist/${s.userId}/intelligence?branchId=${pharmacyId}&month=${month}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>{s.displayName}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444' }}>
                  {s.performanceScore}%
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <Pill label={`Weak: ${getKpiLabel(s.weakestKpi)}`} color="#ef4444" bg="rgba(239,68,68,0.08)" />
                {weakSnap?.requiredPerDay > 0 && (
                  <Pill label={`${weakSnap.requiredPerDay}/day req.`} />
                )}
                <Pill label={`Risk: ${s.operationalRisk}`} color={RISK_COLORS[s.operationalRisk]} />
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── D. Accountability Watch ───────────────────────────────────

function AccountabilityWatch({ accountabilityInsights }) {
  const flagged = accountabilityInsights
    .filter((a) => a.needsOperationalSupport || a.missedDays > 3 || a.submissionRate < 70)
    .slice(0, 3)

  if (!flagged.length) return (
    <div>
      <SectionHeader title="Accountability Watch" />
      <Card>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
          No accountability flags this month.
        </div>
      </Card>
    </div>
  )

  return (
    <div>
      <SectionHeader title="Accountability Watch" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {flagged.map((a) => (
          <Card key={a.userId} style={{ borderColor: 'rgba(245,158,11,0.28)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>{a.displayName}</div>
            <Row label="Submission Rate" value={`${a.submissionRate}%`}
                 color={a.submissionRate < 70 ? '#ef4444' : '#f59e0b'} />
            <Row label="Missed Days" value={a.missedDays} />
            <Row label="Improvement Streak" value={`${a.improvementStreak} days`} />
            {a.needsOperationalSupport && (
              <div style={{ marginTop: '4px' }}>
                <Pill label="Needs Support" color="#f59e0b" bg="rgba(245,158,11,0.08)" />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── E. Coaching Priorities ────────────────────────────────────

function CoachingPriorities({ coachingRecommendations }) {
  const top3 = coachingRecommendations.slice(0, 3)

  if (!top3.length) return (
    <div>
      <SectionHeader title="Coaching Priorities" />
      <Card>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
          No coaching priorities this month.
        </div>
      </Card>
    </div>
  )

  return (
    <div>
      <SectionHeader title="Coaching Priorities" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {top3.map((rec) => (
          <Card key={rec.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700 }}>{rec.title}</span>
              {rec.kpiKey && (
                <Pill label={getKpiLabel(rec.kpiKey)} />
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
              {rec.detail}
            </div>
            {rec.targetUserName && (
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                → {rec.targetUserName}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── F. Member Summary ─────────────────────────────────────────

function MemberSummary({ summaries, pharmacyId, month }) {
  const navigate = useNavigate()
  const sorted = [...summaries].sort((a, b) => b.performanceScore - a.performanceScore)

  if (!sorted.length) return null

  return (
    <div>
      <SectionHeader title="Team Member Summary" />
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {sorted.map((s, i) => {
            const m = MOMENTUM_META[s.momentumDirection] ?? MOMENTUM_META.stable
            return (
              <div key={s.userId}
                   onClick={() => navigate(`/pharmacist/${s.userId}/intelligence?branchId=${pharmacyId}&month=${month}`)}
                   style={{
                     display: 'flex', alignItems: 'center', gap: '8px',
                     padding: '6px 4px', cursor: 'pointer',
                     borderBottom: i < sorted.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                   }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '16px', flexShrink: 0 }}>
                  #{i + 1}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, flex: 1, minWidth: 0,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.displayName}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '36px', textAlign: 'right',
                                color: s.performanceScore >= 90 ? '#22c55e' : s.performanceScore >= 70 ? '#f59e0b' : '#ef4444' }}>
                  {s.performanceScore}%
                </span>
                <span style={{ fontSize: '10px', color: RISK_COLORS[s.operationalRisk], minWidth: '28px', textAlign: 'center' }}>
                  {s.operationalRisk.charAt(0).toUpperCase() + s.operationalRisk.slice(1)}
                </span>
                <span style={{ fontSize: '10px', color: '#22c55e', minWidth: '60px' }}>
                  {getKpiLabel(s.strongestKpi)}
                </span>
                <span style={{ fontSize: '10px', color: '#ef4444', minWidth: '60px' }}>
                  {getKpiLabel(s.weakestKpi)}
                </span>
                <span style={{ fontSize: '10px', color: m.color, minWidth: '16px' }}>
                  {m.arrow}
                </span>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────

/**
 * ExecutiveTeamRollup — Team Intelligence Rollup for Executive BI.
 *
 * Props:
 *   teamIntelligence: TeamIntelligenceResult | null
 *   pharmacyId:       string | null
 *   month:            string ('yyyy-MM')
 *   loading:          boolean
 */
export default function ExecutiveTeamRollup({ teamIntelligence, pharmacyId, month, loading }) {
  if (loading) {
    return (
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px',
                     padding: '24px', textAlign: 'center', color: 'var(--text-muted)',
                     fontSize: '13px', background: 'var(--bg-elevated)' }}>
        Loading team intelligence…
      </div>
    )
  }

  if (!teamIntelligence || !teamIntelligence.pharmacistSummaries?.length) {
    return (
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px',
                     padding: '24px', textAlign: 'center', color: 'var(--text-muted)',
                     fontSize: '13px', background: 'var(--bg-elevated)' }}>
        Team intelligence will appear once pharmacist KPI entries are available.
      </div>
    )
  }

  const summaries          = teamIntelligence.pharmacistSummaries
  const teamHealth         = teamIntelligence.teamHealth
  const coachingRecs       = teamIntelligence.coachingRecommendations ?? []
  const accountabilityData = teamIntelligence.accountabilityInsights ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Section header */}
      <div>
        <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          Team Intelligence
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
          {teamHealth?.activeMembers ?? summaries.length} pharmacist{summaries.length !== 1 ? 's' : ''} · {month}
        </p>
      </div>

      {/* Row 1: Team Snapshot + Top Performer + Needs Attention */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
        {teamHealth && <TeamSnapshot teamIntelligence={teamIntelligence} />}
        <TopPerformer summaries={summaries} pharmacyId={pharmacyId} month={month} />
        <NeedsAttention summaries={summaries} pharmacyId={pharmacyId} month={month} />
      </div>

      {/* Row 2: Accountability Watch + Coaching Priorities */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <AccountabilityWatch accountabilityInsights={accountabilityData} />
        <CoachingPriorities coachingRecommendations={coachingRecs} />
      </div>

      {/* Row 3: Member Summary */}
      <MemberSummary summaries={summaries} pharmacyId={pharmacyId} month={month} />

    </div>
  )
}
