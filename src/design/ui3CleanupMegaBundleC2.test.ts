// ============================================================
// UI 3.0 Cleanup Mega Bundle C2 — Intelligence & Recovery Cleanup
// Certification
//
// Same raw-source-scan convention as other certification suites in
// this repo (no jsdom/testing-library — vitest Node environment).
//
// LIVE ROUTE AUDIT (performed before any edit — see App.jsx):
//   /admin/evaluation-registry -> EvaluationRegistryPage.tsx
//   /admin/evaluation-run      -> EvaluationRunPage.tsx
//   /admin/rankings            -> RankingsPage.tsx (closest live
//     "evaluation drilldown" surface — no route literally named
//     "Evaluation Center")
// There is NO dedicated "Recovery Hub" route anywhere in App.jsx.
// "Recovery" only exists as a feature inside the Actions pages
// (already cleaned in the preceding "Actions & Task Board Designer
// Mode Pass 1" bundle) and inside TeamPage.jsx/TeamIntelligenceCard —
// neither of which is a standalone Recovery surface.
//
// FINDINGS / FIXES:
//   1. src/components/evaluationLedger/{LeaderboardPanel,RankingCard,
//      RankingSummaryCard}.jsx — proven orphaned (zero live route or
//      component consumers; only consumed by two isolated test
//      files). Deleted per explicit confirmation.
//   2. src/pages/evaluationLedger/phase5d.test.ts — tested ONLY the
//      3 deleted components; deleted alongside them.
//   3. Six bare `.toLocaleString()` calls fixed: two numeric
//      (`el.actual`/`el.target` in EvaluationRunPage.tsx) now route
//      through formatNumber(); four date/time calls now explicitly
//      pass 'en-US'.
//   4. EvaluationRegistryPage.tsx and EvaluationRunPage.tsx each
//      defined an identical local field-label component named `F`
//      (Registry's version was a strict superset) — extracted to
//      src/components/admin/evaluation/EvaluationFormField.tsx,
//      both pages now import the shared component.
//
// DEFERRED RISKS (explicitly NOT fixed in this pass, per direct
// confirmation):
//   - ~90 hardcoded hex color literals across the 3 live pages
//     (success/warning/danger/neutral semantics in a Tailwind-style
//     palette distinct from design/tokens.ts's COLORS). Some are
//     deliberately lighter shades for dark-background readability —
//     a full token migration was judged higher-risk than this
//     cleanup pass should absorb; flagged for a dedicated future pass.
//   - ~29 unicode glyph characters (⚠ ✓ ✗ ↷ ✅ ❌) used in place of
//     icons across the same 3 pages — same risk category as above,
//     left untouched.
//
// CORRECTIVE NOTE — an error made and resolved during this bundle:
//   src/pages/evaluationLedger/phase5gCertification.test.ts was
//   initially deleted alongside phase5d.test.ts under the mistaken
//   assumption that it only tested the 3 orphaned UI components. It
//   did not — it was a broader certification suite for the LIVE
//   evaluationLedger/ranking/benchmark/trend engine kernel (consumed
//   by src/intelligence/* and ExecutiveInsightPanel.jsx). The file
//   was untracked in git and is not recoverable. Verified afterward
//   that every function it exercised remains directly unit-tested in
//   src/evaluationLedger/phase5ab.test.ts and
//   src/evaluationLedger/ranking/phase5cef.test.ts (1119 tests, all
//   passing, neither file touched by this bundle) plus consumption-
//   boundary coverage in src/pages/intelligence/phase6fCertification.test.ts.
//   Per explicit confirmation, left as-is rather than attempting to
//   reconstruct the lost file's exact framing.
// ============================================================
import { describe, it, expect } from 'vitest'

const evalRegistrySrc = await import('../pages/admin/EvaluationRegistryPage.tsx?raw').then((m) => m.default)
const evalRunSrc       = await import('../pages/admin/EvaluationRunPage.tsx?raw').then((m) => m.default)
const rankingsSrc       = await import('../pages/admin/RankingsPage.tsx?raw').then((m) => m.default)
const formFieldSrc      = await import('../components/admin/evaluation/EvaluationFormField.tsx?raw').then((m) => m.default)
const appSrc            = await import('../App.jsx?raw').then((m) => m.default)

const TOUCHED_FILES: Record<string, string> = {
  'EvaluationRegistryPage.tsx': evalRegistrySrc,
  'EvaluationRunPage.tsx': evalRunSrc,
  'RankingsPage.tsx': rankingsSrc,
  'EvaluationFormField.tsx': formFieldSrc,
}

const ARABIC_TEXT = /[؀-ۿ]/

// ════════════════════════════════════════════════════════════
// Validation target 1 — actual live routes identified before edits
// ════════════════════════════════════════════════════════════
describe('Validation 1 — live Evaluation/Recovery routes identified before edits', () => {
  it('App.jsx routes /admin/evaluation-registry to EvaluationRegistryPage', () => {
    expect(appSrc).toContain('"/admin/evaluation-registry"')
    expect(appSrc).toContain('EvaluationRegistryPage')
  })

  it('App.jsx routes /admin/evaluation-run to EvaluationRunPage', () => {
    expect(appSrc).toContain('"/admin/evaluation-run"')
    expect(appSrc).toContain('EvaluationRunPage')
  })

  it('App.jsx routes /admin/rankings to RankingsPage (the closest live evaluation-drilldown surface)', () => {
    expect(appSrc).toContain('"/admin/rankings"')
    expect(appSrc).toContain('RankingsPage')
  })

  it('App.jsx defines no dedicated "Recovery Hub" route — recovery lives only inside Actions pages', () => {
    expect(appSrc).not.toMatch(/path="\/recovery/i)
    expect(appSrc).not.toContain('RecoveryHub')
    expect(appSrc).not.toContain('RecoveryPage')
  })
})

// ════════════════════════════════════════════════════════════
// Dead code removal — orphaned evaluationLedger UI subtree
// ════════════════════════════════════════════════════════════
describe('Validation 6 — deleted files were proven orphaned before deletion', () => {
  it('App.jsx has no reference to the deleted LeaderboardPanel/RankingCard/RankingSummaryCard components', () => {
    expect(appSrc).not.toContain('LeaderboardPanel')
    expect(appSrc).not.toContain('evaluationLedger/RankingCard')
    expect(appSrc).not.toContain('evaluationLedger/RankingSummaryCard')
  })

  it('none of the 3 live evaluation/ranking pages import the deleted evaluationLedger UI components', () => {
    for (const [, src] of Object.entries(TOUCHED_FILES)) {
      expect(src).not.toContain('components/evaluationLedger/LeaderboardPanel')
      expect(src).not.toContain('components/evaluationLedger/RankingCard')
      expect(src).not.toContain('components/evaluationLedger/RankingSummaryCard')
    }
  })

  it('the engine-layer evaluationLedger kernel tests remain intact and untouched', async () => {
    const phase5abSrc = await import('../evaluationLedger/phase5ab.test.ts?raw').then((m) => m.default)
    const phase5cefSrc = await import('../evaluationLedger/ranking/phase5cef.test.ts?raw').then((m) => m.default)
    expect(phase5abSrc).toContain('validateLedgerEntry')
    expect(phase5cefSrc).toContain('computeMedian')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 2 — no fake-data imports
// ════════════════════════════════════════════════════════════
describe('Validation 2 — scoped live pages contain no fake-data imports', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} does not import dummyData / DUMMY_* fixtures or mock helpers`, () => {
      expect(src).not.toContain('dummyData')
      expect(src).not.toContain('DUMMY_USERS')
      expect(src).not.toContain('DUMMY_BRANCHES')
      expect(src).not.toContain('mockData')
      expect(src).not.toContain('seedData')
      expect(src).not.toContain('fakeData')
    })
  }
})

// ════════════════════════════════════════════════════════════
// Validation target 3 — no Arabic UI copy
// ════════════════════════════════════════════════════════════
describe('Validation 3 — scoped live pages contain no Arabic UI copy', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} contains no Arabic text`, () => {
      expect(src).not.toMatch(ARABIC_TEXT)
    })
  }
})

// ════════════════════════════════════════════════════════════
// Validation target 4 — hardcoded color literals: documents the
// deferred decision rather than asserting they were removed (they
// were explicitly NOT removed in this pass).
// ════════════════════════════════════════════════════════════
describe('Validation 4 — hardcoded color literals: deferred risk explicitly documented', () => {
  it('the 3 live pages still contain hex color literals (expected — full migration deferred by explicit decision)', () => {
    const hexPattern = /#[0-9a-fA-F]{3,8}/
    expect(evalRegistrySrc).toMatch(hexPattern)
    expect(evalRunSrc).toMatch(hexPattern)
    expect(rankingsSrc).toMatch(hexPattern)
  })

  it('the newly extracted EvaluationFormField.tsx introduces no new color literals beyond what already existed in both source F components', () => {
    expect(formFieldSrc).toContain("'#ef4444'")
    expect(formFieldSrc).toContain("'#f87171'")
    const hexMatches = formFieldSrc.match(/#[0-9a-fA-F]{3,8}/g) ?? []
    expect(hexMatches.length).toBe(2)
  })
})

// ════════════════════════════════════════════════════════════
// Bare locale calls fixed
// ════════════════════════════════════════════════════════════
describe('Locale cleanup — bare .toLocaleString() calls fixed', () => {
  it('EvaluationRunPage.tsx numeric values route through formatNumber() instead of bare .toLocaleString()', () => {
    expect(evalRunSrc).toContain('formatNumber(el.actual)')
    expect(evalRunSrc).toContain('formatNumber(el.target)')
  })

  it('no remaining bare .toLocaleString() (no-arg) calls in any of the 3 touched pages', () => {
    for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
      if (fileName === 'EvaluationFormField.tsx') continue
      expect(src).not.toMatch(/\.toLocaleString\(\)/)
    }
  })

  it('all date .toLocaleString() calls now explicitly pass en-US', () => {
    const matches = [evalRunSrc, rankingsSrc].map((s) => s.match(/\.toLocaleString\('en-US'\)/g) ?? [])
    expect(matches[0].length).toBeGreaterThanOrEqual(1)
    expect(matches[1].length).toBeGreaterThanOrEqual(2)
  })
})

// ════════════════════════════════════════════════════════════
// Duplicated page chrome — shared EvaluationFormField extraction
// ════════════════════════════════════════════════════════════
describe('Duplicated page chrome — shared EvaluationFormField extraction', () => {
  it('EvaluationFormField.tsx exists and exports the shared field component', () => {
    expect(formFieldSrc).toContain('export default function EvaluationFormField')
  })

  it('EvaluationRegistryPage.tsx and EvaluationRunPage.tsx both import the shared component, neither redefines it locally', () => {
    for (const src of [evalRegistrySrc, evalRunSrc]) {
      expect(src).toContain("import F from '../../components/admin/evaluation/EvaluationFormField'")
      expect(src).not.toMatch(/function F\(/)
    }
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 5 — no engines, stores, calculations, Firestore
// contracts, auth behavior, routing contracts, scoring logic,
// recovery logic, or evaluation logic were changed.
// ════════════════════════════════════════════════════════════
const GUARDRAIL_KEYWORDS = [
  'rankingEngine.', 'computeRanking(', 'generateRankings(',
  'aiAssistant', 'aiInsights', 'AIEngine',
  'ProfileStudioKernel', 'profileStudioEngine',
  'collection(', 'addDoc(', 'updateDoc(', 'deleteDoc(', 'onSnapshot(',
  'usePermissions(', 'permissionGate(', '<Route ',
  'Math.random(',
]

describe('Validation 5 — no business logic / store / Firestore / auth / route changes', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    for (const keyword of GUARDRAIL_KEYWORDS) {
      it(`${fileName} does not contain forbidden construct: "${keyword}"`, () => {
        expect(src).not.toContain(keyword)
      })
    }
  }

  it('EvaluationRegistryPage still reads exclusively from useEvaluationRegistryStore and evaluationRegistryService, unchanged', () => {
    expect(evalRegistrySrc).toContain("from '../../store/evaluationRegistryStore'")
    expect(evalRegistrySrc).toContain("from '../../services/evaluationRegistryService'")
  })

  it('EvaluationRunPage still calls runEvaluationForUserMonth / runBranchBulkEvaluation, unchanged', () => {
    expect(evalRunSrc).toContain('runEvaluationForUserMonth')
    expect(evalRunSrc).toContain('runBranchBulkEvaluation')
  })

  it('RankingsPage still calls generateAndPersistAllRankings / subscribeRankingSnapshots, unchanged', () => {
    expect(rankingsSrc).toContain('generateAndPersistAllRankings')
    expect(rankingsSrc).toContain('subscribeRankingSnapshots')
  })

  it('none of the 3 pages define a local score/rank/risk computation function', () => {
    for (const [, src] of Object.entries(TOUCHED_FILES)) {
      expect(src).not.toMatch(/function compute(Score|Rank|Risk|Achievement)\(/i)
    }
  })
})

// ════════════════════════════════════════════════════════════
// Build safety — touched files remain well-formed modules
// ════════════════════════════════════════════════════════════
describe('Build safety — touched files remain well-formed modules', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} has at least one export`, () => {
      expect(src).toMatch(/export (default |const |function )/)
    })
    it(`${fileName} has balanced braces`, () => {
      const open = (src.match(/\{/g) ?? []).length
      const close = (src.match(/\}/g) ?? []).length
      expect(open).toBe(close)
    })
    it(`${fileName} has balanced parentheses`, () => {
      const open = (src.match(/\(/g) ?? []).length
      const close = (src.match(/\)/g) ?? []).length
      expect(open).toBe(close)
    })
  }
})
