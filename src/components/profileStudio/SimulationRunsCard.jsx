// ============================================================
// SimulationRunsCard — Simulation run list for a profile (Phase 2A)
// ============================================================
import React from 'react'
import { FlaskConical, RefreshCw } from 'lucide-react'
import EmptyState from '../ui/EmptyState'

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch {
    return iso
  }
}

function scoreColor(score) {
  if (score >= 80) return '#34d399'
  if (score >= 60) return '#fbbf24'
  return '#f87171'
}

export default function SimulationRunsCard({ runs, loading, error, isRefreshing, onRefresh }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: '10px', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-canvas)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FlaskConical style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
          <span style={{
            fontSize: '10px', fontWeight: 600, color: 'var(--text-primary)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            fontFamily: "'Inter', sans-serif",
          }}>
            Simulation Runs
          </span>
          {runs && runs.length > 0 && (
            <span style={{
              fontSize: '10px', fontWeight: 600, color: '#a78bfa',
              background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
              borderRadius: '99px', padding: '0 6px',
            }}>
              {runs.length}
            </span>
          )}
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh simulation runs"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
              color: 'var(--text-muted)', opacity: isRefreshing ? 0.5 : 1,
              display: 'flex', alignItems: 'center',
            }}
          >
            <RefreshCw style={{ width: 11, height: 11 }} />
          </button>
        )}
      </div>

      <div style={{ padding: '4px 0' }}>
        {loading || isRefreshing ? (
          <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[0, 1].map((i) => (
              <div key={i} className="skeleton rounded"
                style={{ height: '10px', width: i === 0 ? '70%' : '50%' }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ padding: '12px 14px', fontSize: '11px', color: '#f87171' }}>
            {error.message || 'Failed to load runs'}
          </div>
        ) : !runs || runs.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="No simulation runs"
            description="Select a profile to view its simulation history"
            compact
          />
        ) : (
          <div>
            {runs.map((run) => (
              <div key={run.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 14px', borderBottom: '1px solid var(--border-subtle)',
              }}>
                <div>
                  <div style={{
                    fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)',
                    fontFamily: "'Inter', sans-serif",
                  }}>
                    {run.scenarioLabel || `Run #${run.id?.slice(-4) || '?'}`}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
                    {fmtDate(run.executedAt)}
                  </div>
                </div>
                {run.simulatedScore !== undefined && run.simulatedScore !== null && (
                  <span style={{
                    fontSize: '11px', fontWeight: 600,
                    color: scoreColor(run.simulatedScore),
                    fontFamily: 'monospace',
                  }}>
                    {run.simulatedScore}%
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
