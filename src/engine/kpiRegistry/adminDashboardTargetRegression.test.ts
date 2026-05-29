// ============================================================
// Admin Dashboard Target Lookup — Regression Tests
//
// ROOT CAUSE:
//   DashboardPage computed currentTarget as:
//     targets.find(t => t.pharmacyId === pharmacyId && ...)
//   Admin users have NO pharmacyId on their profile.
//   → pharmacyId = undefined → find never matches → currentTarget = undefined
//   → every KPI shows "No target" in the admin dashboard.
//
//   Reports page builds a targetMap keyed by pharmacyId then aggregates
//   across all branches — so it correctly found totals.
//
// FIX:
//   For isAdmin, sum all current-month targets across all pharmacies
//   into a synthetic aggregated target doc. Same aggregation as Reports.
//   Manager/pharmacist path unchanged.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'

import { getTargetFieldName }           from '../../engine/kpiRegistry'
import { DEFAULT_KPI_REGISTRY }         from '../../engine/kpiRegistry'
import { getKpisForSurface }            from '../../engine/kpiRegistry'
import type { KpiRegistry }             from '../../engine/kpiRegistry'

const DASHBOARD_SRC = readFileSync(
  resolve(__dirname, '../../pages/dashboard/DashboardPage.jsx'), 'utf8'
)
const REPORTS_SRC = readFileSync(
  resolve(__dirname, '../../pages/shared/ReportsPage.jsx'), 'utf8'
)

// ── Fixtures ───────────────────────────────────────────────

const THIS_MONTH = new Date().toISOString().slice(0, 7)  // 'yyyy-MM'

function makeTarget(pharmacyId: string, overrides: Record<string, number> = {}) {
  return {
    pharmacyId,
    month: THIS_MONTH,
    wasfatyTarget:    200,
    omniTarget:       100,
    wellnessTarget:   150,
    basketTarget:     2500,
    crossSellTarget:  80,
    ...overrides,
  }
}

// ── Mirror of fixed DashboardPage currentTarget computation ──

function computeCurrentTarget(
  targets:     ReturnType<typeof makeTarget>[],
  pharmacyId:  string | undefined,
  thisMonth:   string,
  isAdmin:     boolean,
) {
  if (!targets.length) return undefined

  if (isAdmin) {
    const monthTargets = targets.filter((t) => t.month === thisMonth)
    if (!monthTargets.length) return undefined

    const aggregated: Record<string, number | string> = {
      pharmacyId: 'all',
      month:      thisMonth,
    }
    for (const t of monthTargets) {
      for (const [k, v] of Object.entries(t)) {
        if (!k.endsWith('Target')) continue
        aggregated[k] = ((aggregated[k] as number) || 0) + (Number(v) || 0)
      }
    }
    return aggregated
  }

  return targets.find((t) => t.pharmacyId === pharmacyId && t.month === thisMonth)
}

// ── Mirror of Reports totalTarget computation for one KPI ──

function computeReportsTotalTarget(
  targets:        ReturnType<typeof makeTarget>[],
  targetKey:      string,
  selectedBranch: string,
  currentMonth:   string,
) {
  const targetMap: Record<string, ReturnType<typeof makeTarget>> = {}
  targets.forEach((t) => { if (t.month === currentMonth) targetMap[t.pharmacyId] = t })
  const branches = selectedBranch === 'all'
    ? Object.keys(targetMap)
    : [selectedBranch]
  return branches.reduce((s, pid) => s + ((targetMap[pid] as Record<string, number>)?.[targetKey] || 0), 0)
}

// ══════════════════════════════════════════════════════════════
// 1 — Root cause reproduction
// ══════════════════════════════════════════════════════════════

describe('Admin dashboard target lookup — root cause', () => {
  const targets = [
    makeTarget('ph1', { wasfatyTarget: 200 }),
    makeTarget('ph2', { wasfatyTarget: 150 }),
  ]

  it('OLD behavior: undefined pharmacyId causes find to return undefined', () => {
    // Simulates old: targets.find(t => t.pharmacyId === undefined && t.month === thisMonth)
    const result = targets.find((t) => t.pharmacyId === undefined && t.month === THIS_MONTH)
    expect(result).toBeUndefined()   // ← the bug: admin always gets undefined
  })

  it('admin has no pharmacyId on their profile (undefined)', () => {
    const adminProfile = { role: 'admin', uid: 'admin-001', displayName: 'Admin' }
    expect((adminProfile as { pharmacyId?: string }).pharmacyId).toBeUndefined()
  })

  it('undefined pharmacyId causes every KPI to show "No target"', () => {
    const currentTarget = undefined
    // Simulates kpiStats target lookup: currentTarget ? (...) : 0
    const target = currentTarget ? 999 : 0
    expect(target).toBe(0)  // ← "No target" rendered
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — Fix: admin gets aggregated target
// ══════════════════════════════════════════════════════════════

describe('Admin dashboard target lookup — fix applied', () => {
  const targets = [
    makeTarget('ph1', { wasfatyTarget: 200, omniTarget: 100 }),
    makeTarget('ph2', { wasfatyTarget: 150, omniTarget:  80 }),
    makeTarget('ph3', { wasfatyTarget: 100, omniTarget:  60 }),
  ]

  it('admin gets aggregated target when pharmacyId is undefined', () => {
    const result = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    expect(result).not.toBeUndefined()
    expect(result?.pharmacyId).toBe('all')
  })

  it('admin aggregated target sums wasfatyTarget across all branches', () => {
    const result = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    expect(result?.wasfatyTarget).toBe(450)   // 200 + 150 + 100
  })

  it('admin aggregated target sums omniTarget across all branches', () => {
    const result = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    expect(result?.omniTarget).toBe(240)   // 100 + 80 + 60
  })

  it('admin aggregated target has correct month', () => {
    const result = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    expect(result?.month).toBe(THIS_MONTH)
  })

  it('returns undefined when no targets exist for current month', () => {
    const oldTargets = [makeTarget('ph1')].map((t) => ({ ...t, month: '2020-01' }))
    const result = computeCurrentTarget(oldTargets, undefined, THIS_MONTH, true)
    expect(result).toBeUndefined()
  })

  it('returns undefined when targets array is empty', () => {
    const result = computeCurrentTarget([], undefined, THIS_MONTH, true)
    expect(result).toBeUndefined()
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — Manager/pharmacist path unchanged
// ══════════════════════════════════════════════════════════════

describe('Manager/pharmacist target lookup — behavior unchanged', () => {
  const targets = [
    makeTarget('ph1', { wasfatyTarget: 200 }),
    makeTarget('ph2', { wasfatyTarget: 150 }),
  ]

  it('manager finds their specific pharmacy target', () => {
    const result = computeCurrentTarget(targets, 'ph1', THIS_MONTH, false)
    expect(result).toBeDefined()
    expect((result as ReturnType<typeof makeTarget>)?.pharmacyId).toBe('ph1')
    expect((result as ReturnType<typeof makeTarget>)?.wasfatyTarget).toBe(200)
  })

  it('pharmacist finds their specific pharmacy target', () => {
    const result = computeCurrentTarget(targets, 'ph2', THIS_MONTH, false)
    expect((result as ReturnType<typeof makeTarget>)?.wasfatyTarget).toBe(150)
  })

  it('manager returns undefined when no target for their pharmacy', () => {
    const result = computeCurrentTarget(targets, 'ph-missing', THIS_MONTH, false)
    expect(result).toBeUndefined()
  })

  it('manager does NOT get aggregated target (isAdmin=false)', () => {
    const result = computeCurrentTarget(targets, 'ph1', THIS_MONTH, false)
    expect((result as any)?.pharmacyId).not.toBe('all')
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — Admin target vs Reports target consistency
// ══════════════════════════════════════════════════════════════

describe('Admin dashboard vs Reports — consistent target aggregation', () => {
  const targets = [
    makeTarget('ph1', { wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 150, crossSellTarget: 40 }),
    makeTarget('ph2', { wasfatyTarget: 150, omniTarget:  80, wellnessTarget: 100, crossSellTarget: 30 }),
  ]

  it('admin aggregated wasfatyTarget matches Reports all-branch total', () => {
    const adminTarget   = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    const reportsTotalW = computeReportsTotalTarget(targets, 'wasfatyTarget', 'all', THIS_MONTH)
    expect(adminTarget?.wasfatyTarget).toBe(reportsTotalW)
  })

  it('admin aggregated omniTarget matches Reports all-branch total', () => {
    const adminTarget   = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    const reportsTotalO = computeReportsTotalTarget(targets, 'omniTarget', 'all', THIS_MONTH)
    expect(adminTarget?.omniTarget).toBe(reportsTotalO)
  })

  it('admin aggregated wellnessTarget matches Reports all-branch total', () => {
    const adminTarget   = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    const reportsTotal  = computeReportsTotalTarget(targets, 'wellnessTarget', 'all', THIS_MONTH)
    expect(adminTarget?.wellnessTarget).toBe(reportsTotal)
  })

  it('admin aggregated crossSellTarget matches Reports all-branch total', () => {
    const adminTarget   = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    const reportsTotal  = computeReportsTotalTarget(targets, 'crossSellTarget', 'all', THIS_MONTH)
    expect(adminTarget?.crossSellTarget).toBe(reportsTotal)
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — getTargetFieldName mapping correctness
// ══════════════════════════════════════════════════════════════

describe('getTargetFieldName — registry key → Firestore target field', () => {
  it('wasfaty → wasfatyTarget', () => {
    expect(getTargetFieldName('wasfaty')).toBe('wasfatyTarget')
  })

  it('omnihealth → omniTarget (registry key has alias, target field is omniTarget)', () => {
    expect(getTargetFieldName('omnihealth')).toBe('omniTarget')
  })

  it('wellnessCard → wellnessTarget', () => {
    expect(getTargetFieldName('wellnessCard')).toBe('wellnessTarget')
  })

  it('basket → basketTarget', () => {
    expect(getTargetFieldName('basket')).toBe('basketTarget')
  })

  it('crossSelling → crossSellTarget', () => {
    expect(getTargetFieldName('crossSelling')).toBe('crossSellTarget')
  })

  it('nps → npsTarget (dynamic fallback: engineKey + Target)', () => {
    expect(getTargetFieldName('nps')).toBe('npsTarget')
  })

  it('sales → salesTarget', () => {
    expect(getTargetFieldName('sales')).toBe('salesTarget')
  })

  it('sl → slTarget', () => {
    expect(getTargetFieldName('sl')).toBe('slTarget')
  })

  it('ndf → ndfTarget', () => {
    expect(getTargetFieldName('ndf')).toBe('ndfTarget')
  })

  it('inbody → inbodyTarget', () => {
    expect(getTargetFieldName('inbody')).toBe('inbodyTarget')
  })

  it('liberation → liberationTarget', () => {
    expect(getTargetFieldName('liberation')).toBe('liberationTarget')
  })

  it('unknown custom KPI gets engineKey + Target fallback', () => {
    expect(getTargetFieldName('manuka')).toBe('manukaTarget')
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — Dynamic KPI target field lookup via aggregated target
// ══════════════════════════════════════════════════════════════

describe('Admin dashboard — dynamic KPI target lookup with aggregated target', () => {
  const targets = [
    { ...makeTarget('ph1'), npsTarget: 90, salesTarget: 50000 },
    { ...makeTarget('ph2'), npsTarget: 85, salesTarget: 40000 },
  ]

  it('aggregated target includes npsTarget sum', () => {
    const result = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    expect(result?.npsTarget).toBe(175)   // 90 + 85
  })

  it('aggregated target includes salesTarget sum', () => {
    const result = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    expect(result?.salesTarget).toBe(90000)   // 50000 + 40000
  })

  it('kpiStats can read npsTarget from aggregated target via getTargetFieldName', () => {
    const aggregated = computeCurrentTarget(targets, undefined, THIS_MONTH, true) as Record<string, unknown>
    const targetField = getTargetFieldName('nps')  // → 'npsTarget'
    const target = aggregated ? (Number(aggregated[targetField]) || 0) : 0
    expect(target).toBe(175)
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — Source patch verification
// ══════════════════════════════════════════════════════════════

describe('DashboardPage — source patch verification', () => {
  it('no longer has a bare single-pharmacy target lookup for admin', () => {
    // Old: targets.find((t) => t.pharmacyId === pharmacyId && t.month === thisMonth)
    // Should NOT appear as the only target lookup — admin branch must aggregate
    // Note: the manager/pharmacist branch still has a similar find, so check for isAdmin guard
    expect(DASHBOARD_SRC).toContain('isAdmin')
    expect(DASHBOARD_SRC).toMatch(/isAdmin[\s\S]{1,200}aggregated|aggregated[\s\S]{1,200}isAdmin/m)
  })

  it('admin path aggregates by summing Target fields', () => {
    expect(DASHBOARD_SRC).toMatch(/endsWith\s*\(\s*['"]Target['"]\s*\)/)
  })

  it('admin target pharmacyId is set to "all"', () => {
    expect(DASHBOARD_SRC).toContain("pharmacyId: 'all'")
  })

  it('manager/pharmacist path still uses targets.find with pharmacyId', () => {
    expect(DASHBOARD_SRC).toMatch(/targets\.find[^}]+pharmacyId.*month|targets\.find[^}]+month.*pharmacyId/)
  })

  it('Reports page builds targetMap and aggregates (unchanged, reference check)', () => {
    expect(REPORTS_SRC).toContain('targetMap')
    expect(REPORTS_SRC).toMatch(/targetMap\[.*\]\??\.\[targetKey\]/)
  })
})

// ══════════════════════════════════════════════════════════════
// 8 — Edge cases: partial targets, single branch
// ══════════════════════════════════════════════════════════════

describe('Admin target aggregation — edge cases', () => {
  it('handles single pharmacy (admin with one branch)', () => {
    const targets = [makeTarget('ph1', { wasfatyTarget: 300 })]
    const result  = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    expect(result?.wasfatyTarget).toBe(300)
  })

  it('handles pharmacies with partial target fields (no npsTarget on some)', () => {
    const targets = [
      { ...makeTarget('ph1'), npsTarget: 90 },
      makeTarget('ph2'),   // no npsTarget
    ]
    const result = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    // ph2 contributes 0 to npsTarget sum
    expect(result?.npsTarget).toBe(90)
  })

  it('handles target with undefined numeric field gracefully', () => {
    const targets = [
      { ...makeTarget('ph1'), badField: undefined },
    ]
    expect(() => computeCurrentTarget(targets, undefined, THIS_MONTH, true)).not.toThrow()
  })

  it('previous month targets excluded from aggregation', () => {
    const targets = [
      { ...makeTarget('ph1'), month: '2020-01', wasfatyTarget: 9999 },   // wrong month
      { ...makeTarget('ph1'), month: THIS_MONTH, wasfatyTarget: 200 },   // correct
    ]
    const result = computeCurrentTarget(targets, undefined, THIS_MONTH, true)
    expect(result?.wasfatyTarget).toBe(200)   // not 9999 + 200
  })
})
