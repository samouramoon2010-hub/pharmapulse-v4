// ============================================================
// Breadcrumb — persistent navigation context
// ============================================================
import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

const ROUTE_LABELS = {
  '/dashboard':    'Dashboard',
  '/entry':        'KPI Entry',
  '/performance':  'My Performance',
  '/targets':      'Targets',
  '/reports':      'Reports',
  '/notifications':'Notifications',
  '/settings':     'Settings',
  '/pharmacies':   'Pharmacies',
  '/users':        'Users',
  '/import':       'Import Center',
  '/audit':        'Audit Log',
  '/team':         'Team',
  '/about':        'About',
}

export default function Breadcrumb() {
  const location = useNavigate ? useLocation() : { pathname: '/' }
  const navigate  = useNavigate()
  const path      = location.pathname
  const label     = ROUTE_LABELS[path]
  if (!label || path === '/dashboard') return null

  return (
    <div className="breadcrumb mb-3">
      <button onClick={() => navigate('/dashboard')}
        style={{ color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer', padding:0, fontSize:'11px', fontFamily:"'Inter',sans-serif" }}
        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}>
        Dashboard
      </button>
      <ChevronLeft className="breadcrumb-sep" style={{ width:10, height:10 }} />
      <span className="breadcrumb-current">{label}</span>
    </div>
  )
}

// Page header with breadcrumb + title + actions
export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="page-header">
      <div>
        <Breadcrumb />
        <div className="page-title">{title}</div>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
        {children}
      </div>
      {actions && (
        <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
          {actions}
        </div>
      )}
    </div>
  )
}
