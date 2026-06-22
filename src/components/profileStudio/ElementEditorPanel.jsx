// ============================================================
// ElementEditorPanel — Editable element list for one basket (Phase 2G)
//
// Add / edit / delete elements under a single basket. Mutates the
// in-memory hierarchy only through hierarchy.ts helpers (addElement,
// updateNode, removeNode) — never a direct tree mutation — then
// persists the recomputed hierarchy summary via the existing Phase 1B
// service (updateProfileDocument). No new Firestore collections, no
// snapshots, no publish, no workflow/simulator/processor execution.
//
// Nests RuleEditorPanel per selected element (Phase 2H) for rule and
// processor pipeline management. NO Drag & Drop. NO Simulation.
// NO AI. NO Excel import. NO Evaluation Engine changes.
// ============================================================
import React, { useState } from 'react'
import { Plus, X, Loader2, Layers3 } from 'lucide-react'

import ElementCard from './ElementCard'
import ElementForm, { validateElementForm, DEFAULT_ELEMENT_FORM_VALUES } from './ElementForm'
import RuleEditorPanel from './RuleEditorPanel'
import EmptyState from '../ui/EmptyState'
import { useToastStore } from '../ui/Toast'

import {
  addElement,
  updateNode,
  removeNode,
  canAddElement,
  calculateChildWeightSummary,
  findOverweightNodes,
  findUnderweightNodes,
} from '../../profileStudio/hierarchy'
import { createElementNode } from '../../profileStudio/profileFactory'
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

export default function ElementEditorPanel({ profile, basketId, actor, canEdit, onSaved }) {
  const [selectedElementId, setSelectedElementId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingElementId, setEditingElementId] = useState(null)
  const [values, setValues]   = useState(DEFAULT_ELEMENT_FORM_VALUES)
  const [errors, setErrors]   = useState({})
  const [submitting, setSubmitting] = useState(false)
  const toast = useToastStore()

  const draftLike = toDraftLike(profile)
  const basket = (draftLike.root.baskets ?? []).find((b) => b.id === basketId) || null
  const elements = basket?.elements ?? []

  const weightSummary = calculateChildWeightSummary(draftLike, basketId)
  const overweightIds  = findOverweightNodes(draftLike)
  const underweightIds = findUnderweightNodes(draftLike)
  const basketIsOverweight  = overweightIds.includes(basketId)
  const basketIsUnderweight = underweightIds.includes(basketId)

  if (!basket) return null

  const openCreateForm = () => {
    setEditingElementId(null)
    setValues(DEFAULT_ELEMENT_FORM_VALUES)
    setErrors({})
    setFormOpen(true)
  }

  const openEditForm = (elementId) => {
    const target = elements.find((e) => e.id === elementId)
    if (!target) return
    setEditingElementId(elementId)
    setValues({
      label: target.label || '',
      weight: String(target.weight ?? '1'),
      description: target.description || '',
    })
    setErrors({})
    setFormOpen(true)
  }

  const closeForm = () => {
    if (submitting) return
    setFormOpen(false)
    setEditingElementId(null)
    setValues(DEFAULT_ELEMENT_FORM_VALUES)
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

    const { valid, errors: formErrors } = validateElementForm(values)
    if (!valid) {
      setErrors(formErrors)
      return
    }

    const patch = {
      label:       values.label.trim(),
      weight:      parseFloat(values.weight),
      description: values.description.trim() || undefined,
    }

    if (editingElementId) {
      const mutated = updateNode(draftLike, editingElementId, patch)
      await persist(mutated, 'Element updated')
      return
    }

    if (!canAddElement(draftLike, basketId)) {
      toast.error('Profile is not in an editable status')
      return
    }
    const newElement = createElementNode({ label: patch.label, weight: patch.weight })
    if (patch.description) newElement.description = patch.description
    const mutated = addElement(draftLike, basketId, newElement)
    await persist(mutated, 'Element added')
  }

  const handleDelete = async (elementId) => {
    if (submitting) return
    const mutated = removeNode(draftLike, elementId)
    if (selectedElementId === elementId) setSelectedElementId(null)
    await persist(mutated, 'Element deleted')
  }

  return (
    <div style={{ marginTop: '10px', paddingLeft: '12px', borderLeft: '2px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers3 style={{ width: 11, height: 11, color: 'var(--text-muted)' }} strokeWidth={1.5} />
          <span style={{
            fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Elements in "{basket.label}"
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            (total weight: {weightSummary.sum.toFixed(2)})
          </span>
          {basketIsOverweight && <span style={{ fontSize: '10px', color: '#f87171' }}>Overweight</span>}
          {basketIsUnderweight && <span style={{ fontSize: '10px', color: '#fbbf24' }}>Underweight</span>}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreateForm}
            aria-label="Add element"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '10px', fontWeight: 500, color: '#818cf8',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '6px', padding: '3px 8px', cursor: 'pointer',
            }}
          >
            <Plus style={{ width: 10, height: 10 }} />
            Add Element
          </button>
        )}
      </div>

      {elements.length === 0 ? (
        <EmptyState
          title="No elements yet"
          description="Add an element to begin building this basket"
          compact
        />
      ) : (
        elements.map((element) => (
          <div key={element.id}>
            <ElementCard
              element={element}
              canEdit={canEdit}
              isOverweight={overweightIds.includes(element.id)}
              isUnderweight={underweightIds.includes(element.id)}
              isSelected={selectedElementId === element.id}
              onSelect={(id) => setSelectedElementId(id === selectedElementId ? null : id)}
              onEdit={openEditForm}
              onDelete={handleDelete}
            />
            {selectedElementId === element.id && (
              <RuleEditorPanel
                profile={profile}
                elementId={element.id}
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
                {editingElementId ? 'Edit Element' : 'New Element'}
              </h3>
              <button type="button" onClick={closeForm} disabled={submitting} aria-label="Close" className="btn btn-ghost btn-icon">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <ElementForm values={values} errors={errors} onChange={handleChange} disabled={submitting} />
              <div className="flex gap-2.5 mt-4">
                <button type="button" onClick={closeForm} disabled={submitting} className="btn btn-secondary flex-1 justify-center text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 justify-center text-xs btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  {submitting ? 'Saving…' : 'Save Element'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
