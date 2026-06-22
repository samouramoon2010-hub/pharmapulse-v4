// ============================================================
// PersonalIdentitySignature — Personal Identity Signature micro-bundle
//
// Presentation-only enhancement applied to a single recognized
// display name ("Samir Goda") wherever it appears in sidebar/profile
// surfaces. White-to-cyan gradient name, soft glow, a fixed subtitle,
// and a subtle ECG underline animation.
//
// No auth, no Firebase, no role/permission logic — purely visual.
// Any other displayName renders through the caller's normal fallback
// path untouched (see isSignatureIdentity()).
//
// Accessibility: prefers-reduced-motion → the ECG underline animation
// is removed via a class toggle; a static line renders instead.
// ============================================================
import React, { useEffect, useState } from 'react'

export const SIGNATURE_NAME = 'Samir Goda'
export const SIGNATURE_SUBTITLE = 'Senior Executive Pharmacist'

/** True only for the one recognized identity this signature treatment applies to. */
export function isSignatureIdentity(name) {
  return typeof name === 'string' && name.trim() === SIGNATURE_NAME
}

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

export default function PersonalIdentitySignature({ name, size = 'sm' }) {
  const reducedMotion = usePrefersReducedMotion()
  const fontSize = size === 'lg' ? '15px' : '12px'

  return (
    <span className={reducedMotion ? 'pis-static' : 'pis-animated'} style={{ display: 'inline-block' }}>
      <style>{`
        .pis-animated .pis-underline, .pis-static .pis-underline {
          display:block; width:100%; height:2px; margin-top:3px; position:relative; overflow:hidden;
          background:rgba(34,211,238,0.18); border-radius:1px;
        }
        .pis-animated .pis-underline::after {
          content:''; position:absolute; top:0; left:-40%; width:40%; height:100%;
          background:linear-gradient(90deg, rgba(34,211,238,0) 0%, #67e8f9 50%, rgba(139,92,246,0) 100%);
          animation: pisEcgSweep 2.4s ease-in-out infinite;
        }
        @keyframes pisEcgSweep {
          0%   { left:-40%; }
          100% { left:100%; }
        }
        .pis-static .pis-underline { background:rgba(34,211,238,0.35); }
      `}</style>
      <span className="pis-name" style={{
        fontSize, fontWeight: 700, letterSpacing: '-0.005em',
        fontFamily: "'Inter',sans-serif",
        background: 'linear-gradient(120deg, #F8FCFF 0%, #BAE6FD 55%, #22d3ee 100%)',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.35))',
        lineHeight: 1.2,
      }}>
        {name}
      </span>
      <span className="pis-underline" />
      <span style={{
        display: 'block', fontSize: '10px', marginTop: '2px',
        color: 'rgba(186,230,253,0.55)', fontFamily: "'Inter',sans-serif",
      }}>
        {SIGNATURE_SUBTITLE}
      </span>
    </span>
  )
}
