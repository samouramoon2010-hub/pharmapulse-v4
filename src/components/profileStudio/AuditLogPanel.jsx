// ============================================================
// AuditLogPanel — Read-only audit log list (Phase 3C)
//
// Lists audit log entries for the current profile via the existing
// profileStudioAuditLogs service (listAuditLogs). Every mutating
// Profile Studio service call already appends its own audit entry
// (createAuditLogDocument / writeAuditLog) — this panel only reads.
//
// Read-only. No edit. No delete. No mutation.
// ============================================================
import React, { useEffect, useRef, useState } from 'react'
import { ScrollText } from 'lucide-react'

import AuditLogCard from './AuditLogCard'
import EmptyState from '../ui/EmptyState'
import { ErrorState } from '../ui/EmptyState'
import { SkeletonWidget } from '../ui/SkeletonCard'

import { listAuditLogs } from '../../profileStudio/profileStudioService'
import { normalizeError } from '../../profileStudio/profileStudioStore'

export default function AuditLogPanel({ profile, actor }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!profile || loaded) return
    cancelledRef.current = false
    setLoading(true)
    setError(null)
    listAuditLogs(profile.id, actor)
      .then((list) => { if (!cancelledRef.current) { setLogs(list); setLoaded(true) } })
      .catch((err) => { if (!cancelledRef.current) setError(normalizeError(err)) })
      .finally(() => { if (!cancelledRef.current) setLoading(false) })
    return () => { cancelledRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  if (!profile) return null

  if (loading) return <SkeletonWidget height={100} label="Audit Log" />
  if (error) return <ErrorState message={error.message} />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <ScrollText style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Audit Log
        </span>
      </div>

      {logs.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit entries yet" description="Actions taken on this profile will appear here" compact />
      ) : (
        logs.map((log, idx) => <AuditLogCard key={log.auditId || idx} log={log} />)
      )}
    </div>
  )
}
