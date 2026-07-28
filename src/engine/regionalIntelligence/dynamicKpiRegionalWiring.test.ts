// ============================================================
// Regional Intelligence — Dynamic KPI Wiring Regression Tests
//
// Covers the full chain from live registry → branch rollup →
// regional rollup → heatmap cell resolution.
//
// Tests A–I per specification:
//   A. useRegionalIntelligence passes registry to generateBranchRollup
//   B. generateRegionalIntelligence passes registry to generateRegionalRollups
//   C. Branch rollup includes testdynamickpi when production_evaluation
//   D. Regional averages include testdynamickpi
//   E. pilot_tracking KPI remains excluded
//   F. RegionalIntelligencePanel uses getProductionEngineKeys (source check)
//   G. heatmapSelectors resolves dynamic KPI if in kpiAchievementSummary
//   H. heatmapSelectors returns NOT_AGGREGATED when key absent
//   I. Legacy 5 KPI behavior unchanged
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  generateBranchRollup,
} from '../../engine/regionalIntelligence/branchRollupEngine'
import {
  generateRegionalRollups,
} from '../../engine/regionalIntelligence/regionalRollupEngine'
import {
  generateRegionalIntelligence,
} from '../../engine/regionalIntelligence/regionalIntelligenceGenerator'
import {
  buildBranchKpiMatrix,
} from '../../engine/regionalIntelligence/heatmapSelectors'
import {
  DEFAULT_KPI_REGISTRY,
} from '../../engine/kpiRegistry'
import type { KpiRegistry }    from '../../engine/kpiRegistry'
import type { BranchRollupInput, RegionalPeriod } from '../../engine/regionalIntelligence/regionalTypes'
import type { KpiEntry, MonthlyTarget } from '../../engine/kpiAnalyticsEngine'
import { DEFAULT_KPI_KEYS, getProductionEngineKeys } from '../../engine/kpiAnalyticsEngine'

// ── Fixtures ─────────────────────────────────────────────────

const PERIOD: RegionalPeriod = {
  type: 'MTD', startDate: '2025-06-01', endDate: '2025-06-30',
  month: '2025-06', dayRatio: 0.5,
}

function makeDynamicRegistry(key: string, stage = 'production_evaluation'): KpiRegistry {
  return {
    ...DEFAULT_KPI_REGISTRY,
    [key]: {
      key,
      label:      `Dynamic ${key}`,
      shortLabel: key,
      labelAr:    key,
      isActive:   true,
      isCore:     false,
      lifecycleStage: stage as any,
      aliasFor:   undefined,
      sortOrder:  999,
      category:   'commercial',
      valueType:  'count',
      unit:       'units',
      unitAr:     'وحدة',
      direction:  'higher_is_better',
      targetType: 'absolute',
      weight:     0,
      thresholds: { healthy: 90, watch: 70, risk: 50, critical: 30 },
      visibility: {
        dashboardEnabled: true, teamEnabled: false,
        executiveEnabled: false, regionalEnabled: false, targetInputEnabled: true,
      },
      isPrimary: false, coachingAction: '', coachingActionAr: '', description: '',
    },
  }
}

function makeInput(overrides: Partial<BranchRollupInput> = {}): BranchRollupInput {
  const entry: KpiEntry = {
    id: 'e1', userId: 'u1', pharmacyId: 'p1', date: '2025-06-15',
    wasfaty: 100, omni: 90, wellness: 80, basket: 70, crossSelling: 60,
    testdynamickpi: 100,
  } as KpiEntry
  const target: MonthlyTarget = {
    pharmacyId: 'p1', month: '2025-06',
    wasfatyTarget: 200, omniTarget: 180, wellnessTarget: 160,
    basketTarget: 140, crossSellTarget: 120,
    testdynamickpiTarget: 50,
  } as MonthlyTarget
  return {
    branchId: 'p1', branchName: 'Branch 1', branchCode: 'B1', region: 'Central',
    entries: [entry], target, historicalEntries: [],
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────
// A. useRegionalIntelligence passes registry to generateBranchRollup
// ─────────────────────────────────────────────────────────────
describe('A — Hook source: registry is passed to generateBranchRollup', () => {
  it('useRegionalIntelligence.ts passes liveRegistry as 3rd arg to generateBranchRollup', async () => {
    const src = (await import('../../hooks/useRegionalIntelligence.ts?raw')).default
    expect(src).toContain('generateBranchRollup(input, period, liveRegistry)')
  })

  it('hook subscribes to KPI registry via subscribeKpiRegistry', async () => {
    const src = (await import('../../hooks/useRegionalIntelligence.ts?raw')).default
    expect(src).toContain('subscribeKpiRegistry')
    expect(src).toContain('setLiveRegistry(reg)')
  })

  it('hook passes registry into generateRegionalIntelligence input', async () => {
    const src = (await import('../../hooks/useRegionalIntelligence.ts?raw')).default
    expect(src).toContain('registry: liveRegistry')
  })

  it('rollup memo includes liveRegistry in dependency array', async () => {
    const src = (await import('../../hooks/useRegionalIntelligence.ts?raw')).default
    expect(src).toContain('branchInputs, period, liveRegistry')
  })

  it('hook returns liveRegistry so parent can pass to panel', async () => {
    const src = (await import('../../hooks/useRegionalIntelligence.ts?raw')).default
    expect(src).toContain('liveRegistry,')
  })
})

// ─────────────────────────────────────────────────────────────
// B. generateRegionalIntelligence passes registry to generateRegionalRollups
// ─────────────────────────────────────────────────────────────
describe('B — Generator: registry threaded to generateRegionalRollups', () => {
  it('RegionalIntelligenceInput type has optional registry field', async () => {
    const src = (await import('../../engine/regionalIntelligence/regionalTypes.ts?raw')).default
    expect(src).toContain('registry?:')
  })

  it('generateRegionalIntelligence passes input.registry to generateRegionalRollups', async () => {
    const src = (await import('../../engine/regionalIntelligence/regionalIntelligenceGenerator.ts?raw')).default
    expect(src).toContain('generateRegionalRollups(branchRollups, input.registry)')
  })
})

// ─────────────────────────────────────────────────────────────
// C. Branch rollup includes testdynamickpi when production_evaluation
// ─────────────────────────────────────────────────────────────
describe('C — Branch rollup includes dynamic production KPI', () => {
  const registry = makeDynamicRegistry('testdynamickpi')
  const summary  = generateBranchRollup(makeInput(), PERIOD, registry)

  it('kpiAchievementSummary contains testdynamickpi', () => {
    const keys = summary.kpiAchievementSummary.map((k) => k.kpiKey)
    expect(keys).toContain('testdynamickpi')
  })

  it('testdynamickpi actual = 100', () => {
    const kpi = summary.kpiAchievementSummary.find((k) => k.kpiKey === 'testdynamickpi')
    expect(kpi!.actual).toBe(100)
  })

  it('testdynamickpi target = 50 (from testdynamickpiTarget)', () => {
    const kpi = summary.kpiAchievementSummary.find((k) => k.kpiKey === 'testdynamickpi')
    expect(kpi!.target).toBe(50)
  })

  it('testdynamickpi achievementPct = 200', () => {
    const kpi = summary.kpiAchievementSummary.find((k) => k.kpiKey === 'testdynamickpi')
    expect(kpi!.achievementPct).toBe(200)
  })

  it('legacy 5 KPIs also present alongside dynamic KPI', () => {
    const keys = summary.kpiAchievementSummary.map((k) => k.kpiKey)
    DEFAULT_KPI_KEYS.forEach((k) => expect(keys).toContain(k))
  })
})

// ─────────────────────────────────────────────────────────────
// D. Regional averages include testdynamickpi
// ─────────────────────────────────────────────────────────────
describe('D — Regional rollup averages include dynamic production KPI', () => {
  const registry = makeDynamicRegistry('testdynamickpi')

  // Two branches with different actuals
  const makeB = (id: string, actual: number) => {
    const entry = { ...makeInput().entries[0], pharmacyId: id, testdynamickpi: actual } as KpiEntry
    const target = { ...makeInput().target!, pharmacyId: id, testdynamickpiTarget: 50 } as MonthlyTarget
    return generateBranchRollup(makeInput({ branchId: id, branchName: `B${id}`, entries: [entry], target }), PERIOD, registry)
  }

  const rollups = [makeB('p1', 100), makeB('p2', 50)]
  const regions = generateRegionalRollups(rollups, registry)

  it('regional kpiAverages contains testdynamickpi', () => {
    const avgKeys = regions[0].kpiAverages.map((a) => a.kpiKey)
    expect(avgKeys).toContain('testdynamickpi')
  })

  it('meanAchievementPct = average of both branches ((200+100)/2 = 150)', () => {
    const avg = regions[0].kpiAverages.find((a) => a.kpiKey === 'testdynamickpi')
    expect(avg!.meanAchievementPct).toBe(150)
  })

  it('regional intelligence pipeline preserves dynamic KPI through full chain', () => {
    const intel = generateRegionalIntelligence({ branchRollups: rollups, period: PERIOD, registry })
    const regionSummary = intel.regionalSummaries[0]
    const avgKeys = regionSummary.kpiAverages.map((a) => a.kpiKey)
    expect(avgKeys).toContain('testdynamickpi')
  })
})

// ─────────────────────────────────────────────────────────────
// E. pilot_tracking KPI remains excluded
// ─────────────────────────────────────────────────────────────
describe('E — pilot_tracking KPI excluded from branch and regional rollup', () => {
  const registryWithPilot = makeDynamicRegistry('insuranceConversion', 'pilot_tracking')

  it('pilot KPI not in branch kpiAchievementSummary', () => {
    const summary = generateBranchRollup(makeInput(), PERIOD, registryWithPilot)
    const keys = summary.kpiAchievementSummary.map((k) => k.kpiKey)
    expect(keys).not.toContain('insuranceConversion')
  })

  it('pilot KPI not in regional kpiAverages', () => {
    const summary = generateBranchRollup(makeInput(), PERIOD, registryWithPilot)
    const regions = generateRegionalRollups([summary], registryWithPilot)
    const avgKeys = regions[0].kpiAverages.map((a) => a.kpiKey)
    expect(avgKeys).not.toContain('insuranceConversion')
  })
})

// ─────────────────────────────────────────────────────────────
// F. RegionalIntelligencePanel uses getProductionEngineKeys
// ─────────────────────────────────────────────────────────────
describe('F — RegionalIntelligencePanel: registry-driven column list', () => {
  it('imports getProductionEngineKeys (not just KPI_KEYS)', async () => {
    const src = (await import('../../components/executive/RegionalIntelligencePanel.jsx?raw')).default
    expect(src).toContain('getProductionEngineKeys')
  })

  it('kpiColKeys uses getProductionEngineKeys(liveRegistry)', async () => {
    const src = (await import('../../components/executive/RegionalIntelligencePanel.jsx?raw')).default
    expect(src).toContain('getProductionEngineKeys(liveRegistry')
  })

  it('falls back to DEFAULT_KPI_REGISTRY when liveRegistry undefined', async () => {
    const src = (await import('../../components/executive/RegionalIntelligencePanel.jsx?raw')).default
    expect(src).toContain('liveRegistry ?? DEFAULT_KPI_REGISTRY')
  })

  it('panel accepts liveRegistry as prop', async () => {
    const src = (await import('../../components/executive/RegionalIntelligencePanel.jsx?raw')).default
    expect(src).toContain('liveRegistry,')
  })

  it('ExecutiveDashboard passes liveRegistry to RegionalIntelligencePanel', async () => {
    const src = (await import('../../pages/executive/ExecutiveDashboard.jsx?raw')).default
    expect(src).toContain('liveRegistry={liveRegistry}')
    expect(src).toContain('useRegionalIntelligence()')
  })
})

// ─────────────────────────────────────────────────────────────
// G. heatmapSelectors resolves dynamic KPI cell if in kpiAchievementSummary
// ─────────────────────────────────────────────────────────────
describe('G — heatmapSelectors: dynamic KPI cell resolved when in kpiAchievementSummary', () => {
  const registry = makeDynamicRegistry('testdynamickpi')
  const branchSummary = generateBranchRollup(makeInput(), PERIOD, registry)

  it('buildBranchKpiMatrix with testdynamickpi column resolves a value', () => {
    const matrix = buildBranchKpiMatrix([branchSummary], ['testdynamickpi'])
    const cell = matrix.cells.find((c) => c.col === 'testdynamickpi')
    expect(cell).toBeDefined()
    // achievementPct = 200, but heatmap may cap at 200 or display as-is
    expect(cell!.emptyCellState).toBeNull()  // not NOT_AGGREGATED
    expect(cell!.value).toBeGreaterThan(0)
  })

  it('dynamic KPI column is not treated as NOT_AGGREGATED', () => {
    const matrix = buildBranchKpiMatrix([branchSummary], ['testdynamickpi'])
    const cell = matrix.cells.find((c) => c.col === 'testdynamickpi')
    expect(cell!.emptyCellState).not.toBe('NOT_AGGREGATED')
  })

  it('heatmapSelectors source no longer uses isCoreKpiKey to block dynamic keys', async () => {
    const src = (await import('../../engine/regionalIntelligence/heatmapSelectors.ts?raw')).default
    // resolveKpiCell now uses findKpiSummary check, not isCoreKpiKey for blocking
    const resolveIdx = src.indexOf('function resolveKpiCell')
    const resolveBody = src.slice(resolveIdx, resolveIdx + 600)
    // The old block "if (!isCoreKpiKey(kpiKey)) → NOT_AGGREGATED" is gone
    expect(resolveBody).not.toContain("if (!isCoreKpiKey(kpiKey))")
  })
})

// ─────────────────────────────────────────────────────────────
// H. heatmapSelectors returns NOT_AGGREGATED when key absent from summary
// ─────────────────────────────────────────────────────────────
describe('H — heatmapSelectors: NOT_AGGREGATED when key absent from kpiAchievementSummary', () => {
  // Branch rollup with NO registry (defaults to DEFAULT_KPI_KEYS)
  const defaultSummary = generateBranchRollup(makeInput(), PERIOD)

  it('testdynamickpi absent from summary when no registry passed', () => {
    const keys = defaultSummary.kpiAchievementSummary.map((k) => k.kpiKey)
    expect(keys).not.toContain('testdynamickpi')
  })

  it('buildBranchKpiMatrix returns NOT_AGGREGATED for absent key', () => {
    const matrix = buildBranchKpiMatrix([defaultSummary], ['testdynamickpi'])
    const cell = matrix.cells.find((c) => c.col === 'testdynamickpi')
    expect(cell).toBeDefined()
    expect(cell!.emptyCellState).toBe('NOT_AGGREGATED')
    expect(cell!.value).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────
// I. Legacy 5 KPI behavior unchanged
// ─────────────────────────────────────────────────────────────
describe('I — Legacy 5 KPI behavior unchanged end-to-end', () => {
  const defaultSummary = generateBranchRollup(makeInput(), PERIOD)
  const withReg        = generateBranchRollup(makeInput(), PERIOD, DEFAULT_KPI_REGISTRY)

  it('wasfaty value identical with and without registry', () => {
    const w1 = defaultSummary.kpiAchievementSummary.find((k) => k.kpiKey === 'wasfaty')
    const w2 = withReg.kpiAchievementSummary.find((k) => k.kpiKey === 'wasfaty')
    expect(w1!.actual).toBe(w2!.actual)
    expect(w1!.achievementPct).toBe(w2!.achievementPct)
  })

  it('all 5 legacy engine keys in branch rollup', () => {
    const keys = withReg.kpiAchievementSummary.map((k) => k.kpiKey)
    DEFAULT_KPI_KEYS.forEach((k) => expect(keys).toContain(k))
  })

  it('regional rollup legacy averages unchanged', () => {
    const regions1 = generateRegionalRollups([defaultSummary])
    const regions2 = generateRegionalRollups([withReg], DEFAULT_KPI_REGISTRY)
    const omni1 = regions1[0].kpiAverages.find((a) => a.kpiKey === 'omni')
    const omni2 = regions2[0].kpiAverages.find((a) => a.kpiKey === 'omni')
    expect(omni1!.meanAchievementPct).toBe(omni2!.meanAchievementPct)
  })

  it('heatmap legacy KPI cells still resolve normally', () => {
    const matrix = buildBranchKpiMatrix([withReg], DEFAULT_KPI_KEYS)
    const cell = matrix.cells.find((c) => c.col === 'wasfaty')
    expect(cell).toBeDefined()
    expect(cell!.emptyCellState).toBeNull()
    expect(cell!.value).toBeGreaterThan(0)
  })

  it('getProductionEngineKeys(DEFAULT_KPI_REGISTRY) includes all 5 legacy keys', () => {
    const keys = getProductionEngineKeys(DEFAULT_KPI_REGISTRY)
    DEFAULT_KPI_KEYS.forEach((k) => expect(keys).toContain(k))
  })
})
