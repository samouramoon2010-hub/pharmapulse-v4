// ============================================================
// Pharmacist Intelligence — Designer Mode Pass 1 — Certification
//
// Same raw-source-scan convention as other certification suites in
// this repo (no jsdom/testing-library — vitest Node environment).
//
// This pass added a premium "Pharmacist Hero" band (Score, Momentum,
// Focus KPI, Top Strength, and — manager view only — Branch Rank),
// mirroring the Executive Summary Band pattern already established
// on Branch Intelligence for visual consistency across the UI3-
// migrated pages. It also fixed 9 bare locale calls (entry numbers
// through formatNumber(), the two "Generated At"/"Last Updated"
// timestamps through .toLocaleString('en-US')) and de-duplicated the
// focusKpiKey/focusEntry computation (previously computed inline
// inside the section-composition IIFE, now computed once and shared
// with the Hero).
//
// PharmacistKpiCard was deliberately NOT forced onto the official
// KpiCard template: KpiCard computes its own requiredDailyPace from
// gap/daysRemaining, while PharmacistKpiBreakdownEntry already
// carries an engine-computed requiredPerDay. Routing it through
// KpiCard's own formula instead of the existing value would risk
// calculation drift — forbidden by guardrails ("no new KPI math").
// PharmacistKpiCard already exposes 7 of the 8 requested fields
// (name, status badge, achievement%, actual/target, gap, required
// daily pace, contribution context); trajectory/delta and a mini
// trend are not added because no per-KPI trend data exists in this
// view model (only overall momentum) — adding one would mean
// fabricating data, which is forbidden.
// ============================================================
import { describe, it, expect } from 'vitest'

const pageSrc = await import('../pages/pharmacist/PharmacistIntelligencePage.jsx?raw').then((m) => m.default)
const hookSrc = await import('../pages/pharmacist/usePharmacistIntelligenceData.js?raw').then((m) => m.default)

const TOUCHED_FILES: Record<string, string> = {
  'PharmacistIntelligencePage.jsx': pageSrc,
  'usePharmacistIntelligenceData.js': hookSrc,
}

const ARABIC_TEXT = /[؀-ۿ]/

// ════════════════════════════════════════════════════════════
// Major sections still render
// ════════════════════════════════════════════════════════════
describe('Pharmacist Intelligence still renders its major sections', () => {
  it('Context Bar, Hero, KPI Breakdown, Strengths, Accountability, and Coaching are all present', () => {
    expect(pageSrc).toContain('Pharmacist Intelligence')
    expect(pageSrc).toContain('function HeroTile')
    expect(pageSrc).toContain('title="KPI Performance Breakdown"')
    expect(pageSrc).toContain('Strengths & Weaknesses')
    expect(pageSrc).toContain('title="Accountability Intelligence"')
    expect(pageSrc).toContain('title="Coaching Intelligence"')
  })

  it('manager-only sections (Ranking, Contribution, Supervisor Action Center) are still composed in manager mode', () => {
    const composeIdx = pageSrc.indexOf("if (mode === 'self')")
    const managerBlock = pageSrc.slice(composeIdx)
    expect(managerBlock).toContain('{sectionRanking}')
    expect(managerBlock).toContain('{sectionContribution}')
    expect(managerBlock).toContain('{sectionActionCenter}')
  })
})

// ════════════════════════════════════════════════════════════
// Pharmacist Hero
// ════════════════════════════════════════════════════════════
describe('Pharmacist Hero — premium top hero (Designer Mode pass)', () => {
  it('shows Score, Momentum, Focus KPI, and Top Strength tiles', () => {
    expect(pageSrc).toContain('label="Score"')
    expect(pageSrc).toContain('label="Momentum"')
    expect(pageSrc).toContain('label="Focus KPI"')
    expect(pageSrc).toContain('label="Top Strength"')
  })

  it('Branch Rank tile is gated on viewModel.rankingContext.branchRank (manager-only, no fabricated rank for self view)', () => {
    const idx = pageSrc.indexOf('label="Branch Rank"')
    const block = pageSrc.slice(Math.max(0, idx - 200), idx)
    expect(block).toContain('viewModel.rankingContext.branchRank &&')
  })

  it('Hero reads only existing identity/performance/strengths fields — no new calculation', () => {
    const idx = pageSrc.indexOf('Pharmacist Hero (Designer Mode pass)')
    const block = pageSrc.slice(idx, idx + 3000)
    expect(block).toContain('viewModel.performanceSummary.performanceScore')
    expect(block).toContain('viewModel.performanceSummary.momentumDirection')
    expect(block).toContain('viewModel.performanceSummary.momentumDelta')
    expect(block).not.toMatch(/function compute(Score|Rank|Risk|Achievement|Momentum)/i)
  })

  it('focusKpiKey/focusEntry/topStrengthKey are computed once, before the early-return guards, and reused by both the Hero and "My Focus Today"', () => {
    expect(pageSrc).toContain('const focusKpiKey = viewModel?.strengthsWeaknesses.biggestOpportunity')
    expect(pageSrc).toContain('const topStrengthKey = viewModel?.strengthsWeaknesses.topStrengths[0] ?? null')
    // Only ONE definition of focusKpiKey should remain (no duplicate
    // recomputation inside the section-composition IIFE anymore).
    const occurrences = pageSrc.match(/const focusKpiKey =/g) ?? []
    expect(occurrences.length).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════
// Hooks-order safety — unchanged from the documented Phase 2D fix
// ════════════════════════════════════════════════════════════
describe('Hooks-order safety is preserved', () => {
  it('all hooks (useState/useScopeProfile/usePharmacistIntelligenceData) are called unconditionally before any early return', () => {
    const hookCallIdx = pageSrc.indexOf('usePharmacistIntelligenceData(')
    const firstReturnIdx = pageSrc.indexOf('if (ownProfileDenied)')
    expect(hookCallIdx).toBeGreaterThan(-1)
    expect(firstReturnIdx).toBeGreaterThan(-1)
    expect(hookCallIdx).toBeLessThan(firstReturnIdx)
  })

  it('the Phase 2D hooks-order hotfix documentation comment is still present', () => {
    expect(pageSrc).toContain('hooks-order hotfix')
    expect(pageSrc).toContain('Rendered more hooks than during the previous render')
  })

  it('manager same-branch access check (isPharmacyAllowed) is unchanged', () => {
    expect(pageSrc).toContain("userProfile?.role !== 'pharmacist' && !isPharmacyAllowed(scope, branchId ?? '')")
  })

  it('pharmacist own-profile check (ownProfileDenied) is unchanged', () => {
    expect(pageSrc).toContain("userProfile?.role === 'pharmacist' && userProfile.uid !== userId")
  })
})

// ════════════════════════════════════════════════════════════
// Locale cleanup — no bare locale calls, no Arabic text leaks
// ════════════════════════════════════════════════════════════
describe('Locale cleanup — no bare locale calls, no Arabic text leaks', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} contains no bare .toLocaleString()/.toLocaleDateString()/.toLocaleTimeString()`, () => {
      expect(src).not.toMatch(/\.toLocaleString\(\)/)
      expect(src).not.toMatch(/\.toLocaleDateString\(\)/)
      expect(src).not.toMatch(/\.toLocaleTimeString\(\)/)
    })
    it(`${fileName} contains no bare Intl.NumberFormat() without a locale argument`, () => {
      expect(src).not.toMatch(/Intl\.NumberFormat\(\)/)
    })
    it(`${fileName} contains no Arabic text (English-mode page)`, () => {
      expect(src).not.toMatch(ARABIC_TEXT)
    })
  }

  it('all per-KPI numeric values route through formatNumber()', () => {
    expect(pageSrc).toContain('formatNumber(entry.remaining)')
    expect(pageSrc).toContain('formatNumber(entry.requiredPerDay, { maximumFractionDigits: 1 })')
    expect(pageSrc).toContain('formatNumber(entry.actual)')
    expect(pageSrc).toContain('formatNumber(entry.target)')
    expect(pageSrc).toContain('formatNumber(entry.pharmacistActual)')
    expect(pageSrc).toContain('formatNumber(entry.branchTotal)')
  })

  it('timestamps explicitly pass the en-US locale', () => {
    const matches = pageSrc.match(/new Date\(viewModel\.metadata\.generatedAt\)\.toLocaleString\('en-US'\)/g) ?? []
    expect(matches.length).toBe(2)
  })
})

// ════════════════════════════════════════════════════════════
// Guardrails — no business logic / KPI math / Evaluation Engine /
// Ranking / AI / Firestore schema / permission / route / Profile
// Studio changes.
// ════════════════════════════════════════════════════════════
// Note: 'evaluationLedgerService' is intentionally excluded — this
// page has always legitimately READ a pharmacist's own official
// evaluation rating from it for display (fetchEvaluationResultsForUserMonth,
// pre-existing, documented in usePharmacistIntelligenceData.js's own
// header). That is reading evaluation output, not Evaluation Engine
// logic, and predates this Designer Mode pass.
const GUARDRAIL_KEYWORDS = [
  'evaluationEngine', 'evaluationPipeline', 'evaluationActualsService',
  'evaluationOrchestrationService', 'evaluationRegistryService',
  'rankingEngine', 'computeRanking', 'generateRankings',
  'aiAssistant', 'aiInsights', 'AIEngine',
  'ProfileStudioKernel', 'profileStudioEngine',
  'collection(', 'addDoc(', 'updateDoc(', 'deleteDoc(', 'onSnapshot(',
  'usePermissions(', 'permissionGate(', '<Route ',
  'Math.random(', 'mockData', 'seedData', 'fakeData',
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

describe('Guardrails — no new scoring/ranking computation introduced', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} does not define a local score/rank/risk computation function`, () => {
      expect(src).not.toMatch(/function compute(Score|Rank|Risk|Achievement)/i)
    })
  }
  it('PharmacistIntelligencePage still reads its data exclusively from usePharmacistIntelligenceData', () => {
    expect(pageSrc).toContain('usePharmacistIntelligenceData(')
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
