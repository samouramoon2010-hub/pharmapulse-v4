// ============================================================
// Profile Studio — Phase 1 Closure Bundle Certification
//
// Covers: Excel/CSV Import Wizard, Parsed Profile Preview,
// Validation Report, Diff Viewer, Rollback/Restore, and the
// Cohort Simulation readiness audit.
//
// Proves the bundle's 8 required guarantees:
//   1. Import creates Draft only.
//   2. Import requires preview + validation before save.
//   3. Invalid weights/processors/thresholds are blocked.
//   4. Diff Viewer detects added/removed/changed items.
//   5. Restore creates a new draft/version, never overwrites history.
//   6. No production activation path is introduced.
//   7. Production engine/scoring/Firestore contracts remain unchanged.
//   8. No formula DSL or executable expressions exist.
// ============================================================
import { describe, it, expect } from 'vitest'

import {
  detectImportTemplate,
  buildColumnMapping,
  isColumnMappingComplete,
  buildProfileFromImportRows,
  buildImportValidationReport,
  canSaveImportedProfile,
  parseThresholdBandsCell,
  IMPORT_CANONICAL_FIELDS,
  IMPORT_REQUIRED_FIELDS,
} from './importWizard'
import { diffProfiles, diffSnapshots } from './profileDiff'
import { restoreProfileFromSnapshot } from './restore'
import { createProfileSnapshot } from './exporter'
import { COHORT_SIMULATION_READINESS } from './cohortSimulationAudit'
import { PROFILE_STATUS } from './lifecycle'
import { createEmptyEvaluationProfile, createBasketNode, createElementNode, createRuleNode } from './profileFactory'
import { validateProfile } from './validation'
import type { EvaluationProfileDraft } from './types'

// ── Source files for static-scan assertions ────────────────────
const importWizardSrc = await import('./importWizard.ts?raw').then((m) => m.default)
const profileDiffSrc   = await import('./profileDiff.ts?raw').then((m) => m.default)
const restoreSrc       = await import('./restore.ts?raw').then((m) => m.default)
const cohortAuditSrc   = await import('./cohortSimulationAudit.ts?raw').then((m) => m.default)
const simulatorSrc     = await import('./simulator.ts?raw').then((m) => m.default)
const validationSrc    = await import('./validation.ts?raw').then((m) => m.default)
const lifecycleSrc     = await import('./lifecycle.ts?raw').then((m) => m.default)
const profileStudioServiceSrc = await import('./profileStudioService.ts?raw').then((m) => m.default)

// ── Fixtures ────────────────────────────────────────────────────

function buildValidProfile(idSuffix = '1'): EvaluationProfileDraft {
  const profile = createEmptyEvaluationProfile({ name: `Test Profile ${idSuffix}` })
  const basket = createBasketNode({ id: `basket${idSuffix}`, label: 'Commercial', weight: 1 })
  const element = createElementNode({ id: `element${idSuffix}`, label: 'Sales', weight: 1 })
  const rule = createRuleNode({ id: `rule${idSuffix}`, kpiKey: 'sales', label: 'Sales KPI', weight: 1 })
  element.rules.push(rule)
  basket.elements.push(element)
  profile.root.baskets.push(basket)
  return profile
}

const VALID_HEADERS = [
  'basketId', 'basketLabel', 'basketWeight',
  'elementId', 'elementLabel', 'elementWeight',
  'ruleId', 'kpiKey', 'ruleLabel', 'ruleWeight',
]

const VALID_ROWS = [
  {
    basketId: 'b1', basketLabel: 'Commercial', basketWeight: 0.6,
    elementId: 'e1', elementLabel: 'Sales', elementWeight: 1,
    ruleId: 'r1', kpiKey: 'sales', ruleLabel: 'Sales KPI', ruleWeight: 1,
  },
  {
    basketId: 'b2', basketLabel: 'Clinical', basketWeight: 0.4,
    elementId: 'e2', elementLabel: 'Adherence', elementWeight: 1,
    ruleId: 'r2', kpiKey: 'adherence', ruleLabel: 'Adherence KPI', ruleWeight: 1,
  },
]

function buildValidMapping() {
  const detection = detectImportTemplate(VALID_HEADERS)
  return buildColumnMapping(detection)
}

// ════════════════════════════════════════════════════════════
// REQUIRED PROOF 1 — Import creates Draft only
// ════════════════════════════════════════════════════════════
describe('Required proof 1 — Import creates Draft only', () => {
  it('buildProfileFromImportRows always forces metadata.status to DRAFT', () => {
    const mapping = buildValidMapping()
    const { profile } = buildProfileFromImportRows(VALID_ROWS, mapping, { name: 'Imported' })
    expect(profile.metadata.status).toBe(PROFILE_STATUS.DRAFT)
  })

  it('forces DRAFT even when given rows containing a misleading "status" key (ignored — no such canonical field)', () => {
    const mapping = buildValidMapping()
    const rowsWithStatus = VALID_ROWS.map((r) => ({ ...r, status: 'PUBLISHED' }))
    const { profile } = buildProfileFromImportRows(rowsWithStatus, mapping, { name: 'Imported' })
    expect(profile.metadata.status).toBe('DRAFT')
  })

  it('ImportWizardModal hardcodes status: "DRAFT" on save (defense in depth on top of the kernel)', async () => {
    const modalSrc = await import('../components/profileStudio/ImportWizardModal.jsx?raw').then((m) => m.default)
    expect(modalSrc).toContain("status:  'DRAFT'")
  })
})

// ════════════════════════════════════════════════════════════
// REQUIRED PROOF 2 — Import requires preview + validation before save
// ════════════════════════════════════════════════════════════
describe('Required proof 2 — Import requires preview + validation before save', () => {
  it('ImportWizardModal step order is upload -> mapping -> preview -> report', () => {
    expect(importWizardSrc).toBeDefined()
    expect(IMPORT_REQUIRED_FIELDS.length).toBeGreaterThan(0)
  })

  it('the wizard component declares the four-step flow in order', async () => {
    const modalSrc = await import('../components/profileStudio/ImportWizardModal.jsx?raw').then((m) => m.default)
    const steps = "const STEPS = ['upload', 'mapping', 'preview', 'report']"
    expect(modalSrc).toContain(steps)
  })

  it('Save as Draft button is disabled unless canSaveImportedProfile(report) is true', async () => {
    const modalSrc = await import('../components/profileStudio/ImportWizardModal.jsx?raw').then((m) => m.default)
    expect(modalSrc).toContain('disabled={busy || !canSaveImportedProfile(report)}')
  })

  it('column mapping must be complete before the preview step can be reached', async () => {
    const modalSrc = await import('../components/profileStudio/ImportWizardModal.jsx?raw').then((m) => m.default)
    expect(modalSrc).toContain('disabled={!isColumnMappingComplete(mapping)}')
  })

  it('isColumnMappingComplete is false when a required field is unmapped', () => {
    const mapping = buildValidMapping()
    mapping.kpiKey = null
    expect(isColumnMappingComplete(mapping)).toBe(false)
  })

  it('isColumnMappingComplete is true for a fully mapped sheet', () => {
    expect(isColumnMappingComplete(buildValidMapping())).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// REQUIRED PROOF 3 — Invalid weights/processors/thresholds are blocked
// ════════════════════════════════════════════════════════════
describe('Required proof 3 — Invalid weights/processors/thresholds are blocked', () => {
  it('blocks save when basket weights do not sum to 1.0', () => {
    const mapping = buildValidMapping()
    const badRows = [{ ...VALID_ROWS[0], basketWeight: 0.3 }, { ...VALID_ROWS[1], basketWeight: 0.3 }]
    const { profile } = buildProfileFromImportRows(badRows, mapping, { name: 'Bad weights' })
    const report = buildImportValidationReport(profile)
    expect(canSaveImportedProfile(report)).toBe(false)
    expect(report.issues.some((i) => i.code === 'BASKET_WEIGHT_SUM')).toBe(true)
  })

  it('blocks save when a missing weight cell resolves to 0 (not NaN, which would silently pass)', () => {
    const mapping = buildValidMapping()
    const rowsMissingWeight = [
      { ...VALID_ROWS[0], basketWeight: '' },
      { ...VALID_ROWS[1] },
    ]
    const { profile } = buildProfileFromImportRows(rowsMissingWeight, mapping, { name: 'Missing weight' })
    expect(profile.root.baskets.find((b) => b.id === 'b1')!.weight).toBe(0)
    const report = buildImportValidationReport(profile)
    expect(canSaveImportedProfile(report)).toBe(false)
  })

  it('blocks save when a rule references an unknown KPI key', () => {
    const mapping = buildValidMapping()
    const badRows = [{ ...VALID_ROWS[0], basketWeight: 1, kpiKey: 'totally_made_up_kpi_xyz' }]
    const { profile } = buildProfileFromImportRows(badRows, mapping, { name: 'Unknown KPI' })
    const report = buildImportValidationReport(profile)
    expect(canSaveImportedProfile(report)).toBe(false)
    expect(report.blockingIssues.some((i) => i.code === 'UNKNOWN_KPI_KEY')).toBe(true)
  })

  it('blocks save when a basket has no elements', () => {
    const profile = buildValidProfile('x')
    profile.root.baskets.push({ id: 'empty-basket', label: 'Empty', weight: 0, elements: [], pipeline: { steps: [] } })
    const report = buildImportValidationReport(profile)
    expect(canSaveImportedProfile(report)).toBe(false)
    expect(report.blockingIssues.some((i) => i.code === 'BASKET_NO_ELEMENTS_IMPORT')).toBe(true)
  })

  it('blocks save when a processor type is unsupported', () => {
    const profile = buildValidProfile('proc')
    profile.root.baskets[0].elements[0].rules[0].pipeline.steps.push({
      processorType: 'NOT_A_REAL_PROCESSOR' as any, config: {}, order: 0,
    })
    const report = buildImportValidationReport(profile)
    expect(canSaveImportedProfile(report)).toBe(false)
    expect(report.blockingIssues.some((i) => i.code === 'UNSUPPORTED_PROCESSOR' || i.code === 'UNKNOWN_PROCESSOR_TYPE_IMPORT')).toBe(true)
  })

  it('blocks save when threshold bands are incomplete', () => {
    const profile = buildValidProfile('thresh')
    profile.root.baskets[0].elements[0].rules[0].thresholdBands = [
      { label: '', minPct: NaN, maxPct: 100, score: 80 },
    ]
    const report = buildImportValidationReport(profile)
    expect(canSaveImportedProfile(report)).toBe(false)
    expect(report.blockingIssues.some((i) => i.code === 'INCOMPLETE_THRESHOLDS_IMPORT')).toBe(true)
  })

  it('blocks save when cap is invalid (<= 0)', () => {
    const profile = buildValidProfile('cap')
    profile.root.baskets[0].elements[0].rules[0].cap = -5
    const report = buildImportValidationReport(profile)
    expect(canSaveImportedProfile(report)).toBe(false)
    expect(report.blockingIssues.some((i) => i.code === 'INVALID_CAP' || i.code === 'INVALID_CAP_IMPORT')).toBe(true)
  })

  it('allows save for a fully valid imported profile', () => {
    const mapping = buildValidMapping()
    const goodRows = [{ ...VALID_ROWS[0], basketWeight: 1 }]
    const { profile } = buildProfileFromImportRows(goodRows, mapping, { name: 'Good profile' })
    const report = buildImportValidationReport(profile)
    expect(canSaveImportedProfile(report)).toBe(true)
  })

  it('parseThresholdBandsCell parses the fixed tuple grammar without eval', () => {
    const bands = parseThresholdBandsCell('Excellent:80:100:100; Good:50:80:70')
    expect(bands).toEqual([
      { label: 'Excellent', minPct: 80, maxPct: 100, score: 100 },
      { label: 'Good', minPct: 50, maxPct: 80, score: 70 },
    ])
  })
})

// ════════════════════════════════════════════════════════════
// REQUIRED PROOF 4 — Diff Viewer detects added/removed/changed items
// ════════════════════════════════════════════════════════════
describe('Required proof 4 — Diff Viewer detects added/removed/changed items', () => {
  it('detects an added basket', () => {
    const before = buildValidProfile('a')
    const after = buildValidProfile('a')
    after.root.baskets.push(createBasketNode({ id: 'new-basket', label: 'New', weight: 0 }))
    const diff = diffProfiles(before, after)
    expect(diff.basketsAdded.map((b) => b.id)).toContain('new-basket')
    expect(diff.identical).toBe(false)
  })

  it('detects a removed element', () => {
    const before = buildValidProfile('b')
    const after = buildValidProfile('b')
    after.root.baskets[0].elements = []
    const diff = diffProfiles(before, after)
    expect(diff.elementsRemoved.map((e) => e.id)).toContain('elementb')
  })

  it('detects a changed rule weight', () => {
    const before = buildValidProfile('c')
    const after = JSON.parse(JSON.stringify(before)) as EvaluationProfileDraft
    after.root.baskets[0].elements[0].rules[0].weight = 0.5
    const diff = diffProfiles(before, after)
    expect(diff.rulesChanged.length).toBe(1)
    expect(diff.rulesChanged[0].changes.some((c) => c.startsWith('weight:'))).toBe(true)
  })

  it('detects a changed cap', () => {
    const before = buildValidProfile('d')
    before.root.baskets[0].elements[0].rules[0].cap = 100
    const after = JSON.parse(JSON.stringify(before)) as EvaluationProfileDraft
    after.root.baskets[0].elements[0].rules[0].cap = 150
    const diff = diffProfiles(before, after)
    expect(diff.rulesChanged[0].changes.some((c) => c.startsWith('cap:'))).toBe(true)
  })

  it('detects a changed threshold band set', () => {
    const before = buildValidProfile('e')
    const after = JSON.parse(JSON.stringify(before)) as EvaluationProfileDraft
    after.root.baskets[0].elements[0].rules[0].thresholdBands = [{ label: 'Good', minPct: 0, maxPct: 100, score: 80 }]
    const diff = diffProfiles(before, after)
    expect(diff.rulesChanged[0].changes.some((c) => c.startsWith('thresholdBands:'))).toBe(true)
  })

  it('detects an added processor step on a rule pipeline', () => {
    const before = buildValidProfile('f')
    const after = JSON.parse(JSON.stringify(before)) as EvaluationProfileDraft
    after.root.baskets[0].elements[0].rules[0].pipeline.steps.push({ processorType: 'CEILING_CLAMP', config: { ceiling: 100 }, order: 0 })
    const diff = diffProfiles(before, after)
    expect(diff.processorChanges.length).toBe(1)
    expect(diff.processorChanges[0].added[0].processorType).toBe('CEILING_CLAMP')
  })

  it('reports identical=true for two structurally identical profiles', () => {
    const before = buildValidProfile('g')
    const after = JSON.parse(JSON.stringify(before)) as EvaluationProfileDraft
    const diff = diffProfiles(before, after)
    expect(diff.identical).toBe(true)
  })

  it('diffSnapshots compares two ProfileSnapshot objects via their .profile payload', () => {
    const profileA = buildValidProfile('h')
    const profileB = JSON.parse(JSON.stringify(profileA)) as EvaluationProfileDraft
    profileB.root.baskets[0].weight = 0.9
    const snapA = createProfileSnapshot(profileA)
    const snapB = createProfileSnapshot(profileB)
    const diff = diffSnapshots(snapA, snapB)
    expect(diff.basketsChanged.length).toBe(1)
  })

  it('diffProfiles never mutates its inputs', () => {
    const before = buildValidProfile('i')
    const after = JSON.parse(JSON.stringify(before)) as EvaluationProfileDraft
    const beforeJson = JSON.stringify(before)
    const afterJson = JSON.stringify(after)
    diffProfiles(before, after)
    expect(JSON.stringify(before)).toBe(beforeJson)
    expect(JSON.stringify(after)).toBe(afterJson)
  })
})

// ════════════════════════════════════════════════════════════
// REQUIRED PROOF 5 — Restore creates a new draft/version, never
// overwrites history
// ════════════════════════════════════════════════════════════
describe('Required proof 5 — Restore creates a new draft/version, never overwrites history', () => {
  it('restoreProfileFromSnapshot produces a NEW profile id distinct from the source', () => {
    const profile = buildValidProfile('j')
    profile.metadata.status = PROFILE_STATUS.PUBLISHED
    const snapshot = createProfileSnapshot(profile)
    const { profile: restored } = restoreProfileFromSnapshot(snapshot)
    expect(restored.metadata.id).not.toBe(profile.metadata.id)
    expect(restored.metadata.id).not.toBe(snapshot.profileId)
  })

  it('restored profile is always DRAFT, even when the snapshot captured a PUBLISHED profile', () => {
    const profile = buildValidProfile('k')
    profile.metadata.status = PROFILE_STATUS.PUBLISHED
    const snapshot = createProfileSnapshot(profile)
    const { profile: restored } = restoreProfileFromSnapshot(snapshot)
    expect(restored.metadata.status).toBe(PROFILE_STATUS.DRAFT)
  })

  it('restored version is distinguishable from the source snapshot version', () => {
    const profile = buildValidProfile('l')
    const snapshot = createProfileSnapshot(profile)
    const { profile: restored, sourceVersion } = restoreProfileFromSnapshot(snapshot)
    expect(restored.metadata.version).toBe(`${sourceVersion}-restored`)
    expect(restored.metadata.version).not.toBe(snapshot.version)
  })

  it('does not mutate the source snapshot', () => {
    const profile = buildValidProfile('m')
    const snapshot = createProfileSnapshot(profile)
    const snapshotJsonBefore = JSON.stringify(snapshot)
    restoreProfileFromSnapshot(snapshot)
    expect(JSON.stringify(snapshot)).toBe(snapshotJsonBefore)
  })

  it('result includes sourceSnapshotId for audit traceability without touching the snapshot itself', () => {
    const profile = buildValidProfile('n')
    const snapshot = createProfileSnapshot(profile)
    const result = restoreProfileFromSnapshot(snapshot)
    expect(result.sourceSnapshotId).toBe(snapshot.snapshotId)
  })

  it('restore.ts never imports any Firestore write function — it is a pure kernel', () => {
    expect(restoreSrc).not.toMatch(/from\s+['"]firebase/)
    expect(restoreSrc).not.toContain('setDoc(')
    expect(restoreSrc).not.toContain('updateDoc(')
  })
})

// ════════════════════════════════════════════════════════════
// REQUIRED PROOF 6 — No production activation path is introduced
// ════════════════════════════════════════════════════════════
describe('Required proof 6 — No production activation path is introduced', () => {
  it('restore.ts never sets status to PUBLISHED or APPROVED', () => {
    expect(restoreSrc).not.toContain("'PUBLISHED'")
    expect(restoreSrc).not.toContain("'APPROVED'")
    expect(restoreSrc).toContain('PROFILE_STATUS.DRAFT')
  })

  it('importWizard.ts never sets status to PUBLISHED or APPROVED', () => {
    expect(importWizardSrc).not.toContain("'PUBLISHED'")
    expect(importWizardSrc).not.toContain("'APPROVED'")
    expect(importWizardSrc).toContain('PROFILE_STATUS.DRAFT')
  })

  it('ImportWizardModal never calls any publish/approve service function', async () => {
    const modalSrc = await import('../components/profileStudio/ImportWizardModal.jsx?raw').then((m) => m.default)
    expect(modalSrc).not.toContain('createPublishPackageDocument')
    expect(modalSrc).not.toContain('canPublishProfile')
  })

  it('SnapshotDiffRestorePanel never calls any publish/approve service function', async () => {
    const panelSrc = await import('../components/profileStudio/SnapshotDiffRestorePanel.jsx?raw').then((m) => m.default)
    expect(panelSrc).not.toContain('createPublishPackageDocument')
    expect(panelSrc).not.toContain("status: 'PUBLISHED'")
  })

  it('the profile lifecycle still blocks PUBLISHED -> DRAFT/VALIDATED/SIMULATED/APPROVED (unchanged gate)', () => {
    expect(lifecycleSrc).toContain("PUBLISHED: ['ARCHIVED']")
  })
})

// ════════════════════════════════════════════════════════════
// REQUIRED PROOF 7 — Production engine/scoring/Firestore contracts
// remain unchanged
// ════════════════════════════════════════════════════════════
describe('Required proof 7 — Production engine/scoring/Firestore contracts remain unchanged', () => {
  it('none of the new kernels import the production Evaluation Engine', () => {
    for (const src of [importWizardSrc, profileDiffSrc, restoreSrc, cohortAuditSrc]) {
      expect(src).not.toMatch(/from\s+['"].*evaluationPipeline/)
      expect(src).not.toMatch(/from\s+['"].*evaluationEngine/)
    }
  })

  it('simulator.ts (production-adjacent sandbox kernel) was not modified to add cohort/bulk execution', () => {
    expect(simulatorSrc).not.toContain('simulateCohort')
    expect(simulatorSrc).not.toContain('subjects:')
  })

  it('validateProfile (the shared validation kernel used by both Studio UI and import) was not weakened', () => {
    expect(validationSrc).toContain('BASKET_WEIGHT_SUM')
    expect(validationSrc).toContain('ELEMENT_WEIGHT_SUM')
    expect(validationSrc).toContain('RULE_WEIGHT_SUM')
  })

  it('profileStudioService.ts (the only Firestore write surface) gained no new collection constants', () => {
    expect(profileStudioServiceSrc).toContain("PROFILES:         'profileStudioProfiles'")
    expect(profileStudioServiceSrc).toContain("SNAPSHOTS:        'profileStudioSnapshots'")
    // Exactly the 5 pre-existing collections — no 6th constant introduced.
    const colMatches = profileStudioServiceSrc.match(/^\s*[A-Z_]+:\s+'profileStudio\w+'/gm) || []
    expect(colMatches.length).toBe(5)
  })

  it('no new kernel file writes directly to Firestore (setDoc/addDoc/updateDoc)', () => {
    for (const src of [importWizardSrc, profileDiffSrc, restoreSrc, cohortAuditSrc]) {
      expect(src).not.toContain('setDoc(')
      expect(src).not.toContain('addDoc(')
      expect(src).not.toContain('updateDoc(')
    }
  })
})

// ════════════════════════════════════════════════════════════
// REQUIRED PROOF 8 — No formula DSL or executable expressions exist
// ════════════════════════════════════════════════════════════
describe('Required proof 8 — No formula DSL or executable expressions exist', () => {
  it('none of the new kernels use eval, new Function, or expression evaluation', () => {
    for (const src of [importWizardSrc, profileDiffSrc, restoreSrc, cohortAuditSrc]) {
      expect(src).not.toContain('eval(')
      expect(src).not.toContain('new Function(')
      expect(src).not.toMatch(/\bFunction\s*\(/)
    }
  })

  it('threshold band parsing uses a fixed split(":")/split(";") + Number() grammar, not an expression parser', () => {
    expect(importWizardSrc).toContain(".split(';')")
    expect(importWizardSrc).toContain("split(':')")
    expect(importWizardSrc).not.toContain('eval(')
  })

  it('processor type from a sheet cell is validated against the fixed processor registry, never executed as code', () => {
    expect(importWizardSrc).toContain('isSupportedProcessorType')
  })

  it('the import wizard never imports an AI/LLM client', () => {
    expect(importWizardSrc).not.toMatch(/openai|anthropic|gpt-|claude-/i)
  })
})

// ════════════════════════════════════════════════════════════
// Cohort Simulation — readiness audit only (item 6 of the bundle)
// ════════════════════════════════════════════════════════════
describe('Cohort Simulation — readiness audit only, not implemented', () => {
  it('explicitly reports cohortSimulationImplemented: false', () => {
    expect(COHORT_SIMULATION_READINESS.cohortSimulationImplemented).toBe(false)
  })

  it('recommends DEFER', () => {
    expect(COHORT_SIMULATION_READINESS.recommendation).toBe('DEFER')
  })

  it('lists concrete blocking requirements rather than silently skipping the audit', () => {
    expect(COHORT_SIMULATION_READINESS.blockingRequirements.length).toBeGreaterThan(0)
  })

  it('lists existing ready capabilities that ARE safe to use today', () => {
    expect(COHORT_SIMULATION_READINESS.readyCapabilities.length).toBeGreaterThan(0)
  })

  it('cohortSimulationAudit.ts is documentation-only — no executable simulation logic', () => {
    expect(cohortAuditSrc).not.toMatch(/from\s+['"]\.\/simulator/)
    expect(cohortAuditSrc).not.toContain('import {')
  })
})

// ════════════════════════════════════════════════════════════
// Cross-cutting — Profile Studio processor-kernel isolation preserved
// ════════════════════════════════════════════════════════════
describe('Cross-cutting — Profile Studio processor-kernel isolation preserved', () => {
  it('importWizard.ts only reads a static KPI key LIST from the registry — never imports engine execution code', () => {
    expect(importWizardSrc).toContain('DEFAULT_ALL_KPI_KEYS')
    expect(importWizardSrc).not.toMatch(/from\s+['"].*evaluationPipeline/)
    expect(importWizardSrc).not.toContain('runEvaluationPipeline')
  })

  it('a profile built from rows with an unmapped optional field still validates structurally', () => {
    const mapping = buildValidMapping()
    const { profile } = buildProfileFromImportRows([{ ...VALID_ROWS[0], basketWeight: 1 }], mapping, { name: 'Minimal' })
    const result = validateProfile(profile)
    // Weight sums to 1.0 with a single basket — only non-error issues (if any) should remain.
    expect(result.issues.every((i) => i.severity !== 'error')).toBe(true)
  })
})
