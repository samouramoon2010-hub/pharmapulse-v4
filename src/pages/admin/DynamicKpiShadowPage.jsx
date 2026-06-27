// ============================================================
// Dynamic KPI Shadow Visibility — Controlled Cutover Phase 1
//
// Admin-only diagnostics surface. Shows shadow/parity status of
// the Dynamic KPI Foundation (dynamicKpiFoundation.ts) without
// activating any dynamic-only behaviour anywhere else in the app.
//
// IMPORTANT — this page does not feed any value back into
// production. It is read-only: it subscribes to the live KPI
// registry plus a recent KPI entry/target pair (already-existing
// real-time subscriptions, no new Firestore queries or contracts),
// and runs the existing shadow/parity utilities purely for display.
//
// Legacy KPI readers remain authoritative everywhere else in the
// platform. Dynamic readers here run in shadow mode only.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import { FlaskConical, ShieldCheck, AlertTriangle, XCircle, CheckCircle2, Info } from 'lucide-react'

import { subscribeKpiRegistry } from '../../services/kpiRegistryService'
import { subscribeRecentKpiEntries, subscribeRecentTargets } from '../../services/kpiService'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import { getDayProgress } from '../../engine/kpiAnalyticsEngine'
import {
  buildShadowKpiReport,
  validateNamedKpiParity,
  buildDisplayProfiles,
  isSafeToExposeDynamically,
  getDeferredEvaluationEngineSites,
  PARITY_VALIDATION_TARGETS,
} from '../../engine/kpiRegistry/dynamicKpiFoundation'
import {
  buildPilotPolicy,
  countDynamicSourcesUsed,
  countLegacyFallbacksUsed,
} from '../../engine/kpiRegistry/dynamicReaderPilot'
import {
  getDeprecationReadinessMetrics,
  CORE_KPI_CONSUMER_CLASSIFICATION,
} from '../../engine/kpiRegistry/coreKpiDeprecationPrep'
import {
  getCoreKpiRetirementStatus,
  ALL_PROTECTED_EXCEPTIONS,
  FINAL_ASSUMPTION_SWEEP_RESULT,
} from '../../engine/kpiRegistry/coreKpiRetirement'

// ── Style helpers (matches RankingsPage / admin diagnostics convention) ──

const card = {
  background: 'var(--bg-card)', border: '1px solid var(--border-default)',
  borderRadius: '10px', padding: '20px 24px', marginBottom: '20px',
}
const sectionTitle = {
  fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
  marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px',
}
const metaLabel = {
  fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.07em',
}

const STATUS_STYLE = {
  PASS:    { color: '#22c55e', bg: '#22c55e1a', icon: CheckCircle2, label: 'PASS' },
  WARN:    { color: '#f59e0b', bg: '#f59e0b1a', icon: AlertTriangle, label: 'WARN' },
  BLOCKED: { color: '#ef4444', bg: '#ef44441a', icon: XCircle,       label: 'BLOCKED' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_STYLE[status] ?? STATUS_STYLE.BLOCKED
  const Icon = cfg.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}33`,
    }}>
      <Icon size={13} />{cfg.label}
    </span>
  )
}

function monthOf(dateStr) {
  return typeof dateStr === 'string' ? dateStr.slice(0, 7) : undefined
}

// ── Page ──────────────────────────────────────────────────────

export default function DynamicKpiShadowPage() {
  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)
  const [recentEntries, setRecentEntries] = useState([])
  const [recentTargets, setRecentTargets] = useState([])

  useEffect(() => {
    return subscribeKpiRegistry(
      (reg) => setLiveRegistry(reg),
      () => setLiveRegistry(DEFAULT_KPI_REGISTRY),
    )
  }, [])

  useEffect(() => {
    return subscribeRecentKpiEntries((entries) => setRecentEntries(entries), 30)
  }, [])

  useEffect(() => {
    return subscribeRecentTargets((targets) => setRecentTargets(targets), 2)
  }, [])

  // ── Find a real, already-loaded entry + matching target pair.
  // No fake data is ever constructed — if no matching pair exists,
  // liveSample stays null and the page shows an explicit empty state.
  const liveSample = useMemo(() => {
    for (const entry of recentEntries) {
      const month = monthOf(entry.date)
      const target = recentTargets.find(
        (t) => t.pharmacyId === entry.pharmacyId && t.month === month,
      )
      if (target) return { entry, target }
    }
    return null
  }, [recentEntries, recentTargets])

  const shadowReport = useMemo(() => {
    if (!liveSample) return null
    const dp = getDayProgress(new Date(liveSample.entry.date))
    return buildShadowKpiReport(liveSample.entry, liveSample.target, dp, liveRegistry)
  }, [liveSample, liveRegistry])

  const parityResults = useMemo(() => {
    if (!liveSample) return null
    return validateNamedKpiParity(liveSample.entry, liveSample.target, liveRegistry)
  }, [liveSample, liveRegistry])

  const displayProfiles = useMemo(() => buildDisplayProfiles(liveRegistry), [liveRegistry])

  const deferredSites = useMemo(() => getDeferredEvaluationEngineSites(), [])

  // Final Core KPI Deprecation Preparation Bundle — Part D readiness
  // metrics. Pure, derived entirely from the classification/audit data
  // already documented in coreKpiDeprecationPrep.ts. No live data needed.
  const deprecationMetrics = useMemo(() => getDeprecationReadinessMetrics(), [])

  // Core KPI Retirement Bundle — Part E readiness status. Pure, derived
  // entirely from the structured declarations in coreKpiRetirement.ts.
  // No live data needed.
  const retirementStatus = useMemo(() => getCoreKpiRetirementStatus(), [])

  // ── Controlled Cutover Phase 2 — Production Reader Pilot metrics ──
  // Reuses the SAME live entry/target sample above (no new data fetch).
  // This mirrors exactly what DashboardPage.jsx computes for itself —
  // shown here purely for internal/admin visibility, never to end users.
  const pilotPolicy = useMemo(
    () => buildPilotPolicy(liveSample?.entry ?? null, liveSample?.target ?? null, liveRegistry, 'dashboard'),
    [liveSample, liveRegistry],
  )

  // Regional Intelligence shares the exact same parity outcome as Dashboard
  // for a given sample, since parity is a structural property of the live
  // registry's field mapping, not a per-surface property. Labeled
  // separately purely for clarity in this diagnostics table.
  const regionalPilotPolicy = useMemo(
    () => buildPilotPolicy(liveSample?.entry ?? null, liveSample?.target ?? null, liveRegistry, 'regionalIntelligence'),
    [liveSample, liveRegistry],
  )

  // ── Overall shadow status ──────────────────────────────────────
  const overallStatus = useMemo(() => {
    if (!shadowReport || !parityResults) return null
    const coreKeys = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
    const coreBroken = shadowReport.readings.some(
      (r) => coreKeys.includes(r.key) && (!r.parity.actualMatches || !r.parity.targetMatches),
    )
    if (coreBroken) return 'BLOCKED'
    if (!shadowReport.allParityMatched || !parityResults.every((r) => r.match)) return 'WARN'
    return 'PASS'
  }, [shadowReport, parityResults])

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 20px' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <FlaskConical size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Dynamic KPI Shadow Visibility
          </h1>
          <span style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '0.07em', padding: '2px 8px',
            borderRadius: '4px', background: '#3b82f622', color: '#3b82f6', textTransform: 'uppercase',
          }}>Controlled Cutover · Phase 1</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Internal diagnostics only. Admin-only visibility into Dynamic KPI Foundation readiness.
        </p>
        {/* PR-1E4 — developer/admin-only diagnostics classification: this
            page stays out of normal navigation (gated by Sidebar.jsx's
            devOnly filter, per PR-1C); the dense comparison tables below
            are best read on a larger screen, so this is a labeled
            desktop-preferred workflow rather than a card redesign. The
            table wrappers were fixed from overflow:hidden (silently
            clipped content) to overflow:auto (scrollable) as a real,
            disclosed mobile-safety fix. */}
        <p className="sm:hidden" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          أفضل تجربة على شاشة أكبر — الجداول التفصيلية تتمرر أفقياً عند الحاجة.
        </p>
      </div>

      {/* ── Governance banner ── */}
      <div style={{
        display: 'flex', gap: '12px', padding: '14px 18px', marginBottom: '20px',
        background: '#3b82f611', border: '1px solid #3b82f633', borderRadius: '10px',
      }}>
        <ShieldCheck size={16} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '1px' }} />
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <strong style={{ color: '#3b82f6' }}>Legacy KPI readers remain authoritative.</strong> Dynamic
          readers are running in shadow mode only — they compute values in parallel for comparison and
          never overwrite or feed into production scoring, ranking, or Executive BI.
          <br />
          <strong style={{ color: '#3b82f6' }}>No production cutover is active.</strong> Nothing on this
          page changes Dashboard, Executive Dashboard, Regional Intelligence, Rankings, or Evaluation
          results.
        </div>
      </div>

      {/* ── Overall shadow parity status ── */}
      <div style={card}>
        <div style={sectionTitle}><ShieldCheck size={14} />Shadow Parity Status</div>
        {overallStatus ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <StatusBadge status={overallStatus} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Based on the most recent live KPI entry / target pair found
              ({liveSample.entry.pharmacyId} · {monthOf(liveSample.entry.date)}).
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
            <Info size={14} />
            No live parity sample selected — no matching KPI entry / target pair was found in the
            recent data window. This is expected if no entries or targets exist yet; no sample data
            is fabricated to fill this state.
          </div>
        )}
      </div>

      {/* ── Controlled Cutover — Multi-Surface Production Reader Pilot metrics ── */}
      {[pilotPolicy, regionalPilotPolicy].map((policy) => (
        <div style={card} key={policy.surface}>
          <div style={sectionTitle}><FlaskConical size={14} />Pilot Metrics — {policy.surface} Surface</div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 0, marginBottom: '12px' }}>
            Internal diagnostics only — pilot surface: <strong>{policy.surface}</strong>. Shows which
            reader is currently the source for each pilot KPI on this surface, computed from the same
            read-only sample above. Branch Intelligence is not shown here — its KPI values originate
            inside the protected Team Intelligence Engine and are not yet piloted.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <div style={{ padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px', border: '1px solid #22c55e33', minWidth: '140px' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>{countDynamicSourcesUsed(policy)}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Dynamic Source Used</div>
            </div>
            <div style={{ padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px', border: '1px solid var(--border-subtle)', minWidth: '140px' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{countLegacyFallbacksUsed(policy)}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Legacy Fallback Used</div>
            </div>
          </div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  {['KPI (engine key)', 'Source', 'Parity', 'Reason'].map((h) => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)',
                      fontWeight: 500, fontSize: '11px', borderBottom: '1px solid var(--border-subtle)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {policy.sources.map((s, i) => (
                  <tr key={s.businessKey} style={{ borderBottom: i < policy.sources.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{s.businessKey} <span style={{ color: 'var(--text-muted)' }}>({s.engineKey})</span></td>
                    <td style={{ padding: '8px 12px', color: s.source === 'dynamic' ? '#22c55e' : 'var(--text-muted)', fontWeight: 600 }}>
                      {s.source === 'dynamic' ? 'Dynamic' : 'Legacy'}
                    </td>
                    <td style={{ padding: '8px 12px' }}><StatusBadge status={s.parity === 'PASS' ? 'PASS' : s.parity === 'BLOCKED' ? 'BLOCKED' : 'WARN'} /></td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '11px' }}>{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* ── Core KPI parity summary ── */}
      {shadowReport && (
        <div style={card}>
          <div style={sectionTitle}><CheckCircle2 size={14} />Core KPI Parity Summary</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {shadowReport.readings.map((r) => {
              const ok = r.parity.actualMatches && r.parity.targetMatches && r.parity.achievementMatches
              return (
                <div key={r.key} style={{
                  padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px',
                  border: `1px solid ${ok ? '#22c55e33' : '#ef444433'}`, minWidth: '120px',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: ok ? '#22c55e' : '#ef4444' }}>
                    {ok ? 'Match' : 'Mismatch'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{r.key}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Dynamic KPI exposure readiness ── */}
      {parityResults && (
        <div style={card}>
          <div style={sectionTitle}><FlaskConical size={14} />Dynamic KPI Exposure Readiness</div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  {['KPI', 'Registry Key', 'Parity', 'Safe To Expose (future cutover)'].map((h) => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)',
                      fontWeight: 500, fontSize: '11px', borderBottom: '1px solid var(--border-subtle)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parityResults.map((r, i) => {
                  const ready = isSafeToExposeDynamically(parityResults, r.key)
                  return (
                    <tr key={r.key} style={{ borderBottom: i < parityResults.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                      <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{r.label}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}><code>{r.key}</code></td>
                      <td style={{ padding: '8px 12px', color: r.match ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                        {r.match ? 'Match' : 'Mismatch'}
                      </td>
                      <td style={{ padding: '8px 12px', color: ready ? '#22c55e' : 'var(--text-muted)' }}>
                        {ready ? 'Ready (not activated)' : 'Not ready'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
            "Ready" means the legacy and dynamic read paths agree — it does not enable, expose, or
            activate anything. Exposure remains a manual, future, separately approved decision.
          </div>
        </div>
      )}

      {/* ── Registry-derived display profile summary ── */}
      <div style={card}>
        <div style={sectionTitle}><Info size={14} />Registry-Derived Display Profile Summary</div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)' }}>
                {['KPI', 'Category', 'Core', 'Ranking Visible', 'Dashboard', 'Team', 'Executive', 'Regional'].map((h) => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)',
                    fontWeight: 500, fontSize: '11px', borderBottom: '1px solid var(--border-subtle)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayProfiles.map((p, i) => (
                <tr key={p.key} style={{ borderBottom: i < displayProfiles.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: 500 }}>{p.label}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{p.category}</td>
                  <td style={{ padding: '8px 12px', color: p.isCore ? '#22c55e' : 'var(--text-muted)' }}>{p.isCore ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '8px 12px', color: p.rankingVisible ? '#22c55e' : 'var(--text-muted)' }}>{p.rankingVisible ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{p.visibility.dashboardEnabled ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{p.visibility.teamEnabled ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{p.visibility.executiveEnabled ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{p.visibility.regionalEnabled ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Core KPI Deprecation Readiness (Final Deprecation Prep Bundle) ── */}
      <div style={card}>
        <div style={sectionTitle}><ShieldCheck size={14} />Core KPI Deprecation Readiness</div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 0, marginBottom: '12px' }}>
          Internal diagnostics only. Core KPI are no longer the future architecture — they remain only
          as compatibility artifacts for the protected engines below. These counts reflect documentation
          and classification only; nothing here changes behavior or removes anything.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
          <div style={{ padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px', border: '1px solid #22c55e33', minWidth: '150px' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>{deprecationMetrics.registryDrivenSurfacesCount}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Registry-Driven Surfaces</div>
          </div>
          <div style={{ padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px', border: '1px solid var(--border-subtle)', minWidth: '150px' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{deprecationMetrics.compatibilityOnlySurfacesCount}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Compatibility-Only Surfaces</div>
          </div>
          <div style={{ padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px', border: '1px solid #ef444433', minWidth: '150px' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>{deprecationMetrics.protectedEngineDependenciesCount}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Protected-Engine Dependencies</div>
          </div>
          <div style={{ padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px', border: '1px solid var(--border-subtle)', minWidth: '150px' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {deprecationMetrics.dynamicPilotCoverage.pilotedSurfaces.length}/{deprecationMetrics.dynamicPilotCoverage.pilotedSurfaces.length + deprecationMetrics.dynamicPilotCoverage.deferredSurfaces.length}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Dynamic Pilot Coverage (surfaces)</div>
          </div>
        </div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)' }}>
                {['Engine / Surface', 'Classification', 'Current Dependency', 'Note'].map((h) => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)',
                    fontWeight: 500, fontSize: '11px', borderBottom: '1px solid var(--border-subtle)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CORE_KPI_CONSUMER_CLASSIFICATION.map((c, i) => (
                <tr key={c.engine} style={{ borderBottom: i < CORE_KPI_CONSUMER_CLASSIFICATION.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{c.engine}</td>
                  <td style={{
                    padding: '8px 12px', fontWeight: 600,
                    color: c.classification === 'REGISTRY_DRIVEN' ? '#22c55e' : c.classification === 'BLOCKED_BY_PROTECTED_ENGINE' ? '#ef4444' : 'var(--text-muted)',
                  }}>{c.classification}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '11px' }}>{c.currentDependency}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '11px' }}>{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
          Remaining blockers before real Core KPI retirement: {deprecationMetrics.remainingBlockers.join(', ') || 'none'}.
        </div>
      </div>

      {/* ── Core KPI Retirement Bundle ── */}
      <div style={card}>
        <div style={sectionTitle}><ShieldCheck size={14} />Core KPI Retirement Status</div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 0, marginBottom: '12px' }}>
          The Registry is now declared the architectural source of truth for every active production
          KPI surface. Core KPI remain permanently as a Compatibility Layer — nothing here removes the
          frozen Core key list, any Core KPI field, or touches the Evaluation Engine.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
          <div style={{ padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px', border: `1px solid ${retirementStatus.registryAuthoritative ? '#22c55e33' : '#ef444433'}`, minWidth: '170px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: retirementStatus.registryAuthoritative ? '#22c55e' : '#ef4444' }}>
              {retirementStatus.registryAuthoritative ? 'YES' : 'NO'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Registry Authoritative</div>
          </div>
          <div style={{ padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px', border: '1px solid var(--border-subtle)', minWidth: '170px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{retirementStatus.coreKpiStatus.replace('_', ' ')}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Core KPI Status</div>
          </div>
          <div style={{ padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px', border: '1px solid #f59e0b33', minWidth: '170px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#f59e0b' }}>{retirementStatus.evaluationEngineException}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Evaluation Engine Exception</div>
          </div>
          <div style={{ padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px', border: `1px solid ${retirementStatus.dynamicPilotCoverageComplete ? '#22c55e33' : '#ef444433'}`, minWidth: '170px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: retirementStatus.dynamicPilotCoverageComplete ? '#22c55e' : '#ef4444' }}>
              {retirementStatus.dynamicPilotCoverageComplete ? 'Complete' : 'Incomplete'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Dynamic Pilot Coverage</div>
          </div>
          <div style={{ padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px', border: '1px solid #22c55e33', minWidth: '220px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#22c55e' }}>{retirementStatus.retirementStatus.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Core Retirement Status</div>
          </div>
        </div>

        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Protected / Out-of-Scope Exceptions ({ALL_PROTECTED_EXCEPTIONS.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
          {ALL_PROTECTED_EXCEPTIONS.map((ex) => (
            <div key={ex.consumer} style={{
              padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: '6px',
              border: '1px solid var(--border-subtle)', fontSize: '11px',
            }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '2px' }}>
                {ex.consumer} {ex.permanent ? '(permanent)' : '(out of scope, not protected)'}
              </div>
              <div style={{ color: 'var(--text-muted)' }}>{ex.reason}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Final Core Assumption Sweep
        </div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)' }}>
                {['Check', 'Result', 'Detail'].map((h) => (
                  <th key={h} style={{
                    padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)',
                    fontWeight: 500, fontSize: '11px', borderBottom: '1px solid var(--border-subtle)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FINAL_ASSUMPTION_SWEEP_RESULT.map((f, i) => (
                <tr key={f.check} style={{ borderBottom: i < FINAL_ASSUMPTION_SWEEP_RESULT.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{f.check}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: f.result === 'CLEAN' ? '#22c55e' : '#f59e0b' }}>{f.result}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '11px' }}>{f.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Deferred cutover blockers ── */}
      <div style={card}>
        <div style={sectionTitle}><XCircle size={14} style={{ color: '#ef4444' }} />Deferred Cutover Blockers</div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 0, marginBottom: '12px' }}>
          These call sites feed scoring, ranking, or Executive BI directly. They are intentionally left
          untouched — migrating them would change Evaluation Engine behaviour, which requires a
          separately approved bundle with its own GO/NO-GO review.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {deferredSites.map((site) => (
            <div key={site.file} style={{
              padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: '6px',
              border: '1px solid var(--border-subtle)', fontSize: '11px',
            }}>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '2px' }}>{site.file}</div>
              <div style={{ color: 'var(--text-muted)' }}>{site.note}</div>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>
        Parity targets tracked: {Object.keys(PARITY_VALIDATION_TARGETS).join(', ')}
      </p>
    </div>
  )
}
