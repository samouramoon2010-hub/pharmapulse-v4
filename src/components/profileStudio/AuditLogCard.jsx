// ============================================================
// AuditLogCard — Single audit log entry row (Phase 3C)
//
// Read-only display: action, performedBy, performedAt, notes, and
// the status transition (previousStatus → newStatus). No edit, no
// delete, no mutation affordance of any kind.
// ============================================================
import React from 'react'
import { ScrollText } from 'lucide-react'

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

export default function AuditLogCard({ log }) {
  if (!log) return null

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
        <ScrollText style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
            {log.action || '—'}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {log.previousStatus || '—'} → {log.newStatus || '—'}
          </span>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          performedBy={log.performedBy || '—'} · performedAt={fmtDate(log.performedAt)}
        </div>
        {log.notes && (
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {log.notes}
          </div>
        )}
      </div>
    </div>
  )
}
