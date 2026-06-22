// ============================================================
// RuleEditorPanel — Editable rule list for one element (Phase 2H)
//
// Add / edit / delete rules under a single element. Mutates the
// in-memory hierarchy only through hierarchy.ts helpers (addRule,
// updateNode, removeNode) — never a direct tree mutation — then
// persists the recomputed hierarchy summary via the existing Phase 1B
// service (updateProfileDocument). No new Firestore collections, no
// snapshots, no publish, no workflow execution, no simulation run.
//
// KPI selection is registry-driven: the active KPI list comes from
// the KPI Registry (getActiveKpis), never a hardcoded array.
//
// Selecting a rule's "Manage Pipeline" action expands the nested
// ProcessorPipelinePanel for that rule — the only place processor
// steps are configured.
//
// NO Drag & Drop. NO Simulation execution. NO Publish flow. NO AI.
// NO Excel import. NO Evaluation Engine changes.
// ============================================================
import React, { useState } from 'react'
import { Plus, X, Loader2, Target } from 'lucide-react'

import RuleCard from './RuleCard'
import RuleForm, { validateRuleForm, DEFAULT_RULE_FORM_VALUES } from './RuleForm'
import ProcessorPipelinePanel from './ProcessorPipelinePanel'
import EmptyState from '../ui/EmptyState'
import { useToastStore } from '../ui/Toast'

import {
  addRule,
  updateNode,
  removeNode,
  canAddRule,
  calculateChildWeightSummary,
  findOverweightNodes,
  findUnderweightNodes,
} from '../../profileStudio/hierarchy'
import { createRuleNode } from '../../profileStudio/profileFactory'
import { updateProfileDocument } from '../../profileStudio/profileStudioService'
import { normalizeError } from '../../profileStudio/profileStudioStore'
import { getActiveKpis, DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'

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

export default function RuleEditorPanel({ profile, elementId, actor, canEdit, onSaved }) {
  const [selectedRuleId, setSelectedRuleId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState(null)
  const [values, setValues]   = useState(DEFAULT_RULE_FORM_VALUES)
  const [errors, setErrors]   = useState({})
  const [submitting, setSubmitting] = useState(false)
  const toast = useToastStore()

  // Registry-driven KPI list — never hardcoded.
  const kpis = getActiveKpis(DEFAULT_KPI_REGISTRY)

  const draftLike = toDraftLike(profile)
  const element = []
    .concat(...(draftLike.root.baskets ?? []).map((b) => b.elements ?? []))
    .find((e) => e.id === elementId) || null
  const rules = element?.rules ?? []

  const weightSummary = calculateChildWeightSummary(draftLike, elementId)
  const overweightIds  = findOverweightNodes(draftLike)
  const underweightIds = findUnderweightNodes(draftLike)
  const elementIsOverweight  = overweightIds.includes(elementId)
  const elementIsUnderweight = underweightIds.includes(elementId)

  if (!element) return null

  const openCreateForm = () => {
    setEditingRuleId(null)
    setValues(DEFAULT_RULE_FORM_VALUES)
    setErrors({})
    setFormOpen(true)
  }

  const openEditForm = (ruleId) => {
    const target = rules.find((r) => r.id === ruleId)
    if (!target) return
    setEditingRuleId(ruleId)
    setValues({
      label:       target.label || '',
      kpiKey:      target.kpiKey || '',
      weight:      String(target.weight ?? '1'),
      description: target.description || '',
    })
    setErrors({})
    setFormOpen(true)
  }

  const closeForm = () => {
    if (submitting) return
    setFormOpen(false)
    setEditingRuleId(null)
    setValues(DEFAULT_RULE_FORM_VALUES)
    setErrors({})
  }

  const handleChange = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const persist = async (mutatedDraft, successMessage) => {
    setSubmitting(true)
    try {
      const newHierarchy = summarizeHierarchy(mutatedDraft.root)
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

    const { valid, errors: formErrors } = validateRuleForm(values)
    if (!valid) {
      setErrors(formErrors)
      return
    }

    const patch = {
      label:       values.label.trim(),
      kpiKey:      values.kpiKey.trim(),
      weight:      parseFloat(values.weight),
      description: values.description.trim() || undefined,
    }

    if (editingRuleId) {
      const mutated = updateNode(draftLike, editingRuleId, patch)
      await persist(mutated, 'Rule updated')
      return
    }

    if (!canAddRule(draftLike, elementId)) {
      toast.error('Profile is not in an editable status')
      return
    }
    const newRule = createRuleNode({ kpiKey: patch.kpiKey, label: patch.label, weight: patch.weight })
    if (patch.description) newRule.description = patch.description
    const mutated = addRule(draftLike, elementId, newRule)
    await persist(mutated, 'Rule added')
  }

  const handleDelete = async (ruleId) => {
    if (submitting) return
    const mutated = removeNode(draftLike, ruleId)
    if (selectedRuleId === ruleId) setSelectedRuleId(null)
    await persist(mutated, 'Rule deleted')
  }

  return (
    <div style={{ marginTop: '10px', paddingLeft: '12px', borderLeft: '2px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Target style={{ width: 11, height: 11, color: 'var(--text-muted)' }} strokeWidth={1.5} />
          <span style={{
            fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Rules in "{element.label}"
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            (total weight: {weightSummary.sum.toFixed(2)})
          </span>
          {elementIsOverweight && <span style={{ fontSize: '10px', color: '#f87171' }}>Overweight</span>}
          {elementIsUnderweight && <span style={{ fontSize: '10px', color: '#fbbf24' }}>Underweight</span>}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreateForm}
            aria-label="Add rule"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '10px', fontWeight: 500, color: '#818cf8',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '6px', padding: '3px 8px', cursor: 'pointer',
            }}
          >
            <Plus style={{ width: 10, height: 10 }} />
            Add Rule
          </button>
        )}
      </div>

      {rules.length === 0 ? (
        <EmptyState
          title="No rules yet"
          description="Add a rule to map this element to a KPI"
          compact
        />
      ) : (
        rules.map((rule) => (
          <div key={rule.id}>
            <RuleCard
              rule={rule}
              isSelected={selectedRuleId === rule.id}
              canEdit={canEdit}
              isOverweight={overweightIds.includes(rule.id)}
              isUnderweight={underweightIds.includes(rule.id)}
              onSelect={(id) => setSelectedRuleId(id === selectedRuleId ? null : id)}
              onEdit={openEditForm}
              onDelete={handleDelete}
            />
            {selectedRuleId === rule.id && (
              <ProcessorPipelinePanel
                profile={profile}
                ruleId={rule.id}
                actor={actor}
                canEdit={canEdit}
                onSaved={onSaved}
              />
            )}
          </div>
        ))
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeForm} />
          <div
            className="relative w-full max-w-md animate-scale-in rounded-xl p-5"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {editingRuleId ? 'Edit Rule' : 'New Rule'}
              </h3>
              <button type="button" onClick={closeForm} disabled={submitting} aria-label="Close" className="btn btn-ghost btn-icon">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <RuleForm values={values} errors={errors} kpis={kpis} onChange={handleChange} disabled={submitting} />
              <div className="flex gap-2.5 mt-4">
                <button type="button" onClick={closeForm} disabled={submitting} className="btn btn-secondary flex-1 justify-center text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 justify-center text-xs btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  {submitting ? 'Saving…' : 'Save Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
