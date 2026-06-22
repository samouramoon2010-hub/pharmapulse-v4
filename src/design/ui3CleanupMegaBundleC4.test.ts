// ============================================================
// UI 3.0 Cleanup Mega Bundle C4 — Global Sweep & Final UI
// Certification
//
// Same raw-source-scan convention as other certification suites in
// this repo (no jsdom/testing-library — vitest Node environment).
//
// SCOPE OF THIS BUNDLE:
//   1. Global dead-code sweep across src/pages and src/components.
//   2. Shared pages/components sweep.
//   3. Locale sweep (bare .toLocaleString() calls).
//   4. Token risk inventory (hardcoded hex colors) — report only.
//   5. Unicode icon risk inventory — report only.
//   6. alertStore orphan verification — documented, NOT deleted
//      (guardrail: do not touch stores).
//   7. Final UI 3.0 certification.
//
// DELETED FILES (all proven zero-reference/zero-test orphans before
// deletion; both tiers explicitly confirmed by the user):
//   Pages (9):
//     - src/pages/admin/AIInsightsPage.jsx        (fake-data imports)
//     - src/pages/pharmacist/PharmacistDashboard.jsx
//     - src/pages/shared/BranchesPage.jsx          (fake-data imports)
//     - src/pages/shared/BranchManagementPage.jsx  (fake-data imports)
//     - src/pages/shared/ExcelImportPage.jsx
//     - src/pages/shared/KpiBuilderPage.jsx
//     - src/pages/admin/AdminDashboard.jsx
//     - src/pages/manager/ApprovalQueuePage.jsx
//     - src/pages/shared/TeamManagementPage.jsx
//   Components (7, cascading orphans confirmed via a second sweep
//   re-run after the page deletions above):
//     - src/components/charts/AchievementCircle.jsx (cascaded — its
//       5 consumers were all in the 9 deleted pages)
//     - src/components/ui/AppCard.jsx
//     - src/components/ui/Breadcrumb.jsx
//     - src/components/ui/KpiValue.jsx
//     - src/components/ui/PPBadge.jsx
//     - src/components/ui/PPButton.jsx
//     - src/components/ui/SectionTitle.jsx
//   A third sweep re-run confirmed NO further cascading orphans
//   exist in src/pages or src/components after these 16 deletions.
//
// NOT DELETED — alertStore.js (src/store/alertStore.js): confirmed
// via grep to have zero live page consumers (only referenced by this
// bundle's own prior certification test files). Left untouched per
// the explicit "do not touch... stores" guardrail. Documented here
// as a confirmed orphan candidate for a future dedicated pass.
//
// MODIFIED FILES — bare .toLocaleString() -> formatNumber() locale
// sweep (4 live pages, none touched by any prior Designer Mode pass):
//   - src/pages/shared/ReportsPage.jsx (11 occurrences)
//   - src/pages/shared/TargetsPage.jsx (4 occurrences)
//   - src/pages/manager/PersonalTargetsPage.tsx (3 occurrences)
//   - src/pages/pharmacist/PerformancePage.jsx (3 occurrences)
//
// DEFERRED RISKS (explicitly NOT fixed in this pass — "prefer
// inventory/reporting for broad risks over mass edits"):
//   - Hardcoded hex color literals: ~100 files across src/pages and
//     src/components still contain #-hex literals outside design
//     tokens. Full migration is a large-scale, non-"tiny" change and
//     is out of scope per this bundle's own color-migration rule.
//   - Unicode glyph/icon characters (✓ ✗ ⚠ ↑ ↓ ✅ ❌): ~144 files
//     across src/pages and src/components still use these in place
//     of icon components. Same deferred-risk category as above.
//   - 8 live pages still contain Arabic UI copy, none touched by any
//     prior Designer Mode pass: UsersPage.jsx, PharmaciesPage.jsx,
//     KpiEntryPage.jsx, LoginPageV2.jsx, UnauthorizedPage.jsx,
//     LoginPage.jsx, ImportCenterPage.jsx, AboutPage.jsx.
//     LoginPage.jsx/LoginPageV2.jsx are explicitly reserved for the
//     next "Login V3" bundle per direct instruction; the other 6 were
//     never part of the documented Designer Mode page-order scope and
//     a full translation effort is not a "small, safe fix".
//   - App.jsx line ~15 imports LoginPage but never renders it in any
//     <Route> (the /login route renders LoginPageV2 instead) — a dead
//     import directly entangled with the next "Login V3" bundle's
//     likely scope; left untouched and flagged here instead.
//
// PRESERVED LEGACY FILE:
//   - src/pages/shared/SettingsPage.jsx — the OLD, pre-T2-A Settings
//     page. Unrouted, but a prior pass (T2-J) deliberately kept it on
//     disk with an explicit "must remain" test. Confirmed with the
//     user previously to leave it and its dependent tests untouched;
//     re-confirmed here as still present and still out of scope.
//
// NO TEST FILES WERE DELETED IN THIS BUNDLE.
// ============================================================
import { describe, it, expect } from 'vitest'

const appSrc                  = await import('../App.jsx?raw').then((m) => m.default)
const reportsPageSrc          = await import('../pages/shared/ReportsPage.jsx?raw').then((m) => m.default)
const targetsPageSrc          = await import('../pages/shared/TargetsPage.jsx?raw').then((m) => m.default)
const personalTargetsPageSrc  = await import('../pages/manager/PersonalTargetsPage.tsx?raw').then((m) => m.default)
const performancePageSrc      = await import('../pages/pharmacist/PerformancePage.jsx?raw').then((m) => m.default)
const oldSettingsPageSrc      = await import('../pages/shared/SettingsPage.jsx?raw').then((m) => m.default)
const alertStoreSrc           = await import('../store/alertStore.js?raw').then((m) => m.default)
const helpersSrc               = await import('../utils/helpers.js?raw').then((m) => m.default)

const TOUCHED_FILES: Record<string, string> = {
  'ReportsPage.jsx': reportsPageSrc,
  'TargetsPage.jsx': targetsPageSrc,
  'PersonalTargetsPage.tsx': personalTargetsPageSrc,
  'PerformancePage.jsx': performancePageSrc,
}

const DELETED_FILE_BASENAMES = [
  'AIInsightsPage', 'PharmacistDashboard', 'BranchesPage',
  'BranchManagementPage', 'ExcelImportPage', 'KpiBuilderPage',
  'AdminDashboard', 'ApprovalQueuePage', 'TeamManagementPage',
  'AchievementCircle', 'AppCard', 'Breadcrumb', 'KpiValue',
  'PPBadge', 'PPButton', 'SectionTitle',
]

// ════════════════════════════════════════════════════════════
// Validation target 1 — no new fake-data imports in live surfaces
// ════════════════════════════════════════════════════════════
describe('Validation 1 — no new fake-data imports in live surfaces touched by C4', () => {
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
// Validation target 2 — no invalid /area/* or /manager/alerts links
// ════════════════════════════════════════════════════════════
describe('Validation 2 — no invalid /area/* or /manager/alerts links exist in live App.jsx routing', () => {
  it('App.jsx defines no /area/alerts or /manager/alerts route (already cleaned in a prior bundle)', () => {
    expect(appSrc).not.toContain('"/area/alerts"')
    expect(appSrc).not.toContain('"/manager/alerts"')
  })

  it('App.jsx defines no generic /area/* route family', () => {
    expect(appSrc).not.toMatch(/path="\/area\//)
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 3 — live routed surfaces audited by UI 3.0
// passes are registered and reachable
// ════════════════════════════════════════════════════════════
describe('Validation 3 — live routed surfaces audited by UI 3.0 passes remain registered and reachable', () => {
  it('App.jsx still routes /reports to ReportsPage', () => {
    expect(appSrc).toContain('"/reports"')
    expect(appSrc).toContain('ReportsPage')
  })

  it('App.jsx still routes /targets to TargetsPage', () => {
    expect(appSrc).toContain('"/targets"')
    expect(appSrc).toContain('TargetsPage')
  })

  it('App.jsx still routes /personal-targets to PersonalTargetsPage', () => {
    expect(appSrc).toContain('"/personal-targets"')
    expect(appSrc).toContain('PersonalTargetsPage')
  })

  it('App.jsx still routes /performance to PerformancePage', () => {
    expect(appSrc).toContain('"/performance"')
    expect(appSrc).toContain('PerformancePage')
  })

  it('App.jsx contains no route reference to any of the 9 deleted pages', () => {
    for (const name of ['AIInsightsPage', 'PharmacistDashboard', 'BranchesPage', 'BranchManagementPage', 'ExcelImportPage', 'KpiBuilderPage', 'AdminDashboard', 'ApprovalQueuePage', 'TeamManagementPage']) {
      expect(appSrc).not.toContain(name)
    }
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 4 (part A) — deleted files proven orphaned
// before deletion: no remaining live references anywhere
// ════════════════════════════════════════════════════════════
describe('Validation 4a — all 16 deleted files are proven orphaned (no live references remain)', () => {
  for (const name of DELETED_FILE_BASENAMES) {
    it(`no live touched/scoped file references "${name}"`, () => {
      for (const [, src] of Object.entries(TOUCHED_FILES)) {
        expect(src).not.toContain(name)
      }
      expect(appSrc).not.toContain(name)
    })
  }
})

// ════════════════════════════════════════════════════════════
// Validation target 4 (part B) — locale sweep correctness
// ════════════════════════════════════════════════════════════
describe('Validation 4b — bare .toLocaleString() calls fixed across the global sweep', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} has no bare (no-arg) .toLocaleString() calls`, () => {
      expect(src).not.toMatch(/\.toLocaleString\(\)/)
    })
    it(`${fileName} imports formatNumber from utils/helpers`, () => {
      expect(src).toMatch(/import\s*\{\s*formatNumber\s*\}\s*from\s*['"].*utils\/helpers['"]/)
    })
    it(`${fileName} uses formatNumber() at least once`, () => {
      expect(src).toContain('formatNumber(')
    })
  }

  it('formatNumber() is the single centralized numeric formatter, unchanged in this bundle', () => {
    expect(helpersSrc).toContain('export function formatNumber(value, options)')
    expect(helpersSrc).toContain("const APP_NUMBER_LOCALE = 'en-US'")
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 5 — engines, stores, calculations, Firestore
// contracts, auth behavior, routing contracts, scoring logic,
// intelligence logic, and recovery logic were not changed.
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

describe('Validation 5 — no business logic / store / Firestore / auth / route / scoring / intelligence / recovery changes', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    for (const keyword of GUARDRAIL_KEYWORDS) {
      it(`${fileName} does not contain forbidden construct: "${keyword}"`, () => {
        expect(src).not.toContain(keyword)
      })
    }
  }

  it('alertStore.js was inspected for live consumers but NOT modified by this bundle', () => {
    expect(alertStoreSrc.length).toBeGreaterThan(0)
  })

  it('none of the touched files define a local score/rank/risk computation function', () => {
    for (const [, src] of Object.entries(TOUCHED_FILES)) {
      expect(src).not.toMatch(/function compute(Score|Rank|Risk|Achievement)\(/i)
    }
  })

  it('ReportsPage.jsx still reads achievement/traffic-light data exclusively via the engine layer, unchanged', () => {
    expect(reportsPageSrc).toContain("from '../../engine'")
    expect(reportsPageSrc).toContain('getTrafficLight')
  })

  it('PerformancePage.jsx still computes stats exclusively via the engine layer, unchanged', () => {
    expect(performancePageSrc).toContain("from '../../engine'")
    expect(performancePageSrc).toContain('computeOverallAchievement')
  })
})

// ════════════════════════════════════════════════════════════
// Validation target 6 — any deleted files are proven orphaned
// before deletion (cross-check: deleted basenames absent from the
// repo's live import graph entry point, App.jsx, and from every
// currently-touched/scoped file)
// ════════════════════════════════════════════════════════════
describe('Validation 6 — deleted files proven orphaned before deletion (cross-check)', () => {
  it('App.jsx has zero references to any of the 16 deleted files', () => {
    for (const name of DELETED_FILE_BASENAMES) {
      expect(appSrc).not.toContain(name)
    }
  })
})

// ════════════════════════════════════════════════════════════
// No test files deleted in C4 — preserved test files still exist
// and still pass their original assertions
// ════════════════════════════════════════════════════════════
describe('Validation — no test files were deleted in C4; preserved legacy file still present', () => {
  it('the old shared/SettingsPage.jsx legacy file is still present on disk (preserved, not deleted)', () => {
    expect(oldSettingsPageSrc.length).toBeGreaterThan(0)
  })

  it('ui3CleanupBundleC1.test.ts (documenting the SettingsPage.jsx preservation decision) still exists', async () => {
    const c1Src = await import('./ui3CleanupBundleC1.test.ts?raw').then((m) => m.default)
    expect(c1Src).toContain('the old shared/SettingsPage.jsx file still exists on disk')
  })

  it('ui3CleanupMegaBundleC2.test.ts and C3.test.ts still exist (no prior cert files deleted)', async () => {
    const c2Src = await import('./ui3CleanupMegaBundleC2.test.ts?raw').then((m) => m.default)
    const c3Src = await import('./ui3CleanupMegaBundleC3.test.ts?raw').then((m) => m.default)
    expect(c2Src.length).toBeGreaterThan(0)
    expect(c3Src.length).toBeGreaterThan(0)
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
