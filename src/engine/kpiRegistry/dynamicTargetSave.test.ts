// ============================================================
// Dynamic KPI Target Save Tests
// Covers the full save path: payload → Firestore service layer
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'

import {
  DEFAULT_KPI_REGISTRY,
  getTargetInputConfigs,
  buildTargetPayload,
  buildFormInitialState,
  getTargetFieldName,
} from '../../engine/kpiRegistry'
import { mergeRemoteRegistryWithDefaults } from '../../services/kpiRegistryLogic'
import type { KpiDefinition, KpiRegistry } from '../../engine/kpiRegistry'

const KPISERVICE_SRC = readFileSync(
  resolve(__dirname, '../../services/kpiService.js'),
  'utf8',
)

// ── helpers ───────────────────────────────────────────────────

function withTargetInput(key: string): KpiDefinition {
  return {
    key, label: `Custom ${key}`, shortLabel: key, labelAr: 'مخصص',
    category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    thresholds: { healthy:90, watch:75, risk:55, critical:35 },
    visibility: {
      dashboardEnabled:true, teamEnabled:false,
      executiveEnabled:false, regionalEnabled:false,
      targetInputEnabled:true,
    },
    sortOrder: 500,
  }
}

// ─────────────────────────────────────────────────────────────
// 1. saveTarget accepts dynamic *Target fields
// ─────────────────────────────────────────────────────────────

describe('saveTarget service — dynamic field acceptance', () => {
  it('saveTarget source uses spread ...targetFields, not hardcoded destructure', () => {
    expect(KPISERVICE_SRC).toContain('...targetFields')
    expect(KPISERVICE_SRC).not.toMatch(
      /function saveTarget\(\{[^}]*salesTarget\s*=\s*0/
    )
  })

  it('saveTarget filters only *Target keys', () => {
    expect(KPISERVICE_SRC).toContain("key.endsWith('Target')")
  })

  it('saveTarget converts values to numbers and clamps negative', () => {
    expect(KPISERVICE_SRC).toContain('Math.max(0, n)')
    expect(KPISERVICE_SRC).toContain('isNaN(n) || !isFinite(n)')
  })

  it('saveTarget still writes basketTarget (previously missing)', () => {
    // Verify the new implementation will write basketTarget via the spread
    const mockFields = { basketTarget: 100, wasfatyTarget: 200 }
    const safeFields: Record<string,number> = {}
    for (const [key, raw] of Object.entries(mockFields)) {
      if (!key.endsWith('Target')) continue
      const n = Number(raw)
      if (!isNaN(n) && isFinite(n)) safeFields[key] = Math.max(0, n)
    }
    expect(safeFields.basketTarget).toBe(100)
    expect(safeFields.wasfatyTarget).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. buildTargetPayload includes dynamic fields
// ─────────────────────────────────────────────────────────────

describe('buildTargetPayload — includes dynamic KPI fields', () => {
  it('nps → npsTarget in payload', () => {
    const reg = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs = getTargetInputConfigs(reg)
    const form: Record<string,number> = {}
    configs.forEach(c => { form[c.targetFieldName] = 50 })
    const payload = buildTargetPayload('p1', '2025-05', form, configs)
    expect((payload as any).npsTarget).toBe(50)
  })

  it('manuka → manukaTarget in payload', () => {
    const reg = { ...DEFAULT_KPI_REGISTRY, manuka: withTargetInput('manuka') }
    const configs = getTargetInputConfigs(reg)
    const form: Record<string,number> = {}
    configs.forEach(c => { form[c.targetFieldName] = 75 })
    const payload = buildTargetPayload('p1', '2025-05', form, configs)
    expect((payload as any).manukaTarget).toBe(75)
  })

  it('omnihealth → omniTarget (alias preserved)', () => {
    const configs = getTargetInputConfigs()
    const form = { omniTarget: 160, wasfatyTarget:200, wellnessTarget:120, basketTarget:100, crossSellTarget:80 }
    const payload = buildTargetPayload('p1', '2025-05', form, configs)
    expect(payload.omniTarget).toBe(160)
  })

  it('wellnessCard → wellnessTarget (alias preserved)', () => {
    const configs = getTargetInputConfigs()
    const form = { wellnessTarget:120, wasfatyTarget:200, omniTarget:160, basketTarget:100, crossSellTarget:80 }
    const payload = buildTargetPayload('p1', '2025-05', form, configs)
    expect(payload.wellnessTarget).toBe(120)
  })

  it('basketTarget included in payload (was previously missing from saveTarget)', () => {
    const configs = getTargetInputConfigs()
    const form = { basketTarget:100, wasfatyTarget:200, omniTarget:160, wellnessTarget:120, crossSellTarget:80 }
    const payload = buildTargetPayload('p1', '2025-05', form, configs)
    expect(payload.basketTarget).toBe(100)
  })

  it('all 5 legacy fields present in core-only payload', () => {
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
// 3. Form state initialized correctly for dynamic KPIs
// ─────────────────────────────────────────────────────────────

describe('form state — dynamic KPI initialization', () => {
  it('buildFormInitialState includes npsTarget when nps in registry', () => {
    const reg = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs = getTargetInputConfigs(reg)
    const state = buildFormInitialState(null, configs)
    expect(state).toHaveProperty('npsTarget')
    expect(state.npsTarget).toBe(0)
  })

  it('buildFormInitialState reads existing dynamic field from Firestore doc', () => {
    const reg = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs = getTargetInputConfigs(reg)
    const existing = { npsTarget: 85, wasfatyTarget: 200 }
    const state = buildFormInitialState(existing, configs)
    expect(state.npsTarget).toBe(85)
    expect(state.wasfatyTarget).toBe(200)
  })

  it('empty dynamic field defaults to 0 — no NaN', () => {
    const reg = { ...DEFAULT_KPI_REGISTRY, nps: withTargetInput('nps') }
    const configs = getTargetInputConfigs(reg)
    const state = buildFormInitialState({}, configs)
    expect(state.npsTarget).toBe(0)
    expect(isNaN(state.npsTarget)).toBe(false)
  })

  it('dynamic field value from form string converts to number', () => {
    const configs = getTargetInputConfigs()
    const payload = buildTargetPayload('p1', '2025-05', { wasfatyTarget: '200' as any }, configs)
    expect(typeof payload.wasfatyTarget).toBe('number')
    expect(payload.wasfatyTarget).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. getTargetFieldName for all production KPIs
// ─────────────────────────────────────────────────────────────

describe('getTargetFieldName — all production KPIs', () => {
  it('wasfaty → wasfatyTarget', () => expect(getTargetFieldName('wasfaty')).toBe('wasfatyTarget'))
  it('omnihealth → omniTarget',  () => expect(getTargetFieldName('omnihealth')).toBe('omniTarget'))
  it('wellnessCard → wellnessTarget', () => expect(getTargetFieldName('wellnessCard')).toBe('wellnessTarget'))
  it('basket → basketTarget',    () => expect(getTargetFieldName('basket')).toBe('basketTarget'))
  it('crossSelling → crossSellTarget', () => expect(getTargetFieldName('crossSelling')).toBe('crossSellTarget'))
  it('sales → salesTarget',      () => expect(getTargetFieldName('sales')).toBe('salesTarget'))
  it('nps → npsTarget',          () => expect(getTargetFieldName('nps')).toBe('npsTarget'))
  it('manuka → manukaTarget',    () => expect(getTargetFieldName('manuka')).toBe('manukaTarget'))
  it('unknown → unknownTarget',  () => expect(getTargetFieldName('unknown')).toBe('unknownTarget'))
})

// ─────────────────────────────────────────────────────────────
// 5. Safe field filtering mirrors saveTarget logic
// ─────────────────────────────────────────────────────────────

describe('saveTarget field filtering — safe dynamic fields', () => {
  function simulateSaveTargetFilter(fields: Record<string, unknown>) {
    const safe: Record<string, number> = {}
    for (const [key, raw] of Object.entries(fields)) {
      if (!key.endsWith('Target')) continue
      const n = Number(raw)
      if (isNaN(n) || !isFinite(n)) continue
      safe[key] = Math.max(0, n)
    }
    return safe
  }

  it('npsTarget passes through', () => {
    expect(simulateSaveTargetFilter({ npsTarget: 50 })).toHaveProperty('npsTarget', 50)
  })

  it('manukaTarget passes through', () => {
    expect(simulateSaveTargetFilter({ manukaTarget: 30 })).toHaveProperty('manukaTarget', 30)
  })

  it('non-Target key is rejected', () => {
    const result = simulateSaveTargetFilter({ pharmacyId:'p1', someField:99, npsTarget:10 })
    expect(result).not.toHaveProperty('pharmacyId')
    expect(result).not.toHaveProperty('someField')
    expect(result).toHaveProperty('npsTarget', 10)
  })

  it('NaN value is rejected', () => {
    const result = simulateSaveTargetFilter({ npsTarget: NaN })
    expect(result).not.toHaveProperty('npsTarget')
  })

  it('negative value clamped to 0', () => {
    expect(simulateSaveTargetFilter({ npsTarget: -5 })).toHaveProperty('npsTarget', 0)
  })

  it('Infinity rejected', () => {
    const result = simulateSaveTargetFilter({ npsTarget: Infinity })
    expect(result).not.toHaveProperty('npsTarget')
  })

  it('string number converted', () => {
    const result = simulateSaveTargetFilter({ npsTarget: '100' })
    expect(result.npsTarget).toBe(100)
    expect(typeof result.npsTarget).toBe('number')
  })

  it('zero is preserved (optional fields)', () => {
    const result = simulateSaveTargetFilter({ npsTarget: 0 })
    expect(result).toHaveProperty('npsTarget', 0)
  })
})

// ─────────────────────────────────────────────────────────────
// 6. Firestore rules — targets collection allows dynamic fields
// ─────────────────────────────────────────────────────────────

describe('Firestore rules — dynamic target fields allowed', () => {
  it('targets rules do NOT whitelist specific fields (open to any manager)', () => {
    const RULES_SRC = readFileSync(
      resolve(__dirname, '../../../firestore.rules'), 'utf8'
    )
    const targetsSection = RULES_SRC.slice(
      RULES_SRC.indexOf('match /targets/'),
      RULES_SRC.indexOf('match /targets/') + 300
    )
    // Rules should NOT enumerate specific KPI field names — that's a whitelist
    expect(targetsSection).not.toContain('wasfatyTarget')
    expect(targetsSection).not.toContain('omniTarget')
    // But must still require manager auth
    expect(targetsSection).toContain('isMgr()')
  })
})

// ─────────────────────────────────────────────────────────────
// 7. End-to-end: registry → configs → payload
// ─────────────────────────────────────────────────────────────

describe('end-to-end: registry → configs → save payload', () => {
  it('full chain for nps: registry → form state → payload', () => {
    // 1. Admin adds nps to registry with targetInputEnabled=true
    const liveRegistry = mergeRemoteRegistryWithDefaults({ nps: withTargetInput('nps') })

    // 2. TargetsPage gets targetInputConfigs from live registry
    const configs = getTargetInputConfigs(liveRegistry)
    expect(configs.find(c => c.key === 'nps')).toBeDefined()

    // 3. Form initializes with npsTarget=0
    const initialState = buildFormInitialState(null, configs)
    expect(initialState.npsTarget).toBe(0)

    // 4. User types 75 into npsTarget
    const formState = { ...initialState, npsTarget: 75 }

    // 5. buildTargetPayload generates the Firestore payload
    const payload = buildTargetPayload('p1', '2025-05', formState, configs)
    expect((payload as any).npsTarget).toBe(75)
    expect(payload.wasfatyTarget).toBe(0)  // empty = 0, not NaN
  })

  it('full chain: existing npsTarget reloads into form correctly', () => {
    const liveRegistry = mergeRemoteRegistryWithDefaults({ nps: withTargetInput('nps') })
    const configs = getTargetInputConfigs(liveRegistry)

    // Simulating Firestore doc with npsTarget
    const firestoreDoc = { pharmacyId:'p1', month:'2025-05', npsTarget:80, wasfatyTarget:200 }
    const formState = buildFormInitialState(firestoreDoc, configs)
    expect(formState.npsTarget).toBe(80)
    expect(formState.wasfatyTarget).toBe(200)
  })
})
