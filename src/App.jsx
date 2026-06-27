// ============================================================
// App.jsx — Production router v4 with full UI system
// ============================================================
import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore }    from './store/authStore'
import { useSettingsStore, applyTheme } from './store/settingsStore'
import ErrorBoundary  from './components/ui/ErrorBoundary'
import AppLayout      from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import LoadingScreen  from './components/ui/LoadingScreen'
import ThemeProvider  from './theme/ThemeProvider'

// Auth
import LoginPageV2      from './pages/auth/LoginPageV2'
import LoginPageV3      from './pages/auth/LoginPageV3'
import LoginConceptA    from './pages/auth/concepts/LoginConceptA'
import LoginConceptB    from './pages/auth/concepts/LoginConceptB'
import LoginConceptC    from './pages/auth/concepts/LoginConceptC'
import LoginNetworkPreview from './pages/auth/LoginNetworkPreview'
import LoginVortexPreview from './pages/auth/LoginVortexPreview'
import UnauthorizedPage from './pages/auth/UnauthorizedPage'

// Core
import DashboardPage  from './pages/dashboard/DashboardPage'
import KpiEntryPage   from './pages/pharmacist/KpiEntryPage'

// Admin
import PharmaciesPage   from './pages/admin/PharmaciesPage'
import UsersPage        from './pages/admin/UsersPage'
import ImportCenterPage from './pages/admin/ImportCenterPage'
import DataExchangeStudioPage from './pages/admin/DataExchangeStudioPage'
import ExportStudioPage from './pages/admin/ExportStudioPage'
import AuditLogsPage       from './pages/admin/AuditLogsPage'
import KpiManagementPage  from './pages/admin/KpiManagementPage'
// RBAC Phase 1 — Territory Admin Pages
import PersonalTargetsPage from './pages/manager/PersonalTargetsPage'
import EvaluationRegistryPage from './pages/admin/EvaluationRegistryPage'
import EvaluationRunPage      from './pages/admin/EvaluationRunPage'
import BranchClassificationsPage from './pages/admin/BranchClassificationsPage'
import RankingsPage               from './pages/admin/RankingsPage'
import DemoDataPage               from './pages/admin/DemoDataPage'
import DynamicKpiShadowPage       from './pages/admin/DynamicKpiShadowPage'
import RegionsPage   from './pages/admin/RegionsPage'
import DistrictsPage from './pages/admin/DistrictsPage'

// Shared
import SettingsPage         from './pages/settings/SettingsPage'
import TargetsPage            from './pages/shared/TargetsPage'
import ReportsPage            from './pages/shared/ReportsPage'
import NotificationsPage      from './pages/shared/NotificationsPage'
import PharmacistPerformancePage from './pages/pharmacist/PerformancePage'
import TeamPage                  from './pages/manager/TeamPage'
import BranchIntelligencePage    from './pages/branch/BranchIntelligencePage'
import PharmacistIntelligencePage from './pages/pharmacist/PharmacistIntelligencePage'
import MyPharmacistIntelligenceRedirect from './pages/pharmacist/MyPharmacistIntelligenceRedirect'
import AboutPage    from './pages/shared/AboutPage'
import ExecutiveDashboard from './pages/executive/ExecutiveDashboard'

// Actions Layer — Phase 3C-3
import MyActionsPage from './pages/actions/MyActionsPage'
import TasksPage     from './pages/actions/TasksPage'

// Profile Studio — Phase 2A
import ProfileStudioPage from './pages/profileStudio/ProfileStudioPage'

// Assistant — Visibility Hotfix
import AssistantPage from './pages/assistant/AssistantPage'

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
          <Routes>
          <Route path="/login"        element={<LoginPageV2 />} />
          {/* PR-1F Gate 2 — isolated static shell, reachable for evidence
              capture only. /login still serves LoginPageV2 untouched;
              cutover is an explicit, separate Gate 3 decision. */}
          <Route path="/login-v3"     element={<LoginPageV3 />} />
          {/* Login Design Exploration — visual-concept-only preview routes.
              Static local form state, no auth wiring. Not linked from any
              nav. See docs/production/LOGIN_DESIGN_EXPLORATION.md. */}
          <Route path="/login-concept-a" element={<LoginConceptA />} />
          <Route path="/login-concept-b" element={<LoginConceptB />} />
          <Route path="/login-concept-c" element={<LoginConceptC />} />
          {/* Login Network Preview — real animated background (code-built
              SVG/CSS network, captured to MP4) + a real-structure login
              panel. Local-only form state, no auth wiring. See
              docs/production/LOGIN_STATIC_BACKGROUND_PREVIEW.md. */}
          <Route path="/login-network-preview" element={<LoginNetworkPreview />} />
          {/* Login Vortex Preview — cropped, text-free portion of the
              rejected V3 reference artwork (glowing P + abstract spiral
              only), composited as an inset graphic on a flat canvas.
              Local-only form state, no auth wiring. See
              docs/production/LOGIN_VORTEX_PREVIEW.md. */}
          <Route path="/login-vortex-preview" element={<LoginVortexPreview />} />
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
            <Route path="/targets"  element={<PR roles={MGR_UP}><TargetsPage /></PR>} />
            <Route path="/personal-targets" element={<PR roles={MGR_UP}><PersonalTargetsPage /></PR>} />
            <Route path="/reports"  element={<PR roles={MGR_UP}><ReportsPage /></PR>} />

            {/* Admin only */}
            <Route path="/executive"  element={<PR roles={EXEC_ROLES}><ExecutiveDashboard /></PR>} />
            <Route path="/pharmacies" element={<PR roles={ADMIN}><PharmaciesPage /></PR>} />
            <Route path="/users"      element={<PR roles={USERS_ROLES}><UsersPage /></PR>} />
            <Route path="/import"     element={<PR roles={ADMIN}><ImportCenterPage /></PR>} />
            {/* DX-2/DX-3 — Data Exchange Studio: Organization Onboarding (separate from Import Center) */}
            <Route path="/data-exchange" element={<PR roles={ADMIN}><DataExchangeStudioPage /></PR>} />
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
        )}
      </ErrorBoundary>
    </BrowserRouter>
    </ThemeProvider>
  )
}
