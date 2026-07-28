// ============================================================
// LoginPageV3 — PR-1F Gate 2: Static Pixel-Locked Shell
//
// Scope: visual shell only, built against the approved reference
// (docs/production/LOGIN_V3_DESIGN_LOCK.md). Reuses the exact same
// useAuthStore auth contract (login/resetPassword/loading/error/
// clearError) and role-home routing as LoginPageV2 — no auth logic,
// no Firebase wiring, no session/redirect behavior was created or
// changed here. LoginPageV2 itself is untouched and still serves the
// production /login route; this page is reachable at /login-v3 for
// isolated evidence-gathering only, pending a deliberate Gate 3
// cutover decision.
//
// Right panel: LoginLivePanel — an animated canvas scene (ambient
// particle field + breathing halo) with a desktop-only product story
// (headline + illustrative "Preview"-labeled KPI animation). Replaces
// the Gate 1/2 static WebP LoginVisualPanel per the approved July 2026
// redesign; the WebP assets and LoginVisualPanel component remain on
// disk (still covered by the Gate 1 asset certification).
//
// Face ID / Passkey buttons are UI-ready placeholders only — no
// WebAuthn/biometric backend exists, so both are rendered disabled
// and guarded against any click handler firing.
// ============================================================
import React, { useEffect, useId, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, Mail, Lock, ArrowRight, CheckCircle2, ArrowLeft, ShieldCheck, ScanFace, KeyRound, Globe } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import LoginLivePanel from '../../components/login/LoginLivePanel'

const ROLE_HOME = {
  admin: 'dashboard', manager: 'dashboard', pharmacist: 'dashboard',
  area_manager: 'dashboard', store_manager: 'dashboard',
}

export default function LoginPageV3() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login, resetPassword, loading, error, clearError } = useAuthStore()

  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [success, setSuccess] = useState(false)
  const [mode, setMode] = useState('login')
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetErr, setResetErr] = useState('')
  const [resetSubmitting, setResetSubmitting] = useState(false)
  const progressRef = useRef(null)
  const errorAlertRef = useRef(null)
  const resetErrorAlertRef = useRef(null)
  // Refs (not state) for the in-flight guard: React batches setState, so two
  // clicks landing in the same synchronous tick can both read the pre-update
  // `submitting`/`resetSubmitting` value. A ref updates immediately and
  // closes that double-submit race without changing the visible behavior.
  const loginInFlightRef = useRef(false)
  const resetInFlightRef = useRef(false)
  const isTimeout = params.get('reason') === 'timeout'

  const emailId = useId()
  const passwordId = useId()
  const resetEmailId = useId()

  // Section 3 — restore focus to the error banner so screen-reader
  // users hear it immediately and keyboard users land on it.
  useEffect(() => { if (error) errorAlertRef.current?.focus() }, [error])
  useEffect(() => { if (resetErr) resetErrorAlertRef.current?.focus() }, [resetErr])

  const startProgress = () => {
    setProgress(0)
    let p = 0
    progressRef.current = setInterval(() => {
      p = p < 70 ? p + (70 - p) * 0.07 : p < 86 ? p + 0.25 : p
      setProgress(Math.min(p, 86))
    }, 80)
  }
  const finishProgress = () => { clearInterval(progressRef.current); setProgress(100) }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (loginInFlightRef.current || submitting || loading) return
    if (!form.email || !form.password) return
    loginInFlightRef.current = true
    setSubmitting(true)
    startProgress()
    try {
      const profile = await login(form.email, form.password, false)
      finishProgress()
      setSuccess(true)
      setTimeout(() => navigate(`/${ROLE_HOME[profile.role] || 'dashboard'}`, { replace: true }), 900)
    } catch { clearInterval(progressRef.current); setProgress(0) }
    finally { setSubmitting(false); loginInFlightRef.current = false }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    if (resetInFlightRef.current || resetSubmitting) return
    resetInFlightRef.current = true
    setResetErr('')
    setResetSubmitting(true)
    try { await resetPassword(resetEmail); setResetSent(true) }
    catch (err) { setResetErr(err.message) }
    finally { setResetSubmitting(false); resetInFlightRef.current = false }
  }

  return (
    <div className="lgv3-root" style={{ opacity: success ? 0 : 1, transition: success ? 'opacity 0.85s ease 0.05s' : 'none' }}>
      <style>{`
        @keyframes lgv3PanelIn {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0); }
        }

        .lgv3-root {
          min-height: 100vh;
          background: #020611;
          position: relative;
        }

        /* ── Right visual: fixed full-bleed background on mobile/tablet ── */
        .lgv3-visual {
          position: fixed;
          inset: 0;
          z-index: 0;
        }
        .lgv3-visual-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(2,6,17,0.5) 0%, rgba(2,6,17,0.74) 100%);
        }

        .lgv3-card-wrap {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
          box-sizing: border-box;
        }

        .lgv3-glass-card {
          position: relative;
          width: 100%;
          max-width: 380px;
          background: linear-gradient(165deg, rgba(18,28,46,0.7) 0%, rgba(10,16,28,0.8) 60%, rgba(8,12,22,0.86) 100%);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 24px;
          backdrop-filter: blur(20px) saturate(140%);
          -webkit-backdrop-filter: blur(20px) saturate(140%);
          box-shadow: 0 18px 50px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.06) inset;
          overflow: hidden;
          animation: lgv3PanelIn 0.5s ease 0.05s both;
        }
        .lgv3-glass-inner {
          position: relative;
          z-index: 1;
          padding: 20px;
          max-height: 100%;
          overflow-y: auto;
        }

        .lgv3-input {
          width: 100%;
          height: 46px;
          padding: 0 42px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 11px;
          font-size: 16px;
          font-family: 'Inter', sans-serif;
          color: #E2F2FF;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .lgv3-input::placeholder { color: rgba(186,230,253,0.32); }
        /* index.css styles inputs via input:not([type=range]):not([type=checkbox]):not([type=radio])
           — specificity (0,3,1) beats .lgv3-input's (0,1,0), so the global
           padding/background/border silently won (pre-existing; only became
           visible once the card switched to LTR and the placeholder collided
           with the absolutely-positioned left icon). This selector matches
           that specificity and, being later in the document, wins. */
        input.lgv3-input:not([type=range]):not([type=checkbox]):not([type=radio]) {
          padding: 0 42px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 11px;
        }
        input.lgv3-input:not([type=range]):not([type=checkbox]):not([type=radio]):focus {
          border-color: rgba(20,211,172,0.6);
          background: rgba(255,255,255,0.07);
          box-shadow: 0 0 0 4px rgba(20,211,172,0.14);
        }
        .lgv3-input:focus {
          border-color: rgba(20,211,172,0.6);
          background: rgba(255,255,255,0.07);
          box-shadow: 0 0 0 4px rgba(20,211,172,0.14);
        }

        .lgv3-btn-primary {
          width: 100%;
          height: 46px;
          background: linear-gradient(120deg,#0fbf9f 0%,#14b8a6 100%);
          border: none;
          border-radius: 11px;
          font-size: 14.5px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          color: #04111f;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: filter 0.15s, transform 0.1s;
        }
        .lgv3-btn-primary:hover:not(:disabled) { filter: brightness(1.08); }
        .lgv3-btn-primary:active:not(:disabled) { transform: scale(0.99); }
        .lgv3-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .lgv3-progress {
          position: absolute;
          bottom: 0; left: 0; height: 2px;
          background: rgba(4,17,31,0.45);
          transition: width 0.3s ease;
        }

        .lgv3-btn-secondary {
          width: 100%;
          height: 42px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 11px;
          font-size: 13.5px;
          font-weight: 500;
          font-family: 'Inter', sans-serif;
          color: rgba(226,242,255,0.75);
          cursor: not-allowed;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          opacity: 0.7;
        }

        .lgv3-link {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 0;
          font-family: 'Inter', sans-serif;
          font-size: 12.5px;
          color: #2ee6c3;
          font-weight: 500;
        }
        .lgv3-link:hover { opacity: 0.75; }

        .lgv3-icon-l {
          position: absolute;
          left: 14px; top: 50%; transform: translateY(-50%);
          color: rgba(186,230,253,0.45);
          pointer-events: none;
          display: flex;
        }
        .lgv3-icon-r {
          position: absolute;
          right: 6px; top: 50%; transform: translateY(-50%);
          width: 44px; height: 44px;
          color: rgba(186,230,253,0.55);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          padding: 0;
          border-radius: 8px;
        }

        .lgv3-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: rgba(186,230,253,0.65);
          font-family: 'Inter', sans-serif;
          margin-bottom: 6px;
        }

        .lgv3-divider {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 12px 0;
        }
        .lgv3-divider-line {
          flex: 1; height: 1px;
          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0) 100%);
        }

        button:focus-visible,
        input:focus-visible {
          outline: 2px solid rgba(20,211,172,0.8);
          outline-offset: 2px;
        }
        .lgv3-alert:focus {
          outline: 2px solid rgba(239,68,68,0.7);
          outline-offset: 2px;
        }

        @media (prefers-reduced-motion: reduce) {
          .lgv3-glass-card { animation: none; }
          .lgv3-btn-primary, .lgv3-input { transition: none; }
        }

        /* ── Desktop / tablet-landscape: split layout ── */
        @media (min-width: 1024px) {
          .lgv3-root { display: flex; height: 100vh; overflow: hidden; }
          .lgv3-visual {
            position: relative;
            order: 2;
            flex: 1;
            height: 100%;
          }
          .lgv3-visual-overlay {
            background: linear-gradient(90deg, rgba(2,6,17,0.4) 0%, rgba(2,6,17,0) 16%);
          }
          .lgv3-card-wrap {
            order: 1;
            flex: 0 0 clamp(420px, 32vw, 460px);
            width: clamp(420px, 32vw, 460px);
            height: 100%;
            min-height: 0;
            padding: 40px;
          }
          .lgv3-glass-card {
            max-height: calc(100vh - 64px);
            overflow-y: auto;
          }
          .lgv3-glass-inner { padding: 26px 28px; }
        }
      `}</style>

      <LoginLivePanel />

      <div className="lgv3-card-wrap">
        <div className="lgv3-glass-card" dir="ltr">
          <div className="lgv3-glass-inner">

            {/* 1–2: brand mark + wordmark */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '4px' }}>
              <div aria-hidden="true" style={{
                width: 34, height: 34, borderRadius: '50%', border: '2px solid #14d3ac',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg viewBox="0 0 38 20" width="20" height="11">
                  <path d="M0,10 L8,10 L11,4 L15,16 L19,2 L23,14 L26,10 L38,10"
                    fill="none" stroke="#14d3ac" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span style={{ fontSize: '19px', fontWeight: 700, fontFamily: "'Inter',sans-serif", color: '#F1F8FF' }}>
                Pharma<span style={{ color: '#14d3ac' }}>Pulse</span>
              </span>
            </div>

            {/* 3: identity gateway subtitle */}
            <div style={{ fontSize: '11.5px', color: 'rgba(186,230,253,0.55)', fontFamily: "'Inter',sans-serif", marginBottom: '14px' }}>
              Identity Gateway V3
            </div>

            {isTimeout && (
              <div role="alert" style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 14px', marginBottom: '18px',
                background: 'rgba(212,132,10,0.08)',
                border: '1px solid rgba(212,132,10,0.25)',
                borderRadius: '10px', fontSize: '13px', color: '#FBBF66',
                fontFamily: "'Inter',sans-serif",
              }}>
                <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} aria-hidden="true" />
                Your session has expired — please sign in again.
              </div>
            )}

            {mode === 'login' ? (
              <>
                {/* 4–5: heading + subtitle */}
                <div style={{ marginBottom: '14px' }}>
                  <h1 style={{
                    fontSize: '25px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15,
                    background: 'linear-gradient(120deg, #F8FCFF 0%, #E2F2FF 55%, #BAE6FD 100%)',
                    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                    fontFamily: "'Inter', sans-serif", margin: 0,
                  }}>
                    Welcome back
                  </h1>
                  <p style={{ fontSize: '13.5px', color: 'rgba(186,230,253,0.55)', marginTop: '6px', fontFamily: "'Inter', sans-serif" }}>
                    Sign in to continue to your dashboard
                  </p>
                </div>

                {error && (
                  <div role="alert" ref={errorAlertRef} tabIndex={-1} className="lgv3-alert" style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 14px', marginBottom: '16px',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: '10px', fontSize: '13px', color: '#FCA5A5',
                    fontFamily: "'Inter',sans-serif",
                  }}>
                    <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} aria-hidden="true" />
                    {error}
                  </div>
                )}

                <form onSubmit={handleLogin} aria-label="Sign in to PharmaPulse" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* 6: email */}
                  <div>
                    <label className="lgv3-label" htmlFor={emailId}>Email address</label>
                    <div style={{ position: 'relative' }}>
                      <span className="lgv3-icon-l" aria-hidden="true"><Mail style={{ width: 16, height: 16 }} /></span>
                      <input id={emailId} type="email" name="email" autoComplete="email" required className="lgv3-input"
                        value={form.email} placeholder="you@pharmacy.com"
                        onChange={e => { setForm(f => ({ ...f, email: e.target.value })); clearError() }} />
                    </div>
                  </div>

                  {/* 7: password */}
                  <div>
                    <label className="lgv3-label" htmlFor={passwordId}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <span className="lgv3-icon-l" aria-hidden="true"><Lock style={{ width: 16, height: 16 }} /></span>
                      <input id={passwordId} type={showPass ? 'text' : 'password'} name="password" autoComplete="current-password" required className="lgv3-input"
                        value={form.password} placeholder="••••••••••••"
                        onChange={e => { setForm(f => ({ ...f, password: e.target.value })); clearError() }} />
                      <button type="button" className="lgv3-icon-r" onClick={() => setShowPass(!showPass)}
                        aria-label={showPass ? 'Hide password' : 'Show password'} aria-pressed={showPass}>
                        {showPass ? <EyeOff style={{ width: 16, height: 16 }} aria-hidden="true" /> : <Eye style={{ width: 16, height: 16 }} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>

                  {/* 8: forgot password */}
                  <div style={{ textAlign: 'right' }}>
                    <button type="button" className="lgv3-link"
                      onClick={() => { setMode('reset'); clearError() }}>
                      Forgot password?
                    </button>
                  </div>

                  {/* 9: primary sign-in button */}
                  <button type="submit" className="lgv3-btn-primary" disabled={submitting || loading} aria-busy={submitting}>
                    {submitting && <div className="lgv3-progress" style={{ width: `${progress}%` }} />}
                    <span style={{ position: 'relative', zIndex: 1 }}>
                      {submitting ? 'Signing in...' : 'Sign in'}
                    </span>
                    {!submitting && <ArrowRight style={{ width: 18, height: 18, position: 'relative', zIndex: 1 }} aria-hidden="true" />}
                  </button>
                </form>

                {/* 10: divider */}
                <div className="lgv3-divider">
                  <div className="lgv3-divider-line" />
                  <span style={{ fontSize: '11px', color: 'rgba(186,230,253,0.4)', fontFamily: "'Inter',sans-serif" }}>or</span>
                  <div className="lgv3-divider-line" />
                </div>

                {/* 11: biometric / passkey placeholders — honestly disabled, no live capability */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    className="lgv3-btn-secondary"
                    disabled
                    aria-disabled="true"
                    title="Face ID sign-in is not yet available"
                    onClick={(e) => e.preventDefault()}
                  >
                    <ScanFace style={{ width: 16, height: 16 }} aria-hidden="true" />
                    Continue with Face ID
                  </button>
                  <button
                    type="button"
                    className="lgv3-btn-secondary"
                    disabled
                    aria-disabled="true"
                    title="Passkey sign-in is not yet available"
                    onClick={(e) => e.preventDefault()}
                    style={{ justifyContent: 'space-between', paddingLeft: 14, paddingRight: 14 }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <KeyRound style={{ width: 16, height: 16 }} aria-hidden="true" />
                      Sign in with Passkey
                    </span>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, color: '#2ee6c3',
                      background: 'rgba(20,211,172,0.12)', border: '1px solid rgba(20,211,172,0.3)',
                      borderRadius: '6px', padding: '2px 6px',
                    }}>Not yet available</span>
                  </button>
                </div>

                {/* 12: security statement */}
                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
                    <ShieldCheck style={{ width: 14, height: 14, color: '#14d3ac' }} aria-hidden="true" />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(226,242,255,0.75)', fontFamily: "'Inter',sans-serif" }}>
                      Protected by PharmaPulse Identity
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'rgba(186,230,253,0.4)', fontFamily: "'Inter',sans-serif", margin: 0 }}>
                    Your data is encrypted and secure
                  </p>
                </div>
              </>
            ) : (
              /* ── Reset password mode ───────────────────────── */
              <div>
                <button className="lgv3-link" onClick={() => { setMode('login'); setResetSent(false); setResetErr('') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '12px', fontSize: '12.5px' }}>
                  <ArrowLeft style={{ width: 14, height: 14 }} aria-hidden="true" />
                  Back to sign in
                </button>

                <h2 style={{
                  fontSize: '19px', fontWeight: 700, letterSpacing: '-0.01em',
                  color: '#F1F8FF', fontFamily: "'Inter',sans-serif", marginBottom: '6px',
                }}>
                  Reset your password
                </h2>
                <p style={{ fontSize: '13px', color: 'rgba(186,230,253,0.55)', fontFamily: "'Inter',sans-serif", marginBottom: '14px' }}>
                  We'll send a recovery link to your email
                </p>

                {resetSent ? (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14,
                      background: 'rgba(20,211,172,0.10)',
                      border: '1px solid rgba(20,211,172,0.28)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 12px',
                    }}>
                      <CheckCircle2 style={{ width: 26, height: 26, color: '#14d3ac' }} aria-hidden="true" />
                    </div>
                    <h3 style={{ fontWeight: 700, color: '#F1F8FF', marginBottom: 6, fontFamily: "'Inter',sans-serif" }}>Link sent</h3>
                    <p style={{ fontSize: 13, color: 'rgba(186,230,253,0.55)', marginBottom: 12, fontFamily: "'Inter',sans-serif" }}>
                      Check your inbox for the reset link
                    </p>
                    <button onClick={() => setMode('login')} className="lgv3-btn-primary">
                      Back to sign in
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleReset} aria-label="Reset your password" style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
                    {resetErr && (
                      <div role="alert" ref={resetErrorAlertRef} tabIndex={-1} className="lgv3-alert" style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: '10px', fontSize: 13, color: '#FCA5A5',
                      }}>
                        <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" />
                        {resetErr}
                      </div>
                    )}
                    <div>
                      <label className="lgv3-label" htmlFor={resetEmailId}>Email address</label>
                      <div style={{ position: 'relative' }}>
                        <span className="lgv3-icon-l" aria-hidden="true"><Mail style={{ width: 16, height: 16 }} /></span>
                        <input id={resetEmailId} type="email" name="email" autoComplete="email" required className="lgv3-input"
                          value={resetEmail} placeholder="you@pharmacy.com"
                          onChange={e => setResetEmail(e.target.value)} />
                      </div>
                    </div>
                    <button type="submit" className="lgv3-btn-primary" disabled={resetSubmitting} aria-busy={resetSubmitting}>
                      {resetSubmitting ? 'Sending...' : 'Send recovery link'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* 13–15: language selector + legal links — inert, no new routes */}
            <div style={{
              marginTop: '16px', paddingTop: '12px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: '10px',
            }}>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: '11.5px', color: 'rgba(186,230,253,0.5)', fontFamily: "'Inter',sans-serif",
                cursor: 'default',
              }}>
                <Globe style={{ width: 13, height: 13 }} aria-hidden="true" />
                English
              </span>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11.5px', color: 'rgba(186,230,253,0.4)', fontFamily: "'Inter',sans-serif", cursor: 'default' }}>
                  Privacy Policy
                </span>
                <span style={{ fontSize: '11.5px', color: 'rgba(186,230,253,0.4)', fontFamily: "'Inter',sans-serif", cursor: 'default' }}>
                  Terms of Service
                </span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
