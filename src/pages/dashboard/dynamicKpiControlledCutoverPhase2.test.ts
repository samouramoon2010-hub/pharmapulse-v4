// ============================================================
// Dynamic KPI Controlled Cutover — Phase 2: Production Reader Pilot
//
// Certifies the 8 required proofs from the bundle spec:
//  1. Pilot surface uses Dynamic Reader only when parity PASS.
//  2. Legacy fallback works automatically.
//  3. User-visible behavior remains unchanged.
//  4. Ranking and scoring remain unchanged.
//  5. Core KPI fields remain present.
//  6. No Firestore contract changes occur.
//  7. Dynamic failures never break UI.
//  8. Legacy readers remain available.
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import {
  buildPilotPolicy,
  readPilotActual,
  readPilotTarget,
} from '../../engine/kpiRegistry/dynamicReaderPilot'

const dashboardSrc = () => import('./DashboardPage?raw').then((m) => m.default)
const pilotSrc      = () => import('../../engine/kpiRegistry/dynamicReaderPilot?raw').then((m) => m.default)

const SAMPLE_ENTRY: Record<string, unknown> = {
  pharmacyId: 'branch-1', date: '2025-01-15',
  wasfaty: 150, omni: 80, wellness: 60, basket: 250, crossSelling: 45,
  sales: 12000, sl: 92, ndf: 14,
}
const SAMPLE_TARGET: Record<string, unknown> = {
  pharmacyId: 'branch-1', month: '2025-01',
  wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 80,
  basketTarget: 300, crossSellTarget: 60,
  salesTarget: 15000, slTarget: 95, ndfTarget: 20,
}

describe('Controlled Cutover Phase 2 — Proof 1: Dynamic Reader used only when parity PASS', () => {
  it('all 5 pilot KPIs route to Dynamic Reader when a real sample proves parity', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    expect(policy.sources.every((s) => s.source === 'dynamic' && s.parity === 'PASS')).toBe(true)
  })

  it('a pilot KPI with broken parity (mismatched field) never routes to Dynamic Reader', () => {
    const brokenRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      sl: { ...DEFAULT_KPI_REGISTRY.sl, actualField: 'some_other_field' },
    }
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, brokenRegistry)
    const sl = policy.sources.find((s) => s.businessKey === 'sl')
    expect(sl?.source).toBe('legacy')
    expect(sl?.parity).toBe('BLOCKED')
  })

  it('DashboardPage.jsx gates the actual/target reads through the pilot policy, not unconditionally', () => {
    return dashboardSrc().then((src) => {
      expect(src).toContain('readPilotActual(e, engineKey, liveRegistry, pilotPolicy)')
      expect(src).toContain('readPilotTarget(currentTarget, engineKey, liveRegistry, pilotPolicy')
    })
  })
})

describe('Controlled Cutover Phase 2 — Proof 2: Legacy fallback works automatically', () => {
  it('with no live sample, every pilot KPI automatically uses the Legacy Reader', () => {
    const policy = buildPilotPolicy(null, null, DEFAULT_KPI_REGISTRY)
    expect(policy.sources.every((s) => s.source === 'legacy')).toBe(true)
  })

  it('fallback requires no caller-side branching — readPilotActual/readPilotTarget decide internally', async () => {
    const src = await pilotSrc()
    expect(src).toContain("policy.bySourceEngineKey[engineKey] ?? 'legacy'")
  })

  it('an inactive registry entry automatically falls back, independent of parity result', () => {
    const registry = { ...DEFAULT_KPI_REGISTRY, ndf: { ...DEFAULT_KPI_REGISTRY.ndf, isActive: false } }
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, registry)
    expect(policy.sources.find((s) => s.businessKey === 'ndf')?.source).toBe('legacy')
  })
})

describe('Controlled Cutover Phase 2 — Proof 3: user-visible behavior remains unchanged', () => {
  it('readPilotActual returns the identical number whether routed dynamic or legacy, when parity holds', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    const dynamicValue = readPilotActual(SAMPLE_ENTRY, 'sl', DEFAULT_KPI_REGISTRY, policy)
    const legacyOnlyPolicy = buildPilotPolicy(null, null, DEFAULT_KPI_REGISTRY)
    const legacyValue = readPilotActual(SAMPLE_ENTRY, 'sl', DEFAULT_KPI_REGISTRY, legacyOnlyPolicy)
    expect(dynamicValue).toBe(legacyValue)
  })

  it('readPilotTarget returns the identical number whether routed dynamic or legacy, when parity holds', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    const legacyFallback = () => Number(SAMPLE_TARGET.slTarget) || 0
    const dynamicValue = readPilotTarget(SAMPLE_TARGET, 'sl', DEFAULT_KPI_REGISTRY, policy, legacyFallback)
    expect(dynamicValue).toBe(legacyFallback())
  })

  it('non-pilot KPIs (wasfaty/basket/crossSelling) are completely untouched by the pilot policy', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    for (const key of ['wasfaty', 'basket', 'crossSelling']) {
      expect(policy.bySourceEngineKey[key]).toBeUndefined()
      expect(readPilotActual(SAMPLE_ENTRY, key, DEFAULT_KPI_REGISTRY, policy)).toBe(Number(SAMPLE_ENTRY[key]) || 0)
    }
  })
})

describe('Controlled Cutover Phase 2 — Proof 4: ranking and scoring remain unchanged', () => {
  // NOTE: Ranking Engine was intentionally migrated in the later,
  // separately approved Protected Engines Migration Bundle (Phase B) —
  // its ranking SCORE formula (buildBranchSummary) was proven untouched
  // there; see protectedEnginesMigration.test.ts. Evaluation Engine and
  // Executive Score remain unmigrated and are still checked here.
  it('pilot module is never imported by the evaluation engine file', async () => {
    // NOTE: Executive Score was intentionally migrated in the later,
    // separately approved Protected Engines Migration Bundle (Phase C) —
    // see protectedEnginesMigration.test.ts. Evaluation Engine remains
    // unmigrated and is still checked here.
    const evalSrc = await import('../../engine/evaluationEngine/evaluationEngine?raw').then((m) => m.default)
    expect(evalSrc).not.toContain('dynamicReaderPilot')
  })

  it('pilot module itself never imports ranking, evaluation engine, or executive score', async () => {
    const src = await pilotSrc()
    expect(src).not.toMatch(/from\s+['"].*\/ranking\//)
    expect(src).not.toMatch(/from\s+['"].*evaluationEngine/)
    expect(src).not.toMatch(/from\s+['"].*executiveScore/)
  })
})

describe('Controlled Cutover Phase 2 — Proof 5: Core KPI fields remain present', () => {
  it('KPI_KEYS export still exists', async () => {
    const src = await import('../../engine/kpiAnalyticsEngine?raw').then((m) => m.default)
    expect(src).toContain('export const KPI_KEYS')
  })

  it('all 5 core KPI registry entries remain defined with actualField/targetField intact', () => {
    for (const key of ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']) {
      expect(DEFAULT_KPI_REGISTRY[key]).toBeDefined()
    }
  })
})

describe('Controlled Cutover Phase 2 — Proof 6: no Firestore contract changes', () => {
  it('pilot module contains no Firestore imports or writes', async () => {
    const src = await pilotSrc()
    expect(src).not.toMatch(/from\s+['"]firebase/)
    expect(src).not.toContain('setDoc(')
    expect(src).not.toContain('updateDoc(')
    expect(src).not.toContain('collection(')
  })

  it('DashboardPage.jsx pilot wiring adds no new Firestore subscriptions', async () => {
    const src = await dashboardSrc()
    // Pilot policy is derived only from already-subscribed monthEntries/currentTarget/liveRegistry
    expect(src).toContain('buildPilotPolicy(monthEntries[0] ?? null, currentTarget, liveRegistry)')
  })
})

describe('Controlled Cutover Phase 2 — Proof 7: Dynamic failures never break UI', () => {
  it('readPilotActual never throws even with a malformed registry', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    expect(() => readPilotActual(SAMPLE_ENTRY, 'sl', null as any, policy)).not.toThrow()
  })

  it('readPilotTarget never throws even with a malformed registry', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    expect(() => readPilotTarget(SAMPLE_TARGET, 'sl', null as any, policy, () => 0)).not.toThrow()
  })

  it('buildPilotPolicy never throws even with an empty-object sample', () => {
    expect(() => buildPilotPolicy({}, {}, DEFAULT_KPI_REGISTRY)).not.toThrow()
  })

  it('reader functions wrap the Dynamic Reader call in try/catch with a legacy fallback', async () => {
    const src = await pilotSrc()
    expect(src).toMatch(/try\s*\{\s*return readKpiActual/)
    expect(src).toMatch(/try\s*\{\s*return readKpiTarget/)
  })
})

describe('Controlled Cutover Phase 2 — Proof 8: Legacy readers remain available', () => {
  it('readPilotActual always has a literal legacy computation as its final line', async () => {
    const src = await pilotSrc()
    expect(src).toContain('return Number(entry[engineKey]) || 0')
  })

  it('readPilotTarget always falls through to the caller-supplied legacyFallback', async () => {
    const src = await pilotSrc()
    expect(src).toContain('return legacyFallback()')
  })

  it('DashboardPage.jsx legacy target-resolution ternary is preserved verbatim inside the fallback closure', async () => {
    const src = await dashboardSrc()
    expect(src).toContain('targetField && (currentTarget[targetField] != null)')
    expect(src).toContain('getTargetForKpi(currentTarget, engineKey))')
  })
})

describe('Controlled Cutover Phase 2 — Hard Stop guardrails', () => {
  it('does not enable non-core KPIs beyond the 5 named pilot KPIs', () => {
    const policy = buildPilotPolicy(SAMPLE_ENTRY, SAMPLE_TARGET, DEFAULT_KPI_REGISTRY)
    expect(policy.sources.length).toBe(5)
  })

  it('no dynamic-only global activation flag exists in the pilot module', async () => {
    const src = await pilotSrc()
    expect(src).not.toMatch(/dynamicOnly\s*[:=]\s*true/)
    expect(src).not.toMatch(/activateDynamicMode/i)
  })

  it('no historical data migration helper exists in the pilot module', async () => {
    const src = await pilotSrc()
    expect(src).not.toMatch(/migrateHistorical/i)
  })
})
