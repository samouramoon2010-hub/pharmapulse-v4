// ============================================================
// ProfileList — Profile list with loading/empty/error states (Phase 2A)
// ============================================================
import React from 'react'
import { BookOpen } from 'lucide-react'
import ProfileCard from './ProfileCard'
import { SkeletonTable } from '../ui/SkeletonCard'
import EmptyState, { ErrorState } from '../ui/EmptyState'

export default function ProfileList({ profiles, loading, error, selectedId, onSelect, onRetry }) {
  if (loading) return <SkeletonTable rows={4} />

  if (error) {
    return (
      <ErrorState
        message={error.message || 'Failed to load profiles'}
        onRetry={onRetry}
      />
    )
  }

  if (!profiles || profiles.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No profiles found"
        description="Create a new profile to get started with Profile Studio"
      />
    )
  }

  return (
    <div>
      {profiles.map((p) => (
        <ProfileCard
          key={p.id}
          profile={p}
          isSelected={p.id === selectedId}
          onClick={onSelect}
        />
      ))}
    </div>
  )
}
