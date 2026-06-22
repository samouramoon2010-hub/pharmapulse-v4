// ============================================================
// SnapshotCard — Single immutable snapshot row (Phase 3B)
//
// Read-only display: snapshot metadata, hash, createdBy, createdAt,
// profile version, status, and (when available) a lightweight
// comparison summary against the previous chronological snapshot.
// No restore, no mutation, no diff viewer.
// ============================================================
import React from 'react'
import { Camera } from 'lucide-react'

import ProfileStatusBadge from './ProfileStatusBadge'

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

export default function SnapshotCard({ snapshot, comparison }) {
  if (!snapshot) return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '8px 10px', borderRadius: '8px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      marginBottom: '6px',
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: '6px', flexShrink: 0,
        background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Camera style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
            v{snapshot.version || '—'}
          </span>
          <ProfileStatusBadge status={snapshot.status} size="xs" />
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          hash={snapshot.hash || '—'} · createdBy={snapshot.createdBy || '—'} · createdAt={fmtDate(snapshot.createdAt)}
        </div>
        {comparison && (
          <div style={{ fontSize: '10px', color: '#818cf8', marginTop: '2px' }}>
            {comparison.versionDirection} vs previous snapshot · hash {comparison.hashChanged ? 'changed' : 'unchanged'}
          </div>
        )}
      </div>
    </div>
  )
}
