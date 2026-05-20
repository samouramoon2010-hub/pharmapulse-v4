// ============================================================
// ConfirmModal — reusable confirmation dialog
// ============================================================
import React from 'react'
import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmModal({
  open, onClose, onConfirm,
  title = 'تأكيد العملية',
  message = 'هل أنت متأكد؟',
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  danger = false,
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-slide-up">
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${danger ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
            <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-400' : 'text-amber-400'}`} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{title}</h3>
            <p className="text-sm text-slate-400 mt-1">{message}</p>
          </div>
          <button onClick={onClose} className="mr-auto text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">{cancelLabel}</button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={`flex-1 justify-center ${danger ? 'btn-danger' : 'btn-primary'}`}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
