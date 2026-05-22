// ============================================================
// LoadingScreen — Splash / route loading
// Premium zinc dark, minimal animation
// ============================================================
import React, { useEffect, useState } from 'react'
import Logo from '../brand/Logo'

export default function LoadingScreen({ message = 'Loading...' }) {
  const [visible, setVisible] = useState(false)

  // Slight delay before showing to avoid flash on fast loads
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      background:'var(--bg-canvas)',
      opacity: visible ? 1 : 0,
      transition:'opacity 0.3s ease',
    }}>
      {/* Ambient glow */}
      <div style={{
        position:'absolute', inset:0, pointerEvents:'none',
        background:'radial-gradient(ellipse 50% 35% at 50% 50%, rgba(0,210,173,0.05) 0%, transparent 70%)',
      }} />

      <div style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center', gap:'28px' }}
           className="animate-fade-in">
        <Logo size={44} />

        {/* Three-dot loader */}
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          {[0,1,2].map((i) => (
            <div key={i} style={{
              width:'5px', height:'5px', borderRadius:'50%',
              background:'var(--brand-500)',
              animation:'pulse 1.2s ease-in-out infinite',
              animationDelay:`${i * 0.2}s`,
              opacity:0.6,
            }} />
          ))}
        </div>

        <div style={{
          fontSize:'11px', color:'var(--text-muted)',
          fontFamily:"'Inter',sans-serif", letterSpacing:'0.02em',
        }}>
          {message}
        </div>
      </div>

      <div style={{
        position:'absolute', bottom:'24px',
        fontSize:'10px', color:'var(--text-muted)', opacity:0.4,
        fontFamily:"'Inter',sans-serif",
      }}>
        Samir Goda
      </div>
    </div>
  )
}
