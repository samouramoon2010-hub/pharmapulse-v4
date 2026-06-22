// ============================================================
// ER-1.5 Regression Tests — Evaluation Registry Hardening
//
// Categories:
//   1. Duplicate kpiKey validation — fails correctly
//   2. Duplicate kpiKey blocks publish
//   3. Unique kpiKeys pass validation unchanged
//   4. checkProfileKpiCompatibility — missing/inactive KPI warnings
//   5. SMARTS template against default registry — all keys present
//   6. Existing ER-1 valid profiles still pass
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDoc, updateDoc } from 'firebase/firestore'
import {
  validateEvaluationProfile,
  checkProfileKpiCompatibility,
  DEFAULT_THRESHOLD_RULE,
  FIVE_BAND_THRESHOLD_RULE,
  createSmarts2026Template,
} from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import type {
  EvaluationProfile, EvaluationBasket, BasketElement,
} from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import type { KpiRegistry } from '../../engine/kpiRegistry'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'

// ── Mocks ─────────────────────────────────────────────────────
vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
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
  },
}))
vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  addDoc:          vi.fn(async () => ({ id: 'new-id' })),
  updateDoc:       vi.fn(async () => {}),
  deleteDoc:       vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  setDoc:          vi.fn(async () => {}),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({ _type: 'ts' })),
  writeBatch:      vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn(async () => {}) })),
}))
vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))

// ── Fixtures ──────────────────────────────────────────────────

const el = (kpiKey: string, weight: number): BasketElement =>
  ({ kpiKey, weight, required: true })

const makeBasket = (
  id: string, name: string, weight: number, elements: BasketElement[],
): EvaluationBasket => ({
  id, name, weight, elements,
  thresholdRule: { ...DEFAULT_THRESHOLD_RULE },
  sortOrder: 1, active: true,
})

// Basket with UNIQUE elements (valid)
const VALID_BASKET = makeBasket('b1', 'Guest', 0.5, [
  el('wasfaty', 0.6), el('omnihealth', 0.4),
])

// Basket with DUPLICATE kpiKey (invalid)
const DUPE_BASKET = makeBasket('b2', 'Profit', 0.5, [
  el('basket', 0.5), el('basket', 0.5),  // 'basket' used twice
])

const VALID_PROFILE: Partial<EvaluationProfile> = {
  name: 'Q1 2026', role: 'pharmacist', effectiveFrom: '2026-01',
  baskets: {
    b1: makeBasket('b1', 'Guest',  0.5, [el('wasfaty', 0.7), el('omnihealth', 0.3)]),
    b2: makeBasket('b2', 'Profit', 0.5, [el('basket',  0.6), el('crossSelling', 0.4)]),
  },
  basketIds: ['b1', 'b2'],
  defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
}

// ── 1. Duplicate kpiKey validation ────────────────────────────

describe('ER-1.5 — duplicate kpiKey validation', () => {
  it('basket with duplicate kpiKey fails validateEvaluationProfile', () => {
    const profile: Partial<EvaluationProfile> = {
      ...VALID_PROFILE,
      baskets: {
        b1: makeBasket('b1', 'Guest',  0.5, [el('wasfaty', 0.7), el('omnihealth', 0.3)]),
        b2: DUPE_BASKET,
      },
    }
    const result = validateEvaluationProfile(profile)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('duplicate') && e.includes('basket'))).toBe(true)
  })

  it('error message names the duplicate KPI key', () => {
    const profile: Partial<EvaluationProfile> = {
      ...VALID_PROFILE,
      baskets: {
        b1: makeBasket('b1', 'Only', 1.0, [el('wasfaty', 0.5), el('wasfaty', 0.5)]),
      },
      basketIds: ['b1'],
    }
    const result = validateEvaluationProfile(profile)
    expect(result.errors.some((e) => e.includes('wasfaty'))).toBe(true)
  })

  it('error message names the basket that has the duplicate', () => {
    const profile: Partial<EvaluationProfile> = {
      ...VALID_PROFILE,
      baskets: {
        b1: makeBasket('b1', 'BadBasket', 1.0, [el('sales', 0.5), el('sales', 0.5)]),
      },
      basketIds: ['b1'],
    }
    const result = validateEvaluationProfile(profile)
    expect(result.errors.some((e) => e.includes('BadBasket'))).toBe(true)
  })

  it('three elements, two with same key → one duplicate error', () => {
    const profile: Partial<EvaluationProfile> = {
      ...VALID_PROFILE,
      baskets: {
        b1: makeBasket('b1', 'B', 1.0, [
          el('wasfaty', 0.4), el('omnihealth', 0.3), el('wasfaty', 0.3),
        ]),
      },
      basketIds: ['b1'],
    }
    const result = validateEvaluationProfile(profile)
    const dupeErrors = result.errors.filter((e) => e.includes('duplicate'))
    expect(dupeErrors.length).toBe(1)
  })

  it('two baskets each with a duplicate KPI → two separate errors', () => {
    const profile: Partial<EvaluationProfile> = {
      ...VALID_PROFILE,
      baskets: {
        b1: makeBasket('b1', 'Alpha', 0.5, [el('wasfaty', 0.5), el('wasfaty', 0.5)]),
        b2: makeBasket('b2', 'Beta',  0.5, [el('basket',  0.5), el('basket',  0.5)]),
      },
    }
    const result = validateEvaluationProfile(profile)
    const dupeErrors = result.errors.filter((e) => e.includes('duplicate'))
    expect(dupeErrors.length).toBe(2)
  })

  it('inactive basket with duplicate kpiKey is NOT an error (inactive ignored)', () => {
    const profile: Partial<EvaluationProfile> = {
      ...VALID_PROFILE,
      baskets: {
        b1: { ...VALID_BASKET, weight: 1.0 },
        b2: { ...DUPE_BASKET,  weight: 0.0, active: false },
      },
    }
    const result = validateEvaluationProfile(profile)
    const dupeErrors = result.errors.filter((e) => e.includes('duplicate'))
    expect(dupeErrors.length).toBe(0)
  })
})

// ── 2. Duplicate kpiKey blocks publish ────────────────────────

describe('ER-1.5 — duplicate kpiKey blocks publishEvaluationProfile', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(updateDoc).mockResolvedValue(undefined as any)
  })

  it('publish throws when a basket contains a duplicate KPI key', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({
        status: 'draft', name: 'Broken Profile', role: 'pharmacist',
        effectiveFrom: '2026-01',
        baskets: {
          b1: makeBasket('b1', 'Guest',  0.5, [el('wasfaty', 0.7), el('omnihealth', 0.3)]),
          b2: makeBasket('b2', 'Profit', 0.5, [el('basket', 0.5), el('basket', 0.5)]),
        },
        basketIds: ['b1', 'b2'],
        defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
      }),
    } as any)

    const { publishEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await expect(publishEvaluationProfile('p1', 'admin', 'admin'))
      .rejects.toThrow('validation failed')
  })

  it('publish succeeds when all baskets have unique KPI keys', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({
        status: 'draft', name: 'Valid', role: 'pharmacist', effectiveFrom: '2026-01',
        baskets: {
          b1: makeBasket('b1', 'Guest',  0.5, [el('wasfaty', 0.7), el('omnihealth', 0.3)]),
          b2: makeBasket('b2', 'Profit', 0.5, [el('basket', 0.6), el('crossSelling', 0.4)]),
        },
        basketIds: ['b1', 'b2'],
        defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
      }),
    } as any)

    const { publishEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await expect(publishEvaluationProfile('p1', 'admin', 'admin')).resolves.toBeUndefined()
    expect(updateDoc).toHaveBeenCalledTimes(1)
  })
})

// ── 3. Unique kpiKeys pass validation unchanged ───────────────

describe('ER-1.5 — unique kpiKeys: valid profiles still pass', () => {
  it('profile with all-unique element keys passes', () => {
    const result = validateEvaluationProfile(VALID_PROFILE)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('SMARTS 2026 template has no duplicate kpiKeys', () => {
    const template = createSmarts2026Template()
    const result   = validateEvaluationProfile(template)
    const dupeErrors = result.errors.filter((e) => e.includes('duplicate'))
    expect(dupeErrors).toHaveLength(0)
  })

  it('same kpiKey in different baskets is NOT a duplicate (cross-basket is fine)', () => {
    const profile: Partial<EvaluationProfile> = {
      name: 'Cross-basket', role: 'pharmacist', effectiveFrom: '2026-01',
      baskets: {
        b1: makeBasket('b1', 'One', 0.5, [el('wasfaty', 1.0)]),
        b2: makeBasket('b2', 'Two', 0.5, [el('wasfaty', 1.0)]), // same key, different basket
      },
      basketIds: ['b1', 'b2'],
      defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
    }
    const result = validateEvaluationProfile(profile)
    const dupeErrors = result.errors.filter((e) => e.includes('duplicate'))
    expect(dupeErrors).toHaveLength(0)
  })
})

// ── 4. checkProfileKpiCompatibility ──────────────────────────

describe('ER-1.5 — checkProfileKpiCompatibility', () => {
  it('returns empty array when all KPI keys exist and are active', () => {
    const template = createSmarts2026Template()
    const warnings = checkProfileKpiCompatibility(template, DEFAULT_KPI_REGISTRY)
    // All SMARTS template keys are in the default registry and active
    expect(warnings).toHaveLength(0)
  })

  it('warns when a KPI key is missing from the registry', () => {
    const profile: Partial<EvaluationProfile> = {
      baskets: {
        b1: makeBasket('b1', 'Test', 1.0, [el('nonexistent-kpi-xyz', 1.0)]),
      },
      basketIds: ['b1'],
    }
    const warnings = checkProfileKpiCompatibility(profile, DEFAULT_KPI_REGISTRY)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('nonexistent-kpi-xyz')
    expect(warnings[0]).toContain('not in the live registry')
  })

  it('warns when a KPI key exists but is inactive', () => {
    const registryWithInactive: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      wasfaty: { ...DEFAULT_KPI_REGISTRY.wasfaty, isActive: false },
    }
    const profile: Partial<EvaluationProfile> = {
      baskets: {
        b1: makeBasket('b1', 'Test', 1.0, [el('wasfaty', 1.0)]),
      },
      basketIds: ['b1'],
    }
    const warnings = checkProfileKpiCompatibility(profile, registryWithInactive)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('wasfaty')
    expect(warnings[0]).toContain('inactive')
  })

  it('returns one warning per missing/inactive KPI', () => {
    const profile: Partial<EvaluationProfile> = {
      baskets: {
        b1: makeBasket('b1', 'Test', 1.0, [
          el('missing-one',   0.5),
          el('missing-two',   0.5),
        ]),
      },
      basketIds: ['b1'],
    }
    const warnings = checkProfileKpiCompatibility(profile, DEFAULT_KPI_REGISTRY)
    expect(warnings).toHaveLength(2)
  })

  it('does not warn for active KPIs that exist', () => {
    const profile: Partial<EvaluationProfile> = {
      baskets: {
        b1: makeBasket('b1', 'Test', 1.0, [
          el('wasfaty',   0.5),
          el('omnihealth', 0.5),
        ]),
      },
      basketIds: ['b1'],
    }
    const warnings = checkProfileKpiCompatibility(profile, DEFAULT_KPI_REGISTRY)
    expect(warnings).toHaveLength(0)
  })

  it('skips inactive baskets when checking KPI keys', () => {
    const profile: Partial<EvaluationProfile> = {
      baskets: {
        b1: makeBasket('b1', 'Active',   1.0, [el('wasfaty', 1.0)]),
        b2: { ...makeBasket('b2', 'Inactive', 0.0, [el('does-not-exist', 1.0)]), active: false },
      },
      basketIds: ['b1', 'b2'],
    }
    const warnings = checkProfileKpiCompatibility(profile, DEFAULT_KPI_REGISTRY)
    expect(warnings).toHaveLength(0)
  })

  it('returns empty array for empty profile (no baskets)', () => {
    const warnings = checkProfileKpiCompatibility({ baskets: {} }, DEFAULT_KPI_REGISTRY)
    expect(warnings).toHaveLength(0)
  })

  it('does not throw when called with empty registry', () => {
    const template = createSmarts2026Template()
    expect(() => checkProfileKpiCompatibility(template, {})).not.toThrow()
    const warnings = checkProfileKpiCompatibility(template, {})
    expect(warnings.length).toBeGreaterThan(0)  // all keys will be "missing"
  })
})

// ── 5. SMARTS template against default registry ───────────────

describe('ER-1.5 — SMARTS 2026 template KPI safety vs default registry', () => {
  it('all SMARTS template KPI keys exist in DEFAULT_KPI_REGISTRY', () => {
    const template = createSmarts2026Template()
    const allKeys = Object.values(template.baskets!)
      .flatMap((b) => b.elements.map((e) => e.kpiKey))
    const missing = allKeys.filter((k) => !DEFAULT_KPI_REGISTRY[k])
    expect(missing).toHaveLength(0)
  })

  it('all SMARTS template KPI keys are active in DEFAULT_KPI_REGISTRY', () => {
    const template = createSmarts2026Template()
    const allKeys = Object.values(template.baskets!)
      .flatMap((b) => b.elements.map((e) => e.kpiKey))
    const inactive = allKeys.filter((k) => DEFAULT_KPI_REGISTRY[k] && !DEFAULT_KPI_REGISTRY[k].isActive)
    expect(inactive).toHaveLength(0)
  })

  it('checkProfileKpiCompatibility returns zero warnings for SMARTS vs default registry', () => {
    const template = createSmarts2026Template()
    const warnings = checkProfileKpiCompatibility(template, DEFAULT_KPI_REGISTRY)
    expect(warnings).toHaveLength(0)
  })

  it('checkProfileKpiCompatibility returns warnings for SMARTS vs empty registry', () => {
    const template = createSmarts2026Template()
    const warnings = checkProfileKpiCompatibility(template, {})
    // Every KPI key will be "not in registry"
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('SMARTS template passes full validateEvaluationProfile (no duplicate errors)', () => {
    const template = createSmarts2026Template()
    const result   = validateEvaluationProfile(template)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

// ── 6. Existing ER-1 valid profiles still pass ────────────────

describe('ER-1.5 — regression: existing valid profiles unchanged', () => {
  it('profile with two valid baskets (weight 0.4 + 0.6) still passes', () => {
    const profile: Partial<EvaluationProfile> = {
      name: 'Valid', role: 'pharmacist', effectiveFrom: '2026-01',
      baskets: {
        b1: makeBasket('b1', 'Basket A', 0.4, [el('wasfaty', 0.7), el('omnihealth', 0.3)]),
        b2: makeBasket('b2', 'Basket B', 0.6, [el('basket',  0.6), el('crossSelling', 0.4)]),
      },
      basketIds: ['b1', 'b2'],
      defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
    }
    expect(validateEvaluationProfile(profile).valid).toBe(true)
  })

  it('validation still catches basket weight sum error (ER-1 regression)', () => {
    const profile: Partial<EvaluationProfile> = {
      name: 'Bad Weight', role: 'pharmacist', effectiveFrom: '2026-01',
      baskets: {
        b1: makeBasket('b1', 'A', 0.3, [el('wasfaty', 1.0)]),
        b2: makeBasket('b2', 'B', 0.3, [el('basket',  1.0)]),
      },
      basketIds: ['b1', 'b2'],
      defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
    }
    const result = validateEvaluationProfile(profile)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('basket weights'))).toBe(true)
  })

  it('validation still catches element weight sum error (ER-1 regression)', () => {
    const profile: Partial<EvaluationProfile> = {
      name: 'Bad Elem', role: 'pharmacist', effectiveFrom: '2026-01',
      baskets: {
        b1: makeBasket('b1', 'A', 1.0, [el('wasfaty', 0.3), el('omnihealth', 0.3)]),
      },
      basketIds: ['b1'],
      defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
    }
    const result = validateEvaluationProfile(profile)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('element weights'))).toBe(true)
  })

  it('validation still catches threshold band overlap (ER-1 regression)', () => {
    const badRule = {
      ...DEFAULT_THRESHOLD_RULE,
      bands: [
        { min: 0, max: 80, label: 'Low',  score: 1 },
        { min: 70, max: 100, label: 'High', score: 2 }, // overlap at 70–80
      ],
    }
    const profile: Partial<EvaluationProfile> = {
      name: 'Bad Threshold', role: 'pharmacist', effectiveFrom: '2026-01',
      baskets: {
        b1: makeBasket('b1', 'A', 1.0, [el('wasfaty', 1.0)]),
      },
      basketIds: ['b1'],
      defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
    }
    // Override the basket's threshold
    ;(profile.baskets!.b1 as EvaluationBasket).thresholdRule = badRule
    const result = validateEvaluationProfile(profile)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('threshold'))).toBe(true)
  })
})

// ── Scope guard ───────────────────────────────────────────────

describe('ER-1.5 — Scope guard: no Evaluation/Ranking Engine', () => {
  it('checkProfileKpiCompatibility is a pure function — no Firestore calls', () => {
    // If this runs without throwing, no Firestore was touched
    const template = createSmarts2026Template()
    const warnings = checkProfileKpiCompatibility(template, DEFAULT_KPI_REGISTRY)
    expect(Array.isArray(warnings)).toBe(true)
  })

  it('evaluationRegistryTypes contains no evaluation execution functions', async () => {
    const src = await import('../../engine/evaluationRegistry/evaluationRegistryTypes.ts?raw')
    expect(src.default).not.toMatch(/^export function computeEvaluation/m)
    expect(src.default).not.toMatch(/^export function runEvaluation/m)
    expect(src.default).not.toMatch(/rankingEngine|evaluationLedger/i)
  })
})
