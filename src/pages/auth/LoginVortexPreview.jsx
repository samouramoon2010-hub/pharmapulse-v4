// ============================================================
// Login Vortex Preview — /login-vortex-preview
//
// Isolated visual preview only. Production /login (LoginPageV2.jsx),
// Firebase Auth, password reset, redirect/session/route-guard logic
// are untouched. This page uses local component state only — no
// authStore import, no Firebase import, no real sign-in call.
//
// Background source: design-reference/login-v3-reference.png (the
// rejected Login V3 mockup) was NOT used directly — it bakes in a
// real email address and rendered login fields/Face ID/Passkey
// buttons. Per product-owner direction, only the abstract right-side
// vortex + glowing "P" was cropped out (no text, no UI), then
// composited as an inset graphic — not stretched full-bleed — onto a
// flat --bg-canvas, with a soft blurred glow halo and a radial alpha
// feather on the artwork's own edges so it doesn't read as a pasted
// rectangle. See design-assets/login-background-vortex/ for the
// source crop and composite steps, and
// docs/production/LOGIN_VORTEX_PREVIEW.md for the full writeup,
// including the disclosed limitation that a few small unlabeled
// decorative icons remain woven into the artwork's own texture (not
// removable by cropping alone).
// ============================================================
import React, { useId, useState, useEffect, useRef } from 'react'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, Check } from 'lucide-react'
import Logo from '../../components/brand/Logo'
import { useI18n } from '../../hooks/useI18n'

const COPY = {
  en: {
    eyebrow: 'Pharmacy Operations Intelligence',
    heading: 'Welcome back',
    subtitle: 'Sign in to your performance workspace',
    emailLabel: 'Email address',
    emailPlaceholder: 'you@pharmacy.com',
    passwordLabel: 'Password',
    passwordPlaceholder: '••••••••••••',
    remember: 'Remember me',
    forgot: 'Forgot password?',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    signedIn: 'Signed in',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    security: 'Protected by PharmaPulse Identity — your data is encrypted and secure',
    requiredError: 'Enter your email and password to continue',
  },
  ar: {
    eyebrow: 'منصة ذكاء العمليات الصيدلانية',
    heading: 'مرحبًا بعودتك',
    subtitle: 'سجّل الدخول إلى مساحة الأداء الخاصة بك',
    emailLabel: 'البريد الإلكتروني',
    emailPlaceholder: 'you@pharmacy.com',
    passwordLabel: 'كلمة المرور',
    passwordPlaceholder: '••••••••••••',
    remember: 'تذكرني',
    forgot: 'هل نسيت كلمة المرور؟',
    signIn: 'تسجيل الدخول',
    signingIn: 'جارٍ تسجيل الدخول…',
    signedIn: 'تم تسجيل الدخول',
    showPassword: 'إظهار كلمة المرور',
    hidePassword: 'إخفاء كلمة المرور',
    security: 'محمي بواسطة PharmaPulse Identity — بياناتك مشفّرة وآمنة',
    requiredError: 'أدخل البريد الإلكتروني وكلمة المرور للمتابعة',
  },
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const handler = (e) => setMatches(e.matches)
    setMatches(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return matches
}

export default function LoginVortexPreview() {
  const { lang, dir, setLang } = useI18n()
  const copy = COPY[lang] || COPY.en
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [remember, setRemember] = useState(false)
  const [status, setStatus] = useState('idle') // idle | submitting | success
  const [shake, setShake] = useState(false)
  const shakeTimer = useRef(null)
  const statusTimer = useRef(null)

  const emailId = useId()
  const passwordId = useId()
  const rememberId = useId()

  useEffect(() => () => {
    if (shakeTimer.current) clearTimeout(shakeTimer.current)
    if (statusTimer.current) clearTimeout(statusTimer.current)
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    // Visual preview only — intentionally no auth call. The loading
    // and success states are simulated locally so the prepared
    // micro-interactions can be reviewed without wiring real sign-in.
    if (!form.email || !form.password) {
      setShake(true)
      shakeTimer.current = setTimeout(() => setShake(false), 420)
      return
    }
    setStatus('submitting')
    statusTimer.current = setTimeout(() => {
      setStatus('success')
      statusTimer.current = setTimeout(() => setStatus('idle'), 1300)
    }, 900)
  }

  const bgSrc = '/login-vortex-preview/login-bg-vortex-' + (isDesktop ? 'desktop-1920x1080' : 'mobile-1080x1920') + '.webp'

  return (
    <div className="lvp-root" style={{ direction: 'ltr' }}>
      {/* direction:ltr pins the macro layout (artwork inset side +
          panel side) so it never mirrors under RTL; the panel's own
          dir below carries the real locale for its text/controls. */}
      <style>{`
        .lvp-root { position: relative; min-height: 100vh; background: var(--bg-canvas); overflow-x: hidden; }
        .lvp-bg { position: fixed; inset: 0; z-index: 0; }
        .lvp-bg-media { width: 100%; height: 100%; object-fit: cover; display: block; }

        .lvp-panel-wrap {
          position: relative; z-index: 1; min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          padding: 24px 16px max(24px, env(safe-area-inset-bottom));
          box-sizing: border-box;
        }
        @media (max-width: 767px) {
          /* The vortex artwork is inset near the top ~53% of the
             mobile composite. The panel's content-driven height can
             exceed the remaining calm space on short viewports, so it
             is anchored by a fixed top offset below the artwork (not
             dead-center, not viewport-relative flex-end) and the page
             is allowed to scroll vertically rather than overlapping
             the artwork — .lvp-bg is position:fixed so it still covers
             the full viewport while this content scrolls over it. */
          .lvp-panel-wrap { align-items: flex-start; justify-content: center; padding-top: 57vh; min-height: 0; }
        }
        @media (min-width: 768px) {
          .lvp-panel-wrap { justify-content: flex-start; padding-inline-start: 64px; padding-inline-end: 24px; }
        }

        .lvp-panel {
          width: 100%; max-width: 420px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.04), 0 12px 32px rgba(0,0,0,0.35);
          padding: 32px;
          box-sizing: border-box;
          animation: lvpFadeUp 620ms ease-out both;
        }
        @keyframes lvpFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }

        .lvp-brand { display: flex; margin-bottom: 6px; animation: lvpBrandReveal 500ms ease-out 80ms both; }
        @keyframes lvpBrandReveal { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }

        .lvp-eyebrow {
          display: flex; align-items: center; gap: 6px; margin: 16px 0 4px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
          color: var(--brand-300); text-align: start;
        }
        .lvp-heading { font-size: 24px; font-weight: 700; letter-spacing: -0.01em; color: var(--text-primary); margin: 2px 0 4px; text-align: start; font-family: 'Inter', sans-serif; }
        .lvp-sub { font-size: 13px; color: var(--text-secondary); margin: 0 0 22px; text-align: start; font-family: 'Inter', sans-serif; }

        .lvp-form { display: flex; flex-direction: column; gap: 14px; }
        .lvp-label { display: block; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; text-align: start; }
        .lvp-field { position: relative; }
        .lvp-icon-l { position: absolute; inset-inline-start: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; display: flex; }
        .lvp-input {
          width: 100%; height: 50px;
          padding-inline-start: 40px; padding-inline-end: 40px;
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
        .lvp-input::placeholder { color: var(--text-muted); }
        .lvp-input:focus-visible { border-color: var(--brand-400); box-shadow: 0 0 0 2px rgba(0,210,173,0.12); }
        .lvp-icon-r {
          position: absolute; inset-inline-end: 4px; top: 50%; transform: translateY(-50%);
          width: 38px; height: 38px;
          color: var(--text-muted);
          display: flex; align-items: center; justify-content: center;
          background: none; border: none; border-radius: 8px; cursor: pointer;
          transition: color 0.15s;
        }
        .lvp-icon-r:hover { color: var(--text-secondary); }

        .lvp-row-between { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: -2px; }
        .lvp-remember { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-secondary); cursor: pointer; }
        .lvp-remember input { width: 14px; height: 14px; accent-color: var(--brand-400); cursor: pointer; }
        .lvp-link { background: none; border: none; cursor: pointer; padding: 2px 0; font-size: 12.5px; font-weight: 500; color: var(--brand-300); }

        .lvp-error-region { min-height: 16px; text-align: start; }
        .lvp-error-text { font-size: 11.5px; color: var(--status-critical-text); }

        .lvp-btn {
          width: 100%; height: 50px;
          background: var(--brand-500);
          border: none; border-radius: 10px;
          font-size: 14px; font-weight: 600; color: #ffffff;
          font-family: 'Inter', sans-serif; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: filter 0.15s, transform 0.15s, box-shadow 0.15s;
        }
        .lvp-btn:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(13,107,116,0.30); }
        .lvp-btn:disabled { cursor: default; opacity: 0.85; }
        .lvp-btn:hover:not(:disabled) .lvp-arrow { transform: translateX(3px); }
        [dir="rtl"] .lvp-btn:hover:not(:disabled) .lvp-arrow { transform: translateX(-3px) scaleX(-1); }
        .lvp-arrow { transition: transform 0.15s; }
        [dir="rtl"] .lvp-arrow { transform: scaleX(-1); }
        .lvp-spin { animation: lvpSpin 0.9s linear infinite; }
        @keyframes lvpSpin { to { transform: rotate(360deg); } }

        .lvp-security { margin-top: 18px; text-align: center; font-size: 11px; color: var(--text-muted); font-family: 'Inter', sans-serif; }

        .lvp-lang { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: center; gap: 6px; }
        .lvp-lang button {
          background: none; border: 1px solid var(--border-subtle); border-radius: 6px;
          padding: 3px 9px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em;
          color: var(--text-muted); cursor: pointer; transition: color 0.15s, border-color 0.15s;
        }
        .lvp-lang button[aria-pressed="true"] { color: var(--brand-300); border-color: var(--brand-500); }

        .lvp-shake { animation: lvpShake 420ms ease-in-out; }
        @keyframes lvpShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(3px); }
        }

        button:focus-visible, input:focus-visible { outline: 2px solid var(--brand-400); outline-offset: 2px; }

        @media (prefers-reduced-motion: reduce) {
          .lvp-panel, .lvp-brand { animation: none; opacity: 1; transform: none; }
          .lvp-btn, .lvp-btn:hover:not(:disabled), .lvp-arrow, .lvp-btn:hover:not(:disabled) .lvp-arrow { transition: none; transform: none; }
          .lvp-spin { animation: none; }
          .lvp-shake { animation: none; }
        }
      `}</style>

      <div className="lvp-bg" aria-hidden="true">
        <img src={bgSrc} alt="" className="lvp-bg-media" />
      </div>

      <div className="lvp-panel-wrap">
        <div className={`lvp-panel ${shake ? 'lvp-shake' : ''}`} dir={dir}>
          <div className="lvp-brand"><Logo size={30} /></div>
          <div className="lvp-eyebrow">{copy.eyebrow}</div>
          <h1 className="lvp-heading">{copy.heading}</h1>
          <p className="lvp-sub">{copy.subtitle}</p>

          <form className="lvp-form" onSubmit={handleSubmit} aria-label={`${copy.heading} — ${copy.subtitle}`} noValidate>
            <div>
              <label className="lvp-label" htmlFor={emailId}>{copy.emailLabel}</label>
              <div className="lvp-field">
                <span className="lvp-icon-l" aria-hidden="true"><Mail style={{ width: 16, height: 16 }} /></span>
                <input
                  id={emailId} type="email" name="email" autoComplete="email" required className="lvp-input"
                  value={form.email} placeholder={copy.emailPlaceholder}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="lvp-label" htmlFor={passwordId}>{copy.passwordLabel}</label>
              <div className="lvp-field">
                <span className="lvp-icon-l" aria-hidden="true"><Lock style={{ width: 16, height: 16 }} /></span>
                <input
                  id={passwordId} type={showPass ? 'text' : 'password'} name="password" autoComplete="current-password" required className="lvp-input"
                  value={form.password} placeholder={copy.passwordPlaceholder}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
                <button
                  type="button" className="lvp-icon-r" onClick={() => setShowPass((s) => !s)}
                  aria-label={showPass ? copy.hidePassword : copy.showPassword} aria-pressed={showPass}
                >
                  {showPass ? <EyeOff style={{ width: 16, height: 16 }} aria-hidden="true" /> : <Eye style={{ width: 16, height: 16 }} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <div className="lvp-row-between">
              <label className="lvp-remember" htmlFor={rememberId}>
                <input id={rememberId} type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>{copy.remember}</span>
              </label>
              <button type="button" className="lvp-link" onClick={(e) => e.preventDefault()}>{copy.forgot}</button>
            </div>

            <div className="lvp-error-region" aria-live="polite">
              {shake && <span className="lvp-error-text">{copy.requiredError}</span>}
            </div>

            <button type="submit" className="lvp-btn" disabled={status === 'submitting'} aria-busy={status === 'submitting'}>
              {status === 'submitting' ? (
                <><Loader2 className="lvp-spin" style={{ width: 16, height: 16 }} aria-hidden="true" />{copy.signingIn}</>
              ) : status === 'success' ? (
                <><Check style={{ width: 16, height: 16 }} aria-hidden="true" />{copy.signedIn}</>
              ) : (
                <>{copy.signIn}<ArrowRight className="lvp-arrow" style={{ width: 16, height: 16 }} aria-hidden="true" /></>
              )}
            </button>
          </form>

          <div className="lvp-security">{copy.security}</div>

          <div className="lvp-lang">
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
            <button type="button" aria-pressed={lang === 'ar'} onClick={() => setLang('ar')}>AR</button>
          </div>
        </div>
      </div>
    </div>
  )
}
