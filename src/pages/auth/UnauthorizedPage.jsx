// ============================================================
// Unauthorized Page
// ============================================================
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldOff, ArrowRight } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

export default function UnauthorizedPage() {
  const navigate = useNavigate()
  const { userProfile } = useAuthStore()

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <div className="max-w-md w-full text-center animate-scale-in space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20
                        flex items-center justify-center mx-auto">
          <ShieldOff className="w-10 h-10 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">غير مصرح بالوصول</h1>
          <p className="text-slate-400 mt-2">
            ليس لديك صلاحية للوصول إلى هذه الصفحة.
          </p>
          <p className="text-xs text-slate-600 mt-1">
            دورك الحالي: {userProfile?.role || 'غير محدد'}
          </p>
        </div>
        <button onClick={() => navigate('/dashboard')} className="btn btn-primary mx-auto gap-2">
          <ArrowRight className="w-4 h-4 rotate-180" /> العودة للرئيسية
        </button>
      </div>
    </div>
  )
}
