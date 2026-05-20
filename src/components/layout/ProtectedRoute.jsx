// ============================================================
// ProtectedRoute — Auth + Role guard
// ============================================================
import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import LoadingScreen from '../ui/LoadingScreen'

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, userProfile, loading } = useAuthStore()
  const location = useLocation()

  if (loading) return <LoadingScreen />
  if (!user || !userProfile) return <Navigate to="/login" state={{ from: location }} replace />

  if (allowedRoles && !allowedRoles.includes(userProfile.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}
