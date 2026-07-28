// ============================================================
// Smart List — Parser & Aggregation tests (DX-12)
//
// Fixture headers are the VERBATIM production export headers
// (including "Divison" and "bussines date") — the whole point of
// this domain is zero-manual-mapping ingestion of that exact file.
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  resolveSmartListHeaders,
  normalizeSmartListDate,
  parseSmartListRows,
  aggregateSmartList,
  UNCLASSIFIED_DIVISION,
  TOP_ITEMS_LIMIT,
} from './smartListParser'

const PRODUCTION_HEADERS = [
  'Empid', 'Empname', 'Divison', 'Department', 'Category',
  'Sub Category', 'Class', 'Item Code', 'Itemdesc', 'Quantity',
  'Totalsales', 'bussines date',
]

function makeRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Empid: 10352, Empname: 'AHMED MOHAMED', Divison: 'MEDICINE',
    Department: 'SELF MEDICATIONS', Category: 'PAIN MANAGEMENT',
    'Sub Category': 'ADULT PAIN AND FEVER', Class: 'ADULT SIMPLE ANALGESICS',
    'Item Code': '100015971', Itemdesc: 'ادول اكسترا 24 قرص',
    Quantity: 1, Totalsales: 6.4, 'bussines date': '30/06/2026',
    ...overrides,
  }
}

describe('DX-12 — Smart List header resolution', () => {
  it('resolves every verbatim production header with zero manual mapping', () => {
    const { mapping, missingFields, unknownHeaders } = resolveSmartListHeaders(PRODUCTION_HEADERS)
    expect(missingFields).toEqual([])
    expect(unknownHeaders).toEqual([])
    expect(mapping.division).toBe('Divison')          // real spelling
    expect(mapping.date).toBe('bussines date')        // real spelling
    expect(mapping.empId).toBe('Empid')
    expect(mapping.totalSales).toBe('Totalsales')
  })

  it('also accepts corrected spellings and Arabic aliases', () => {
    const { mapping } = resolveSmartListHeaders(['Employee ID', 'Division', 'Business Date', 'الكمية'])
    expect(mapping.empId).toBe('Employee ID')
    expect(mapping.division).toBe('Division')
    expect(mapping.date).toBe('Business Date')
    expect(mapping.quantity).toBe('الكمية')
  })

  it('reports missing required columns', () => {
    const { missingFields } = resolveSmartListHeaders(['Empid', 'Empname'])
    expect(missingFields).toContain('date')
    expect(missingFields).toContain('totalSales')
  })
})

describe('DX-12 — date normalization', () => {
  it('parses production DD/MM/YYYY', () => {
    expect(normalizeSmartListDate('30/06/2026')).toBe('2026-06-30')
    expect(normalizeSmartListDate('01/06/2026')).toBe('2026-06-01')
  })
  it('accepts ISO passthrough and rejects garbage', () => {
    expect(normalizeSmartListDate('2026-06-15')).toBe('2026-06-15')
    expect(normalizeSmartListDate('June 30')).toBeNull()
    expect(normalizeSmartListDate('31/13/2026')).toBeNull()
    expect(normalizeSmartListDate(null)).toBeNull()
  })
})

describe('DX-12 — row parsing', () => {
  it('parses a clean production row', () => {
    const { rows, issues } = parseSmartListRows([makeRaw()])
    expect(issues).toEqual([])
    expect(rows[0]).toMatchObject({
      empId: '10352', empName: 'AHMED MOHAMED', division: 'MEDICINE',
      itemCode: '100015971', quantity: 1, totalSales: 6.4,
      date: '2026-06-30', month: '2026-06', isReturn: false,
    })
  })

  it('defaults a blank Division to UNCLASSIFIED (221 such rows exist in production)', () => {
    const { rows } = parseSmartListRows([makeRaw({ Divison: null })])
    expect(rows[0].division).toBe(UNCLASSIFIED_DIVISION)
  })

  it('flags negative sales and CANCELLED sub-categories as returns', () => {
    const { rows } = parseSmartListRows([
      makeRaw({ Totalsales: -130 }),
      makeRaw({ 'Sub Category': 'CANCELLED - TREATMENT', Totalsales: 130 }),
      makeRaw({ Totalsales: 52 }),
    ])
    expect(rows.map((r) => r.isReturn)).toEqual([true, true, false])
  })

  it('keeps fractional quantities (partial-pack sales)', () => {
    const { rows } = parseSmartListRows([makeRaw({ Quantity: 0.04, Totalsales: 2.6 })])
    expect(rows[0].quantity).toBe(0.04)
  })

  it('skips rows with unparseable core fields, reporting each issue', () => {
    const { rows, issues, skippedRowCount } = parseSmartListRows([
      makeRaw(),
      makeRaw({ 'bussines date': 'not-a-date' }),
      makeRaw({ Quantity: 'abc' }),
      makeRaw({ Empid: '' }),
    ])
    expect(rows).toHaveLength(1)
    expect(skippedRowCount).toBe(3)
    expect(issues.map((i) => i.field)).toEqual(['date', 'quantity', 'empId'])
  })

  it('fails fast with a clear message when required columns are absent', () => {
    const { rows, issues } = parseSmartListRows([{ Foo: 1, Bar: 2 }])
    expect(rows).toEqual([])
    expect(issues[0].message).toContain('Missing required column')
  })
})

describe('DX-12 — aggregation', () => {
  const fixture = [
    makeRaw({ Empid: 1, Empname: 'A', Totalsales: 100, Quantity: 2, 'bussines date': '01/06/2026', Divison: 'MEDICINE', 'Item Code': 'X1', Itemdesc: 'Item X1' }),
    makeRaw({ Empid: 1, Empname: 'A', Totalsales: 50, Quantity: 1, 'bussines date': '02/06/2026', Divison: 'BEAUTY', 'Item Code': 'X2', Itemdesc: 'Item X2' }),
    makeRaw({ Empid: 1, Empname: 'A', Totalsales: -30, Quantity: 1, 'bussines date': '02/06/2026', Divison: 'BEAUTY', 'Item Code': 'X2', Itemdesc: 'Item X2' }),
    makeRaw({ Empid: 2, Empname: 'B', Totalsales: 200, Quantity: 3, 'bussines date': '01/06/2026', Divison: null, 'Item Code': 'X3', Itemdesc: 'Item X3' }),
  ]

  it('aggregates per pharmacist with net sales, returns, and daily series', () => {
    const { rows } = parseSmartListRows(fixture)
    const agg = aggregateSmartList(rows)

    expect(agg.months).toEqual(['2026-06'])
    expect(agg.pharmacists).toHaveLength(2)

    const b = agg.pharmacists[0] // sorted by netSales desc → B first (200)
    expect(b).toMatchObject({ empId: '2', netSales: 200, txCount: 1 })

    const a = agg.pharmacists[1]
    expect(a).toMatchObject({
      empId: '1', grossSales: 150, returnsValue: 30, returnsCount: 1, netSales: 120,
    })
    expect(a.dailySeries).toEqual([
      { date: '2026-06-01', sales: 100, txCount: 1 },
      { date: '2026-06-02', sales: 20, txCount: 2 },   // 50 - 30
    ])
    // Division breakdown is net and sorted by sales desc
    expect(a.byDivision[0]).toMatchObject({ key: 'MEDICINE', sales: 100 })
    expect(a.byDivision[1]).toMatchObject({ key: 'BEAUTY', sales: 20 })
  })

  it('aggregates a category breakdown mirroring the division breakdown', () => {
    const { rows } = parseSmartListRows([
      makeRaw({ Empid: 1, Empname: 'A', Category: 'PAIN MANAGEMENT', Totalsales: 100, Quantity: 2, 'Item Code': 'X1', Itemdesc: 'Item X1' }),
      makeRaw({ Empid: 1, Empname: 'A', Category: 'VITAMINS', Totalsales: 50, Quantity: 1, 'Item Code': 'X2', Itemdesc: 'Item X2' }),
      makeRaw({ Empid: 1, Empname: 'A', Category: 'VITAMINS', Totalsales: -30, Quantity: 1, 'Item Code': 'X2', Itemdesc: 'Item X2' }),
    ])
    const agg = aggregateSmartList(rows)

    const a = agg.pharmacists[0]
    expect(a.byCategory[0]).toMatchObject({ key: 'PAIN MANAGEMENT', sales: 100 })
    expect(a.byCategory[1]).toMatchObject({ key: 'VITAMINS', sales: 20 })
    expect(agg.branch.byCategory.map((c) => c.key).sort()).toEqual(['PAIN MANAGEMENT', 'VITAMINS'])
  })

  it('branch totals reconcile with pharmacist totals', () => {
    const { rows } = parseSmartListRows(fixture)
    const agg = aggregateSmartList(rows)
    const sumNet = agg.pharmacists.reduce((s, p) => s + p.netSales, 0)
    expect(agg.branch.netSales).toBe(sumNet)
    expect(agg.branch.txCount).toBe(4)
    expect(agg.branch.returnsCount).toBe(1)
    expect(agg.unclassifiedRowCount).toBe(1)
    expect(agg.branch.byDivision.map((d) => d.key)).toContain(UNCLASSIFIED_DIVISION)
  })

  it('caps top items and ranks them by net sales', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeRaw({ 'Item Code': `I${i}`, Itemdesc: `Item ${i}`, Totalsales: i + 1 }))
    const { rows } = parseSmartListRows(many)
    const agg = aggregateSmartList(rows)
    expect(agg.branch.topItems).toHaveLength(TOP_ITEMS_LIMIT)
    expect(agg.branch.topItems[0].itemCode).toBe('I19') // highest sales
  })

  it('detects multi-month files so the UI can warn', () => {
    const { rows } = parseSmartListRows([
      makeRaw({ 'bussines date': '30/06/2026' }),
      makeRaw({ 'bussines date': '01/07/2026' }),
    ])
    expect(aggregateSmartList(rows).months).toEqual(['2026-06', '2026-07'])
  })
})
