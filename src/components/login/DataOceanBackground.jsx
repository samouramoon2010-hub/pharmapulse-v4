// ============================================================
// DataOceanBackground — PharmaPulse Identity Gateway V3
//
// Flowing "data ocean" intelligence stream behind the identity
// mark — cyan / electric blue / violet particles drifting in
// smooth deterministic arcs. No native random generator is used
// anywhere — every particle's initial conditions come from a
// seeded LCG sequence
// computed once at module load, identical to the convention used
// in src/pages/auth/LoginPageV2.jsx's prior particle system and
// src/components/ui/FuturisticAmbientLayer.jsx.
//
// Accessibility: prefers-reduced-motion → the animation loop is
// never started; a single static frame is drawn instead.
// ============================================================
import React, { useEffect, useRef } from 'react'

function lcg(seed) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }
}
const _rng = lcg(0x9e3779b9)
const _r   = () => _rng()

const COLORS = ['rgba(34,211,238,', 'rgba(59,130,246,', 'rgba(139,92,246,']

const STREAM_SEED = Array.from({ length: 140 }, (_, i) => ({
  angle:   _r() * Math.PI * 2,
  radius:  0.18 + _r() * 0.82,
  speed:   0.0008 + _r() * 0.0016,
  drift:   (_r() - 0.5) * 0.0004,
  r:       0.6 + _r() * 1.8,
  alpha:   0.12 + _r() * 0.38,
  color:   COLORS[i % COLORS.length],
}))

export default function DataOceanBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let rafId = null

    const setup = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    setup()

    const cx = () => canvas.width / 2
    const cy = () => canvas.height / 2
    const maxR = () => Math.max(canvas.width, canvas.height) * 0.62

    const particles = STREAM_SEED.map((s) => ({ ...s, t: s.angle }))

    const drawFrame = () => {
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      for (const p of particles) {
        const radius = p.radius * maxR()
        const x = cx() + Math.cos(p.t) * radius
        const y = cy() + Math.sin(p.t) * radius * 0.62
        ctx.beginPath()
        ctx.arc(x, y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `${p.color}${p.alpha.toFixed(2)})`
        ctx.fill()
      }
    }

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) {
      drawFrame()
    } else {
      const animate = () => {
        for (const p of particles) {
          p.t += p.speed
          p.angle += p.drift
        }
        drawFrame()
        rafId = requestAnimationFrame(animate)
      }
      animate()
    }

    const onResize = () => setup()
    window.addEventListener('resize', onResize)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}
