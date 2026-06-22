// ============================================================
// PublishSummaryCard — Publish package summary (Phase 3E; pipelineId/
// engineCompatibilityVersion rows added in the Phase 0 Foundation
// gap-fill audit)
//
// Pure presentational. Displays exactly the fields produced by the
// existing exportPublishPackage() kernel function — package id,
// hash, version, pipeline id, engine compatibility tag, publish
// readiness summary, optional simulation summary. No fields beyond
// what the kernel already returns.
// ============================================================
import React from 'react'
import { Package2 } from 'lucide-react'

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: '12px',
      padding: '4px 0', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-word', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function PublishSummaryCard({ pkg }) {
  if (!pkg) return null

  const readiness = pkg.publishReadinessSummary
  const simSummary = pkg.simulationSummary

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: '8px', padding: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Package2 style={{ width: 14, height: 14, color: '#34d399' }} strokeWidth={1.5} />
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Publish Package</span>
      </div>

      <Row label="Package ID" value={pkg.packageId || '—'} />
      <Row label="Profile Version" value={pkg.profileVersion || '—'} />
      <Row label="Pipeline ID" value={pkg.pipelineId || '—'} />
      <Row label="Engine Compatibility" value={pkg.engineCompatibilityVersion || '—'} />
      <Row label="Hash" value={pkg.hash || '—'} />
      <Row label="Created At" value={fmtDate(pkg.createdAt)} />

      {readiness && (
        <>
          <Row label="Readiness Valid" value={readiness.valid ? 'Yes' : 'No'} />
          <Row label="Issue Count" value={readiness.issueCount ?? 0} />
          <Row label="Critical Count" value={readiness.criticalCount ?? 0} />
          <Row label="Warning Count" value={readiness.warningCount ?? 0} />
        </>
      )}

      {simSummary && (
        <>
          <Row label="Simulation Score" value={`${simSummary.score}%`} />
          <Row label="Simulation Valid" value={simSummary.valid ? 'Yes' : 'No'} />
          <Row label="Basket Count" value={simSummary.basketCount ?? 0} />
        </>
      )}
    </div>
  )
}
