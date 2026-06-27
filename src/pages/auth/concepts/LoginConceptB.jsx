// ============================================================
// Login Concept B — "Executive Precision"
//
// Visual exploration only — see docs/production/LOGIN_DESIGN_EXPLORATION.md.
// Static/local form state only. No auth wiring, no real submission,
// no Firebase import. Production /login is untouched.
//
// Idea: no illustrated panel at all. A single, centered, typography-led
// column on the flat canvas token, underline-style inputs, one thin
// rule as the only decoration. Lowest visual complexity of the three.
// ============================================================
import React, { useId, useState } from 'react'
import { Mail, Lock, Eye, EyeOff, Globe } from 'lucide-react'
import Logo from '../../../components/brand/Logo'

export default function LoginConceptB() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const emailId = useId()
  const passwordId = useId()

  const handleSubmit = (e) => {
    e.preventDefault()
    // Visual exploration only — intentionally no auth call.
  }

  return (
    <div className="lcb-root" dir="ltr">
      {/* See LoginConceptA.jsx for why dir="ltr" is set explicitly here. */}
      <style>{`
        .lcb-root {
          min-height: 100vh;
          background:
            radial-gradient(ellipse 60% 50% at 50% 18%, rgba(45,212,191,0.06), transparent 70%),
            var(--bg-canvas);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 20px max(32px, env(safe-area-inset-bottom));
          box-sizing: border-box;
        }
        .lcb-col {
          width: 100%;
          max-width: 400px;
        }
        .lcb-brand { display: flex; justify-content: center; margin-bottom: 28px; }
        .lcb-rule {
          height: 1px;
          background: var(--border-subtle);
          margin: 0 0 24px;
        }
        .lcb-heading {
          font-size: 28px; font-weight: 700; letter-spacing: -0.02em;
          color: var(--text-primary); margin: 0 0 6px; text-align: center;
          font-family: 'Inter', sans-serif;
        }
        .lcb-sub {
          font-size: 13px; color: var(--text-secondary); margin: 0 0 26px;
          text-align: center; font-family: 'Inter', sans-serif;
        }
        .lcb-form { display: flex; flex-direction: column; gap: 18px; }
        .lcb-label {
          display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
          color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;
          text-align: start;
        }
        .lcb-field { position: relative; }
        .lcb-input {
          width: 100%; height: 38px;
          padding-inline-start: 26px; padding-inline-end: 36px;
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-default);
          font-size: 16px;
          font-family: 'Inter', sans-serif;
          color: var(--text-primary);
          outline: none;
          box-sizing: border-box;
          text-align: start;
          transition: border-color 0.15s;
        }
        .lcb-input::placeholder { color: var(--text-muted); }
        .lcb-input:focus-visible { border-bottom-color: var(--brand-400); }
        .lcb-icon-l {
          position: absolute; inset-inline-start: 0; top: 50%; transform: translateY(-50%);
          color: var(--text-muted); pointer-events: none; display: flex;
        }
        .lcb-icon-r {
          position: absolute; inset-inline-end: 0; top: 50%; transform: translateY(-50%);
          width: 30px; height: 30px;
          color: var(--text-muted);
          display: flex; align-items: center; justify-content: center;
          background: none; border: none; cursor: pointer;
        }
        .lcb-row-end { display: flex; justify-content: flex-end; margin-top: -6px; }
        .lcb-link {
          background: none; border: none; cursor: pointer; padding: 2px 0;
          font-size: 12px; font-weight: 500; color: var(--text-brand);
          font-family: 'Inter', sans-serif;
        }
        .lcb-btn {
          width: 100%; height: 42px;
          background: var(--brand-500);
          border: none; border-radius: 6px;
          font-size: 13.5px; font-weight: 600; letter-spacing: 0.02em; color: #ffffff;
          font-family: 'Inter', sans-serif; cursor: pointer;
          text-transform: uppercase;
          transition: filter 0.15s;
        }
        .lcb-btn:hover { filter: brightness(1.08); }
        .lcb-security {
          margin-top: 22px; text-align: center;
          font-size: 11px; color: var(--text-muted);
          font-family: 'Inter', sans-serif;
        }
        .lcb-footer {
          margin-top: 14px; text-align: center;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 11.5px; color: var(--text-muted);
        }
        button:focus-visible, input:focus-visible {
          outline: 2px solid var(--brand-400); outline-offset: 2px;
        }
      `}</style>

      <div className="lcb-col">
        <div className="lcb-brand"><Logo size={28} /></div>
        <div className="lcb-rule" />
        <h1 className="lcb-heading">Sign in</h1>
        <p className="lcb-sub">PharmaPulse Performance Workspace</p>

        <form className="lcb-form" onSubmit={handleSubmit} aria-label="Sign in to PharmaPulse">
          <div>
            <label className="lcb-label" htmlFor={emailId}>Email address</label>
            <div className="lcb-field">
              <span className="lcb-icon-l" aria-hidden="true"><Mail style={{ width: 14, height: 14 }} /></span>
              <input id={emailId} type="email" name="email" autoComplete="email" required className="lcb-input"
                value={form.email} placeholder="you@pharmacy.com"
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="lcb-label" htmlFor={passwordId}>Password</label>
            <div className="lcb-field">
              <span className="lcb-icon-l" aria-hidden="true"><Lock style={{ width: 14, height: 14 }} /></span>
              <input id={passwordId} type={showPass ? 'text' : 'password'} name="password" autoComplete="current-password" required className="lcb-input"
                value={form.password} placeholder="••••••••••••"
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              <button type="button" className="lcb-icon-r" onClick={() => setShowPass(s => !s)}
                aria-label={showPass ? 'Hide password' : 'Show password'} aria-pressed={showPass}>
                {showPass ? <EyeOff style={{ width: 14, height: 14 }} aria-hidden="true" /> : <Eye style={{ width: 14, height: 14 }} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div className="lcb-row-end">
            <button type="button" className="lcb-link" onClick={(e) => e.preventDefault()}>Forgot password?</button>
          </div>
          <button type="submit" className="lcb-btn">Sign in</button>
        </form>

        <div className="lcb-security">Protected by PharmaPulse Identity — your data is encrypted and secure</div>
        <div className="lcb-footer"><Globe style={{ width: 12, height: 12 }} aria-hidden="true" /> English</div>
      </div>
    </div>
  )
}
