// ============================================================
// PharmaPulse Logo — Premium, minimal SVG mark
// ============================================================
import React from 'react'

export default function Logo({ size = 32, showText = true, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoIcon size={size} />
      {showText && (
        <div style={{ lineHeight: 1 }}>
          <div style={{
            fontSize: Math.max(13, size * 0.42),
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.025em',
            fontFamily: "'Inter', sans-serif",
          }}>
            PharmaPulse
          </div>
          <div style={{
            fontSize: Math.max(9, size * 0.27),
            color: 'var(--text-muted)',
            marginTop: 1,
            letterSpacing: '0.02em',
            fontWeight: 400,
            fontFamily: "'Inter', sans-serif",
          }}>
            KPI Analytics
          </div>
        </div>
      )}
    </div>
  )
}

export function LogoIcon({ size = 32 }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.28),
      background: 'var(--brand-500)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      {/* Minimal pulse/chart mark */}
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 20 20" fill="none">
        <path
          d="M2 10 L5 10 L7 5 L9 15 L11 10 L13 10 L15 7 L17 13 L20 10"
          stroke="#09090b"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  )
}
