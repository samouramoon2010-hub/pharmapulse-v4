// ============================================================
// About Page — System information
// ============================================================
import React from 'react'
import { Activity, Code2, Database, Zap, Shield, Globe } from 'lucide-react'
import Logo from '../../components/brand/Logo'

const TECH = [
  { icon: Code2,    label: 'React 19 + Vite 6',        desc: 'Frontend Framework' },
  { icon: Database, label: 'Firebase / Firestore',      desc: 'Backend & Database' },
  { icon: Zap,      label: 'Zustand + React Query',     desc: 'State Management' },
  { icon: Globe,    label: 'TailwindCSS + Recharts',    desc: 'UI & Visualization' },
  { icon: Shield,   label: 'Firebase Auth + Rules',     desc: 'Security Layer' },
]

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="card card-p text-center py-10"
           style={{
             background: 'linear-gradient(135deg, rgba(26,154,126,0.08), rgba(26,154,126,0.02))',
             borderColor: 'var(--border-brand)',
           }}>
        <div className="flex justify-center mb-5">
          <Logo size={52} />
        </div>
        <h1 className="text-3xl font-bold text-gradient" style={{ fontFamily:"'Sora',sans-serif" }}>
          PharmaPulse
        </h1>
        <p className="text-sm mt-2" style={{ color:'var(--text-secondary)' }}>
          Enterprise Pharmacy KPI System
        </p>
        <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
          <span className="badge badge-brand">v4.0.0</span>
          <span className="badge badge-success">Production</span>
          <span className="badge badge-neutral">Build 2025</span>
        </div>
      </div>

      {/* Developer */}
      <div className="card card-p">
        <h2 className="section-title mb-4">المطوّر</h2>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold text-white bg-gradient-brand">
            S
          </div>
          <div>
            <div className="text-base font-bold" style={{ color:'var(--text-primary)' }}>Samir Goda</div>
            <div className="text-sm" style={{ color:'var(--brand-300)' }}>Enterprise Software Engineer</div>
            <div className="text-xs mt-1" style={{ color:'var(--text-muted)' }}>
              Designed & Developed PharmaPulse from scratch
            </div>
          </div>
        </div>
      </div>

      {/* System info */}
      <div className="card card-p">
        <h2 className="section-title mb-4">معلومات النظام</h2>
        {[
          { label:'الإصدار',         value:'4.0.0' },
          { label:'تاريخ الإصدار',   value:'2025' },
          { label:'الوضع',           value:'Production' },
          { label:'قاعدة البيانات',  value:'Cloud Firestore' },
          { label:'المصادقة',        value:'Firebase Authentication' },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between py-3 border-b last:border-0"
               style={{ borderColor:'var(--border)' }}>
            <span className="text-sm" style={{ color:'var(--text-muted)' }}>{item.label}</span>
            <span className="text-sm font-medium" style={{ color:'var(--text-primary)' }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Technologies */}
      <div className="card card-p">
        <h2 className="section-title mb-4">التقنيات المستخدمة</h2>
        <div className="space-y-3">
          {TECH.map((t) => (
            <div key={t.label} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                   style={{ background:'rgba(26,154,126,0.1)', border:'1px solid var(--border-brand)' }}>
                <t.icon className="w-4 h-4" style={{ color:'var(--brand-300)' }} />
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color:'var(--text-primary)' }}>{t.label}</div>
                <div className="text-xs" style={{ color:'var(--text-muted)' }}>{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs pb-4" style={{ color:'var(--text-muted)' }}>
        © 2025 PharmaPulse · All rights reserved · Designed by Samir Goda
      </p>
    </div>
  )
}
