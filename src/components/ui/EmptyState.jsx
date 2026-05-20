// ============================================================
// EmptyState — consistent empty placeholder
// ============================================================
import React from 'react'

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center justify-center mb-4">
          <Icon className="w-6 h-6 text-slate-600" />
        </div>
      )}
      <p className="text-slate-400 font-medium">{title}</p>
      {description && <p className="text-xs text-slate-600 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
