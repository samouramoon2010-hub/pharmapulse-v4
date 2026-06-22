// ============================================================
// ProcessorPipelinePanel — Editable processor pipeline for one rule
// (Phase 2I)
//
// Add / edit / delete processor steps on a single rule's pipeline.
// Reordering is by editing the `order` field only — no drag & drop.
// Mutates the in-memory hierarchy only through hierarchy.ts's
// updateNode() — never a direct tree mutation — then persists the
// recomputed hierarchy summary via the existing Phase 1B service
// (updateProfileDocument).
//
// Validation is delegated entirely to validatePipeline() from
// processorValidation.ts, shown inline as a non-blocking advisory
// list (errors/warnings). Never throws.
//
// NO Drag & Drop. NO Simulation execution. NO Publish flow. NO AI.
// NO Excel import. NO Evaluation Engine changes. NO new processor
// types — only the 8 kernel-defined types are selectable.
// ============================================================
import React, { useState } from 'react'
import { Plus, X, Loader2, Cog, AlertCircle, AlertTriangle } from 'lucide-react'

import ProcessorStepCard from './ProcessorStepCard'
import ProcessorConfigForm, {
  DEFAULT_PROCESSOR_STEP_FORM_VALUES,
  validateProcessorStepForm,
} from './ProcessorConfigForm'
import EmptyState from '../ui/EmptyState'
import { useToastStore } from '../ui/Toast'

import { findNode, updateNode } from '../../profileStudio/hierarchy'
import { ALL_PROCESSOR_TYPES, getProcessorDefinition } from '../../profileStudio/processors'
import { validatePipeline } from '../../profileStudio/processorValidation'
import { updateProfileDocument } from '../../profileStudio/profileStudioService'
import { normalizeError } from '../../profileStudio/profileStudioStore'

/** Reconstructs a kernel-shaped draft from the Firestore-shaped profile doc. */
function toDraftLike(profile) {
  return {
    metadata: { status: profile.status },
    root: profile.hierarchy?.payload ?? {
      id: profile.hierarchy?.rootId || profile.id,
      label: profile.hierarchy?.rootLabel || profile.name,
      baskets: [],
    },
  }
}

/** Recomputes the stored hierarchy summary fields from a mutated root node. */
function summarizeHierarchy(rootNode) {
  const baskets = rootNode.baskets ?? []
  let elementCount = 0
  let ruleCount = 0
  for (const b of baskets) {
    const elements = b.elements ?? []
    elementCount += elements.length
    for (const e of elements) ruleCount += (e.rules ?? []).length
  }
  return {
    rootId: rootNode.id,
    rootLabel: rootNode.label,
    basketCount: baskets.length,
    elementCount,
    ruleCount,
    payload: rootNode,
  }
}

/**
 * Adapts the lean ProcessorStep[] (the format stored on hierarchy nodes)
 * into the richer ProcessorPipelineDefinition shape expected by
 * validatePipeline(), so the pipeline-level/order/config validators can
 * be reused without reimplementing their logic. Synthetic stepId/id/
 * version fields are added for the adapter only — never persisted.
 */
function toRichPipelineForValidation(steps) {
  return {
    pipelineId: 'adhoc',
    version: '1.0.0',
    steps: (steps ?? []).map((s, idx) => ({
      stepId: `step_${idx}`,
      order: s.order ?? idx,
      enabled: s.config?.enabled !== false,
      config: {
        id: `step_${idx}`,
        version: '1.0.0',
        processorType: s.processorType,
        enabled: s.config?.enabled !== false,
        ...s.config,
      },
    })),
  }
}

export default function ProcessorPipelinePanel({ profile, ruleId, actor, canEdit, onSaved }) {
  const [formOpen, setFormOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [selectedType, setSelectedType] = useState('')
  const [values, setValues] = useState(DEFAULT_PROCESSOR_STEP_FORM_VALUES)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const toast = useToastStore()

  if (!profile) return null

  const draftLike = toDraftLike(profile)
  const rule = findNode(draftLike, ruleId)
  if (!rule) return null

  const steps = rule.pipeline?.steps ?? []
  const sortedSteps = [...steps]
    .map((step, originalIndex) => ({ step, originalIndex }))
    .sort((a, b) => (a.step.order ?? 0) - (b.step.order ?? 0))

  const validation = validatePipeline(toRichPipelineForValidation(steps))

  const openCreateForm = () => {
    setEditingIndex(null)
    setSelectedType('')
    setValues(DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    setErrors({})
    setFormOpen(true)
  }

  const openEditForm = (step) => {
    const originalIndex = steps.indexOf(step)
    if (originalIndex === -1) return
    setEditingIndex(originalIndex)
    setSelectedType(step.processorType)
    const c = step.config ?? {}
    setValues({
      ...DEFAULT_PROCESSOR_STEP_FORM_VALUES,
      order: String(step.order ?? '0'),
      enabled: c.enabled !== false,
      ceiling: c.ceiling !== undefined ? String(c.ceiling) : '',
      floor: c.floor !== undefined ? String(c.floor) : '',
      weight: c.weight !== undefined ? String(c.weight) : '',
      zeroBehaviour: c.zeroBehaviour ?? '',
      bands: c.bands ?? [],
      defaultScore: c.defaultScore !== undefined ? String(c.defaultScore) : '',
      penaltyRules: c.penaltyRules ?? [],
      maxPenalty: c.maxPenalty !== undefined ? String(c.maxPenalty) : '',
      penaltyFloor: c.penaltyFloor !== undefined ? String(c.penaltyFloor) : '',
      aggregationType: c.aggregationType ?? '',
      zeroTargetBehaviour: c.zeroTargetBehaviour ?? '',
    })
    setErrors({})
    setFormOpen(true)
  }

  const closeForm = () => {
    if (submitting) return
    setFormOpen(false)
    setEditingIndex(null)
    setSelectedType('')
    setValues(DEFAULT_PROCESSOR_STEP_FORM_VALUES)
    setErrors({})
  }

  const handleChange = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const persist = async (newSteps, successMessage) => {
    setSubmitting(true)
    try {
      const mutated = updateNode(draftLike, ruleId, { pipeline: { steps: newSteps } })
      const newHierarchy = summarizeHierarchy(mutated.root)
      await updateProfileDocument(profile.id, { hierarchy: newHierarchy }, actor)
      toast.success(successMessage)
      onSaved?.()
      closeForm()
    } catch (err) {
      toast.error(normalizeError(err).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!selectedType) {
      setErrors({ processorType: 'Processor type is required' })
      return
    }

    const { valid, errors: formErrors, config } = validateProcessorStepForm(selectedType, values)
    if (!valid) {
      setErrors(formErrors)
      return
    }

    const newStep = {
      processorType: selectedType,
      order: parseFloat(values.order),
      config,
    }

    const newSteps = editingIndex !== null
      ? steps.map((s, idx) => (idx === editingIndex ? newStep : s))
      : [...steps, newStep]

    await persist(newSteps, editingIndex !== null ? 'Processor step updated' : 'Processor step added')
  }

  const handleDelete = async (step) => {
    if (submitting) return
    const newSteps = steps.filter((s) => s !== step)
    await persist(newSteps, 'Processor step deleted')
  }

  return (
    <div style={{ marginTop: '10px', paddingLeft: '12px', borderLeft: '2px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Cog style={{ width: 11, height: 11, color: 'var(--text-muted)' }} strokeWidth={1.5} />
          <span style={{
            fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Processor Pipeline for "{rule.label}"
          </span>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreateForm}
            aria-label="Add processor step"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '10px', fontWeight: 500, color: '#818cf8',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '6px', padding: '3px 8px', cursor: 'pointer',
            }}
          >
            <Plus style={{ width: 10, height: 10 }} />
            Add Step
          </button>
        )}
      </div>

      {validation.issues.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          {validation.issues.map((issue, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '10px', padding: '3px 0',
              color: issue.severity === 'error' ? '#f87171' : '#fbbf24',
            }}>
              {issue.severity === 'error'
                ? <AlertCircle style={{ width: 10, height: 10 }} />
                : <AlertTriangle style={{ width: 10, height: 10 }} />}
              {issue.message}
            </div>
          ))}
        </div>
      )}

      {sortedSteps.length === 0 ? (
        <EmptyState
          title="No processor steps yet"
          description="Add a processor step to shape how this rule's KPI is scored"
          compact
        />
      ) : (
        sortedSteps.map(({ step }) => (
          <ProcessorStepCard
            key={`${step.processorType}_${step.order}`}
            step={step}
            canEdit={canEdit}
            onEdit={openEditForm}
            onDelete={handleDelete}
          />
        ))
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeForm} />
          <div
            className="relative w-full max-w-md animate-scale-in rounded-xl p-5 overflow-y-auto"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', maxHeight: '85vh' }}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {editingIndex !== null ? 'Edit Processor Step' : 'New Processor Step'}
              </h3>
              <button type="button" onClick={closeForm} disabled={submitting} aria-label="Close" className="btn btn-ghost btn-icon">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Processor Type
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  disabled={submitting || editingIndex !== null}
                  style={{
                    width: '100%', fontSize: '12px', color: 'var(--text-primary)',
                    background: 'var(--bg-canvas)', border: '1px solid var(--border-default)',
                    borderRadius: '6px', padding: '7px 10px', fontFamily: "'Inter', sans-serif",
                  }}
                >
                  <option value="">Select a processor type…</option>
                  {ALL_PROCESSOR_TYPES.map((type) => (
                    <option key={type} value={type}>{getProcessorDefinition(type).label}</option>
                  ))}
                </select>
                {errors.processorType && (
                  <div style={{ fontSize: '10px', color: '#f87171', marginTop: '3px' }}>{errors.processorType}</div>
                )}
              </div>

              {selectedType && (
                <ProcessorConfigForm
                  processorType={selectedType}
                  values={values}
                  errors={errors}
                  onChange={handleChange}
                  disabled={submitting}
                />
              )}

              <div className="flex gap-2.5 mt-4">
                <button type="button" onClick={closeForm} disabled={submitting} className="btn btn-secondary flex-1 justify-center text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submitting || !selectedType} className="flex-1 justify-center text-xs btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  {submitting ? 'Saving…' : 'Save Step'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
