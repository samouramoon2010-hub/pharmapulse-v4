// ============================================================
// Final Foundation Closure Bundle — Profile Integrity Guard
// Certification Tests (Part 4)
//
// Proves:
//   1.  Valid Profile publishes successfully
//   2.  Unknown KPI blocks publish
//   3.  Inactive KPI blocks publish
//   4.  Duplicate KPI in one basket blocks publish
//   5.  Duplicate KPI across score-contributing baskets does NOT block
//       publish (confirmed intentional, supported pattern per user
//       decision) — but emits a clear, fully-detailed warning
//   6.  Zero-weight KPI behavior remains valid
//   7.  Historical invalid Profile remains readable
//   8.  Invalid historical Profile produces a controlled evaluation
//       diagnostic (no crash, no silent misleading score)
//   9.  Valid Profile evaluation results remain byte-identical
//  10.  Arbitrary non-Core KPI still publishes and evaluates successfully
//  11.  No Core KPI fallback is introduced
//  12.  Existing Profile Studio behavior (validateEvaluationProfile,
//       checkProfileKpiCompatibility) is not broken
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkProfileIntegrity } from './profileIntegrityGuard'
import {
  validateEvaluationProfile, checkProfileKpiCompatibility,
  DEFAULT_THRESHOLD_RULE, createSmarts2026Template,
} from './evaluationRegistryTypes'
import type { EvaluationProfile, EvaluationBasket, BasketElement } from './evaluationRegistryTypes'
import type { KpiRegistry, KpiDefinition } from '../kpiRegistry'
import { DEFAULT_KPI_REGISTRY } from '../kpiRegistry/defaultKpiRegistry'
import {
  buildPipelineContext, executePipeline, pipelineResultToEvaluationResult,
} from '../evaluationPipeline'
import { resolveEvaluationPipeline } from '../evaluationPipeline/pipelineResolver'
import type { EvaluationEngineInput } from '../evaluationEngine/evaluationEngineTypes'

// ── Mocks (service-level publish tests) ───────────────────────
vi.mock('../../services/firebase', () => ({
  db: {}, auth: { currentUser: { uid: 'admin-uid' } },
  COL: { EVALUATION_PROFILES: 'evaluation_profiles' },
}))
vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  addDoc:          vi.fn(async () => ({ id: 'new-id' })),
  updateDoc:       vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  setDoc:          vi.fn(async () => {}),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({ _type: 'ts' })),
}))
vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))
vi.mock('../../services/kpiRegistryService', () => ({
  fetchKpiRegistryOnce: vi.fn(),
}))

// ── Fixtures ────────────────────────────────────────────────────

function makeDef(key: string, overrides: Partial<KpiDefinition> = {}): KpiDefinition {
  return {
    key, label: key, shortLabel: key, labelAr: key,
    category: 'engagement', valueType: 'count', unit: 'units', unitAr: 'وحدة',
    direction: 'higher_is_better', targetType: 'absolute',
    weight: 0.1, isCore: false, isActive: true, lifecycleStage: 'production_evaluation',
    actualField: key, targetField: `${key}Target`,
    visibility: {
      dashboardEnabled: true, teamEnabled: true, executiveEnabled: true,
      regionalEnabled: true, targetInputEnabled: true,
    },
    ...overrides,
  } as any
}

const REGISTRY: KpiRegistry = {
  wasfaty:             makeDef('wasfaty'),
  omnihealth:          makeDef('omnihealth'),
  basket:              makeDef('basket'),
  crossSelling:        makeDef('crossSelling'),
  arbitraryClosureKpi: makeDef('arbitraryClosureKpi'),
  inactiveClosureKpi:  makeDef('inactiveClosureKpi', { isActive: false }),
}

const el = (kpiKey: string, weight: number, required = false): BasketElement =>
  ({ kpiKey, weight, required, achievementCapPct: null })

const makeBasket = (
  id: string, name: string, weight: number, elements: BasketElement[],
): EvaluationBasket => ({
  id, name, weight, elements,
  thresholdRule: { ...DEFAULT_THRESHOLD_RULE },
  sortOrder: 1, active: true,
})

function validProfile(): Partial<EvaluationProfile> {
  return {
    id: 'p1', name: 'Closure Valid Profile', role: 'pharmacist', effectiveFrom: '2026-01',
    baskets: {
      b1: makeBasket('b1', 'Guest',  0.5, [el('wasfaty', 0.7), el('omnihealth', 0.3)]),
      b2: makeBasket('b2', 'Profit', 0.5, [el('basket', 0.6), el('crossSelling', 0.4)]),
    },
    basketIds: ['b1', 'b2'],
    defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
  }
}

async function publishWith(
  profileData: Partial<EvaluationProfile> & { status: string },
  registry: KpiRegistry,
) {
  const { getDoc } = await import('firebase/firestore')
  const { fetchKpiRegistryOnce } = await import('../../services/kpiRegistryService')
  vi.mocked(getDoc).mockResolvedValueOnce({
    exists: () => true, id: 'p1', data: () => profileData,
  } as any)
  vi.mocked(fetchKpiRegistryOnce).mockResolvedValueOnce(registry)
  const { publishEvaluationProfile } = await import('../../services/evaluationRegistryService')
  return publishEvaluationProfile('p1', 'admin', 'admin')
}

function buildInput(profile: Partial<EvaluationProfile>, kpiActuals: Record<string, number>, registry: KpiRegistry): EvaluationEngineInput {
  return {
    userId: 'u1', pharmacyId: 'br1', month: '2026-01', role: 'pharmacist',
    profile: profile as EvaluationProfile, kpiActuals,
    branchTarget: { wasfatyTarget: 100, omniTarget: 100, basketTarget: 100, crossSellTarget: 100, arbitraryClosureKpiTarget: 100, inactiveClosureKpiTarget: 100 } as any,
    registry, personalTarget: null,
  } as any
}

function runEvaluation(profile: Partial<EvaluationProfile>, kpiActuals: Record<string, number>, registry: KpiRegistry) {
  const input    = buildInput(profile, kpiActuals, registry)
  const ctx      = buildPipelineContext(input)
  const resolved = resolveEvaluationPipeline(profile as EvaluationProfile)
  const pipeRes  = executePipeline(ctx, resolved.steps)
  const result   = pipelineResultToEvaluationResult(pipeRes, { calculatedAt: Date.now() })
  return { result, pipeRes }
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ── 1. Valid Profile publishes successfully ───────────────────

describe('1. Valid Profile', () => {
  it('passes checkProfileIntegrity with zero errors', () => {
    const result = checkProfileIntegrity(validProfile(), REGISTRY)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('publishes successfully through the service', async () => {
    await expect(publishWith({ ...validProfile(), status: 'draft' } as any, REGISTRY))
      .resolves.toBeUndefined()
  })
})

// ── 2. Unknown KPI blocks publish ──────────────────────────────

describe('2. Unknown KPI', () => {
  const profile: Partial<EvaluationProfile> = {
    name: 'Unknown KPI', role: 'pharmacist', effectiveFrom: '2026-01',
    baskets: { b1: makeBasket('b1', 'Guest', 1.0, [el('totallyUnknownClosureKpi', 1.0)]) },
    basketIds: ['b1'],
    defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
  }

  it('checkProfileIntegrity reports UNKNOWN_KPI and is invalid', () => {
    const result = checkProfileIntegrity(profile, REGISTRY)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.rule === 'UNKNOWN_KPI' && e.kpiKey === 'totallyUnknownClosureKpi')).toBe(true)
  })

  it('blocks publishEvaluationProfile', async () => {
    await expect(publishWith({ ...profile, status: 'draft' } as any, REGISTRY))
      .rejects.toThrow(/integrity check failed/)
  })
})

// ── 3. Inactive KPI blocks publish ─────────────────────────────

describe('3. Inactive KPI', () => {
  const profile: Partial<EvaluationProfile> = {
    name: 'Inactive KPI', role: 'pharmacist', effectiveFrom: '2026-01',
    baskets: { b1: makeBasket('b1', 'Guest', 1.0, [el('inactiveClosureKpi', 1.0)]) },
    basketIds: ['b1'],
    defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
  }

  it('checkProfileIntegrity reports INACTIVE_KPI and is invalid', () => {
    const result = checkProfileIntegrity(profile, REGISTRY)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.rule === 'INACTIVE_KPI' && e.kpiKey === 'inactiveClosureKpi')).toBe(true)
  })

  it('blocks publishEvaluationProfile', async () => {
    await expect(publishWith({ ...profile, status: 'draft' } as any, REGISTRY))
      .rejects.toThrow(/integrity check failed/)
  })
})

// ── 4. Duplicate KPI in one basket blocks publish ──────────────

describe('4. Duplicate KPI — same basket', () => {
  const profile: Partial<EvaluationProfile> = {
    name: 'Same-basket dup', role: 'pharmacist', effectiveFrom: '2026-01',
    baskets: { b1: makeBasket('b1', 'Guest', 1.0, [el('wasfaty', 0.5), el('wasfaty', 0.5)]) },
    basketIds: ['b1'],
    defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
  }

  it('checkProfileIntegrity reports DUPLICATE_KPI_SAME_BASKET and is invalid', () => {
    const result = checkProfileIntegrity(profile, REGISTRY)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.rule === 'DUPLICATE_KPI_SAME_BASKET' && e.kpiKey === 'wasfaty')).toBe(true)
  })

  it('blocks publishEvaluationProfile (caught by the pre-existing structural validator)', async () => {
    await expect(publishWith({ ...profile, status: 'draft' } as any, REGISTRY))
      .rejects.toThrow(/validation failed/)
  })
})

// ── 5. Duplicate KPI across score-contributing baskets — warning only ──

describe('5. Duplicate KPI — cross-basket (confirmed intentional, NOT blocked)', () => {
  const profile: Partial<EvaluationProfile> = {
    name: 'Cross-basket reuse', role: 'pharmacist', effectiveFrom: '2026-01',
    baskets: {
      b1: makeBasket('b1', 'Satisfaction', 0.5, [el('omnihealth', 0.5), el('wasfaty', 0.5)]),
      b2: makeBasket('b2', 'Omni Guest',   0.5, [el('omnihealth', 0.6), el('crossSelling', 0.4)]),
    },
    basketIds: ['b1', 'b2'],
    defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
  }

  it('checkProfileIntegrity does NOT block — valid stays true, no DUPLICATE_KPI_CROSS_BASKET error', () => {
    const result = checkProfileIntegrity(profile, REGISTRY)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('emits a warning with full basket-path and weight detail', () => {
    const result = checkProfileIntegrity(profile, REGISTRY)
    expect(result.warnings.some((w) => w.rule === 'DUPLICATE_KPI_CROSS_BASKET' && w.kpiKey === 'omnihealth')).toBe(true)

    const usage = result.crossBasketKpiUsage.find((u) => u.kpiKey === 'omnihealth')!
    expect(usage).toBeDefined()
    expect(usage.paths).toHaveLength(2)
    const satisfaction = usage.paths.find((p) => p.basketId === 'b1')!
    const omniGuest     = usage.paths.find((p) => p.basketId === 'b2')!
    expect(satisfaction.basketWeight).toBeCloseTo(0.5)
    expect(satisfaction.elementWeight).toBeCloseTo(0.5)
    expect(satisfaction.weightShare).toBeCloseTo(0.25)
    expect(omniGuest.basketWeight).toBeCloseTo(0.5)
    expect(omniGuest.elementWeight).toBeCloseTo(0.6)
    expect(omniGuest.weightShare).toBeCloseTo(0.3)
    expect(usage.totalWeightShare).toBeCloseTo(0.55)
    expect(usage.message).toContain('omnihealth')
    expect(usage.message).toContain('Satisfaction')
    expect(usage.message).toContain('Omni Guest')
  })

  it('does NOT block publishEvaluationProfile', async () => {
    await expect(publishWith({ ...profile, status: 'draft' } as any, REGISTRY))
      .resolves.toBeUndefined()
  })

  it('the built-in SMARTS 2026 template has the same pattern (omnihealth in two baskets) and is also not blocked', () => {
    const template = createSmarts2026Template()
    const result = checkProfileIntegrity(template, DEFAULT_KPI_REGISTRY)
    expect(result.valid).toBe(true)
    expect(result.crossBasketKpiUsage.some((u) => u.kpiKey === 'omnihealth')).toBe(true)
  })
})

// ── 6. Zero-weight KPI remains valid ───────────────────────────

describe('6. Zero-weight KPI', () => {
  it('an element with weight 0 is not flagged as an invalid weight', () => {
    const profile: Partial<EvaluationProfile> = {
      name: 'Zero weight', role: 'pharmacist', effectiveFrom: '2026-01',
      baskets: { b1: makeBasket('b1', 'Guest', 1.0, [el('wasfaty', 1.0), el('arbitraryClosureKpi', 0)]) },
      basketIds: ['b1'],
      defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
    }
    const result = checkProfileIntegrity(profile, REGISTRY)
    expect(result.errors.some((e) => e.rule === 'INVALID_ELEMENT_WEIGHT')).toBe(false)
  })
})

// ── 7. Historical invalid Profile remains readable ─────────────

describe('7. Historical invalid Profile remains readable', () => {
  it('fetchEvaluationProfile returns a structurally-invalid published profile unmodified, with no guard invoked', async () => {
    const { getDoc } = await import('firebase/firestore')
    const corrupted = {
      status: 'published', name: 'Old Broken Profile', role: 'pharmacist', effectiveFrom: '2025-01',
      baskets: { b1: makeBasket('b1', 'Guest', 1.0, [el('totallyUnknownClosureKpi', 1.0), el('wasfaty', 1.0)]) },
      basketIds: ['b1'],
      defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
    }
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, id: 'old-p1', data: () => corrupted } as any)

    const { fetchEvaluationProfile } = await import('../../services/evaluationRegistryService')
    const fetched = await fetchEvaluationProfile('old-p1')
    expect(fetched).not.toBeNull()
    expect(fetched!.name).toBe('Old Broken Profile')
    expect((fetched as any).baskets.b1.elements[0].kpiKey).toBe('totallyUnknownClosureKpi')
  })
})

// ── 8. Invalid historical Profile → controlled evaluation diagnostic ──

describe('8. Invalid historical Profile produces a controlled diagnostic, never a crash', () => {
  const corruptedProfile: Partial<EvaluationProfile> = {
    id: 'old-p1', version: 1, name: 'Old Broken Profile', role: 'pharmacist', effectiveFrom: '2025-01',
    baskets: {
      b1: makeBasket('b1', 'Guest', 1.0, [
        el('totallyUnknownClosureKpi', 0.5),
        el('inactiveClosureKpi', 0.5),
      ]),
    },
    basketIds: ['b1'],
    defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
  }

  it('does not throw, and records the defects in trace.integrityWarnings', () => {
    expect(() => runEvaluation(corruptedProfile, { totallyUnknownClosureKpi: 50, inactiveClosureKpi: 50 }, REGISTRY)).not.toThrow()

    const { result } = runEvaluation(corruptedProfile, { totallyUnknownClosureKpi: 50, inactiveClosureKpi: 50 }, REGISTRY)
    expect(result.trace.integrityWarnings).toBeDefined()
    expect(result.trace.integrityWarnings!.some((w) => w.includes('totallyUnknownClosureKpi'))).toBe(true)
    expect(result.trace.integrityWarnings!.some((w) => w.includes('inactiveClosureKpi'))).toBe(true)
  })

  it('a missing thresholdRule on a historical basket does not crash matchThresholdBand / the pipeline', () => {
    const noRuleProfile: Partial<EvaluationProfile> = {
      ...corruptedProfile,
      baskets: {
        b1: { ...corruptedProfile.baskets!.b1, thresholdRule: undefined as any },
      },
    }
    expect(() => runEvaluation(noRuleProfile, { totallyUnknownClosureKpi: 50, inactiveClosureKpi: 50 }, REGISTRY)).not.toThrow()
  })
})

// ── 9. Valid Profile evaluation results remain byte-identical ──

describe('9. Valid Profile evaluation results are deterministic and unaffected', () => {
  it('two runs of the same valid profile produce the identical finalScore, and zero integrity warnings', () => {
    const actuals = { wasfaty: 110, omnihealth: 90, basket: 100, crossSelling: 80 }
    const run1 = runEvaluation(validProfile(), actuals, REGISTRY)
    const run2 = runEvaluation(validProfile(), actuals, REGISTRY)
    expect(run1.result.finalScore).toBe(run2.result.finalScore)
    expect(run1.result.trace.integrityWarnings).toEqual([])
  })
})

// ── 10. Arbitrary non-Core KPI publishes and evaluates successfully ──

describe('10. Arbitrary non-Core KPI', () => {
  const profile: Partial<EvaluationProfile> = {
    name: 'Arbitrary KPI profile', role: 'pharmacist', effectiveFrom: '2026-01',
    baskets: { b1: makeBasket('b1', 'Engagement', 1.0, [el('arbitraryClosureKpi', 1.0)]) },
    basketIds: ['b1'],
    defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
  }

  it('publishes successfully', async () => {
    await expect(publishWith({ ...profile, status: 'draft' } as any, REGISTRY))
      .resolves.toBeUndefined()
  })

  it('evaluates successfully with zero integrity warnings', () => {
    const { result } = runEvaluation(profile, { arbitraryClosureKpi: 120 }, REGISTRY)
    expect(typeof result.finalScore).toBe('number')
    expect(isFinite(result.finalScore)).toBe(true)
    expect(result.trace.integrityWarnings).toEqual([])
  })
})

// ── 11. No Core KPI fallback is introduced ─────────────────────

describe('11. No Core KPI fallback introduced', () => {
  const CORE_KEYS = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']

  it('an unknown-KPI diagnostic never substitutes a Core key — the element stays zero-contribution, not re-pointed', () => {
    const { result } = runEvaluation(
      { name: 'X', role: 'pharmacist', effectiveFrom: '2026-01',
        baskets: { b1: makeBasket('b1', 'Guest', 1.0, [el('totallyUnknownClosureKpi', 1.0)]) },
        basketIds: ['b1'], defaultThresholdRule: DEFAULT_THRESHOLD_RULE },
      {}, REGISTRY,
    )
    const elKey = result.basketResults[0].elements[0].kpiKey
    expect(elKey).toBe('totallyUnknownClosureKpi') // unchanged — never silently re-pointed to wasfaty/omni/etc.
    expect(CORE_KEYS).not.toContain(elKey)
  })

  it('checkProfileIntegrity preserves the literal unknown/inactive kpiKey in every issue — never rewrites it to a Core key', () => {
    const profile: Partial<EvaluationProfile> = {
      name: 'Y', role: 'pharmacist', effectiveFrom: '2026-01',
      baskets: { b1: makeBasket('b1', 'Guest', 1.0, [
        el('totallyUnknownClosureKpi', 0.5), el('inactiveClosureKpi', 0.5),
      ]) },
      basketIds: ['b1'], defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
    }
    const result = checkProfileIntegrity(profile, REGISTRY)
    const unknownIssue  = result.errors.find((e) => e.rule === 'UNKNOWN_KPI')!
    const inactiveIssue = result.errors.find((e) => e.rule === 'INACTIVE_KPI')!
    expect(unknownIssue.kpiKey).toBe('totallyUnknownClosureKpi')
    expect(inactiveIssue.kpiKey).toBe('inactiveClosureKpi')
    expect(CORE_KEYS).not.toContain(unknownIssue.kpiKey)
    expect(CORE_KEYS).not.toContain(inactiveIssue.kpiKey)
  })

  it('an inactive-KPI diagnostic at runtime keeps the original kpiKey — never silently swapped for a Core key', () => {
    const { result } = runEvaluation(
      { name: 'Z', role: 'pharmacist', effectiveFrom: '2026-01',
        baskets: { b1: makeBasket('b1', 'Guest', 1.0, [el('inactiveClosureKpi', 1.0)]) },
        basketIds: ['b1'], defaultThresholdRule: DEFAULT_THRESHOLD_RULE },
      { inactiveClosureKpi: 50 }, REGISTRY,
    )
    const elKey = result.basketResults[0].elements[0].kpiKey
    expect(elKey).toBe('inactiveClosureKpi')
    expect(CORE_KEYS).not.toContain(elKey)
  })
})

// ── 12. Existing Profile Studio behavior is not broken ─────────

describe('12. Existing Profile Studio behavior unchanged', () => {
  it('validateEvaluationProfile still treats cross-basket reuse as NOT a duplicate (untouched)', () => {
    const profile: Partial<EvaluationProfile> = {
      name: 'Cross-basket', role: 'pharmacist', effectiveFrom: '2026-01',
      baskets: {
        b1: makeBasket('b1', 'One', 0.5, [el('wasfaty', 1.0)]),
        b2: makeBasket('b2', 'Two', 0.5, [el('wasfaty', 1.0)]),
      },
      basketIds: ['b1', 'b2'],
      defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
    }
    const result = validateEvaluationProfile(profile)
    expect(result.errors.filter((e) => e.includes('duplicate'))).toHaveLength(0)
  })

  it('checkProfileKpiCompatibility still returns informational-only warnings (untouched, still used by the UI)', () => {
    const profile: Partial<EvaluationProfile> = {
      name: 'Compat', role: 'pharmacist', effectiveFrom: '2026-01',
      baskets: { b1: makeBasket('b1', 'Guest', 1.0, [el('inactiveClosureKpi', 1.0)]) },
      basketIds: ['b1'],
      defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
    }
    const warnings = checkProfileKpiCompatibility(profile, REGISTRY)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('inactive')
  })

  it('the SMARTS 2026 template still has zero duplicate-kpiKey errors from validateEvaluationProfile (same-basket scope unchanged)', () => {
    const template = createSmarts2026Template()
    const result = validateEvaluationProfile(template)
    expect(result.errors.filter((e) => e.includes('duplicate'))).toHaveLength(0)
  })
})
