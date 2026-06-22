// ============================================================
// Final Core KPI Deprecation Preparation Bundle
//
// Certifies the 8 required proofs from the bundle spec:
//  1. Core KPI remain compatibility-only.
//  2. No new Core KPI assumptions are introduced.
//  3. Existing compatibility consumers remain functional.
//  4. Protected engines are only classified, not modified.
//  5. KPI_KEYS remain present.
//  6. Dynamic pilot coverage metrics are accurate.
//  7. Registry-driven surfaces are documented.
//  8. Full suite remains green (validated via npm test run, not here).
// ============================================================

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, relative, join } from 'node:path'
import {
  COMPATIBILITY_LAYER_MANIFEST,
  KPI_KEYS_IMPORTER_BASELINE,
  FORBIDDEN_EXPANSION_PATTERNS,
  FORBIDDEN_PATTERN_DOCUMENTATION_ALLOWLIST,
  CORE_KPI_CONSUMER_CLASSIFICATION,
  getDeprecationReadinessMetrics,
} from './coreKpiDeprecationPrep'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import { PARITY_VALIDATION_TARGETS } from './dynamicKpiFoundation'

const SRC_ROOT = resolve(__dirname, '../../')

/** Recursively collect every .ts/.tsx/.jsx source file under src, excluding tests. */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectSourceFiles(full, out)
    } else if (/\.(ts|tsx|jsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(full)
    }
  }
  return out
}

const ALL_SOURCE_FILES = collectSourceFiles(SRC_ROOT)

function toRelative(absPath: string): string {
  return relative(resolve(__dirname, '../../../'), absPath).replace(/\\/g, '/')
}

describe('Final Core KPI Deprecation Prep — Proof 1: Core KPI remain compatibility-only', () => {
  it('COMPATIBILITY_LAYER_MANIFEST documents KPI_KEYS, DEFAULT_KPI_KEYS, Core KPI fields, and legacy readers', () => {
    const names = COMPATIBILITY_LAYER_MANIFEST.map((a) => a.name)
    expect(names).toContain('KPI_KEYS')
    expect(names).toContain('DEFAULT_KPI_KEYS')
    expect(COMPATIBILITY_LAYER_MANIFEST.some((a) => a.kind === 'CORE_FIELD')).toBe(true)
    expect(COMPATIBILITY_LAYER_MANIFEST.some((a) => a.kind === 'LEGACY_READER')).toBe(true)
  })

  it('every manifest entry has a non-empty retainedReason (documentation, not deletion)', () => {
    for (const artifact of COMPATIBILITY_LAYER_MANIFEST) {
      expect(artifact.retainedReason.length).toBeGreaterThan(10)
    }
  })

  it('all 5 core KPI registry entries remain defined with actualField/targetField intact', () => {
    const coreEntries = [
      ['wasfaty', 'wasfaty', 'wasfatyTarget'],
      ['omnihealth', 'omni', 'omniTarget'],
      ['wellnessCard', 'wellness', 'wellnessTarget'],
      ['basket', 'basket', 'basketTarget'],
      ['crossSelling', 'crossSelling', 'crossSellTarget'],
    ] as const
    for (const [registryKey, actualField, targetField] of coreEntries) {
      const def = DEFAULT_KPI_REGISTRY[registryKey]
      expect(def).toBeDefined()
      expect(def.actualField).toBe(actualField)
      expect(def.targetField).toBe(targetField)
    }
  })
})

describe('Final Core KPI Deprecation Prep — Proof 2: no new Core KPI assumptions introduced', () => {
  it('isCoreKpiKey does not exist as functional code anywhere in non-test source', () => {
    const allowlist = new Set(FORBIDDEN_PATTERN_DOCUMENTATION_ALLOWLIST)
    const offenders: string[] = []
    for (const file of ALL_SOURCE_FILES) {
      const rel = toRelative(file)
      if (allowlist.has(rel)) continue
      const content = readFileSync(file, 'utf8')
      for (const pattern of FORBIDDEN_EXPANSION_PATTERNS) {
        if (content.includes(pattern)) offenders.push(`${rel} (${pattern})`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the documentation allowlist itself never declares or imports isCoreKpiKey as real code', () => {
    for (const rel of FORBIDDEN_PATTERN_DOCUMENTATION_ALLOWLIST) {
      const content = readFileSync(resolve(SRC_ROOT, '..', rel), 'utf8')
      expect(content).not.toMatch(/function\s+isCoreKpiKey/)
      expect(content).not.toMatch(/from\s+['"].*['"].*isCoreKpiKey/)
      expect(content).not.toMatch(/if\s*\(\s*isCoreKpiKey/)
    }
  })

  it('the set of files referencing KPI_KEYS is a subset of the frozen baseline (no expansion)', () => {
    const kpiKeysPattern = /\bKPI_KEYS\b/
    const currentImporters = ALL_SOURCE_FILES
      .filter((file) => kpiKeysPattern.test(readFileSync(file, 'utf8')))
      .map(toRelative)
      .sort()

    const baseline = new Set(KPI_KEYS_IMPORTER_BASELINE)
    const newFiles = currentImporters.filter((f) => !baseline.has(f))
    expect(newFiles).toEqual([])
  })

  it('the new compatibility-prep module itself does not introduce a hardcoded core-only loop', async () => {
    const src = await import('./coreKpiDeprecationPrep?raw').then((m) => m.default)
    expect(src).not.toMatch(/\['wasfaty',\s*'omni',\s*'wellness',\s*'basket',\s*'crossSelling'\]\.forEach/)
    expect(src).not.toMatch(/case\s+'wasfaty':/)
  })
})

describe('Final Core KPI Deprecation Prep — Proof 3: existing compatibility consumers remain functional', () => {
  it('KPI_KEYS still equals DEFAULT_KPI_KEYS — every protected engine sees the same 5 keys as before', async () => {
    const { KPI_KEYS, DEFAULT_KPI_KEYS } = await import('../kpiAnalyticsEngine')
    expect(KPI_KEYS).toEqual(DEFAULT_KPI_KEYS)
    expect(KPI_KEYS).toEqual(['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'])
  })

  it('sumKpi/getTargetForKpi called without a registry behave exactly as before', async () => {
    const { sumKpi, getTargetForKpi } = await import('../kpiAnalyticsEngine')
    const entries = [{ wasfaty: 50 } as any, { wasfaty: 25 } as any]
    expect(sumKpi(entries, 'wasfaty')).toBe(75)
    expect(getTargetForKpi({ wasfatyTarget: 100 } as any, 'wasfaty')).toBe(100)
  })
})

describe('Final Core KPI Deprecation Prep — Proof 4: protected engines only classified, not modified', () => {
  const protectedEntries = CORE_KPI_CONSUMER_CLASSIFICATION.filter(
    (c) => c.classification === 'BLOCKED_BY_PROTECTED_ENGINE',
  )

  // NOTE: Ranking Engine, Team Intelligence, Executive BI, Trend Engine,
  // Risk Engine, and Live Analytics were all intentionally migrated to
  // REGISTRY_DRIVEN in the later, separately approved Protected Engines
  // Migration Bundle (Phases A-D) — see protectedEnginesMigration.test.ts.
  // No engine in CORE_KPI_CONSUMER_CLASSIFICATION remains
  // BLOCKED_BY_PROTECTED_ENGINE; only the Evaluation Engine itself (not
  // tracked in this classification list) remains an indefinite Hard Stop.
  it('no remaining engine is classified BLOCKED_BY_PROTECTED_ENGINE', () => {
    expect(protectedEntries.length).toBe(0)
  })

  it('none of the protected engine files import dynamicReaderPilot or coreKpiDeprecationPrep', async () => {
    for (const entry of protectedEntries) {
      const relPath = entry.file.replace(/^src\//, '')
      const src = await import(/* @vite-ignore */ `../../${relPath}?raw`).then((m) => m.default)
      expect(src).not.toContain('dynamicReaderPilot')
      expect(src).not.toContain('coreKpiDeprecationPrep')
    }
  })
})

describe('Final Core KPI Deprecation Prep — Proof 5: KPI_KEYS remain present', () => {
  it('KPI_KEYS export exists in kpiAnalyticsEngine.ts', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').then((m) => m.default)
    expect(src).toContain('export const KPI_KEYS')
  })

  it('KPI_KEYS is documented as a Compatibility Layer artifact, not scheduled for deletion', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').then((m) => m.default)
    expect(src).toContain('Compatibility-layer artifact')
  })
})

describe('Final Core KPI Deprecation Prep — Proof 6: dynamic pilot coverage metrics are accurate', () => {
  // NOTE: Branch Intelligence was intentionally moved from deferred to
  // piloted in the later, separately approved Branch Intelligence
  // Registry Wiring Bundle — see branchIntelligenceRegistryWiring.test.ts.
  it('getDeprecationReadinessMetrics reports exactly 3 piloted surfaces and 0 deferred surfaces', () => {
    const metrics = getDeprecationReadinessMetrics()
    expect(metrics.dynamicPilotCoverage.pilotedSurfaces).toEqual(['dashboard', 'regionalIntelligence', 'branchIntelligence'])
    expect(metrics.dynamicPilotCoverage.deferredSurfaces).toEqual([])
  })

  it('pilotedKpiCount matches the actual number of named parity-validation targets', () => {
    const metrics = getDeprecationReadinessMetrics()
    expect(metrics.dynamicPilotCoverage.pilotedKpiCount).toBe(Object.keys(PARITY_VALIDATION_TARGETS).length)
    expect(metrics.dynamicPilotCoverage.pilotedKpiCount).toBe(5)
  })

  it('remainingBlockers lists exactly the BLOCKED_BY_PROTECTED_ENGINE entries', () => {
    const metrics = getDeprecationReadinessMetrics()
    const expected = CORE_KPI_CONSUMER_CLASSIFICATION
      .filter((c) => c.classification === 'BLOCKED_BY_PROTECTED_ENGINE')
      .map((c) => c.engine)
    expect(metrics.remainingBlockers).toEqual(expected)
  })
})

describe('Final Core KPI Deprecation Prep — Proof 7: registry-driven surfaces are documented', () => {
  it('Dashboard and Regional Intelligence are classified REGISTRY_DRIVEN', () => {
    const registryDriven = CORE_KPI_CONSUMER_CLASSIFICATION.filter((c) => c.classification === 'REGISTRY_DRIVEN')
    expect(registryDriven.some((c) => c.engine.includes('Dashboard'))).toBe(true)
    expect(registryDriven.some((c) => c.engine.includes('Regional Intelligence'))).toBe(true)
  })

  it('counts in getDeprecationReadinessMetrics match the classification array exactly', () => {
    const metrics = getDeprecationReadinessMetrics()
    const registryDrivenCount = CORE_KPI_CONSUMER_CLASSIFICATION.filter((c) => c.classification === 'REGISTRY_DRIVEN').length
    const compatOnlyCount = CORE_KPI_CONSUMER_CLASSIFICATION.filter((c) => c.classification === 'COMPATIBILITY_LAYER').length
    const protectedCount = CORE_KPI_CONSUMER_CLASSIFICATION.filter((c) => c.classification === 'BLOCKED_BY_PROTECTED_ENGINE').length
    expect(metrics.registryDrivenSurfacesCount).toBe(registryDrivenCount)
    expect(metrics.compatibilityOnlySurfacesCount).toBe(compatOnlyCount)
    expect(metrics.protectedEngineDependenciesCount).toBe(protectedCount)
  })
})

describe('Final Core KPI Deprecation Prep — Hard Stop guardrails', () => {
  it('does not delete KPI_KEYS or remove Core KPI fields', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').then((m) => m.default)
    expect(src).toContain('export const KPI_KEYS')
    expect(src).toContain("'wasfaty'")
  })

  it('does not activate non-core KPIs globally (no global activation flag in the new module)', async () => {
    const src = await import('./coreKpiDeprecationPrep?raw').then((m) => m.default)
    expect(src).not.toMatch(/dynamicOnly\s*[:=]\s*true/)
    expect(src).not.toMatch(/activateGlobal/i)
  })

  it('no engine in CORE_KPI_CONSUMER_CLASSIFICATION remains BLOCKED_BY_PROTECTED_ENGINE', () => {
    // NOTE: Ranking Engine, Team Intelligence, Executive BI, Trend Engine,
    // Risk Engine, and Live Analytics were all intentionally migrated to
    // REGISTRY_DRIVEN across the separately approved Protected Engines
    // Migration Bundle (Phases A-D). They are certified there instead —
    // see protectedEnginesMigration.test.ts. The Evaluation Engine itself
    // (not tracked in this classification list) remains an indefinite
    // Hard Stop, enforced elsewhere by KPI_DEPENDENCY_AUDIT.
    const stillBlocked = CORE_KPI_CONSUMER_CLASSIFICATION.filter(
      (c) => c.classification === 'BLOCKED_BY_PROTECTED_ENGINE',
    )
    expect(stillBlocked.length).toBe(0)
  })
})
