// ============================================================
// Settings Page — Dynamic KPI Visibility Tests (Bug 3)
// Root cause: Settings Dashboard Preferences only showed
//   static DASHBOARD_CARDS (widget toggles). Custom KPIs
//   (NPS, Sales, SL etc.) were invisible to users.
// Fix: Added live-registry-driven KPI list below widget toggles.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'
import {
  DEFAULT_KPI_REGISTRY,
  getKpisForSurface,
} from '../../engine/kpiRegistry'
import { mergeRemoteRegistryWithDefaults } from '../../services/kpiRegistryLogic'
import type { KpiDefinition, KpiRegistry } from '../../engine/kpiRegistry'

const SETTINGS_SRC = readFileSync(
  resolve(__dirname, '../../pages/shared/SettingsPage.jsx'), 'utf8'
)

// ── Helpers ────────────────────────────────────────────────

function buildRegistryKpiCards(registry: KpiRegistry) {
  return getKpisForSurface(registry, 'dashboardEnabled').map((kpi) => ({
    key:     kpi.aliasFor ?? kpi.key,
    label:   kpi.label || (kpi.aliasFor ?? kpi.key),
    labelAr: kpi.labelAr || kpi.label || (kpi.aliasFor ?? kpi.key),
    isCore:  kpi.isCore ?? false,
  }))
}

function customKpi(key: string): KpiDefinition {
  return {
    key, label: key, shortLabel: key, labelAr: key,
    category: 'commercial', valueType: 'count', unit: 'u', unitAr: 'و',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
    visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false },
    sortOrder: 500,
  }
}

// ══════════════════════════════════════════════════════════════
// 1 — Source patch verification
// ══════════════════════════════════════════════════════════════

describe('SettingsPage — Phase bug-3 patch applied', () => {
  it('imports subscribeKpiRegistry', () => {
    expect(SETTINGS_SRC).toContain('subscribeKpiRegistry')
  })

  it('imports getKpisForSurface', () => {
    expect(SETTINGS_SRC).toContain('getKpisForSurface')
  })

  it('imports DEFAULT_KPI_REGISTRY as fallback', () => {
    expect(SETTINGS_SRC).toContain('DEFAULT_KPI_REGISTRY')
  })

  it('has liveRegistry state starting from DEFAULT_KPI_REGISTRY', () => {
    expect(SETTINGS_SRC).toMatch(/liveRegistry.*DEFAULT_KPI_REGISTRY|DEFAULT_KPI_REGISTRY.*liveRegistry/s)
  })

  it('has registryKpiCards memo built from liveRegistry', () => {
    expect(SETTINGS_SRC).toContain('registryKpiCards')
  })

  it('renders registryKpiCards in dashboard section', () => {
    expect(SETTINGS_SRC).toMatch(/registryKpiCards\.map/)
  })

  it('shows core vs custom badge distinction', () => {
    expect(SETTINGS_SRC).toContain('isCore')
    expect(SETTINGS_SRC).toContain("'Core'")
    expect(SETTINGS_SRC).toContain("'Custom'")
  })

  it('static DASHBOARD_CARDS widget toggles still present', () => {
    expect(SETTINGS_SRC).toContain('DASHBOARD_CARDS')
    expect(SETTINGS_SRC).toContain('toggleDashCard')
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — buildRegistryKpiCards with DEFAULT_KPI_REGISTRY
// ══════════════════════════════════════════════════════════════

describe('Settings — buildRegistryKpiCards from DEFAULT_KPI_REGISTRY', () => {
  const cards = buildRegistryKpiCards(DEFAULT_KPI_REGISTRY)
  const keys  = cards.map((c) => c.key)

  it('contains all 5 core KPI engine keys', () => {
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('omni')
    expect(keys).toContain('wellness')
    expect(keys).toContain('basket')
    expect(keys).toContain('crossSelling')
  })

  it('core KPIs are flagged as isCore=true', () => {
    const wasfaty = cards.find((c) => c.key === 'wasfaty')
    expect(wasfaty?.isCore).toBe(true)
  })

  it('produces at least 5 cards', () => {
    expect(cards.length).toBeGreaterThanOrEqual(5)
  })

  it('all cards have non-empty label', () => {
    for (const c of cards) {
      expect(c.label.trim().length).toBeGreaterThan(0)
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — Custom KPIs appear in settings list
// ══════════════════════════════════════════════════════════════

describe('Settings — custom KPIs appear when in registry', () => {
  const ALL_CUSTOM = ['nps', 'manuka', 'sales', 'sl', 'ndf', 'inbody', 'liberation'] as const

  for (const key of ALL_CUSTOM) {
    it(`${key} appears in registryKpiCards when active and dashboardEnabled`, () => {
      const registry = mergeRemoteRegistryWithDefaults({ [key]: customKpi(key) } as KpiRegistry)
      const cards    = buildRegistryKpiCards(registry)
      expect(cards.map((c) => c.key)).toContain(key)
    })
  }

  it('custom KPI is flagged as isCore=false', () => {
    const registry = mergeRemoteRegistryWithDefaults({ nps: customKpi('nps') } as KpiRegistry)
    const cards    = buildRegistryKpiCards(registry)
    const nps      = cards.find((c) => c.key === 'nps')
    expect(nps?.isCore).toBe(false)
  })

  it('all 7 custom KPIs appear together when all added', () => {
    const extras: Partial<KpiRegistry> = {}
    for (const key of ALL_CUSTOM) extras[key] = customKpi(key)
    const registry = mergeRemoteRegistryWithDefaults(extras as KpiRegistry)
    const keys     = buildRegistryKpiCards(registry).map((c) => c.key)
    for (const key of ALL_CUSTOM) expect(keys).toContain(key)
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — Hidden / archived KPIs excluded
// ══════════════════════════════════════════════════════════════

describe('Settings — hidden/archived KPIs excluded from list', () => {
  it('inactive KPI excluded from registryKpiCards', () => {
    const registry = {
      ...DEFAULT_KPI_REGISTRY,
      hiddenKpi: { ...customKpi('hiddenKpi'), isActive: false },
    } as KpiRegistry
    expect(buildRegistryKpiCards(registry).map((c) => c.key)).not.toContain('hiddenKpi')
  })

  it('dashboardEnabled=false KPI excluded', () => {
    const registry = {
      ...DEFAULT_KPI_REGISTRY,
      teamOnly: { ...customKpi('teamOnly'), visibility: { dashboardEnabled: false, teamEnabled: true, executiveEnabled: false, regionalEnabled: false } },
    } as KpiRegistry
    expect(buildRegistryKpiCards(registry).map((c) => c.key)).not.toContain('teamOnly')
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — Missing color / label safe fallbacks
// ══════════════════════════════════════════════════════════════

describe('Settings — safe fallbacks for missing metadata', () => {
  it('KPI with empty labelAr falls back to label then key', () => {
    const kpi: KpiDefinition = {
      ...customKpi('testKpi'),
      labelAr: '',
      label:   'Test KPI',
    }
    const registry = mergeRemoteRegistryWithDefaults({ testKpi: kpi } as KpiRegistry)
    const card     = buildRegistryKpiCards(registry).find((c) => c.key === 'testKpi')
    expect(card?.labelAr).toBeTruthy()
  })

  it('does not crash with empty registry', () => {
    expect(() => buildRegistryKpiCards({})).not.toThrow()
    expect(buildRegistryKpiCards({})).toEqual([])
  })

  it('color in dot indicator falls back to #a1a1aa for custom KPIs', () => {
    // registryKpiCards don't carry color — the dot color in JSX is hardcoded brand/fallback
    // Verify the source uses '#a1a1aa' as the custom KPI dot color
    expect(SETTINGS_SRC).toContain('#a1a1aa')
  })
})
