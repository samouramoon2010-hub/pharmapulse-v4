// ============================================================
// Item Sales — Read Service (DX-12b)
//
// Read-side counterpart of smartListCommitService.ts. Fetches the
// compact monthly aggregates for one branch+month. Query shape is
// two reads: one branch doc by deterministic id, one equality-
// filtered collection query — no composite index required beyond
// the automatic single-field ones.
// ============================================================

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'
import {
  ITEM_SALES_MONTHLY_COL,
  ITEM_SALES_BRANCH_MONTHLY_COL,
} from './dataExchange/smartList/smartListCommitService'
import type {
  ItemSalesMonthlyDoc,
  ItemSalesBranchMonthlyDoc,
} from '../engine/itemSales/itemSalesInsights'

export interface ItemSalesMonthData {
  branch:      ItemSalesBranchMonthlyDoc | null
  pharmacists: ItemSalesMonthlyDoc[]
}

/** Fetches the branch rollup + all pharmacist summaries for one
 *  branch+month. `branch: null` means no smart list was imported
 *  for that month — the caller must render an explicit empty state,
 *  never fabricate zeros. */
export async function fetchItemSalesMonth(branchId: string, month: string): Promise<ItemSalesMonthData> {
  const branchRef = doc(db, ITEM_SALES_BRANCH_MONTHLY_COL, `${branchId}_${month}`)
  const pharmacistsQuery = query(
    collection(db, ITEM_SALES_MONTHLY_COL),
    where('branchId', '==', branchId),
    where('month', '==', month),
  )

  const [branchSnap, pharmacistsSnap] = await Promise.all([
    getDoc(branchRef),
    getDocs(pharmacistsQuery),
  ])

  return {
    branch: branchSnap.exists() ? (branchSnap.data() as ItemSalesBranchMonthlyDoc) : null,
    pharmacists: pharmacistsSnap.docs
      .map((d) => d.data() as ItemSalesMonthlyDoc)
      .sort((a, b) => b.netSales - a.netSales),
  }
}

/** Fetches the branch rollup docs for MULTIPLE branches, same month —
 *  powers the branch-to-branch comparison view. Fans out with
 *  Promise.all rather than an `in` query so branches with no doc for
 *  the month are simply omitted (not an error), same "explicit absence,
 *  never fabricate" contract as fetchItemSalesMonth. Caller is
 *  responsible for only passing branchIds the viewer is scoped to see
 *  (same convention as BranchIntelligencePage/RankingsPage). */
export async function fetchBranchMonthlyForBranches(
  branchIds: string[], month: string,
): Promise<ItemSalesBranchMonthlyDoc[]> {
  const snaps = await Promise.all(
    branchIds.map((branchId) => getDoc(doc(db, ITEM_SALES_BRANCH_MONTHLY_COL, `${branchId}_${month}`))),
  )
  return snaps
    .filter((s) => s.exists())
    .map((s) => s.data() as ItemSalesBranchMonthlyDoc)
}

/** Months that have an imported smart list for this branch, newest
 *  first — drives the month selector so users only pick months that
 *  actually contain data. */
export async function listItemSalesMonths(branchId: string): Promise<string[]> {
  const snap = await getDocs(query(
    collection(db, ITEM_SALES_BRANCH_MONTHLY_COL),
    where('branchId', '==', branchId),
  ))
  return snap.docs
    .map((d) => (d.data() as ItemSalesBranchMonthlyDoc).month)
    .sort()
    .reverse()
}
