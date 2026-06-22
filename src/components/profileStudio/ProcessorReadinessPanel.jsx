// ============================================================
// ProcessorReadinessPanel — Read-only readiness verdict (Phase 2E)
//
// Pure presentational component. Derives an informational readiness
// label purely from already-loaded summary fields on the profile
// document (status, hierarchy counts, processor inventory flags,
// validationSummary, simulationSummary). It never re-runs kernel
// validation/simulation logic and never calls a lifecycle workflow
// function — the verdict is a passive label, not an action.
//
// NO workflow execution. NO validateDraft/simulateDraft/approveDraft/
// markPublishReady. NO Firestore writes. NO updateProfileDocument.
// NO editing. NO builder. NO drag & drop. NO AI. NO Excel import.
// NO Evaluation Engine changes.
// ============================================================
import React, { useMemo } from 'react'
import { Gauge } from 'lucide-react'

const READINESS_TONE = {
  Archived:                            { bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.2)', color: '#94a3b8' },
  Published:                           { bg: 'rgba(5,150,105,0.08)',   border: 'rgba(5,150,105,0.2)',   color: '#10b981' },
  'Not ready — no baskets defined':    { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  color: '#fbbf24' },
  'Not ready — missing processors':    { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  color: '#fbbf24' },
  'Ready to validate':                 { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)',  color: '#60a5fa' },
  'Ready to simulate':                 { bg: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.2)',  color: '#a78bfa' },
  'Ready to approve':                  { bg: 'rgba(45,125,90,0.08)',   border: 'rgba(45,125,90,0.2)',   color: '#34d399' },
  'Ready to publish':                  { bg: 'rgba(5,150,105,0.08)',   border: 'rgba(5,150,105,0.2)',   color: '#10b981' },
}

const FALLBACK_TONE = { bg: 'var(--bg-overlay)', border: 'var(--border-subtle)', color: 'var(--text-muted)' }

/**
 * Derives a read-only readiness label from already-loaded summary
 * fields. Pure function — no Firestore, no kernel validators, no
 * workflow calls. Order of checks matters (terminal states first).
 */
function deriveReadinessLabel({ status, basketCount, totalStepCount }) {
  if (status === 'ARCHIVED') return 'Archived'
  if (status === 'PUBLISHED') return 'Published'
  if (basketCount === 0) return 'Not ready — no baskets defined'
  if (totalStepCount === 0) return 'Not ready — missing processors'
  if (status === 'DRAFT') return 'Ready to validate'
  if (status === 'VALIDATED') return 'Ready to simulate'
  if (status === 'SIMULATED') return 'Ready to approve'
  if (status === 'APPROVED') return 'Ready to publish'
  return 'Unknown'
}

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: '12px',
      padding: '5px 0', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontSize: '11px', color: 'var(--text-primary)', fontWeight: 500,
        textAlign: 'right', wordBreak: 'break-word',
      }}>
        {value}
      </span>
    </div>
  )
}

export default function ProcessorReadinessPanel({
  profile,
  processors:        processorsProp,
  validationSummary: validationSummaryProp,
  simulationSummary: simulationSummaryProp,
  status:            statusProp,
  hierarchy:         hierarchyProp,
}) {
  const status            = profile?.status            ?? statusProp
  const hierarchy         = profile?.hierarchy          ?? hierarchyProp         ?? {}
  const processors        = profile?.processors         ?? processorsProp       ?? {}
  const validationSummary = profile?.validationSummary  ?? validationSummaryProp ?? null
  const simulationSummary = profile?.simulationSummary  ?? simulationSummaryProp ?? null

  const basketCount    = hierarchy.basketCount    ?? 0
  const elementCount   = hierarchy.elementCount   ?? 0
  const totalStepCount = processors.totalStepCount ?? 0

  const readinessLabel = useMemo(
    () => deriveReadinessLabel({ status, basketCount, totalStepCount }),
    [status, basketCount, totalStepCount],
  )

  const tone = READINESS_TONE[readinessLabel] || FALLBACK_TONE

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <Gauge style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <span style={{
          fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
          fontFamily: "'Inter', sans-serif",
        }}>
          Processor Readiness
        </span>
      </div>

      <div style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '4px 10px', borderRadius: '99px', marginBottom: '10px',
        fontSize: '11px', fontWeight: 500,
        fontFamily: "'Inter', sans-serif", letterSpacing: '-0.01em',
        background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color,
      }}>
        {readinessLabel}
      </div>

      <Row label="Status"           value={status || '—'} />
      <Row label="Baskets"          value={basketCount} />
      <Row label="Elements"         value={elementCount} />
      <Row label="Processor Steps"  value={totalStepCount} />

      {validationSummary ? (
        <Row label="Validation" value={validationSummary.valid ? 'Valid' : 'Invalid'} />
      ) : (
        <Row label="Validation" value="Not yet validated" />
      )}

      {simulationSummary ? (
        <Row label="Simulation" value={simulationSummary.valid ? `Valid (${simulationSummary.score}%)` : 'Invalid'} />
      ) : (
        <Row label="Simulation" value="No simulation run yet" />
      )}
    </div>
  )
}
