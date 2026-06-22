// ============================================================
// CreateProfileModal — First writable Profile Studio flow (Phase 2B)
//
// Flow: createDraft() (kernel) -> build profile document ->
//       createProfileDocument() (Firestore service) -> toast ->
//       close -> refresh list.
//
// NO hierarchy editor. NO Drag & Drop. NO Visual Builder.
// NO AI. NO Excel import. NO Evaluation Engine changes.
// ============================================================
import React, { useState } from 'react'
import { X, Loader2, FilePlus2 } from 'lucide-react'

import ProfileForm, { validateProfileForm, DEFAULT_FORM_VALUES } from './ProfileForm'
import { createDraft } from '../../profileStudio/workflow'
import { createProfileDocument } from '../../profileStudio/profileStudioService'
import { calculateProfileHash } from '../../profileStudio/integrity'
import { normalizeError } from '../../profileStudio/profileStudioStore'
import { useToastStore } from '../ui/Toast'

/**
 * Maps a kernel EvaluationProfileDraft (from createDraft) into the
 * Firestore-shaped ProfileStudioProfileDoc expected by
 * createProfileDocument. A freshly created draft has no hierarchy
 * content yet, so hierarchy/processor/validation counts are zero.
 */
function buildProfileDocument(draftProfile, actor) {
  const m = draftProfile.metadata
  const root = draftProfile.root

  return {
    id:      m.id,
    name:    m.name,
    version: m.version,
    status:  m.status,
    scope:   m.scope,

    metadata: {
      description: m.description,
      scope:       m.scope,
      validFrom:   m.validFrom,
    },

    hierarchy: {
      rootId:       root.id,
      rootLabel:    root.label,
      basketCount:  root.baskets.length,
      elementCount: 0,
      ruleCount:    0,
      payload:      root,
    },

    processors: {
      processorTypes:      [],
      totalStepCount:      0,
      hasZeroTargetGuard:  false,
      hasBandEvaluator:    false,
      hasPenaltyEvaluator: false,
      hasNodeAggregator:   false,
    },

    validationSummary: {
      valid:           false,
      issueCount:      0,
      errorCount:       0,
      warningCount:    0,
      lastValidatedAt: null,
    },

    simulationSummary: null,

    hash: calculateProfileHash(draftProfile),

    createdBy:   actor.uid,
    approvedBy:  null,
    publishedBy: null,
    publishedAt: null,
  }
}

export default function CreateProfileModal({ open, onClose, actor, onCreated }) {
  const [values, setValues]       = useState(DEFAULT_FORM_VALUES)
  const [errors, setErrors]       = useState({})
  const [submitting, setSubmitting] = useState(false)
  const toast = useToastStore()

  if (!open) return null

  const handleChange = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const resetAndClose = () => {
    setValues(DEFAULT_FORM_VALUES)
    setErrors({})
    setSubmitting(false)
    onClose?.()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return // double-submit guard

    const { valid, errors: formErrors } = validateProfileForm(values)
    if (!valid) {
      setErrors(formErrors)
      return
    }

    setSubmitting(true)
    try {
      const draftResult = createDraft(
        {
          name:        values.name.trim(),
          description: values.description.trim() || undefined,
          scope:       values.scope,
          validFrom:   values.validFrom,
          createdBy:   actor?.uid,
        },
        actor?.uid,
      )

      if (!draftResult.success || !draftResult.profile) {
        throw new Error(draftResult.issues?.join('; ') || 'Failed to create draft')
      }

      // Apply the user-supplied version over the factory default (0.1.0)
      const profile = {
        ...draftResult.profile,
        metadata: { ...draftResult.profile.metadata, version: values.version.trim() },
      }

      const payload = buildProfileDocument(profile, actor)

      await createProfileDocument(payload, actor)

      toast.success('Draft profile created')
      onCreated?.()
      resetAndClose()
    } catch (err) {
      const normalized = normalizeError(err)
      toast.error(normalized.message || 'Failed to create draft profile')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={submitting ? undefined : resetAndClose}
      />
      <div
        className="relative w-full max-w-md animate-scale-in rounded-xl p-5"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
            >
              <FilePlus2 className="w-4 h-4" style={{ color: '#818cf8' }} strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                New Profile
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Creates a draft — no hierarchy yet
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={submitting ? undefined : resetAndClose}
            disabled={submitting}
            aria-label="Close"
            className="btn btn-ghost btn-icon -mt-0.5 -mr-0.5 opacity-50 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <ProfileForm
            values={values}
            errors={errors}
            onChange={handleChange}
            disabled={submitting}
          />

          <div className="flex gap-2.5 mt-4">
            <button
              type="button"
              onClick={resetAndClose}
              disabled={submitting}
              className="btn btn-secondary flex-1 justify-center text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 justify-center text-xs btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
              {submitting ? 'Creating…' : 'Create Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
