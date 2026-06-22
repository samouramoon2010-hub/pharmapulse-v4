// ============================================================
// SimulationTracePanel — Granular processor trace view (Phase 2J)
//
// Pure presentational. Flattens the profile-level simulation trace
// via flattenSimulationTrace() — no custom trace logic — and
// renders, per rule: raw achievement, capped
// achievement, weighted score, band, penalties, and the ordered
// processor sequence.
//
// NO writes. NO simulation execution. NO Evaluation Engine changes.
// ============================================================
import React from 'react'
import { Activity } from 'lucide-react'

import { flattenSimulationTrace } from '../../profileStudio/simulationTrace'

function fmt(n) {
  return typeof n === 'number' ? n.toFixed(1) : '—'
}

function StepRow({ step }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      fontSize: '10px', color: 'var(--text-muted)', padding: '2px 0',
    }}>
      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{step.processorType}</span>
      <span>{fmt(step.input)} → {fmt(step.output)}</span>
      {step.notes && <span style={{ fontStyle: 'italic' }}>({step.notes})</span>}
    </div>
  )
}

function RuleTraceRow({ trace }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: '8px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      marginBottom: '6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <Activity style={{ width: 11, height: 11, color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)' }}>{trace.kpiKey}</span>
        {trace.zeroTarget && (
          <span style={{ fontSize: '9px', color: '#fbbf24', background: 'rgba(245,158,11,0.1)', borderRadius: '999px', padding: '1px 6px' }}>
            Zero Target
          </span>
        )}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
        raw achievement={fmt(trace.rawAchievement)}% · capped={fmt(trace.cappedAchievement)}% · weighted={fmt(trace.weightedScore)} · penalty={fmt(trace.penaltyApplied)} · final score={fmt(trace.finalNodeScore)}%
        {trace.bandLabel ? ` · band="${trace.bandLabel}"` : ''}
      </div>
      {trace.stepTraces?.length > 0 && (
        <div style={{ marginTop: '4px', paddingLeft: '8px', borderLeft: '2px solid var(--border-subtle)' }}>
          {trace.stepTraces.map((step, idx) => <StepRow key={idx} step={step} />)}
        </div>
      )}
    </div>
  )
}

export default function SimulationTracePanel({ traces }) {
  if (!traces) return null

  const ruleTraces = flattenSimulationTrace(traces)

  if (ruleTraces.length === 0) {
    return <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No processor traces recorded for this run</div>
  }

  return (
    <div>
      {ruleTraces.map((trace) => <RuleTraceRow key={trace.ruleId} trace={trace} />)}
    </div>
  )
}
