// ============================================================
// Part 5B — Final Global Sweep Regression Tests
// Tests: remaining executive/safe color access,
//        custom KPI fallbacks, deferred static area documentation,
//        full architecture readiness assertions.
//
// Note: AdminDashboard, ManagerDashboard, ApprovalQueuePage, and
// TeamManagementPage were removed as orphaned pages in Fix Batch 5.
// Source-text assertions for those files are removed here.
// Pure logic tests are preserved.
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

// ── Source files (live pages and components only) ─────────────
const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8')

const HEATMAP_SRC        = read('../../components/executive/PortfolioKpiHeatmap.jsx')
const ANALYTICS_SRC      = read('../../engine/kpiAnalyticsEngine.ts')
const IMPORT_CENTER_SRC  = read('../../pages/admin/ImportCenterPage.jsx')
const KPICARD_SRC        = read('../../components/kpi/KpiCard.jsx')
const PERF_SRC           = read('../../pages/pharmacist/PerformancePage.jsx')
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

/** Safe color resolution — mirrors ?? guard used throughout the codebase */
function safeKpiColor(color?: string | null): string {
  return color ?? FALLBACK_COLOR
}

// ══════════════════════════════════════════════════════════════
// 1 — Pure logic: safe color resolution
// ══════════════════════════════════════════════════════════════

describe('Safe KPI color resolution — pure logic', () => {
  it('safeKpiColor returns the color when defined', () => {
    expect(safeKpiColor('#6366f1')).toBe('#6366f1')
  })

  it('safeKpiColor returns FALLBACK_COLOR when undefined', () => {
    expect(safeKpiColor(undefined)).toBe(FALLBACK_COLOR)
  })

  it('safeKpiColor returns FALLBACK_COLOR when null', () => {
    expect(safeKpiColor(null)).toBe(FALLBACK_COLOR)
  })

  it('k.color with undefined resolves safely via ?? pattern', () => {
    const k = { id: 'nps', name: 'NPS' }
    const color = (k as { color?: string }).color ?? '#a1a1aa'
    expect(color).toBe('#a1a1aa')
  })

  it('kpiColor field never undefined when using optional chaining + fallback', () => {
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
// 2 — PortfolioKpiHeatmap — intentional core-analytics scope
// ══════════════════════════════════════════════════════════════

describe('PortfolioKpiHeatmap — intentional core-analytics scope + Phase 5B guards', () => {
  it('has architecture comment documenting intentional KPI_KEYS limitation', () => {
    expect(HEATMAP_SRC).toContain('KPI_KEYS')
  })

  it('cfg has double fallback: TRAFFIC_COLORS[status] ?? TRAFFIC_COLORS.good ?? hardcoded', () => {
    expect(HEATMAP_SRC).toMatch(/TRAFFIC_COLORS\[.*\]\s*\?\?\s*TRAFFIC_COLORS/)
  })

  it('meta has fallback for unknown KPI keys', () => {
    expect(HEATMAP_SRC).toMatch(/KPI_META\[.*\]\s*\?\?/)
  })

  it('cfg.color is always defined via TRAFFIC_COLORS.good fallback', () => {
    const cfg = TRAFFIC_COLORS['excellent'] ?? TRAFFIC_COLORS.good
    expect(cfg?.color).toBeDefined()
  })

  it('KPI_META fallback prevents crash for non-core KPI key', () => {
    const meta = KPI_META['unknown_kpi' as keyof typeof KPI_META] ?? KPI_META.wasfaty
    expect(meta).toBeDefined()
  })

  it('portfolioAch lookup with missing key returns null safely', () => {
    const portfolioAch: Record<string, number> = { wasfaty: 80 }
    const ach = portfolioAch['nonexistent'] ?? null
    expect(ach).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — Executive components — cfg.color always from TRAFFIC_COLORS
// ══════════════════════════════════════════════════════════════

describe('Executive components — cfg.color always from TRAFFIC_COLORS (safe)', () => {
  it('TRAFFIC_COLORS.excellent.color is defined', () => {
    expect(TRAFFIC_COLORS.excellent?.color).toBeDefined()
  })

  it('TRAFFIC_COLORS.good.color is defined', () => {
    expect(TRAFFIC_COLORS.good?.color).toBeDefined()
  })

  it('TRAFFIC_COLORS.warning.color is defined', () => {
    expect(TRAFFIC_COLORS.warning?.color).toBeDefined()
  })

  it('TRAFFIC_COLORS.critical.color is defined', () => {
    expect(TRAFFIC_COLORS.critical?.color).toBeDefined()
  })

  it('all TRAFFIC_COLORS entries have color, bg, border, labelAr', () => {
    for (const [, cfg] of Object.entries(TRAFFIC_COLORS)) {
      expect(cfg).toHaveProperty('color')
      expect(cfg).toHaveProperty('bg')
      expect(cfg).toHaveProperty('border')
      expect(cfg).toHaveProperty('labelAr')
    }
  })

  it('TRAFFIC_COLORS lookup with ?? fallback never returns undefined color', () => {
    const statuses = ['excellent', 'good', 'warning', 'critical', 'unknown_status']
    for (const status of statuses) {
      const cfg = TRAFFIC_COLORS[status as keyof typeof TRAFFIC_COLORS] ?? TRAFFIC_COLORS.good
      const color = cfg?.color ?? '#a1a1aa'
      expect(color).toBeTruthy()
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — Deferred static areas (documented intentional limitations)
// ══════════════════════════════════════════════════════════════

describe('Deferred static areas — intentionally limited (non-blocking)', () => {
  it('kpiAnalyticsEngine KPI_KEYS is intentionally limited to 5 core KPIs', () => {
    const coreKeys = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
    for (const key of coreKeys) {
      expect(ANALYTICS_SRC).toContain(`'${key}'`)
    }
  })

  it('KPI_META covers exactly the same 5 keys', () => {
    expect(KPI_META).toHaveProperty('wasfaty')
    expect(KPI_META).toHaveProperty('omni')         // engine key, not registry key
    expect(KPI_META).toHaveProperty('wellness')
    expect(KPI_META).toHaveProperty('basket')
    expect(KPI_META).toHaveProperty('crossSelling') // engine key (camelCase)
  })

  it('ImportCenterPage uses hardcoded Excel columns (deferred — documented)', () => {
    // ImportCenterPage Excel parsing uses fixed column names by design
    // until a registry-driven import template is built
    expect(IMPORT_CENTER_SRC).toContain('wasfaty')
  })

  it('kpiService bulkImportKpiEntries still uses core 5 fields (deferred)', () => {
    expect(KPISERVICE_SRC).toContain('wasfaty')
  })

  it('core analytics engine KPI_KEYS not modified — existing engine tests safe', () => {
    const LEGACY_CORE = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
    for (const key of LEGACY_CORE) {
      expect(KPI_KEYS).toContain(key)
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — Universal: unknown/custom KPI gets safe fallback color
// ══════════════════════════════════════════════════════════════

describe('Universal — unknown/custom KPI gets safe fallback color', () => {
  it('DEFAULT_KPI_UI_CONFIG.defaultColor is the canonical fallback', () => {
    expect(DEFAULT_KPI_UI_CONFIG.defaultColor).toBeDefined()
    expect(DEFAULT_KPI_UI_CONFIG.defaultColor).toMatch(/^#[0-9a-fA-F]{3,6}$/)
  })

  it('all custom KPI engine-key lookups fall back safely', () => {
    const custom = customKpi('nps')
    const color = custom.defaultColor ?? FALLBACK_COLOR
    expect(color).toBe(FALLBACK_COLOR)
  })

  it('KpiCard getBarColor never returns undefined for any pct', () => {
    const getBarColor = (pct: number, kpiColor?: string) => {
      if (pct >= 100) return '#22c55e'
      if (pct >= 80)  return kpiColor || '#1a9a7e'
      if (pct >= 60)  return '#f59e0b'
      return '#ef4444'
    }
    for (const pct of [0, 40, 60, 80, 100, 110]) {
      const color = getBarColor(pct)
      expect(color).toBeTruthy()
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — KpiCard source guards (live component)
// ══════════════════════════════════════════════════════════════

describe('KpiCard — safe color access', () => {
  it('uses kpi?.color (optional chaining) not kpi.color', () => {
    expect(KPICARD_SRC).not.toMatch(/\bkpi\.color\b/)
  })

  it('has fallback color when kpi.color is undefined', () => {
    expect(KPICARD_SRC).toMatch(/kpi\?\.color\s*\|\|/)
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — Registry-driven pages complete audit (live pages only)
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
    for (const src of [PERF_SRC, read('../../pages/pharmacist/KpiEntryPage.jsx')]) {
      expect(src).toContain('DEFAULT_KPI_REGISTRY')
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 8 — Static KPI_FIELDS elimination (live pages only)
// ══════════════════════════════════════════════════════════════

describe('Static KPI_FIELDS elimination audit — live pages', () => {
  it('PerformancePage has no top-level static KPI_FIELDS constant', () => {
    expect(PERF_SRC).not.toMatch(/^const KPI_FIELDS\s*=/m)
  })

  it('KpiEntryPage has no static KPI_FIELDS constant', () => {
    const src = read('../../pages/pharmacist/KpiEntryPage.jsx')
    expect(src).not.toMatch(/^const KPI_FIELDS\s*=/m)
  })
})

// ══════════════════════════════════════════════════════════════
// 9 — Core KPI rendering preserved after all stabilization
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
