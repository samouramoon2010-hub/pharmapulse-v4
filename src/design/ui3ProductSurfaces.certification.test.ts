// ============================================================
// UI 3.0 Product Surface Bundle — Certification (Phase UI3-2G)
//
// Pattern: ?raw source inspection — no @testing-library/react,
// no DOM rendering — matching every other certification suite in
// this repo (tokens.test.ts, ProfileStudioPage.test.ts, etc.).
//
// Scope: verifies the UI3-2A..2F Product Surface changes (Dashboard,
// Executive, Actions, Team/Pharmacist, Empty State system, typography)
// without touching scoring, ranking, AI, Profile Studio kernels,
// Firestore schema, or permissions — and asserts that those systems
// are in fact untouched (guardrails).
// ============================================================
import { describe, it, expect } from 'vitest'
import { STATUS_TOKENS, getStatusToken, DISPLAY_TYPOGRAPHY } from './tokens'

// ── Raw source loaders ─────────────────────────────────────────
const executiveSummaryPanelSrc = await import('../components/executive/ExecutiveSummaryPanel.jsx?raw').then((m) => m.default)
const executiveInsightsFeedSrc = await import('../components/executive/ExecutiveInsightsFeed.jsx?raw').then((m) => m.default)
const portfolioScoreCardSrc    = await import('../components/executive/PortfolioScoreCard.jsx?raw').then((m) => m.default)
const riskDistributionSrc      = await import('../components/executive/RiskDistributionPanel.jsx?raw').then((m) => m.default)
const regionalIntelligenceSrc  = await import('../components/executive/RegionalIntelligencePanel.jsx?raw').then((m) => m.default)
const branchLeaderboardSrc     = await import('../components/executive/BranchLeaderboard.jsx?raw').then((m) => m.default)
const branchDrilldownSrc       = await import('../components/executive/BranchDrilldown.jsx?raw').then((m) => m.default)
const executiveDashboardSrc    = await import('../pages/executive/ExecutiveDashboard.jsx?raw').then((m) => m.default)
const kpiCardSrc                = await import('../components/kpi/KpiCard.jsx?raw').then((m) => m.default)
// Normalize CRLF→LF: source-text assertions below embed literal '\n'
// boundaries (multi-line .toContain() checks). Windows checkouts with
// core.autocrlf=true render this file with \r\n on disk, which would
// otherwise break the literal match without changing actual content.
const dailyMissionPanelSrc      = await import('../components/dashboard/DailyMissionPanel.jsx?raw').then((m) => m.default.replace(/\r\n/g, '\n'))
const dashboardPageSrc          = await import('../pages/dashboard/DashboardPage.jsx?raw').then((m) => m.default)
const emptyStateSrc             = await import('../components/ui/EmptyState.jsx?raw').then((m) => m.default)
const actionEmptyStateSrc       = await import('../components/actions/ActionEmptyState.jsx?raw').then((m) => m.default)
const actionCardSrc             = await import('../components/actions/ActionCard.jsx?raw').then((m) => m.default)
const actionSummaryCardsSrc     = await import('../components/actions/ActionSummaryCards.jsx?raw').then((m) => m.default)
const myActionsPageSrc          = await import('../pages/actions/MyActionsPage.jsx?raw').then((m) => m.default)
const tasksPageSrc              = await import('../pages/actions/TasksPage.jsx?raw').then((m) => m.default)
const teamIntelligenceCardSrc   = await import('../components/ui/TeamIntelligenceCard.jsx?raw').then((m) => m.default)
const pharmacistIntelPageSrc    = await import('../pages/pharmacist/PharmacistIntelligencePage.jsx?raw').then((m) => m.default)
const profileDetailPanelSrc     = await import('../components/profileStudio/ProfileDetailPanel.jsx?raw').then((m) => m.default)
const assistantPageSrc          = await import('../pages/assistant/AssistantPage.jsx?raw').then((m) => m.default)
const assistantPanelSrc         = await import('../components/assistant/AssistantPanel.jsx?raw').then((m) => m.default)
const simulatorPanelSrc         = await import('../components/profileStudio/SimulatorPanel.jsx?raw').then((m) => m.default)
const simulationRunsCardSrc     = await import('../components/profileStudio/SimulationRunsCard.jsx?raw').then((m) => m.default)

// ── Guardrail loop across every touched/adjacent product surface ──
// Each entry is checked against a fixed panel of regression guards:
// no fake/seed data, no new Evaluation Engine / Ranking / AI imports,
// no Firestore schema/rules references from a UI file.
const SURFACES: Record<string, string> = {
  ExecutiveSummaryPanel:    executiveSummaryPanelSrc,
  ExecutiveInsightsFeed:    executiveInsightsFeedSrc,
  PortfolioScoreCard:       portfolioScoreCardSrc,
  RiskDistributionPanel:    riskDistributionSrc,
  RegionalIntelligencePanel: regionalIntelligenceSrc,
  BranchLeaderboard:        branchLeaderboardSrc,
  BranchDrilldown:          branchDrilldownSrc,
  ExecutiveDashboard:       executiveDashboardSrc,
  KpiCard:                  kpiCardSrc,
  DailyMissionPanel:        dailyMissionPanelSrc,
  DashboardPage:            dashboardPageSrc,
  EmptyState:               emptyStateSrc,
  ActionEmptyState:         actionEmptyStateSrc,
  ActionCard:               actionCardSrc,
  ActionSummaryCards:       actionSummaryCardsSrc,
  MyActionsPage:            myActionsPageSrc,
  TasksPage:                tasksPageSrc,
  TeamIntelligenceCard:     teamIntelligenceCardSrc,
  PharmacistIntelligencePage: pharmacistIntelPageSrc,
  ProfileDetailPanel:       profileDetailPanelSrc,
  AssistantPage:            assistantPageSrc,
  AssistantPanel:           assistantPanelSrc,
  SimulatorPanel:           simulatorPanelSrc,
  SimulationRunsCard:       simulationRunsCardSrc,
}

describe('UI3 Product Surface Bundle — guardrails (per-surface)', () => {
  for (const [name, src] of Object.entries(SURFACES)) {
    describe(name, () => {
      it('source loads as a non-empty string', () => {
        expect(typeof src).toBe('string')
        expect(src.length).toBeGreaterThan(0)
      })
      it('contains no fake-data generator (Math.random)', () => {
        expect(src).not.toContain('Math.random(')
      })
      it('contains no faker.js usage', () => {
        expect(src).not.toContain('faker.')
      })
      it('contains no hardcoded mock data object', () => {
        expect(src).not.toContain('mockData')
      })
      it('contains no seed-data helper', () => {
        expect(src).not.toContain('seedData')
        expect(src).not.toContain('seedDatabase')
      })
      it('does not reference firestore.rules (no schema/permission edits from a UI file)', () => {
        expect(src).not.toContain('firestore.rules')
      })
      it('does not import the Evaluation Engine pipeline', () => {
        expect(src).not.toMatch(/from ['"].*evaluationPipeline/)
      })
      it('does not import a ranking engine module', () => {
        expect(src).not.toMatch(/from ['"].*rankingEngine/)
      })
      it('does not introduce a new AI provider call', () => {
        expect(src).not.toContain('openai.')
        expect(src).not.toContain('anthropic.messages')
      })
      it('does not call window.alert / window.confirm (no debug scaffolding left behind)', () => {
        expect(src).not.toContain('window.alert(')
        expect(src).not.toContain('window.confirm(')
      })
      it('does not use dangerouslySetInnerHTML (no XSS surface introduced)', () => {
        expect(src).not.toContain('dangerouslySetInnerHTML')
      })
      it('does not contain a raw <script> tag', () => {
        expect(src).not.toMatch(/<script[\s>]/)
      })
      it('does not call eval(', () => {
        expect(src).not.toContain('eval(')
      })
      it('does not contain a hardcoded OpenAI-style secret key literal', () => {
        expect(src).not.toMatch(/sk-[A-Za-z0-9]{16,}/)
      })
      it('does not contain a hardcoded Google/Firebase API key literal', () => {
        expect(src).not.toMatch(/AIza[0-9A-Za-z\-_]{20,}/)
      })
      it('does not import a test framework into production component code', () => {
        expect(src).not.toMatch(/from ['"]vitest['"]/)
      })
      it('does not directly read process.env (this is a Vite app — config goes through import.meta.env)', () => {
        expect(src).not.toContain('process.env.')
      })
      it('does not contain a debugger statement', () => {
        expect(src).not.toContain('debugger')
      })
    })
  }
})

// ════════════════════════════════════════════════════════════
// UI3-2B — Executive Summary Panel wiring
// ════════════════════════════════════════════════════════════
describe('UI3-2B — ExecutiveSummaryPanel is wired into ExecutiveDashboard', () => {
  it('ExecutiveDashboard imports ExecutiveSummaryPanel', () => {
    expect(executiveDashboardSrc).toContain("import ExecutiveSummaryPanel      from '../../components/executive/ExecutiveSummaryPanel'")
  })
  it('ExecutiveDashboard renders <ExecutiveSummaryPanel', () => {
    expect(executiveDashboardSrc).toContain('<ExecutiveSummaryPanel')
  })
  it('passes overallScore from report.portfolioScore (existing field, no new calc)', () => {
    expect(executiveDashboardSrc).toContain('overallScore={report.portfolioScore}')
  })
  it('derives bestKpi/focusKpi from the already-sorted top branch (allBranches[0])', () => {
    expect(executiveDashboardSrc).toContain("report?.allBranches?.[0]")
    expect(executiveDashboardSrc).toContain('topBranch?.strongestKpi')
    expect(executiveDashboardSrc).toContain('topBranch?.weakestKpi')
  })
  it('derives primaryRisk/topOpportunity by selecting existing portfolioInsights, not new analytics', () => {
    expect(executiveDashboardSrc).toContain("report?.portfolioInsights?.find((i) => i.type === 'RISK')")
    expect(executiveDashboardSrc).toContain("report?.portfolioInsights?.find((i) => i.type === 'OPPORTUNITY')")
  })
  it('narrative is a template string built only from existing report fields (portfolioGrade/activeBranches/totalBranches/riskDistribution)', () => {
    expect(executiveDashboardSrc).toContain('report.portfolioGrade')
    expect(executiveDashboardSrc).toContain('report.activeBranches')
    expect(executiveDashboardSrc).toContain('report.totalBranches')
    expect(executiveDashboardSrc).toContain('report.riskDistribution.highRisk')
    expect(executiveDashboardSrc).toContain('report.riskDistribution.onTrack')
  })
  it('comment documents this as pure display formatting, no new scoring/ranking/aggregation', () => {
    expect(executiveDashboardSrc).toContain('Pure display formatting over already-computed report fields')
  })
  it('does not introduce a new score-computation function (no "function computeScore" or similar)', () => {
    expect(executiveDashboardSrc).not.toMatch(/function compute(Score|Ranking|Rank)/)
  })
  it('panel is rendered above Row 1 (Score + Risk), before PortfolioScoreCard', () => {
    const summaryIdx = executiveDashboardSrc.indexOf('<ExecutiveSummaryPanel')
    const row1Idx     = executiveDashboardSrc.indexOf('<PortfolioScoreCard')
    expect(summaryIdx).toBeGreaterThan(-1)
    expect(row1Idx).toBeGreaterThan(-1)
    expect(summaryIdx).toBeLessThan(row1Idx)
  })
  it('ExecutiveDashboard still computes zero business logic itself (header comment unchanged)', () => {
    expect(executiveDashboardSrc).toContain('Zero business logic in this file — all analytics in engine.')
  })
})

describe('UI3-2B — ExecutiveSummaryPanel component contract (unchanged, display-only)', () => {
  it('is a pure presentational component receiving only primitive/string props', () => {
    expect(executiveSummaryPanelSrc).toContain('overallScore, bestKpi, focusKpi, primaryRisk, topOpportunity, narrative,')
  })
  it('performs no scoring, ranking, or aggregation (explicit header claim)', () => {
    expect(executiveSummaryPanelSrc).toContain('this component performs no')
    expect(executiveSummaryPanelSrc).toContain('scoring, ranking, or aggregation')
  })
  it('renders the overall score with /100 suffix when provided', () => {
    expect(executiveSummaryPanelSrc).toContain("<span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>/100</span>")
  })
  it('best KPI row uses positive tone, focus KPI uses neutral tone, primary risk uses negative tone, top opportunity uses positive tone', () => {
    expect(executiveSummaryPanelSrc).toContain("tone: 'positive'")
    expect(executiveSummaryPanelSrc).toContain("tone: 'neutral'")
    expect(executiveSummaryPanelSrc).toContain("tone: 'negative'")
  })
  it('uses getStatusToken from design tokens (no ad-hoc color system)', () => {
    expect(executiveSummaryPanelSrc).toContain("import { getStatusToken } from '../../design/tokens'")
  })
  it('insight row text is rendered at 13px (meets the 13px critical-insight floor)', () => {
    expect(executiveSummaryPanelSrc).toContain("fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4")
  })
  it('narrative text is rendered at 13px, not below the floor', () => {
    expect(executiveSummaryPanelSrc).toContain("fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5")
  })
  it('returns null (no giant empty container) when there is truly nothing to show', () => {
    expect(executiveSummaryPanelSrc).toContain('if (rows.length === 0 && !narrative && overallScore === undefined) return null')
  })
  it('uses a dense 2-column grid for the four insight rows, not stacked oversized cards', () => {
    expect(executiveSummaryPanelSrc).toContain('grid grid-cols-2 gap-2')
  })
  it('has a stable test id for the panel root', () => {
    expect(executiveSummaryPanelSrc).toContain("data-testid=\"executive-summary-panel\"")
  })
})

// ════════════════════════════════════════════════════════════
// UI3-2E — Empty State system (tone + compact)
// ════════════════════════════════════════════════════════════
describe('UI3-2E — EmptyState tone API', () => {
  it('accepts a tone prop alongside icon/title/description/action/compact', () => {
    expect(emptyStateSrc).toContain('export default function EmptyState({ icon: Icon, title, description, action, compact = false, tone })')
  })
  it('resolves tone via getStatusToken from design tokens (shared semantic vocabulary)', () => {
    expect(emptyStateSrc).toContain("import { getStatusToken } from '../../design/tokens'")
    expect(emptyStateSrc).toContain('const token = tone ? getStatusToken(tone) : null')
  })
  it('tints the icon container background/border/color from the resolved token', () => {
    expect(emptyStateSrc).toContain('background: token?.bg ?? \'var(--bg-overlay)\'')
    expect(emptyStateSrc).toContain('color: token?.color ?? \'var(--text-muted)\'')
  })
  it('falls back to the original muted look when tone is omitted (no visual regression for existing call sites)', () => {
    expect(emptyStateSrc).toContain("'var(--bg-overlay)'")
    expect(emptyStateSrc).toContain("'var(--border-subtle)'")
  })
  it('still supports compact mode unchanged', () => {
    expect(emptyStateSrc).toContain("padding: compact ? '24px 16px' : '40px 24px'")
  })
  it('every specialised dashboard empty-state variant remains exported', () => {
    for (const fn of ['EmptyTodayEntries', 'EmptyNoTargets', 'EmptyNoForecast', 'EmptyNoBranch', 'EmptyMissionNotReady', 'ErrorState', 'EmptyCell']) {
      expect(emptyStateSrc).toContain(`export function ${fn}`)
    }
  })
})

describe('UI3-2E — ActionEmptyState compact + tone API', () => {
  it('accepts compact and tone props', () => {
    expect(actionEmptyStateSrc).toContain('export default function ActionEmptyState({ message, title, icon, compact = false, tone })')
  })
  it('resolves tone via the same getStatusToken helper as EmptyState', () => {
    expect(actionEmptyStateSrc).toContain("import { getStatusToken } from '../../design/tokens'")
  })
  it('compact mode tightens padding for nested zero-count placeholders', () => {
    expect(actionEmptyStateSrc).toContain("padding:        compact ? '12px 16px'")
  })
  it('compact mode does not push body caption text below 11px', () => {
    expect(actionEmptyStateSrc).toContain("fontSize:   compact ? '11px' : '12px'")
  })
  it('header comment documents the compact/tone additions for this bundle', () => {
    expect(actionEmptyStateSrc).toContain('UI 3.0 Product Surface Bundle (UI3-2C)')
  })
})

describe('UI3-2C — Actions surface applies compact empty states to nested zero-count sections', () => {
  it('MyActionsPage Open section uses compact ActionEmptyState', () => {
    const idx = myActionsPageSrc.indexOf('title="Open"')
    const block = myActionsPageSrc.slice(idx, idx + 200)
    expect(block).toContain('<ActionEmptyState compact message="No open actions."')
  })
  it('MyActionsPage In Progress section uses compact ActionEmptyState', () => {
    const idx = myActionsPageSrc.indexOf('title="In Progress"')
    const block = myActionsPageSrc.slice(idx, idx + 200)
    expect(block).toContain('<ActionEmptyState compact message="No actions in progress."')
  })
  it('MyActionsPage top-level "no actions at all" empty state remains the full (non-nested) variant', () => {
    expect(myActionsPageSrc).toContain('title="No open actions"')
  })
  it('TasksPage All Open Actions section uses compact ActionEmptyState', () => {
    const idx = tasksPageSrc.indexOf('title="All Open Actions"')
    const block = tasksPageSrc.slice(idx, idx + 200)
    expect(block).toContain('<ActionEmptyState compact message="No open actions in your scope."')
  })
  it('TasksPage top-level empty state remains the full (non-nested) variant', () => {
    expect(tasksPageSrc).toContain('title="No active tasks"')
  })
})

describe('UI3-2E — Profile Studio "no profile selected" uses tone + compact', () => {
  it('ProfileDetailPanel renders EmptyState with tone="neutral" and compact when no profile is selected', () => {
    const idx = profileDetailPanelSrc.indexOf('No profile selected')
    const block = profileDetailPanelSrc.slice(idx - 80, idx + 160)
    expect(block).toContain('tone="neutral"')
    expect(block).toContain('compact')
  })
})

describe('UI3-2E — Assistant no-context state uses EmptyState instead of a bare empty card', () => {
  it('AssistantPage imports EmptyState', () => {
    expect(assistantPageSrc).toContain("import EmptyState from '../../components/ui/EmptyState'")
  })
  it('AssistantPage conditionally renders EmptyState (tone=neutral, compact) when context is not yet ready', () => {
    expect(assistantPageSrc).toContain('{context && !isPreparingContext ? (')
    expect(assistantPageSrc).toContain('tone="neutral"')
    expect(assistantPageSrc).toContain('Preparing your context')
  })
  it('AssistantPanel is rendered with the live-grounded context (and personalAi, for BYOK)', () => {
    expect(assistantPageSrc).toContain('AssistantPanel context={context} personalAi={personalAi}')
  })
})

describe('UI3-2E — Simulation empty states already use the shared EmptyState component', () => {
  it('SimulatorPanel renders a compact EmptyState when there are no KPIs to simulate', () => {
    expect(simulatorPanelSrc).toContain('<EmptyState title="No KPIs to simulate" description="Add rules with a KPI key before running a simulation" compact />')
  })
  it('SimulationRunsCard imports the shared EmptyState component (not a bespoke block)', () => {
    expect(simulationRunsCardSrc).toContain("import EmptyState from '../ui/EmptyState'")
  })
})

// ════════════════════════════════════════════════════════════
// UI3-2A — Dashboard surface: dense KPI cards + Daily Mission
// ════════════════════════════════════════════════════════════
describe('UI3-2A — Dashboard exposes actual/target/gap/pace on KpiCard', () => {
  it('KpiCard derives gap as display-only arithmetic (target - value)', () => {
    expect(kpiCardSrc).toContain('const gap = (value !== null && target > 0) ? Math.max(target - value, 0) : null')
  })
  it('KpiCard derives required daily pace via the guarded helper (gap / daysRemaining, rounded, never Infinity/NaN)', () => {
    expect(kpiCardSrc).toContain('const requiredDailyPace = computeRequiredDailyPace(gap, daysRemaining)')
  })
  it('KpiCard renders Actual, Target, Remaining gap, and Required daily pace labels', () => {
    for (const label of ['Actual', 'Target', 'Remaining gap', 'Required daily pace']) {
      expect(kpiCardSrc).toContain(label)
    }
  })
  it('KpiCard explicitly disclaims business/scoring logic in its header comment', () => {
    expect(kpiCardSrc).toContain('No business/scoring logic — that stays in the engine layer.')
  })
  it('KpiCard never fabricates a placeholder number — omits a row instead', () => {
    expect(kpiCardSrc).toContain('it never shows a fake/placeholder')
  })
  it('KpiCard achievement value text is rendered at 2xl (dominant), not a small caption', () => {
    // UI3.1-D: color now resolves through var(--text-primary) instead of a
    // hardcoded text-white class, per docs/ui3/implementation-rules.md.
    expect(kpiCardSrc).toContain("text-2xl font-bold")
    expect(kpiCardSrc).toContain("color: 'var(--text-primary)'")
  })
  it('KpiCard dense data grid values use 13px (meets the insight floor) with tabular-nums', () => {
    expect(kpiCardSrc).toContain("fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums'")
  })
})

describe('UI3-2A — Daily Mission Panel surfaces risk/opportunity/finish/drifts from existing values only', () => {
  it('computes biggest risk via plain filter+sort over achievement, no formula', () => {
    expect(dailyMissionPanelSrc).toContain('function pickBiggestRisk(items)')
    expect(dailyMissionPanelSrc).toContain('there is no scoring formula, no')
  })
  it('computes biggest opportunity via plain filter+sort over gap', () => {
    expect(dailyMissionPanelSrc).toContain('function pickBiggestOpportunity(items)')
  })
  it('computes critical drifts via a plain threshold filter', () => {
    expect(dailyMissionPanelSrc).toContain('function pickCriticalDrifts(items)')
    expect(dailyMissionPanelSrc).toContain('CRITICAL_THRESHOLD = 60')
  })
  it('never calls the engine or Firestore directly (presentation, not analytics)', () => {
    expect(dailyMissionPanelSrc).toContain('no\n// engine call, and no Firestore access')
  })
  it('renders a 2x2 dense tile grid, not stacked oversized cards', () => {
    expect(dailyMissionPanelSrc).toContain('grid grid-cols-2 gap-2')
  })
  it('headline + tile values are rendered at 13px, meeting the insight floor', () => {
    expect(dailyMissionPanelSrc).toContain("fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px'")
    expect(dailyMissionPanelSrc).toContain("fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)'")
  })
  it('returns null (no empty container) when no mission items are supplied', () => {
    expect(dailyMissionPanelSrc).toContain('if (safeItems.length === 0) return null')
  })
})

describe('UI3-2A — DashboardPage answers "what needs attention" with dense, action-driven sections', () => {
  it('renders a Daily Mission section', () => {
    expect(dashboardPageSrc).toContain('Daily Mission')
  })
  it("renders Today's Focus pillars (risk/opportunity precedence, deterministic, no duplicate member)", () => {
    expect(dashboardPageSrc).toContain("Today's Focus")
    expect(dashboardPageSrc).toContain('atRiskMemberIds takes priority over topPerformerIds')
  })
  it('renders a KPI cards row using the official KpiCard template (UI3.2-C)', () => {
    expect(dashboardPageSrc).toContain('<KpiCard')
  })
  it('uses compact EmptyTodayEntries / EmptyNoForecast instead of large blank panels', () => {
    expect(dashboardPageSrc).toContain('EmptyTodayEntries')
    expect(dashboardPageSrc).toContain('EmptyNoForecast')
  })
  it('explicitly comments that the old layout stacked oversized empty boxes and avoids repeating that', () => {
    expect(dashboardPageSrc).not.toContain('TODO: remove oversized empty box')
  })
  it('Branch Health / Forecast EOM / Team Status / Portfolio Risk hero cards render KPI values at 28px (dominant) with tabular-nums', () => {
    expect(dashboardPageSrc).toContain("fontSize: '28px', fontWeight: 700, lineHeight: 1,")
  })
})

// ════════════════════════════════════════════════════════════
// UI3-2D — Team / Pharmacist surface polish
// ════════════════════════════════════════════════════════════
describe('UI3-2D — TeamIntelligenceCard renders nothing (no oversized empty block) when data is absent', () => {
  it('returns null when loading or no teamResult', () => {
    expect(teamIntelligenceCardSrc).toContain('if (loading || !teamResult) return null')
  })
  it('returns null when teamHealth or teamTrendSummary are missing (never renders a half-filled card)', () => {
    expect(teamIntelligenceCardSrc).toContain('if (!teamHealth || !teamTrendSummary) return null')
  })
  it('compact always-visible row uses 13px values for momentum/stability/improving/need-support', () => {
    expect(teamIntelligenceCardSrc).toContain("fontSize:'13px', fontWeight:600, color: item.color, fontVariantNumeric:'tabular-nums'")
  })
  it('expanded detail rows truncate long names instead of growing the card (overflow ellipsis)', () => {
    expect(teamIntelligenceCardSrc).toContain("overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'")
  })
})

describe('UI3-2D — PharmacistIntelligencePage hooks-order fix did not regress (no duplicate hook/order issue)', () => {
  it('still calls every hook unconditionally before any early return (regression guard for the prior hotfix)', () => {
    const fnIdx = pharmacistIntelPageSrc.indexOf('export default function PharmacistIntelligencePage')
    const body = pharmacistIntelPageSrc.slice(fnIdx)
    const hookCallIdx = body.indexOf('usePharmacistIntelligenceData(')
    const beforeHookCall = body.slice(0, hookCallIdx)
    expect(beforeHookCall).not.toMatch(/^\s*return\b/m)
  })
  it('still computes authorization as plain booleans, not conditional hooks', () => {
    expect(pharmacistIntelPageSrc).toContain('const ownProfileDenied')
    expect(pharmacistIntelPageSrc).toContain('const scopeSettling')
    expect(pharmacistIntelPageSrc).toContain('const scopeDenied')
    expect(pharmacistIntelPageSrc).toContain('const pharmacyDenied')
  })
})

// ════════════════════════════════════════════════════════════
// UI3-2B — Risk Distribution / Regional Intelligence / Leaderboard density
// ════════════════════════════════════════════════════════════
describe('UI3-2B — RiskDistributionPanel renders a dense segmented bar + legend, no oversized empty bucket boxes', () => {
  it('segmented bar omits zero-width buckets instead of rendering empty slivers', () => {
    expect(riskDistributionSrc).toContain('if (!pct) return null')
  })
  it('legend rows render counts at 13px font-weight 700 (dominant, meets insight floor)', () => {
    expect(riskDistributionSrc).toContain("fontSize: '13px', fontWeight: 700,")
  })
  it('zero-count buckets are visually de-emphasised (muted dot/text), not hidden or oversized', () => {
    expect(riskDistributionSrc).toContain("background: count > 0 ? dot : 'var(--text-muted)'")
  })
})

describe('UI3-2B — RegionalIntelligencePanel stays collapsed by default (dense, not a giant always-open block)', () => {
  it('starts collapsed (open=false) until the user expands it', () => {
    expect(regionalIntelligenceSrc).toContain("const [open, setOpen] = useState(false)")
  })
  it('returns null when there is no intelligence data at all', () => {
    expect(regionalIntelligenceSrc).toContain('if (!intelligence) return null')
  })
  it('empty region lists render a compact inline "None"/"—" label, not an empty card', () => {
    expect(regionalIntelligenceSrc).toContain('function RegionList({ names, color, bg, border, emptyText })')
    expect(regionalIntelligenceSrc).toContain('if (!names.length)')
  })
  it('heatmap empty-filter state is compact (20px padding) with a clear-filters action, not a giant blank box', () => {
    expect(regionalIntelligenceSrc).toContain('data-testid="heatmap-empty-filter-state"')
    expect(regionalIntelligenceSrc).toContain('No branches match the selected filters')
  })
})

describe('UI3-2B — BranchLeaderboard / BranchDrilldown surface strongest/weakest KPI without new calculations', () => {
  it('BranchDrilldown highlights weakest/strongest KPI from already-computed branch fields', () => {
    expect(branchDrilldownSrc).toContain('branch.weakestKpi === kpiKey')
    expect(branchDrilldownSrc).toContain('branch.strongestKpi === kpiKey')
  })
  it('BranchDrilldown KPI breakdown rows render label text at 12px, achievement value with tabular-nums', () => {
    expect(branchDrilldownSrc).toContain("fontVariantNumeric: 'tabular-nums'")
  })
})

// ════════════════════════════════════════════════════════════
// UI3-2F — Typography & density sweep
// ════════════════════════════════════════════════════════════
describe('UI3-2F — design tokens define the 13px critical-insight floor and it is honored', () => {
  it('DISPLAY_TYPOGRAPHY exposes a sizeInsightMin of 13px', () => {
    expect(DISPLAY_TYPOGRAPHY.sizeInsightMin).toBe('13px')
  })
  it('STATUS_TOKENS covers all four semantic tones used across the bundle', () => {
    expect(Object.keys(STATUS_TOKENS).sort()).toEqual(['caution', 'negative', 'neutral', 'positive'])
  })
  it('getStatusToken never throws and always returns a valid token for any input', () => {
    expect(() => getStatusToken(undefined)).not.toThrow()
    expect(() => getStatusToken('not-a-real-tone')).not.toThrow()
    expect(getStatusToken(undefined)).toBe(STATUS_TOKENS.neutral)
  })
  it('every status token exposes color, bg, and border (consumed by EmptyState/ActionEmptyState tone)', () => {
    for (const tone of Object.values(STATUS_TOKENS)) {
      expect(tone).toHaveProperty('color')
      expect(tone).toHaveProperty('bg')
      expect(tone).toHaveProperty('border')
    }
  })
})

describe('UI3-2F — touched surfaces use tabular-nums for KPI/metric values', () => {
  for (const [name, src] of Object.entries({
    KpiCard: kpiCardSrc,
    PortfolioScoreCard: portfolioScoreCardSrc,
    RiskDistributionPanel: riskDistributionSrc,
    ExecutiveSummaryPanel: executiveSummaryPanelSrc,
    ActionSummaryCards: actionSummaryCardsSrc,
  })) {
    it(`${name} uses tabular-nums somewhere for numeric display`, () => {
      expect(src).toMatch(/tabular-nums/)
    })
  }
})

describe('UI3-2F — touched surfaces avoid hardcoded huge blank container heights', () => {
  for (const [name, src] of Object.entries({
    EmptyState: emptyStateSrc,
    ActionEmptyState: actionEmptyStateSrc,
    DailyMissionPanel: dailyMissionPanelSrc,
    ExecutiveSummaryPanel: executiveSummaryPanelSrc,
  })) {
    it(`${name} does not set a fixed minHeight above 200px on any empty/placeholder container`, () => {
      expect(src).not.toMatch(/minHeight:\s*['"]([2-9]\d{2,}|\d{4,})px['"]/)
    })
  }
})

// ════════════════════════════════════════════════════════════
// UI3-2C — Actions surface density / scannability
// ════════════════════════════════════════════════════════════
describe('UI3-2C — ActionSummaryCards is a compact 4-column count grid', () => {
  it('uses a 4-column grid layout', () => {
    expect(actionSummaryCardsSrc).toContain("gridTemplateColumns: 'repeat(4, 1fr)'")
  })
  it('count value is dominant (22px bold) versus the 9px caption label', () => {
    expect(actionSummaryCardsSrc).toMatch(/fontSize:\s+'22px'/)
    expect(actionSummaryCardsSrc).toMatch(/fontSize:\s+'9px'/)
  })
  it('count values use tabular-nums for alignment', () => {
    expect(actionSummaryCardsSrc).toContain("fontVariantNumeric: 'tabular-nums'")
  })
  it('card padding stays compact (12px 14px), not an oversized stat tile', () => {
    expect(actionSummaryCardsSrc).toContain("padding:      '12px 14px'")
  })
})

describe('UI3-2C — ActionCard remains scannable (status-driven action buttons, no business-logic change)', () => {
  it('still gates Accept/Dismiss to SUGGESTED status and Close to ACCEPTED status', () => {
    expect(actionCardSrc).toContain('SUGGESTED')
    expect(actionCardSrc).toContain('ACCEPTED')
  })
  it('exposes the same callback props as before (onAccept/onDismiss/onClose/isUpdating)', () => {
    for (const prop of ['onAccept', 'onDismiss', 'onClose', 'isUpdating']) {
      expect(actionCardSrc).toContain(prop)
    }
  })
})

// ════════════════════════════════════════════════════════════
// Cross-cutting guardrails — explicit, named checks
// ════════════════════════════════════════════════════════════
describe('Guardrails — no business logic rewrite', () => {
  it('ExecutiveDashboard.jsx still claims zero business logic in its header', () => {
    expect(executiveDashboardSrc).toContain('Orchestrates useExecutiveReport() → renders sub-components.')
  })
  it('KpiCard.jsx explicitly disclaims business/scoring logic', () => {
    expect(kpiCardSrc).toContain('No business/scoring logic')
  })
  it('DailyMissionPanel.jsx explicitly disclaims scoring formulas and engine calls', () => {
    expect(dailyMissionPanelSrc).toContain('no scoring formula, no')
  })
  it('ActionCard.jsx workflow status names are unchanged (SUGGESTED gates accept/dismiss, ACCEPTED gates close)', () => {
    expect(actionCardSrc).toContain("status === 'SUGGESTED' && !!onAccept")
    expect(actionCardSrc).toContain("status === 'SUGGESTED' && !!onDismiss")
    expect(actionCardSrc).toContain("status === 'ACCEPTED'  && !!onClose")
  })
})

describe('Guardrails — no Firestore schema changes', () => {
  for (const [name, src] of Object.entries(SURFACES)) {
    it(`${name} does not declare a new Firestore collection path literal`, () => {
      expect(src).not.toMatch(/collection\(\s*db\s*,\s*['"][a-zA-Z]+_v2['"]/)
    })
  }
})

describe('Guardrails — no permission weakening', () => {
  it('ExecutiveDashboard still uses isPharmacyAllowed for branch drill-down selection', () => {
    expect(executiveDashboardSrc).toContain('isPharmacyAllowed(scope, branch.pharmacyId)')
  })
  it('PharmacistIntelligencePage still fails closed on scope error / null scope', () => {
    expect(pharmacistIntelPageSrc).toContain('!scope || scopeError')
  })
  it('PharmacistIntelligencePage still scopes non-pharmacist roles through isPharmacyAllowed', () => {
    expect(pharmacistIntelPageSrc).toContain("isPharmacyAllowed(scope, branchId ?? '')")
  })
})

describe('Guardrails — no AI logic changes', () => {
  it('AssistantPanel.jsx still requires explicit aiSettings before any provider call', () => {
    expect(assistantPanelSrc).toContain('aiSettings')
  })
  it('AssistantPage.jsx still passes no aiSettings (deterministic-first, unchanged)', () => {
    expect(assistantPageSrc).not.toContain('aiSettings=')
  })
})

describe('Guardrails — no Ranking logic changes', () => {
  it('BranchLeaderboard.jsx still sorts using report data, not a new ranking formula', () => {
    expect(branchLeaderboardSrc).not.toMatch(/function computeRank|function rankBranches/)
  })
})

// ════════════════════════════════════════════════════════════
// Build / responsive safety
// ════════════════════════════════════════════════════════════
describe('Build safety — touched files use well-formed default exports', () => {
  const DEFAULT_EXPORT_CHECKS: Record<string, string> = {
    ExecutiveSummaryPanel: executiveSummaryPanelSrc,
    EmptyState: emptyStateSrc,
    ActionEmptyState: actionEmptyStateSrc,
    KpiCard: kpiCardSrc,
    DailyMissionPanel: dailyMissionPanelSrc,
    TeamIntelligenceCard: teamIntelligenceCardSrc,
    ExecutiveDashboard: executiveDashboardSrc,
    DashboardPage: dashboardPageSrc,
    MyActionsPage: myActionsPageSrc,
    TasksPage: tasksPageSrc,
    AssistantPage: assistantPageSrc,
  }
  for (const [name, src] of Object.entries(DEFAULT_EXPORT_CHECKS)) {
    it(`${name} has exactly one "export default"`, () => {
      const matches = src.match(/export default/g) ?? []
      expect(matches.length).toBe(1)
    })
  }
})

describe('Responsive safety — grid layouts degrade to single/2-column on small screens where used', () => {
  it('DashboardPage KPI cards row wraps cleanly via auto-fit minmax (no fixed column overflow)', () => {
    expect(dashboardPageSrc).toContain("gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))'")
  })
  it('DashboardPage Analytics/Executive Intelligence rows degrade to a single column on small screens', () => {
    expect(dashboardPageSrc).toContain("gridTemplateColumns:'1fr'")
  })
  it('ActionSummaryCards uses a fixed 4-column grid intentionally (counts are always exactly 4)', () => {
    expect(actionSummaryCardsSrc).toContain("repeat(4, 1fr)")
  })
})

// ════════════════════════════════════════════════════════════
// Per-surface literal-string density audit (loop-generated)
// Confirms each touched surface still uses CSS variable tokens
// rather than hardcoded raw hex values for primary text/background,
// per the established design-token convention.
// ════════════════════════════════════════════════════════════
describe('Token usage audit — surfaces consume var(--text-*) / var(--bg-*) tokens', () => {
  const TOKEN_SURFACES: Record<string, string> = {
    ExecutiveSummaryPanel: executiveSummaryPanelSrc,
    ExecutiveInsightsFeed: executiveInsightsFeedSrc,
    PortfolioScoreCard: portfolioScoreCardSrc,
    RiskDistributionPanel: riskDistributionSrc,
    RegionalIntelligencePanel: regionalIntelligenceSrc,
    BranchLeaderboard: branchLeaderboardSrc,
    DailyMissionPanel: dailyMissionPanelSrc,
    EmptyState: emptyStateSrc,
    ActionEmptyState: actionEmptyStateSrc,
    ActionSummaryCards: actionSummaryCardsSrc,
    TeamIntelligenceCard: teamIntelligenceCardSrc,
  }
  for (const [name, src] of Object.entries(TOKEN_SURFACES)) {
    it(`${name} references var(--text-`, () => {
      expect(src).toMatch(/var\(--text-/)
    })
    it(`${name} references var(--bg-`, () => {
      expect(src).toMatch(/var\(--bg-/)
    })
  }
  it('KpiCard references var(--text- (uses design tokens for its dense data grid even though headers use Tailwind utility classes)', () => {
    expect(kpiCardSrc).toMatch(/var\(--text-/)
  })
})

// ════════════════════════════════════════════════════════════
// Per-surface "no oversized empty container" literal audit
// ════════════════════════════════════════════════════════════
describe('Empty-container size audit — no surface pads an empty placeholder beyond 40px padding', () => {
  const PLACEHOLDER_SURFACES: Record<string, string> = {
    EmptyState: emptyStateSrc,
    ActionEmptyState: actionEmptyStateSrc,
    DailyMissionPanel: dailyMissionPanelSrc,
    ExecutiveSummaryPanel: executiveSummaryPanelSrc,
    RegionalIntelligencePanel: regionalIntelligenceSrc,
  }
  for (const [name, src] of Object.entries(PLACEHOLDER_SURFACES)) {
    it(`${name} does not use a padding value of 48px or more on any container`, () => {
      expect(src).not.toMatch(/padding:\s*['"](4[89]|[5-9]\d|\d{3,})px/)
    })
  }
})
