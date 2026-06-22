// ============================================================
// FuturisticAmbientLayer V2 — Executive Ambient Background
//
// REMOVED: Animated SVG flow lines and SMIL-driven particle paths.
//          These created visual noise crossing over content.
//
// RETAINED: Edge-anchored radial glow (never behind text).
//
// ADDED:
//   A. Gradient mesh — large soft CSS gradients, zero motion
//   B. Atmospheric edge glows — screen-corner only
//   C. Ultra-subtle drift particles — Canvas, 60 particles,
//      opacity ≤ 0.08, slow drift only, deterministic seed
//
// Design principle: information first, ambient second.
// If the background competes with content, the background loses.
//
// Theme gate: renders null for every theme except pharmapulse-futuristic.
// Performance: CSS for mesh/glows, Canvas rAF for particles.
// Accessibility: prefers-reduced-motion → canvas loop paused,
//               mesh and glows remain (static).
// ============================================================
import React, { useEffect, useRef } from 'react'
import { useSettingsStore } from '../../store/settingsStore'

// ── Deterministic particle seed (LCG) — no Math.random() ──────
function lcg(seed) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }
}
const _r = lcg(0x7a3f91bc)

// Build once at module level — deterministic across hot reloads
// 60 particles: very small, very slow, very low opacity
const PARTICLE_SEED = Array.from({ length: 60 }, (_, i) => ({
  xFrac:  _r(),
  yFrac:  _r(),
  // Extremely slow drift — max 0.22 px/frame vs 0.63 in login version
  vx:     (_r() - 0.5) * 0.22,
  vy:     (_r() - 0.5) * 0.12,
  r:      0.6 + _r() * 0.9,          // tiny: 0.6–1.5px radius
  alpha:  0.02 + _r() * 0.06,        // max 0.08 opacity — nearly invisible
  fade:   0.001 + _r() * 0.002,
  dir:    1,
  // Only cyan and very muted teal — no bright emerald in particles
  color: i % 3 === 0
    ? 'rgba(6,182,212,'    // cyan
    : 'rgba(13,107,116,',  // deep teal
}))

// ── Canvas particle component ──────────────────────────────────
function AmbientParticles() {
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const pausedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const setup = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    setup()

    // Initialise positions from deterministic seed
    let W = canvas.width, H = canvas.height
    const pts = PARTICLE_SEED.map(s => ({
      x:     s.xFrac * W,
      y:     s.yFrac * H,
      vx:    s.vx,
      vy:    s.vy,
      r:     s.r,
      alpha: s.alpha,
      fade:  s.fade,
      dir:   s.dir,
      color: s.color,
    }))

    // Respect prefers-reduced-motion
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    pausedRef.current = mq.matches
    const onMQ = (e) => { pausedRef.current = e.matches }
    mq.addEventListener('change', onMQ)

    const draw = () => {
      W = canvas.width; H = canvas.height
      ctx.clearRect(0, 0, W, H)

      if (!pausedRef.current) {
        for (const p of pts) {
          p.x += p.vx
          p.y += p.vy
          p.alpha += p.fade * p.dir
          if (p.alpha > 0.08 || p.alpha < 0.015) {
            p.dir *= -1
            p.alpha = Math.max(0.015, Math.min(0.08, p.alpha))
          }
          if (p.x < -4) p.x = W + 4
          if (p.x > W + 4) p.x = -4
          if (p.y < -4) p.y = H + 4
          if (p.y > H + 4) p.y = -4

          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fillStyle = `${p.color}${p.alpha.toFixed(3)})`
          ctx.fill()
        }
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()

    const onResize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(rafRef.current)
      mq.removeEventListener('change', onMQ)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  )
}

// ── Main component ─────────────────────────────────────────────
export default function FuturisticAmbientLayer() {
  const { theme } = useSettingsStore()

  // Gate: only render for futuristic theme
  if (theme !== 'pharmapulse-futuristic') return null

  return (
    <div
      aria-hidden="true"
      style={{
        position:      'fixed',
        inset:         0,
        zIndex:        0,
        pointerEvents: 'none',
        overflow:      'hidden',
      }}
    >
      {/* ── A. Gradient mesh — pure CSS, zero motion ────────────
          Three large soft gradients create a subtle depth field.
          No hard edges. No visible pattern. No motion.
          These never appear behind text — they sit at the canvas level. */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: [
          // Primary depth gradient — top to bottom
          'linear-gradient(180deg, rgba(7,20,38,0.0) 0%, rgba(2,6,23,0.6) 100%)',
          // Soft teal bloom — bottom left quadrant
          'radial-gradient(ellipse 55% 45% at 15% 85%, rgba(6,182,212,0.07) 0%, transparent 65%)',
          // Soft emerald trace — top right, very faint
          'radial-gradient(ellipse 40% 35% at 88% 12%, rgba(0,245,160,0.05) 0%, transparent 60%)',
        ].join(', '),
      }} />

      {/* ── B. Ultra-subtle particle field (Canvas) ─────────────
          60 tiny particles, max opacity 0.08, slow drift.
          Never visible against content — only perceptible against
          the dark canvas background in areas with no cards/text. */}
      <AmbientParticles />

      {/* ── C. Atmospheric edge glows ────────────────────────────
          Anchored to screen corners. Never overlaps page content
          because content is centre-weighted and the glows are
          positioned 10–12% outside the viewport edge. */}

      {/* Bottom-left: primary cyan atmospheric glow */}
      <div style={{
        position:     'absolute',
        bottom:       '-12%',
        left:         '-8%',
        width:        '48vw',
        height:       '48vw',
        maxWidth:     '580px',
        maxHeight:    '580px',
        borderRadius: '50%',
        background:   'radial-gradient(circle, rgba(6,182,212,0.08) 0%, rgba(6,182,212,0.03) 50%, transparent 72%)',
        // Static — no animation, respects reduced motion automatically
      }} />

      {/* Top-right: secondary emerald atmospheric trace */}
      <div style={{
        position:     'absolute',
        top:          '-10%',
        right:        '-8%',
        width:        '36vw',
        height:       '36vw',
        maxWidth:     '440px',
        maxHeight:    '440px',
        borderRadius: '50%',
        background:   'radial-gradient(circle, rgba(0,245,160,0.05) 0%, rgba(0,245,160,0.02) 45%, transparent 68%)',
      }} />

      {/* Top-left: ultra-faint depth accent */}
      <div style={{
        position:     'absolute',
        top:          '-8%',
        left:         '-6%',
        width:        '30vw',
        height:       '30vw',
        maxWidth:     '360px',
        maxHeight:    '360px',
        borderRadius: '50%',
        background:   'radial-gradient(circle, rgba(14,165,233,0.04) 0%, transparent 65%)',
      }} />
    </div>
  )
}
