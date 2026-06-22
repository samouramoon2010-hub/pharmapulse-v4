// ============================================================
// SimulationSummaryCard — Simulation result overview (Phase 2J)
//
// Pure presentational card. Displays the overall score, basket
// scores, element scores, rule scores, issues, bands, and (when a
// previous result is supplied) the changed items computed by
// compareSimulationResults(). No simulation execution happens here.
//
// NO writes. NO publish flow. NO approval flow.
// ============================================================
import React from 'react'
import { Gauge, AlertTriangle, ArrowRight } from 'lucide-react'

import { compareSimulationResults } from '../../profileStudio/simulator'

function fmtScore(n) {
  return typeof n === 'number' ? n.toFixed(1) : '—'
}

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: '12px',
      padding: '4px 0', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

export default function SimulationSummaryCard({ result, previousResult }) {
  if (!result) return null

  const baskets = Object.values(result.baskets ?? {})
  const elements = Object.values(result.elements ?? {})
  const comparison = previousResult ? compareSimulationResults(previousResult, result) : null

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: '8px', padding: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Gauge style={{ width: 14, height: 14, color: result.valid ? '#34d399' : '#f87171' }} strokeWidth={1.5} />
        <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {fmtScore(result.score)}%
        </span>
        <span style={{
          fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '999px',
          color: result.valid ? '#34d399' : '#f87171',
          background: result.valid ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
        }}>
          {result.valid ? 'Valid' : 'Invalid'}
        </span>
        {comparison && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: comparison.scoreDelta >= 0 ? '#34d399' : '#f87171' }}>
            <ArrowRight style={{ width: 11, height: 11 }} />
            {comparison.scoreDelta >= 0 ? '+' : ''}{comparison.scoreDelta.toFixed(1)} vs previous run
          </span>
        )}
      </div>

      <Row label="Profile Version" value={result.profileVersion || '—'} />
      <Row label="Basket Count" value={baskets.length} />
      <Row label="Element Count" value={elements.length} />

      {baskets.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Basket Scores
          </div>
          {baskets.map((b) => (
            <Row key={b.basketId} label={b.label} value={`${fmtScore(b.score)}%`} />
          ))}
        </div>
      )}

      {elements.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Element Scores
          </div>
          {elements.map((e) => (
            <Row key={e.elementId} label={e.label} value={`${fmtScore(e.score)}%`} />
          ))}
        </div>
      )}

      {baskets.some((b) => b.elements?.some((e) => e.rules?.length)) && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Rule Scores
          </div>
          {baskets.flatMap((b) => b.elements ?? []).flatMap((e) => e.rules ?? []).map((r) => (
            <Row
              key={r.ruleId}
              label={`${r.kpiKey}${r.bandLabel ? ` (${r.bandLabel})` : ''}`}
              value={`${fmtScore(r.score)}%`}
            />
          ))}
        </div>
      )}

      {result.issues?.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Issues
          </div>
          {result.issues.map((issue, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#fbbf24', padding: '2px 0' }}>
              <AlertTriangle style={{ width: 10, height: 10 }} />
              {issue}
            </div>
          ))}
        </div>
      )}

      {comparison && (comparison.changedBands.length > 0 || comparison.changedIssues.added.length > 0 || comparison.changedIssues.removed.length > 0) && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Changed Items
          </div>
          {comparison.changedBands.map((change) => (
            <div key={change.ruleId} style={{ fontSize: '10px', color: 'var(--text-secondary)', padding: '2px 0' }}>
              {change.kpiKey}: {change.bandBefore ?? '—'} → {change.bandAfter ?? '—'}
            </div>
          ))}
          {comparison.changedIssues.added.map((issue, idx) => (
            <div key={`added-${idx}`} style={{ fontSize: '10px', color: '#f87171', padding: '2px 0' }}>+ {issue}</div>
          ))}
          {comparison.changedIssues.removed.map((issue, idx) => (
            <div key={`removed-${idx}`} style={{ fontSize: '10px', color: '#34d399', padding: '2px 0' }}>− {issue}</div>
          ))}
        </div>
      )}
    </div>
  )
}
