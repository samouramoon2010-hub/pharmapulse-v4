// ============================================================
// VersionHistoryPanel — Read-only version history (Phase 3A)
//
// Lists the current profile version plus every snapshot taken of
// it (snapshots are this system's only persisted historical record
// of past versions) via the existing listProfileSnapshots() service
// call. Read-only — no rollback, no restore, no editing.
//
// Visible only to roles that can approve/publish (admin,
// general_manager) per the existing permission matrix.
//
// NO Drag & Drop. NO Publish flow. NO Approval flow. NO AI.
// NO Excel import. NO Evaluation Engine changes.
// ============================================================
import React, { useEffect, useRef, useState } from 'react'
import { History } from 'lucide-react'

import VersionCard from './VersionCard'
import EmptyState from '../ui/EmptyState'
import { ErrorState } from '../ui/EmptyState'
import { SkeletonWidget } from '../ui/SkeletonCard'

import { listProfileSnapshots } from '../../profileStudio/profileStudioService'
import { normalizeError } from '../../profileStudio/profileStudioStore'
import { useProfileStudioPermissions } from '../../profileStudio/hooks/useProfileStudioPermissions'

export default function VersionHistoryPanel({ profile, actor }) {
  const permissions = useProfileStudioPermissions({ role: actor?.role, profileStatus: profile?.status })
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const cancelledRef = useRef(false)

  const canView = permissions.canApprove || permissions.canPublish

  useEffect(() => {
    if (!profile || !canView || loaded) return
    cancelledRef.current = false
    setLoading(true)
    setError(null)
    listProfileSnapshots(profile.id, actor)
      .then((list) => { if (!cancelledRef.current) { setSnapshots(list); setLoaded(true) } })
      .catch((err) => { if (!cancelledRef.current) setError(normalizeError(err)) })
      .finally(() => { if (!cancelledRef.current) setLoading(false) })
    return () => { cancelledRef.current = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, canView])

  if (!profile || !canView) return null

  if (loading) return <SkeletonWidget height={100} label="Version History" />
  if (error) return <ErrorState message={error.message} />

  const entries = [
    {
      version: profile.version,
      status: profile.status,
      updatedBy: profile.updatedBy || profile.createdBy || null,
      updatedAt: profile.updatedAt,
      publishedAt: profile.publishedAt,
      isCurrent: true,
    },
    ...snapshots.map((s) => ({
      version: s.version,
      status: s.status,
      updatedBy: null,
      updatedAt: s.createdAt,
      publishedAt: null,
      isCurrent: false,
    })),
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <History style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Version History
        </span>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No version history" description="This profile has no recorded versions yet" compact />
      ) : (
        entries.map((entry, idx) => <VersionCard key={idx} entry={entry} />)
      )}
    </div>
  )
}
