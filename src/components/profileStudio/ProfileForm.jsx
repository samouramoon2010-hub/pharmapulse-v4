// ============================================================
// ProfileForm — Create-draft form fields + validation (Phase 2B)
//
// Pure presentational form. Validation is exported separately so
// it can run before submit without needing the rendered DOM.
//
// NO hierarchy editor. NO processors. NO builder.
// ============================================================
import React from 'react'

export const SCOPE_OPTIONS = [
  { value: 'PHARMACY', label: 'Branch'   },
  { value: 'DISTRICT',  label: 'District' },
  { value: 'REGION',    label: 'Region'   },
  { value: 'NATIONAL',  label: 'National' },
]

export const DEFAULT_FORM_VALUES = {
  name:        '',
  description: '',
  scope:       'PHARMACY',
  validFrom:   new Date().toISOString().slice(0, 10),
  version:     '1.0.0',
}

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

/**
 * Validates create-draft form values.
 * Trims whitespace. Never throws. Returns { valid, errors }.
 */
export function validateProfileForm(values) {
  const errors = {}

  const name      = (values?.name ?? '').trim()
  const scope     = (values?.scope ?? '').trim()
  const validFrom = (values?.validFrom ?? '').trim()
  const version   = (values?.version ?? '').trim()

  if (!name) {
    errors.name = 'Name is required'
  } else if (name.length < 3 || name.length > 100) {
    errors.name = 'Name must be between 3 and 100 characters'
  }

  if (!scope) {
    errors.scope = 'Scope is required'
  }

  if (!validFrom) {
    errors.validFrom = 'Valid From date is required'
  }

  if (!version) {
    errors.version = 'Version is required'
  } else if (!SEMVER_PATTERN.test(version)) {
    errors.version = 'Version must be in major.minor.patch format (e.g. 1.0.0)'
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

export default function ProfileForm({ values, errors = {}, onChange, disabled = false }) {
  const handle = (field) => (e) => onChange?.(field, e.target.value)

  return (
    <div>
      <Field label="Name" error={errors.name}>
        <input
          type="text"
          value={values.name}
          onChange={handle('name')}
          disabled={disabled}
          placeholder="e.g. Branch Quarterly Evaluation"
          style={{ ...fieldStyle, borderColor: errors.name ? 'rgba(239,68,68,0.4)' : 'var(--border-default)' }}
        />
      </Field>

      <Field label="Description (optional)">
        <textarea
          value={values.description}
          onChange={handle('description')}
          disabled={disabled}
          rows={2}
          placeholder="Short description of this profile"
          style={{ ...fieldStyle, resize: 'vertical' }}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Scope" error={errors.scope}>
          <select
            value={values.scope}
            onChange={handle('scope')}
            disabled={disabled}
            style={{ ...fieldStyle, borderColor: errors.scope ? 'rgba(239,68,68,0.4)' : 'var(--border-default)' }}
          >
            {SCOPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Version" error={errors.version}>
          <input
            type="text"
            value={values.version}
            onChange={handle('version')}
            disabled={disabled}
            placeholder="1.0.0"
            style={{ ...fieldStyle, borderColor: errors.version ? 'rgba(239,68,68,0.4)' : 'var(--border-default)' }}
          />
        </Field>
      </div>

      <Field label="Valid From" error={errors.validFrom}>
        <input
          type="date"
          value={values.validFrom}
          onChange={handle('validFrom')}
          disabled={disabled}
          style={{ ...fieldStyle, borderColor: errors.validFrom ? 'rgba(239,68,68,0.4)' : 'var(--border-default)' }}
        />
      </Field>

      <Field label="Status">
        <input
          type="text"
          value="DRAFT"
          disabled
          readOnly
          style={{ ...fieldStyle, opacity: 0.6, cursor: 'not-allowed' }}
        />
      </Field>
    </div>
  )
}
