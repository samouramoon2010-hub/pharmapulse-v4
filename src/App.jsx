// ============================================================
// App.jsx — Production router v4 with full UI system
// ============================================================
import React, { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore }    from './store/authStore'
import { useSettingsStore, applyTheme } from './store/settingsStore'
import ErrorBoundary  from './components/ui/ErrorBoundary'
import AppLayout      from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import LoadingScreen  from './components/ui/LoadingScreen'
import ThemeProvider  from './theme/ThemeProvider'

// Every route below is lazy-loaded (React.lazy + one shared <Suspense>
// around <Routes>) so each page ships as its own chunk instead of all
// ~50 pages inflating the single main bundle a user must download
// before seeing even the login screen. LoginPageV3 is the one route
// on the unauthenticated critical path — kept eager so the first paint
// isn't gated behind an extra network round trip.
import LoginPageV3 from './pages/auth/LoginPageV3'

// Auth
const LoginPageV2      = lazy(() => import('./pages/auth/LoginPageV2'))
const UnauthorizedPage = lazy(() => import('./pages/auth/UnauthorizedPage'))

// Core
const DashboardPage  = lazy(() => import('./pages/dashboard/DashboardPage'))
const KpiEntryPage   = lazy(() => import('./pages/pharmacist/KpiEntryPage'))

// Admin
const PharmaciesPage   = lazy(() => import('./pages/admin/PharmaciesPage'))
const OrganizationPage = lazy(() => import('./pages/admin/OrganizationPage'))
const UsersPage        = lazy(() => import('./pages/admin/UsersPage'))
const ImportCenterPage = lazy(() => import('./pages/admin/ImportCenterPage'))
const DataExchangeStudioPage = lazy(() => import('./pages/admin/DataExchangeStudioPage'))
const AiIntakePage = lazy(() => import('./pages/admin/AiIntakePage'))
const ExportStudioPage = lazy(() => import('./pages/admin/ExportStudioPage'))
const AuditLogsPage       = lazy(() => import('./pages/admin/AuditLogsPage'))
const KpiManagementPage  = lazy(() => import('./pages/admin/KpiManagementPage'))
// RBAC Phase 1 — Territory Admin Pages
const PersonalTargetsPage = lazy(() => import('./pages/manager/PersonalTargetsPage'))
const EvaluationRegistryPage = lazy(() => import('./pages/admin/EvaluationRegistryPage'))
const EvaluationRunPage      = lazy(() => import('./pages/admin/EvaluationRunPage'))
const BranchClassificationsPage = lazy(() => import('./pages/admin/BranchClassificationsPage'))
const RankingsPage               = lazy(() => import('./pages/admin/RankingsPage'))
const DemoDataPage               = lazy(() => import('./pages/admin/DemoDataPage'))
const DynamicKpiShadowPage       = lazy(() => import('./pages/admin/DynamicKpiShadowPage'))
const RegionsPage   = lazy(() => import('./pages/admin/RegionsPage'))
const DistrictsPage = lazy(() => import('./pages/admin/DistrictsPage'))

// Shared
const SettingsPage         = lazy(() => import('./pages/settings/SettingsPage'))
const TargetsPage            = lazy(() => import('./pages/shared/TargetsPage'))
const ReportsPage            = lazy(() => import('./pages/shared/ReportsPage'))
const NotificationsPage      = lazy(() => import('./pages/shared/NotificationsPage'))
const PharmacistPerformancePage = lazy(() => import('./pages/pharmacist/PerformancePage'))
const TeamPage                  = lazy(() => import('./pages/manager/TeamPage'))
const BranchIntelligencePage    = lazy(() => import('./pages/branch/BranchIntelligencePage'))
const PharmacistIntelligencePage = lazy(() => import('./pages/pharmacist/PharmacistIntelligencePage'))
const MyPharmacistIntelligenceRedirect = lazy(() => import('./pages/pharmacist/MyPharmacistIntelligenceRedirect'))
const AboutPage    = lazy(() => import('./pages/shared/AboutPage'))
const ExecutiveDashboard = lazy(() => import('./pages/executive/ExecutiveDashboard'))

// Actions Layer — Phase 3C-3
const MyActionsPage = lazy(() => import('./pages/actions/MyActionsPage'))
const TasksPage     = lazy(() => import('./pages/actions/TasksPage'))

// Profile Studio — Phase 2A
const ProfileStudioPage = lazy(() => import('./pages/profileStudio/ProfileStudioPage'))

// Assistant — Visibility Hotfix
const AssistantPage = lazy(() => import('./pages/assistant/AssistantPage'))

// Item Sales Analytics — DX-12b (smart list aggregates)
const ItemSalesAnalyticsPage = lazy(() => import('./pages/smartList/ItemSalesAnalyticsPage'))

const WIP = ({ t }) => (
  <div className="flex flex-col items-center justify-center min-h-[400px]"
       style={{ color:'var(--text-muted)' }}>
    <div className="text-5xl mb-4">🚧</div>
    <div className="text-base font-semibold" style={{ color:'var(--text-secondary)' }}>{t}</div>
    <p className="text-sm mt-2">هذه الصفحة قيد التطوير</p>
  </div>
)

const ADMIN  = ['admin']
// Phase 3A-1B: territory roles gain read-only access to UsersPage.
// manager / branch_manager intentionally excluded — they have no user-management
// responsibility in the current build. Page enforces isReadOnly for list-scope roles.
const USERS_ROLES = ['admin', 'district_supervisor', 'regional_manager', 'general_manager']
// Phase 1A: EXEC_ROLES now includes all managerial tiers so users with
// hierarchy roles can reach Executive BI without a bounce loop.
// Data scoping inside the page remains unchanged (Phase 2 will add
// scope-resolver so each role sees only their allowed branches).
const EXEC_ROLES = [
  'admin',
  'manager',
  'branch_manager',
  'district_supervisor',
  'regional_manager',
  'general_manager',
]
// Phase 1A: MGR_UP extended to all hierarchy roles above pharmacist.
// Allows district_supervisor, regional_manager, and general_manager to
// reach team, branch intelligence, targets, reports, and personal-targets
// routes. Data scoping (assignedPharmacyIds) is Phase 2.
const MGR_UP = [
  'admin',
  'manager',
  'branch_manager',
  'district_supervisor',
  'regional_manager',
  'general_manager',
]
const ALL    = ['admin','manager','branch_manager','district_supervisor','regional_manager','general_manager','pharmacist']
// Profile Studio — Phase 2A: visible to admin/GM/DS/manager; hidden from pharmacist
const PS_ROLES = ['admin', 'general_manager', 'district_supervisor', 'manager']
const PR     = ({ roles = ALL, children }) => <ProtectedRoute allowedRoles={roles}>{children}</ProtectedRoute>

function HomeRedirect() {
  const { userProfile } = useAuthStore()
  return <Navigate to={userProfile ? '/dashboard' : '/login'} replace />
}

export default function App() {
  const { init, loading } = useAuthStore()
  const { theme } = useSettingsStore()

  useEffect(() => {
    applyTheme(theme)
    const u = init()
    return () => { if (typeof u === 'function') u() }
  }, [])

  // BrowserRouter is intentionally OUTSIDE the loading gate (login double-submit fix).
  // Moving it inside caused the router to unmount/remount during auth loading,
  // which orphaned the useNavigate() hook in LoginPage and silently dropped
  // the post-login navigation on the first attempt.
  return (
    <ThemeProvider>
    <BrowserRouter>
      <ErrorBoundary>
        {loading ? (
          <LoadingScreen message="جاري تحميل PharmaPulse..." />
        ) : (
          <Suspense fallback={<LoadingScreen message="جاري تحميل الصفحة..." />}>
          <Routes>
          {/* PR-1F Gate 3 cutover (user-approved, July 2026): /login now
              serves LoginPageV3 (animated live panel + Identity Gateway
              V3 card). LoginPageV2 is kept, unmodified, at /login-v2 for
              rollback/reference — see RC1_ROLLBACK_RUNBOOK.md. */}
          <Route path="/login"        element={<LoginPageV3 />} />
          <Route path="/login-v3"     element={<LoginPageV3 />} />
          <Route path="/login-v2"     element={<LoginPageV2 />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/about"        element={<AboutPage />} />
          <Route path="/"             element={<HomeRedirect />} />

          <Route element={<PR><AppLayout /></PR>}>
            {/* All roles */}
            <Route path="/dashboard"     element={<PR><DashboardPage /></PR>} />
            <Route path="/entry"         element={<PR><KpiEntryPage /></PR>} />
            <Route path="/performance"   element={<PR><PharmacistPerformancePage /></PR>} />
            <Route path="/notifications" element={<PR><NotificationsPage /></PR>} />
            <Route path="/settings"      element={<PR><SettingsPage /></PR>} />
            {/* My Intelligence — first-class pharmacist page. Resolves the
                current user's uid/pharmacyId and redirects to their own
                /pharmacist/:userId/intelligence. Replaces the former
                dev-only redirect shortcut. */}
            <Route path="/my-intelligence" element={<PR roles={['pharmacist']}><MyPharmacistIntelligenceRedirect /></PR>} />

            {/* Actions Layer — Phase 3C-3 */}
            <Route path="/actions/my"    element={<PR><MyActionsPage /></PR>} />
            <Route path="/actions/tasks" element={<PR roles={MGR_UP}><TasksPage /></PR>} />

            {/* Manager + Admin */}
            <Route path="/team"     element={<PR roles={MGR_UP}><TeamPage /></PR>} />
            {/* Branch Intelligence — Phase 5A (Sections 0-2 only; 3-6 in Phase 5B) */}
            <Route path="/branch/:branchId/intelligence" element={<PR roles={MGR_UP}><BranchIntelligencePage /></PR>} />
            {/* Pharmacist Intelligence — Phase 5C-3+. Route-level: all roles incl.
                pharmacist (individual-performance page). Page-level guard
                (PharmacistIntelligencePage) restricts pharmacists to their
                own userId — see ownership check inside the page. */}
            <Route path="/pharmacist/:userId/intelligence" element={<PR roles={ALL}><PharmacistIntelligencePage /></PR>} />
            {/* Item Sales Analytics — DX-12b: smart-list aggregates, managerial tiers */}
            <Route path="/item-sales" element={<PR roles={MGR_UP}><ItemSalesAnalyticsPage /></PR>} />
            <Route path="/targets"  element={<PR roles={MGR_UP}><TargetsPage /></PR>} />
            <Route path="/personal-targets" element={<PR roles={MGR_UP}><PersonalTargetsPage /></PR>} />
            <Route path="/reports"  element={<PR roles={MGR_UP}><ReportsPage /></PR>} />

            {/* Admin only */}
            <Route path="/executive"  element={<PR roles={EXEC_ROLES}><ExecutiveDashboard /></PR>} />
            <Route path="/pharmacies" element={<PR roles={ADMIN}><PharmaciesPage /></PR>} />
            {/* Sidebar-2: consolidated Branches/Regions/Districts/Classifications —
                the 4 individual routes below stay reachable by direct URL,
                only removed from primary nav (same pattern as /import). */}
            <Route path="/admin/organization" element={<PR roles={ADMIN}><OrganizationPage /></PR>} />
            <Route path="/users"      element={<PR roles={USERS_ROLES}><UsersPage /></PR>} />
            <Route path="/import"     element={<PR roles={ADMIN}><ImportCenterPage /></PR>} />
            {/* DX-2/DX-3 — Data Exchange Studio: Organization Onboarding (separate from Import Center) */}
            <Route path="/data-exchange" element={<PR roles={ADMIN}><DataExchangeStudioPage /></PR>} />
            {/* Universal AI Intake Phase 1 — Excel/CSV/text/PDF/image front door onto the
                same secure Data Exchange import pipeline (import_jobs + adapters), not a
                parallel backend. Admin-only, same as Data Exchange Studio. */}
            <Route path="/ai-intake" element={<PR roles={ADMIN}><AiIntakePage /></PR>} />
            {/* DX-10 — Export Studio: separate subsystem from Data Exchange (Import) Studio */}
            <Route path="/export-studio" element={<PR roles={ADMIN}><ExportStudioPage /></PR>} />
            <Route path="/audit"      element={<PR roles={ADMIN}><AuditLogsPage /></PR>} />
            <Route path="/admin/kpis"      element={<PR roles={ADMIN}><KpiManagementPage /></PR>} />
            {/* RBAC Phase 1 — Territory Infrastructure (Admin only) */}
            <Route path="/admin/evaluation-registry" element={<PR roles={ADMIN}><EvaluationRegistryPage /></PR>} />
            <Route path="/admin/evaluation-run"      element={<PR roles={ADMIN}><EvaluationRunPage /></PR>} />
            <Route path="/admin/regions"   element={<PR roles={ADMIN}><RegionsPage /></PR>} />
            <Route path="/admin/districts" element={<PR roles={ADMIN}><DistrictsPage /></PR>} />
            {/* RF-0 — Branch Classification Foundation */}
            <Route path="/admin/classifications" element={<PR roles={ADMIN}><BranchClassificationsPage /></PR>} />
            {/* RF-1B — Rankings Preview */}
            <Route path="/admin/rankings" element={<PR roles={ADMIN}><RankingsPage /></PR>} />
            {/* RF-0E — Demo Data Seeder */}
            <Route path="/admin/demo-data" element={<PR roles={ADMIN}><DemoDataPage /></PR>} />
            {/* Controlled Cutover Phase 1 — Dynamic KPI Shadow Visibility (admin-only diagnostics) */}
            <Route path="/admin/dynamic-kpi-shadow" element={<PR roles={ADMIN}><DynamicKpiShadowPage /></PR>} />
            {/* Profile Studio — Phase 2A */}
            <Route path="/profile-studio" element={<PR roles={PS_ROLES}><ProfileStudioPage /></PR>} />
            {/* Assistant — Visibility Hotfix. Same role set as Profile Studio. */}
            <Route path="/assistant" element={<PR roles={PS_ROLES}><AssistantPage /></PR>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        )}
      </ErrorBoundary>
    </BrowserRouter>
    </ThemeProvider>
  )
}
