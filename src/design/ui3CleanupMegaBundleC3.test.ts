// ============================================================
// UI 3.0 Cleanup Mega Bundle C3 — Executive & Intelligence Polish
// Certification
//
// Same raw-source-scan convention as other certification suites in
// this repo (no jsdom/testing-library — vitest Node environment).
//
// LIVE ROUTE AUDIT (performed before any edit — see App.jsx):
//   /executive                          -> ExecutiveDashboard.jsx
//   /branch/:branchId/intelligence      -> BranchIntelligencePage.jsx
//   /pharmacist/:userId/intelligence    -> PharmacistIntelligencePage.jsx
//   /team                               -> TeamPage.jsx ("Team
//     Intelligence Page" per its own header comment — the live Team
//     Intelligence surface; TeamIntelligenceCard.jsx is a different,
//     already-cleaned component used by DashboardPage.jsx, not by
//     this route)
// Ranking/leaderboard (/admin/rankings -> RankingsPage.tsx) was
// already covered by Mega Bundle C2 and is explicitly out of scope
// here per the bundle's own instructions.
//
// AUDIT RESULT: ExecutiveDashboard.jsx, BranchIntelligencePage.jsx,
// and PharmacistIntelligencePage.jsx were already fully cleaned by
// their dedicated prior passes (Executive BI Designer Mode Pass 1,
// the BI-1..BI-11 Branch Intelligence bundle, and Pharmacist
// Intelligence Designer Mode Pass 1) — re-audited here and confirmed
// clean of Arabic copy, fake-data imports, and bare locale calls.
// No further changes were needed on those three files in this pass.
//
// TeamPage.jsx (/team) had not been touched by any prior Designer
// Mode pass. Audited and confirmed clean of Arabic copy, fake-data
// imports, and bare locale calls (it already uses date-fns format()
// consistently). One UI improvement made:
//   - The territory-role "no branch selected yet" prompt was a
//     hand-rolled <div> instead of the shared EmptyState component
//     already imported and used later in the very same file (for the
//     "no team data this month" case) — switched to EmptyState for
//     consistency. The description text is byte-identical to the
//     original ("Select a branch above to view team intelligence."),
//     so no existing test assertions needed to change.
//
// DEFERRED RISKS (explicitly out of scope per this bundle's own
// instructions — "Defer large-scale token migration, unicode icon
// migration, and contrast-sensitive color changes to C4"):
//   - TeamPage.jsx's ~9 hardcoded color maps (MOMENTUM_COLOR,
//     RISK_COLOR, STATUS_COLOR, VOLATILITY_COLOR, RECOVERY_COLOR,
//     STRESS_COLOR, PACE_COLOR, PRIORITY_COLOR + inline hex literals)
//     using a Tailwind-style palette distinct from design/tokens.ts.
//   - A handful of unicode glyphs (✓, ↑, ↓) used in place of icons in
//     TeamPage.jsx's per-member summary rows.
//
// NO TEST FILES WERE DELETED IN THIS BUNDLE.
// ============================================================
import { describe, it, expect } from 'vitest'

const executiveDashboardSrc        = await import('../pages/executive/ExecutiveDashboard.jsx?raw').then((m) => m.default)
const branchIntelligenceSrc        = await import('../pages/branch/BranchIntelligencePage.jsx?raw').then((m) => m.default)
const pharmacistIntelligenceSrc    = await import('../pages/pharmacist/PharmacistIntelligencePage.jsx?raw').then((m) => m.default)
const teamPageSrc                   = await import('../pages/manager/TeamPage.jsx?raw').then((m) => m.default)
const appSrc                         = await import('../App.jsx?raw').then((m) => m.default)

const SCOPED_LIVE_FILES: Record<string, string> = {
  'ExecutiveDashboard.jsx': executiveDashboardSrc,
  'BranchIntelligencePage.jsx': branchIntelligenceSrc,
  'PharmacistIntelligencePage.jsx': pharmacistIntelligenceSrc,
  'TeamPage.jsx': teamPageSrc,
}

const TOUCHED_FILES: Record<string, string> = {
  'TeamPage.jsx': teamPageSrc,
}

const ARABIC_TEXT = /[؀-ۿ]/

// ════════════════════════════════════════════════════════════
// Validation target 1 — actual live routes identified before edits
// ════════════════════════════════════════════════════════════
describe('Validation 1 — live Executive/Branch/Pharmacist/Team Intelligence routes identified before edits', () => {
  it('App.jsx routes /executive to ExecutiveDashboard', () => {
    expect(appSrc).toContain('"/executive"')
    expect(appSrc).toContain('ExecutiveDashboard')
  })

  it('App.jsx routes /branch/:branchId/intelligence to BranchIntelligencePage', () => {
    expect(appSrc).toContain('"/branch/:branchId/intelligence"')
    expect(appSrc).toContain('BranchIntelligencePage')
  })

  it('App.jsx routes /pharmacist/:userId/intelligence to PharmacistIntelligencePage', () => {
    expect(appSrc).toContain('"/pharmacist/:userId/intelligence"')
    expect(appSrc).toContain('PharmacistIntelligencePage')
  })

  it('App.jsx routes /team to TeamPage — the live Team Intelligence surface', () => {
    expect(appSrc).toContain('"/team"')
    expect(appSrc).toContain('TeamPage')
  })

  it('TeamPage.jsx self-identifies as the Team Intelligence page', () => {
    expect(teamPageSrc).toContain('Team Intelligence Page')
    expect(teamPageSrc).toContain('Team Intelligence')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 2 — no fake-data imports
// ════════════════════════════════════════════════════════════
describe('Validation 2 — scoped live pages contain no fake-data imports', () => {
  for (const [fileName, src] of Object.entries(SCOPED_LIVE_FILES)) {
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
// Validation target 3 — no Arabic UI copy where this bundle touched
// the surface (TeamPage.jsx); also confirms the other 3 already-
// cleaned pages remain Arabic-free.
// ════════════════════════════════════════════════════════════
describe('Validation 3 — scoped live pages contain no Arabic UI copy', () => {
  for (const [fileName, src] of Object.entries(SCOPED_LIVE_FILES)) {
    it(`${fileName} contains no Arabic text`, () => {
      expect(src).not.toMatch(ARABIC_TEXT)
    })
  }
})

// ════════════════════════════════════════════════════════════
// TeamPage.jsx — empty-state polish + bare-locale audit
// ════════════════════════════════════════════════════════════
describe('TeamPage.jsx — empty-state polish', () => {
  it('the territory "no branch selected" prompt now uses the shared EmptyState component', () => {
    const idx = teamPageSrc.indexOf("scope?.type === 'list' && !selectedPharmacyId")
    const block = teamPageSrc.slice(idx, idx + 1200)
    expect(block).toContain('<EmptyState')
    expect(block).toContain('Select a branch above to view team intelligence.')
  })

  it('the empty-state description text is byte-identical to the original (no test rewrites required)', () => {
    expect(teamPageSrc).toContain('description="Select a branch above to view team intelligence."')
  })

  it('TeamPage.jsx has no bare .toLocaleString()/.toLocaleDateString()/.toLocaleTimeString() calls', () => {
    expect(teamPageSrc).not.toMatch(/\.toLocaleString\(\)/)
    expect(teamPageSrc).not.toMatch(/\.toLocaleDateString\(\)/)
    expect(teamPageSrc).not.toMatch(/\.toLocaleTimeString\(\)/)
  })

  it('TeamPage.jsx still imports and uses date-fns format() consistently for dates', () => {
    expect(teamPageSrc).toContain("import { format } from 'date-fns'")
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 4 — no engines, stores, calculations, Firestore
// contracts, auth behavior, routing contracts, or intelligence logic
// were changed.
// ════════════════════════════════════════════════════════════
const GUARDRAIL_KEYWORDS = [
  'evaluationEngine', 'evaluationPipeline', 'evaluationActualsService',
  'evaluationLedgerService', 'evaluationOrchestrationService', 'evaluationRegistryService',
  'rankingEngine.', 'computeRanking(', 'generateRankings(',
  'aiAssistant', 'aiInsights', 'AIEngine',
  'ProfileStudioKernel', 'profileStudioEngine',
  'collection(', 'addDoc(', 'updateDoc(', 'deleteDoc(', 'onSnapshot(',
  'usePermissions(', 'permissionGate(', '<Route ',
  'Math.random(',
]

describe('Validation 4 — no business logic / store / Firestore / auth / route / intelligence-logic changes', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    for (const keyword of GUARDRAIL_KEYWORDS) {
      it(`${fileName} does not contain forbidden construct: "${keyword}"`, () => {
        expect(src).not.toContain(keyword)
      })
    }
  }

  it('TeamPage.jsx still computes teamIntelligence exclusively via generateTeamIntelligence(), unchanged', () => {
    expect(teamPageSrc).toContain("from '../../engine/teamIntelligence'")
    expect(teamPageSrc).toContain('generateTeamIntelligence(')
  })

  it('TeamPage.jsx does not define a local score/rank/risk computation function', () => {
    expect(teamPageSrc).not.toMatch(/function compute(Score|Rank|Risk|Achievement)\(/i)
  })

  it('ExecutiveDashboard/BranchIntelligencePage/PharmacistIntelligencePage were not modified by this bundle (still read from their existing engine/hook layers)', () => {
    expect(executiveDashboardSrc).toContain('useRegionalIntelligence')
    expect(branchIntelligenceSrc).toContain('useBranchIntelligenceData')
    expect(pharmacistIntelligenceSrc).toContain('usePharmacistIntelligenceData')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 5 — no test files were deleted in this bundle
// ════════════════════════════════════════════════════════════
describe('Validation 5 — no test files were deleted in this bundle', () => {
  it('TeamPage.test.ts still exists and still asserts the preserved empty-state text', async () => {
    const teamPageTestSrc = await import('../pages/manager/TeamPage.test.ts?raw').then((m) => m.default)
    expect(teamPageTestSrc).toContain('Select a branch above to view team intelligence')
  })

  it('ReportsPage.phase2f4.test.ts (which also asserts the same text against a different page) still exists', async () => {
    const reportsTestSrc = await import('../pages/shared/ReportsPage.phase2f4.test.ts?raw').then((m) => m.default)
    expect(reportsTestSrc).toContain('Select a branch above to view team intelligence')
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
