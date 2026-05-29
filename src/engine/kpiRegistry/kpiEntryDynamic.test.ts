// ============================================================
// KPI Entry Page — Dynamic Registry Rendering Tests (Part 4A)
// Tests: registry-driven field list, dynamic EMPTY_FORM,
//        core KPI preservation, custom KPI support,
//        safe fallbacks, hidden/archived exclusion.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'

import {
  DEFAULT_KPI_REGISTRY,
  getKpisForSurface,
  DEFAULT_KPI_UI_CONFIG,
} from '../../engine/kpiRegistry'
import { mergeRemoteRegistryWithDefaults } from '../../services/kpiRegistryLogic'
import type { KpiDefinition, KpiRegistry }  from '../../engine/kpiRegistry'

// ── Source-level guards ────────────────────────────────────────
const ENTRY_PAGE_SRC = readFileSync(
  resolve(__dirname, '../../pages/pharmacist/KpiEntryPage.jsx'), 'utf8'
)
const KPI_SERVICE_SRC = readFileSync(
  resolve(__dirname, '../../../src/services/kpiService.js'), 'utf8'
)

// ── Helpers ────────────────────────────────────────────────────

/** Mirror of the buildEntryFields helper in KpiEntryPage.jsx */
function buildEntryFields(registry: KpiRegistry) {
  return getKpisForSurface(registry, 'dashboardEnabled').map((kpi) => {
    const engineKey = kpi.aliasFor ?? kpi.key
    return {
      key:         engineKey,
      registryKey: kpi.key,
      label:       kpi.labelAr || kpi.label || kpi.key,
      labelEn:     kpi.label || kpi.key,
      color:       DEFAULT_KPI_UI_CONFIG.defaultColor,
      unit:        kpi.unitAr || kpi.unit || '',
    }
  })
}

/** Mirror of the buildEmptyForm helper in KpiEntryPage.jsx */
function buildEmptyForm(entryFields: ReturnType<typeof buildEntryFields>): Record<string, string> {
  const form: Record<string, string> = { notes: '' }
  for (const { key } of entryFields) {
    form[key] = ''
  }
  return form
}

/** Build a minimal custom KpiDefinition for testing */
function customKpi(key: string, opts: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key,
    label:      key.charAt(0).toUpperCase() + key.slice(1),
    shortLabel: key,
    labelAr:    key,
    category:   'commercial',
    valueType:  'count',
    unit:       'units',
    unitAr:     'وحدة',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0,
    isActive:   true,
    isCore:     false,
    aliasFor:   undefined,
    thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
    visibility: {
      dashboardEnabled: true,
      teamEnabled:      false,
      executiveEnabled: false,
      regionalEnabled:  false,
    },
    sortOrder:  500,
    ...opts,
  }
}

// ══════════════════════════════════════════════════════════════
// 1 — Source-level architecture guards
// ══════════════════════════════════════════════════════════════

describe('KpiEntryPage — Source-level architecture', () => {
  it('no longer contains a static KPI_FIELDS constant', () => {
    // The old static array was: const KPI_FIELDS = [...]
    expect(ENTRY_PAGE_SRC).not.toMatch(/^const KPI_FIELDS\s*=/m)
  })

  it('no longer contains a static EMPTY_FORM constant', () => {
    expect(ENTRY_PAGE_SRC).not.toMatch(/^const EMPTY_FORM\s*=/m)
  })

  it('imports subscribeKpiRegistry for live Firestore registry', () => {
    expect(ENTRY_PAGE_SRC).toContain('subscribeKpiRegistry')
  })

  it('imports getKpisForSurface for registry-driven field list', () => {
    expect(ENTRY_PAGE_SRC).toContain('getKpisForSurface')
  })

  it('imports DEFAULT_KPI_REGISTRY as safe fallback', () => {
    expect(ENTRY_PAGE_SRC).toContain('DEFAULT_KPI_REGISTRY')
  })

  it('imports DEFAULT_KPI_UI_CONFIG for safe color fallback', () => {
    expect(ENTRY_PAGE_SRC).toContain('DEFAULT_KPI_UI_CONFIG')
  })

  it('uses dashboardEnabled surface for entry field list', () => {
    expect(ENTRY_PAGE_SRC).toContain("'dashboardEnabled'")
  })

  it('uses liveRegistry state that starts with DEFAULT_KPI_REGISTRY', () => {
    expect(ENTRY_PAGE_SRC).toMatch(/liveRegistry.*DEFAULT_KPI_REGISTRY|DEFAULT_KPI_REGISTRY.*liveRegistry/s)
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — kpiService.js dynamic field support
// ══════════════════════════════════════════════════════════════

describe('kpiService.js — Dynamic custom KPI fields (Phase 4B)', () => {
  it('saveKpiEntry uses ...kpiFields spread to collect candidate KPI values', () => {
    expect(KPI_SERVICE_SRC).toContain('...kpiFields')
  })

  it('saveKpiEntry calls sanitizeKpiEntryFields for dynamic field resolution', () => {
    expect(KPI_SERVICE_SRC).toContain('sanitizeKpiEntryFields')
  })

  it('safeKpiValues are spread into the Firestore payload', () => {
    expect(KPI_SERVICE_SRC).toMatch(/\.\.\.safeKpiValues/)
  })

  it('metadata exclusion is delegated to sanitizeKpiEntryFields via ENTRY_METADATA_FIELDS', () => {
    expect(KPI_SERVICE_SRC).toContain('ENTRY_METADATA_FIELDS')
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — Default registry: core KPIs always present
// ══════════════════════════════════════════════════════════════

describe('KpiEntryPage — Core KPIs preserved in DEFAULT_KPI_REGISTRY', () => {
  const fields = buildEntryFields(DEFAULT_KPI_REGISTRY)
  const keys   = fields.map((f) => f.key)

  it('wasfaty is in the default entry field list', () => {
    expect(keys).toContain('wasfaty')
  })

  it('omni is in the default entry field list (via omnihealth alias)', () => {
    expect(keys).toContain('omni')
  })

  it('wellness is in the default entry field list (via wellnessCard alias)', () => {
    expect(keys).toContain('wellness')
  })

  it('basket is in the default entry field list', () => {
    expect(keys).toContain('basket')
  })

  it('crossSelling is in the default entry field list', () => {
    expect(keys).toContain('crossSelling')
  })

  it('produces at least 5 fields from default registry', () => {
    expect(fields.length).toBeGreaterThanOrEqual(5)
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — Dynamic EMPTY_FORM includes all active KPIs
// ══════════════════════════════════════════════════════════════

describe('KpiEntryPage — Dynamic EMPTY_FORM', () => {
  it('EMPTY_FORM always contains notes key', () => {
    const fields = buildEntryFields(DEFAULT_KPI_REGISTRY)
    const form   = buildEmptyForm(fields)
    expect('notes' in form).toBe(true)
    expect(form.notes).toBe('')
  })

  it('EMPTY_FORM contains all core KPI engine keys', () => {
    const fields = buildEntryFields(DEFAULT_KPI_REGISTRY)
    const form   = buildEmptyForm(fields)
    expect(form).toHaveProperty('wasfaty', '')
    expect(form).toHaveProperty('omni', '')
    expect(form).toHaveProperty('wellness', '')
    expect(form).toHaveProperty('basket', '')
    expect(form).toHaveProperty('crossSelling', '')
  })

  it('EMPTY_FORM values are all empty strings (not 0 or undefined)', () => {
    const fields = buildEntryFields(DEFAULT_KPI_REGISTRY)
    const form   = buildEmptyForm(fields)
    for (const key of Object.keys(form)) {
      if (key === 'notes') continue
      expect(form[key]).toBe('')
    }
  })

  it('EMPTY_FORM dynamically includes nps when added to registry', () => {
    const extended: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      nps: customKpi('nps'),
    }
    const fields = buildEntryFields(extended)
    const form   = buildEmptyForm(fields)
    expect(form).toHaveProperty('nps', '')
  })

  it('EMPTY_FORM dynamically includes manuka when added to registry', () => {
    const extended: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, manuka: customKpi('manuka') }
    const form = buildEmptyForm(buildEntryFields(extended))
    expect(form).toHaveProperty('manuka', '')
  })

  it('EMPTY_FORM dynamically includes sales when added to registry', () => {
    const extended: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, sales: customKpi('sales') }
    const form = buildEmptyForm(buildEntryFields(extended))
    expect(form).toHaveProperty('sales', '')
  })

  it('EMPTY_FORM dynamically includes sl when added to registry', () => {
    const extended: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, sl: customKpi('sl') }
    const form = buildEmptyForm(buildEntryFields(extended))
    expect(form).toHaveProperty('sl', '')
  })

  it('EMPTY_FORM dynamically includes ndf when added to registry', () => {
    const extended: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, ndf: customKpi('ndf') }
    const form = buildEmptyForm(buildEntryFields(extended))
    expect(form).toHaveProperty('ndf', '')
  })

  it('EMPTY_FORM dynamically includes inbody when added to registry', () => {
    // inbody is already in DEFAULT_KPI_REGISTRY with dashboardEnabled=true
    const fields = buildEntryFields(DEFAULT_KPI_REGISTRY)
    const keys   = fields.map((f) => f.key)
    // inbody visibility is DASHBOARD_ONLY so it appears in dashboardEnabled
    const inbodyDef = DEFAULT_KPI_REGISTRY['inbody']
    if (inbodyDef?.visibility.dashboardEnabled) {
      expect(keys).toContain('inbody')
    }
    // Custom inbody with explicit dashboardEnabled
    const extended: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, inbody: customKpi('inbody') }
    const form = buildEmptyForm(buildEntryFields(extended))
    expect(form).toHaveProperty('inbody', '')
  })

  it('EMPTY_FORM dynamically includes liberation when added to registry', () => {
    // liberation is already in DEFAULT_KPI_REGISTRY
    const liberationDef = DEFAULT_KPI_REGISTRY['liberation']
    if (liberationDef?.visibility.dashboardEnabled) {
      const form = buildEmptyForm(buildEntryFields(DEFAULT_KPI_REGISTRY))
      expect(form).toHaveProperty('liberation', '')
    } else {
      const extended: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, liberation: customKpi('liberation') }
      const form = buildEmptyForm(buildEntryFields(extended))
      expect(form).toHaveProperty('liberation', '')
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — Custom KPI rendering (registry-driven)
// ══════════════════════════════════════════════════════════════

describe('KpiEntryPage — Custom KPI rendering via registry', () => {
  const ALL_CUSTOM = ['nps', 'manuka', 'sales', 'sl', 'ndf', 'inbody', 'liberation']

  it('all custom KPI names appear in entry fields when added to registry', () => {
    const extras: KpiRegistry = {}
    for (const key of ALL_CUSTOM) {
      extras[key] = customKpi(key)
    }
    const extended = mergeRemoteRegistryWithDefaults(extras)
    const fields   = buildEntryFields(extended)
    const keys     = fields.map((f) => f.key)
    for (const key of ALL_CUSTOM) {
      expect(keys).toContain(key)
    }
  })

  it('custom KPI with aliasFor uses engine key in form, not registry key', () => {
    const aliased: KpiDefinition = {
      ...customKpi('myCustomKpi'),
      aliasFor: 'myEngineKey',
    }
    const fields = buildEntryFields({ ...DEFAULT_KPI_REGISTRY, myCustomKpi: aliased })
    const f      = fields.find((x) => x.registryKey === 'myCustomKpi')
    expect(f).toBeDefined()
    expect(f!.key).toBe('myEngineKey')   // form uses engine key
  })

  it('each custom KPI field gets a safe defaultColor', () => {
    const extended: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, nps: customKpi('nps') }
    const fields = buildEntryFields(extended)
    const nps    = fields.find((f) => f.key === 'nps')
    expect(nps).toBeDefined()
    expect(nps!.color).toBeDefined()
    expect(nps!.color).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('custom KPI color always falls back to DEFAULT_KPI_UI_CONFIG.defaultColor', () => {
    const fields = buildEntryFields({
      ...DEFAULT_KPI_REGISTRY,
      unknownKpi: customKpi('unknownKpi'),
    })
    const f = fields.find((x) => x.key === 'unknownKpi')
    expect(f!.color).toBe(DEFAULT_KPI_UI_CONFIG.defaultColor)
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — Registry updates cause reactive field list changes
// ══════════════════════════════════════════════════════════════

describe('KpiEntryPage — Registry reactivity', () => {
  it('adding a new KPI to registry increases field count', () => {
    const before = buildEntryFields(DEFAULT_KPI_REGISTRY).length
    const after  = buildEntryFields({
      ...DEFAULT_KPI_REGISTRY,
      newKpi: customKpi('newKpi'),
    }).length
    expect(after).toBe(before + 1)
  })

  it('removing a KPI (inactive) from registry decreases field count', () => {
    const before = buildEntryFields(DEFAULT_KPI_REGISTRY).length
    // Make inbody inactive to exclude it
    const reduced: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      inbody: { ...DEFAULT_KPI_REGISTRY['inbody'], isActive: false },
    }
    const after = buildEntryFields(reduced).length
    expect(after).toBeLessThanOrEqual(before)
  })

  it('mergeRemoteRegistryWithDefaults preserves core KPIs regardless of remote', () => {
    // Remote has only custom KPIs — defaults should still be merged in
    const remoteOnly: Partial<KpiRegistry> = {
      nps: customKpi('nps'),
    }
    const merged = mergeRemoteRegistryWithDefaults(remoteOnly as KpiRegistry)
    const fields = buildEntryFields(merged)
    const keys   = fields.map((f) => f.key)
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('omni')
    expect(keys).toContain('wellness')
    expect(keys).toContain('basket')
    expect(keys).toContain('crossSelling')
    expect(keys).toContain('nps')
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — Hidden/Archived KPI exclusion
// ══════════════════════════════════════════════════════════════

describe('KpiEntryPage — Hidden/archived KPI exclusion', () => {
  it('inactive KPI (isActive=false) is excluded from entry fields', () => {
    const withInactive: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      hiddenKpi: customKpi('hiddenKpi', { isActive: false }),
    }
    const keys = buildEntryFields(withInactive).map((f) => f.key)
    expect(keys).not.toContain('hiddenKpi')
  })

  it('KPI with dashboardEnabled=false is excluded from entry fields', () => {
    const notDashboard: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      teamOnly: customKpi('teamOnly', {
        visibility: {
          dashboardEnabled: false,
          teamEnabled:      true,
          executiveEnabled: false,
          regionalEnabled:  false,
        },
      }),
    }
    const keys = buildEntryFields(notDashboard).map((f) => f.key)
    expect(keys).not.toContain('teamOnly')
  })

  it('KPI marked isActive=false AND dashboardEnabled=false is excluded', () => {
    const doubleInactive: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      ghost: customKpi('ghost', {
        isActive: false,
        visibility: {
          dashboardEnabled: false,
          teamEnabled:      false,
          executiveEnabled: false,
          regionalEnabled:  false,
        },
      }),
    }
    const keys = buildEntryFields(doubleInactive).map((f) => f.key)
    expect(keys).not.toContain('ghost')
  })
})

// ══════════════════════════════════════════════════════════════
// 8 — No crash on missing/minimal metadata
// ══════════════════════════════════════════════════════════════

describe('KpiEntryPage — Safe rendering with missing metadata', () => {
  it('buildEntryFields does not crash with empty registry', () => {
    expect(() => buildEntryFields({})).not.toThrow()
    expect(buildEntryFields({})).toEqual([])
  })

  it('buildEmptyForm does not crash with empty field list', () => {
    expect(() => buildEmptyForm([])).not.toThrow()
    expect(buildEmptyForm([])).toEqual({ notes: '' })
  })

  it('KPI with minimal definition does not crash field building', () => {
    const minimal: KpiRegistry = {
      minimal: {
        key: 'minimal', label: 'M', shortLabel: 'm', labelAr: 'م',
        category: 'commercial', valueType: 'count', unit: '', unitAr: '',
        direction: 'higher_is_better', targetType: 'absolute',
        weight: 0, isActive: true, isCore: false,
        thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
        visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false },
        sortOrder: 999,
      },
    }
    expect(() => buildEntryFields(minimal)).not.toThrow()
    const fields = buildEntryFields(minimal)
    expect(fields).toHaveLength(1)
    expect(fields[0].key).toBe('minimal')
  })

  it('field color is always a valid hex string regardless of KPI definition', () => {
    const fields = buildEntryFields(DEFAULT_KPI_REGISTRY)
    for (const f of fields) {
      expect(f.color).toMatch(/^#[0-9a-fA-F]{3,6}$/)
    }
  })

  it('field label is always a non-empty string', () => {
    const fields = buildEntryFields(DEFAULT_KPI_REGISTRY)
    for (const f of fields) {
      expect(typeof f.label).toBe('string')
      expect(f.label.length).toBeGreaterThan(0)
    }
  })
})
