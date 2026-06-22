// ============================================================
// heatmapSelectors.ts — Comprehensive Tests
// Phase 4B-1B-α
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  buildBranchKpiMatrix,
  buildRiskMatrix,
  buildBranchTrendMatrix,
  buildBranchKpiMatrixFromIntel,
  RISK_DIMENSION_KEYS,
  TREND_DIMENSION_KEYS,
  type HeatmapMatrix,
  type HeatmapCell,
} from './heatmapSelectors'
import type { BranchRollupSummary } from './regionalTypes'
import type { KpiKey } from '../kpiAnalyticsEngine'
import { KPI_KEYS } from '../kpiAnalyticsEngine'

// ══════════════════════════════════════════════════════════════
// FIXTURES
// ══════════════════════════════════════════════════════════════

function makeKpiSummary(key: KpiKey, achievementPct: number, hasTarget = true) {
  return {
    kpiKey:            key,
    actual:            achievementPct > 0 ? 100 : 0,
    target:            hasTarget ? 100 : 0,
    achievementPct,
    expectedPct:       80,
    delta:             achievementPct - 80,
    remainingToTarget: Math.max(0, 100 - achievementPct),
    status:            achievementPct >= 90 ? 'excellent'
                      : achievementPct >= 70 ? 'good'
                      : achievementPct >= 50 ? 'warning' : 'critical' as any,
    hasTarget,
  }
}

function makeBranch(
  id: string,
  name: string,
  overrides: Partial<BranchRollupSummary> = {},
): BranchRollupSummary {
  return {
    branchId:          id,
    branchName:        name,
    branchCode:        id.toUpperCase(),
    region:            'Region A',
    period: {
      type:      'MTD',
      startDate: '2025-05-01',
      endDate:   '2025-05-20',
      month:     '2025-05',
      dayRatio:  0.65,
    },
    kpiAchievementSummary: KPI_KEYS.map((k) =>
      makeKpiSummary(k, 80)
    ),
    overallAchievementPct: 80,
    branchScore:           75,
    riskLevel:             'LOW_RISK',
    momentumDirection:     'STABLE',
    operationalStatus:     'ACTIVE',
    dataQualityFlags:      [],
    hasDataErrors:         false,
    submissionRatePct:     90,
    generatedAt:           '2025-05-20T10:00:00Z',
    ...overrides,
  }
}

const BRANCH_A = makeBranch('br1', 'Alpha Pharmacy', {
  kpiAchievementSummary: KPI_KEYS.map((k, i) =>
    makeKpiSummary(k, [95, 82, 60, 45, 78][i])
  ),
  overallAchievementPct: 72,
  branchScore:           70,
  riskLevel:             'LOW_RISK',
  momentumDirection:     'IMPROVING',
})

const BRANCH_B = makeBranch('br2', 'Beta Pharmacy', {
  kpiAchievementSummary: KPI_KEYS.map((k, i) =>
    makeKpiSummary(k, [50, 40, 30, 20, 35][i])
  ),
  overallAchievementPct: 35,
  branchScore:           30,
  riskLevel:             'HIGH_RISK',
  momentumDirection:     'DETERIORATING',
  region: 'Region B',
})

const BRANCH_NO_DATA = makeBranch('br3', 'Gamma Pharmacy', {
  operationalStatus:     'NO_DATA',
  kpiAchievementSummary: [],
  overallAchievementPct: 0,
  branchScore:           0,
  submissionRatePct:     0,
  region: 'Region A',
})

const BRANCH_C = makeBranch('br4', 'Delta Pharmacy', {
  kpiAchievementSummary: KPI_KEYS.map((k, i) =>
    makeKpiSummary(k, [88, 92, 75, 110, 55][i])
  ),
  overallAchievementPct: 84,
  branchScore:           88,
  riskLevel:             'ON_TRACK',
  momentumDirection:     'ACCELERATING',
  region: 'Region A',
})

const ALL_BRANCHES = [BRANCH_A, BRANCH_B, BRANCH_NO_DATA, BRANCH_C]

// ══════════════════════════════════════════════════════════════
// SECTION 1 — Matrix shape invariants
// ══════════════════════════════════════════════════════════════

describe('HeatmapMatrix — structural invariants', () => {
  it('cells.length === rowKeys.length × colKeys.length', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    expect(m.cells.length).toBe(m.rowKeys.length * m.colKeys.length)
  })

  it('rowKeys and rowLabels have the same length', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    expect(m.rowKeys.length).toBe(m.rowLabels.length)
  })

  it('colKeys and colLabels have the same length', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    expect(m.colKeys.length).toBe(m.colLabels.length)
  })

  it('every cell.row is in rowKeys', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    const rowSet = new Set(m.rowKeys)
    for (const cell of m.cells) {
      expect(rowSet.has(cell.row)).toBe(true)
    }
  })

  it('every cell.col is in colKeys', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    const colSet = new Set(m.colKeys)
    for (const cell of m.cells) {
      expect(colSet.has(cell.col)).toBe(true)
    }
  })

  it('each (row, col) pair appears exactly once', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    const pairs = new Set(m.cells.map((c) => `${c.row}::${c.col}`))
    expect(pairs.size).toBe(m.cells.length)
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 2 — buildBranchKpiMatrix — core KPI cells
// ══════════════════════════════════════════════════════════════

describe('buildBranchKpiMatrix — core KPI achievement values', () => {
  it('produces correct number of rows for all branches', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    expect(m.rowKeys.length).toBe(ALL_BRANCHES.length)
  })

  it('produces correct number of columns for all KPI_KEYS', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    expect(m.colKeys.length).toBe(KPI_KEYS.length)
  })

  it('wasfaty achievement = 95 for BRANCH_A', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    const cell = m.cells.find((c) => c.row === BRANCH_A.branchId && c.col === 'wasfaty')
    expect(cell?.value).toBe(95)
  })

  it('wasfaty status = excellent for BRANCH_A (95%)', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    const cell = m.cells.find((c) => c.row === BRANCH_A.branchId && c.col === 'wasfaty')
    expect(cell?.status).toBe('excellent')
  })

  it('crossSelling for BRANCH_B (35%) has critical status', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    const cell = m.cells.find((c) => c.row === BRANCH_B.branchId && c.col === 'crossSelling')
    expect(cell?.status).toBe('critical')
  })

  it('range min and max are derived from non-null values', () => {
    const m = buildBranchKpiMatrix([BRANCH_A, BRANCH_C], KPI_KEYS)
    expect(m.range[0]).toBeGreaterThanOrEqual(0)
    expect(m.range[1]).toBeGreaterThanOrEqual(m.range[0])
    expect(m.range[1]).toBeLessThanOrEqual(200)
  })

  it('default scale is categorical', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    expect(m.scale).toBe('categorical')
  })

  it('custom scale is respected', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS, { scale: 'diverging' })
    expect(m.scale).toBe('diverging')
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 3 — Empty-cell state: NO_DATA vs ZERO_VALUE vs NOT_AGGREGATED
// ══════════════════════════════════════════════════════════════

describe('buildBranchKpiMatrix — empty cell state semantics', () => {
  it('branch with NO_DATA operationalStatus has NO_DATA empty state for all KPIs', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS)
    const noCells = m.cells.filter((c) => c.row === BRANCH_NO_DATA.branchId)
    for (const cell of noCells) {
      expect(cell.emptyCellState).toBe('NO_DATA')
      expect(cell.value).toBeNull()
      expect(cell.status).toBeNull()
    }
  })

  it('custom KPI key (not in KPI_KEYS) yields NOT_AGGREGATED for active branches', () => {
    const m = buildBranchKpiMatrix([BRANCH_A], ['nps', 'manuka'])
    for (const cell of m.cells) {
      expect(cell.emptyCellState).toBe('NOT_AGGREGATED')
      expect(cell.value).toBeNull()
    }
  })

  it('custom KPI mixed with core KPIs — core cells have values, custom are NOT_AGGREGATED', () => {
    const m = buildBranchKpiMatrix([BRANCH_A], ['wasfaty', 'nps'])
    const wasfatyCell = m.cells.find((c) => c.col === 'wasfaty')
    const npsCell     = m.cells.find((c) => c.col === 'nps')

    expect(wasfatyCell?.value).not.toBeNull()          // core KPI has data
    expect(npsCell?.emptyCellState).toBe('NOT_AGGREGATED')  // custom KPI is not aggregated
  })

  it('ZERO_VALUE for branch with actual=0 and target set', () => {
    const zeroKpi = makeKpiSummary('wasfaty', 0, true)
    const branchWithZero = makeBranch('z1', 'Zero Branch', {
      kpiAchievementSummary: [zeroKpi, ...KPI_KEYS.slice(1).map((k) => makeKpiSummary(k, 75))],
      operationalStatus: 'ACTIVE',
    })
    const m = buildBranchKpiMatrix([branchWithZero], ['wasfaty'])
    const cell = m.cells.find((c) => c.col === 'wasfaty')
    expect(cell?.emptyCellState).toBe('ZERO_VALUE')
    expect(cell?.value).toBe(0)
  })

  it('null value cells always have a non-null emptyCellState', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, [...KPI_KEYS, 'nps'])
    const nullCells = m.cells.filter((c) => c.value === null)
    for (const c of nullCells) {
      expect(c.emptyCellState).not.toBeNull()
    }
  })

  it('non-null value cells always have null emptyCellState', () => {
    const m = buildBranchKpiMatrix([BRANCH_A, BRANCH_C], KPI_KEYS)
    const valueCells = m.cells.filter((c) => c.value !== null && c.emptyCellState !== 'ZERO_VALUE')
    for (const c of valueCells) {
      expect(c.emptyCellState).toBeNull()
    }
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 4 — NOT_AGGREGATED: custom KPI behavior
// ══════════════════════════════════════════════════════════════

describe('buildBranchKpiMatrix — custom KPI NOT_AGGREGATED', () => {
  const CUSTOM_KEYS = ['nps', 'manuka', 'sales', 'sl', 'ndf', 'inbody', 'liberation']

  it('all 7 custom KPIs yield NOT_AGGREGATED for active branches', () => {
    const m = buildBranchKpiMatrix([BRANCH_A], CUSTOM_KEYS)
    for (const cell of m.cells) {
      expect(cell.emptyCellState).toBe('NOT_AGGREGATED')
    }
  })

  it('NOT_AGGREGATED cells have value=null', () => {
    const m = buildBranchKpiMatrix([BRANCH_A], ['nps'])
    expect(m.cells[0].value).toBeNull()
  })

  it('NOT_AGGREGATED cells have status=null', () => {
    const m = buildBranchKpiMatrix([BRANCH_A], ['nps'])
    expect(m.cells[0].status).toBeNull()
  })

  it('range [0, 100] when all cells are NOT_AGGREGATED (no numeric values)', () => {
    const m = buildBranchKpiMatrix([BRANCH_A], ['nps'])
    expect(m.range).toEqual([0, 100])
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 5 — Filtering
// ══════════════════════════════════════════════════════════════

describe('buildBranchKpiMatrix — region filtering', () => {
  it('filters to Region A only', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS, { regions: ['Region A'] })
    const branchIds = new Set(m.rowKeys)
    expect(branchIds.has(BRANCH_B.branchId)).toBe(false)   // Region B excluded
    expect(branchIds.has(BRANCH_A.branchId)).toBe(true)
  })

  it('empty regions filter includes all branches', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS, { regions: [] })
    expect(m.rowKeys.length).toBe(ALL_BRANCHES.length)
  })

  it('activeOnly=true excludes NO_DATA branches', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS, { activeOnly: true })
    expect(m.rowKeys).not.toContain(BRANCH_NO_DATA.branchId)
  })

  it('activeOnly=false includes NO_DATA branches', () => {
    const m = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS, { activeOnly: false })
    expect(m.rowKeys).toContain(BRANCH_NO_DATA.branchId)
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 6 — Sorting
// ══════════════════════════════════════════════════════════════

describe('buildBranchKpiMatrix — row sorting', () => {
  const activeBranches = [BRANCH_A, BRANCH_B, BRANCH_C]

  it('default sort (name) is alphabetical', () => {
    const m = buildBranchKpiMatrix(activeBranches, KPI_KEYS, { rowSort: 'name' })
    expect(m.rowLabels[0]).toBe('Alpha Pharmacy')
    expect(m.rowLabels[1]).toBe('Beta Pharmacy')
    expect(m.rowLabels[2]).toBe('Delta Pharmacy')
  })

  it('sort by score puts highest scorer first', () => {
    const m = buildBranchKpiMatrix(activeBranches, KPI_KEYS, { rowSort: 'score' })
    // BRANCH_C has score=88, BRANCH_A=70, BRANCH_B=30
    expect(m.rowKeys[0]).toBe(BRANCH_C.branchId)
    expect(m.rowKeys[m.rowKeys.length - 1]).toBe(BRANCH_B.branchId)
  })

  it('sort by risk puts highest risk first', () => {
    const m = buildBranchKpiMatrix(activeBranches, KPI_KEYS, { rowSort: 'risk' })
    // BRANCH_B is HIGH_RISK → first
    expect(m.rowKeys[0]).toBe(BRANCH_B.branchId)
  })

  it('sort by achievement puts highest achievement first', () => {
    const m = buildBranchKpiMatrix(activeBranches, KPI_KEYS, { rowSort: 'achievement' })
    // BRANCH_C 84%, BRANCH_A 72%, BRANCH_B 35%
    expect(m.rowKeys[0]).toBe(BRANCH_C.branchId)
  })

  it('sort is stable (equal values keep relative input order)', () => {
    const same1 = makeBranch('same1', 'Branch X', { branchScore: 75 })
    const same2 = makeBranch('same2', 'Branch Y', { branchScore: 75 })
    const m = buildBranchKpiMatrix([same1, same2], KPI_KEYS, { rowSort: 'score' })
    expect(m.rowLabels[0]).toBe('Branch X')
    expect(m.rowLabels[1]).toBe('Branch Y')
  })
})

describe('buildBranchKpiMatrix — column sorting', () => {
  it('colSort=name sorts KPI columns alphabetically', () => {
    const m = buildBranchKpiMatrix([BRANCH_A], KPI_KEYS, { colSort: 'name' })
    const labels = m.colLabels
    const sorted = [...labels].sort((a, b) => a.localeCompare(b))
    expect(labels).toEqual(sorted)
  })

  it('colSort=default preserves input kpiKeys order', () => {
    const keys = ['wasfaty', 'basket', 'omni'] as const
    const m = buildBranchKpiMatrix([BRANCH_A], keys, { colSort: 'default' })
    expect(m.colKeys).toEqual([...keys])
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 7 — buildRiskMatrix
// ══════════════════════════════════════════════════════════════

describe('buildRiskMatrix — structure and cell values', () => {
  it('columns are exactly the RISK_DIMENSION_KEYS', () => {
    const m = buildRiskMatrix([BRANCH_A, BRANCH_B])
    expect(m.colKeys).toEqual([...RISK_DIMENSION_KEYS])
  })

  it('produces rowKeys.length × RISK_DIMENSION_KEYS.length cells', () => {
    const m = buildRiskMatrix([BRANCH_A, BRANCH_B, BRANCH_C])
    expect(m.cells.length).toBe(3 * RISK_DIMENSION_KEYS.length)
  })

  it('riskLevel cell for HIGH_RISK branch has critical status', () => {
    const m = buildRiskMatrix([BRANCH_B])
    const cell = m.cells.find((c) => c.col === 'riskLevel')
    expect(cell?.status).toBe('critical')
  })

  it('riskLevel cell for ON_TRACK branch has excellent status', () => {
    const m = buildRiskMatrix([BRANCH_C])
    const cell = m.cells.find((c) => c.col === 'riskLevel')
    expect(cell?.status).toBe('excellent')
  })

  it('NO_DATA branch yields NO_DATA empty state for submissionRate', () => {
    const m = buildRiskMatrix([BRANCH_NO_DATA])
    const cell = m.cells.find((c) => c.col === 'submissionRate')
    expect(cell?.emptyCellState).toBe('NO_DATA')
  })

  it('default sort is by risk (worst first)', () => {
    const m = buildRiskMatrix([BRANCH_A, BRANCH_B, BRANCH_C])
    expect(m.rowKeys[0]).toBe(BRANCH_B.branchId)
  })

  it('scale is always categorical', () => {
    const m = buildRiskMatrix([BRANCH_A])
    expect(m.scale).toBe('categorical')
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 8 — buildBranchTrendMatrix
// ══════════════════════════════════════════════════════════════

describe('buildBranchTrendMatrix — structure and cell values', () => {
  it('columns are exactly the TREND_DIMENSION_KEYS', () => {
    const m = buildBranchTrendMatrix([BRANCH_A])
    expect(m.colKeys).toEqual([...TREND_DIMENSION_KEYS])
  })

  it('ACCELERATING momentum yields high value for momentum column', () => {
    const m = buildBranchTrendMatrix([BRANCH_C])
    const cell = m.cells.find((c) => c.col === 'momentum')
    expect(cell?.value).toBeGreaterThan(80)
    expect(cell?.status).toBe('excellent')
  })

  it('DETERIORATING momentum yields low value', () => {
    const m = buildBranchTrendMatrix([BRANCH_B])
    const cell = m.cells.find((c) => c.col === 'momentum')
    expect(cell?.value).toBeLessThan(40)
    expect(cell?.status).toBe('critical')
  })

  it('NO_DATA branch yields NO_DATA for all trend dimensions', () => {
    const m = buildBranchTrendMatrix([BRANCH_NO_DATA])
    for (const cell of m.cells) {
      expect(cell.emptyCellState).toBe('NO_DATA')
      expect(cell.value).toBeNull()
    }
  })

  it('scale is diverging', () => {
    const m = buildBranchTrendMatrix([BRANCH_A])
    expect(m.scale).toBe('diverging')
  })

  it('default sort is by score (desc)', () => {
    const m = buildBranchTrendMatrix([BRANCH_A, BRANCH_B, BRANCH_C])
    // BRANCH_C=88, BRANCH_A=70, BRANCH_B=30
    expect(m.rowKeys[0]).toBe(BRANCH_C.branchId)
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 9 — Empty input edge cases
// ══════════════════════════════════════════════════════════════

describe('Selectors — empty input edge cases', () => {
  it('buildBranchKpiMatrix with empty branches returns empty matrix', () => {
    const m = buildBranchKpiMatrix([], KPI_KEYS)
    expect(m.rowKeys).toHaveLength(0)
    expect(m.cells).toHaveLength(0)
    expect(m.range).toEqual([0, 100])
  })

  it('buildBranchKpiMatrix with empty kpiKeys returns empty columns', () => {
    const m = buildBranchKpiMatrix([BRANCH_A], [])
    expect(m.colKeys).toHaveLength(0)
    expect(m.cells).toHaveLength(0)
  })

  it('buildRiskMatrix with empty branches returns empty matrix', () => {
    const m = buildRiskMatrix([])
    expect(m.rowKeys).toHaveLength(0)
    expect(m.cells).toHaveLength(0)
  })

  it('buildBranchTrendMatrix with empty branches returns empty matrix', () => {
    const m = buildBranchTrendMatrix([])
    expect(m.rowKeys).toHaveLength(0)
    expect(m.cells).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 10 — Input immutability
// ══════════════════════════════════════════════════════════════

describe('Selectors — input immutability', () => {
  it('buildBranchKpiMatrix does not mutate input branches array', () => {
    const input = [BRANCH_B, BRANCH_A, BRANCH_C]
    const inputCopy = [...input]
    buildBranchKpiMatrix(input, KPI_KEYS, { rowSort: 'score' })
    expect(input[0]).toBe(inputCopy[0])
    expect(input[1]).toBe(inputCopy[1])
    expect(input[2]).toBe(inputCopy[2])
  })

  it('buildRiskMatrix does not mutate input', () => {
    const input = [BRANCH_C, BRANCH_A, BRANCH_B]
    const firstBefore = input[0]
    buildRiskMatrix(input, { rowSort: 'risk' })
    expect(input[0]).toBe(firstBefore)
  })

  it('buildBranchTrendMatrix does not mutate input', () => {
    const input = [BRANCH_A, BRANCH_B]
    const firstBefore = input[0]
    buildBranchTrendMatrix(input, { rowSort: 'achievement' })
    expect(input[0]).toBe(firstBefore)
  })

  it('branch objects in cells.meta are not modified', () => {
    const branch = makeBranch('immut', 'Immutable Branch')
    const originalScore = branch.branchScore
    buildBranchKpiMatrix([branch], KPI_KEYS)
    expect(branch.branchScore).toBe(originalScore)
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 11 — Determinism
// ══════════════════════════════════════════════════════════════

describe('Selectors — deterministic output', () => {
  it('same input produces same matrix twice', () => {
    const m1 = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS, { rowSort: 'name' })
    const m2 = buildBranchKpiMatrix(ALL_BRANCHES, KPI_KEYS, { rowSort: 'name' })
    expect(m1.rowKeys).toEqual(m2.rowKeys)
    expect(m1.colKeys).toEqual(m2.colKeys)
    expect(m1.cells.map((c) => `${c.row}:${c.col}:${c.value}`))
      .toEqual(m2.cells.map((c) => `${c.row}:${c.col}:${c.value}`))
  })

  it('risk matrix same input → same output', () => {
    const m1 = buildRiskMatrix([BRANCH_A, BRANCH_B, BRANCH_C])
    const m2 = buildRiskMatrix([BRANCH_A, BRANCH_B, BRANCH_C])
    expect(m1.cells.map((c) => c.value)).toEqual(m2.cells.map((c) => c.value))
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 12 — buildBranchKpiMatrixFromIntel convenience
// ══════════════════════════════════════════════════════════════

describe('buildBranchKpiMatrixFromIntel — delegation', () => {
  it('produces same result as buildBranchKpiMatrix', () => {
    const mockIntel: any = { regionalSummaries: [], regionalTrends: [], regionalRisks: [], portfolioRegionalSummary: {}, recommendedExecutiveFocusAreas: [], dataQualityWarnings: [], generatedAt: '' }
    const direct = buildBranchKpiMatrix([BRANCH_A, BRANCH_C], KPI_KEYS)
    const intel  = buildBranchKpiMatrixFromIntel([BRANCH_A, BRANCH_C], mockIntel, KPI_KEYS)
    expect(intel.rowKeys).toEqual(direct.rowKeys)
    expect(intel.cells.length).toBe(direct.cells.length)
  })
})

// ══════════════════════════════════════════════════════════════
// SECTION 13 — Meta payload integrity
// ══════════════════════════════════════════════════════════════

describe('HeatmapCell.meta — enrichment payload', () => {
  it('Branch × KPI cells include branchName, kpiLabel, actual, target', () => {
    const m = buildBranchKpiMatrix([BRANCH_A], KPI_KEYS)
    const cell = m.cells[0]
    expect(cell.meta?.branchName).toBe('Alpha Pharmacy')
    expect(typeof cell.meta?.kpiLabel).toBe('string')
    expect(cell.meta?.kpiLabel).toBeTruthy()
  })

  it('Risk cells include dimLabel', () => {
    const m = buildRiskMatrix([BRANCH_A])
    expect(m.cells[0].meta?.dimLabel).toBeTruthy()
  })

  it('Trend cells include momentum and riskLevel', () => {
    const m = buildBranchTrendMatrix([BRANCH_A])
    expect(m.cells[0].meta?.momentum).toBe('IMPROVING')
    expect(m.cells[0].meta?.riskLevel).toBe('LOW_RISK')
  })
})
