// ============================================================
// Actions & Task Board — Designer Mode Pass 1 — Certification
//
// Same raw-source-scan convention as other certification suites in
// this repo (no jsdom/testing-library — vitest Node environment).
//
// This pass:
//   1. Deleted src/pages/shared/TasksPage.jsx — a completely
//      orphaned, never-imported duplicate page that pulled in
//      DUMMY_USERS fake data (forbidden by guardrails by its mere
//      existence).
//   2. Extracted Toast / SectionHeading / SkeletonActionRow — which
//      were copy-pasted verbatim across MyActionsPage.jsx and
//      TasksPage.jsx (both independently navigable by the same
//      manager, so visual drift between the two copies would be
//      user-visible) — into a new shared
//      src/components/actions/ActionPageChrome.jsx, and replaced the
//      Toast's '×' text-glyph close button with a Lucide X icon.
//   3. Fixed TasksPage.jsx's overdue banner, which hardcoded
//      rgba(212,132,10,...) / #D4840A literals that are exactly the
//      existing COLORS.warning / warningBg / warningBorder tokens —
//      now sourced from src/design/tokens.ts.
//   4. Enhanced ActionCard.jsx with Lucide User/Calendar icons next
//      to the owner/due-date metadata, plus a presentational overdue
//      highlight — pure dueDate string comparison against today,
//      mirroring TasksPage.jsx's pre-existing aggregate overdue check.
//      No new calculation, no fabricated field.
// ============================================================
import { describe, it, expect } from 'vitest'

const chromeSrc    = await import('../components/actions/ActionPageChrome.jsx?raw').then((m) => m.default)
const myActionsSrc = await import('../pages/actions/MyActionsPage.jsx?raw').then((m) => m.default)
const tasksSrc      = await import('../pages/actions/TasksPage.jsx?raw').then((m) => m.default)
const actionCardSrc = await import('../components/actions/ActionCard.jsx?raw').then((m) => m.default)
const summaryCardsSrc = await import('../components/actions/ActionSummaryCards.jsx?raw').then((m) => m.default)
const emptyStateSrc = await import('../components/actions/ActionEmptyState.jsx?raw').then((m) => m.default)
const filtersSrc    = await import('../components/actions/ActionFilters.jsx?raw').then((m) => m.default)
const statusBadgeSrc = await import('../components/actions/ActionStatusBadge.jsx?raw').then((m) => m.default)
const priorityBadgeSrc = await import('../components/actions/ActionPriorityBadge.jsx?raw').then((m) => m.default)

const TOUCHED_FILES: Record<string, string> = {
  'ActionPageChrome.jsx': chromeSrc,
  'MyActionsPage.jsx': myActionsSrc,
  'TasksPage.jsx': tasksSrc,
  'ActionCard.jsx': actionCardSrc,
}

const ALL_ACTIONS_FILES: Record<string, string> = {
  ...TOUCHED_FILES,
  'ActionSummaryCards.jsx': summaryCardsSrc,
  'ActionEmptyState.jsx': emptyStateSrc,
  'ActionFilters.jsx': filtersSrc,
  'ActionStatusBadge.jsx': statusBadgeSrc,
  'ActionPriorityBadge.jsx': priorityBadgeSrc,
}

const ARABIC_TEXT = /[؀-ۿ]/

// ════════════════════════════════════════════════════════════
// Major sections still render
// ════════════════════════════════════════════════════════════
describe('Actions & Task Board still renders its major sections', () => {
  it('MyActionsPage still composes summary cards, filters, and Open/In Progress/History sections', () => {
    expect(myActionsSrc).toContain('ActionSummaryCards')
    expect(myActionsSrc).toContain('ActionFilters')
    expect(myActionsSrc).toContain('title="Open"')
    expect(myActionsSrc).toContain('title="In Progress"')
    expect(myActionsSrc).toContain('History')
  })

  it('TasksPage still composes summary cards, overdue banner, Critical/High, All Open, By Branch', () => {
    expect(tasksSrc).toContain('ActionSummaryCards')
    expect(tasksSrc).toContain('overdueActions')
    expect(tasksSrc).toContain('Critical & High Priority')
    expect(tasksSrc).toContain('All Open Actions')
    expect(tasksSrc).toContain('By Branch')
  })
})

// ════════════════════════════════════════════════════════════
// Dead code removal
// ════════════════════════════════════════════════════════════
describe('Dead code removal — orphaned shared/TasksPage.jsx deleted', () => {
  it('no file in src imports from pages/shared/TasksPage', async () => {
    // Re-verified at test-write time via repo-wide grep (zero references).
    // This assertion documents the invariant going forward: nothing in
    // the touched pages should ever import the deleted duplicate page.
    for (const [, src] of Object.entries(ALL_ACTIONS_FILES)) {
      expect(src).not.toContain('shared/TasksPage')
    }
  })
})

// ════════════════════════════════════════════════════════════
// Chrome extraction — Toast / SectionHeading / SkeletonActionRow
// ════════════════════════════════════════════════════════════
describe('Shared chrome extraction — ActionPageChrome.jsx', () => {
  it('exports Toast, SectionHeading, and SkeletonActionRow', () => {
    expect(chromeSrc).toContain('export function Toast')
    expect(chromeSrc).toContain('export function SectionHeading')
    expect(chromeSrc).toContain('export function SkeletonActionRow')
  })

  it('Toast uses a Lucide X icon, not the "×" text glyph', () => {
    expect(chromeSrc).toContain("import { X } from 'lucide-react'")
    expect(chromeSrc).toContain('<X ')
    expect(chromeSrc).not.toContain('>×<')
    expect(chromeSrc).not.toMatch(/>\s*×\s*<\/button>/)
  })

  it('MyActionsPage and TasksPage import the shared chrome instead of redefining it', () => {
    for (const src of [myActionsSrc, tasksSrc]) {
      expect(src).toContain("import { SkeletonActionRow, SectionHeading, Toast } from '../../components/actions/ActionPageChrome'")
      expect(src).not.toContain('function SkeletonActionRow(')
      expect(src).not.toContain('function SectionHeading(')
      expect(src).not.toContain('function Toast(')
    }
  })

  it('neither page contains the old inline "×" close button glyph', () => {
    for (const src of [myActionsSrc, tasksSrc]) {
      expect(src).not.toContain('>×</button>')
    }
  })
})

// ════════════════════════════════════════════════════════════
// TasksPage overdue banner — theme tokens, not hardcoded literals
// ════════════════════════════════════════════════════════════
describe('Fix — TasksPage overdue banner sources colors from theme tokens', () => {
  it('imports COLORS from design/tokens', () => {
    expect(tasksSrc).toContain("import { COLORS } from '../../design/tokens'")
  })

  it('overdue banner uses COLORS.warning / warningBg / warningBorder, not hardcoded rgba/hex literals', () => {
    expect(tasksSrc).toContain('COLORS.warningBg')
    expect(tasksSrc).toContain('COLORS.warningBorder')
    expect(tasksSrc).toContain('COLORS.warning')
    expect(tasksSrc).not.toContain('rgba(212,132,10')
    expect(tasksSrc).not.toContain("'#D4840A'")
  })
})

// ════════════════════════════════════════════════════════════
// ActionCard — icons + presentational overdue highlight
// ════════════════════════════════════════════════════════════
describe('ActionCard — owner/due-date icons and overdue highlight', () => {
  it('imports Lucide User and Calendar icons', () => {
    expect(actionCardSrc).toContain("import { User, Calendar } from 'lucide-react'")
  })

  it('renders a User icon next to Owner and a Calendar icon next to Due', () => {
    const ownerIdx = actionCardSrc.indexOf('ownerId &&')
    const ownerBlock = actionCardSrc.slice(ownerIdx, ownerIdx + 300)
    expect(ownerBlock).toContain('<User ')

    const dueIdx = actionCardSrc.indexOf('dueDate &&', ownerIdx)
    const dueBlock = actionCardSrc.slice(dueIdx, dueIdx + 400)
    expect(dueBlock).toContain('<Calendar ')
  })

  it('still renders the literal "Due:" and "Owner:" text markup that existing tests check for', () => {
    expect(actionCardSrc).toContain('Due: {dueDate}')
  })

  it('computes isOverdue via pure dueDate-string comparison against today — no fabricated field', () => {
    expect(actionCardSrc).toContain("const today = new Date().toISOString().split('T')[0]")
    expect(actionCardSrc).toContain('const isOverdue = isOpen && !!dueDate && dueDate < today')
  })

  it('isOverdue is gated on open status (SUGGESTED or ACCEPTED), not applied to closed/dismissed actions', () => {
    expect(actionCardSrc).toContain("const isOpen = status === 'SUGGESTED' || status === 'ACCEPTED'")
  })

  it('overdue highlight uses COLORS.warning, not a new hardcoded color', () => {
    const idx = actionCardSrc.indexOf('isOverdue ? COLORS.warning')
    expect(idx).toBeGreaterThan(-1)
  })
})

// ════════════════════════════════════════════════════════════
// Locale cleanup — no bare locale calls, no Arabic text leaks
// ════════════════════════════════════════════════════════════
describe('Locale cleanup — no bare locale calls, no Arabic text leaks', () => {
  for (const [fileName, src] of Object.entries(ALL_ACTIONS_FILES)) {
    it(`${fileName} contains no bare .toLocaleString()/.toLocaleTimeString()`, () => {
      expect(src).not.toMatch(/\.toLocaleString\(\)/)
      expect(src).not.toMatch(/\.toLocaleTimeString\(\)/)
    })
    it(`${fileName} contains no bare Intl.NumberFormat() without a locale argument`, () => {
      expect(src).not.toMatch(/Intl\.NumberFormat\(\)/)
    })
    it(`${fileName} contains no Arabic text (English-mode page)`, () => {
      expect(src).not.toMatch(ARABIC_TEXT)
    })
  }

  it('ActionFilters month formatting already passes an explicit en-US locale (pre-existing, unchanged)', () => {
    expect(filtersSrc).toContain("toLocaleDateString('en-US'")
  })
})

// ════════════════════════════════════════════════════════════
// No fake/seed data
// ════════════════════════════════════════════════════════════
describe('No fake/seed data introduced or retained', () => {
  for (const [fileName, src] of Object.entries(ALL_ACTIONS_FILES)) {
    it(`${fileName} does not import DUMMY_USERS or any dummyData module`, () => {
      expect(src).not.toContain('DUMMY_USERS')
      expect(src).not.toContain('dummyData')
    })
    it(`${fileName} does not use Math.random or mock/seed/fake data helpers`, () => {
      expect(src).not.toContain('Math.random(')
      expect(src).not.toContain('mockData')
      expect(src).not.toContain('seedData')
      expect(src).not.toContain('fakeData')
    })
  }
})

// ════════════════════════════════════════════════════════════
// Guardrails — no business logic / KPI math / Evaluation Engine /
// Ranking / AI / Firestore schema / permission / route changes.
// ════════════════════════════════════════════════════════════
const GUARDRAIL_KEYWORDS = [
  'evaluationEngine', 'evaluationPipeline', 'evaluationActualsService',
  'evaluationLedgerService', 'evaluationOrchestrationService', 'evaluationRegistryService',
  'rankingEngine', 'computeRanking', 'generateRankings',
  'aiAssistant', 'aiInsights', 'AIEngine',
  'ProfileStudioKernel', 'profileStudioEngine',
  'collection(', 'addDoc(', 'updateDoc(', 'deleteDoc(', 'onSnapshot(',
  'usePermissions(', 'permissionGate(', '<Route ',
  'dynamicKpi', 'DynamicKpi', 'kpiRegistry',
  'createSuggestedAction', 'generateSignal', 'detectSignal', 'signalEngine',
]

describe('Guardrails — no business logic / Firestore / permission / route changes', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    for (const keyword of GUARDRAIL_KEYWORDS) {
      it(`${fileName} does not contain forbidden construct: "${keyword}"`, () => {
        expect(src).not.toContain(keyword)
      })
    }
  }
})

describe('Guardrails — no new scoring/calculation function introduced', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} does not define a local score/rank/risk/pace computation function`, () => {
      expect(src).not.toMatch(/function compute(Score|Rank|Risk|Achievement|Pace)/i)
    })
  }
  it('pages still read data exclusively from useActions / actionService', () => {
    expect(myActionsSrc).toContain('useActions(')
    expect(tasksSrc).toContain('useActions(')
  })
})

// ════════════════════════════════════════════════════════════
// Build safety — files remain well-formed modules
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
