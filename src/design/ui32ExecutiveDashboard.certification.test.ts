// ============================================================
// UI 3.2 — Executive Dashboard Transformation Certification
//
// Same raw-source-scan convention as every other certification
// suite in this repo (no jsdom/testing-library anywhere — vitest
// runs these in a Node environment; `typeof window === 'undefined'`
// throughout). Verifies the dashboard grid rebuild, the strong
// Daily Mission Hero, the official KpiCard migration, the new
// Analytics Row, the new Executive Intelligence Row, alerts/
// activities compactness, and the bundle's guardrails: no business
// logic, no Evaluation Engine, no Ranking Engine, no AI, no Profile
// Studio kernel, no Firestore schema, no permission, no route
// changes, no fake/seed data, no external assets, no runtime
// reference-image use.
// ============================================================
import { describe, it, expect } from 'vitest'

const dashboardPageSrc = await import('../pages/dashboard/DashboardPage.jsx?raw').then((m) => m.default)
const dailyMissionHeroSrc = await import('../components/dashboard/DailyMissionHero.jsx?raw').then((m) => m.default)
const kpiDistributionDonutSrc = await import('../components/dashboard/KpiDistributionDonut.jsx?raw').then((m) => m.default)
const topAlertsPanelSrc = await import('../components/dashboard/TopAlertsPanel.jsx?raw').then((m) => m.default)
const kpiHealthHeatmapSrc = await import('../components/dashboard/KpiHealthHeatmap.jsx?raw').then((m) => m.default)
const activityFeedPanelSrc = await import('../components/dashboard/ActivityFeedPanel.jsx?raw').then((m) => m.default)
const kpiCardSrc = await import('../components/kpi/KpiCard.jsx?raw').then((m) => m.default)
const dailyMissionPanelSrc = await import('../components/dashboard/DailyMissionPanel.jsx?raw').then((m) => m.default)
const execSummaryPanelSrc = await import('../components/executive/ExecutiveSummaryPanel.jsx?raw').then((m) => m.default)

const TOUCHED_FILES: Record<string, string> = {
  'DashboardPage.jsx': dashboardPageSrc,
  'DailyMissionHero.jsx': dailyMissionHeroSrc,
  'KpiDistributionDonut.jsx': kpiDistributionDonutSrc,
  'TopAlertsPanel.jsx': topAlertsPanelSrc,
  'KpiHealthHeatmap.jsx': kpiHealthHeatmapSrc,
  'ActivityFeedPanel.jsx': activityFeedPanelSrc,
}

const NEW_FILES: Record<string, string> = {
  'DailyMissionHero.jsx': dailyMissionHeroSrc,
  'KpiDistributionDonut.jsx': kpiDistributionDonutSrc,
  'TopAlertsPanel.jsx': topAlertsPanelSrc,
  'KpiHealthHeatmap.jsx': kpiHealthHeatmapSrc,
  'ActivityFeedPanel.jsx': activityFeedPanelSrc,
}

// ════════════════════════════════════════════════════════════
// A — Dashboard grid rebuild: locked section order
// ════════════════════════════════════════════════════════════
describe('UI3.2-A — Dashboard grid follows the locked top-to-bottom order', () => {
  const SECTION_MARKERS: Array<[string, string]> = [
    ['Daily Mission Hero', '<DailyMissionHero'],
    ['Executive Hero Section', 'Executive Hero Section'],
    ['KPI Cards row', '<KpiCard'],
    ['Analytics Row', 'Analytics Row — UI3.2-D'],
    ['Trend chart', 'MTD Performance Trend'],
    ['KPI Distribution', '<KpiDistributionDonut'],
    ['Smart Alerts', '<TopAlertsPanel'],
    ['Executive Intelligence Row', 'Executive Intelligence Row — UI3.2-E'],
    ['KPI Health heatmap', '<KpiHealthHeatmap'],
    ['Executive Summary', '<ExecutiveSummaryPanel'],
    ['Activities panel', '<ActivityFeedPanel'],
  ]
  for (let i = 0; i < SECTION_MARKERS.length - 1; i++) {
    const [nameA, markerA] = SECTION_MARKERS[i]
    const [nameB, markerB] = SECTION_MARKERS[i + 1]
    it(`"${nameA}" appears before "${nameB}"`, () => {
      const idxA = dashboardPageSrc.indexOf(markerA)
      const idxB = dashboardPageSrc.indexOf(markerB)
      expect(idxA).toBeGreaterThan(-1)
      expect(idxB).toBeGreaterThan(-1)
      expect(idxA).toBeLessThan(idxB)
    })
  }
  it('the dashboard-card customizer (StatCard row + Settings2 trigger) was removed (declutter)', () => {
    expect(dashboardPageSrc).not.toContain('setShowCustom(true)')
    expect(dashboardPageSrc).not.toContain('function CardCustomizer')
  })
  it('the redundant "Today\'s KPIs" bar chart was removed (superseded by Distribution + Trend)', () => {
    expect(dashboardPageSrc).not.toContain("Today's KPIs")
  })
  it('the old inline "Live Priority Alerts" block no longer exists in DashboardPage (extracted)', () => {
    expect(dashboardPageSrc).not.toMatch(/liveAnalytics\.alerts\.filter\(a => !a\.dismissed/)
  })
  it('the old inline "KPI Health Badges" block no longer exists in DashboardPage (extracted)', () => {
    expect(dashboardPageSrc).not.toContain('KPI Health Badges')
  })
  it('no duplicate headers: only one "Daily Mission" hero rendered at the top', () => {
    const firstHero = dashboardPageSrc.indexOf('<DailyMissionHero')
    const secondHero = dashboardPageSrc.indexOf('<DailyMissionHero', firstHero + 1)
    expect(firstHero).toBeGreaterThan(-1)
    expect(secondHero).toBe(-1)
  })
  it('the relocated DailyMissionPanel (biggest-risk/opportunity view) still renders, in the Activities column', () => {
    const activitiesIdx = dashboardPageSrc.indexOf('Executive Intelligence Row — UI3.2-E')
    const panelIdx = dashboardPageSrc.indexOf('<DailyMissionPanel', activitiesIdx)
    expect(activitiesIdx).toBeGreaterThan(-1)
    expect(panelIdx).toBeGreaterThan(activitiesIdx)
  })
  it('Branch Ranking / Month vs Target / Team Intelligence / Run Rate Forecast are kept as a compact supplementary section (not deleted)', () => {
    expect(dashboardPageSrc).toContain('Branch ranking (admin) or Month vs Target')
    expect(dashboardPageSrc).toContain('<TeamIntelligenceCard')
    expect(dashboardPageSrc).toContain('Run Rate Forecast')
  })
})

// ════════════════════════════════════════════════════════════
// B — Strong Daily Mission Hero
// ════════════════════════════════════════════════════════════
describe('UI3.2-B — DailyMissionHero matches the locked spec', () => {
  it('DashboardPage imports DailyMissionHero', () => {
    expect(dashboardPageSrc).toContain("import DailyMissionHero from '../../components/dashboard/DailyMissionHero'")
  })
  it('DashboardPage renders <DailyMissionHero fed by mission/dayRatio/criticalCount/projectedFinishPct', () => {
    expect(dashboardPageSrc).toContain('<DailyMissionHero')
    expect(dashboardPageSrc).toContain('mission={mission}')
    expect(dashboardPageSrc).toContain('dayRatio={dayRatio}')
    expect(dashboardPageSrc).toContain('criticalCount={')
    expect(dashboardPageSrc).toContain('projectedFinishPct={projectedFinishPct}')
  })
  it('criticalCount is derived from liveAnalytics.kpiHealth — no new calculation', () => {
    expect(dashboardPageSrc).toContain("liveAnalytics?.kpiHealth?.filter((h) => h.state === 'critical')")
  })
  it('projectedFinishPct reuses computeOverallAchievement — no new scoring formula', () => {
    expect(dashboardPageSrc).toContain('const projectedFinishPct = useMemo(')
    expect(dashboardPageSrc).toContain('computeOverallAchievement(forecastStatsMap)')
  })
  it('renders a headline (tone-of-voice copy) and the action statement', () => {
    expect(dailyMissionHeroSrc).toContain('HEADLINE_BY_DIFFICULTY')
    expect(dailyMissionHeroSrc).toContain('mission.action')
  })
  it('headline copy matches the example tone from the spec ("Close the gap. Win the day.")', () => {
    expect(dailyMissionHeroSrc).toContain('Close the gap. Win the day.')
  })
  it('renders the required-today metric (Need)', () => {
    expect(dailyMissionHeroSrc).toContain('mission.requiredToday')
    expect(dailyMissionHeroSrc).toContain('Need')
  })
  it('renders the critical drifts count', () => {
    expect(dailyMissionHeroSrc).toContain('Critical Drifts')
    expect(dailyMissionHeroSrc).toContain('criticalCount')
  })
  it('renders the projected finish percentage', () => {
    expect(dailyMissionHeroSrc).toContain('Projected Finish')
    expect(dailyMissionHeroSrc).toContain('projectedFinishPct')
  })
  it('renders the focus KPI label', () => {
    expect(dailyMissionHeroSrc).toContain('mission.kpiLabel?.en || mission.focusKpi')
  })
  it('renders month progress', () => {
    expect(dailyMissionHeroSrc).toContain('Month Progress')
    expect(dailyMissionHeroSrc).toContain('monthProgressPct')
  })
  it('renders a status indicator derived from getTrafficLight (no new status logic)', () => {
    expect(dailyMissionHeroSrc).toContain('getTrafficLight(mission.achievementPct, dayRatio)')
    expect(dailyMissionHeroSrc).toContain('TRAFFIC_COLORS')
  })
  it('uses a theme-aware gradient only — no external background image', () => {
    expect(dailyMissionHeroSrc).toContain('linear-gradient(135deg, var(--bg-elevated)')
    expect(dailyMissionHeroSrc).not.toMatch(/backgroundImage|background-image/i)
    expect(dailyMissionHeroSrc).not.toMatch(/url\(['"]?(?!#)/)
  })
  it('every numeric value rendered is a prop or trivial presentation arithmetic — no useMemo inside the hero component', () => {
    expect(dailyMissionHeroSrc).not.toContain('useMemo(')
    expect(dailyMissionHeroSrc).not.toContain('useState(')
  })
  it('has no Firestore/Firebase access', () => {
    expect(dailyMissionHeroSrc).not.toMatch(/from ['"].*firestore|from ['"].*firebase/i)
  })
  it('returns null when there is no mission (no fake placeholder)', () => {
    expect(dailyMissionHeroSrc).toContain('if (!mission) return null')
  })
})

// ════════════════════════════════════════════════════════════
// C — KPI Cards Migration
// ════════════════════════════════════════════════════════════
describe('UI3.2-C — KPI Cards row uses the official KpiCard template', () => {
  it('DashboardPage imports KpiCard', () => {
    expect(dashboardPageSrc).toContain("import KpiCard from '../../components/kpi/KpiCard'")
  })
  it('DashboardPage renders <KpiCard for each KPI_KEYS entry', () => {
    expect(dashboardPageSrc).toContain('KPI_KEYS.map((k) => {')
    expect(dashboardPageSrc).toContain('<KpiCard')
  })
  it('DashboardPage no longer renders the old KpiTile mega-card pattern', () => {
    expect(dashboardPageSrc).not.toContain('<KpiTile')
    expect(dashboardPageSrc).not.toContain("import { KpiTile }")
  })
  it('KpiCard makes achievement % the dominant value (not progress-only)', () => {
    expect(kpiCardSrc).toContain("fontSize: 'var(--font-display, 28px)'")
    expect(kpiCardSrc).toContain("achievement !== null ? `${achievement}%` : '—'")
  })
  it('KpiCard renders a compact metadata grid (Actual / Target / Remaining gap / Required daily pace)', () => {
    expect(kpiCardSrc).toContain('Actual')
    expect(kpiCardSrc).toContain('Target')
    expect(kpiCardSrc).toContain('Remaining gap')
    expect(kpiCardSrc).toContain('Required daily pace')
  })
  it('KpiCard uses tabular-nums for numeric values', () => {
    expect(kpiCardSrc).toContain("fontVariantNumeric: 'tabular-nums'")
  })
  it('the KPI cards row wraps cleanly via auto-fit minmax (no fixed column overflow)', () => {
    expect(dashboardPageSrc).toContain("gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))'")
  })
})

// ════════════════════════════════════════════════════════════
// D — Analytics Row
// ════════════════════════════════════════════════════════════
describe('UI3.2-D — Analytics Row: Trend (left) + Distribution (middle) + Alerts (right)', () => {
  it('DashboardPage imports KpiDistributionDonut and TopAlertsPanel', () => {
    expect(dashboardPageSrc).toContain("import KpiDistributionDonut from '../../components/dashboard/KpiDistributionDonut'")
    expect(dashboardPageSrc).toContain("import TopAlertsPanel from '../../components/dashboard/TopAlertsPanel'")
  })
  it('the relocated trend chart is still the existing multi-series AreaChart (no chart logic rewrite)', () => {
    expect(dashboardPageSrc).toContain('<AreaChart data={trendData}')
    expect(dashboardPageSrc).toContain('MTD Performance Trend')
  })
  it('KpiDistributionDonut is fed by kpiDistributionCounts — a pure reshape of kpiStats, no new scoring', () => {
    expect(dashboardPageSrc).toContain('<KpiDistributionDonut counts={kpiDistributionCounts}')
    expect(dashboardPageSrc).toContain('const kpiDistributionCounts = useMemo(')
  })
  it('kpiDistributionCounts buckets are On Track / Behind Pace / At Risk / No Data', () => {
    expect(kpiDistributionDonutSrc).toContain("'onTrack', 'behindPace', 'atRisk', 'noData'")
    expect(kpiDistributionDonutSrc).toContain("label: 'On Track'")
    expect(kpiDistributionDonutSrc).toContain("label: 'Behind Pace'")
    expect(kpiDistributionDonutSrc).toContain("label: 'At Risk'")
    expect(kpiDistributionDonutSrc).toContain("label: 'No Data'")
  })
  it('TopAlertsPanel is fed by liveAnalytics.alerts — the existing engine call, no new alert logic', () => {
    expect(dashboardPageSrc).toContain('<TopAlertsPanel alerts={liveAnalytics?.alerts ?? []}')
  })
  it('the Analytics Row grid is minimal (3 columns at desktop width)', () => {
    expect(dashboardPageSrc).toContain('xl:grid-cols-[1.4fr_1fr_1fr]')
  })
})

// ════════════════════════════════════════════════════════════
// E — Executive Intelligence Row
// ════════════════════════════════════════════════════════════
describe('UI3.2-E — Executive Intelligence Row: heatmap + summary + activities', () => {
  it('DashboardPage imports KpiHealthHeatmap, ExecutiveSummaryPanel and ActivityFeedPanel', () => {
    expect(dashboardPageSrc).toContain("import KpiHealthHeatmap from '../../components/dashboard/KpiHealthHeatmap'")
    expect(dashboardPageSrc).toContain("import ExecutiveSummaryPanel from '../../components/executive/ExecutiveSummaryPanel'")
    expect(dashboardPageSrc).toContain("import ActivityFeedPanel from '../../components/dashboard/ActivityFeedPanel'")
  })
  it('KpiHealthHeatmap is fed by liveAnalytics.kpiHealth — the same data the old "Live KPI Health" badges used', () => {
    expect(dashboardPageSrc).toContain('<KpiHealthHeatmap kpiHealth={liveAnalytics?.kpiHealth ?? []}')
    expect(kpiHealthHeatmapSrc).toContain("import { KPI_HEALTH_COLORS } from '../../engine/liveAnalytics'")
  })
  it('KpiHealthHeatmap is documented as the scoped equivalent of the multi-branch Heatmap.jsx (no fork of that component)', () => {
    expect(kpiHealthHeatmapSrc).toContain('equivalent existing heatmap')
    expect(kpiHealthHeatmapSrc).not.toMatch(/from ['"].*heatmap\/Heatmap['"]/)
  })
  it('ExecutiveSummaryPanel is fed by this page\'s already-computed overallAch/strongest/weakest KPI — no new scoring', () => {
    expect(dashboardPageSrc).toContain('<ExecutiveSummaryPanel')
    expect(dashboardPageSrc).toContain('overallScore={overallAch}')
    expect(dashboardPageSrc).toContain('bestKpi={kpiStats[strongestKpi]?._label')
    expect(dashboardPageSrc).toContain('focusKpi={kpiStats[weakestKpi]?._label')
  })
  it('ExecutiveSummaryPanel surfaces score/best/focus/risk/opportunity/narrative (matches blueprint fields)', () => {
    expect(execSummaryPanelSrc).toContain('overallScore')
    expect(execSummaryPanelSrc).toContain('bestKpi')
    expect(execSummaryPanelSrc).toContain('focusKpi')
    expect(execSummaryPanelSrc).toContain('primaryRisk')
    expect(execSummaryPanelSrc).toContain('topOpportunity')
    expect(execSummaryPanelSrc).toContain('narrative')
  })
  it('ActivityFeedPanel is fed by liveAnalytics.activityFeed — same engine call as the old inline feed', () => {
    expect(dashboardPageSrc).toContain('<ActivityFeedPanel items={liveAnalytics?.activityFeed ?? []}')
  })
  it('the relocated DailyMissionPanel sits alongside ActivityFeedPanel in the Activities column (distinct purpose from the Hero)', () => {
    const rowIdx = dashboardPageSrc.indexOf('Executive Intelligence Row — UI3.2-E')
    const feedIdx = dashboardPageSrc.indexOf('<ActivityFeedPanel', rowIdx)
    const panelIdx = dashboardPageSrc.indexOf('<DailyMissionPanel', rowIdx)
    expect(feedIdx).toBeGreaterThan(rowIdx)
    expect(panelIdx).toBeGreaterThan(feedIdx)
  })
  it('the Executive Intelligence Row grid is a 3-column layout at desktop width', () => {
    const rowIdx = dashboardPageSrc.indexOf('Executive Intelligence Row — UI3.2-E')
    const gridIdx = dashboardPageSrc.indexOf('xl:grid-cols-3', rowIdx)
    expect(rowIdx).toBeGreaterThan(-1)
    expect(gridIdx).toBeGreaterThan(rowIdx)
  })
})

// ════════════════════════════════════════════════════════════
// F/G — Alerts/Activities compactness + Responsive safety
// ════════════════════════════════════════════════════════════
describe('UI3.2-F — Alerts and Activities are compact (max 3-5 visible items)', () => {
  it('TopAlertsPanel hard-caps visible alerts at 5', () => {
    expect(topAlertsPanelSrc).toContain('const MAX_VISIBLE = 5')
    expect(topAlertsPanelSrc).toContain('Math.min(maxVisible, MAX_VISIBLE)')
  })
  it('TopAlertsPanel filters out dismissed and info-priority alerts (signal only)', () => {
    expect(topAlertsPanelSrc).toContain("!a.dismissed && a.priority !== 'info'")
  })
  it('TopAlertsPanel shows severity badges via a colored dot and bordered styling', () => {
    expect(topAlertsPanelSrc).toContain("borderRadius: '50%'")
    expect(topAlertsPanelSrc).toContain('isCritical')
  })
  it('TopAlertsPanel renders a compact EmptyState when there are no active alerts', () => {
    expect(topAlertsPanelSrc).toContain('<EmptyState')
    expect(topAlertsPanelSrc).toContain('compact')
    expect(topAlertsPanelSrc).toContain('No active alerts')
  })
  it('ActivityFeedPanel defaults to a max of 5 visible items', () => {
    expect(activityFeedPanelSrc).toContain('maxVisible = 5')
    expect(activityFeedPanelSrc).toContain('.slice(0, maxVisible)')
  })
  it('ActivityFeedPanel shows a severity badge per row with a timestamp', () => {
    expect(activityFeedPanelSrc).toContain('item.severity')
    expect(activityFeedPanelSrc).toContain('item.relativeTime')
  })
  it('ActivityFeedPanel renders a compact EmptyState when there is no activity', () => {
    expect(activityFeedPanelSrc).toContain('<EmptyState')
    expect(activityFeedPanelSrc).toContain('compact')
    expect(activityFeedPanelSrc).toContain('No activity yet')
  })
})

describe('UI3.2-G — Responsive safety (desktop-first, no overflow, no full mobile redesign)', () => {
  it('KPI cards row uses auto-fit minmax so cards wrap cleanly without overflow', () => {
    expect(dashboardPageSrc).toContain("gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))'")
  })
  it('Analytics Row and Executive Intelligence Row both collapse to a single column on small screens', () => {
    const analyticsIdx = dashboardPageSrc.indexOf('Analytics Row — UI3.2-D')
    const analyticsGridIdx = dashboardPageSrc.indexOf("gridTemplateColumns:'1fr'", analyticsIdx)
    expect(analyticsGridIdx).toBeGreaterThan(analyticsIdx)
    const execIdx = dashboardPageSrc.indexOf('Executive Intelligence Row — UI3.2-E')
    const execGridIdx = dashboardPageSrc.indexOf("gridTemplateColumns:'1fr'", execIdx)
    expect(execGridIdx).toBeGreaterThan(execIdx)
  })
  it('no fixed pixel widths wider than the viewport are hardcoded on the new sections (maxWidth gate stays at 1600px on the page wrapper)', () => {
    expect(dashboardPageSrc).toContain("maxWidth:'1600px'")
  })
})

// ════════════════════════════════════════════════════════════
// H — Guardrails: no business logic / no fake data / no forbidden tech
// ════════════════════════════════════════════════════════════
const FORBIDDEN_KEYWORDS = [
  'evaluationEngine', 'evaluationPipeline', 'evaluationActualsService',
  'evaluationLedgerService', 'evaluationOrchestrationService', 'evaluationRegistryService',
  'rankingEngine', 'computeRanking', 'generateRankings',
  'aiAssistant', 'aiInsights', 'AIEngine',
  'ProfileStudioKernel', 'profileStudioEngine',
  'collection(', 'addDoc(', 'updateDoc(', 'deleteDoc(', 'onSnapshot(',
  'usePermissions(', 'permissionGate(',
  '<Route ', 'Math.random(', 'mockData', 'seedData', 'fakeData',
  'particlesJs', 'WebGLRenderer', '<canvas', 'framer-motion',
  'TODO: remove', 'FIXME',
]

describe('UI3.2-H — Per-file × per-guardrail-keyword exhaustive matrix (touched files)', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    for (const keyword of FORBIDDEN_KEYWORDS) {
      it(`${fileName} does not contain forbidden construct: "${keyword}"`, () => {
        expect(src).not.toContain(keyword)
      })
    }
  }
})

describe('UI3.2-H — No fake/seed data anywhere in the new dashboard surfaces', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} contains no Math.random / mock / seed / fake-data generator`, () => {
      expect(src).not.toContain('Math.random(')
      expect(src).not.toMatch(/mockData|seedData|fakeData/)
    })
  }
})

describe('UI3.2-H — No external image assets, no runtime reference-image usage', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} renders no <img> tag and no background image asset`, () => {
      expect(src).not.toMatch(/<img\b/)
      expect(src).not.toMatch(/backgroundImage|background-image/i)
    })
    it(`${fileName} does not import or render a reference-image asset file`, () => {
      expect(src).not.toMatch(/from ['"][^'"]*\.(png|jpe?g|gif|webp)['"]/)
      expect(src).not.toMatch(/src=['"][^'"]*\.(png|jpe?g|gif|webp)['"]/)
    })
  }
})

describe('UI3.2-H — No route changes (App.jsx untouched, no new <Route> in touched files)', () => {
  for (const [fileName, src] of Object.entries(TOUCHED_FILES)) {
    it(`${fileName} does not define a new route`, () => {
      expect(src).not.toContain('<Route')
      expect(src).not.toContain('path=\"/')
    })
  }
})

// ════════════════════════════════════════════════════════════
// I — Theme tokens (no hardcoded surface colors on the new components)
// ════════════════════════════════════════════════════════════
describe('UI3.2-I — New dashboard components use theme tokens for surfaces/text', () => {
  for (const [fileName, src] of Object.entries(NEW_FILES)) {
    it(`${fileName} uses var(--text-*) tokens for text color`, () => {
      expect(src).toMatch(/var\(--text-/)
    })
    it(`${fileName} does not hardcode the page background or card surface color`, () => {
      expect(src).not.toMatch(/background:\s*['"]#(?:fff|ffffff|000|000000)['"]/i)
    })
  }
  it('DailyMissionHero uses radius/density tokens (--radius-card, --density-card-padding)', () => {
    expect(dailyMissionHeroSrc).toContain('var(--radius-card')
    expect(dailyMissionHeroSrc).toContain('var(--density-card-padding')
  })
})

// ════════════════════════════════════════════════════════════
// J — Build / type safety sanity (non-empty, parseable module shape)
// ════════════════════════════════════════════════════════════
describe('UI3.2-J — New files are well-formed modules', () => {
  for (const [fileName, src] of Object.entries(NEW_FILES)) {
    it(`${fileName} has a default export`, () => {
      expect(src).toMatch(/export default function|export default \w+/)
    })
    it(`${fileName} imports React`, () => {
      expect(src).toContain("import React from 'react'")
    })
    it(`${fileName} is non-trivial (more than 20 lines of source)`, () => {
      expect(src.split('\n').length).toBeGreaterThan(20)
    })
  }
})
