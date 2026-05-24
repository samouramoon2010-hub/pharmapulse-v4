// ============================================================
// Add KPI Bug Fix Tests
// Covers: custom KPI creation, sortOrder in payload,
//         targetInputEnabled, merge with defaults,
//         active non-core KPI, target form visibility.
// ============================================================

import { describe, it, expect } from 'vitest'

import {
  mergeRemoteRegistryWithDefaults,
  buildDocPayloadSync,
  docToKpiDefinition,
  PROTECTED_CORE_KEYS,
} from '../../services/kpiRegistryLogic'

import {
  DEFAULT_KPI_REGISTRY,
  DEFAULT_CORE_KPI_KEYS,
} from '../../engine/kpiRegistry'

import {
  getTargetInputConfigs,
  getKpiUiConfig,
  getActiveKpis,
} from '../../engine/kpiRegistry'

import type { KpiDefinition, KpiRegistry } from '../../engine/kpiRegistry'

// ── Helpers ───────────────────────────────────────────────────

function makeCustomKpi(key: string, overrides: Partial<KpiDefinition> = {}): KpiDefinition {
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

// ─────────────────────────────────────────────────────────────
// 1. ROOT CAUSE — sortOrder missing from payload
// ─────────────────────────────────────────────────────────────

describe('BUG FIX: sortOrder in Firestore payload', () => {
  it('buildDocPayloadSync includes sortOrder field', () => {
    const def = makeCustomKpi('myKpi', { sortOrder: 500 })
    const payload = buildDocPayloadSync(def, 'ACTIVE', 'admin')
    expect(payload).toHaveProperty('sortOrder')
    expect(payload.sortOrder).toBe(500)
  })

  it('sortOrder defaults to 999 when not set on KpiDefinition', () => {
    const def = makeCustomKpi('kpiNoDef')
    // sortOrder is 500 from makeCustomKpi — but test the fallback
    const defWithoutSort = { ...def, sortOrder: undefined as any }
    const payload = buildDocPayloadSync(defWithoutSort, 'ACTIVE', 'admin')
    expect(payload.sortOrder).toBe(999)
  })

  it('new custom KPI has sortOrder in payload so Firestore orderBy works', () => {
    const def = makeCustomKpi('freshKpi', { sortOrder: 300 })
    const payload = buildDocPayloadSync(def, 'ACTIVE', 'admin')
    expect(typeof payload.sortOrder).toBe('number')
    expect(payload.sortOrder).toBe(300)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. CREATING A CUSTOM KPI
// ─────────────────────────────────────────────────────────────

describe('creating a custom KPI', () => {
  it('custom KPI definition is valid', () => {
    const def = makeCustomKpi('myNewKpi')
    expect(def.key).toBe('myNewKpi')
    expect(def.isCore).toBe(false)
    expect(def.isActive).toBe(true)
    expect(def.weight).toBe(0)
  })

  it('custom KPI key must be camelCase', () => {
    const validKeys = ['myKpi', 'salesBonus', 'kpi123', 'A']
    validKeys.forEach((k) => {
      expect(/^[a-zA-Z][a-zA-Z0-9]*$/.test(k)).toBe(true)
    })
    const invalidKeys = ['my-kpi', '123kpi', 'kpi space', '']
    invalidKeys.forEach((k) => {
      expect(/^[a-zA-Z][a-zA-Z0-9]*$/.test(k)).toBe(false)
    })
  })

  it('custom KPI is not in PROTECTED_CORE_KEYS', () => {
    expect(PROTECTED_CORE_KEYS.has('myNewKpi')).toBe(false)
    expect(PROTECTED_CORE_KEYS.has('customSales')).toBe(false)
  })

  it('saving custom KPI payload includes all required Firestore create fields', () => {
    const def = makeCustomKpi('newProd', { label: 'New Product', sortOrder: 200 })
    const payload = buildDocPayloadSync(def, 'ACTIVE', 'admin-uid')
    // Required by Firestore create rule: key, label, isActive, isCore
    expect(payload.key).toBe('newProd')
    expect(payload.label).toBe('New Product')
    expect(payload.isActive).toBe(true)
    expect(payload.isCore).toBe(false)
    expect(payload.uiStatus).toBe('ACTIVE')
    expect(payload.sortOrder).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. CUSTOM KPI APPEARS AFTER mergeRemoteRegistryWithDefaults
// ─────────────────────────────────────────────────────────────

describe('custom KPI appears in merged registry', () => {
  it('custom KPI added to remote appears in merged registry', () => {
    const custom = makeCustomKpi('customKpi1')
    const remote: KpiRegistry = { customKpi1: custom }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    expect(merged.customKpi1).toBeDefined()
    expect(merged.customKpi1.key).toBe('customKpi1')
  })

  it('default KPIs are still present after adding custom KPI', () => {
    const remote: KpiRegistry = { myCustom: makeCustomKpi('myCustom') }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    DEFAULT_CORE_KPI_KEYS.forEach((key) => {
      expect(merged).toHaveProperty(key)
    })
  })

  it('getActiveKpis includes custom KPI when isActive=true', () => {
    const remote: KpiRegistry = { myActiveKpi: makeCustomKpi('myActiveKpi', { isActive: true }) }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const active = getActiveKpis(merged)
    expect(active.find((k) => k.key === 'myActiveKpi')).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 4. CUSTOM KPI CAN BE ACTIVE BUT NON-CORE
// ─────────────────────────────────────────────────────────────

describe('custom KPI active but non-core', () => {
  it('isActive=true, isCore=false is a valid state', () => {
    const def = makeCustomKpi('nonCoreActive', { isActive: true, isCore: false })
    expect(def.isActive).toBe(true)
    expect(def.isCore).toBe(false)
  })

  it('non-core active KPI does NOT appear in target input by default', () => {
    const remote: KpiRegistry = {
      myNonCore: makeCustomKpi('myNonCore', { isActive: true, isCore: false }),
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    expect(configs.find((c) => c.key === 'myNonCore')).toBeUndefined()
  })

  it('non-core active KPI is findable via getKpiUiConfig', () => {
    const remote: KpiRegistry = { myNonCore: makeCustomKpi('myNonCore') }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const cfg = getKpiUiConfig('myNonCore', merged)
    expect(cfg).toBeDefined()
    expect(cfg?.isVisibleForTargetInput).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 5. CUSTOM KPI CAN BE VISIBLE IN TARGET INPUT
// ─────────────────────────────────────────────────────────────

describe('BUG FIX: custom KPI visible in target input via targetInputEnabled', () => {
  it('custom non-core KPI with targetInputEnabled=true appears in target input', () => {
    const remote: KpiRegistry = {
      myTargetKpi: makeCustomKpi('myTargetKpi', {
        isActive: true,
        isCore: false,
        visibility: {
          dashboardEnabled: true, teamEnabled: false,
          executiveEnabled: false, regionalEnabled: false,
          targetInputEnabled: true,   // ← KEY FIX
        },
      }),
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    expect(configs.find((c) => c.key === 'myTargetKpi')).toBeDefined()
  })

  it('targetInputEnabled=false (default) excludes custom KPI from target input', () => {
    const remote: KpiRegistry = {
      noTargetKpi: makeCustomKpi('noTargetKpi', {
        visibility: {
          dashboardEnabled: true, teamEnabled: false,
          executiveEnabled: false, regionalEnabled: false,
          targetInputEnabled: false,
        },
      }),
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    expect(configs.find((c) => c.key === 'noTargetKpi')).toBeUndefined()
  })

  it('targetInputEnabled is persisted in Firestore payload', () => {
    const def = makeCustomKpi('kpiWithTarget', {
      visibility: {
        dashboardEnabled: true, teamEnabled: false,
        executiveEnabled: false, regionalEnabled: false,
        targetInputEnabled: true,
      },
    })
    const payload = buildDocPayloadSync(def, 'ACTIVE', 'admin')
    expect(payload.targetInputEnabled).toBe(true)
  })

  it('targetInputEnabled=false is persisted in Firestore payload', () => {
    const def = makeCustomKpi('kpiNoTarget')  // targetInputEnabled defaults to false
    const payload = buildDocPayloadSync(def, 'ACTIVE', 'admin')
    expect(payload.targetInputEnabled).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 6. HIDDEN CUSTOM KPI EXCLUDED FROM TARGET INPUT
// ─────────────────────────────────────────────────────────────

describe('hidden custom KPI excluded from target input', () => {
  it('ARCHIVED custom KPI does not appear in target input', () => {
    const remote: KpiRegistry = {
      archivedKpi: makeCustomKpi('archivedKpi', {
        isActive: false,
        visibility: { dashboardEnabled:true, teamEnabled:false, executiveEnabled:false, regionalEnabled:false, targetInputEnabled:true },
      }),
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    expect(configs.find((c) => c.key === 'archivedKpi')).toBeUndefined()
  })

  it('HIDDEN_FROM_INPUT status: isActive=true but targetInputEnabled=false → excluded', () => {
    const remote: KpiRegistry = {
      hiddenKpi: makeCustomKpi('hiddenKpi', {
        isActive: true,
        visibility: { dashboardEnabled:true, teamEnabled:false, executiveEnabled:false, regionalEnabled:false, targetInputEnabled:false },
      }),
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    expect(configs.find((c) => c.key === 'hiddenKpi')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 7. PROTECTED CORE KEYS NOT BLOCKED FOR CUSTOM KPI
// ─────────────────────────────────────────────────────────────

describe('protected core checks do not block custom KPI creation', () => {
  it('custom KPI key not in PROTECTED_CORE_KEYS passes create validation', () => {
    const customKey = 'brandNewProductSales'
    expect(PROTECTED_CORE_KEYS.has(customKey)).toBe(false)
  })

  it('key format check passes for valid camelCase custom keys', () => {
    const keys = ['newKpi', 'brandSales', 'customHealthMetric', 'z123']
    keys.forEach((k) => {
      expect(/^[a-zA-Z][a-zA-Z0-9]*$/.test(k)).toBe(true)
    })
  })

  it('PROTECTED_CORE_KEYS only blocks the 5 engine-active core KPIs', () => {
    expect(PROTECTED_CORE_KEYS.size).toBe(5)
    expect([...PROTECTED_CORE_KEYS]).toEqual(
      expect.arrayContaining(['wasfaty','omnihealth','wellnessCard','basket','crossSelling'])
    )
  })
})

// ─────────────────────────────────────────────────────────────
// 8. docToKpiDefinition reads targetInputEnabled from Firestore doc
// ─────────────────────────────────────────────────────────────

describe('docToKpiDefinition reads targetInputEnabled from Firestore', () => {
  it('reads targetInputEnabled=true from Firestore doc', () => {
    const firestoreDoc = {
      key: 'myKpi', label: 'My KPI', shortLabel: 'MK', labelAr: '',
      category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
      direction: 'higher_is_better', targetType: 'absolute',
      weight: 0, isActive: true, isCore: false, uiStatus: 'ACTIVE',
      thresholdHealthy: 90, thresholdWatch: 75, thresholdRisk: 55, thresholdCritical: 35,
      dashboardEnabled: true, teamEnabled: false, executiveEnabled: false,
      regionalEnabled: false, targetInputEnabled: true,
      sortOrder: 500,
    }
    const result = docToKpiDefinition(firestoreDoc)
    expect(result).not.toBeNull()
    expect(result?.def.visibility.targetInputEnabled).toBe(true)
  })

  it('defaults targetInputEnabled to false when not in Firestore doc', () => {
    const firestoreDoc = {
      key: 'oldKpi', label: 'Old KPI', shortLabel: 'OK', labelAr: '',
      category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
      direction: 'higher_is_better', targetType: 'absolute',
      weight: 0, isActive: true, isCore: false, uiStatus: 'ACTIVE',
      thresholdHealthy: 90, thresholdWatch: 75, thresholdRisk: 55, thresholdCritical: 35,
      dashboardEnabled: true, teamEnabled: false, executiveEnabled: false,
      regionalEnabled: false,
      // targetInputEnabled NOT present (old document)
    }
    const result = docToKpiDefinition(firestoreDoc)
    expect(result?.def.visibility.targetInputEnabled).toBe(false)
  })

  it('custom KPI with targetInputEnabled from Firestore appears in target input', () => {
    const firestoreDoc = {
      key: 'customTarget', label: 'Custom Target KPI', shortLabel: 'CT', labelAr: '',
      category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
      direction: 'higher_is_better', targetType: 'absolute',
      weight: 0, isActive: true, isCore: false, uiStatus: 'ACTIVE',
      thresholdHealthy: 90, thresholdWatch: 75, thresholdRisk: 55, thresholdCritical: 35,
      dashboardEnabled: true, teamEnabled: false, executiveEnabled: false,
      regionalEnabled: false, targetInputEnabled: true,
      sortOrder: 300,
    }
    const result = docToKpiDefinition(firestoreDoc)
    expect(result).not.toBeNull()

    const remote: KpiRegistry = { customTarget: result!.def }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    expect(configs.find((c) => c.key === 'customTarget')).toBeDefined()
  })
})
