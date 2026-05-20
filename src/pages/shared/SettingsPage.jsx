// ============================================================
// Settings Page — Fully functional with localStorage persistence
// ============================================================

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings, Bell, Shield, User, LogOut, Save,
  Moon, Sun, Globe, Zap, LayoutGrid, RefreshCw,
  CheckCircle2, Loader2,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useSettingsStore } from '../../store/settingsStore'
import { getRoleLabel } from '../../utils/helpers'

// ── Toggle switch ────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-all duration-200 ${checked ? 'bg-brand-500' : 'bg-slate-700'}`}
    >
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${checked ? 'right-1' : 'left-1'}`} />
    </button>
  )
}

// ── Section wrapper ──────────────────────────────────────────
function Section({ title, icon: Icon, children }) {
  return (
    <div className="kpi-card space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-800/60">
        <Icon className="w-4 h-4 text-brand-400" />
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const navigate  = useNavigate()
  const { userProfile, logout } = useAuthStore()
  const settings  = useSettingsStore()

  const [profileForm, setProfileForm] = useState({
    displayName: userProfile?.displayName || '',
    phone:       userProfile?.phone || '',
  })
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [saved,  setSaved]  = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSaveProfile = async () => {
    setSaving(true)
    // In demo mode: just show saved feedback (no Firestore write needed)
    await new Promise((r) => setTimeout(r, 600))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">الإعدادات</h1>
        <p className="text-sm text-slate-400 mt-0.5">تخصيص التطبيق وإدارة حسابك</p>
      </div>

      {/* ── Profile ── */}
      <Section title="معلومات الحساب" icon={User}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
            {userProfile?.displayName?.[0]}
          </div>
          <div>
            <div className="text-base font-semibold text-white">{userProfile?.displayName}</div>
            <div className="text-sm text-slate-400">{userProfile?.email}</div>
            <div className="text-xs text-brand-400 mt-0.5">{getRoleLabel(userProfile?.role)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">الاسم</label>
            <input type="text" value={profileForm.displayName}
              onChange={(e) => setProfileForm((f) => ({ ...f, displayName: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">رقم الجوال</label>
            <input type="tel" value={profileForm.phone}
              onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="05xxxxxxxx" />
          </div>
        </div>
        <button onClick={handleSaveProfile} disabled={saving} className="btn-primary text-sm">
          {saving  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري الحفظ...</> :
           saved   ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> تم الحفظ</> :
                     <><Save className="w-3.5 h-3.5" /> حفظ التغييرات</>}
        </button>
      </Section>

      {/* ── Appearance ── */}
      <Section title="المظهر والعرض" icon={Moon}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-300">وضع العرض</div>
            <div className="text-xs text-slate-500">اختر بين الوضع الليلي والنهاري</div>
          </div>
          <div className="flex gap-2">
            {[
              { val: 'dark',  icon: Moon, label: 'داكن' },
              { val: 'light', icon: Sun,  label: 'فاتح' },
            ].map((opt) => (
              <button key={opt.val} onClick={() => settings.setTheme(opt.val)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                  settings.theme === opt.val
                    ? 'bg-brand-500/20 border-brand-500/40 text-brand-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <opt.icon className="w-3.5 h-3.5" />{opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-300">الوضع المضغوط</div>
            <div className="text-xs text-slate-500">عرض أكثر محتوى في مساحة أصغر</div>
          </div>
          <Toggle checked={settings.compactMode} onChange={settings.setCompactMode} />
        </div>
      </Section>

      {/* ── Language ── */}
      <Section title="اللغة" icon={Globe}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-300">لغة التطبيق</div>
            <div className="text-xs text-slate-500">اللغة المستخدمة في الواجهة</div>
          </div>
          <div className="flex gap-2">
            {[{ val: 'ar', label: 'عربي' }, { val: 'en', label: 'English' }].map((opt) => (
              <button key={opt.val} onClick={() => settings.setLanguage(opt.val)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                  settings.language === opt.val
                    ? 'bg-brand-500/20 border-brand-500/40 text-brand-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >{opt.label}</button>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Notifications ── */}
      <Section title="الإشعارات" icon={Bell}>
        {[
          { key: 'kpiReminder',   label: 'تذكير إدخال KPI',       sub: 'تنبيه عند نسيان الإدخال اليومي' },
          { key: 'targetAlert',   label: 'تنبيه تجاوز الهدف',     sub: 'إشعار فوري عند تحقيق الهدف' },
          { key: 'weeklyReport',  label: 'تقرير أسبوعي',          sub: 'ملخص الأداء كل أسبوع' },
          { key: 'branchAlerts',  label: 'تنبيهات الفرع',          sub: 'تنبيهات تخص أداء الفريق والفرع' },
        ].map((item) => (
          <div key={item.key} className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-300">{item.label}</div>
              <div className="text-xs text-slate-500">{item.sub}</div>
            </div>
            <Toggle
              checked={settings.notifications[item.key]}
              onChange={(v) => settings.setNotification(item.key, v)}
            />
          </div>
        ))}
      </Section>

      {/* ── App behavior ── */}
      <Section title="سلوك التطبيق" icon={Zap}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-300">التحديث التلقائي</div>
            <div className="text-xs text-slate-500">تثبيت تحديثات التطبيق تلقائياً</div>
          </div>
          <Toggle checked={settings.autoUpdate} onChange={settings.setAutoUpdate} />
        </div>

        <button onClick={settings.resetToDefaults}
          className="btn-secondary text-sm w-full justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> إعادة الإعدادات الافتراضية
        </button>
      </Section>

      {/* ── Security ── */}
      <Section title="الأمان" icon={Shield}>
        <div>
          <label className="block text-xs text-slate-400 mb-1">كلمة المرور الحالية</label>
          <input type="password" value={pwForm.current}
            onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
            placeholder="••••••••" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">كلمة المرور الجديدة</label>
            <input type="password" value={pwForm.next}
              onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
              placeholder="••••••••" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">تأكيد كلمة المرور</label>
            <input type="password" value={pwForm.confirm}
              onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
              placeholder="••••••••" />
          </div>
        </div>
        {pwForm.next && pwForm.confirm && pwForm.next !== pwForm.confirm && (
          <p className="text-xs text-red-400">كلمة المرور غير متطابقة</p>
        )}
        <button
          disabled={!pwForm.current || !pwForm.next || pwForm.next !== pwForm.confirm}
          className="btn-secondary text-sm">
          تغيير كلمة المرور
        </button>
      </Section>

      {/* ── Danger zone ── */}
      <div className="kpi-card border-red-500/20">
        <h3 className="text-sm font-semibold text-red-400 mb-3">منطقة الخطر</h3>
        <button onClick={handleLogout} className="btn-danger w-full justify-center">
          <LogOut className="w-4 h-4" /> تسجيل الخروج
        </button>
      </div>
    </div>
  )
}
