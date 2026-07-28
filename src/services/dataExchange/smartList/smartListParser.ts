// ============================================================
// Smart List — Item-Level Sales Parser (DX-12)
//
// Pure module: raw sheet_to_json rows -> normalized item-sale rows
// -> per-pharmacist / per-branch monthly aggregates. No Firebase,
// no UI. Header resolution is alias-based and deliberately accepts
// the exact production export headers of the pharmacy POS smart
// list — including its real-world spellings ("Divison",
// "bussines date") — so an admin can upload the file exactly as
// the system produces it, with zero manual column mapping.
//
// Aggregation, not raw storage: the Excel file stays the source of
// truth for item rows; PharmaPulse persists compact per-pharmacist
// monthly summaries (see smartListCommitService.ts) that power the
// item/division strength-weakness analytics.
// ============================================================

export interface SmartListRow {
  rowIndex:    number      // 1-based data row (header excluded)
  empId:       string
  empName:     string
  division:    string      // 'UNCLASSIFIED' when the source cell is blank
  department:  string
  category:    string
  subCategory: string
  itemClass:   string
  itemCode:    string
  itemDesc:    string
  quantity:    number
  totalSales:  number      // negative = return/cancellation
  date:        string      // ISO yyyy-MM-dd
  month:       string      // yyyy-MM
  isReturn:    boolean
}

export interface SmartListParseIssue {
  rowIndex: number
  field:    string
  message:  string
}

export interface SmartListParseResult {
  rows:            SmartListRow[]
  issues:          SmartListParseIssue[]
  skippedRowCount: number
}

export const UNCLASSIFIED_DIVISION = 'UNCLASSIFIED'

// Source header -> canonical field. Keys are compared lowercased and
// whitespace-collapsed. Includes the verbatim production spellings.
export const SMART_LIST_HEADER_ALIASES: Record<string, string[]> = {
  empId:       ['empid', 'emp id', 'employee id', 'employeeid', 'الرقم الوظيفي'],
  empName:     ['empname', 'emp name', 'employee name', 'اسم الموظف'],
  division:    ['divison', 'division', 'القسم الرئيسي'],
  department:  ['department', 'القسم'],
  category:    ['category', 'الفئة'],
  subCategory: ['sub category', 'subcategory', 'الفئة الفرعية'],
  itemClass:   ['class', 'التصنيف'],
  itemCode:    ['item code', 'itemcode', 'كود الصنف'],
  itemDesc:    ['itemdesc', 'item desc', 'item description', 'itemdescription', 'اسم الصنف', 'الصنف'],
  quantity:    ['quantity', 'qty', 'الكمية'],
  totalSales:  ['totalsales', 'total sales', 'sales', 'المبيعات', 'اجمالي المبيعات'],
  date:        ['bussines date', 'business date', 'businessdate', 'date', 'التاريخ'],
}

/** Fields the file MUST provide; the rest degrade gracefully. */
export const SMART_LIST_REQUIRED_FIELDS = ['empId', 'empName', 'itemCode', 'quantity', 'totalSales', 'date'] as const

function normalizeHeader(header: string): string {
  return String(header).trim().toLowerCase().replace(/\s+/g, ' ')
}

export interface SmartListHeaderResolution {
  /** canonical field -> source header actually present in the file */
  mapping:        Record<string, string>
  missingFields:  string[]
  unknownHeaders: string[]
}

export function resolveSmartListHeaders(headers: string[]): SmartListHeaderResolution {
  const mapping: Record<string, string> = {}
  const unknownHeaders: string[] = []
  for (const header of headers) {
    const norm = normalizeHeader(header)
    const field = Object.keys(SMART_LIST_HEADER_ALIASES).find(
      (f) => SMART_LIST_HEADER_ALIASES[f].includes(norm),
    )
    if (field && !(field in mapping)) mapping[field] = header
    else if (!field) unknownHeaders.push(header)
  }
  const missingFields = SMART_LIST_REQUIRED_FIELDS.filter((f) => !(f in mapping))
  return { mapping, missingFields, unknownHeaders }
}

/** Accepts "DD/MM/YYYY" (production format), "yyyy-MM-dd", or an Excel
 *  serial date number. Returns ISO yyyy-MM-dd or null when unparseable. */
export function normalizeSmartListDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel 1900 epoch serial (same convention SheetJS uses when
    // cellDates is off and the cell is numeric).
    const ms = Math.round((value - 25569) * 86400 * 1000)
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  if (typeof value !== 'string') return null
  const s = value.trim()
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) {
    const [, dd, mm, yyyy] = m
    if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null
    return `${yyyy}-${mm}-${dd}`
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return s
  return null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

const CANCELLED_MARKER = 'CANCELLED'

export function parseSmartListRows(
  rawRows: Array<Record<string, unknown>>,
): SmartListParseResult {
  if (rawRows.length === 0) return { rows: [], issues: [], skippedRowCount: 0 }

  const { mapping, missingFields } = resolveSmartListHeaders(Object.keys(rawRows[0]))
  if (missingFields.length > 0) {
    return {
      rows: [],
      issues: [{ rowIndex: 0, field: missingFields.join(', '), message: `Missing required column(s): ${missingFields.join(', ')}` }],
      skippedRowCount: rawRows.length,
    }
  }

  const get = (row: Record<string, unknown>, field: string): unknown =>
    field in mapping ? row[mapping[field]] : undefined
  const getText = (row: Record<string, unknown>, field: string): string => {
    const v = get(row, field)
    return v === null || v === undefined ? '' : String(v).trim()
  }

  const rows: SmartListRow[] = []
  const issues: SmartListParseIssue[] = []
  let skippedRowCount = 0

  rawRows.forEach((raw, i) => {
    const rowIndex = i + 1
    const empId = getText(raw, 'empId')
    const date = normalizeSmartListDate(get(raw, 'date'))
    const quantity = toNumber(get(raw, 'quantity'))
    const totalSales = toNumber(get(raw, 'totalSales'))

    if (!empId) { issues.push({ rowIndex, field: 'empId', message: 'Missing employee id' }); skippedRowCount++; return }
    if (!date) { issues.push({ rowIndex, field: 'date', message: `Unparseable business date "${getText(raw, 'date')}"` }); skippedRowCount++; return }
    if (quantity === null) { issues.push({ rowIndex, field: 'quantity', message: 'Quantity is not a number' }); skippedRowCount++; return }
    if (totalSales === null) { issues.push({ rowIndex, field: 'totalSales', message: 'Total sales is not a number' }); skippedRowCount++; return }

    const subCategory = getText(raw, 'subCategory')
    rows.push({
      rowIndex,
      empId,
      empName:     getText(raw, 'empName'),
      division:    getText(raw, 'division') || UNCLASSIFIED_DIVISION,
      department:  getText(raw, 'department'),
      category:    getText(raw, 'category'),
      subCategory,
      itemClass:   getText(raw, 'itemClass'),
      itemCode:    getText(raw, 'itemCode'),
      itemDesc:    getText(raw, 'itemDesc'),
      quantity,
      totalSales,
      date,
      month:       date.slice(0, 7),
      isReturn:    totalSales < 0 || subCategory.toUpperCase().includes(CANCELLED_MARKER),
    })
  })

  return { rows, issues, skippedRowCount }
}

// ── Aggregation ────────────────────────────────────────────────

export interface SmartListBreakdownEntry {
  key:      string
  sales:    number     // net (returns included as negatives)
  quantity: number
  txCount:  number
}

export interface SmartListTopItem {
  itemCode: string
  itemDesc: string
  quantity: number
  sales:    number
}

export interface SmartListDailyPoint {
  date:    string
  sales:   number
  txCount: number
}

export interface SmartListPharmacistAggregate {
  empId:         string
  empName:       string
  txCount:       number
  totalQuantity: number
  grossSales:    number   // positive lines only
  returnsValue:  number   // abs(sum of negative lines)
  returnsCount:  number
  netSales:      number
  byDivision:    SmartListBreakdownEntry[]
  byDepartment:  SmartListBreakdownEntry[]
  byCategory:    SmartListBreakdownEntry[]
  topItems:      SmartListTopItem[]
  dailySeries:   SmartListDailyPoint[]
}

export interface SmartListAggregateResult {
  months:          string[]   // distinct, sorted — a clean file has exactly 1
  pharmacists:     SmartListPharmacistAggregate[]
  branch: {
    txCount:       number
    totalQuantity: number
    grossSales:    number
    returnsValue:  number
    returnsCount:  number
    netSales:      number
    byDivision:    SmartListBreakdownEntry[]
    byCategory:    SmartListBreakdownEntry[]
    topItems:      SmartListTopItem[]
  }
  unclassifiedRowCount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

function sortedBreakdown(map: Map<string, { sales: number; quantity: number; txCount: number }>): SmartListBreakdownEntry[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, sales: round2(v.sales), quantity: round2(v.quantity), txCount: v.txCount }))
    .sort((a, b) => b.sales - a.sales)
}

function topItemsFrom(map: Map<string, { itemDesc: string; quantity: number; sales: number }>, limit: number): SmartListTopItem[] {
  return [...map.entries()]
    .map(([itemCode, v]) => ({ itemCode, itemDesc: v.itemDesc, quantity: round2(v.quantity), sales: round2(v.sales) }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit)
}

export const TOP_ITEMS_LIMIT = 15

export function aggregateSmartList(rows: SmartListRow[]): SmartListAggregateResult {
  const months = [...new Set(rows.map((r) => r.month))].sort()

  interface Acc {
    empName: string
    txCount: number
    totalQuantity: number
    grossSales: number
    returnsValue: number
    returnsCount: number
    byDivision: Map<string, { sales: number; quantity: number; txCount: number }>
    byDepartment: Map<string, { sales: number; quantity: number; txCount: number }>
    byCategory: Map<string, { sales: number; quantity: number; txCount: number }>
    items: Map<string, { itemDesc: string; quantity: number; sales: number }>
    daily: Map<string, { sales: number; txCount: number }>
  }

  const perEmp = new Map<string, Acc>()
  const branchDivision = new Map<string, { sales: number; quantity: number; txCount: number }>()
  const branchCategory = new Map<string, { sales: number; quantity: number; txCount: number }>()
  const branchItems = new Map<string, { itemDesc: string; quantity: number; sales: number }>()
  let branchGross = 0, branchReturns = 0, branchReturnsCount = 0, branchQty = 0
  let unclassifiedRowCount = 0

  for (const row of rows) {
    if (row.division === UNCLASSIFIED_DIVISION) unclassifiedRowCount++
    let acc = perEmp.get(row.empId)
    if (!acc) {
      acc = {
        empName: row.empName, txCount: 0, totalQuantity: 0, grossSales: 0,
        returnsValue: 0, returnsCount: 0,
        byDivision: new Map(), byDepartment: new Map(), byCategory: new Map(), items: new Map(), daily: new Map(),
      }
      perEmp.set(row.empId, acc)
    }
    acc.txCount++
    acc.totalQuantity += row.quantity
    branchQty += row.quantity
    if (row.totalSales < 0) {
      acc.returnsValue += -row.totalSales
      acc.returnsCount++
      branchReturns += -row.totalSales
      branchReturnsCount++
    } else {
      acc.grossSales += row.totalSales
      branchGross += row.totalSales
    }

    const bump = (map: Map<string, { sales: number; quantity: number; txCount: number }>, key: string) => {
      const e = map.get(key) ?? { sales: 0, quantity: 0, txCount: 0 }
      e.sales += row.totalSales
      e.quantity += row.quantity
      e.txCount++
      map.set(key, e)
    }
    bump(acc.byDivision, row.division)
    if (row.department) bump(acc.byDepartment, row.department)
    if (row.category) bump(acc.byCategory, row.category)
    bump(branchDivision, row.division)
    if (row.category) bump(branchCategory, row.category)

    const bumpItem = (map: Map<string, { itemDesc: string; quantity: number; sales: number }>) => {
      const e = map.get(row.itemCode) ?? { itemDesc: row.itemDesc, quantity: 0, sales: 0 }
      e.quantity += row.quantity
      e.sales += row.totalSales
      map.set(row.itemCode, e)
    }
    bumpItem(acc.items)
    bumpItem(branchItems)

    const day = acc.daily.get(row.date) ?? { sales: 0, txCount: 0 }
    day.sales += row.totalSales
    day.txCount++
    acc.daily.set(row.date, day)
  }

  const pharmacists: SmartListPharmacistAggregate[] = [...perEmp.entries()]
    .map(([empId, acc]) => ({
      empId,
      empName:       acc.empName,
      txCount:       acc.txCount,
      totalQuantity: round2(acc.totalQuantity),
      grossSales:    round2(acc.grossSales),
      returnsValue:  round2(acc.returnsValue),
      returnsCount:  acc.returnsCount,
      netSales:      round2(acc.grossSales - acc.returnsValue),
      byDivision:    sortedBreakdown(acc.byDivision),
      byDepartment:  sortedBreakdown(acc.byDepartment),
      byCategory:    sortedBreakdown(acc.byCategory),
      topItems:      topItemsFrom(acc.items, TOP_ITEMS_LIMIT),
      dailySeries:   [...acc.daily.entries()]
        .map(([date, v]) => ({ date, sales: round2(v.sales), txCount: v.txCount }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.netSales - a.netSales)

  return {
    months,
    pharmacists,
    branch: {
      txCount:       rows.length,
      totalQuantity: round2(branchQty),
      grossSales:    round2(branchGross),
      returnsValue:  round2(branchReturns),
      returnsCount:  branchReturnsCount,
      netSales:      round2(branchGross - branchReturns),
      byDivision:    sortedBreakdown(branchDivision),
      byCategory:    sortedBreakdown(branchCategory),
      topItems:      topItemsFrom(branchItems, TOP_ITEMS_LIMIT),
    },
    unclassifiedRowCount,
  }
}
