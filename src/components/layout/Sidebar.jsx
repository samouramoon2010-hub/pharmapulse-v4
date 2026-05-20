// ============================================================
// Sidebar — Production, role-aware
// ============================================================
import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, TrendingUp, Users,
  Building2, Target, BarChart2, FileSpreadsheet, Shield,
  Settings, LogOut, Bell, X, Activity,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

const NAV = {
  admin: [
    { group:'الرئيسية',  items:[
      { icon:LayoutDashboard, label:'لوحة التحكم',  path:'/dashboard' },
      { icon:TrendingUp,      label:'التحليلات',    path:'/reports' },
    ]},
    { group:'الإدارة', items:[
      { icon:Building2,      label:'الفروع',        path:'/pharmacies' },
      { icon:Users,          label:'المستخدمون',    path:'/users' },
      { icon:Target,         label:'الأهداف',       path:'/targets' },
    ]},
    { group:'العمليات', items:[
      { icon:FileSpreadsheet, label:'استيراد Excel', path:'/import' },
      { icon:Shield,          label:'سجل التدقيق',  path:'/audit' },
      { icon:Bell,            label:'الإشعارات',    path:'/notifications' },
    ]},
    { group:'', items:[{ icon:Settings, label:'الإعدادات', path:'/settings' }]},
  ],
  manager: [
    { group:'الرئيسية', items:[
      { icon:LayoutDashboard, label:'لوحة التحكم',  path:'/dashboard' },
      { icon:TrendingUp,      label:'التحليلات',    path:'/reports' },
    ]},
    { group:'الفريق', items:[
      { icon:Users,           label:'الفريق',       path:'/team' },
      { icon:Target,          label:'الأهداف',      path:'/targets' },
    ]},
    { group:'', items:[
      { icon:Bell,     label:'الإشعارات', path:'/notifications' },
      { icon:Settings, label:'الإعدادات', path:'/settings' },
    ]},
  ],
  pharmacist: [
    { group:'الرئيسية', items:[
      { icon:LayoutDashboard, label:'لوحة التحكم', path:'/dashboard' },
      { icon:ClipboardList,   label:'إدخال KPI',   path:'/entry' },
      { icon:TrendingUp,      label:'أدائي',        path:'/performance' },
    ]},
    { group:'', items:[
      { icon:Bell,     label:'الإشعارات', path:'/notifications' },
      { icon:Settings, label:'الإعدادات', path:'/settings' },
    ]},
  ],
}

function resolveNav(role) {
  if (role === 'admin') return NAV.admin
  if (role === 'manager') return NAV.manager
  return NAV.pharmacist
}

const ROLE_LABELS = { admin:'مدير النظام', manager:'مدير الفرع', pharmacist:'صيدلاني' }

export default function Sidebar({ mobileOpen, onClose }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { userProfile, logout } = useAuthStore()

  const role      = userProfile?.role || 'pharmacist'
  const navGroups = resolveNav(role)

  const isActive = (path) =>
    path === '/dashboard' ? location.pathname === path : location.pathname.startsWith(path)

  const go = (path) => { navigate(path); onClose?.() }
  const handleLogout = async () => { await logout(); navigate('/login') }

  const Content = () => (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-slate-800/60 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow flex-shrink-0">
            <Activity className="w-5 h-5 text-white"/>
          </div>
          <div>
            <div className="font-bold text-white text-[15px] leading-none">PharmaPulse</div>
            <div className="text-[11px] text-brand-400 mt-0.5 font-medium">Enterprise KPI</div>
          </div>
        </div>
      </div>

      <div className="mx-3 mt-3 p-3 rounded-xl bg-slate-800/40 border border-slate-800/80 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {userProfile?.displayName?.[0]||'U'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate leading-none mb-0.5">
              {userProfile?.displayName}
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/20 font-medium">
              {ROLE_LABELS[role]||role}
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-3 space-y-4">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.group && (
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-3.5 mb-1.5">
                {group.group}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <button key={item.path} onClick={() => go(item.path)}
                  className={`nav-item w-full text-right ${isActive(item.path) ? 'active' : ''}`}>
                  <item.icon className="w-4 h-4 flex-shrink-0"/>
                  <span className="flex-1 text-right">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-4 flex-shrink-0 border-t border-slate-800/60 pt-3">
        <button onClick={handleLogout}
          className="nav-item w-full text-right text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <LogOut className="w-4 h-4 flex-shrink-0"/>
          <span className="flex-1 text-right">تسجيل الخروج</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden lg:flex flex-col fixed right-0 top-0 bottom-0 z-30 bg-slate-950 border-l border-slate-800/60"
             style={{ width:'var(--sidebar-w)' }}>
        <Content/>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
          <aside className="absolute right-0 top-0 bottom-0 bg-slate-950 border-l border-slate-800"
                 style={{ width:'280px' }}>
            <button onClick={onClose} className="absolute top-4 left-4 btn btn-ghost btn-icon">
              <X className="w-5 h-5"/>
            </button>
            <Content/>
          </aside>
        </div>
      )}
    </>
  )
}
