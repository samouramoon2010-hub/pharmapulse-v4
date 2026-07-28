// ============================================================
// Item Sales Insights Engine tests (DX-12b)
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  buildBranchDailySeries,
  withDivisionShares,
  compareDivisionMix,
  compareCategoryMix,
  compareBranches,
  returnsRatePct,
  topItemsConcentrationPct,
  rankPharmacistContributions,
  type ItemSalesMonthlyDoc,
  type ItemSalesBranchMonthlyDoc,
} from './itemSalesInsights'

function makeDoc(overrides: Partial<ItemSalesMonthlyDoc> = {}): ItemSalesMonthlyDoc {
  return {
    branchId: 'B001', month: '2026-06', empId: '1', empName: 'A', matchedUserId: null,
    txCount: 10, totalQuantity: 12, grossSales: 1000, returnsValue: 50, returnsCount: 2,
    netSales: 950,
    byDivision: [
      { key: 'WELLNESS', sales: 600, quantity: 6, txCount: 5 },
      { key: 'MEDICINE', sales: 350, quantity: 6, txCount: 5 },
    ],
    byDepartment: [],
    topItems: [
      { itemCode: 'X1', itemDesc: 'Item 1', quantity: 3, sales: 500 },
      { itemCode: 'X2', itemDesc: 'Item 2', quantity: 3, sales: 200 },
    ],
    dailySeries: [
      { date: '2026-06-01', sales: 400, txCount: 4 },
      { date: '2026-06-02', sales: 550, txCount: 6 },
    ],
    ...overrides,
  }
}

function makeBranch(overrides: Partial<ItemSalesBranchMonthlyDoc> = {}): ItemSalesBranchMonthlyDoc {
  return {
    branchId: 'B001', month: '2026-06', pharmacistCount: 2, unmatchedPharmacists: [],
    txCount: 20, totalQuantity: 24, grossSales: 2000, returnsValue: 100, returnsCount: 3,
    netSales: 1900,
    byDivision: [
      { key: 'WELLNESS', sales: 950, quantity: 10, txCount: 9 },
      { key: 'MEDICINE', sales: 570, quantity: 8, txCount: 7 },
      { key: 'BEAUTY', sales: 380, quantity: 6, txCount: 4 },
    ],
    topItems: [],
    unclassifiedRowCount: 0,
    ...overrides,
  }
}

describe('DX-12b — branch daily series reconstruction', () => {
  it('sums pharmacist series per date, sorted ascending', () => {
    const a = makeDoc()
    const b = makeDoc({
      empId: '2',
      dailySeries: [
        { date: '2026-06-02', sales: 100, txCount: 1 },
        { date: '2026-06-03', sales: 50, txCount: 1 },
      ],
    })
    expect(buildBranchDailySeries([a, b])).toEqual([
      { date: '2026-06-01', sales: 400, txCount: 4 },
      { date: '2026-06-02', sales: 650, txCount: 7 },
      { date: '2026-06-03', sales: 50, txCount: 1 },
    ])
  })
  it('returns empty for no docs', () => {
    expect(buildBranchDailySeries([])).toEqual([])
  })
})

describe('DX-12b — division shares', () => {
  it('computes 0-100 shares of the owner net', () => {
    const shares = withDivisionShares(makeDoc().byDivision)
    expect(shares[0]).toMatchObject({ key: 'WELLNESS', sharePct: 63.2 })
    expect(shares[1]).toMatchObject({ key: 'MEDICINE', sharePct: 36.8 })
  })
  it('handles zero totals without dividing by zero', () => {
    expect(withDivisionShares([{ key: 'X', sales: 0, quantity: 0, txCount: 0 }])[0].sharePct).toBe(0)
  })
})

describe('DX-12b — strengths / focus areas (rank-based, no fabricated thresholds)', () => {
  it('ranks divisions by share delta vs the branch mix', () => {
    // Pharmacist: WELLNESS 63.2%, MEDICINE 36.8%, BEAUTY 0%
    // Branch:     WELLNESS 50%,   MEDICINE 30%,   BEAUTY 20%
    const { strengths, focusAreas } = compareDivisionMix(makeDoc(), makeBranch())
    expect(strengths[0].division).toBe('WELLNESS')
    expect(strengths[0].deltaPct).toBeCloseTo(13.2, 1)
    expect(focusAreas[0].division).toBe('BEAUTY')   // 0 - 20 = -20, worst
    expect(focusAreas[0].deltaPct).toBe(-20)
  })

  it('ignores zero-sale gaps in divisions the branch barely sells', () => {
    const branch = makeBranch({
      byDivision: [
        { key: 'WELLNESS', sales: 1862, quantity: 10, txCount: 9 },
        { key: 'NICHE', sales: 38, quantity: 1, txCount: 1 },      // 2% of branch
      ],
    })
    const { focusAreas } = compareDivisionMix(makeDoc(), branch)
    expect(focusAreas.map((f) => f.division)).not.toContain('NICHE')
  })

  it('strengths exclude non-positive deltas', () => {
    // Pharmacist mix identical to branch mix → no strengths, no focus areas
    const doc = makeDoc({
      byDivision: [
        { key: 'WELLNESS', sales: 500, quantity: 5, txCount: 5 },
        { key: 'MEDICINE', sales: 300, quantity: 4, txCount: 4 },
        { key: 'BEAUTY', sales: 200, quantity: 3, txCount: 3 },
      ],
    })
    const { strengths, focusAreas } = compareDivisionMix(doc, makeBranch())
    expect(strengths).toEqual([])
    expect(focusAreas).toEqual([])
  })
})

describe('DX-12b — category mix (mirrors division mix, optional dimension)', () => {
  it('ranks categories by share delta vs the branch mix, same as division', () => {
    const doc = makeDoc({ byCategory: [{ key: 'PAIN', sales: 600, quantity: 6, txCount: 5 }, { key: 'VITAMINS', sales: 350, quantity: 6, txCount: 5 }] })
    const branch = makeBranch({ byCategory: [
      { key: 'PAIN', sales: 950, quantity: 10, txCount: 9 },
      { key: 'VITAMINS', sales: 570, quantity: 8, txCount: 7 },
      { key: 'BEAUTY_CAT', sales: 380, quantity: 6, txCount: 4 },
    ] })
    const { strengths, focusAreas } = compareCategoryMix(doc, branch)
    expect(strengths[0].division).toBe('PAIN')
    expect(focusAreas[0].division).toBe('BEAUTY_CAT')
  })

  it('treats a missing byCategory (older documents) as empty, not an error', () => {
    const { strengths, focusAreas } = compareCategoryMix(makeDoc(), makeBranch())
    expect(strengths).toEqual([])
    expect(focusAreas).toEqual([])
  })
})

describe('DX-12b — branch-to-branch comparison', () => {
  it('ranks branches by net sales and computes contribution share', () => {
    const b1 = makeBranch({ branchId: 'B001', netSales: 700 })
    const b2 = makeBranch({ branchId: 'B002', netSales: 300 })
    const { rows } = compareBranches([b2, b1])
    expect(rows[0]).toMatchObject({ branchId: 'B001', netSales: 700, contributionPct: 70 })
    expect(rows[1]).toMatchObject({ branchId: 'B002', netSales: 300, contributionPct: 30 })
    expect(rows[0].topDivision).toBe('WELLNESS')
  })

  it('finds items shared across multiple branches top-item lists', () => {
    const shared = { itemCode: 'X1', itemDesc: 'Shared Item', quantity: 1, sales: 100 }
    const b1 = makeBranch({ branchId: 'B001', topItems: [shared] })
    const b2 = makeBranch({ branchId: 'B002', topItems: [shared, { itemCode: 'X2', itemDesc: 'Solo', quantity: 1, sales: 50 }] })
    const { sharedTopItems } = compareBranches([b1, b2])
    expect(sharedTopItems).toEqual([{ itemCode: 'X1', itemDesc: 'Shared Item', branchCount: 2 }])
  })

  it('returns 0% contributions, not NaN, when total net sales is zero', () => {
    const { rows } = compareBranches([makeBranch({ branchId: 'B001', netSales: 0 })])
    expect(rows[0].contributionPct).toBe(0)
  })
})

describe('DX-12b — rates and concentration', () => {
  it('returns rate is returns/gross on the 0-100 scale', () => {
    expect(returnsRatePct({ grossSales: 1000, returnsValue: 50 })).toBe(5)
    expect(returnsRatePct({ grossSales: 0, returnsValue: 10 })).toBeNull()
  })
  it('top-items concentration is capped at 100 and null on net-negative months', () => {
    expect(topItemsConcentrationPct(makeDoc(), 5)).toBe(73.7) // 700/950
    expect(topItemsConcentrationPct({ netSales: 0, topItems: [] })).toBeNull()
  })
})

describe('DX-12b — contribution ranking', () => {
  it('ranks by net sales with branch-share contribution', () => {
    const docs = [
      makeDoc({ empId: '1', empName: 'A', netSales: 300 }),
      makeDoc({ empId: '2', empName: 'B', netSales: 700 }),
    ]
    const ranked = rankPharmacistContributions(docs)
    expect(ranked[0]).toMatchObject({ empId: '2', contributionPct: 70 })
    expect(ranked[1]).toMatchObject({ empId: '1', contributionPct: 30 })
  })
  it('zero branch net yields 0% contributions, not NaN', () => {
    const ranked = rankPharmacistContributions([makeDoc({ netSales: 0 })])
    expect(ranked[0].contributionPct).toBe(0)
  })
})
