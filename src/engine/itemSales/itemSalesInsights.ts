// ============================================================
// Item Sales Insights Engine (DX-12b)
//
// Pure selectors over the Smart List monthly aggregate documents
// (item_sales_monthly / item_sales_branch_monthly — see
// smartListCommitService.ts for the write-side contract). No
// Firebase, no UI. Every insight here is DERIVED from the imported
// data by comparison or ranking — never an invented benchmark or
// fabricated threshold (CLAUDE.design.md data-trust rule).
// ============================================================

import type {
  SmartListBreakdownEntry,
  SmartListTopItem,
  SmartListDailyPoint,
} from '../../services/dataExchange/smartList/smartListParser'

/** Shape of one item_sales_monthly document (read-side mirror). */
export interface ItemSalesMonthlyDoc {
  branchId:      string
  month:         string
  empId:         string
  empName:       string
  matchedUserId: string | null
  txCount:       number
  totalQuantity: number
  grossSales:    number
  returnsValue:  number
  returnsCount:  number
  netSales:      number
  byDivision:    SmartListBreakdownEntry[]
  byDepartment:  SmartListBreakdownEntry[]
  /** Optional: absent on documents written before the category
   *  dimension was added — callers must treat as `?? []`. */
  byCategory?:   SmartListBreakdownEntry[]
  topItems:      SmartListTopItem[]
  dailySeries:   SmartListDailyPoint[]
}

/** Shape of one item_sales_branch_monthly document (read-side mirror). */
export interface ItemSalesBranchMonthlyDoc {
  branchId:             string
  month:                string
  pharmacistCount:      number
  unmatchedPharmacists: string[]
  txCount:              number
  totalQuantity:        number
  grossSales:           number
  returnsValue:         number
  returnsCount:         number
  netSales:             number
  byDivision:           SmartListBreakdownEntry[]
  /** Optional: absent on documents written before the category
   *  dimension was added — callers must treat as `?? []`. */
  byCategory?:          SmartListBreakdownEntry[]
  topItems:             SmartListTopItem[]
  unclassifiedRowCount: number
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

// ── Branch daily trend ─────────────────────────────────────────
// The branch doc stores no daily series; it is reconstructed by
// summing the pharmacists' series so the two views always reconcile.
export function buildBranchDailySeries(docs: ItemSalesMonthlyDoc[]): SmartListDailyPoint[] {
  const byDate = new Map<string, { sales: number; txCount: number }>()
  for (const d of docs) {
    for (const point of d.dailySeries) {
      const e = byDate.get(point.date) ?? { sales: 0, txCount: 0 }
      e.sales += point.sales
      e.txCount += point.txCount
      byDate.set(point.date, e)
    }
  }
  return [...byDate.entries()]
    .map(([date, v]) => ({ date, sales: round2(v.sales), txCount: v.txCount }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── Division mix share ─────────────────────────────────────────
export interface DivisionShare extends SmartListBreakdownEntry {
  /** Share of the owner's net sales, 0-100. */
  sharePct: number
}

export function withDivisionShares(byDivision: SmartListBreakdownEntry[]): DivisionShare[] {
  const total = byDivision.reduce((s, d) => s + d.sales, 0)
  return byDivision.map((d) => ({
    ...d,
    sharePct: total > 0 ? round1((d.sales / total) * 100) : 0,
  }))
}

// ── Pharmacist strengths / focus areas ─────────────────────────
// Rank-based comparison of the pharmacist's division mix against the
// branch's division mix for the same month: divisions where the
// pharmacist's share of own sales most exceeds the branch share are
// "strengths"; those furthest below are "focus areas". Pure ranking —
// no invented cutoffs. Divisions the pharmacist never sold in are
// included as gaps only when the branch itself has meaningful sales
// there (branch share >= minBranchSharePct, default 5% — below that a
// gap says nothing).
export interface DivisionDelta {
  division:       string
  pharmacistPct:  number
  branchPct:      number
  deltaPct:       number   // pharmacistPct - branchPct
}

export interface StrengthsResult {
  strengths:  DivisionDelta[]
  focusAreas: DivisionDelta[]
}

/** Shared by compareDivisionMix/compareCategoryMix — same rank-based
 *  comparison, over whichever breakdown dimension the caller passes.
 *  `field` only labels the output ('division' | 'category'); the
 *  comparison math is dimension-agnostic. */
function compareBreakdownMix(
  pharmacistBreakdown: SmartListBreakdownEntry[],
  branchBreakdown: SmartListBreakdownEntry[],
  opts: { topN?: number; minBranchSharePct?: number } = {},
): StrengthsResult {
  const topN = opts.topN ?? 2
  const minBranchSharePct = opts.minBranchSharePct ?? 5

  const pShares = new Map(withDivisionShares(pharmacistBreakdown).map((d) => [d.key, d.sharePct]))
  const bShares = withDivisionShares(branchBreakdown)

  const deltas: DivisionDelta[] = []
  for (const b of bShares) {
    const pPct = pShares.get(b.key) ?? 0
    if (pPct === 0 && b.sharePct < minBranchSharePct) continue
    deltas.push({
      division:      b.key,
      pharmacistPct: pPct,
      branchPct:     b.sharePct,
      deltaPct:      round1(pPct - b.sharePct),
    })
  }
  // Keys the pharmacist sells that the branch mix doesn't list cannot
  // exist (branch = sum of pharmacists), so bShares covers all.

  const sorted = [...deltas].sort((a, b) => b.deltaPct - a.deltaPct)
  return {
    strengths:  sorted.slice(0, topN).filter((d) => d.deltaPct > 0),
    focusAreas: sorted.slice(-topN).reverse().filter((d) => d.deltaPct < 0),
  }
}

export function compareDivisionMix(
  pharmacist: ItemSalesMonthlyDoc,
  branch: ItemSalesBranchMonthlyDoc,
  opts: { topN?: number; minBranchSharePct?: number } = {},
): StrengthsResult {
  return compareBreakdownMix(pharmacist.byDivision, branch.byDivision, opts)
}

/** Same comparison as compareDivisionMix, over the category dimension.
 *  Category is optional on older documents — absent means no data to
 *  compare, not an error. */
export function compareCategoryMix(
  pharmacist: ItemSalesMonthlyDoc,
  branch: ItemSalesBranchMonthlyDoc,
  opts: { topN?: number; minBranchSharePct?: number } = {},
): StrengthsResult {
  return compareBreakdownMix(pharmacist.byCategory ?? [], branch.byCategory ?? [], opts)
}

// ── Returns rate ───────────────────────────────────────────────
/** Returns as % of gross sales, 0-100 (null when no gross sales). */
export function returnsRatePct(doc: { grossSales: number; returnsValue: number }): number | null {
  if (doc.grossSales <= 0) return null
  return round1((doc.returnsValue / doc.grossSales) * 100)
}

// ── Sales concentration ────────────────────────────────────────
/** Share of net sales carried by the top N items, 0-100 (null when
 *  netSales <= 0 — concentration is meaningless on a net-negative month). */
export function topItemsConcentrationPct(
  doc: { netSales: number; topItems: SmartListTopItem[] },
  topN = 5,
): number | null {
  if (doc.netSales <= 0) return null
  const topSales = doc.topItems.slice(0, topN).reduce((s, t) => s + Math.max(0, t.sales), 0)
  return round1(Math.min(100, (topSales / doc.netSales) * 100))
}

// ── Contribution ranking ───────────────────────────────────────
export interface PharmacistContribution {
  empId:           string
  empName:         string
  matchedUserId:   string | null
  netSales:        number
  txCount:         number
  contributionPct: number   // share of branch net sales, 0-100
  returnsRatePct:  number | null
  topDivision:     string | null
}

// ── Branch-to-branch comparison ────────────────────────────────
// Compares N branches for the SAME month — used by the multi-branch
// comparison view (a district/regional manager comparing branches
// within their own scope; the caller is responsible for only passing
// branches the viewer is allowed to see, same as elsewhere in the app).
export interface BranchComparisonRow {
  branchId:            string
  netSales:            number
  grossSales:          number
  returnsRatePct:      number | null
  /** Share of this branch's net sales among the compared set, 0-100. */
  contributionPct:     number
  topDivision:         string | null
  topDivisionSharePct: number | null
}

export interface SharedTopItem {
  itemCode:    string
  itemDesc:    string
  /** Number of the compared branches where this item appears in the
   *  branch's own top items. */
  branchCount: number
}

export interface BranchComparisonResult {
  rows:           BranchComparisonRow[]
  sharedTopItems: SharedTopItem[]
}

export function compareBranches(branches: ItemSalesBranchMonthlyDoc[]): BranchComparisonResult {
  const totalNet = branches.reduce((s, b) => s + b.netSales, 0)

  const rows: BranchComparisonRow[] = [...branches]
    .sort((a, b) => b.netSales - a.netSales)
    .map((b) => {
      const top = withDivisionShares(b.byDivision)[0] ?? null
      return {
        branchId:            b.branchId,
        netSales:            b.netSales,
        grossSales:          b.grossSales,
        returnsRatePct:      returnsRatePct(b),
        contributionPct:     totalNet > 0 ? round1((b.netSales / totalNet) * 100) : 0,
        topDivision:         top?.key ?? null,
        topDivisionSharePct: top?.sharePct ?? null,
      }
    })

  const itemBranchCount = new Map<string, { itemDesc: string; count: number }>()
  for (const b of branches) {
    const seenInThisBranch = new Set<string>()
    for (const item of b.topItems) {
      if (seenInThisBranch.has(item.itemCode)) continue
      seenInThisBranch.add(item.itemCode)
      const e = itemBranchCount.get(item.itemCode) ?? { itemDesc: item.itemDesc, count: 0 }
      e.count++
      itemBranchCount.set(item.itemCode, e)
    }
  }
  const sharedTopItems: SharedTopItem[] = [...itemBranchCount.entries()]
    .filter(([, v]) => v.count > 1)
    .map(([itemCode, v]) => ({ itemCode, itemDesc: v.itemDesc, branchCount: v.count }))
    .sort((a, b) => b.branchCount - a.branchCount)

  return { rows, sharedTopItems }
}

export function rankPharmacistContributions(
  docs: ItemSalesMonthlyDoc[],
): PharmacistContribution[] {
  const totalNet = docs.reduce((s, d) => s + d.netSales, 0)
  return [...docs]
    .sort((a, b) => b.netSales - a.netSales)
    .map((d) => ({
      empId:           d.empId,
      empName:         d.empName,
      matchedUserId:   d.matchedUserId,
      netSales:        d.netSales,
      txCount:         d.txCount,
      contributionPct: totalNet > 0 ? round1((d.netSales / totalNet) * 100) : 0,
      returnsRatePct:  returnsRatePct(d),
      topDivision:     d.byDivision[0]?.key ?? null,
    }))
}
