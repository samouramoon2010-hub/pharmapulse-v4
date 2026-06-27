// ============================================================
// Admin Rankings Page — RF-1C (Validation & UX Hardening)
//
// Governance:
//   Branch ranking:     kpi_entries + targets → collective achievement
//   Pharmacist ranking: evaluation_results   → individual normalizedFinalScorePct
//   All snapshots:      isPreview: true
//   Score basis:        full monthly target (not pace-adjusted)
//   Pace-adjusted metrics remain on Dashboard / Daily Mission only
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import {
  Trophy, RefreshCw, AlertCircle, Loader2,
  TrendingUp, TrendingDown, Minus, Info, ShieldCheck,
  BarChart3, Users, Building2, ChevronDown, ChevronRight,
} from 'lucide-react'
import { useAuthStore }                   from '../../store/authStore'
// @ts-expect-error — pharmacyStore.js has no .d.ts (same pre-existing gap as its other .tsx importers)
import { usePharmacyStore }               from '../../store/pharmacyStore'
// @ts-expect-error — MobileRankCard.jsx has no .d.ts (same pattern as usePharmacyStore above)
import MobileRankCard                     from '../../components/ui/MobileRankCard'
import { subscribePublishedProfiles }     from '../../services/evaluationRegistryService'
import { generateAndPersistAllRankings }  from '../../ranking/ranking-service'
import { subscribeRankingSnapshots }      from '../../ranking/repository'
import { GOVERNANCE_VERSION, RANKING_RULE_VERSION } from '../../ranking/constants'
import type { EvaluationProfile }         from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import type { StoredRankingSnapshot }     from '../../ranking/repository'
import type { CombinedRankingReport }     from '../../ranking/ranking-service'

// ── Style helpers ─────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border-default)',
  borderRadius: '10px', padding: '20px 24px', marginBottom: '20px',
}
const sectionTitle: React.CSSProperties = {
  fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
  marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px',
}
const sel: React.CSSProperties = {
  height: '34px', fontSize: '13px', padding: '0 10px',
  border: '1px solid var(--border-default)', borderRadius: '7px',
  background: 'var(--bg-input)', color: 'var(--text-primary)',
}
const metaLabel: React.CSSProperties = {
  fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)',
  textTransform: 'uppercase' as const, letterSpacing: '0.07em',
}
const metaValue: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px',
}
const rankBadge = (rank: number): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '28px', height: '28px', borderRadius: '50%', fontSize: '12px',
  fontWeight: 700, flexShrink: 0,
  background: rank === 1 ? '#f59e0b33' : rank === 2 ? '#6b728033' : rank === 3 ? '#cd7c2633' : 'var(--bg-surface)',
  color: rank === 1 ? '#f59e0b' : rank === 2 ? '#9ca3af' : rank === 3 ? '#cd7c26' : 'var(--text-muted)',
  border: rank <= 3 ? '1px solid currentColor' : '1px solid var(--border-subtle)',
})

// ── Helpers ───────────────────────────────────────────────────

function currentMonthId(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Display-only humanizer for a branch classification id (e.g. 'hub' →
// 'Hub'). The cohort grouping above already title-cases the same value
// for section labels; this keeps the per-row "Classification" cell
// consistent rather than showing the raw lowercase string.
function classificationLabel(id?: string): string {
  if (!id) return '—'
  return id.charAt(0).toUpperCase() + id.slice(1)
}

function MovementBadge({ mv, dir }: { mv?: number; dir?: string }) {
  const direction = dir ?? (mv === undefined ? undefined : mv < 0 ? 'up' : mv > 0 ? 'down' : 'unchanged')
  if (direction === 'new') return <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 600 }}>NEW</span>
  if (direction === 'up')  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#22c55e', fontSize: '11px' }}>
      <TrendingUp size={12} />{mv !== undefined ? Math.abs(mv) : ''}
    </span>
  )
  if (direction === 'down') return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#ef4444', fontSize: '11px' }}>
      <TrendingDown size={12} />{mv !== undefined ? Math.abs(mv) : ''}
    </span>
  )
  if (direction === 'unchanged') return <Minus size={12} style={{ color: 'var(--text-muted)' }} />
  return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
}

// ── Branch cohort table ───────────────────────────────────────

function BranchCohortTable({ label, snapshots }: { label: string; snapshots: StoredRankingSnapshot[] }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
        {label} · {snapshots.length} branches
      </div>
      {/* PR-1E3 — phone-width card list, same `snapshots` data/order as
          the table below. No re-sort, no re-filter: identical rows. */}
      <div className="sm:hidden space-y-2">
        {snapshots.map((s) => {
          const branchAch  = (s as any).branchAchievementPct as number | undefined
          const pharmCount = (s as any).pharmacistCount      as number | undefined
          const movDir     = (s as any).movementDirection    as string | undefined
          return (
            <MobileRankCard
              key={s.snapshotId}
              rank={s.currentRank}
              title={s.entityName ?? 'Unknown'}
              subtitle={classificationLabel(s.classificationId)}
              primaryMetric={{ label: 'Score', value: `${s.cappedScore.toFixed(1)}%`, color: s.cappedScore >= 85 ? '#22c55e' : s.cappedScore >= 70 ? '#f59e0b' : 'var(--text-primary)' }}
              secondaryMetrics={[
                { label: 'Achievement', value: branchAch !== undefined ? `${branchAch.toFixed(1)}%` : '—' },
                { label: 'Pharmacists', value: pharmCount ?? '—' },
                { label: 'Prev', value: s.previousRank ?? '—' },
              ]}
              movement={<MovementBadge mv={s.rankMovement} dir={movDir} />}
            />
          )
        })}
      </div>
      <div className="hidden sm:block" style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)' }}>
              {['Rank', 'Branch', 'Score', 'Achievement%', 'Pharmacists', 'Prev', 'Δ', 'Classification'].map((h) => (
                <th key={h} style={{
                  padding: '8px 12px',
                  textAlign: ['Rank','Score','Achievement%','Pharmacists','Prev','Δ'].includes(h) ? 'center' : 'left',
                  color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px',
                  borderBottom: '1px solid var(--border-subtle)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s, i) => {
              const branchAch    = (s as any).branchAchievementPct as number | undefined
              const pharmCount   = (s as any).pharmacistCount      as number | undefined
              const movDir       = (s as any).movementDirection     as string | undefined
              return (
                <tr key={s.snapshotId} style={{ borderBottom: i < snapshots.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <span style={rankBadge(s.currentRank)}>{s.currentRank}</span>
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {s.entityName ?? 'Unknown'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600,
                    color: s.cappedScore >= 85 ? '#22c55e' : s.cappedScore >= 70 ? '#f59e0b' : 'var(--text-primary)' }}>
                    {s.cappedScore.toFixed(1)}%
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {branchAch !== undefined ? `${branchAch.toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {pharmCount ?? '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {s.previousRank ?? '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <MovementBadge mv={s.rankMovement} dir={movDir} />
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    {classificationLabel(s.classificationId)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Pharmacist cohort table ───────────────────────────────────

function PharmacistCohortTable({ snapshots, pharmacyNameById }: { snapshots: StoredRankingSnapshot[]; pharmacyNameById: Map<string, string> }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      {/* PR-1E3 — phone-width card list, same `snapshots` data/order as
          the table below. No re-sort, no re-filter: identical rows. */}
      <div className="sm:hidden space-y-2">
        {snapshots.map((s) => {
          const ach     = (s as any).achievementPct    as number | undefined
          const kpis    = (s as any).kpisAbove100Count as number | undefined
          const pharmId = (s as any).pharmacyId        as string | undefined
          const movDir  = (s as any).movementDirection as string | undefined
          return (
            <MobileRankCard
              key={s.snapshotId}
              rank={s.currentRank}
              title={s.entityName ?? 'Unknown'}
              subtitle={pharmId !== undefined ? (pharmacyNameById.get(pharmId) ?? '—') : '—'}
              primaryMetric={{ label: 'Score', value: `${s.cappedScore.toFixed(1)}%`, color: s.cappedScore >= 85 ? '#22c55e' : s.cappedScore >= 70 ? '#f59e0b' : 'var(--text-primary)' }}
              secondaryMetrics={[
                { label: 'Achievement', value: ach !== undefined ? `${ach.toFixed(1)}%` : '—' },
                { label: 'KPIs≥100', value: kpis ?? '—' },
                { label: 'Prev', value: s.previousRank ?? '—' },
              ]}
              movement={<MovementBadge mv={s.rankMovement} dir={movDir} />}
            />
          )
        })}
      </div>
      <div className="hidden sm:block" style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)' }}>
              {['Rank', 'Pharmacist', 'Branch', 'Score', 'Achievement%', 'KPIs≥100', 'Prev', 'Δ'].map((h) => (
                <th key={h} style={{
                  padding: '8px 12px',
                  textAlign: ['Rank','Score','Achievement%','KPIs≥100','Prev','Δ'].includes(h) ? 'center' : 'left',
                  color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px',
                  borderBottom: '1px solid var(--border-subtle)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s, i) => {
              const ach      = (s as any).achievementPct   as number | undefined
              const kpis     = (s as any).kpisAbove100Count as number | undefined
              const pharmId  = (s as any).pharmacyId        as string | undefined
              const movDir   = (s as any).movementDirection  as string | undefined
              return (
                <tr key={s.snapshotId} style={{ borderBottom: i < snapshots.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <span style={rankBadge(s.currentRank)}>{s.currentRank}</span>
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {s.entityName ?? 'Unknown'}
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {pharmId !== undefined ? (pharmacyNameById.get(pharmId) ?? '—') : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600,
                    color: s.cappedScore >= 85 ? '#22c55e' : s.cappedScore >= 70 ? '#f59e0b' : 'var(--text-primary)' }}>
                    {s.cappedScore.toFixed(1)}%
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {ach !== undefined ? `${ach.toFixed(1)}%` : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {kpis ?? '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {s.previousRank ?? '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <MovementBadge mv={s.rankMovement} dir={movDir} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────

export default function RankingsPage() {
  const { userProfile } = useAuthStore()
  const { pharmacies, subscribe: subPharmacies } = usePharmacyStore()

  const [periodId,     setPeriodId]     = useState(currentMonthId())
  const [profiles,     setProfiles]     = useState<EvaluationProfile[]>([])
  const [selectedProf, setSelectedProf] = useState<EvaluationProfile | null>(null)
  const [activeTab,    setActiveTab]    = useState<'branch' | 'pharmacist'>('branch')
  const [generating,   setGenerating]   = useState(false)
  const [report,       setReport]       = useState<CombinedRankingReport | null>(null)
  const [branchSnaps,  setBranchSnaps]  = useState<StoredRankingSnapshot[]>([])
  const [pharmSnaps,   setPharmSnaps]   = useState<StoredRankingSnapshot[]>([])
  const [subLoading,   setSubLoading]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [showMeta,     setShowMeta]     = useState(false)

  useEffect(() => {
    return subscribePublishedProfiles((list) => {
      setProfiles(list)
      if (list.length > 0 && !selectedProf) setSelectedProf(list[0])
    })
  }, [])

  useEffect(() => subPharmacies(), [])

  // Canonical pharmacy-name resolver — replaces the old hardcoded
  // placeholder string. A pharmacyId with no match (e.g. a deleted
  // pharmacy) renders the same '—' used elsewhere on this page for
  // missing data, not a fabricated label.
  const pharmacyNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of pharmacies) m.set(p.id, p.name)
    return m
  }, [pharmacies])

  useEffect(() => {
    if (!selectedProf) return
    setSubLoading(true)
    setBranchSnaps([])
    const unsubBranch = subscribeRankingSnapshots(
      periodId, selectedProf.id, selectedProf.version, 'branch',
      (data) => { setBranchSnaps(data); setSubLoading(false) },
      (err)  => { setError(err.message); setSubLoading(false) },
    )
    const unsubPharm = subscribeRankingSnapshots(
      periodId, selectedProf.id, selectedProf.version, 'pharmacist',
      (data) => setPharmSnaps(data),
    )
    return () => { unsubBranch(); unsubPharm() }
  }, [periodId, selectedProf])

  const handleGenerate = async () => {
    if (!selectedProf || !periodId) return
    setGenerating(true)
    setError(null)
    setReport(null)
    try {
      const r = await generateAndPersistAllRankings({
        periodId,
        profileId:      selectedProf.id,
        profileVersion: selectedProf.version,
        generatedBy:    userProfile?.uid ?? 'admin',
        isPreview:      true,
      })
      setReport(r)
      setShowMeta(true)
      const err = r.branchReport.error ?? r.pharmacistReport.error
      if (err) setError(err)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const snapshots = activeTab === 'branch' ? branchSnaps : pharmSnaps

  const cohortMap = useMemo(() => {
    const m = new Map<string, StoredRankingSnapshot[]>()
    for (const s of snapshots) {
      const key = s.classificationId
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(s)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.currentRank - b.currentRank)
    return m
  }, [snapshots])

  const cohortOrder = ['hub', 'destination', 'provider', 'neighbourhood']
  const sortedCohortKeys = [
    ...cohortOrder.filter((k) => cohortMap.has(k)),
    ...[...cohortMap.keys()].filter((k) => !cohortOrder.includes(k)),
  ]

  // Diagnostics derived from report + snapshots
  const diagnostics = useMemo(() => {
    if (!report) return null
    const branchExcluded = report.branchReport.excluded ?? []
    const noTarget  = branchExcluded.filter((e: any) => /target/i.test(e.reason)).length
    const noEntries = branchExcluded.filter((e: any) => /entries/i.test(e.reason)).length
    return {
      branchesRanked:    report.branchReport.totalRanked,
      pharmacistsRanked: report.pharmacistReport.totalRanked,
      branchesExcluded:  report.branchReport.totalExcluded,
      pharmacistsExcluded: report.pharmacistReport.totalExcluded,
      noTarget, noEntries,
    }
  }, [report])

  // Most-recent snapshot metadata (from any snap in current view)
  const snapMeta = useMemo(() => {
    const all = [...branchSnaps, ...pharmSnaps]
    if (!all.length) return null
    const s = all[0] as any
    return {
      governanceVersion:  s.governanceVersion,
      rankingRuleVersion: s.rankingRuleVersion,
      generatedAt:        s.writtenAt?.seconds
        ? new Date(s.writtenAt.seconds * 1000).toLocaleString('en-US')
        : '—',
      isPreview: s.isPreview,
    }
  }, [branchSnaps, pharmSnaps])

  const activeReport = activeTab === 'branch' ? report?.branchReport : report?.pharmacistReport
  const activeExcluded = activeReport?.excluded ?? []

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 20px' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Trophy size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Rankings
          </h1>
          <span style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '0.07em', padding: '2px 8px',
            borderRadius: '4px', background: '#f59e0b22', color: '#f59e0b', textTransform: 'uppercase',
          }}>RF-1C · Preview Only</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Branch and pharmacist ranking preview. All snapshots are <code>isPreview: true</code>.
          Official rankings should be generated after month close.
        </p>
      </div>

      {/* ── Preview Governance Banner ── */}
      <div style={{
        display: 'flex', gap: '12px', padding: '14px 18px', marginBottom: '20px',
        background: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: '10px',
      }}>
        <ShieldCheck size={16} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '4px' }}>
            Preview Ranking
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            This ranking compares current KPI achievement against <strong>full monthly targets</strong>.
            Official rankings should be generated after month close when all pharmacist entries are complete.
            Daily progress and on-track status should be monitored through <strong>Dashboard pace-adjusted metrics</strong>,
            not this page.
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={card}>
        <div style={sectionTitle}><RefreshCw size={14} />Generate Preview</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ ...metaLabel, display: 'block', marginBottom: '5px' }}>Period</label>
            <input type="month" value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              style={{ ...sel, width: '160px' }} />
          </div>
          <div>
            <label style={{ ...metaLabel, display: 'block', marginBottom: '5px' }}>Evaluation Profile</label>
            <select
              value={selectedProf?.id ?? ''}
              onChange={(e) => setSelectedProf(profiles.find((p) => p.id === e.target.value) ?? null)}
              style={{ ...sel, width: '260px' }}
            >
              {profiles.length === 0 && <option value="">No published profiles</option>}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name} v{p.version}</option>
              ))}
            </select>
          </div>
        </div>
        <button onClick={handleGenerate} disabled={generating} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '0 20px', height: '38px', borderRadius: '8px',
          fontSize: '13px', fontWeight: 600,
          cursor: generating ? 'not-allowed' : 'pointer',
          background: generating ? 'var(--bg-surface)' : 'var(--accent)',
          color: generating ? 'var(--text-muted)' : '#fff',
          border: generating ? '1px solid var(--border-default)' : 'none',
          width: '100%', maxWidth: '280px', justifyContent: 'center',
          transition: 'all 0.15s',
        }}>
          {generating
            ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Generating…</>
            : <><RefreshCw size={14} />Generate Preview</>
          }
        </button>
        {selectedProf && !generating && (
          <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
            Period: <strong>{periodId}</strong> · Profile: {selectedProf.name} v{selectedProf.version}
          </p>
        )}
        {!selectedProf && profiles.length > 0 && !generating && (
          <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
            Select a profile above to begin.
          </p>
        )}
        {profiles.length === 0 && (
          <p style={{ marginTop: '8px', fontSize: '11px', color: '#f59e0b' }}>
            ⚠ No published evaluation profiles found. Publish a profile first.
          </p>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          display: 'flex', gap: '10px', padding: '12px 16px', marginBottom: '16px',
          background: '#dc262222', border: '1px solid #dc262244', borderRadius: '8px',
        }}>
          <AlertCircle size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
          <div style={{ fontSize: '12px', color: '#ef4444' }}>{error}</div>
        </div>
      )}

      {/* ── Ranking metadata ── */}
      {(snapMeta || report) && (
        <div style={{ ...card, padding: '14px 20px' }}>
          <button onClick={() => setShowMeta(!showMeta)} style={{
            display: 'flex', alignItems: 'center', gap: '6px', background: 'none',
            border: 'none', cursor: 'pointer', fontSize: '12px',
            color: 'var(--text-muted)', padding: 0, marginBottom: showMeta ? '14px' : 0,
          }}>
            {showMeta ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Info size={13} />
            Ranking Metadata &amp; Governance
          </button>
          {showMeta && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
              {[
                { label: 'Period',              value: periodId },
                { label: 'Profile',             value: selectedProf ? `${selectedProf.name} v${selectedProf.version}` : '—' },
                { label: 'Governance Version',  value: `v${snapMeta?.governanceVersion ?? GOVERNANCE_VERSION}` },
                { label: 'Rule Version',        value: snapMeta?.rankingRuleVersion ?? RANKING_RULE_VERSION },
                { label: 'Generated At',        value: snapMeta?.generatedAt ?? (report ? new Date(report.generatedAt).toLocaleString('en-US') : '—') },
                { label: 'Preview Status',      value: 'isPreview: true — not official' },
                { label: 'Branch Score Basis',  value: 'Collective KPI achievement vs full monthly target' },
                { label: 'Pharmacist Basis',    value: 'normalizedFinalScorePct from evaluation ledger' },
              ].map(({ label, value }) => (
                <div key={label} style={{ minWidth: '180px' }}>
                  <div style={metaLabel}>{label}</div>
                  <div style={metaValue}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Diagnostics panel ── */}
      {diagnostics && (
        <div style={{ ...card, padding: '14px 20px' }}>
          <div style={{ ...sectionTitle, marginBottom: '12px' }}>
            <BarChart3 size={14} />Ranking Diagnostics
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {[
              { label: 'Branches Ranked',      value: diagnostics.branchesRanked,      color: '#22c55e' },
              { label: 'Pharmacists Ranked',   value: diagnostics.pharmacistsRanked,   color: '#22c55e' },
              { label: 'Branches Excluded',    value: diagnostics.branchesExcluded,    color: diagnostics.branchesExcluded    > 0 ? '#f59e0b' : undefined },
              { label: 'Pharmacists Excluded', value: diagnostics.pharmacistsExcluded, color: diagnostics.pharmacistsExcluded > 0 ? '#f59e0b' : undefined },
              { label: 'No Target',            value: diagnostics.noTarget,            color: diagnostics.noTarget  > 0 ? '#ef4444' : undefined },
              { label: 'No KPI Entries',       value: diagnostics.noEntries,           color: diagnostics.noEntries > 0 ? '#ef4444' : undefined },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px',
                border: `1px solid ${color ? color + '33' : 'var(--border-subtle)'}`,
                minWidth: '110px',
              }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
          {diagnostics.noTarget > 0 && (
            <div style={{ marginTop: '10px', fontSize: '11px', color: '#ef4444' }}>
              ⚠ {diagnostics.noTarget} branch(es) had no target document — they are excluded from ranking.
              Create branch targets in the Targets section to include them.
            </div>
          )}
          {diagnostics.noEntries > 0 && (
            <div style={{ marginTop: '6px', fontSize: '11px', color: '#ef4444' }}>
              ⚠ {diagnostics.noEntries} branch(es) had no KPI entries — they are excluded from ranking.
              Enter or import KPI data for these branches.
            </div>
          )}
        </div>
      )}

      {/* ── Generation report (branch + pharmacist counts) ── */}
      {report && (
        <div style={card}>
          <div style={sectionTitle}>Generation Report</div>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {/* Branch */}
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ ...metaLabel, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Building2 size={11} />Branches
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  { label: 'Input',    value: report.branchReport.totalInput },
                  { label: 'Ranked',   value: report.branchReport.totalRanked,   color: '#22c55e' },
                  { label: 'Excluded', value: report.branchReport.totalExcluded, color: '#f59e0b' },
                  { label: 'Cohorts',  value: report.branchReport.cohorts.length },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: '6px 12px', background: 'var(--bg-surface)',
                    borderRadius: '6px', border: `1px solid ${color ? color + '33' : 'var(--border-subtle)'}` }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{label}</div>
                  </div>
                ))}
              </div>
              {report.branchReport.error && (
                <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '6px' }}>
                  {report.branchReport.error}
                </div>
              )}
            </div>
            {/* Pharmacist */}
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ ...metaLabel, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={11} />Pharmacists (Company-Wide)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  { label: 'Input',    value: report.pharmacistReport.totalInput },
                  { label: 'Ranked',   value: report.pharmacistReport.totalRanked,   color: '#22c55e' },
                  { label: 'Excluded', value: report.pharmacistReport.totalExcluded, color: '#f59e0b' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: '6px 12px', background: 'var(--bg-surface)',
                    borderRadius: '6px', border: `1px solid ${color ? color + '33' : 'var(--border-subtle)'}` }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{label}</div>
                  </div>
                ))}
              </div>
              {report.pharmacistReport.error && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  {report.pharmacistReport.error}
                </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
            Rule: {report.branchReport.rankingRuleVersion} ·
            Generated {new Date(report.generatedAt).toLocaleString('en-US')} · isPreview: true
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '20px',
        borderBottom: '1px solid var(--border-default)',
      }}>
        {(['branch', 'pharmacist'] as const).map((tab) => {
          const label  = tab === 'branch' ? 'Branch Rankings' : 'Pharmacist Rankings'
          const count  = tab === 'branch' ? branchSnaps.length : pharmSnaps.length
          const active = activeTab === tab
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: active ? 600 : 400,
              cursor: 'pointer', border: 'none', background: 'none',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px', transition: 'all 0.15s',
            }}>
              {label}{count > 0 && (
                <span style={{
                  marginLeft: '6px', fontSize: '10px', fontWeight: 600,
                  padding: '1px 6px', borderRadius: '10px',
                  background: active ? 'var(--accent)22' : 'var(--bg-surface)',
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Ranking tables ── */}
      {subLoading ? (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Loading snapshots…
        </div>
      ) : snapshots.length > 0 ? (
        <div style={card}>
          <div style={sectionTitle}>
            <Trophy size={15} />
            {activeTab === 'branch' ? 'Branch Rankings (Company-Wide)' : 'Pharmacist Rankings (Company-Wide)'} · {periodId}
            <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text-muted)' }}>
              {snapshots.length} {activeTab === 'branch' ? 'branches' : 'pharmacists'} · {cohortMap.size} cohort{cohortMap.size !== 1 ? 's' : ''}
              {diagnostics && (
                activeTab === 'branch'
                  ? ` · Showing ${diagnostics.branchesRanked} of ${diagnostics.branchesRanked + diagnostics.branchesExcluded} eligible`
                  : ` · Showing ${diagnostics.pharmacistsRanked} of ${diagnostics.pharmacistsRanked + diagnostics.pharmacistsExcluded} eligible`
              )}
            </span>
          </div>
          {activeTab === 'branch'
            ? sortedCohortKeys.map((key) => (
                <BranchCohortTable
                  key={key}
                  label={key.charAt(0).toUpperCase() + key.slice(1)}
                  snapshots={cohortMap.get(key)!}
                />
              ))
            : <PharmacistCohortTable snapshots={snapshots} pharmacyNameById={pharmacyNameById} />
          }
        </div>
      ) : (
        !generating && !subLoading && (
          <div style={{ ...card, textAlign: 'center', padding: '40px' }}>
            <Trophy size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              No ranking snapshots yet
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Select a period and profile, then click Generate Preview.
            </div>
            {branchSnaps.length === 0 && pharmSnaps.length === 0 && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'left',
                maxWidth: '360px', margin: '0 auto', lineHeight: 1.8 }}>
                <strong>Checklist before generating:</strong><br />
                ✓ Branch targets exist for {periodId}<br />
                ✓ KPI entries exist for {periodId}<br />
                ✓ Pharmacist evaluations run for {periodId}<br />
                ✓ Evaluation profile published
              </div>
            )}
          </div>
        )
      )}

      {/* ── Excluded records ── */}
      {activeExcluded.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}>
            <AlertCircle size={15} style={{ color: '#f59e0b' }} />
            Excluded Records ({activeExcluded.length}) — {activeTab === 'branch' ? 'Branches' : 'Pharmacists'}
          </div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  {['Entity', 'Reason'].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left',
                      color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px',
                      borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeExcluded.map((ex: any, i: number) => (
                  <tr key={ex.entityId}
                    style={{ borderBottom: i < activeExcluded.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                      {ex.entityName ?? 'Unknown'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#f59e0b', fontSize: '11px' }}>
                      {ex.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
