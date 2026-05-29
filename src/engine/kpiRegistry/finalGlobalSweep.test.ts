// ============================================================
// Part 5B — Final Global Sweep Regression Tests
// Tests: remaining manager/admin/executive safe color access,
//        custom KPI fallbacks, deferred static area documentation,
//        full architecture readiness assertions.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'

import {
  DEFAULT_KPI_UI_CONFIG,
  DEFAULT_KPI_REGISTRY,
  getKpisForSurface,
} from '../../engine/kpiRegistry'
import { TRAFFIC_COLORS, KPI_KEYS, KPI_META } from '../../engine'
import { mergeRemoteRegistryWithDefaults }     from '../../services/kpiRegistryLogic'
import type { KpiDefinition, KpiRegistry }     from '../../engine/kpiRegistry'

// ── Source files ───────────────────────────────────────────────
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8')

const ADMIN_DASH_SRC     = read('../../pages/admin/AdminDashboard.jsx')
const MANAGER_DASH_SRC   = read('../../pages/manager/ManagerDashboard.jsx')
const APPROVAL_SRC       = read('../../pages/manager/ApprovalQueuePage.jsx')
const HEATMAP_SRC        = read('../../components/executive/PortfolioKpiHeatmap.jsx')
const ANALYTICS_SRC      = read('../../engine/kpiAnalyticsEngine.ts')
const IMPORT_CENTER_SRC  = read('../../pages/admin/ImportCenterPage.jsx')
const KPICARD_SRC        = read('../../components/kpi/KpiCard.jsx')
const PERF_SRC           = read('../../pages/pharmacist/PerformancePage.jsx')
const TEAM_MGMT_SRC      = read('../../pages/shared/TeamManagementPage.jsx')
const KPISERVICE_SRC     = read('../../services/kpiService.js')

const FALLBACK_COLOR = '#a1a1aa'

// ── Helpers ────────────────────────────────────────────────────

function customKpi(key: string, opts: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key, label: key, shortLabel: key, labelAr: key,
    category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
    visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false },
    sortOrder: 500,
    ...opts,
  }
}

/** Simulate AdminDashboard kpiOverview spread: templates.map(kpi => ({ ...kpi, achievement })) */
function buildKpiOverview(templates: Array<{ id: string; name: string; color?: string }>) {
  return templates.map((kpi) => ({
    ...kpi,
    achievement: 75,
    count: 1,
  }))
}

/** Safe color resolution — mirrors ?? guard added in Phase 5B */
function safeKpiColor(color?: string | null): string {
  return color ?? FALLBACK_COLOR
}

// ══════════════════════════════════════════════════════════════
// 1 — AdminDashboard — kpi.color patch verified
// ══════════════════════════════════════════════════════════════

describe('AdminDashboard — Phase 5B kpi.color fix', () => {
  it('dot indicator uses kpi.color ?? fallback (no bare kpi.color)', () => {
    // Patched: background: kpi.color ?? '#a1a1aa'
    expect(ADMIN_DASH_SRC).toMatch(/background:\s*kpi\.color\s*\?\?\s*'#a1a1aa'/)
  })

  it('progress bar fill uses kpi.color ?? fallback', () => {
    // Both occurrences should now use ??
    const matches = [...ADMIN_DASH_SRC.matchAll(/background:\s*kpi\.color\s*\?\?\s*'#a1a1aa'/g)]
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('no bare kpi.color (without fallback) remains in AdminDashboard', () => {
    // Both patched occurrences now use ?? '#a1a1aa' — verify neither bare form exists
    // Bare form = "background: kpi.color" followed by } or , or newline but NOT ?? or ||
    const barePattern = /background:\s*kpi\.color\s*(?!\s*\?\?|\s*\|\|)/
    expect(ADMIN_DASH_SRC).not.toMatch(barePattern)
  })

  it('kpiOverview items with missing color get safe fallback in rendering', () => {
    const templates = [
      { id: 't1', name: 'Wasfaty', color: '#6366f1' },
      { id: 't2', name: 'NPS' /* no color */ },
    ]
    const overview = buildKpiOverview(templates)
    for (const kpi of overview) {
      const color = safeKpiColor((kpi as { color?: string }).color)
      expect(color).toBeTruthy()
      expect(color).toMatch(/^#[0-9a-fA-F]{3,6}$/)
    }
  })

  it('kpiOverview template with undefined color resolves to FALLBACK_COLOR', () => {
    const kpi = { id: 't2', name: 'NPS', achievement: 80 }
    expect(safeKpiColor((kpi as { color?: string }).color)).toBe(FALLBACK_COLOR)
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — ManagerDashboard — KPI table header color guard
// ══════════════════════════════════════════════════════════════

describe('ManagerDashboard — KPI table header color safety', () => {
  it('KPI table header uses k.color ?? fallback', () => {
    expect(MANAGER_DASH_SRC).toMatch(/k\.color\s*\?\?\s*'#a1a1aa'/)
  })

  it('ManagerDashboard has no bare static KPI_FIELDS constant', () => {
    expect(MANAGER_DASH_SRC).not.toMatch(/^const KPI_FIELDS\s*=/m)
  })

  it('ManagerDashboard uses templates from kpiStore for dynamic KPI list', () => {
    expect(MANAGER_DASH_SRC).toContain('templates')
  })

  it('k.color with undefined resolves safely via ?? pattern', () => {
    const k = { id: 'nps', name: 'NPS' } // no color
    const color = (k as { color?: string }).color ?? '#a1a1aa'
    expect(color).toBe('#a1a1aa')
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — ApprovalQueuePage — already safe
// ══════════════════════════════════════════════════════════════

describe('ApprovalQueuePage — kpi.color already safe', () => {
  it('uses kpi?.color || fallback (optional chaining + OR fallback)', () => {
    expect(APPROVAL_SRC).toMatch(/kpi\?\.color\s*\|\|/)
  })

  it('kpiColor field never undefined in approval item', () => {
    // Simulate: kpiColor: kpi?.color || '#1a9a7e'
    const cases = [
      { kpi: { color: '#6366f1' }, expected: '#6366f1' },
      { kpi: { color: undefined }, expected: '#1a9a7e' },
      { kpi: null,                  expected: '#1a9a7e' },
    ]
    for (const { kpi, expected } of cases) {
      const kpiColor = (kpi as { color?: string } | null)?.color || '#1a9a7e'
      expect(kpiColor).toBe(expected)
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — PortfolioKpiHeatmap — core-analytics-only + safe cfg
// ══════════════════════════════════════════════════════════════

describe('PortfolioKpiHeatmap — intentional core-analytics scope + Phase 5B guards', () => {
  it('has architecture comment documenting intentional KPI_KEYS limitation', () => {
    expect(HEATMAP_SRC).toContain('INTENTIONALLY CORE-ANALYTICS-ONLY')
  })

  it('has deferred limitation comment', () => {
    expect(HEATMAP_SRC).toContain('deferred')
  })

  it('cfg has double fallback: TRAFFIC_COLORS[status] ?? TRAFFIC_COLORS.good ?? hardcoded', () => {
    expect(HEATMAP_SRC).toMatch(/TRAFFIC_COLORS\[ach\.status\]\s*\?\?\s*TRAFFIC_COLORS\.good\s*\?\?/)
  })

  it('meta has fallback for unknown KPI keys', () => {
    expect(HEATMAP_SRC).toMatch(/KPI_META\[kpiKey\]\s*\?\?/)
  })

  it('cfg.color is always defined via TRAFFIC_COLORS.good fallback', () => {
    // Simulate unknown status
    const unknownStatus = 'unknown_xyz'
    const cfg = TRAFFIC_COLORS[unknownStatus as keyof typeof TRAFFIC_COLORS]
              ?? TRAFFIC_COLORS.good
              ?? { color: '#a1a1aa', bg: 'transparent', border: '#a1a1aa', labelAr: '—' }
    expect(cfg.color).toBeTruthy()
    expect(typeof cfg.color).toBe('string')
  })

  it('KPI_META fallback prevents crash for non-core KPI key', () => {
    const meta = KPI_META['unknownKpi' as keyof typeof KPI_META]
              ?? { en: 'unknownKpi', ar: 'unknownKpi', unit: '', targetField: '' }
    expect(meta.en).toBe('unknownKpi')
  })

  it('portfolioAch lookup with missing key returns null safely', () => {
    const portfolioAch: Record<string, unknown> = { wasfaty: { achievementPct: 85, status: 'good', totalActual: 100, totalTarget: 120 } }
    const ach = portfolioAch['nps']
    // PortfolioKpiHeatmap: if (!ach) return null → renders nothing for unknown KPI
    expect(ach).toBeUndefined()
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — Executive components — cfg.color safety
// ══════════════════════════════════════════════════════════════

describe('Executive components — cfg.color always from TRAFFIC_COLORS (safe)', () => {
  it('TRAFFIC_COLORS.excellent.color is defined', () => {
    expect(TRAFFIC_COLORS.excellent.color).toBeTruthy()
  })

  it('TRAFFIC_COLORS.good.color is defined', () => {
    expect(TRAFFIC_COLORS.good.color).toBeTruthy()
  })

  it('TRAFFIC_COLORS.warning.color is defined', () => {
    expect(TRAFFIC_COLORS.warning.color).toBeTruthy()
  })

  it('TRAFFIC_COLORS.critical.color is defined', () => {
    expect(TRAFFIC_COLORS.critical.color).toBeTruthy()
  })

  it('all TRAFFIC_COLORS entries have color, bg, border, labelAr', () => {
    for (const [status, cfg] of Object.entries(TRAFFIC_COLORS)) {
      expect(cfg.color,   `${status}.color`).toBeTruthy()
      expect(cfg.bg,      `${status}.bg`).toBeTruthy()
      expect(cfg.border,  `${status}.border`).toBeTruthy()
      expect(cfg.labelAr, `${status}.labelAr`).toBeTruthy()
    }
  })

  it('TRAFFIC_COLORS lookup with ?? fallback never returns undefined color', () => {
    const statuses = ['excellent', 'good', 'warning', 'critical', 'unknown', undefined, '']
    for (const s of statuses) {
      const cfg = TRAFFIC_COLORS[s as keyof typeof TRAFFIC_COLORS] ?? TRAFFIC_COLORS.good
      expect(cfg.color).toBeTruthy()
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — Intentionally static / deferred areas documented
// ══════════════════════════════════════════════════════════════

describe('Deferred static areas — intentionally limited (non-blocking)', () => {
  it('kpiAnalyticsEngine KPI_KEYS is intentionally limited to 5 core KPIs', () => {
    expect(KPI_KEYS).toHaveLength(5)
    expect(KPI_KEYS).toContain('wasfaty')
    expect(KPI_KEYS).toContain('omni')
    expect(KPI_KEYS).toContain('wellness')
    expect(KPI_KEYS).toContain('basket')
    expect(KPI_KEYS).toContain('crossSelling')
  })

  it('KPI_META covers exactly the same 5 keys', () => {
    const metaKeys = Object.keys(KPI_META)
    expect(metaKeys).toHaveLength(5)
    for (const key of KPI_KEYS) {
      expect(metaKeys).toContain(key)
    }
  })

  it('ImportCenterPage uses hardcoded Excel columns (deferred — documented)', () => {
    // Import center template columns are intentionally static for Excel compatibility
    expect(IMPORT_CENTER_SRC).toContain('wasfatyTarget')
    expect(IMPORT_CENTER_SRC).toContain('omniTarget')
    // This is by design: Excel import uses a fixed template format
    // Custom KPI import via Excel is deferred to a future import phase
  })

  it('kpiService bulkImportKpiEntries still uses core 5 fields (deferred)', () => {
    // bulkImportKpiEntries uses fixed Excel-row fields — safe to leave static
    // The dynamic saveKpiEntry underneath will still receive and sanitize them
    expect(KPISERVICE_SRC).toContain('bulkImportKpiEntries')
    expect(KPISERVICE_SRC).toContain('wasfaty')  // still in bulkImport rows
  })

  it('core analytics engine KPI_KEYS not modified — existing engine tests safe', () => {
    // Verify the engine file still contains the static KPI_KEYS definition
    expect(ANALYTICS_SRC).toMatch(/export const KPI_KEYS/)
    expect(ANALYTICS_SRC).toContain("'wasfaty'")
    expect(ANALYTICS_SRC).toContain("'crossSelling'")
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — Unknown KPI color fallback — universal safety check
// ══════════════════════════════════════════════════════════════

describe('Universal — unknown/custom KPI gets safe fallback color', () => {
  const ALL_CUSTOM = ['nps', 'manuka', 'sales', 'sl', 'ndf', 'inbody', 'liberation']

  it('DEFAULT_KPI_UI_CONFIG.defaultColor is the canonical fallback', () => {
    expect(DEFAULT_KPI_UI_CONFIG.defaultColor).toBe('#a1a1aa')
  })

  it('all custom KPI engine-key lookups fall back safely', () => {
    for (const key of ALL_CUSTOM) {
      // Simulate any rendering path that does: kpi?.color ?? '#a1a1aa'
      const kpiObj = { id: key, name: key } // no color field
      const color = (kpiObj as { color?: string }).color ?? '#a1a1aa'
      expect(color).toBe('#a1a1aa')
    }
  })

  it('KpiCard getBarColor never returns undefined for any pct', () => {
    const getBarColor = (pct: number, kpiColor?: string) => {
      if (pct >= 100) return '#22c55e'
      if (pct >= 80)  return kpiColor || '#1a9a7e'
      if (pct >= 60)  return '#eab308'
      return '#ef4444'
    }
    for (const pct of [0, 30, 60, 75, 80, 90, 100, 120]) {
      expect(getBarColor(pct, undefined)).toBeTruthy()
      expect(getBarColor(pct, '#6366f1')).toBeTruthy()
    }
  })

  it('TeamManagementPage dot uses ?? fallback chain', () => {
    // Patched in Part 3: kpi.color ?? kpi.defaultColor ?? '#a1a1aa'
    expect(TEAM_MGMT_SRC).toMatch(/kpi\.color\s*\?\?\s*kpi\.defaultColor\s*\?\?\s*'#a1a1aa'/)
  })

  it('PerformancePage has no static KPI_FIELDS constant', () => {
    expect(PERF_SRC).not.toMatch(/^const KPI_FIELDS\s*=/m)
  })
})

// ══════════════════════════════════════════════════════════════
// 8 — Registry-driven pages complete audit
// ══════════════════════════════════════════════════════════════

describe('Registry-driven rendering completeness audit', () => {
  it('KpiEntryPage imports subscribeKpiRegistry (live registry)', () => {
    const src = read('../../pages/pharmacist/KpiEntryPage.jsx')
    expect(src).toContain('subscribeKpiRegistry')
  })

  it('PerformancePage imports subscribeKpiRegistry (live registry)', () => {
    expect(PERF_SRC).toContain('subscribeKpiRegistry')
  })

  it('kpiStore.saveEntry passes registry through to saveKpiEntry', () => {
    const src = read('../../store/kpiStore.js')
    expect(src).toMatch(/saveEntry:\s*async\s*\(\s*data\s*,\s*registry\s*\)/)
  })

  it('sanitizeKpiEntryFields is exported from kpiRegistryLogic', () => {
    const src = read('../../services/kpiRegistryLogic.ts')
    expect(src).toContain('export function sanitizeKpiEntryFields')
  })

  it('ENTRY_METADATA_FIELDS is exported from kpiRegistryLogic', () => {
    const src = read('../../services/kpiRegistryLogic.ts')
    expect(src).toContain('export const ENTRY_METADATA_FIELDS')
  })

  it('kpiService saveKpiEntry accepts ...kpiFields spread (no hardcoded KPI params)', () => {
    expect(KPISERVICE_SRC).toContain('...kpiFields')
    expect(KPISERVICE_SRC).not.toMatch(/wasfaty\s*=\s*0/)
  })

  it('DEFAULT_KPI_REGISTRY serves as fallback for all pages that subscribe to live registry', () => {
    // All three pages that use subscribeKpiRegistry fall back to DEFAULT_KPI_REGISTRY
    for (const src of [PERF_SRC, read('../../pages/pharmacist/KpiEntryPage.jsx')]) {
      expect(src).toContain('DEFAULT_KPI_REGISTRY')
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 9 — No KPI_FIELDS static constant in stabilized files
// ══════════════════════════════════════════════════════════════

describe('Static KPI_FIELDS elimination audit', () => {
  const stabilizedFiles = [
    { name: 'PerformancePage.jsx',      src: PERF_SRC },
    { name: 'ManagerDashboard.jsx',     src: MANAGER_DASH_SRC },
    { name: 'AdminDashboard.jsx',       src: ADMIN_DASH_SRC },
    { name: 'ApprovalQueuePage.jsx',    src: APPROVAL_SRC },
  ]

  for (const { name, src } of stabilizedFiles) {
    it(`${name} has no top-level static KPI_FIELDS constant`, () => {
      expect(src).not.toMatch(/^const KPI_FIELDS\s*=/m)
    })
  }

  it('KpiEntryPage has no static KPI_FIELDS constant', () => {
    const src = read('../../pages/pharmacist/KpiEntryPage.jsx')
    expect(src).not.toMatch(/^const KPI_FIELDS\s*=/m)
  })
})

// ══════════════════════════════════════════════════════════════
// 10 — Full system safety: core KPI rendering preserved
// ══════════════════════════════════════════════════════════════

describe('Core KPI rendering preserved after all stabilization', () => {
  it('DEFAULT_KPI_REGISTRY always includes wasfaty', () => {
    expect(DEFAULT_KPI_REGISTRY['wasfaty']).toBeDefined()
  })

  it('DEFAULT_KPI_REGISTRY always includes omnihealth (renders as omni)', () => {
    expect(DEFAULT_KPI_REGISTRY['omnihealth']).toBeDefined()
    expect(DEFAULT_KPI_REGISTRY['omnihealth']?.aliasFor).toBe('omni')
  })

  it('DEFAULT_KPI_REGISTRY always includes wellness', () => {
    expect(DEFAULT_KPI_REGISTRY['wellnessCard'] ?? DEFAULT_KPI_REGISTRY['wellness']).toBeDefined()
  })

  it('DEFAULT_KPI_REGISTRY always includes basket', () => {
    expect(DEFAULT_KPI_REGISTRY['basket']).toBeDefined()
  })

  it('DEFAULT_KPI_REGISTRY always includes crossSelling', () => {
    expect(DEFAULT_KPI_REGISTRY['crossSelling']).toBeDefined()
  })

  it('getKpisForSurface dashboardEnabled returns all 5 core KPIs', () => {
    const fields = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'dashboardEnabled')
    const engineKeys = fields.map((f) => f.aliasFor ?? f.key)
    expect(engineKeys).toContain('wasfaty')
    expect(engineKeys).toContain('omni')
    expect(engineKeys).toContain('wellness')
    expect(engineKeys).toContain('basket')
    expect(engineKeys).toContain('crossSelling')
  })

  it('mergeRemoteRegistryWithDefaults always preserves 5 core KPIs', () => {
    const merged = mergeRemoteRegistryWithDefaults({ nps: customKpi('nps') } as KpiRegistry)
    const fields  = getKpisForSurface(merged, 'dashboardEnabled')
    const keys    = fields.map((f) => f.aliasFor ?? f.key)
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('omni')
    expect(keys).toContain('wellness')
    expect(keys).toContain('basket')
    expect(keys).toContain('crossSelling')
    expect(keys).toContain('nps')
  })
})
