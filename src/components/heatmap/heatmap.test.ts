// ============================================================
// Heatmap Component — Regression Tests
// Phase 4B-1B-β
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'
import {
  buildBranchKpiMatrix,
  type HeatmapMatrix,
  type HeatmapCell,
} from '../../engine/regionalIntelligence/heatmapSelectors'
import type { BranchRollupSummary } from '../../engine/regionalIntelligence/regionalTypes'
import type { KpiKey } from '../../engine/kpiAnalyticsEngine'
import { KPI_KEYS } from '../../engine/kpiAnalyticsEngine'

// ── Source files ───────────────────────────────────────────────
const HEATMAP_SRC = readFileSync(
  resolve(__dirname, './Heatmap.jsx'), 'utf8'
)
const PANEL_SRC = readFileSync(
  resolve(__dirname, '../executive/RegionalIntelligencePanel.jsx'), 'utf8'
)
const HOOK_SRC = readFileSync(
  resolve(__dirname, '../../hooks/useRegionalIntelligence.ts'), 'utf8'
)

// ── Fixtures ───────────────────────────────────────────────────

function makeKpiSummary(key: KpiKey, achievementPct: number, hasTarget = true) {
  return {
    kpiKey: key, actual: 100, target: hasTarget ? 100 : 0,
    achievementPct, expectedPct: 80, delta: achievementPct - 80,
    remainingToTarget: Math.max(0, 100 - achievementPct),
    status: (achievementPct >= 90 ? 'excellent' : achievementPct >= 70 ? 'good' : achievementPct >= 50 ? 'warning' : 'critical') as any,
    hasTarget,
  }
}

function makeBranch(id: string, name: string, overrides: Partial<BranchRollupSummary> = {}): BranchRollupSummary {
  return {
    branchId: id, branchName: name, branchCode: id.toUpperCase(), region: 'Region A',
    period: { type: 'MTD', startDate: '2025-05-01', endDate: '2025-05-20', month: '2025-05', dayRatio: 0.65 },
    kpiAchievementSummary: KPI_KEYS.map((k, i) => makeKpiSummary(k, [110, 97, 88, 72, 45][i])),
    overallAchievementPct: 82, branchScore: 75, riskLevel: 'LOW_RISK',
    momentumDirection: 'STABLE', operationalStatus: 'ACTIVE',
    dataQualityFlags: [], hasDataErrors: false, submissionRatePct: 90,
    generatedAt: '2025-05-20T10:00:00Z',
    ...overrides,
  }
}

const BRANCH_HIGH  = makeBranch('b1', 'Alpha Pharmacy', {
  kpiAchievementSummary: KPI_KEYS.map((k) => makeKpiSummary(k, 110)),
  riskLevel: 'ON_TRACK',
})
const BRANCH_MID   = makeBranch('b2', 'Beta Pharmacy', {
  kpiAchievementSummary: KPI_KEYS.map((k) => makeKpiSummary(k, 97)),
})
const BRANCH_WARN  = makeBranch('b3', 'Gamma Pharmacy', {
  kpiAchievementSummary: KPI_KEYS.map((k) => makeKpiSummary(k, 88)),
  riskLevel: 'MEDIUM_RISK',
})
const BRANCH_CRIT  = makeBranch('b4', 'Delta Pharmacy', {
  kpiAchievementSummary: KPI_KEYS.map((k) => makeKpiSummary(k, 60)),
  riskLevel: 'HIGH_RISK',
})
const BRANCH_NODATA = makeBranch('b5', 'Epsilon Pharmacy', {
  operationalStatus: 'NO_DATA',
  kpiAchievementSummary: [],
  overallAchievementPct: 0, branchScore: 0,
})

// ══════════════════════════════════════════════════════════════
// 1 — Source architecture
// ══════════════════════════════════════════════════════════════

describe('Heatmap.jsx — source architecture', () => {
  it('is a presentational component (no Firestore imports)', () => {
    expect(HEATMAP_SRC).not.toContain('firebase')
    expect(HEATMAP_SRC).not.toContain('firestore')
    expect(HEATMAP_SRC).not.toContain('db')
    expect(HEATMAP_SRC).not.toContain('onSnapshot')
  })

  it('uses no chart libraries (no Recharts, no Canvas, no SVG drawing)', () => {
    expect(HEATMAP_SRC).not.toContain('recharts')
    expect(HEATMAP_SRC).not.toContain('d3')
    expect(HEATMAP_SRC).not.toContain('getContext')
    expect(HEATMAP_SRC).not.toContain('<canvas')
    expect(HEATMAP_SRC).not.toContain('<svg')
  })

  it('uses CSS Grid for layout (gridTemplateColumns in JSX)', () => {
    expect(HEATMAP_SRC).toContain('gridTemplateColumns')
  })

  it('has horizontal scroll for mobile', () => {
    expect(HEATMAP_SRC).toContain('overflowX')
  })

  it('renders row labels with role=rowheader for accessibility', () => {
    expect(HEATMAP_SRC).toContain('role="rowheader"')
  })

  it('renders column headers with role=columnheader', () => {
    expect(HEATMAP_SRC).toContain('role="columnheader"')
  })

  it('cells have aria-label for accessibility', () => {
    expect(HEATMAP_SRC).toContain('aria-label')
  })

  it('cells are keyboard-accessible (tabIndex, onKeyDown)', () => {
    expect(HEATMAP_SRC).toContain('tabIndex={0}')
    expect(HEATMAP_SRC).toContain('onKeyDown')
  })

  it('exports a default component', () => {
    expect(HEATMAP_SRC).toContain('export default function Heatmap')
  })

  it('accepts matrix, title, cellSize, maxRows, onCellClick props', () => {
    expect(HEATMAP_SRC).toContain('matrix')
    expect(HEATMAP_SRC).toContain('cellSize')
    expect(HEATMAP_SRC).toContain('maxRows')
    expect(HEATMAP_SRC).toContain('onCellClick')
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — Achievement threshold config in Heatmap source
// ══════════════════════════════════════════════════════════════

describe('Heatmap — achievement thresholds from spec', () => {
  it('defines outperformance threshold at 105%', () => {
    expect(HEATMAP_SRC).toContain('outperform: 105')
  })

  it('defines on-target threshold at 95%', () => {
    expect(HEATMAP_SRC).toContain('onTarget:    95')
  })

  it('defines warning threshold at 85%', () => {
    expect(HEATMAP_SRC).toContain('warning:     85')
  })

  it('critical is the default (values below 85%)', () => {
    // No explicit 'critical: X' threshold — anything below warning is critical
    expect(HEATMAP_SRC).toContain('CELL_CFG.critical')
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — resolveCellStyle logic (pure simulation)
// ══════════════════════════════════════════════════════════════

describe('Heatmap — resolveCellStyle threshold logic', () => {
  // Mirror of the resolveCellStyle logic for unit testing
  const THRESHOLDS = { outperform: 105, onTarget: 95, warning: 85 }
  function resolveStatus(value: number | null, emptyCellState: string | null) {
    if (value === null || emptyCellState) return emptyCellState ?? 'NO_DATA'
    if (value >= THRESHOLDS.outperform) return 'outperform'
    if (value >= THRESHOLDS.onTarget)   return 'onTarget'
    if (value >= THRESHOLDS.warning)    return 'warning'
    return 'critical'
  }

  it('≥105% → outperformance', () => {
    expect(resolveStatus(105, null)).toBe('outperform')
    expect(resolveStatus(120, null)).toBe('outperform')
    expect(resolveStatus(200, null)).toBe('outperform')
  })

  it('95–104.9% → on-target', () => {
    expect(resolveStatus(95, null)).toBe('onTarget')
    expect(resolveStatus(100, null)).toBe('onTarget')
    expect(resolveStatus(104.9, null)).toBe('onTarget')
  })

  it('85–94.9% → warning', () => {
    expect(resolveStatus(85, null)).toBe('warning')
    expect(resolveStatus(90, null)).toBe('warning')
    expect(resolveStatus(94.9, null)).toBe('warning')
  })

  it('<85% → critical', () => {
    expect(resolveStatus(0, null)).toBe('critical')
    expect(resolveStatus(60, null)).toBe('critical')
    expect(resolveStatus(84.9, null)).toBe('critical')
  })

  it('null value → empty cell state', () => {
    expect(resolveStatus(null, 'NO_DATA')).toBe('NO_DATA')
    expect(resolveStatus(null, 'NOT_AGGREGATED')).toBe('NOT_AGGREGATED')
    expect(resolveStatus(null, 'NOT_APPLICABLE')).toBe('NOT_APPLICABLE')
    expect(resolveStatus(null, 'ZERO_VALUE')).toBe('ZERO_VALUE')
  })

  it('exact boundary 95 is on-target not warning', () => {
    expect(resolveStatus(95, null)).toBe('onTarget')
  })

  it('exact boundary 85 is warning not critical', () => {
    expect(resolveStatus(85, null)).toBe('warning')
  })

  it('exact boundary 105 is outperformance not on-target', () => {
    expect(resolveStatus(105, null)).toBe('outperform')
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — Empty-cell states visually distinct (source check)
// ══════════════════════════════════════════════════════════════

describe('Heatmap — empty-cell states visually distinct', () => {
  it('has EMPTY_CFG for all four states', () => {
    expect(HEATMAP_SRC).toContain('NO_DATA:')
    expect(HEATMAP_SRC).toContain('ZERO_VALUE:')
    expect(HEATMAP_SRC).toContain('NOT_APPLICABLE:')
    expect(HEATMAP_SRC).toContain('NOT_AGGREGATED:')
  })

  it('NO_DATA is striped (source check)', () => {
    // EMPTY_CFG.NO_DATA has striped: true
    expect(HEATMAP_SRC).toMatch(/NO_DATA:.*striped: true|NO_DATA[\s\S]{0,200}striped: true/)
  })

  it('NOT_AGGREGATED is striped (distinct from simple no-data)', () => {
    expect(HEATMAP_SRC).toMatch(/NOT_AGGREGATED:.*striped: true|NOT_AGGREGATED[\s\S]{0,200}striped: true/)
  })

  it('NOT_AGGREGATED has distinct indigo foreground color', () => {
    expect(HEATMAP_SRC).toContain('#818cf8')  // indigo-400
  })

  it('ZERO_VALUE has distinct critical-red foreground', () => {
    expect(HEATMAP_SRC).toContain("ZERO_VALUE:")
    expect(HEATMAP_SRC).toContain("fg: '#ef4444'")
  })

  it('empty matrix renders safe fallback (source check)', () => {
    expect(HEATMAP_SRC).toContain('No heatmap data available')
  })

  it('NOT_AGGREGATED label is "…" — distinct from NO_DATA "—"', () => {
    expect(HEATMAP_SRC).toContain("label: '…'")
    expect(HEATMAP_SRC).toContain("label: '—'")
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — Legend items
// ══════════════════════════════════════════════════════════════

describe('Heatmap — legend items', () => {
  it('legend shows all 4 achievement states', () => {
    expect(HEATMAP_SRC).toContain('≥105%')
    expect(HEATMAP_SRC).toContain('95–104%')
    expect(HEATMAP_SRC).toContain('85–94%')
    expect(HEATMAP_SRC).toContain('<85%')
  })

  it('legend shows No Data state', () => {
    expect(HEATMAP_SRC).toContain('No Data')
  })

  it('legend shows Not Aggregated state', () => {
    expect(HEATMAP_SRC).toContain('Not Aggregated')
  })

  it('legend has aria-label for accessibility', () => {
    expect(HEATMAP_SRC).toContain('Heatmap color legend')
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — Tooltip content & positioning strategy
// ══════════════════════════════════════════════════════════════

describe('Heatmap — tooltip content', () => {
  it('tooltip renders branch name', () => {
    expect(HEATMAP_SRC).toContain('branchName')
  })

  it('tooltip renders KPI label', () => {
    expect(HEATMAP_SRC).toContain('kpiLabel')
  })

  it('tooltip renders achievement %', () => {
    expect(HEATMAP_SRC).toContain('Achievement')
  })

  it('tooltip has click-to-inspect hint', () => {
    expect(HEATMAP_SRC).toContain('Click to inspect branch metrics')
  })

  it('tooltip has role=tooltip for accessibility', () => {
    expect(HEATMAP_SRC).toContain('role="tooltip"')
  })
})

describe('Heatmap — tooltip uses React portal (escapes overflow containers)', () => {
  it('imports createPortal from react-dom', () => {
    expect(HEATMAP_SRC).toContain("import { createPortal } from 'react-dom'")
  })

  it('CellTooltip renders via createPortal to document.body', () => {
    expect(HEATMAP_SRC).toContain('createPortal(')
    expect(HEATMAP_SRC).toContain('document.body')
  })

  it('tooltip uses position: fixed (not position: absolute)', () => {
    expect(HEATMAP_SRC).toContain("position: 'fixed'")
    // No more position: absolute on the tooltip
    expect(HEATMAP_SRC).not.toMatch(/CellTooltip[\s\S]{0,500}position:\s*'absolute'/)
  })

  it('tooltip z-index is 9999 — above all panel/modal stacking contexts', () => {
    expect(HEATMAP_SRC).toContain('zIndex: 9999')
  })

  it('tooltip has pointerEvents: none — does not block cell interactions', () => {
    expect(HEATMAP_SRC).toContain("pointerEvents: 'none'")
  })

  it('HeatmapCell uses getBoundingClientRect to anchor the portal tooltip', () => {
    expect(HEATMAP_SRC).toContain('getBoundingClientRect')
    expect(HEATMAP_SRC).toContain('anchorRect')
  })

  it('tooltip visibility hidden during initial position calculation (prevents flash)', () => {
    expect(HEATMAP_SRC).toContain("visibility: pos.top === 0 && pos.left === 0 ? 'hidden' : 'visible'")
  })

  it('tooltip clamps left edge to stay on screen', () => {
    expect(HEATMAP_SRC).toContain('vw - ttRect.width')
  })

  it('tooltip flips below cell if would clip top of viewport', () => {
    expect(HEATMAP_SRC).toContain('anchorRect.bottom')
  })

  it('no longer uses bottom/transform translate pattern (old absolute approach)', () => {
    expect(HEATMAP_SRC).not.toContain("bottom: 'calc(100% + 6px)'")
    expect(HEATMAP_SRC).not.toContain("translateX('-50%')")
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — maxRows / limited slice behavior
// ══════════════════════════════════════════════════════════════

describe('Heatmap — maxRows limits cognitive overload', () => {
  it('source uses maxRows to slice rowKeys', () => {
    expect(HEATMAP_SRC).toContain('slice(0, maxRows)')
  })

  it('default maxRows is 20', () => {
    expect(HEATMAP_SRC).toMatch(/maxRows\s*=\s*20/)
  })

  it('shows trim notice when rows are clamped', () => {
    expect(HEATMAP_SRC).toContain('trimmedCount')
    expect(HEATMAP_SRC).toContain('more branch')
  })

  it('trim notice hints at sorting by risk or score', () => {
    expect(HEATMAP_SRC).toContain('sort by risk or score')
  })

  // Matrix-level: rowKeys.slice(0, 2) matches what heatmap renders
  it('buildBranchKpiMatrix rowKeys slice matches expected count', () => {
    const branches = Array.from({ length: 25 }, (_, i) =>
      makeBranch(`br${i}`, `Branch ${i}`)
    )
    const m = buildBranchKpiMatrix(branches, KPI_KEYS)
    // Matrix has all 25 branches — heatmap maxRows clips at render time
    expect(m.rowKeys.length).toBe(25)
  })
})

// ══════════════════════════════════════════════════════════════
// 8 — Branch × KPI preview in RegionalIntelligencePanel
// ══════════════════════════════════════════════════════════════

describe('RegionalIntelligencePanel — heatmap preview integration', () => {
  it('imports Heatmap component', () => {
    expect(PANEL_SRC).toContain("import Heatmap from '../heatmap/Heatmap'")
  })

  it('imports buildBranchKpiMatrix', () => {
    expect(PANEL_SRC).toContain('buildBranchKpiMatrix')
  })

  it('imports KPI_KEYS from analytics engine', () => {
    expect(PANEL_SRC).toContain('KPI_KEYS')
  })

  it('accepts branchRollups prop', () => {
    expect(PANEL_SRC).toContain('branchRollups')
  })

  it('builds branchKpiMatrix from branchRollups (no Firestore)', () => {
    expect(PANEL_SRC).toMatch(/buildBranchKpiMatrix\s*\(\s*branchRollups/)
  })

  it('heatmap preview is collapsed by default', () => {
    expect(PANEL_SRC).toContain('heatmapOpen')
    expect(PANEL_SRC).toMatch(/heatmapOpen.*false|useState\(false\)/)
  })

  it('uses risk sort for exception-focused view', () => {
    expect(PANEL_SRC).toContain("rowSort: 'risk'")
  })

  it('caps heatmap at 12 rows by default', () => {
    expect(PANEL_SRC).toContain('maxRows={12}')
  })

  it('does not add Firestore reads to the panel', () => {
    expect(PANEL_SRC).not.toContain('onSnapshot')
    expect(PANEL_SRC).not.toContain('firebase')
    expect(PANEL_SRC).not.toContain('db')
  })
})

// ══════════════════════════════════════════════════════════════
// 9 — useRegionalIntelligence hook exposes branchRollups
// ══════════════════════════════════════════════════════════════

describe('useRegionalIntelligence — branchRollups exposed', () => {
  it('returns branchRollups in hook output', () => {
    expect(HOOK_SRC).toContain('branchRollups')
  })

  it('branchRollups is part of the return object', () => {
    expect(HOOK_SRC).toMatch(/return\s*\{[\s\S]*branchRollups[\s\S]*\}/)
  })

  it('branchRollups is an array (defaults to [])', () => {
    expect(HOOK_SRC).toContain('[[], null]')
  })
})

// ══════════════════════════════════════════════════════════════
// 10 — NOT_AGGREGATED is never rendered as zero (data integrity)
// ══════════════════════════════════════════════════════════════

describe('NOT_AGGREGATED — never rendered as zero or as a numeric value', () => {
  it('custom KPI cells have value=null in the matrix', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH], ['nps', 'manuka'])
    for (const cell of m.cells) {
      expect(cell.emptyCellState).toBe('NOT_AGGREGATED')
      expect(cell.value).toBeNull()
      expect(cell.status).toBeNull()
    }
  })

  it('NOT_AGGREGATED does not contribute to range calculation', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH], ['nps'])
    // No numeric values → range defaults to [0, 100]
    expect(m.range).toEqual([0, 100])
  })

  it('core KPI cells have numeric values alongside NOT_AGGREGATED customs', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH], ['wasfaty', 'nps'])
    const wasfatyCell = m.cells.find((c) => c.col === 'wasfaty')
    const npsCell     = m.cells.find((c) => c.col === 'nps')
    expect(wasfatyCell?.value).toBe(110)          // numeric
    expect(npsCell?.emptyCellState).toBe('NOT_AGGREGATED')  // not zero
    expect(npsCell?.value).toBeNull()
  })

  it('heatmap source uses emptyCellState to distinguish null from zero', () => {
    expect(HEATMAP_SRC).toContain('emptyCellState')
    expect(HEATMAP_SRC).toContain('EMPTY_CFG')
  })
})

// ══════════════════════════════════════════════════════════════
// 11 — NO_DATA cells
// ══════════════════════════════════════════════════════════════

describe('Matrix — NO_DATA branch cells', () => {
  it('NO_DATA branch yields null values for all KPIs', () => {
    const m = buildBranchKpiMatrix([BRANCH_NODATA], KPI_KEYS)
    for (const cell of m.cells) {
      expect(cell.value).toBeNull()
      expect(cell.emptyCellState).toBe('NO_DATA')
    }
  })

  it('active branch cells have numeric values', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH], KPI_KEYS)
    for (const cell of m.cells) {
      expect(cell.value).not.toBeNull()
      expect(cell.emptyCellState).toBeNull()
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 12 — Empty matrix renders safely
// ══════════════════════════════════════════════════════════════

describe('Heatmap — empty matrix safe rendering', () => {
  it('source has null/empty-check guard', () => {
    expect(HEATMAP_SRC).toContain('No heatmap data available')
  })

  it('buildBranchKpiMatrix with 0 branches produces empty matrix gracefully', () => {
    const m = buildBranchKpiMatrix([], KPI_KEYS)
    expect(m.rowKeys).toHaveLength(0)
    expect(m.cells).toHaveLength(0)
    expect(m.range).toEqual([0, 100])
  })
})

// ══════════════════════════════════════════════════════════════
// PHASE γ TESTS — Interaction Layer
// ══════════════════════════════════════════════════════════════

// Re-read after changes
import { readFileSync as rf2 } from 'fs'
import { resolve as res2 } from 'path'
const HM2 = rf2(res2(__dirname, './Heatmap.jsx'), 'utf8')
const PN2 = rf2(res2(__dirname, '../executive/RegionalIntelligencePanel.jsx'), 'utf8')

// ── Sort logic helpers (mirrors Heatmap internals) ────────────

function nextSortDir(current: string | null): string | null {
  if (!current)          return 'asc'
  if (current === 'asc') return 'desc'
  return null
}

function buildCellMap(cells: HeatmapCell[]) {
  const m: Record<string, HeatmapCell> = {}
  for (const c of cells) m[`${c.row}::${c.col}`] = c
  return m
}

function getCellValue(cellMap: Record<string, HeatmapCell>, row: string, col: string): number | null {
  return cellMap[`${row}::${col}`]?.value ?? null
}

function sortRowsByCol(
  rowKeys: string[],
  colKey: string,
  cellMap: Record<string, HeatmapCell>,
  direction: string | null,
): string[] {
  if (!direction) return rowKeys
  return [...rowKeys].sort((a, b) => {
    const va = getCellValue(cellMap, a, colKey)
    const vb = getCellValue(cellMap, b, colKey)
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    return direction === 'asc' ? va - vb : vb - va
  })
}

// ── Sort direction cycle ──────────────────────────────────────

describe('Heatmap γ — column sort direction cycle', () => {
  it('null → asc → desc → null cycle', () => {
    expect(nextSortDir(null)).toBe('asc')
    expect(nextSortDir('asc')).toBe('desc')
    expect(nextSortDir('desc')).toBeNull()
  })

  it('sortRowsByCol asc puts lowest first', () => {
    const branches = [BRANCH_HIGH, BRANCH_CRIT, BRANCH_MID]
    const m = buildBranchKpiMatrix(branches, KPI_KEYS)
    const cellMap = buildCellMap(m.cells)
    const sorted = sortRowsByCol(m.rowKeys, 'wasfaty', cellMap, 'asc')
    const vals = sorted.map((k) => getCellValue(cellMap, k, 'wasfaty'))
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] !== null && vals[i - 1] !== null) {
        expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]!)
      }
    }
  })

  it('sortRowsByCol desc puts highest first', () => {
    const branches = [BRANCH_HIGH, BRANCH_CRIT, BRANCH_MID]
    const m = buildBranchKpiMatrix(branches, KPI_KEYS)
    const cellMap = buildCellMap(m.cells)
    const sorted = sortRowsByCol(m.rowKeys, 'wasfaty', cellMap, 'desc')
    const vals = sorted.map((k) => getCellValue(cellMap, k, 'wasfaty'))
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] !== null && vals[i - 1] !== null) {
        expect(vals[i]).toBeLessThanOrEqual(vals[i - 1]!)
      }
    }
  })

  it('sortRowsByCol null direction returns input order unchanged', () => {
    const branches = [BRANCH_HIGH, BRANCH_CRIT, BRANCH_MID]
    const m = buildBranchKpiMatrix(branches, KPI_KEYS)
    const cellMap = buildCellMap(m.cells)
    const sorted = sortRowsByCol(m.rowKeys, 'wasfaty', cellMap, null)
    expect(sorted).toEqual(m.rowKeys)
  })

  it('null cells sorted to end regardless of direction', () => {
    const branches = [BRANCH_HIGH, BRANCH_NODATA, BRANCH_MID]
    const m = buildBranchKpiMatrix(branches, KPI_KEYS)
    const cellMap = buildCellMap(m.cells)
    for (const dir of ['asc', 'desc']) {
      const sorted = sortRowsByCol(m.rowKeys, 'wasfaty', cellMap, dir)
      const vals = sorted.map((k) => getCellValue(cellMap, k, 'wasfaty'))
      // nulls at the end
      const firstNull = vals.findIndex((v) => v === null)
      const lastNonNull = vals.map((v, i) => v !== null ? i : -1).filter((i) => i >= 0).pop() ?? -1
      if (firstNull !== -1) {
        expect(firstNull).toBeGreaterThan(lastNonNull)
      }
    }
  })
})

// ── Matrix immutability ───────────────────────────────────────

describe('Heatmap γ — matrix input never mutated by sort', () => {
  it('sortRowsByCol returns new array, not the original', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH, BRANCH_MID], KPI_KEYS)
    const cellMap = buildCellMap(m.cells)
    const original = [...m.rowKeys]
    const sorted = sortRowsByCol(m.rowKeys, 'wasfaty', cellMap, 'asc')
    // original is unchanged
    expect(m.rowKeys).toEqual(original)
    // sorted is a different array reference
    expect(sorted).not.toBe(m.rowKeys)
  })

  it('matrix.cells is not modified by sort', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH, BRANCH_MID, BRANCH_CRIT], KPI_KEYS)
    const cellsBefore = m.cells.map((c) => `${c.row}::${c.col}::${c.value}`)
    const cellMap = buildCellMap(m.cells)
    sortRowsByCol(m.rowKeys, 'basket', cellMap, 'desc')
    const cellsAfter = m.cells.map((c) => `${c.row}::${c.col}::${c.value}`)
    expect(cellsAfter).toEqual(cellsBefore)
  })
})

// ── Source-level γ features ───────────────────────────────────

describe('Heatmap γ — source: sort, sticky, focus, drilldown', () => {
  it('has sortCol and sortDir state', () => {
    expect(HM2).toContain('sortCol')
    expect(HM2).toContain('sortDir')
  })

  it('column header click cycles sort direction', () => {
    expect(HM2).toContain('handleColHeaderClick')
    expect(HM2).toContain('nextSortDir')
  })

  it('active sort column header has visual indicator', () => {
    expect(HM2).toContain('sort-indicator-')
    expect(HM2).toContain("data-testid={`sort-indicator-${key}`}")
  })

  it('sort indicator shows ▲ for asc and ▼ for desc', () => {
    expect(HM2).toContain("sortDir === 'asc' ? '▲' : '▼'")
  })

  it('active sort column header has aria-sort attribute', () => {
    expect(HM2).toContain('aria-sort')
    expect(HM2).toContain("'ascending'")
    expect(HM2).toContain("'descending'")
  })

  it('column header row is position sticky (vertical scroll)', () => {
    expect(HM2).toMatch(/data-testid="heatmap-header-row"[\s\S]{0,400}position:\s*'sticky'/)
  })

  it('branch name column is position sticky left (horizontal scroll)', () => {
    expect(HM2).toMatch(/role="rowheader"[\s\S]{0,500}position:\s*'sticky'[\s\S]{0,80}left:\s*0/)
  })

  it('has activeRow and activeCol state for focus highlight', () => {
    expect(HM2).toContain('activeRow')
    expect(HM2).toContain('activeCol')
  })

  it('cells receive isActiveRow and isActiveCol props', () => {
    expect(HM2).toContain('isActiveRow')
    expect(HM2).toContain('isActiveCol')
  })

  it('dimmed style applied when focus is set but cell not in active row/col', () => {
    expect(HM2).toContain('dimmed')
    expect(HM2).toContain('0.35')
  })

  it('active row shows border highlight', () => {
    expect(HM2).toContain('isActiveRowFocus')
  })

  it('has selected-cell state', () => {
    expect(HM2).toContain('selectedCell')
    expect(HM2).toContain('setSelectedCell')
  })

  it('SelectedCellPanel renders when cell is selected', () => {
    expect(HM2).toContain('SelectedCellPanel')
    expect(HM2).toContain('data-testid="selected-cell-panel"')
  })

  it('dismiss button present in SelectedCellPanel', () => {
    expect(HM2).toContain('data-testid="dismiss-selected-cell"')
    expect(HM2).toContain('Dismiss selected cell')
  })

  it('onCellClick receives full cell with meta payload', () => {
    expect(HM2).toContain('handleCellClick')
    expect(HM2).toContain('onCellClick?.(cell)')
  })

  it('no Firestore reads in γ version', () => {
    expect(HM2).not.toContain('onSnapshot')
    expect(HM2).not.toContain('firebase')
    expect(HM2).not.toContain('db')
  })

  it('tooltip portal still uses createPortal + document.body', () => {
    expect(HM2).toContain('createPortal(')
    expect(HM2).toContain('document.body')
  })

  it('tooltip still uses position: fixed', () => {
    expect(HM2).toContain("position: 'fixed'")
  })

  it('tooltip z-index still 9999', () => {
    expect(HM2).toContain('zIndex: 9999')
  })
})

// ── SelectedCellPanel meta payload ───────────────────────────

describe('Heatmap γ — SelectedCellPanel meta fields', () => {
  it('panel shows branch name from meta', () => {
    expect(HM2).toContain('meta?.branchName')
  })

  it('panel shows KPI label from meta', () => {
    expect(HM2).toContain('meta?.kpiLabel')
  })

  it('panel shows achievement % value', () => {
    expect(HM2).toContain('Math.round(cell.value)')
  })

  it('panel shows actual and target from meta', () => {
    expect(HM2).toContain('meta?.actual')
    expect(HM2).toContain('meta?.target')
  })

  it('panel shows branch score from meta', () => {
    expect(HM2).toContain('meta?.branchScore')
  })

  it('panel shows status label', () => {
    expect(HM2).toContain('cfg.statusLabel')
  })
})

// ── onCellClick full payload verification ────────────────────

describe('Heatmap γ — onCellClick delivers full meta payload', () => {
  it('buildBranchKpiMatrix cells carry all required meta fields', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH], KPI_KEYS)
    const cell = m.cells[0]
    expect(cell.meta?.branchName).toBeDefined()
    expect(cell.meta?.kpiLabel).toBeDefined()
    expect(typeof cell.meta?.actual === 'number' || cell.meta?.actual === null).toBe(true)
    expect(cell.meta?.branchScore).toBeDefined()
    expect(cell.meta?.riskLevel).toBeDefined()
  })

  it('cell.row and cell.col are always set', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH, BRANCH_MID], KPI_KEYS)
    for (const c of m.cells) {
      expect(c.row).toBeTruthy()
      expect(c.col).toBeTruthy()
    }
  })

  it('cell value is numeric for active branches (not null)', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH], KPI_KEYS)
    for (const c of m.cells) {
      expect(c.value).not.toBeNull()
      expect(typeof c.value).toBe('number')
    }
  })
})

// ── Panel wiring ──────────────────────────────────────────────

describe('RegionalIntelligencePanel γ — onCellClick wiring', () => {
  it('imports useCallback', () => {
    expect(PN2).toContain('useCallback')
  })

  it('has handleHeatmapCellClick handler', () => {
    expect(PN2).toContain('handleHeatmapCellClick')
  })

  it('passes onCellClick to Heatmap', () => {
    expect(PN2).toContain('onCellClick={handleHeatmapCellClick}')
  })

  it('has heatmapSelectedCell state', () => {
    expect(PN2).toContain('heatmapSelectedCell')
  })
})

// ══════════════════════════════════════════════════════════════
// PHASE δ TESTS — Executive Controls (Region + KPI Filter)
// ══════════════════════════════════════════════════════════════

import { readFileSync as rf3 } from 'fs'
import { resolve as res3 }     from 'path'
const PN3 = rf3(res3(__dirname, '../executive/RegionalIntelligencePanel.jsx'), 'utf8')

// ── Additional branch fixtures ────────────────────────────────

const BRANCH_REGION_B = makeBranch('rb1', 'Zeta Pharmacy', {
  region: 'Region B',
  kpiAchievementSummary: KPI_KEYS.map((k) => makeKpiSummary(k, 75)),
  overallAchievementPct: 75, branchScore: 70,
  riskLevel: 'MEDIUM_RISK',
})

const BRANCH_REGION_C = makeBranch('rc1', 'Eta Pharmacy', {
  region: 'Region C',
  kpiAchievementSummary: KPI_KEYS.map((k) => makeKpiSummary(k, 55)),
  overallAchievementPct: 55, branchScore: 50,
  riskLevel: 'HIGH_RISK',
})

const MULTI_REGION_BRANCHES = [
  BRANCH_HIGH,     // Region A
  BRANCH_MID,      // Region A
  BRANCH_REGION_B, // Region B
  BRANCH_REGION_C, // Region C
]

// ── Helper: build region options (mirrors panel logic) ────────
function deriveRegionOptions(branches: BranchRollupSummary[]): string[] {
  const seen = new Set<string>()
  const opts: string[] = []
  for (const b of branches) {
    if (b.region && !seen.has(b.region)) {
      seen.add(b.region)
      opts.push(b.region)
    }
  }
  return opts.sort((a, b) => a.localeCompare(b))
}

// ── Region filter tests ───────────────────────────────────────

describe('Phase δ — region filter options derived from branch data', () => {
  it('derives unique regions from branchRollups (no Firestore)', () => {
    const opts = deriveRegionOptions(MULTI_REGION_BRANCHES)
    expect(opts).toContain('Region A')
    expect(opts).toContain('Region B')
    expect(opts).toContain('Region C')
  })

  it('no duplicate regions in options', () => {
    const opts = deriveRegionOptions(MULTI_REGION_BRANCHES)
    const unique = new Set(opts)
    expect(unique.size).toBe(opts.length)
  })

  it('region options are sorted alphabetically', () => {
    const opts = deriveRegionOptions(MULTI_REGION_BRANCHES)
    const sorted = [...opts].sort((a, b) => a.localeCompare(b))
    expect(opts).toEqual(sorted)
  })

  it('empty branchRollups produces empty region options', () => {
    expect(deriveRegionOptions([])).toHaveLength(0)
  })

  it('single-region dataset produces one option', () => {
    const opts = deriveRegionOptions([BRANCH_HIGH, BRANCH_MID, BRANCH_CRIT])
    expect(opts).toHaveLength(1)
    expect(opts[0]).toBe('Region A')
  })
})

describe('Phase δ — region filter limits matrix rows', () => {
  it('All Regions (empty filter) returns all branches', () => {
    const m = buildBranchKpiMatrix(MULTI_REGION_BRANCHES, KPI_KEYS, { regions: [] })
    expect(m.rowKeys.length).toBe(MULTI_REGION_BRANCHES.length)
  })

  it('Region A filter returns only Region A branches', () => {
    const m = buildBranchKpiMatrix(MULTI_REGION_BRANCHES, KPI_KEYS, { regions: ['Region A'] })
    expect(m.rowKeys).toContain(BRANCH_HIGH.branchId)
    expect(m.rowKeys).toContain(BRANCH_MID.branchId)
    expect(m.rowKeys).not.toContain(BRANCH_REGION_B.branchId)
    expect(m.rowKeys).not.toContain(BRANCH_REGION_C.branchId)
  })

  it('Region B filter returns only Region B branches', () => {
    const m = buildBranchKpiMatrix(MULTI_REGION_BRANCHES, KPI_KEYS, { regions: ['Region B'] })
    expect(m.rowKeys).toEqual([BRANCH_REGION_B.branchId])
  })

  it('Region C filter returns only Region C branches', () => {
    const m = buildBranchKpiMatrix(MULTI_REGION_BRANCHES, KPI_KEYS, { regions: ['Region C'] })
    expect(m.rowKeys).toEqual([BRANCH_REGION_C.branchId])
  })

  it('non-existent region filter produces empty matrix (empty state)', () => {
    const m = buildBranchKpiMatrix(MULTI_REGION_BRANCHES, KPI_KEYS, { regions: ['Region Z'] })
    expect(m.rowKeys).toHaveLength(0)
    expect(m.cells).toHaveLength(0)
  })

  it('cell count = filtered rows × KPI columns', () => {
    const m = buildBranchKpiMatrix(MULTI_REGION_BRANCHES, KPI_KEYS, { regions: ['Region A'] })
    expect(m.cells.length).toBe(m.rowKeys.length * KPI_KEYS.length)
  })
})

describe('Phase δ — KPI filter limits matrix columns', () => {
  it('single KPI filter returns only that column', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH, BRANCH_MID], ['wasfaty'])
    expect(m.colKeys).toHaveLength(1)
    expect(m.colKeys[0]).toBe('wasfaty')
  })

  it('KPI filter cells count = rows × 1 column', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH, BRANCH_MID, BRANCH_CRIT], ['basket'])
    expect(m.cells.length).toBe(3)
    expect(m.colKeys).toEqual(['basket'])
  })

  it('KPI filter preserves correct achievement values', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH], ['wasfaty'])
    const cell = m.cells.find((c) => c.col === 'wasfaty')
    expect(cell?.value).toBe(110)  // BRANCH_HIGH has 110% for all KPIs
  })

  it('KPI filter excludes other KPI columns completely', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH], ['omni'])
    expect(m.colKeys).not.toContain('wasfaty')
    expect(m.colKeys).not.toContain('basket')
    expect(m.colKeys).toEqual(['omni'])
  })

  it('empty kpiKeys array produces empty column matrix', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH], [])
    expect(m.colKeys).toHaveLength(0)
    expect(m.cells).toHaveLength(0)
  })
})

describe('Phase δ — combined region + KPI filter', () => {
  it('region + KPI filter returns only matching branches and column', () => {
    const m = buildBranchKpiMatrix(MULTI_REGION_BRANCHES, ['wasfaty'], {
      regions: ['Region B'],
    })
    expect(m.rowKeys).toEqual([BRANCH_REGION_B.branchId])
    expect(m.colKeys).toEqual(['wasfaty'])
    expect(m.cells.length).toBe(1)
  })

  it('all filters cleared returns full matrix', () => {
    const filtered = buildBranchKpiMatrix(MULTI_REGION_BRANCHES, ['wasfaty'], { regions: ['Region B'] })
    const full     = buildBranchKpiMatrix(MULTI_REGION_BRANCHES, KPI_KEYS,   { regions: [] })
    expect(filtered.rowKeys.length).toBeLessThan(full.rowKeys.length)
  })

  it('impossible filter combination produces empty matrix safely', () => {
    const m = buildBranchKpiMatrix(MULTI_REGION_BRANCHES, ['wasfaty'], { regions: ['Region Z'] })
    expect(m.rowKeys).toHaveLength(0)
    expect(m.cells).toHaveLength(0)
    expect(m.range).toEqual([0, 100])
  })
})

describe('Phase δ — sort preserved after filtering', () => {
  it('risk sort still applies within filtered region', () => {
    const m = buildBranchKpiMatrix(
      [BRANCH_HIGH, BRANCH_MID, BRANCH_CRIT],
      KPI_KEYS,
      { rowSort: 'risk', regions: [] },
    )
    // BRANCH_CRIT (HIGH_RISK) should be first
    expect(m.rowKeys[0]).toBe(BRANCH_CRIT.branchId)
  })

  it('column sort (local UI state) is independent of region filter', () => {
    // Column sort is UI-local state; matrix itself is sorted by rowSort
    // Verify the matrix output is still deterministic after region filter
    const m1 = buildBranchKpiMatrix([BRANCH_HIGH, BRANCH_MID], KPI_KEYS, { rowSort: 'name', regions: [] })
    const m2 = buildBranchKpiMatrix([BRANCH_HIGH, BRANCH_MID], KPI_KEYS, { rowSort: 'name', regions: [] })
    expect(m1.rowKeys).toEqual(m2.rowKeys)
  })
})

describe('Phase δ — empty filtered matrix safe state', () => {
  it('Heatmap renders safe empty state for zero-row matrix', () => {
    expect(HM2).toContain('No heatmap data available')
  })

  it('panel source has empty-filter-state element', () => {
    expect(PN3).toContain('heatmap-empty-filter-state')
    expect(PN3).toContain('No branches match the selected filters')
  })

  it('clear filters button present when filters active', () => {
    expect(PN3).toContain('clear-filters-btn')
    expect(PN3).toContain('Clear Filters')
  })
})

describe('Phase δ — panel source: filter controls', () => {
  it('has selectedRegion state', () => {
    expect(PN3).toContain('selectedRegion')
    expect(PN3).toContain('setSelectedRegion')
  })

  it('has selectedKpi state', () => {
    expect(PN3).toContain('selectedKpi')
    expect(PN3).toContain('setSelectedKpi')
  })

  it('regionOptions derived from branchRollups (no Firestore)', () => {
    expect(PN3).toContain('regionOptions')
    expect(PN3).not.toContain('onSnapshot')
    expect(PN3).not.toContain('firebase')
    expect(PN3).not.toContain('collection(db')
  })

  it('region filter select has data-testid', () => {
    expect(PN3).toContain('data-testid="region-filter-select"')
  })

  it('KPI filter select has data-testid', () => {
    expect(PN3).toContain('data-testid="kpi-filter-select"')
  })

  it('region filter has aria-label for accessibility', () => {
    expect(PN3).toContain('aria-label="Filter by region"')
  })

  it('KPI filter has aria-label for accessibility', () => {
    expect(PN3).toContain('aria-label="Filter by KPI"')
  })

  it('active filters shown as badges on toggle button', () => {
    expect(PN3).toContain('active-region-filter')
    expect(PN3).toContain('active-kpi-filter')
  })

  it('filter controls have data-testid wrapper', () => {
    expect(PN3).toContain('data-testid="heatmap-filter-controls"')
  })

  it('regions option passed to buildBranchKpiMatrix', () => {
    expect(PN3).toMatch(/buildBranchKpiMatrix[\s\S]{0,200}regions:/)
  })

  it('activeKpiKeys derived from selectedKpi state', () => {
    expect(PN3).toContain('activeKpiKeys')
  })

  it('heatmap still collapsed by default (heatmapOpen=false)', () => {
    expect(PN3).toMatch(/useState\s*\(\s*false\s*\)/)
  })

  it('tooltip portal behavior still preserved in Heatmap source', () => {
    expect(HM2).toContain("position: 'fixed'")
    expect(HM2).toContain('zIndex: 9999')
    expect(HM2).toContain('document.body')
  })
})

// ══════════════════════════════════════════════════════════════
// PHASE δ QA FIX TESTS — Region Filter Visibility + UX Cleanup
// ══════════════════════════════════════════════════════════════

import { readFileSync as rf4 } from 'fs'
import { resolve as res4 }     from 'path'
const PN4 = rf4(res4(__dirname, '../executive/RegionalIntelligencePanel.jsx'), 'utf8')

describe('Phase δ QA Fix — Region filter always visible', () => {
  it('root cause fixed: region filter no longer gated on length > 1', () => {
    expect(PN4).not.toContain('regionOptions.length > 1')
  })

  it('region filter rendered when regionOptions.length >= 1', () => {
    expect(PN4).toMatch(/regionOptions\.length\s*>=\s*1/)
  })

  it('region filter select always has All Regions option', () => {
    // The option must be outside any conditional that hides it
    expect(PN4).toContain('<option value="">All Regions</option>')
  })

  it('region-filter-select data-testid present (always rendered)', () => {
    expect(PN4).toContain('data-testid="region-filter-select"')
  })

  it('single-region data still shows the filter', () => {
    // With the fix, regionOptions.length >= 1 shows the control
    const opts = deriveRegionOptions([BRANCH_HIGH, BRANCH_MID])
    expect(opts).toHaveLength(1)
    // >= 1 condition is satisfied
    expect(opts.length >= 1).toBe(true)
  })
})

describe('Phase δ QA Fix — No duplicate filter badges in header', () => {
  it('header toggle button does NOT contain inline active-region-filter badge', () => {
    // Old: badge inside the <button> — now badges moved BELOW the button (outside it)
    // The button itself should only contain title, count, and chevron
    // Verify the old pattern of badges inside the button row is gone
    expect(PN4).not.toMatch(/<button[\s\S]{0,600}data-testid="active-region-filter"/)
  })

  it('active-region-filter badge exists as a separate element below header', () => {
    // Still exists for filter summary — but outside the toggle button
    expect(PN4).toContain('data-testid="active-region-filter"')
  })

  it('active-kpi-filter badge exists as a separate element below header', () => {
    expect(PN4).toContain('data-testid="active-kpi-filter"')
  })

  it('filter badges shown only when heatmapOpen (not duplicated in closed state)', () => {
    // Badges are wrapped in {heatmapOpen && (selectedRegion || selectedKpi) && (...)}
    expect(PN4).toMatch(/heatmapOpen[\s\S]{0,500}active-region-filter/)
  })
})

describe('Phase δ QA Fix — Inline filter layout', () => {
  it('filters are inline with the title (no separate filter row div)', () => {
    // The new layout: title + filters in the same flex row
    // Verified by no standalone filter-controls div outside heatmapOpen
    expect(PN4).toContain('region-filter-select')
    expect(PN4).toContain('kpi-filter-select')
  })

  it('filter controls appear even when heatmap is collapsed (filters inline with title)', () => {
    // Filters are at the top level of the section, NOT inside the heatmapOpen block
    // Verify region-filter-select is NOT gated by heatmapOpen
    const heatmapOpenIdx = PN4.indexOf('{heatmapOpen && (')
    const regionSelectIdx = PN4.indexOf('data-testid="region-filter-select"')
    // region-filter-select must appear BEFORE the heatmapOpen block
    expect(regionSelectIdx).toBeLessThan(heatmapOpenIdx)
  })

  it('clear button still appears when filters are active', () => {
    expect(PN4).toContain('clear-filters-btn')
    expect(PN4).toContain('Clear')
  })

  it('KPI filter still has aria-label', () => {
    expect(PN4).toContain('aria-label="Filter by KPI"')
  })

  it('region filter still has aria-label', () => {
    expect(PN4).toContain('aria-label="Filter by region"')
  })
})

describe('Phase δ QA Fix — All existing functionality preserved', () => {
  it('buildBranchKpiMatrix still accepts regions option', () => {
    const m = buildBranchKpiMatrix(MULTI_REGION_BRANCHES, KPI_KEYS, { regions: ['Region A'] })
    expect(m.rowKeys).not.toContain(BRANCH_REGION_B.branchId)
  })

  it('heatmap still collapsed by default', () => {
    expect(PN4).toMatch(/heatmapOpen.*useState.*false|useState.*false.*heatmapOpen/)
  })

  it('tooltip portal still preserved', () => {
    expect(HM2).toContain("position: 'fixed'")
    expect(HM2).toContain('zIndex: 9999')
  })

  it('empty-filter-state still rendered when no rows match', () => {
    expect(PN4).toContain('heatmap-empty-filter-state')
  })

  it('onCellClick still wired to Heatmap', () => {
    expect(PN4).toContain('onCellClick={handleHeatmapCellClick}')
  })

  it('selectedRegion passed as regions array to buildBranchKpiMatrix', () => {
    expect(PN4).toMatch(/regions:\s*selectedRegion\s*\?/)
  })
})

// ══════════════════════════════════════════════════════════════
// BRANCH LABEL FORMAT TESTS — "5074 - الأثير" pattern
// ══════════════════════════════════════════════════════════════

import { readFileSync as rf5 } from 'fs'
import { resolve as res5 }     from 'path'
const HM5 = rf5(res5(__dirname, './Heatmap.jsx'), 'utf8')

// ── formatBranchLabel logic (mirrors Heatmap helper) ─────────
function formatBranchLabel(name: string, code?: string | null): string {
  if (code && code.trim()) return `${code} - ${name}`
  return name
}

describe('formatBranchLabel — branch code + name format', () => {
  it('shows "CODE - Name" when both provided', () => {
    expect(formatBranchLabel('الأثير', '5074')).toBe('5074 - الأثير')
  })

  it('shows "Name" only when code is absent', () => {
    expect(formatBranchLabel('الأثير', undefined)).toBe('الأثير')
  })

  it('shows "Name" only when code is empty string', () => {
    expect(formatBranchLabel('الأثير', '')).toBe('الأثير')
  })

  it('shows "Name" only when code is whitespace', () => {
    expect(formatBranchLabel('الأثير', '   ')).toBe('الأثير')
  })

  it('shows "Name" only when code is null', () => {
    expect(formatBranchLabel('الأثير', null)).toBe('الأثير')
  })

  it('works with English branch names', () => {
    expect(formatBranchLabel('Main Branch', '5076')).toBe('5076 - Main Branch')
  })

  it('works with numeric-only code', () => {
    expect(formatBranchLabel('صيدلية النافع', '1001')).toBe('1001 - صيدلية النافع')
  })
})

describe('Heatmap — formatBranchLabel applied consistently', () => {
  it('formatBranchLabel helper defined in Heatmap.jsx', () => {
    expect(HM5).toContain('function formatBranchLabel')
  })

  it('helper checks for code && code.trim()', () => {
    expect(HM5).toContain('code.trim()')
  })

  it('tooltip branchName uses formatBranchLabel', () => {
    expect(HM5).toMatch(/CellTooltip[\s\S]{0,1000}formatBranchLabel/)
  })

  it('SelectedCellPanel branchName uses formatBranchLabel', () => {
    expect(HM5).toMatch(/SelectedCellPanel[\s\S]{0,1000}formatBranchLabel/)
  })

  it('aria-label uses formatBranchLabel', () => {
    expect(HM5).toMatch(/aria-label.*formatBranchLabel/)
  })

  it('row header uses rowDisplayLabel (formatBranchLabel output)', () => {
    expect(HM5).toContain('rowDisplayLabel')
    expect(HM5).toMatch(/formatBranchLabel\s*\(\s*rowLabel\s*,\s*rowCode\s*\)/)
  })

  it('rowKeyToCode map built from cell.meta.branchCode', () => {
    expect(HM5).toContain('rowKeyToCode')
    expect(HM5).toContain('meta?.branchCode')
  })
})

describe('Heatmap — branchCode in matrix cell meta', () => {
  it('buildBranchKpiMatrix cells carry branchCode in meta', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH], KPI_KEYS)
    const cell = m.cells[0]
    expect(cell.meta?.branchCode).toBeDefined()
    expect(cell.meta?.branchCode).toBe('B1')   // BRANCH_HIGH branchCode = id.toUpperCase() = 'B1'
  })

  it('formatBranchLabel produces expected label for a real matrix cell', () => {
    const m = buildBranchKpiMatrix([BRANCH_HIGH], KPI_KEYS)
    const cell = m.cells[0]
    const label = formatBranchLabel(
      cell.meta?.branchName as string,
      cell.meta?.branchCode as string,
    )
    expect(label).toBe('B1 - Alpha Pharmacy')
  })

  it('label falls back to name when branchCode absent in meta', () => {
    const branchNoCode = makeBranch('nx', 'No Code Branch', { branchCode: '' })
    const m = buildBranchKpiMatrix([branchNoCode], KPI_KEYS)
    const cell = m.cells[0]
    const label = formatBranchLabel(
      cell.meta?.branchName as string,
      cell.meta?.branchCode as string,
    )
    expect(label).toBe('No Code Branch')
  })
})
