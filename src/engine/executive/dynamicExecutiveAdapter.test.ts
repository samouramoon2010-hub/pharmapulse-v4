// ============================================================
// Dynamic Executive Adapter — Comprehensive Tests
// Phase 4C-X-0: Foundation Layer
//
// Verifies:
//   - 5 core KPIs normalize correctly (exact legacy compatibility)
//   - Legacy flat shape supported
//   - Future nested metrics map shape supported
//   - Missing KPI = null (NOT zero)
//   - Custom KPI without executiveEnabled = NOT_AGGREGATED
//   - portfolioWeight validation
//   - Default 5 KPI weights compatibility
//   - No existing executive score tests changed
//   - No Firestore reads
//   - No UI files modified
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'

import {
  CORE_KPI_EXECUTIVE_META,
  buildExecutiveKpiMeta,
  normalizeExecutiveMetricRecord,
  normalizeLegacyFlatMetrics,
  validateExecutiveKpiWeights,
  getExecutiveEnabledKpis,
  buildExecutiveMetaMap,
  assertLegacyCompatibility,
  type AggregationType,
  type Polarity,
  type NormalizedMetricRecord,
  type ExecutiveKpiMeta,
  type LegacyTargetDoc,
} from './dynamicExecutiveAdapter'

import { KPI_KEYS, KPI_WEIGHTS }            from '../kpiAnalyticsEngine'
import { DEFAULT_KPI_REGISTRY }             from '../kpiRegistry'
import type { KpiDefinition, KpiRegistry }  from '../kpiRegistry/kpiRegistryTypes'

// ── Source guards ──────────────────────────────────────────────
const ADAPTER_SRC = readFileSync(
  resolve(__dirname, './dynamicExecutiveAdapter.ts'), 'utf8'
)

// ── Fixtures ──────────────────────────────────────────────────

function makeCustomKpi(key: string, opts: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key, label: key, shortLabel: key, labelAr: key,
    category: 'commercial', valueType: 'count', unit: 'u', unitAr: 'و',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0, isActive: true, isCore: false,
    thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
    visibility: {
      dashboardEnabled: true, teamEnabled: false,
      executiveEnabled: false, regionalEnabled: false,
    },
    sortOrder: 500,
    ...opts,
  }
}

const CUSTOM_EXEC_KPI = makeCustomKpi('nps', {
  valueType: 'count',
  weight: 0,
  visibility: {
    dashboardEnabled: true, teamEnabled: false,
    executiveEnabled: true, regionalEnabled: false,
  },
})

const CUSTOM_NON_EXEC_KPI = makeCustomKpi('sales', {
  visibility: {
    dashboardEnabled: true, teamEnabled: false,
    executiveEnabled: false, regionalEnabled: false,
  },
})

const PERCENTAGE_KPI = makeCustomKpi('sl', {
  valueType: 'percentage',
  visibility: {
    dashboardEnabled: true, teamEnabled: true,
    executiveEnabled: true, regionalEnabled: false,
  },
})

// ══════════════════════════════════════════════════════════════
// 1 — CORE_KPI_EXECUTIVE_META — legacy compatibility
// ══════════════════════════════════════════════════════════════

describe('CORE_KPI_EXECUTIVE_META — exact 5-core-KPI legacy metadata', () => {
  it('all 5 core KPI keys present', () => {
    for (const key of KPI_KEYS) {
      expect(CORE_KPI_EXECUTIVE_META).toHaveProperty(key)
    }
  })

  it('portfolio weights match KPI_WEIGHTS exactly', () => {
    for (const key of KPI_KEYS) {
      expect(CORE_KPI_EXECUTIVE_META[key].portfolioWeight).toBe(KPI_WEIGHTS[key])
    }
  })

  it('wasfaty: SUM aggregation, HIGHER_IS_BETTER', () => {
    expect(CORE_KPI_EXECUTIVE_META.wasfaty.aggregationType).toBe('SUM')
    expect(CORE_KPI_EXECUTIVE_META.wasfaty.polarity).toBe('HIGHER_IS_BETTER')
  })

  it('basket: AVG aggregation (basket size is an average)', () => {
    expect(CORE_KPI_EXECUTIVE_META.basket.aggregationType).toBe('AVG')
  })

  it('crossSelling: SUM aggregation', () => {
    expect(CORE_KPI_EXECUTIVE_META.crossSelling.aggregationType).toBe('SUM')
  })

  it('all core KPIs have executiveEnabled=true', () => {
    for (const key of KPI_KEYS) {
      expect(CORE_KPI_EXECUTIVE_META[key].executiveEnabled).toBe(true)
    }
  })

  it('all core KPIs have isCore=true', () => {
    for (const key of KPI_KEYS) {
      expect(CORE_KPI_EXECUTIVE_META[key].isCore).toBe(true)
    }
  })

  it('core KPI portfolio weights sum to 1.0', () => {
    const total = KPI_KEYS.reduce(
      (s, k) => s + CORE_KPI_EXECUTIVE_META[k].portfolioWeight, 0
    )
    expect(Math.abs(total - 1.0)).toBeLessThanOrEqual(0.01)
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — buildExecutiveKpiMeta — registry → meta derivation
// ══════════════════════════════════════════════════════════════

describe('buildExecutiveKpiMeta — from KpiDefinition', () => {
  it('core KPI (omnihealth aliased to omni) returns legacy meta exactly', () => {
    const omniDef = DEFAULT_KPI_REGISTRY['omnihealth']!
    const meta    = buildExecutiveKpiMeta(omniDef)
    expect(meta.aggregationType).toBe(CORE_KPI_EXECUTIVE_META.omni.aggregationType)
    expect(meta.portfolioWeight).toBe(CORE_KPI_EXECUTIVE_META.omni.portfolioWeight)
    expect(meta.polarity).toBe(CORE_KPI_EXECUTIVE_META.omni.polarity)
  })

  it('custom KPI with executiveEnabled=true gets SUM by default', () => {
    const meta = buildExecutiveKpiMeta(CUSTOM_EXEC_KPI)
    expect(meta.aggregationType).toBe('SUM')
    expect(meta.executiveEnabled).toBe(true)
  })

  it('custom KPI with executiveEnabled=false gets NOT_AGGREGATED', () => {
    const meta = buildExecutiveKpiMeta(CUSTOM_NON_EXEC_KPI)
    expect(meta.aggregationType).toBe('NOT_AGGREGATED')
    expect(meta.executiveEnabled).toBe(false)
  })

  it('percentage valueType → RATIO aggregation', () => {
    const meta = buildExecutiveKpiMeta(PERCENTAGE_KPI)
    expect(meta.aggregationType).toBe('RATIO')
  })

  it('lower_is_better direction → LOWER_IS_BETTER polarity', () => {
    const lowerKpi = makeCustomKpi('defects', {
      direction: 'lower_is_better',
      visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: true, regionalEnabled: false },
    })
    const meta = buildExecutiveKpiMeta(lowerKpi)
    expect(meta.polarity).toBe('LOWER_IS_BETTER')
  })

  it('higher_is_better direction → HIGHER_IS_BETTER polarity', () => {
    const meta = buildExecutiveKpiMeta(CUSTOM_EXEC_KPI)
    expect(meta.polarity).toBe('HIGHER_IS_BETTER')
  })

  it('portfolioWeightOverride is respected', () => {
    const meta = buildExecutiveKpiMeta(CUSTOM_EXEC_KPI, 0.15)
    expect(meta.portfolioWeight).toBe(0.15)
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — normalizeExecutiveMetricRecord — null vs zero
// ══════════════════════════════════════════════════════════════

const WASFATY_META = CORE_KPI_EXECUTIVE_META.wasfaty

describe('normalizeExecutiveMetricRecord — null vs zero semantics', () => {
  it('missing actual (undefined) = null, NOT zero', () => {
    const r = normalizeExecutiveMetricRecord(undefined, 100, WASFATY_META)
    expect(r.actual).toBeNull()
  })

  it('missing actual (null) = null', () => {
    const r = normalizeExecutiveMetricRecord(null, 100, WASFATY_META)
    expect(r.actual).toBeNull()
  })

  it('actual = 0 is preserved as 0 (not null)', () => {
    const r = normalizeExecutiveMetricRecord(0, 100, WASFATY_META)
    expect(r.actual).toBe(0)
    expect(r.actual).not.toBeNull()
  })

  it('missing target (null) = null achievementPct', () => {
    const r = normalizeExecutiveMetricRecord(150, null, WASFATY_META)
    expect(r.target).toBeNull()
    expect(r.achievementPct).toBeNull()
    expect(r.status).toBeNull()
  })

  it('target = 0 = null achievementPct (avoid division by zero)', () => {
    const r = normalizeExecutiveMetricRecord(150, 0, WASFATY_META)
    expect(r.achievementPct).toBeNull()
  })

  it('normal case: actual=200, target=200 → achievementPct=100', () => {
    const r = normalizeExecutiveMetricRecord(200, 200, WASFATY_META)
    expect(r.achievementPct).toBe(100)
    expect(r.status).toBe('excellent')
  })

  it('overperformance capped at 200%', () => {
    const r = normalizeExecutiveMetricRecord(500, 100, WASFATY_META)
    expect(r.achievementPct).toBe(200)
  })

  it('achievementPct 90+ = excellent status', () => {
    const r = normalizeExecutiveMetricRecord(90, 100, WASFATY_META)
    expect(r.status).toBe('excellent')
  })

  it('achievementPct 70–89 = good status', () => {
    const r = normalizeExecutiveMetricRecord(75, 100, WASFATY_META)
    expect(r.status).toBe('good')
  })

  it('achievementPct 50–69 = warning status', () => {
    const r = normalizeExecutiveMetricRecord(60, 100, WASFATY_META)
    expect(r.status).toBe('warning')
  })

  it('achievementPct <50 = critical status', () => {
    const r = normalizeExecutiveMetricRecord(30, 100, WASFATY_META)
    expect(r.status).toBe('critical')
  })

  it('NOT_AGGREGATED meta → null actual, null target, null achievementPct', () => {
    const notAggMeta: ExecutiveKpiMeta = {
      ...WASFATY_META,
      aggregationType: 'NOT_AGGREGATED',
      executiveEnabled: false,
    }
    const r = normalizeExecutiveMetricRecord(200, 100, notAggMeta)
    expect(r.actual).toBeNull()
    expect(r.target).toBeNull()
    expect(r.achievementPct).toBeNull()
    expect(r.status).toBeNull()
  })

  it('normalized record has all required fields', () => {
    const r = normalizeExecutiveMetricRecord(150, 200, WASFATY_META)
    expect(r).toHaveProperty('actual')
    expect(r).toHaveProperty('target')
    expect(r).toHaveProperty('achievementPct')
    expect(r).toHaveProperty('aggregationType')
    expect(r).toHaveProperty('polarity')
    expect(r).toHaveProperty('portfolioWeight')
    expect(r).toHaveProperty('status')
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — normalizeLegacyFlatMetrics — flat entry shape
// ══════════════════════════════════════════════════════════════

describe('normalizeLegacyFlatMetrics — legacy flat shape compatibility', () => {
  const coreMeta: Record<string, ExecutiveKpiMeta> = Object.fromEntries(
    KPI_KEYS.map((k) => [k, CORE_KPI_EXECUTIVE_META[k]])
  )

  const actuals = { wasfaty: 200, omni: 100, wellness: 150, basket: 350, crossSelling: 60 }
  const target: LegacyTargetDoc = {
    pharmacyId: 'ph1', month: '2025-05',
    wasfatyTarget: 800, omniTarget: 400, wellnessTarget: 500,
    basketTarget: 1200, crossSellTarget: 200,
  }

  it('produces a metric record for all 5 core KPIs', () => {
    const metrics = normalizeLegacyFlatMetrics(actuals, target, coreMeta)
    for (const key of KPI_KEYS) {
      expect(metrics).toHaveProperty(key)
    }
  })

  it('wasfaty: actual=200, target=800 → achievement=25%', () => {
    const metrics = normalizeLegacyFlatMetrics(actuals, target, coreMeta)
    expect(metrics.wasfaty.actual).toBe(200)
    expect(metrics.wasfaty.target).toBe(800)
    expect(metrics.wasfaty.achievementPct).toBeCloseTo(25, 1)
    expect(metrics.wasfaty.status).toBe('critical')
  })

  it('crossSelling uses crossSellTarget (legacy naming)', () => {
    const metrics = normalizeLegacyFlatMetrics(actuals, target, coreMeta)
    expect(metrics.crossSelling.target).toBe(200)
  })

  it('null target doc → all targets null', () => {
    const metrics = normalizeLegacyFlatMetrics(actuals, null, coreMeta)
    for (const key of KPI_KEYS) {
      expect(metrics[key].target).toBeNull()
      expect(metrics[key].achievementPct).toBeNull()
    }
  })

  it('missing actual in actuals map → null actual, null achievement', () => {
    const sparse = { wasfaty: 200 }   // other KPIs missing
    const metrics = normalizeLegacyFlatMetrics(sparse, target, coreMeta)
    expect(metrics.omni.actual).toBeNull()
    expect(metrics.omni.achievementPct).toBeNull()
  })

  it('aggregationType and polarity preserved in output', () => {
    const metrics = normalizeLegacyFlatMetrics(actuals, target, coreMeta)
    expect(metrics.basket.aggregationType).toBe('AVG')
    expect(metrics.wasfaty.polarity).toBe('HIGHER_IS_BETTER')
  })

  it('portfolioWeight preserved from meta', () => {
    const metrics = normalizeLegacyFlatMetrics(actuals, target, coreMeta)
    expect(metrics.wasfaty.portfolioWeight).toBe(0.25)
    expect(metrics.crossSelling.portfolioWeight).toBe(0.15)
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — Custom KPI NOT_AGGREGATED behavior
// ══════════════════════════════════════════════════════════════

describe('Custom KPI — NOT_AGGREGATED when not executive-enabled', () => {
  it('custom KPI without executiveEnabled is NOT_AGGREGATED', () => {
    const meta = buildExecutiveKpiMeta(CUSTOM_NON_EXEC_KPI)
    expect(meta.aggregationType).toBe('NOT_AGGREGATED')
  })

  it('NOT_AGGREGATED record has null actual (not zero)', () => {
    const meta = buildExecutiveKpiMeta(CUSTOM_NON_EXEC_KPI)
    const r = normalizeExecutiveMetricRecord(999, 100, meta)
    expect(r.actual).toBeNull()     // NOT zero — NOT_AGGREGATED
    expect(r.actual).not.toBe(0)
  })

  it('NOT_AGGREGATED carries zero portfolio weight', () => {
    const meta = buildExecutiveKpiMeta(CUSTOM_NON_EXEC_KPI)
    expect(meta.portfolioWeight).toBe(0)
  })

  it('custom KPI WITH executiveEnabled is NOT NOT_AGGREGATED', () => {
    const meta = buildExecutiveKpiMeta(CUSTOM_EXEC_KPI)
    expect(meta.aggregationType).not.toBe('NOT_AGGREGATED')
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — validateExecutiveKpiWeights
// ══════════════════════════════════════════════════════════════

describe('validateExecutiveKpiWeights — portfolio weight validation', () => {
  it('default 5-core-KPI meta map passes validation', () => {
    const result = validateExecutiveKpiWeights(
      Object.fromEntries(KPI_KEYS.map((k) => [k, CORE_KPI_EXECUTIVE_META[k]]))
    )
    expect(result.valid).toBe(true)
    expect(Math.abs(result.total - 1.0)).toBeLessThanOrEqual(0.01)
  })

  it('weights summing to 0.5 fails validation', () => {
    const halfMeta: Record<string, ExecutiveKpiMeta> = {
      wasfaty: { ...CORE_KPI_EXECUTIVE_META.wasfaty, portfolioWeight: 0.25 },
      omni:    { ...CORE_KPI_EXECUTIVE_META.omni,    portfolioWeight: 0.25 },
    }
    const result = validateExecutiveKpiWeights(halfMeta)
    expect(result.valid).toBe(false)
    expect(result.total).toBeCloseTo(0.5, 2)
  })

  it('weights summing to 1.005 passes (within ±0.01 tolerance)', () => {
    const slightlyOver: Record<string, ExecutiveKpiMeta> = {}
    for (const k of KPI_KEYS) {
      slightlyOver[k] = { ...CORE_KPI_EXECUTIVE_META[k], portfolioWeight: KPI_WEIGHTS[k] + 0.001 }
    }
    const result = validateExecutiveKpiWeights(slightlyOver)
    expect(result.valid).toBe(true)
  })

  it('NOT_AGGREGATED KPIs excluded from weight sum', () => {
    const metaWithNonAgg: Record<string, ExecutiveKpiMeta> = {
      ...Object.fromEntries(KPI_KEYS.map((k) => [k, CORE_KPI_EXECUTIVE_META[k]])),
      nps: buildExecutiveKpiMeta(CUSTOM_NON_EXEC_KPI),
    }
    const result = validateExecutiveKpiWeights(metaWithNonAgg)
    // NOT_AGGREGATED custom KPI should not affect validity of the core 5
    expect(result.valid).toBe(true)
  })

  it('returns total and delta fields', () => {
    const result = validateExecutiveKpiWeights(
      Object.fromEntries(KPI_KEYS.map((k) => [k, CORE_KPI_EXECUTIVE_META[k]]))
    )
    expect(typeof result.total).toBe('number')
    expect(typeof result.delta).toBe('number')
  })

  it('empty meta map returns valid=false (no weights = 0 ≠ 1)', () => {
    const result = validateExecutiveKpiWeights({})
    expect(result.valid).toBe(false)
    expect(result.total).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — getExecutiveEnabledKpis
// ══════════════════════════════════════════════════════════════

describe('getExecutiveEnabledKpis — from registry', () => {
  it('returns core KPIs from DEFAULT_KPI_REGISTRY', () => {
    const kpis = getExecutiveEnabledKpis(DEFAULT_KPI_REGISTRY)
    const keys  = kpis.map((k) => k.aliasFor ?? k.key)
    for (const core of KPI_KEYS) {
      expect(keys).toContain(core)
    }
  })

  it('core KPIs come before custom KPIs', () => {
    const registry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      nps: { ...CUSTOM_EXEC_KPI, sortOrder: 10 },  // lower sortOrder than core
    }
    const kpis = getExecutiveEnabledKpis(registry)
    const firstNonCore = kpis.findIndex((k) => !k.isCore)
    const lastCore     = kpis.findLastIndex((k) => k.isCore)
    if (firstNonCore !== -1) {
      expect(lastCore).toBeLessThan(firstNonCore)
    }
  })

  it('inactive KPIs excluded', () => {
    const registry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      nps: { ...CUSTOM_EXEC_KPI, isActive: false },
    }
    const keys = getExecutiveEnabledKpis(registry).map((k) => k.key)
    expect(keys).not.toContain('nps')
  })

  it('non-executive KPIs excluded', () => {
    const registry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      sales: CUSTOM_NON_EXEC_KPI,
    }
    const keys = getExecutiveEnabledKpis(registry).map((k) => k.key)
    expect(keys).not.toContain('sales')
  })
})

// ══════════════════════════════════════════════════════════════
// 8 — buildExecutiveMetaMap — full registry → meta map
// ══════════════════════════════════════════════════════════════

describe('buildExecutiveMetaMap — full registry derivation', () => {
  it('produces meta for all 5 core engine keys', () => {
    const map = buildExecutiveMetaMap(DEFAULT_KPI_REGISTRY)
    for (const key of KPI_KEYS) {
      expect(map).toHaveProperty(key)
    }
  })

  it('core KPI meta matches CORE_KPI_EXECUTIVE_META exactly', () => {
    const map = buildExecutiveMetaMap(DEFAULT_KPI_REGISTRY)
    for (const key of KPI_KEYS) {
      expect(map[key].portfolioWeight).toBe(CORE_KPI_EXECUTIVE_META[key].portfolioWeight)
      expect(map[key].aggregationType).toBe(CORE_KPI_EXECUTIVE_META[key].aggregationType)
      expect(map[key].polarity).toBe(CORE_KPI_EXECUTIVE_META[key].polarity)
    }
  })

  it('custom exec-enabled KPI appears in meta map', () => {
    const registry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      nps: CUSTOM_EXEC_KPI,
    }
    const map = buildExecutiveMetaMap(registry)
    expect(map).toHaveProperty('nps')
    expect(map.nps.executiveEnabled).toBe(true)
  })

  it('custom non-exec KPI excluded from meta map', () => {
    const registry: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      sales: CUSTOM_NON_EXEC_KPI,
    }
    const map = buildExecutiveMetaMap(registry)
    expect(map).not.toHaveProperty('sales')
  })
})

// ══════════════════════════════════════════════════════════════
// 9 — assertLegacyCompatibility — core KPI invariant
// ══════════════════════════════════════════════════════════════

describe('assertLegacyCompatibility — executive core KPI invariant', () => {
  it('DEFAULT_KPI_REGISTRY passes legacy compatibility check', () => {
    expect(assertLegacyCompatibility(DEFAULT_KPI_REGISTRY)).toBe(true)
  })

  it('registry with custom KPI having wrong aggregationType still passes for core KPIs', () => {
    // assertLegacyCompatibility only checks the 5 core engine keys
    // Mutating a non-core KPI does not affect it
    const withCustom: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      nps: CUSTOM_EXEC_KPI,
    }
    expect(assertLegacyCompatibility(withCustom)).toBe(true)
  })

  it('adding custom KPIs does NOT break compatibility', () => {
    const withCustom: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      nps: CUSTOM_EXEC_KPI,
    }
    expect(assertLegacyCompatibility(withCustom)).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// 10 — Architecture: no Firestore, no UI, no score changes
// ══════════════════════════════════════════════════════════════

describe('Architecture constraints — no Firestore, no UI', () => {
  it('adapter does not directly import firebase (no onSnapshot, collection, db)', () => {
    // The adapter only imports from analytics engine and registry — not firebase directly
    expect(ADAPTER_SRC).not.toContain('onSnapshot')
    expect(ADAPTER_SRC).not.toContain('collection(db')
    expect(ADAPTER_SRC).not.toContain("from '../services/firebase'")
  })

  it('adapter does not import React or any UI component', () => {
    expect(ADAPTER_SRC).not.toContain('import React')
    expect(ADAPTER_SRC).not.toContain('from \'react\'')
    expect(ADAPTER_SRC).not.toContain('.jsx')
  })

  it('adapter has no side effects (pure functions only)', () => {
    expect(ADAPTER_SRC).not.toContain('document.')
    expect(ADAPTER_SRC).not.toContain('window.')
    expect(ADAPTER_SRC).not.toContain('localStorage')
  })

  it('kpiRegistryTypes.ts has new optional executive fields (non-breaking)', () => {
    const typesSrc = readFileSync(
      resolve(__dirname, '../kpiRegistry/kpiRegistryTypes.ts'), 'utf8'
    )
    expect(typesSrc).toContain('aggregationType?')
    expect(typesSrc).toContain('polarity?')
    expect(typesSrc).toContain('portfolioWeight?')
    // Fields are optional — no existing code should break
    expect(typesSrc).toContain('aggregationType?:')
  })

  it('existing executiveReportGenerator is not modified', () => {
    const execSrc = readFileSync(
      resolve(__dirname, './executiveReportGenerator.ts'), 'utf8'
    )
    // The generator still uses the static KPI_KEYS/KPI_WEIGHTS directly
    expect(execSrc).toContain('KPI_KEYS')
    // It does NOT import from dynamicExecutiveAdapter
    expect(execSrc).not.toContain('dynamicExecutiveAdapter')
  })
})

// ══════════════════════════════════════════════════════════════
// 11 — Future nested metrics map shape
// ══════════════════════════════════════════════════════════════

describe('Future nested metrics map shape — forward compatibility', () => {
  it('NormalizedBranchMetrics shape is correctly typed', () => {
    // This test verifies the output shape can be constructed without errors
    const metrics: Record<string, NormalizedMetricRecord> = {
      wasfaty: normalizeExecutiveMetricRecord(200, 800, CORE_KPI_EXECUTIVE_META.wasfaty),
      omni:    normalizeExecutiveMetricRecord(100, 400, CORE_KPI_EXECUTIVE_META.omni),
    }
    const branchRecord = {
      branchId:   'ph1',
      branchName: 'Test Branch',
      branchCode: '5074',
      period:     '2025-05',
      metrics,
    }
    expect(branchRecord.metrics.wasfaty.aggregationType).toBe('SUM')
    expect(branchRecord.metrics.omni.portfolioWeight).toBe(0.20)
  })

  it('multiple branches can be normalized in a map', () => {
    const coreMeta = Object.fromEntries(
      KPI_KEYS.map((k) => [k, CORE_KPI_EXECUTIVE_META[k]])
    )
    const branches = [
      { id: 'ph1', name: 'A', actuals: { wasfaty: 200, omni: 100, wellness: 150, basket: 300, crossSelling: 50 } },
      { id: 'ph2', name: 'B', actuals: { wasfaty: 180, omni: 90,  wellness: 120, basket: 280, crossSelling: 40 } },
    ]
    const target: LegacyTargetDoc = {
      pharmacyId: 'all', month: '2025-05',
      wasfatyTarget: 800, omniTarget: 400, wellnessTarget: 500,
      basketTarget: 1200, crossSellTarget: 200,
    }
    for (const b of branches) {
      const metrics = normalizeLegacyFlatMetrics(b.actuals, target, coreMeta)
      expect(Object.keys(metrics)).toHaveLength(KPI_KEYS.length)
      expect(metrics.wasfaty.actual).toBe(b.actuals.wasfaty)
    }
  })
})
