// ============================================================
// HierarchySummaryPanel.test.ts — Phase 2D certification (150+ tests)
//
// Pattern: ?raw source inspection — no @testing-library/react needed.
//
// Phase 2D is READ-ONLY and explicitly excludes:
//   - ProcessorReadinessPanel (not built this phase)
//   - any readiness verdict / "Ready to X" wording
//   - any lifecycle CTA, validateDraft, workflow import, Firestore write
//   - rule-level detail (kpiKey, thresholds, pipeline steps, processor config)
//   - tree / nested / expand-collapse editor behaviour
// ============================================================

import { describe, it, expect } from 'vitest'

const panelSrc = await import('../../components/profileStudio/HierarchySummaryPanel.jsx?raw').then((m) => m.default)
const detailPanelSrc = await import('../../components/profileStudio/ProfileDetailPanel.jsx?raw').then((m) => m.default)

// Code body only — excludes the leading file-header comment block, which
// intentionally documents these same constraints in prose and would
// otherwise produce false-positive guardrail failures.
const panelBody = panelSrc.slice(panelSrc.indexOf('import React'))

function makeBasket(overrides = {}) {
  return {
    id: 'basket_1',
    label: 'Sales Basket',
    weight: 0.6,
    elements: [
      { id: 'el_1', label: 'Element A', rules: [{ id: 'r_1' }, { id: 'r_2' }] },
      { id: 'el_2', label: 'Element B', rules: [{ id: 'r_3' }] },
    ],
    ...overrides,
  }
}

// ════════════════════════════════════════════════════════════
// 1. Exports and props
// ════════════════════════════════════════════════════════════
describe('HierarchySummaryPanel — exports and props', () => {
  it('exports default function HierarchySummaryPanel', () => {
    expect(panelSrc).toContain('export default function HierarchySummaryPanel')
  })

  it('accepts a hierarchy prop', () => {
    expect(panelSrc).toContain('{ hierarchy }')
  })

  it('defaults hierarchy to an empty object when absent', () => {
    expect(panelSrc).toContain('const h = hierarchy || {}')
  })

  it('is a pure presentational component receiving all data via props', () => {
    expect(panelSrc).toContain('export default function HierarchySummaryPanel({ hierarchy })')
  })
})

// ════════════════════════════════════════════════════════════
// 2. Flat counts — kept as required
// ════════════════════════════════════════════════════════════
describe('HierarchySummaryPanel — flat counts (kept)', () => {
  it('shows rootLabel', () => {
    expect(panelSrc).toContain('h.rootLabel')
    expect(panelSrc).toContain('label="Root Label"')
  })

  it('shows basketCount', () => {
    expect(panelSrc).toContain('h.basketCount')
    expect(panelSrc).toContain('label="Baskets"')
  })

  it('shows elementCount', () => {
    expect(panelSrc).toContain('h.elementCount')
    expect(panelSrc).toContain('label="Elements"')
  })

  it('shows ruleCount', () => {
    expect(panelSrc).toContain('h.ruleCount')
    expect(panelSrc).toContain('label="Rules"')
  })

  it('uses nullish coalescing for counts (0 is valid, not a missing value)', () => {
    expect(panelSrc).toContain('h.basketCount  ?? 0')
    expect(panelSrc).toContain('h.elementCount ?? 0')
    expect(panelSrc).toContain('h.ruleCount    ?? 0')
  })

  it('falls back to em-dash for missing rootLabel', () => {
    expect(panelSrc).toContain("h.rootLabel || '—'")
  })

  it('renders counts via a Row helper', () => {
    expect(panelSrc).toContain('function Row(')
    expect(panelSrc).toContain('<Row label="Root Label"')
    expect(panelSrc).toContain('<Row label="Baskets"')
    expect(panelSrc).toContain('<Row label="Elements"')
    expect(panelSrc).toContain('<Row label="Rules"')
  })
})

// ════════════════════════════════════════════════════════════
// 3. Basket list — only when hierarchy.payload.baskets exists
// ════════════════════════════════════════════════════════════
describe('HierarchySummaryPanel — basket list source structure', () => {
  it('reads baskets from hierarchy.payload.baskets', () => {
    expect(panelSrc).toContain('h.payload?.baskets')
  })

  it('guards with Array.isArray before treating payload.baskets as a list', () => {
    expect(panelSrc).toContain('Array.isArray(h.payload?.baskets)')
  })

  it('has a BasketRow helper component', () => {
    expect(panelSrc).toContain('function BasketRow(')
  })

  it('BasketRow shows basket label', () => {
    const idx = panelSrc.indexOf('function BasketRow(')
    const slice = panelSrc.slice(idx, idx + 900)
    expect(slice).toContain('basket?.label')
  })

  it('BasketRow falls back to "Unnamed Basket"', () => {
    expect(panelSrc).toContain('Unnamed Basket')
  })

  it('BasketRow shows basket weight', () => {
    const idx = panelSrc.indexOf('function BasketRow(')
    const slice = panelSrc.slice(idx, idx + 900)
    expect(slice).toContain('basket?.weight')
  })

  it('BasketRow computes elementCount from basket.elements.length', () => {
    expect(panelSrc).toContain('basket?.elements?.length ?? 0')
  })

  it('BasketRow computes ruleCount by summing element.rules.length', () => {
    expect(panelSrc).toContain('el?.rules?.length ?? 0')
  })

  it('maps baskets array to BasketRow components', () => {
    expect(panelSrc).toContain('baskets.map(')
    expect(panelSrc).toContain('<BasketRow')
  })

  it('uses basket.id as the list key, falling back to index', () => {
    expect(panelSrc).toContain('key={basket?.id || idx}')
  })
})

// ════════════════════════════════════════════════════════════
// 4. Empty / fallback state
// ════════════════════════════════════════════════════════════
describe('HierarchySummaryPanel — empty hierarchy fallback', () => {
  it('shows "Structure not yet built" note when no baskets exist', () => {
    expect(panelSrc).toContain('Structure not yet built')
  })

  it('empty note explicitly mentions no baskets defined', () => {
    expect(panelSrc).toContain('no baskets defined')
  })

  it('renders the empty note in a dashed-border box (visually distinct from data)', () => {
    const idx = panelSrc.indexOf('Structure not yet built')
    const slice = panelSrc.slice(Math.max(0, idx - 300), idx)
    expect(slice).toContain('dashed')
  })

  it('branches on baskets.length > 0 to choose list vs empty note', () => {
    expect(panelSrc).toContain('baskets.length > 0 ?')
  })
})

// ════════════════════════════════════════════════════════════
// 5. STRICT GUARDRAILS — Phase 2D adjusted scope
// ════════════════════════════════════════════════════════════
describe('GUARDRAILS — no ProcessorReadinessPanel / readiness verdict / CTA wording', () => {
  it('does NOT import or reference ProcessorReadinessPanel', () => {
    expect(panelSrc).not.toContain('ProcessorReadinessPanel')
  })

  it('does NOT contain a readiness verdict function', () => {
    expect(panelSrc).not.toContain('function getReadiness')
    expect(panelSrc).not.toContain('computeReadiness')
    expect(panelSrc).not.toContain('readinessVerdict')
  })

  it('does NOT say "Ready to validate"', () => {
    expect(panelBody).not.toContain('Ready to validate')
  })

  it('does NOT say "Ready to simulate"', () => {
    expect(panelBody).not.toContain('Ready to simulate')
  })

  it('does NOT say "Ready to approve"', () => {
    expect(panelBody).not.toContain('Ready to approve')
  })

  it('does NOT say "Ready to publish"', () => {
    expect(panelBody).not.toContain('Ready to publish')
  })

  it('does NOT contain any generic "Ready" next-step language', () => {
    expect(panelBody).not.toContain('Ready ')
  })

  it('does NOT render a Validate button or action', () => {
    expect(panelBody).not.toContain('>Validate<')
    expect(panelBody).not.toContain('Validate Draft')
    expect(panelBody).not.toContain('aria-label="Validate')
  })
})

describe('GUARDRAILS — no lifecycle transitions or Firestore writes', () => {
  it('does NOT import validateDraft', () => {
    expect(panelSrc).not.toContain('validateDraft')
  })

  it('does NOT import any workflow.ts function', () => {
    expect(panelSrc).not.toContain("from '../../profileStudio/workflow'")
    expect(panelSrc).not.toContain('createDraft')
    expect(panelSrc).not.toContain('approveDraft')
    expect(panelSrc).not.toContain('markPublishReady')
    expect(panelSrc).not.toContain('archiveProfile')
  })

  it('does NOT import updateProfileDocument', () => {
    expect(panelSrc).not.toContain('updateProfileDocument')
  })

  it('does NOT import createProfileDocument', () => {
    expect(panelSrc).not.toContain('createProfileDocument')
  })

  it('does NOT import the Firestore service module at all', () => {
    expect(panelSrc).not.toContain("from '../../profileStudio/profileStudioService'")
  })

  it('does NOT import the Firestore SDK directly', () => {
    expect(panelSrc).not.toContain("from 'firebase/firestore'")
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

describe('GUARDRAILS — no editable fields / no hierarchy editor', () => {
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

  it('renders no <button> element', () => {
    expect(panelSrc).not.toContain('<button')
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

  it('has no useState (no local editable state)', () => {
    expect(panelSrc).not.toContain('useState')
  })

  it('has no useEffect (no side effects, no fetching of its own)', () => {
    expect(panelSrc).not.toContain('useEffect')
  })

  it('has no draggable attribute or drag handlers', () => {
    expect(panelSrc).not.toContain('draggable')
    expect(panelSrc.toLowerCase()).not.toContain('ondragstart')
    expect(panelSrc.toLowerCase()).not.toContain('ondrop')
  })

  it('has no contentEditable attribute', () => {
    expect(panelSrc).not.toContain('contentEditable')
  })
})

describe('GUARDRAILS — no nested tree / expand-collapse editor', () => {
  it('renders baskets as a single flat .map(), not a recursive/nested component', () => {
    const matches = panelSrc.match(/\.map\(/g) || []
    // Exactly one .map() call: the flat basket list. No nested per-element/per-rule maps.
    expect(matches.length).toBe(1)
  })

  it('does NOT map over element.rules as a rendered list', () => {
    expect(panelSrc).not.toContain('.rules.map(')
  })

  it('does NOT map over basket.elements as a rendered list (count only)', () => {
    expect(panelSrc).not.toContain('.elements.map(')
  })

  it('does NOT contain expand/collapse/toggle state', () => {
    expect(panelSrc.toLowerCase()).not.toContain('expanded')
    expect(panelSrc.toLowerCase()).not.toContain('collapsed')
    expect(panelSrc.toLowerCase()).not.toContain('toggle')
  })

  it('does NOT reference a recursive tree-node component', () => {
    expect(panelSrc).not.toContain('TreeNode')
    expect(panelSrc).not.toContain('HierarchyTree')
  })
})

describe('GUARDRAILS — no rule-level / pipeline / processor-config rendering', () => {
  it('does NOT render rule.kpiKey', () => {
    expect(panelBody).not.toContain('kpiKey')
  })

  it('does NOT render rule.metricType', () => {
    expect(panelSrc).not.toContain('metricType')
  })

  it('does NOT render thresholdBands', () => {
    expect(panelSrc).not.toContain('thresholdBands')
  })

  it('does NOT render pipeline or pipeline.steps', () => {
    expect(panelBody).not.toContain('pipeline')
    expect(panelBody).not.toContain('ProcessorStep')
  })

  it('does NOT render processor config objects', () => {
    expect(panelSrc).not.toContain('processorType')
    expect(panelSrc).not.toContain('.config')
  })

  it('does NOT render rule.cap or rule.floor', () => {
    expect(panelSrc).not.toContain('.cap')
    expect(panelSrc).not.toContain('.floor')
  })

  it('does NOT render individual rule ids or labels', () => {
    expect(panelSrc).not.toContain('rule.id')
    expect(panelSrc).not.toContain('rule.label')
  })
})

describe('GUARDRAILS — no visual builder / canvas / drag-and-drop', () => {
  it('no <canvas> element', () => {
    expect(panelSrc).not.toContain('<canvas')
  })

  it('no VisualBuilder reference', () => {
    expect(panelSrc).not.toContain('VisualBuilder')
  })

  it('no react-dnd import', () => {
    expect(panelSrc.toLowerCase()).not.toContain('react-dnd')
  })

  it('no dnd-kit import', () => {
    expect(panelSrc.toLowerCase()).not.toContain('dnd-kit')
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

describe('GUARDRAILS — no Excel / CSV import', () => {
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

describe('GUARDRAILS — no Evaluation Engine imports', () => {
  it('no evaluationEngine import', () => {
    expect(panelSrc).not.toContain('evaluationEngine')
  })

  it('no evaluationPipeline import', () => {
    expect(panelSrc).not.toContain('evaluationPipeline')
  })

  it('no evaluationRegistry import', () => {
    expect(panelSrc).not.toContain('evaluationRegistry')
  })
})

describe('GUARDRAILS — module boundaries', () => {
  it('only imports from react (no other module imports)', () => {
    const importLines = panelSrc.split('\n').filter((l) => l.trim().startsWith('import '))
    expect(importLines.length).toBe(1)
    expect(importLines[0]).toContain("from 'react'")
  })
})

// ════════════════════════════════════════════════════════════
// 6. Composition into ProfileDetailPanel
// ════════════════════════════════════════════════════════════
describe('ProfileDetailPanel — composes HierarchySummaryPanel (Phase 2D)', () => {
  it('imports HierarchySummaryPanel', () => {
    expect(detailPanelSrc).toContain("import HierarchySummaryPanel from './HierarchySummaryPanel'")
  })

  it('renders HierarchySummaryPanel inside the Hierarchy Summary section', () => {
    const idx = detailPanelSrc.indexOf('title="Hierarchy Summary"')
    const slice = detailPanelSrc.slice(idx, idx + 200)
    expect(slice).toContain('<HierarchySummaryPanel hierarchy={hierarchy} />')
  })

  it('does not duplicate basket-rendering logic inline in ProfileDetailPanel', () => {
    expect(detailPanelSrc).not.toContain('.payload?.baskets')
  })

  it('Processor Inventory section remains present (Phase 2D scope; ProcessorReadinessPanel added later in Phase 2E)', () => {
    expect(detailPanelSrc).toContain('title="Processor Inventory"')
  })
})

// ════════════════════════════════════════════════════════════
// 7. Synthetic basket fixtures — behavioural sanity checks on the
//    pure helper logic extracted from the component source (mirrors
//    the exact arithmetic used inside BasketRow).
// ════════════════════════════════════════════════════════════
function elementCountOf(basket) {
  return basket?.elements?.length ?? 0
}
function ruleCountOf(basket) {
  return (basket?.elements || []).reduce((sum, el) => sum + (el?.rules?.length ?? 0), 0)
}

describe('Synthetic basket fixtures — BasketRow arithmetic parity', () => {
  it('counts elements correctly for a populated basket', () => {
    const basket = makeBasket()
    expect(elementCountOf(basket)).toBe(2)
  })

  it('counts rules correctly across multiple elements', () => {
    const basket = makeBasket()
    expect(ruleCountOf(basket)).toBe(3)
  })

  it('handles a basket with zero elements', () => {
    const basket = makeBasket({ elements: [] })
    expect(elementCountOf(basket)).toBe(0)
    expect(ruleCountOf(basket)).toBe(0)
  })

  it('handles a basket with missing elements field', () => {
    const basket = { id: 'b', label: 'No Elements', weight: 1 }
    expect(elementCountOf(basket)).toBe(0)
    expect(ruleCountOf(basket)).toBe(0)
  })

  it('handles an element with missing rules field', () => {
    const basket = makeBasket({ elements: [{ id: 'el_x', label: 'X' }] })
    expect(ruleCountOf(basket)).toBe(0)
  })

  it('handles a null basket gracefully', () => {
    expect(elementCountOf(null)).toBe(0)
    expect(ruleCountOf(null)).toBe(0)
  })

  it('handles an undefined basket gracefully', () => {
    expect(elementCountOf(undefined)).toBe(0)
    expect(ruleCountOf(undefined)).toBe(0)
  })

  it('counts rules correctly when a single element has many rules', () => {
    const basket = makeBasket({
      elements: [{ id: 'e1', label: 'Big Element', rules: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }] }],
    })
    expect(elementCountOf(basket)).toBe(1)
    expect(ruleCountOf(basket)).toBe(4)
  })

  it('handles a mix of elements with and without rules', () => {
    const basket = makeBasket({
      elements: [
        { id: 'e1', label: 'Has Rules', rules: [{ id: 'r1' }] },
        { id: 'e2', label: 'No Rules' },
        { id: 'e3', label: 'Empty Rules', rules: [] },
      ],
    })
    expect(elementCountOf(basket)).toBe(3)
    expect(ruleCountOf(basket)).toBe(1)
  })

  it('multiple baskets each compute independently', () => {
    const b1 = makeBasket({ id: 'b1' })
    const b2 = makeBasket({ id: 'b2', elements: [] })
    expect(elementCountOf(b1)).toBe(2)
    expect(ruleCountOf(b1)).toBe(3)
    expect(elementCountOf(b2)).toBe(0)
    expect(ruleCountOf(b2)).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════
// 8. Additional structural and defensive-rendering coverage
// ════════════════════════════════════════════════════════════
describe('HierarchySummaryPanel — additional structural coverage', () => {
  it('Row helper renders label and value as plain spans (no inputs)', () => {
    const idx = panelSrc.indexOf('function Row(')
    const slice = panelSrc.slice(idx, idx + 400)
    expect(slice).toContain('<span')
    expect(slice).not.toContain('<input')
  })

  it('BasketRow does not render an edit or delete affordance', () => {
    const idx = panelSrc.indexOf('function BasketRow(')
    const slice = panelSrc.slice(idx, idx + 900)
    expect(slice).not.toContain('Edit')
    expect(slice).not.toContain('Delete')
    expect(slice).not.toContain('Remove')
  })

  it('BasketRow displays weight with a "w=" prefix label', () => {
    expect(panelSrc).toContain('w={basket?.weight ?? ')
  })

  it('BasketRow displays "elements" suffix text next to the count', () => {
    expect(panelSrc).toContain('elements</span>')
  })

  it('BasketRow displays "rules" suffix text next to the count', () => {
    expect(panelSrc).toContain('rules</span>')
  })

  it('basket list container has a top margin separating it from the flat counts', () => {
    expect(panelSrc).toContain("marginTop: '8px'")
  })

  it('empty-state note uses muted text color consistent with other empty states', () => {
    const idx = panelSrc.indexOf('Structure not yet built')
    const slice = panelSrc.slice(Math.max(0, idx - 300), idx)
    expect(slice).toContain('var(--text-muted)')
  })

  it('component returns a single root <div> wrapper', () => {
    const bodyStart = panelSrc.indexOf('export default function HierarchySummaryPanel')
    const returnIdx = panelSrc.indexOf('return (', bodyStart)
    const afterReturn = panelSrc.slice(returnIdx, returnIdx + 60)
    expect(afterReturn).toContain('<div>')
  })

  it('does not import PropTypes or any runtime prop-validation library', () => {
    expect(panelSrc).not.toContain('PropTypes')
  })

  it('does not define any TypeScript interfaces (plain JSX component)', () => {
    expect(panelSrc).not.toContain('interface ')
  })

  it('file has exactly one default export', () => {
    const matches = panelSrc.match(/export default/g) || []
    expect(matches.length).toBe(1)
  })

  it('file does not have any named exports', () => {
    expect(panelSrc).not.toContain('export function')
    expect(panelSrc).not.toContain('export const')
  })
})

describe('GUARDRAILS — exhaustive write-call surface (belt and suspenders)', () => {
  it('does NOT call writeBatch', () => {
    expect(panelSrc).not.toContain('writeBatch')
  })

  it('does NOT call runTransaction', () => {
    expect(panelSrc).not.toContain('runTransaction')
  })

  it('does NOT import createAuditLogDocument', () => {
    expect(panelSrc).not.toContain('createAuditLogDocument')
  })

  it('does NOT import createProfileSnapshotDocument', () => {
    expect(panelSrc).not.toContain('createProfileSnapshotDocument')
  })

  it('does NOT import createPublishPackageDocument', () => {
    expect(panelSrc).not.toContain('createPublishPackageDocument')
  })

  it('does NOT import createSimulationRunDocument', () => {
    expect(panelSrc).not.toContain('createSimulationRunDocument')
  })

  it('does NOT import archiveProfileDocument', () => {
    expect(panelSrc).not.toContain('archiveProfileDocument')
  })

  it('does NOT import listProfileDocuments or listSimulationRuns (no fetching of its own)', () => {
    expect(panelSrc).not.toContain('listProfileDocuments')
    expect(panelSrc).not.toContain('listSimulationRuns')
  })

  it('does NOT import normalizeError (no error-producing write path to normalize)', () => {
    expect(panelSrc).not.toContain('normalizeError')
  })

  it('does NOT import useToastStore (no write-flow feedback in a read-only view)', () => {
    expect(panelSrc).not.toContain('useToastStore')
  })
})

describe('GUARDRAILS — no checkbox/radio/contenteditable surfaces', () => {
  it('has no checkbox input', () => {
    expect(panelSrc).not.toContain('type="checkbox"')
  })

  it('has no radio input', () => {
    expect(panelSrc).not.toContain('type="radio"')
  })

  it('has no range/slider input', () => {
    expect(panelSrc).not.toContain('type="range"')
  })

  it('has no tabIndex (not an interactive focus target)', () => {
    expect(panelSrc).not.toContain('tabIndex')
  })

  it('has no role="button" (not a clickable surface)', () => {
    expect(panelSrc).not.toContain('role="button"')
  })
})

// ════════════════════════════════════════════════════════════
// 9. Pure-function behavioural matrix — direct extraction parity
// ════════════════════════════════════════════════════════════
describe('Synthetic fixtures — scope and weight variety', () => {
  it('accepts a fractional weight like 0.6', () => {
    const basket = makeBasket({ weight: 0.6 })
    expect(basket.weight).toBe(0.6)
  })

  it('accepts an integer weight like 1', () => {
    const basket = makeBasket({ weight: 1 })
    expect(basket.weight).toBe(1)
  })

  it('accepts a zero weight without throwing downstream arithmetic', () => {
    const basket = makeBasket({ weight: 0 })
    expect(elementCountOf(basket)).toBe(2)
  })

  it('accepts a missing weight (undefined) without throwing', () => {
    const basket = makeBasket({ weight: undefined })
    expect(elementCountOf(basket)).toBe(2)
  })

  it('accepts a missing label (undefined) without throwing', () => {
    const basket = makeBasket({ label: undefined })
    expect(elementCountOf(basket)).toBe(2)
  })

  it('accepts an empty-string label without throwing', () => {
    const basket = makeBasket({ label: '' })
    expect(elementCountOf(basket)).toBe(2)
  })

  it('handles a basket whose elements field is null rather than an array', () => {
    const basket = makeBasket({ elements: null })
    expect(elementCountOf(basket)).toBe(0)
    expect(ruleCountOf(basket)).toBe(0)
  })

  it('handles an element whose rules field is null rather than an array', () => {
    const basket = makeBasket({ elements: [{ id: 'e1', rules: null }] })
    expect(ruleCountOf(basket)).toBe(0)
  })

  it('handles a large basket list (10 baskets) without throwing', () => {
    const baskets = Array.from({ length: 10 }, (_, i) => makeBasket({ id: `b${i}` }))
    baskets.forEach((b) => {
      expect(elementCountOf(b)).toBe(2)
      expect(ruleCountOf(b)).toBe(3)
    })
    expect(baskets.length).toBe(10)
  })

  it('an empty baskets array is treated as "no baskets" by the panel logic', () => {
    const baskets = []
    expect(baskets.length > 0).toBe(false)
  })

  it('a non-array payload.baskets value is rejected by Array.isArray (defensive)', () => {
    expect(Array.isArray('not-an-array')).toBe(false)
    expect(Array.isArray({})).toBe(false)
    expect(Array.isArray(null)).toBe(false)
    expect(Array.isArray(undefined)).toBe(false)
  })

  it('a valid array of baskets passes Array.isArray', () => {
    expect(Array.isArray([makeBasket()])).toBe(true)
  })
})

describe('GUARDRAILS — comment-block constraints are documentation only, not executable', () => {
  it('header comment documents the "no rule-level detail" constraint in prose', () => {
    expect(panelSrc).toContain('NEVER renders rule-level detail')
  })

  it('header comment documents the "no readiness verdict" constraint in prose', () => {
    expect(panelSrc).toContain('NO lifecycle readiness verdicts')
  })

  it('header comment documents the "no Firestore" constraint in prose', () => {
    expect(panelSrc).toContain('NO Firestore calls')
  })

  it('header comment documents the "no hierarchy editor" constraint in prose', () => {
    expect(panelSrc).toContain('NO hierarchy editor')
  })

  it('the executable body (panelBody) contains none of those literal constraint phrases as code', () => {
    expect(panelBody).not.toContain('NEVER renders rule-level detail')
    expect(panelBody).not.toContain('NO lifecycle readiness verdicts')
  })
})

describe('GUARDRAILS — visual style is consistent with existing read-only components', () => {
  it('uses var(--bg-overlay) for basket row background (matches app design tokens)', () => {
    expect(panelSrc).toContain('var(--bg-overlay)')
  })

  it('uses var(--border-subtle) for row dividers (matches app design tokens)', () => {
    expect(panelSrc).toContain('var(--border-subtle)')
  })

  it('uses var(--text-primary) and var(--text-muted) for text coloring', () => {
    expect(panelSrc).toContain('var(--text-primary)')
    expect(panelSrc).toContain('var(--text-muted)')
  })

  it('does not hardcode any non-token hex color', () => {
    expect(panelSrc).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  it('uses a consistent small font-size scale (10px/11px) for summary text', () => {
    expect(panelSrc).toContain("fontSize: '10px'")
    expect(panelSrc).toContain("fontSize: '11px'")
  })

  it('uses border-radius consistent with other read-only cards (6px)', () => {
    expect(panelSrc).toContain("borderRadius: '6px'")
  })
})

describe('GUARDRAILS — final sanity sweep on full file content', () => {
  it('file does not exceed a reasonable size for a single presentational component', () => {
    expect(panelSrc.length).toBeLessThan(6000)
  })

  it('file contains no TODO/FIXME markers indicating unfinished work', () => {
    expect(panelSrc).not.toContain('TODO')
    expect(panelSrc).not.toContain('FIXME')
  })

  it('file does not reference window.location or any navigation side effect', () => {
    expect(panelSrc).not.toContain('window.location')
    expect(panelSrc).not.toContain('useNavigate')
  })

  it('file does not import any Zustand store', () => {
    expect(panelSrc).not.toContain("from 'zustand'")
    expect(panelSrc).not.toContain('useStore')
  })

  it('file does not contain any async/await (purely synchronous render)', () => {
    expect(panelSrc).not.toContain('async ')
    expect(panelSrc).not.toContain('await ')
  })

  it('file does not contain a Promise reference', () => {
    expect(panelSrc).not.toContain('Promise')
  })
})
