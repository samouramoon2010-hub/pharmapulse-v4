// ============================================================
// Executive BI — Designer Mode Pass 1 — Certification
//
// Same raw-source-scan convention as other certification suites in
// this repo (no jsdom/testing-library — vitest Node environment).
//
// This pass audited the already-migrated Executive BI surfaces
// (ExecutiveDashboard.jsx + its executive/* components) for residual
// legacy UI. Two real findings, both fixed here:
//
//   1. PortfolioKpiHeatmap.jsx rendered the per-KPI status badge using
//      TRAFFIC_COLORS[status].labelAr (Arabic) on an otherwise fully
//      English-language Executive BI surface — switched to .label.
//   2. RegionalIntelligencePanel.jsx's heatmap-section toggle used a
//      plain '▲'/'▼' text glyph while the panel's own collapse header
//      one section above it already uses Lucide ChevronUp/ChevronDown
//      for the identical concept — switched to the same Lucide icons
//      for a consistent icon language.
//
// Everything else audited (PortfolioScoreCard, RiskDistributionPanel,
// BranchLeaderboard, BranchDrilldown, ExecutiveSummaryPanel,
// ExecutiveInsightsFeed, ExecutiveTeamRollup) was already
// token-based/Lucide-based/locale-correct from the prior Number
// Locale + Executive BI Visual Migration bundle — no changes needed.
// ============================================================
import { describe, it, expect } from 'vitest'

const executiveDashboardSrc = await import('../pages/executive/ExecutiveDashboard.jsx?raw').then((m) => m.default)
const portfolioScoreCardSrc = await import('../components/executive/PortfolioScoreCard.jsx?raw').then((m) => m.default)
const riskDistributionPanelSrc = await import('../components/executive/RiskDistributionPanel.jsx?raw').then((m) => m.default)
const portfolioKpiHeatmapSrc = await import('../components/executive/PortfolioKpiHeatmap.jsx?raw').then((m) => m.default)
const branchLeaderboardSrc = await import('../components/executive/BranchLeaderboard.jsx?raw').then((m) => m.default)
const branchDrilldownSrc = await import('../components/executive/BranchDrilldown.jsx?raw').then((m) => m.default)
const regionalIntelligencePanelSrc = await import('../components/executive/RegionalIntelligencePanel.jsx?raw').then((m) => m.default)
const executiveSummaryPanelSrc = await import('../components/executive/ExecutiveSummaryPanel.jsx?raw').then((m) => m.default)
const executiveInsightsFeedSrc = await import('../components/executive/ExecutiveInsightsFeed.jsx?raw').then((m) => m.default)
const executiveTeamRollupSrc = await import('../components/executive/ExecutiveTeamRollup.jsx?raw').then((m) => m.default)

const EXECUTIVE_BI_FILES: Record<string, string> = {
  'ExecutiveDashboard.jsx': executiveDashboardSrc,
  'PortfolioScoreCard.jsx': portfolioScoreCardSrc,
  'RiskDistributionPanel.jsx': riskDistributionPanelSrc,
  'PortfolioKpiHeatmap.jsx': portfolioKpiHeatmapSrc,
  'BranchLeaderboard.jsx': branchLeaderboardSrc,
  'BranchDrilldown.jsx': branchDrilldownSrc,
  'RegionalIntelligencePanel.jsx': regionalIntelligencePanelSrc,
  'ExecutiveSummaryPanel.jsx': executiveSummaryPanelSrc,
  'ExecutiveInsightsFeed.jsx': executiveInsightsFeedSrc,
  'ExecutiveTeamRollup.jsx': executiveTeamRollupSrc,
}

const ARABIC_TEXT = /[؀-ۿ]/

// ════════════════════════════════════════════════════════════
// Major sections still render (page composition unchanged)
// ════════════════════════════════════════════════════════════
describe('Executive BI still renders its major sections', () => {
  it('ExecutiveDashboard composes Summary, Score+Risk, Heatmap, Leaderboard, Insights, Regional Intelligence', () => {
    expect(executiveDashboardSrc).toContain('<ExecutiveSummaryPanel')
    expect(executiveDashboardSrc).toContain('<PortfolioScoreCard')
    expect(executiveDashboardSrc).toContain('<RiskDistributionPanel')
    expect(executiveDashboardSrc).toContain('<PortfolioKpiHeatmap')
    expect(executiveDashboardSrc).toContain('<BranchLeaderboard')
    expect(executiveDashboardSrc).toContain('<BranchDrilldown')
    expect(executiveDashboardSrc).toContain('<ExecutiveInsightsFeed')
    expect(executiveDashboardSrc).toContain('<RegionalIntelligencePanel')
  })

  it('ExecutiveSummaryPanel still answers the 5 executive questions (best/focus KPI, risk, opportunity, narrative)', () => {
    expect(executiveSummaryPanelSrc).toContain('bestKpi')
    expect(executiveSummaryPanelSrc).toContain('focusKpi')
    expect(executiveSummaryPanelSrc).toContain('primaryRisk')
    expect(executiveSummaryPanelSrc).toContain('topOpportunity')
    expect(executiveSummaryPanelSrc).toContain('narrative')
  })
})

// ════════════════════════════════════════════════════════════
// Fix 1 — PortfolioKpiHeatmap: English label, not Arabic, on the
// status badge of an English-language Executive BI surface.
// ════════════════════════════════════════════════════════════
describe('Fix — PortfolioKpiHeatmap status badge uses the English label', () => {
  it('renders cfg.label, not cfg.labelAr, for the per-KPI status badge', () => {
    expect(portfolioKpiHeatmapSrc).toContain('{cfg.label}')
    expect(portfolioKpiHeatmapSrc).not.toContain('{cfg.labelAr}')
  })

  it('the TRAFFIC_COLORS fallback object also exposes an English label key', () => {
    expect(portfolioKpiHeatmapSrc).toContain("label: '—'")
  })
})

// ════════════════════════════════════════════════════════════
// Fix 2 — RegionalIntelligencePanel: Lucide chevrons, not text
// glyphs, for the heatmap section toggle (icon-language consistency
// with the panel's own collapse header just above it).
// ════════════════════════════════════════════════════════════
describe('Fix — RegionalIntelligencePanel uses Lucide chevrons consistently', () => {
  it('heatmap toggle uses ChevronUp/ChevronDown, not the ▲/▼ text glyphs', () => {
    expect(regionalIntelligencePanelSrc).not.toContain("{heatmapOpen ? '▲' : '▼'}")
    expect(regionalIntelligencePanelSrc).not.toMatch(/['"]▲['"]|['"]▼['"]/)
  })

  it('both collapse toggles (main header + heatmap section) render the same ChevronUp/ChevronDown components', () => {
    const chevronUpCount = (regionalIntelligencePanelSrc.match(/<ChevronUp /g) ?? []).length
    const chevronDownCount = (regionalIntelligencePanelSrc.match(/<ChevronDown /g) ?? []).length
    expect(chevronUpCount).toBe(2)
    expect(chevronDownCount).toBe(2)
  })
})

// ════════════════════════════════════════════════════════════
// Locale cleanup — no bare locale calls, no Arabic leaking into
// English UI, Western digits only.
// ════════════════════════════════════════════════════════════
describe('Locale cleanup — no bare locale calls, no Arabic text leaks', () => {
  for (const [fileName, src] of Object.entries(EXECUTIVE_BI_FILES)) {
    it(`${fileName} contains no bare .toLocaleString()/.toLocaleDateString()/.toLocaleTimeString()`, () => {
      expect(src).not.toMatch(/\.toLocaleString\(\)/)
      expect(src).not.toMatch(/\.toLocaleDateString\(\)/)
      expect(src).not.toMatch(/\.toLocaleTimeString\(\)/)
    })
    it(`${fileName} contains no bare Intl.NumberFormat() without a locale argument`, () => {
      expect(src).not.toMatch(/Intl\.NumberFormat\(\)/)
    })
    it(`${fileName} contains no Arabic text (English-mode Executive BI surface)`, () => {
      expect(src).not.toMatch(ARABIC_TEXT)
    })
  }
})

// ════════════════════════════════════════════════════════════
// Theme tokens — surfaces/text still sourced from CSS variables,
// not hardcoded backgrounds.
// ════════════════════════════════════════════════════════════
describe('Theme tokens — Executive BI surfaces use CSS variable tokens', () => {
  const TOKEN_PRESENCE: Record<string, string[]> = {
    'ExecutiveDashboard.jsx': ['var(--text-primary)', 'var(--text-muted)', 'var(--border-subtle)'],
    'PortfolioScoreCard.jsx': ['var(--bg-surface)', 'var(--bg-overlay)', 'var(--text-primary)'],
    'RiskDistributionPanel.jsx': ['var(--bg-surface)', 'var(--bg-hover)', 'var(--text-primary)'],
    'PortfolioKpiHeatmap.jsx': ['var(--bg-surface)', 'var(--bg-overlay)', 'var(--text-muted)'],
    'BranchLeaderboard.jsx': ['var(--bg-surface)', 'var(--text-primary)', 'var(--border-subtle)'],
    'BranchDrilldown.jsx': ['var(--bg-surface)', 'var(--text-primary)', 'var(--border-subtle)'],
    'RegionalIntelligencePanel.jsx': ['var(--bg-surface)', 'var(--bg-overlay)', 'var(--text-muted)'],
  }
  for (const [fileName, tokens] of Object.entries(TOKEN_PRESENCE)) {
    const src = EXECUTIVE_BI_FILES[fileName]
    for (const token of tokens) {
      it(`${fileName} sources styling from theme token: ${token}`, () => {
        expect(src).toContain(token)
      })
    }
  }
})

// ════════════════════════════════════════════════════════════
// Guardrails — no business logic / Evaluation Engine / Ranking / AI /
// Firestore / permission / route changes anywhere in the audited files.
// ════════════════════════════════════════════════════════════
const GUARDRAIL_KEYWORDS = [
  'evaluationEngine', 'evaluationPipeline', 'evaluationActualsService',
  'evaluationLedgerService', 'evaluationOrchestrationService', 'evaluationRegistryService',
  'rankingEngine', 'computeRanking', 'generateRankings',
  'aiAssistant', 'aiInsights', 'AIEngine',
  'ProfileStudioKernel', 'profileStudioEngine',
  'collection(', 'addDoc(', 'updateDoc(', 'deleteDoc(', 'onSnapshot(',
  'usePermissions(', 'permissionGate(', '<Route ',
  'Math.random(', 'mockData', 'seedData', 'fakeData',
]

describe('Guardrails — no business logic / Firestore / permission / route changes', () => {
  for (const [fileName, src] of Object.entries(EXECUTIVE_BI_FILES)) {
    for (const keyword of GUARDRAIL_KEYWORDS) {
      it(`${fileName} does not contain forbidden construct: "${keyword}"`, () => {
        expect(src).not.toContain(keyword)
      })
    }
  }
})

describe('Guardrails — no new scoring/ranking computation introduced', () => {
  for (const [fileName, src] of Object.entries(EXECUTIVE_BI_FILES)) {
    it(`${fileName} does not define a local score/rank/risk computation function`, () => {
      expect(src).not.toMatch(/function compute(Score|Rank|Risk|Achievement)/i)
    })
  }
})

// ════════════════════════════════════════════════════════════
// Build safety — files remain well-formed modules
// ════════════════════════════════════════════════════════════
describe('Build safety — audited files remain well-formed modules', () => {
  for (const [fileName, src] of Object.entries(EXECUTIVE_BI_FILES)) {
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
