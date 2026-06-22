// ============================================================
// SnapshotViewerPanel — Read-only snapshot inspection (Phase 3B)
//
// Lists snapshots for the current profile via the existing
// profileStudioSnapshots service (listProfileSnapshots) and shows,
// per snapshot, a lightweight comparison summary against the
// previous chronological snapshot using compareProfileVersions()
// from versioning.ts — no custom diff logic, no diff viewer.
//
// Visible only to roles that can approve/publish (admin,
// general_manager) per the existing permission matrix.
//
// Read-only. No restore. No mutation. No drag & drop. No AI.
// No Excel import. No Evaluation Engine changes.
// ============================================================
import React, { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'

import SnapshotCard from './SnapshotCard'
import EmptyState from '../ui/EmptyState'
import { ErrorState } from '../ui/EmptyState'
import { SkeletonWidget } from '../ui/SkeletonCard'

import { listProfileSnapshots } from '../../profileStudio/profileStudioService'
import { normalizeError } from '../../profileStudio/profileStudioStore'
import { compareProfileVersions } from '../../profileStudio/versioning'
import { useProfileStudioPermissions } from '../../profileStudio/hooks/useProfileStudioPermissions'

/** Builds a comparison summary for each snapshot against the one before it (chronologically). */
function buildComparisons(snapshotsNewestFirst) {
  const chronological = [...snapshotsNewestFirst].reverse()
  const map = new Map()
  for (let i = 1; i < chronological.length; i++) {
    const prev = chronological[i - 1]
    const curr = chronological[i]
    let versionDirection = 'unchanged'
    try {
      const cmp = compareProfileVersions(prev.version, curr.version)
      versionDirection = cmp < 0 ? 'upgraded' : cmp > 0 ? 'downgraded' : 'unchanged'
    } catch {
      versionDirection = 'unknown'
    }
    map.set(curr.snapshotId, { versionDirection, hashChanged: prev.hash !== curr.hash })
  }
  return map
}

export default function SnapshotViewerPanel({ profile, actor }) {
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

  if (loading) return <SkeletonWidget height={100} label="Snapshot Viewer" />
  if (error) return <ErrorState message={error.message} />

  const comparisons = buildComparisons(snapshots)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <Camera style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Snapshot Viewer
        </span>
      </div>

      {snapshots.length === 0 ? (
        <EmptyState icon={Camera} title="No snapshots yet" description="This profile has no recorded snapshots" compact />
      ) : (
        snapshots.map((snapshot) => (
          <SnapshotCard key={snapshot.snapshotId} snapshot={snapshot} comparison={comparisons.get(snapshot.snapshotId)} />
        ))
      )}
    </div>
  )
}
