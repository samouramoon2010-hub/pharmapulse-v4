// ============================================================
// MyPharmacistIntelligenceRedirect — /my-intelligence
//
// First-class pharmacist-facing route. Resolves the current
// authenticated user's uid/pharmacyId and redirects to:
//   /pharmacist/{uid}/intelligence?branchId={pharmacyId}&month={currentMonth}
//
// PharmacistIntelligencePage's ownership guard always allows a
// pharmacist to view userId === their own uid, so this redirect is
// always authorized for the pharmacist who navigates here.
// ============================================================

import { Navigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuthStore } from '../../store/authStore'

export default function MyPharmacistIntelligenceRedirect() {
  const { userProfile, loading } = useAuthStore()

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading your account…
      </div>
    )
  }

  const userId = userProfile?.uid
  const branchId = userProfile?.pharmacyId

  if (!userId || !branchId) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)',
                       border: '1px solid rgba(239,68,68,0.28)', color: '#ef4444', fontSize: '13px' }}>
          Could not resolve your user/pharmacy. Make sure your account has a pharmacy assigned.
        </div>
      </div>
    )
  }

  const month = format(new Date(), 'yyyy-MM')

  return <Navigate to={`/pharmacist/${userId}/intelligence?branchId=${branchId}&month=${month}`} replace />
}
