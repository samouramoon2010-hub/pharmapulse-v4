// ============================================================
// ActionPageChrome — shared page chrome for the Actions surfaces
// (Designer Mode pass).
//
// Toast / SectionHeading / SkeletonActionRow were previously
// copy-pasted verbatim across MyActionsPage.jsx and TasksPage.jsx —
// both pages render at the same time in a manager's navigation
// (My Actions + Tasks), so any visual drift between the two copies
// would be user-visible. Extracted here so both pages share the
// exact same components — no behavior change, pure de-duplication.
//
// Pure presentational. No business logic, no Firestore.
// ============================================================
import React from 'react'
import { X } from 'lucide-react'

// ── Skeleton row ─────────────────────────────────────────────

export function SkeletonActionRow() {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      {[60, 100, 80].map((w, i) => (
        <div key={i} className="skeleton rounded" style={{ height: '10px', width: `${w}%`, opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  )
}

// ── Section heading ───────────────────────────────────────────

export function SectionHeading({ title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <span style={{
        fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-muted)',
        fontFamily: "'Inter', sans-serif",
      }}>
        {title}
      </span>
      {count !== undefined && (
        <span style={{
          fontSize: '10px', padding: '1px 7px', borderRadius: '9999px',
          background: 'var(--bg-elevated)', color: 'var(--text-muted)',
          border: '1px solid var(--border-subtle)', fontFamily: "'Inter', sans-serif",
        }}>
          {count}
        </span>
      )}
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────

export function Toast({ toast, onDismiss }) {
  if (!toast) return null
  const isError = toast.type === 'error'
  return (
    <div style={{
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 60, padding: '10px 18px', borderRadius: '9px',
      background: isError ? 'rgba(185,43,43,0.95)' : 'rgba(45,125,90,0.95)',
      color: '#fff', fontSize: '13px', fontFamily: "'Inter', sans-serif",
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', gap: '10px',
    }}>
      {toast.message}
      <button onClick={onDismiss} style={{
        background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
        padding: '0 2px', display: 'flex', alignItems: 'center',
      }}>
        <X style={{ width: 14, height: 14 }} />
      </button>
    </div>
  )
}
