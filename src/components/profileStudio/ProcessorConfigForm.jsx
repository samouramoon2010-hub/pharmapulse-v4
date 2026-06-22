// ============================================================
// ProcessorConfigForm — Processor step config inputs + validation
// (Phase 2I)
//
// Renders only the config fields already defined by the kernel for
// the selected processor type (PROCESSOR_DEFINITIONS.requiredConfigFields
// / optionalConfigFields from processors.ts), plus the universal
// order and enabled fields. No custom schemas, no new processor
// types, no formula strings.
//
// Validation reuses validateProcessorStepConfig() from
// processorValidation.ts for value-level checks — never duplicated.
// Required-field presence is the only check performed locally, since
// the kernel validator only checks values that are already present.
// ============================================================
import React from 'react'

import { getProcessorDefinition, BAND_EVALUATOR, PENALTY_EVALUATOR } from '../../profileStudio/processors'
import { validateProcessorStepConfig } from '../../profileStudio/processorValidation'

let _rowIdCounter = 0
function generateRowId(prefix) {
  _rowIdCounter++
  return `${prefix}_${Date.now()}_${_rowIdCounter}`
}

export const DEFAULT_PROCESSOR_STEP_FORM_VALUES = {
  order:   '0',
  enabled: true,

  ceiling:  '',
  floor:    '',
  weight:   '',

  zeroBehaviour: '',

  bands:        [],
  defaultScore: '',

  penaltyRules: [],
  maxPenalty:   '',
  penaltyFloor: '',

  aggregationType: '',

  zeroTargetBehaviour: '',
}

/**
 * Builds the plain config object (matching ProcessorStep.config shape)
 * from form values for the given processor type. Only includes fields
 * the kernel defines for that type, plus the universal `enabled` flag.
 */
export function buildProcessorConfig(processorType, values) {
  values = values ?? {}
  const def = getProcessorDefinition(processorType)
  const allowed = new Set([...(def?.requiredConfigFields ?? []), ...(def?.optionalConfigFields ?? [])])
  const config = { enabled: values.enabled !== false }

  if (allowed.has('ceiling') && values.ceiling !== '') config.ceiling = Number(values.ceiling)
  if (allowed.has('floor') && values.floor !== '') config.floor = Number(values.floor)
  if (allowed.has('weight') && values.weight !== '') config.weight = Number(values.weight)
  if (allowed.has('zeroBehaviour') && values.zeroBehaviour) config.zeroBehaviour = values.zeroBehaviour
  if (allowed.has('bands')) {
    config.bands = (values.bands ?? []).map((b) => ({
      id:     b.id,
      label:  b.label,
      minPct: Number(b.minPct),
      maxPct: Number(b.maxPct),
      score:  Number(b.score),
    }))
  }
  if (allowed.has('defaultScore') && values.defaultScore !== '') config.defaultScore = Number(values.defaultScore)
  if (allowed.has('penaltyRules')) {
    config.penaltyRules = (values.penaltyRules ?? []).map((r) => ({
      id:           r.id,
      condition:    r.condition,
      threshold:    Number(r.threshold),
      penaltyValue: Number(r.penaltyValue),
      label:        r.label || undefined,
    }))
  }
  if (allowed.has('maxPenalty') && values.maxPenalty !== '') config.maxPenalty = Number(values.maxPenalty)
  if (allowed.has('penaltyFloor') && values.penaltyFloor !== '') config.penaltyFloor = Number(values.penaltyFloor)
  if (allowed.has('aggregationType') && values.aggregationType) config.aggregationType = values.aggregationType
  if (allowed.has('zeroTargetBehaviour') && values.zeroTargetBehaviour) config.zeroTargetBehaviour = values.zeroTargetBehaviour

  return config
}

/**
 * Validates the step form: required-field presence (structural,
 * derived from the kernel's requiredConfigFields list) plus
 * value-level validation delegated entirely to
 * validateProcessorStepConfig(). Never throws.
 */
export function validateProcessorStepForm(processorType, values) {
  values = values ?? {}
  const errors = {}
  const def = getProcessorDefinition(processorType)

  const orderStr = (values?.order ?? '').toString().trim()
  if (orderStr === '' || Number.isNaN(parseFloat(orderStr))) {
    errors.order = 'Order is required'
  }

  for (const field of def?.requiredConfigFields ?? []) {
    if (field === 'bands' && (values.bands ?? []).length === 0) {
      errors.bands = 'At least one band is required'
    } else if (field === 'penaltyRules' && (values.penaltyRules ?? []).length === 0) {
      errors.penaltyRules = 'At least one penalty rule is required'
    } else if (field !== 'bands' && field !== 'penaltyRules' && !values?.[field]) {
      errors[field] = `${field} is required`
    }
  }

  const config = buildProcessorConfig(processorType, values)
  const issues = validateProcessorStepConfig(processorType, config)
  for (const issue of issues) {
    errors[issue.code] = issue.message
  }

  return { valid: Object.keys(errors).length === 0, errors, config }
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
    <div style={{ marginBottom: '12px' }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  )
}

function BandRows({ bands, onChange, disabled }) {
  const updateBand = (idx, field, value) => {
    const next = bands.map((b, i) => (i === idx ? { ...b, [field]: value } : b))
    onChange(next)
  }
  const addBand = () => {
    onChange([...bands, { id: generateRowId('band'), label: '', minPct: '', maxPct: '', score: '' }])
  }
  const removeBand = (idx) => onChange(bands.filter((_, i) => i !== idx))

  return (
    <div>
      {bands.map((b, idx) => (
        <div key={b.id} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
          <input placeholder="Label" value={b.label} disabled={disabled}
            onChange={(e) => updateBand(idx, 'label', e.target.value)} style={{ ...fieldStyle, flex: 2 }} />
          <input placeholder="Min %" type="number" value={b.minPct} disabled={disabled}
            onChange={(e) => updateBand(idx, 'minPct', e.target.value)} style={{ ...fieldStyle, flex: 1 }} />
          <input placeholder="Max %" type="number" value={b.maxPct} disabled={disabled}
            onChange={(e) => updateBand(idx, 'maxPct', e.target.value)} style={{ ...fieldStyle, flex: 1 }} />
          <input placeholder="Score" type="number" value={b.score} disabled={disabled}
            onChange={(e) => updateBand(idx, 'score', e.target.value)} style={{ ...fieldStyle, flex: 1 }} />
          <button type="button" disabled={disabled} onClick={() => removeBand(idx)} aria-label="Remove band"
            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '14px' }}>×</button>
        </div>
      ))}
      <button type="button" disabled={disabled} onClick={addBand}
        style={{ fontSize: '11px', color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        + Add Band
      </button>
    </div>
  )
}

function PenaltyRows({ rules, onChange, disabled }) {
  const updateRule = (idx, field, value) => {
    const next = rules.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    onChange(next)
  }
  const addRule = () => {
    onChange([...rules, { id: generateRowId('penalty'), condition: 'below', threshold: '', penaltyValue: '', label: '' }])
  }
  const removeRule = (idx) => onChange(rules.filter((_, i) => i !== idx))

  return (
    <div>
      {rules.map((r, idx) => (
        <div key={r.id} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
          <select value={r.condition} disabled={disabled}
            onChange={(e) => updateRule(idx, 'condition', e.target.value)} style={{ ...fieldStyle, flex: 1 }}>
            <option value="below">below</option>
            <option value="above">above</option>
            <option value="equals">equals</option>
          </select>
          <input placeholder="Threshold" type="number" value={r.threshold} disabled={disabled}
            onChange={(e) => updateRule(idx, 'threshold', e.target.value)} style={{ ...fieldStyle, flex: 1 }} />
          <input placeholder="Penalty value" type="number" value={r.penaltyValue} disabled={disabled}
            onChange={(e) => updateRule(idx, 'penaltyValue', e.target.value)} style={{ ...fieldStyle, flex: 1 }} />
          <input placeholder="Label (optional)" value={r.label} disabled={disabled}
            onChange={(e) => updateRule(idx, 'label', e.target.value)} style={{ ...fieldStyle, flex: 2 }} />
          <button type="button" disabled={disabled} onClick={() => removeRule(idx)} aria-label="Remove penalty rule"
            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '14px' }}>×</button>
        </div>
      ))}
      <button type="button" disabled={disabled} onClick={addRule}
        style={{ fontSize: '11px', color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        + Add Penalty Rule
      </button>
    </div>
  )
}

export default function ProcessorConfigForm({ processorType, values, errors = {}, onChange, disabled = false }) {
  const def = getProcessorDefinition(processorType)
  const allowed = new Set([...(def?.requiredConfigFields ?? []), ...(def?.optionalConfigFields ?? [])])
  const handle = (field) => (e) => onChange?.(field, e.target.value)
  const handleCheckbox = (field) => (e) => onChange?.(field, e.target.checked)

  return (
    <div>
      <Field label="Order" error={errors.order}>
        <input
          type="number"
          step="1"
          min="0"
          value={values.order}
          onChange={handle('order')}
          disabled={disabled}
          style={{ ...fieldStyle, borderColor: errors.order ? 'rgba(239,68,68,0.4)' : 'var(--border-default)' }}
        />
      </Field>

      <Field label="Enabled">
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-primary)' }}>
          <input type="checkbox" checked={values.enabled !== false} onChange={handleCheckbox('enabled')} disabled={disabled} />
          Step is enabled
        </label>
      </Field>

      {allowed.has('ceiling') && (
        <Field label="Ceiling" error={errors.ceiling}>
          <input type="number" step="0.01" value={values.ceiling} onChange={handle('ceiling')} disabled={disabled} style={fieldStyle} />
        </Field>
      )}

      {allowed.has('floor') && (
        <Field label="Floor" error={errors.floor}>
          <input type="number" step="0.01" value={values.floor} onChange={handle('floor')} disabled={disabled} style={fieldStyle} />
        </Field>
      )}

      {allowed.has('weight') && (
        <Field label="Weight Multiplier" error={errors.weight}>
          <input type="number" step="0.01" min="0" max="1" value={values.weight} onChange={handle('weight')} disabled={disabled} style={fieldStyle} />
        </Field>
      )}

      {allowed.has('zeroBehaviour') && (
        <Field label="Zero Behaviour (optional)">
          <input type="text" value={values.zeroBehaviour} onChange={handle('zeroBehaviour')} disabled={disabled} style={fieldStyle} />
        </Field>
      )}

      {processorType === BAND_EVALUATOR && (
        <>
          <Field label="Bands" error={errors.bands}>
            <BandRows bands={values.bands ?? []} disabled={disabled} onChange={(bands) => onChange?.('bands', bands)} />
          </Field>
          <Field label="Default Score (optional)">
            <input type="number" min="0" max="100" value={values.defaultScore} onChange={handle('defaultScore')} disabled={disabled} style={fieldStyle} />
          </Field>
        </>
      )}

      {processorType === PENALTY_EVALUATOR && (
        <>
          <Field label="Penalty Rules" error={errors.penaltyRules}>
            <PenaltyRows rules={values.penaltyRules ?? []} disabled={disabled} onChange={(rules) => onChange?.('penaltyRules', rules)} />
          </Field>
          <Field label="Max Penalty (optional)">
            <input type="number" min="0" value={values.maxPenalty} onChange={handle('maxPenalty')} disabled={disabled} style={fieldStyle} />
          </Field>
          <Field label="Penalty Floor (optional)">
            <input type="number" value={values.penaltyFloor} onChange={handle('penaltyFloor')} disabled={disabled} style={fieldStyle} />
          </Field>
        </>
      )}

      {allowed.has('aggregationType') && (
        <Field label="Aggregation Type" error={errors.aggregationType}>
          <select value={values.aggregationType} onChange={handle('aggregationType')} disabled={disabled} style={fieldStyle}>
            <option value="">Select…</option>
            <option value="weighted_sum">weighted_sum</option>
            <option value="simple_average">simple_average</option>
            <option value="min">min</option>
            <option value="max">max</option>
          </select>
        </Field>
      )}

      {allowed.has('zeroTargetBehaviour') && (
        <Field label="Zero Target Behaviour" error={errors.zeroTargetBehaviour}>
          <select value={values.zeroTargetBehaviour} onChange={handle('zeroTargetBehaviour')} disabled={disabled} style={fieldStyle}>
            <option value="">Select…</option>
            <option value="skip">skip</option>
            <option value="score_zero">score_zero</option>
            <option value="score_full">score_full</option>
            <option value="use_fallback">use_fallback</option>
          </select>
        </Field>
      )}
    </div>
  )
}
