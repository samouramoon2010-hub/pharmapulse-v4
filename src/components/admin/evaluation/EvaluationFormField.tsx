// ============================================================
// EvaluationFormField — shared field-label wrapper for the
// Evaluation Registry and Evaluation Run admin pages.
//
// Both pages previously defined an identical local component named
// `F` (same outer/label styling) — EvaluationRegistryPage's version
// was a strict superset (adds optional required/error/hint), so it
// was extracted here and both pages now share it. Pure presentational,
// no business logic.
// ============================================================
import React from 'react'

export default function EvaluationFormField({
  label, required = false, error, children, hint,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <label style={{
        display: 'block', fontSize: '10px', fontWeight: 600,
        letterSpacing: '0.07em', textTransform: 'uppercase',
        color: 'var(--text-muted)', marginBottom: '4px',
      }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>}
      </label>
      {children}
      {hint  && <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{hint}</p>}
      {error && <p style={{ fontSize: '11px', color: '#f87171',    marginTop: '3px' }}>{error}</p>}
    </div>
  )
}
