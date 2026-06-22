// ============================================================
// CreateProfileModal.test.ts — Phase 2B certification (180+ tests)
//
// Pattern: ?raw source inspection (no @testing-library/react needed),
// plus direct unit tests against validateProfileForm (pure function).
// ============================================================

import { describe, it, expect } from 'vitest'
import { validateProfileForm, DEFAULT_FORM_VALUES, SCOPE_OPTIONS } from '../../components/profileStudio/ProfileForm.jsx'

// ── Raw source imports ────────────────────────────────────────
const modalSrc = await import('../../components/profileStudio/CreateProfileModal.jsx?raw').then((m) => m.default)
const formSrc  = await import('../../components/profileStudio/ProfileForm.jsx?raw').then((m) => m.default)
const pageSrc  = await import('./ProfileStudioPage.jsx?raw').then((m) => m.default)
const cardSrc  = await import('../../components/profileStudio/ProfileCard.jsx?raw').then((m) => m.default)
const serviceSrc = await import('../../profileStudio/profileStudioService.ts?raw').then((m) => m.default)
const workflowSrc = await import('../../profileStudio/workflow.ts?raw').then((m) => m.default)

function validValues(overrides = {}) {
  return {
    name: 'Branch Quarterly Evaluation',
    description: 'A test profile',
    scope: 'PHARMACY',
    validFrom: '2026-01-01',
    version: '1.0.0',
    ...overrides,
  }
}

// ════════════════════════════════════════════════════════════
// 1. validateProfileForm — unit tests (pure function)
// ════════════════════════════════════════════════════════════
describe('validateProfileForm — required fields', () => {
  it('passes with all valid fields', () => {
    const { valid, errors } = validateProfileForm(validValues())
    expect(valid).toBe(true)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('fails when name is missing', () => {
    const { valid, errors } = validateProfileForm(validValues({ name: '' }))
    expect(valid).toBe(false)
    expect(errors.name).toBeTruthy()
  })

  it('fails when name is only whitespace', () => {
    const { valid, errors } = validateProfileForm(validValues({ name: '   ' }))
    expect(valid).toBe(false)
    expect(errors.name).toBeTruthy()
  })

  it('fails when name is undefined', () => {
    const { valid, errors } = validateProfileForm(validValues({ name: undefined }))
    expect(valid).toBe(false)
    expect(errors.name).toBeTruthy()
  })

  it('fails when scope is missing', () => {
    const { valid, errors } = validateProfileForm(validValues({ scope: '' }))
    expect(valid).toBe(false)
    expect(errors.scope).toBeTruthy()
  })

  it('fails when validFrom is missing', () => {
    const { valid, errors } = validateProfileForm(validValues({ validFrom: '' }))
    expect(valid).toBe(false)
    expect(errors.validFrom).toBeTruthy()
  })

  it('fails when version is missing', () => {
    const { valid, errors } = validateProfileForm(validValues({ version: '' }))
    expect(valid).toBe(false)
    expect(errors.version).toBeTruthy()
  })

  it('description is optional — empty string is valid', () => {
    const { valid, errors } = validateProfileForm(validValues({ description: '' }))
    expect(valid).toBe(true)
    expect(errors.description).toBeUndefined()
  })

  it('description is optional — undefined is valid', () => {
    const { valid } = validateProfileForm(validValues({ description: undefined }))
    expect(valid).toBe(true)
  })

  it('never throws on null input', () => {
    expect(() => validateProfileForm(null)).not.toThrow()
  })

  it('never throws on undefined input', () => {
    expect(() => validateProfileForm(undefined)).not.toThrow()
  })

  it('never throws on empty object input', () => {
    expect(() => validateProfileForm({})).not.toThrow()
  })

  it('returns all-required errors for empty object', () => {
    const { valid, errors } = validateProfileForm({})
    expect(valid).toBe(false)
    expect(errors.name).toBeTruthy()
    expect(errors.scope).toBeTruthy()
    expect(errors.validFrom).toBeTruthy()
    expect(errors.version).toBeTruthy()
  })
})

describe('validateProfileForm — name length rules (3-100)', () => {
  it('rejects name shorter than 3 characters', () => {
    const { valid, errors } = validateProfileForm(validValues({ name: 'ab' }))
    expect(valid).toBe(false)
    expect(errors.name).toBeTruthy()
  })

  it('accepts name exactly 3 characters', () => {
    const { valid } = validateProfileForm(validValues({ name: 'abc' }))
    expect(valid).toBe(true)
  })

  it('accepts name exactly 100 characters', () => {
    const name = 'a'.repeat(100)
    const { valid } = validateProfileForm(validValues({ name }))
    expect(valid).toBe(true)
  })

  it('rejects name longer than 100 characters', () => {
    const name = 'a'.repeat(101)
    const { valid, errors } = validateProfileForm(validValues({ name }))
    expect(valid).toBe(false)
    expect(errors.name).toBeTruthy()
  })

  it('trims leading/trailing spaces before length check', () => {
    const { valid } = validateProfileForm(validValues({ name: '  abc  ' }))
    expect(valid).toBe(true)
  })

  it('rejects name that is only spaces even if length >= 3', () => {
    const { valid, errors } = validateProfileForm(validValues({ name: '     ' }))
    expect(valid).toBe(false)
    expect(errors.name).toBeTruthy()
  })

  it('accepts name with internal spaces counted correctly', () => {
    const { valid } = validateProfileForm(validValues({ name: 'Branch A Eval' }))
    expect(valid).toBe(true)
  })
})

describe('validateProfileForm — semver validation', () => {
  it('accepts valid semver 1.0.0', () => {
    const { valid } = validateProfileForm(validValues({ version: '1.0.0' }))
    expect(valid).toBe(true)
  })

  it('accepts valid semver 0.1.0', () => {
    const { valid } = validateProfileForm(validValues({ version: '0.1.0' }))
    expect(valid).toBe(true)
  })

  it('accepts valid semver 12.34.56', () => {
    const { valid } = validateProfileForm(validValues({ version: '12.34.56' }))
    expect(valid).toBe(true)
  })

  it('rejects version missing patch segment', () => {
    const { valid, errors } = validateProfileForm(validValues({ version: '1.0' }))
    expect(valid).toBe(false)
    expect(errors.version).toBeTruthy()
  })

  it('rejects version with only major', () => {
    const { valid, errors } = validateProfileForm(validValues({ version: '1' }))
    expect(valid).toBe(false)
    expect(errors.version).toBeTruthy()
  })

  it('rejects version with non-numeric segment', () => {
    const { valid, errors } = validateProfileForm(validValues({ version: '1.x.0' }))
    expect(valid).toBe(false)
    expect(errors.version).toBeTruthy()
  })

  it('rejects version with pre-release suffix', () => {
    const { valid, errors } = validateProfileForm(validValues({ version: '1.0.0-beta' }))
    expect(valid).toBe(false)
    expect(errors.version).toBeTruthy()
  })

  it('rejects version with leading "v"', () => {
    const { valid, errors } = validateProfileForm(validValues({ version: 'v1.0.0' }))
    expect(valid).toBe(false)
    expect(errors.version).toBeTruthy()
  })

  it('rejects empty version string', () => {
    const { valid, errors } = validateProfileForm(validValues({ version: '' }))
    expect(valid).toBe(false)
    expect(errors.version).toBeTruthy()
  })

  it('rejects whitespace-only version', () => {
    const { valid, errors } = validateProfileForm(validValues({ version: '   ' }))
    expect(valid).toBe(false)
    expect(errors.version).toBeTruthy()
  })

  it('trims version before validating', () => {
    const { valid } = validateProfileForm(validValues({ version: '  1.0.0  ' }))
    expect(valid).toBe(true)
  })
})

describe('validateProfileForm — validFrom rules', () => {
  it('accepts an ISO date string', () => {
    const { valid } = validateProfileForm(validValues({ validFrom: '2026-06-20' }))
    expect(valid).toBe(true)
  })

  it('rejects undefined validFrom', () => {
    const { valid, errors } = validateProfileForm(validValues({ validFrom: undefined }))
    expect(valid).toBe(false)
    expect(errors.validFrom).toBeTruthy()
  })

  it('rejects whitespace-only validFrom', () => {
    const { valid, errors } = validateProfileForm(validValues({ validFrom: '   ' }))
    expect(valid).toBe(false)
    expect(errors.validFrom).toBeTruthy()
  })
})

describe('validateProfileForm — scope rules', () => {
  it('accepts PHARMACY scope', () => {
    const { valid } = validateProfileForm(validValues({ scope: 'PHARMACY' }))
    expect(valid).toBe(true)
  })

  it('accepts DISTRICT scope', () => {
    const { valid } = validateProfileForm(validValues({ scope: 'DISTRICT' }))
    expect(valid).toBe(true)
  })

  it('accepts REGION scope', () => {
    const { valid } = validateProfileForm(validValues({ scope: 'REGION' }))
    expect(valid).toBe(true)
  })

  it('accepts NATIONAL scope', () => {
    const { valid } = validateProfileForm(validValues({ scope: 'NATIONAL' }))
    expect(valid).toBe(true)
  })

  it('rejects whitespace-only scope', () => {
    const { valid, errors } = validateProfileForm(validValues({ scope: '   ' }))
    expect(valid).toBe(false)
    expect(errors.scope).toBeTruthy()
  })
})

describe('DEFAULT_FORM_VALUES — defaults', () => {
  it('default status is implicitly DRAFT (fixed, not a field)', () => {
    expect(DEFAULT_FORM_VALUES).not.toHaveProperty('status')
  })

  it('default scope is PHARMACY (maps to "branch")', () => {
    expect(DEFAULT_FORM_VALUES.scope).toBe('PHARMACY')
  })

  it('default version is 1.0.0', () => {
    expect(DEFAULT_FORM_VALUES.version).toBe('1.0.0')
  })

  it('default description is empty string', () => {
    expect(DEFAULT_FORM_VALUES.description).toBe('')
  })

  it('default name is empty string', () => {
    expect(DEFAULT_FORM_VALUES.name).toBe('')
  })

  it('default validFrom is a non-empty date string', () => {
    expect(typeof DEFAULT_FORM_VALUES.validFrom).toBe('string')
    expect(DEFAULT_FORM_VALUES.validFrom.length).toBeGreaterThan(0)
  })

  it('default values pass validation as-is once name is filled', () => {
    const { valid } = validateProfileForm({ ...DEFAULT_FORM_VALUES, name: 'Valid Name' })
    expect(valid).toBe(true)
  })
})

describe('SCOPE_OPTIONS — option list', () => {
  it('has exactly 4 options', () => {
    expect(SCOPE_OPTIONS).toHaveLength(4)
  })

  it('includes PHARMACY mapped to Branch label', () => {
    const opt = SCOPE_OPTIONS.find((o) => o.value === 'PHARMACY')
    expect(opt?.label).toBe('Branch')
  })

  it('includes DISTRICT option', () => {
    expect(SCOPE_OPTIONS.some((o) => o.value === 'DISTRICT')).toBe(true)
  })

  it('includes REGION option', () => {
    expect(SCOPE_OPTIONS.some((o) => o.value === 'REGION')).toBe(true)
  })

  it('includes NATIONAL option', () => {
    expect(SCOPE_OPTIONS.some((o) => o.value === 'NATIONAL')).toBe(true)
  })

  it('every option has a value and label', () => {
    SCOPE_OPTIONS.forEach((o) => {
      expect(o.value).toBeTruthy()
      expect(o.label).toBeTruthy()
    })
  })
})

// ════════════════════════════════════════════════════════════
// 2. ProfileForm.jsx — source structure
// ════════════════════════════════════════════════════════════
describe('ProfileForm.jsx — source structure', () => {
  it('exports default function ProfileForm', () => {
    expect(formSrc).toContain('export default function ProfileForm')
  })

  it('exports validateProfileForm', () => {
    expect(formSrc).toContain('export function validateProfileForm')
  })

  it('exports DEFAULT_FORM_VALUES', () => {
    expect(formSrc).toContain('export const DEFAULT_FORM_VALUES')
  })

  it('exports SCOPE_OPTIONS', () => {
    expect(formSrc).toContain('export const SCOPE_OPTIONS')
  })

  it('renders a Name field', () => {
    expect(formSrc).toContain('label="Name"')
  })

  it('renders a Description field marked optional', () => {
    expect(formSrc).toContain('Description (optional)')
  })

  it('renders a Scope field', () => {
    expect(formSrc).toContain('label="Scope"')
  })

  it('renders a Version field', () => {
    expect(formSrc).toContain('label="Version"')
  })

  it('renders a Valid From field', () => {
    expect(formSrc).toContain('label="Valid From"')
  })

  it('renders a fixed Status field showing DRAFT', () => {
    expect(formSrc).toContain('label="Status"')
    expect(formSrc).toContain('value="DRAFT"')
  })

  it('Status input is disabled and readOnly', () => {
    const idx = formSrc.indexOf('value="DRAFT"')
    const slice = formSrc.slice(idx, idx + 120)
    expect(slice).toContain('disabled')
    expect(slice).toContain('readOnly')
  })

  it('accepts values prop', () => {
    expect(formSrc).toContain('values')
  })

  it('accepts errors prop with default {}', () => {
    expect(formSrc).toContain('errors = {}')
  })

  it('accepts onChange prop', () => {
    expect(formSrc).toContain('onChange')
  })

  it('accepts disabled prop with default false', () => {
    expect(formSrc).toContain('disabled = false')
  })

  it('disables all editable inputs when disabled prop is true', () => {
    expect(formSrc).toMatch(/disabled=\{disabled\}/)
  })

  it('uses a SEMVER_PATTERN regex for version validation', () => {
    expect(formSrc).toContain('SEMVER_PATTERN')
    expect(formSrc).toContain('/^\\d+\\.\\d+\\.\\d+$/')
  })

  it('uses select element for scope', () => {
    expect(formSrc).toContain('<select')
  })

  it('uses date input type for validFrom', () => {
    expect(formSrc).toContain('type="date"')
  })

  it('shows inline error text when error prop is set on a field', () => {
    expect(formSrc).toContain('errorStyle')
  })

  it('does not import Firestore', () => {
    expect(formSrc).not.toContain('firebase/firestore')
  })

  it('does not reference drag and drop libraries', () => {
    expect(formSrc.toLowerCase()).not.toContain('dnd')
    expect(formSrc.toLowerCase()).not.toContain('draggable')
  })

  it('does not reference a builder/canvas UI element', () => {
    expect(formSrc).not.toContain('<canvas')
    expect(formSrc).not.toContain('VisualBuilder')
  })

  it('does not reference hierarchy editing (baskets/elements/rules)', () => {
    expect(formSrc).not.toContain('basket')
    expect(formSrc).not.toContain('BasketNode')
  })

  it('does not import AI/LLM libraries', () => {
    expect(formSrc.toLowerCase()).not.toContain('openai')
    expect(formSrc.toLowerCase()).not.toContain('anthropic')
  })

  it('does not import Excel/xlsx libraries', () => {
    expect(formSrc).not.toContain('xlsx')
    expect(formSrc).not.toContain('XLSX')
  })
})

// ════════════════════════════════════════════════════════════
// 3. CreateProfileModal.jsx — source structure
// ════════════════════════════════════════════════════════════
describe('CreateProfileModal.jsx — source structure', () => {
  it('exports default function CreateProfileModal', () => {
    expect(modalSrc).toContain('export default function CreateProfileModal')
  })

  it('accepts open prop', () => {
    expect(modalSrc).toContain('open')
  })

  it('accepts onClose prop', () => {
    expect(modalSrc).toContain('onClose')
  })

  it('accepts actor prop', () => {
    expect(modalSrc).toContain('actor')
  })

  it('accepts onCreated prop', () => {
    expect(modalSrc).toContain('onCreated')
  })

  it('returns null when open is false', () => {
    expect(modalSrc).toContain('if (!open) return null')
  })

  it('imports ProfileForm', () => {
    expect(modalSrc).toContain("import ProfileForm")
  })

  it('imports validateProfileForm from ProfileForm', () => {
    expect(modalSrc).toContain('validateProfileForm')
  })

  it('imports DEFAULT_FORM_VALUES from ProfileForm', () => {
    expect(modalSrc).toContain('DEFAULT_FORM_VALUES')
  })

  it('imports createDraft from the workflow kernel', () => {
    expect(modalSrc).toContain("import { createDraft } from '../../profileStudio/workflow'")
  })

  it('imports createProfileDocument from the Firestore service', () => {
    expect(modalSrc).toContain('createProfileDocument')
    expect(modalSrc).toContain("from '../../profileStudio/profileStudioService'")
  })

  it('imports calculateProfileHash from the integrity kernel', () => {
    expect(modalSrc).toContain('calculateProfileHash')
  })

  it('imports normalizeError from the store', () => {
    expect(modalSrc).toContain('normalizeError')
  })

  it('imports useToastStore', () => {
    expect(modalSrc).toContain('useToastStore')
  })

  it('has a buildProfileDocument helper', () => {
    expect(modalSrc).toContain('function buildProfileDocument')
  })

  it('buildProfileDocument sets status from draft metadata', () => {
    expect(modalSrc).toContain('status:  m.status')
  })

  it('buildProfileDocument sets simulationSummary to null', () => {
    expect(modalSrc).toContain('simulationSummary: null')
  })

  it('buildProfileDocument sets validationSummary.valid to false for a fresh draft', () => {
    expect(modalSrc).toContain('valid:           false')
  })

  it('buildProfileDocument includes createdBy from actor', () => {
    expect(modalSrc).toContain('createdBy:   actor.uid')
  })

  it('buildProfileDocument includes approvedBy: null', () => {
    expect(modalSrc).toContain('approvedBy:  null')
  })

  it('buildProfileDocument includes publishedBy: null', () => {
    expect(modalSrc).toContain('publishedBy: null')
  })

  it('buildProfileDocument computes hash via calculateProfileHash', () => {
    expect(modalSrc).toContain('hash: calculateProfileHash(draftProfile)')
  })

  it('has a submitting state', () => {
    expect(modalSrc).toContain('submitting')
    expect(modalSrc).toContain('useState')
  })

  it('guards against double submit', () => {
    expect(modalSrc).toContain('if (submitting) return')
  })

  it('disables Cancel button while submitting', () => {
    expect(modalSrc).toContain('disabled={submitting}')
  })

  it('shows a spinner while submitting', () => {
    expect(modalSrc).toContain('Loader2')
    expect(modalSrc).toContain('animate-spin')
  })

  it('shows "Creating…" label while submitting', () => {
    expect(modalSrc).toContain('Creating')
  })

  it('shows "Create Draft" label when not submitting', () => {
    expect(modalSrc).toContain('Create Draft')
  })

  it('has a Cancel button', () => {
    expect(modalSrc).toContain('Cancel')
  })

  it('validates form before calling createDraft', () => {
    expect(modalSrc).toContain('validateProfileForm(values)')
    expect(modalSrc).toContain('if (!valid)')
  })

  it('sets form errors when validation fails', () => {
    expect(modalSrc).toContain('setErrors(formErrors)')
  })

  it('calls createDraft with actor.uid as createdBy', () => {
    expect(modalSrc).toContain('createdBy:   actor?.uid')
  })

  it('calls createDraft with actor.uid as second positional arg', () => {
    expect(modalSrc).toMatch(/createDraft\(\s*\{[\s\S]*?\},\s*actor\?\.uid,?\s*\)/)
  })

  it('checks draftResult.success before proceeding', () => {
    expect(modalSrc).toContain('draftResult.success')
  })

  it('throws a normalized error message when draft creation fails', () => {
    expect(modalSrc).toContain('draftResult.issues')
  })

  it('overrides factory default version with user-supplied version', () => {
    expect(modalSrc).toContain('version: values.version.trim()')
  })

  it('calls createProfileDocument with payload and actor', () => {
    expect(modalSrc).toContain('createProfileDocument(payload, actor)')
  })

  it('shows success toast on successful creation', () => {
    expect(modalSrc).toContain('toast.success')
  })

  it('calls onCreated callback after success (refresh trigger)', () => {
    expect(modalSrc).toContain('onCreated?.()')
  })

  it('resets and closes modal after success', () => {
    expect(modalSrc).toContain('resetAndClose()')
  })

  it('catches errors and normalizes them', () => {
    expect(modalSrc).toContain('catch (err)')
    expect(modalSrc).toContain('normalizeError(err)')
  })

  it('shows error toast with normalized message (never raw Firebase message)', () => {
    expect(modalSrc).toContain('toast.error(normalized.message')
  })

  it('re-enables submit state after error (no stuck spinner)', () => {
    expect(modalSrc).toContain('setSubmitting(false)')
  })

  it('resetAndClose resets values to DEFAULT_FORM_VALUES', () => {
    expect(modalSrc).toContain('setValues(DEFAULT_FORM_VALUES)')
  })

  it('resetAndClose clears errors', () => {
    expect(modalSrc).toContain('setErrors({})')
  })

  it('clicking backdrop is disabled while submitting (prevents accidental close mid-save)', () => {
    expect(modalSrc).toContain('onClick={submitting ? undefined : resetAndClose}')
  })

  it('has aria-label="Close" on the close button', () => {
    expect(modalSrc).toContain('aria-label="Close"')
  })

  it('renders within a form element with onSubmit handler', () => {
    expect(modalSrc).toContain('<form onSubmit={handleSubmit}>')
  })

  it('prevents default form submission', () => {
    expect(modalSrc).toContain('e.preventDefault()')
  })

  it('clears field-level error on change', () => {
    expect(modalSrc).toContain('setErrors((e) => ({ ...e, [field]: undefined }))')
  })

  it('does not import a drag-and-drop library', () => {
    expect(modalSrc.toLowerCase()).not.toContain('dnd-kit')
    expect(modalSrc.toLowerCase()).not.toContain('react-dnd')
  })

  it('does not reference a visual builder/canvas element', () => {
    expect(modalSrc).not.toContain('<canvas')
    expect(modalSrc).not.toContain('VisualBuilder')
  })

  it('does not import AI/LLM SDKs', () => {
    expect(modalSrc.toLowerCase()).not.toContain('openai')
    expect(modalSrc.toLowerCase()).not.toContain('anthropic')
  })

  it('does not import Excel/xlsx libraries', () => {
    expect(modalSrc).not.toContain('xlsx')
    expect(modalSrc).not.toContain('XLSX')
  })

  it('does not reference evaluation engine scoring modules', () => {
    expect(modalSrc).not.toContain('evaluationEngine')
    expect(modalSrc).not.toContain('scoringEngine')
  })

  it('does not directly call Firestore SDK functions', () => {
    expect(modalSrc).not.toContain("from 'firebase/firestore'")
  })

  it('hierarchy.payload references the draft root node (no hierarchy editing)', () => {
    expect(modalSrc).toContain('payload:      root')
  })

  it('sets basketCount from root.baskets.length (read-only summary, not editable)', () => {
    expect(modalSrc).toContain('basketCount:  root.baskets.length')
  })
})

// ════════════════════════════════════════════════════════════
// 4. ProfileStudioPage.jsx — create flow wiring
// ════════════════════════════════════════════════════════════
describe('ProfileStudioPage.jsx — create flow wiring', () => {
  it('imports CreateProfileModal', () => {
    expect(pageSrc).toContain("import CreateProfileModal")
  })

  it('has createModalOpen state', () => {
    expect(pageSrc).toContain('createModalOpen')
  })

  it('onCreate opens the modal', () => {
    expect(pageSrc).toContain('onCreate={() => setCreateModalOpen(true)}')
  })

  it('renders CreateProfileModal with open prop bound to state', () => {
    expect(pageSrc).toContain('open={createModalOpen}')
  })

  it('renders CreateProfileModal with onClose closing the modal', () => {
    expect(pageSrc).toContain('onClose={() => setCreateModalOpen(false)}')
  })

  it('passes actor to CreateProfileModal', () => {
    expect(pageSrc).toContain('actor={actor}')
  })

  it('passes refresh as onCreated (refresh list after create)', () => {
    expect(pageSrc).toContain('onCreated={refresh}')
  })

  it('no more Phase 2B placeholder comment remains', () => {
    expect(pageSrc).not.toContain('Phase 2B — profile creation modal')
  })
})

// ════════════════════════════════════════════════════════════
// 5. ProfileCard.jsx — extended fields (Phase 2B)
// ════════════════════════════════════════════════════════════
describe('ProfileCard.jsx — extended display fields', () => {
  it('shows profile.name', () => {
    expect(cardSrc).toContain('profile.name')
  })

  it('shows profile.scope via SCOPE_LABEL lookup', () => {
    expect(cardSrc).toContain('SCOPE_LABEL')
    expect(cardSrc).toContain('profile.scope')
  })

  it('shows profile.hash (truncated via fmtHash)', () => {
    expect(cardSrc).toContain('fmtHash')
    expect(cardSrc).toContain('profile.hash')
  })

  it('shows profile.createdBy', () => {
    expect(cardSrc).toContain('profile.createdBy')
  })

  it('shows profile.updatedAt via fmtDate', () => {
    expect(cardSrc).toContain('fmtDate(profile.updatedAt)')
  })

  it('shows profile.version', () => {
    expect(cardSrc).toContain('profile.version')
  })

  it('shows profile.status via ProfileStatusBadge', () => {
    expect(cardSrc).toContain('status={profile.status}')
  })

  it('has exactly one action button: View', () => {
    expect(cardSrc).toContain('aria-label="View profile"')
    expect(cardSrc).not.toContain('Edit')
    expect(cardSrc).not.toContain('Approve')
    expect(cardSrc).not.toContain('Publish')
    expect(cardSrc).not.toContain('Archive')
    expect(cardSrc).not.toContain('Delete')
  })

  it('View button stops propagation before delegating to onClick', () => {
    expect(cardSrc).toContain('e.stopPropagation()')
  })

  it('SCOPE_LABEL maps PHARMACY to Branch', () => {
    expect(cardSrc).toContain("PHARMACY: 'Branch'")
  })
})

// ════════════════════════════════════════════════════════════
// 6. Service layer — createDraft / createProfileDocument contract
// ════════════════════════════════════════════════════════════
describe('Service layer — create flow contract', () => {
  it('workflow.ts exports createDraft', () => {
    expect(workflowSrc).toContain('export function createDraft')
  })

  it('createDraft never throws (wrapped in try/catch)', () => {
    const idx = workflowSrc.indexOf('export function createDraft')
    const slice = workflowSrc.slice(idx, idx + 600)
    expect(slice).toContain('try {')
    expect(slice).toContain('catch')
  })

  it('createDraft always returns DRAFT status on success', () => {
    const idx = workflowSrc.indexOf('export function createDraft')
    const slice = workflowSrc.slice(idx, idx + 600)
    expect(slice).toContain("'DRAFT'")
  })

  it('profileStudioService exports createProfileDocument', () => {
    expect(serviceSrc).toContain('export async function createProfileDocument')
  })

  it('createProfileDocument enforces canCreateProfile permission', () => {
    const idx = serviceSrc.indexOf('export async function createProfileDocument')
    const slice = serviceSrc.slice(idx, idx + 500)
    expect(slice).toContain('canCreateProfile(actor.role)')
  })

  it('createProfileDocument throws PERMISSION_DENIED-prefixed errors', () => {
    expect(serviceSrc).toContain("PERMISSION_DENIED:")
  })

  it('createProfileDocument validates schema before writing (requireValid)', () => {
    const idx = serviceSrc.indexOf('export async function createProfileDocument')
    const slice = serviceSrc.slice(idx, idx + 700)
    expect(slice).toContain('requireValid')
  })

  it('createProfileDocument writes a CREATE_DRAFT audit log entry', () => {
    const idx = serviceSrc.indexOf('export async function createProfileDocument')
    const slice = serviceSrc.slice(idx, idx + 1200)
    expect(slice).toContain("'CREATE_DRAFT'")
  })

  it('createProfileDocument uses serverTimestamp for createdAt/updatedAt', () => {
    const idx = serviceSrc.indexOf('export async function createProfileDocument')
    const slice = serviceSrc.slice(idx, idx + 700)
    expect(slice).toContain('serverTimestamp()')
  })
})

// ════════════════════════════════════════════════════════════
// 7. Permissions — UI + service enforcement parity
// ════════════════════════════════════════════════════════════
describe('Permissions — create button visibility per role', () => {
  it('ProfileStudioHeader gates New Profile button on canCreate prop', async () => {
    const headerSrc = await import('../../components/profileStudio/ProfileStudioHeader.jsx?raw').then((m) => m.default)
    expect(headerSrc).toContain('{canCreate &&')
  })

  it('ProfileStudioPage derives canCreate from useProfileStudioPermissions', () => {
    expect(pageSrc).toContain('permissions.canCreate')
  })

  it('PERMISSION_MATRIX (persistence schema) grants admin profile:create', async () => {
    const schemaSrc = await import('../../profileStudio/persistenceSchema.ts?raw').then((m) => m.default)
    const adminBlock = schemaSrc.slice(schemaSrc.indexOf('admin: ['), schemaSrc.indexOf('general_manager: ['))
    expect(adminBlock).toContain("'profile:create'")
  })

  it('PERMISSION_MATRIX does NOT grant general_manager profile:create', async () => {
    const schemaSrc = await import('../../profileStudio/persistenceSchema.ts?raw').then((m) => m.default)
    const gmBlock = schemaSrc.slice(schemaSrc.indexOf('general_manager: ['), schemaSrc.indexOf('district_supervisor: ['))
    expect(gmBlock).not.toContain("'profile:create'")
  })

  it('PERMISSION_MATRIX does NOT grant district_supervisor profile:create', async () => {
    const schemaSrc = await import('../../profileStudio/persistenceSchema.ts?raw').then((m) => m.default)
    const dsBlock = schemaSrc.slice(schemaSrc.indexOf('district_supervisor: ['), schemaSrc.indexOf('manager: ['))
    expect(dsBlock).not.toContain("'profile:create'")
  })

  it('PERMISSION_MATRIX does NOT grant manager profile:create', async () => {
    const schemaSrc = await import('../../profileStudio/persistenceSchema.ts?raw').then((m) => m.default)
    const mgrBlock = schemaSrc.slice(schemaSrc.indexOf('  manager: ['), schemaSrc.indexOf('pharmacist: ['))
    expect(mgrBlock).not.toContain("'profile:create'")
  })

  it('pharmacist role is excluded from PS_ROLES (route hidden)', () => {
    expect(pageSrc).not.toContain("'pharmacist'")
  })

  it('canCreateProfile guard function is imported by the service', () => {
    expect(serviceSrc).toContain('canCreateProfile')
  })

  it('service-level permission check is independent of UI (defense in depth)', () => {
    // The service throws on its own — it does not trust a UI-supplied flag
    expect(serviceSrc).toContain('requirePermission(canCreateProfile(actor.role)')
  })
})

// ════════════════════════════════════════════════════════════
// 8. Loading + double-submit + error normalization
// ════════════════════════════════════════════════════════════
describe('Loading, double-submit prevention, and error normalization', () => {
  it('submit button is disabled while submitting', () => {
    const idx = modalSrc.indexOf('type="submit"')
    const slice = modalSrc.slice(idx, idx + 200)
    expect(slice).toContain('disabled={submitting}')
  })

  it('handleSubmit is async', () => {
    expect(modalSrc).toContain('const handleSubmit = async (e) =>')
  })

  it('handleSubmit returns early when already submitting', () => {
    expect(modalSrc).toContain('if (submitting) return')
  })

  it('errors are normalized via normalizeError, never shown raw', () => {
    expect(modalSrc).not.toContain('err.message)') // raw err.message never shown directly
    expect(modalSrc).toContain('normalized.message')
  })

  it('normalizeError is imported from the Phase 1C store (shared error model)', () => {
    expect(modalSrc).toContain("from '../../profileStudio/profileStudioStore'")
  })
})

// ════════════════════════════════════════════════════════════
// 9. Integration — no out-of-scope features
// ════════════════════════════════════════════════════════════
describe('Integration — scope guardrails', () => {
  it('no Drag & Drop in any Phase 2B file', () => {
    ;[modalSrc, formSrc].forEach((src) => {
      expect(src.toLowerCase()).not.toContain('dragstart')
      expect(src.toLowerCase()).not.toContain('ondrop')
    })
  })

  it('no Visual Builder / canvas element in any Phase 2B file', () => {
    ;[modalSrc, formSrc].forEach((src) => {
      expect(src).not.toContain('<canvas')
      expect(src).not.toContain('VisualBuilder')
    })
  })

  it('no AI/LLM SDK references in any Phase 2B file', () => {
    ;[modalSrc, formSrc].forEach((src) => {
      expect(src.toLowerCase()).not.toContain('openai')
      expect(src.toLowerCase()).not.toContain('anthropic')
      expect(src.toLowerCase()).not.toContain('gpt-')
    })
  })

  it('no Excel/xlsx import logic in any Phase 2B file', () => {
    ;[modalSrc, formSrc].forEach((src) => {
      expect(src).not.toContain('xlsx')
      expect(src).not.toContain('XLSX')
      expect(src.toLowerCase()).not.toContain('.csv')
    })
  })

  it('no Evaluation Engine module imports in any Phase 2B file', () => {
    ;[modalSrc, formSrc].forEach((src) => {
      expect(src).not.toContain('evaluationEngine')
      expect(src).not.toContain('evaluationPipeline')
      expect(src).not.toContain('evaluationRegistry')
    })
  })

  it('no hierarchy node creation (createBasketNode/createElementNode/createRuleNode)', () => {
    ;[modalSrc, formSrc].forEach((src) => {
      expect(src).not.toContain('createBasketNode')
      expect(src).not.toContain('createElementNode')
      expect(src).not.toContain('createRuleNode')
    })
  })

  it('modal file is named CreateProfileModal.jsx and lives under components/profileStudio', () => {
    expect(modalSrc).toContain('CreateProfileModal')
  })

  it('form file is named ProfileForm.jsx and lives under components/profileStudio', () => {
    expect(formSrc).toContain('ProfileForm')
  })

  it('CreateProfileModal composes ProfileForm (composition, not reimplementation)', () => {
    expect(modalSrc).toContain('<ProfileForm')
  })

  it('CreateProfileModal does not duplicate field validation logic inline', () => {
    // Only one call site to validateProfileForm — logic lives in ProfileForm.jsx
    const matches = modalSrc.match(/validateProfileForm\(/g) || []
    expect(matches.length).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════
// 10. Empty state / non-builder confirmation (explicit per spec)
// ════════════════════════════════════════════════════════════
describe('Explicit scope confirmations required by Phase 2B spec', () => {
  it('CONFIRM: no drag-and-drop', () => {
    expect(modalSrc.toLowerCase()).not.toContain('react-dnd')
  })

  it('CONFIRM: no visual builder implementation (no canvas element)', () => {
    expect(modalSrc).not.toContain('<canvas')
  })

  it('CONFIRM: no AI', () => {
    expect(modalSrc.toLowerCase()).not.toContain('claude')
  })

  it('CONFIRM: no Excel import', () => {
    expect(modalSrc.toLowerCase()).not.toContain('import center')
  })

  it('CONFIRM: no Evaluation Engine changes', () => {
    expect(modalSrc).not.toContain('evaluationActualsService')
  })
})
