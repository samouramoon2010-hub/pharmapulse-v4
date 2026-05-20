// ============================================================
// App.jsx — Production router, no demo references
// ============================================================
import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import ErrorBoundary   from './components/ui/ErrorBoundary'
import AppLayout       from './components/layout/AppLayout'
import ProtectedRoute  from './components/layout/ProtectedRoute'
import LoadingScreen   from './components/ui/LoadingScreen'

// Auth
import LoginPage        from './pages/auth/LoginPage'
import UnauthorizedPage from './pages/auth/UnauthorizedPage'

// Core pages
import DashboardPage    from './pages/dashboard/DashboardPage'
import KpiEntryPage     from './pages/pharmacist/KpiEntryPage'

// Admin
import PharmaciesPage   from './pages/admin/PharmaciesPage'
import UsersPage        from './pages/admin/UsersPage'
import ImportCenterPage from './pages/admin/ImportCenterPage'
import AuditLogsPage    from './pages/admin/AuditLogsPage'

// Shared / lazy placeholders
const WIP = ({ t }) => (
  <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-600">
    <div className="text-5xl mb-4">🚧</div>
    <div className="text-slate-400 font-semibold">{t}</div>
  </div>
)

const ADMIN   = ['admin']
const MGR_UP  = ['admin','manager']
const ALL     = ['admin','manager','pharmacist']

const PR = ({ roles = ALL, children }) => (
  <ProtectedRoute allowedRoles={roles}>{children}</ProtectedRoute>
)

function HomeRedirect() {
  const { userProfile } = useAuthStore()
  return <Navigate to={userProfile ? '/dashboard' : '/login'} replace />
}

export default function App() {
  const { init, loading } = useAuthStore()
  useEffect(() => {
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
          <Route path="/"             element={<HomeRedirect />} />

          <Route element={<PR><AppLayout /></PR>}>
            {/* All roles */}
            <Route path="/dashboard"    element={<PR><DashboardPage /></PR>} />
            <Route path="/entry"        element={<PR><KpiEntryPage /></PR>} />
            <Route path="/performance"  element={<PR><WIP t="أدائي الشخصي" /></PR>} />
            <Route path="/notifications"element={<PR><WIP t="الإشعارات" /></PR>} />
            <Route path="/settings"     element={<PR><WIP t="الإعدادات" /></PR>} />

            {/* Manager + Admin */}
            <Route path="/team"         element={<PR roles={MGR_UP}><WIP t="إدارة الفريق" /></PR>} />
            <Route path="/targets"      element={<PR roles={MGR_UP}><WIP t="الأهداف" /></PR>} />
            <Route path="/reports"      element={<PR roles={MGR_UP}><WIP t="التقارير" /></PR>} />

            {/* Admin only */}
            <Route path="/pharmacies"   element={<PR roles={ADMIN}><PharmaciesPage /></PR>} />
            <Route path="/users"        element={<PR roles={ADMIN}><UsersPage /></PR>} />
            <Route path="/import"       element={<PR roles={ADMIN}><ImportCenterPage /></PR>} />
            <Route path="/audit"        element={<PR roles={ADMIN}><AuditLogsPage /></PR>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
