// ============================================================
// Phase 4F-D: Executive Exposure Audit
// ============================================================
// PURPOSE: Certify the CURRENT state of Executive and Regional
//   surfaces. Produce a machine-verifiable surface inventory,
//   executive visibility matrix, and regional visibility matrix.
//   NO implementation. NO UI changes. NO Firestore changes.
//   NO Profile Studio. NO AI. NO Dynamic KPI regional wiring.
//
// KEY FINDINGS:
//
//   Executive surfaces (PortfolioKpiHeatmap, RegionalIntelligencePanel)
//   are hardcoded to KPI_KEYS (5 core only). Registry flags
//   executiveEnabled=false / regionalEnabled=false on all non-core
//   KPIs correctly PROTECT against accidental non-core exposure.
//
//   Regional engine (branchRollupEngine) ALREADY accepts an optional
//   registry arg and calls getProductionEngineKeys(registry) —
//   ready for dynamic KPIs at the engine layer. However the
//   heatmapSelectors.ts isCoreKpiKey guard still blocks non-core
//   KPIs from rendering in the heatmap cell (NOT_AGGREGATED).
//
//   Profile Studio does NOT currently manage visibility flags.
//   It should be the single admin surface for all 4 flags:
//     dashboardEnabled, teamEnabled, executiveEnabled, regionalEnabled
//
// CONFIRM:
//   NO implementation
//   NO UI changes
//   NO Firestore changes
//   NO Profile Studio changes
//   NO AI
//   NO Dynamic KPI regional wiring
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY, getKpisForSurface } from './index'
import { KPI_KEYS, getCoreEngineKeys, getProductionEngineKeys } from '../kpiAnalyticsEngine'

const NON_CORE_KEYS = ['sales', 'sl', 'ndf', 'inbody', 'liberation', 'insuranceConversion'] as const

// ════════════════════════════════════════════════════════════
// GROUP 1 — Executive Surface Inventory: PortfolioKpiHeatmap
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Executive Surface Inventory: PortfolioKpiHeatmap', () => {
  // Migrated by the Core KPI Dependency Removal — No Silent Core Fallback
  // Closure bundle — this audit's own "KEY FINDINGS" anticipated exactly
  // this migration (see PortfolioKpiHeatmap.jsx + ExecutiveDashboard.jsx).
  it('PortfolioKpiHeatmap.jsx imports getProductionEngineKeys from engine', async () => {
    const s = (await import('../../components/executive/PortfolioKpiHeatmap.jsx?raw')).default
    expect(s).toContain("import { TRAFFIC_COLORS, KPI_KEYS, getProductionEngineKeys, getKpiMetaForKey } from '../../engine'")
  })

  it('PortfolioKpiHeatmap.jsx renders registry-resolved kpiKeys, not a fixed KPI_KEYS.map', async () => {
    const s = (await import('../../components/executive/PortfolioKpiHeatmap.jsx?raw')).default
    expect(s).toContain('kpiKeys.map((kpiKey)')
    expect(s).toContain('registry ? getProductionEngineKeys(registry) : KPI_KEYS')
  })

  it('PortfolioKpiHeatmap.jsx uses getProductionEngineKeys (migrated)', async () => {
    const s = (await import('../../components/executive/PortfolioKpiHeatmap.jsx?raw')).default
    expect(s).toContain('getProductionEngineKeys')
  })

  it('KPI_KEYS constant contains exactly 5 core engine keys', () => {
    expect(KPI_KEYS).toHaveLength(5)
    const coreKeys = getCoreEngineKeys(DEFAULT_KPI_REGISTRY)
    for (const k of KPI_KEYS) {
      expect(coreKeys).toContain(k)
    }
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 2 — Executive Surface Inventory: RegionalIntelligencePanel
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Executive Surface Inventory: RegionalIntelligencePanel', () => {
  // Migrated by the Stabilization Pass (Dynamic KPI Regional Wiring fix) —
  // this audit's own "KEY FINDINGS" anticipated exactly this migration.
  // See dynamicKpiRegionalWiring.test.ts Group F for the new wiring contract.
  it('RegionalIntelligencePanel.jsx imports getProductionEngineKeys from kpiAnalyticsEngine', async () => {
    const s = (await import('../../components/executive/RegionalIntelligencePanel.jsx?raw')).default
    expect(s).toContain("import { getProductionEngineKeys } from '../../engine/kpiAnalyticsEngine'")
  })

  it('RegionalIntelligencePanel.jsx assigns kpiColKeys = getProductionEngineKeys(liveRegistry ?? DEFAULT_KPI_REGISTRY)', async () => {
    const s = (await import('../../components/executive/RegionalIntelligencePanel.jsx?raw')).default
    expect(s).toContain('const kpiColKeys   = getProductionEngineKeys(liveRegistry ?? DEFAULT_KPI_REGISTRY)')
  })

  it('RegionalIntelligencePanel.jsx does NOT use getKpisForSurface (uses getProductionEngineKeys instead)', async () => {
    const s = (await import('../../components/executive/RegionalIntelligencePanel.jsx?raw')).default
    expect(s).not.toContain('getKpisForSurface')
  })

  it('RegionalIntelligencePanel.jsx now uses getProductionEngineKeys (migrated)', async () => {
    const s = (await import('../../components/executive/RegionalIntelligencePanel.jsx?raw')).default
    expect(s).toContain('getProductionEngineKeys')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 3 — Executive Surface Inventory: ExecutiveDashboard
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Executive Surface Inventory: ExecutiveDashboard', () => {
  it('ExecutiveDashboard.jsx does NOT directly use KPI_KEYS (delegates to child components)', async () => {
    const s = (await import('../../pages/executive/ExecutiveDashboard.jsx?raw')).default
    expect(s).not.toContain('KPI_KEYS')
  })

  it('ExecutiveDashboard.jsx does NOT use getCoreEngineKeys', async () => {
    const s = (await import('../../pages/executive/ExecutiveDashboard.jsx?raw')).default
    expect(s).not.toContain('getCoreEngineKeys')
  })

  it('ExecutiveDashboard.jsx does NOT use getKpisForSurface (not yet migrated)', async () => {
    const s = (await import('../../pages/executive/ExecutiveDashboard.jsx?raw')).default
    expect(s).not.toContain('getKpisForSurface')
  })

  it('ExecutiveDashboard delegates KPI rendering to PortfolioKpiHeatmap and RegionalIntelligencePanel', async () => {
    const s = (await import('../../pages/executive/ExecutiveDashboard.jsx?raw')).default
    expect(s).toContain('PortfolioKpiHeatmap')
    expect(s).toContain('RegionalIntelligencePanel')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 4 — Other Executive Components Inventory
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Other Executive Components Inventory', () => {
  it('PortfolioScoreCard.jsx does NOT use KPI_KEYS (score-only component)', async () => {
    const s = (await import('../../components/executive/PortfolioScoreCard.jsx?raw')).default
    expect(s).not.toContain('KPI_KEYS')
    expect(s).not.toContain('getCoreEngineKeys')
  })

  it('RiskDistributionPanel.jsx does NOT use KPI_KEYS', async () => {
    const s = (await import('../../components/executive/RiskDistributionPanel.jsx?raw')).default
    expect(s).not.toContain('KPI_KEYS')
    expect(s).not.toContain('getCoreEngineKeys')
  })

  it('BranchLeaderboard.jsx does NOT use KPI_KEYS', async () => {
    const s = (await import('../../components/executive/BranchLeaderboard.jsx?raw')).default
    expect(s).not.toContain('KPI_KEYS')
    expect(s).not.toContain('getCoreEngineKeys')
  })

  it('ExecutiveInsightsFeed.jsx does NOT use KPI_KEYS', async () => {
    const s = (await import('../../components/executive/ExecutiveInsightsFeed.jsx?raw')).default
    expect(s).not.toContain('KPI_KEYS')
    expect(s).not.toContain('getCoreEngineKeys')
  })

  it('BranchDrilldown.jsx does NOT use KPI_KEYS', async () => {
    const s = (await import('../../components/executive/BranchDrilldown.jsx?raw')).default
    expect(s).not.toContain('KPI_KEYS')
    expect(s).not.toContain('getCoreEngineKeys')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 5 — Regional Engine Inventory: branchRollupEngine
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Regional Engine Inventory: branchRollupEngine', () => {
  it('branchRollupEngine.ts imports getProductionEngineKeys (dynamic-ready)', async () => {
    const s = (await import('../../engine/regionalIntelligence/branchRollupEngine.ts?raw')).default
    expect(s).toContain('getProductionEngineKeys')
  })

  it('generateBranchRollup accepts optional registry parameter', async () => {
    const s = (await import('../../engine/regionalIntelligence/branchRollupEngine.ts?raw')).default
    expect(s).toContain('registry?: KpiRegistry')
  })

  it('generateBranchRollup resolves engineKeys via getProductionEngineKeys(registry)', async () => {
    const s = (await import('../../engine/regionalIntelligence/branchRollupEngine.ts?raw')).default
    expect(s).toContain('getProductionEngineKeys(registry)')
  })

  it('kpiAchievementSummary is produced from engineKeys (dynamic at rollup layer)', async () => {
    const s = (await import('../../engine/regionalIntelligence/branchRollupEngine.ts?raw')).default
    expect(s).toContain('kpiAchievementSummary')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 6 — Regional Engine Inventory: heatmapSelectors
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Regional Engine Inventory: heatmapSelectors', () => {
  // The isCoreKpiKey guard was removed by the Stabilization Pass — this
  // audit's own "KEY FINDINGS" flagged it as the one remaining blocker
  // for dynamic KPIs reaching the heatmap. resolveKpiCell now resolves
  // presence in kpiAchievementSummary directly (core or dynamic alike).
  it('heatmapSelectors.ts no longer uses isCoreKpiKey (migrated to summary-presence check)', async () => {
    const s = (await import('../../engine/regionalIntelligence/heatmapSelectors.ts?raw')).default
    expect(s).not.toContain('isCoreKpiKey')
  })

  it('heatmapSelectors.ts returns NOT_AGGREGATED only when the KPI is absent from kpiAchievementSummary', async () => {
    const s = (await import('../../engine/regionalIntelligence/heatmapSelectors.ts?raw')).default
    expect(s).toContain('NOT_AGGREGATED')
    expect(s).toContain('findKpiSummary')
  })

  it('heatmapSelectors.ts does NOT use getKpisForSurface (isCoreKpiKey is the guard, not registry)', async () => {
    const s = (await import('../../engine/regionalIntelligence/heatmapSelectors.ts?raw')).default
    expect(s).not.toContain('getKpisForSurface')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 7 — Registry: executiveEnabled protection
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Registry: executiveEnabled protection', () => {
  it.each(NON_CORE_KEYS)('%s: executiveEnabled = false in registry', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].visibility.executiveEnabled).toBe(false)
  })

  it('getKpisForSurface(executiveEnabled) returns exactly 5 core KPIs', () => {
    const execKpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'executiveEnabled')
    expect(execKpis).toHaveLength(5)
    const execKeys = execKpis.map((k) => k.key)
    for (const nonCoreKey of NON_CORE_KEYS) {
      expect(execKeys).not.toContain(nonCoreKey)
    }
  })

  it('core KPIs have executiveEnabled = true (ALL_SURFACES preset)', () => {
    const coreRegistryKeys = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling'] as const
    for (const key of coreRegistryKeys) {
      expect(DEFAULT_KPI_REGISTRY[key].visibility.executiveEnabled).toBe(true)
    }
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 8 — Registry: regionalEnabled protection
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Registry: regionalEnabled protection', () => {
  it.each(NON_CORE_KEYS)('%s: regionalEnabled = false in registry', (key) => {
    expect(DEFAULT_KPI_REGISTRY[key].visibility.regionalEnabled).toBe(false)
  })

  it('getKpisForSurface(regionalEnabled) returns exactly 5 core KPIs', () => {
    const regionalKpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'regionalEnabled')
    expect(regionalKpis).toHaveLength(5)
    const regionalKeys = regionalKpis.map((k) => k.key)
    for (const nonCoreKey of NON_CORE_KEYS) {
      expect(regionalKeys).not.toContain(nonCoreKey)
    }
  })

  it('core KPIs have regionalEnabled = true (ALL_SURFACES preset)', () => {
    const coreRegistryKeys = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling'] as const
    for (const key of coreRegistryKeys) {
      expect(DEFAULT_KPI_REGISTRY[key].visibility.regionalEnabled).toBe(true)
    }
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 9 — Executive Visibility Matrix Snapshot
// Machine-readable: for each non-core KPI, certify
// executiveEnabled=false and regionalEnabled=false
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Executive Visibility Matrix Snapshot', () => {
  type ExecRow = { executive: boolean; regional: boolean }
  const EXPECTED: Record<string, ExecRow> = {
    sales:               { executive: false, regional: false },
    sl:                  { executive: false, regional: false },
    ndf:                 { executive: false, regional: false },
    inbody:              { executive: false, regional: false },
    liberation:          { executive: false, regional: false },
    insuranceConversion: { executive: false, regional: false },
  }

  it.each(Object.entries(EXPECTED) as [string, ExecRow][])(
    '%s executive/regional visibility matches expected',
    (key, expected) => {
      const vis = DEFAULT_KPI_REGISTRY[key as keyof typeof DEFAULT_KPI_REGISTRY].visibility
      expect(vis.executiveEnabled).toBe(expected.executive)
      expect(vis.regionalEnabled).toBe(expected.regional)
    }
  )
})

// ════════════════════════════════════════════════════════════
// GROUP 10 — Executive hooks: no KPI_KEYS usage
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Executive hooks: no hardcoded KPI_KEYS', () => {
  it('useExecutiveReport.ts does NOT use KPI_KEYS directly', async () => {
    const s = (await import('../../hooks/useExecutiveReport.ts?raw')).default
    expect(s).not.toContain('KPI_KEYS')
    expect(s).not.toContain('getCoreEngineKeys')
  })

  it('useRegionalIntelligence.ts does NOT use KPI_KEYS directly', async () => {
    const s = (await import('../../hooks/useRegionalIntelligence.ts?raw')).default
    expect(s).not.toContain('KPI_KEYS')
    expect(s).not.toContain('getCoreEngineKeys')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 11 — Executive score engine: KPI_KEYS for scoring only
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Executive score engine: KPI_KEYS for composite scoring', () => {
  it('executiveScore.ts uses KPI_KEYS for compositeScore computation (not for display)', async () => {
    const s = (await import('../../engine/executive/executiveScore.ts?raw')).default
    expect(s).toContain('KPI_KEYS')
    expect(s).toContain('KPI_WEIGHTS')
  })

  it('dynamicExecutiveDataPath.ts also uses KPI_KEYS (dynamic data path for 5 core KPIs)', async () => {
    const s = (await import('../../engine/executive/dynamicExecutiveDataPath.ts?raw')).default
    expect(s).toContain('KPI_KEYS')
    // dynamicExecutiveDataPath uses KPI_KEYS directly — not yet migrated to getProductionEngineKeys
    expect(s).not.toContain('getKpisForSurface')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 12 — Profile Studio policy audit
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Profile Studio policy audit', () => {
  it('KpiEditorModal.jsx manages dashboardEnabled visibility flag', async () => {
    const s = (await import('../../components/admin/kpi/KpiEditorModal.jsx?raw')).default
    expect(s).toContain('dashboardEnabled')
    expect(s).toContain("svf('dashboardEnabled'")
  })

  it('KpiEditorModal.jsx manages teamEnabled visibility flag', async () => {
    const s = (await import('../../components/admin/kpi/KpiEditorModal.jsx?raw')).default
    expect(s).toContain('teamEnabled')
    expect(s).toContain("svf('teamEnabled'")
  })

  it('KpiEditorModal.jsx manages targetInputEnabled visibility flag', async () => {
    const s = (await import('../../components/admin/kpi/KpiEditorModal.jsx?raw')).default
    expect(s).toContain('targetInputEnabled')
    expect(s).toContain("svf('targetInputEnabled'")
  })

  it('KpiEditorModal.jsx manages executiveEnabled visibility flag', async () => {
    const s = (await import('../../components/admin/kpi/KpiEditorModal.jsx?raw')).default
    expect(s).toContain('executiveEnabled')
    expect(s).toContain("svf('executiveEnabled'")
  })

  it('KpiEditorModal.jsx manages regionalEnabled visibility flag', async () => {
    const s = (await import('../../components/admin/kpi/KpiEditorModal.jsx?raw')).default
    expect(s).toContain('regionalEnabled')
    expect(s).toContain("svf('regionalEnabled'")
  })

  it('KpiRegistryTable.jsx renders dashboardEnabled and teamEnabled dot indicators', async () => {
    const s = (await import('../../components/admin/kpi/KpiRegistryTable.jsx?raw')).default
    expect(s).toContain('dashboardEnabled')
    expect(s).toContain('teamEnabled')
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 13 — Future roadmap: registry-readiness certification
// These tests confirm that the FOUNDATION for executive/regional
// dynamic KPI exposure is in place, even though the UI layer
// has not yet been migrated.
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Roadmap readiness: foundation in place', () => {
  it('getKpisForSurface(executiveEnabled) is the correct future migration target', () => {
    // When executive surfaces migrate, this is the call they should use.
    const execKpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'executiveEnabled')
    const execEngineKeys = execKpis.map((kpi) => kpi.aliasFor ?? kpi.key)
    // Currently: 5 core only (correct for current registry)
    expect(execEngineKeys).toHaveLength(5)
    // Core keys are present
    expect(execEngineKeys).toContain('wasfaty')
    expect(execEngineKeys).toContain('omni')
    expect(execEngineKeys).toContain('wellness')
    expect(execEngineKeys).toContain('basket')
    expect(execEngineKeys).toContain('crossSelling')
  })

  it('getKpisForSurface(regionalEnabled) is the correct future migration target', () => {
    const regionalKpis = getKpisForSurface(DEFAULT_KPI_REGISTRY, 'regionalEnabled')
    const regionalEngineKeys = regionalKpis.map((kpi) => kpi.aliasFor ?? kpi.key)
    expect(regionalEngineKeys).toHaveLength(5)
    expect(regionalEngineKeys).toContain('wasfaty')
  })

  it('branchRollupEngine already accepts registry arg (engine layer ready)', async () => {
    const s = (await import('../../engine/regionalIntelligence/branchRollupEngine.ts?raw')).default
    expect(s).toContain('registry?: KpiRegistry')
    expect(s).toContain('getProductionEngineKeys(registry)')
  })

  it('heatmapSelectors isCoreKpiKey guard removed — dynamic KPIs now reach the heatmap (Stabilization Pass)', async () => {
    const s = (await import('../../engine/regionalIntelligence/heatmapSelectors.ts?raw')).default
    expect(s).not.toContain('isCoreKpiKey')
    // resolveKpiCell now resolves any KPI present in kpiAchievementSummary,
    // core or dynamic — the former BLOCKER for non-core regional heatmap
    // exposure no longer exists.
  })

  it('getProductionEngineKeys includes all 10 production keys (engine foundation complete)', () => {
    const prodKeys = getProductionEngineKeys(DEFAULT_KPI_REGISTRY)
    expect(prodKeys).toHaveLength(10)
  })
})

// ════════════════════════════════════════════════════════════
// GROUP 14 — Guardrails: no changes made to executive/regional
// ════════════════════════════════════════════════════════════
describe('Phase 4F-D › Guardrails: no executive/regional migration in this phase', () => {
  it('PortfolioKpiHeatmap still uses KPI_KEYS (no migration in Phase 4F-D)', async () => {
    const s = (await import('../../components/executive/PortfolioKpiHeatmap.jsx?raw')).default
    expect(s).toContain('KPI_KEYS')
  })

  it('RegionalIntelligencePanel migrated to getProductionEngineKeys (Stabilization Pass, after Phase 4F-D)', async () => {
    const s = (await import('../../components/executive/RegionalIntelligencePanel.jsx?raw')).default
    expect(s).toContain('getProductionEngineKeys')
  })

  it('DEFAULT_KPI_REGISTRY unchanged: 11 entries, 5 core + 6 non-core', () => {
    expect(Object.keys(DEFAULT_KPI_REGISTRY)).toHaveLength(11)
    const coreCount    = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => k.isCore).length
    const nonCoreCount = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => !k.isCore).length
    expect(coreCount).toBe(5)
    expect(nonCoreCount).toBe(6)
  })

  it('no non-core KPI has executiveEnabled=true (registry unchanged)', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].visibility.executiveEnabled).toBe(false)
    }
  })

  it('no non-core KPI has regionalEnabled=true (registry unchanged)', () => {
    for (const key of NON_CORE_KEYS) {
      expect(DEFAULT_KPI_REGISTRY[key].visibility.regionalEnabled).toBe(false)
    }
  })
})
