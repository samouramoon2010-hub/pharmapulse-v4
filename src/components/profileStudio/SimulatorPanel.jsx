// ============================================================
// SimulatorPanel — Sandbox simulation runner (Phase 2J)
//
// Runs simulateProfile() against sample actual/target values typed
// in by the user, displays the result via SimulationSummaryCard and
// SimulationTracePanel, and persists the run through the existing
// profileStudioSimulationRuns service (createSimulationRunDocument).
//
// Uses ONLY the existing simulator kernel — simulateProfile(),
// compareSimulationResults(), simulationTrace.ts helpers. No new
// simulation engine. No writes to production profile data; the
// profile document itself is never mutated by this panel.
//
// NO Drag & Drop. NO Publish flow. NO Approval flow. NO AI.
// NO Excel import. NO Evaluation Engine changes.
// ============================================================
import React, { useMemo, useState } from 'react'
import { Play, Loader2, History } from 'lucide-react'

import SimulationSummaryCard from './SimulationSummaryCard'
import SimulationTracePanel from './SimulationTracePanel'
import EmptyState from '../ui/EmptyState'
import { ErrorState } from '../ui/EmptyState'
import { useToastStore } from '../ui/Toast'

import { simulateProfile } from '../../profileStudio/simulator'
import { generateNodeId } from '../../profileStudio/profileFactory'
import { createSimulationRunDocument, listSimulationRuns } from '../../profileStudio/profileStudioService'
import { normalizeError } from '../../profileStudio/profileStudioStore'
import { useProfileStudioPermissions } from '../../profileStudio/hooks/useProfileStudioPermissions'

/** Reconstructs a kernel-shaped draft from the Firestore-shaped profile doc. */
function toDraftLike(profile) {
  return {
    metadata: { id: profile.id, version: profile.version, status: profile.status },
    root: profile.hierarchy?.payload ?? {
      id: profile.hierarchy?.rootId || profile.id,
      label: profile.hierarchy?.rootLabel || profile.name,
      baskets: [],
    },
  }
}

/** Collects every distinct kpiKey referenced by rules in the hierarchy. */
function collectKpiKeys(rootNode) {
  const keys = []
  for (const basket of rootNode.baskets ?? []) {
    for (const element of basket.elements ?? []) {
      for (const rule of element.rules ?? []) {
        if (!keys.includes(rule.kpiKey)) keys.push(rule.kpiKey)
      }
    }
  }
  return keys
}

export default function SimulatorPanel({ profile, actor }) {
  const permissions = useProfileStudioPermissions({ role: actor?.role, profileStatus: profile?.status })
  const [actuals, setActuals] = useState({})
  const [targets, setTargets] = useState({})
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [previousResult, setPreviousResult] = useState(null)
  const [runs, setRuns] = useState([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState(null)
  const toast = useToastStore()

  if (!profile) return null
  if (!permissions.canRunSimulation && !permissions.canApprove && !permissions.canPublish) return null

  const draftLike = toDraftLike(profile)
  const kpiKeys = useMemo(() => collectKpiKeys(draftLike.root), [profile])

  const loadRuns = async () => {
    setRunsLoading(true)
    setRunsError(null)
    try {
      const list = await listSimulationRuns(profile.id, actor)
      setRuns(list)
    } catch (err) {
      setRunsError(normalizeError(err))
    } finally {
      setRunsLoading(false)
    }
  }

  const handleRun = async () => {
    if (running) return
    setRunning(true)
    try {
      const parsedActuals = {}
      const parsedTargets = {}
      for (const key of kpiKeys) {
        parsedActuals[key] = Number(actuals[key]) || 0
        parsedTargets[key] = Number(targets[key]) || 0
      }

      const newResult = simulateProfile({ profile: draftLike, actuals: parsedActuals, targets: parsedTargets })

      await createSimulationRunDocument({
        runId: generateNodeId('run'),
        profileId: profile.id,
        version: profile.version,
        input: { actuals: parsedActuals, targets: parsedTargets },
        result: {
          valid: newResult.valid,
          score: newResult.score,
          basketCount: Object.keys(newResult.baskets).length,
          issueCount: newResult.issues.length,
          traceIncluded: true,
        },
        score: newResult.score,
        issues: newResult.issues,
        executedBy: actor.uid,
      }, actor)

      setPreviousResult(result)
      setResult(newResult)
      toast.success('Simulation run completed')
      loadRuns()
    } catch (err) {
      toast.error(normalizeError(err).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {kpiKeys.length} KPI{kpiKeys.length === 1 ? '' : 's'} in this profile
        </span>
        {permissions.canRunSimulation && (
          <button
            type="button"
            onClick={handleRun}
            disabled={running || kpiKeys.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', fontWeight: 500, color: '#818cf8',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
            }}
          >
            {running ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <Play style={{ width: 11, height: 11 }} />}
            {running ? 'Running…' : 'Run Simulation'}
          </button>
        )}
      </div>

      {permissions.canRunSimulation && kpiKeys.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', marginBottom: '10px' }}>
          {kpiKeys.map((key) => (
            <div key={key} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', minWidth: '50px' }}>{key}</span>
              <input
                type="number"
                placeholder="actual"
                disabled={running}
                value={actuals[key] ?? ''}
                onChange={(e) => setActuals((a) => ({ ...a, [key]: e.target.value }))}
                style={{ width: '60px', fontSize: '11px', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
              />
              <input
                type="number"
                placeholder="target"
                disabled={running}
                value={targets[key] ?? ''}
                onChange={(e) => setTargets((t) => ({ ...t, [key]: e.target.value }))}
                style={{ width: '60px', fontSize: '11px', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border-default)', background: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
              />
            </div>
          ))}
        </div>
      )}

      {kpiKeys.length === 0 && (
        <EmptyState title="No KPIs to simulate" description="Add rules with a KPI key before running a simulation" compact />
      )}

      {result && (
        <div style={{ marginBottom: '12px' }}>
          <SimulationSummaryCard result={result} previousResult={previousResult} />
        </div>
      )}

      {result && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
            Processor Trace
          </div>
          <SimulationTracePanel traces={result.traces} />
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <History style={{ width: 11, height: 11, color: 'var(--text-muted)' }} strokeWidth={1.5} />
          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Simulation Run History
          </span>
          <button
            type="button"
            onClick={loadRuns}
            disabled={runsLoading}
            style={{ fontSize: '10px', color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {runsLoading ? 'Loading…' : 'Load'}
          </button>
        </div>

        {runsError && <ErrorState message={runsError.message} onRetry={loadRuns} />}

        {!runsError && runs.length === 0 && !runsLoading && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No simulation runs loaded yet</div>
        )}

        {runs.map((run) => (
          <div key={run.runId} style={{
            display: 'flex', justifyContent: 'space-between', gap: '8px',
            fontSize: '10px', color: 'var(--text-muted)', padding: '4px 0',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span>{run.executedAt}</span>
            <span>{run.executedBy}</span>
            <span style={{ color: run.result?.valid ? '#34d399' : '#f87171' }}>{run.score}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
