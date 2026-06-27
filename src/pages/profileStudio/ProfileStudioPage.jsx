// ============================================================
// ProfileStudioPage — Profile Studio shell page (Phase 2A)
//
// Role access: admin, general_manager, district_supervisor, manager
// Hidden from: pharmacist (enforced at route level + local guard)
// ============================================================
import React, { useState } from 'react'
import { Info } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useProfileStudioProfiles }      from '../../profileStudio/hooks/useProfileStudioProfiles'
import { useProfileStudioSimulationRuns } from '../../profileStudio/hooks/useProfileStudioSimulationRuns'
import { useProfileStudioPermissions }    from '../../profileStudio/hooks/useProfileStudioPermissions'
import ProfileStudioHeader  from '../../components/profileStudio/ProfileStudioHeader'
import ProfileFilterBar     from '../../components/profileStudio/ProfileFilterBar'
import ProfileList          from '../../components/profileStudio/ProfileList'
import SimulationRunsCard   from '../../components/profileStudio/SimulationRunsCard'
import CreateProfileModal   from '../../components/profileStudio/CreateProfileModal'
import ImportWizardModal    from '../../components/profileStudio/ImportWizardModal'
import ProfileDetailPanel   from '../../components/profileStudio/ProfileDetailPanel'

const PS_ROLES = ['admin', 'general_manager', 'district_supervisor', 'manager']

export default function ProfileStudioPage() {
  const { userProfile } = useAuthStore()
  const [selectedProfileId, setSelectedProfileId] = useState(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const actor = userProfile
    ? { uid: userProfile.uid || userProfile.id || '', role: userProfile.role }
    : { uid: '', role: null }

  // statusFilter passes straight through to the existing
  // where('status','==',...) query already supported by
  // listProfileDocuments() — no new Firestore query shape.
  const {
    profiles, loading, error, isRefreshing, refresh,
  } = useProfileStudioProfiles({ actor, enabled: !!userProfile, filters: statusFilter ? { status: statusFilter } : undefined })

  // Name search is client-side only, over the already-fetched list —
  // no additional Firestore read.
  const visibleProfiles = searchQuery.trim()
    ? profiles.filter((p) => (p.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : profiles

  const {
    runs,
    loading:     runsLoading,
    error:       runsError,
    isRefreshing: runsRefreshing,
    refresh:     refreshRuns,
  } = useProfileStudioSimulationRuns({ profileId: selectedProfileId, actor })

  // Selected profile is derived from the already-fetched list — no extra
  // read, no separate loading/error state.
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) || null

  // profileStatus is passed so canEdit reflects this specific profile's
  // editable status (DRAFT/VALIDATED/SIMULATED), not just the role check.
  const permissions = useProfileStudioPermissions({ role: actor.role, profileStatus: selectedProfile?.status })

  // Belt-and-suspenders guard — route-level PR already restricts access
  if (userProfile && !PS_ROLES.includes(userProfile.role)) return null

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1100px', margin: '0 auto' }}>
      <ProfileStudioHeader
        canCreate={permissions.canCreate}
        isRefreshing={isRefreshing}
        onRefresh={refresh}
        onCreate={() => setCreateModalOpen(true)}
        onImport={() => setImportModalOpen(true)}
      />

      {/* PR-1C: Profile Studio is an authoring tool only. "Publish" here
          creates a publish package in Profile Studio's own collection — it
          does not activate a profile in the live Evaluation Engine. Only a
          published profile in the Evaluation Registry does that. This
          banner exists so "Published" status here is never mistaken for
          production activation. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '8px',
        padding: '9px 12px', borderRadius: '8px', marginBottom: '14px',
        background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)',
        fontSize: '11px', color: 'var(--text-secondary)',
      }}>
        <Info style={{ width: 13, height: 13, color: '#60a5fa', flexShrink: 0, marginTop: 1 }} />
        <span>
          Profile Studio is an authoring and simulation workspace. Publishing a profile here does
          not activate it for live evaluation — only a profile published in the Evaluation
          Registry is used by the Evaluation Engine.
        </span>
      </div>

      {/* PR-1E6 — the fixed '1fr 320px' template forced the left column to
          ~39px at a 375px viewport (measured), crushing "All Profiles"
          into unreadable wrapped text. .profile-studio-grid stacks to a
          single column below 1024px so Simulation Runs moves below All
          Profiles instead of squeezing it. */}
      <div className="profile-studio-grid" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 320px',
        gap: '16px',
        alignItems: 'start',
      }}>
        <section aria-label="Profiles list">
          <div style={{
            fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            fontFamily: "'Inter', sans-serif",
            marginBottom: '10px',
          }}>
            All Profiles{!loading && !error && visibleProfiles.length > 0 ? ` (${visibleProfiles.length})` : ''}
          </div>
          <ProfileFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
          <ProfileList
            profiles={visibleProfiles}
            loading={loading}
            error={error}
            selectedId={selectedProfileId}
            onSelect={setSelectedProfileId}
            onRetry={refresh}
          />
        </section>

        <aside aria-label="Simulation runs">
          <SimulationRunsCard
            runs={runs}
            loading={runsLoading}
            error={runsError}
            isRefreshing={runsRefreshing}
            onRefresh={selectedProfileId ? refreshRuns : undefined}
          />
        </aside>
      </div>

      <section aria-label="Profile detail" style={{ marginTop: '16px' }}>
        <div style={{
          fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          fontFamily: "'Inter', sans-serif",
          marginBottom: '10px',
        }}>
          Profile Detail
        </div>
        {/* error is intentionally not forwarded here — ProfileList already
            renders the same list-fetch error above; passing it again would
            show the identical permission/error message twice on one page. */}
        <ProfileDetailPanel
          profile={selectedProfile}
          loading={loading}
          actor={actor}
          canEdit={permissions.canEdit}
          onSaved={refresh}
        />
      </section>

      <CreateProfileModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        actor={actor}
        onCreated={refresh}
      />

      <ImportWizardModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        actor={actor}
        onImported={refresh}
      />
    </div>
  )
}
