// ============================================================
// ER-2A Regression Tests — Evaluation Engine + Ledger
//
// Categories:
//   1.  Threshold band matching
//   2.  Element scoring — actual/target/achievement/band
//   3.  Basket scoring — aggregate + validity
//   4.  Final score + rating
//   5.  Missing KPI handling
//   6.  Personal target override + fallback
//   7.  Branch target fallback
//   8.  Registry alias resolution (omnihealth → omni)
//   9.  Dynamic KPI support + no KPI_KEYS/KPI_WEIGHTS usage
//  10.  Boundary values + zero target
//  11.  Historical reproducibility (deterministic)
//  12.  Ledger write shape
//  13.  Firestore rules simulation
//  14.  Scope guard — no ranking/coaching
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addDoc, getDoc } from 'firebase/firestore'
import {
  matchThresholdBand,
  runEvaluation,
} from '../../engine/evaluationEngine/evaluationEngine'
import type {
  EvaluationEngineInput,
} from '../../engine/evaluationEngine/evaluationEngineTypes'
import type { EvaluationProfile, EvaluationBasket }
  from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import { DEFAULT_THRESHOLD_RULE, FIVE_BAND_THRESHOLD_RULE }
  from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'

// ── Mocks ─────────────────────────────────────────────────────
vi.mock('../../services/firebase', () => ({
  db: {},
  COL: {
    USERS: 'users', PHARMACIES: 'pharmacies', KPI_ENTRIES: 'kpi_entries',
    TARGETS: 'targets', AUDIT_LOGS: 'audit_logs', NOTIFICATIONS: 'notifications',
    LEADERBOARD: 'leaderboard', KPI_REGISTRY: 'kpi_registry',
    DAILY_SUMMARIES: 'daily_summaries', MONTHLY_SUMMARIES: 'monthly_summaries',
    FORECAST_SNAPSHOTS: 'forecast_snapshots', RISK_SNAPSHOTS: 'risk_snapshots',
    RANKING_HISTORY: 'ranking_history', STAGING_ENTRIES: 'staging_entries',
    DISTRICTS: 'districts', REGIONS: 'regions',
    PERSONAL_TARGETS: 'personal_targets',
    EVALUATION_PROFILES: 'evaluation_profiles',
    EVALUATION_RESULTS: 'evaluation_results',
  },
}))
vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  addDoc:          vi.fn(async () => ({ id: 'auto-ledger-id' })),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
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

// ── Fixtures ──────────────────────────────────────────────────

const MONTH = '2026-01'
const UID   = 'uid-alice'
const PID   = 'ph-001'

// Minimal published profile with two baskets (weights sum to 1.0)
const PROFIT_BASKET: EvaluationBasket = {
  id: 'profit', name: 'Profit Basket', weight: 0.4, active: true, sortOrder: 1,
  elements: [
    { kpiKey: 'basket', weight: 0.6, required: true },
    { kpiKey: 'crossSelling', weight: 0.4, required: false },
  ],
  thresholdRule: { ...DEFAULT_THRESHOLD_RULE },
}

const GUEST_BASKET: EvaluationBasket = {
  id: 'guest', name: 'Guest Basket', weight: 0.6, active: true, sortOrder: 2,
  elements: [
    { kpiKey: 'wasfaty', weight: 0.7, required: true },
    { kpiKey: 'omnihealth', weight: 0.3, required: false },
  ],
  thresholdRule: { ...DEFAULT_THRESHOLD_RULE },
}

const PROFILE: EvaluationProfile = {
  id: 'p1', name: 'Test Profile', role: 'pharmacist',
  version: 1, status: 'published',
  effectiveFrom: '2026-01', effectiveTo: null,
  basketIds: ['profit', 'guest'],
  baskets: { profit: PROFIT_BASKET, guest: GUEST_BASKET },
  defaultThresholdRule: { ...DEFAULT_THRESHOLD_RULE },
  createdBy: null, createdAt: null, updatedAt: null,
  publishedAt: null, archivedAt: null, previousVersionId: null,
}

// kpiActuals keyed by engineKey
const FULL_ACTUALS: Record<string, number> = {
  basket:       750,    // 750 / 1000 = 75% → Meet Expectation (band score 2)
  crossSelling: 600,    // 600 / 600  = 100% → Exceed Expectation (band score 3)
  wasfaty:      75000,  // 75000 / 100000 = 75% → Meet Expectation (band score 2)
  omni:         450,    // 450 / 600 = 75% → Meet Expectation (band score 2)
}

const PERSONAL_TARGET = {
  targets: {
    basketTarget:    1000,
    crossSellTarget: 600,
    wasfatyTarget:   100000,
    omniTarget:      600,
  },
}

const BASE_INPUT: EvaluationEngineInput = {
  userId:      UID,
  pharmacyId:  PID,
  month:       MONTH,
  role:        'pharmacist',
  profile:     PROFILE,
  kpiActuals:  { ...FULL_ACTUALS },
  personalTarget: { ...PERSONAL_TARGET } as any,
  branchTarget:   null,
  registry:    DEFAULT_KPI_REGISTRY,
}

// ── 1. Threshold band matching ────────────────────────────────

describe('ER-2A — matchThresholdBand', () => {
  it('matches first band for 0%', () => {
    const b = matchThresholdBand(0, DEFAULT_THRESHOLD_RULE)
    expect(b.label).toBe('Below Expectation')
    expect(b.score).toBe(1)
  })

  it('matches exact lower boundary (69.99 → Below)', () => {
    const b = matchThresholdBand(69.99, DEFAULT_THRESHOLD_RULE)
    expect(b.label).toBe('Below Expectation')
  })

  it('matches exact upper boundary of first band (70 → Meet, not Below)', () => {
    const b = matchThresholdBand(70, DEFAULT_THRESHOLD_RULE)
    expect(b.label).toBe('Meet Expectation')
  })

  it('matches middle band at 85%', () => {
    const b = matchThresholdBand(85, DEFAULT_THRESHOLD_RULE)
    expect(b.label).toBe('Meet Expectation')
    expect(b.score).toBe(2)
  })

  it('matches last band as open-ended (100 → Exceed)', () => {
    const b = matchThresholdBand(100, DEFAULT_THRESHOLD_RULE)
    expect(b.label).toBe('Exceed Expectation')
    expect(b.score).toBe(3)
  })

  it('matches last band for values far above (500% → last band)', () => {
    const b = matchThresholdBand(500, DEFAULT_THRESHOLD_RULE)
    expect(b.label).toBe('Exceed Expectation')
  })

  it('does NOT depend on max=999 sentinel — still matches last band at 1000%', () => {
    const ruleWith999 = { ...DEFAULT_THRESHOLD_RULE }
    const b = matchThresholdBand(1000, ruleWith999)
    // Last band should match regardless of its max value
    expect(b.score).toBe(3)
  })

  it('five-band: 115% maps to fifth band (Significant Exceed)', () => {
    const b = matchThresholdBand(115, FIVE_BAND_THRESHOLD_RULE)
    expect(b.label).toBe('Significant Exceed Expectation')
    expect(b.score).toBe(5)
  })

  it('five-band: 95% maps to third band (Meet)', () => {
    const b = matchThresholdBand(95, FIVE_BAND_THRESHOLD_RULE)
    expect(b.label).toBe('Meet Expectation')
    expect(b.score).toBe(3)
  })

  it('returns fallback band for empty bands array', () => {
    const b = matchThresholdBand(85, { ...DEFAULT_THRESHOLD_RULE, bands: [] })
    expect(b.score).toBe(0)
  })
})

// ── 2. Element scoring ────────────────────────────────────────

describe('ER-2A — element scoring via runEvaluation', () => {
  it('element actual comes from kpiActuals[engineKey]', () => {
    const result = runEvaluation(BASE_INPUT)
    const wasfatyEl = result.basketResults
      .find((b) => b.basketId === 'guest')!
      .elements.find((e) => e.kpiKey === 'wasfaty')!
    expect(wasfatyEl.actual).toBe(75000)
  })

  it('element achievement = actual / target × 100', () => {
    const result = runEvaluation(BASE_INPUT)
    const wasfatyEl = result.basketResults
      .find((b) => b.basketId === 'guest')!
      .elements.find((e) => e.kpiKey === 'wasfaty')!
    expect(wasfatyEl.achievementPct).toBeCloseTo(75, 1)
  })

  it('element weightedScore = bandScore × element.weight', () => {
    const result = runEvaluation(BASE_INPUT)
    const wasfatyEl = result.basketResults
      .find((b) => b.basketId === 'guest')!
      .elements.find((e) => e.kpiKey === 'wasfaty')!
    // 75% → Meet Expectation → score 2 × weight 0.7 = 1.4
    expect(wasfatyEl.weightedScore).toBeCloseTo(2 * 0.7, 5)
  })

  it('element has correct engineKey and label', () => {
    const result = runEvaluation(BASE_INPUT)
    const omniEl = result.basketResults
      .find((b) => b.basketId === 'guest')!
      .elements.find((e) => e.kpiKey === 'omnihealth')!
    expect(omniEl.engineKey).toBe('omni')  // aliasFor resolution
    expect(typeof omniEl.label).toBe('string')
  })
})

// ── 3. Basket scoring ─────────────────────────────────────────

describe('ER-2A — basket scoring', () => {
  it('basket aggregateAchievementPct is weighted avg of element achievements', () => {
    const result = runEvaluation(BASE_INPUT)
    const guest  = result.basketResults.find((b) => b.basketId === 'guest')!
    // wasfaty: 75% × 0.7 + omni: 75% × 0.3 = 75%
    expect(guest.aggregateAchievementPct).toBeCloseTo(75, 1)
  })

  it('basket weightedScore = basketBandScore × basket.weight', () => {
    const result = runEvaluation(BASE_INPUT)
    const guest  = result.basketResults.find((b) => b.basketId === 'guest')!
    // aggregate 75% → Meet Expectation → score 2 × basket weight 0.6 = 1.2
    expect(guest.weightedScore).toBeCloseTo(2 * 0.6, 5)
  })

  it('basket with all data is valid', () => {
    const result = runEvaluation(BASE_INPUT)
    result.basketResults.forEach((b) => expect(b.isValid).toBe(true))
  })

  it('final score = Σ basket.weightedScore', () => {
    const result = runEvaluation(BASE_INPUT)
    const sumBasketsScore = result.basketResults.reduce((s, b) => s + b.weightedScore, 0)
    expect(result.finalScore).toBeCloseTo(sumBasketsScore, 10)
  })
})

// ── 4. Final score + rating ───────────────────────────────────

describe('ER-2A — final score + rating', () => {
  it('rating is derived from defaultThresholdRule applied to finalScore', () => {
    const result = runEvaluation(BASE_INPUT)
    // finalScore ~ 1.2 + 0.92 = ~2.12 (a weighted bandScore sum)
    // The rating band covers whatever range finalScore falls in
    expect(typeof result.rating).toBe('string')
    expect(result.ratingScore).toBeGreaterThan(0)
  })

  it('status is "complete" when all required KPIs have data', () => {
    const result = runEvaluation(BASE_INPUT)
    expect(result.status).toBe('complete')
  })
})

// ── 5. Missing KPI handling ───────────────────────────────────

describe('ER-2A — missing KPI handling', () => {
  it('optional missing KPI → element zeroed, basket still valid, status partial', () => {
    const input = { ...BASE_INPUT, kpiActuals: { basket: 750, wasfaty: 75000 } }
    // omni and crossSelling are missing; both are optional
    const result = runEvaluation(input)
    const optionalEl = result.basketResults
      .find((b) => b.basketId === 'guest')!
      .elements.find((e) => e.kpiKey === 'omnihealth')!
    expect(optionalEl.actual).toBe(0)
    expect(optionalEl.dataAvailable).toBe(false)
    expect(result.basketResults.find((b) => b.basketId === 'guest')!.isValid).toBe(true)
    expect(result.status).toBe('partial')
  })

  it('required missing KPI → basket invalid, status invalid', () => {
    // wasfaty is required; remove it from actuals
    const input = {
      ...BASE_INPUT,
      kpiActuals: { basket: 750, crossSelling: 600, omni: 450 },
    }
    const result = runEvaluation(input)
    expect(result.basketResults.find((b) => b.basketId === 'guest')!.isValid).toBe(false)
    expect(result.status).toBe('invalid')
  })

  it('missing required KPI captured in trace.missingKpis', () => {
    const input = { ...BASE_INPUT, kpiActuals: { basket: 750, crossSelling: 600 } }
    const result = runEvaluation(input)
    expect(result.trace.missingKpis).toContain('wasfaty')
  })

  it('missing KPI does not cause divide-by-zero or NaN', () => {
    const input = { ...BASE_INPUT, kpiActuals: {} }
    const result = runEvaluation(input)
    expect(isNaN(result.finalScore)).toBe(false)
    expect(isFinite(result.finalScore)).toBe(true)
  })
})

// ── 6. Personal target override ──────────────────────────────

describe('ER-2A — personal target override', () => {
  it('element uses personal target when provided', () => {
    const result = runEvaluation(BASE_INPUT)
    const wasfatyEl = result.basketResults
      .find((b) => b.basketId === 'guest')!
      .elements.find((e) => e.kpiKey === 'wasfaty')!
    expect(wasfatyEl.targetSource).toBe('personal')
    expect(wasfatyEl.target).toBe(100000)
  })

  it('trace.personalTargetUsed is true when personalTarget provided', () => {
    const result = runEvaluation(BASE_INPUT)
    expect(result.trace.personalTargetUsed).toBe(true)
  })

  it('element falls back to branch target when personal field is missing', () => {
    const inputPartialPersonal = {
      ...BASE_INPUT,
      personalTarget: { targets: { wasfatyTarget: 100000 } } as any, // omniTarget missing
      branchTarget:   { pharmacyId: PID, month: MONTH, omniTarget: 800 } as any,
    }
    const result  = runEvaluation(inputPartialPersonal)
    const omniEl  = result.basketResults
      .find((b) => b.basketId === 'guest')!
      .elements.find((e) => e.kpiKey === 'omnihealth')!
    expect(omniEl.targetSource).toBe('branch')
    expect(omniEl.target).toBe(800)
  })
})

// ── 7. Branch target fallback ─────────────────────────────────

describe('ER-2A — branch target fallback', () => {
  it('uses branch target when no personal target', () => {
    const input = {
      ...BASE_INPUT,
      personalTarget: null,
      branchTarget: { pharmacyId: PID, month: MONTH, wasfatyTarget: 120000 } as any,
    }
    const result   = runEvaluation(input)
    const wasfatyEl = result.basketResults
      .find((b) => b.basketId === 'guest')!
      .elements.find((e) => e.kpiKey === 'wasfaty')!
    expect(wasfatyEl.targetSource).toBe('branch')
    expect(wasfatyEl.target).toBe(120000)
  })

  it('target = 0 and source = none when both targets absent', () => {
    const input = { ...BASE_INPUT, personalTarget: null, branchTarget: null }
    const result = runEvaluation(input)
    const wasfatyEl = result.basketResults
      .find((b) => b.basketId === 'guest')!
      .elements.find((e) => e.kpiKey === 'wasfaty')!
    expect(wasfatyEl.targetSource).toBe('none')
    expect(wasfatyEl.target).toBe(0)
    expect(wasfatyEl.achievementPct).toBe(0)
  })

  it('trace.personalTargetUsed is false when personalTarget is null', () => {
    const input = { ...BASE_INPUT, personalTarget: null }
    const result = runEvaluation(input)
    expect(result.trace.personalTargetUsed).toBe(false)
  })
})

// ── 8. Registry alias resolution ─────────────────────────────

describe('ER-2A — registry alias resolution (omnihealth → omni)', () => {
  it('omnihealth kpiKey resolves to engineKey "omni"', () => {
    const result = runEvaluation(BASE_INPUT)
    const omniEl  = result.basketResults
      .find((b) => b.basketId === 'guest')!
      .elements.find((e) => e.kpiKey === 'omnihealth')!
    expect(omniEl.engineKey).toBe('omni')
  })

  it('omni actual read from kpiActuals["omni"] not kpiActuals["omnihealth"]', () => {
    const input = {
      ...BASE_INPUT,
      kpiActuals: { ...FULL_ACTUALS, omnihealth: 9999 },  // wrong key — should be ignored
    }
    const result  = runEvaluation(input)
    const omniEl  = result.basketResults
      .find((b) => b.basketId === 'guest')!
      .elements.find((e) => e.kpiKey === 'omnihealth')!
    expect(omniEl.actual).toBe(FULL_ACTUALS.omni)  // reads 'omni', ignores 'omnihealth'
  })

  it('wasfaty has no alias — engineKey equals kpiKey', () => {
    const result = runEvaluation(BASE_INPUT)
    const wasfatyEl = result.basketResults
      .find((b) => b.basketId === 'guest')!
      .elements.find((e) => e.kpiKey === 'wasfaty')!
    expect(wasfatyEl.engineKey).toBe('wasfaty')
  })

  it('unknown kpiKey (no registry entry) resolves to itself as engineKey', () => {
    const profileWithCustom: EvaluationProfile = {
      ...PROFILE,
      baskets: {
        ...PROFILE.baskets,
        profit: {
          ...PROFIT_BASKET,
          elements: [{ kpiKey: 'myCustomKpi', weight: 1.0, required: false }],
        },
      },
    }
    const result    = runEvaluation({ ...BASE_INPUT, profile: profileWithCustom })
    const customEl  = result.basketResults
      .find((b) => b.basketId === 'profit')!
      .elements.find((e) => e.kpiKey === 'myCustomKpi')!
    expect(customEl.engineKey).toBe('myCustomKpi')
    expect(customEl.dataAvailable).toBe(false)
  })
})

// ── 9. Dynamic KPI support + no KPI_KEYS / KPI_WEIGHTS ───────

describe('ER-2A — dynamic KPI support', () => {
  it('engine weights come from profile baskets, NOT KPI_WEIGHTS', async () => {
    const src = await import('../../engine/evaluationEngine/evaluationEngine.ts?raw')
    // Comments listing what NOT to import are fine; actual imports are not allowed
    expect(src.default).not.toMatch(/^import.*KPI_WEIGHTS/m)
    expect(src.default).not.toMatch(/^import.*KPI_KEYS/m)
    // Must not reference KPI_WEIGHTS or KPI_KEYS as a variable (not just in comments)
    expect(src.default).not.toMatch(/[^/]KPI_WEIGHTS/)
    expect(src.default).not.toMatch(/[^/]KPI_KEYS/)
  })

  it('engine types file does not import KPI_KEYS or KPI_WEIGHTS', async () => {
    const src = await import('../../engine/evaluationEngine/evaluationEngineTypes.ts?raw')
    expect(src.default).not.toMatch(/^import.*KPI_WEIGHTS/m)
    expect(src.default).not.toMatch(/^import.*KPI_KEYS/m)
    // Comment mentions are fine; only variable usage is forbidden
    expect(src.default).not.toMatch(/[^/]KPI_WEIGHTS/)
  })

  it('custom KPI key in basket is evaluated using kpiActuals', () => {
    const customProfile: EvaluationProfile = {
      ...PROFILE,
      baskets: {
        custom: {
          id: 'custom', name: 'Custom', weight: 1.0, active: true, sortOrder: 1,
          elements: [{ kpiKey: 'nps', weight: 1.0, required: true }],
          thresholdRule: { ...DEFAULT_THRESHOLD_RULE },
        },
      },
      basketIds: ['custom'],
    }
    const input = {
      ...BASE_INPUT,
      profile:    customProfile,
      kpiActuals: { nps: 85 },
      personalTarget: { targets: { npsTarget: 80 } } as any,
    }
    const result  = runEvaluation(input)
    const npsEl   = result.basketResults[0].elements[0]
    expect(npsEl.kpiKey).toBe('nps')
    expect(npsEl.achievementPct).toBeCloseTo(106.25, 1)
  })
})

// ── 10. Boundary values + zero target ────────────────────────

describe('ER-2A — boundary values', () => {
  it('achievement = 0 when target = 0 (no division by zero)', () => {
    const input = { ...BASE_INPUT, personalTarget: null, branchTarget: null }
    const result = runEvaluation(input)
    result.basketResults.forEach((basket) =>
      basket.elements.forEach((el) => {
        expect(el.achievementPct).toBe(0)
        expect(isNaN(el.achievementPct)).toBe(false)
      })
    )
  })

  it('achievement = 0 when actual = 0 and target > 0', () => {
    const input = { ...BASE_INPUT, kpiActuals: { basket: 0, crossSelling: 0, wasfaty: 0, omni: 0 } }
    const result = runEvaluation(input)
    result.basketResults.forEach((basket) =>
      basket.elements.forEach((el) => {
        expect(el.achievementPct).toBe(0)
      })
    )
  })

  it('finalScore is non-negative and finite for any valid profile', () => {
    const result = runEvaluation(BASE_INPUT)
    expect(result.finalScore).toBeGreaterThanOrEqual(0)
    expect(isFinite(result.finalScore)).toBe(true)
  })
})

// ── 11. Historical reproducibility ───────────────────────────

describe('ER-2A — historical reproducibility', () => {
  it('same inputs produce identical result (deterministic)', () => {
    const r1 = runEvaluation(BASE_INPUT)
    const r2 = runEvaluation(BASE_INPUT)
    expect(r1.finalScore).toBe(r2.finalScore)
    expect(r1.rating).toBe(r2.rating)
    expect(r1.status).toBe(r2.status)
    expect(r1.basketResults.map((b) => b.weightedScore))
      .toEqual(r2.basketResults.map((b) => b.weightedScore))
  })

  it('changing kpiActuals produces different result (no state mutation)', () => {
    const r1 = runEvaluation(BASE_INPUT)
    const r2 = runEvaluation({ ...BASE_INPUT, kpiActuals: { ...FULL_ACTUALS, wasfaty: 50000 } })
    expect(r1.finalScore).not.toBe(r2.finalScore)
  })

  it('engine does not mutate its input (pure function)', () => {
    const inputCopy = JSON.parse(JSON.stringify(BASE_INPUT))
    runEvaluation(BASE_INPUT)
    // Confirm missingKpis is not leaked back into input
    expect((BASE_INPUT as Record<string, unknown>).missingKpis).toBeUndefined()
    expect(JSON.stringify(BASE_INPUT.kpiActuals)).toBe(JSON.stringify(inputCopy.kpiActuals))
  })
})

// ── 12. Ledger write shape ────────────────────────────────────

describe('ER-2A — ledger write shape', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(addDoc).mockResolvedValue({ id: 'ledger-123' } as any)
  })

  it('writeEvaluationResult calls addDoc once', async () => {
    const result = runEvaluation(BASE_INPUT)
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result, profileSnapshot: PROFILE, personalTarget: null, branchTarget: null, kpiActuals: FULL_ACTUALS, calculatedBy: 'admin' },
      'admin'
    )
    expect(addDoc).toHaveBeenCalledTimes(1)
  })

  it('ledger payload contains profileSnapshot (full copy)', async () => {
    const result    = runEvaluation(BASE_INPUT)
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'l1' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result, profileSnapshot: PROFILE, personalTarget: null, branchTarget: null, kpiActuals: FULL_ACTUALS, calculatedBy: 'admin' },
      'admin'
    )
    const doc = payloads[0] as Record<string, unknown>
    expect(doc.profileSnapshot).toBeDefined()
    expect((doc.profileSnapshot as EvaluationProfile).id).toBe('p1')
  })

  it('ledger payload contains actualsSnapshot', async () => {
    const result    = runEvaluation(BASE_INPUT)
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'l1' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result, profileSnapshot: PROFILE, personalTarget: null, branchTarget: null, kpiActuals: FULL_ACTUALS, calculatedBy: 'admin' },
      'admin'
    )
    const doc = payloads[0] as Record<string, unknown>
    expect(doc.actualsSnapshot).toEqual(FULL_ACTUALS)
  })

  it('ledger payload has sealed = true', async () => {
    const result    = runEvaluation(BASE_INPUT)
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'l1' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result, profileSnapshot: PROFILE, personalTarget: null, branchTarget: null, kpiActuals: FULL_ACTUALS, calculatedBy: 'admin' },
      'admin'
    )
    expect((payloads[0] as Record<string, unknown>).sealed).toBe(true)
  })

  it('ledger payload has recalculationOf = null in ER-2A', async () => {
    const result    = runEvaluation(BASE_INPUT)
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'l1' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result, profileSnapshot: PROFILE, personalTarget: null, branchTarget: null, kpiActuals: FULL_ACTUALS, calculatedBy: 'admin' },
      'admin'
    )
    expect((payloads[0] as Record<string, unknown>).recalculationOf).toBeNull()
  })
})

// ── 13. Firestore rules simulation ───────────────────────────

describe('ER-2A — Firestore rules simulation', () => {
  function canRead(role: string, docUserId: string, docPharmacyId: string, callerUid: string, callerPharmacyId: string): boolean {
    const isAdmin  = role === 'admin'
    const isMgr    = ['admin','manager','branch_manager'].includes(role)
    return isAdmin
      || (isMgr && docPharmacyId === callerPharmacyId)
      || docUserId === callerUid
  }
  function canWrite(role: string): boolean { return role === 'admin' }
  function canUpdate(): boolean { return false }
  function canDelete(): boolean { return false }

  it('admin reads any result', () => {
    expect(canRead('admin', 'u-other', 'ph-999', 'uid-admin', 'ph-000')).toBe(true)
  })

  it('pharmacist reads own result', () => {
    expect(canRead('pharmacist', 'uid-ph', 'ph-001', 'uid-ph', 'ph-001')).toBe(true)
  })

  it('pharmacist blocked from other pharmacist result', () => {
    expect(canRead('pharmacist', 'uid-other', 'ph-001', 'uid-ph', 'ph-001')).toBe(false)
  })

  it('manager reads own branch results', () => {
    expect(canRead('manager', 'uid-ph', 'ph-001', 'uid-mgr', 'ph-001')).toBe(true)
  })

  it('manager blocked from other branch results', () => {
    expect(canRead('manager', 'uid-ph', 'ph-999', 'uid-mgr', 'ph-001')).toBe(false)
  })

  it('branch_manager behaves identically to manager', () => {
    expect(canRead('branch_manager', 'uid-ph', 'ph-001', 'uid-bm', 'ph-001')).toBe(true)
    expect(canRead('branch_manager', 'uid-ph', 'ph-999', 'uid-bm', 'ph-001')).toBe(false)
  })

  it('only admin can create (write)', () => {
    expect(canWrite('admin')).toBe(true)
    expect(canWrite('manager')).toBe(false)
    expect(canWrite('pharmacist')).toBe(false)
  })

  it('update is always false (immutability)', () => {
    expect(canUpdate()).toBe(false)
  })

  it('delete is always false (immutability)', () => {
    expect(canDelete()).toBe(false)
  })

  it('firestore.rules source contains evaluation_results with update/delete false', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain('evaluation_results')
    const block = src.default.match(/match \/evaluation_results\/\{resultId\} \{[\s\S]+?\}/)?.[0] ?? ''
    expect(block).toContain('allow update: if false')
    expect(block).toContain('allow delete: if false')
  })
})

// ── 14. Scope guard ───────────────────────────────────────────

describe('ER-2A — Scope guard: no ranking/coaching', () => {
  it('evaluationEngine.ts has no ranking logic', async () => {
    const src = await import('../../engine/evaluationEngine/evaluationEngine.ts?raw')
    // Comments listing non-goals are fine; actual implementation functions are not allowed
    expect(src.default).not.toMatch(/^export function.*(rank|leaderboard|coaching|percentile)/im)
    expect(src.default).not.toMatch(/computeRank|rankPharmacist|buildLeaderboard/i)
  })

  it('evaluationLedgerService.ts has no ranking logic', async () => {
    const src = await import('../../services/evaluationLedgerService.ts?raw')
    expect(src.default).not.toMatch(/rank|leaderboard|coaching|percentile/i)
  })

  it('no evaluation dashboard or ranking routes added', async () => {
    const src = await import('../../App.jsx?raw')
    // /admin/rankings was added in RF-1B (approved route) — guard relaxed
    expect(src.default).not.toContain('/ranking-engine')
    expect(src.default).not.toContain('/evaluation-dashboard')
    expect(src.default).not.toContain('/leaderboard')
  })

  it('engine is a pure function (no firebase/firestore imports)', async () => {
    const src = await import('../../engine/evaluationEngine/evaluationEngine.ts?raw')
    expect(src.default).not.toContain("from 'firebase/firestore'")
    expect(src.default).not.toContain("from '../../services/firebase'")
  })
})
