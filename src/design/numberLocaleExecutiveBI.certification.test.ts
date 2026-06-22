// ============================================================
// Number Locale + Executive BI Visual Migration — Certification
//
// Same raw-source-scan convention as every other certification
// suite in this repo (no jsdom/testing-library — vitest Node
// environment). Covers:
//   - formatNumber()/formatKpiValue() always render Western digits,
//     regardless of the app's UI language, fixing the bug where
//     'ar-SA' (or no locale at all) leaked Arabic-Indic numerals
//     into English-mode screens.
//   - No bare .toLocaleString()/.toLocaleDateString()/
//     .toLocaleTimeString() calls remain in the migrated files.
//   - Executive BI components source their risk-status colors from
//     design/tokens.ts instead of duplicating hex literals.
//   - Branch Intelligence's top section (Context Bar + Executive
//     Summary Band) does the same.
//   - No calculation, Firestore, permission, route, or engine
//     changes anywhere in the migrated files.
// ============================================================
import { describe, it, expect } from 'vitest'
import { formatNumber, formatKpiValue, APP_NUMBER_LOCALE } from '../utils/helpers'

const helpersSrc = await import('../utils/helpers.js?raw').then((m) => m.default)
const tokensSrc = await import('./tokens.ts?raw').then((m) => m.default)
const portfolioScoreCardSrc = await import('../components/executive/PortfolioScoreCard.jsx?raw').then((m) => m.default)
const riskDistributionPanelSrc = await import('../components/executive/RiskDistributionPanel.jsx?raw').then((m) => m.default)
const portfolioKpiHeatmapSrc = await import('../components/executive/PortfolioKpiHeatmap.jsx?raw').then((m) => m.default)
const branchLeaderboardSrc = await import('../components/executive/BranchLeaderboard.jsx?raw').then((m) => m.default)
const branchDrilldownSrc = await import('../components/executive/BranchDrilldown.jsx?raw').then((m) => m.default)
const regionalIntelligencePanelSrc = await import('../components/executive/RegionalIntelligencePanel.jsx?raw').then((m) => m.default)
const executiveDashboardSrc = await import('../pages/executive/ExecutiveDashboard.jsx?raw').then((m) => m.default)
const branchIntelligencePageSrc = await import('../pages/branch/BranchIntelligencePage.jsx?raw').then((m) => m.default)

const MIGRATED_FILES: Record<string, string> = {
  'helpers.js': helpersSrc,
  'PortfolioScoreCard.jsx': portfolioScoreCardSrc,
  'RiskDistributionPanel.jsx': riskDistributionPanelSrc,
  'PortfolioKpiHeatmap.jsx': portfolioKpiHeatmapSrc,
  'BranchLeaderboard.jsx': branchLeaderboardSrc,
  'BranchDrilldown.jsx': branchDrilldownSrc,
  'RegionalIntelligencePanel.jsx': regionalIntelligencePanelSrc,
  'ExecutiveDashboard.jsx': executiveDashboardSrc,
  'BranchIntelligencePage.jsx': branchIntelligencePageSrc,
}

const EXECUTIVE_BI_FILES: Record<string, string> = {
  'PortfolioScoreCard.jsx': portfolioScoreCardSrc,
  'RiskDistributionPanel.jsx': riskDistributionPanelSrc,
  'PortfolioKpiHeatmap.jsx': portfolioKpiHeatmapSrc,
  'BranchLeaderboard.jsx': branchLeaderboardSrc,
  'BranchDrilldown.jsx': branchDrilldownSrc,
  'RegionalIntelligencePanel.jsx': regionalIntelligencePanelSrc,
  'ExecutiveDashboard.jsx': executiveDashboardSrc,
}

const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/

// ════════════════════════════════════════════════════════════
// 1 — formatNumber()/formatKpiValue() always render Western digits
// ════════════════════════════════════════════════════════════
describe('Number Locale — formatNumber() renders Western digits only', () => {
  it('APP_NUMBER_LOCALE is en-US', () => {
    expect(APP_NUMBER_LOCALE).toBe('en-US')
  })

  const SAMPLE_VALUES = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 99, 100, 127, 500, 999,
    1000, 1234, 5000, 9999, 10000, 12345, 99999, 100000, 123456,
    1000000, 2237, 3383, 1146, 2147483647, 7, 70, 700, 7000, 70000,
    0.5, 1.5, 99.9, 0.99, 12.34, -1, -100, -1234, -0.5,
  ]

  for (const value of SAMPLE_VALUES) {
    it(`formatNumber(${value}) contains only Western digits`, () => {
      const result = formatNumber(value)
      expect(result).not.toMatch(ARABIC_INDIC_DIGIT)
    })
  }

  for (const value of SAMPLE_VALUES) {
    it(`formatKpiValue(${value}, 'number') contains only Western digits`, () => {
      const result = formatKpiValue(value, 'number')
      expect(result).not.toMatch(ARABIC_INDIC_DIGIT)
    })
    it(`formatKpiValue(${value}, 'currency') contains only Western digits`, () => {
      const result = formatKpiValue(value, 'currency')
      expect(result).not.toMatch(ARABIC_INDIC_DIGIT)
    })
  }

  it('formatNumber(null) returns the em-dash placeholder, not a locale error', () => {
    expect(formatNumber(null)).toBe('—')
  })
  it('formatNumber(undefined) returns the em-dash placeholder', () => {
    expect(formatNumber(undefined)).toBe('—')
  })
  it('formatNumber("") returns the em-dash placeholder', () => {
    expect(formatNumber('')).toBe('—')
  })
  it('formatNumber(NaN) returns the em-dash placeholder', () => {
    expect(formatNumber(NaN)).toBe('—')
  })
  it('formatNumber applies thousands separators using Western grouping', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
  })
  it('formatKpiValue no longer hardcodes the ar-SA locale', () => {
    expect(helpersSrc).not.toContain("toLocaleString('ar-SA')")
  })
  it('formatKpiValue routes currency/number through formatNumber()', () => {
    expect(helpersSrc).toContain('formatKpiValue(value, type, unit')
    const fnIdx = helpersSrc.indexOf('export function formatKpiValue')
    const fnBody = helpersSrc.slice(fnIdx, fnIdx + 600)
    expect(fnBody).toContain('formatNumber(value)')
  })
})

// ════════════════════════════════════════════════════════════
// 2 — No bare toLocaleString()/toLocaleDateString()/toLocaleTimeString()
//     in any migrated file
// ════════════════════════════════════════════════════════════
describe('Number Locale — no bare Intl calls in migrated files', () => {
  for (const [fileName, src] of Object.entries(MIGRATED_FILES)) {
    it(`${fileName} contains no .toLocaleString() with no locale argument`, () => {
      expect(src).not.toMatch(/\.toLocaleString\(\)/)
    })
    it(`${fileName} contains no .toLocaleTimeString() with no locale argument`, () => {
      expect(src).not.toMatch(/\.toLocaleTimeString\(\)/)
    })
    it(`${fileName} contains no .toLocaleDateString() with no locale argument`, () => {
      expect(src).not.toMatch(/\.toLocaleDateString\(\)/)
    })
    it(`${fileName} does not call toLocaleString/toLocaleDateString/toLocaleTimeString with the 'ar-SA' locale`, () => {
      expect(src).not.toMatch(/\.toLocale\w*\(\s*['"]ar-SA['"]/)
    })
  }
})

// ════════════════════════════════════════════════════════════
// 3 — Executive BI components source risk-status colors from tokens
// ════════════════════════════════════════════════════════════
describe('Executive BI — risk-status colors sourced from design/tokens.ts', () => {
  it('design/tokens.ts exports RISK_LEVEL_COLORS and RISK_BUCKET_COLORS', () => {
    expect(tokensSrc).toContain('export const RISK_LEVEL_COLORS')
    expect(tokensSrc).toContain('export const RISK_BUCKET_COLORS')
  })
  it('RISK_LEVEL_COLORS covers all four risk levels', () => {
    expect(tokensSrc).toContain('ON_TRACK:')
    expect(tokensSrc).toContain('LOW_RISK:')
    expect(tokensSrc).toContain('MEDIUM_RISK:')
    expect(tokensSrc).toContain('HIGH_RISK:')
  })
  it('PortfolioScoreCard no longer defines its own dead risk-color map', () => {
    expect(portfolioScoreCardSrc).not.toContain('const RISK_LABEL')
  })
  it('RiskDistributionPanel imports RISK_BUCKET_COLORS instead of a local hex map', () => {
    expect(riskDistributionPanelSrc).toContain("import { RISK_BUCKET_COLORS } from '../../design/tokens'")
  })
  it('BranchLeaderboard imports RISK_LEVEL_COLORS instead of inlining hex literals', () => {
    expect(branchLeaderboardSrc).toContain("import { RISK_LEVEL_COLORS } from '../../design/tokens'")
  })
  it('BranchDrilldown imports RISK_LEVEL_COLORS instead of a local RISK_CFG hex map', () => {
    expect(branchDrilldownSrc).toContain("import { RISK_LEVEL_COLORS as RISK_CFG } from '../../design/tokens'")
  })
  it('RegionalIntelligencePanel no longer defines its own local risk-color map', () => {
    expect(regionalIntelligencePanelSrc).not.toContain('const RISK_CFG = {')
  })
  it('RiskDistributionPanel no longer defines its own local BUCKETS hex color array', () => {
    expect(riskDistributionPanelSrc).not.toContain("color:  '#22c55e'")
  })
  it('BranchLeaderboard sources its RISK_CFG colors from the token, not new hex literals', () => {
    expect(branchLeaderboardSrc).toContain('RISK_LEVEL_COLORS.ON_TRACK.color')
    expect(branchLeaderboardSrc).toContain('RISK_LEVEL_COLORS.HIGH_RISK.color')
  })
})

// ════════════════════════════════════════════════════════════
// 4 — Branch Intelligence top section (Context Bar + Executive
//     Summary Band) uses theme tokens for its risk badge
// ════════════════════════════════════════════════════════════
describe('Branch Intelligence — top section (Context Bar + Executive Summary Band) uses tokens', () => {
  it('imports RISK_LEVEL_COLORS from design/tokens instead of a local RISK_LABELS hex map', () => {
    expect(branchIntelligencePageSrc).toContain("import { RISK_LEVEL_COLORS as RISK_LABELS } from '../../design/tokens'")
  })
  it('no longer defines a local RISK_LABELS object literal with hardcoded hex colors', () => {
    expect(branchIntelligencePageSrc).not.toContain('const RISK_LABELS = {')
  })
  it('the Risk SummaryCard in the Executive Summary Band still reads from RISK_LABELS', () => {
    const idx = branchIntelligencePageSrc.indexOf('label="Risk"')
    expect(idx).toBeGreaterThan(-1)
    const block = branchIntelligencePageSrc.slice(idx, idx + 200)
    expect(block).toContain('RISK_LABELS[viewModel.branchSummary.riskLevel]')
  })
  it('Context Bar (Section 0) still renders the breadcrumb back to Executive BI', () => {
    expect(branchIntelligencePageSrc).toContain('Executive BI')
    expect(branchIntelligencePageSrc).toContain("to=\"/executive\"")
  })
  it('Executive Summary Band still renders all 5 summary cards (Health Score/Forecast/Risk/Branch Rank/Team Size)', () => {
    expect(branchIntelligencePageSrc).toContain('label="Health Score"')
    expect(branchIntelligencePageSrc).toContain('label="Forecast"')
    expect(branchIntelligencePageSrc).toContain('label="Risk"')
    expect(branchIntelligencePageSrc).toContain('label="Branch Rank"')
    expect(branchIntelligencePageSrc).toContain('label="Team Size"')
  })
  it('numeric branch totals in the contribution section render through formatNumber (Western digits)', () => {
    expect(branchIntelligencePageSrc).toContain('formatNumber(branchTotalActual)')
    expect(branchIntelligencePageSrc).toContain('formatNumber(entry.actual)')
  })
})

// ════════════════════════════════════════════════════════════
// 5 — Guardrails: no calculation / Firestore / permission / route /
//     engine changes in any migrated file
// ════════════════════════════════════════════════════════════
const GUARDRAIL_KEYWORDS = [
  'evaluationEngine', 'evaluationPipeline', 'evaluationActualsService',
  'evaluationLedgerService', 'evaluationOrchestrationService', 'evaluationRegistryService',
  'rankingEngine', 'computeRanking', 'generateRankings',
  'aiAssistant', 'aiInsights', 'AIEngine',
  'ProfileStudioKernel', 'profileStudioEngine',
  'collection(', 'addDoc(', 'updateDoc(', 'deleteDoc(', 'onSnapshot(',
  'usePermissions(', 'permissionGate(',
  '<Route ', 'Math.random(', 'mockData', 'seedData', 'fakeData',
]

describe('Guardrails — per-file x per-forbidden-keyword exhaustive matrix', () => {
  for (const [fileName, src] of Object.entries(MIGRATED_FILES)) {
    for (const keyword of GUARDRAIL_KEYWORDS) {
      it(`${fileName} does not contain forbidden construct: "${keyword}"`, () => {
        expect(src).not.toContain(keyword)
      })
    }
  }
})

describe('Guardrails — no new business-logic functions introduced', () => {
  for (const [fileName, src] of Object.entries(EXECUTIVE_BI_FILES)) {
    it(`${fileName} still receives pre-computed report/viewModel data only (no local score/rank computation)`, () => {
      expect(src).not.toMatch(/function compute(Score|Rank|Risk|Achievement)/i)
    })
  }
  it('BranchIntelligencePage still receives pre-computed viewModel/kpiStats/paceMap only (no local score computation)', () => {
    expect(branchIntelligencePageSrc).not.toMatch(/function compute(Score|Rank|Risk|Achievement)/i)
  })
  it('formatNumber/formatKpiValue perform no scoring or business calculation — pure presentation', () => {
    const fnIdx = helpersSrc.indexOf('export function formatNumber')
    const fnBody = helpersSrc.slice(fnIdx, fnIdx + 300)
    expect(fnBody).not.toMatch(/score|rank|achievement|forecast/i)
  })
})

// ════════════════════════════════════════════════════════════
// 6 — Build/type safety sanity: migrated files remain well-formed
// ════════════════════════════════════════════════════════════
describe('Build safety — migrated files remain well-formed modules', () => {
  for (const [fileName, src] of Object.entries(MIGRATED_FILES)) {
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
