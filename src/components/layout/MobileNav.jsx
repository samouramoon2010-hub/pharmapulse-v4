// ============================================================
// Mobile Bottom Navigation — PR-1E1
// Visible only on small screens (lg:hidden). Role-aware primary
// destinations come from src/config/mobileNav.js (single source,
// shared canonical role resolution — no route list duplicated
// here). "More" reuses the existing Sidebar mobile drawer via
// onOpenMore/moreOpen props lifted from AppLayout — there is no
// second drawer and no fake "/more" route.
// Respects iPhone safe-area-inset-bottom.
// ============================================================
import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { getMobilePrimaryNav } from '../../config/mobileNav'

export default function MobileNav({ onOpenMore, moreOpen, moreTriggerRef }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { userProfile } = useAuthStore()

  const role  = userProfile?.role || 'pharmacist'
  const items = getMobilePrimaryNav(role)

  const isActive = (path, exact) =>
    exact ? location.pathname === path : (location.pathname === path || location.pathname.startsWith(path + '/'))

  return (
    <nav className="mobile-nav lg:hidden" aria-label="Primary mobile navigation">
      {items.map((item) => {
        const active = isActive(item.path, item.exact)
        return (
          <button key={item.key}
            onClick={() => navigate(item.path)}
            aria-current={active ? 'page' : undefined}
            className={`mobile-nav-item ${active ? 'active' : ''}`}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </button>
        )
      })}

      {/* "More" — opens the existing Sidebar mobile drawer. Not a route. */}
      <button
        ref={moreTriggerRef}
        type="button"
        onClick={onOpenMore}
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        aria-controls="mobile-more-drawer"
        aria-current={moreOpen ? 'page' : undefined}
        className={`mobile-nav-item ${moreOpen ? 'active' : ''}`}>
        <Menu className="w-5 h-5" />
        <span>More</span>
      </button>
    </nav>
  )
}
