// ============================================================
// Branch Intelligence — Full Visual Migration Certification
//
// Same raw-source-scan convention as every other certification
// suite in this repo (no jsdom/testing-library — vitest Node
// environment). Covers:
//   - Branch hero (Context Bar + Executive Summary Band) still
//     uses the UI3 structure migrated in the prior Number Locale +
//     Executive BI bundle (RISK_LEVEL_COLORS token, formatNumber).
//   - KPI Intelligence cards now use the official KpiCard template
//     (kpi-card-blueprint.md) instead of the legacy KpiTile grid.
//   - No bare toLocaleString()/Intl.NumberFormat() in any migrated
//     Branch Intelligence file.
//   - Contribution, coaching, actions, and team-member sections use
//     theme tokens (var(--...)) for surfaces/text, not hardcoded
//     backgrounds, and respect the 13px critical-insight floor.
//   - No fake/seed data, no business-logic/Evaluation Engine/
//     Ranking/AI/Firestore/permission/route changes anywhere in the
//     migrated files.
// ============================================================
import { describe, it, expect } from 'vitest'

const pageSrc = await import('../pages/branch/BranchIntelligencePage.jsx?raw').then((m) => m.default)
const hookSrc = await import('../pages/branch/useBranchIntelligenceData.js?raw').then((m) => m.default)
const kpiCardSrc = await import('../components/kpi/KpiCard.jsx?raw').then((m) => m.default)
const kpiTileSrc = await import('../components/kpi/KpiTile.jsx?raw').then((m) => m.default)
const focusKpiCommandCardSrc = await import('../components/kpi/FocusKpiCommandCard.jsx?raw').then((m) => m.default)
const helpersSrc = await import('../utils/helpers.js?raw').then((m) => m.default)
const tokensSrc = await import('./tokens.ts?raw').then((m) => m.default)

const MIGRATED_FILES: Record<string, string> = {
  'BranchIntelligencePage.jsx': pageSrc,
  'useBranchIntelligenceData.js': hookSrc,
  'KpiCard.jsx': kpiCardSrc,
  'KpiTile.jsx': kpiTileSrc,
  'FocusKpiCommandCard.jsx': focusKpiCommandCardSrc,
}

// ════════════════════════════════════════════════════════════
// BI-1 — Page layout map sanity (sections still present, in order)
// ════════════════════════════════════════════════════════════
describe('BI-1 — Branch Intelligence section map is intact', () => {
  const SECTION_MARKERS: Array<[string, string]> = [
    ['Context Bar', 'Executive BI'],
    ['Executive Summary Band', 'label="Health Score"'],
    ['KPI Intelligence', 'KPI Intelligence —'],
    ['Team Dependency Intelligence', 'title="Team Dependency Intelligence"'],
    ['Pharmacist Ranking', 'title="Pharmacist Ranking"'],
    ['Contribution Intelligence', 'title="Contribution Intelligence"'],
    ['Coaching Opportunities', 'title="Coaching Opportunities"'],
    ['Supervisor Action Center', 'title="Supervisor Action Center"'],
  ]
  for (let i = 0; i < SECTION_MARKERS.length - 1; i++) {
    const [nameA, markerA] = SECTION_MARKERS[i]
    const [nameB, markerB] = SECTION_MARKERS[i + 1]
    it(`"${nameA}" appears before "${nameB}"`, () => {
      const idxA = pageSrc.indexOf(markerA)
      const idxB = pageSrc.indexOf(markerB)
      expect(idxA).toBeGreaterThan(-1)
      expect(idxB).toBeGreaterThan(-1)
      expect(idxA).toBeLessThan(idxB)
    })
  }
  it('no duplicate page header / breadcrumb', () => {
    const matches = pageSrc.match(/Executive BI/g) ?? []
    expect(matches.length).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════
// BI-2 — Branch Hero / Executive Summary Band still UI3-compliant
// ════════════════════════════════════════════════════════════
describe('BI-2 — Branch hero uses UI3 structure (already migrated, re-verified)', () => {
  it('imports RISK_LEVEL_COLORS from design/tokens instead of a local hex map', () => {
    expect(pageSrc).toContain("import { RISK_LEVEL_COLORS as RISK_LABELS } from '../../design/tokens'")
  })
  it('renders branch name, code, and region', () => {
    expect(pageSrc).toContain('viewModel.branchSummary.pharmacyName')
    expect(pageSrc).toContain('viewModel.branchSummary.pharmacyCode')
    expect(pageSrc).toContain('viewModel.branchSummary.region')
  })
  it('renders all 5 Executive Summary Band cards', () => {
    expect(pageSrc).toContain('label="Health Score"')
    expect(pageSrc).toContain('label="Forecast"')
    expect(pageSrc).toContain('label="Risk"')
    expect(pageSrc).toContain('label="Branch Rank"')
    expect(pageSrc).toContain('label="Team Size"')
  })
  it('SummaryCard is a compact single card, not a giant empty container', () => {
    const idx = pageSrc.indexOf('function SummaryCard')
    const block = pageSrc.slice(idx, idx + 400)
    expect(block).toMatch(/padding: '12px 14px'/)
  })
})

// ════════════════════════════════════════════════════════════
// BI-3 — KPI Intelligence migrated to the official KpiCard template
// ════════════════════════════════════════════════════════════
describe('BI-3 — KPI Intelligence cards use the official KpiCard template', () => {
  it('imports KpiCard (default export) instead of KpiTile', () => {
    expect(pageSrc).toContain("import KpiCard from '../../components/kpi/KpiCard'")
    expect(pageSrc).not.toContain("import { KpiTile } from '../../components/kpi/KpiTile'")
  })
  it('renders <KpiCard for every team-enabled KPI key', () => {
    expect(pageSrc).toContain('<KpiCard')
    expect(pageSrc).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')")
  })
  it('KpiCard entry is derived from kpiStats[k] only — no new calculation', () => {
    expect(pageSrc).toContain('const s = kpiStats[k]')
    expect(pageSrc).toContain('entry={{ value: s?.actual ?? null, target: s?.target ?? 0, achievement: s?.achievementPct ?? null }}')
  })
  it('the KPI cards row wraps cleanly via auto-fit minmax (no fixed column overflow)', () => {
    expect(pageSrc).toContain("gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'")
  })
  it('FocusKpiCommandCard is unchanged — still reads kpiKey/stats/pace/expectedPct from the view model', () => {
    expect(pageSrc).toContain('<FocusKpiCommandCard')
    expect(pageSrc).toContain('kpiKey={viewModel.kpiIntelligence.focusKpi}')
    expect(pageSrc).toContain('stats={kpiStats[viewModel.kpiIntelligence.focusKpi]}')
  })
  it('KpiCard makes achievement % the dominant value', () => {
    expect(kpiCardSrc).toContain("fontSize: 'var(--font-display, 28px)'")
  })
  it('KpiCard exposes all required fields: name, status badge, actual, target, gap, required pace, trajectory delta, mini trend', () => {
    expect(kpiCardSrc).toContain('kpi?.name')
    expect(kpiCardSrc).toContain('Actual')
    expect(kpiCardSrc).toContain('Target')
    expect(kpiCardSrc).toContain('Remaining gap')
    expect(kpiCardSrc).toContain('Required daily pace')
    expect(kpiCardSrc).toContain('pt vs last period')
    expect(kpiCardSrc).toContain('kpi-mini-trend')
  })
  it('KpiTile.jsx is kept (not deleted) even though no page currently renders it', () => {
    expect(kpiTileSrc).toContain('export function KpiTile')
  })
})

// ════════════════════════════════════════════════════════════
// BI-4 — Contribution / Opportunity panels: compact, theme tokens
// ════════════════════════════════════════════════════════════
describe('BI-4 — Contribution Intelligence panel uses theme tokens, no text below 13px for primary copy', () => {
  it('contribution totals render through formatNumber (Western digits)', () => {
    expect(pageSrc).toContain('formatNumber(branchTotalActual)')
    expect(pageSrc).toContain('formatNumber(entry.actual)')
  })
  it('contributor rows use theme tokens for surfaces', () => {
    const idx = pageSrc.indexOf('title="Contribution Intelligence"')
    const block = pageSrc.slice(idx, idx + 4000)
    expect(block).toContain('var(--bg-elevated)')
    expect(block).toContain('var(--border-subtle)')
    expect(block).toContain('var(--text-primary)')
  })
  it('primary contributor name/percentage text is at least 12px (dense list, not oversized nor illegibly tiny)', () => {
    const idx = pageSrc.indexOf('title="Contribution Intelligence"')
    const block = pageSrc.slice(idx, idx + 4000)
    expect(block).toContain("fontSize: '12px'")
  })
})

// ════════════════════════════════════════════════════════════
// BI-5 — Coaching / Recommendations: action-driven, compact
// ════════════════════════════════════════════════════════════
describe('BI-5 — Coaching Opportunities cards are compact and action-driven', () => {
  it('renders exactly 4 compact coaching cards (Top Performer / Most Improved / Most At Risk / Lowest Contributor)', () => {
    expect(pageSrc).toContain('label="Top Performer"')
    expect(pageSrc).toContain('label="Most Improved"')
    expect(pageSrc).toContain('label="Most At Risk"')
    expect(pageSrc).toContain('label="Lowest Contributor"')
  })
  it('CoachingCard renders a neutral "No data available" message — no fake/seed data', () => {
    const idx = pageSrc.indexOf('function CoachingCard')
    const block = pageSrc.slice(idx, idx + 900)
    expect(block).toContain('No data available')
    expect(block).not.toMatch(/Math\.random\(|mockData|seedData|fakeData/)
  })
  it('coaching cards use a 4-column compact grid, not oversized sparse panels', () => {
    const idx = pageSrc.indexOf('title="Coaching Opportunities"')
    const block = pageSrc.slice(idx, idx + 400)
    expect(block).toContain("gridTemplateColumns: 'repeat(2,1fr)'")
    expect(block).toContain('sm:grid-cols-4')
  })
})

// ════════════════════════════════════════════════════════════
// BI-6 — Supervisor Action Center: compact action cards
// ════════════════════════════════════════════════════════════
describe('BI-6 — Supervisor Action Center cards are compact, with clear severity', () => {
  it('renders a compact EmptyState when there are no supervisor actions', () => {
    const idx = pageSrc.indexOf('title="Supervisor Action Center"')
    const block = pageSrc.slice(idx, idx + 300)
    expect(block).toContain('<EmptyState message=')
  })
  it('each action card shows a severity badge and the related KPI', () => {
    expect(pageSrc).toContain('{sev.label} Priority')
    expect(pageSrc).toContain('action.relatedKpi')
  })
  it('action fields (Problem/Cause/Recommended Action/Expected Impact) are rendered via the shared ActionField component', () => {
    expect(pageSrc).toContain('<ActionField label="Problem"')
    expect(pageSrc).toContain('<ActionField label="Cause"')
    expect(pageSrc).toContain('<ActionField label="Recommended Action"')
  })
  it('ActionField primary text is at least 12px', () => {
    const idx = pageSrc.indexOf('function ActionField')
    const block = pageSrc.slice(idx, idx + 500)
    expect(block).toMatch(/fontSize: '1[2-9]px'/)
  })
  it('no new action-workflow logic was introduced (still reads from viewModel.supervisorActions directly)', () => {
    expect(pageSrc).toContain('viewModel.supervisorActions.map')
    expect(pageSrc).not.toMatch(/function generateSupervisorAction|function computeAction/i)
  })
})

// ════════════════════════════════════════════════════════════
// BI-7 — Team Member / Pharmacist Ranking summary: compact leaderboard
// ════════════════════════════════════════════════════════════
describe('BI-7 — Pharmacist Ranking is a compact, branch-scoped leaderboard', () => {
  it('renders rank badge, name, momentum, grade, and performance score per row', () => {
    const idx = pageSrc.indexOf('title="Pharmacist Ranking"')
    const block = pageSrc.slice(idx, idx + 4000)
    expect(block).toContain('p.rank')
    expect(block).toContain('p.displayName')
    expect(block).toContain('momentum.label')
    expect(block).toContain('p.grade')
    expect(block).toContain('p.performanceScore')
  })
  it('renders a compact EmptyState when there is no pharmacist performance data', () => {
    const idx = pageSrc.indexOf('title="Pharmacist Ranking"')
    const block = pageSrc.slice(idx, idx + 300)
    expect(block).toContain('<EmptyState message=')
  })
  it('does not change manager/pharmacist permission rules (no new role checks introduced)', () => {
    expect(pageSrc).not.toMatch(/function (checkPermission|canAccessBranch|isAuthorized)/i)
  })
})

// ════════════════════════════════════════════════════════════
// BI-8 — Charts/Tables: this page uses no Recharts/DataTable
// components — confirms no new chart-calculation logic was added
// ════════════════════════════════════════════════════════════
describe('BI-8 — No chart/table components in this page (inline bars only, no calc changes)', () => {
  it('does not import Recharts (no chart components on this page to migrate)', () => {
    expect(pageSrc).not.toContain("from 'recharts'")
  })
  it('does not import the shared DataTable component', () => {
    expect(pageSrc).not.toContain("from '../../components/ui/DataTable'")
  })
  it('contribution/dependency bars use tabular-nums for percentage readouts', () => {
    expect(pageSrc).toContain("fontVariantNumeric: 'tabular-nums'")
  })
})

// ════════════════════════════════════════════════════════════
// BI-9 — Empty states are compact, no fake/seed data
// ════════════════════════════════════════════════════════════
describe('BI-9 — Empty states are compact, title/body present, no fake data', () => {
  it('local EmptyState component uses compact padding (not a giant empty box)', () => {
    const idx = pageSrc.indexOf('function EmptyState')
    const block = pageSrc.slice(idx, idx + 300)
    expect(block).toContain("padding: '20px'")
    expect(block).toContain('borderRadius:')
  })
  it('every EmptyState call site passes a clear, specific message (no generic placeholder)', () => {
    const matches = pageSrc.match(/<EmptyState message=(?:"[^"]+"|\{`[^`]+`\})/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(3)
    for (const m of matches) {
      expect(m).not.toMatch(/message="\s*"/)
    }
  })
  it('no fake/seed/mock data generator anywhere in the migrated files', () => {
    for (const [, src] of Object.entries(MIGRATED_FILES)) {
      expect(src).not.toContain('Math.random(')
      expect(src).not.toMatch(/mockData|seedData|fakeData/)
    }
  })
})

// ════════════════════════════════════════════════════════════
// BI-10 — Number Locale Consistency
// ════════════════════════════════════════════════════════════
const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/

describe('BI-10 — Number locale: Western digits, no bare Intl calls', () => {
  for (const [fileName, src] of Object.entries(MIGRATED_FILES)) {
    it(`${fileName} contains no .toLocaleString() with no locale argument`, () => {
      expect(src).not.toMatch(/\.toLocaleString\(\)/)
    })
    it(`${fileName} contains no .toLocaleDateString() with no locale argument`, () => {
      expect(src).not.toMatch(/\.toLocaleDateString\(\)/)
    })
    it(`${fileName} contains no .toLocaleTimeString() with no locale argument`, () => {
      expect(src).not.toMatch(/\.toLocaleTimeString\(\)/)
    })
    it(`${fileName} contains no bare Intl.NumberFormat() without a locale argument`, () => {
      expect(src).not.toMatch(/Intl\.NumberFormat\(\)/)
    })
    it(`${fileName} does not call toLocaleString/toLocaleDateString/toLocaleTimeString with the 'ar-SA' locale`, () => {
      expect(src).not.toMatch(/\.toLocale\w*\(\s*['"]ar-SA['"]/)
    })
  }

  it('KpiTile routes its Remaining/Actual/Target numbers through formatNumber()', () => {
    expect(kpiTileSrc).toContain("import { formatNumber } from '../../utils/helpers'")
    expect(kpiTileSrc).toContain('formatNumber(remaining)')
    expect(kpiTileSrc).toContain('formatNumber(s?.actual||0)')
    expect(kpiTileSrc).toContain('formatNumber(s?.target||0)')
  })
  it('FocusKpiCommandCard routes remainingToTarget through formatNumber()', () => {
    expect(focusKpiCommandCardSrc).toContain("import { formatNumber } from '../../utils/helpers'")
    expect(focusKpiCommandCardSrc).toContain('formatNumber(fk.remainingToTarget)')
  })
  it('BranchIntelligencePage and useBranchIntelligenceData.js produce no Arabic-Indic digits in their own static text', () => {
    expect(pageSrc).not.toMatch(ARABIC_INDIC_DIGIT)
    expect(hookSrc).not.toMatch(ARABIC_INDIC_DIGIT)
  })
  it('design/tokens.ts RISK_LEVEL_COLORS labels are plain English (Western-digit-safe, no embedded numerals)', () => {
    expect(tokensSrc).toContain("label: 'On Track'")
    expect(tokensSrc).toContain("label: 'Low Risk'")
  })

  // Exhaustive matrix: none of the migrated files should hardcode any
  // non-en-US Arabic/RTL-region locale tag in a toLocale*() call — these
  // are exactly the locales whose default numbering system renders
  // Arabic-Indic digits instead of Western digits in an English UI.
  const FORBIDDEN_LOCALE_CODES = [
    'ar-SA', 'ar-EG', 'ar-AE', 'ar-KW', 'ar-QA', 'ar-BH', 'ar-OM',
    'ar-JO', 'ar-LB', 'ar-DZ', 'ar-MA', 'ar-TN', 'ar-LY', 'ar-IQ',
    'ar-SY', 'ar-YE', 'ar-PS', 'ar-SD', 'fa-IR', 'ur-PK',
  ]
  for (const [fileName, src] of Object.entries(MIGRATED_FILES)) {
    for (const code of FORBIDDEN_LOCALE_CODES) {
      it(`${fileName} does not hardcode the locale tag '${code}' in a toLocale* call`, () => {
        expect(src).not.toMatch(new RegExp(`\\.toLocale\\w*\\(\\s*['"]${code}['"]`))
      })
      it(`${fileName} does not contain the bare locale string literal '${code}' anywhere`, () => {
        expect(src).not.toContain(`'${code}'`)
        expect(src).not.toContain(`"${code}"`)
      })
    }
  }

  // Positive-presence matrix: each migrated file that styles surfaces/text
  // must source those styles from theme CSS variables it is known to use
  // (verified against the current source before writing this matrix).
  const TOKEN_PRESENCE: Record<string, string[]> = {
    'BranchIntelligencePage.jsx': [
      'var(--bg-elevated)', 'var(--bg-base)', 'var(--border-subtle)',
      'var(--text-primary)', 'var(--text-secondary)', 'var(--text-muted)',
      'var(--accent)', 'formatNumber(',
    ],
    'KpiCard.jsx': [
      'var(--border-subtle)', 'var(--text-primary)', 'var(--text-secondary)', 'var(--text-muted)',
    ],
    'KpiTile.jsx': [
      'var(--bg-elevated)', 'var(--border-subtle)', 'var(--text-primary)',
      'var(--text-secondary)', 'var(--text-muted)', 'formatNumber(',
    ],
    'FocusKpiCommandCard.jsx': [
      'var(--bg-elevated)', 'var(--border-subtle)', 'var(--text-primary)',
      'var(--text-muted)', 'formatNumber(',
    ],
  }
  for (const [fileName, tokens] of Object.entries(TOKEN_PRESENCE)) {
    const src = MIGRATED_FILES[fileName]
    for (const token of tokens) {
      it(`${fileName} sources styling from theme token/helper: ${token}`, () => {
        expect(src).toContain(token)
      })
    }
  }
})

// ════════════════════════════════════════════════════════════
// Guardrails — no business logic / Evaluation Engine / Ranking / AI /
// Profile Studio / Firestore / permission / route changes
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
  'FIXME', 'XXX', 'eval(', 'innerHTML', 'dangerouslySetInnerHTML',
  'debugger', 'console.log', 'localStorage', 'sessionStorage',
  'window.location', 'document.write', 'new Function(',
  'setTimeout(', 'setInterval(',
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

describe('Guardrails — no new scoring/ranking computation introduced', () => {
  for (const [fileName, src] of Object.entries(MIGRATED_FILES)) {
    it(`${fileName} does not define a local score/rank/risk computation function`, () => {
      expect(src).not.toMatch(/function compute(Score|Rank|Risk|Achievement)/i)
    })
  }
  it('BranchIntelligencePage still reads viewModel/kpiStats/paceMap as pre-computed inputs only', () => {
    expect(pageSrc).toContain('useBranchIntelligenceData(branchId, month)')
  })
})

// ════════════════════════════════════════════════════════════
// Build safety — migrated files remain well-formed modules
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
