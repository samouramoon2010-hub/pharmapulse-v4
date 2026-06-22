// ============================================================
// ProfileFilterBar — Profile Dashboard search + status filter
// (Advanced Profile Studio, Phase 0 Foundation gap-fill)
//
// Search is a client-side substring match on the already-fetched
// profile list (no new Firestore query). Status filter passes
// straight through to the existing `filters.status` parameter that
// useProfileStudioProfiles/listProfileDocuments already supported
// before this change — this only wires up a control for it, the
// query itself (where('status','==',...) on the existing `profiles`
// collection) was already implemented and unchanged.
//
// Read-only UI: no edit/approve/publish actions live here.
// ============================================================
import React from 'react'
import { Search, X } from 'lucide-react'
import { PROFILE_STATUS } from '../../profileStudio/lifecycle'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: PROFILE_STATUS.DRAFT,     label: 'Draft' },
  { value: PROFILE_STATUS.VALIDATED, label: 'Validated' },
  { value: PROFILE_STATUS.SIMULATED, label: 'Simulated' },
  { value: PROFILE_STATUS.APPROVED,  label: 'Approved' },
  { value: PROFILE_STATUS.PUBLISHED, label: 'Published' },
  { value: PROFILE_STATUS.ARCHIVED,  label: 'Archived' },
]

export default function ProfileFilterBar({ searchQuery, onSearchChange, statusFilter, onStatusFilterChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
      <div style={{ position: 'relative', flex: 1 }}>
        <Search style={{
          position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
          width: 13, height: 13, color: 'var(--text-muted)', pointerEvents: 'none',
        }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search profiles by name…"
          aria-label="Search profiles by name"
          style={{
            width: '100%', fontSize: '12px', color: 'var(--text-primary)',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            borderRadius: '7px', padding: '6px 10px 6px 28px',
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            style={{
              position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
              display: 'flex', background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 0,
            }}
          >
            <X style={{ width: 12, height: 12 }} />
          </button>
        )}
      </div>

      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value)}
        aria-label="Filter by status"
        style={{
          fontSize: '12px', color: 'var(--text-primary)',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: '7px', padding: '6px 8px', cursor: 'pointer', flexShrink: 0,
        }}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}
