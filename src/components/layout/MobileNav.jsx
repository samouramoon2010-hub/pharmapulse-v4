// ============================================================
// Mobile Bottom Navigation + FAB
// Visible only on small screens (lg:hidden)
// Respects iPhone safe-area-inset-bottom
// ============================================================
import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, TrendingUp, Bell, Settings, Plus } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

export default function MobileNav() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { userProfile } = useAuthStore()

  const role = userProfile?.role || 'pharmacist'
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  // Role-based nav items (max 4 around the FAB)
  const items = role === 'admin'
    ? [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
        { icon: TrendingUp,      label: 'Reports',   path: '/reports'   },
        { icon: Bell,            label: 'Alerts',    path: '/notifications' },
        { icon: Settings,        label: 'Settings',  path: '/settings'  },
      ]
    : role === 'manager'
    ? [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
        { icon: TrendingUp,      label: 'Reports',   path: '/reports'   },
        { icon: Bell,            label: 'Alerts',    path: '/notifications' },
        { icon: Settings,        label: 'Settings',  path: '/settings'  },
      ]
    : [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
        { icon: TrendingUp,      label: 'Performance', path: '/performance' },
        { icon: Bell,            label: 'Alerts',    path: '/notifications' },
        { icon: Settings,        label: 'Settings',  path: '/settings'  },
      ]

  // Split 2 left + FAB + 2 right
  const left  = items.slice(0, 2)
  const right = items.slice(2, 4)

  return (
    <nav className="mobile-nav lg:hidden">
      {/* Left items */}
      {left.map((item) => (
        <button key={item.path}
          onClick={() => navigate(item.path)}
          className={`mobile-nav-item ${isActive(item.path) ? 'active' : ''}`}>
          <item.icon className="w-5 h-5" />
          <span>{item.label}</span>
        </button>
      ))}

      {/* FAB — KPI Entry */}
      <button
        onClick={() => navigate('/entry')}
        className="mobile-fab"
        aria-label="KPI Entry">
        <Plus className="w-6 h-6" />
      </button>

      {/* Right items */}
      {right.map((item) => (
        <button key={item.path}
          onClick={() => navigate(item.path)}
          className={`mobile-nav-item ${isActive(item.path) ? 'active' : ''}`}>
          <item.icon className="w-5 h-5" />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
