// ============================================================
// Evaluation Run Page — ER-2A / RF-1D-A
//
// Admin-only. Two tabs:
//   Single User — manual evaluation for one selected user
//   Bulk Branch — evaluate all eligible users in a branch at once
//
// Single-user flow:
//   1. Select user (from live user list)
//   2. Select month
//   3. Select evaluation profile (published only)
//   4. Run Evaluation
//   5. Display result summary
//
// Bulk Branch flow (RF-1D-A):
//   1. Select branch + month + profile
//   2. Preview eligible users
//   3. Choose idempotency (skip / re-run)
//   4. Run Batch Evaluation
//   5. Display per-user report
// ============================================================
import React, { useEffect, useState, useMemo } from 'react'
import {
  Play, Loader2, CheckCircle2, AlertTriangle,
  XCircle, ChevronDown, ChevronUp, Users, User,
} from 'lucide-react'
import { useAuthStore }    from '../../store/authStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useToastStore }   from '../../components/ui/Toast'
import { formatNumber }    from '../../utils/helpers'
import F from '../../components/admin/evaluation/EvaluationFormField'
import { getUsersByPharmacy }    from '../../services/userService'
import { subscribeKpiRegistry }       from '../../services/kpiRegistryService'
import { subscribePublishedProfiles } from '../../services/evaluationRegistryService'
import type { EvaluationProfile }     from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import { runEvaluationForUserMonth } from '../../services/evaluationOrchestrationService'
import type { BasketResult }         from '../../engine/evaluationEngine/evaluationEngineTypes'
import type { EvaluationLedgerDoc }  from '../../services/evaluationLedgerService'
import type { RunEvaluationOutcome } from '../../services/evaluationOrchestrationService'
import {
  runBranchBulkEvaluation,
  previewBranchBulkEvaluation,
} from '../../services/bulkEvaluationService'
import type {
  BulkEvaluationReport,
  BulkEvaluationPreview,
  BulkIdempotencyMode,
} from '../../services/bulkEvaluationService'

// ── Page-scoped fix for native <select> options in dark/pharma themes ─────
// Native <option> elements do not inherit background/color from their parent
// <select> in all browsers — they need explicit CSS. This style block is
// intentionally scoped to .run-evaluation-select to avoid affecting any
// other page in the application.
const RUN_EVAL_SELECT_STYLE = `
  .run-evaluation-select {
    background-color: var(--bg-surface);
    color:            var(--text-primary);
    border:           1px solid var(--border-subtle);
  }
  .run-evaluation-select option {
    background-color: var(--bg-surface);
    color:            var(--text-primary);
  }
  [data-theme="light"] .run-evaluation-select,
  [data-theme="pharma-light"] .run-evaluation-select {
    background-color: #FFFFFF;
    color:            #0F172A;
  }
  [data-theme="light"] .run-evaluation-select option,
  [data-theme="pharma-light"] .run-evaluation-select option {
    background-color: #FFFFFF;
    color:            #0F172A;
  }
`

const SEL: React.CSSProperties = {
  width: '100%', height: '34px', padding: '0 10px', fontSize: '12px',
  borderRadius: '7px', outline: 'none',
  // background, color, and border are handled by the .run-evaluation-select
  // class so that <option> elements also receive the correct colours.
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
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(el.actual)}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(el.target)}</td>
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

// ── SingleUserTab ──────────────────────────────────────────────

function SingleUserTab(props: {
  pharmacies: any[]; pharmacyId: string; setPharmacyId: (v: string) => void
  users: any[]; userId: string; setUserId: (v: string) => void
  month: string; setMonth: (v: string) => void
  publishedProfiles: EvaluationProfile[]; selectedProfileId: string; setSelectedProfileId: (v: string) => void
  running: boolean; outcome: any; result: any; warnings: string[]
  handleRun: () => void
}) {
  const { pharmacies, pharmacyId, setPharmacyId, users, userId, setUserId,
    month, setMonth, publishedProfiles, selectedProfileId, setSelectedProfileId,
    running, outcome, result, warnings, handleRun } = props
  return (
    <div>
      {/* Controls */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-default)',
        borderRadius: '10px', padding: '18px', marginBottom: '20px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <F label="Branch">
            <select value={pharmacyId} onChange={(e) => { setPharmacyId(e.target.value) }} style={SEL} className="run-evaluation-select">
              <option value="">Select branch…</option>
              {pharmacies.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </F>
          <F label="User">
            <select value={userId} onChange={(e) => setUserId(e.target.value)} disabled={!pharmacyId} style={SEL} className="run-evaluation-select">
              <option value="">Select user…</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.displayName || u.id}</option>)}
            </select>
          </F>
          <F label="Month">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={SEL} />
          </F>
          <F label="Evaluation Profile">
            <select value={selectedProfileId} onChange={(e) => setSelectedProfileId(e.target.value)} style={SEL} className="run-evaluation-select">
              <option value="">Select profile…</option>
              {publishedProfiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name} v{p.version}</option>
              ))}
            </select>
          </F>
        </div>
        {outcome && (
          <div style={{
            marginBottom: '12px', padding: '10px 14px', borderRadius: '7px',
            background: 'var(--bg-hover)', border: '1px solid var(--border-default)', fontSize: '11px',
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
            {/* V2 Shadow Status */}
            {outcome.shadow && (
              <div style={{
                marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  V2 Shadow
                </span>
                {outcome.shadow.ran ? (
                  <span style={{
                    fontSize: '11px',
                    color: outcome.shadow.comparison?.severity === 'none'  ? '#22c55e' :
                           outcome.shadow.comparison?.severity === 'minor' ? '#f59e0b' : '#ef4444',
                  }}>
                    {outcome.shadow.comparison?.severity === 'none'  ? '✅ Matched' :
                     outcome.shadow.comparison?.severity === 'minor' ? `⚠️ Minor diff (${outcome.shadow.comparison.differences.length})` :
                                                                       `❌ Major diff (${outcome.shadow.comparison?.differences.length})`}
                    {' '}· {outcome.shadow.pipelineId}
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: '#ef4444' }}>
                    ⚠ Failed — V1 unaffected
                  </span>
                )}
              </div>
            )}
            {warnings.length > 0 && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                {warnings.map((w: string, i: number) => (
                  <div key={i} style={{ color: '#fbbf24', fontSize: '10px' }}>⚠ {w}</div>
                ))}
              </div>
            )}
          </div>
        )}
        <button onClick={handleRun}
          disabled={running || !userId || !pharmacyId || !month || !selectedProfileId}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            height: '34px', padding: '0 18px', borderRadius: '8px',
            background: 'var(--brand-500)', color: '#fff', border: 'none',
            fontSize: '12px', fontWeight: 500,
            cursor: (running || !userId || !pharmacyId || !month || !selectedProfileId) ? 'not-allowed' : 'pointer',
            opacity: (running || !userId || !pharmacyId || !month || !selectedProfileId) ? 0.6 : 1,
          }}>
          {running
            ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
            : <Play style={{ width: 14, height: 14 }} />}
          {running ? 'Running…' : 'Run Evaluation'}
        </button>
      </div>
      {result && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '10px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            {STATUS_ICONS[result.status as keyof typeof STATUS_ICONS]}
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
          {result.basketResults.map((b: BasketResult) => (
            <BasketCard key={b.basketId} basket={b} />
          ))}
          <div style={{ marginTop: '12px', fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
            Personal target: {result.calculationTrace.personalTargetUsed ? '✓ used' : '✗ not available'}
            {' · '}Entries: {outcome?.entryCount ?? '—'}
            {' · '}Sealed: {result.sealed ? '✓' : '✗'}
          </div>
        </div>
      )}
    </div>
  )
}

// ── BulkBranchTab ──────────────────────────────────────────────

function BulkBranchTab(props: {
  pharmacies: any[]
  bulkPharmacyId: string; setBulkPharmacyId: (v: string) => void
  month: string; setMonth: (v: string) => void
  publishedProfiles: EvaluationProfile[]
  bulkProfileId: string; setBulkProfileId: (v: string) => void
  bulkIdempotency: BulkIdempotencyMode; setBulkIdempotency: (v: BulkIdempotencyMode) => void
  bulkPreviewing: boolean; bulkRunning: boolean
  bulkPreview: BulkEvaluationPreview | null
  bulkReport: BulkEvaluationReport | null
  handleBulkPreview: () => void
  handleBulkRun: () => void
}) {
  const {
    pharmacies, bulkPharmacyId, setBulkPharmacyId,
    month, setMonth, publishedProfiles, bulkProfileId, setBulkProfileId,
    bulkIdempotency, setBulkIdempotency,
    bulkPreviewing, bulkRunning,
    bulkPreview, bulkReport,
    handleBulkPreview, handleBulkRun,
  } = props

  const statusColor = (s: string) =>
    s === 'success' ? '#22c55e' : s === 'skipped' ? '#f59e0b' : '#ef4444'
  const statusIcon = (s: string) =>
    s === 'success' ? '✓' : s === 'skipped' ? '↷' : '✗'

  return (
    <div>
      {/* Controls */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-default)',
        borderRadius: '10px', padding: '18px', marginBottom: '20px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
          <F label="Branch">
            <select value={bulkPharmacyId}
              onChange={(e) => setBulkPharmacyId(e.target.value)} style={SEL} className="run-evaluation-select">
              <option value="">Select branch…</option>
              {pharmacies.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </F>
          <F label="Month">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={SEL} />
          </F>
          <F label="Evaluation Profile">
            <select value={bulkProfileId} onChange={(e) => setBulkProfileId(e.target.value)} style={SEL} className="run-evaluation-select">
              <option value="">Select profile…</option>
              {publishedProfiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name} v{p.version}</option>
              ))}
            </select>
          </F>
        </div>

        {/* Idempotency */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>
            If evaluation already exists for this period/profile
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {(['skip', 're-run'] as const).map((opt) => (
              <label key={opt} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '12px', cursor: 'pointer', color: 'var(--text-primary)',
              }}>
                <input type="radio" name="idempotency" value={opt}
                  checked={bulkIdempotency === opt}
                  onChange={() => setBulkIdempotency(opt)} />
                {opt === 'skip' ? 'Skip (default — avoid duplicates)' : 'Re-run (create new ledger doc)'}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={handleBulkPreview}
            disabled={!bulkPharmacyId || bulkPreviewing || bulkRunning}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              height: '34px', padding: '0 16px', borderRadius: '8px',
              background: 'var(--bg-surface)', color: 'var(--text-primary)',
              border: '1px solid var(--border-default)', fontSize: '12px', fontWeight: 500,
              cursor: (!bulkPharmacyId || bulkPreviewing || bulkRunning) ? 'not-allowed' : 'pointer',
              opacity: (!bulkPharmacyId || bulkPreviewing || bulkRunning) ? 0.6 : 1,
            }}>
            {bulkPreviewing
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Previewing…</>
              : <><Users size={13} />Preview Users</>}
          </button>
          <button onClick={handleBulkRun}
            disabled={!bulkPharmacyId || !month || !bulkProfileId || bulkRunning || !bulkPreview}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              height: '34px', padding: '0 18px', borderRadius: '8px',
              background: 'var(--brand-500)', color: '#fff', border: 'none',
              fontSize: '12px', fontWeight: 500,
              cursor: (!bulkPharmacyId || !month || !bulkProfileId || bulkRunning || !bulkPreview) ? 'not-allowed' : 'pointer',
              opacity: (!bulkPharmacyId || !month || !bulkProfileId || bulkRunning || !bulkPreview) ? 0.6 : 1,
            }}>
            {bulkRunning
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Running batch…</>
              : <><Play size={13} />Run Batch Evaluation</>}
          </button>
          {!bulkPreview && !bulkPreviewing && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Preview users first, then run the batch.
            </span>
          )}
        </div>
      </div>

      {/* Preview */}
      {bulkPreview && !bulkReport && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-default)',
          borderRadius: '10px', padding: '18px', marginBottom: '20px',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Preview — {bulkPreview.eligibleCount} eligible of {bulkPreview.totalUsers} users
          </div>
          {bulkPreview.eligible.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#22c55e',
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>
                Will be evaluated ({bulkPreview.eligibleCount})
              </div>
              {bulkPreview.eligible.map((u) => (
                <div key={u.userId} style={{ display: 'flex', gap: '8px', alignItems: 'center',
                  padding: '3px 0', fontSize: '12px', color: 'var(--text-primary)' }}>
                  <span style={{ minWidth: '80px', fontSize: '10px',
                    color: 'var(--text-muted)', textTransform: 'capitalize' }}>{u.role}</span>
                  {u.displayName}
                </div>
              ))}
            </div>
          )}
          {bulkPreview.ineligible.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>
                Excluded ({bulkPreview.ineligibleCount})
              </div>
              {bulkPreview.ineligible.map((u) => (
                <div key={u.userId} style={{ display: 'flex', gap: '8px', alignItems: 'center',
                  padding: '3px 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span style={{ minWidth: '80px', textTransform: 'capitalize' }}>{u.role}</span>
                  {u.displayName}
                  <span style={{ fontSize: '10px', color: '#f59e0b' }}>— {u.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Report */}
      {bulkReport && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-default)',
          borderRadius: '10px', padding: '18px',
        }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {[
              { label: 'Eligible',   value: bulkReport.totalEligible },
              { label: 'Succeeded',  value: bulkReport.succeeded,  color: '#22c55e' },
              { label: 'Skipped',    value: bulkReport.skipped,    color: '#f59e0b' },
              { label: 'Failed',     value: bulkReport.failed,     color: bulkReport.failed > 0 ? '#ef4444' : undefined },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                padding: '8px 14px', background: 'var(--bg-surface)', borderRadius: '7px',
                border: `1px solid ${color ? color + '33' : 'var(--border-subtle)'}`,
              }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '7px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)' }}>
                  {['Status', 'Name', 'Role', 'Score', 'Rating', 'Entries', 'Warnings / Error'].map((h) => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left',
                      color: 'var(--text-muted)', fontWeight: 500, fontSize: '10px',
                      borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bulkReport.results.map((r, i) => (
                  <tr key={r.userId} style={{
                    borderBottom: i < bulkReport.results.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    background: r.status === 'failed' ? '#ef444408' : 'transparent',
                  }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: statusColor(r.status) }}>
                      {statusIcon(r.status)} {r.status}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>{r.displayName}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{r.role}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>
                      {r.finalScore !== undefined ? r.finalScore.toFixed(3) : '—'}
                    </td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{r.rating ?? '—'}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{r.entryCount ?? '—'}</td>
                    <td style={{ padding: '6px 10px', color: r.error ? '#ef4444' : '#f59e0b', fontSize: '10px' }}>
                      {r.error ?? (r.skippedReason ?? r.warnings.join('; ') ?? '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--text-muted)' }}>
            Generated {new Date(bulkReport.generatedAt).toLocaleString('en-US')} ·
            Profile v{bulkReport.profileVersion} · Mode: {bulkIdempotency}
          </div>
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

  // ── Shared ─────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single')
  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)
  const [publishedProfiles, setPublishedProfiles] = useState<EvaluationProfile[]>([])
  const [month, setMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // ── Single-user state ──────────────────────────────────────
  const [pharmacyId,   setPharmacyId]   = useState('')
  const [users,        setUsers]        = useState<{ id: string; displayName: string; role: string }[]>([])
  const [userId,       setUserId]       = useState('')
  const [running,  setRunning]  = useState(false)
  const [result,   setResult]   = useState<EvaluationLedgerDoc | null>(null)
  const [outcome,  setOutcome]  = useState<RunEvaluationOutcome | null>(null)
  const [warnings,          setWarnings]          = useState<string[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState('')

  // ── Bulk state ─────────────────────────────────────────────
  const [bulkPharmacyId,   setBulkPharmacyId]   = useState('')
  const [bulkProfileId,    setBulkProfileId]    = useState('')
  const [bulkIdempotency,  setBulkIdempotency]  = useState<BulkIdempotencyMode>('skip')
  const [bulkRunning,      setBulkRunning]      = useState(false)
  const [bulkPreview,      setBulkPreview]      = useState<BulkEvaluationPreview | null>(null)
  const [bulkReport,       setBulkReport]       = useState<BulkEvaluationReport | null>(null)
  const [bulkPreviewing,   setBulkPreviewing]   = useState(false)

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

  const handleBulkPreview = async () => {
    if (!bulkPharmacyId) { toast.error('Select a branch first'); return }
    setBulkPreviewing(true)
    setBulkPreview(null)
    setBulkReport(null)
    try {
      const preview = await previewBranchBulkEvaluation(bulkPharmacyId)
      setBulkPreview(preview)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setBulkPreviewing(false)
    }
  }

  const handleBulkRun = async () => {
    if (!bulkPharmacyId || !month || !bulkProfileId) {
      toast.error('Select branch, month, and profile first')
      return
    }
    setBulkRunning(true)
    setBulkReport(null)
    try {
      const report = await runBranchBulkEvaluation({
        pharmacyId:  bulkPharmacyId,
        month,
        profileId:   bulkProfileId,
        generatedBy: userProfile?.uid ?? 'admin',
        actorRole:   userProfile?.role ?? 'admin',
        idempotency: bulkIdempotency,
      })
      setBulkReport(report)
      toast.success(
        `Batch complete — ${report.succeeded} succeeded, ${report.skipped} skipped, ${report.failed} failed`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Batch evaluation failed')
    } finally {
      setBulkRunning(false)
    }
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      {/* Page-scoped select styles — fixes dark/pharma theme option readability */}
      <style>{RUN_EVAL_SELECT_STYLE}</style>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Run Evaluation
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
          Single-user or bulk branch evaluation. Results are written to the immutable evaluation ledger.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '20px',
        borderBottom: '1px solid var(--border-default)',
      }}>
        {([
          { key: 'single' as const, label: 'Single User',  icon: <User  size={13} /> },
          { key: 'bulk'   as const, label: 'Bulk — Branch', icon: <Users size={13} /> },
        ]).map(({ key, label, icon }) => {
          const active = activeTab === key
          return (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '8px 14px', fontSize: '13px', fontWeight: active ? 600 : 400,
              cursor: 'pointer', border: 'none', background: 'none',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px', transition: 'all 0.15s',
            }}>
              {icon} {label}
            </button>
          )
        })}
      </div>

      {/* ── Single User tab ──────────────────────────────────── */}
      {activeTab === 'single' && (<SingleUserTab
        pharmacies={pharmacies}
        pharmacyId={pharmacyId} setPharmacyId={(v) => { setPharmacyId(v); setUserId('') }}
        users={users}
        userId={userId} setUserId={setUserId}
        month={month} setMonth={setMonth}
        publishedProfiles={publishedProfiles}
        selectedProfileId={selectedProfileId} setSelectedProfileId={setSelectedProfileId}
        running={running}
        outcome={outcome}
        result={result}
        warnings={warnings}
        handleRun={handleRun}
      />)}

      {/* ── Bulk Branch tab ──────────────────────────────────── */}
      {activeTab === 'bulk' && (<BulkBranchTab
        pharmacies={pharmacies}
        bulkPharmacyId={bulkPharmacyId} setBulkPharmacyId={(v) => { setBulkPharmacyId(v); setBulkPreview(null) }}
        month={month} setMonth={setMonth}
        publishedProfiles={publishedProfiles}
        bulkProfileId={bulkProfileId} setBulkProfileId={setBulkProfileId}
        bulkIdempotency={bulkIdempotency} setBulkIdempotency={setBulkIdempotency}
        bulkPreviewing={bulkPreviewing}
        bulkRunning={bulkRunning}
        bulkPreview={bulkPreview}
        bulkReport={bulkReport}
        handleBulkPreview={handleBulkPreview}
        handleBulkRun={handleBulkRun}
      />)}
    </div>
  )
}