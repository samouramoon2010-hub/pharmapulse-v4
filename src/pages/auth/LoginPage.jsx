// ============================================================
// Login Page — Enterprise Design, Remember Me, Reset Password
// ============================================================
import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Activity, Loader2, AlertCircle, CheckCircle2,
         ArrowLeft, Lock, Mail } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { DEMO_CREDENTIALS } from '../../data/dummyData'
import { ROLE_LABELS } from '../../constants'

const ROLE_HOME = {
  admin:      '/dashboard',
  manager:    '/dashboard',
  pharmacist: '/dashboard',
  // Legacy roles
  area_manager:  '/dashboard',
  store_manager: '/dashboard',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login, resetPassword, loading, error, clearError } = useAuthStore()

  const [form,       setForm]       = useState({ email: '', password: '' })
  const [rememberMe, setRememberMe] = useState(true)
  const [showPass,   setShowPass]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resetMode,  setResetMode]  = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent,  setResetSent]  = useState(false)
  const [resetErr,   setResetErr]   = useState('')

  const timeoutReason = params.get('reason') === 'timeout'

  useEffect(() => { return () => clearError() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.email || !form.password) return
    setSubmitting(true)
    try {
      const profile = await login(form.email, form.password, rememberMe)
      navigate(ROLE_HOME[profile.role] || '/dashboard', { replace: true })
    } catch { /* error shown from store */ }
    finally { setSubmitting(false) }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    if (!resetEmail) return
    setResetErr('')
    try {
      await resetPassword(resetEmail)
      setResetSent(true)
    } catch (err) {
      setResetErr(err.message)
    }
  }

  const fillDemo = (cred) => {
    setForm({ email: cred.email, password: cred.password })
    clearError()
  }

  return (
    <div className="min-h-screen flex items-stretch">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col justify-between p-10
                      relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950">
        {/* Background mesh */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
          {/* Grid lines */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-brand-500 flex items-center justify-center shadow-glow">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-xl font-bold text-white tracking-tight">PharmaPulse</div>
              <div className="text-xs text-brand-400 font-medium">Enterprise KPI System</div>
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10 space-y-6">
          <div>
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight">
              إدارة أداء
              <span className="block text-gradient">الصيدليات</span>
              بذكاء
            </h1>
            <p className="mt-4 text-slate-400 text-base leading-relaxed max-w-md">
              منصة متكاملة لمتابعة مؤشرات الأداء الرئيسية، تحليل البيانات، وتحقيق الأهداف في الوقت الفعلي.
            </p>
          </div>

          {/* Stats */}
          <div className="flex gap-8">
            {[
              { label: 'فرع نشط',     value: '150+' },
              { label: 'صيدلاني',     value: '800+' },
              { label: 'دقة البيانات', value: '99.9%' },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-2xl font-bold text-white">{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10 text-xs text-slate-700">
          PharmaPulse v2.2 — جميع الحقوق محفوظة
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-[400px] animate-fade-in">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shadow-glow">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div className="font-bold text-white">PharmaPulse</div>
          </div>

          {/* Timeout warning */}
          {timeoutReason && (
            <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/20
                            rounded-xl px-4 py-3 mb-5 text-sm text-amber-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              انتهت الجلسة بسبب عدم النشاط — يرجى تسجيل الدخول مجدداً
            </div>
          )}

          {!resetMode ? (
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-bold text-white">مرحباً بعودتك</h2>
                <p className="text-sm text-slate-500 mt-1">سجّل دخولك للمتابعة</p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20
                                rounded-xl px-4 py-3 mb-5 text-sm text-red-400 animate-slide-up">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    البريد الإلكتروني
                  </label>
                  <div className="relative">
                    <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type="email" value={form.email} required dir="ltr"
                      onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); clearError() }}
                      placeholder="user@company.com"
                      className="pr-10 bg-slate-900 border-slate-700/80" />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    كلمة المرور
                  </label>
                  <div className="relative">
                    <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type={showPass ? 'text' : 'password'} value={form.password} required
                      onChange={(e) => { setForm((f) => ({ ...f, password: e.target.value })); clearError() }}
                      placeholder="••••••••"
                      className="pr-10 pl-10 bg-slate-900 border-slate-700/80" />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember me + Forgot */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <div onClick={() => setRememberMe(!rememberMe)}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                        rememberMe ? 'bg-brand-500 border-brand-500' : 'border-slate-600 hover:border-slate-500'
                      }`}>
                      {rememberMe && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors select-none">
                      تذكّرني
                    </span>
                  </label>
                  <button type="button" onClick={() => setResetMode(true)}
                    className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
                    نسيت كلمة المرور؟
                  </button>
                </div>

                <button type="submit" disabled={submitting || loading}
                  className="btn btn-primary w-full py-3 text-base mt-2">
                  {submitting ? <><Loader2 className="w-5 h-5 animate-spin" /> جاري الدخول...</> : 'تسجيل الدخول'}
                </button>
              </form>

              {/* Demo credentials */}
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-slate-800" />
                  <span className="text-xs text-slate-600 shrink-0">حسابات تجريبية</span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {DEMO_CREDENTIALS.map((c) => (
                    <button key={c.email} onClick={() => fillDemo(c)}
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-slate-800
                                 hover:border-slate-700 hover:bg-slate-900/50 transition-all text-right group">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">
                          {c.role}
                        </div>
                        <div className="text-xs text-slate-600 truncate">{c.email}</div>
                      </div>
                      <ArrowLeft className="w-3.5 h-3.5 text-slate-700 group-hover:text-brand-400 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Reset Password */
            <div className="animate-slide-up">
              <button onClick={() => { setResetMode(false); setResetSent(false); setResetErr('') }}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 mb-6 transition-colors">
                <ArrowLeft className="w-4 h-4 rotate-180" /> العودة لتسجيل الدخول
              </button>

              <div className="mb-7">
                <h2 className="text-2xl font-bold text-white">استعادة كلمة المرور</h2>
                <p className="text-sm text-slate-500 mt-1">
                  أدخل بريدك وسنرسل لك رابط الاستعادة
                </p>
              </div>

              {resetSent ? (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-white">تم الإرسال!</p>
                    <p className="text-sm text-slate-400 mt-1">راجع بريدك الإلكتروني لرابط الاستعادة</p>
                  </div>
                  <button onClick={() => { setResetMode(false); setResetSent(false) }}
                    className="btn btn-primary mt-2">العودة لتسجيل الدخول</button>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  {resetErr && (
                    <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10
                                    border border-red-500/20 rounded-xl px-4 py-3">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />{resetErr}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      البريد الإلكتروني
                    </label>
                    <input type="email" value={resetEmail} dir="ltr"
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="user@company.com" required />
                  </div>
                  <button type="submit" className="btn btn-primary w-full py-3 mt-2">
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

// Local Check icon (lucide doesn't export 'Check' separately sometimes)
function Check({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}
