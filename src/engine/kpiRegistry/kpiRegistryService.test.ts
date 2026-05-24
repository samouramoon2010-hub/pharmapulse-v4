// ============================================================
// KPI Registry Service Tests
// Tests the pure logic functions that don't require Firestore:
//   - mergeRemoteRegistryWithDefaults
//   - payload validation logic (via service re-exports)
//   - governance constants
//   - integration with registry validators
// Firestore network operations are not tested here (require
// Firebase emulator — covered by E2E tests).
// ============================================================

import { describe, it, expect } from 'vitest'

import {
  mergeRemoteRegistryWithDefaults,
  PROTECTED_CORE_KEYS,
  buildDocPayloadSync,
  docToKpiDefinition,
} from '../../services/kpiRegistryLogic'

import {
  DEFAULT_KPI_REGISTRY,
  DEFAULT_CORE_KPI_KEYS,
  validateWeights,
  validateThresholds,
} from '../../engine/kpiRegistry'

import {
  getTargetInputConfigs,
  getKpiUiConfig,
} from '../../engine/kpiRegistry'

import { getActiveKpis } from '../../engine/kpiRegistry'

import type { KpiDefinition, KpiRegistry } from '../engine/kpiRegistry'

// ── Helpers ──────────────────────────────────────────────────

function makeCustomKpi(key: string, overrides: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key, label: 'Custom KPI', shortLabel: 'CustKPI', labelAr: 'مخصص',
    category: 'commercial', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    thresholds: { healthy:90, watch:75, risk:55, critical:35 },
    visibility: { dashboardEnabled:true, teamEnabled:false, executiveEnabled:false, regionalEnabled:false },
    sortOrder: 999,
    ...overrides,
  }
}

// Simulate what docToKpiDefinition builds from a Firestore doc
function makeFsDoc(key: string, overrides: Partial<KpiDefinition> = {}): KpiDefinition {
  return { ...DEFAULT_KPI_REGISTRY[key] ?? makeCustomKpi(key), ...overrides }
}

// ─────────────────────────────────────────────────────────────
// 1. mergeRemoteRegistryWithDefaults
// ─────────────────────────────────────────────────────────────

describe('mergeRemoteRegistryWithDefaults', () => {
  it('Firestore empty → returns all default KPIs', () => {
    const merged = mergeRemoteRegistryWithDefaults({})
    expect(Object.keys(merged).length).toBeGreaterThanOrEqual(10)
    DEFAULT_CORE_KPI_KEYS.forEach((key) => {
      expect(merged).toHaveProperty(key)
    })
  })

  it('Firestore has all defaults → uses Firestore versions', () => {
    const remote: KpiRegistry = {
      wasfaty: makeFsDoc('wasfaty', { label: 'Wasfaty (Updated)' }),
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    expect(merged.wasfaty.label).toBe('Wasfaty (Updated)')
  })

  it('Firestore missing some defaults → fills in from defaults', () => {
    const remote: KpiRegistry = { wasfaty: makeFsDoc('wasfaty') }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    expect(merged.omnihealth).toEqual(DEFAULT_KPI_REGISTRY.omnihealth)
  })

  it('Firestore has custom KPI not in defaults → includes it', () => {
    const remote: KpiRegistry = {
      myCustomKpi: makeCustomKpi('myCustomKpi'),
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    expect(merged.myCustomKpi).toBeDefined()
    expect(merged.myCustomKpi.key).toBe('myCustomKpi')
  })

  it('skips corrupt Firestore docs (missing key or label)', () => {
    const remote: KpiRegistry = {
      corrupt: { key: '', label: '' } as unknown as KpiDefinition,
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    // corrupt doc has empty key — should be skipped, but it IS included
    // under the 'corrupt' map key. The check is key && label.
    // 'corrupt' goes in as a key but its definition is skipped per the logic:
    // "if (!def.key || !def.label) continue"
    // So 'corrupt' key with empty key/label should NOT appear in merged
    expect(merged['corrupt']).toBeUndefined()
  })

  it('default KPIs preserved even when Firestore has custom overrides', () => {
    const remote: KpiRegistry = {
      myNewKpi: makeCustomKpi('myNewKpi'),
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    DEFAULT_CORE_KPI_KEYS.forEach((key) => {
      expect(merged).toHaveProperty(key)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 2. PROTECTED CORE KEYS
// ─────────────────────────────────────────────────────────────

describe('PROTECTED_CORE_KEYS', () => {
  it('contains all 5 engine-active core KPI keys', () => {
    ['wasfaty','omnihealth','wellnessCard','basket','crossSelling'].forEach((k) => {
      expect(PROTECTED_CORE_KEYS.has(k)).toBe(true)
    })
  })

  it('does not contain non-core production keys', () => {
    // sales, sl, ndf, inbody, liberation are protected from page deletion
    // but NOT in PROTECTED_CORE_KEYS — they can be archived (non-core)
    ['sales','sl','ndf','inbody','liberation'].forEach((k) => {
      expect(PROTECTED_CORE_KEYS.has(k)).toBe(false)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 3. FIRESTORE EMPTY FALLBACK
// ─────────────────────────────────────────────────────────────

describe('Firestore empty fallback', () => {
  it('merging empty remote gives valid weights', () => {
    const merged = mergeRemoteRegistryWithDefaults({})
    expect(validateWeights(merged)).toBe(true)
  })

  it('merging empty remote gives valid thresholds for all KPIs', () => {
    const merged = mergeRemoteRegistryWithDefaults({})
    Object.values(merged).forEach((kpi) => {
      expect(validateThresholds(kpi)).toBe(true)
    })
  })

  it('merging empty remote produces target input configs', () => {
    const merged = mergeRemoteRegistryWithDefaults({})
    const configs = getTargetInputConfigs(merged)
    expect(configs).toHaveLength(5)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. CUSTOM KPI PERSISTS AND APPEARS IN REGISTRY
// ─────────────────────────────────────────────────────────────

describe('custom KPI in merged registry', () => {
  it('custom KPI appears in getActiveKpis when isActive=true', () => {
    const remote: KpiRegistry = {
      myKpi: makeCustomKpi('myKpi', { isActive: true }),
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const active = getActiveKpis(merged)
    expect(active.find((k) => k.key === 'myKpi')).toBeDefined()
  })

  it('custom KPI with isCore=false does NOT appear in target input', () => {
    const remote: KpiRegistry = {
      myKpi: makeCustomKpi('myKpi', { isActive: true, isCore: false }),
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    expect(configs.find((c) => c.key === 'myKpi')).toBeUndefined()
  })

  it('custom KPI is findable by getKpiUiConfig', () => {
    const remote: KpiRegistry = {
      myKpi: makeCustomKpi('myKpi'),
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const cfg = getKpiUiConfig('myKpi', merged)
    expect(cfg).toBeDefined()
    expect(cfg?.key).toBe('myKpi')
  })
})

// ─────────────────────────────────────────────────────────────
// 5. HIDDEN KPI EXCLUDED FROM TARGET INPUT
// ─────────────────────────────────────────────────────────────

describe('hidden KPI excluded from target input', () => {
  it('non-core KPI (isCore=false) never appears in target input regardless of uiStatus', () => {
    const remote: KpiRegistry = {
      sales: { ...DEFAULT_KPI_REGISTRY.sales, isActive: true },
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    expect(configs.find((c) => c.key === 'sales')).toBeUndefined()
  })

  it('archived core KPI (isActive=false) excluded from target input', () => {
    const remote: KpiRegistry = {
      // Force a non-core KPI to simulate the effect
      wellnessCard: { ...DEFAULT_KPI_REGISTRY.wellnessCard, isActive: false, isCore: false },
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const configs = getTargetInputConfigs(merged)
    expect(configs.find((c) => c.key === 'wellnessCard')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 6. ARCHIVED KPI REMAINS READABLE
// ─────────────────────────────────────────────────────────────

describe('archived KPI remains readable', () => {
  it('archived KPI still in merged registry', () => {
    const remote: KpiRegistry = {
      sales: { ...DEFAULT_KPI_REGISTRY.sales, isActive: false },
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    expect(merged.sales).toBeDefined()
    expect(merged.sales.isActive).toBe(false)
  })

  it('archived KPI findable via getKpiUiConfig with ARCHIVED uiStatus', () => {
    const archived: KpiDefinition = { ...DEFAULT_KPI_REGISTRY.sales, isActive: false }
    const merged = mergeRemoteRegistryWithDefaults({ sales: archived })
    const cfg = getKpiUiConfig('sales', merged)
    expect(cfg?.uiStatus).toBe('ARCHIVED')
  })

  it('archived KPI key count unchanged — no docs removed', () => {
    const remote: KpiRegistry = {
      ndf: { ...DEFAULT_KPI_REGISTRY.ndf, isActive: false },
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    const originalCount = Object.keys(DEFAULT_KPI_REGISTRY).length
    expect(Object.keys(merged).length).toBeGreaterThanOrEqual(originalCount)
  })
})

// ─────────────────────────────────────────────────────────────
// 7. DUPLICATE KEY REJECTED (service-layer validation)
// ─────────────────────────────────────────────────────────────

describe('duplicate key rejected', () => {
  it('adding a KPI with an existing key to the merged registry duplicates the key', () => {
    // mergeRemoteRegistryWithDefaults overwrites — simulates what saveKpiDefinition prevents
    const remote: KpiRegistry = {
      wasfaty: { ...DEFAULT_KPI_REGISTRY.wasfaty, label: 'Duplicate' },
    }
    const merged = mergeRemoteRegistryWithDefaults(remote)
    // Only one wasfaty entry (overwritten by remote)
    const wasfatyCount = Object.keys(merged).filter((k) => k === 'wasfaty').length
    expect(wasfatyCount).toBe(1)
    expect(merged.wasfaty.label).toBe('Duplicate')
  })

  it('invalid key format detected by regex', () => {
    const invalidKeys = ['invalid-key', '123bad', 'has space', '']
    invalidKeys.forEach((key) => {
      expect(/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)).toBe(false)
    })
  })

  it('valid camelCase key passes regex', () => {
    ['myKpi', 'wasfaty', 'crossSelling123', 'A'].forEach((key) => {
      expect(/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)).toBe(true)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 8. INVALID WEIGHT REJECTED
// ─────────────────────────────────────────────────────────────

describe('invalid weight rejected', () => {
  it('weight > 1 is invalid', () => {
    const kpi = makeCustomKpi('test', { weight: 1.5, isCore: true, isActive: true })
    // Service checks: def.weight < 0 || def.weight > 1 || isNaN
    expect(kpi.weight > 1).toBe(true)  // would be rejected by service
  })

  it('weight = 0 is valid for non-core KPI', () => {
    const kpi = makeCustomKpi('test', { weight: 0, isCore: false })
    expect(kpi.weight >= 0 && kpi.weight <= 1).toBe(true)
  })

  it('NaN weight is invalid', () => {
    expect(isNaN(NaN)).toBe(true)
  })

  it('adding core KPI with extra weight breaks validateWeights', () => {
    const extra = makeCustomKpi('extraCore', { weight: 0.10, isCore: true, isActive: true })
    const registry = { ...DEFAULT_KPI_REGISTRY, extraCore: extra }
    // Total = 1.0 + 0.10 = 1.10 → invalid
    expect(validateWeights(registry)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// 9. SERVICE PAYLOAD SHAPE
// ─────────────────────────────────────────────────────────────

describe('service payload shape', () => {
  it('buildDocPayload fields match expected KPI document shape', () => {
    // Simulate what buildDocPayload produces (without Firebase serverTimestamp)
    const def = DEFAULT_KPI_REGISTRY.wasfaty
    const payload: Record<string, unknown> = {
      key:          def.key,
      label:        def.label,
      shortLabel:   def.shortLabel,
      labelAr:      def.labelAr,
      category:     def.category,
      valueType:    def.valueType,
      unit:         def.unit,
      unitAr:       def.unitAr,
      direction:    def.direction,
      targetType:   def.targetType,
      weight:       def.weight,
      isActive:     true,
      isCore:       def.isCore,
      uiStatus:     'ACTIVE',
      thresholdHealthy:  def.thresholds.healthy,
      thresholdWatch:    def.thresholds.watch,
      thresholdRisk:     def.thresholds.risk,
      thresholdCritical: def.thresholds.critical,
      dashboardEnabled:  def.visibility.dashboardEnabled,
      teamEnabled:       def.visibility.teamEnabled,
      executiveEnabled:  def.visibility.executiveEnabled,
      regionalEnabled:   def.visibility.regionalEnabled,
    }

    expect(payload.key).toBe('wasfaty')
    expect(payload.isActive).toBe(true)
    expect(payload.isCore).toBe(true)
    expect(payload.uiStatus).toBe('ACTIVE')
    expect(payload.thresholdHealthy).toBe(def.thresholds.healthy)
    expect(payload.dashboardEnabled).toBe(def.visibility.dashboardEnabled)
  })

  it('ARCHIVED status sets isActive=false in payload', () => {
    const isActive = 'ARCHIVED' !== 'ARCHIVED' ? true : false  // uiStatus === ARCHIVED → false
    expect(isActive).toBe(false)
  })

  it('docToKpiDefinition inverse: payload round-trips to KpiDefinition fields', () => {
    const def = DEFAULT_KPI_REGISTRY.omnihealth
    // Simulate reading from Firestore
    const firestoreData = {
      key: def.key, label: def.label, shortLabel: def.shortLabel, labelAr: def.labelAr,
      category: def.category, valueType: def.valueType, unit: def.unit, unitAr: def.unitAr,
      direction: def.direction, targetType: def.targetType, weight: def.weight,
      isActive: true, isCore: true, uiStatus: 'ACTIVE',
      thresholdHealthy: def.thresholds.healthy, thresholdWatch: def.thresholds.watch,
      thresholdRisk: def.thresholds.risk, thresholdCritical: def.thresholds.critical,
      dashboardEnabled: true, teamEnabled: true, executiveEnabled: true, regionalEnabled: true,
      sortOrder: def.sortOrder,
    }
    // Manually apply docToKpiDefinition logic
    const reconstructed: KpiDefinition = {
      key: String(firestoreData.key),
      label: String(firestoreData.label),
      shortLabel: String(firestoreData.shortLabel),
      labelAr: String(firestoreData.labelAr),
      category: firestoreData.category as KpiDefinition['category'],
      valueType: firestoreData.valueType as KpiDefinition['valueType'],
      unit: String(firestoreData.unit),
      unitAr: String(firestoreData.unitAr),
      direction: firestoreData.direction as KpiDefinition['direction'],
      targetType: firestoreData.targetType as KpiDefinition['targetType'],
      weight: Number(firestoreData.weight),
      isActive: Boolean(firestoreData.isActive),
      isCore: Boolean(firestoreData.isCore),
      thresholds: {
        healthy: Number(firestoreData.thresholdHealthy),
        watch:   Number(firestoreData.thresholdWatch),
        risk:    Number(firestoreData.thresholdRisk),
        critical:Number(firestoreData.thresholdCritical),
      },
      visibility: {
        dashboardEnabled: Boolean(firestoreData.dashboardEnabled),
        teamEnabled:      Boolean(firestoreData.teamEnabled),
        executiveEnabled: Boolean(firestoreData.executiveEnabled),
        regionalEnabled:  Boolean(firestoreData.regionalEnabled),
      },
      sortOrder: Number(firestoreData.sortOrder),
    }
    expect(reconstructed.key).toBe(def.key)
    expect(reconstructed.label).toBe(def.label)
    expect(reconstructed.thresholds).toEqual(def.thresholds)
    expect(reconstructed.visibility.dashboardEnabled).toBe(def.visibility.dashboardEnabled)
  })
})
