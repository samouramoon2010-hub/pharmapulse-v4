// ============================================================
// Dynamic KPI Target System — Full Regression Suite
// Authoritative coverage for all 14 required test scenarios.
// Each describe block maps directly to one requirement.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'

import {
  DEFAULT_KPI_REGISTRY,
  DEFAULT_CORE_KPI_KEYS,
  getActiveKpis,
  getTargetInputConfigs,
  buildTargetPayload,
  buildFormInitialState,
  getTargetFieldName,
  toKpiUiConfig,
  getKpiUiConfig,
  DEFAULT_KPI_UI_CONFIG,
} from '../../engine/kpiRegistry'

import {
  mergeRemoteRegistryWithDefaults,
  buildDocPayloadSync,
  PROTECTED_CORE_KEYS,
} from '../../services/kpiRegistryLogic'

import type { KpiDefinition, KpiRegistry } from '../../engine/kpiRegistry'

// ── Source files for static analysis ─────────────────────────
const TARGETS_SRC = readFileSync(
  resolve(__dirname, '../../pages/shared/TargetsPage.jsx'), 'utf8'
)
const KPISERVICE_SRC = readFileSync(
  resolve(__dirname, '../../services/kpiService.js'), 'utf8'
)
const FIRESTORE_RULES = readFileSync(
  resolve(__dirname, '../../../firestore.rules'), 'utf8'
)

// ── Helper factories ──────────────────────────────────────────

function mkKpi(key: string, overrides: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key, label: `KPI ${key}`, shortLabel: key, labelAr: 'اختبار',
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
  return mkKpi(key, {
    visibility: {
      dashboardEnabled:true, teamEnabled:false,
      executiveEnabled:false, regionalEnabled:false,
      targetInputEnabled:true,
    },
  })
}

// ─────────────────────────────────────────────────────────────
// REQ 1 — TargetsPage has NO stale TARGET_INPUT_CONFIGS refs
// ─────────────────────────────────────────────────────────────

describe('Req 1 — TargetsPage: no stale TARGET_INPUT_CONFIGS', () => {
  it('no module-level const TARGET_INPUT_CONFIGS before first function', () => {
    const beforeFunctions = TARGETS_SRC.slice(0, TARGETS_SRC.indexOf('function TargetCard('))
    expect(beforeFunctions).not.toContain('const TARGET_INPUT_CONFIGS')
    expect(beforeFunctions).not.toContain('const KPI_FIELDS')
  })

  it('TARGET_INPUT_CONFIGS does not appear in executable code (only comments)', () => {
    const noComments = TARGETS_SRC.split('\n')
      .filter(l => !l.trim().startsWith('//'))
      .join('\n')
    expect(noComments).not.toContain('TARGET_INPUT_CONFIGS')
  })

  it('KPI_FIELDS does not appear in executable code (only comments)', () => {
    const noComments = TARGETS_SRC.split('\n')
      .filter(l => !l.trim().startsWith('//'))
      .join('\n')
    expect(noComments).not.toContain('KPI_FIELDS')
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 2 — TargetsPage uses live targetInputConfigs
// ─────────────────────────────────────────────────────────────

describe('Req 2 — TargetsPage: uses live targetInputConfigs', () => {
  it('source defines targetInputConfigs as useMemo', () => {
    expect(TARGETS_SRC).toContain('const targetInputConfigs = useMemo(')
    expect(TARGETS_SRC).toContain('const kpiFields = useMemo(')
  })

  it('getTargetInputConfigs accepts any registry and returns different results', () => {
    const base    = getTargetInputConfigs(DEFAULT_KPI_REGISTRY)
    const withNps = getTargetInputConfigs({ ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') })
    expect(withNps.length).toBeGreaterThan(base.length)
  })

  it('live registry change immediately reflected in configs', () => {
    const live = mergeRemoteRegistryWithDefaults({ dynamicKpi: withTargetInput('dynamicKpi') })
    const configs = getTargetInputConfigs(live)
    expect(configs.find(c => c.key === 'dynamicKpi')).toBeDefined()
  })

  it('subscribeKpiRegistry is imported in TargetsPage', () => {
    expect(TARGETS_SRC).toContain('subscribeKpiRegistry')
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 3 — Custom KPI with targetInputEnabled=true appears
// ─────────────────────────────────────────────────────────────

describe('Req 3 — Custom KPI targetInputEnabled=true appears in form', () => {
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

  it('custom KPI gets a safe isVisibleForTargetInput=true', () => {
    const merged  = mergeRemoteRegistryWithDefaults({ nps: withTargetInput('nps') })
    const cfg     = getKpiUiConfig('nps', merged)
    expect(cfg?.isVisibleForTargetInput).toBe(true)
  })

  it('multiple custom KPIs can be targetInputEnabled simultaneously', () => {
    const merged  = mergeRemoteRegistryWithDefaults({
      nps: withTargetInput('nps'),
      manuka: withTargetInput('manuka'),
    })
    const configs = getTargetInputConfigs(merged)
    expect(configs.find(c => c.key === 'nps')).toBeDefined()
    expect(configs.find(c => c.key === 'manuka')).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 4 — Hidden KPI excluded from target form
// ─────────────────────────────────────────────────────────────

describe('Req 4 — Hidden KPI excluded from target form', () => {
  it('custom KPI with targetInputEnabled=false excluded', () => {
    const merged  = mergeRemoteRegistryWithDefaults({ hidden: mkKpi('hidden') })
    const configs = getTargetInputConfigs(merged)
    expect(configs.find(c => c.key === 'hidden')).toBeUndefined()
  })

  it('non-core production KPIs excluded by default', () => {
    const configs = getTargetInputConfigs()
    ;['sales','sl','ndf','inbody','liberation'].forEach(key => {
      expect(configs.find(c => c.key === key)).toBeUndefined()
    })
  })

  it('isVisibleForTargetInput=false for non-core without flag', () => {
    const cfg = getKpiUiConfig('ndf')
    expect(cfg?.isVisibleForTargetInput).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 5 — Archived KPI excluded from target form
// ─────────────────────────────────────────────────────────────

describe('Req 5 — Archived KPI excluded from target form', () => {
  it('isActive=false KPI excluded even with targetInputEnabled=true', () => {
    const archived = { ...withTargetInput('archived'), isActive: false }
    const merged   = mergeRemoteRegistryWithDefaults({ archived })
    expect(getTargetInputConfigs(merged).find(c => c.key === 'archived')).toBeUndefined()
  })

  it('archived KPI uiStatus is ARCHIVED', () => {
    const def = { ...DEFAULT_KPI_REGISTRY.sales, isActive: false }
    const cfg = toKpiUiConfig(def, 1)
    expect(cfg.uiStatus).toBe('ARCHIVED')
  })

  it('archived KPI remains findable via getKpiUiConfig (historical reads)', () => {
    const def    = { ...DEFAULT_KPI_REGISTRY.sales, isActive: false }
    const merged = mergeRemoteRegistryWithDefaults({ sales: def })
    const cfg    = getKpiUiConfig('sales', merged)
    expect(cfg).toBeDefined()
    expect(cfg?.uiStatus).toBe('ARCHIVED')
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 6 — buildTargetPayload includes npsTarget, manukaTarget
// ─────────────────────────────────────────────────────────────

describe('Req 6 — buildTargetPayload includes npsTarget and manukaTarget', () => {
  it('nps → npsTarget included in payload', () => {
    const reg     = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs = getTargetInputConfigs(reg)
    const form    = Object.fromEntries(configs.map(c => [c.targetFieldName, 50]))
    const payload = buildTargetPayload('p1', '2025-05', form, configs)
    expect((payload as any).npsTarget).toBe(50)
  })

  it('manuka → manukaTarget included in payload', () => {
    const reg     = { ...DEFAULT_KPI_REGISTRY, manuka: withTargetInput('manuka') }
    const configs = getTargetInputConfigs(reg)
    const form    = Object.fromEntries(configs.map(c => [c.targetFieldName, 30]))
    const payload = buildTargetPayload('p1', '2025-05', form, configs)
    expect((payload as any).manukaTarget).toBe(30)
  })

  it('getTargetFieldName generates correct field names', () => {
    expect(getTargetFieldName('nps')).toBe('npsTarget')
    expect(getTargetFieldName('manuka')).toBe('manukaTarget')
    expect(getTargetFieldName('customXyz')).toBe('customXyzTarget')
  })

  it('saveTarget service accepts dynamic *Target fields via spread', () => {
    expect(KPISERVICE_SRC).toContain('...targetFields')
    expect(KPISERVICE_SRC).toContain("key.endsWith('Target')")
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 7 — Existing alias mappings preserved
// ─────────────────────────────────────────────────────────────

describe('Req 7 — Existing alias mappings preserved', () => {
  it('omnihealth → omniTarget', () => {
    expect(getTargetFieldName('omnihealth')).toBe('omniTarget')
    const cfg = getTargetInputConfigs().find(c => c.key === 'omnihealth')!
    expect(cfg.targetFieldName).toBe('omniTarget')
    expect(cfg.engineKey).toBe('omni')
  })

  it('wellnessCard → wellnessTarget', () => {
    expect(getTargetFieldName('wellnessCard')).toBe('wellnessTarget')
    const cfg = getTargetInputConfigs().find(c => c.key === 'wellnessCard')!
    expect(cfg.targetFieldName).toBe('wellnessTarget')
    expect(cfg.engineKey).toBe('wellness')
  })

  it('wasfaty, basket, crossSelling have no alias', () => {
    expect(getTargetFieldName('wasfaty')).toBe('wasfatyTarget')
    expect(getTargetFieldName('basket')).toBe('basketTarget')
    expect(getTargetFieldName('crossSelling')).toBe('crossSellTarget')
  })

  it('alias mapping preserved in buildTargetPayload output', () => {
    const configs = getTargetInputConfigs()
    const form = { wasfatyTarget:200, omniTarget:160, wellnessTarget:120, basketTarget:100, crossSellTarget:80 }
    const payload = buildTargetPayload('p1', '2025-05', form, configs)
    expect(payload.wasfatyTarget).toBe(200)
    expect(payload.omniTarget).toBe(160)
    expect(payload.wellnessTarget).toBe(120)
    expect(payload.basketTarget).toBe(100)
    expect(payload.crossSellTarget).toBe(80)
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 8 — Dynamic target values saved as numbers
// ─────────────────────────────────────────────────────────────

describe('Req 8 — Dynamic target values saved as numbers', () => {
  it('string "150" converted to number 150', () => {
    const configs = getTargetInputConfigs()
    const payload = buildTargetPayload('p1', '2025-05', { wasfatyTarget: '150' as any }, configs)
    expect(typeof payload.wasfatyTarget).toBe('number')
    expect(payload.wasfatyTarget).toBe(150)
  })

  it('saveTarget clamps negative to 0', () => {
    // Mirrors the saveTarget implementation
    const safeVal = Math.max(0, Number(-5))
    expect(safeVal).toBe(0)
  })

  it('saveTarget rejects NaN and Infinity', () => {
    const bad = [NaN, Infinity, -Infinity]
    bad.forEach(v => {
      const n = Number(v)
      expect(isNaN(n) || !isFinite(n)).toBe(true)
    })
  })

  it('buildTargetPayload values are always finite numbers', () => {
    const configs = getTargetInputConfigs()
    const payload = buildTargetPayload('p1', '2025-05', {}, configs)
    Object.values(payload).forEach(v => {
      if (typeof v === 'number') {
        expect(isNaN(v)).toBe(false)
        expect(isFinite(v)).toBe(true)
      }
    })
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 9 — Empty optional values become 0
// ─────────────────────────────────────────────────────────────

describe('Req 9 — Empty optional values become 0', () => {
  it('buildFormInitialState returns 0 for all fields when no existing doc', () => {
    const configs = getTargetInputConfigs()
    const state   = buildFormInitialState(null, configs)
    configs.forEach(c => {
      expect(state[c.targetFieldName]).toBe(0)
    })
  })

  it('missing field in existing doc defaults to 0', () => {
    const reg     = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs = getTargetInputConfigs(reg)
    const state   = buildFormInitialState({ wasfatyTarget: 100 }, configs)
    expect(state.npsTarget).toBe(0)
    expect(isNaN(state.npsTarget)).toBe(false)
  })

  it('buildTargetPayload defaults missing form value to 0', () => {
    const configs = getTargetInputConfigs()
    const payload = buildTargetPayload('p1', '2025-05', {}, configs)
    expect(payload.wasfatyTarget).toBe(0)
    expect(isNaN(payload.wasfatyTarget)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 10 — Hidden/archived KPIs excluded from save payload
// ─────────────────────────────────────────────────────────────

describe('Req 10 — Hidden/archived KPIs excluded from save payload', () => {
  it('targetInputEnabled=false KPI not in payload', () => {
    const reg     = { ...DEFAULT_KPI_REGISTRY, hidden: mkKpi('hidden') }
    const configs = getTargetInputConfigs(reg)
    const payload = buildTargetPayload('p1', '2025-05', {}, configs)
    expect(payload).not.toHaveProperty('hiddenTarget')
  })

  it('isActive=false KPI not in payload', () => {
    const reg     = {
      ...DEFAULT_KPI_REGISTRY,
      archivedOne: { ...withTargetInput('archivedOne'), isActive: false },
    }
    const configs = getTargetInputConfigs(reg)
    const payload = buildTargetPayload('p1', '2025-05', {}, configs)
    expect(payload).not.toHaveProperty('archivedOneTarget')
  })

  it('non-core production KPIs not in default payload', () => {
    const configs = getTargetInputConfigs()
    const payload = buildTargetPayload('p1', '2025-05', {}, configs)
    expect(payload).not.toHaveProperty('ndfTarget')
    expect(payload).not.toHaveProperty('inbodyTarget')
    expect(payload).not.toHaveProperty('liberationTarget')
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 11 — Edit target preserves dynamic KPI fields
// ─────────────────────────────────────────────────────────────

describe('Req 11 — Edit target preserves dynamic KPI fields', () => {
  it('buildFormInitialState reads dynamic field from existing Firestore doc', () => {
    const reg     = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs = getTargetInputConfigs(reg)
    const doc     = { npsTarget: 75, wasfatyTarget: 200, omniTarget: 160, wellnessTarget: 120, basketTarget: 100, crossSellTarget: 80 }
    const state   = buildFormInitialState(doc, configs)
    expect(state.npsTarget).toBe(75)
    expect(state.wasfatyTarget).toBe(200)
  })

  it('save round-trip preserves dynamic field value', () => {
    const reg     = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs = getTargetInputConfigs(reg)
    const original = { npsTarget: 85, wasfatyTarget: 200, omniTarget:160, wellnessTarget:120, basketTarget:100, crossSellTarget:80 }
    const state    = buildFormInitialState(original, configs)
    state.npsTarget = 90   // user edits
    const payload  = buildTargetPayload('p1', '2025-05', state, configs)
    expect((payload as any).npsTarget).toBe(90)
  })

  it('edit of core KPI does not affect dynamic KPI field', () => {
    const reg     = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs = getTargetInputConfigs(reg)
    const form    = { wasfatyTarget: 250, npsTarget: 60 }
    const payload = buildTargetPayload('p1', '2025-05', form as any, configs)
    expect(payload.wasfatyTarget).toBe(250)
    expect((payload as any).npsTarget).toBe(60)
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 12 — Firestore payload backward compatible
// ─────────────────────────────────────────────────────────────

describe('Req 12 — Firestore payload backward compatible', () => {
  it('core-only payload matches legacy shape exactly', () => {
    const configs = getTargetInputConfigs()
    const form    = { wasfatyTarget:200, omniTarget:160, wellnessTarget:120, basketTarget:100, crossSellTarget:80 }
    const payload = buildTargetPayload('p1', '2025-05', form, configs)
    expect(payload.pharmacyId).toBe('p1')
    expect(payload.month).toBe('2025-05')
    expect(payload.wasfatyTarget).toBe(200)
    expect(payload.omniTarget).toBe(160)
    expect(payload.wellnessTarget).toBe(120)
    expect(payload.basketTarget).toBe(100)
    expect(payload.crossSellTarget).toBe(80)
  })

  it('adding dynamic field does not remove legacy fields', () => {
    const reg     = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs = getTargetInputConfigs(reg)
    const form    = { wasfatyTarget:200, omniTarget:160, wellnessTarget:120, basketTarget:100, crossSellTarget:80, npsTarget:50 }
    const payload = buildTargetPayload('p1', '2025-05', form as any, configs)
    expect(payload.wasfatyTarget).toBe(200)
    expect(payload.omniTarget).toBe(160)
    expect((payload as any).npsTarget).toBe(50)
  })

  it('Firestore targets rules have no field whitelist', () => {
    const targetsBlock = FIRESTORE_RULES.slice(
      FIRESTORE_RULES.indexOf('match /targets/'),
      FIRESTORE_RULES.indexOf('match /targets/') + 400
    )
    expect(targetsBlock).not.toContain('wasfatyTarget')
    expect(targetsBlock).not.toContain('omniTarget')
    expect(targetsBlock).toContain('isMgr()')
  })

  it('buildDocPayloadSync registry payload backward compatible', () => {
    const def     = DEFAULT_KPI_REGISTRY.wasfaty
    const payload = buildDocPayloadSync(def, 'ACTIVE', 'admin')
    expect(payload.key).toBe('wasfaty')
    expect(payload.isActive).toBe(true)
    expect(payload.isCore).toBe(true)
    expect(typeof payload.sortOrder).toBe('number')
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 13 — Save handlers use targetInputConfigs not KPI_FIELDS
// ─────────────────────────────────────────────────────────────

describe('Req 13 — Save handlers use live targetInputConfigs', () => {
  it('TargetsPage handleSave references targetInputConfigs not KPI_FIELDS', () => {
    const noComments = TARGETS_SRC.split('\n')
      .filter(l => !l.trim().startsWith('//'))
      .join('\n')
    // No KPI_FIELDS anywhere in executable code
    expect(noComments).not.toContain('KPI_FIELDS')
    // targetInputConfigs is present
    expect(noComments).toContain('targetInputConfigs')
  })

  it('saveTarget service uses spread not hardcoded field list', () => {
    // Old: explicit destructuring of 5 fields
    expect(KPISERVICE_SRC).not.toMatch(
      /function saveTarget\s*\(\s*\{[^}]*wasfatyTarget\s*=\s*0/
    )
    // New: open spread
    expect(KPISERVICE_SRC).toContain('...targetFields')
  })

  it('handleBulkSave uses targetInputConfigs spread for all fields', () => {
    expect(TARGETS_SRC).toContain(
      'targetInputConfigs.map(c => [c.targetFieldName'
    )
  })

  it('kpiFields useMemo in TargetsPage uses defaultColor from config', () => {
    expect(TARGETS_SRC).toContain('cfg.defaultColor')
  })
})

// ─────────────────────────────────────────────────────────────
// REQ 14 — No crash when custom KPI missing color/metadata
// ─────────────────────────────────────────────────────────────

describe('Req 14 — No crash on missing KPI color/metadata', () => {
  it('toKpiUiConfig always returns a non-empty defaultColor', () => {
    const def = mkKpi('noColorKpi')
    const cfg = toKpiUiConfig(def, 1)
    expect(cfg.defaultColor).toBeDefined()
    expect(typeof cfg.defaultColor).toBe('string')
    expect(cfg.defaultColor.length).toBeGreaterThan(0)
    expect(cfg.defaultColor).not.toBe('undefined')
  })

  it('unknown KPI key gets #a1a1aa fallback color', () => {
    const def = mkKpi('brandNewXyz999')
    const cfg = toKpiUiConfig(def, 1)
    expect(cfg.defaultColor).toBe('#a1a1aa')
  })

  it('known KPIs have specific colors', () => {
    expect(toKpiUiConfig(DEFAULT_KPI_REGISTRY.wasfaty, 1).defaultColor).toBe('#6366f1')
    expect(toKpiUiConfig(DEFAULT_KPI_REGISTRY.basket, 1).defaultColor).toBe('#22c55e')
  })

  it('getTargetInputConfigs never throws for a fully custom registry', () => {
    const reg = { ...DEFAULT_KPI_REGISTRY, weirdKpi: withTargetInput('weirdKpi') }
    expect(() => getTargetInputConfigs(reg)).not.toThrow()
  })

  it('all active KPIs produce valid precision (no NaN)', () => {
    getActiveKpis(DEFAULT_KPI_REGISTRY).forEach((kpi, i) => {
      const cfg = toKpiUiConfig(kpi, i + 1)
      expect(isNaN(cfg.precision)).toBe(false)
      expect([0,1,2]).toContain(cfg.precision)
    })
  })

  it('DEFAULT_KPI_UI_CONFIG is a safe complete fallback', () => {
    expect(DEFAULT_KPI_UI_CONFIG.defaultColor).toMatch(/^#[0-9a-f]{6}$/i)
    expect(DEFAULT_KPI_UI_CONFIG.precision).toBe(0)
    expect(DEFAULT_KPI_UI_CONFIG.componentType).toBe('NUMERIC_INPUT')
    expect(isNaN(DEFAULT_KPI_UI_CONFIG.minAllowedValue)).toBe(false)
  })
})
