// ============================================================
// IdentityPulseLogo — PharmaPulse Identity Gateway V3
//
// Glowing 3D "P" mark with an ECG pulse line passing through it.
// The mark softly breathes like a heartbeat. Purely decorative —
// no business data, no KPI values, no charts.
//
// Accessibility: prefers-reduced-motion → all CSS animations are
// removed via a class toggle; the mark renders as a static glow.
// ============================================================
import React, { useEffect, useState } from 'react'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export default function IdentityPulseLogo({ size = 220 }) {
  const reducedMotion = usePrefersReducedMotion()

  return (
    <div
      className={reducedMotion ? 'ipl-static' : 'ipl-animated'}
      style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <style>{`
        @keyframes iplBreathe {
          0%, 100% { transform: scale(1);    filter: drop-shadow(0 0 28px rgba(34,211,238,0.55)); }
          50%      { transform: scale(1.035); filter: drop-shadow(0 0 42px rgba(139,92,246,0.6)); }
        }
        @keyframes iplPulseSweep {
          0%   { stroke-dashoffset: 240; opacity: 0; }
          8%   { opacity: 1; }
          45%  { stroke-dashoffset: 0;   opacity: 1; }
          60%  { opacity: 0; }
          100% { stroke-dashoffset: 0;   opacity: 0; }
        }
        @keyframes iplRingPulse {
          0%   { transform: scale(0.92); opacity: 0.55; }
          70%  { transform: scale(1.25); opacity: 0; }
          100% { transform: scale(1.25); opacity: 0; }
        }
        .ipl-animated .ipl-mark  { animation: iplBreathe 3.2s ease-in-out infinite; }
        .ipl-animated .ipl-pulse { animation: iplPulseSweep 2.6s ease-in-out infinite; }
        .ipl-animated .ipl-ring  { animation: iplRingPulse 3.2s ease-out infinite; }
        .ipl-static .ipl-mark  { filter: drop-shadow(0 0 32px rgba(34,211,238,0.5)); }
        .ipl-static .ipl-pulse { opacity: 0.8; }
        .ipl-static .ipl-ring  { opacity: 0; }
      `}</style>

      <div className="ipl-ring" style={{
        position: 'absolute', inset: '8%', borderRadius: '50%',
        border: '1px solid rgba(34,211,238,0.4)',
      }} />

      <svg viewBox="0 0 200 200" width={size} height={size} className="ipl-mark" style={{ position: 'relative', zIndex: 1 }}>
        <defs>
          <linearGradient id="iplGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#22d3ee" />
            <stop offset="55%"  stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="iplPulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="50%"  stopColor="#67e8f9" stopOpacity="1" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Letter "P" — vertical stem + bowl */}
        <path
          d="M70 36 L70 164 M70 36 L118 36 C140 36 154 50 154 72 C154 94 140 108 118 108 L70 108"
          fill="none"
          stroke="url(#iplGrad)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* ECG pulse line passing through the P */}
        <path
          className="ipl-pulse"
          d="M10 100 L52 100 L66 70 L82 130 L96 100 L124 100 L136 84 L150 116 L190 100"
          fill="none"
          stroke="url(#iplPulseGrad)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="240"
        />
      </svg>
    </div>
  )
}
