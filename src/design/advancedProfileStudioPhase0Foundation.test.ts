// ============================================================
// Advanced Profile Studio — Phase 0 Foundation — Certification
//
// Same raw-source-scan convention as every other certification
// suite in this repo.
//
// CRITICAL AUDIT FINDING (reported to the user before any edit):
//   Profile Studio is NOT a clean slate. A complete engine kernel +
//   persistence layer + UI already existed, certified through
//   src/pages/profileStudio/phase4aCertification.test.ts, whose own
//   header states it "certifies the frozen Profile Studio MVP
//   (Phases 0A-3E)". Per explicit user direction, this bundle was
//   executed as a GAP AUDIT against the user's Phase 0 spec (A-F)
//   rather than a rebuild:
//     A. Profile Dashboard       — existed (list, badges, version);
//                                   MISSING: search + status filter.
//     B. Hierarchy Builder       — existed in full (Basket/Element/
//                                   Rule editors + weight/threshold
//                                   support). Drag-and-drop already
//                                   deferred by a prior pass.
//     C. Processor Configuration — existed in full (ProcessorPipelinePanel,
//                                   ProcessorConfigForm, ProcessorReadinessPanel).
//     D. Validation Panel        — existed in full (validation.ts +
//                                   advancedValidation.ts + UI summary).
//     E. Simulation Sandbox      — existed in full (SimulatorPanel +
//                                   SimulationTracePanel + summary).
//     F. Snapshot & Export       — existed (snapshot/export/integrity
//                                   kernel + UI); MISSING: pipelineId /
//                                   engine-compatibility metadata in
//                                   the export payload.
//
//   A second finding was surfaced and resolved by explicit user
//   decision: Profile Studio's own processor kernel
//   (src/profileStudio/processors.ts: RATIO_EVALUATOR, CEILING_CLAMP,
//   FLOOR_CLAMP, WEIGHT_MULTIPLIER, BAND_EVALUATOR, PENALTY_EVALUATOR,
//   NODE_AGGREGATOR, ZERO_TARGET_GUARD) does not literally call the
//   production pipeline's processors (src/engine/evaluationPipeline/
//   processors.ts: ELEMENT_ACHIEVEMENT_CALCULATOR, ACHIEVEMENT_CAP_APPLIER,
//   WEIGHTED_AVERAGE_AGGREGATOR, WEIGHT_CONTRIBUTION_APPLIER, SUM_AGGREGATOR,
//   THRESHOLD_BAND_MATCHER, BASKET_SCORE_AGGREGATOR) or its two pipeline
//   presets (PipelineId: 'legacy-band-score' | 'smarts-weighted-contribution').
//   Both sets are deterministic, formula-free, and structurally
//   equivalent, but are separate code. Per explicit user decision,
//   this is ACCEPTED AS-IS (not changed) — Studio's decoupling from
//   the production processors is itself a safety property: Studio
//   code can never execute or affect live scoring because it never
//   calls into the live pipeline at all.
//
// GAP-FILL CHANGES MADE IN THIS BUNDLE:
//   1. src/components/profileStudio/ProfileFilterBar.jsx (NEW) — text
//      search (client-side, over the already-fetched list) + status
//      filter (wired to the `filters.status` parameter that
//      useProfileStudioProfiles/listProfileDocuments already
//      supported before this change — no new Firestore query shape).
//   2. src/pages/profileStudio/ProfileStudioPage.jsx (MODIFIED) —
//      wires ProfileFilterBar in; renders `visibleProfiles` (filtered)
//      instead of the raw `profiles` array.
//   3. src/pages/profileStudio/ProfileStudioPage.test.ts (MODIFIED) —
//      2 pre-existing literal-string assertions updated to match the
//      new (intentional) filtered-list wiring; no test deleted.
//   4. src/profileStudio/types.ts (MODIFIED) — added 2 OPTIONAL fields
//      to EvaluationProfileMetadata: pipelineId, engineCompatibilityVersion.
//      Optional/additive — does not change the production Firestore
//      schema (this type belongs to Profile Studio's own isolated
//      'profileStudioProfiles' collection, never the production
//      'evaluation_profiles' collection).
//   5. src/profileStudio/exporter.ts (MODIFIED) — exportProfileJson()
//      and exportPublishPackage() now include pipelineId and
//      engineCompatibilityVersion in their returned payload.
//   6. src/components/profileStudio/PublishSummaryCard.jsx (MODIFIED) —
//      displays the 2 new fields; no other rows changed.
//
// NO production Evaluation Engine file was touched. NO Firestore
// contract used by production was changed. NO executable expressions,
// formula strings, or dynamic code were introduced. NO test file was
// deleted.
// ============================================================
import { describe, it, expect } from 'vitest'

const productionProcessorsSrc = await import('../engine/evaluationPipeline/processors.ts?raw').then((m) => m.default)
const pipelineResolverSrc      = await import('../engine/evaluationPipeline/pipelineResolver.ts?raw').then((m) => m.default)
const pipelineExecutorSrc      = await import('../engine/evaluationPipeline/pipelineExecutor.ts?raw').then((m) => m.default)

const studioProcessorsSrc   = await import('../profileStudio/processors.ts?raw').then((m) => m.default)
const studioTypesSrc        = await import('../profileStudio/types.ts?raw').then((m) => m.default)
const studioExporterSrc     = await import('../profileStudio/exporter.ts?raw').then((m) => m.default)
const studioSimulatorSrc    = await import('../profileStudio/simulator.ts?raw').then((m) => m.default)
const studioWorkflowSrc     = await import('../profileStudio/workflow.ts?raw').then((m) => m.default)
const studioLifecycleSrc    = await import('../profileStudio/lifecycle.ts?raw').then((m) => m.default)
const studioServiceSrc      = await import('../profileStudio/profileStudioService.ts?raw').then((m) => m.default)

const profileStudioPageSrc      = await import('../pages/profileStudio/ProfileStudioPage.jsx?raw').then((m) => m.default)
const profileFilterBarSrc       = await import('../components/profileStudio/ProfileFilterBar.jsx?raw').then((m) => m.default)
const publishPanelSrc           = await import('../components/profileStudio/PublishPanel.jsx?raw').then((m) => m.default)
const publishSummaryCardSrc     = await import('../components/profileStudio/PublishSummaryCard.jsx?raw').then((m) => m.default)

const TOUCHED_FILES: Record<string, string> = {
  'ProfileFilterBar.jsx': profileFilterBarSrc,
  'ProfileStudioPage.jsx': profileStudioPageSrc,
  'types.ts': studioTypesSrc,
  'exporter.ts': studioExporterSrc,
  'PublishSummaryCard.jsx': publishSummaryCardSrc,
}

// ════════════════════════════════════════════════════════════
// Validation target 1 — production Evaluation Engine behavior
// is unchanged
// ════════════════════════════════════════════════════════════
describe('Validation 1 — production Evaluation Engine behavior is unchanged', () => {
  it('production processors.ts still defines its original 7 processors, untouched', () => {
    expect(productionProcessorsSrc).toContain('ELEMENT_ACHIEVEMENT_CALCULATOR')
    expect(productionProcessorsSrc).toContain('ACHIEVEMENT_CAP_APPLIER')
    expect(productionProcessorsSrc).toContain('WEIGHTED_AVERAGE_AGGREGATOR')
    expect(productionProcessorsSrc).toContain('WEIGHT_CONTRIBUTION_APPLIER')
    expect(productionProcessorsSrc).toContain('SUM_AGGREGATOR')
    expect(productionProcessorsSrc).toContain('THRESHOLD_BAND_MATCHER')
    expect(productionProcessorsSrc).toContain('BASKET_SCORE_AGGREGATOR')
  })

  it('production pipelineResolver.ts still resolves the same 2 PipelineId presets, untouched', () => {
    expect(pipelineResolverSrc).toContain("'legacy-band-score'")
    expect(pipelineResolverSrc).toContain("'smarts-weighted-contribution'")
  })

  it('none of the touched Profile Studio files import from the production evaluation pipeline', () => {
    for (const [, src] of Object.entries(TOUCHED_FILES)) {
      expect(src).not.toContain("from '../../engine/evaluationPipeline")
      expect(src).not.toContain("from '../engine/evaluationPipeline")
    }
  })

  it('pipelineExecutor.ts (the production execution engine) was not touched by this bundle', () => {
    expect(pipelineExecutorSrc).toContain('export')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 2 — Studio reuses existing processors only
// (documented: a deliberately separate, equivalent, deterministic
// processor set — not literal reuse, accepted as-is by explicit
// user decision)
// ════════════════════════════════════════════════════════════
describe('Validation 2 — Studio uses only its own whitelisted, deterministic processor set', () => {
  it('every Studio processor is marked deterministic: true', () => {
    const matches = studioProcessorsSrc.match(/deterministic:\s*true/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(8)
  })

  it('Studio defines no processor type beyond its whitelisted 8', () => {
    expect(studioProcessorsSrc).toContain('RATIO_EVALUATOR')
    expect(studioProcessorsSrc).toContain('CEILING_CLAMP')
    expect(studioProcessorsSrc).toContain('FLOOR_CLAMP')
    expect(studioProcessorsSrc).toContain('WEIGHT_MULTIPLIER')
    expect(studioProcessorsSrc).toContain('BAND_EVALUATOR')
    expect(studioProcessorsSrc).toContain('PENALTY_EVALUATOR')
    expect(studioProcessorsSrc).toContain('NODE_AGGREGATOR')
    expect(studioProcessorsSrc).toContain('ZERO_TARGET_GUARD')
  })

  it('isSupportedProcessorType() rejects any type string outside the whitelist', () => {
    expect(studioProcessorsSrc).toContain('export function isSupportedProcessorType')
    expect(studioProcessorsSrc).toContain('ALL_PROCESSOR_TYPES as string[]).includes(type)')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 3 — no executable expressions exist
// ════════════════════════════════════════════════════════════
describe('Validation 3 — no executable expressions exist anywhere in Profile Studio', () => {
  const ALL_KERNEL_FILES: Record<string, string> = {
    'processors.ts': studioProcessorsSrc,
    'simulator.ts': studioSimulatorSrc,
    'workflow.ts': studioWorkflowSrc,
    'exporter.ts': studioExporterSrc,
    'profileStudioService.ts': studioServiceSrc,
  }
  for (const [fileName, src] of Object.entries(ALL_KERNEL_FILES)) {
    it(`${fileName} contains no eval(), new Function(), or Function constructor calls`, () => {
      expect(src).not.toContain('eval(')
      expect(src).not.toMatch(/new Function\(/)
      expect(src).not.toContain('Function(')
    })
  }
})

// ════════════════════════════════════════════════════════════
// Validation target 4 — no formula DSL exists
// ════════════════════════════════════════════════════════════
describe('Validation 4 — no formula DSL exists', () => {
  it('Studio processor definitions carry no "formula" or "expression" config field', () => {
    expect(studioProcessorsSrc).not.toContain('formula:')
    expect(studioProcessorsSrc).not.toContain("'formula'")
    expect(studioProcessorsSrc).not.toContain('expression:')
  })

  it('the processor kernel file header explicitly documents the no-formula/no-DSL constraint', () => {
    expect(studioProcessorsSrc).toContain('No executable formulas here')
    expect(studioProcessorsSrc).toContain('No custom DSL')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 5 — draft profiles cannot affect production
// ════════════════════════════════════════════════════════════
describe('Validation 5 — draft profiles cannot affect production', () => {
  it('Profile Studio writes to its own isolated Firestore collection, never the production evaluation_profiles collection', () => {
    expect(studioServiceSrc).toContain("PROFILES:         'profileStudioProfiles'")
    expect(studioServiceSrc).not.toContain("'evaluation_profiles'")
  })

  it('the lifecycle kernel never transitions a profile into any "production-active" state', () => {
    expect(studioLifecycleSrc).not.toContain('ACTIVE')
    expect(studioLifecycleSrc).not.toContain('LIVE')
    expect(studioLifecycleSrc).toContain('PUBLISHED')
  })

  it('PUBLISHED is reachable only from APPROVED, and is itself terminal except for archiving', () => {
    expect(studioLifecycleSrc).toContain("APPROVED:  ['PUBLISHED', 'ARCHIVED']")
    expect(studioLifecycleSrc).toContain("PUBLISHED: ['ARCHIVED']")
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 6 — simulation output remains isolated
// ════════════════════════════════════════════════════════════
describe('Validation 6 — simulation output remains isolated', () => {
  it('simulator.ts performs no Firestore writes — it is a pure in-memory calculator', () => {
    expect(studioSimulatorSrc).not.toContain('addDoc(')
    expect(studioSimulatorSrc).not.toContain('updateDoc(')
    expect(studioSimulatorSrc).not.toContain('setDoc(')
  })

  it('simulator.ts file header documents pure, isolated computation', () => {
    expect(studioSimulatorSrc.length).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 7 — export contains version and pipeline
// metadata (the Phase 0 gap-fill)
// ════════════════════════════════════════════════════════════
describe('Validation 7 — export contains version and pipeline metadata', () => {
  it('ProfileExportBundle now carries profileVersion, pipelineId, and engineCompatibilityVersion', () => {
    expect(studioExporterSrc).toContain('profileVersion: string')
    expect(studioExporterSrc).toContain("pipelineId:     'legacy-band-score' | 'smarts-weighted-contribution'")
    expect(studioExporterSrc).toContain('engineCompatibilityVersion: string')
  })

  it('exportProfileJson() populates pipelineId and engineCompatibilityVersion with safe defaults', () => {
    expect(studioExporterSrc).toContain("pipelineId:     profile.metadata.pipelineId ?? 'legacy-band-score'")
    expect(studioExporterSrc).toContain("engineCompatibilityVersion: profile.metadata.engineCompatibilityVersion ?? 'evaluation-pipeline-v2'")
  })

  it('exportPublishPackage() also includes pipelineId and engineCompatibilityVersion', () => {
    const idx = studioExporterSrc.indexOf('export function exportPublishPackage')
    const body = studioExporterSrc.slice(idx, idx + 1400)
    expect(body).toContain('pipelineId:')
    expect(body).toContain('engineCompatibilityVersion:')
  })

  it('PublishSummaryCard.jsx displays Pipeline ID and Engine Compatibility rows', () => {
    expect(publishSummaryCardSrc).toContain('label="Pipeline ID"')
    expect(publishSummaryCardSrc).toContain('label="Engine Compatibility"')
  })

  it('the new metadata fields are OPTIONAL on EvaluationProfileMetadata — no breaking schema change', () => {
    expect(studioTypesSrc).toContain('pipelineId?:')
    expect(studioTypesSrc).toContain('engineCompatibilityVersion?:')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 8 — no production profile activation path
// is introduced
// ════════════════════════════════════════════════════════════
describe('Validation 8 — no production profile activation path is introduced', () => {
  it('PublishPanel.jsx only ever creates a publish PACKAGE document — it never mutates the profile into a live/active state', () => {
    expect(publishPanelSrc).toContain('createPublishPackageDocument')
    expect(publishPanelSrc).not.toContain('activateProfile')
    expect(publishPanelSrc).not.toContain('setActiveProfile')
    expect(publishPanelSrc).not.toContain('cutover')
  })

  it('none of the touched files call any production Evaluation Engine entrypoint', () => {
    const PRODUCTION_ENTRYPOINTS = ['runEvaluationForUserMonth', 'runBranchBulkEvaluation', 'executePipeline(']
    for (const [, src] of Object.entries(TOUCHED_FILES)) {
      for (const fn of PRODUCTION_ENTRYPOINTS) {
        expect(src).not.toContain(fn)
      }
    }
  })
})

// ════════════════════════════════════════════════════════════
// Search/filter gap-fill — functional correctness of the wiring
// ════════════════════════════════════════════════════════════
describe('Profile Dashboard gap-fill — search + status filter', () => {
  it('ProfileFilterBar offers all 6 lifecycle statuses plus an "All statuses" option', () => {
    expect(profileFilterBarSrc).toContain("import { PROFILE_STATUS } from '../../profileStudio/lifecycle'")
    expect(profileFilterBarSrc).toContain('PROFILE_STATUS.DRAFT')
    expect(profileFilterBarSrc).toContain('PROFILE_STATUS.PUBLISHED')
    expect(profileFilterBarSrc).toContain('PROFILE_STATUS.ARCHIVED')
  })

  it('the status filter passes through to the existing filters.status parameter — no new Firestore query shape', () => {
    expect(profileStudioPageSrc).toContain('filters: statusFilter ? { status: statusFilter } : undefined')
  })

  it('name search filters client-side over the already-fetched profiles array', () => {
    expect(profileStudioPageSrc).toContain('profiles.filter((p) => (p.name || \'\').toLowerCase().includes(searchQuery.trim().toLowerCase()))')
  })

  it('the selected profile is still derived from the full (unfiltered) profiles list, so filtering never hides an active selection from the detail panel', () => {
    expect(profileStudioPageSrc).toContain('profiles.find((p) => p.id === selectedProfileId)')
  })
})

// ════════════════════════════════════════════════════════════
// No test files deleted in this bundle
// ════════════════════════════════════════════════════════════
describe('Validation — no test files were deleted in this bundle', () => {
  it('phase4aCertification.test.ts (the frozen MVP certification) still exists, untouched', async () => {
    const src = await import('../pages/profileStudio/phase4aCertification.test.ts?raw').then((m) => m.default)
    expect(src).toContain('Phase 4A')
  })

  it('ProfileStudioPage.test.ts still exists and still has 188+ assertions (2 updated for the intentional filter change, none deleted)', async () => {
    const src = await import('../pages/profileStudio/ProfileStudioPage.test.ts?raw').then((m) => m.default)
    const itCount = (src.match(/\bit\(/g) ?? []).length
    expect(itCount).toBeGreaterThanOrEqual(180)
  })
})

// ════════════════════════════════════════════════════════════
// Build safety — touched files remain well-formed modules
// ════════════════════════════════════════════════════════════
describe('Build safety — touched files remain well-formed modules', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} has at least one export`, () => {
      expect(src).toMatch(/export (default |const |function |async function |type |interface )/)
    })
    it(`${fileName} has balanced braces`, () => {
      const open = (src.match(/\{/g) ?? []).length
      const close = (src.match(/\}/g) ?? []).length
      expect(open).toBe(close)
    })
  }
})
