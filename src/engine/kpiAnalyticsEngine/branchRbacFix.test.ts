// ============================================================
// ReportsPage — Branch Performance RBAC Regression Tests
//
// Root cause that was fixed:
//   branchSummary iterated ALL active pharmacies regardless of role.
//   A manager's fetchedEntries only contained own-branch data (already
//   Firestore-scoped), so other branches appeared with actual=0 / target=0
//   → achievement=0 for every branch except their own.
//
// Fix:
//   visiblePharmacies = isAdmin
//     ? all active pharmacies
//     : pharmacies filtered to own pharmacyId
//
// Tests:
//   1.  Admin sees all branches in branchSummary
//   2.  Manager sees only own pharmacy
//   3.  Manager does not see other branches at all (no 0% ghost rows)
//   4.  branch_manager sees only own pharmacy
//   5.  Pharmacist gets empty branchSummary (isManager gate)
//   6.  Manager's own-branch achievement calculates correctly
//   7.  Admin own-branch achievement matches manager own-branch (same data)
//   8.  Source guard: ReportsPage uses visiblePharmacies, not raw pharmacies list
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  computeOverallAchievement,
  computeAchievementPct,
  KPI_KEYS,
} from '../../engine/kpiAnalyticsEngine'

// ── Shared helpers ────────────────────────────────────────────

// Simulates what the fixed branchSummary useMemo produces for a given set of inputs.
function runBranchSummary(opts: {
  role:       string
  pharmacyId: string        // user's own pharmacy
  pharmacies: Array<{ id: string; name: string; active: boolean }>
  entries:    Array<{ pharmacyId: string; wasfaty?: number; omni?: number }>
  targets:    Array<{ pharmacyId: string; month: string; wasfatyTarget?: number; omniTarget?: number }>
  month:      string
}) {
  const { role, pharmacyId, pharmacies, entries, targets, month } = opts

  const isAdmin   = role === 'admin'
  const isManager = ['admin', 'manager', 'branch_manager'].includes(role)

  if (!isManager) return []

  const targetMap: Record<string, any> = {}
  targets.forEach((t) => { if (t.month === month) targetMap[t.pharmacyId] = t })

  // THE KEY FIX: scope pharmacy list to user's own branch for non-admins
  const visiblePharmacies = isAdmin
    ? pharmacies.filter((p) => p.active !== false)
    : pharmacies.filter((p) => p.active !== false && p.id === pharmacyId)

  return visiblePharmacies
    .map((ph) => {
      const be     = entries.filter((e) => e.pharmacyId === ph.id)
      const actual = be.reduce((s, e) => s + (Number(e['wasfaty']) || 0), 0)
      const target = targetMap[ph.id]?.['wasfatyTarget'] || 0
      const kpiStatsMap: Record<string, any> = {
        wasfaty: { achievementPct: computeAchievementPct(actual, target), target, actual },
      }
      const ach = computeOverallAchievement(kpiStatsMap)
      return { id: ph.id, name: ph.name, achievement: ach, entryCount: be.length }
    })
    .sort((a, b) => b.achievement - a.achievement)
}

// ── Fixtures ──────────────────────────────────────────────────

const PHARMACIES = [
  { id: 'ph-atheer', name: 'الأثير',    active: true },
  { id: 'ph-riyadh', name: 'الرياض',   active: true },
  { id: 'ph-jeddah', name: 'جدة',      active: true },
]

const MONTH = '2026-06'

// Entries: only الأثير has real data (as Firestore pre-scopes for non-admin)
const ATHEER_ENTRIES = [
  { pharmacyId: 'ph-atheer', wasfaty: 800 },
  { pharmacyId: 'ph-atheer', wasfaty: 200 },
]

// Full entries for admin (all branches have data)
const ALL_ENTRIES = [
  ...ATHEER_ENTRIES,
  { pharmacyId: 'ph-riyadh', wasfaty: 600 },
  { pharmacyId: 'ph-jeddah', wasfaty: 400 },
]

const TARGETS = [
  { pharmacyId: 'ph-atheer', month: MONTH, wasfatyTarget: 1000 },   // 100%
  { pharmacyId: 'ph-riyadh', month: MONTH, wasfatyTarget: 1000 },   // 60%
  { pharmacyId: 'ph-jeddah', month: MONTH, wasfatyTarget: 1000 },   // 40%
]

// ════════════════════════════════════════════════════════════════
// 1. Admin sees all branches
// ════════════════════════════════════════════════════════════════

describe('RBAC branchSummary — admin', () => {
  it('admin sees all active branches', () => {
    const result = runBranchSummary({
      role: 'admin', pharmacyId: 'ph-atheer',
      pharmacies: PHARMACIES, entries: ALL_ENTRIES, targets: TARGETS, month: MONTH,
    })
    const ids = result.map((r) => r.id)
    expect(ids).toContain('ph-atheer')
    expect(ids).toContain('ph-riyadh')
    expect(ids).toContain('ph-jeddah')
    expect(result).toHaveLength(3)
  })

  it('admin branch achievements reflect real data (not all 0%)', () => {
    const result = runBranchSummary({
      role: 'admin', pharmacyId: 'ph-atheer',
      pharmacies: PHARMACIES, entries: ALL_ENTRIES, targets: TARGETS, month: MONTH,
    })
    const atheer = result.find((r) => r.id === 'ph-atheer')!
    expect(atheer.achievement).toBeGreaterThan(0)
  })
})

// ════════════════════════════════════════════════════════════════
// 2. Manager sees only own pharmacy
// ════════════════════════════════════════════════════════════════

describe('RBAC branchSummary — manager', () => {
  it('manager sees only own pharmacy (الأثير)', () => {
    const result = runBranchSummary({
      role: 'manager', pharmacyId: 'ph-atheer',
      pharmacies: PHARMACIES, entries: ATHEER_ENTRIES, targets: TARGETS, month: MONTH,
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ph-atheer')
  })

  it('manager does not see other branches as 0% ghost rows', () => {
    const result = runBranchSummary({
      role: 'manager', pharmacyId: 'ph-atheer',
      pharmacies: PHARMACIES, entries: ATHEER_ENTRIES, targets: TARGETS, month: MONTH,
    })
    const ids = result.map((r) => r.id)
    expect(ids).not.toContain('ph-riyadh')
    expect(ids).not.toContain('ph-jeddah')
  })

  it('manager own-branch achievement calculates correctly (100% of target)', () => {
    const result = runBranchSummary({
      role: 'manager', pharmacyId: 'ph-atheer',
      pharmacies: PHARMACIES, entries: ATHEER_ENTRIES, targets: TARGETS, month: MONTH,
    })
    expect(result[0].achievement).toBe(100)
  })

  it('manager with no entries still shows own branch (not zero ghost for others)', () => {
    const result = runBranchSummary({
      role: 'manager', pharmacyId: 'ph-atheer',
      pharmacies: PHARMACIES, entries: [], targets: TARGETS, month: MONTH,
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ph-atheer')
    expect(result[0].achievement).toBe(0)  // 0 because no entries, but correctly shows own branch
  })
})

// ════════════════════════════════════════════════════════════════
// 3. branch_manager sees only own pharmacy
// ════════════════════════════════════════════════════════════════

describe('RBAC branchSummary — branch_manager', () => {
  it('branch_manager sees only own pharmacy', () => {
    const result = runBranchSummary({
      role: 'branch_manager', pharmacyId: 'ph-riyadh',
      pharmacies: PHARMACIES, entries: [{ pharmacyId: 'ph-riyadh', wasfaty: 600 }],
      targets: TARGETS, month: MONTH,
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ph-riyadh')
  })

  it('branch_manager achievement is correct (60% of target)', () => {
    const result = runBranchSummary({
      role: 'branch_manager', pharmacyId: 'ph-riyadh',
      pharmacies: PHARMACIES, entries: [{ pharmacyId: 'ph-riyadh', wasfaty: 600 }],
      targets: TARGETS, month: MONTH,
    })
    expect(result[0].achievement).toBe(60)
  })
})

// ════════════════════════════════════════════════════════════════
// 4. Pharmacist gets empty branchSummary
// ════════════════════════════════════════════════════════════════

describe('RBAC branchSummary — pharmacist', () => {
  it('pharmacist returns empty branchSummary (isManager gate)', () => {
    const result = runBranchSummary({
      role: 'pharmacist', pharmacyId: 'ph-atheer',
      pharmacies: PHARMACIES, entries: ATHEER_ENTRIES, targets: TARGETS, month: MONTH,
    })
    expect(result).toHaveLength(0)
  })
})

// ════════════════════════════════════════════════════════════════
// 5. Admin and manager compute same achievement for shared branch
// ════════════════════════════════════════════════════════════════

describe('RBAC branchSummary — parity', () => {
  it('admin and manager produce same achievement for الأثير', () => {
    const adminResult   = runBranchSummary({
      role: 'admin', pharmacyId: 'ph-atheer',
      pharmacies: PHARMACIES, entries: ATHEER_ENTRIES, targets: TARGETS, month: MONTH,
    })
    const managerResult = runBranchSummary({
      role: 'manager', pharmacyId: 'ph-atheer',
      pharmacies: PHARMACIES, entries: ATHEER_ENTRIES, targets: TARGETS, month: MONTH,
    })
    const adminAtheer   = adminResult.find((r) => r.id === 'ph-atheer')!
    const managerAtheer = managerResult[0]
    expect(managerAtheer.achievement).toBe(adminAtheer.achievement)
  })
})

// ════════════════════════════════════════════════════════════════
// 6. Source guard
// ════════════════════════════════════════════════════════════════

describe('RBAC branchSummary — source guard', () => {
  it('ReportsPage uses visiblePharmacies scoped by scope (Phase 2F-3: filterAllowedPharmacies)', async () => {
    const src = await import('../../pages/shared/ReportsPage.jsx?raw')
    // Phase 2F-3 replaced isAdmin/pharmacyId gate with filterAllowedPharmacies(scope, pharmacies)
    expect(src.default).toContain('filterAllowedPharmacies(scope, pharmacies)')
    expect(src.default).toContain('const visiblePharmacies = scope')
  })

  it('isManager includes branch_manager', async () => {
    const src = await import('../../pages/shared/ReportsPage.jsx?raw')
    expect(src.default).toContain("['admin', 'manager', 'branch_manager'].includes(role)")
  })

  it('branchSummary dependency array includes scope (Phase 3A: isManager also removed from deps)', async () => {
    const src = await import('../../pages/shared/ReportsPage.jsx?raw')
    // Phase 3A: isManager removed from deps (gate is now scope-type-based)
    expect(src.default).toContain('scope, KPI_FIELDS')
    expect(src.default).not.toContain('isManager, scope, KPI_FIELDS')
    expect(src.default).not.toContain('isManager, isAdmin, pharmacyId')
  })
})
