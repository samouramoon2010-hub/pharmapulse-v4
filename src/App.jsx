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

// Auth
import LoginPage        from './pages/auth/LoginPage'
import UnauthorizedPage from './pages/auth/UnauthorizedPage'

// Core
import DashboardPage  from './pages/dashboard/DashboardPage'
import KpiEntryPage   from './pages/pharmacist/KpiEntryPage'

// Admin
import PharmaciesPage   from './pages/admin/PharmaciesPage'
import UsersPage        from './pages/admin/UsersPage'
import ImportCenterPage from './pages/admin/ImportCenterPage'
import AuditLogsPage       from './pages/admin/AuditLogsPage'
import KpiManagementPage  from './pages/admin/KpiManagementPage'

// Shared
import SettingsPage         from './pages/shared/SettingsPage'
import TargetsPage            from './pages/shared/TargetsPage'
import ReportsPage            from './pages/shared/ReportsPage'
import NotificationsPage      from './pages/shared/NotificationsPage'
import PharmacistPerformancePage from './pages/pharmacist/PerformancePage'
import TeamPage                  from './pages/manager/TeamPage'
import AboutPage    from './pages/shared/AboutPage'
import ExecutiveDashboard from './pages/executive/ExecutiveDashboard'

const WIP = ({ t }) => (
  <div className="flex flex-col items-center justify-center min-h-[400px]"
       style={{ color:'var(--text-muted)' }}>
    <div className="text-5xl mb-4">🚧</div>
    <div className="text-base font-semibold" style={{ color:'var(--text-secondary)' }}>{t}</div>
    <p className="text-sm mt-2">هذه الصفحة قيد التطوير</p>
  </div>
)

const ADMIN  = ['admin']
const MGR_UP = ['admin','manager']
const ALL    = ['admin','manager','pharmacist']
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

  if (loading) return <LoadingScreen message="جاري تحميل PharmaPulse..." />

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/login"        element={<LoginPage />} />
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

            {/* Manager + Admin */}
            <Route path="/team"     element={<PR roles={MGR_UP}><TeamPage /></PR>} />
            <Route path="/targets"  element={<PR roles={MGR_UP}><TargetsPage /></PR>} />
            <Route path="/reports"  element={<PR roles={MGR_UP}><ReportsPage /></PR>} />

            {/* Admin only */}
            <Route path="/executive"  element={<PR roles={ADMIN}><ExecutiveDashboard /></PR>} />
            <Route path="/pharmacies" element={<PR roles={ADMIN}><PharmaciesPage /></PR>} />
            <Route path="/users"      element={<PR roles={ADMIN}><UsersPage /></PR>} />
            <Route path="/import"     element={<PR roles={ADMIN}><ImportCenterPage /></PR>} />
            <Route path="/audit"      element={<PR roles={ADMIN}><AuditLogsPage /></PR>} />
            <Route path="/admin/kpis" element={<PR roles={ADMIN}><KpiManagementPage /></PR>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
