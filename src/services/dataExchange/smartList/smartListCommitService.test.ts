// ============================================================
// Smart List — Commit Service tests (DX-12)
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

const written = new Map<string, Record<string, unknown>>()

vi.mock('../dxFirebaseTypes', () => ({ db: {}, COL: {} }))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    written.set(ref.path, data)
  }),
}))

import { commitSmartListAggregates, ITEM_SALES_MONTHLY_COL, ITEM_SALES_BRANCH_MONTHLY_COL } from './smartListCommitService'
import { parseSmartListRows, aggregateSmartList } from './smartListParser'

function buildAggregate() {
  const { rows } = parseSmartListRows([
    { Empid: 10352, Empname: 'AHMED', Divison: 'MEDICINE', Department: 'D', Category: 'C', 'Sub Category': 'S', Class: 'K', 'Item Code': 'X1', Itemdesc: 'Item', Quantity: 1, Totalsales: 100, 'bussines date': '15/06/2026' },
    { Empid: 99999, Empname: 'UNKNOWN', Divison: 'BEAUTY', Department: 'D', Category: 'C', 'Sub Category': 'S', Class: 'K', 'Item Code': 'X2', Itemdesc: 'Item2', Quantity: 2, Totalsales: 50, 'bussines date': '16/06/2026' },
  ])
  return aggregateSmartList(rows)
}

describe('DX-12 — smart list commit service', () => {
  beforeEach(() => written.clear())

  it('writes one monthly doc per pharmacist plus one branch doc, keyed deterministically', async () => {
    const aggregate = buildAggregate()
    const result = await commitSmartListAggregates({
      branchId: 'B001',
      month: '2026-06',
      aggregate,
      resolved: aggregate.pharmacists.map((p) => ({
        aggregate: p,
        matchedUserId: p.empId === '10352' ? 'uid-ahmed' : null,
      })),
      actorUid: 'admin-1',
      sourceFileName: 'sljune20261.xltx',
      checksum: 'abc123',
    })

    expect(result).toEqual({ pharmacistDocsWritten: 2, branchDocWritten: true })
    expect(written.has(`${ITEM_SALES_MONTHLY_COL}/B001_10352_2026-06`)).toBe(true)
    expect(written.has(`${ITEM_SALES_MONTHLY_COL}/B001_99999_2026-06`)).toBe(true)
    expect(written.has(`${ITEM_SALES_BRANCH_MONTHLY_COL}/B001_2026-06`)).toBe(true)

    const ahmed = written.get(`${ITEM_SALES_MONTHLY_COL}/B001_10352_2026-06`)!
    expect(ahmed).toMatchObject({
      branchId: 'B001', month: '2026-06', empId: '10352',
      matchedUserId: 'uid-ahmed', netSales: 100,
      importedBy: 'admin-1', sourceFileName: 'sljune20261.xltx', sourceChecksum: 'abc123',
    })
    expect(ahmed.byCategory).toEqual([{ key: 'C', sales: 100, quantity: 1, txCount: 1 }])

    const branch = written.get(`${ITEM_SALES_BRANCH_MONTHLY_COL}/B001_2026-06`)!
    expect(branch).toMatchObject({
      pharmacistCount: 2,
      unmatchedPharmacists: ['99999'],
      netSales: 150,
    })
    expect(branch.byCategory).toEqual([{ key: 'C', sales: 150, quantity: 3, txCount: 2 }])
  })

  it('omits sourceChecksum when the browser could not compute one', async () => {
    const aggregate = buildAggregate()
    await commitSmartListAggregates({
      branchId: 'B001', month: '2026-06', aggregate,
      resolved: [], actorUid: 'admin-1', sourceFileName: 'f.xlsx',
    })
    const branch = written.get(`${ITEM_SALES_BRANCH_MONTHLY_COL}/B001_2026-06`)!
    expect('sourceChecksum' in branch).toBe(false)
  })
})
