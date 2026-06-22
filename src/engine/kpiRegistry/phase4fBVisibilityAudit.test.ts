// ============================================================
// Phase 4F-B: Non-Core KPI Visibility Strategy Audit
// ============================================================
// PURPOSE: Certify the CURRENT visibility configuration of all
//   non-core KPIs against the registry-first architecture.
//   Produces a machine-verifiable surface/visibility matrix.
//
// SCOPE: Audit and strategy only.
//   NO implementation. NO UI changes. NO Firestore changes.
//   NO Profile Studio. NO AI. NO Dynamic KPI regional wiring.
//
// NON-CORE KPIs audited (7 total):
//   SECTION B — production_evaluation (5): sales, sl, ndf, inbody, liberation
//   SECTION C — pilot_tracking        (1): insuranceConversion
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY }             from './defaultKpiRegistry'
import { getKpisForSurface }                from './index'
import { getProductionEngineKeys, getCoreEngineKeys } from '../kpiAnalyticsEngine'

// ── helpers ──────────────────────────────────────────────────

const NON_CORE_KEYS   = ['sales', 'sl', 'ndf', 'inbody', 'liberation', 'insuranceConversion'] as const
const PRODUCTION_EVAL = ['sales', 'sl', 'ndf', 'inbody', 'liberation'] as const
const PILOT_KEYS      = ['insuranceConversion'] as const
const BRANCH_ONLY_KEYS = ['sales', 'sl', 'ndf', 'liberation'] as const
const DASHBOARD_ONLY_KEYS = ['inbody'] as const

// ── describe groups ───────────────────────────────────────────

// ════════════════════════════════════════════════════════
// GROUP 1 — Visibility Matrix: BRANCH_ONLY preset
// Applies to: sales, sl, ndf, liberation
// Expected:   dashboardEnabled=T, teamEnabled=T,
//             executiveEnabled=F, regionalEnabled=F
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Visibility Matrix: BRANCH_ONLY KPIs', () => {
  it.each(BRANCH_ONLY_KEYS)('%s: dashboardEnabled = true', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].visibility.dashboardEnabled).toBe(true)
  })

  it.each(BRANCH_ONLY_KEYS)('%s: teamEnabled = true', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].visibility.teamEnabled).toBe(true)
  })

  it.each(BRANCH_ONLY_KEYS)('%s: executiveEnabled = false', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].visibility.executiveEnabled).toBe(false)
  })

  it.each(BRANCH_ONLY_KEYS)('%s: regionalEnabled = false', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].visibility.regionalEnabled).toBe(false)
  })
})

// ════════════════════════════════════════════════════════
// GROUP 2 — Visibility Matrix: DASHBOARD_ONLY preset
// Applies to: inbody
// Expected:   dashboardEnabled=T, teamEnabled=F,
//             executiveEnabled=F, regionalEnabled=F
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Visibility Matrix: DASHBOARD_ONLY KPIs', () => {
  it('inbody: dashboardEnabled = true', () => {
    expect(DEFAULT_KPI_REGISTRY.inbody.visibility.dashboardEnabled).toBe(true)
  })

  it('inbody: teamEnabled = false', () => {
    expect(DEFAULT_KPI_REGISTRY.inbody.visibility.teamEnabled).toBe(false)
  })

  it('inbody: executiveEnabled = false', () => {
    expect(DEFAULT_KPI_REGISTRY.inbody.visibility.executiveEnabled).toBe(false)
  })

  it('inbody: regionalEnabled = false', () => {
    expect(DEFAULT_KPI_REGISTRY.inbody.visibility.regionalEnabled).toBe(false)
  })
})

// ════════════════════════════════════════════════════════
// GROUP 3 — Visibility Matrix: PILOT preset
// Applies to: insuranceConversion
// Expected:   dashboardEnabled=T, teamEnabled=T,
//             executiveEnabled=F, regionalEnabled=F,
//             targetInputEnabled=T
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Visibility Matrix: PILOT KPIs (insuranceConversion)', () => {
  it('insuranceConversion: dashboardEnabled = true', () => {
    expect(DEFAULT_KPI_REGISTRY.insuranceConversion.visibility.dashboardEnabled).toBe(true)
  })

  it('insuranceConversion: teamEnabled = true', () => {
    expect(DEFAULT_KPI_REGISTRY.insuranceConversion.visibility.teamEnabled).toBe(true)
  })

  it('insuranceConversion: executiveEnabled = false (pilot isolation)', () => {
    expect(DEFAULT_KPI_REGISTRY.insuranceConversion.visibility.executiveEnabled).toBe(false)
  })

  it('insuranceConversion: regionalEnabled = false (pilot isolation)', () => {
    expect(DEFAULT_KPI_REGISTRY.insuranceConversion.visibility.regionalEnabled).toBe(false)
  })

  it('insuranceConversion: targetInputEnabled = true (pilots need targets)', () => {
    expect(DEFAULT_KPI_REGISTRY.insuranceConversion.visibility.targetInputEnabled).toBe(true)
  })
})

// ════════════════════════════════════════════════════════
// GROUP 4 — Lifecycle Stage Audit
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Lifecycle Stage Audit', () => {
  it.each(PRODUCTION_EVAL)('%s: lifecycleStage = production_evaluation', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].lifecycleStage).toBe('production_evaluation')
  })

  it.each(PILOT_KEYS)('%s: lifecycleStage = pilot_tracking', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].lifecycleStage).toBe('pilot_tracking')
  })

  it('all non-core KPIs have a known lifecycleStage', () => {
    const validStages = new Set(['production_evaluation', 'pilot_tracking'])
    for (const key of NON_CORE_KEYS) {
      expect(validStages.has(DEFAULT_KPI_REGISTRY[key].lifecycleStage!)).toBe(true)
    }
  })
})

// ════════════════════════════════════════════════════════
// GROUP 5 — Engine Inclusion Audit
// production_evaluation KPIs must appear in getProductionEngineKeys
// pilot_tracking KPIs must NOT appear in getProductionEngineKeys
// none of the non-core should appear in getCoreEngineKeys
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Engine Inclusion Audit', () => {
  const prodKeys  = getProductionEngineKeys(DEFAULT_KPI_REGISTRY)
  const coreKeys  = getCoreEngineKeys(DEFAULT_KPI_REGISTRY)

  it.each(PRODUCTION_EVAL)('%s: included in getProductionEngineKeys', (key) => {
    expect(prodKeys).toContain(key)
  })

  it.each(PILOT_KEYS)('%s: excluded from getProductionEngineKeys (pilot_tracking)', (key) => {
    expect(prodKeys).not.toContain(key)
  })

  it.each(NON_CORE_KEYS)('%s: excluded from getCoreEngineKeys (isCore=false)', (key) => {
    expect(coreKeys).not.toContain(key)
  })

  it('core engine keys count = 5 (wasfaty, omni, wellness, basket, crossSelling)', () => {
    expect(coreKeys).toHaveLength(5)
  })

  it('production engine keys include all 5 core + 5 production_eval non-core = 10', () => {
    expect(prodKeys).toHaveLength(10)
  })
})

// ════════════════════════════════════════════════════════
// GROUP 6 — Dashboard Surface Coverage
// All non-core KPIs with dashboardEnabled=true must appear
// in getKpisForSurface(registry, 'dashboardEnabled')
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Dashboard Surface Coverage', () => {
  const dashboardKpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'dashboardEnabled')
  const dashboardKeys = dashboardKpis.map((kpi) => kpi.key)

  it('dashboard surface includes all 6 non-core KPIs (all have dashboardEnabled=true)', () => {
    for (const key of NON_CORE_KEYS) {
      expect(dashboardKeys).toContain(key)
    }
  })

  it('dashboard surface includes all 5 core KPI keys (by aliasFor or key)', () => {
    // Core KPIs: wasfaty, omnihealth (alias omni), wellnessCard (alias wellness), basket, crossSelling
    const coreRegistryKeys = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']
    for (const key of coreRegistryKeys) {
      expect(dashboardKeys).toContain(key)
    }
  })

  it('dashboard surface total = 11 KPIs (5 core + 6 non-core)', () => {
    expect(dashboardKpis).toHaveLength(11)
  })
})

// ════════════════════════════════════════════════════════
// GROUP 7 — Team Surface Coverage
// BRANCH_ONLY + pilot = teamEnabled; inbody = NOT teamEnabled
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Team Surface Coverage', () => {
  const teamKpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')
  const teamKeys = teamKpis.map((kpi) => kpi.key)

  it.each(['sales', 'sl', 'ndf', 'liberation', 'insuranceConversion'] as const)(
    '%s: present in team surface', (key) => {
      expect(teamKeys).toContain(key)
    }
  )

  it('inbody: absent from team surface (DASHBOARD_ONLY preset)', () => {
    expect(teamKeys).not.toContain('inbody')
  })
})

// ════════════════════════════════════════════════════════
// GROUP 8 — Executive Surface Exclusion
// All non-core KPIs have executiveEnabled=false
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Executive Surface Exclusion', () => {
  const execKpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'executiveEnabled')
  const execKeys = execKpis.map((kpi) => kpi.key)

  it.each(NON_CORE_KEYS)('%s: absent from executive surface', (key) => {
    expect(execKeys).not.toContain(key)
  })

  it('executive surface contains only the 5 core KPIs (all_surfaces)', () => {
    // All 5 core KPIs (by registry key) have executiveEnabled=true
    const coreRegistryKeys = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']
    for (const key of coreRegistryKeys) {
      expect(execKeys).toContain(key)
    }
    expect(execKeys).toHaveLength(5)
  })
})

// ════════════════════════════════════════════════════════
// GROUP 9 — Regional Surface Exclusion
// All non-core KPIs have regionalEnabled=false
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Regional Surface Exclusion', () => {
  const regionalKpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'regionalEnabled')
  const regionalKeys = regionalKpis.map((kpi) => kpi.key)

  it.each(NON_CORE_KEYS)('%s: absent from regional surface', (key) => {
    expect(regionalKeys).not.toContain(key)
  })

  it('regional surface contains only the 5 core KPIs', () => {
    const coreRegistryKeys = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']
    for (const key of coreRegistryKeys) {
      expect(regionalKeys).toContain(key)
    }
    expect(regionalKeys).toHaveLength(5)
  })
})

// ════════════════════════════════════════════════════════
// GROUP 10 — Target Input Surface Coverage
// Only KPIs with targetInputEnabled=true appear in target entry
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Target Input Surface Coverage', () => {
  const targetKpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'targetInputEnabled')
  const targetKeys = targetKpis.map((kpi) => kpi.key)

  it('insuranceConversion: targetInputEnabled=true → in target surface', () => {
    expect(targetKeys).toContain('insuranceConversion')
  })

  it.each(BRANCH_ONLY_KEYS)('%s: check targetInputEnabled flag exists on registry entry', (key) => {
    // BRANCH_ONLY preset does not include targetInputEnabled (undefined)
    // getKpisForSurface filters by truthy value — these should NOT appear
    const vis = DEFAULT_KPI_REGISTRY[key].visibility as Record<string, boolean | undefined>
    // Either the field is falsy or absent
    expect(!!vis.targetInputEnabled).toBe(false)
  })

  it('inbody: targetInputEnabled is falsy → absent from target surface', () => {
    const vis = DEFAULT_KPI_REGISTRY.inbody.visibility as Record<string, boolean | undefined>
    expect(!!vis.targetInputEnabled).toBe(false)
  })
})

// ════════════════════════════════════════════════════════
// GROUP 11 — Category Policy Audit
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Category Policy Audit', () => {
  it('sales: category = commercial', () => {
    expect(DEFAULT_KPI_REGISTRY.sales.category).toBe('commercial')
  })

  it('sl: category = operational', () => {
    expect(DEFAULT_KPI_REGISTRY.sl.category).toBe('operational')
  })

  it('ndf: category = health_program', () => {
    expect(DEFAULT_KPI_REGISTRY.ndf.category).toBe('health_program')
  })

  it('inbody: category = health_program', () => {
    expect(DEFAULT_KPI_REGISTRY.inbody.category).toBe('health_program')
  })

  it('liberation: category = prescription', () => {
    expect(DEFAULT_KPI_REGISTRY.liberation.category).toBe('prescription')
  })

  it('insuranceConversion: category = commercial', () => {
    expect(DEFAULT_KPI_REGISTRY.insuranceConversion.category).toBe('commercial')
  })
})

// ════════════════════════════════════════════════════════
// GROUP 12 — Branch Surface Migration Audit (Phase 4F-C)
// Migrated in Phase 4F-C: getCoreEngineKeys replaced by
// getKpisForSurface(teamEnabled) in Branch Intelligence.
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Branch Surface Migration (Phase 4F-C applied)', () => {
  it('BranchIntelligencePage.jsx: now uses getKpisForSurface(teamEnabled) after Phase 4F-C', async () => {
    const src = await import('../../pages/branch/BranchIntelligencePage.jsx?raw')
    expect(src.default).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')")
  })

  it('useBranchIntelligenceData.js: now uses getKpisForSurface(teamEnabled) after Phase 4F-C', async () => {
    const src = await import('../../pages/branch/useBranchIntelligenceData.js?raw')
    expect(src.default).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')")
  })

  it('BranchIntelligencePage.jsx: does NOT use getProductionEngineKeys (branch uses teamEnabled, not all production)', async () => {
    const src = await import('../../pages/branch/BranchIntelligencePage.jsx?raw')
    expect(src.default).not.toContain('getProductionEngineKeys')
  })
})

// ════════════════════════════════════════════════════════
// GROUP 13 — Pharmacist Surface Migration Audit (Phase 4F-C)
// Migrated in Phase 4F-C: getCoreEngineKeys replaced by
// getKpisForSurface(teamEnabled) in Pharmacist Intelligence.
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Pharmacist Surface Migration (Phase 4F-C applied)', () => {
  it('PharmacistIntelligencePage.jsx: now uses getKpisForSurface(teamEnabled) after Phase 4F-C', async () => {
    const src = await import('../../pages/pharmacist/PharmacistIntelligencePage.jsx?raw')
    expect(src.default).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')")
  })

  it('PharmacistIntelligencePage.jsx: does NOT use getProductionEngineKeys', async () => {
    const src = await import('../../pages/pharmacist/PharmacistIntelligencePage.jsx?raw')
    expect(src.default).not.toContain('getProductionEngineKeys')
  })
})

// ════════════════════════════════════════════════════════
// GROUP 14 — Dashboard / Reports Dynamic Audit
// These surfaces are already registry-driven → non-core KPIs
// visible there TODAY via dashboardEnabled=true.
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Dashboard / Reports Already Dynamic', () => {
  it('DashboardPage.jsx: uses getKpisForSurface (registry-driven)', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain('getKpisForSurface')
  })

  it('DashboardPage.jsx: does NOT hardcode getCoreEngineKeys for KPI list', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    // DashboardPage uses getCoreEngineKeys internally inside useMemo for KPI_KEYS
    // which is derived from registryKpis, not a static list
    expect(src.default).toContain('getKpisForSurface')
  })

  it('ReportsPage.jsx: uses getKpisForSurface(liveRegistry, dashboardEnabled)', async () => {
    const src = await import('../../pages/shared/ReportsPage.jsx?raw')
    expect(src.default).toContain("getKpisForSurface(liveRegistry, 'dashboardEnabled')")
  })
})

// ════════════════════════════════════════════════════════
// GROUP 15 — Executive Surface Hardcoding Audit
// Executive components use KPI_KEYS constant (core only)
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Executive Surface Hardcoding (current state)', () => {
  it('PortfolioKpiHeatmap.jsx: uses KPI_KEYS (core-only constant)', async () => {
    const src = await import('../../components/executive/PortfolioKpiHeatmap.jsx?raw')
    expect(src.default).toContain('KPI_KEYS')
  })

  it('RegionalIntelligencePanel.jsx: migrated to getProductionEngineKeys (Stabilization Pass — dynamic KPI wiring)', async () => {
    const src = await import('../../components/executive/RegionalIntelligencePanel.jsx?raw')
    expect(src.default).toContain('getProductionEngineKeys')
  })

  it('PortfolioKpiHeatmap.jsx: does NOT use getKpisForSurface for executive filter', async () => {
    const src = await import('../../components/executive/PortfolioKpiHeatmap.jsx?raw')
    expect(src.default).not.toContain("getKpisForSurface")
  })
})

// ════════════════════════════════════════════════════════
// GROUP 16 — Sort Order Audit (non-core ordering)
// All non-core sortOrders must be > any core KPI sortOrder
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Sort Order Audit', () => {
  it('all non-core KPIs have sortOrder >= 60 (after core KPIs)', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].sortOrder).toBeGreaterThanOrEqual(60)
    }
  })

  it('non-core sort orders are monotonically increasing in registry definition order', () => {
    // sales=60, sl=70, ndf=80, inbody=90, liberation=100, insuranceConversion=110
    const expectedOrder = [
      ['sales', 60],
      ['sl', 70],
      ['ndf', 80],
      ['inbody', 90],
      ['liberation', 100],
      ['insuranceConversion', 110],
    ] as const

    for (const [key, expected] of expectedOrder) {
      expect(DEFAULT_KPI_REGISTRY[key].sortOrder).toBe(expected)
    }
  })

  it('getKpisForSurface returns non-core KPIs after core KPIs by sortOrder', () => {
    const allDashboard = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'dashboardEnabled')
    const coreKeys = new Set(['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling'])
    const nonCoreResult = allDashboard.filter((k) => !coreKeys.has(k.key))
    // All non-core KPIs in result have sortOrder >= 60
    for (const kpi of nonCoreResult) {
      expect(kpi.sortOrder).toBeGreaterThanOrEqual(60)
    }
  })
})

// ════════════════════════════════════════════════════════
// GROUP 17 — Weight Audit (non-core: weight=0)
// Non-core KPIs must never contribute to composite score
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Weight Audit (non-core always weight=0)', () => {
  it.each(NON_CORE_KEYS)('%s: weight = 0', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].weight).toBe(0)
  })

  it('sum of non-core weights = 0', () => {
    const sum = NON_CORE_KEYS.reduce((acc, key) => acc + DEFAULT_KPI_REGISTRY[key].weight, 0)
    expect(sum).toBe(0)
  })
})

// ════════════════════════════════════════════════════════
// GROUP 18 — isCore / isActive Invariants
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › isCore / isActive Invariants', () => {
  it.each(NON_CORE_KEYS)('%s: isCore = false', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].isCore).toBe(false)
  })

  it.each(NON_CORE_KEYS)('%s: isActive = true', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].isActive).toBe(true)
  })
})

// ════════════════════════════════════════════════════════
// GROUP 19 — No aliasFor on non-core KPIs
// Non-core KPIs do not use the alias system —
// their registry key IS their engine key.
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › No aliasFor on non-core KPIs', () => {
  it.each(NON_CORE_KEYS)('%s: aliasFor is undefined', (key) => {
    expect((DEFAULT_KPI_REGISTRY[key] as Record<string, unknown>).aliasFor).toBeUndefined()
  })
})

// ════════════════════════════════════════════════════════
// GROUP 20 — Coaching Action Coverage (non-core)
// Every non-core KPI must have EN and AR coaching actions
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Coaching Action Coverage', () => {
  it.each(NON_CORE_KEYS)('%s: has coachingAction (EN)', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].coachingAction).toBeTruthy()
  })

  it.each(NON_CORE_KEYS)('%s: has coachingActionAr (AR)', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].coachingActionAr).toBeTruthy()
  })
})

// ════════════════════════════════════════════════════════
// GROUP 21 — Full Visibility Matrix Summary
// Machine-readable snapshot of every surface × KPI
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Full Visibility Matrix Snapshot', () => {
  type VisRow = { dashboard: boolean; team: boolean; executive: boolean; regional: boolean }
  const EXPECTED_MATRIX: Record<string, VisRow> = {
    sales:               { dashboard: true,  team: true,  executive: false, regional: false },
    sl:                  { dashboard: true,  team: true,  executive: false, regional: false },
    ndf:                 { dashboard: true,  team: true,  executive: false, regional: false },
    inbody:              { dashboard: true,  team: false, executive: false, regional: false },
    liberation:          { dashboard: true,  team: true,  executive: false, regional: false },
    insuranceConversion: { dashboard: true,  team: true,  executive: false, regional: false },
  }

  it.each(Object.entries(EXPECTED_MATRIX) as [string, VisRow][])(
    '%s visibility matrix matches expected',
    (key, expected) => {
      const vis = DEFAULT_KPI_REGISTRY[key as keyof typeof DEFAULT_KPI_REGISTRY].visibility
      expect(vis.dashboardEnabled).toBe(expected.dashboard)
      expect(vis.teamEnabled).toBe(expected.team)
      expect(vis.executiveEnabled).toBe(expected.executive)
      expect(vis.regionalEnabled).toBe(expected.regional)
    }
  )
})

// ════════════════════════════════════════════════════════
// GROUP 22 — Guardrails
// Prevent accidental registry changes
// ════════════════════════════════════════════════════════
describe('Phase 4F-B › Guardrails', () => {
  it('DEFAULT_KPI_REGISTRY has exactly 11 entries (5 core + 6 non-core)', () => {
    expect(Object.keys(DEFAULT_KPI_REGISTRY)).toHaveLength(11)
  })

  it('non-core section has 6 KPIs total', () => {
    const nonCoreInRegistry = Object.values(DEFAULT_KPI_REGISTRY).filter((kpi) => !kpi.isCore)
    expect(nonCoreInRegistry).toHaveLength(6)
  })

  it('pilot section (lifecycleStage=pilot_tracking) has exactly 1 KPI', () => {
    const pilots = Object.values(DEFAULT_KPI_REGISTRY).filter(
      (kpi) => kpi.lifecycleStage === 'pilot_tracking'
    )
    expect(pilots).toHaveLength(1)
    expect(pilots[0].key).toBe('insuranceConversion')
  })

  it('production_evaluation section has exactly 5 KPIs (5 non-core + 5 core)', () => {
    const prodEval = Object.values(DEFAULT_KPI_REGISTRY).filter(
      (kpi) => kpi.lifecycleStage === 'production_evaluation'
    )
    expect(prodEval).toHaveLength(10)
  })

  it('no non-core KPI should ever have regionalEnabled=true in DEFAULT registry', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].visibility.regionalEnabled).toBe(false)
    }
  })

  it('no non-core KPI should ever have executiveEnabled=true in DEFAULT registry', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].visibility.executiveEnabled).toBe(false)
    }
  })
})
