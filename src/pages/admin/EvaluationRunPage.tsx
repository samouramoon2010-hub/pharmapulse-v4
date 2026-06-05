// ============================================================
// Evaluation Run Page — ER-2A
//
// Admin-only. Manual single-user evaluation execution.
// No rankings. No comparisons. No leaderboards. No coaching.
//
// Flow:
//   1. Select user (from live user list)
//   2. Select month
//   3. Select evaluation profile (published only)
//   4. Run Evaluation
//   5. Display result summary
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import {
  Play, Loader2, CheckCircle2, AlertTriangle,
  XCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAuthStore }    from '../../store/authStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useToastStore }   from '../../components/ui/Toast'
import { getUsersByPharmacy }    from '../../services/userService'
import { subscribeKpiRegistry }       from '../../services/kpiRegistryService'
import { subscribePublishedProfiles } from '../../services/evaluationRegistryService'
import type { EvaluationProfile }     from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import { runEvaluationForUserMonth } from '../../services/evaluationOrchestrationService'
import type { BasketResult }         from '../../engine/evaluationEngine/evaluationEngineTypes'
import type { EvaluationLedgerDoc }  from '../../services/evaluationLedgerService'
import type { RunEvaluationOutcome } from '../../services/evaluationOrchestrationService'

// ── Helpers ────────────────────────────────────────────────────

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <label style={{
        display: 'block', fontSize: '10px', fontWeight: 600,
        letterSpacing: '0.07em', textTransform: 'uppercase',
        color: 'var(--text-muted)', marginBottom: '4px',
      }}>{label}</label>
      {children}
    </div>
  )
}

const SEL: React.CSSProperties = {
  width: '100%', height: '34px', padding: '0 10px', fontSize: '12px',
  borderRadius: '7px', border: '1px solid var(--border-default)',
  background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none',
}

const STATUS_ICONS = {
  complete: <CheckCircle2 style={{ width: 14, height: 14, color: '#22c55e' }} />,
  partial:  <AlertTriangle style={{ width: 14, height: 14, color: '#f59e0b' }} />,
  invalid:  <XCircle      style={{ width: 14, height: 14, color: '#ef4444' }} />,
}

// ── Basket result card ────────────────────────────────────────

function BasketCard({ basket }: { basket: BasketResult }) {
  const [open, setOpen] = useState(false)
  const bg = basket.bandColor ? `${basket.bandColor}18` : 'var(--bg-hover)'

  return (
    <div style={{
      border: '1px solid var(--border-default)', borderRadius: '8px',
      marginBottom: '8px', overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', cursor: 'pointer', background: bg }}
      >
        {basket.isValid ? null : <XCircle style={{ width: 12, height: 12, color: '#ef4444', flexShrink: 0 }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{basket.basketName}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {(basket.weight * 100).toFixed(0)}% of profile · {basket.aggregateAchievementPct.toFixed(1)}% achievement
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: basket.bandColor ?? 'var(--text-primary)' }}>
            {basket.bandLabel}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            Score: {basket.weightedScore.toFixed(3)}
          </div>
        </div>
        {open ? <ChevronUp style={{ width: 13, height: 13, color: 'var(--text-muted)' }} />
              : <ChevronDown style={{ width: 13, height: 13, color: 'var(--text-muted)' }} />}
      </div>

      {open && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)' }}>
          {basket.invalidReason && (
            <div style={{ fontSize: '11px', color: '#f87171', marginBottom: '8px' }}>
              ⚠ {basket.invalidReason}
            </div>
          )}
          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['KPI', 'Actual', 'Target', 'Source', 'Ach%', 'Band', 'W.Score'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '3px 6px', fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {basket.elements.map((el) => (
                <tr key={el.kpiKey} style={{ opacity: el.dataAvailable ? 1 : 0.5 }}>
                  <td style={{ padding: '4px 6px', color: 'var(--text-primary)' }}>
                    {el.label}
                    {!el.dataAvailable && <span style={{ color: '#f87171', marginLeft: '4px' }}>✕</span>}
                    {el.required && <span style={{ color: '#f59e0b', marginLeft: '3px', fontSize: '9px' }}>REQ</span>}
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{el.actual.toLocaleString()}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{el.target.toLocaleString()}</td>
                  <td style={{ padding: '4px 6px', color: 'var(--text-muted)', fontSize: '10px' }}>{el.targetSource}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{el.achievementPct.toFixed(1)}%</td>
                  <td style={{ padding: '4px 6px', color: el.bandColor ?? 'var(--text-primary)' }}>{el.bandLabel}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{el.weightedScore.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────

export default function EvaluationRunPage() {
  const { userProfile } = useAuthStore()
  const { pharmacies, subscribe: subPh } = usePharmacyStore()
  const toast = useToastStore()

  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)
  const [pharmacyId,   setPharmacyId]   = useState('')
  const [users,        setUsers]        = useState<{ id: string; displayName: string; role: string }[]>([])
  const [userId,       setUserId]       = useState('')
  const [month,        setMonth]        = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [running,  setRunning]  = useState(false)
  const [result,   setResult]   = useState<EvaluationLedgerDoc | null>(null)
  const [outcome,  setOutcome]  = useState<RunEvaluationOutcome | null>(null)
  const [warnings,          setWarnings]          = useState<string[]>([])
  const [publishedProfiles, setPublishedProfiles] = useState<EvaluationProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState('')

  useEffect(() => { const u = subPh(); return u }, [])
  useEffect(() => {
    return subscribeKpiRegistry(
      (reg) => setLiveRegistry(reg),
      () => setLiveRegistry(DEFAULT_KPI_REGISTRY),
    )
  }, [])

  // Load published profiles for the dropdown
  useEffect(() => {
    return subscribePublishedProfiles((list) => setPublishedProfiles(list))
  }, [])

  useEffect(() => {
    if (!pharmacyId) { setUsers([]); setUserId(''); return }
    getUsersByPharmacy(pharmacyId).then((list) => {
      setUsers(list.sort((a: { displayName?: string }, b: { displayName?: string }) =>
        (a.displayName ?? '').localeCompare(b.displayName ?? ''))
      )
    }).catch(() => toast.error('Failed to load users'))
  }, [pharmacyId])

  const handleRun = async () => {
    if (!userId || !pharmacyId || !month) {
      toast.error('Select user, branch, and month first')
      return
    }
    const user = users.find((u: { id: string }) => u.id === userId)
    if (!user) { toast.error('User not found'); return }

    setRunning(true); setResult(null); setOutcome(null); setWarnings([])
    try {
      // ER-2B: Full real-data orchestration
      const out = await runEvaluationForUserMonth({
        userId,
        pharmacyId,
        userRole:     (user as { role?: string }).role || 'pharmacist',
        month,
        registry:     liveRegistry,
        calculatedBy: userProfile?.uid ?? 'admin',
        actorRole:    userProfile?.role ?? 'admin',
        profileId:    selectedProfileId || undefined,  // explicit selection overrides role-based lookup
      })
      setResult(out.ledgerDoc)
      setOutcome(out)
      setWarnings(out.warnings)
      toast.success('Evaluation complete — real data used, result saved to ledger')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Evaluation failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Run Evaluation
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
          Manual single-user evaluation execution. Results are written to the immutable evaluation ledger.
        </p>
      </div>

      {/* Controls */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-default)',
        borderRadius: '10px', padding: '18px', marginBottom: '20px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <F label="Branch">
            <select value={pharmacyId} onChange={(e) => { setPharmacyId(e.target.value); setUserId('') }} style={SEL}>
              <option value="">Select branch…</option>
              {pharmacies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </F>
          <F label="User">
            <select value={userId} onChange={(e) => setUserId(e.target.value)} disabled={!pharmacyId} style={SEL}>
              <option value="">Select user…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.id}</option>)}
            </select>
          </F>
          <F label="Month">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={SEL} />
          </F>
          <F label="Evaluation Profile">
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              style={SEL}
            >
              <option value="">Select profile…</option>
              {publishedProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} v{p.version}
                </option>
              ))}
            </select>
          </F>
        </div>

        {/* ER-2B: Diagnostics panel — shown after run */}
        {outcome && (
          <div style={{
            marginBottom: '12px', padding: '10px 14px', borderRadius: '7px',
            background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
            fontSize: '11px',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Data Sources
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Actuals from entries</span>
              <span style={{ color: outcome.entryCount > 0 ? '#22c55e' : '#f59e0b' }}>
                {outcome.entryCount} entr{outcome.entryCount !== 1 ? 'ies' : 'y'} aggregated
              </span>
              <span style={{ color: 'var(--text-muted)' }}>Branch target</span>
              <span style={{ color: outcome.branchTarget ? '#22c55e' : '#f59e0b' }}>
                {outcome.branchTarget ? '✓ found' : '✗ not found'}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>Personal target</span>
              <span style={{ color: outcome.personalTarget ? '#22c55e' : 'var(--text-muted)' }}>
                {outcome.personalTarget ? '✓ published' : '✗ not set'}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>Profile used</span>
              <span style={{ color: 'var(--brand-400)', fontFamily: 'monospace', fontSize: '10px' }}>
                {outcome.profile.name} v{outcome.profile.version}
              </span>
            </div>
            {warnings.length > 0 && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                {warnings.map((w, i) => (
                  <div key={i} style={{ color: '#fbbf24', fontSize: '10px' }}>⚠ {w}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleRun}
          disabled={running || !userId || !pharmacyId || !month || !selectedProfileId}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            height: '34px', padding: '0 18px', borderRadius: '8px',
            background: 'var(--brand-500)', color: '#fff', border: 'none',
            fontSize: '12px', fontWeight: 500,
            cursor: (running || !userId || !pharmacyId || !month || !selectedProfileId) ? 'not-allowed' : 'pointer',
            opacity: (running || !userId || !pharmacyId || !month || !selectedProfileId) ? 0.6 : 1,
          }}
        >
          {running
            ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
            : <Play style={{ width: 14, height: 14 }} />
          }
          {running ? 'Running…' : 'Run Evaluation'}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-default)',
          borderRadius: '10px', padding: '18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            {STATUS_ICONS[result.status]}
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {result.rating}
                {result.ratingAr && <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>{result.ratingAr}</span>}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Final Score: {result.finalScore.toFixed(3)} · Status: {result.status} · Profile v{result.profileVersion}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              ID: {result.id.slice(0, 8)}…
            </div>
          </div>

          {result.calculationTrace.missingKpis.length > 0 && (
            <div style={{ fontSize: '11px', color: '#f59e0b', marginBottom: '12px' }}>
              Missing KPI data: {result.calculationTrace.missingKpis.join(', ')}
            </div>
          )}

          {result.basketResults.map((b) => (
            <BasketCard key={b.basketId} basket={b} />
          ))}

          <div style={{ marginTop: '12px', fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
            Personal target: {result.calculationTrace.personalTargetUsed ? '✓ used' : '✗ not available (branch target or zero)'}
            {' · '}Entries: {outcome?.entryCount ?? '—'}
            {' · '}Sealed: {result.sealed ? '✓' : '✗'}
          </div>
        </div>
      )}
    </div>
  )
}
