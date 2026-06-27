// ============================================================
// LoginPageV2 — PharmaPulse Identity Gateway V3
//
// Visual rebuild only — authentication logic (useAuthStore.login /
// resetPassword, role-home routing, timeout notice, error surface)
// is unchanged from the prior LoginPageV2 implementation.
//
// Face ID / Passkey buttons are UI-ready placeholders only — no
// WebAuthn/biometric backend exists yet, so both are rendered
// disabled and guarded against any click handler firing.
// ============================================================
import React, { useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, AlertCircle, Mail, Lock, ArrowRight, CheckCircle2, ArrowLeft, ShieldCheck, ScanFace, KeyRound, Globe } from 'lucide-react'
import { useAuthStore }      from '../../store/authStore'
import DataOceanBackground   from '../../components/login/DataOceanBackground'
import IdentityPulseLogo     from '../../components/login/IdentityPulseLogo'

const ROLE_HOME = {
  admin:'dashboard', manager:'dashboard', pharmacist:'dashboard',
  area_manager:'dashboard', store_manager:'dashboard',
}

// Decorative label chips around the data ocean — text + icon only,
// no live data, no KPI values, no charts.
const INTELLIGENCE_LABELS = [
  { icon: 'shield', text: 'SECURE\nCONNECTION', top: '14%', left: '8%' },
  { icon: 'lock',   text: 'DATA\nENCRYPTED',    top: '38%', left: '4%' },
  { icon: 'brain',  text: 'AI\nINSIGHTS',       top: '64%', left: '8%' },
  { icon: 'users',  text: 'PHARMACY\nNETWORK',  top: '16%', left: '84%' },
  { icon: 'pulse',  text: 'INTELLIGENCE\nFLOW', top: '44%', left: '88%' },
  { icon: 'chart',  text: 'PERFORMANCE\nANALYTICS', top: '64%', left: '86%' },
  { icon: 'star',   text: 'OPERATIONAL\nEXCELLENCE', top: '84%', left: '78%' },
]

function LabelChip({ text, top, left }) {
  const lines = text.split('\n')
  return (
    <div style={{
      position: 'absolute', top, left, display: 'flex', flexDirection: 'column',
      alignItems: 'flex-start', gap: 2, pointerEvents: 'none', userSelect: 'none',
    }}>
      {lines.map((line) => (
        <span key={line} style={{
          fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
          color: 'rgba(186,230,253,0.55)', fontFamily: "'Inter', sans-serif",
          lineHeight: 1.4, whiteSpace: 'nowrap',
        }}>{line}</span>
      ))}
    </div>
  )
}

export default function LoginPageV2() {
  const navigate        = useNavigate()
  const [params]        = useSearchParams()
  const { login, resetPassword, loading, error, clearError } = useAuthStore()

  const [form,       setForm]       = useState({ email:'', password:'' })
  const [showPass,   setShowPass]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [progress,   setProgress]   = useState(0)
  const [success,    setSuccess]    = useState(false)
  const [mode,       setMode]       = useState('login')
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent,  setResetSent]  = useState(false)
  const [resetErr,   setResetErr]   = useState('')
  const progressRef = useRef(null)
  const isTimeout   = params.get('reason') === 'timeout'

  const startProgress = () => {
    setProgress(0)
    let p = 0
    progressRef.current = setInterval(() => {
      p = p < 70 ? p + (70-p)*0.07 : p < 86 ? p + 0.25 : p
      setProgress(Math.min(p, 86))
    }, 80)
  }
  const finishProgress = () => { clearInterval(progressRef.current); setProgress(100) }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) return
    setSubmitting(true)
    startProgress()
    try {
      const profile = await login(form.email, form.password, false)
      finishProgress()
      setSuccess(true)
      setTimeout(() => navigate(`/${ROLE_HOME[profile.role]||'dashboard'}`, { replace:true }), 900)
    } catch { clearInterval(progressRef.current); setProgress(0) }
    finally  { setSubmitting(false) }
  }

  const handleReset = async (e) => {
    e.preventDefault(); setResetErr('')
    try { await resetPassword(resetEmail); setResetSent(true) }
    catch (err) { setResetErr(err.message) }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'row',
      background:'#020611', overflow:'hidden', position:'relative',
      opacity: success ? 0 : 1, transition: success ? 'opacity 0.85s ease 0.05s' : 'none',
    }}>
      <style>{`
        @keyframes lv3PanelIn {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .lv3-panel { animation: lv3PanelIn 0.5s ease 0.05s both; }

        /* ── Glass card — true glassmorphism, layered reflections via pseudo-elements ── */
        .lv3-glass-card {
          position:relative;
          background:linear-gradient(165deg, rgba(18,28,46,0.62) 0%, rgba(10,16,28,0.72) 60%, rgba(8,12,22,0.78) 100%);
          border:1px solid rgba(255,255,255,0.09);
          border-radius:22px;
          backdrop-filter:blur(28px) saturate(150%);
          -webkit-backdrop-filter:blur(28px) saturate(150%);
          box-shadow:
            0 24px 70px rgba(0,0,0,0.5),
            0 0 0 1px rgba(255,255,255,0.03) inset,
            0 1px 0 rgba(255,255,255,0.08) inset;
          overflow:hidden;
        }
        /* Top-edge cyan/violet glow reflection */
        .lv3-glass-card::before {
          content:''; position:absolute; inset:-1px;
          border-radius:22px; padding:1px; pointer-events:none;
          background:linear-gradient(135deg, rgba(34,211,238,0.45) 0%, rgba(139,92,246,0.0) 28%, rgba(139,92,246,0.0) 72%, rgba(139,92,246,0.4) 100%);
          -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite:xor; mask-composite:exclude;
          opacity:0.7;
        }
        /* Soft diagonal light sweep / specular highlight */
        .lv3-glass-card::after {
          content:''; position:absolute; top:-60%; left:-20%;
          width:140%; height:90%;
          background:linear-gradient(115deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.0) 38%);
          pointer-events:none; transform:rotate(-4deg);
        }
        .lv3-glass-inner { position:relative; z-index:1; padding:36px 32px; }

        .lv3-input {
          width:100%; height:48px;
          padding:0 42px;
          background:rgba(255,255,255,0.045);
          border:1px solid rgba(255,255,255,0.10);
          border-radius:11px;
          font-size:14px;
          font-family:'Inter',sans-serif;
          color:#E2F2FF;
          outline:none;
          box-sizing:border-box;
          transition:border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .lv3-input::placeholder { color:rgba(186,230,253,0.32); }
        .lv3-input:focus {
          border-color:rgba(34,211,238,0.6);
          background:rgba(255,255,255,0.07);
          box-shadow:0 0 0 4px rgba(34,211,238,0.14), 0 0 18px rgba(34,211,238,0.18);
        }
        .lv3-btn-primary {
          width:100%; height:50px;
          background:linear-gradient(120deg,#22d3ee 0%,#3b82f6 55%,#8b5cf6 100%);
          border:none; border-radius:11px;
          font-size:14.5px; font-weight:600;
          font-family:'Inter',sans-serif;
          color:#04111f; cursor:pointer;
          position:relative; overflow:hidden;
          display:flex; align-items:center; justify-content:center; gap:8px;
          transition:filter 0.15s, transform 0.1s, box-shadow 0.15s;
          box-shadow:0 4px 24px rgba(59,130,246,0.4), 0 0 30px rgba(139,92,246,0.18);
        }
        /* Soft internal glow on the primary button */
        .lv3-btn-primary::before {
          content:''; position:absolute; inset:0;
          background:radial-gradient(ellipse 70% 100% at 50% -10%, rgba(255,255,255,0.4), rgba(255,255,255,0) 60%);
          pointer-events:none;
        }
        .lv3-btn-primary:hover:not(:disabled) { filter:brightness(1.08); box-shadow:0 6px 30px rgba(59,130,246,0.5), 0 0 40px rgba(139,92,246,0.28); }
        .lv3-btn-primary:active:not(:disabled){ transform:scale(0.99); }
        .lv3-btn-primary:disabled { opacity:0.6; cursor:not-allowed; }
        .lv3-progress {
          position:absolute; bottom:0; left:0; height:2px;
          background:rgba(4,17,31,0.45);
          transition:width 0.3s ease; border-radius:0 2px 2px 0;
        }
        .lv3-btn-secondary {
          width:100%; height:46px;
          background:rgba(255,255,255,0.035);
          border:1px solid rgba(255,255,255,0.12);
          border-radius:11px;
          font-size:13.5px; font-weight:500;
          font-family:'Inter',sans-serif;
          color:rgba(226,242,255,0.75); cursor:not-allowed;
          display:flex; align-items:center; justify-content:center; gap:8px;
          opacity:0.7; transition:border-color 0.15s, background 0.15s;
        }
        .lv3-btn-secondary:hover { border-color:rgba(34,211,238,0.3); background:rgba(34,211,238,0.04); }
        .lv3-link {
          background:none; border:none; cursor:pointer; padding:0;
          font-family:'Inter',sans-serif;
          font-size:12.5px; color:#67e8f9; font-weight:500;
          text-decoration:none; transition:opacity 0.15s;
        }
        .lv3-link:hover { opacity:0.75; }
        .lv3-icon-l {
          position:absolute; left:14px; top:50%; transform:translateY(-50%);
          color:rgba(186,230,253,0.45); pointer-events:none; display:flex;
        }
        .lv3-icon-r {
          position:absolute; right:14px; top:50%; transform:translateY(-50%);
          color:rgba(186,230,253,0.45); cursor:pointer; display:flex;
          background:none; border:none; padding:0;
        }
        @keyframes lv3AlertIn {
          from { opacity:0; transform:translateY(-6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .lv3-alert { animation: lv3AlertIn 0.25s ease forwards; }
        .lv3-label {
          display:block; font-size:11px; font-weight:600;
          letter-spacing:0.04em;
          color:rgba(186,230,253,0.55); font-family:'Inter',sans-serif;
          margin-bottom:6px;
        }
        .lv3-divider-biometric {
          display:flex; align-items:center; gap:10px; margin:20px 0;
        }
        .lv3-divider-biometric .lv3-divider-line {
          flex:1; height:1px;
          background:linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0) 100%);
        }
        @media (prefers-reduced-motion: reduce) {
          .lv3-panel { animation: none; }
          .lv3-btn-primary, .lv3-btn-secondary, .lv3-input { transition: none; }
        }
        @media (max-width: 880px) {
          .lv3-right-panel { display:none; }
          .lv3-left-panel  { width:100% !important; min-width:0 !important; }
        }
        @media (max-width: 480px) {
          .lv3-glass-inner { padding:28px 20px; }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════
          LEFT — Glass Identity Panel
      ══════════════════════════════════════════════════ */}
      <div className="lv3-left-panel lv3-panel" style={{
        width:'420px', minWidth:'380px', flexShrink:0,
        position:'relative', zIndex:10,
        display:'flex', alignItems:'center', justifyContent:'center',
        padding:'32px',
      }}>
        <div className="lv3-glass-card" style={{ width:'100%', maxWidth:'380px' }}>
        <div className="lv3-glass-inner">

          {/* Logo + product name */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:'4px' }}>
            <div style={{ width:34, height:34 }}>
              <svg viewBox="0 0 200 200" width="34" height="34">
                <defs>
                  <linearGradient id="lv3MiniGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
                <path d="M70 36 L70 164 M70 36 L118 36 C140 36 154 50 154 72 C154 94 140 108 118 108 L70 108"
                  fill="none" stroke="url(#lv3MiniGrad)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span style={{ fontSize:'19px', fontWeight:700, fontFamily:"'Inter',sans-serif", color:'#F1F8FF' }}>
              Pharma<span style={{ color:'#22d3ee' }}>Pulse</span>
            </span>
          </div>
          <div style={{ fontSize:'11.5px', color:'rgba(186,230,253,0.55)', fontFamily:"'Inter',sans-serif", marginBottom:'28px' }}>
            Identity Gateway V3
          </div>

          {/* Timeout notice */}
          {isTimeout && (
            <div className="lv3-alert" style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'11px 14px', marginBottom:'18px',
              background:'rgba(212,132,10,0.08)',
              border:'1px solid rgba(212,132,10,0.25)',
              borderRadius:'10px', fontSize:'13px', color:'#FBBF66',
              fontFamily:"'Inter',sans-serif",
            }}>
              <AlertCircle style={{ width:15, height:15, flexShrink:0 }}/>
              Your session has expired — please sign in again.
            </div>
          )}

          {mode === 'login' ? (
            <>
              <div style={{ marginBottom:'24px' }}>
                <h1 style={{
                  fontSize:'29px', fontWeight:800, letterSpacing:'-0.02em', lineHeight:1.15,
                  background:'linear-gradient(120deg, #F8FCFF 0%, #E2F2FF 55%, #BAE6FD 100%)',
                  WebkitBackgroundClip:'text', backgroundClip:'text', color:'transparent',
                  fontFamily:"'Inter', sans-serif", margin:0,
                }}>
                  Welcome back
                </h1>
                <p style={{ fontSize:'13.5px', color:'rgba(186,230,253,0.55)', marginTop:'8px', fontFamily:"'Inter', sans-serif" }}>
                  Sign in to continue to your dashboard
                </p>
              </div>

              {error && (
                <div className="lv3-alert" style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'11px 14px', marginBottom:'16px',
                  background:'rgba(239,68,68,0.08)',
                  border:'1px solid rgba(239,68,68,0.25)',
                  borderRadius:'10px', fontSize:'13px', color:'#FCA5A5',
                  fontFamily:"'Inter',sans-serif",
                }}>
                  <AlertCircle style={{ width:15, height:15, flexShrink:0 }}/>
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:'18px' }}>
                <div>
                  <span className="lv3-label">Email</span>
                  <div style={{ position:'relative' }}>
                    <span className="lv3-icon-l"><Mail style={{ width:16, height:16 }}/></span>
                    <input type="email" required className="lv3-input"
                      value={form.email} placeholder="name@yourpharmacy.com"
                      onChange={e => { setForm(f => ({...f, email:e.target.value})); clearError() }}/>
                  </div>
                </div>

                <div>
                  <span className="lv3-label">Password</span>
                  <div style={{ position:'relative' }}>
                    <span className="lv3-icon-l"><Lock style={{ width:16, height:16 }}/></span>
                    <input type={showPass?'text':'password'} required className="lv3-input"
                      value={form.password} placeholder="••••••••••••"
                      onChange={e => { setForm(f => ({...f, password:e.target.value})); clearError() }}/>
                    <button type="button" className="lv3-icon-r" onClick={() => setShowPass(!showPass)}>
                      {showPass ? <EyeOff style={{width:16,height:16}}/> : <Eye style={{width:16,height:16}}/>}
                    </button>
                  </div>
                </div>

                <div style={{ textAlign:'right' }}>
                  <button type="button" className="lv3-link"
                    onClick={() => { setMode('reset'); clearError() }}>
                    Forgot password?
                  </button>
                </div>

                <button type="submit" className="lv3-btn-primary" disabled={submitting||loading}>
                  {submitting && (
                    <div className="lv3-progress" style={{ width:`${progress}%` }}/>
                  )}
                  <span style={{ position:'relative', zIndex:1 }}>
                    {submitting ? 'Signing in...' : 'Sign in'}
                  </span>
                  {!submitting && <ArrowRight style={{ width:18, height:18, position:'relative', zIndex:1 }}/>}
                </button>
              </form>

              <div className="lv3-divider-biometric">
                <div className="lv3-divider-line" />
                <span style={{ fontSize:'11px', color:'rgba(186,230,253,0.4)', fontFamily:"'Inter',sans-serif" }}>or</span>
                <div className="lv3-divider-line" />
              </div>

              {/* Biometric / passkey — UI-ready placeholders only, no backend yet */}
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                <button
                  type="button"
                  className="lv3-btn-secondary"
                  disabled
                  aria-disabled="true"
                  title="Face ID sign-in is not yet available"
                  onClick={(e) => e.preventDefault()}
                >
                  <ScanFace style={{ width:16, height:16 }}/>
                  Continue with Face ID
                </button>
                <button
                  type="button"
                  className="lv3-btn-secondary"
                  disabled
                  aria-disabled="true"
                  title="Passkey sign-in is not yet available"
                  onClick={(e) => e.preventDefault()}
                  style={{ justifyContent:'space-between', paddingLeft:14, paddingRight:14 }}
                >
                  <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <KeyRound style={{ width:16, height:16 }}/>
                    Sign in with Passkey
                  </span>
                  <span style={{
                    fontSize:'10px', fontWeight:700, color:'#67e8f9',
                    background:'rgba(34,211,238,0.12)', border:'1px solid rgba(34,211,238,0.3)',
                    borderRadius:'6px', padding:'2px 6px',
                  }}>New</span>
                </button>
              </div>

              {/* Security microcopy */}
              <div style={{ marginTop:'26px', textAlign:'center' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginBottom:4 }}>
                  <ShieldCheck style={{ width:14, height:14, color:'#22d3ee' }}/>
                  <span style={{ fontSize:'12px', fontWeight:600, color:'rgba(226,242,255,0.75)', fontFamily:"'Inter',sans-serif" }}>
                    Protected by PharmaPulse Identity
                  </span>
                </div>
                <p style={{ fontSize:'11px', color:'rgba(186,230,253,0.4)', fontFamily:"'Inter',sans-serif", margin:0 }}>
                  Your data is encrypted and secure
                </p>
              </div>
            </>
          ) : (
            /* ── Reset password mode ─────────────────────── */
            <div>
              <button className="lv3-link" onClick={() => { setMode('login'); setResetSent(false); setResetErr('') }}
                style={{ display:'flex', alignItems:'center', gap:6, marginBottom:'22px', fontSize:'12.5px' }}>
                <ArrowLeft style={{ width:14, height:14 }}/>
                Back to sign in
              </button>

              <h2 style={{ fontSize:'19px', fontWeight:700, letterSpacing:'-0.01em',
                color:'#F1F8FF', fontFamily:"'Inter',sans-serif", marginBottom:'6px' }}>
                Reset your password
              </h2>
              <p style={{ fontSize:'13px', color:'rgba(186,230,253,0.55)', fontFamily:"'Inter',sans-serif", marginBottom:'22px' }}>
                We'll send a recovery link to your email
              </p>

              {resetSent ? (
                <div style={{ textAlign:'center', padding:'28px 0' }}>
                  <div style={{ width:52, height:52, borderRadius:14,
                    background:'rgba(34,211,238,0.10)',
                    border:'1px solid rgba(34,211,238,0.28)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    margin:'0 auto 16px' }}>
                    <CheckCircle2 style={{ width:26, height:26, color:'#22d3ee' }}/>
                  </div>
                  <h3 style={{ fontWeight:700, color:'#F1F8FF', marginBottom:6, fontFamily:"'Inter',sans-serif" }}>Link sent</h3>
                  <p style={{ fontSize:13, color:'rgba(186,230,253,0.55)', marginBottom:18, fontFamily:"'Inter',sans-serif" }}>
                    Check your inbox for the reset link
                  </p>
                  <button onClick={() => setMode('login')} className="lv3-btn-primary">
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleReset} style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                  {resetErr && (
                    <div className="lv3-alert" style={{
                      display:'flex', alignItems:'center', gap:8,
                      padding:'10px 14px', background:'rgba(239,68,68,0.08)',
                      border:'1px solid rgba(239,68,68,0.25)',
                      borderRadius:'10px', fontSize:13, color:'#FCA5A5' }}>
                      <AlertCircle style={{ width:14, height:14, flexShrink:0 }}/>
                      {resetErr}
                    </div>
                  )}
                  <div style={{ position:'relative' }}>
                    <span className="lv3-icon-l"><Mail style={{ width:16, height:16 }}/></span>
                    <input type="email" required className="lv3-input"
                      value={resetEmail} placeholder="name@yourpharmacy.com"
                      onChange={e => setResetEmail(e.target.value)}/>
                  </div>
                  <button type="submit" className="lv3-btn-primary">
                    Send recovery link
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Footer — language placeholder + legal links (no new routes) */}
          <div style={{
            marginTop:'28px', paddingTop:'18px',
            borderTop:'1px solid rgba(255,255,255,0.06)',
            display:'flex', alignItems:'center', justifyContent:'space-between',
          }}>
            <span style={{
              display:'flex', alignItems:'center', gap:6,
              fontSize:'11.5px', color:'rgba(186,230,253,0.5)', fontFamily:"'Inter',sans-serif",
              cursor:'default',
            }}>
              <Globe style={{ width:13, height:13 }}/>
              English
            </span>
            <div style={{ display:'flex', gap:14 }}>
              <span style={{ fontSize:'11.5px', color:'rgba(186,230,253,0.4)', fontFamily:"'Inter',sans-serif", cursor:'default' }}>
                Privacy Policy
              </span>
              <span style={{ fontSize:'11.5px', color:'rgba(186,230,253,0.4)', fontFamily:"'Inter',sans-serif", cursor:'default' }}>
                Terms of Service
              </span>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          RIGHT — Data Ocean Intelligence Stream
      ══════════════════════════════════════════════════ */}
      <div className="lv3-right-panel" style={{
        flex:1, position:'relative', overflow:'hidden',
        background:'radial-gradient(ellipse 70% 60% at 55% 50%, rgba(14,30,54,1) 0%, #020611 70%)',
      }}>
        <DataOceanBackground />

        <div style={{
          position:'absolute', inset:0,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <IdentityPulseLogo size={240} />
        </div>

        {INTELLIGENCE_LABELS.map((l) => (
          <LabelChip key={l.text} text={l.text} top={l.top} left={l.left} />
        ))}
      </div>
    </div>
  )
}
