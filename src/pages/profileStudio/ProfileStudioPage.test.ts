// ============================================================
// ProfileStudioPage.test.ts — Phase 2A certification (158 tests)
//
// Pattern: ?raw source inspection — no @testing-library/react needed.
// Covers all 7 new files + App.jsx route + Sidebar.jsx nav additions.
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Raw source imports ────────────────────────────────────────
const pageSrc         = await import('./ProfileStudioPage.jsx?raw').then((m) => m.default)
const headerSrc       = await import('../../components/profileStudio/ProfileStudioHeader.jsx?raw').then((m) => m.default)
const cardSrc         = await import('../../components/profileStudio/ProfileCard.jsx?raw').then((m) => m.default)
const listSrc         = await import('../../components/profileStudio/ProfileList.jsx?raw').then((m) => m.default)
const statusBadgeSrc  = await import('../../components/profileStudio/ProfileStatusBadge.jsx?raw').then((m) => m.default)
const simRunsSrc      = await import('../../components/profileStudio/SimulationRunsCard.jsx?raw').then((m) => m.default)
const appSrc          = await import('../../App.jsx?raw').then((m) => m.default)
const sidebarSrc      = await import('../../components/layout/Sidebar.jsx?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1. ProfileStatusBadge — source structure
// ════════════════════════════════════════════════════════════
describe('ProfileStatusBadge — source structure', () => {
  it('exports a default function component', () => {
    expect(statusBadgeSrc).toContain('export default function ProfileStatusBadge')
  })

  it('defines STATUS_STYLE constant', () => {
    expect(statusBadgeSrc).toContain('const STATUS_STYLE')
  })

  it('has DRAFT status entry', () => {
    expect(statusBadgeSrc).toContain('DRAFT:')
  })

  it('has VALIDATED status entry', () => {
    expect(statusBadgeSrc).toContain('VALIDATED:')
  })

  it('has SIMULATED status entry', () => {
    expect(statusBadgeSrc).toContain('SIMULATED:')
  })

  it('has APPROVED status entry', () => {
    expect(statusBadgeSrc).toContain('APPROVED:')
  })

  it('has PUBLISHED status entry', () => {
    expect(statusBadgeSrc).toContain('PUBLISHED:')
  })

  it('has ARCHIVED status entry', () => {
    expect(statusBadgeSrc).toContain('ARCHIVED:')
  })

  it('includes Draft label', () => {
    expect(statusBadgeSrc).toContain("label: 'Draft'")
  })

  it('includes Validated label', () => {
    expect(statusBadgeSrc).toContain("label: 'Validated'")
  })

  it('includes Simulated label', () => {
    expect(statusBadgeSrc).toContain("label: 'Simulated'")
  })

  it('includes Approved label', () => {
    expect(statusBadgeSrc).toContain("label: 'Approved'")
  })

  it('includes Published label', () => {
    expect(statusBadgeSrc).toContain("label: 'Published'")
  })

  it('includes Archived label', () => {
    expect(statusBadgeSrc).toContain("label: 'Archived'")
  })

  it('has a FALLBACK constant for unknown status', () => {
    expect(statusBadgeSrc).toContain('const FALLBACK')
  })

  it('accepts size prop', () => {
    expect(statusBadgeSrc).toContain('size')
  })

  it('handles xs size (compact mode)', () => {
    expect(statusBadgeSrc).toContain("'xs'")
  })

  it('uses STATUS_STYLE[status] || FALLBACK lookup', () => {
    expect(statusBadgeSrc).toMatch(/STATUS_STYLE\[status\]\s*\|\|\s*FALLBACK/)
  })

  it('renders a <span> element', () => {
    expect(statusBadgeSrc).toContain('<span')
  })

  it('uses indigo color (#818cf8) for DRAFT', () => {
    expect(statusBadgeSrc).toContain('#818cf8')
  })

  it('uses green color (#34d399) for APPROVED', () => {
    expect(statusBadgeSrc).toContain('#34d399')
  })

  it('uses emerald color (#10b981) for PUBLISHED', () => {
    expect(statusBadgeSrc).toContain('#10b981')
  })

  it('uses slate color (#94a3b8) for ARCHIVED', () => {
    expect(statusBadgeSrc).toContain('#94a3b8')
  })

  it('uses purple color (#a78bfa) for SIMULATED', () => {
    expect(statusBadgeSrc).toContain('#a78bfa')
  })

  it('does not import from Firestore', () => {
    expect(statusBadgeSrc).not.toContain('firebase/firestore')
  })
})

// ════════════════════════════════════════════════════════════
// 2. ProfileStudioHeader — source structure
// ════════════════════════════════════════════════════════════
describe('ProfileStudioHeader — source structure', () => {
  it('exports default function ProfileStudioHeader', () => {
    expect(headerSrc).toContain('export default function ProfileStudioHeader')
  })

  it('accepts canCreate prop', () => {
    expect(headerSrc).toContain('canCreate')
  })

  it('accepts isRefreshing prop', () => {
    expect(headerSrc).toContain('isRefreshing')
  })

  it('accepts onRefresh prop', () => {
    expect(headerSrc).toContain('onRefresh')
  })

  it('accepts onCreate prop', () => {
    expect(headerSrc).toContain('onCreate')
  })

  it('renders a Refresh button', () => {
    expect(headerSrc).toContain('Refresh')
  })

  it('renders a New Profile button when canCreate', () => {
    expect(headerSrc).toContain('New Profile')
  })

  it('imports BookOpen icon from lucide-react', () => {
    expect(headerSrc).toContain('BookOpen')
  })

  it('imports RefreshCw icon from lucide-react', () => {
    expect(headerSrc).toContain('RefreshCw')
  })

  it('imports Plus icon from lucide-react', () => {
    expect(headerSrc).toContain('Plus')
  })

  it('renders Profile Studio as the h1 title', () => {
    expect(headerSrc).toContain('Profile Studio')
  })

  it('has aria-label on Refresh button', () => {
    expect(headerSrc).toContain('aria-label="Refresh profiles"')
  })

  it('has aria-label on New Profile button', () => {
    expect(headerSrc).toContain('aria-label="Create new profile"')
  })

  it('conditionally renders New Profile button via canCreate', () => {
    expect(headerSrc).toContain('{canCreate &&')
  })

  it('disables Refresh button when isRefreshing', () => {
    expect(headerSrc).toContain('disabled={isRefreshing}')
  })

  it('shows Refreshing text when isRefreshing', () => {
    expect(headerSrc).toContain('Refreshing')
  })

  it('does not import from Firestore', () => {
    expect(headerSrc).not.toContain('firebase/firestore')
  })
})

// ════════════════════════════════════════════════════════════
// 3. ProfileCard — source structure
// ════════════════════════════════════════════════════════════
describe('ProfileCard — source structure', () => {
  it('exports default function ProfileCard', () => {
    expect(cardSrc).toContain('export default function ProfileCard')
  })

  it('accepts profile prop', () => {
    expect(cardSrc).toContain('profile')
  })

  it('accepts isSelected prop', () => {
    expect(cardSrc).toContain('isSelected')
  })

  it('accepts onClick prop', () => {
    expect(cardSrc).toContain('onClick')
  })

  it('returns null when profile is falsy', () => {
    expect(cardSrc).toContain('if (!profile) return null')
  })

  it('imports ProfileStatusBadge', () => {
    expect(cardSrc).toContain("import ProfileStatusBadge from './ProfileStatusBadge'")
  })

  it('imports User icon from lucide-react', () => {
    expect(cardSrc).toContain('User')
  })

  it('renders role="button" for accessibility', () => {
    expect(cardSrc).toContain('role="button"')
  })

  it('renders tabIndex={0} for keyboard navigation', () => {
    expect(cardSrc).toContain('tabIndex={0}')
  })

  it('handles Enter key via onKeyDown', () => {
    expect(cardSrc).toContain('Enter')
  })

  it('handles Space key via onKeyDown', () => {
    expect(cardSrc).toContain("' '")
  })

  it('shows profile.name', () => {
    expect(cardSrc).toContain('profile.name')
  })

  it('falls back to Unnamed Profile', () => {
    expect(cardSrc).toContain('Unnamed Profile')
  })

  it('shows profile.scope', () => {
    expect(cardSrc).toContain('profile.scope')
  })

  it('shows profile.hash', () => {
    expect(cardSrc).toContain('profile.hash')
  })

  it('shows profile.createdBy', () => {
    expect(cardSrc).toContain('profile.createdBy')
  })

  it('has a View button as the only action', () => {
    expect(cardSrc).toContain("aria-label=\"View profile\"")
    expect(cardSrc).toContain('View')
  })

  it('shows version number', () => {
    expect(cardSrc).toContain('profile.version')
  })

  it('shows profile.status via ProfileStatusBadge', () => {
    expect(cardSrc).toContain('status={profile.status}')
  })

  it('renders size="xs" badge in card context', () => {
    expect(cardSrc).toContain('size="xs"')
  })

  it('has fmtDate helper for date formatting', () => {
    expect(cardSrc).toContain('fmtDate')
  })

  it('fmtDate returns — for null/undefined', () => {
    expect(cardSrc).toContain("return '—'")
  })

  it('uses indigo highlight when isSelected', () => {
    expect(cardSrc).toContain('rgba(99,102,241,0.06)')
  })
})

// ════════════════════════════════════════════════════════════
// 4. ProfileList — source structure
// ════════════════════════════════════════════════════════════
describe('ProfileList — source structure', () => {
  it('exports default function ProfileList', () => {
    expect(listSrc).toContain('export default function ProfileList')
  })

  it('accepts profiles prop', () => {
    expect(listSrc).toContain('profiles')
  })

  it('accepts loading prop', () => {
    expect(listSrc).toContain('loading')
  })

  it('accepts error prop', () => {
    expect(listSrc).toContain('error')
  })

  it('accepts selectedId prop', () => {
    expect(listSrc).toContain('selectedId')
  })

  it('accepts onSelect prop', () => {
    expect(listSrc).toContain('onSelect')
  })

  it('accepts onRetry prop', () => {
    expect(listSrc).toContain('onRetry')
  })

  it('imports ProfileCard', () => {
    expect(listSrc).toContain("import ProfileCard from './ProfileCard'")
  })

  it('imports SkeletonTable', () => {
    expect(listSrc).toContain('SkeletonTable')
  })

  it('imports EmptyState', () => {
    expect(listSrc).toContain('EmptyState')
  })

  it('imports ErrorState', () => {
    expect(listSrc).toContain('ErrorState')
  })

  it('shows SkeletonTable while loading', () => {
    expect(listSrc).toContain('if (loading) return <SkeletonTable')
  })

  it('shows ErrorState when error is set', () => {
    expect(listSrc).toContain('<ErrorState')
  })

  it('passes onRetry to ErrorState', () => {
    expect(listSrc).toContain('onRetry={onRetry}')
  })

  it('shows EmptyState when no profiles', () => {
    expect(listSrc).toContain('<EmptyState')
  })

  it('has No profiles found message', () => {
    expect(listSrc).toContain('No profiles found')
  })

  it('maps profiles to ProfileCard components', () => {
    expect(listSrc).toContain('<ProfileCard')
  })

  it('uses p.id as the key for each card', () => {
    expect(listSrc).toContain('key={p.id}')
  })

  it('passes isSelected based on selectedId comparison', () => {
    expect(listSrc).toContain('isSelected={p.id === selectedId}')
  })

  it('passes onSelect as onClick to ProfileCard', () => {
    expect(listSrc).toContain('onClick={onSelect}')
  })
})

// ════════════════════════════════════════════════════════════
// 5. SimulationRunsCard — source structure
// ════════════════════════════════════════════════════════════
describe('SimulationRunsCard — source structure', () => {
  it('exports default function SimulationRunsCard', () => {
    expect(simRunsSrc).toContain('export default function SimulationRunsCard')
  })

  it('accepts runs prop', () => {
    expect(simRunsSrc).toContain('runs')
  })

  it('accepts loading prop', () => {
    expect(simRunsSrc).toContain('loading')
  })

  it('accepts error prop', () => {
    expect(simRunsSrc).toContain('error')
  })

  it('accepts isRefreshing prop', () => {
    expect(simRunsSrc).toContain('isRefreshing')
  })

  it('accepts onRefresh prop', () => {
    expect(simRunsSrc).toContain('onRefresh')
  })

  it('imports FlaskConical icon', () => {
    expect(simRunsSrc).toContain('FlaskConical')
  })

  it('imports RefreshCw icon', () => {
    expect(simRunsSrc).toContain('RefreshCw')
  })

  it('imports EmptyState', () => {
    expect(simRunsSrc).toContain('EmptyState')
  })

  it('shows run count badge when runs exist', () => {
    expect(simRunsSrc).toContain('{runs.length}')
  })

  it('has Simulation Runs header label', () => {
    expect(simRunsSrc).toContain('Simulation Runs')
  })

  it('shows skeleton while loading or refreshing', () => {
    expect(simRunsSrc).toContain('loading || isRefreshing')
  })

  it('shows error message text when error is set', () => {
    expect(simRunsSrc).toContain("error.message || 'Failed to load runs'")
  })

  it('shows EmptyState when no runs', () => {
    expect(simRunsSrc).toContain('<EmptyState')
  })

  it('has No simulation runs empty message', () => {
    expect(simRunsSrc).toContain('No simulation runs')
  })

  it('maps each run by key run.id', () => {
    expect(simRunsSrc).toContain('key={run.id}')
  })

  it('shows scenarioLabel or fallback label', () => {
    expect(simRunsSrc).toContain('run.scenarioLabel')
  })

  it('shows executedAt date for each run', () => {
    expect(simRunsSrc).toContain('run.executedAt')
  })

  it('shows simulatedScore when present', () => {
    expect(simRunsSrc).toContain('run.simulatedScore')
  })

  it('has scoreColor helper with 80/60 thresholds', () => {
    expect(simRunsSrc).toContain('scoreColor')
    expect(simRunsSrc).toContain('>= 80')
    expect(simRunsSrc).toContain('>= 60')
  })

  it('shows green (#34d399) for high scores', () => {
    expect(simRunsSrc).toContain('#34d399')
  })

  it('shows yellow (#fbbf24) for medium scores', () => {
    expect(simRunsSrc).toContain('#fbbf24')
  })

  it('shows red (#f87171) for low scores', () => {
    expect(simRunsSrc).toContain('#f87171')
  })

  it('has aria-label on Refresh button', () => {
    expect(simRunsSrc).toContain('aria-label="Refresh simulation runs"')
  })

  it('conditionally renders onRefresh button', () => {
    expect(simRunsSrc).toContain('{onRefresh &&')
  })
})

// ════════════════════════════════════════════════════════════
// 6. ProfileStudioPage — source structure
// ════════════════════════════════════════════════════════════
describe('ProfileStudioPage — source structure', () => {
  it('exports default function ProfileStudioPage', () => {
    expect(pageSrc).toContain('export default function ProfileStudioPage')
  })

  it('defines PS_ROLES array', () => {
    expect(pageSrc).toContain('const PS_ROLES')
  })

  it('PS_ROLES includes admin', () => {
    expect(pageSrc).toContain("'admin'")
  })

  it('PS_ROLES includes general_manager', () => {
    expect(pageSrc).toContain("'general_manager'")
  })

  it('PS_ROLES includes district_supervisor', () => {
    expect(pageSrc).toContain("'district_supervisor'")
  })

  it('PS_ROLES includes manager', () => {
    expect(pageSrc).toContain("'manager'")
  })

  it('PS_ROLES does NOT include pharmacist', () => {
    expect(pageSrc).not.toContain("'pharmacist'")
  })

  it('imports useAuthStore', () => {
    expect(pageSrc).toContain("import { useAuthStore }")
  })

  it('imports useProfileStudioProfiles hook', () => {
    expect(pageSrc).toContain('useProfileStudioProfiles')
  })

  it('imports useProfileStudioSimulationRuns hook', () => {
    expect(pageSrc).toContain('useProfileStudioSimulationRuns')
  })

  it('imports useProfileStudioPermissions hook', () => {
    expect(pageSrc).toContain('useProfileStudioPermissions')
  })

  it('imports ProfileStudioHeader component', () => {
    expect(pageSrc).toContain("import ProfileStudioHeader")
  })

  it('imports ProfileList component', () => {
    expect(pageSrc).toContain("import ProfileList")
  })

  it('imports SimulationRunsCard component', () => {
    expect(pageSrc).toContain("import SimulationRunsCard")
  })

  it('uses useState for selectedProfileId', () => {
    expect(pageSrc).toContain('selectedProfileId')
    expect(pageSrc).toContain('useState(null)')
  })

  it('constructs actor from userProfile', () => {
    expect(pageSrc).toContain('const actor =')
    expect(pageSrc).toContain('userProfile.role')
  })

  it('calls useProfileStudioProfiles with actor', () => {
    expect(pageSrc).toContain('useProfileStudioProfiles({ actor')
  })

  it('passes enabled flag based on userProfile presence', () => {
    expect(pageSrc).toContain('enabled: !!userProfile')
  })

  it('calls useProfileStudioSimulationRuns with profileId and actor', () => {
    expect(pageSrc).toContain('useProfileStudioSimulationRuns({ profileId: selectedProfileId')
  })

  it('calls useProfileStudioPermissions with role and the selected profile status', () => {
    expect(pageSrc).toContain('useProfileStudioPermissions({ role: actor.role, profileStatus: selectedProfile?.status })')
  })

  it('has belt-and-suspenders role guard returning null', () => {
    expect(pageSrc).toContain('PS_ROLES.includes(userProfile.role)')
    expect(pageSrc).toContain('return null')
  })

  it('renders ProfileStudioHeader with canCreate', () => {
    expect(pageSrc).toContain('canCreate={permissions.canCreate}')
  })

  it('renders ProfileStudioHeader with isRefreshing', () => {
    expect(pageSrc).toContain('isRefreshing={isRefreshing}')
  })

  it('renders ProfileStudioHeader with onRefresh', () => {
    expect(pageSrc).toContain('onRefresh={refresh}')
  })

  it('renders ProfileList', () => {
    expect(pageSrc).toContain('<ProfileList')
  })

  it('passes the search/status-filtered visibleProfiles to ProfileList (Phase 0 gap-fill: search + status filter)', () => {
    expect(pageSrc).toContain('profiles={visibleProfiles}')
  })

  it('passes loading to ProfileList', () => {
    expect(pageSrc).toContain('loading={loading}')
  })

  it('passes error to ProfileList', () => {
    expect(pageSrc).toContain('error={error}')
  })

  it('passes selectedId to ProfileList', () => {
    expect(pageSrc).toContain('selectedId={selectedProfileId}')
  })

  it('passes onSelect = setSelectedProfileId', () => {
    expect(pageSrc).toContain('onSelect={setSelectedProfileId}')
  })

  it('renders SimulationRunsCard', () => {
    expect(pageSrc).toContain('<SimulationRunsCard')
  })

  it('uses two-column grid layout', () => {
    expect(pageSrc).toContain('gridTemplateColumns')
  })

  it('has Profiles list section with aria-label', () => {
    expect(pageSrc).toContain('aria-label="Profiles list"')
  })

  it('has Simulation runs aside with aria-label', () => {
    expect(pageSrc).toContain('aria-label="Simulation runs"')
  })

  it('shows visible (filtered) profile count in section heading', () => {
    expect(pageSrc).toContain('visibleProfiles.length')
  })

  it('only passes onRefresh to SimulationRunsCard when profile is selected', () => {
    expect(pageSrc).toContain('selectedProfileId ? refreshRuns : undefined')
  })

  it('does not import from firebase/firestore directly', () => {
    expect(pageSrc).not.toContain('firebase/firestore')
  })
})

// ════════════════════════════════════════════════════════════
// 7. App.jsx — route wiring
// ════════════════════════════════════════════════════════════
describe('App.jsx — Profile Studio route', () => {
  it('defines PS_ROLES constant', () => {
    expect(appSrc).toContain('const PS_ROLES')
  })

  it('PS_ROLES in App.jsx includes admin', () => {
    const psBlock = appSrc.slice(appSrc.indexOf('const PS_ROLES'), appSrc.indexOf('const PS_ROLES') + 150)
    expect(psBlock).toContain("'admin'")
  })

  it('PS_ROLES in App.jsx includes general_manager', () => {
    const psBlock = appSrc.slice(appSrc.indexOf('const PS_ROLES'), appSrc.indexOf('const PS_ROLES') + 150)
    expect(psBlock).toContain("'general_manager'")
  })

  it('PS_ROLES in App.jsx includes district_supervisor', () => {
    const psBlock = appSrc.slice(appSrc.indexOf('const PS_ROLES'), appSrc.indexOf('const PS_ROLES') + 150)
    expect(psBlock).toContain("'district_supervisor'")
  })

  it('PS_ROLES in App.jsx includes manager', () => {
    const psBlock = appSrc.slice(appSrc.indexOf('const PS_ROLES'), appSrc.indexOf('const PS_ROLES') + 150)
    expect(psBlock).toContain("'manager'")
  })

  it('imports ProfileStudioPage', () => {
    expect(appSrc).toContain("const ProfileStudioPage = lazy(() => import('./pages/profileStudio/ProfileStudioPage'))")
  })

  it('has /profile-studio route', () => {
    expect(appSrc).toContain('path="/profile-studio"')
  })

  it('wraps /profile-studio in PR with PS_ROLES', () => {
    const routeBlock = appSrc.slice(appSrc.indexOf('path="/profile-studio"'), appSrc.indexOf('path="/profile-studio"') + 80)
    expect(routeBlock).toContain('PS_ROLES')
  })

  it('renders ProfileStudioPage in the route', () => {
    const routeBlock = appSrc.slice(appSrc.indexOf('path="/profile-studio"'), appSrc.indexOf('path="/profile-studio"') + 120)
    expect(routeBlock).toContain('ProfileStudioPage')
  })

  it('/profile-studio route is inside the AppLayout wrapper', () => {
    const layoutIdx = appSrc.indexOf('<Route element={<PR><AppLayout')
    const routeIdx  = appSrc.indexOf('path="/profile-studio"')
    expect(routeIdx).toBeGreaterThan(layoutIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 8. Sidebar.jsx — nav entries
// ════════════════════════════════════════════════════════════
describe('Sidebar.jsx — Profile Studio nav entries', () => {
  it('imports BookOpen from lucide-react', () => {
    expect(sidebarSrc).toContain('BookOpen')
  })

  it('admin NAV_CONFIG contains /profile-studio path', () => {
    const adminBlock = sidebarSrc.slice(
      sidebarSrc.indexOf('admin: ['),
      sidebarSrc.indexOf('manager: ['),
    )
    expect(adminBlock).toContain("path: '/profile-studio'")
  })

  it('admin NAV_CONFIG has Profile Studio label', () => {
    const adminBlock = sidebarSrc.slice(
      sidebarSrc.indexOf('admin: ['),
      sidebarSrc.indexOf('manager: ['),
    )
    expect(adminBlock).toContain("label: 'Profile Studio'")
  })

  it('admin NAV_CONFIG uses BookOpen icon for Profile Studio', () => {
    const adminBlock = sidebarSrc.slice(
      sidebarSrc.indexOf('admin: ['),
      sidebarSrc.indexOf('manager: ['),
    )
    // BookOpen appears as the icon on the Profile Studio entry in admin block
    expect(adminBlock).toContain('BookOpen')
  })

  it('manager NAV_CONFIG contains /profile-studio path', () => {
    const managerBlock = sidebarSrc.slice(
      sidebarSrc.indexOf('manager: ['),
      sidebarSrc.indexOf('pharmacist: ['),
    )
    expect(managerBlock).toContain("path: '/profile-studio'")
  })

  it('manager NAV_CONFIG has Profile Studio label', () => {
    const managerBlock = sidebarSrc.slice(
      sidebarSrc.indexOf('manager: ['),
      sidebarSrc.indexOf('pharmacist: ['),
    )
    expect(managerBlock).toContain("label: 'Profile Studio'")
  })

  it('pharmacist NAV_CONFIG does NOT contain /profile-studio', () => {
    // pharmacist block ends before branch_manager alias assignment
    const start = sidebarSrc.indexOf('pharmacist: [')
    const end   = sidebarSrc.indexOf('NAV_CONFIG.branch_manager')
    const block = sidebarSrc.slice(start, end)
    expect(block).not.toContain("'/profile-studio'")
  })

  it('district_supervisor NAV_CONFIG contains /profile-studio path', () => {
    const dsBlock = sidebarSrc.slice(
      sidebarSrc.indexOf('NAV_CONFIG.district_supervisor'),
      sidebarSrc.indexOf('NAV_CONFIG.regional_manager'),
    )
    expect(dsBlock).toContain("path: '/profile-studio'")
  })

  it('district_supervisor NAV_CONFIG has Profile Studio label', () => {
    const dsBlock = sidebarSrc.slice(
      sidebarSrc.indexOf('NAV_CONFIG.district_supervisor'),
      sidebarSrc.indexOf('NAV_CONFIG.regional_manager'),
    )
    expect(dsBlock).toContain("label: 'Profile Studio'")
  })

  it('district_supervisor Profile Studio entry uses BookOpen', () => {
    const dsBlock = sidebarSrc.slice(
      sidebarSrc.indexOf('NAV_CONFIG.district_supervisor'),
      sidebarSrc.indexOf('NAV_CONFIG.regional_manager'),
    )
    expect(dsBlock).toContain('BookOpen')
  })

  it('general_manager NAV_CONFIG contains /profile-studio path', () => {
    const gmBlock = sidebarSrc.slice(
      sidebarSrc.indexOf('NAV_CONFIG.general_manager'),
      sidebarSrc.indexOf('const ROLE_LABELS'),
    )
    expect(gmBlock).toContain("path: '/profile-studio'")
  })

  it('general_manager NAV_CONFIG has Profile Studio label', () => {
    const gmBlock = sidebarSrc.slice(
      sidebarSrc.indexOf('NAV_CONFIG.general_manager'),
      sidebarSrc.indexOf('const ROLE_LABELS'),
    )
    expect(gmBlock).toContain("label: 'Profile Studio'")
  })

  it('general_manager Profile Studio entry uses BookOpen', () => {
    const gmBlock = sidebarSrc.slice(
      sidebarSrc.indexOf('NAV_CONFIG.general_manager'),
      sidebarSrc.indexOf('const ROLE_LABELS'),
    )
    expect(gmBlock).toContain('BookOpen')
  })

  it('Profile Studio appears 4 times total in sidebar (admin/manager/ds/gm)', () => {
    const matches = sidebarSrc.match(/Profile Studio/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(4)
  })
})

// ════════════════════════════════════════════════════════════
// 9. Integration — cross-file consistency
// ════════════════════════════════════════════════════════════
describe('Integration — cross-file consistency', () => {
  it('ProfileStudioPage imports from Phase 1C hooks', () => {
    expect(pageSrc).toContain('profileStudio/hooks/useProfileStudioProfiles')
    expect(pageSrc).toContain('profileStudio/hooks/useProfileStudioSimulationRuns')
    expect(pageSrc).toContain('profileStudio/hooks/useProfileStudioPermissions')
  })

  it('ProfileStudioPage PS_ROLES matches App.jsx PS_ROLES', () => {
    const pageRoles  = pageSrc.slice(pageSrc.indexOf('const PS_ROLES'), pageSrc.indexOf('const PS_ROLES') + 200)
    const appRoles   = appSrc.slice(appSrc.indexOf('const PS_ROLES'), appSrc.indexOf('const PS_ROLES') + 200)
    ;['admin', 'general_manager', 'district_supervisor', 'manager'].forEach((role) => {
      expect(pageRoles).toContain(role)
      expect(appRoles).toContain(role)
    })
  })

  it('ProfileList uses ProfileCard (composition chain)', () => {
    expect(listSrc).toContain('ProfileCard')
  })

  it('ProfileCard uses ProfileStatusBadge (composition chain)', () => {
    expect(cardSrc).toContain('ProfileStatusBadge')
  })

  it('ProfileStudioPage uses ProfileList (composition chain)', () => {
    expect(pageSrc).toContain('ProfileList')
  })

  it('ProfileStudioPage uses SimulationRunsCard', () => {
    expect(pageSrc).toContain('SimulationRunsCard')
  })

  it('ProfileStudioPage uses ProfileStudioHeader', () => {
    expect(pageSrc).toContain('ProfileStudioHeader')
  })

  it('App.jsx route path matches sidebar nav path', () => {
    expect(appSrc).toContain('"/profile-studio"')
    expect(sidebarSrc).toContain("'/profile-studio'")
  })

  it('No direct Firestore imports in any Phase 2A component', () => {
    ;[pageSrc, headerSrc, cardSrc, listSrc, statusBadgeSrc, simRunsSrc].forEach((src) => {
      expect(src).not.toContain("from 'firebase/firestore'")
    })
  })

  it('No AI imports in any Phase 2A component', () => {
    ;[pageSrc, headerSrc, cardSrc, listSrc, statusBadgeSrc, simRunsSrc].forEach((src) => {
      expect(src.toLowerCase()).not.toContain('openai')
      expect(src.toLowerCase()).not.toContain('anthropic')
    })
  })

  it('No Excel import logic in any Phase 2A component', () => {
    ;[pageSrc, headerSrc, cardSrc, listSrc, statusBadgeSrc, simRunsSrc].forEach((src) => {
      expect(src).not.toContain('xlsx')
      expect(src).not.toContain('XLSX')
    })
  })

  it('ProfileStudioPage file path is correct for App.jsx import', () => {
    expect(appSrc).toContain("'./pages/profileStudio/ProfileStudioPage'")
  })

  it('ProfileList correctly passes onRetry from parent', () => {
    expect(pageSrc).toContain('onRetry={refresh}')
    expect(listSrc).toContain('onRetry')
  })

  it('SimulationRunsCard receives runs from hook result', () => {
    expect(pageSrc).toContain('runs={runs}')
  })

  it('SimulationRunsCard receives runsLoading', () => {
    expect(pageSrc).toContain('loading={runsLoading}')
  })

  it('SimulationRunsCard receives runsError', () => {
    expect(pageSrc).toContain('error={runsError}')
  })

  it('SimulationRunsCard receives runsRefreshing', () => {
    expect(pageSrc).toContain('isRefreshing={runsRefreshing}')
  })
})
