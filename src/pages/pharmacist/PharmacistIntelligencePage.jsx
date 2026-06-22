// ============================================================
// PharmacistIntelligencePage — /pharmacist/:userId/intelligence
// Phase 5C-3 — Context Bar (Section 0) + Pharmacist Executive
// Summary (Section 1) ONLY.
//
// Sections 2 (KPI Breakdown), 3 (Strengths & Weaknesses),
// 4 (Ranking — group/regional), 5 (Contribution Intelligence),
// 6 (Accountability), 7 (Coaching), 8 (Supervisor Action Center)
// are deferred to Phase 5C-4/5C-5. No KPI tiles, contribution bars,
// coaching cards, or action-center cards are rendered here.
//
// MOMENTUM_LABELS/RISK_LEVEL_LABELS/EmptyState/SectionHeader are
// duplicated (minimally) from BranchIntelligencePage rather than
// extracted into a shared module — Phase 5C-3 explicitly excludes
// modifying Branch Intelligence UI. Consolidation can happen in a
// future phase if warranted.
// ============================================================

import { useState } from 'react'
import { useParams, useSearchParams, Link, Navigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { format } from 'date-fns'

import { useAuthStore }    from '../../store/authStore'
import { useScopeProfile } from '../../hooks/useScopeProfile'
import { isPharmacyAllowed } from '../../services/scopeResolver'

import { usePharmacistIntelligenceData } from './usePharmacistIntelligenceData'
import { GRADE_COLORS } from '../../engine/executive'
import { getKpisForSurface, DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import { kpiBadge, kpiVsExpected } from '../../components/kpi/kpiVisualHelpers'
import { formatNumber } from '../../utils/helpers'

// ── Defensive formatting helpers (UX Polish Sprint) ──────────────
// Never render undefined/null/NaN to the user, regardless of what
// the view model contains. These are presentation-layer guards only
// — no engine/selector/builder changes (the builder already guards
// against NaN, but the UI must never trust upstream data blindly).

/** Format a count-like value (Active Days, Missed Days, etc.) — falls back to 0. */
function formatCount(value) {
  return Number.isFinite(value) ? value : 0
}

/** Format a percentage value as "XX%" — falls back to "0%". */
function formatPercent(value) {
  return `${Number.isFinite(value) ? value : 0}%`
}

/** Format "Active Days: X / Y" — both sides guarded independently. */
function formatActiveDays(active, expected) {
  return `${formatCount(active)} / ${formatCount(expected)}`
}

/** Format "Improvement Streak: X days" — guarded count + unit. */
function formatStreak(value) {
  return `${formatCount(value)} days`
}

// Duplicated from BranchIntelligencePage (Phase 5B) — see file header.
const MOMENTUM_LABELS = {
  accelerating:  { label: 'Accelerating', arrow: '↑↑', color: '#22c55e' },
  improving:     { label: 'Improving',    arrow: '↑',  color: '#22c55e' },
  stable:        { label: 'Steady',       arrow: '→',  color: 'var(--text-muted)' },
  cooling:       { label: 'Cooling',      arrow: '↓',  color: '#f59e0b' },
  needs_support: { label: 'Needs Support',arrow: '↓↓', color: '#ef4444' },
}

const RISK_LEVEL_LABELS = {
  none: 'None', low: 'Low', medium: 'Medium', high: 'High',
}

// Duplicated from BranchIntelligencePage (Phase 5B) — see file header.
// Phase 1B: labels and coaching actions read from registry resolver.
// getKpiLabel/getKpiCoachingAction handle engine key aliases automatically.
// No calculation change — display only.
import {
  getKpiLabel,
  getKpiCoachingAction,
} from '../../engine/kpiRegistry/kpiMetaResolver'

// Section 8 severity → existing 5-tier status colors (no new color system)
// critical=red, high=orange, medium=amber, low=teal — same palette as
// BranchIntelligencePage's SEVERITY_COLORS (Phase 5B).
const SEVERITY_COLORS = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.28)',  label: 'Critical' },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.28)', label: 'High' },
  medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.28)', label: 'Medium' },
  low:      { color: '#00d2ad', bg: 'rgba(0,210,173,0.08)',  border: 'rgba(0,210,173,0.22)',  label: 'Low' },
}

/** Duplicated from BranchIntelligencePage — see file header. */
function EmptyState({ message }) {
  return (
    <div style={{
      padding: '20px', borderRadius: '10px', textAlign: 'center',
      border: '1px dashed var(--border-subtle)', color: 'var(--text-muted)', fontSize: '12px',
      background: 'var(--bg-elevated)',
    }}>
      {message}
    </div>
  )
}

/** Duplicated from BranchIntelligencePage — see file header. */
function SectionHeader({ title }) {
  return (
    <div className="section-divider">
      <span className="section-divider-label">{title}</span>
      <div className="section-divider-line" />
    </div>
  )
}

/**
 * Pharmacist Hero — one compact metric tile (Designer Mode pass).
 * Same label/value/sub/color pattern already established by Branch
 * Intelligence's Executive Summary Band, used here for visual
 * consistency across the UI3-migrated pages.
 */
function HeroTile({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: '10px', padding: '12px 14px', flex: '1 1 0', minWidth: '130px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)',
                     textTransform: 'uppercase', letterSpacing: '0.06em',
                     fontFamily: "'Inter',sans-serif", marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.2,
                     fontVariantNumeric: 'tabular-nums', color: color ?? 'var(--text-primary)',
                     overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

/** Section 1 — one summary card. */
function SummaryCard({ title, children }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: '10px', padding: '12px 14px', flex: '1 1 220px', minWidth: '220px',
      display: 'flex', flexDirection: 'column', gap: '6px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)',
                     textTransform: 'uppercase', letterSpacing: '0.06em',
                     fontFamily: "'Inter',sans-serif" }}>
        {title}
      </div>
      {children}
    </div>
  )
}

/** A label/value row within a SummaryCard. */
function CardRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 600, color: color ?? 'var(--text-primary)',
                     fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        {value}
      </span>
    </div>
  )
}

/**
 * Section 2 — one compact KPI card from a PharmacistKpiBreakdownEntry.
 *
 * Reuses kpiVisualHelpers (KPI_STATUS_BADGE / kpiBadge / kpiVsExpected) —
 * the SAME 5-tier status system as Dashboard/Branch Intelligence. Does
 * NOT reuse KpiTile/FocusKpiCommandCard directly: those components
 * expect Dashboard/Branch-shaped stats (`_label`, `_color`,
 * `remainingToTarget`, separate `pace` object), while
 * PharmacistKpiBreakdownEntry uses `remaining`/`requiredPerDay`/
 * `paceStatus` directly. This card adapts the same badge/segmented-bar
 * visual language to that shape without forking KpiTile.
 */
/**
 * Self View — "My Focus Today" card.
 *
 * Uses the existing biggestOpportunity / weakest KPI from
 * viewModel.strengthsWeaknesses + the matching kpiBreakdown entry.
 * No new calculation — all fields (achievementPct, remaining,
 * requiredPerDay, paceStatus) are direct passthrough.
 */
function MyFocusTodayCard({ entry }) {
  const badge = kpiBadge(entry, { paceStatus: entry.paceStatus })
  const hasTarget = entry.target > 0
  const kpiName = getKpiLabel(entry.kpiKey)

  // Short, plain-language action sentence — derived from existing fields
  // only (no new calculation). Critical/behind-pace KPIs get a more
  // specific nudge per KPI; other states get a generic message.
  const actionSentence = (() => {
    if (!hasTarget) return `No target set for ${kpiName} this month.`
    if (entry.remaining <= 0) return `Target already met for ${kpiName} — keep it up.`
    if (entry.paceStatus === 'critical' || entry.paceStatus === 'behind') {
      // Phase 1B: coaching actions from registry resolver — no hardcoded switch.
      // getKpiCoachingAction handles engine key aliases and falls back to
      // `Focus on {kpiName} to close the remaining gap.` for unknown keys.
      return getKpiCoachingAction(entry.kpiKey)
    }
    if (entry.requiredPerDay > 0) {
      return `Aim for ${formatNumber(entry.requiredPerDay, { maximumFractionDigits: 1 })} more ${kpiName} per day to reach your target.`
    }
    return `Keep up the current pace on ${kpiName}.`
  })()

  return (
    <div style={{
      border: badge ? `1px solid ${badge.border}` : '1px solid var(--border-subtle)',
      borderRadius: '10px', padding: '14px 16px', background: 'var(--bg-elevated)',
      display: 'flex', flexDirection: 'column', gap: '6px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
        {kpiName}
      </div>

      {hasTarget ? (
        <>
          <CardRow label="Achievement" value={`${entry.achievementPct}%`} color={badge?.color} />
          <CardRow label="Remaining" value={formatNumber(entry.remaining)} />
          <CardRow label="Required / Day" value={formatNumber(entry.requiredPerDay, { maximumFractionDigits: 1 })} />
          <CardRow label="Status" value={badge?.label ?? '—'} color={badge?.color} />
        </>
      ) : (
        <CardRow label="Status" value="No target set" />
      )}

      <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4, marginTop: '2px' }}>
        <span style={{ fontWeight: 700 }}>Action: </span>{actionSentence}
      </div>
    </div>
  )
}


function PharmacistKpiCard({ entry }) {
  const badge = kpiBadge(entry, { paceStatus: entry.paceStatus })
  const vsExp = entry.expectedPct != null ? kpiVsExpected(entry, entry.expectedPct) : null
  const hasTarget = entry.target > 0
  const isAchieved = hasTarget && entry.remaining <= 0
  const cardBorder = badge ? `1px solid ${badge.border}` : '1px solid var(--border-subtle)'

  const SEGS = 10
  const filled = hasTarget ? Math.min(Math.floor(Math.max(entry.achievementPct, 0) / SEGS), SEGS) : 0
  const fillColor = badge?.color ?? 'var(--text-muted)'

  return (
    <div style={{
      border: cardBorder, borderRadius: '8px', padding: '10px 12px',
      background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: '4px',
      opacity: isAchieved ? 0.8 : 1,
    }}>
      {/* Row 1: KPI name + status badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)',
                       textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {getKpiLabel(entry.kpiKey)}
        </span>
        {badge && hasTarget && (
          <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '99px',
                         background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
            {badge.label}
          </span>
        )}
        {!hasTarget && (
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No target</span>
        )}
      </div>

      {/* Row 2: Achievement % */}
      <div style={{ fontSize: '24px', fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
                     color: hasTarget ? (badge?.color ?? 'var(--text-primary)') : 'var(--text-muted)' }}>
        {hasTarget ? `${entry.achievementPct}%` : '—'}
      </div>

      {/* Row 3: Actual / Target */}
      {hasTarget && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(entry.actual)} / {formatNumber(entry.target)}
        </div>
      )}

      {/* Row 4: Remaining */}
      {hasTarget && (
        <div style={{ fontSize: '11px', fontWeight: 600,
                       color: entry.remaining > 0 ? (badge?.color ?? 'var(--text-primary)') : '#6b9c84' }}>
          {entry.remaining > 0
            ? <>{formatNumber(entry.remaining)} <span style={{ fontSize: '9px', fontWeight: 400, color: 'var(--text-muted)' }}>Remaining</span></>
            : <>✓ <span style={{ fontSize: '9px', fontWeight: 400, color: 'var(--text-muted)' }}>Target Achieved</span></>}
        </div>
      )}

      {/* Row 5: Required pace */}
      {hasTarget && entry.remaining > 0 && entry.requiredPerDay > 0 && (
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
          <span style={{ fontWeight: 700, color: badge?.color ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {formatNumber(entry.requiredPerDay, { maximumFractionDigits: 1 })}/day
          </span>{' '}
          <span style={{ color: 'var(--text-muted)' }}>required</span>
        </div>
      )}

      {/* Row 6: Expected % vs achievement */}
      {hasTarget && entry.expectedPct != null && (
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          Expected: {entry.expectedPct}%
          {vsExp && <span style={{ color: vsExp.color, marginLeft: '6px' }}>{vsExp.text}</span>}
        </div>
      )}
      {hasTarget && entry.expectedPct == null && (
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Expected pace unavailable
        </div>
      )}

      {/* Row 7: Contribution */}
      {entry.contributionPct != null ? (
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          Contribution: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.contributionPct}%</span>
          {entry.contributionRank != null && <span> · Branch rank #{entry.contributionRank}</span>}
        </div>
      ) : (
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Contribution data unavailable
        </div>
      )}

      {/* Row 8: Segmented progress bar */}
      {hasTarget && (
        <div style={{ display: 'flex', gap: '2px', marginTop: '2px' }}
             role="progressbar" aria-valuenow={entry.achievementPct} aria-valuemin={0} aria-valuemax={100}
             aria-label={`${getKpiLabel(entry.kpiKey)}: ${entry.achievementPct}%`}>
          {Array.from({ length: SEGS }, (_, idx) => (
            <div key={idx} style={{
              flex: 1, height: '4px', borderRadius: '2px',
              background: idx < filled ? fillColor : 'var(--border-subtle)',
              opacity: idx < filled ? 1 : 0.45,
            }} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Section 5 — one KPI's contribution-context row.
 *
 * Highlights high contribution (green-tinted, contributionRank == 1)
 * and low contribution (red-tinted, contributionRank at/near the
 * bottom — i.e. the largest rank value among the entries shown).
 * `maxRank` is the worst (highest-numbered) contributionRank across
 * all entries in this pharmacist's contributionContext, passed by
 * the caller so this component doesn't need branch-wide data.
 */
function ContributionRow({ entry, maxRank }) {
  const isTop = entry.contributionRank === 1
  const isLow = maxRank > 1 && entry.contributionRank === maxRank
  const barColor = isTop ? '#22c55e' : isLow ? '#ef4444' : 'var(--text-muted)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px',
      background: isTop ? 'rgba(34,197,94,0.04)' : isLow ? 'rgba(239,68,68,0.04)' : 'var(--bg-elevated)',
      border: `1px solid ${isTop ? 'rgba(34,197,94,0.18)' : isLow ? 'rgba(239,68,68,0.18)' : 'var(--border-subtle)'}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {getKpiLabel(entry.kpiKey)}
            {isTop && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#22c55e' }}>Top contributor</span>}
            {isLow && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#ef4444' }}>Low contribution</span>}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: barColor }}>
            {entry.contributionPct}%
          </span>
        </div>
        {/* Horizontal contribution bar — contributionPct length */}
        <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: '3px',
            width: `${Math.min(Math.max(entry.contributionPct, 0), 100)}%`,
            background: barColor,
          }} />
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(entry.pharmacistActual)} of {formatNumber(entry.branchTotal)} branch total · Branch rank #{entry.contributionRank}
        </div>
      </div>
    </div>
  )
}

/**
 * Section 7 — one CoachingRecommendation as a read-only card.
 * Title / Detail / KPI label / Rationale only — no editing, no
 * generation, direct passthrough of viewModel.coaching entries.
 */
function CoachingCard({ rec }) {
  return (
    <div style={{
      border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px 12px',
      background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: '4px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {rec.title}
        </span>
        {rec.kpiKey && (
          <span style={{ fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '99px',
                         background: 'var(--bg-base)', color: 'var(--text-secondary)',
                         border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            {getKpiLabel(rec.kpiKey)}
          </span>
        )}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4 }}>
        {rec.detail}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
        {rec.rationale}
      </div>
    </div>
  )
}

/** Section 8 — one labeled field within an action card (Problem/Cause/Action/Impact). Mirrors BranchIntelligencePage's ActionField (Phase 5B). */
function ActionField({ label, text, highlight }) {
  return (
    <div>
      <div style={{ fontSize: '9px', fontWeight: 700, color: highlight ? 'var(--accent, #00d2ad)' : 'var(--text-muted)',
                     textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4,
                     fontWeight: highlight ? 600 : 400 }}>
        {text}
      </div>
    </div>
  )
}

export default function PharmacistIntelligencePage() {
  const { userId } = useParams()
  const [searchParams] = useSearchParams()
  const branchId = searchParams.get('branchId')
  const focusKpiParam = searchParams.get('focusKpi')
  const focusKpi = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).includes(focusKpiParam) ? focusKpiParam : null

  // ── Authorization guard — Phase 2D (hooks-order hotfix) ───────
  // Route-level (App.jsx) allows all roles, including 'pharmacist'.
  // Page-level scoping uses the Scope Resolver (Phase 2B/2C):
  //   - pharmacist: may only view userId === their own uid (unchanged).
  //   - All other roles: isPharmacyAllowed(scope, branchId) must be true.
  //     • admin / general_manager — scope='all'  → always allowed.
  //     • manager / branch_manager — scope='single' → own pharmacy only.
  //     • district_supervisor / regional_manager — scope='list' → assigned pharmacies only.
  //     • unknown role — scope='none' → denied.
  //   - scope loading → show loading gate (never allow content prematurely).
  //   - scope error / no scope → fail closed.
  //
  // React's Rules of Hooks require every hook to run, in the same order,
  // on every render. The guard checks used to `return` before useState /
  // usePharmacistIntelligenceData were called, so a render that exited
  // early invoked fewer hooks than one that didn't — that mismatch is
  // what produced "Rendered more hooks than during the previous render."
  // All hooks are now called unconditionally up front; the same
  // authorization conditions are computed as plain booleans afterward,
  // and only decide what to render / which args reach the data hook —
  // mirroring the existing enabled-flag idiom already used inside
  // usePharmacistIntelligenceData.js (e.g. useBranchIntelligenceData is
  // always called, but is no-oped via null args when not applicable).
  const { userProfile } = useAuthStore()
  const { scope, loading: scopeLoading, error: scopeError } = useScopeProfile()
  const [month] = useState(searchParams.get('month') || format(new Date(), 'yyyy-MM'))

  // useScopeProfile's synchronous fast path (admin/GM/single-branch roles)
  // still resolves inside a useEffect, so there is one render right after
  // mount where scope is null but scopeLoading hasn't been set true yet.
  // Treating that transient tick as "still loading" (instead of "denied")
  // fixes a false-negative redirect to /unauthorized on first navigation
  // into this page — the real isPharmacyAllowed() check below is unchanged.
  const ownProfileDenied = userProfile?.role === 'pharmacist' && userProfile.uid !== userId
  const scopeSettling = scopeLoading || (!scope && !scopeError)
  const scopeDenied = !scopeSettling && (!scope || scopeError)
  const pharmacyDenied = !scopeSettling && !scopeDenied &&
    userProfile?.role !== 'pharmacist' && !isPharmacyAllowed(scope, branchId ?? '')
  const authorized = !ownProfileDenied && !scopeSettling && !scopeDenied && !pharmacyDenied

  const { viewModel, loading, error, mode } = usePharmacistIntelligenceData(
    authorized ? userId : null,
    authorized ? branchId : null,
    month,
    focusKpi,
  )

  // ── Focus KPI / Top Strength — computed once, shared by the Hero
  // and "My Focus Today" below (Designer Mode pass: previously
  // recomputed inline inside the section-composition IIFE). Pure
  // reshape of existing fields — no new calculation.
  const focusKpiKey = viewModel?.strengthsWeaknesses.biggestOpportunity
    ?? viewModel?.strengthsWeaknesses.weakestKpis[0]
    ?? null
  const focusEntry = focusKpiKey
    ? viewModel?.kpiBreakdown.find((e) => e.kpiKey === focusKpiKey) ?? null
    : null
  const topStrengthKey = viewModel?.strengthsWeaknesses.topStrengths[0] ?? null

  if (ownProfileDenied) {
    return <Navigate to="/unauthorized" replace />
  }
  if (scopeSettling) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Verifying access…
      </div>
    )
  }
  if (scopeDenied) {
    return <Navigate to="/unauthorized" replace />
  }
  if (pharmacyDenied) {
    return <Navigate to="/unauthorized" replace />
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Section 0: Context Bar ──────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          <Link to="/executive" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', textDecoration: 'none' }}>
            <ChevronLeft style={{ width: 14, height: 14 }} />
            Executive BI
          </Link>
          <span>/</span>
          {branchId ? (
            <Link to={`/branch/${branchId}/intelligence`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
              Branch Intelligence
            </Link>
          ) : (
            <span>Branch Intelligence</span>
          )}
          <span>/</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {viewModel?.identity?.displayName ?? userId} — Pharmacist Intelligence
          </span>
        </div>

        {/* Month — display only, no selector in Phase 5C-3 (route shell) */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          borderRadius: '8px', padding: '6px 12px', fontSize: '12px', color: 'var(--text-secondary)',
        }}>
          {format(new Date(`${month}-01`), 'MMM yyyy')}
        </div>
      </div>

      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading pharmacist intelligence…
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)',
                       border: '1px solid rgba(239,68,68,0.28)', color: '#ef4444', fontSize: '13px' }}>
          Failed to load pharmacist data: {error.message ?? String(error)}
        </div>
      )}

      {!loading && !error && !viewModel && (
        <EmptyState message={`No performance data found for this pharmacist in ${month}.`} />
      )}

      {!loading && !error && viewModel && (
        <>
          {/* ── Pharmacist Hero (Designer Mode pass) ─────────────
              Identity line + compact metric tile row, mirroring the
              Executive Summary Band already established on Branch
              Intelligence: Score, Momentum, Focus KPI, Top Strength,
              and (manager view only) Branch Rank. All values read
              directly from the existing viewModel — no new fields,
              no new calculations.
          ─────────────────────────────────────────────────────── */}
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {viewModel.identity.displayName}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>
              {viewModel.identity.employeeId ? `Employee ID: ${viewModel.identity.employeeId} · ` : ''}
              {viewModel.identity.pharmacyName} ({viewModel.identity.pharmacyCode})
              {viewModel.identity.region ? ` · ${viewModel.identity.region}` : ''}
              {' · '}{format(new Date(`${viewModel.metadata.month}-01`), 'MMM yyyy')}
            </p>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {/* 1. Score */}
              <HeroTile
                label="Score"
                value={`${viewModel.performanceSummary.performanceScore}%`}
                sub={`Grade ${viewModel.performanceSummary.grade}`}
                color={GRADE_COLORS[viewModel.performanceSummary.grade]}
              />

              {/* 2. Momentum */}
              {(() => {
                const m = MOMENTUM_LABELS[viewModel.performanceSummary.momentumDirection] ?? MOMENTUM_LABELS.stable
                const delta = viewModel.performanceSummary.momentumDelta
                return (
                  <HeroTile
                    label="Momentum"
                    value={`${m.arrow} ${m.label}`}
                    sub={`${delta > 0 ? '+' : ''}${delta}pts`}
                    color={m.color}
                  />
                )
              })()}

              {/* 3. Focus KPI — biggest opportunity / weakest KPI this month */}
              <HeroTile
                label="Focus KPI"
                value={focusEntry ? getKpiLabel(focusEntry.kpiKey) : '—'}
                sub={focusEntry?.target > 0
                  ? `${focusEntry.achievementPct}% · ${formatNumber(focusEntry.remaining)} remaining`
                  : focusEntry ? 'No target set' : 'On track — nothing flagged'}
                color={focusEntry?.target > 0 ? (kpiBadge(focusEntry, { paceStatus: focusEntry.paceStatus })?.color) : undefined}
              />

              {/* 4. Top Strength */}
              <HeroTile
                label="Top Strength"
                value={topStrengthKey ? getKpiLabel(topStrengthKey) : '—'}
                sub={topStrengthKey ? 'Strength' : 'No standout yet'}
                color={topStrengthKey ? '#22c55e' : undefined}
              />

              {/* 5. Branch Rank — manager view only (self view intentionally
                  omits ranking concepts, per the existing Polish Sprint
                  decision carried through the rest of this page). */}
              {viewModel.rankingContext.branchRank && (
                <HeroTile
                  label="Branch Rank"
                  value={`#${viewModel.rankingContext.branchRank.rank}/${viewModel.rankingContext.branchRank.cohortSize}`}
                  sub="this month"
                />
              )}
            </div>
          </div>

          {/* ── Warnings banner ──────────────────────────────── */}
          {viewModel.warnings.length > 0 && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(245,158,11,0.06)',
                           border: '1px solid rgba(245,158,11,0.22)', fontSize: '11px', color: 'var(--text-secondary)' }}>
              {viewModel.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              Section content — each section's JSX is built once
              below, then composed into a mode-specific order.
              Manager drilldown keeps the original Phase 5C-3/5C-5
              order (Executive Summary → KPI → Strengths → Ranking →
              Contribution → Accountability → Coaching → Action
              Center). Self view reorders for pharmacist usage and
              softens manager-only messaging — see Polish Sprint.
          ════════════════════════════════════════════════════ */}

          {(() => {
            // ── My Performance Snapshot (self view) — Identity + Performance only.
            // Ranking/Evaluation/Metadata are NOT included here for self view;
            // they move to the bottom (sectionEvaluationMetadata).
            const sectionPerformanceSnapshot = (
              <div>
                <SectionHeader title="My Performance Snapshot" />
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <SummaryCard title="Identity">
                    <CardRow label="Name" value={viewModel.identity.displayName} />
                    <CardRow label="Employee ID" value={viewModel.identity.employeeId ?? '—'} />
                    <CardRow label="Pharmacy" value={viewModel.identity.pharmacyName} />
                    <CardRow label="Branch Code" value={viewModel.identity.pharmacyCode} />
                    <CardRow label="Region" value={viewModel.identity.region ?? '—'} />
                  </SummaryCard>

                  <SummaryCard title="Performance">
                    <CardRow
                      label="Score"
                      value={`${viewModel.performanceSummary.performanceScore}%`}
                      color={GRADE_COLORS[viewModel.performanceSummary.grade]}
                    />
                    <CardRow
                      label="Grade"
                      value={viewModel.performanceSummary.grade}
                      color={GRADE_COLORS[viewModel.performanceSummary.grade]}
                    />
                    <CardRow
                      label="Operational Risk"
                      value={RISK_LEVEL_LABELS[viewModel.performanceSummary.operationalRisk] ?? viewModel.performanceSummary.operationalRisk}
                    />
                    {(() => {
                      const m = MOMENTUM_LABELS[viewModel.performanceSummary.momentumDirection] ?? MOMENTUM_LABELS.stable
                      return (
                        <CardRow
                          label="Momentum"
                          value={`${m.arrow} ${m.label}`}
                          color={m.color}
                        />
                      )
                    })()}
                    <CardRow
                      label="Momentum Δ"
                      value={`${viewModel.performanceSummary.momentumDelta > 0 ? '+' : ''}${viewModel.performanceSummary.momentumDelta}pts`}
                    />
                  </SummaryCard>
                </div>
              </div>
            )

            // ── Pharmacist Executive Summary (manager view) — original
            // 5-card layout, unchanged. ──
            const sectionExecutiveSummary = (
              <div>
                <SectionHeader title="Pharmacist Executive Summary" />
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>

                  <SummaryCard title="Identity">
                    <CardRow label="Name" value={viewModel.identity.displayName} />
                    <CardRow label="Employee ID" value={viewModel.identity.employeeId ?? '—'} />
                    <CardRow label="Pharmacy" value={viewModel.identity.pharmacyName} />
                    <CardRow label="Branch Code" value={viewModel.identity.pharmacyCode} />
                    <CardRow label="Region" value={viewModel.identity.region ?? '—'} />
                  </SummaryCard>

                  <SummaryCard title="Performance">
                    <CardRow
                      label="Score"
                      value={`${viewModel.performanceSummary.performanceScore}%`}
                      color={GRADE_COLORS[viewModel.performanceSummary.grade]}
                    />
                    <CardRow
                      label="Grade"
                      value={viewModel.performanceSummary.grade}
                      color={GRADE_COLORS[viewModel.performanceSummary.grade]}
                    />
                    <CardRow
                      label="Operational Risk"
                      value={RISK_LEVEL_LABELS[viewModel.performanceSummary.operationalRisk] ?? viewModel.performanceSummary.operationalRisk}
                    />
                    {(() => {
                      const m = MOMENTUM_LABELS[viewModel.performanceSummary.momentumDirection] ?? MOMENTUM_LABELS.stable
                      return (
                        <CardRow
                          label="Momentum"
                          value={`${m.arrow} ${m.label}`}
                          color={m.color}
                        />
                      )
                    })()}
                    <CardRow
                      label="Momentum Δ"
                      value={`${viewModel.performanceSummary.momentumDelta > 0 ? '+' : ''}${viewModel.performanceSummary.momentumDelta}pts`}
                    />
                  </SummaryCard>

                  <SummaryCard title="Ranking">
                    {viewModel.rankingContext.branchRank ? (
                      <CardRow
                        label="Branch Rank"
                        value={`#${viewModel.rankingContext.branchRank.rank} / ${viewModel.rankingContext.branchRank.cohortSize}`}
                      />
                    ) : (
                      <CardRow label="Branch Rank" value="Not available" />
                    )}
                    {viewModel.rankingContext.companyWideRank ? (
                      <CardRow
                        label="Company Rank"
                        value={`#${viewModel.rankingContext.companyWideRank.rank} / ${viewModel.rankingContext.companyWideRank.cohortSize}`}
                      />
                    ) : (
                      <CardRow label="Company Rank" value="Not yet calculated" />
                    )}
                    {/* Supervisor-group / regional ranking — always deferred (no engine exists) */}
                    <CardRow label="Supervisor Group Rank" value="Deferred" />
                    <CardRow label="Regional Rank" value="Deferred" />
                  </SummaryCard>

                  <SummaryCard title="Evaluation">
                    {viewModel.performanceSummary.officialRating ? (
                      <>
                        <CardRow label="Official Rating" value={viewModel.performanceSummary.officialRating.rating} />
                        <CardRow label="Final Score" value={`${viewModel.performanceSummary.officialRating.finalScore}%`} />
                        <CardRow label="Engine Version" value="v1" />
                      </>
                    ) : (
                      <EmptyState message={`No official evaluation result for ${viewModel.metadata.month}.`} />
                    )}
                  </SummaryCard>

                  <SummaryCard title="Metadata">
                    <CardRow label="Generated At" value={new Date(viewModel.metadata.generatedAt).toLocaleString('en-US')} />
                    <CardRow label="KPI Entries" value={viewModel.metadata.dataAvailability.hasKpiEntries ? 'Available' : 'None'} />
                    <CardRow label="Targets" value={viewModel.metadata.dataAvailability.hasTargets ? 'Available' : 'None'} />
                    <CardRow label="Branch Context" value={viewModel.metadata.dataAvailability.hasBranchContext ? 'Available' : 'Unavailable'} />
                    <CardRow label="Company Ranking" value={viewModel.metadata.dataAvailability.hasCompanyWideRanking ? 'Available' : 'Not yet calculated'} />
                    <CardRow label="Evaluation Result" value={viewModel.metadata.dataAvailability.hasEvaluationResult ? 'Available' : 'None'} />
                  </SummaryCard>
                </div>
              </div>
            )

            // ── My Focus Today (self view) — weakest/biggest-opportunity
            // KPI from existing strengthsWeaknesses + kpiBreakdown. No new
            // calculation. Hidden entirely if no KPI qualifies (all on
            // track / no targets) — not an error state, just nothing to
            // flag today. focusKpiKey/focusEntry are computed once above
            // (Designer Mode pass), shared with the Hero. ──
            const sectionFocusToday = focusEntry && (
              <div>
                <SectionHeader title="My Focus Today" />
                <MyFocusTodayCard entry={focusEntry} />
              </div>
            )

            // ── Section: KPI Performance Breakdown ──
            const sectionKpiBreakdown = (
              <div>
                <SectionHeader title="KPI Performance Breakdown" />
                {viewModel.kpiBreakdown.length === 0 ? (
                  <EmptyState message="No KPI breakdown available for this pharmacist this month." />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px' }}
                       className="sm:grid-cols-5">
                    {viewModel.kpiBreakdown.map((entry) => (
                      <PharmacistKpiCard key={entry.kpiKey} entry={entry} />
                    ))}
                  </div>
                )}
              </div>
            )

            // ── Section: Strengths & Weaknesses / Strengths & Improvement Areas ──
            // Same content, mode-specific title (self view uses
            // friendlier "Strengths & Improvement Areas" per the
            // polish sprint's reordering requirement).
            const sectionStrengths = (
              <div>
                <SectionHeader title={mode === 'self' ? 'Strengths & Improvement Areas' : 'Strengths & Weaknesses'} />
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <SummaryCard title="Top Strengths">
                    {viewModel.strengthsWeaknesses.topStrengths.length > 0 ? (
                      viewModel.strengthsWeaknesses.topStrengths.map((k) => (
                        <CardRow key={k} label={getKpiLabel(k)} value="Strength" color="#22c55e" />
                      ))
                    ) : (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        No standout strengths this month.
                      </div>
                    )}
                  </SummaryCard>

                  <SummaryCard title={mode === 'self' ? 'Improvement Areas' : 'Weakest KPIs'}>
                    {viewModel.strengthsWeaknesses.weakestKpis.length > 0 ? (
                      viewModel.strengthsWeaknesses.weakestKpis.map((k) => (
                        <CardRow
                          key={k}
                          label={getKpiLabel(k)}
                          value={k === viewModel.strengthsWeaknesses.biggestOpportunity ? 'Biggest Opportunity' : 'Weak'}
                          color="#ef4444"
                        />
                      ))
                    ) : (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        No KPIs significantly behind pace this month.
                      </div>
                    )}
                  </SummaryCard>

                  <SummaryCard title="Overall Momentum">
                    {(() => {
                      const m = MOMENTUM_LABELS[viewModel.strengthsWeaknesses.overallMomentum.direction] ?? MOMENTUM_LABELS.stable
                      return (
                        <>
                          <CardRow label="Direction" value={`${m.arrow} ${m.label}`} color={m.color} />
                          <CardRow
                            label="Delta"
                            value={`${viewModel.strengthsWeaknesses.overallMomentum.delta > 0 ? '+' : ''}${viewModel.strengthsWeaknesses.overallMomentum.delta}pts`}
                          />
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Overall trend only — per-KPI trend is not available.
                          </div>
                        </>
                      )
                    })()}
                  </SummaryCard>
                </div>
              </div>
            )

            // ── Section: Ranking Context (manager view only — see
            // Polish Sprint requirement 2/3: self view does not lead
            // with or include a dedicated Ranking section). ──
            const sectionRanking = (
              <div>
                <SectionHeader title="Ranking Context" />
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <SummaryCard title="Branch Rank">
                    {viewModel.rankingContext.branchRank ? (
                      <CardRow
                        label="Rank"
                        value={`#${viewModel.rankingContext.branchRank.rank} / ${viewModel.rankingContext.branchRank.cohortSize}`}
                      />
                    ) : (
                      <CardRow label="Rank" value="Not available" />
                    )}
                  </SummaryCard>

                  <SummaryCard title="Company-Wide Rank">
                    {viewModel.rankingContext.companyWideRank ? (
                      <CardRow
                        label="Rank"
                        value={`#${viewModel.rankingContext.companyWideRank.rank} / ${viewModel.rankingContext.companyWideRank.cohortSize}`}
                      />
                    ) : (
                      <CardRow label="Rank" value="Not yet calculated" />
                    )}
                  </SummaryCard>

                  <SummaryCard title="Supervisor Group Rank">
                    <CardRow label="Rank" value="Deferred" />
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Pending ranking engine — not available yet.
                    </div>
                  </SummaryCard>

                  <SummaryCard title="Regional Rank">
                    <CardRow label="Rank" value="Deferred" />
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Pending ranking engine — not available yet.
                    </div>
                  </SummaryCard>
                </div>
              </div>
            )

            // ── Section: Ranking (self view) — no longer rendered as a
            // standalone section; folded into sectionMetadata's "More
            // to come" note per the UX Polish Sprint, using
            // business-friendly wording ("Branch ranking will appear
            // here when ranking snapshots are available.") instead of
            // technical "Deferred"/"Available to manager view only". ──

            // ── Section: Contribution Intelligence (manager view) ──
            const sectionContribution = (
              <div>
                <SectionHeader title="Contribution Intelligence" />
                {viewModel.contributionContext.length === 0 ? (
                  <EmptyState message="No branch contribution data available for this pharmacist this month." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                      Contribution % is this pharmacist's share of the branch's total actual for each KPI this month.
                    </div>
                    {(() => {
                      const maxRank = Math.max(...viewModel.contributionContext.map((e) => e.contributionRank))
                      return viewModel.contributionContext.map((entry) => (
                        <ContributionRow key={entry.kpiKey} entry={entry} maxRank={maxRank} />
                      ))
                    })()}
                  </div>
                )}
              </div>
            )

            // ── Section: Contribution (self view) — no longer rendered
            // as a standalone element; folded into sectionMetadata's
            // "More to come" note per the UX Polish Sprint, using
            // business-friendly wording ("Branch contribution details
            // are available in manager view.") instead of technical
            // "Manager View Only"/"Context Unavailable". ──

            // ── Section: Accountability Intelligence ──
            const sectionAccountability = (
              <div>
                <SectionHeader title="Accountability Intelligence" />
                {!viewModel.accountability ? (
                  <EmptyState message={mode === 'self'
                    ? 'Your activity summary will appear here once data is available for this month.'
                    : 'No accountability data available'} />
                ) : (
                  (() => {
                    const a = viewModel.accountability
                    const submissionRate = formatCount(a.submissionRate)
                    const rateColor = submissionRate >= 90 ? '#22c55e'
                      : submissionRate >= 70 ? '#f59e0b'
                      : '#ef4444'
                    return (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <SummaryCard title="Submission">
                          <CardRow label="Active Days" value={formatActiveDays(a.activeDays, a.expectedSubmissionDays)} />
                          <CardRow label="Submission Rate" value={formatPercent(a.submissionRate)} color={rateColor} />
                          <CardRow label="Missed Days" value={formatCount(a.missedDays)} />
                          <CardRow label="Improvement Streak" value={formatStreak(a.improvementStreak)} />
                        </SummaryCard>

                        <SummaryCard title="Flags">
                          <CardRow
                            label="Consistent Underperformance"
                            value={a.consistentUnderperformance ? 'Yes' : 'No'}
                            color={a.consistentUnderperformance ? '#ef4444' : undefined}
                          />
                          <CardRow
                            label="Needs Operational Support"
                            value={a.needsOperationalSupport ? 'Yes' : 'No'}
                            color={a.needsOperationalSupport ? '#f59e0b' : undefined}
                          />
                          {a.supportDetail && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {a.supportDetail}
                            </div>
                          )}
                        </SummaryCard>
                      </div>
                    )
                  })()
                )}
              </div>
            )

            // ── Section: Coaching Intelligence ──
            const sectionCoaching = (
              <div>
                <SectionHeader title="Coaching Intelligence" />
                {viewModel.coaching.length === 0 ? (
                  <EmptyState message={mode === 'self'
                    ? 'No coaching tips for you right now — check back next month.'
                    : 'No coaching recommendations available'} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {viewModel.coaching.map((rec) => (
                      <CoachingCard key={rec.id} rec={rec} />
                    ))}
                  </div>
                )}
              </div>
            )

            // ── Section: Supervisor Action Center (manager view only —
            // self view has no "supervisor" to act, so this section is
            // omitted from the self ordering entirely; see requirement
            // 2 "hide manager-only sections when they add no value"). ──
            const sectionActionCenter = (
              <div>
                <SectionHeader title="Supervisor Action Center" />
                {viewModel.supervisorActions.length === 0 ? (
                  <EmptyState message="No supervisor actions available" />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {viewModel.supervisorActions.map((action, i) => {
                      const sev = SEVERITY_COLORS[action.severity] ?? SEVERITY_COLORS.medium
                      return (
                        <div key={i} style={{ borderRadius: '10px', overflow: 'hidden', border: `1px solid ${sev.border}` }}>
                          {/* Header: severity + related KPI */}
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 14px', background: sev.bg, borderBottom: `1px solid ${sev.border}`,
                          }}>
                            <span style={{
                              fontSize: '9px', fontWeight: 700, color: sev.color,
                              textTransform: 'uppercase', letterSpacing: '0.10em',
                              fontFamily: "'Inter',sans-serif",
                            }}>
                              {sev.label} Priority
                            </span>
                            {action.relatedKpi && (
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                {getKpiLabel(action.relatedKpi)}
                              </span>
                            )}
                          </div>

                          <div style={{ padding: '12px 14px', background: 'var(--bg-elevated)',
                                         display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <ActionField label="Problem" text={action.problem} />
                            <ActionField label="Cause" text={action.cause} />
                            <ActionField label="Recommended Action" text={action.recommendedAction} highlight />

                            {/* Expected Impact — hidden when null */}
                            {action.expectedImpact && (
                              <ActionField label="Expected Impact" text={action.expectedImpact.scenario} />
                            )}

                            {/* Evidence bullets */}
                            {action.evidence.length > 0 && (
                              <div>
                                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)',
                                               textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                                  Evidence
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                  {action.evidence.map((e, j) => <li key={j}>{e}</li>)}
                                </ul>
                              </div>
                            )}

                            {/* Related pharmacists — resolved via viewModel.identity (this
                                pharmacist) since PharmacistIntelligenceViewModel does not
                                carry the full branch roster; supervisorActions for a single
                                pharmacist's action center reference only this pharmacist. */}
                            {action.relatedPharmacists.length > 0 && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                Related: {action.relatedPharmacists.map((uid) =>
                                  uid === viewModel.identity.userId ? viewModel.identity.displayName : uid
                                ).join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )

            // ── Section: Evaluation / Metadata (self view) — bottom of
            // page, per requirement 3 "G. Evaluation / Metadata at
            // bottom". Same data as the manager view's Evaluation +
            // Metadata cards, just placed last. ──
            // ── G. Evaluation (self view) ──
            const sectionEvaluation = (
              <div>
                <SectionHeader title="Evaluation" />
                <SummaryCard title="Evaluation">
                  {viewModel.performanceSummary.officialRating ? (
                    <>
                      <CardRow label="Official Rating" value={viewModel.performanceSummary.officialRating.rating} />
                      <CardRow label="Final Score" value={`${viewModel.performanceSummary.officialRating.finalScore}%`} />
                    </>
                  ) : (
                    <EmptyState message="Your official evaluation result for this month is not yet available." />
                  )}
                </SummaryCard>
              </div>
            )

            // ── H. Metadata (self view) — business-friendly summary,
            // plus the softened ranking/contribution notes (no separate
            // "Ranking"/"Contribution" sections in self view; per
            // requirement 4, no "Deferred"/"Manager View Only"/"Not
            // calculated" wording anywhere). ──
            const sectionMetadata = (
              <div>
                <SectionHeader title="Metadata" />
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <SummaryCard title="This Report">
                    <CardRow label="Last Updated" value={new Date(viewModel.metadata.generatedAt).toLocaleString('en-US')} />
                    <CardRow label="KPI Entries" value={viewModel.metadata.dataAvailability.hasKpiEntries ? 'Recorded' : 'None yet'} />
                    <CardRow label="Targets" value={viewModel.metadata.dataAvailability.hasTargets ? 'Set' : 'Not set yet'} />
                  </SummaryCard>

                  <SummaryCard title="More to come">
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Branch ranking will appear here when ranking snapshots are available.
                      <br />
                      Branch contribution details are available in manager view.
                    </div>
                  </SummaryCard>
                </div>
              </div>
            )

            // ════════════════════════════════════════════════════
            // Compose final order by mode
            // ════════════════════════════════════════════════════
            if (mode === 'self') {
              // A. My Performance Snapshot
              // B. My Focus Today
              // C. KPI Performance Breakdown
              // D. Strengths & Improvement Areas
              // E. Accountability
              // F. Coaching
              // G. Evaluation
              // H. Metadata (includes business-friendly ranking/contribution notes)
              return (
                <>
                  {sectionPerformanceSnapshot}
                  {sectionFocusToday}
                  {sectionKpiBreakdown}
                  {sectionStrengths}
                  {sectionAccountability}
                  {sectionCoaching}
                  {sectionEvaluation}
                  {sectionMetadata}
                </>
              )
            }

            // Manager drilldown — unchanged order (Phase 5C-3/5C-4/5C-5)
            return (
              <>
                {sectionExecutiveSummary}
                {sectionKpiBreakdown}
                {sectionStrengths}
                {sectionRanking}
                {sectionContribution}
                {sectionAccountability}
                {sectionCoaching}
                {sectionActionCenter}
              </>
            )
          })()}
        </>
      )}
    </div>
  )
}
