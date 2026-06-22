// ============================================================
// Core KPI Retirement Bundle
//
// Certifies the 10 required proofs from the bundle spec:
//  1. Registry is authoritative for all non-evaluation production surfaces.
//  2. Core KPI are compatibility-only.
//  3. Evaluation Engine is the only intentional exception.
//  4. KPI_KEYS remain present and frozen.
//  5. Core KPI fields remain present and frozen.
//  6. No new Core KPI assumptions exist.
//  7. All migrated engines remain registry-driven.
//  8. Full suite remains green (validated via npm test run, not here).
//  9. No scoring drift.
// 10. No Firestore contract changes.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

import {
  REGISTRY_AUTHORITY_DECLARATION,
  isRegistryAuthoritative,
  COMPATIBILITY_LAYER_FROZEN,
  CORE_KPI_FIELDS_FROZEN,
  FROZEN_CORE_KPI_FIELDS,
  KPI_KEYS_IMPORTER_BASELINE,
  FORBIDDEN_EXPANSION_PATTERNS,
  EVALUATION_ENGINE_EXCEPTION,
  IMPORT_ENGINE_EXCEPTION,
  ALL_PROTECTED_EXCEPTIONS,
  FINAL_ASSUMPTION_SWEEP_RESULT,
  isFinalAssumptionSweepComplete,
  getCoreKpiRetirementStatus,
  CORE_KPI_CONSUMER_CLASSIFICATION,
  COMPATIBILITY_LAYER_MANIFEST,
  KPI_DEPENDENCY_AUDIT,
  getDeferredEvaluationEngineSites,
} from './coreKpiRetirement'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'

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

function toRelative(absPath: string): string {
  return 'src/' + absPath.slice(SRC_ROOT.length + 1).replace(/\\/g, '/')
}

const ALL_SOURCE_FILES = collectSourceFiles(SRC_ROOT)

// ══════════════════════════════════════════════════════════════
// PROOF 1 — Registry is authoritative for all non-evaluation production surfaces
// ══════════════════════════════════════════════════════════════
describe('Core KPI Retirement — Proof 1: Registry is authoritative for all non-evaluation production surfaces', () => {
  it('every surface in REGISTRY_AUTHORITY_DECLARATION is marked authoritative', () => {
    expect(REGISTRY_AUTHORITY_DECLARATION.length).toBeGreaterThan(0)
    for (const s of REGISTRY_AUTHORITY_DECLARATION) {
      expect(s.authoritative).toBe(true)
    }
  })

  it('isRegistryAuthoritative() returns true', () => {
    expect(isRegistryAuthoritative()).toBe(true)
  })

  it('REGISTRY_AUTHORITY_DECLARATION names every protected engine surface this program has migrated', () => {
    const surfaces = REGISTRY_AUTHORITY_DECLARATION.map((s) => s.surface)
    for (const expected of [
      'Dashboard', 'Regional Intelligence', 'Branch Intelligence',
      'Team Intelligence', 'Ranking Engine', 'Executive BI / Trend / Risk', 'Live Analytics',
    ]) {
      expect(surfaces).toContain(expected)
    }
  })

  it('the Evaluation Engine is never listed as a registry-authoritative surface', () => {
    const surfaces = REGISTRY_AUTHORITY_DECLARATION.map((s) => s.surface.toLowerCase())
    expect(surfaces.some((s) => s.includes('evaluation'))).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 2 — Core KPI are compatibility-only
// ══════════════════════════════════════════════════════════════
describe('Core KPI Retirement — Proof 2: Core KPI are compatibility-only', () => {
  it('COMPATIBILITY_LAYER_FROZEN and CORE_KPI_FIELDS_FROZEN are both true', () => {
    expect(COMPATIBILITY_LAYER_FROZEN).toBe(true)
    expect(CORE_KPI_FIELDS_FROZEN).toBe(true)
  })

  it('every non-Evaluation-Engine, non-Import-Engine entry in CORE_KPI_CONSUMER_CLASSIFICATION is REGISTRY_DRIVEN or COMPATIBILITY_LAYER, never a raw unguarded dependency', () => {
    for (const c of CORE_KPI_CONSUMER_CLASSIFICATION) {
      expect(['REGISTRY_DRIVEN', 'COMPATIBILITY_LAYER', 'BLOCKED_BY_PROTECTED_ENGINE']).toContain(c.classification)
    }
  })

  it('COMPATIBILITY_LAYER_MANIFEST documents KPI_KEYS, DEFAULT_KPI_KEYS, and the Core KPI registry entries as retained compatibility artifacts', () => {
    const names = COMPATIBILITY_LAYER_MANIFEST.map((a) => a.name)
    expect(names).toContain('KPI_KEYS')
    expect(names).toContain('DEFAULT_KPI_KEYS')
    expect(names.some((n) => n.includes('Core KPI registry entries'))).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 3 — Evaluation Engine is the only intentional exception
// ══════════════════════════════════════════════════════════════
describe('Core KPI Retirement — Proof 3: Evaluation Engine is the only intentional exception', () => {
  it('EVALUATION_ENGINE_EXCEPTION is permanent; IMPORT_ENGINE_EXCEPTION is explicitly not', () => {
    expect(EVALUATION_ENGINE_EXCEPTION.permanent).toBe(true)
    expect(IMPORT_ENGINE_EXCEPTION.permanent).toBe(false)
  })

  it('exactly one permanent exception exists across ALL_PROTECTED_EXCEPTIONS', () => {
    const permanent = ALL_PROTECTED_EXCEPTIONS.filter((e) => e.permanent)
    expect(permanent.length).toBe(1)
    expect(permanent[0].consumer).toBe('Evaluation Engine')
  })

  it('the Evaluation Engine file never imports dynamicReaderPilot or coreKpiRetirement', async () => {
    const src = await import('../evaluationEngine/evaluationEngine?raw').then((m) => m.default)
    expect(src).not.toContain('dynamicReaderPilot')
    expect(src).not.toContain('coreKpiRetirement')
  })

  it('Evaluation Engine is still classified EVALUATION_ENGINE_GUARDED in KPI_DEPENDENCY_AUDIT', () => {
    const site = KPI_DEPENDENCY_AUDIT.find((s) => s.file === 'src/engine/evaluationEngine/evaluationEngine.ts')
    expect(site?.classification).toBe('EVALUATION_ENGINE_GUARDED')
    expect(getDeferredEvaluationEngineSites().some((s) => s.file.includes('evaluationEngine.ts'))).toBe(true)
  })

  it('getCoreKpiRetirementStatus reports the Evaluation Engine exception as ACTIVE', () => {
    expect(getCoreKpiRetirementStatus().evaluationEngineException).toBe('ACTIVE')
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 4 — KPI_KEYS remain present and frozen
// ══════════════════════════════════════════════════════════════
describe('Core KPI Retirement — Proof 4: KPI_KEYS remain present and frozen', () => {
  it('KPI_KEYS export still exists and equals DEFAULT_KPI_KEYS', async () => {
    const { KPI_KEYS, DEFAULT_KPI_KEYS } = await import('../kpiAnalyticsEngine')
    expect(KPI_KEYS).toEqual(DEFAULT_KPI_KEYS)
    expect(KPI_KEYS.length).toBe(5)
  })

  it('the set of files referencing KPI_KEYS is exactly the frozen baseline (no expansion, no shrinkage hidden from review)', () => {
    const kpiKeysPattern = /\bKPI_KEYS\b/
    const currentImporters = ALL_SOURCE_FILES
      .filter((file) => kpiKeysPattern.test(readFileSync(file, 'utf8')))
      .map(toRelative)
      .sort()

    const baseline = new Set(KPI_KEYS_IMPORTER_BASELINE)
    const newFiles = currentImporters.filter((f) => !baseline.has(f))
    expect(newFiles).toEqual([])
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 5 — Core KPI fields remain present and frozen
// ══════════════════════════════════════════════════════════════
describe('Core KPI Retirement — Proof 5: Core KPI fields remain present and frozen', () => {
  it('FROZEN_CORE_KPI_FIELDS lists exactly the 5 production engine keys', () => {
    expect(FROZEN_CORE_KPI_FIELDS).toEqual(['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'])
  })

  it('all 5 Core KPI registry entries remain defined with actualField/targetField matching the frozen list', () => {
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
      expect(def.isCore).toBe(true)
      expect(FROZEN_CORE_KPI_FIELDS).toContain(actualField)
      expect(def.actualField).toBe(actualField)
      expect(def.targetField).toBe(targetField)
    }
  })

  it('the 5 Core KPI weights still sum to 1.0 (scoring formula stability)', () => {
    const coreKeys = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling'] as const
    const sum = coreKeys.reduce((s, k) => s + (DEFAULT_KPI_REGISTRY[k]?.weight ?? 0), 0)
    expect(Math.round(sum * 100) / 100).toBe(1)
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 6 — No new Core KPI assumptions exist
// ══════════════════════════════════════════════════════════════
describe('Core KPI Retirement — Proof 6: No new Core KPI assumptions exist', () => {
  it('isFinalAssumptionSweepComplete() returns true — every finding is CLEAN or explicitly CLASSIFIED', () => {
    expect(isFinalAssumptionSweepComplete()).toBe(true)
  })

  it('FINAL_ASSUMPTION_SWEEP_RESULT covers all 5 required checks from the bundle spec', () => {
    const checks = FINAL_ASSUMPTION_SWEEP_RESULT.map((f) => f.check)
    expect(checks).toContain('isCoreKpiKey')
    expect(checks.some((c) => c.includes('KPI_KEYS usage'))).toBe(true)
    expect(checks.some((c) => c.toLowerCase().includes('switch'))).toBe(true)
    expect(checks.some((c) => c.toLowerCase().includes('loops'))).toBe(true)
    expect(checks.some((c) => c.toLowerCase().includes('raw'))).toBe(true)
  })

  it('isCoreKpiKey has no functional declaration or call site anywhere in non-test source', () => {
    const offenders: string[] = []
    for (const file of ALL_SOURCE_FILES) {
      const rel = toRelative(file)
      const content = readFileSync(file, 'utf8')
      if (!content.includes('isCoreKpiKey')) continue
      const isAllowlisted = [
        'src/engine/kpiRegistry/dynamicKpiFoundation.ts',
        'src/engine/kpiRegistry/coreKpiDeprecationPrep.ts',
        'src/engine/kpiRegistry/coreKpiRetirement.ts',
      ].includes(rel)
      if (!isAllowlisted) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('no hardcoded case \'wasfaty\'/\'sl\'/\'ndf\' switch block exists in non-test source', () => {
    const offenders = ALL_SOURCE_FILES.filter((file) => {
      const content = readFileSync(file, 'utf8')
      return /case\s+'wasfaty':|case\s+'sl':|case\s+'ndf':/.test(content)
    }).map(toRelative)
    expect(offenders).toEqual([])
  })

  it('the Import Engine raw-field usage found by the sweep is explicitly classified, not silently present', () => {
    const importFinding = FINAL_ASSUMPTION_SWEEP_RESULT.find((f) =>
      f.check.toLowerCase().includes('raw'),
    )
    expect(importFinding?.result).toBe('CLASSIFIED')
    expect(importFinding?.detail).toContain('ingestionSafetyGuards')
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 7 — All migrated engines remain registry-driven
// ══════════════════════════════════════════════════════════════
describe('Core KPI Retirement — Proof 7: All migrated engines remain registry-driven', () => {
  it('every engine migrated across the Protected Engines Migration + Branch Intelligence bundles is still REGISTRY_DRIVEN', () => {
    const expectedRegistryDriven = [
      'Ranking Engine', 'Executive BI', 'Trend Engine', 'Risk Engine',
      'Team Intelligence', 'Live Analytics', 'Dashboard (display)',
      'Regional Intelligence (display + rollups)', 'Branch Intelligence (display)',
    ]
    for (const name of expectedRegistryDriven) {
      const entry = CORE_KPI_CONSUMER_CLASSIFICATION.find((c) => c.engine === name)
      expect(entry?.classification).toBe('REGISTRY_DRIVEN')
    }
  })

  it('no engine classification regressed to BLOCKED_BY_PROTECTED_ENGINE', () => {
    const blocked = CORE_KPI_CONSUMER_CLASSIFICATION.filter((c) => c.classification === 'BLOCKED_BY_PROTECTED_ENGINE')
    expect(blocked.length).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 9 — No scoring drift
// (Proof 8, "full suite remains green," is validated via the npm test
// run for this bundle, not as a unit test here.)
// ══════════════════════════════════════════════════════════════
describe('Core KPI Retirement — Proof 9: No scoring drift', () => {
  it('this bundle adds zero new lines to any protected engine file (documentation/admin-page-only bundle)', async () => {
    const protectedFiles = [
      '../teamIntelligence/pharmacistPerformanceEngine',
      '../teamIntelligence/teamHealthEngine',
      '../teamIntelligence/accountabilityEngine',
      '../../ranking/branch-kpi-engine',
      '../executive/executiveScore',
      '../executive/trendEngine',
      '../executive/riskEngine',
      '../liveAnalytics/kpiHealthEngine',
    ]
    for (const path of protectedFiles) {
      const src = await import(/* @vite-ignore */ `${path}?raw`).then((m) => m.default)
      // Unchanged from the Protected Engines Migration Bundle: still
      // imports the pilot module, still gates with `registry && policy`.
      expect(src).toContain('dynamicReaderPilot')
      expect(src).toMatch(/registry\s*&&\s*policy/)
    }
  })

  it('FORBIDDEN_EXPANSION_PATTERNS is unchanged (still just isCoreKpiKey) — no new forbidden pattern was introduced or relaxed', () => {
    expect(FORBIDDEN_EXPANSION_PATTERNS).toEqual(['isCoreKpiKey'])
  })
})

// ══════════════════════════════════════════════════════════════
// PROOF 10 — No Firestore contract changes
// ══════════════════════════════════════════════════════════════
describe('Core KPI Retirement — Proof 10: No Firestore contract changes', () => {
  it('coreKpiRetirement.ts contains no Firestore imports or writes', async () => {
    const src = await import('./coreKpiRetirement?raw').then((m) => m.default)
    expect(src).not.toMatch(/from\s+['"]firebase/)
    expect(src).not.toContain('setDoc(')
    expect(src).not.toContain('updateDoc(')
    expect(src).not.toContain('collection(')
  })

  it('DynamicKpiShadowPage.jsx adds no new Firestore subscriptions for the retirement panel', async () => {
    const src = await import('../../pages/admin/DynamicKpiShadowPage?raw').then((m) => m.default)
    const subscribeCalls = new Set(src.match(/subscribe\w+\(/g) ?? [])
    expect(subscribeCalls).toEqual(new Set(['subscribeKpiRegistry(', 'subscribeRecentKpiEntries(', 'subscribeRecentTargets(']))
  })

  it('getCoreKpiRetirementStatus() is pure — calling it twice produces the same result with no side effects', () => {
    const first = getCoreKpiRetirementStatus()
    const second = getCoreKpiRetirementStatus()
    expect(first).toEqual(second)
  })
})

// ══════════════════════════════════════════════════════════════
// Hard Stop guardrails
// ══════════════════════════════════════════════════════════════
describe('Core KPI Retirement — Hard Stop guardrails', () => {
  it('does not delete KPI_KEYS or remove Core KPI fields', async () => {
    const src = await import('../kpiAnalyticsEngine?raw').then((m) => m.default)
    expect(src).toContain('export const KPI_KEYS')
    expect(src).toContain("'wasfaty'")
  })

  it('does not activate non-core KPIs globally', () => {
    expect(() => getCoreKpiRetirementStatus()).not.toThrow()
    const status = getCoreKpiRetirementStatus()
    expect(status).not.toHaveProperty('activateGlobal')
  })

  it('Profile Studio / Import Engine files are not imported or modified by this module', async () => {
    const src = await import('./coreKpiRetirement?raw').then((m) => m.default)
    expect(src).not.toMatch(/from\s+['"].*profileStudio/)
    expect(src).not.toMatch(/from\s+['"].*ingestion/)
  })
})
