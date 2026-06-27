// ============================================================
// Login Concept C — "Human Pharmacy Network"
//
// Visual exploration only — see docs/production/LOGIN_DESIGN_EXPLORATION.md.
// Static/local form state only. No auth wiring, no real submission,
// no Firebase import. Production /login is untouched.
//
// Idea: warmer, more human variant of the same brand-teal system —
// a soft organic cluster of branch/team nodes instead of a clinical
// grid, rounder card, a touch of the amber/warning token as a single
// accent dot. Still dark-canvas, still no invented color system.
// ============================================================
import React, { useId, useState } from 'react'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Globe, Users, Building2 } from 'lucide-react'
import Logo from '../../../components/brand/Logo'

export default function LoginConceptC() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const emailId = useId()
  const passwordId = useId()

  const handleSubmit = (e) => {
    e.preventDefault()
    // Visual exploration only — intentionally no auth call.
  }

  const blobs = [
    { x: '20%', y: '15%', s: 120, c: 'rgba(45,212,191,0.16)' },
    { x: '60%', y: '8%',  s: 90,  c: 'rgba(212,132,10,0.10)' },
    { x: '75%', y: '45%', s: 150, c: 'rgba(94,234,212,0.12)' },
    { x: '35%', y: '60%', s: 100, c: 'rgba(13,107,116,0.18)' },
    { x: '55%', y: '75%', s: 80,  c: 'rgba(45,212,191,0.10)' },
  ]

  return (
    <div className="lcc-root" dir="ltr">
      {/* See LoginConceptA.jsx for why dir="ltr" is set explicitly here. */}
      <style>{`
        .lcc-root {
          position: relative;
          min-height: 100vh;
          background: var(--bg-canvas);
        }
        .lcc-visual {
          position: relative;
          width: 100%;
          height: 150px;
          overflow: hidden;
        }
        .lcc-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(2px);
        }
        .lcc-visual-icons {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center; gap: 28px;
          color: var(--brand-300);
          opacity: 0.55;
        }
        .lcc-card-wrap {
          position: relative;
          min-height: calc(100vh - 150px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px max(24px, env(safe-area-inset-bottom));
          box-sizing: border-box;
        }
        .lcc-card {
          width: 100%;
          max-width: 420px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 32px rgba(0,0,0,0.3);
          padding: 28px;
          box-sizing: border-box;
        }
        .lcc-heading {
          font-size: 23px; font-weight: 700; letter-spacing: -0.01em;
          color: var(--text-primary); margin: 16px 0 4px;
          font-family: 'Inter', sans-serif;
        }
        .lcc-sub {
          font-size: 13px; color: var(--text-secondary); margin: 0 0 18px;
          font-family: 'Inter', sans-serif;
        }
        .lcc-form { display: flex; flex-direction: column; gap: 12px; }
        .lcc-label {
          display: block; font-size: 12px; font-weight: 600;
          color: var(--text-secondary); margin-bottom: 6px;
          text-align: start;
        }
        .lcc-field { position: relative; }
        .lcc-icon-l {
          position: absolute; inset-inline-start: 12px; top: 50%; transform: translateY(-50%);
          color: var(--text-muted); pointer-events: none; display: flex;
        }
        .lcc-input {
          width: 100%; height: 44px;
          padding-inline-start: 38px; padding-inline-end: 38px;
          background: var(--bg-canvas);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          font-size: 16px;
          font-family: 'Inter', sans-serif;
          color: var(--text-primary);
          outline: none;
          box-sizing: border-box;
          text-align: start;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .lcc-input::placeholder { color: var(--text-muted); }
        .lcc-input:focus-visible {
          border-color: var(--brand-400);
          box-shadow: 0 0 0 3px rgba(45,212,191,0.16);
        }
        .lcc-icon-r {
          position: absolute; inset-inline-end: 4px; top: 50%; transform: translateY(-50%);
          width: 36px; height: 36px;
          color: var(--text-muted);
          display: flex; align-items: center; justify-content: center;
          background: none; border: none; border-radius: 8px; cursor: pointer;
        }
        .lcc-row-end { display: flex; justify-content: flex-end; }
        .lcc-link {
          background: none; border: none; cursor: pointer; padding: 2px 0;
          font-size: 12.5px; font-weight: 500; color: var(--text-brand);
          font-family: 'Inter', sans-serif;
        }
        .lcc-btn {
          width: 100%; height: 44px;
          background: linear-gradient(135deg, var(--brand-400) 0%, var(--brand-600) 100%);
          border: none; border-radius: 12px;
          font-size: 14px; font-weight: 600; color: #ffffff;
          font-family: 'Inter', sans-serif; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: filter 0.15s;
        }
        .lcc-btn:hover { filter: brightness(1.08); }
        .lcc-security {
          margin-top: 16px; text-align: center;
          font-size: 11px; color: var(--text-muted);
          font-family: 'Inter', sans-serif;
        }
        .lcc-footer {
          margin-top: 12px; padding-top: 12px;
          border-top: 1px solid var(--border-subtle);
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 11.5px; color: var(--text-muted);
        }
        button:focus-visible, input:focus-visible {
          outline: 2px solid var(--brand-400); outline-offset: 2px;
        }
        @media (min-width: 1024px) {
          .lcc-visual {
            position: absolute; inset-block: 0; inset-inline-end: 0;
            width: min(54%, 760px); height: auto;
          }
          .lcc-card-wrap {
            margin-inline-end: min(54%, 760px);
            min-height: 100vh;
            padding: 40px;
          }
        }
      `}</style>

      <div className="lcc-visual" aria-hidden="true">
        {blobs.map((b, i) => (
          <span key={i} className="lcc-blob" style={{ left: b.x, top: b.y, width: b.s, height: b.s, background: b.c }} />
        ))}
        <div className="lcc-visual-icons">
          <Building2 style={{ width: 28, height: 28 }} />
          <Users style={{ width: 28, height: 28 }} />
        </div>
      </div>

      <div className="lcc-card-wrap">
        <div className="lcc-card">
          <Logo size={30} />
          <h1 className="lcc-heading">Welcome back</h1>
          <p className="lcc-sub">Sign in to support your pharmacy team today</p>

          <form className="lcc-form" onSubmit={handleSubmit} aria-label="Sign in to PharmaPulse">
            <div>
              <label className="lcc-label" htmlFor={emailId}>Email address</label>
              <div className="lcc-field">
                <span className="lcc-icon-l" aria-hidden="true"><Mail style={{ width: 16, height: 16 }} /></span>
                <input id={emailId} type="email" name="email" autoComplete="email" required className="lcc-input"
                  value={form.email} placeholder="you@pharmacy.com"
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="lcc-label" htmlFor={passwordId}>Password</label>
              <div className="lcc-field">
                <span className="lcc-icon-l" aria-hidden="true"><Lock style={{ width: 16, height: 16 }} /></span>
                <input id={passwordId} type={showPass ? 'text' : 'password'} name="password" autoComplete="current-password" required className="lcc-input"
                  value={form.password} placeholder="••••••••••••"
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                <button type="button" className="lcc-icon-r" onClick={() => setShowPass(s => !s)}
                  aria-label={showPass ? 'Hide password' : 'Show password'} aria-pressed={showPass}>
                  {showPass ? <EyeOff style={{ width: 16, height: 16 }} aria-hidden="true" /> : <Eye style={{ width: 16, height: 16 }} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className="lcc-row-end">
              <button type="button" className="lcc-link" onClick={(e) => e.preventDefault()}>Forgot password?</button>
            </div>
            <button type="submit" className="lcc-btn">
              Sign in <ArrowRight style={{ width: 16, height: 16 }} aria-hidden="true" />
            </button>
          </form>

          <div className="lcc-security">Protected by PharmaPulse Identity — your data is encrypted and secure</div>
          <div className="lcc-footer"><Globe style={{ width: 12, height: 12 }} aria-hidden="true" /> English</div>
        </div>
      </div>
    </div>
  )
}
