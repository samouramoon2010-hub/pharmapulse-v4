// ============================================================
// Phase 4F-A — Non-Core KPI Expansion
//
// Certifies that all 6 non-core KPIs are fully supported by
// the Dynamic KPI Foundation: registry definitions, readers,
// UI adapter, parity, and failure safety.
//
// Non-core KPIs (production_evaluation, isCore: false):
//   sales · sl · ndf · inbody · liberation
//
// Pilot KPI (pilot_tracking, isCore: false, weight: 0):
//   insuranceConversion
//
// INVARIANT: insuranceConversion is excluded from
//   getProductionEngineKeys and getCoreEngineKeys.
// INVARIANT: no non-core KPI has a weight > 0.
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import {
  DEFAULT_KPI_KEYS,
  getCoreEngineKeys,
  getProductionEngineKeys,
  getKpiActualField,
  getKpiTargetField,
  getKpiThresholds,
  getCoachingActionForKey,
  getKpiWeightForKey,
  readKpiActual,
  readKpiTarget,
  computeKpiStatsDynamic,
  compareStaticVsDynamicKpi,
  getDayProgress,
  computeAchievementPct,
  computeForecast,
  computePace,
  getTrafficLight,
} from '../kpiAnalyticsEngine'
import {
  getKpiLabel,
  getKpiLabelAr,
  getKpiColor,
  getKpiIcon,
  getKpiUnit,
  getKpiCategory,
  getKpiMetaForDisplay,
  DEFAULT_KPI_COLOR,
} from './kpiUiAdapter'
import { getKpiDefinition, resolveRegistryKey, resolveEngineKey } from './kpiMetaResolver'

// ── Non-core KPI fixtures ─────────────────────────────────────
const NON_CORE_PRODUCTION = ['sales', 'sl', 'ndf', 'inbody', 'liberation'] as const
const ALL_NON_CORE        = [...NON_CORE_PRODUCTION, 'insuranceConversion'] as const

const ENTRY = {
  sales:               120000,
  sl:                  94,
  ndf:                 18,
  inbody:              12,
  liberation:          35,
  insuranceConversion: 8,
} as any

const TARGET = {
  salesTarget:               500000,
  slTarget:                  98,
  ndfTarget:                 25,
  inbodyTarget:              20,
  liberationTarget:          50,
  insuranceConversionTarget: 15,
} as any

const TEST_DATE = new Date('2025-01-15')
const dp = getDayProgress(TEST_DATE)

// ════════════════════════════════════════════════════════════
// TASK 1 — REGISTRY AUDIT
// ════════════════════════════════════════════════════════════

describe('4F-A task 1A: registry completeness — non-core production KPIs', () => {
  it.each(NON_CORE_PRODUCTION)('%s has actualField in registry', (k) => {
    const def = (DEFAULT_KPI_REGISTRY as any)[k]
    expect(def).toBeDefined()
    expect(typeof def.actualField).toBe('string')
    expect(def.actualField.length).toBeGreaterThan(0)
  })

  it.each(NON_CORE_PRODUCTION)('%s has targetField in registry', (k) => {
    const def = (DEFAULT_KPI_REGISTRY as any)[k]
    expect(typeof def.targetField).toBe('string')
    expect(def.targetField.length).toBeGreaterThan(0)
  })

  it.each(NON_CORE_PRODUCTION)('%s has weight = 0', (k) => {
    expect((DEFAULT_KPI_REGISTRY as any)[k].weight).toBe(0)
  })

  it.each(NON_CORE_PRODUCTION)('%s has valid thresholds', (k) => {
    const t = (DEFAULT_KPI_REGISTRY as any)[k].thresholds
    expect(typeof t.healthy).toBe('number')
    expect(typeof t.watch).toBe('number')
    expect(typeof t.risk).toBe('number')
    expect(typeof t.critical).toBe('number')
  })

  it.each(NON_CORE_PRODUCTION)('%s has English label', (k) => {
    expect((DEFAULT_KPI_REGISTRY as any)[k].label.length).toBeGreaterThan(0)
  })

  it.each(NON_CORE_PRODUCTION)('%s has Arabic label', (k) => {
    expect((DEFAULT_KPI_REGISTRY as any)[k].labelAr.length).toBeGreaterThan(0)
  })

  it.each(NON_CORE_PRODUCTION)('%s has unit', (k) => {
    expect((DEFAULT_KPI_REGISTRY as any)[k].unit.length).toBeGreaterThan(0)
  })

  it.each(NON_CORE_PRODUCTION)('%s has sortOrder > 50 (after core KPIs)', (k) => {
    expect((DEFAULT_KPI_REGISTRY as any)[k].sortOrder).toBeGreaterThan(50)
  })

  it.each(NON_CORE_PRODUCTION)('%s has category', (k) => {
    expect(typeof (DEFAULT_KPI_REGISTRY as any)[k].category).toBe('string')
  })

  it.each(NON_CORE_PRODUCTION)('%s has coachingAction', (k) => {
    expect((DEFAULT_KPI_REGISTRY as any)[k].coachingAction.length).toBeGreaterThan(10)
  })

  it.each(NON_CORE_PRODUCTION)('%s lifecycleStage is production_evaluation', (k) => {
    expect((DEFAULT_KPI_REGISTRY as any)[k].lifecycleStage).toBe('production_evaluation')
  })

  it.each(NON_CORE_PRODUCTION)('%s isCore is false', (k) => {
    expect((DEFAULT_KPI_REGISTRY as any)[k].isCore).toBe(false)
  })
})

describe('4F-A task 1B: registry completeness — insuranceConversion pilot KPI', () => {
  it('insuranceConversion has actualField', () => {
    expect((DEFAULT_KPI_REGISTRY as any).insuranceConversion.actualField).toBe('insuranceConversion')
  })

  it('insuranceConversion has targetField insuranceConversionTarget', () => {
    expect((DEFAULT_KPI_REGISTRY as any).insuranceConversion.targetField).toBe('insuranceConversionTarget')
  })

  it('insuranceConversion lifecycleStage is pilot_tracking', () => {
    expect((DEFAULT_KPI_REGISTRY as any).insuranceConversion.lifecycleStage).toBe('pilot_tracking')
  })

  it('insuranceConversion weight is 0', () => {
    expect((DEFAULT_KPI_REGISTRY as any).insuranceConversion.weight).toBe(0)
  })

  it('insuranceConversion isCore is false', () => {
    expect((DEFAULT_KPI_REGISTRY as any).insuranceConversion.isCore).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// TASK 2 — ALIAS CERTIFICATION
// ════════════════════════════════════════════════════════════

describe('4F-A task 2: alias certification — non-core KPIs have no aliasFor', () => {
  it.each(ALL_NON_CORE)('%s has no aliasFor (registry key = engine key)', (k) => {
    expect((DEFAULT_KPI_REGISTRY as any)[k].aliasFor).toBeUndefined()
  })

  it.each(ALL_NON_CORE)('%s: resolveRegistryKey returns itself', (k) => {
    expect(resolveRegistryKey(k)).toBe(k)
  })

  it.each(ALL_NON_CORE)('%s: resolveEngineKey returns itself', (k) => {
    expect(resolveEngineKey(k)).toBe(k)
  })

  it.each(ALL_NON_CORE)('%s: getKpiDefinition resolves correctly', (k) => {
    const def = getKpiDefinition(k)
    expect(def).toBeDefined()
    expect(def!.key).toBe(k)
  })

  it('getProductionEngineKeys includes all 5 non-core production KPIs', () => {
    const keys = getProductionEngineKeys(DEFAULT_KPI_REGISTRY as any)
    for (const k of NON_CORE_PRODUCTION) {
      expect(keys).toContain(k)
    }
  })

  it('getProductionEngineKeys excludes insuranceConversion (pilot_tracking)', () => {
    const keys = getProductionEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(keys).not.toContain('insuranceConversion')
  })

  it('getCoreEngineKeys excludes all non-core KPIs', () => {
    const keys = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    for (const k of ALL_NON_CORE) {
      expect(keys).not.toContain(k)
    }
    expect(keys).toEqual(DEFAULT_KPI_KEYS)
  })
})

// ════════════════════════════════════════════════════════════
// TASK 3 — PRODUCTION READERS CERTIFICATION
// ════════════════════════════════════════════════════════════

describe('4F-A task 3A: readKpiActual for non-core KPIs', () => {
  it('reads sales correctly from document', () => {
    expect(readKpiActual(ENTRY, 'sales', DEFAULT_KPI_REGISTRY as any)).toBe(120000)
  })

  it('reads sl correctly', () => {
    expect(readKpiActual(ENTRY, 'sl', DEFAULT_KPI_REGISTRY as any)).toBe(94)
  })

  it('reads ndf correctly', () => {
    expect(readKpiActual(ENTRY, 'ndf', DEFAULT_KPI_REGISTRY as any)).toBe(18)
  })

  it('reads inbody correctly', () => {
    expect(readKpiActual(ENTRY, 'inbody', DEFAULT_KPI_REGISTRY as any)).toBe(12)
  })

  it('reads liberation correctly', () => {
    expect(readKpiActual(ENTRY, 'liberation', DEFAULT_KPI_REGISTRY as any)).toBe(35)
  })

  it('reads insuranceConversion correctly', () => {
    expect(readKpiActual(ENTRY, 'insuranceConversion', DEFAULT_KPI_REGISTRY as any)).toBe(8)
  })

  it('readKpiActual without registry gives same result as with registry for all non-core', () => {
    for (const k of ALL_NON_CORE) {
      expect(readKpiActual(ENTRY, k, DEFAULT_KPI_REGISTRY as any)).toBe(readKpiActual(ENTRY, k))
    }
  })
})

describe('4F-A task 3B: readKpiTarget for non-core KPIs', () => {
  it('reads salesTarget correctly', () => {
    expect(readKpiTarget(TARGET, 'sales', DEFAULT_KPI_REGISTRY as any)).toBe(500000)
  })

  it('reads slTarget correctly', () => {
    expect(readKpiTarget(TARGET, 'sl', DEFAULT_KPI_REGISTRY as any)).toBe(98)
  })

  it('reads ndfTarget correctly', () => {
    expect(readKpiTarget(TARGET, 'ndf', DEFAULT_KPI_REGISTRY as any)).toBe(25)
  })

  it('reads inbodyTarget correctly', () => {
    expect(readKpiTarget(TARGET, 'inbody', DEFAULT_KPI_REGISTRY as any)).toBe(20)
  })

  it('reads liberationTarget correctly', () => {
    expect(readKpiTarget(TARGET, 'liberation', DEFAULT_KPI_REGISTRY as any)).toBe(50)
  })

  it('reads insuranceConversionTarget correctly', () => {
    expect(readKpiTarget(TARGET, 'insuranceConversion', DEFAULT_KPI_REGISTRY as any)).toBe(15)
  })

  it('readKpiTarget without registry gives same result as with registry for all non-core', () => {
    for (const k of ALL_NON_CORE) {
      expect(readKpiTarget(TARGET, k, DEFAULT_KPI_REGISTRY as any)).toBe(readKpiTarget(TARGET, k))
    }
  })
})

describe('4F-A task 3C: computeKpiStatsDynamic for non-core KPIs', () => {
  it.each(ALL_NON_CORE)('%s: computeKpiStatsDynamic does not throw', (k) => {
    expect(() => computeKpiStatsDynamic(ENTRY, TARGET, k, dp, DEFAULT_KPI_REGISTRY as any)).not.toThrow()
  })

  it('sales: achievementPct = 24 (120000 / 500000 × 100)', () => {
    const stats = computeKpiStatsDynamic(ENTRY, TARGET, 'sales', dp, DEFAULT_KPI_REGISTRY as any)
    expect(stats.actual).toBe(120000)
    expect(stats.target).toBe(500000)
    expect(stats.achievementPct).toBe(24)
  })

  it('ndf: achievementPct = 72 (18 / 25 × 100)', () => {
    const stats = computeKpiStatsDynamic(ENTRY, TARGET, 'ndf', dp, DEFAULT_KPI_REGISTRY as any)
    expect(stats.achievementPct).toBe(72)
  })

  it.each(ALL_NON_CORE)('%s: stats shape has required fields', (k) => {
    const stats = computeKpiStatsDynamic(ENTRY, TARGET, k, dp, DEFAULT_KPI_REGISTRY as any)
    expect(typeof stats.actual).toBe('number')
    expect(typeof stats.target).toBe('number')
    expect(typeof stats.achievementPct).toBe('number')
    expect(typeof stats.status).toBe('string')
  })
})

describe('4F-A task 3D: compareStaticVsDynamicKpi parity for non-core KPIs', () => {
  it.each(ALL_NON_CORE)('%s: actual and target match static vs dynamic', (k) => {
    const result = compareStaticVsDynamicKpi(ENTRY, TARGET, k, DEFAULT_KPI_REGISTRY as any)
    expect(result.actualMatches).toBe(true)
    expect(result.targetMatches).toBe(true)
    expect(result.achievementMatches).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// TASK 4 — UI ADAPTER CERTIFICATION
// ════════════════════════════════════════════════════════════

describe('4F-A task 4A: getKpiLabel for non-core KPIs', () => {
  it('sales label is Sales Revenue', () => {
    expect(getKpiLabel('sales')).toBe('Sales Revenue')
  })

  it('sl label is Service Level', () => {
    expect(getKpiLabel('sl')).toBe('Service Level')
  })

  it('ndf label is NDF Programme', () => {
    expect(getKpiLabel('ndf')).toBe('NDF Programme')
  })

  it('inbody label is InBody Scan', () => {
    expect(getKpiLabel('inbody')).toBe('InBody Scan')
  })

  it('liberation label is Liberation', () => {
    expect(getKpiLabel('liberation')).toBe('Liberation')
  })

  it('insuranceConversion label is Insurance Conversion', () => {
    expect(getKpiLabel('insuranceConversion')).toBe('Insurance Conversion')
  })
})

describe('4F-A task 4B: getKpiLabelAr for non-core KPIs', () => {
  it.each(ALL_NON_CORE)('%s Arabic label is non-empty', (k) => {
    expect(getKpiLabelAr(k).length).toBeGreaterThan(0)
  })
})

describe('4F-A task 4C: getKpiColor for non-core KPIs', () => {
  it.each(ALL_NON_CORE)('%s returns a valid color string (# prefix or default)', (k) => {
    const color = getKpiColor(k)
    expect(color.startsWith('#')).toBe(true)
  })

  it('non-core KPIs without explicit color entry return DEFAULT_KPI_COLOR', () => {
    // Non-core KPIs are not in KPI_COLOR_MAP — fall back to default
    expect(getKpiColor('sales')).toBe(DEFAULT_KPI_COLOR)
    expect(getKpiColor('sl')).toBe(DEFAULT_KPI_COLOR)
    expect(getKpiColor('ndf')).toBe(DEFAULT_KPI_COLOR)
    expect(getKpiColor('inbody')).toBe(DEFAULT_KPI_COLOR)
    expect(getKpiColor('liberation')).toBe(DEFAULT_KPI_COLOR)
    expect(getKpiColor('insuranceConversion')).toBe(DEFAULT_KPI_COLOR)
  })
})

describe('4F-A task 4D: getKpiUnit for non-core KPIs', () => {
  it('sales unit is SAR', () => { expect(getKpiUnit('sales')).toBe('SAR') })
  it('sl unit is %', () => { expect(getKpiUnit('sl')).toBe('%') })
  it('ndf unit is patients', () => { expect(getKpiUnit('ndf')).toBe('patients') })
  it('inbody unit is scans', () => { expect(getKpiUnit('inbody')).toBe('scans') })
  it('liberation unit is prescriptions', () => { expect(getKpiUnit('liberation')).toBe('prescriptions') })
  it('insuranceConversion unit is conversions', () => { expect(getKpiUnit('insuranceConversion')).toBe('conversions') })
})

describe('4F-A task 4E: getKpiCategory for non-core KPIs', () => {
  it('sales category is commercial', () => { expect(getKpiCategory('sales')).toBe('commercial') })
  it('sl category is operational', () => { expect(getKpiCategory('sl')).toBe('operational') })
  it('ndf category is health_program', () => { expect(getKpiCategory('ndf')).toBe('health_program') })
  it('inbody category is health_program', () => { expect(getKpiCategory('inbody')).toBe('health_program') })
  it('liberation category is prescription', () => { expect(getKpiCategory('liberation')).toBe('prescription') })
  it('insuranceConversion category is commercial', () => { expect(getKpiCategory('insuranceConversion')).toBe('commercial') })
})

describe('4F-A task 4F: getKpiMetaForDisplay for non-core KPIs', () => {
  it.each(ALL_NON_CORE)('%s: getKpiMetaForDisplay returns valid shape', (k) => {
    const meta = getKpiMetaForDisplay(k, DEFAULT_KPI_REGISTRY as any)
    expect(meta.label.length).toBeGreaterThan(0)
    expect(meta.labelAr.length).toBeGreaterThan(0)
    expect(meta.color.startsWith('#')).toBe(true)
    expect(typeof meta.unit).toBe('string')
    expect(typeof meta.category).toBe('string')
  })
})

// ════════════════════════════════════════════════════════════
// TASK 5 — PARITY TESTS
// ════════════════════════════════════════════════════════════

describe('4F-A task 5A: parity — actual and target field resolution', () => {
  it('sales: getKpiActualField=sales, getKpiTargetField=salesTarget', () => {
    expect(getKpiActualField('sales', DEFAULT_KPI_REGISTRY as any)).toBe('sales')
    expect(getKpiTargetField('sales', DEFAULT_KPI_REGISTRY as any)).toBe('salesTarget')
  })

  it('sl: getKpiActualField=sl, getKpiTargetField=slTarget', () => {
    expect(getKpiActualField('sl', DEFAULT_KPI_REGISTRY as any)).toBe('sl')
    expect(getKpiTargetField('sl', DEFAULT_KPI_REGISTRY as any)).toBe('slTarget')
  })

  it('ndf: getKpiActualField=ndf, getKpiTargetField=ndfTarget', () => {
    expect(getKpiActualField('ndf', DEFAULT_KPI_REGISTRY as any)).toBe('ndf')
    expect(getKpiTargetField('ndf', DEFAULT_KPI_REGISTRY as any)).toBe('ndfTarget')
  })

  it('inbody: getKpiActualField=inbody, getKpiTargetField=inbodyTarget', () => {
    expect(getKpiActualField('inbody', DEFAULT_KPI_REGISTRY as any)).toBe('inbody')
    expect(getKpiTargetField('inbody', DEFAULT_KPI_REGISTRY as any)).toBe('inbodyTarget')
  })

  it('liberation: getKpiActualField=liberation, getKpiTargetField=liberationTarget', () => {
    expect(getKpiActualField('liberation', DEFAULT_KPI_REGISTRY as any)).toBe('liberation')
    expect(getKpiTargetField('liberation', DEFAULT_KPI_REGISTRY as any)).toBe('liberationTarget')
  })

  it('insuranceConversion: getKpiActualField=insuranceConversion, getKpiTargetField=insuranceConversionTarget', () => {
    expect(getKpiActualField('insuranceConversion', DEFAULT_KPI_REGISTRY as any)).toBe('insuranceConversion')
    expect(getKpiTargetField('insuranceConversion', DEFAULT_KPI_REGISTRY as any)).toBe('insuranceConversionTarget')
  })
})

describe('4F-A task 5B: parity — achievement computation', () => {
  it('sales: 120000/500000 = 24%', () => {
    const a = readKpiActual(ENTRY, 'sales')
    const t = readKpiTarget(TARGET, 'sales')
    expect(computeAchievementPct(a, t)).toBe(24)
  })

  it('sl: 94/98 ≈ 95.9% → 95', () => {
    const a = readKpiActual(ENTRY, 'sl')
    const t = readKpiTarget(TARGET, 'sl')
    expect(computeAchievementPct(a, t)).toBe(Math.min(200, Math.round((94 / 98) * 100)))
  })

  it('ndf: 18/25 = 72%', () => {
    const a = readKpiActual(ENTRY, 'ndf')
    const t = readKpiTarget(TARGET, 'ndf')
    expect(computeAchievementPct(a, t)).toBe(72)
  })

  it('inbody: 12/20 = 60%', () => {
    const a = readKpiActual(ENTRY, 'inbody')
    const t = readKpiTarget(TARGET, 'inbody')
    expect(computeAchievementPct(a, t)).toBe(60)
  })

  it('liberation: 35/50 = 70%', () => {
    const a = readKpiActual(ENTRY, 'liberation')
    const t = readKpiTarget(TARGET, 'liberation')
    expect(computeAchievementPct(a, t)).toBe(70)
  })

  it('insuranceConversion: 8/15 = 53%', () => {
    const a = readKpiActual(ENTRY, 'insuranceConversion')
    const t = readKpiTarget(TARGET, 'insuranceConversion')
    expect(computeAchievementPct(a, t)).toBe(53)
  })
})

describe('4F-A task 5C: parity — thresholds and traffic light', () => {
  it('sl uses SERVICE thresholds: watch=95', () => {
    const t = getKpiThresholds('sl', DEFAULT_KPI_REGISTRY as any)
    expect(t.watch).toBe(95)
    expect(t.healthy).toBe(98)
  })

  it('ndf uses PROGRAMME thresholds: watch=70', () => {
    const t = getKpiThresholds('ndf', DEFAULT_KPI_REGISTRY as any)
    expect(t.watch).toBe(70)
  })

  it('sales uses REVENUE thresholds: watch=85', () => {
    const t = getKpiThresholds('sales', DEFAULT_KPI_REGISTRY as any)
    expect(t.watch).toBe(85)
  })

  it.each(ALL_NON_CORE)('%s: getTrafficLight returns valid status for its achievement', (k) => {
    const a   = readKpiActual(ENTRY, k)
    const t   = readKpiTarget(TARGET, k)
    const pct = t > 0 ? (a / t) * 100 : 0
    const status = getTrafficLight(pct)
    const validStatuses = ['excellent', 'good', 'warning', 'critical']
    expect(validStatuses).toContain(status)
  })
})

describe('4F-A task 5D: parity — forecast and pace', () => {
  it.each(ALL_NON_CORE)('%s: computeForecast does not throw and returns forecastEOM', (k) => {
    const a = readKpiActual(ENTRY, k)
    const t = readKpiTarget(TARGET, k)
    const f = computeForecast(a, t, dp)
    expect(typeof f.forecastEOM).toBe('number')
  })

  it.each(ALL_NON_CORE)('%s: computePace does not throw', (k) => {
    const a = readKpiActual(ENTRY, k)
    const t = readKpiTarget(TARGET, k)
    expect(() => computePace(a, t, dp)).not.toThrow()
  })
})

describe('4F-A task 5E: parity — coaching actions', () => {
  it.each(ALL_NON_CORE)('%s coaching action from registry is non-empty', (k) => {
    const action = getCoachingActionForKey(k, DEFAULT_KPI_REGISTRY as any)
    expect(action.length).toBeGreaterThan(10)
  })
})

describe('4F-A task 5F: sort order — non-core appear after core', () => {
  it('all non-core production KPIs have sortOrder > 50 (core range is 10–50)', () => {
    for (const k of ALL_NON_CORE) {
      expect((DEFAULT_KPI_REGISTRY as any)[k].sortOrder).toBeGreaterThan(50)
    }
  })

  it('getProductionEngineKeys: non-core keys come after core keys', () => {
    const all  = getProductionEngineKeys(DEFAULT_KPI_REGISTRY as any)
    const core = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
    const coreEnd = Math.max(...core.map((k) => all.indexOf(k)))
    for (const k of NON_CORE_PRODUCTION) {
      expect(all.indexOf(k)).toBeGreaterThan(coreEnd)
    }
  })
})

describe('4F-A task 5G: weight certification — all non-core weight = 0', () => {
  it.each(ALL_NON_CORE)('%s: getKpiWeightForKey returns 0', (k) => {
    expect(getKpiWeightForKey(k, DEFAULT_KPI_REGISTRY as any)).toBe(0)
  })

  it('total production weight unchanged at 1.0 (non-core adds 0)', () => {
    const coreKeys = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
    const total = coreKeys.reduce((s, k) => s + getKpiWeightForKey(k), 0)
    expect(total).toBeCloseTo(1.0, 10)
  })
})

// ════════════════════════════════════════════════════════════
// GUARDRAIL TESTS
// ════════════════════════════════════════════════════════════

describe('4F-A guardrails: no UI / Firestore / AI / regional changes', () => {
  it('kpiAnalyticsEngine has no Firestore imports', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).not.toMatch(/from ['"]firebase/)
    expect(src).not.toContain('getFirestore')
  })

  it('defaultKpiRegistry has no Firestore imports', async () => {
    const src = (await import('./defaultKpiRegistry?raw') as any).default as string
    expect(src).not.toMatch(/from ['"]firebase/)
  })

  it('kpiAnalyticsEngine has no regionalIntelligence imports', async () => {
    const src = (await import('../kpiAnalyticsEngine?raw') as any).default as string
    expect(src).not.toMatch(/from.*regionalIntelligence/)
  })

  it('core KPIs unaffected: getCoreEngineKeys still returns only 5 core keys', () => {
    expect(getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)).toEqual(DEFAULT_KPI_KEYS)
  })

  it('core KPI weights unchanged', () => {
    expect(getKpiWeightForKey('wasfaty')).toBe(0.25)
    expect(getKpiWeightForKey('crossSelling')).toBe(0.15)
  })
})
