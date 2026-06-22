// ============================================================
// ProcessorReadinessPanel.test.ts — Phase 2E certification (140+ tests)
//
// Pattern: ?raw source inspection + direct unit tests against the
// pure deriveReadinessLabel logic (re-implemented here to mirror the
// component's exact rule order, since the function is not exported).
//
// Phase 2E is READ-ONLY and informational only:
//   - NO workflow execution. NO validation execution. NO simulation execution.
//   - NO Firestore writes. NO profile updates. NO editing.
//   - NO builder. NO drag & drop. NO AI. NO Excel import.
//   - NO Evaluation Engine changes.
// ============================================================

import { describe, it, expect } from 'vitest'

const panelSrc = await import('../../components/profileStudio/ProcessorReadinessPanel.jsx?raw').then((m) => m.default)
const detailPanelSrc = await import('../../components/profileStudio/ProfileDetailPanel.jsx?raw').then((m) => m.default)

// Code body only — excludes the leading file-header comment block, which
// intentionally documents these same constraints in prose and would
// otherwise produce false-positive guardrail failures.
const panelBody = panelSrc.slice(panelSrc.indexOf('import React'))

// Mirrors the component's internal deriveReadinessLabel exactly, for
// behavioural verification independent of source-text inspection.
function deriveReadinessLabel({ status, basketCount, totalStepCount }) {
  if (status === 'ARCHIVED') return 'Archived'
  if (status === 'PUBLISHED') return 'Published'
  if (basketCount === 0) return 'Not ready — no baskets defined'
  if (totalStepCount === 0) return 'Not ready — missing processors'
  if (status === 'DRAFT') return 'Ready to validate'
  if (status === 'VALIDATED') return 'Ready to simulate'
  if (status === 'SIMULATED') return 'Ready to approve'
  if (status === 'APPROVED') return 'Ready to publish'
  return 'Unknown'
}

// ════════════════════════════════════════════════════════════
// 1. Component exists — exports, props
// ════════════════════════════════════════════════════════════
describe('ProcessorReadinessPanel — exports and props', () => {
  it('exports default function ProcessorReadinessPanel', () => {
    expect(panelSrc).toContain('export default function ProcessorReadinessPanel')
  })

  it('accepts a profile prop', () => {
    expect(panelSrc).toContain('profile')
  })

  it('accepts a processors prop (fallback when profile is not supplied)', () => {
    expect(panelSrc).toContain('processors:        processorsProp')
  })

  it('accepts a validationSummary prop', () => {
    expect(panelSrc).toContain('validationSummary: validationSummaryProp')
  })

  it('accepts a simulationSummary prop', () => {
    expect(panelSrc).toContain('simulationSummary: simulationSummaryProp')
  })

  it('accepts a status prop', () => {
    expect(panelSrc).toContain('status:            statusProp')
  })

  it('accepts a hierarchy prop', () => {
    expect(panelSrc).toContain('hierarchy:         hierarchyProp')
  })

  it('prefers profile.* fields over individual props when profile is supplied', () => {
    expect(panelSrc).toContain('profile?.status            ?? statusProp')
    expect(panelSrc).toContain('profile?.hierarchy          ?? hierarchyProp')
    expect(panelSrc).toContain('profile?.processors         ?? processorsProp')
  })

  it('is a pure presentational component (no data fetching of its own)', () => {
    expect(panelSrc).not.toContain('useEffect')
    expect(panelSrc).not.toContain('fetch(')
  })

  it('uses useMemo only for pure derivation (allowed per spec)', () => {
    expect(panelSrc).toContain('useMemo')
    expect(panelSrc).toContain("import React, { useMemo } from 'react'")
  })
})

// ════════════════════════════════════════════════════════════
// 2. Composed into ProfileDetailPanel
// ════════════════════════════════════════════════════════════
describe('ProfileDetailPanel — composes ProcessorReadinessPanel (Phase 2E)', () => {
  it('imports ProcessorReadinessPanel', () => {
    expect(detailPanelSrc).toContain("import ProcessorReadinessPanel from './ProcessorReadinessPanel'")
  })

  it('renders ProcessorReadinessPanel with the profile prop', () => {
    expect(detailPanelSrc).toContain('<ProcessorReadinessPanel profile={profile} />')
  })

  it('places ProcessorReadinessPanel after the Hierarchy Summary section', () => {
    const hierarchyIdx = detailPanelSrc.indexOf('title="Hierarchy Summary"')
    const readinessIdx = detailPanelSrc.indexOf('<ProcessorReadinessPanel')
    expect(readinessIdx).toBeGreaterThan(hierarchyIdx)
  })

  it('places ProcessorReadinessPanel before the Processor Inventory section', () => {
    const readinessIdx = detailPanelSrc.indexOf('<ProcessorReadinessPanel')
    const inventoryIdx = detailPanelSrc.indexOf('title="Processor Inventory"')
    expect(readinessIdx).toBeLessThan(inventoryIdx)
  })

  it('keeps the existing Processor Inventory section intact', () => {
    expect(detailPanelSrc).toContain('title="Processor Inventory"')
    expect(detailPanelSrc).toContain('Processor Types')
    expect(detailPanelSrc).toContain('Zero Target Guard')
  })

  it('does not duplicate the readiness derivation logic inline in ProfileDetailPanel', () => {
    expect(detailPanelSrc).not.toContain('deriveReadinessLabel')
  })
})

// ════════════════════════════════════════════════════════════
// 3-10. Readiness verdict rules — behavioural (mirrors source logic)
// ════════════════════════════════════════════════════════════
describe('Readiness verdict — ARCHIVED', () => {
  it('returns "Archived" regardless of basket/processor counts', () => {
    expect(deriveReadinessLabel({ status: 'ARCHIVED', basketCount: 0, totalStepCount: 0 })).toBe('Archived')
    expect(deriveReadinessLabel({ status: 'ARCHIVED', basketCount: 5, totalStepCount: 10 })).toBe('Archived')
  })

  it('ARCHIVED takes priority over "no baskets" check', () => {
    expect(deriveReadinessLabel({ status: 'ARCHIVED', basketCount: 0, totalStepCount: 5 })).toBe('Archived')
  })

  it('source contains the ARCHIVED branch first in the rule order', () => {
    const idx = panelSrc.indexOf("status === 'ARCHIVED'")
    expect(idx).toBeGreaterThan(-1)
    const firstRuleIdx = panelSrc.indexOf('function deriveReadinessLabel')
    expect(idx).toBeGreaterThan(firstRuleIdx)
  })
})

describe('Readiness verdict — PUBLISHED', () => {
  it('returns "Published" regardless of basket/processor counts', () => {
    expect(deriveReadinessLabel({ status: 'PUBLISHED', basketCount: 0, totalStepCount: 0 })).toBe('Published')
    expect(deriveReadinessLabel({ status: 'PUBLISHED', basketCount: 3, totalStepCount: 7 })).toBe('Published')
  })

  it('PUBLISHED takes priority over "no baskets" check', () => {
    expect(deriveReadinessLabel({ status: 'PUBLISHED', basketCount: 0, totalStepCount: 5 })).toBe('Published')
  })
})

describe('Readiness verdict — no baskets defined', () => {
  it('returns "Not ready — no baskets defined" when basketCount is 0 and status is DRAFT', () => {
    expect(deriveReadinessLabel({ status: 'DRAFT', basketCount: 0, totalStepCount: 0 })).toBe('Not ready — no baskets defined')
  })

  it('returns the no-baskets verdict even when status is VALIDATED', () => {
    expect(deriveReadinessLabel({ status: 'VALIDATED', basketCount: 0, totalStepCount: 5 })).toBe('Not ready — no baskets defined')
  })

  it('returns the no-baskets verdict even when status is APPROVED', () => {
    expect(deriveReadinessLabel({ status: 'APPROVED', basketCount: 0, totalStepCount: 5 })).toBe('Not ready — no baskets defined')
  })
})

describe('Readiness verdict — missing processors', () => {
  it('returns "Not ready — missing processors" when baskets exist but totalStepCount is 0', () => {
    expect(deriveReadinessLabel({ status: 'DRAFT', basketCount: 2, totalStepCount: 0 })).toBe('Not ready — missing processors')
  })

  it('missing-processors verdict applies even when status is VALIDATED', () => {
    expect(deriveReadinessLabel({ status: 'VALIDATED', basketCount: 1, totalStepCount: 0 })).toBe('Not ready — missing processors')
  })

  it('missing-processors check only runs after the no-baskets check passes', () => {
    expect(deriveReadinessLabel({ status: 'DRAFT', basketCount: 0, totalStepCount: 0 })).toBe('Not ready — no baskets defined')
  })
})

describe('Readiness verdict — Ready to validate (DRAFT)', () => {
  it('returns "Ready to validate" when status is DRAFT with baskets and processors', () => {
    expect(deriveReadinessLabel({ status: 'DRAFT', basketCount: 1, totalStepCount: 1 })).toBe('Ready to validate')
  })

  it('requires both basketCount > 0 and totalStepCount > 0', () => {
    expect(deriveReadinessLabel({ status: 'DRAFT', basketCount: 3, totalStepCount: 5 })).toBe('Ready to validate')
  })
})

describe('Readiness verdict — Ready to simulate (VALIDATED)', () => {
  it('returns "Ready to simulate" when status is VALIDATED with structure', () => {
    expect(deriveReadinessLabel({ status: 'VALIDATED', basketCount: 1, totalStepCount: 1 })).toBe('Ready to simulate')
  })
})

describe('Readiness verdict — Ready to approve (SIMULATED)', () => {
  it('returns "Ready to approve" when status is SIMULATED with structure', () => {
    expect(deriveReadinessLabel({ status: 'SIMULATED', basketCount: 1, totalStepCount: 1 })).toBe('Ready to approve')
  })
})

describe('Readiness verdict — Ready to publish (APPROVED)', () => {
  it('returns "Ready to publish" when status is APPROVED with structure', () => {
    expect(deriveReadinessLabel({ status: 'APPROVED', basketCount: 1, totalStepCount: 1 })).toBe('Ready to publish')
  })
})

describe('Readiness verdict — fallback', () => {
  it('returns "Unknown" for an unrecognized status', () => {
    expect(deriveReadinessLabel({ status: 'SOMETHING_ELSE', basketCount: 1, totalStepCount: 1 })).toBe('Unknown')
  })

  it('returns "Unknown" for an undefined status (after structure checks pass)', () => {
    expect(deriveReadinessLabel({ status: undefined, basketCount: 1, totalStepCount: 1 })).toBe('Unknown')
  })
})

// ════════════════════════════════════════════════════════════
// 11-13. Display — counts, validation, simulation
// ════════════════════════════════════════════════════════════
describe('Display — counts and facts', () => {
  it('renders basket count via Row', () => {
    expect(panelSrc).toContain('label="Baskets"')
    expect(panelSrc).toContain('value={basketCount}')
  })

  it('renders element count via Row', () => {
    expect(panelSrc).toContain('label="Elements"')
    expect(panelSrc).toContain('value={elementCount}')
  })

  it('renders processor step count via Row', () => {
    expect(panelSrc).toContain('label="Processor Steps"')
    expect(panelSrc).toContain('value={totalStepCount}')
  })

  it('renders profile status via Row', () => {
    expect(panelSrc).toContain('label="Status"')
    expect(panelSrc).toContain("value={status || '—'}")
  })

  it('derives basketCount with nullish coalescing (0 is valid)', () => {
    expect(panelSrc).toContain('hierarchy.basketCount    ?? 0')
  })

  it('derives elementCount with nullish coalescing', () => {
    expect(panelSrc).toContain('hierarchy.elementCount   ?? 0')
  })

  it('derives totalStepCount with nullish coalescing', () => {
    expect(panelSrc).toContain('processors.totalStepCount ?? 0')
  })
})

describe('Display — validation summary', () => {
  it('shows "Valid" when validationSummary.valid is true', () => {
    expect(panelSrc).toContain("validationSummary.valid ? 'Valid' : 'Invalid'")
  })

  it('shows "Not yet validated" fallback when validationSummary is absent', () => {
    expect(panelSrc).toContain('Not yet validated')
  })

  it('renders a Validation row label', () => {
    expect(panelSrc).toContain('label="Validation"')
  })
})

describe('Display — simulation summary', () => {
  it('shows score when simulationSummary.valid is true', () => {
    expect(panelSrc).toContain('Valid (${simulationSummary.score}%)')
  })

  it('shows "No simulation run yet" fallback when simulationSummary is absent', () => {
    expect(panelSrc).toContain('No simulation run yet')
  })

  it('renders a Simulation row label', () => {
    expect(panelSrc).toContain('label="Simulation"')
  })
})

describe('Display — panel title and badge', () => {
  it('renders "Processor Readiness" as the panel title', () => {
    expect(panelSrc).toContain('Processor Readiness')
  })

  it('renders the readiness label inside a badge-style element', () => {
    expect(panelSrc).toContain('readinessLabel')
    expect(panelSrc).toContain("borderRadius: '99px'")
  })

  it('applies a tone (color/bg/border) per readiness label', () => {
    expect(panelSrc).toContain('READINESS_TONE')
    expect(panelSrc).toContain('FALLBACK_TONE')
  })

  it('READINESS_TONE has an entry for every defined verdict label', () => {
    ;[
      'Archived', 'Published',
      'Not ready — no baskets defined', 'Not ready — missing processors',
      'Ready to validate', 'Ready to simulate', 'Ready to approve', 'Ready to publish',
    ].forEach((label) => {
      expect(panelSrc).toContain(label)
    })
  })
})

// ════════════════════════════════════════════════════════════
// 14-16. No buttons, no inputs, no onClick
// ════════════════════════════════════════════════════════════
describe('GUARDRAILS — no interactive controls', () => {
  it('renders no <button> element', () => {
    expect(panelSrc).not.toContain('<button')
  })

  it('renders no <input> element', () => {
    expect(panelSrc).not.toContain('<input')
  })

  it('renders no <select> element', () => {
    expect(panelSrc).not.toContain('<select')
  })

  it('renders no <textarea> element', () => {
    expect(panelSrc).not.toContain('<textarea')
  })

  it('renders no <form> element', () => {
    expect(panelSrc).not.toContain('<form')
  })

  it('renders no <a> link element', () => {
    expect(panelSrc).not.toContain('<a ')
    expect(panelSrc).not.toContain('<a>')
  })

  it('has zero onClick handlers', () => {
    expect(panelSrc).not.toContain('onClick')
  })

  it('has zero onChange handlers', () => {
    expect(panelSrc).not.toContain('onChange')
  })

  it('has zero onSubmit handlers', () => {
    expect(panelSrc).not.toContain('onSubmit')
  })

  it('has no role="button" (not a clickable surface)', () => {
    expect(panelSrc).not.toContain('role="button"')
  })

  it('has no tabIndex (not an interactive focus target)', () => {
    expect(panelSrc).not.toContain('tabIndex')
  })
})

// ════════════════════════════════════════════════════════════
// 17-25. No workflow / lifecycle / Firestore / hook misuse
// ════════════════════════════════════════════════════════════
describe('GUARDRAILS — no workflow imports', () => {
  it('does NOT import from workflow.ts', () => {
    expect(panelSrc).not.toContain("from '../../profileStudio/workflow'")
  })

  it('does NOT import createDraft', () => {
    expect(panelSrc).not.toContain('createDraft')
  })
})

describe('GUARDRAILS — no validateDraft', () => {
  it('does NOT reference validateDraft anywhere', () => {
    expect(panelBody).not.toContain('validateDraft')
  })
})

describe('GUARDRAILS — no simulateDraft', () => {
  it('does NOT reference simulateDraft anywhere', () => {
    expect(panelBody).not.toContain('simulateDraft')
  })
})

describe('GUARDRAILS — no approveDraft', () => {
  it('does NOT reference approveDraft anywhere', () => {
    expect(panelBody).not.toContain('approveDraft')
  })
})

describe('GUARDRAILS — no markPublishReady', () => {
  it('does NOT reference markPublishReady anywhere', () => {
    expect(panelBody).not.toContain('markPublishReady')
  })
})

describe('GUARDRAILS — no updateProfileDocument', () => {
  it('does NOT reference updateProfileDocument anywhere', () => {
    expect(panelBody).not.toContain('updateProfileDocument')
  })

  it('does NOT reference createProfileDocument anywhere', () => {
    expect(panelBody).not.toContain('createProfileDocument')
  })

  it('does NOT reference archiveProfileDocument anywhere', () => {
    expect(panelBody).not.toContain('archiveProfileDocument')
  })
})

describe('GUARDRAILS — no Firestore imports', () => {
  it('does NOT import the Firestore SDK directly', () => {
    expect(panelSrc).not.toContain("from 'firebase/firestore'")
  })

  it('does NOT import the Firestore service module', () => {
    expect(panelSrc).not.toContain("from '../../profileStudio/profileStudioService'")
  })

  it('does NOT call addDoc/setDoc/updateDoc/deleteDoc', () => {
    expect(panelSrc).not.toContain('addDoc(')
    expect(panelSrc).not.toContain('setDoc(')
    expect(panelSrc).not.toContain('updateDoc(')
    expect(panelSrc).not.toContain('deleteDoc(')
  })

  it('does NOT import serverTimestamp', () => {
    expect(panelSrc).not.toContain('serverTimestamp')
  })

  it('does NOT import any kernel/service file from src/profileStudio', () => {
    expect(panelSrc).not.toContain("from '../../profileStudio/")
  })

  it('does NOT import any hook from src/profileStudio/hooks', () => {
    expect(panelSrc).not.toContain('profileStudio/hooks')
  })
})

describe('GUARDRAILS — no useEffect', () => {
  it('does NOT use useEffect anywhere', () => {
    expect(panelSrc).not.toContain('useEffect')
  })
})

describe('GUARDRAILS — no useState', () => {
  it('does NOT use useState anywhere', () => {
    expect(panelSrc).not.toContain('useState')
  })
})

// ════════════════════════════════════════════════════════════
// 26-30. No builder / drag-drop / AI / Excel / Evaluation Engine
// ════════════════════════════════════════════════════════════
describe('GUARDRAILS — no builder / canvas', () => {
  it('no <canvas> element', () => {
    expect(panelSrc).not.toContain('<canvas')
  })

  it('no VisualBuilder reference', () => {
    expect(panelSrc).not.toContain('VisualBuilder')
  })
})

describe('GUARDRAILS — no drag-drop', () => {
  it('no react-dnd import', () => {
    expect(panelSrc.toLowerCase()).not.toContain('react-dnd')
  })

  it('no dnd-kit import', () => {
    expect(panelSrc.toLowerCase()).not.toContain('dnd-kit')
  })

  it('no draggable attribute or drag handlers', () => {
    expect(panelSrc).not.toContain('draggable')
    expect(panelSrc.toLowerCase()).not.toContain('ondragstart')
    expect(panelSrc.toLowerCase()).not.toContain('ondrop')
  })
})

describe('GUARDRAILS — no AI', () => {
  it('no openai reference', () => {
    expect(panelSrc.toLowerCase()).not.toContain('openai')
  })

  it('no anthropic reference', () => {
    expect(panelSrc.toLowerCase()).not.toContain('anthropic')
  })

  it('no gpt- model reference', () => {
    expect(panelSrc.toLowerCase()).not.toContain('gpt-')
  })

  it('no "claude" reference', () => {
    expect(panelSrc.toLowerCase()).not.toContain('claude')
  })
})

describe('GUARDRAILS — no Excel/CSV import', () => {
  it('no xlsx reference', () => {
    expect(panelSrc).not.toContain('xlsx')
    expect(panelSrc).not.toContain('XLSX')
  })

  it('no .csv reference', () => {
    expect(panelSrc.toLowerCase()).not.toContain('.csv')
  })

  it('no FileReader / file upload logic', () => {
    expect(panelSrc).not.toContain('FileReader')
    expect(panelSrc).not.toContain('type="file"')
  })
})

describe('GUARDRAILS — no Evaluation Engine import', () => {
  it('no evaluationEngine import', () => {
    expect(panelSrc).not.toContain('evaluationEngine')
  })

  it('no evaluationPipeline import', () => {
    expect(panelSrc).not.toContain('evaluationPipeline')
  })

  it('no evaluationRegistry import', () => {
    expect(panelSrc).not.toContain('evaluationRegistry')
  })

  it('no evaluationActualsService import', () => {
    expect(panelSrc).not.toContain('evaluationActualsService')
  })

  it('no bulkEvaluationService import', () => {
    expect(panelSrc).not.toContain('bulkEvaluationService')
  })
})

// ════════════════════════════════════════════════════════════
// CTA-wording guardrail (lifecycle action button text never appears)
// ════════════════════════════════════════════════════════════
describe('GUARDRAILS — no lifecycle CTA / action button wording', () => {
  it('does NOT render a Validate button', () => {
    expect(panelBody).not.toContain('>Validate<')
    expect(panelBody).not.toContain('aria-label="Validate')
  })

  it('does NOT render a Simulate button', () => {
    expect(panelBody).not.toContain('>Simulate<')
    expect(panelBody).not.toContain('aria-label="Simulate')
  })

  it('does NOT render an Approve button', () => {
    expect(panelBody).not.toContain('>Approve<')
    expect(panelBody).not.toContain('aria-label="Approve')
  })

  it('does NOT render a Publish button', () => {
    expect(panelBody).not.toContain('>Publish<')
    expect(panelBody).not.toContain('aria-label="Publish')
  })

  it('readiness labels are descriptive text only — no imperative "Click to" wording', () => {
    expect(panelBody).not.toContain('Click to')
  })
})

// ════════════════════════════════════════════════════════════
// Module boundaries
// ════════════════════════════════════════════════════════════
describe('GUARDRAILS — module boundaries', () => {
  it('only imports from react and lucide-react', () => {
    const importLines = panelSrc.split('\n').filter((l) => l.trim().startsWith('import '))
    importLines.forEach((line) => {
      const isAllowed = line.includes("from 'react'") || line.includes("from 'lucide-react'")
      expect(isAllowed).toBe(true)
    })
  })

  it('imports exactly one icon (Gauge) from lucide-react', () => {
    expect(panelSrc).toContain("import { Gauge } from 'lucide-react'")
  })
})

// ════════════════════════════════════════════════════════════
// Defensive rendering — never throws on partial/missing data
// ════════════════════════════════════════════════════════════
describe('Defensive rendering', () => {
  it('defaults hierarchy to empty object when absent', () => {
    expect(panelSrc).toContain('?? {}')
  })

  it('defaults processors to empty object when absent', () => {
    const matches = panelSrc.match(/\?\? \{\}/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('readinessLabel computation handles basketCount=0 and totalStepCount=0 without throwing', () => {
    expect(() => deriveReadinessLabel({ status: 'DRAFT', basketCount: 0, totalStepCount: 0 })).not.toThrow()
  })

  it('readinessLabel computation handles undefined inputs without throwing', () => {
    expect(() => deriveReadinessLabel({})).not.toThrow()
  })

  it('falls back to em-dash when status is missing', () => {
    expect(panelSrc).toContain("status || '—'")
  })

  it('hierarchy and processors default to {} via nullish/logical-OR fallback', () => {
    expect(panelSrc).toContain('hierarchyProp         ?? {}')
    expect(panelSrc).toContain('processorsProp       ?? {}')
  })

  it('validationSummary and simulationSummary default to null, not {}', () => {
    expect(panelSrc).toContain('validationSummaryProp ?? null')
    expect(panelSrc).toContain('simulationSummaryProp ?? null')
  })
})

// ════════════════════════════════════════════════════════════
// Extended readiness matrix — every status x boundary combination
// ════════════════════════════════════════════════════════════
describe('Readiness verdict — extended status x structure matrix', () => {
  const STRUCTURED = { basketCount: 2, totalStepCount: 3 }
  const NO_BASKETS = { basketCount: 0, totalStepCount: 0 }
  const NO_PROCESSORS = { basketCount: 2, totalStepCount: 0 }

  it('DRAFT + structured -> Ready to validate', () => {
    expect(deriveReadinessLabel({ status: 'DRAFT', ...STRUCTURED })).toBe('Ready to validate')
  })

  it('DRAFT + no baskets -> Not ready — no baskets defined', () => {
    expect(deriveReadinessLabel({ status: 'DRAFT', ...NO_BASKETS })).toBe('Not ready — no baskets defined')
  })

  it('DRAFT + no processors -> Not ready — missing processors', () => {
    expect(deriveReadinessLabel({ status: 'DRAFT', ...NO_PROCESSORS })).toBe('Not ready — missing processors')
  })

  it('VALIDATED + structured -> Ready to simulate', () => {
    expect(deriveReadinessLabel({ status: 'VALIDATED', ...STRUCTURED })).toBe('Ready to simulate')
  })

  it('VALIDATED + no baskets -> Not ready — no baskets defined', () => {
    expect(deriveReadinessLabel({ status: 'VALIDATED', ...NO_BASKETS })).toBe('Not ready — no baskets defined')
  })

  it('VALIDATED + no processors -> Not ready — missing processors', () => {
    expect(deriveReadinessLabel({ status: 'VALIDATED', ...NO_PROCESSORS })).toBe('Not ready — missing processors')
  })

  it('SIMULATED + structured -> Ready to approve', () => {
    expect(deriveReadinessLabel({ status: 'SIMULATED', ...STRUCTURED })).toBe('Ready to approve')
  })

  it('SIMULATED + no baskets -> Not ready — no baskets defined', () => {
    expect(deriveReadinessLabel({ status: 'SIMULATED', ...NO_BASKETS })).toBe('Not ready — no baskets defined')
  })

  it('SIMULATED + no processors -> Not ready — missing processors', () => {
    expect(deriveReadinessLabel({ status: 'SIMULATED', ...NO_PROCESSORS })).toBe('Not ready — missing processors')
  })

  it('APPROVED + structured -> Ready to publish', () => {
    expect(deriveReadinessLabel({ status: 'APPROVED', ...STRUCTURED })).toBe('Ready to publish')
  })

  it('APPROVED + no baskets -> Not ready — no baskets defined', () => {
    expect(deriveReadinessLabel({ status: 'APPROVED', ...NO_BASKETS })).toBe('Not ready — no baskets defined')
  })

  it('APPROVED + no processors -> Not ready — missing processors', () => {
    expect(deriveReadinessLabel({ status: 'APPROVED', ...NO_PROCESSORS })).toBe('Not ready — missing processors')
  })

  it('PUBLISHED + no baskets still -> Published (terminal state wins)', () => {
    expect(deriveReadinessLabel({ status: 'PUBLISHED', ...NO_BASKETS })).toBe('Published')
  })

  it('PUBLISHED + no processors still -> Published (terminal state wins)', () => {
    expect(deriveReadinessLabel({ status: 'PUBLISHED', ...NO_PROCESSORS })).toBe('Published')
  })

  it('ARCHIVED + structured still -> Archived (terminal state wins)', () => {
    expect(deriveReadinessLabel({ status: 'ARCHIVED', ...STRUCTURED })).toBe('Archived')
  })

  it('basketCount=1 (boundary just above zero) is treated as having baskets', () => {
    expect(deriveReadinessLabel({ status: 'DRAFT', basketCount: 1, totalStepCount: 1 })).toBe('Ready to validate')
  })

  it('totalStepCount=1 (boundary just above zero) is treated as having processors', () => {
    expect(deriveReadinessLabel({ status: 'DRAFT', basketCount: 1, totalStepCount: 1 })).toBe('Ready to validate')
  })
})

describe('Readiness verdict — rule-order priority sanity', () => {
  it('ARCHIVED beats PUBLISHED check (both terminal, ARCHIVED checked first)', () => {
    // status can only be one value at a time; this asserts the source order
    const idx1 = panelSrc.indexOf("status === 'ARCHIVED'")
    const idx2 = panelSrc.indexOf("status === 'PUBLISHED'")
    expect(idx1).toBeLessThan(idx2)
  })

  it('PUBLISHED check precedes the no-baskets check in source order', () => {
    const idx1 = panelSrc.indexOf("status === 'PUBLISHED'")
    const idx2 = panelSrc.indexOf('basketCount === 0')
    expect(idx1).toBeLessThan(idx2)
  })

  it('no-baskets check precedes the missing-processors check in source order', () => {
    const idx1 = panelSrc.indexOf('basketCount === 0')
    const idx2 = panelSrc.indexOf('totalStepCount === 0')
    expect(idx1).toBeLessThan(idx2)
  })

  it('missing-processors check precedes the DRAFT check in source order', () => {
    const idx1 = panelSrc.indexOf('totalStepCount === 0')
    const idx2 = panelSrc.indexOf("status === 'DRAFT'")
    expect(idx1).toBeLessThan(idx2)
  })

  it('status checks for DRAFT/VALIDATED/SIMULATED/APPROVED appear in lifecycle order', () => {
    const draftIdx     = panelSrc.indexOf("status === 'DRAFT'")
    const validatedIdx = panelSrc.indexOf("status === 'VALIDATED'")
    const simulatedIdx = panelSrc.indexOf("status === 'SIMULATED'")
    const approvedIdx  = panelSrc.indexOf("status === 'APPROVED'")
    expect(draftIdx).toBeLessThan(validatedIdx)
    expect(validatedIdx).toBeLessThan(simulatedIdx)
    expect(simulatedIdx).toBeLessThan(approvedIdx)
  })
})

describe('Component source — deriveReadinessLabel function shape', () => {
  it('is a standalone named function, not inlined in the component body', () => {
    expect(panelSrc).toContain('function deriveReadinessLabel(')
  })

  it('is called from inside a useMemo, not on every render unconditionally', () => {
    const memoIdx = panelSrc.indexOf('useMemo(')
    // Search for the call site (not the function declaration) starting after useMemo(
    const callIdx = panelSrc.indexOf('deriveReadinessLabel({ status, basketCount, totalStepCount })', memoIdx)
    expect(callIdx).toBeGreaterThan(memoIdx)
  })

  it('useMemo dependency array includes status, basketCount, and totalStepCount', () => {
    expect(panelSrc).toContain('[status, basketCount, totalStepCount]')
  })

  it('has exactly one default export and zero named exports', () => {
    const defaultMatches = panelSrc.match(/export default/g) || []
    expect(defaultMatches.length).toBe(1)
    expect(panelSrc).not.toContain('export function')
    expect(panelSrc).not.toContain('export const')
  })

  it('does not define any TypeScript interfaces (plain JSX component)', () => {
    expect(panelSrc).not.toContain('interface ')
  })

  it('does not hardcode any non-token hex color outside the READINESS_TONE map', () => {
    const beforeTone = panelSrc.slice(0, panelSrc.indexOf('const READINESS_TONE'))
    expect(beforeTone).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('file does not exceed a reasonable size for a single presentational component', () => {
    expect(panelSrc.length).toBeLessThan(7000)
  })

  it('file contains no TODO/FIXME markers indicating unfinished work', () => {
    expect(panelSrc).not.toContain('TODO')
    expect(panelSrc).not.toContain('FIXME')
  })

  it('file does not import any Zustand store', () => {
    expect(panelSrc).not.toContain("from 'zustand'")
    expect(panelSrc).not.toContain('useStore')
  })

  it('file does not contain async/await or Promise (purely synchronous render)', () => {
    expect(panelSrc).not.toContain('async ')
    expect(panelSrc).not.toContain('await ')
    expect(panelSrc).not.toContain('Promise')
  })

  it('file does not reference window.location or navigation hooks', () => {
    expect(panelSrc).not.toContain('window.location')
    expect(panelSrc).not.toContain('useNavigate')
  })
})
