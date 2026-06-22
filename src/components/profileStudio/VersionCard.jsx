// ============================================================
// VersionCard — Single version-history row (Phase 3A)
//
// Read-only display: version (+ major/minor/patch breakdown),
// status, updatedBy, updatedAt, publishedAt. No rollback, no
// restore, no editing affordance of any kind.
// ============================================================
import React from 'react'
import { GitCommit } from 'lucide-react'

import ProfileStatusBadge from './ProfileStatusBadge'
import { parseVersion } from '../../profileStudio/versioning'

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

export default function VersionCard({ entry }) {
  if (!entry) return null

  const parsed = parseVersion(entry.version || '')

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
        <GitCommit style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
            v{entry.version || '—'}
          </span>
          {parsed && (
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              major={parsed.major} · minor={parsed.minor} · patch={parsed.patch}
            </span>
          )}
          <ProfileStatusBadge status={entry.status} size="xs" />
          {entry.isCurrent && (
            <span style={{ fontSize: '9px', fontWeight: 600, color: '#818cf8', background: 'rgba(99,102,241,0.1)', borderRadius: '999px', padding: '1px 6px' }}>
              Current
            </span>
          )}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          updatedBy={entry.updatedBy || '—'} · updatedAt={fmtDate(entry.updatedAt)} · publishedAt={fmtDate(entry.publishedAt)}
        </div>
      </div>
    </div>
  )
}
