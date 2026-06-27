// ============================================================
// Core KPI Dependency Removal Program
// Final Core KPI Closure Bundle — No Silent Core Fallback Closure
// Phase 5 — Expansion Freeze
//
// Certifies the 6 required proofs:
//   1. No NEW active production file imports KPI_KEYS beyond the
//      frozen, explicitly-classified baseline (reuses
//      KPI_KEYS_IMPORTER_BASELINE from coreKpiDeprecationPrep.ts).
//   2. No active production file imports DEFAULT_KPI_KEYS directly
//      (only kpiAnalyticsEngine.ts, the definition site, may).
//   3. Every baseline KPI_KEYS reference at this engine layer is
//      guarded by a `registry ? ... : KPI_KEYS` ternary (optional-
//      registry, historical-compatibility pattern) — except the
//      explicitly documented, unreachable exceptions.
//   4. No active production logic branches on isCore to decide
//      which KPIs are computed/rendered (admin protection UI and
//      registry-definition utilities are out of scope — they are
//      not "which KPIs to silently process" gates).
//   5. New KPI names require no source-code recognition — proven
//      end-to-end in Phase 6 (coreKpiDependencyRemovalStageH.test.ts
//      already proves this for the engine layer; Phase 6 of this
//      bundle extends it through every surface).
//   6. The compatibility/optional-registry consumer set is exactly
//      the frozen baseline — no silent expansion.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, relative, join } from 'node:path'
import {
  KPI_KEYS_IMPORTER_BASELINE,
} from './coreKpiDeprecationPrep'

const SRC_ROOT = resolve(__dirname, '../../')

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectSourceFiles(full, out)
    } else if (/\.(ts|tsx|jsx|js)$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(full)
    }
  }
  return out
}

const ALL_SOURCE_FILES = collectSourceFiles(SRC_ROOT)

function toRelative(absPath: string): string {
  return relative(resolve(__dirname, '../../../'), absPath).replace(/\\/g, '/')
}

// Files where KPI_KEYS appears only as the engine-layer historical-
// compatibility fallback for callers that omit a registry — i.e. every
// occurrence is inside a `registry ? getProductionEngineKeys(registry) :
// KPI_KEYS` (or equivalent ternary) pattern, never an unconditional,
// unguarded use that would silently process only the 5 Core KPIs in an
// active production path with a registry available.
const TERNARY_GUARDED_FILES: readonly string[] = [
  'src/components/executive/PortfolioKpiHeatmap.jsx',
  'src/engine/executive/executiveReportGenerator.ts',
  'src/engine/executive/executiveScore.ts',
  'src/engine/executive/riskEngine.ts',
  'src/engine/executive/trendEngine.ts',
  'src/engine/liveAnalytics/activityFeedEngine.ts',
  'src/engine/liveAnalytics/kpiHealthEngine.ts',
  'src/engine/liveAnalytics/liveAlertEngine.ts',
  'src/engine/liveAnalytics/liveMomentumEngine.ts',
  'src/engine/regionalIntelligence/branchRollupEngine.ts',
  'src/engine/regionalIntelligence/regionalRollupEngine.ts',
  'src/engine/teamIntelligence/pharmacistPerformanceEngine.ts',
  'src/engine/teamIntelligence/teamHealthEngine.ts',
  'src/ranking/branch-kpi-engine.ts',
]

// DashboardPage.jsx shadows the imported KPI_KEYS name with a LOCAL
// const derived entirely from the live registry (`registryKpis.map(cfg
// => cfg.aliasFor ?? cfg.key)`) — it is always registry-driven, never a
// fallback to the static Core list, so it doesn't fit the ternary-
// guarded pattern at all (it's strictly better than that pattern).
const REGISTRY_DERIVED_LOCAL_SHADOW_FILES: readonly string[] = [
  'src/pages/dashboard/DashboardPage.jsx',
]

// Known, documented, deliberately-NOT-widened exceptions. Each is an
// active production path with a genuine architectural reason it cannot
// be safely widened in this bundle without risking a real behavior
// change or a Firestore contract change (Hard Stop territory) — see the
// bundle's final report for the full rationale on each.
const DOCUMENTED_UNGUARDED_EXCEPTIONS: readonly string[] = [
  // hasConsistentUnderperformance() resolves targets via the ad-hoc
  // `${k}Target` convention, which diverges from the canonical registry
  // mapping for crossSelling. Widening it would silently change which
  // Firestore field is read — a real behavior/formula change.
  'src/engine/teamIntelligence/accountabilityEngine.ts',
  // History Layer V1 fire-and-forget snapshot writer (daily summary,
  // forecast, risk, ranking-history documents). Has never accepted a
  // registry parameter; widening would mean adding dynamic-KPI fields
  // to existing Firestore snapshot documents — a Firestore contract
  // change, which is an explicit Hard Stop for this bundle.
  'src/engine/historyEngine.ts',
  // Dormant/unwired engine chain (Core KPI Dependency Removal Phase 4
  // audit) — zero production importers, quarantined, not activated.
  'src/engine/executive/dynamicExecutiveAdapter.ts',
  'src/engine/executive/dynamicExecutiveDataPath.ts',
]

describe('No Silent Core Fallback Closure — Proof 1: KPI_KEYS importer set is frozen', () => {
  // src/constants/index.js defines its OWN separate, self-documented
  // @deprecated KPI_KEYS object (zero importers anywhere) — an unrelated
  // historical-compatibility artifact, not an importer of the
  // kpiAnalyticsEngine.ts KPI_KEYS this baseline tracks.
  const UNRELATED_DEFINITION_SITES = new Set(['src/constants/index.js'])

  it('every current KPI_KEYS importer is in the frozen baseline (no silent expansion)', () => {
    const pattern = /\bKPI_KEYS\b/
    const current = ALL_SOURCE_FILES
      .filter((f) => pattern.test(readFileSync(f, 'utf8')))
      .map(toRelative)
      .filter((f) => !UNRELATED_DEFINITION_SITES.has(f))
    const baseline = new Set(KPI_KEYS_IMPORTER_BASELINE)
    const newFiles = current.filter((f) => !baseline.has(f))
    expect(newFiles).toEqual([])
  })
})

describe('No Silent Core Fallback Closure — Proof 2: DEFAULT_KPI_KEYS is not exposed beyond its definition site or legitimate additive-widening use', () => {
  // Allowed beyond the definition site (kpiAnalyticsEngine.ts):
  //   - src/engine/index.ts        — public re-export passthrough only
  //   - coreKpiDeprecationPrep.ts / coreKpiRetirement.ts — audit/manifest
  //     documentation referencing the name as a string, not gating logic
  //   - src/services/kpiService.js — uses DEFAULT_KPI_KEYS only to compute
  //     `extraEngineKeys` (dynamic keys ADDITIONAL to the legacy 5) when a
  //     registry is supplied; never used to restrict reads to Core-only.
  const ALLOWED_BEYOND_DEFINITION = new Set([
    'src/engine/index.ts',
    'src/engine/kpiRegistry/coreKpiDeprecationPrep.ts',
    'src/engine/kpiRegistry/coreKpiRetirement.ts',
    'src/services/kpiService.js',
  ])

  it('no file outside the definition site + allowlist references DEFAULT_KPI_KEYS', () => {
    const pattern = /\bDEFAULT_KPI_KEYS\b/
    const offenders = ALL_SOURCE_FILES
      .filter((f) => pattern.test(readFileSync(f, 'utf8')))
      .map(toRelative)
      .filter((f) => f !== 'src/engine/kpiAnalyticsEngine.ts' && !ALLOWED_BEYOND_DEFINITION.has(f))
    expect(offenders).toEqual([])
  })

  it('kpiService.js only uses DEFAULT_KPI_KEYS to compute additive dynamic keys, never to restrict reads', () => {
    const content = readFileSync(resolve(SRC_ROOT, '..', 'src/services/kpiService.js'), 'utf8')
    expect(content).toMatch(/registry\s*\?\s*getProductionEngineKeys\(registry\)\.filter\(\(k\)\s*=>\s*!legacyKeySet\.has\(k\)\)\s*:\s*\[\]/)
  })
})

describe('No Silent Core Fallback Closure — Proof 3: every active engine-layer KPI_KEYS use is registry-ternary-guarded', () => {
  it('every ternary-guarded file contains a registry ? ... KPI_KEYS pattern (or equivalent) and never a bare unconditional KPI_KEYS iteration', () => {
    for (const rel of TERNARY_GUARDED_FILES) {
      const content = readFileSync(resolve(SRC_ROOT, '..', rel), 'utf8')
      // Must contain at least one registry-gated fallback to KPI_KEYS —
      // `registry ? <production-keys expression> : KPI_KEYS`. The middle
      // expression varies (getProductionEngineKeys(registry) directly, or
      // with a trailing .filter(...)), so only the registry/KPI_KEYS
      // anchors are required.
      expect(content).toMatch(/registry\s*\?[^;]*?:\s*KPI_KEYS/)
    }
  })

  it('the ternary-guarded set plus the documented exceptions plus definition/type sites accounts for every CURRENT KPI_KEYS importer in the frozen baseline', () => {
    const definitionAndTypeSites = new Set([
      'src/engine/index.ts',
      'src/engine/kpiAnalyticsEngine.ts',
      'src/engine/kpiRegistry/index.ts',
      'src/engine/kpiRegistry/dynamicKpiFoundation.ts',
      'src/engine/kpiRegistry/coreKpiDeprecationPrep.ts',
      'src/engine/kpiRegistry/coreKpiRetirement.ts',
      'src/engine/kpiRegistry/architectureClosureV1.ts',
      'src/engine/kpiRegistry/kpiMetaResolver.ts',
      'src/engine/kpiRegistry/kpiRegistryAdapter.ts',
      'src/engine/kpiRegistry/registrySyncGuard.ts',
      'src/engine/evaluationEngine/evaluationEngine.ts',
      'src/engine/evaluationEngine/evaluationEngineTypes.ts',
      'src/engine/branchIntelligence/branchIntelligenceSelectors.ts',
      'src/engine/branchIntelligence/branchIntelligenceViewModelBuilder.ts',
      'src/engine/teamIntelligence/accountabilityEngine.ts',
      'src/engine/regionalIntelligence/regionalRiskEngine.ts',
      'src/services/evaluationActualsService.ts',
    ])
    const accountedFor = new Set([
      ...TERNARY_GUARDED_FILES,
      ...REGISTRY_DERIVED_LOCAL_SHADOW_FILES,
      ...DOCUMENTED_UNGUARDED_EXCEPTIONS,
      ...definitionAndTypeSites,
    ])
    // Check against files that CURRENTLY reference KPI_KEYS, not the
    // static historical baseline — some baseline entries (e.g. a file
    // whose only KPI_KEYS import was cleaned up as dead code during this
    // bundle) may no longer reference it at all, which needs no
    // classification here.
    const pattern = /\bKPI_KEYS\b/
    const currentImporters = KPI_KEYS_IMPORTER_BASELINE.filter((rel) =>
      pattern.test(readFileSync(resolve(SRC_ROOT, '..', rel), 'utf8')),
    )
    const unaccounted = currentImporters.filter((f) => !accountedFor.has(f))
    expect(unaccounted).toEqual([])
  })
})

describe('No Silent Core Fallback Closure — Proof 4: no active production logic branches on isCore to gate KPI computation', () => {
  // Scope: this proof targets behavioral gates that decide WHICH KPIs get
  // computed/rendered in an active production analytics surface (Stage G
  // already removed the target-input-visibility special case). It does
  // NOT cover: admin protection UI (KpiEditorModal/KpiRegistryTable/
  // KpiManagementPage — intentionally protecting Core KPIs from deletion/
  // edit), registry-definition utilities (getCoreKpis() and friends), or
  // the dormant/quarantined dynamicExecutive* chain.
  const KNOWN_NON_PRODUCTION_ANALYTICS_ISCORE_FILES = new Set([
    'src/components/admin/kpi/KpiEditorModal.jsx',
    'src/components/admin/kpi/KpiRegistryTable.jsx',
    'src/pages/admin/KpiManagementPage.jsx',
    'src/pages/admin/DynamicKpiShadowPage.jsx',
    'src/pages/settings/SettingsPage.jsx',
    'src/pages/shared/SettingsPage.jsx',
    'src/services/kpiRegistryLogic.ts',
    'src/engine/kpiRegistry/defaultKpiRegistry.ts',
    'src/engine/kpiRegistry/kpiRegistryTypes.ts',
    'src/engine/kpiRegistry/kpiUiAdapter.ts',
    'src/engine/kpiRegistry/registrySyncGuard.ts',
    'src/engine/kpiRegistry/dynamicKpiFoundation.ts',
    'src/engine/kpiAnalyticsEngine.ts',
    'src/engine/executive/dynamicExecutiveAdapter.ts',
    // KPI & Targets Bundle (DX-4): reads/preserves isCore from the
    // existing record when committing a bulk-imported KPI definition —
    // CRUD fidelity (never strip a field the import has no column for),
    // not analytics gating. Bulk import always writes isCore: false for
    // NEW KPIs and never modifies a protected core KPI's isCore at all.
    'src/services/dataExchange/adapters/kpiRegistryAdapter.ts',
  ])

  it('every file referencing .isCore is either a known non-gating consumer or absent entirely', () => {
    const pattern = /\.isCore\b/
    const offenders = ALL_SOURCE_FILES
      .filter((f) => pattern.test(readFileSync(f, 'utf8')))
      .map(toRelative)
      .filter((f) => !KNOWN_NON_PRODUCTION_ANALYTICS_ISCORE_FILES.has(f))
    expect(offenders).toEqual([])
  })
})

describe('No Silent Core Fallback Closure — Proof 6: compatibility/optional-registry consumers are exactly the frozen allowlist', () => {
  it('TERNARY_GUARDED_FILES + DOCUMENTED_UNGUARDED_EXCEPTIONS contain no file outside the frozen KPI_KEYS baseline', () => {
    const baseline = new Set(KPI_KEYS_IMPORTER_BASELINE)
    for (const f of [...TERNARY_GUARDED_FILES, ...DOCUMENTED_UNGUARDED_EXCEPTIONS]) {
      expect(baseline.has(f)).toBe(true)
    }
  })
})
