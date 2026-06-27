// ============================================================
// Login Concept A — "Operational Intelligence"
//
// Visual exploration only — see docs/production/LOGIN_DESIGN_EXPLORATION.md.
// Static/local form state only. No auth wiring, no real submission,
// no Firebase import. Production /login is untouched.
//
// Idea: an abstract branch network rolling up into one pulse line —
// the same visual language as the real KPI-card/sparkline vocabulary
// and the existing Logo's heartbeat mark, just at composition scale.
// Uses the real token palette (--bg-canvas, --bg-surface, --brand-*)
// instead of inventing a new color system.
// ============================================================
import React, { useId, useState } from 'react'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Globe, Activity } from 'lucide-react'
import Logo from '../../../components/brand/Logo'

export default function LoginConceptA() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const emailId = useId()
  const passwordId = useId()

  const handleSubmit = (e) => {
    e.preventDefault()
    // Visual exploration only — intentionally no auth call.
  }

  const nodes = [
    { x: 12, y: 28 }, { x: 30, y: 58 }, { x: 50, y: 18 },
    { x: 68, y: 46 }, { x: 84, y: 30 },
  ]

  return (
    <div className="lca-root" dir="ltr">
      {/* This exploration hard-authors English copy, so dir="ltr" is set
          explicitly here — exactly what a real i18n-aware component would
          do for the active locale. The CSS below uses logical properties
          (inset-inline-*, text-align:start, padding-inline-*) so the same
          markup would correctly mirror its *content* under dir="rtl" with
          real Arabic copy, without manually flipping the composition. */}
      <style>{`
        .lca-root {
          position: relative;
          min-height: 100vh;
          background: var(--bg-canvas);
        }
        .lca-visual {
          position: relative;
          width: 100%;
          height: 160px;
          overflow: hidden;
          background:
            radial-gradient(circle at 70% 20%, rgba(45,212,191,0.10), transparent 55%),
            var(--bg-canvas);
        }
        .lca-visual-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
        .lca-card-wrap {
          position: relative;
          min-height: calc(100vh - 160px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px max(24px, env(safe-area-inset-bottom));
          box-sizing: border-box;
        }
        .lca-card {
          width: 100%;
          max-width: 420px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 32px rgba(0,0,0,0.3);
          padding: 28px;
          box-sizing: border-box;
        }
        .lca-eyebrow {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
          color: var(--text-brand); text-transform: uppercase;
          margin: 14px 0 6px;
        }
        .lca-heading {
          font-size: 23px; font-weight: 700; letter-spacing: -0.01em;
          color: var(--text-primary); margin: 0 0 4px;
          font-family: 'Inter', sans-serif;
        }
        .lca-sub {
          font-size: 13px; color: var(--text-secondary); margin: 0 0 18px;
          font-family: 'Inter', sans-serif;
        }
        .lca-form { display: flex; flex-direction: column; gap: 12px; }
        .lca-label {
          display: block; font-size: 12px; font-weight: 600;
          color: var(--text-secondary); margin-bottom: 6px;
          text-align: start;
        }
        .lca-field { position: relative; }
        .lca-icon-l {
          position: absolute; inset-inline-start: 12px; top: 50%; transform: translateY(-50%);
          color: var(--text-muted); pointer-events: none; display: flex;
        }
        .lca-input {
          width: 100%; height: 44px;
          padding-inline-start: 38px; padding-inline-end: 38px;
          background: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          font-size: 16px;
          font-family: 'Inter', sans-serif;
          color: var(--text-primary);
          outline: none;
          box-sizing: border-box;
          text-align: start;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .lca-input::placeholder { color: var(--text-muted); }
        .lca-input:focus-visible {
          border-color: var(--brand-400);
          box-shadow: 0 0 0 3px rgba(45,212,191,0.16);
        }
        .lca-icon-r {
          position: absolute; inset-inline-end: 4px; top: 50%; transform: translateY(-50%);
          width: 36px; height: 36px;
          color: var(--text-muted);
          display: flex; align-items: center; justify-content: center;
          background: none; border: none; border-radius: 8px; cursor: pointer;
        }
        .lca-row-end { display: flex; justify-content: flex-end; }
        .lca-link {
          background: none; border: none; cursor: pointer; padding: 2px 0;
          font-size: 12.5px; font-weight: 500; color: var(--text-brand);
          font-family: 'Inter', sans-serif;
        }
        .lca-btn {
          width: 100%; height: 44px;
          background: var(--brand-500);
          border: none; border-radius: 10px;
          font-size: 14px; font-weight: 600; color: #ffffff;
          font-family: 'Inter', sans-serif; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: filter 0.15s;
        }
        .lca-btn:hover { filter: brightness(1.08); }
        .lca-security {
          margin-top: 16px; text-align: center;
          font-size: 11px; color: var(--text-muted);
          font-family: 'Inter', sans-serif;
        }
        .lca-footer {
          margin-top: 12px; padding-top: 12px;
          border-top: 1px solid var(--border-subtle);
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 11.5px; color: var(--text-muted);
        }
        button:focus-visible, input:focus-visible {
          outline: 2px solid var(--brand-400); outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .lca-pulse-line { animation: none !important; }
        }
        @media (min-width: 1024px) {
          .lca-visual {
            position: absolute; inset-block: 0; inset-inline-end: 0;
            width: min(54%, 760px); height: auto;
          }
          .lca-card-wrap {
            margin-inline-end: min(54%, 760px);
            min-height: 100vh;
            padding: 40px;
          }
        }
      `}</style>

      <div className="lca-visual" aria-hidden="true">
        <svg className="lca-visual-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="lcaLine" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.15" />
              <stop offset="50%" stopColor="#2DD4BF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0D6B74" stopOpacity="0.6" />
            </linearGradient>
          </defs>
          {nodes.slice(0, -1).map((n, i) => (
            <line key={i} x1={n.x} y1={n.y} x2={nodes[i + 1].x} y2={nodes[i + 1].y}
              stroke="url(#lcaLine)" strokeWidth="0.6" className="lca-pulse-line" />
          ))}
          {nodes.map((n, i) => (
            <circle key={i} cx={n.x} cy={n.y} r={i === nodes.length - 1 ? 2.6 : 1.4}
              fill={i === nodes.length - 1 ? '#2DD4BF' : '#5EEAD4'} opacity={i === nodes.length - 1 ? 1 : 0.7} />
          ))}
        </svg>
      </div>

      <div className="lca-card-wrap">
        <div className="lca-card">
          <Logo size={30} />
          <div className="lca-eyebrow"><Activity style={{ width: 12, height: 12 }} aria-hidden="true" /> Pharmacy Operations Intelligence</div>
          <h1 className="lca-heading">Welcome back</h1>
          <p className="lca-sub">Sign in to your performance workspace</p>

          <form className="lca-form" onSubmit={handleSubmit} aria-label="Sign in to PharmaPulse">
            <div>
              <label className="lca-label" htmlFor={emailId}>Email address</label>
              <div className="lca-field">
                <span className="lca-icon-l" aria-hidden="true"><Mail style={{ width: 16, height: 16 }} /></span>
                <input id={emailId} type="email" name="email" autoComplete="email" required className="lca-input"
                  value={form.email} placeholder="you@pharmacy.com"
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="lca-label" htmlFor={passwordId}>Password</label>
              <div className="lca-field">
                <span className="lca-icon-l" aria-hidden="true"><Lock style={{ width: 16, height: 16 }} /></span>
                <input id={passwordId} type={showPass ? 'text' : 'password'} name="password" autoComplete="current-password" required className="lca-input"
                  value={form.password} placeholder="••••••••••••"
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                <button type="button" className="lca-icon-r" onClick={() => setShowPass(s => !s)}
                  aria-label={showPass ? 'Hide password' : 'Show password'} aria-pressed={showPass}>
                  {showPass ? <EyeOff style={{ width: 16, height: 16 }} aria-hidden="true" /> : <Eye style={{ width: 16, height: 16 }} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className="lca-row-end">
              <button type="button" className="lca-link" onClick={(e) => e.preventDefault()}>Forgot password?</button>
            </div>
            <button type="submit" className="lca-btn">
              Sign in <ArrowRight style={{ width: 16, height: 16 }} aria-hidden="true" />
            </button>
          </form>

          <div className="lca-security">Protected by PharmaPulse Identity — your data is encrypted and secure</div>
          <div className="lca-footer"><Globe style={{ width: 12, height: 12 }} aria-hidden="true" /> English</div>
        </div>
      </div>
    </div>
  )
}
