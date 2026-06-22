// ============================================================
// ElementForm — Element field inputs + validation (Phase 2G)
//
// Pure presentational form. Validation is exported separately so
// it can run before submit without needing the rendered DOM.
//
// Fields: label, weight, description (optional) only.
// NO rule fields. NO pipeline/processor configuration. NO thresholds.
// ============================================================
import React from 'react'

export const DEFAULT_ELEMENT_FORM_VALUES = {
  label:       '',
  weight:      '1',
  description: '',
}

/**
 * Validates element form values. Trims whitespace. Never throws.
 * Returns { valid, errors }.
 */
export function validateElementForm(values) {
  const errors = {}

  const label     = (values?.label ?? '').trim()
  const weightStr = (values?.weight ?? '').toString().trim()
  const weight     = parseFloat(weightStr)

  if (!label) {
    errors.label = 'Label is required'
  }

  if (!weightStr) {
    errors.weight = 'Weight is required'
  } else if (Number.isNaN(weight) || weight <= 0) {
    errors.weight = 'Weight must be greater than 0'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

const fieldStyle = {
  width: '100%',
  fontSize: '12px',
  color: 'var(--text-primary)',
  background: 'var(--bg-canvas)',
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  padding: '7px 10px',
  fontFamily: "'Inter', sans-serif",
  outline: 'none',
}

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: '4px',
}

const errorStyle = {
  fontSize: '10px',
  color: '#f87171',
  marginTop: '3px',
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  )
}

export default function ElementForm({ values, errors = {}, onChange, disabled = false }) {
  const handle = (field) => (e) => onChange?.(field, e.target.value)

  return (
    <div>
      <Field label="Label" error={errors.label}>
        <input
          type="text"
          value={values.label}
          onChange={handle('label')}
          disabled={disabled}
          placeholder="e.g. Prescription Volume"
          style={{ ...fieldStyle, borderColor: errors.label ? 'rgba(239,68,68,0.4)' : 'var(--border-default)' }}
        />
      </Field>

      <Field label="Weight" error={errors.weight}>
        <input
          type="number"
          step="0.01"
          min="0"
          value={values.weight}
          onChange={handle('weight')}
          disabled={disabled}
          placeholder="1.0"
          style={{ ...fieldStyle, borderColor: errors.weight ? 'rgba(239,68,68,0.4)' : 'var(--border-default)' }}
        />
      </Field>

      <Field label="Description (optional)">
        <textarea
          value={values.description}
          onChange={handle('description')}
          disabled={disabled}
          rows={2}
          placeholder="Short description of this element"
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
      </Field>
    </div>
  )
}
