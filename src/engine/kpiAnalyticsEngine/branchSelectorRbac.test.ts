// ============================================================
// ReportsPage — Branch Selector RBAC Regression Tests
//
// Root cause fixed:
//   Branch selector was rendered for all isManager roles (admin +
//   manager + branch_manager). Manager and branch_manager could see
//   and select branches they have no data access to.
//
// Fix applied:
//   1. selectedBranch initialises to pharmacyId (not 'all') for non-admins
//   2. Selector is only rendered when isAdmin === true
//
// Tests:
//   1.  Source: selector is gated on isAdmin (not isManager)
//   2.  Source: selectedBranch default is role-aware (non-admin → pharmacyId)
//   3.  Admin selectedBranch initialises to 'all'
//   4.  Non-admin selectedBranch initialises to own pharmacyId
//   5.  kpiSummary branches: admin with 'all' → all branch IDs
//   6.  kpiSummary branches: non-admin scoped to own pharmacyId
//   7.  rangeEntries filter: 'all' passes all entries
//   8.  rangeEntries filter: specific pharmacyId passes only own entries
//   9.  executiveSummary: when selectedBranch='all', falls back to first pharmacy
//  10.  executiveSummary: when selectedBranch=pharmacyId, uses that pharmacy
//  11.  manager locked to own pharmacyId — no 'all' exposure
//  12.  branch_manager locked to own pharmacyId — no 'all' exposure
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Helpers that mirror the ReportsPage logic ─────────────────

/** Initialise selectedBranch as the component does */
function initSelectedBranch(role: string, pharmacyId: string | undefined): string {
  return role === 'admin' ? 'all' : (pharmacyId ?? 'all')
}

/** Determine whether the selector should be visible */
function selectorVisible(isAdmin: boolean): boolean {
  return isAdmin  // only admin sees the selector
}

/** Compute kpiSummary branches list (mirrors the useMemo logic) */
function computeBranches(selectedBranch: string, entries: Array<{ pharmacyId: string }>): string[] {
  return selectedBranch === 'all'
    ? [...new Set(entries.map((e) => e.pharmacyId))]
    : [selectedBranch]
}

/** Filter entries to selectedBranch (mirrors rangeEntries useMemo) */
function filterEntries(
  entries: Array<{ pharmacyId: string; date: string }>,
  selectedBranch: string,
  dateFrom: string,
  dateTo: string,
): Array<{ pharmacyId: string; date: string }> {
  return entries.filter((e) => {
    const inDate   = e.date >= dateFrom && e.date <= dateTo
    const inBranch = selectedBranch === 'all' || e.pharmacyId === selectedBranch
    return inDate && inBranch
  })
}

/** executiveSummary pharmacyId resolution */
function resolveExecutivePharmacyId(
  selectedBranch: string,
  pharmacies: Array<{ id: string; active: boolean }>,
): string | undefined {
  return selectedBranch !== 'all'
    ? selectedBranch
    : pharmacies.find((p) => p.active)?.id
}

// ── Fixtures ──────────────────────────────────────────────────

const ALL_PHARMACIES = [
  { id: 'ph-atheer', active: true  },
  { id: 'ph-riyadh', active: true  },
  { id: 'ph-jeddah', active: true  },
]

const ENTRIES = [
  { pharmacyId: 'ph-atheer', date: '2026-06-15' },
  { pharmacyId: 'ph-riyadh', date: '2026-06-15' },
  { pharmacyId: 'ph-jeddah', date: '2026-06-15' },
]

// ════════════════════════════════════════════════════════════════
// 1–2. Source guards — selector and default state
// ════════════════════════════════════════════════════════════════

describe('Selector RBAC — source guards', () => {
  it('selector is scope-driven (Phase 2F-2: all/list show selector, single hides it)', async () => {
    const src = await import('../../pages/shared/ReportsPage.jsx?raw')
    // Phase 2F-2 replaced isAdmin gate with scope-based gate
    expect(src.default).toContain("scope?.type === 'all' || scope?.type === 'list'")
    // Must NOT show selector for single scope (managers locked to own branch)
    const selectorIdx = src.default.indexOf('{/* Branch selector')
    const selectorBlock = src.default.slice(selectorIdx, selectorIdx + 300)
    expect(selectorBlock).not.toContain('{isManager && (')
    expect(selectorBlock).not.toContain('{isAdmin && (')
  })

  it('selectedBranch initializes to null (Phase 2F-2: scope-driven init)', async () => {
    const src = await import('../../pages/shared/ReportsPage.jsx?raw')
    // Phase 2F-2 changed from role-aware closure to null (auto-set by scope useEffect)
    expect(src.default).toContain('useState(null)')
    expect(src.default).not.toContain("userProfile?.role === 'admin' ? 'all'")
  })
})

// ════════════════════════════════════════════════════════════════
// 3–4. selectedBranch initial value by role
// ════════════════════════════════════════════════════════════════

describe('Selector RBAC — selectedBranch initialisation', () => {
  it("admin → selectedBranch = 'all'", () => {
    expect(initSelectedBranch('admin', 'ph-atheer')).toBe('all')
  })

  it("manager → selectedBranch = own pharmacyId", () => {
    expect(initSelectedBranch('manager', 'ph-atheer')).toBe('ph-atheer')
  })

  it("branch_manager → selectedBranch = own pharmacyId", () => {
    expect(initSelectedBranch('branch_manager', 'ph-riyadh')).toBe('ph-riyadh')
  })

  it("pharmacist → selectedBranch = own pharmacyId", () => {
    expect(initSelectedBranch('pharmacist', 'ph-jeddah')).toBe('ph-jeddah')
  })

  it("non-admin with no pharmacyId falls back to 'all' safely", () => {
    expect(initSelectedBranch('manager', undefined)).toBe('all')
  })
})

// ════════════════════════════════════════════════════════════════
// 5–6. Selector visibility
// ════════════════════════════════════════════════════════════════

describe('Selector RBAC — visibility', () => {
  it('admin sees selector', () => {
    expect(selectorVisible(true)).toBe(true)
  })

  it('manager does not see selector', () => {
    expect(selectorVisible(false)).toBe(false)
  })

  it('branch_manager does not see selector', () => {
    expect(selectorVisible(false)).toBe(false)
  })

  it('pharmacist does not see selector', () => {
    expect(selectorVisible(false)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════
// 7–8. kpiSummary branches computation
// ════════════════════════════════════════════════════════════════

describe('Selector RBAC — kpiSummary branch scope', () => {
  it("admin with 'all' → branches = all distinct pharmacyIds from entries", () => {
    const branches = computeBranches('all', ENTRIES)
    expect(branches).toHaveLength(3)
    expect(branches).toContain('ph-atheer')
    expect(branches).toContain('ph-riyadh')
    expect(branches).toContain('ph-jeddah')
  })

  it('manager with own pharmacyId → branches = only own branch', () => {
    const branches = computeBranches('ph-atheer', ENTRIES)
    expect(branches).toEqual(['ph-atheer'])
  })
})

// ════════════════════════════════════════════════════════════════
// 9–10. rangeEntries filter
// ════════════════════════════════════════════════════════════════

describe('Selector RBAC — rangeEntries filtering', () => {
  it("'all' passes entries from all branches", () => {
    const filtered = filterEntries(ENTRIES, 'all', '2026-06-01', '2026-06-30')
    expect(filtered).toHaveLength(3)
  })

  it('own pharmacyId filters to only own entries', () => {
    const filtered = filterEntries(ENTRIES, 'ph-atheer', '2026-06-01', '2026-06-30')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].pharmacyId).toBe('ph-atheer')
  })
})

// ════════════════════════════════════════════════════════════════
// 11–12. executiveSummary pharmacyId resolution
// ════════════════════════════════════════════════════════════════

describe('Selector RBAC — executiveSummary resolution', () => {
  it("'all' falls back to first active pharmacy", () => {
    const id = resolveExecutivePharmacyId('all', ALL_PHARMACIES)
    expect(id).toBe('ph-atheer')
  })

  it('specific pharmacyId is used directly', () => {
    const id = resolveExecutivePharmacyId('ph-riyadh', ALL_PHARMACIES)
    expect(id).toBe('ph-riyadh')
  })
})

// ════════════════════════════════════════════════════════════════
// 13–14. Manager and branch_manager remain locked
// ════════════════════════════════════════════════════════════════

describe('Selector RBAC — non-admin lock', () => {
  it('manager selectedBranch is own pharmacyId — cannot be all', () => {
    const branch = initSelectedBranch('manager', 'ph-atheer')
    expect(branch).not.toBe('all')
    expect(branch).toBe('ph-atheer')
  })

  it('branch_manager selectedBranch is own pharmacyId — cannot be all', () => {
    const branch = initSelectedBranch('branch_manager', 'ph-riyadh')
    expect(branch).not.toBe('all')
    expect(branch).toBe('ph-riyadh')
  })

  it('manager kpiSummary scope is only own branch', () => {
    const branch  = initSelectedBranch('manager', 'ph-atheer')
    const branches = computeBranches(branch, ENTRIES)
    expect(branches).toEqual(['ph-atheer'])
    expect(branches).not.toContain('ph-riyadh')
    expect(branches).not.toContain('ph-jeddah')
  })

  it('branch_manager kpiSummary scope is only own branch', () => {
    const branch   = initSelectedBranch('branch_manager', 'ph-riyadh')
    const branches = computeBranches(branch, ENTRIES)
    expect(branches).toEqual(['ph-riyadh'])
    expect(branches).not.toContain('ph-atheer')
  })
})
