// ============================================================
// Stale Config Regression Tests
// Ensures TargetsPage never re-introduces module-level statics.
// These tests run against the engine/registry layer to confirm
// the live-registry contract holds end-to-end.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'

import {
  DEFAULT_KPI_REGISTRY,
} from '../../engine/kpiRegistry'
import {
  getTargetInputConfigs,
  buildTargetPayload,
  buildFormInitialState,
  getTargetFieldName,
  toKpiUiConfig,
} from '../../engine/kpiRegistry'
import {
  mergeRemoteRegistryWithDefaults,
  buildDocPayloadSync,
} from '../../services/kpiRegistryLogic'
import type { KpiDefinition, KpiRegistry } from '../../engine/kpiRegistry'

// ── Source-level static analysis ─────────────────────────────

const TARGETS_PAGE_SRC = readFileSync(
  resolve(__dirname, '../../pages/shared/TargetsPage.jsx'),
  'utf8',
)

// ── Test helpers ──────────────────────────────────────────────

function customKpi(key: string, overrides: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key, label: `Custom ${key}`, shortLabel: key, labelAr: 'مخصص',
    category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    thresholds: { healthy:90, watch:75, risk:55, critical:35 },
    visibility: {
      dashboardEnabled: true, teamEnabled: false,
      executiveEnabled: false, regionalEnabled: false,
      targetInputEnabled: false,
    },
    sortOrder: 500,
    ...overrides,
  }
}

function withTargetInput(key: string): KpiDefinition {
  return customKpi(key, {
    visibility: {
      dashboardEnabled:true, teamEnabled:false,
      executiveEnabled:false, regionalEnabled:false,
      targetInputEnabled:true,
    },
  })
}

// ─────────────────────────────────────────────────────────────
// TEST 1 — No module-level TARGET_INPUT_CONFIGS in TargetsPage
// ─────────────────────────────────────────────────────────────

describe('Test 1 — TargetsPage has no stale TARGET_INPUT_CONFIGS', () => {
  it('no module-level const TARGET_INPUT_CONFIGS in source', () => {
    // Module-level consts appear before any function declaration
    const beforeFirstFunction = TARGETS_PAGE_SRC.slice(
      0, TARGETS_PAGE_SRC.indexOf('function TargetCard(')
    )
    expect(beforeFirstFunction).not.toContain('const TARGET_INPUT_CONFIGS')
    expect(beforeFirstFunction).not.toContain('const KPI_FIELDS')
  })

  it('TARGET_INPUT_CONFIGS only appears in comments, not as a variable', () => {
    // Strip comment lines — remaining code must not reference TARGET_INPUT_CONFIGS
    const noComments = TARGETS_PAGE_SRC
      .split('\n')
      .filter(l => !l.trim().startsWith('//'))
      .join('\n')
    expect(noComments).not.toContain('TARGET_INPUT_CONFIGS')
  })

  it('KPI_FIELDS only appears in comments, not as a variable', () => {
    const noComments = TARGETS_PAGE_SRC
      .split('\n')
      .filter(l => !l.trim().startsWith('//'))
      .join('\n')
    expect(noComments).not.toContain('KPI_FIELDS')
  })

  it('TargetsPage uses targetInputConfigs (camelCase) in useMemo', () => {
    expect(TARGETS_PAGE_SRC).toContain('const targetInputConfigs = useMemo(')
    expect(TARGETS_PAGE_SRC).toContain('const kpiFields = useMemo(')
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 2 — Live registry drives target configs
// ─────────────────────────────────────────────────────────────

describe('Test 2 — live registry drives target input configs', () => {
  it('getTargetInputConfigs(liveRegistry) includes newly added custom KPI', () => {
    const liveRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      nps: withTargetInput('nps'),
    }
    const configs = getTargetInputConfigs(liveRegistry)
    expect(configs.find(c => c.key === 'nps')).toBeDefined()
  })

  it('calling with different registries returns different results', () => {
    const base    = getTargetInputConfigs(DEFAULT_KPI_REGISTRY)
    const withNps = getTargetInputConfigs({ ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') })
    expect(withNps.length).toBeGreaterThan(base.length)
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 3 — Custom KPI with targetInputEnabled=true appears
// ─────────────────────────────────────────────────────────────

describe('Test 3 — custom KPI with targetInputEnabled appears', () => {
  it('nps with targetInputEnabled=true appears in configs', () => {
    const merged  = mergeRemoteRegistryWithDefaults({ nps: withTargetInput('nps') })
    const configs = getTargetInputConfigs(merged)
    expect(configs.find(c => c.key === 'nps')).toBeDefined()
  })

  it('manuka with targetInputEnabled=true appears in configs', () => {
    const merged  = mergeRemoteRegistryWithDefaults({ manuka: withTargetInput('manuka') })
    const configs = getTargetInputConfigs(merged)
    expect(configs.find(c => c.key === 'manuka')).toBeDefined()
  })

  it('custom KPI gets a safe targetFieldName', () => {
    expect(getTargetFieldName('nps')).toBe('npsTarget')
    expect(getTargetFieldName('manuka')).toBe('manukaTarget')
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 4 — Hidden KPI does not appear
// ─────────────────────────────────────────────────────────────

describe('Test 4 — hidden KPI excluded from target configs', () => {
  it('KPI with targetInputEnabled=false excluded', () => {
    const merged  = mergeRemoteRegistryWithDefaults({ hidden: customKpi('hidden') })
    const configs = getTargetInputConfigs(merged)
    expect(configs.find(c => c.key === 'hidden')).toBeUndefined()
  })

  it('non-core production KPIs excluded by default', () => {
    const configs = getTargetInputConfigs()
    expect(configs.find(c => c.key === 'sales')).toBeUndefined()
    expect(configs.find(c => c.key === 'ndf')).toBeUndefined()
    expect(configs.find(c => c.key === 'inbody')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 5 — Archived KPI excluded
// ─────────────────────────────────────────────────────────────

describe('Test 5 — archived KPI excluded', () => {
  it('isActive=false KPI excluded even with targetInputEnabled=true', () => {
    const archived = { ...withTargetInput('archived'), isActive: false }
    const merged   = mergeRemoteRegistryWithDefaults({ archived })
    const configs  = getTargetInputConfigs(merged)
    expect(configs.find(c => c.key === 'archived')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 6 — buildTargetPayload includes dynamic fields
// ─────────────────────────────────────────────────────────────

describe('Test 6 — buildTargetPayload includes npsTarget, manukaTarget', () => {
  it('payload includes npsTarget when nps is in configs', () => {
    const registry = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs  = getTargetInputConfigs(registry)
    const formValues: Record<string,number> = {}
    configs.forEach(c => { formValues[c.targetFieldName] = 100 })
    const payload = buildTargetPayload('p1', '2025-05', formValues, configs)
    expect(payload).toHaveProperty('npsTarget')
  })

  it('payload includes manukaTarget when manuka is in configs', () => {
    const registry = { ...DEFAULT_KPI_REGISTRY, manuka: withTargetInput('manuka') }
    const configs  = getTargetInputConfigs(registry)
    const formValues: Record<string,number> = {}
    configs.forEach(c => { formValues[c.targetFieldName] = 50 })
    const payload = buildTargetPayload('p1', '2025-05', formValues, configs)
    expect(payload).toHaveProperty('manukaTarget')
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 7 — Legacy alias mappings preserved
// ─────────────────────────────────────────────────────────────

describe('Test 7 — legacy alias mappings preserved', () => {
  it('omnihealth → omniTarget', () => {
    const configs = getTargetInputConfigs()
    const cfg = configs.find(c => c.key === 'omnihealth')!
    expect(cfg.targetFieldName).toBe('omniTarget')
  })

  it('wellnessCard → wellnessTarget', () => {
    const configs = getTargetInputConfigs()
    const cfg = configs.find(c => c.key === 'wellnessCard')!
    expect(cfg.targetFieldName).toBe('wellnessTarget')
  })

  it('wasfaty → wasfatyTarget', () => {
    const cfg = getTargetInputConfigs().find(c => c.key === 'wasfaty')!
    expect(cfg.targetFieldName).toBe('wasfatyTarget')
  })

  it('basket → basketTarget', () => {
    const cfg = getTargetInputConfigs().find(c => c.key === 'basket')!
    expect(cfg.targetFieldName).toBe('basketTarget')
  })

  it('crossSelling → crossSellTarget', () => {
    const cfg = getTargetInputConfigs().find(c => c.key === 'crossSelling')!
    expect(cfg.targetFieldName).toBe('crossSellTarget')
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 8 — Dynamic target values are numeric / empty → 0
// ─────────────────────────────────────────────────────────────

describe('Test 8+9 — dynamic values are numeric; empty → 0', () => {
  it('buildTargetPayload converts string numbers to numbers', () => {
    const registry = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs  = getTargetInputConfigs(registry)
    const form: Record<string,number> = { npsTarget: '150' as any, wasfatyTarget: '200' as any }
    const payload = buildTargetPayload('p1', '2025-05', form, configs)
    expect(typeof payload.wasfatyTarget).toBe('number')
    expect(typeof (payload as any).npsTarget).toBe('number')
  })

  it('missing optional field defaults to 0 — no NaN', () => {
    const configs = getTargetInputConfigs()
    const payload = buildTargetPayload('p1', '2025-05', {}, configs)
    expect(payload.wasfatyTarget).toBe(0)
    expect(isNaN(payload.wasfatyTarget)).toBe(false)
  })

  it('buildFormInitialState fills all config fields with 0', () => {
    const configs = getTargetInputConfigs()
    const state   = buildFormInitialState(null, configs)
    configs.forEach(c => {
      expect(state).toHaveProperty(c.targetFieldName)
      expect(state[c.targetFieldName]).toBe(0)
      expect(isNaN(state[c.targetFieldName])).toBe(false)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 10 — Hidden/archived KPIs excluded from save payload
// ─────────────────────────────────────────────────────────────

describe('Test 10 — hidden/archived excluded from payload', () => {
  it('save payload does not include hidden (targetInputEnabled=false) KPI', () => {
    const registry = {
      ...DEFAULT_KPI_REGISTRY,
      hiddenKpi: customKpi('hiddenKpi'), // targetInputEnabled=false
    }
    const configs = getTargetInputConfigs(registry)
    const payload = buildTargetPayload('p1', '2025-05', {}, configs)
    expect(payload).not.toHaveProperty('hiddenKpiTarget')
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 11 — Edit flow preserves dynamic fields
// ─────────────────────────────────────────────────────────────

describe('Test 11 — edit target preserves dynamic fields', () => {
  it('buildFormInitialState reads dynamic field from existing target', () => {
    const registry = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs  = getTargetInputConfigs(registry)
    const existing = { npsTarget: 75, wasfatyTarget: 200 }
    const state    = buildFormInitialState(existing, configs)
    expect(state.npsTarget).toBe(75)
    expect(state.wasfatyTarget).toBe(200)
  })

  it('missing dynamic field in existing target defaults to 0', () => {
    const registry = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs  = getTargetInputConfigs(registry)
    const existing = { wasfatyTarget: 200 } // npsTarget absent
    const state    = buildFormInitialState(existing, configs)
    expect(state.npsTarget).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 12 — Firestore payload backward compatible
// ─────────────────────────────────────────────────────────────

describe('Test 12 — Firestore payload backward compatible', () => {
  it('buildTargetPayload includes all 5 legacy core fields', () => {
    const configs = getTargetInputConfigs()
    const payload = buildTargetPayload('p1', '2025-05', {
      wasfatyTarget:200, omniTarget:160, wellnessTarget:120,
      basketTarget:100, crossSellTarget:80,
    }, configs)
    expect(payload.wasfatyTarget).toBe(200)
    expect(payload.omniTarget).toBe(160)
    expect(payload.wellnessTarget).toBe(120)
    expect(payload.basketTarget).toBe(100)
    expect(payload.crossSellTarget).toBe(80)
  })

  it('legacy payload round-trip is unchanged', () => {
    const legacy = {
      pharmacyId:'p1', month:'2025-05',
      wasfatyTarget:200, omniTarget:160, wellnessTarget:120,
      basketTarget:100, crossSellTarget:80,
    }
    const configs = getTargetInputConfigs()
    const form = buildFormInitialState(legacy, configs)
    const rebuilt = buildTargetPayload('p1', '2025-05', form, configs)
    expect(rebuilt.wasfatyTarget).toBe(legacy.wasfatyTarget)
    expect(rebuilt.omniTarget).toBe(legacy.omniTarget)
    expect(rebuilt.wellnessTarget).toBe(legacy.wellnessTarget)
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 13 — Save handler uses live configs (source check)
// ─────────────────────────────────────────────────────────────

describe('Test 13 — save handler uses live configs', () => {
  it('TargetsPage handleSave uses targetInputConfigs not KPI_FIELDS', () => {
    // Source-level check: the handleSave body should reference targetInputConfigs
    const handleSaveIdx = TARGETS_PAGE_SRC.indexOf('async function handleSave(')
      || TARGETS_PAGE_SRC.indexOf('const handleSave =')
      || TARGETS_PAGE_SRC.indexOf('handleSave')
    const saveSection = TARGETS_PAGE_SRC.slice(handleSaveIdx, handleSaveIdx + 600)
    expect(saveSection).not.toContain('KPI_FIELDS')
    expect(saveSection).not.toContain('TARGET_INPUT_CONFIGS')
  })
})

// ─────────────────────────────────────────────────────────────
// TEST 14 — No crash when custom KPI missing color/metadata
// ─────────────────────────────────────────────────────────────

describe('Test 14 — no crash on missing color/metadata', () => {
  it('custom KPI always gets a safe defaultColor', () => {
    const def = customKpi('noColorKpi')
    const cfg = toKpiUiConfig(def, 1)
    expect(cfg.defaultColor).toBeTruthy()
    expect(typeof cfg.defaultColor).toBe('string')
    expect(() => cfg.defaultColor.length).not.toThrow()
  })

  it('getTargetInputConfigs does not throw for a fully custom registry', () => {
    const registry = {
      ...DEFAULT_KPI_REGISTRY,
      weirdKpi: customKpi('weirdKpi', {
        visibility: { dashboardEnabled:true, teamEnabled:false,
          executiveEnabled:false, regionalEnabled:false, targetInputEnabled:true },
      }),
    }
    expect(() => getTargetInputConfigs(registry)).not.toThrow()
  })
})
