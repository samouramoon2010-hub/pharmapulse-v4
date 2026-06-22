// ============================================================
// ProfileDetailPanel.test.ts — Phase 2C certification (150+ tests)
//
// Pattern: ?raw source inspection — no @testing-library/react needed.
//
// Phase 2C is READ-ONLY. Guardrail tests in section 5 are the most
// important part of this file: they assert the panel never imports
// or calls any writable Firestore operation, never renders an edit
// surface, and never references out-of-scope features.
// ============================================================

import { describe, it, expect } from 'vitest'

const panelSrc = await import('../../components/profileStudio/ProfileDetailPanel.jsx?raw').then((m) => m.default)
const pageSrc  = await import('./ProfileStudioPage.jsx?raw').then((m) => m.default)
const cardSrc  = await import('../../components/profileStudio/ProfileCard.jsx?raw').then((m) => m.default)

// Code body only — excludes the leading file-header comment block, which
// intentionally documents these same constraints in prose (e.g. "NO Validate
// action") and would otherwise produce false-positive guardrail failures.
const panelBody = panelSrc.slice(panelSrc.indexOf('import React'))

// ════════════════════════════════════════════════════════════
// 1. ProfileDetailPanel — exports, props, state handling
// ════════════════════════════════════════════════════════════
describe('ProfileDetailPanel — exports and props', () => {
  it('exports default function ProfileDetailPanel', () => {
    expect(panelSrc).toContain('export default function ProfileDetailPanel')
  })

  it('accepts profile prop', () => {
    expect(panelSrc).toContain('profile')
  })

  it('accepts loading prop', () => {
    expect(panelSrc).toContain('loading')
  })

  it('accepts error prop', () => {
    expect(panelSrc).toContain('error')
  })

  it('returns SkeletonWidget when loading', () => {
    expect(panelSrc).toContain('if (loading) return <SkeletonWidget')
  })

  it('imports SkeletonWidget from SkeletonCard', () => {
    expect(panelSrc).toContain("import { SkeletonWidget } from '../ui/SkeletonCard'")
  })

  it('returns ErrorState when error is set', () => {
    expect(panelSrc).toContain('<ErrorState')
  })

  it('imports ErrorState from EmptyState', () => {
    expect(panelSrc).toContain('ErrorState')
    expect(panelSrc).toContain("from '../ui/EmptyState'")
  })

  it('shows EmptyState with "No profile selected" when profile is null', () => {
    expect(panelSrc).toContain('No profile selected')
  })

  it('imports EmptyState as default', () => {
    expect(panelSrc).toContain('import EmptyState')
  })

  it('imports ProfileStatusBadge for reuse', () => {
    expect(panelSrc).toContain("import ProfileStatusBadge from './ProfileStatusBadge'")
  })

  it('renders ProfileStatusBadge with profile.status', () => {
    expect(panelSrc).toContain('status={profile.status}')
  })

  it('has an early-return guard chain: loading -> error -> empty -> content', () => {
    const loadingIdx = panelSrc.indexOf('if (loading)')
    const errorIdx   = panelSrc.indexOf('if (error)')
    const emptyIdx   = panelSrc.indexOf('if (!profile)')
    expect(loadingIdx).toBeGreaterThanOrEqual(0)
    expect(errorIdx).toBeGreaterThan(loadingIdx)
    expect(emptyIdx).toBeGreaterThan(errorIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 2. Field allowlist — identity, metadata, lifecycle
// ════════════════════════════════════════════════════════════
describe('ProfileDetailPanel — identity & metadata fields', () => {
  it('shows profile.name', () => {
    expect(panelSrc).toContain('profile.name')
  })

  it('shows profile.version', () => {
    expect(panelSrc).toContain('profile.version')
  })

  it('shows profile.scope via SCOPE_LABEL lookup', () => {
    expect(panelSrc).toContain('SCOPE_LABEL')
    expect(panelSrc).toContain('profile.scope')
  })

  it('shows profile.id as Profile ID', () => {
    expect(panelSrc).toContain('label="Profile ID"')
    expect(panelSrc).toContain('profile.id')
  })

  it('shows profile.metadata.description', () => {
    expect(panelSrc).toContain('profile.metadata?.description')
  })

  it('shows profile.metadata.validFrom formatted via fmtDate', () => {
    expect(panelSrc).toContain('fmtDate(profile.metadata?.validFrom)')
  })

  it('shows profile.hash', () => {
    expect(panelSrc).toContain('profile.hash')
  })

  it('SCOPE_LABEL maps PHARMACY to Branch', () => {
    expect(panelSrc).toContain("PHARMACY: 'Branch'")
  })

  it('SCOPE_LABEL maps DISTRICT to District', () => {
    expect(panelSrc).toContain("DISTRICT: 'District'")
  })

  it('SCOPE_LABEL maps REGION to Region', () => {
    expect(panelSrc).toContain("REGION:   'Region'")
  })

  it('SCOPE_LABEL maps NATIONAL to National', () => {
    expect(panelSrc).toContain("NATIONAL: 'National'")
  })
})

describe('ProfileDetailPanel — hierarchy summary (delegates to HierarchySummaryPanel)', () => {
  it('composes HierarchySummaryPanel instead of inline rows (Phase 2D)', () => {
    expect(panelSrc).toContain("import HierarchySummaryPanel from './HierarchySummaryPanel'")
    expect(panelSrc).toContain('<HierarchySummaryPanel hierarchy={hierarchy} />')
  })

  it('no longer renders hierarchy.basketCount inline (moved to child component)', () => {
    expect(panelSrc).not.toContain('hierarchy.basketCount')
  })

  it('no longer renders hierarchy.elementCount inline (moved to child component)', () => {
    expect(panelSrc).not.toContain('hierarchy.elementCount')
  })

  it('no longer renders hierarchy.ruleCount inline (moved to child component)', () => {
    expect(panelSrc).not.toContain('hierarchy.ruleCount')
  })

  it('labels the section "Hierarchy Summary"', () => {
    expect(panelSrc).toContain('title="Hierarchy Summary"')
  })

  it('does NOT iterate hierarchy.payload.baskets as a list', () => {
    expect(panelSrc).not.toContain('.baskets.map(')
  })

  it('does NOT iterate elements as a list', () => {
    expect(panelSrc).not.toContain('.elements.map(')
  })

  it('does NOT iterate rules as a list', () => {
    expect(panelSrc).not.toContain('.rules.map(')
  })

  it('does NOT reference hierarchy.payload at all (counts only, no tree)', () => {
    expect(panelSrc).not.toContain('hierarchy.payload')
  })

  it('does NOT reference root.baskets', () => {
    expect(panelSrc).not.toContain('root.baskets')
  })
})

describe('ProfileDetailPanel — processor inventory summary', () => {
  it('shows processors.processorTypes joined as text', () => {
    expect(panelSrc).toContain('processors.processorTypes')
  })

  it('shows processors.totalStepCount', () => {
    expect(panelSrc).toContain('processors.totalStepCount')
  })

  it('shows processors.hasZeroTargetGuard as Yes/No', () => {
    expect(panelSrc).toContain('processors.hasZeroTargetGuard')
  })

  it('shows processors.hasBandEvaluator as Yes/No', () => {
    expect(panelSrc).toContain('processors.hasBandEvaluator')
  })

  it('shows processors.hasPenaltyEvaluator as Yes/No', () => {
    expect(panelSrc).toContain('processors.hasPenaltyEvaluator')
  })

  it('shows processors.hasNodeAggregator as Yes/No', () => {
    expect(panelSrc).toContain('processors.hasNodeAggregator')
  })

  it('labels the section "Processor Inventory"', () => {
    expect(panelSrc).toContain('title="Processor Inventory"')
  })

  it('does not render individual pipeline steps', () => {
    expect(panelSrc).not.toContain('ProcessorStep')
    expect(panelSrc).not.toContain('.steps.map(')
  })
})

describe('ProfileDetailPanel — validation summary block', () => {
  it('reads profile.validationSummary', () => {
    expect(panelSrc).toContain('profile.validationSummary')
  })

  it('shows validationSummary.valid', () => {
    expect(panelSrc).toContain('validationSummary.valid')
  })

  it('shows validationSummary.issueCount', () => {
    expect(panelSrc).toContain('validationSummary.issueCount')
  })

  it('shows validationSummary.errorCount', () => {
    expect(panelSrc).toContain('validationSummary.errorCount')
  })

  it('shows validationSummary.warningCount', () => {
    expect(panelSrc).toContain('validationSummary.warningCount')
  })

  it('shows validationSummary.lastValidatedAt formatted', () => {
    expect(panelSrc).toContain('fmtDate(validationSummary.lastValidatedAt)')
  })

  it('shows "Not yet validated" fallback when null', () => {
    expect(panelSrc).toContain('Not yet validated')
  })

  it('labels the section "Validation Summary"', () => {
    expect(panelSrc).toContain('title="Validation Summary"')
  })
})

describe('ProfileDetailPanel — simulation summary block', () => {
  it('reads profile.simulationSummary', () => {
    expect(panelSrc).toContain('profile.simulationSummary')
  })

  it('shows simulationSummary.score', () => {
    expect(panelSrc).toContain('simulationSummary.score')
  })

  it('shows simulationSummary.valid', () => {
    expect(panelSrc).toContain('simulationSummary.valid')
  })

  it('shows simulationSummary.basketCount', () => {
    expect(panelSrc).toContain('simulationSummary.basketCount')
  })

  it('shows simulationSummary.lastSimulatedAt formatted', () => {
    expect(panelSrc).toContain('fmtDate(simulationSummary.lastSimulatedAt)')
  })

  it('shows "No simulation run yet" fallback when null', () => {
    expect(panelSrc).toContain('No simulation run yet')
  })

  it('labels the section "Simulation Summary"', () => {
    expect(panelSrc).toContain('title="Simulation Summary"')
  })
})

describe('ProfileDetailPanel — audit fields', () => {
  it('shows profile.createdBy', () => {
    expect(panelSrc).toContain('profile.createdBy')
  })

  it('shows profile.updatedBy', () => {
    expect(panelSrc).toContain('profile.updatedBy')
  })

  it('shows profile.createdAt formatted', () => {
    expect(panelSrc).toContain('fmtDate(profile.createdAt)')
  })

  it('shows profile.updatedAt formatted', () => {
    expect(panelSrc).toContain('fmtDate(profile.updatedAt)')
  })

  it('labels the section "Audit"', () => {
    expect(panelSrc).toContain('title="Audit"')
  })

  it('has a fmtDate helper that never throws (try/catch)', () => {
    const idx = panelSrc.indexOf('function fmtDate')
    const slice = panelSrc.slice(idx, idx + 250)
    expect(slice).toContain('try {')
    expect(slice).toContain('catch')
  })

  it('fmtDate returns — for falsy input', () => {
    expect(panelSrc).toContain("if (!iso) return '—'")
  })
})

// ════════════════════════════════════════════════════════════
// 3. Reusable Row/Section internal structure
// ════════════════════════════════════════════════════════════
describe('ProfileDetailPanel — internal Row/Section helpers', () => {
  it('has a Row helper component', () => {
    expect(panelSrc).toContain('function Row(')
  })

  it('Row renders label and value as plain text spans', () => {
    const idx = panelSrc.indexOf('function Row(')
    const slice = panelSrc.slice(idx, idx + 400)
    expect(slice).toContain('<span')
    expect(slice).not.toContain('<input')
  })

  it('has a Section helper component', () => {
    expect(panelSrc).toContain('function Section(')
  })

  it('Section renders an icon and title', () => {
    const idx = panelSrc.indexOf('function Section(')
    const slice = panelSrc.slice(idx, idx + 400)
    expect(slice).toContain('Icon')
    expect(slice).toContain('title')
  })
})

// ════════════════════════════════════════════════════════════
// 4. Selection wiring — ProfileStudioPage + ProfileCard
// ════════════════════════════════════════════════════════════
describe('ProfileStudioPage — detail panel wiring', () => {
  it('imports ProfileDetailPanel', () => {
    expect(pageSrc).toContain("import ProfileDetailPanel")
  })

  it('derives selectedProfile from the already-fetched profiles list', () => {
    expect(pageSrc).toContain('const selectedProfile = profiles.find((p) => p.id === selectedProfileId)')
  })

  it('falls back to null when no profile matches', () => {
    expect(pageSrc).toContain('|| null')
  })

  it('renders ProfileDetailPanel', () => {
    expect(pageSrc).toContain('<ProfileDetailPanel')
  })

  it('passes selectedProfile to ProfileDetailPanel as profile prop', () => {
    expect(pageSrc).toContain('profile={selectedProfile}')
  })

  it('passes the list loading state into the detail panel', () => {
    const idx = pageSrc.indexOf('<ProfileDetailPanel')
    const slice = pageSrc.slice(idx, idx + 150)
    expect(slice).toContain('loading={loading}')
  })

  it('does NOT pass the list error state into the detail panel (avoids rendering the same permission/error message twice — ProfileList already shows it)', () => {
    const idx = pageSrc.indexOf('<ProfileDetailPanel')
    const slice = pageSrc.slice(idx, idx + 150)
    expect(slice).not.toContain('error={error}')
  })

  it('has an aria-label="Profile detail" section', () => {
    expect(pageSrc).toContain('aria-label="Profile detail"')
  })

  it('does NOT introduce a second profile-fetching hook for the detail panel', () => {
    // Only one useProfileStudioProfile(s) call site should exist (the list hook);
    // no separate single-profile fetch hook for the detail view in this phase.
    const matches = pageSrc.match(/useProfileStudioProfile[^s]/g) || []
    expect(matches.length).toBe(0)
  })
})

describe('ProfileCard — View action selects profile for detail panel', () => {
  it('View button calls onClick with profile.id (existing wiring, unchanged)', () => {
    expect(cardSrc).toContain('onClick?.(profile.id)')
  })

  it('ProfileCard remains read-only (no edit/approve/publish/archive buttons)', () => {
    expect(cardSrc).not.toContain('Edit')
    expect(cardSrc).not.toContain('Approve')
    expect(cardSrc).not.toContain('Publish')
    expect(cardSrc).not.toContain('Archive')
  })

  it('selecting a card sets isSelected style (existing visual feedback, unchanged)', () => {
    expect(cardSrc).toContain('isSelected')
  })
})

// ════════════════════════════════════════════════════════════
// 5. GUARDRAILS — read-only scope enforcement (Phase 2C critical)
// ════════════════════════════════════════════════════════════
describe('GUARDRAILS — no lifecycle transitions or writes', () => {
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
    expect(panelBody).not.toContain('updateProfileDocument')
  })

  it('does NOT import createProfileDocument', () => {
    expect(panelSrc).not.toContain('createProfileDocument')
  })

  it('does NOT import archiveProfileDocument', () => {
    expect(panelSrc).not.toContain('archiveProfileDocument')
  })

  it('does NOT import the Firestore service module at all', () => {
    expect(panelSrc).not.toContain("from '../../profileStudio/profileStudioService'")
  })

  it('does NOT import the Firestore SDK directly', () => {
    expect(panelSrc).not.toContain("from 'firebase/firestore'")
  })

  it('does NOT call addDoc', () => {
    expect(panelSrc).not.toContain('addDoc(')
  })

  it('does NOT call setDoc', () => {
    expect(panelSrc).not.toContain('setDoc(')
  })

  it('does NOT call updateDoc', () => {
    expect(panelSrc).not.toContain('updateDoc(')
  })

  it('does NOT call deleteDoc', () => {
    expect(panelSrc).not.toContain('deleteDoc(')
  })

  it('does NOT reference DRAFT -> VALIDATED transition text', () => {
    expect(panelBody).not.toContain('VALIDATED')
  })

  it('does NOT render a Validate button', () => {
    // "lastValidatedAt" is a legitimate read-only field name and is exempt;
    // assert there is no actual button/action labeled "Validate".
    expect(panelBody).not.toContain('>Validate<')
    expect(panelBody).not.toContain('Validate Draft')
    expect(panelBody).not.toContain('aria-label="Validate')
  })

  it('does NOT reference any audit action constants (CREATE_DRAFT, APPROVE, PUBLISH, ARCHIVE)', () => {
    expect(panelSrc).not.toContain('CREATE_DRAFT')
    expect(panelSrc).not.toContain("'APPROVE'")
    expect(panelSrc).not.toContain("'PUBLISH'")
    expect(panelSrc).not.toContain("'ARCHIVE'")
  })

  it('has zero onClick handlers (purely passive display)', () => {
    expect(panelSrc).not.toContain('onClick')
  })

  it('has zero onChange handlers (no editable state)', () => {
    expect(panelSrc).not.toContain('onChange')
  })

  it('has zero onSubmit handlers (no form)', () => {
    expect(panelSrc).not.toContain('onSubmit')
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

  it('renders no <button> element', () => {
    expect(panelSrc).not.toContain('<button')
  })

  it('has no useState (no local editable state)', () => {
    expect(panelSrc).not.toContain('useState')
  })

  it('has no useEffect (no side effects, no fetching of its own)', () => {
    expect(panelSrc).not.toContain('useEffect')
  })

  it('has no contentEditable attribute', () => {
    expect(panelSrc).not.toContain('contentEditable')
  })

  it('has no checkbox or radio inputs', () => {
    expect(panelSrc).not.toContain('type="checkbox"')
    expect(panelSrc).not.toContain('type="radio"')
  })

  it('does not import useProfileStudioStore (no write-capable store access)', () => {
    expect(panelSrc).not.toContain('useProfileStudioStore')
  })

  it('does not import useToastStore (no write-flow feedback in a read-only view)', () => {
    expect(panelSrc).not.toContain('useToastStore')
  })

  it('does not reference requirePermission or canEditProfile (no write-gate logic needed here)', () => {
    expect(panelSrc).not.toContain('requirePermission')
    expect(panelSrc).not.toContain('canEditProfile')
  })
})

describe('GUARDRAILS — additional Firestore write call surface', () => {
  it('does NOT call deleteDoc anywhere in the file', () => {
    expect(panelSrc).not.toContain('deleteDoc(')
  })

  it('does NOT call writeBatch', () => {
    expect(panelSrc).not.toContain('writeBatch')
  })

  it('does NOT call runTransaction', () => {
    expect(panelSrc).not.toContain('runTransaction')
  })

  it('does NOT import serverTimestamp (only used by write paths)', () => {
    expect(panelSrc).not.toContain('serverTimestamp')
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

  it('no draggable attribute', () => {
    expect(panelSrc).not.toContain('draggable')
  })

  it('no ondragstart/ondrop handlers', () => {
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

  it('no evaluationActualsService import', () => {
    expect(panelSrc).not.toContain('evaluationActualsService')
  })

  it('no bulkEvaluationService import', () => {
    expect(panelSrc).not.toContain('bulkEvaluationService')
  })
})

describe('GUARDRAILS — ProfileStudioPage stays read-only for this phase', () => {
  it('page does not import validateDraft', () => {
    expect(pageSrc).not.toContain('validateDraft')
  })

  it('page does not import updateProfileDocument', () => {
    expect(pageSrc).not.toContain('updateProfileDocument')
  })

  it('page does not render a Validate button', () => {
    expect(pageSrc).not.toContain('>Validate<')
    expect(pageSrc).not.toContain('Validate Draft')
  })

  it('the only Firestore-writing import on the page remains CreateProfileModal (Phase 2B, already approved)', () => {
    expect(pageSrc).toContain('CreateProfileModal')
    expect(pageSrc).not.toContain('ValidateProfileButton')
    expect(pageSrc).not.toContain('ApproveProfileButton')
    expect(pageSrc).not.toContain('PublishProfileButton')
    expect(pageSrc).not.toContain('ArchiveProfileButton')
  })
})

// ════════════════════════════════════════════════════════════
// 6. Defensive rendering — never throws on partial/missing data
// ════════════════════════════════════════════════════════════
describe('ProfileDetailPanel — defensive rendering', () => {
  it('uses optional chaining for nested metadata access', () => {
    expect(panelSrc).toContain('profile.metadata?.description')
    expect(panelSrc).toContain('profile.metadata?.validFrom')
  })

  it('defaults hierarchy to empty object when absent', () => {
    expect(panelSrc).toContain("profile.hierarchy  || {}")
  })

  it('defaults processors to empty object when absent', () => {
    expect(panelSrc).toContain("profile.processors || {}")
  })

  it('uses nullish coalescing for numeric counts in HierarchySummaryPanel (0 is a valid value, not falsy-fallback)', async () => {
    const hierarchyPanelSrc = await import('../../components/profileStudio/HierarchySummaryPanel.jsx?raw').then((m) => m.default)
    expect(hierarchyPanelSrc).toContain('h.basketCount  ?? 0')
    expect(hierarchyPanelSrc).toContain('h.elementCount ?? 0')
    expect(hierarchyPanelSrc).toContain('h.ruleCount    ?? 0')
  })

  it('falls back to "Unnamed Profile" when name is missing', () => {
    expect(panelSrc).toContain('Unnamed Profile')
  })

  it('falls back to em-dash for missing createdBy/updatedBy', () => {
    expect(panelSrc).toContain("profile.createdBy || '—'")
    expect(panelSrc).toContain("profile.updatedBy || '—'")
  })

  it('falls back to em-dash for missing profile.id', () => {
    expect(panelSrc).toContain("profile.id || '—'")
  })

  it('falls back to em-dash for missing description', () => {
    expect(panelSrc).toContain("profile.metadata?.description || '—'")
  })

  it('falls back to em-dash for missing hash', () => {
    expect(panelSrc).toContain("profile.hash || '—'")
  })

  it('falls back to em-dash when processorTypes is empty', () => {
    expect(panelSrc).toContain("'—'")
  })
})

// ════════════════════════════════════════════════════════════
// 7. File identity and module boundaries
// ════════════════════════════════════════════════════════════
describe('ProfileDetailPanel — module boundaries', () => {
  it('only imports from the established Profile Studio component set, the ui shell, lucide-react, and react', () => {
    const importLines = panelSrc.split('\n').filter((l) => l.trim().startsWith('import '))
    importLines.forEach((line) => {
      const isAllowed =
        line.includes("from 'react'") ||
        line.includes("from 'lucide-react'") ||
        line.includes('./ProfileStatusBadge') ||
        line.includes('./HierarchySummaryPanel') ||
        line.includes('./ProcessorReadinessPanel') ||
        line.includes('./BasketEditorPanel') ||
        line.includes('./SimulatorPanel') ||
        line.includes('./VersionHistoryPanel') ||
        line.includes('./SnapshotViewerPanel') ||
        line.includes('./SnapshotDiffRestorePanel') ||
        line.includes('./ApprovalPanel') ||
        line.includes('./PublishPanel') ||
        line.includes('./AuditLogPanel') ||
        line.includes('../ui/SkeletonCard') ||
        line.includes('../ui/EmptyState')
      expect(isAllowed).toBe(true)
    })
  })

  it('imports exactly one icon set from lucide-react', () => {
    const matches = panelSrc.match(/from 'lucide-react'/g) || []
    expect(matches.length).toBe(1)
  })

  it('does not import any file from src/profileStudio (kernel or service layer)', () => {
    expect(panelSrc).not.toContain("from '../../profileStudio/")
  })

  it('does not import any hook from src/profileStudio/hooks', () => {
    expect(panelSrc).not.toContain('profileStudio/hooks')
  })

  it('receives all data and the edit-flow callbacks via props (composition root, not a fetcher)', () => {
    expect(panelSrc).toContain('export default function ProfileDetailPanel({ profile, loading, error, actor, canEdit, onSaved })')
  })
})
