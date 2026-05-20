// ============================================================
// LoadingScreen - Full page loading state
// ============================================================

import React from 'react'

export default function LoadingScreen({ message = 'جاري التحميل...' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950">
      {/* Logo mark */}
      <div className="relative mb-8">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <span className="text-white font-bold text-lg">P</span>
          </div>
        </div>
        {/* Spinning ring */}
        <div className="absolute inset-0 rounded-2xl border-2 border-brand-500/30 border-t-brand-500 animate-spin" />
      </div>

      <p className="text-slate-400 text-sm">{message}</p>

      {/* Animated dots */}
      <div className="flex gap-1.5 mt-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-brand-500/60"
            style={{ animation: `pulse 1.2s ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  )
}
