// ============================================================
// Phase 4E-4 — Legacy Fallback Cleanup Audit
//
// Verifies that all legacy fallback maps still exist exactly
// as required. No deletion has occurred. Produces a living
// audit record: which maps are still used, which are safe to
// remove later, and which must stay permanently.
//
// NO behavior changes in this phase — audit + tests only.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_KPI_KEYS,
  getCoreEngineKeys,
  getKpiActualField,
  getKpiTargetField,
  getKpiThresholds,
  getCoachingActionForKey,
} from '../kpiAnalyticsEngine'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'

const CORE_KEYS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'] as const

// ════════════════════════════════════════════════════════════
// TEST 1 — KPI_ACTUAL_FIELDS still exists in engine source
// ════════════════════════════════════════════════════════════

describe('4E-4 test 1: KPI_ACTUAL_FIELDS still exists', () => {
  it('KPI_ACTUAL_FIELDS constant is present in kpiAnalyticsEngine source', async () => {
    const src = await import('../kpiAnalyticsEngine?raw')
    expect((src as any).default).toContain('KPI_ACTUAL_FIELDS')
  })

  it('KPI_ACTUAL_FIELDS has entries for all 5 core engine keys', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    // Each core key appears as an actualField entry
    for (const k of CORE_KEYS) {
      expect(src).toContain(`${k}:`)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 2 — KPI_TARGET_FIELDS still exists in engine source
// ════════════════════════════════════════════════════════════

describe('4E-4 test 2: KPI_TARGET_FIELDS still exists', () => {
  it('KPI_TARGET_FIELDS constant is present in kpiAnalyticsEngine source', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).toContain('KPI_TARGET_FIELDS')
  })

  it('KPI_TARGET_FIELDS crossSellTarget entry is preserved', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).toContain('crossSellTarget')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 3 — KPI_THRESHOLDS still exists in engine source
// ════════════════════════════════════════════════════════════

describe('4E-4 test 3: KPI_THRESHOLDS still exists', () => {
  it('KPI_THRESHOLDS constant is present in kpiAnalyticsEngine source', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).toContain('KPI_THRESHOLDS')
  })

  it('getKpiThresholds returns non-empty thresholds for all core keys without registry', () => {
    for (const k of CORE_KEYS) {
      const t = getKpiThresholds(k)
      expect(t.healthy).toBeGreaterThan(0)
      expect(t.watch).toBeGreaterThan(0)
      expect(t.risk).toBeGreaterThan(0)
      expect(t.critical).toBeGreaterThan(0)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 4 — ACTIONS still exists in engine source
// ════════════════════════════════════════════════════════════

describe('4E-4 test 4: ACTIONS still exists', () => {
  it('ACTIONS constant is present in kpiAnalyticsEngine source', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).toMatch(/const ACTIONS/)
  })

  it('ACTIONS has entries for all 5 core keys', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    // Each key appears as a property in the ACTIONS block
    const actionsBlock = src.slice(src.indexOf('const ACTIONS'), src.indexOf('const ACTIONS') + 700)
    expect(actionsBlock).toContain('wasfaty')
    expect(actionsBlock).toContain('omni')
    expect(actionsBlock).toContain('wellness')
    expect(actionsBlock).toContain('basket')
    expect(actionsBlock).toContain('crossSelling')
  })

  it('getCoachingActionForKey returns non-empty string without registry for all core keys', () => {
    for (const k of CORE_KEYS) {
      const action = getCoachingActionForKey(k)
      expect(typeof action).toBe('string')
      expect(action.length).toBeGreaterThan(0)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TEST 5 — KPI_META (engine) still exists in engine source
// ════════════════════════════════════════════════════════════

describe('4E-4 test 5: KPI_META (engine) still exists', () => {
  it('KPI_META constant is present in kpiAnalyticsEngine source', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).toMatch(/export const KPI_META/)
  })

  it('KPI_META is exported from the engine index', async () => {
    const indexSrc = (await import('../index?raw') as any).default as string
    expect(indexSrc).toContain('KPI_META')
  })

  it('KPI_META has targetField crossSellTarget for crossSelling', async () => {
    const { KPI_META } = await import('../kpiAnalyticsEngine')
    expect((KPI_META as any).crossSelling.targetField).toBe('crossSellTarget')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 6 — DEFAULT_KPI_KEYS still exists and is correct
// ════════════════════════════════════════════════════════════

describe('4E-4 test 6: DEFAULT_KPI_KEYS still exists', () => {
  it('DEFAULT_KPI_KEYS is exported from kpiAnalyticsEngine', () => {
    expect(Array.isArray(DEFAULT_KPI_KEYS)).toBe(true)
    expect(DEFAULT_KPI_KEYS.length).toBe(5)
  })

  it('DEFAULT_KPI_KEYS contains the 5 legacy engine keys in order', () => {
    expect(DEFAULT_KPI_KEYS).toEqual(['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'])
  })
})

// ════════════════════════════════════════════════════════════
// TEST 7 — TARGET_FIELD_MAP still exists in kpiUiAdapter
// ════════════════════════════════════════════════════════════

describe('4E-4 test 7: TARGET_FIELD_MAP still exists', () => {
  it('TARGET_FIELD_MAP constant is present in kpiUiAdapter source', async () => {
    const src = (await import('./kpiUiAdapter?raw') as any).default as string
    expect(src).toContain('TARGET_FIELD_MAP')
  })

  it('TARGET_FIELD_MAP crossSellTarget entry is preserved', async () => {
    const src = (await import('./kpiUiAdapter?raw') as any).default as string
    const block = src.slice(src.indexOf('TARGET_FIELD_MAP'), src.indexOf('TARGET_FIELD_MAP') + 400)
    expect(block).toContain('crossSellTarget')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 8 — constants KPI_KEYS marked deprecated
// ════════════════════════════════════════════════════════════

describe('4E-4 test 8: constants KPI_KEYS marked deprecated', () => {
  it('constants/index.js KPI_KEYS has @deprecated comment', async () => {
    const src = (await import('../../constants/index.js?raw') as any).default as string
    const kpiKeysIdx = src.indexOf('export const KPI_KEYS')
    const before = src.slice(Math.max(0, kpiKeysIdx - 350), kpiKeysIdx)
    expect(before).toContain('@deprecated')
  })

  it('constants KPI_KEYS still exports the legacy keys', async () => {
    const { KPI_KEYS } = await import('../../constants/index.js')
    expect((KPI_KEYS as any).WASFATY).toBe('wasfaty')
    expect((KPI_KEYS as any).CROSS_SELLING).toBe('cross_selling')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 9 — constants KPI_META marked deprecated
// ════════════════════════════════════════════════════════════

describe('4E-4 test 9: constants KPI_META marked deprecated', () => {
  it('constants/index.js KPI_META has @deprecated comment', async () => {
    const src = (await import('../../constants/index.js?raw') as any).default as string
    const kpiMetaIdx = src.indexOf('export const KPI_META')
    const before = src.slice(Math.max(0, kpiMetaIdx - 200), kpiMetaIdx)
    expect(before).toContain('@deprecated')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 10 — cross_selling not used as engine key outside constants
// ════════════════════════════════════════════════════════════

describe('4E-4 test 10: cross_selling is dead as engine key outside constants', () => {
  it('kpiAnalyticsEngine source does not use cross_selling key', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    // The engine uses crossSelling (camelCase), not cross_selling (snake_case)
    expect(src).not.toMatch(/['"]cross_selling['"]/)
  })

  it('kpiUiAdapter source does not use cross_selling key', async () => {
    const src = (await import('./kpiUiAdapter?raw') as any).default as string
    expect(src).not.toMatch(/['"]cross_selling['"]/)
  })

  it('cross_selling only exists in deprecated constants KPI_KEYS.CROSS_SELLING', async () => {
    const src = (await import('../../constants/index.js?raw') as any).default as string
    // confirm it's only in the deprecated section
    const occurrences = (src.match(/cross_selling/g) || []).length
    // Only present inside the @deprecated KPI_KEYS and KPI_META blocks
    expect(occurrences).toBeGreaterThan(0)
    expect(occurrences).toBeLessThanOrEqual(3) // KPI_KEYS.CROSS_SELLING + KPI_META key + comment
  })
})

// ════════════════════════════════════════════════════════════
// TEST 11 — omnihealth is a registry key, not an engine key
// ════════════════════════════════════════════════════════════

describe('4E-4 test 11: omnihealth is registry key, engine uses omni', () => {
  it('DEFAULT_KPI_KEYS does not contain omnihealth', () => {
    expect(DEFAULT_KPI_KEYS).not.toContain('omnihealth')
  })

  it('getCoreEngineKeys with full registry returns omni, not omnihealth', () => {
    const keys = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(keys).toContain('omni')
    expect(keys).not.toContain('omnihealth')
  })

  it('DEFAULT_KPI_REGISTRY omnihealth.aliasFor equals omni', () => {
    expect((DEFAULT_KPI_REGISTRY as any).omnihealth.aliasFor).toBe('omni')
  })

  it('getKpiActualField(omni) resolves to omni field (not omnihealth)', () => {
    expect(getKpiActualField('omni', DEFAULT_KPI_REGISTRY as any)).toBe('omni')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 12 — ACTIONS direct usage documented (must retain)
// ════════════════════════════════════════════════════════════

describe('4E-4 test 12: ACTIONS direct usage documented', () => {
  it('kpiAnalyticsEngine has exactly one direct ACTIONS[ access outside getCoachingActionForKey', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    // Count occurrences of ACTIONS[ (direct map access)
    const directAccesses = (src.match(/ACTIONS\[/g) || []).length
    // Should be exactly 1 (in generateDailyMission/equivalent)
    expect(directAccesses).toBe(1)
  })

  it('getCoachingActionForKey itself uses registry before ACTIONS', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    const fnStart = src.indexOf('function getCoachingActionForKey')
    const fnEnd   = src.indexOf('\n}', fnStart) + 2
    const fnBody  = src.slice(fnStart, fnEnd)
    // Registry check comes before ACTIONS fallback
    const registryIdx = fnBody.indexOf('registry')
    const actionsIdx  = fnBody.indexOf('ACTIONS')
    expect(registryIdx).toBeGreaterThanOrEqual(0)
    expect(actionsIdx).toBeGreaterThanOrEqual(0)
    expect(registryIdx).toBeLessThan(actionsIdx)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 13 — getCoachingActionForKey uses registry-first
// ════════════════════════════════════════════════════════════

describe('4E-4 test 13: getCoachingActionForKey is registry-first', () => {
  it('registry coachingAction overrides legacy ACTIONS for wasfaty', () => {
    const customRegistry = {
      wasfaty: {
        key: 'wasfaty', aliasFor: undefined, isActive: true, isCore: true,
        lifecycleStage: 'production_evaluation', sortOrder: 10,
        coachingAction: 'REGISTRY_OVERRIDE_ACTION',
      },
    } as any
    expect(getCoachingActionForKey('wasfaty', customRegistry)).toBe('REGISTRY_OVERRIDE_ACTION')
  })

  it('falls back to ACTIONS when no registry provided', () => {
    const action = getCoachingActionForKey('wasfaty')
    expect(action).toContain('e-prescription')  // legacy ACTIONS text
  })

  it('DEFAULT_KPI_REGISTRY returns longer coaching action than legacy ACTIONS', () => {
    const registryAction = getCoachingActionForKey('wasfaty', DEFAULT_KPI_REGISTRY as any)
    const legacyAction   = getCoachingActionForKey('wasfaty')
    expect(registryAction.length).toBeGreaterThan(legacyAction.length)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 14 — getKpiActualField uses registry-first
// ════════════════════════════════════════════════════════════

describe('4E-4 test 14: getKpiActualField is registry-first', () => {
  it('registry actualField overrides KPI_ACTUAL_FIELDS when registry provided', () => {
    const customRegistry = {
      wasfaty: {
        key: 'wasfaty', aliasFor: undefined, isActive: true, isCore: true,
        lifecycleStage: 'production_evaluation', sortOrder: 10,
        actualField: 'wasfatyCustomField',
      },
    } as any
    expect(getKpiActualField('wasfaty', customRegistry)).toBe('wasfatyCustomField')
  })

  it('falls back to KPI_ACTUAL_FIELDS when no registry provided', () => {
    expect(getKpiActualField('wasfaty')).toBe('wasfaty')
    expect(getKpiActualField('crossSelling')).toBe('crossSelling')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 15 — getKpiTargetField uses registry-first
// ════════════════════════════════════════════════════════════

describe('4E-4 test 15: getKpiTargetField is registry-first', () => {
  it('registry targetField overrides KPI_TARGET_FIELDS when registry provided', () => {
    const customRegistry = {
      wasfaty: {
        key: 'wasfaty', aliasFor: undefined, isActive: true, isCore: true,
        lifecycleStage: 'production_evaluation', sortOrder: 10,
        targetField: 'wasfatyCustomTarget',
      },
    } as any
    expect(getKpiTargetField('wasfaty', customRegistry)).toBe('wasfatyCustomTarget')
  })

  it('falls back to KPI_TARGET_FIELDS when no registry provided', () => {
    expect(getKpiTargetField('wasfaty')).toBe('wasfatyTarget')
    expect(getKpiTargetField('crossSelling')).toBe('crossSellTarget')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 16 — getKpiThresholds uses registry-first
// ════════════════════════════════════════════════════════════

describe('4E-4 test 16: getKpiThresholds is registry-first', () => {
  it('registry thresholds override KPI_THRESHOLDS when registry provided', () => {
    const customRegistry = {
      wasfaty: {
        key: 'wasfaty', aliasFor: undefined, isActive: true, isCore: true,
        lifecycleStage: 'production_evaluation', sortOrder: 10,
        thresholds: { healthy: 99, watch: 88, risk: 77, critical: 55 },
      },
    } as any
    const t = getKpiThresholds('wasfaty', customRegistry)
    expect(t.healthy).toBe(99)
    expect(t.watch).toBe(88)
  })

  it('falls back to KPI_THRESHOLDS when no registry', () => {
    const t = getKpiThresholds('wasfaty')
    expect(t.healthy).toBe(95)
    expect(t.watch).toBe(80)
    expect(t.risk).toBe(65)
    expect(t.critical).toBe(45)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 17 — getCoreEngineKeys fallback remains DEFAULT_KPI_KEYS
// ════════════════════════════════════════════════════════════

describe('4E-4 test 17: getCoreEngineKeys fallback remains DEFAULT_KPI_KEYS', () => {
  it('getCoreEngineKeys() with no registry returns DEFAULT_KPI_KEYS', () => {
    expect(getCoreEngineKeys()).toEqual(DEFAULT_KPI_KEYS)
  })

  it('getCoreEngineKeys({}) with empty registry returns DEFAULT_KPI_KEYS', () => {
    expect(getCoreEngineKeys({} as any)).toEqual(DEFAULT_KPI_KEYS)
  })

  it('getCoreEngineKeys(null) returns DEFAULT_KPI_KEYS', () => {
    expect(getCoreEngineKeys(null as any)).toEqual(DEFAULT_KPI_KEYS)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 18 — No fallback map removed in 4E-4
// ════════════════════════════════════════════════════════════

describe('4E-4 test 18: no fallback map removed', () => {
  it('KPI_ACTUAL_FIELDS, KPI_TARGET_FIELDS, KPI_THRESHOLDS, ACTIONS all present in engine', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).toContain('KPI_ACTUAL_FIELDS')
    expect(src).toContain('KPI_TARGET_FIELDS')
    expect(src).toContain('KPI_THRESHOLDS')
    expect(src).toMatch(/const ACTIONS/)
  })

  it('TARGET_FIELD_MAP present in kpiUiAdapter', async () => {
    const src = (await import('./kpiUiAdapter?raw') as any).default as string
    expect(src).toContain('TARGET_FIELD_MAP')
  })

  it('KPI_KEYS and KPI_META still exported from engine', async () => {
    const { KPI_KEYS, KPI_META } = await import('../kpiAnalyticsEngine')
    expect(Array.isArray(KPI_KEYS)).toBe(true)
    expect(typeof KPI_META).toBe('object')
    expect(KPI_META).toHaveProperty('crossSelling')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 19 — No UI changes
// ════════════════════════════════════════════════════════════

describe('4E-4 test 19: no UI changes', () => {
  it('kpiAnalyticsEngine has no React imports', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).not.toMatch(/from ['"]react['"]/)
    expect(src).not.toContain('useState')
    expect(src).not.toContain('useEffect')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 20 — No Firestore changes
// ════════════════════════════════════════════════════════════

describe('4E-4 test 20: no Firestore changes', () => {
  it('kpiAnalyticsEngine has no Firestore imports', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).not.toMatch(/from ['"]firebase/)
    expect(src).not.toContain('getFirestore')
    expect(src).not.toContain('collection(')
    expect(src).not.toContain('addDoc(')
  })
})

// ════════════════════════════════════════════════════════════
// TEST 21 — No Dynamic KPI regional wiring changes
// ════════════════════════════════════════════════════════════

describe('4E-4 test 21: no Dynamic KPI regional wiring changes', () => {
  it('kpiAnalyticsEngine does not import regionalIntelligence modules', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).not.toMatch(/from.*regionalIntelligence/)
    expect(src).not.toMatch(/import.*branchRollupEngine/)
    expect(src).not.toMatch(/import.*regionalRollupEngine/)
  })
})

// ════════════════════════════════════════════════════════════
// TEST 22 — dynamicKpiRegionalWiring.test.ts remains untouched
// ════════════════════════════════════════════════════════════

describe('4E-4 test 22: dynamicKpiRegionalWiring.test.ts untouched', () => {
  it('dynamicKpiRegionalWiring.test.ts still exists and has its content', async () => {
    const src = await import('../regionalIntelligence/dynamicKpiRegionalWiring.test.ts?raw').catch(() => ({ default: '' }))
    const code = (src as any).default ?? ''
    // The file should exist and contain test structure
    expect(code.length).toBeGreaterThan(0)
    expect(code).toContain('generateBranchRollup')
  })
})
