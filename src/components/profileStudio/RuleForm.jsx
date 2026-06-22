// ============================================================
// RuleForm — Rule field inputs + validation (Phase 2H)
//
// Pure presentational form. Validation is exported separately so
// it can run before submit without needing the rendered DOM.
//
// Fields: label, kpiKey (registry-driven select), weight,
// description (optional) only.
//
// NO pipeline/processor configuration. NO hardcoded KPI list — the
// `kpis` prop must be supplied by the caller via the KPI registry.
// ============================================================
import React from 'react'

export const DEFAULT_RULE_FORM_VALUES = {
  label:       '',
  kpiKey:      '',
  weight:      '1',
  description: '',
}

/**
 * Validates rule form values. Trims whitespace. Never throws.
 * Returns { valid, errors }.
 */
export function validateRuleForm(values) {
  const errors = {}

  const label     = (values?.label ?? '').trim()
  const kpiKey    = (values?.kpiKey ?? '').trim()
  const weightStr = (values?.weight ?? '').toString().trim()
  const weight    = parseFloat(weightStr)

  if (!label) {
    errors.label = 'Label is required'
  }

  if (!kpiKey) {
    errors.kpiKey = 'KPI is required'
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

export default function RuleForm({ values, errors = {}, kpis = [], onChange, disabled = false }) {
  const handle = (field) => (e) => onChange?.(field, e.target.value)

  return (
    <div>
      <Field label="Label" error={errors.label}>
        <input
          type="text"
          value={values.label}
          onChange={handle('label')}
          disabled={disabled}
          placeholder="e.g. Wasfaty Achievement"
          style={{ ...fieldStyle, borderColor: errors.label ? 'rgba(239,68,68,0.4)' : 'var(--border-default)' }}
        />
      </Field>

      <Field label="KPI" error={errors.kpiKey}>
        <select
          value={values.kpiKey}
          onChange={handle('kpiKey')}
          disabled={disabled}
          style={{ ...fieldStyle, borderColor: errors.kpiKey ? 'rgba(239,68,68,0.4)' : 'var(--border-default)' }}
        >
          <option value="">Select a KPI…</option>
          {kpis.map((kpi) => (
            <option key={kpi.key} value={kpi.key}>
              {kpi.label} · {kpi.category} · {kpi.unit}
            </option>
          ))}
        </select>
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
          placeholder="Short description of this rule"
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
      </Field>
    </div>
  )
}
