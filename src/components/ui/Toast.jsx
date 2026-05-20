// ============================================================
// Toast — lightweight in-app notifications
// ============================================================
import React, { useEffect, useState } from 'react'
import { create } from 'zustand'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

// Store
export const useToastStore = create((set, get) => ({
  toasts: [],
  show: (message, type = 'info', duration = 3500) => {
    const id = Date.now()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, duration)
  },
  success: (msg) => get().show(msg, 'success'),
  error:   (msg) => get().show(msg, 'error'),
  warning: (msg) => get().show(msg, 'warning'),
  info:    (msg) => get().show(msg, 'info'),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

const CONFIG = {
  success: { icon: CheckCircle2, bg: 'bg-green-500/20 border-green-500/30',  text: 'text-green-300' },
  error:   { icon: XCircle,      bg: 'bg-red-500/20 border-red-500/30',      text: 'text-red-300' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-500/20 border-amber-500/30', text: 'text-amber-300' },
  info:    { icon: Info,          bg: 'bg-blue-500/20 border-blue-500/30',   text: 'text-blue-300' },
}

// Container (place in AppLayout)
export function ToastContainer() {
  const { toasts, dismiss } = useToastStore()
  return (
    <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2 max-w-xs w-full">
      {toasts.map((t) => {
        const cfg = CONFIG[t.type] || CONFIG.info
        const Icon = cfg.icon
        return (
          <div key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-xl animate-slide-up ${cfg.bg}`}
          >
            <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${cfg.text}`} />
            <span className={`flex-1 text-sm font-medium ${cfg.text}`}>{t.message}</span>
            <button onClick={() => dismiss(t.id)} className={`flex-shrink-0 opacity-60 hover:opacity-100 ${cfg.text}`}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
