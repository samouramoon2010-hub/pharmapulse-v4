// ============================================================
// ConfirmModal — Premium enterprise dialog
// ============================================================
import React from 'react'
import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmModal({
  open, onClose, onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure?',
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  danger = false,
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm animate-scale-in rounded-xl p-5"
           style={{
             background: 'var(--bg-elevated)',
             border: '1px solid var(--border-default)',
             boxShadow: '0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
           }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{
                   background: danger ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                   border: `1px solid ${danger ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                 }}>
              <AlertTriangle className="w-4 h-4"
                style={{ color: danger ? '#f87171' : '#fbbf24' }} strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color:'var(--text-primary)', letterSpacing:'-0.01em' }}>
                {title}
              </h3>
              <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{message}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon -mt-0.5 -mr-0.5 opacity-50 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex gap-2.5 mt-4">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center text-xs">
            {cancelLabel}
          </button>
          <button onClick={() => { onConfirm(); onClose() }}
            className={`flex-1 justify-center text-xs btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            style={{ display:'flex', alignItems:'center' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
