// ============================================================
// LoginLivePanel — Login V3 animated visual panel
//
// Replaces the static WebP LoginVisualPanel with a living scene:
//   1. Canvas background — drifting connected particles + a slowly
//      breathing teal halo (same ambient language as the app shell).
//   2. Product story (desktop ≥1024px only): headline + an animated
//      "at a glance" preview — counters ease up, the trend line draws
//      itself, the donut fills. Numbers are ILLUSTRATIVE product-
//      preview values (labeled "Preview"), never presented as the
//      viewer's real data — no Firestore read happens before login,
//      so claiming live data here would violate the data-trust rule.
//
// Conventions preserved from DataOceanBackground (the certified V2
// visual): deterministic seeded PRNG (no Math.random), full
// prefers-reduced-motion support (static single frame + final
// values, no rAF loop), decorative content is aria-hidden.
//
// Pure presentational: no Firebase, no store, no router imports.
// ============================================================
import React, { useEffect, useRef, useState } from 'react'
import { ShieldCheck, BarChart3, Target, MonitorSmartphone, TrendingUp, Users } from 'lucide-react'

// Deterministic PRNG (Park–Miller) — same scene every load, testable,
// and honors the repo convention that login visuals never use Math.random.
function createRng(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const PREVIEW = { performancePct: 112, smartListSalesM: 1.25, kpiAchievementPct: 89 }
const TREND = 'M0,48 L20,44 L45,45 L70,38 L95,40 L120,32 L145,34 L170,26 L195,28 L220,20 L245,22 L270,13 L300,10'
const DONUT_CIRC = 119.4

export default function LoginLivePanel() {
  const canvasRef = useRef(null)
  const trendRef = useRef(null)
  const [reduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const [counts, setCounts] = useState(() =>
    reduced ? PREVIEW : { performancePct: 0, smartListSalesM: 0, kpiAchievementPct: 0 }
  )
  const [drawn, setDrawn] = useState(reduced)

  // ── Canvas ambient scene ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const rng = createRng(20260705)
    let raf = null
    let W = 0, H = 0

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      W = r.width; H = r.height
      const dpr = window.devicePixelRatio || 1
      canvas.width = W * dpr; canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const pts = []
    for (let i = 0; i < 42; i++) {
      pts.push({
        x: rng(), y: rng(),
        vx: (rng() - 0.5) * 0.0004, vy: (rng() - 0.5) * 0.0004,
        r: 0.8 + rng() * 1.6, ph: rng() * 6,
      })
    }

    const frame = (t) => {
      ctx.clearRect(0, 0, W, H)
      const bg = ctx.createLinearGradient(0, 0, W, H)
      bg.addColorStop(0, '#071120'); bg.addColorStop(0.5, '#050b16'); bg.addColorStop(1, '#04121c')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

      const hx = W * 0.42, hy = H * 0.55
      const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, H * 0.9)
      halo.addColorStop(0, `rgba(20,211,172,${(0.06 + 0.02 * Math.sin(t * 0.5)).toFixed(3)})`)
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H)

      for (const p of pts) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > 1) p.vx *= -1
        if (p.y < 0 || p.y > 1) p.vy *= -1
      }
      ctx.lineWidth = 0.5
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = (pts[i].x - pts[j].x) * W, dy = (pts[i].y - pts[j].y) * H
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < 100) {
            ctx.strokeStyle = `rgba(20,211,172,${(0.10 * (1 - d / 100)).toFixed(3)})`
            ctx.beginPath()
            ctx.moveTo(pts[i].x * W, pts[i].y * H)
            ctx.lineTo(pts[j].x * W, pts[j].y * H)
            ctx.stroke()
          }
        }
      }
      for (const p of pts) {
        const a = 0.25 + 0.3 * Math.abs(Math.sin(t * 1.5 + p.ph))
        ctx.fillStyle = `rgba(20,211,172,${a.toFixed(3)})`
        ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r, 0, Math.PI * 2); ctx.fill()
      }
    }

    if (reduced) {
      frame(0)
    } else {
      let t = 0
      const loop = () => { frame(t); t += 0.016; raf = requestAnimationFrame(loop) }
      raf = requestAnimationFrame(loop)
    }
    return () => {
      window.removeEventListener('resize', resize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [reduced])

  // ── Counter + trend entrance (skipped entirely under reduced motion) ──
  useEffect(() => {
    if (reduced) return
    let raf = null
    const t0 = performance.now()
    const DUR = 1600
    const tick = (now) => {
      const u = Math.min(1, (now - t0 - 900) / DUR)
      if (u >= 0) {
        const e = 1 - Math.pow(1 - Math.max(0, u), 3)
        setCounts({
          performancePct: Math.round(PREVIEW.performancePct * e),
          smartListSalesM: +(PREVIEW.smartListSalesM * e).toFixed(2),
          kpiAchievementPct: Math.round(PREVIEW.kpiAchievementPct * e),
        })
      }
      if (u < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const drawTimer = setTimeout(() => setDrawn(true), 1100)
    return () => { if (raf) cancelAnimationFrame(raf); clearTimeout(drawTimer) }
  }, [reduced])

  const trendLen = 340 // > real path length; safe dash budget

  return (
    <div className="lgv3-visual" aria-hidden="true">
      <style>{`
        @keyframes lgv3LiveIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes lgv3EcgDash {
          0%   { stroke-dashoffset: 120; }
          55%  { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes lgv3LiveDot {
          0%, 100% { box-shadow: 0 0 0 rgba(20,211,172,0); }
          50%      { box-shadow: 0 0 10px rgba(20,211,172,0.9); }
        }
        .lgv3-live-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
        .lgv3-live-content {
          display: none;
          position: relative;
          z-index: 1;
          height: 100%;
          flex-direction: column;
          justify-content: center;
          padding: 48px 56px;
          box-sizing: border-box;
          font-family: 'Inter', sans-serif;
        }
        .lgv3-live-block { animation: lgv3LiveIn 0.8s cubic-bezier(0.22,1,0.36,1) both; }
        .lgv3-live-ecg { stroke-dasharray: 120; animation: lgv3EcgDash 2.6s ease infinite; }
        .lgv3-live-pulse-dot { animation: lgv3LiveDot 1.6s ease infinite; }
        @media (prefers-reduced-motion: reduce) {
          .lgv3-live-block { animation: none; }
          .lgv3-live-ecg { animation: none; stroke-dashoffset: 0; }
          .lgv3-live-pulse-dot { animation: none; }
        }
        @media (min-width: 1024px) {
          .lgv3-live-content { display: flex; }
        }
      `}</style>

      <canvas ref={canvasRef} className="lgv3-live-canvas" />

      <div className="lgv3-live-content" dir="ltr">
        {/* Brand */}
        <div className="lgv3-live-block" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, animationDelay: '0.1s' }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', border: '2px solid #14d3ac',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="22" height="12" viewBox="0 0 38 20">
              <path className="lgv3-live-ecg" d="M0,10 L8,10 L11,4 L15,16 L19,2 L23,14 L26,10 L38,10"
                fill="none" stroke="#14d3ac" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#f2f6fa' }}>Pharma</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#14d3ac' }}>Pulse</span>
            <div style={{ fontSize: 10.5, color: '#6d7f96', letterSpacing: '0.3px' }}>Pharmacy performance intelligence</div>
          </div>
        </div>

        {/* Headline */}
        <div className="lgv3-live-block" style={{ animationDelay: '0.25s' }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#f2f6fa', lineHeight: 1.25, letterSpacing: '-0.02em' }}>
            Turn your pharmacy data
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.25, letterSpacing: '-0.02em' }}>
            <span style={{ color: '#f2f6fa' }}>into </span>
            <span style={{ color: '#14d3ac' }}>exceptional performance</span>
          </div>
          <div style={{ fontSize: 14, color: '#8b9cb3', marginTop: 10, lineHeight: 1.7 }}>
            Smart insights. Real-time recommendations. Better decisions, every day.
          </div>
        </div>

        {/* Animated product preview — illustrative values, honestly labeled */}
        <div className="lgv3-live-block" style={{
          marginTop: 26, background: 'rgba(10,18,32,0.72)',
          border: '1px solid rgba(20,211,172,0.16)', borderRadius: 14, padding: 16,
          animationDelay: '0.45s', maxWidth: 560,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            <span className="lgv3-live-pulse-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#14d3ac', display: 'inline-block' }} />
            <span style={{ fontSize: 11, color: '#7d90a8' }}>Your performance, at a glance</span>
            <span style={{
              marginLeft: 'auto', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em',
              color: '#7d90a8', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 5, padding: '2px 6px',
            }}>PREVIEW</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 10, color: '#6d7f96', marginBottom: 4 }}>Total performance</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#14d3ac' }}>{counts.performancePct}%</div>
              <div style={{ fontSize: 10, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 3 }}>
                <TrendingUp size={11} /> vs target
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 10, color: '#6d7f96', marginBottom: 4 }}>Smart list sales</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#f2f6fa' }}>
                {counts.smartListSalesM.toFixed(2)}<span style={{ fontSize: 13, color: '#8b9cb3' }}>M</span>
              </div>
              <div style={{ fontSize: 10, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 3 }}>
                <TrendingUp size={11} /> month to date
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="46" height="46" viewBox="0 0 46 46">
                <circle cx="23" cy="23" r="19" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                <circle
                  cx="23" cy="23" r="19" fill="none" stroke="#14d3ac" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={DONUT_CIRC}
                  strokeDashoffset={reduced ? DONUT_CIRC * (1 - PREVIEW.kpiAchievementPct / 100) : (drawn ? DONUT_CIRC * (1 - PREVIEW.kpiAchievementPct / 100) : DONUT_CIRC)}
                  transform="rotate(-90 23 23)"
                  style={{ transition: reduced ? 'none' : 'stroke-dashoffset 1.8s cubic-bezier(0.22,1,0.36,1)' }}
                />
              </svg>
              <div>
                <div style={{ fontSize: 10, color: '#6d7f96' }}>KPI achievement</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#f2f6fa' }}>{counts.kpiAchievementPct}%</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, color: '#6d7f96', marginBottom: 6 }}>Sales trend</div>
            <svg width="100%" height="54" viewBox="0 0 300 54" preserveAspectRatio="none">
              <path
                d={`${TREND} L300,54 L0,54 Z`}
                fill="rgba(20,211,172,0.08)"
                style={{ opacity: drawn ? 1 : 0, transition: reduced ? 'none' : 'opacity 1s ease 1.6s' }}
              />
              <path
                ref={trendRef}
                d={TREND}
                fill="none" stroke="#14d3ac" strokeWidth="2" strokeLinecap="round"
                strokeDasharray={trendLen}
                strokeDashoffset={drawn ? 0 : trendLen}
                style={{ transition: reduced ? 'none' : 'stroke-dashoffset 2.2s ease' }}
              />
              <circle cx="300" cy="10" r="3.5" fill="#7dfce0"
                style={{ opacity: drawn ? 1 : 0, transition: 'opacity 0.6s ease 2s' }} />
            </svg>
          </div>
        </div>

        {/* Feature row */}
        <div className="lgv3-live-block" style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          marginTop: 20, maxWidth: 560, animationDelay: '0.7s',
        }}>
          {[
            [ShieldCheck, 'Secure and reliable'],
            [BarChart3, 'Smart analytics'],
            [Target, 'Actionable recommendations'],
            [MonitorSmartphone, 'Access anywhere'],
          ].map(([Icon, label]) => (
            <div key={label} style={{ textAlign: 'center', padding: '10px 4px' }}>
              <Icon size={20} style={{ color: '#14d3ac' }} />
              <div style={{ fontSize: 11, color: '#c8d4e2', marginTop: 5 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Motto */}
        <div className="lgv3-live-block" style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 26, animationDelay: '0.9s',
        }}>
          <Users size={15} style={{ color: '#6d7f96' }} />
          <span style={{ fontSize: 11, color: '#6d7f96' }}>One team&nbsp;&nbsp;·&nbsp;&nbsp;One goal&nbsp;&nbsp;·&nbsp;&nbsp;One success</span>
        </div>
      </div>

      <div className="lgv3-visual-overlay" />
    </div>
  )
}
