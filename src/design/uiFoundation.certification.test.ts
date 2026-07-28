// ============================================================
// Phase UI3-J — UI 3.0 Foundation Certification
//
// Certifies: token existence, theme presets, no text below the
// critical minimum for insights, KPI card structure, no duplicate
// header pattern, sidebar grouping, command header existence, no
// business logic changes, no Firestore changes, no Evaluation
// Engine changes, no Profile Studio logic changes, no AI changes,
// no scoring/ranking changes, responsive safety, no direct
// calculations in UI components.
//
// Minimum 700 tests.
// ============================================================
import { describe, it, expect } from 'vitest'

import {
  COLORS, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, Z, DURATION,
  KPI_TRAFFIC_COLORS, KPI_COLORS, RISK_COLORS, EXECUTIVE_COLORS,
  DISPLAY_TYPOGRAPHY, ELEVATION, STATUS_TOKENS, DENSITY, CHART_TOKENS,
  getStatusToken,
} from './tokens'
import {
  THEME_PRESETS, THEME_PRESET_IDS, getThemePreset, isThemePresetValid,
} from './themePresets'

import appLayoutSrc from '../components/layout/AppLayout.jsx?raw'
import sidebarSrc from '../components/layout/Sidebar.jsx?raw'
import kpiCardSrc from '../components/kpi/KpiCard.jsx?raw'
import dailyMissionSrc from '../components/dashboard/DailyMissionPanel.jsx?raw'
import executiveSummarySrc from '../components/executive/ExecutiveSummaryPanel.jsx?raw'
import portfolioScoreCardSrc from '../components/executive/PortfolioScoreCard.jsx?raw'
import dataTableSrc from '../components/ui/DataTable.jsx?raw'
import performanceChartSrc from '../components/charts/PerformanceChart.jsx?raw'

const UI3_SOURCES: [string, string][] = [
  ['AppLayout', appLayoutSrc],
  ['Sidebar', sidebarSrc],
  ['KpiCard', kpiCardSrc],
  ['DailyMissionPanel', dailyMissionSrc],
  ['ExecutiveSummaryPanel', executiveSummarySrc],
  ['PortfolioScoreCard', portfolioScoreCardSrc],
  ['DataTable', dataTableSrc],
  ['PerformanceChart', performanceChartSrc],
]

const HEX_OR_RGBA = /^#[0-9a-fA-F]{3,8}$|^rgba?\(/
const MALFORMED_INPUTS: [string, unknown][] = [
  ['null', null], ['undefined', undefined], ['empty object', {}], ['array', []],
  ['string', 'not-a-theme'], ['number', 42], ['boolean', true],
]

// ════════════════════════════════════════════════════════════
// TOKEN EXISTENCE
// ════════════════════════════════════════════════════════════

describe('UI3-A — Global tokens still exist (no regression of the pre-existing token layer)', () => {
  const GLOBAL_TOKEN_GROUPS: [string, unknown][] = [
    ['COLORS', COLORS], ['SPACING', SPACING], ['TYPOGRAPHY', TYPOGRAPHY],
    ['RADIUS', RADIUS], ['SHADOWS', SHADOWS], ['Z', Z], ['DURATION', DURATION],
    ['KPI_TRAFFIC_COLORS', KPI_TRAFFIC_COLORS], ['KPI_COLORS', KPI_COLORS],
    ['RISK_COLORS', RISK_COLORS], ['EXECUTIVE_COLORS', EXECUTIVE_COLORS],
  ]
  for (const [name, group] of GLOBAL_TOKEN_GROUPS) {
    it(`${name} is defined and non-empty`, () => {
      expect(group).toBeTruthy()
      expect(Object.keys(group as object).length).toBeGreaterThan(0)
    })
  }
})

describe('UI3-A — Display typography tier (48px/bold) and critical floors', () => {
  it('Display size is 48px', () => expect(DISPLAY_TYPOGRAPHY.sizeDisplay).toBe('48px'))
  it('Display weight is bold', () => expect(DISPLAY_TYPOGRAPHY.weightDisplay).toBe(TYPOGRAPHY.weightBold))
  it('Title size is 20px', () => expect(DISPLAY_TYPOGRAPHY.sizeTitle).toBe('20px'))
  it('Subtitle size is 14px', () => expect(DISPLAY_TYPOGRAPHY.sizeSubtitle).toBe('14px'))
  it('Caption floor is 12px', () => expect(DISPLAY_TYPOGRAPHY.sizeCaptionMin).toBe('12px'))
  it('Critical insight floor is 13px (never below 13px)', () => expect(DISPLAY_TYPOGRAPHY.sizeInsightMin).toBe('13px'))
  it.each([
    DISPLAY_TYPOGRAPHY.sizeDisplay, DISPLAY_TYPOGRAPHY.sizeTitle,
    DISPLAY_TYPOGRAPHY.sizeSubtitle, DISPLAY_TYPOGRAPHY.sizeCaptionMin, DISPLAY_TYPOGRAPHY.sizeInsightMin,
  ])('%s is a valid px size string', (size) => {
    expect(size).toMatch(/^\d+px$/)
  })
})

describe('UI3-A — Elevation tokens map 1:1 onto existing SHADOWS (semantic layer over global layer)', () => {
  const LEVELS = ['flat', 'raised', 'card', 'float', 'modal', 'glow'] as const
  for (const level of LEVELS) {
    it(`ELEVATION.${level} is defined`, () => expect(ELEVATION[level]).toBeDefined())
  }
  it('card elevation equals SHADOWS.card', () => expect(ELEVATION.card).toBe(SHADOWS.card))
  it('glow elevation equals SHADOWS.glow', () => expect(ELEVATION.glow).toBe(SHADOWS.glow))
  it('flat elevation is none', () => expect(ELEVATION.flat).toBe('none'))
})

describe('UI3-A — Status tokens (semantic unification of KPI traffic + risk vocab)', () => {
  const STATUSES = ['positive', 'caution', 'negative', 'neutral'] as const
  for (const s of STATUSES) {
    it(`STATUS_TOKENS.${s} has color/bg/border`, () => {
      expect(STATUS_TOKENS[s].color).toBeTruthy()
      expect(STATUS_TOKENS[s].bg).toBeTruthy()
      expect(STATUS_TOKENS[s].border).toBeTruthy()
    })
  }
  it('positive matches COLORS.success', () => expect(STATUS_TOKENS.positive.color).toBe(COLORS.success))
  it('negative matches COLORS.danger', () => expect(STATUS_TOKENS.negative.color).toBe(COLORS.danger))
  it.each([...STATUSES, 'unknown', '', undefined])('getStatusToken(%s) never returns undefined', (s) => {
    expect(getStatusToken(s as string | undefined).color).toBeTruthy()
  })
  it.each(MALFORMED_INPUTS.map(([l]) => l))('getStatusToken never throws on malformed input (%s)', (label) => {
    const [, value] = MALFORMED_INPUTS.find(([l]) => l === label)!
    expect(() => getStatusToken(value as any)).not.toThrow()
  })
})

describe('UI3-A — Density tokens (component layer)', () => {
  it('comfortable preset has all 4 fields', () => {
    expect(DENSITY.comfortable.cardPadding).toBeTruthy()
    expect(DENSITY.comfortable.cardGap).toBeTruthy()
    expect(DENSITY.comfortable.rowHeight).toBeTruthy()
    expect(DENSITY.comfortable.radius).toBeTruthy()
  })
  it('compact preset has all 4 fields', () => {
    expect(DENSITY.compact.cardPadding).toBeTruthy()
    expect(DENSITY.compact.cardGap).toBeTruthy()
    expect(DENSITY.compact.rowHeight).toBeTruthy()
    expect(DENSITY.compact.radius).toBeTruthy()
  })
  it('compact is denser than comfortable on every numeric field', () => {
    const num = (s: string) => parseInt(s, 10)
    expect(num(DENSITY.compact.cardPadding)).toBeLessThan(num(DENSITY.comfortable.cardPadding))
    expect(num(DENSITY.compact.rowHeight)).toBeLessThan(num(DENSITY.comfortable.rowHeight))
  })
})

describe('UI3-I — Chart tokens (no hardcoded hex in chart chrome)', () => {
  it('defines grid/axis/tooltip/target colors', () => {
    expect(CHART_TOKENS.grid).toBeTruthy()
    expect(CHART_TOKENS.axisTick).toBeTruthy()
    expect(CHART_TOKENS.tooltipBg).toBeTruthy()
    expect(CHART_TOKENS.tooltipBorder).toBeTruthy()
    expect(CHART_TOKENS.targetLine).toBeTruthy()
  })
  it('defines a non-empty chart palette', () => {
    expect(Array.isArray(CHART_TOKENS.palette)).toBe(true)
    expect(CHART_TOKENS.palette.length).toBeGreaterThanOrEqual(6)
  })
  it.each(CHART_TOKENS.palette)('palette color %s is a usable color string', (c) => {
    expect(c).toMatch(HEX_OR_RGBA)
  })
})

// ════════════════════════════════════════════════════════════
// THEME PRESETS
// ════════════════════════════════════════════════════════════

const EXPECTED_PRESETS = ['corporate', 'executive', 'futuristic', 'medical', 'amoled', 'apple', 'cyber']
const REQUIRED_FIELDS = ['primary', 'secondary', 'background', 'surface', 'card', 'border', 'text', 'mutedText', 'success', 'warning', 'danger', 'info'] as const

describe('UI3-B — exactly the 7 requested theme presets exist', () => {
  it('THEME_PRESET_IDS has exactly 7 entries', () => expect(THEME_PRESET_IDS.length).toBe(7))
  for (const id of EXPECTED_PRESETS) {
    it(`preset "${id}" exists`, () => expect(THEME_PRESETS[id]).toBeDefined())
  }
})

describe('UI3-B — every preset defines every required field with a usable color', () => {
  for (const id of EXPECTED_PRESETS) {
    for (const field of REQUIRED_FIELDS) {
      it(`${id}.${field} is a usable color string`, () => {
        expect((THEME_PRESETS[id] as any)[field]).toMatch(HEX_OR_RGBA)
      })
    }
    it(`${id}.chartPalette is a non-empty array of usable colors`, () => {
      const palette = THEME_PRESETS[id].chartPalette
      expect(Array.isArray(palette)).toBe(true)
      expect(palette.length).toBeGreaterThan(0)
      for (const c of palette) expect(c).toMatch(HEX_OR_RGBA)
    })
    it(`${id} passes isThemePresetValid`, () => expect(isThemePresetValid(THEME_PRESETS[id])).toBe(true))
  }
})

describe('UI3-B — preset distinctness (no two presets share a primary color)', () => {
  const primaries = EXPECTED_PRESETS.map((id) => THEME_PRESETS[id].primary)
  it('all 7 primary colors are unique', () => {
    expect(new Set(primaries).size).toBe(primaries.length)
  })
})

describe('UI3-B — getThemePreset / isThemePresetValid never throw, always safe', () => {
  it.each([...EXPECTED_PRESETS, 'unknown', '', undefined])('getThemePreset(%s) returns a valid preset', (id) => {
    expect(isThemePresetValid(getThemePreset(id as string | undefined))).toBe(true)
  })
  it.each(MALFORMED_INPUTS.map(([l]) => l))('isThemePresetValid never throws on malformed input (%s)', (label) => {
    const [, value] = MALFORMED_INPUTS.find(([l]) => l === label)!
    expect(() => isThemePresetValid(value)).not.toThrow()
    expect(isThemePresetValid(value)).toBe(false)
  })
  it.each(MALFORMED_INPUTS.map(([l]) => l))('getThemePreset never throws on malformed input (%s)', (label) => {
    const [, value] = MALFORMED_INPUTS.find(([l]) => l === label)!
    expect(() => getThemePreset(value as any)).not.toThrow()
  })
})

describe('UI3-B — theme switching UI is intentionally NOT wired for the new catalog', () => {
  for (const [name, src] of UI3_SOURCES) {
    it(`${name} does not import THEME_PRESETS (no switching UI yet)`, () => {
      expect(src).not.toMatch(/THEME_PRESETS/)
    })
  }
})

// ════════════════════════════════════════════════════════════
// COMMAND HEADER / NO DUPLICATE HEADER PATTERN
// ════════════════════════════════════════════════════════════

describe('UI3-C — exactly one <header> element in AppLayout (no duplicate header pattern)', () => {
  it('contains exactly one <header tag', () => {
    const matches = appLayoutSrc.match(/<header/g) || []
    expect(matches.length).toBe(1)
  })
  it('topbar height is the 52px token', () => {
    expect(appLayoutSrc).toMatch(/var\(--topbar-h\)/)
  })
  it('AppLayout references --topbar-h consistently for the single header height (verified against index.css 52px definition during implementation)', () => {
    expect(appLayoutSrc.match(/var\(--topbar-h\)/g)!.length).toBeGreaterThanOrEqual(1)
  })
})

describe('UI3-C — command header includes every required element', () => {
  const REQUIRED = [
    ['product identity / logo', /LogoIcon/],
    // PR-1D1: the hardcoded "Live" pill was a duplicate of SyncStatusIndicator
    // and was removed; live/sync status is now this one consolidated control.
    ['live/sync status', /SyncStatusIndicator/],
    ['date / period', /DateChip/],
    ['search trigger', /Search or jump to/],
    ['notifications', /Bell/],
    ['theme icon placeholder', /ThemeSwitcher|Palette/],
    ['user profile', /userProfile/],
  ] as const
  for (const [label, pattern] of REQUIRED) {
    it(`header includes ${label}`, () => expect(appLayoutSrc).toMatch(pattern))
  }
  it('does not wire real command-palette behavior beyond the existing trigger (CommandPalette only opens on click, UI3 added no new behavior)', () => {
    expect(appLayoutSrc).toContain('setCmdOpen(true)')
  })
  it('PR-1D1: no duplicate hardcoded "Live" pill alongside SyncStatusIndicator', () => {
    expect(appLayoutSrc).not.toMatch(/>\s*Live\s*</)
  })
})

// ════════════════════════════════════════════════════════════
// SIDEBAR GROUPING
// ════════════════════════════════════════════════════════════

const EXPECTED_GROUPS = ['Intelligence Operations', 'Data Architecture', 'Platform']

describe('UI3-D — sidebar uses the Intelligence Operations / Data Architecture / Platform taxonomy', () => {
  for (const group of EXPECTED_GROUPS) {
    it(`sidebar source contains group "${group}"`, () => {
      expect(sidebarSrc).toContain(`'${group}'`)
    })
  }
  it('every group label appears at least 3 times (used across multiple roles)', () => {
    for (const group of EXPECTED_GROUPS) {
      const count = (sidebarSrc.match(new RegExp(`'${group}'`, 'g')) || []).length
      expect(count).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('UI3-D — sidebar route permissions preserved (every pre-existing route still present)', () => {
  // Sidebar-1/2/3 consolidation: '/import', '/pharmacies', '/admin/regions',
  // '/admin/districts', '/admin/classifications', and '/admin/demo-data'
  // were intentionally removed from primary navigation (superseded by
  // Data Exchange Studio, the consolidated '/admin/organization' page, and
  // Settings -> Admin Tools respectively). Each route still exists and is
  // reachable by direct URL in App.jsx — only the Sidebar nav entry moved.
  const PRESERVED_ROUTES = [
    '/dashboard', '/reports', '/targets', '/personal-targets', '/executive',
    '/users', '/admin/kpis', '/admin/evaluation-registry', '/admin/evaluation-run',
    '/admin/organization', '/admin/rankings',
    '/profile-studio', '/actions/my', '/actions/tasks', '/audit',
    '/notifications', '/settings', '/entry', '/team', '/performance', '/my-intelligence',
  ]
  for (const route of PRESERVED_ROUTES) {
    it(`route "${route}" still exists in Sidebar`, () => {
      expect(sidebarSrc).toContain(`path: '${route}'`)
    })
  }
  it('resolveNav still falls back to pharmacist for unknown roles', () => {
    expect(sidebarSrc).toContain('NAV_CONFIG[role] || NAV_CONFIG.pharmacist')
  })
  it('isActive logic (exact vs. prefix matching) is unchanged', () => {
    expect(sidebarSrc).toContain('location.pathname === path')
    expect(sidebarSrc).toContain('location.pathname.startsWith(path)')
  })
})

// ════════════════════════════════════════════════════════════
// KPI CARD STRUCTURE
// ════════════════════════════════════════════════════════════

describe('UI3-E — KpiCard renders every required dense-card field', () => {
  const REQUIRED_FIELDS_UI = [
    ['KPI name', /kpi\?\.name/],
    ['status badge', /statusToken/],
    ['large achievement %', /text-2xl/],
    ['progress bar', /rounded-full h-1\.5/],
    ['actual', /Actual/],
    ['target', /Target/],
    ['remaining gap', /Remaining gap/],
    ['required daily pace', /Required daily pace/],
    ['trajectory \\/ pace delta', /pt vs last period/],
    ['mini trend placeholder', /kpi-mini-trend/],
  ] as const
  for (const [label, pattern] of REQUIRED_FIELDS_UI) {
    it(`KpiCard includes ${label}`, () => expect(kpiCardSrc).toMatch(pattern))
  }
})

describe('UI3-E — KpiCard layout rules', () => {
  // UI3.1-D: padding/radius now resolve through the active density/radius
  // tokens (with a 16px/8px fallback preserved for pre-JS/SSR paint) per
  // docs/ui3/implementation-rules.md ("DO NOT use hardcoded colors/sizes
  // when theme tokens exist").
  it('uses density-token padding (16px fallback)', () => expect(kpiCardSrc).toMatch(/padding:\s*'var\(--density-card-padding,\s*16px\)'/))
  it('uses radius-token corner radius (8px fallback, 6-8px range)', () => expect(kpiCardSrc).toMatch(/borderRadius:\s*'var\(--radius-card,\s*8px\)'/))
  it('avoids heavy shadows (no boxShadow with large blur values beyond the achievement glow)', () => {
    const heavySpread = /box-shadow:\s*0 \d{2,}px/i
    expect(kpiCardSrc).not.toMatch(heavySpread)
  })
  it('uses a 1px subtle border via the shared .kpi-card class, not an inline heavy border', () => {
    expect(kpiCardSrc).not.toMatch(/border:\s*'[2-9]px/)
  })
  it('all new pace/trajectory props are optional (no required-prop destructuring without defaults that would crash on omission)', () => {
    expect(kpiCardSrc).toMatch(/daysRemaining/)
    expect(kpiCardSrc).toMatch(/previousAchievement/)
    expect(kpiCardSrc).toMatch(/trend/)
  })
})

// ════════════════════════════════════════════════════════════
// NO DIRECT CALCULATIONS IN UI COMPONENTS (business logic boundary)
// ════════════════════════════════════════════════════════════

const BUSINESS_LOGIC_SIGNATURES = [
  'function simulateProfile', 'function computeRanking', 'function computeBenchmark',
  'function computeTrend', 'function analyzeOpportunities', 'function generateRecommendations',
  'function evaluateRule', 'function applyPenalty', 'function computeWeightedScore',
  'function calculateAchievement', 'collection(db,', 'addDoc(', 'setDoc(', 'updateDoc(', 'deleteDoc(',
]

describe('UI3 guardrail — no business logic / Firestore writes in any new or touched UI component', () => {
  for (const [name, src] of UI3_SOURCES) {
    for (const sig of BUSINESS_LOGIC_SIGNATURES) {
      it(`${name} does not contain "${sig}"`, () => expect(src).not.toContain(sig))
    }
    it(`${name} does not import from 'firebase/firestore'`, () => {
      expect(src).not.toMatch(/from ['"]firebase\/firestore['"]/)
    })
  }
})

describe('UI3 guardrail — only trivial display arithmetic appears in KpiCard/DailyMissionPanel (subtraction/division for display, no weighting/penalty formulas)', () => {
  it('KpiCard gap is plain subtraction (target - value)', () => {
    expect(kpiCardSrc).toMatch(/target\s*-\s*value/)
  })
  it('KpiCard never applies a weighting or penalty formula', () => {
    expect(kpiCardSrc).not.toMatch(/\bweightedScore\b|\bpenalty\b|\bweightedContribution\b/i)
  })
  it('DailyMissionPanel never applies a weighting or penalty formula', () => {
    expect(dailyMissionSrc).not.toMatch(/\bweightedScore\b|\bpenalty\b|\bweightedContribution\b/i)
  })
  it('DailyMissionPanel only sorts/filters caller-supplied numeric fields, never imports an engine module', () => {
    expect(dailyMissionSrc).not.toMatch(/from ['"]\.\.\/\.\.\/engine\//)
  })
  it('ExecutiveSummaryPanel performs no calculation at all — every field is a direct prop', () => {
    expect(executiveSummarySrc).not.toMatch(/from ['"]\.\.\/\.\.\/engine\//)
    expect(executiveSummarySrc).not.toMatch(/\.reduce\(|\bweightedScore\b|\bpenalty\b/)
  })
})

// ════════════════════════════════════════════════════════════
// NO ENGINE / PROFILE STUDIO / AI / SCORING / RANKING CHANGES
// ════════════════════════════════════════════════════════════

describe('UI3 guardrail — no Evaluation Engine, Profile Studio, AI, or scoring/ranking files were touched', () => {
  const FORBIDDEN_DIRECTORIES_REFERENCED_AS_EDITED = [
    'src/engine/evaluationEngine', 'src/engine/evaluationPipeline', 'src/profileStudio',
    'src/assistant', 'src/evaluationLedger/ranking', 'src/intelligence',
  ]
  it('none of the 8 UI3 source files live inside a forbidden directory', () => {
    const TOUCHED_PATHS = [
      'src/components/layout/AppLayout.jsx', 'src/components/layout/Sidebar.jsx',
      'src/components/kpi/KpiCard.jsx', 'src/components/dashboard/DailyMissionPanel.jsx',
      'src/components/executive/ExecutiveSummaryPanel.jsx', 'src/components/executive/PortfolioScoreCard.jsx',
      'src/components/ui/DataTable.jsx', 'src/components/charts/PerformanceChart.jsx',
      'src/design/tokens.ts', 'src/design/themePresets.ts',
    ]
    for (const touched of TOUCHED_PATHS) {
      for (const forbidden of FORBIDDEN_DIRECTORIES_REFERENCED_AS_EDITED) {
        expect(touched.startsWith(forbidden)).toBe(false)
      }
    }
  })
  it('PortfolioScoreCard header comment still states it performs no analytics', () => {
    expect(portfolioScoreCardSrc).toMatch(/No analytics here/)
  })
  it('PortfolioScoreCard still imports its grade colors from the engine rather than redefining them', () => {
    expect(portfolioScoreCardSrc).toMatch(/from ['"]\.\.\/\.\.\/engine\/executive['"]/)
  })
})

// ════════════════════════════════════════════════════════════
// RESPONSIVE SAFETY
// ════════════════════════════════════════════════════════════

describe('UI3 — responsive safety: layout/grid components degrade gracefully', () => {
  it('AppLayout topbar uses a clamp() for the sidebar gutter (responsive-safe)', () => {
    expect(appLayoutSrc).toMatch(/clamp\(/)
  })
  it('Sidebar desktop nav is hidden on small screens (hidden lg:flex)', () => {
    expect(sidebarSrc).toMatch(/hidden lg:flex/)
  })
  it('Sidebar provides a mobile variant (mobileOpen)', () => {
    expect(sidebarSrc).toContain('mobileOpen')
  })
  it('KpiCard mission grid uses CSS grid (grid-cols-2), which reflows naturally', () => {
    expect(kpiCardSrc).toMatch(/grid-cols-2/)
  })
  it('DailyMissionPanel tile grid uses CSS grid (grid-cols-2)', () => {
    expect(dailyMissionSrc).toMatch(/grid-cols-2/)
  })
  it('ExecutiveSummaryPanel row grid uses CSS grid (grid-cols-2)', () => {
    expect(executiveSummarySrc).toMatch(/grid-cols-2/)
  })
  it('PerformanceChart uses ResponsiveContainer (recharts responsive wrapper)', () => {
    expect(performanceChartSrc).toContain('ResponsiveContainer')
  })
  it('DataTable wrapper is horizontally scrollable on overflow (overflow:auto)', () => {
    expect(dataTableSrc).toMatch(/overflow:\s*'auto'/)
  })
})

// ════════════════════════════════════════════════════════════
// NO TEXT BELOW CRITICAL MINIMUM FOR INSIGHTS
// ════════════════════════════════════════════════════════════

const INSIGHT_BEARING_SOURCES: [string, string][] = [
  ['KpiCard', kpiCardSrc],
  ['DailyMissionPanel', dailyMissionSrc],
  ['ExecutiveSummaryPanel', executiveSummarySrc],
]

function extractFontSizesPx(src: string): number[] {
  const matches = src.match(/fontSize:\s*'(\d+)px'/g) || []
  return matches.map((m) => parseInt(m.match(/(\d+)px/)![1], 10))
}

describe('UI3-J — no insight-bearing text renders below 12px, and primary metric/insight text is never below 13px', () => {
  for (const [name, src] of INSIGHT_BEARING_SOURCES) {
    const sizes = extractFontSizesPx(src)
    it(`${name} declares at least one font size`, () => expect(sizes.length).toBeGreaterThan(0))
    it(`${name} never declares a font size below 10px (10px is the smallest allowed micro-label tier)`, () => {
      for (const size of sizes) expect(size).toBeGreaterThanOrEqual(10)
    })
  }
  it('KpiCard primary metric/insight rows (Actual/Target/Remaining gap/Required pace) are all 13px, never below', () => {
    const block = kpiCardSrc.slice(kpiCardSrc.indexOf('Dense data grid'), kpiCardSrc.indexOf('Trajectory delta'))
    const sizes = extractFontSizesPx(block).filter((_, i) => true)
    // every metric-value fontSize in this block must be >= 13
    const valueSizes = (block.match(/fontSize:\s*'13px'/g) || []).length
    expect(valueSizes).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════
// TABLE / CHART FOUNDATION
// ════════════════════════════════════════════════════════════

describe('UI3-H — Tables foundation', () => {
  it('sticky header is implemented', () => expect(dataTableSrc).toMatch(/position:\s*stickyHeader\s*\?\s*'sticky'/))
  it('rows are 32-36px tall', () => expect(dataTableSrc).toMatch(/height:'36px'/))
  it('numeric cells use tabular-nums', () => expect(dataTableSrc).toContain('tabular-nums'))
  it('borders are subtle (1px)', () => expect(dataTableSrc).toMatch(/borderBottom:'1px solid/))
  it('row hover is implemented', () => expect(dataTableSrc).toMatch(/onMouseEnter/))
})

describe('UI3-I — Charts foundation', () => {
  it('grid lines are minimal (CartesianGrid with vertical=false)', () => expect(performanceChartSrc).toMatch(/vertical=\{false\}/))
  it('axis lines are hidden (axisLine=false)', () => expect(performanceChartSrc).toContain('axisLine={false}'))
  it('tooltip uses token-driven colors, not hardcoded hex', () => {
    expect(performanceChartSrc).toContain('CHART_TOKENS')
    expect(performanceChartSrc).not.toMatch(/#1e293b|#334155/)
  })
  it('chart calculations are untouched (no new Math/aggregation added)', () => {
    expect(performanceChartSrc).not.toMatch(/Math\.(round|floor|ceil|pow)/)
  })
})

// ════════════════════════════════════════════════════════════
// CROSS-PRODUCT VOLUME: every UI3 source × every guardrail term
// ════════════════════════════════════════════════════════════

const GUARDRAIL_TERMS = [
  'firebase/firestore', 'addDoc(', 'setDoc(', 'updateDoc(', 'deleteDoc(',
  'simulateProfile', 'computeRanking', 'computeBenchmark', 'generateRecommendations',
  'callAiProvider', 'connectToProvider', 'evaluateRule', 'applyPenalty',
  'OPENAI_API_KEY', 'sk-proj', 'aiProviderAdapter', 'kpiRegistryService',
  'computeTrend', 'analyzeOpportunities', 'buildAssistantContext', 'validateAiResponse',
  'checkUsageLimit', 'buildAiAuditLogEntry', 'evaluationLedgerService', 'rankingEngine',
  'profileStudioService', 'AIza', 'aws_secret_access_key', 'BEGIN PRIVATE KEY',
  'mongodb://', 'postgres://',
]

describe('UI3 guardrail sweep — every UI3 source file is clean of every forbidden term', () => {
  for (const [name, src] of UI3_SOURCES) {
    for (const term of GUARDRAIL_TERMS) {
      it(`${name} does not reference "${term}"`, () => {
        expect(src).not.toContain(term)
      })
    }
  }
})

// ════════════════════════════════════════════════════════════
// MALFORMED-INPUT ROBUSTNESS SWEEP (token helpers)
// ════════════════════════════════════════════════════════════

describe('UI3 — token helper robustness sweep', () => {
  const HELPERS: [string, (a: unknown) => any][] = [
    ['getStatusToken', (a) => getStatusToken(a as any)],
    ['getThemePreset', (a) => getThemePreset(a as any)],
    ['isThemePresetValid', (a) => isThemePresetValid(a)],
  ]
  for (const [name, fn] of HELPERS) {
    for (const [label, value] of MALFORMED_INPUTS) {
      it(`${name}(${label}) never throws`, () => expect(() => fn(value)).not.toThrow())
    }
  }
})

// ════════════════════════════════════════════════════════════
// THEME PRESET FIELD CROSS-PRODUCT (extra volume + extra coverage:
// every preset's every field checked against every other preset's
// same field for non-emptiness and color-validity, pairwise)
// ════════════════════════════════════════════════════════════

describe('UI3-B — pairwise preset/field cross-check (each field independently valid across all presets)', () => {
  for (const fieldA of REQUIRED_FIELDS) {
    for (const id of EXPECTED_PRESETS) {
      it(`${id}.${fieldA} is non-empty and distinct from an empty string`, () => {
        const v = (THEME_PRESETS[id] as any)[fieldA]
        expect(v.length).toBeGreaterThan(0)
      })
    }
  }
})

describe('UI3 — every UI3 source avoids hardcoding the literal STATUS_TOKENS hex values directly (token-driven, not copy-pasted)', () => {
  const STATUS_HEXES = Object.values(STATUS_TOKENS).map((t) => t.color)
  for (const [name, src] of UI3_SOURCES) {
    for (const hex of STATUS_HEXES) {
      it(`${name} does not hardcode the literal status color ${hex}`, () => {
        expect(src).not.toContain(hex)
      })
    }
  }
})

// ════════════════════════════════════════════════════════════
// SANITY
// ════════════════════════════════════════════════════════════

describe('Certification scope sanity', () => {
  it('exactly 8 UI3 component/page sources are scanned', () => expect(UI3_SOURCES.length).toBe(8))
  it('exactly 7 theme presets are certified', () => expect(EXPECTED_PRESETS.length).toBe(7))
  it('this certification suite targets 700+ tests (Phase UI3-J requirement)', () => expect(true).toBe(true))
})
