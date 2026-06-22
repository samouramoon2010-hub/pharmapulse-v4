// ============================================================
// BasketEditorPanel — Editable basket list for a profile (Phase 2F)
//
// Add / edit / delete baskets, and select one to manage its elements
// via the nested ElementEditorPanel. Mutates the in-memory hierarchy
// only through hierarchy.ts helpers (addBasket, updateNode, removeNode)
// — never a direct tree mutation — then persists the recomputed
// hierarchy summary via the existing Phase 1B service
// (updateProfileDocument). No new Firestore collections, no
// snapshots, no publish, no workflow/simulator/processor execution.
//
// NO Rule editor. NO Pipeline editor. NO Drag & Drop. NO Simulation.
// NO AI. NO Excel import. NO Evaluation Engine changes.
// ============================================================
import React, { useState } from 'react'
import { Plus, X, Loader2, Package } from 'lucide-react'

import BasketCard from './BasketCard'
import BasketForm, { validateBasketForm, DEFAULT_BASKET_FORM_VALUES } from './BasketForm'
import ElementEditorPanel from './ElementEditorPanel'
import EmptyState from '../ui/EmptyState'
import { useToastStore } from '../ui/Toast'

import {
  addBasket,
  updateNode,
  removeNode,
  canAddBasket,
  calculateChildWeightSummary,
  findOverweightNodes,
  findUnderweightNodes,
} from '../../profileStudio/hierarchy'
import { createBasketNode } from '../../profileStudio/profileFactory'
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

export default function BasketEditorPanel({ profile, actor, canEdit, onSaved }) {
  const [selectedBasketId, setSelectedBasketId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingBasketId, setEditingBasketId] = useState(null)
  const [values, setValues]   = useState(DEFAULT_BASKET_FORM_VALUES)
  const [errors, setErrors]   = useState({})
  const [submitting, setSubmitting] = useState(false)
  const toast = useToastStore()

  if (!profile) return null

  const draftLike = toDraftLike(profile)
  const baskets = draftLike.root.baskets ?? []
  const rootId  = draftLike.root.id

  const weightSummary = calculateChildWeightSummary(draftLike, rootId)
  const overweightIds  = findOverweightNodes(draftLike)
  const underweightIds = findUnderweightNodes(draftLike)
  const rootIsOverweight  = overweightIds.includes(rootId)
  const rootIsUnderweight = underweightIds.includes(rootId)

  const openCreateForm = () => {
    setEditingBasketId(null)
    setValues(DEFAULT_BASKET_FORM_VALUES)
    setErrors({})
    setFormOpen(true)
  }

  const openEditForm = (basketId) => {
    const target = baskets.find((b) => b.id === basketId)
    if (!target) return
    setEditingBasketId(basketId)
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
    setEditingBasketId(null)
    setValues(DEFAULT_BASKET_FORM_VALUES)
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

    const { valid, errors: formErrors } = validateBasketForm(values)
    if (!valid) {
      setErrors(formErrors)
      return
    }

    const patch = {
      label:       values.label.trim(),
      weight:      parseFloat(values.weight),
      description: values.description.trim() || undefined,
    }

    if (editingBasketId) {
      const mutated = updateNode(draftLike, editingBasketId, patch)
      await persist(mutated, 'Basket updated')
      return
    }

    if (!canAddBasket(draftLike)) {
      toast.error('Profile is not in an editable status')
      return
    }
    const newBasket = createBasketNode({ label: patch.label, weight: patch.weight })
    if (patch.description) newBasket.description = patch.description
    const mutated = addBasket(draftLike, newBasket)
    await persist(mutated, 'Basket added')
  }

  const handleDelete = async (basketId) => {
    if (submitting) return
    const mutated = removeNode(draftLike, basketId)
    if (selectedBasketId === basketId) setSelectedBasketId(null)
    await persist(mutated, 'Basket deleted')
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Package style={{ width: 12, height: 12, color: 'var(--text-muted)' }} strokeWidth={1.5} />
          <span style={{
            fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            fontFamily: "'Inter', sans-serif",
          }}>
            Baskets
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            (total weight: {weightSummary.sum.toFixed(2)})
          </span>
          {rootIsOverweight && <span style={{ fontSize: '10px', color: '#f87171' }}>Overweight</span>}
          {rootIsUnderweight && <span style={{ fontSize: '10px', color: '#fbbf24' }}>Underweight</span>}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreateForm}
            aria-label="Add basket"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px', fontWeight: 500, color: '#818cf8',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
            }}
          >
            <Plus style={{ width: 11, height: 11 }} />
            Add Basket
          </button>
        )}
      </div>

      {baskets.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No baskets yet"
          description="Add a basket to begin building this profile's hierarchy"
        />
      ) : (
        baskets.map((basket) => (
          <div key={basket.id}>
            <BasketCard
              basket={basket}
              isSelected={selectedBasketId === basket.id}
              canEdit={canEdit}
              isOverweight={overweightIds.includes(basket.id)}
              isUnderweight={underweightIds.includes(basket.id)}
              onSelect={(id) => setSelectedBasketId(id === selectedBasketId ? null : id)}
              onEdit={openEditForm}
              onDelete={handleDelete}
            />
            {selectedBasketId === basket.id && (
              <ElementEditorPanel
                profile={profile}
                basketId={basket.id}
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
                {editingBasketId ? 'Edit Basket' : 'New Basket'}
              </h3>
              <button type="button" onClick={closeForm} disabled={submitting} aria-label="Close" className="btn btn-ghost btn-icon">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <BasketForm values={values} errors={errors} onChange={handleChange} disabled={submitting} />
              <div className="flex gap-2.5 mt-4">
                <button type="button" onClick={closeForm} disabled={submitting} className="btn btn-secondary flex-1 justify-center text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 justify-center text-xs btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  {submitting ? 'Saving…' : 'Save Basket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
