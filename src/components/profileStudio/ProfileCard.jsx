// ============================================================
// ProfileCard — Single profile row card (Phase 2A, extended 2B)
//
// Displays: name, version, status, scope, hash, createdBy, updatedAt.
// Only action: View (selects the profile in the parent list).
// NO edit/approve/publish/archive buttons — read-only surface.
// ============================================================
import React from 'react'
import { User, Eye } from 'lucide-react'
import ProfileStatusBadge from './ProfileStatusBadge'

const SCOPE_LABEL = {
  PHARMACY: 'Branch',
  DISTRICT: 'District',
  REGION:   'Region',
  NATIONAL: 'National',
}

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

function fmtHash(hash) {
  if (!hash) return '—'
  return String(hash).slice(0, 8)
}

export default function ProfileCard({ profile, isSelected, onClick }) {
  if (!profile) return null

  const scopeLabel = SCOPE_LABEL[profile.scope] || profile.scope || '—'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(profile.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.(profile.id)
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
        background: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--bg-elevated)',
        border: `1px solid ${isSelected ? 'rgba(99,102,241,0.25)' : 'var(--border-subtle)'}`,
        transition: 'all 0.15s', marginBottom: '6px',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: '8px', flexShrink: 0,
        background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <User style={{ width: 14, height: 14, color: 'var(--text-muted)' }} strokeWidth={1.5} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          <span style={{
            fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)',
            fontFamily: "'Inter', sans-serif", letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {profile.name || 'Unnamed Profile'}
          </span>
          <ProfileStatusBadge status={profile.status} size="xs" />
        </div>
        <div style={{
          fontSize: '11px', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        }}>
          <span>{scopeLabel}</span>
          <span>·</span>
          <span>Updated {fmtDate(profile.updatedAt)}</span>
          <span>·</span>
          <span>by {profile.createdBy || '—'}</span>
          <span>·</span>
          <span style={{ fontFamily: 'monospace' }}>#{fmtHash(profile.hash)}</span>
        </div>
      </div>

      {profile.version !== undefined && (
        <span style={{
          fontSize: '10px', color: 'var(--text-muted)',
          fontFamily: 'monospace', flexShrink: 0,
        }}>
          v{profile.version}
        </span>
      )}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick?.(profile.id) }}
        aria-label="View profile"
        style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          fontSize: '10px', fontWeight: 500, color: 'var(--text-secondary)',
          background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
          borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', flexShrink: 0,
        }}
      >
        <Eye style={{ width: 11, height: 11 }} />
        View
      </button>
    </div>
  )
}
