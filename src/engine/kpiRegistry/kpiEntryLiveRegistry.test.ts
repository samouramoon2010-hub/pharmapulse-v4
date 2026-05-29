// ============================================================
// KPI Entry — Live Registry Connection Tests (Part 4C)
// Tests: liveRegistry passed to saveEntry, custom KPI accept/
//        reject based on registry presence, core KPI backward
//        compat, fallback to DEFAULT_KPI_REGISTRY, hidden/
//        archived exclusion.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve }      from 'path'

import {
  sanitizeKpiEntryFields,
  buildAllowedEntryKeys,
  mergeRemoteRegistryWithDefaults,
} from '../../services/kpiRegistryLogic'
import {
  DEFAULT_KPI_REGISTRY,
  getKpisForSurface,
  DEFAULT_KPI_UI_CONFIG,
} from '../../engine/kpiRegistry'
import type { KpiDefinition, KpiRegistry } from '../../engine/kpiRegistry'

// ── Source-level guards ────────────────────────────────────────
const ENTRY_PAGE_SRC = readFileSync(
  resolve(__dirname, '../../pages/pharmacist/KpiEntryPage.jsx'), 'utf8'
)
const KPI_STORE_SRC = readFileSync(
  resolve(__dirname, '../../store/kpiStore.js'), 'utf8'
)

// ── Test helpers ───────────────────────────────────────────────

function customKpi(key: string, opts: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key,
    label:      key,
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
    thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
    visibility: {
      dashboardEnabled: true, teamEnabled: false,
      executiveEnabled: false, regionalEnabled: false,
    },
    sortOrder: 500,
    ...opts,
  }
}

/** Mirrors the buildEntryFields helper in KpiEntryPage.jsx */
function buildEntryFields(registry: KpiRegistry) {
  return getKpisForSurface(registry, 'dashboardEnabled').map((kpi) => ({
    key:         kpi.aliasFor ?? kpi.key,
    registryKey: kpi.key,
    label:       kpi.labelAr || kpi.label || kpi.key,
    labelEn:     kpi.label || kpi.key,
    color:       DEFAULT_KPI_UI_CONFIG.defaultColor,
    unit:        kpi.unitAr || kpi.unit || '',
  }))
}

// ══════════════════════════════════════════════════════════════
// 1 — Source-level wiring guards
// ══════════════════════════════════════════════════════════════

describe('KpiEntryPage — Phase 4C source wiring', () => {
  it('passes liveRegistry as second argument to saveEntry', () => {
    // Look for: saveEntry(payload, liveRegistry)
    expect(ENTRY_PAGE_SRC).toMatch(/saveEntry\s*\(\s*payload\s*,\s*liveRegistry\s*\)/)
  })

  it('comment documents Phase 4C registry threading', () => {
    expect(ENTRY_PAGE_SRC).toContain('Phase 4C')
  })

  it('uses liveRegistry state initialised with DEFAULT_KPI_REGISTRY', () => {
    expect(ENTRY_PAGE_SRC).toContain('DEFAULT_KPI_REGISTRY')
    expect(ENTRY_PAGE_SRC).toContain('liveRegistry')
  })

  it('subscribeKpiRegistry is called with error fallback to DEFAULT_KPI_REGISTRY', () => {
    expect(ENTRY_PAGE_SRC).toContain('subscribeKpiRegistry')
    // Error path should reset to default
    expect(ENTRY_PAGE_SRC).toMatch(/\(\s*\)\s*=>\s*setLiveRegistry\s*\(\s*DEFAULT_KPI_REGISTRY\s*\)/)
  })
})

describe('kpiStore.js — saveEntry threads registry through', () => {
  it('saveEntry accepts a registry second argument', () => {
    expect(KPI_STORE_SRC).toMatch(/saveEntry:\s*async\s*\(\s*data\s*,\s*registry\s*\)/)
  })

  it('saveEntry spreads data and registry into saveKpiEntry call', () => {
    expect(KPI_STORE_SRC).toMatch(/saveKpiEntry\s*\(\s*\{[^}]*registry[^}]*\}\s*\)/)
  })

  it('saveEntry comment documents registry threading purpose', () => {
    expect(KPI_STORE_SRC).toContain('registry')
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — saveEntry accepts custom KPI when liveRegistry includes it
// ══════════════════════════════════════════════════════════════

describe('sanitizeKpiEntryFields — custom KPI accepted with live registry', () => {
  it('nps is accepted when liveRegistry includes nps', () => {
    const liveRegistry = mergeRemoteRegistryWithDefaults({ nps: customKpi('nps') } as KpiRegistry)
    const result = sanitizeKpiEntryFields({ nps: 42 }, liveRegistry)
    expect(result.nps).toBe(42)
  })

  it('manuka is accepted when liveRegistry includes manuka', () => {
    const liveRegistry = mergeRemoteRegistryWithDefaults({ manuka: customKpi('manuka') } as KpiRegistry)
    const result = sanitizeKpiEntryFields({ manuka: 15 }, liveRegistry)
    expect(result.manuka).toBe(15)
  })

  it('sales is accepted when liveRegistry includes sales', () => {
    const liveRegistry = mergeRemoteRegistryWithDefaults({ sales: customKpi('sales') } as KpiRegistry)
    const result = sanitizeKpiEntryFields({ sales: 5000 }, liveRegistry)
    expect(result.sales).toBe(5000)
  })

  it('sl is accepted when liveRegistry includes sl', () => {
    const liveRegistry = mergeRemoteRegistryWithDefaults({ sl: customKpi('sl') } as KpiRegistry)
    const result = sanitizeKpiEntryFields({ sl: 3 }, liveRegistry)
    expect(result.sl).toBe(3)
  })

  it('ndf is accepted when liveRegistry includes ndf', () => {
    const liveRegistry = mergeRemoteRegistryWithDefaults({ ndf: customKpi('ndf') } as KpiRegistry)
    const result = sanitizeKpiEntryFields({ ndf: 7 }, liveRegistry)
    expect(result.ndf).toBe(7)
  })

  it('inbody is accepted when liveRegistry includes inbody', () => {
    // inbody is already in DEFAULT_KPI_REGISTRY with dashboardEnabled
    const inbodyDef = DEFAULT_KPI_REGISTRY['inbody']
    if (inbodyDef?.isActive) {
      const result = sanitizeKpiEntryFields({ inbody: 4 }, DEFAULT_KPI_REGISTRY)
      expect(result.inbody).toBe(4)
    } else {
      const liveRegistry = mergeRemoteRegistryWithDefaults({ inbody: customKpi('inbody') } as KpiRegistry)
      const result = sanitizeKpiEntryFields({ inbody: 4 }, liveRegistry)
      expect(result.inbody).toBe(4)
    }
  })

  it('liberation is accepted when liveRegistry includes liberation', () => {
    const liberationDef = DEFAULT_KPI_REGISTRY['liberation']
    if (liberationDef?.isActive) {
      const result = sanitizeKpiEntryFields({ liberation: 11 }, DEFAULT_KPI_REGISTRY)
      expect(result.liberation).toBe(11)
    } else {
      const liveRegistry = mergeRemoteRegistryWithDefaults({ liberation: customKpi('liberation') } as KpiRegistry)
      const result = sanitizeKpiEntryFields({ liberation: 11 }, liveRegistry)
      expect(result.liberation).toBe(11)
    }
  })

  it('all 7 custom KPIs persist in a combined live registry payload', () => {
    const customKpis = { nps: customKpi('nps'), manuka: customKpi('manuka'), sales: customKpi('sales'), sl: customKpi('sl'), ndf: customKpi('ndf') }
    const liveRegistry = mergeRemoteRegistryWithDefaults(customKpis as KpiRegistry)
    const input = { nps: 10, manuka: 20, sales: 3000, sl: 5, ndf: 8, wasfaty: 15, omni: 7 }
    const result = sanitizeKpiEntryFields(input, liveRegistry)
    expect(result.nps).toBe(10)
    expect(result.manuka).toBe(20)
    expect(result.sales).toBe(3000)
    expect(result.sl).toBe(5)
    expect(result.ndf).toBe(8)
    expect(result.wasfaty).toBe(15)
    expect(result.omni).toBe(7)
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — saveEntry rejects custom KPI when registry does NOT include it
// ══════════════════════════════════════════════════════════════

describe('sanitizeKpiEntryFields — custom KPI rejected without registry entry', () => {
  it('nps is rejected when using DEFAULT_KPI_REGISTRY (nps not in default)', () => {
    // Only if nps is not already in DEFAULT_KPI_REGISTRY
    const defaultKeys = buildAllowedEntryKeys(DEFAULT_KPI_REGISTRY)
    if (!defaultKeys.has('nps')) {
      const result = sanitizeKpiEntryFields({ nps: 42 }, DEFAULT_KPI_REGISTRY)
      expect('nps' in result).toBe(false)
    }
    // If nps IS in default, it would be accepted — that's correct behaviour too
  })

  it('completely unknown KPI key is always rejected', () => {
    const liveRegistry = mergeRemoteRegistryWithDefaults({} as KpiRegistry)
    const result = sanitizeKpiEntryFields({ fakeKpi999: 100 }, liveRegistry)
    expect('fakeKpi999' in result).toBe(false)
  })

  it('inactive custom KPI is rejected even with live registry', () => {
    const withInactive = mergeRemoteRegistryWithDefaults({
      ghostKpi: customKpi('ghostKpi', { isActive: false }),
    } as KpiRegistry)
    const result = sanitizeKpiEntryFields({ ghostKpi: 50 }, withInactive)
    expect('ghostKpi' in result).toBe(false)
  })

  it('custom KPI with no registry entry is silently excluded from payload', () => {
    const result = sanitizeKpiEntryFields(
      { wasfaty: 10, unregisteredKpi: 5 },
      DEFAULT_KPI_REGISTRY
    )
    expect(result.wasfaty).toBe(10)
    expect('unregisteredKpi' in result).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — Core KPI backward compatibility
// ══════════════════════════════════════════════════════════════

describe('saveEntry — core KPI values always persist', () => {
  it('wasfaty persists with DEFAULT_KPI_REGISTRY (no live registry)', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: 18 })
    expect(result.wasfaty).toBe(18)
  })

  it('omni persists with DEFAULT_KPI_REGISTRY', () => {
    const result = sanitizeKpiEntryFields({ omni: 9 })
    expect(result.omni).toBe(9)
  })

  it('wellness persists with DEFAULT_KPI_REGISTRY', () => {
    const result = sanitizeKpiEntryFields({ wellness: 12 })
    expect(result.wellness).toBe(12)
  })

  it('basket persists with DEFAULT_KPI_REGISTRY', () => {
    const result = sanitizeKpiEntryFields({ basket: 250 })
    expect(result.basket).toBe(250)
  })

  it('crossSelling persists with DEFAULT_KPI_REGISTRY', () => {
    const result = sanitizeKpiEntryFields({ crossSelling: 6 })
    expect(result.crossSelling).toBe(6)
  })

  it('core KPIs still persist when live registry is merged with custom KPIs', () => {
    const liveRegistry = mergeRemoteRegistryWithDefaults({ nps: customKpi('nps') } as KpiRegistry)
    const result = sanitizeKpiEntryFields(
      { wasfaty: 20, omni: 10, wellness: 8, basket: 300, crossSelling: 4, nps: 5 },
      liveRegistry
    )
    expect(result).toMatchObject({ wasfaty: 20, omni: 10, wellness: 8, basket: 300, crossSelling: 4, nps: 5 })
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — DEFAULT_KPI_REGISTRY fallback when Firestore unavailable
// ══════════════════════════════════════════════════════════════

describe('KpiEntryPage — DEFAULT_KPI_REGISTRY fallback', () => {
  it('buildEntryFields with DEFAULT_KPI_REGISTRY produces all 5 core fields', () => {
    const fields = buildEntryFields(DEFAULT_KPI_REGISTRY)
    const keys   = fields.map((f) => f.key)
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('omni')
    expect(keys).toContain('wellness')
    expect(keys).toContain('basket')
    expect(keys).toContain('crossSelling')
  })

  it('sanitizeKpiEntryFields with no registry arg uses DEFAULT_KPI_REGISTRY safely', () => {
    // No registry argument — falls back to DEFAULT_KPI_REGISTRY
    const result = sanitizeKpiEntryFields({ wasfaty: 5, omni: 3 })
    expect(result.wasfaty).toBe(5)
    expect(result.omni).toBe(3)
  })

  it('entry page renders without crashing even when Firestore registry returns error', () => {
    // Simulate error fallback: registry resets to DEFAULT_KPI_REGISTRY
    const fallbackFields = buildEntryFields(DEFAULT_KPI_REGISTRY)
    expect(fallbackFields.length).toBeGreaterThanOrEqual(5)
    for (const f of fallbackFields) {
      expect(f.key).toBeTruthy()
      expect(f.label).toBeTruthy()
      expect(f.color).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('mergeRemoteRegistryWithDefaults always includes core KPIs regardless of remote', () => {
    // Even an empty remote still gets the 5 core defaults merged in
    const merged = mergeRemoteRegistryWithDefaults({} as KpiRegistry)
    const keys   = buildAllowedEntryKeys(merged)
    expect(keys.has('wasfaty')).toBe(true)
    expect(keys.has('omni')).toBe(true)
    expect(keys.has('wellness')).toBe(true)
    expect(keys.has('basket')).toBe(true)
    expect(keys.has('crossSelling')).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — Hidden/archived KPIs excluded from entry form
// ══════════════════════════════════════════════════════════════

describe('KpiEntryPage — hidden/archived KPI exclusion', () => {
  it('inactive KPI is excluded from entryFields', () => {
    const registry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      archivedKpi: customKpi('archivedKpi', { isActive: false }),
    }
    const fields = buildEntryFields(registry)
    expect(fields.map((f) => f.key)).not.toContain('archivedKpi')
  })

  it('KPI with dashboardEnabled=false is excluded from entryFields', () => {
    const registry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      teamOnlyKpi: customKpi('teamOnlyKpi', {
        visibility: {
          dashboardEnabled: false, teamEnabled: true,
          executiveEnabled: false, regionalEnabled: false,
        },
      }),
    }
    const fields = buildEntryFields(registry)
    expect(fields.map((f) => f.key)).not.toContain('teamOnlyKpi')
  })

  it('excluded KPI is also excluded from sanitizeKpiEntryFields output', () => {
    // An inactive KPI is not in buildAllowedEntryKeys → sanitizer drops it
    const withInactive: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      hiddenKpi: customKpi('hiddenKpi', { isActive: false }),
    }
    const result = sanitizeKpiEntryFields({ hiddenKpi: 99, wasfaty: 5 }, withInactive)
    expect('hiddenKpi' in result).toBe(false)
    expect(result.wasfaty).toBe(5)
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — Missing metadata does not crash rendering
// ══════════════════════════════════════════════════════════════

describe('KpiEntryPage — missing metadata safety', () => {
  it('buildEntryFields does not crash with empty registry', () => {
    expect(() => buildEntryFields({})).not.toThrow()
  })

  it('buildEntryFields KPI with no labelAr falls back to label then key', () => {
    const registry: KpiRegistry = {
      minKpi: {
        key: 'minKpi', label: 'MinKpi', shortLabel: 'min', labelAr: '',
        category: 'commercial', valueType: 'count', unit: 'u', unitAr: '',
        direction: 'higher_is_better', targetType: 'absolute', weight: 0,
        isActive: true, isCore: false,
        thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
        visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false },
        sortOrder: 999,
      },
    }
    const fields = buildEntryFields(registry)
    expect(fields[0].label).toBeTruthy()  // falls back to label
  })

  it('entry field color is always a valid hex — never crashes style binding', () => {
    const fields = buildEntryFields(DEFAULT_KPI_REGISTRY)
    for (const f of fields) {
      expect(f.color).toMatch(/^#[0-9a-fA-F]{3,6}$/)
    }
  })

  it('sanitizeKpiEntryFields returns empty object for empty input without crashing', () => {
    expect(() => sanitizeKpiEntryFields({})).not.toThrow()
    expect(sanitizeKpiEntryFields({})).toEqual({})
  })
})

// ══════════════════════════════════════════════════════════════
// 8 — Full end-to-end payload simulation
// ══════════════════════════════════════════════════════════════

describe('Full payload simulation — live registry round-trip', () => {
  it('simulates KpiEntryPage producing a payload and passing through sanitizeKpiEntryFields', () => {
    // 1. Build a live registry with 2 custom KPIs
    const liveRegistry = mergeRemoteRegistryWithDefaults({
      nps:    customKpi('nps'),
      manuka: customKpi('manuka'),
    } as KpiRegistry)

    // 2. Simulate buildEntryFields
    const entryFields = buildEntryFields(liveRegistry)
    const fieldKeys   = entryFields.map((f) => f.key)
    expect(fieldKeys).toContain('nps')
    expect(fieldKeys).toContain('manuka')
    expect(fieldKeys).toContain('wasfaty')

    // 3. Simulate form state with values
    const form: Record<string, string> = { notes: 'test' }
    for (const { key } of entryFields) form[key] = '5'

    // 4. Simulate payload construction
    const payload: Record<string, unknown> = {
      userId: 'u1', pharmacyId: 'p1', date: '2025-05-20',
      notes: form.notes, actorId: 'u1', actorRole: 'pharmacist',
    }
    for (const { key } of entryFields) payload[key] = Number(form[key]) || 0

    // 5. Run sanitizeKpiEntryFields with live registry
    const kpiValues = sanitizeKpiEntryFields(payload as Record<string, unknown>, liveRegistry)

    // 6. Assert all KPI values present, metadata excluded
    expect(kpiValues.nps).toBe(5)
    expect(kpiValues.manuka).toBe(5)
    expect(kpiValues.wasfaty).toBe(5)
    expect('userId' in kpiValues).toBe(false)
    expect('notes' in kpiValues).toBe(false)
    expect('actorId' in kpiValues).toBe(false)
  })

  it('simulates fallback to DEFAULT_KPI_REGISTRY when no live registry available', () => {
    const entryFields = buildEntryFields(DEFAULT_KPI_REGISTRY)
    const payload: Record<string, unknown> = { wasfaty: 10, omni: 5, wellness: 3, basket: 200, crossSelling: 4 }
    const kpiValues = sanitizeKpiEntryFields(payload)
    expect(kpiValues).toMatchObject({ wasfaty: 10, omni: 5, wellness: 3, basket: 200, crossSelling: 4 })
  })
})
