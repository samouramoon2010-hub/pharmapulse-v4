// ============================================================
// BranchIntelligencePage — /branch/:branchId/intelligence
// Phase 5A — Context Bar, Executive Summary Band, KPI Intelligence.
//
// Sections 3-6 (Contribution Intelligence, Coaching Opportunities,
// Action Center, Pharmacist Drilldown) are placeholders pending
// Phase 5B. No new calculations — all values read directly from
// BranchIntelligenceViewModel (Phase 4A-4C) or from kpiStats/paceMap
// (same kpiAnalyticsEngine functions used by the Dashboard).
// ============================================================

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Calendar } from 'lucide-react'
import { format } from 'date-fns'

import { useBranchIntelligenceData } from './useBranchIntelligenceData'
import { useScopeProfile }            from '../../hooks/useScopeProfile'
import { isPharmacyAllowed }          from '../../services/scopeResolver'
import KpiCard from '../../components/kpi/KpiCard'
import { FocusKpiCommandCard } from '../../components/kpi/FocusKpiCommandCard'
import { enterpriseStatusColor } from '../../components/kpi/kpiVisualHelpers'
import { GRADE_COLORS, GRADE_BG } from '../../engine/executive'
import { getKpiMetaForKey } from '../../engine/kpiAnalyticsEngine'
import { getKpisForSurface, DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import { RISK_LEVEL_COLORS as RISK_LABELS } from '../../design/tokens'
import { formatNumber } from '../../utils/helpers'

const TREND_LABELS = {
  ACCELERATING:  { label: 'Accelerating', arrow: '↑↑' },
  IMPROVING:     { label: 'Improving',    arrow: '↑' },
  STABLE:        { label: 'Stable',       arrow: '→' },
  DECLINING:     { label: 'Declining',    arrow: '↓' },
  DETERIORATING: { label: 'Deteriorating',arrow: '↓↓' },
}

// Momentum is a separate enum from trend (pharmacist-level, not branch-level)
const MOMENTUM_LABELS = {
  accelerating:  { label: 'Accelerating', arrow: '↑↑', color: '#22c55e' },
  improving:     { label: 'Improving',    arrow: '↑',  color: '#22c55e' },
  stable:        { label: 'Steady',       arrow: '→',  color: 'var(--text-muted)' },
  cooling:       { label: 'Cooling',      arrow: '↓',  color: '#f59e0b' },
  needs_support: { label: 'Needs Support',arrow: '↓↓', color: '#ef4444' },
}

// Section 6 severity → existing 5-tier status colors (no new color system)
const SEVERITY_COLORS = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.28)',  label: 'Critical' },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.28)', label: 'High' },
  medium:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.28)', label: 'Medium' },
  low:      { color: '#00d2ad', bg: 'rgba(0,210,173,0.08)',  border: 'rgba(0,210,173,0.22)',  label: 'Low' },
}

// Top-3 rank badge colors — gold/silver/bronze-ish, within existing palette
const GRADE_COLORS_BY_RANK = { 1: '#f59e0b', 2: '#a1a1aa', 3: '#fb923c' }
const GRADE_BG_BY_RANK = { 1: 'rgba(245,158,11,0.10)', 2: 'rgba(161,161,170,0.10)', 3: 'rgba(251,146,60,0.10)' }

const RISK_LEVEL_LABELS = {
  none: 'None', low: 'Low', medium: 'Medium', high: 'High',
}

// Team Dependency Intelligence tier colors — mirrors SEVERITY_COLORS palette
const DEPENDENCY_TIER_COLORS = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.28)',  label: 'Critical' },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.28)', label: 'High' },
  moderate: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.28)', label: 'Moderate' },
  healthy:  { color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.22)',  label: 'Healthy' },
}

/** Small stat card — Section 1 (Executive Summary Band). */
function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: '10px', padding: '12px 14px', flex: '1 1 0', minWidth: '110px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)',
                     textTransform: 'uppercase', letterSpacing: '0.06em',
                     fontFamily: "'Inter',sans-serif", marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, lineHeight: 1.1,
                     fontVariantNumeric: 'tabular-nums', color: color ?? 'var(--text-primary)' }}>
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

/** Professional empty-state placeholder — used across Sections 3-6. */
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

/** Section header — consistent divider style used across Sections 2-6. */
function SectionHeader({ title }) {
  return (
    <div className="section-divider">
      <span className="section-divider-label">{title}</span>
      <div className="section-divider-line" />
    </div>
  )
}

/** Section 5 — single coaching opportunity card. Renders an empty
 *  state when `data` is null (no AI text — just a neutral message). */
function CoachingCard({ label, accentColor, data, renderBody }) {
  return (
    <div style={{
      borderRadius: '10px', padding: '10px 12px', background: 'var(--bg-elevated)',
      border: `1px solid ${data ? `${accentColor}35` : 'var(--border-subtle)'}`,
      display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '92px',
    }}>
      <div style={{
        fontSize: '9px', fontWeight: 700, color: data ? accentColor : 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Inter',sans-serif",
      }}>
        {label}
      </div>
      {data ? renderBody(data) : (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          No data available
        </div>
      )}
    </div>
  )
}
function CardName({ children }) {
  return (
    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                   overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {children}
    </div>
  )
}
function CardScore({ children, color }) {
  return (
    <div style={{ fontSize: '20px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color, lineHeight: 1.1 }}>
      {children}
    </div>
  )
}
function CardReason({ children }) {
  return (
    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
      {children}
    </div>
  )
}

/** Section 6 — one labeled field within an action card (Problem/Cause/Action/Impact). */
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

export default function BranchIntelligencePage() {
  const { branchId } = useParams()
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))

  const { viewModel, kpiStats, paceMap, loading, error, dependencyIntelligence } = useBranchIntelligenceData(branchId, month)

  // Section 4: KPI selector — defaults to focusKpi (Phase 5B requirement #3)
  const [selectedContributionKpi, setSelectedContributionKpi] = useState(null)
  useEffect(() => {
    if (viewModel?.kpiIntelligence?.focusKpi && selectedContributionKpi === null) {
      setSelectedContributionKpi(viewModel.kpiIntelligence.focusKpi)
    }
  }, [viewModel?.kpiIntelligence?.focusKpi, selectedContributionKpi])

  const activeContributionKpi = selectedContributionKpi ?? viewModel?.kpiIntelligence?.focusKpi ?? getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key)[0]

  const [dependencyExpanded, setDependencyExpanded] = useState(false)

  // KPI dependency cards — only moderate/high/critical, sorted by severity DESC
  const nonHealthyDeps = dependencyIntelligence
    ? dependencyIntelligence.kpiDependencies
        .filter((d) => d.dependencyTier !== 'healthy')
        .sort((a, b) => {
          const order = { critical: 0, high: 1, moderate: 2, healthy: 3 }
          return (order[a.dependencyTier] ?? 3) - (order[b.dependencyTier] ?? 3)
        })
    : []

  // ── Scope guard — Phase 2E ────────────────────────────────────
  // Verifies the current user has explicit permission for this branchId.
  // Called after all other hooks so React hook order is preserved.
  //   admin / general_manager → scope='all'    → always allowed.
  //   manager / branch_manager → scope='single' → own branch only.
  //   district_supervisor / regional_manager → scope='list' → assigned branches only.
  //   scope loading → show gate, never render branch data early.
  //   scope error / null → fail closed.
  const { scope, loading: scopeLoading, error: scopeError } = useScopeProfile()

  if (scopeLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Verifying access…
      </div>
    )
  }
  if (!scope || scopeError || !isPharmacyAllowed(scope, branchId ?? '')) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)',
                       border: '1px solid rgba(239,68,68,0.28)', color: '#ef4444', fontSize: '13px' }}>
          Access denied. You do not have permission to view this branch.
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Section 0: Context Bar ──────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
          <Link to="/executive" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', textDecoration: 'none' }}>
            <ChevronLeft style={{ width: 14, height: 14 }} />
            Executive BI
          </Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {viewModel?.branchSummary?.pharmacyName ?? branchId}
          </span>
        </div>

        {/* Month selector — UI only, no persistence/filtering logic (Phase 5A) */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          borderRadius: '8px', padding: '6px 12px', fontSize: '12px', color: 'var(--text-secondary)',
        }}>
          <Calendar style={{ width: 12, height: 12 }} />
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: '12px', fontFamily: 'inherit' }}
            aria-label="Select month"
          />
        </div>
      </div>

      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading branch intelligence…
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)',
                       border: '1px solid rgba(239,68,68,0.28)', color: '#ef4444', fontSize: '13px' }}>
          Failed to load branch data: {error.message ?? String(error)}
        </div>
      )}

      {!loading && !error && !viewModel && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          No KPI data found for this branch in {month}.
        </div>
      )}

      {!loading && !error && viewModel && (
        <>
          {/* ── Warnings banner ──────────────────────────────── */}
          {viewModel.warnings.length > 0 && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(245,158,11,0.06)',
                           border: '1px solid rgba(245,158,11,0.22)', fontSize: '11px', color: 'var(--text-secondary)' }}>
              {viewModel.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          {/* ── Section 1: Executive Summary Band ───────────────
              Branch Name / Code / Region + 5 cards: Health Score,
              Forecast, Risk, Branch Rank, Team Size.
              All values read directly from viewModel.branchSummary —
              no new calculations, no formatting-logic duplication.
          ──────────────────────────────────────────────────── */}
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {viewModel.branchSummary.pharmacyName}
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>
              Code: {viewModel.branchSummary.pharmacyCode} · {viewModel.branchSummary.region}
            </p>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {/* 1. Health Score */}
              <SummaryCard
                label="Health Score"
                value={`${viewModel.branchSummary.healthScore}%`}
                sub={`Grade ${viewModel.branchSummary.healthGrade}`}
                color={GRADE_COLORS[viewModel.branchSummary.healthGrade]}
              />

              {/* 2. Forecast */}
              <SummaryCard
                label="Forecast"
                value={viewModel.branchSummary.forecastPct != null ? `${viewModel.branchSummary.forecastPct}% EOM` : '—'}
                sub={
                  (() => {
                    const t = TREND_LABELS[viewModel.branchSummary.forecastTrend]
                    return t ? `${t.arrow} ${t.label}` : viewModel.branchSummary.forecastTrend
                  })()
                }
                color={viewModel.branchSummary.forecastPct != null
                  ? enterpriseStatusColor(viewModel.branchSummary.forecastPct, viewModel.branchSummary.healthScore)
                  : undefined}
              />

              {/* 3. Risk */}
              <SummaryCard
                label="Risk"
                value={RISK_LABELS[viewModel.branchSummary.riskLevel]?.label ?? viewModel.branchSummary.riskLevel}
                color={RISK_LABELS[viewModel.branchSummary.riskLevel]?.color}
              />

              {/* 4. Branch Rank */}
              <SummaryCard
                label="Branch Rank"
                value={viewModel.branchSummary.branchRank
                  ? `#${viewModel.branchSummary.branchRank.currentRank}/${viewModel.branchSummary.branchRank.cohortSize}`
                  : '—'}
                sub={
                  viewModel.branchSummary.branchRank?.rankMovement != null
                    ? (viewModel.branchSummary.branchRank.rankMovement > 0
                        ? `▼ -${viewModel.branchSummary.branchRank.rankMovement}`
                        : viewModel.branchSummary.branchRank.rankMovement < 0
                          ? `▲ +${Math.abs(viewModel.branchSummary.branchRank.rankMovement)}`
                          : '— steady')
                    : (viewModel.branchSummary.branchRank ? null : 'Not yet calculated')
                }
              />

              {/* 5. Team Size */}
              <SummaryCard
                label="Team Size"
                value={viewModel.branchSummary.teamSize}
                sub="active"
              />
            </div>
          </div>

          {/* ── Section 2: KPI Intelligence — UI3 migration ───────
              Focus KPI Command Card (unchanged, shared with Dashboard)
              + KPI Cards row using the official KpiCard template
              (kpi-card-blueprint.md), matching the same migration the
              Dashboard already went through (UI3.2-C). Same kpiStats/
              paceMap data — no new calculation, only a denser
              presentation component in place of the legacy KpiTile.
          ──────────────────────────────────────────────────── */}
          <div>
            <div className="section-divider">
              <span className="section-divider-label">KPI Intelligence — {format(new Date(`${month}-01`), 'MMM yyyy')}</span>
              <div className="section-divider-line" />
            </div>

            {viewModel.kpiIntelligence.focusKpi && (
              <FocusKpiCommandCard
                kpiKey={viewModel.kpiIntelligence.focusKpi}
                stats={kpiStats[viewModel.kpiIntelligence.focusKpi]}
                pace={paceMap[viewModel.kpiIntelligence.focusKpi]}
                expectedPct={kpiStats[viewModel.kpiIntelligence.focusKpi]?.expectedPct ?? 0}
              />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginTop: '10px' }}>
              {getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).map((k) => {
                const cfg = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').find((c) => (c.aliasFor ?? c.key) === k)
                const s = kpiStats[k]
                return (
                  <KpiCard
                    key={k}
                    kpi={{ name: s?._label ?? k, color: s?._color, unit: cfg?.unit, type: cfg?.valueType }}
                    entry={{ value: s?.actual ?? null, target: s?.target ?? 0, achievement: s?.achievementPct ?? null }}
                  />
                )
              })}
            </div>
          </div>

          {/* ── Section 3: Team Dependency Intelligence ──────────
              Branch Stability Card (overall tier + summary text)
              + expandable per-KPI dependency cards.
              Shows only moderate/high/critical KPIs — healthy KPIs
              are suppressed (no noise). If all KPIs are healthy the
              stability card displays "No concentration risk".
              Zero new Firestore reads: data is derived from the
              already-computed viewModel.contributionByKpi.
          ──────────────────────────────────────────────────── */}
          {dependencyIntelligence && (() => {
            const tier = dependencyIntelligence.branchDependencyTier
            const tc   = DEPENDENCY_TIER_COLORS[tier] ?? DEPENDENCY_TIER_COLORS.healthy
            return (
              <div>
                <SectionHeader title="Team Dependency Intelligence" />

                {/* Branch Stability Card */}
                <div style={{
                  borderRadius: '10px', overflow: 'hidden',
                  border: `1px solid ${tc.border}`,
                  marginBottom: nonHealthyDeps.length > 0 ? '8px' : '0',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: tc.bg,
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Inter',sans-serif" }}>
                      Branch Stability
                    </span>
                    <span style={{
                      fontSize: '9px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px',
                      color: tc.color, border: `1px solid ${tc.border}`,
                      textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: "'Inter',sans-serif",
                    }}>
                      {tc.label}
                    </span>
                  </div>
                  <div style={{ padding: '12px 14px', background: 'var(--bg-elevated)' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {dependencyIntelligence.summaryText}
                    </div>
                    {/* Tier count pills */}
                    {(dependencyIntelligence.criticalKpiCount > 0 || dependencyIntelligence.highKpiCount > 0 || dependencyIntelligence.moderateKpiCount > 0) && (
                      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                        {dependencyIntelligence.criticalKpiCount > 0 && (
                          <span style={{ fontSize: '11px', color: DEPENDENCY_TIER_COLORS.critical.color, fontVariantNumeric: 'tabular-nums' }}>
                            {dependencyIntelligence.criticalKpiCount} Critical KPI{dependencyIntelligence.criticalKpiCount > 1 ? 's' : ''}
                          </span>
                        )}
                        {dependencyIntelligence.highKpiCount > 0 && (
                          <span style={{ fontSize: '11px', color: DEPENDENCY_TIER_COLORS.high.color, fontVariantNumeric: 'tabular-nums' }}>
                            {dependencyIntelligence.highKpiCount} High KPI{dependencyIntelligence.highKpiCount > 1 ? 's' : ''}
                          </span>
                        )}
                        {dependencyIntelligence.moderateKpiCount > 0 && (
                          <span style={{ fontSize: '11px', color: DEPENDENCY_TIER_COLORS.moderate.color, fontVariantNumeric: 'tabular-nums' }}>
                            {dependencyIntelligence.moderateKpiCount} Moderate KPI{dependencyIntelligence.moderateKpiCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expandable KPI Dependency Cards */}
                {nonHealthyDeps.length > 0 && (
                  <>
                    <button
                      onClick={() => setDependencyExpanded((prev) => !prev)}
                      aria-expanded={dependencyExpanded}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600,
                        padding: '4px 0', marginBottom: dependencyExpanded ? '8px' : '0',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ fontSize: '10px' }}>{dependencyExpanded ? '▲' : '▼'}</span>
                      {dependencyExpanded ? 'Hide' : 'Show'} KPI Breakdown ({nonHealthyDeps.length})
                    </button>

                    {dependencyExpanded && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {nonHealthyDeps.map((dep) => {
                          const dtc = DEPENDENCY_TIER_COLORS[dep.dependencyTier] ?? DEPENDENCY_TIER_COLORS.moderate
                          return (
                            <div key={dep.kpiKey} style={{
                              borderRadius: '10px', padding: '10px 12px',
                              background: 'var(--bg-elevated)', border: `1px solid ${dtc.border}`,
                            }}>
                              {/* KPI name + tier badge */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {getKpiMetaForKey(dep.kpiKey).en}
                                </span>
                                <span style={{
                                  fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px',
                                  color: dtc.color, border: `1px solid ${dtc.border}`,
                                  textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: "'Inter',sans-serif",
                                }}>
                                  {dtc.label}
                                </span>
                              </div>

                              {/* Top contributor */}
                              {dep.topContributorName && (
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                  Top contributor: {dep.topContributorName}
                                </div>
                              )}

                              {/* Contribution bar */}
                              <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-subtle)', overflow: 'hidden', marginBottom: '4px' }}>
                                <div style={{
                                  height: '100%', borderRadius: '3px',
                                  width: `${Math.min(dep.highestContributionPct, 100)}%`,
                                  background: dtc.color, transition: 'width 0.4s ease',
                                }} />
                              </div>

                              {/* Bar labels */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                <span>{dep.highestContributionPct}% of branch total</span>
                                <span>Team size: {dep.teamSize}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })()}

          {/* ── Section 4: Pharmacist Ranking ────────────────────
              Compact ranking list — viewModel.pharmacistRanking,
              sorted by performanceScore DESC (rank=1 first).
              At-risk members (per coachingOpportunities.mostAtRisk /
              weakKpiAttribution.weakestPharmacists) are subtly
              highlighted — no new computation, cross-referenced from
              existing viewModel fields.
          ──────────────────────────────────────────────────── */}
          <div>
            <SectionHeader title="Pharmacist Ranking" />
            {viewModel.pharmacistRanking.length === 0 ? (
              <EmptyState message="No pharmacist performance data available for this branch this month." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(() => {
                  const atRiskIds = new Set([
                    ...(viewModel.coachingOpportunities.mostAtRisk ? [viewModel.coachingOpportunities.mostAtRisk.userId] : []),
                    ...(viewModel.weakKpiAttribution?.weakestPharmacists.map((p) => p.userId) ?? []),
                  ])

                  return viewModel.pharmacistRanking.map((p) => {
                    const isTop3 = p.rank <= 3
                    const isAtRisk = atRiskIds.has(p.userId)
                    const momentum = MOMENTUM_LABELS[p.momentumDirection] ?? MOMENTUM_LABELS.stable

                    return (
                      <div
                        key={p.userId}
                        // Prepared for future pharmacist drilldown — no route yet (Phase 5B scope).
                        onClick={() => { /* TODO: navigate(`/pharmacist/${p.userId}/intelligence`) — Phase 5C+ */ }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '8px 12px', borderRadius: '8px',
                          background: isAtRisk ? 'rgba(239,68,68,0.04)' : 'var(--bg-elevated)',
                          border: `1px solid ${isAtRisk ? 'rgba(239,68,68,0.18)' : 'var(--border-subtle)'}`,
                          cursor: 'pointer',
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`${p.displayName}, rank ${p.rank}, score ${p.performanceScore}%, grade ${p.grade}`}
                      >
                        {/* Rank badge — #1/#2/#3 get visual hierarchy */}
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px', fontWeight: 700,
                          background: isTop3 ? GRADE_BG_BY_RANK[p.rank] : 'var(--bg-base)',
                          color: isTop3 ? GRADE_COLORS_BY_RANK[p.rank] : 'var(--text-muted)',
                          border: `1px solid ${isTop3 ? GRADE_COLORS_BY_RANK[p.rank] : 'var(--border-subtle)'}`,
                        }}>
                          {p.rank}
                        </div>

                        {/* Name */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                                         overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.displayName}
                          </div>
                          {isAtRisk && (
                            <div style={{ fontSize: '10px', color: '#ef4444', marginTop: '2px' }}>
                              At Risk
                            </div>
                          )}
                        </div>

                        {/* Momentum */}
                        <div style={{ fontSize: '11px', color: momentum.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {momentum.arrow} {momentum.label}
                          {p.momentumDelta !== 0 && (
                            <span style={{ marginLeft: '4px', fontVariantNumeric: 'tabular-nums' }}>
                              {p.momentumDelta > 0 ? '+' : ''}{p.momentumDelta}pts
                            </span>
                          )}
                        </div>

                        {/* Grade badge */}
                        <div style={{
                          fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                          background: GRADE_BG[p.grade] ?? 'var(--bg-base)',
                          color: GRADE_COLORS[p.grade] ?? 'var(--text-muted)',
                          border: `1px solid ${GRADE_COLORS[p.grade] ?? 'var(--border-subtle)'}`,
                          flexShrink: 0,
                        }}>
                          {p.grade}
                        </div>

                        {/* Performance Score */}
                        <div style={{
                          fontSize: '15px', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                          color: GRADE_COLORS[p.grade] ?? 'var(--text-primary)', minWidth: '48px', textAlign: 'right',
                          flexShrink: 0,
                        }}>
                          {p.performanceScore}%
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </div>

          {/* ── Section 4: Contribution Intelligence ─────────────
              KPI selector tabs + horizontal contribution bars for the
              selected KPI. Defaults to focusKpi. "Who contributed to
              this KPI result?" — top/lowest contributor highlighted.
          ──────────────────────────────────────────────────── */}
          <div>
            <SectionHeader title="Contribution Intelligence" />

            {/* KPI selector tabs/pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}
                 role="tablist" aria-label="Select KPI for contribution breakdown">
              {getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).map((k) => {
                const active = k === activeContributionKpi
                const isFocus = k === viewModel.kpiIntelligence.focusKpi
                return (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedContributionKpi(k)}
                    style={{
                      padding: '5px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      background: active ? 'var(--accent-bg, rgba(0,210,173,0.08))' : 'var(--bg-elevated)',
                      color: active ? 'var(--accent, #00d2ad)' : 'var(--text-secondary)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                    }}
                  >
                    {getKpiMetaForKey(k).en}
                    {isFocus && <span style={{ fontSize: '10px' }}>🔥</span>}
                  </button>
                )
              })}
            </div>

            {(() => {
              const breakdown = viewModel.contributionByKpi[activeContributionKpi] ?? []
              const branchTotalActual = breakdown.reduce((s, e) => s + e.actual, 0)

              if (breakdown.length === 0) {
                return <EmptyState message={`No contribution data available for ${getKpiMetaForKey(activeContributionKpi).en}.`} />
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    Branch {getKpiMetaForKey(activeContributionKpi).en}: {formatNumber(branchTotalActual)} total
                  </div>
                  {[...breakdown].sort((a, b) => a.contributionRank - b.contributionRank).map((entry) => {
                    const barColor = entry.isTopContributor ? '#22c55e'
                      : entry.isLowestContributor ? '#ef4444'
                      : 'var(--text-muted)'
                    return (
                      <div key={entry.pharmacistId} style={{
                        display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px',
                        borderRadius: '8px',
                        background: entry.isLowestContributor ? 'rgba(239,68,68,0.04)'
                          : entry.isTopContributor ? 'rgba(34,197,94,0.04)' : 'var(--bg-elevated)',
                        border: `1px solid ${entry.isLowestContributor ? 'rgba(239,68,68,0.18)'
                          : entry.isTopContributor ? 'rgba(34,197,94,0.18)' : 'var(--border-subtle)'}`,
                      }}>
                        {/* Rank */}
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', width: '20px', flexShrink: 0,
                                       fontVariantNumeric: 'tabular-nums' }}>
                          #{entry.contributionRank}
                        </div>

                        {/* Name + bar */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)',
                                           overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.pharmacistName}
                              {entry.isTopContributor && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#22c55e' }}>Top</span>}
                              {entry.isLowestContributor && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#ef4444' }}>Lowest</span>}
                            </span>
                            <span style={{ fontSize: '12px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: barColor, flexShrink: 0 }}>
                              {entry.achievementPct}%
                            </span>
                          </div>
                          {/* Horizontal contribution bar — achievementPct length */}
                          <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: '3px',
                              width: `${Math.min(Math.max(entry.achievementPct, 0), 100)}%`,
                              background: barColor, transition: 'width 0.4s ease',
                            }} />
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px',
                                         fontVariantNumeric: 'tabular-nums' }}>
                            {formatNumber(entry.actual)} actual · {entry.contributionPct}% of branch total
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* ── Section 5: Coaching Opportunities ─────────────────
              4 compact cards from viewModel.coachingOpportunities.
              No AI, no generated text beyond ViewModel data.
          ──────────────────────────────────────────────────── */}
          <div>
            <SectionHeader title="Coaching Opportunities" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px' }}
                 className="sm:grid-cols-4">
              {/* Top Performer */}
              <CoachingCard
                label="Top Performer"
                accentColor="#22c55e"
                data={viewModel.coachingOpportunities.topPerformer}
                renderBody={(d) => (
                  <>
                    <CardName>{d.displayName}</CardName>
                    <CardScore color="#22c55e">{d.performanceScore}%</CardScore>
                    <CardReason>Strongest in {getKpiMetaForKey(d.strongestKpi).en}</CardReason>
                  </>
                )}
              />
              {/* Most Improved */}
              <CoachingCard
                label="Most Improved"
                accentColor="#00d2ad"
                data={viewModel.coachingOpportunities.mostImproved}
                renderBody={(d) => (
                  <>
                    <CardName>{d.displayName}</CardName>
                    <CardScore color="#00d2ad">{d.momentumDelta > 0 ? '+' : ''}{d.momentumDelta}pts</CardScore>
                    <CardReason>Momentum this period</CardReason>
                  </>
                )}
              />
              {/* Most At Risk */}
              <CoachingCard
                label="Most At Risk"
                accentColor="#ef4444"
                data={viewModel.coachingOpportunities.mostAtRisk}
                renderBody={(d) => (
                  <>
                    <CardName>{d.displayName}</CardName>
                    <CardScore color="#ef4444">{RISK_LEVEL_LABELS[d.operationalRisk] ?? d.operationalRisk}</CardScore>
                    <CardReason>Operational risk level</CardReason>
                  </>
                )}
              />
              {/* Lowest Contributor */}
              <CoachingCard
                label="Lowest Contributor"
                accentColor="#f59e0b"
                data={viewModel.coachingOpportunities.lowestContributor}
                renderBody={(d) => (
                  <>
                    <CardName>{d.displayName}</CardName>
                    <CardScore color="#f59e0b">{d.achievementPct}%</CardScore>
                    <CardReason>{getKpiMetaForKey(d.kpiKey).en}</CardReason>
                  </>
                )}
              />
            </div>
          </div>

          {/* ── Section 6: Supervisor Action Center ───────────────
              viewModel.supervisorActions — Problem → Cause → Action →
              Impact decision-support cards, ordered by severity.
              The most important section: feels like a decision panel,
              not a report.
          ──────────────────────────────────────────────────── */}
          <div>
            <SectionHeader title="Supervisor Action Center" />
            {viewModel.supervisorActions.length === 0 ? (
              <EmptyState message="No supervisor actions to surface for this branch this month." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {viewModel.supervisorActions.map((action, i) => {
                  const sev = SEVERITY_COLORS[action.severity] ?? SEVERITY_COLORS.medium
                  return (
                    <div key={i} style={{
                      borderRadius: '10px', overflow: 'hidden',
                      border: `1px solid ${sev.border}`,
                    }}>
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
                            {getKpiMetaForKey(action.relatedKpi).en}
                          </span>
                        )}
                      </div>

                      <div style={{ padding: '12px 14px', background: 'var(--bg-elevated)',
                                     display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Problem */}
                        <ActionField label="Problem" text={action.problem} />
                        {/* Cause */}
                        <ActionField label="Cause" text={action.cause} />
                        {/* Recommended Action */}
                        <ActionField label="Recommended Action" text={action.recommendedAction} highlight />
                        {/* Expected Impact */}
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

                        {/* Related pharmacists */}
                        {action.relatedPharmacists.length > 0 && (
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            Related: {action.relatedPharmacists.map((uid) => {
                              const p = viewModel.pharmacistRanking.find((r) => r.userId === uid)
                              return p?.displayName ?? uid
                            }).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
