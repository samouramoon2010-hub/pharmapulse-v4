// ============================================================
// Login Page — Enterprise Branding + Animations
// ============================================================
import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Eye, EyeOff, Loader2, AlertCircle, CheckCircle2,
  ArrowLeft, Lock, Mail, Activity,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import Logo from '../../components/brand/Logo'

const DEMO_CREDENTIALS = [
  { role:'Admin',      email:'admin@pharmapulse.com',   password:'Admin@123',   color:'#ef4444', note:'كامل الصلاحيات' },
  { role:'مدير فرع',   email:'manager@pharmapulse.com', password:'Manager@123', color:'#f59e0b', note:'فرعه فقط' },
  { role:'صيدلاني',    email:'pharma@pharmapulse.com',  password:'Pharma@123',  color:'#1a9a7e', note:'بياناته فقط' },
]

const ROLE_HOME = {
  admin:'dashboard', manager:'dashboard', pharmacist:'dashboard',
  area_manager:'dashboard', store_manager:'dashboard',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login, resetPassword, loading, error, clearError } = useAuthStore()

  const [form,       setForm]       = useState({ email:'', password:'' })
  const [rememberMe, setRememberMe] = useState(true)
  const [showPass,   setShowPass]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [mode,       setMode]       = useState('login') // login | reset
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent,  setResetSent]  = useState(false)
  const [resetErr,   setResetErr]   = useState('')

  const isTimeout = params.get('reason') === 'timeout'

  useEffect(() => () => clearError(), [])

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) return
    setSubmitting(true)
    try {
      const profile = await login(form.email, form.password, rememberMe)
      navigate(`/${ROLE_HOME[profile.role] || 'dashboard'}`, { replace: true })
    } catch {}
    finally { setSubmitting(false) }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    setResetErr('')
    try {
      await resetPassword(resetEmail)
      setResetSent(true)
    } catch (err) { setResetErr(err.message) }
  }

  const fill = (cred) => {
    setForm({ email: cred.email, password: cred.password })
    clearError()
  }

  return (
    <div className="min-h-screen flex" style={{ background:'var(--bg-base)' }}>

      {/* ── Left: Branding panel ───────────────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative overflow-hidden"
           style={{ background: 'linear-gradient(145deg, rgba(7,18,32,0.99) 0%, rgba(4,13,24,0.99) 100%)' }}>
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute w-[600px] h-[600px] rounded-full"
               style={{
                 background:'radial-gradient(circle, rgba(26,154,126,0.12) 0%, transparent 70%)',
                 top:'-10%', left:'-15%',
               }} />
          <div className="absolute w-[400px] h-[400px] rounded-full"
               style={{
                 background:'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)',
                 bottom:'-5%', right:'-10%',
               }} />
          {/* Grid overlay */}
          <svg className="absolute inset-0 w-full h-full" style={{ opacity:0.03 }}>
            <defs>
              <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <Logo size={42} />

          {/* Hero */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                   style={{ background:'rgba(26,154,126,0.12)', border:'1px solid rgba(26,154,126,0.25)', color:'var(--brand-300)' }}>
                <Activity className="w-3.5 h-3.5" />
                Enterprise KPI Platform
              </div>
              <h1 className="text-4xl xl:text-5xl font-bold leading-tight"
                  style={{ color:'var(--text-primary)', fontFamily:"'Sora', sans-serif" }}>
                إدارة أداء
                <span className="block text-gradient mt-1">الصيدليات</span>
                بذكاء حقيقي
              </h1>
              <p className="text-base leading-relaxed max-w-md" style={{ color:'var(--text-secondary)' }}>
                منصة متكاملة لمتابعة مؤشرات الأداء الرئيسية، تحليل البيانات، وتحقيق الأهداف في الوقت الفعلي.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { v:'150+', l:'فرع نشط' },
                { v:'800+', l:'صيدلاني' },
                { v:'99.9%', l:'دقة البيانات' },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl p-4"
                     style={{ background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)' }}>
                  <div className="text-2xl font-bold text-gradient"
                       style={{ fontFamily:"'Sora',sans-serif" }}>{s.v}</div>
                  <div className="text-xs mt-1" style={{ color:'var(--text-muted)' }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-xs" style={{ color:'var(--text-muted)' }}>
            Designed & Developed by{' '}
            <span style={{ color:'var(--brand-300)', fontWeight:600 }}>Samir Goda</span>
            {' '}· PharmaPulse v4.0
          </div>
        </div>
      </div>

      {/* ── Right: Form panel ──────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6"
           style={{ background:'var(--bg-surface)' }}>
        <div className="w-full max-w-[400px] animate-fade-in">

          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <Logo size={38} />
          </div>

          {/* Timeout notice */}
          {isTimeout && (
            <div className="flex items-center gap-3 rounded-xl px-4 py-3 mb-5 text-sm animate-slide-down"
                 style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', color:'#fbbf24' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              انتهت الجلسة — سجّل الدخول مجدداً
            </div>
          )}

          {/* ── Login form ── */}
          {mode === 'login' && (
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-bold" style={{ color:'var(--text-primary)' }}>مرحباً بك</h2>
                <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>سجّل دخولك للمتابعة</p>
              </div>

              {error && (
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 mb-4 text-sm animate-slide-down"
                     style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', color:'#f87171' }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                         style={{ color:'var(--text-muted)' }}>البريد الإلكتروني</label>
                  <div className="relative">
                    <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                          style={{ color:'var(--text-muted)' }} />
                    <input type="email" dir="ltr" required value={form.email}
                      onChange={(e) => { setForm((f) => ({ ...f, email:e.target.value })); clearError() }}
                      placeholder="user@company.com"
                      className="pr-10" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                         style={{ color:'var(--text-muted)' }}>كلمة المرور</label>
                  <div className="relative">
                    <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                          style={{ color:'var(--text-muted)' }} />
                    <input type={showPass ? 'text' : 'password'} required value={form.password}
                      onChange={(e) => { setForm((f) => ({ ...f, password:e.target.value })); clearError() }}
                      placeholder="••••••••"
                      className="pr-10 pl-10" />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color:'var(--text-muted)' }}>
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember + Forgot */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <button type="button" onClick={() => setRememberMe(!rememberMe)}
                      className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
                      style={{
                        background: rememberMe ? 'var(--brand-500)' : 'transparent',
                        borderColor: rememberMe ? 'var(--brand-500)' : 'var(--border-hover)',
                      }}>
                      {rememberMe && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <span className="text-sm" style={{ color:'var(--text-secondary)' }}>تذكّرني</span>
                  </label>
                  <button type="button" onClick={() => setMode('reset')}
                    className="text-sm transition-colors" style={{ color:'var(--brand-300)' }}
                    onMouseEnter={(e) => e.target.style.color='var(--brand-400)'}
                    onMouseLeave={(e) => e.target.style.color='var(--brand-300)'}>
                    نسيت كلمة المرور؟
                  </button>
                </div>

                <button type="submit" disabled={submitting || loading} className="btn btn-primary w-full py-3 text-base mt-1">
                  {submitting ? <><Loader2 className="w-5 h-5 animate-spin" />جاري الدخول...</> : 'تسجيل الدخول'}
                </button>
              </form>

              {/* Demo credentials */}
              <div className="mt-7">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px" style={{ background:'var(--border)' }} />
                  <span className="text-xs" style={{ color:'var(--text-muted)' }}>حسابات تجريبية</span>
                  <div className="flex-1 h-px" style={{ background:'var(--border)' }} />
                </div>
                <div className="space-y-2">
                  {DEMO_CREDENTIALS.map((c) => (
                    <button key={c.email} onClick={() => fill(c)}
                      className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-right
                                 transition-all group"
                      style={{
                        background:'rgba(255,255,255,0.03)',
                        border:'1px solid var(--border)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                        e.currentTarget.style.borderColor = 'var(--border-brand)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                        e.currentTarget.style.borderColor = 'var(--border)'
                      }}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:c.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold" style={{ color:'var(--text-primary)' }}>{c.role}</div>
                        <div className="text-xs" style={{ color:'var(--text-muted)' }}>{c.note}</div>
                      </div>
                      <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0 rotate-180 opacity-0 group-hover:opacity-100 transition-opacity"
                                 style={{ color:'var(--brand-400)' }} />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Reset Password ── */}
          {mode === 'reset' && (
            <div className="animate-slide-up">
              <button onClick={() => { setMode('login'); setResetSent(false); setResetErr('') }}
                className="flex items-center gap-2 text-sm mb-7 transition-colors"
                style={{ color:'var(--text-muted)' }}
                onMouseEnter={(e) => e.currentTarget.style.color='var(--text-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.color='var(--text-muted)'}>
                <ArrowLeft className="w-4 h-4 rotate-180" />
                العودة لتسجيل الدخول
              </button>

              <h2 className="text-2xl font-bold mb-1" style={{ color:'var(--text-primary)' }}>
                استعادة كلمة المرور
              </h2>
              <p className="text-sm mb-7" style={{ color:'var(--text-muted)' }}>
                سنرسل لك رابط الاستعادة على بريدك الإلكتروني
              </p>

              {resetSent ? (
                <div className="text-center py-8 space-y-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                       style={{ background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)' }}>
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-bold" style={{ color:'var(--text-primary)' }}>تم الإرسال!</h3>
                    <p className="text-sm mt-1" style={{ color:'var(--text-muted)' }}>
                      راجع بريدك الإلكتروني
                    </p>
                  </div>
                  <button onClick={() => setMode('login')} className="btn btn-primary mx-auto">
                    العودة لتسجيل الدخول
                  </button>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  {resetErr && (
                    <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
                         style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', color:'#f87171' }}>
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />{resetErr}
                    </div>
                  )}
                  <div className="relative">
                    <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                          style={{ color:'var(--text-muted)' }} />
                    <input type="email" dir="ltr" required value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="user@company.com" className="pr-10" />
                  </div>
                  <button type="submit" className="btn btn-primary w-full py-3">
                    إرسال رابط الاستعادة
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
