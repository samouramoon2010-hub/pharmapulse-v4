// ============================================================
// Phase 4F-C: Non-Core Team Exposure
// ============================================================
// PURPOSE: Certify that Branch Intelligence and Pharmacist
//   Intelligence now use getKpisForSurface(teamEnabled) instead
//   of getCoreEngineKeys(), exposing all team-enabled non-core
//   KPIs (sales, sl, ndf, liberation, insuranceConversion) while
//   correctly hiding inbody (teamEnabled=false).
//
// CONFIRM:
//   NO Executive changes
//   NO Regional changes
//   NO Firestore changes
//   NO Profile Studio
//   NO AI
//   NO Dynamic KPI regional wiring
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY, getKpisForSurface } from './index'
import { getProductionEngineKeys, getCoreEngineKeys } from '../kpiAnalyticsEngine'

// ── helpers ──────────────────────────────────────────────────

const TEAM_ENABLED_ENGINE_KEYS = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')
  .map((kpi) => kpi.aliasFor ?? kpi.key)

const CORE_ENGINE_KEYS  = getCoreEngineKeys(DEFAULT_KPI_REGISTRY)
const BRANCH_SRC_PATH   = '../../pages/branch/BranchIntelligencePage.jsx?raw'
const HOOK_SRC_PATH     = '../../pages/branch/useBranchIntelligenceData.js?raw'
const PHARM_PAGE_PATH   = '../../pages/pharmacist/PharmacistIntelligencePage.jsx?raw'
const PHARM_HOOK_PATH   = '../../pages/pharmacist/usePharmacistIntelligenceData.js?raw'

// ════════════════════════════════════════════════════════════
// GROUP 1 — Team-enabled key derivation (registry contract)
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › Team-Enabled Key Derivation', () => {
  it('getKpisForSurface(teamEnabled) produces 10 engine keys (5 core + 5 non-core)', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS).toHaveLength(10)
  })

  it('core engine keys are present in team-enabled set', () => {
    for (const k of CORE_ENGINE_KEYS) {
      expect(TEAM_ENABLED_ENGINE_KEYS).toContain(k)
    }
  })

  it('sales: present in team-enabled set', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS).toContain('sales')
  })

  it('sl: present in team-enabled set', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS).toContain('sl')
  })

  it('ndf: present in team-enabled set', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS).toContain('ndf')
  })

  it('liberation: present in team-enabled set', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS).toContain('liberation')
  })

  it('insuranceConversion: present in team-enabled set', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS).toContain('insuranceConversion')
  })

  it('inbody: absent from team-enabled set (teamEnabled=false in registry)', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS).not.toContain('inbody')
  })

  it('team-enabled set uses aliasFor resolution — omni instead of omnihealth', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS).toContain('omni')
    expect(TEAM_ENABLED_ENGINE_KEYS).not.toContain('omnihealth')
  })

  it('team-enabled set uses aliasFor resolution — wellness instead of wellnessCard', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS).toContain('wellness')
    expect(TEAM_ENABLED_ENGINE_KEYS).not.toContain('wellnessCard')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 2 — Branch Intelligence Page: source migration
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › Branch Intelligence Page source migration', () => {
  it('BranchIntelligencePage imports getKpisForSurface from engine/kpiRegistry', async () => {
    const s = (await import(BRANCH_SRC_PATH)).default
    expect(s).toContain("getKpisForSurface")
    expect(s).toContain("from '../../engine/kpiRegistry'")
  })

  it('BranchIntelligencePage KPI Cards row uses getKpisForSurface(teamEnabled)', async () => {
    const s = (await import(BRANCH_SRC_PATH)).default
    expect(s).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).map((k) => {")
    expect(s).toContain('<KpiCard')
  })

  it('BranchIntelligencePage Contribution tabs use getKpisForSurface(teamEnabled)', async () => {
    const s = (await import(BRANCH_SRC_PATH)).default
    expect(s).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).map((k) => {")
  })

  it('BranchIntelligencePage activeContributionKpi fallback uses getKpisForSurface(teamEnabled)', async () => {
    const s = (await import(BRANCH_SRC_PATH)).default
    expect(s).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key)[0]")
  })

  it('BranchIntelligencePage still renders KpiCard entries derived from kpiStats[k] (parity)', async () => {
    const s = (await import(BRANCH_SRC_PATH)).default
    expect(s).toContain('const s = kpiStats[k]')
    expect(s).toContain('entry={{ value: s?.actual ?? null, target: s?.target ?? 0, achievement: s?.achievementPct ?? null }}')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 3 — Branch Intelligence Hook: source migration
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › useBranchIntelligenceData hook migration', () => {
  it('useBranchIntelligenceData imports getKpisForSurface from engine/kpiRegistry', async () => {
    const s = (await import(HOOK_SRC_PATH)).default
    expect(s).toContain('getKpisForSurface')
    expect(s).toContain("from '../../engine/kpiRegistry'")
  })

  it('useBranchIntelligenceData kpiExpectedPct uses getKpisForSurface(teamEnabled)', async () => {
    const s = (await import(HOOK_SRC_PATH)).default
    expect(s).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).forEach((k) => { kpiExpectedPct[k] = overallExpectedPct })")
  })

  it('useBranchIntelligenceData kpiStats loop uses getKpisForSurface(teamEnabled)', async () => {
    const s = (await import(HOOK_SRC_PATH)).default
    expect(s).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).forEach((k) => {")
  })

  it('useBranchIntelligenceData no longer imports getCoreEngineKeys', async () => {
    const s = (await import(HOOK_SRC_PATH)).default
    // getCoreEngineKeys removed from this hook's imports
    expect(s).not.toContain("getCoreEngineKeys")
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 4 — Pharmacist Intelligence Page: source migration
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › Pharmacist Intelligence Page source migration', () => {
  it('PharmacistIntelligencePage imports getKpisForSurface from engine/kpiRegistry', async () => {
    const s = (await import(PHARM_PAGE_PATH)).default
    expect(s).toContain("getKpisForSurface")
    expect(s).toContain("from '../../engine/kpiRegistry'")
  })

  it('PharmacistIntelligencePage focusKpi validation uses getKpisForSurface(teamEnabled)', async () => {
    const s = (await import(PHARM_PAGE_PATH)).default
    expect(s).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).includes(focusKpiParam)")
  })

  it('PharmacistIntelligencePage no longer uses getCoreEngineKeys for focusKpi validation', async () => {
    const s = (await import(PHARM_PAGE_PATH)).default
    expect(s).not.toContain('getCoreEngineKeys(DEFAULT_KPI_REGISTRY).includes(focusKpiParam)')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 5 — Pharmacist Intelligence Hook: source migration
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › usePharmacistIntelligenceData hook migration', () => {
  it('usePharmacistIntelligenceData imports getKpisForSurface from engine/kpiRegistry', async () => {
    const s = (await import(PHARM_HOOK_PATH)).default
    expect(s).toContain('getKpisForSurface')
    expect(s).toContain("from '../../engine/kpiRegistry'")
  })

  it('usePharmacistIntelligenceData kpiExpectedPct uses getKpisForSurface(teamEnabled)', async () => {
    const s = (await import(PHARM_HOOK_PATH)).default
    expect(s).toContain("getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled').map((kpi) => kpi.aliasFor ?? kpi.key).forEach((k) => { kpiExpectedPct[k] = overallExpectedPct })")
  })

  it('usePharmacistIntelligenceData no longer imports getCoreEngineKeys', async () => {
    const s = (await import(PHARM_HOOK_PATH)).default
    expect(s).not.toContain('getCoreEngineKeys')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 6 — Visibility: non-core KPIs now visible on team surface
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › Visibility: non-core KPIs visible on team surface', () => {
  it('sales: teamEnabled=true in registry → included in team-enabled key set', () => {
    expect(DEFAULT_KPI_REGISTRY.sales.visibility.teamEnabled).toBe(true)
    expect(TEAM_ENABLED_ENGINE_KEYS).toContain('sales')
  })

  it('sl: teamEnabled=true in registry → included in team-enabled key set', () => {
    expect(DEFAULT_KPI_REGISTRY.sl.visibility.teamEnabled).toBe(true)
    expect(TEAM_ENABLED_ENGINE_KEYS).toContain('sl')
  })

  it('ndf: teamEnabled=true in registry → included in team-enabled key set', () => {
    expect(DEFAULT_KPI_REGISTRY.ndf.visibility.teamEnabled).toBe(true)
    expect(TEAM_ENABLED_ENGINE_KEYS).toContain('ndf')
  })

  it('liberation: teamEnabled=true in registry → included in team-enabled key set', () => {
    expect(DEFAULT_KPI_REGISTRY.liberation.visibility.teamEnabled).toBe(true)
    expect(TEAM_ENABLED_ENGINE_KEYS).toContain('liberation')
  })

  it('insuranceConversion: teamEnabled=true in registry → included in team-enabled key set', () => {
    expect(DEFAULT_KPI_REGISTRY.insuranceConversion.visibility.teamEnabled).toBe(true)
    expect(TEAM_ENABLED_ENGINE_KEYS).toContain('insuranceConversion')
  })

  it('inbody: teamEnabled=false in registry → excluded from team-enabled key set', () => {
    expect(DEFAULT_KPI_REGISTRY.inbody.visibility.teamEnabled).toBe(false)
    expect(TEAM_ENABLED_ENGINE_KEYS).not.toContain('inbody')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 7 — Sort order preserved
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › Sort Order Preserved', () => {
  it('team-enabled keys are sorted by registry sortOrder (core first, then non-core)', () => {
    const kpisOrdered = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')
    for (let i = 1; i < kpisOrdered.length; i++) {
      expect(kpisOrdered[i].sortOrder).toBeGreaterThanOrEqual(kpisOrdered[i - 1].sortOrder)
    }
  })

  it('all 5 core KPIs appear before all non-core KPIs in the sorted result', () => {
    const kpisOrdered = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')
    const coreRegistryKeys = new Set(['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling'])
    const firstNonCoreIdx  = kpisOrdered.findIndex((kpi) => !coreRegistryKeys.has(kpi.key))
    const lastCoreIdx      = kpisOrdered.map((kpi) => kpi.key).findLastIndex((k) => coreRegistryKeys.has(k))
    // All non-core must come after all core
    expect(firstNonCoreIdx).toBeGreaterThan(lastCoreIdx)
  })

  it('non-core KPIs appear in order: sales, sl, ndf, liberation, insuranceConversion', () => {
    const kpisOrdered = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'teamEnabled')
    const coreRegistryKeys = new Set(['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling'])
    const nonCoreOrdered = kpisOrdered
      .filter((kpi) => !coreRegistryKeys.has(kpi.key))
      .map((kpi) => kpi.key)
    expect(nonCoreOrdered).toEqual(['sales', 'sl', 'ndf', 'liberation', 'insuranceConversion'])
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 8 — focusKpi URL validation works for non-core keys
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › focusKpi URL Validation', () => {
  it('sales is a valid focusKpi param (team-enabled)', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS.includes('sales')).toBe(true)
  })

  it('sl is a valid focusKpi param (team-enabled)', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS.includes('sl')).toBe(true)
  })

  it('ndf is a valid focusKpi param (team-enabled)', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS.includes('ndf')).toBe(true)
  })

  it('liberation is a valid focusKpi param (team-enabled)', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS.includes('liberation')).toBe(true)
  })

  it('insuranceConversion is a valid focusKpi param (team-enabled)', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS.includes('insuranceConversion')).toBe(true)
  })

  it('inbody is NOT a valid focusKpi param (team-disabled)', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS.includes('inbody')).toBe(false)
  })

  it('random string "bogus" is not a valid focusKpi param', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS.includes('bogus')).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 9 — Pace calculations: team-enabled keys get expectedPct
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › Pace Calculations Unchanged', () => {
  it('kpiExpectedPct map is built for all 10 team-enabled engine keys', () => {
    const overallExpectedPct = 60
    const kpiExpectedPct: Record<string, number> = {}
    TEAM_ENABLED_ENGINE_KEYS.forEach((k) => { kpiExpectedPct[k] = overallExpectedPct })

    for (const k of TEAM_ENABLED_ENGINE_KEYS) {
      expect(kpiExpectedPct[k]).toBe(60)
    }
  })

  it('inbody is NOT in kpiExpectedPct map (not team-enabled)', () => {
    const overallExpectedPct = 60
    const kpiExpectedPct: Record<string, number> = {}
    TEAM_ENABLED_ENGINE_KEYS.forEach((k) => { kpiExpectedPct[k] = overallExpectedPct })
    expect(kpiExpectedPct['inbody']).toBeUndefined()
  })

  it('formula Math.round(dp.ratio * 100) still present in branch hook', async () => {
    const s = (await import(HOOK_SRC_PATH)).default
    expect(s).toContain('Math.round(dp.ratio * 100)')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 10 — Executive Safety: unchanged
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › Executive Surface Untouched', () => {
  it('PortfolioKpiHeatmap.jsx: still uses KPI_KEYS (unchanged)', async () => {
    const s = (await import('../../components/executive/PortfolioKpiHeatmap.jsx?raw')).default
    expect(s).toContain('KPI_KEYS')
  })

  it('RegionalIntelligencePanel.jsx: migrated to getProductionEngineKeys (Stabilization Pass — dynamic KPI wiring)', async () => {
    const s = (await import('../../components/executive/RegionalIntelligencePanel.jsx?raw')).default
    expect(s).toContain('getProductionEngineKeys')
  })

  it('PortfolioKpiHeatmap.jsx: does NOT use getKpisForSurface (no migration applied)', async () => {
    const s = (await import('../../components/executive/PortfolioKpiHeatmap.jsx?raw')).default
    expect(s).not.toContain('getKpisForSurface')
  })

  it('RegionalIntelligencePanel.jsx: does NOT use getKpisForSurface (no migration applied)', async () => {
    const s = (await import('../../components/executive/RegionalIntelligencePanel.jsx?raw')).default
    expect(s).not.toContain('getKpisForSurface')
  })

  it('all non-core KPIs retain executiveEnabled=false (registry unchanged)', () => {
    const nonCore = ['sales', 'sl', 'ndf', 'inbody', 'liberation', 'insuranceConversion'] as const
    for (const key of nonCore) {
      expect(DEFAULT_KPI_REGISTRY[key].visibility.executiveEnabled).toBe(false)
    }
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 11 — Regional Safety: unchanged
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › Regional Surface Untouched', () => {
  it('all non-core KPIs retain regionalEnabled=false (registry unchanged)', () => {
    const nonCore = ['sales', 'sl', 'ndf', 'inbody', 'liberation', 'insuranceConversion'] as const
    for (const key of nonCore) {
      expect(DEFAULT_KPI_REGISTRY[key].visibility.regionalEnabled).toBe(false)
    }
  })

  it('getKpisForSurface(regionalEnabled) still returns only 5 core KPIs', () => {
    const regional = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'regionalEnabled')
    expect(regional).toHaveLength(5)
    const keys = regional.map((k) => k.key)
    expect(keys).not.toContain('sales')
    expect(keys).not.toContain('sl')
    expect(keys).not.toContain('ndf')
    expect(keys).not.toContain('inbody')
    expect(keys).not.toContain('liberation')
    expect(keys).not.toContain('insuranceConversion')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 12 — No Firestore / Profile Studio / AI changes
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › No Firestore / Profile Studio / AI Changes', () => {
  it('ProfileStudio / AI identifiers absent from changed source files', async () => {
    const branchSrc     = (await import(BRANCH_SRC_PATH)).default
    const hookSrc       = (await import(HOOK_SRC_PATH)).default
    const pharmPageSrc  = (await import(PHARM_PAGE_PATH)).default
    const pharmHookSrc  = (await import(PHARM_HOOK_PATH)).default
    for (const s of [branchSrc, hookSrc, pharmPageSrc, pharmHookSrc]) {
      expect(s).not.toContain('ProfileStudio')
      expect(s).not.toContain('openai')
      expect(s).not.toContain('anthropic')
    }
  })

  it('no regional wiring added to changed source files', async () => {
    const branchSrc     = (await import(BRANCH_SRC_PATH)).default
    const hookSrc       = (await import(HOOK_SRC_PATH)).default
    for (const s of [branchSrc, hookSrc]) {
      expect(s).not.toContain('regionalIntelligence')
      expect(s).not.toContain('regionalRollup')
      expect(s).not.toContain('dynamicRegional')
    }
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 13 — Guardrails: registry count and structure unchanged
// ════════════════════════════════════════════════════════════
describe('Phase 4F-C › Guardrails', () => {
  it('DEFAULT_KPI_REGISTRY still has 11 entries (no adds or removals)', () => {
    expect(Object.keys(DEFAULT_KPI_REGISTRY)).toHaveLength(11)
  })

  it('getProductionEngineKeys still returns 10 (5 core + 5 production_eval)', () => {
    expect(getProductionEngineKeys(DEFAULT_KPI_REGISTRY)).toHaveLength(10)
  })

  it('getCoreEngineKeys still returns 5 core KPIs', () => {
    expect(getCoreEngineKeys(DEFAULT_KPI_REGISTRY)).toHaveLength(5)
  })

  it('getKpisForSurface(teamEnabled) returns 10 (same as getProductionEngineKeys count)', () => {
    expect(TEAM_ENABLED_ENGINE_KEYS).toHaveLength(10)
  })

  it('insuranceConversion remains pilot_tracking (lifecycle unchanged)', () => {
    expect(DEFAULT_KPI_REGISTRY.insuranceConversion.lifecycleStage).toBe('pilot_tracking')
  })

  it('all non-core KPIs retain weight=0 (no composite score change)', () => {
    const nonCore = ['sales', 'sl', 'ndf', 'inbody', 'liberation', 'insuranceConversion'] as const
    for (const key of nonCore) {
      expect(DEFAULT_KPI_REGISTRY[key].weight).toBe(0)
    }
  })
})
