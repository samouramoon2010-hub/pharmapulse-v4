// ============================================================
// Smart List — Commit Service (DX-12)
//
// Persists the OUTPUT of aggregateSmartList() — compact monthly
// summary documents — never the raw item rows (the uploaded Excel
// file remains the item-level source of truth; see
// smartListParser.ts header).
//
// Document contracts:
//   item_sales_monthly/{branchId}_{empId}_{month}
//     → one doc per pharmacist per month (SmartListPharmacistAggregate
//       + identity resolution + audit trail)
//   item_sales_branch_monthly/{branchId}_{month}
//     → one doc per branch per month (branch rollup + audit trail)
//
// Re-uploading the same branch+month REPLACES those docs (setDoc,
// no merge) — deliberate: the newest file for a month is the
// authoritative smart list for that month. The audit block records
// who/when/what file, so replacements stay traceable.
// ============================================================

import { doc, setDoc } from 'firebase/firestore'
import { db } from '../dxFirebaseTypes'
import type { SmartListAggregateResult, SmartListPharmacistAggregate } from './smartListParser'

export const ITEM_SALES_MONTHLY_COL = 'item_sales_monthly'
export const ITEM_SALES_BRANCH_MONTHLY_COL = 'item_sales_branch_monthly'

export interface SmartListResolvedPharmacist {
  aggregate:      SmartListPharmacistAggregate
  /** App user uid when the file's employee id matched a user profile. */
  matchedUserId:  string | null
}

export interface SmartListCommitInput {
  branchId:       string
  month:          string   // yyyy-MM
  aggregate:      SmartListAggregateResult
  resolved:       SmartListResolvedPharmacist[]
  actorUid:       string
  sourceFileName: string
  checksum?:      string
}

export interface SmartListCommitResult {
  pharmacistDocsWritten: number
  branchDocWritten:      boolean
}

function auditBlock(input: SmartListCommitInput) {
  return {
    importedBy:     input.actorUid,
    importedAt:     new Date().toISOString(),
    sourceFileName: input.sourceFileName,
    ...(input.checksum ? { sourceChecksum: input.checksum } : {}),
  }
}

export async function commitSmartListAggregates(input: SmartListCommitInput): Promise<SmartListCommitResult> {
  const audit = auditBlock(input)
  let pharmacistDocsWritten = 0

  for (const { aggregate, matchedUserId } of input.resolved) {
    const docId = `${input.branchId}_${aggregate.empId}_${input.month}`
    await setDoc(doc(db, ITEM_SALES_MONTHLY_COL, docId), {
      branchId:      input.branchId,
      month:         input.month,
      empId:         aggregate.empId,
      empName:       aggregate.empName,
      matchedUserId,
      txCount:       aggregate.txCount,
      totalQuantity: aggregate.totalQuantity,
      grossSales:    aggregate.grossSales,
      returnsValue:  aggregate.returnsValue,
      returnsCount:  aggregate.returnsCount,
      netSales:      aggregate.netSales,
      byDivision:    aggregate.byDivision,
      byDepartment:  aggregate.byDepartment,
      byCategory:    aggregate.byCategory,
      topItems:      aggregate.topItems,
      dailySeries:   aggregate.dailySeries,
      ...audit,
    })
    pharmacistDocsWritten++
  }

  const branchDocId = `${input.branchId}_${input.month}`
  await setDoc(doc(db, ITEM_SALES_BRANCH_MONTHLY_COL, branchDocId), {
    branchId:             input.branchId,
    month:                input.month,
    pharmacistCount:      input.resolved.length,
    unmatchedPharmacists: input.resolved.filter((r) => r.matchedUserId === null).map((r) => r.aggregate.empId),
    txCount:              input.aggregate.branch.txCount,
    totalQuantity:        input.aggregate.branch.totalQuantity,
    grossSales:           input.aggregate.branch.grossSales,
    returnsValue:         input.aggregate.branch.returnsValue,
    returnsCount:         input.aggregate.branch.returnsCount,
    netSales:             input.aggregate.branch.netSales,
    byDivision:           input.aggregate.branch.byDivision,
    byCategory:           input.aggregate.branch.byCategory,
    topItems:             input.aggregate.branch.topItems,
    unclassifiedRowCount: input.aggregate.unclassifiedRowCount,
    ...audit,
  })

  return { pharmacistDocsWritten, branchDocWritten: true }
}
