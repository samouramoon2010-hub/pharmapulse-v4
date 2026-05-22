// ============================================================
// Toast System — Glassmorphism, theme-aware
// ============================================================
import React from 'react'
import { create } from 'zustand'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

export const useToastStore = create((set, get) => ({
  toasts: [],
  show: (message, type = 'info', duration = 3500) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2)}`
    set((s) => ({ toasts: [...s.toasts, { id, message, type, alive: true }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.map((t) => t.id === id ? { ...t, alive: false } : t) }))
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 350)
    }, duration)
  },
  success: (m, d) => get().show(m, 'success', d),
  error:   (m, d) => get().show(m, 'error',  d || 5000),
  warning: (m, d) => get().show(m, 'warning', d),
  info:    (m, d) => get().show(m, 'info',    d),
  dismiss: (id)   => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

const CONFIG = {
  success: { icon: CheckCircle2, iconColor:'#4ade80', accent:'rgba(34,197,94,0.2)',  border:'rgba(34,197,94,0.25)' },
  error:   { icon: XCircle,      iconColor:'#f87171', accent:'rgba(239,68,68,0.2)',  border:'rgba(239,68,68,0.3)' },
  warning: { icon: AlertTriangle,iconColor:'#fbbf24', accent:'rgba(245,158,11,0.15)',border:'rgba(245,158,11,0.25)' },
  info:    { icon: Info,         iconColor:'#60a5fa', accent:'rgba(59,130,246,0.15)',border:'rgba(59,130,246,0.25)' },
}

function Toast({ id, message, type, alive }) {
  const { dismiss } = useToastStore()
  const cfg = CONFIG[type] || CONFIG.info
  const Icon = cfg.icon
  return (
    <div className="pointer-events-auto max-w-sm w-full"
         style={{
           opacity:    alive ? 1 : 0,
           transform:  alive ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.97)',
           transition: 'all 350ms cubic-bezier(0.34,1.56,0.64,1)',
         }}>
      <div className="flex items-start gap-3 rounded-2xl px-4 py-3.5"
           style={{
             background: `var(--modal-bg)`,
             border:     `1px solid ${cfg.border}`,
             boxShadow:  `0 16px 40px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.04)`,
             backdropFilter: 'blur(24px)',
           }}>
        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cfg.iconColor }} />
        <span className="flex-1 text-sm font-medium leading-relaxed" style={{ color:'var(--text-primary)' }}>
          {message}
        </span>
        <button onClick={() => dismiss(id)}
          className="flex-shrink-0 opacity-40 hover:opacity-80 transition-opacity"
          style={{ color:'var(--text-secondary)' }}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export function ToastContainer() {
  const { toasts } = useToastStore()
  return (
    <div className="fixed bottom-5 left-5 z-[100] flex flex-col gap-2.5 pointer-events-none"
         style={{ bottom: 'calc(1.25rem + var(--mobile-nav-h))' }}>
      {toasts.map((t) => <Toast key={t.id} {...t} />)}
    </div>
  )
}
