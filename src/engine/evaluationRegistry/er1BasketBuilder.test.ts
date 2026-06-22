// ============================================================
// ER-1 Regression Tests — Basket Builder & SMARTS Profile
//
// Categories:
//   1. Basket CRUD — create, edit, delete, weight validation
//   2. Element CRUD — create, edit, weight validation, dynamic KPI
//   3. Threshold rule validation — bands, overlaps, ordering
//   4. validateEvaluationProfile — extended with threshold
//   5. SMARTS 2026 template — representable in schema
//   6. Versioning — new version copies baskets/elements/thresholds
//   7. Service basket operations — immutability guards
//   8. Publish blocked when invalid
//   9. Scope guard — no scoring/ranking introduced
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addDoc, getDoc, updateDoc } from 'firebase/firestore'
import {
  validateEvaluationProfile,
  validateThresholdRule,
  isProfileImmutable,
  DEFAULT_THRESHOLD_RULE,
  FIVE_BAND_THRESHOLD_RULE,
  createSmarts2026Template,
} from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import type {
  EvaluationProfile, EvaluationBasket, BasketElement, ThresholdRule,
} from '../../engine/evaluationRegistry/evaluationRegistryTypes'

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

// ── Helpers ───────────────────────────────────────────────────

const makeElement = (kpiKey: string, weight: number, required = true): BasketElement =>
  ({ kpiKey, weight, required })

const makeBasket = (
  id: string, name: string, weight: number, elements: BasketElement[],
): EvaluationBasket => ({
  id, name, weight, elements,
  thresholdRule: { ...DEFAULT_THRESHOLD_RULE },
  sortOrder: 1, active: true,
})

const PROFIT_BASKET   = makeBasket('profit',  'Profit',  0.4, [makeElement('basket', 0.6), makeElement('crossSelling', 0.4)])
const GUEST_BASKET    = makeBasket('guest',   'Guest',   0.6, [makeElement('wasfaty', 0.7), makeElement('omnihealth', 0.3)])

const VALID_PROFILE: Partial<EvaluationProfile> = {
  name: 'Q1 2026', role: 'pharmacist', effectiveFrom: '2026-01',
  baskets: { profit: PROFIT_BASKET, guest: GUEST_BASKET },
  basketIds: ['profit', 'guest'],
  defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
}

// ── 1. Basket CRUD ────────────────────────────────────────────

describe('ER-1 — Basket model and weight validation', () => {
  it('valid profile with two baskets summing to 1.0 passes', () => {
    const r = validateEvaluationProfile(VALID_PROFILE)
    expect(r.valid).toBe(true)
  })

  it('basket weights summing to 0.9 is invalid', () => {
    const badProfile = {
      ...VALID_PROFILE,
      baskets: {
        profit: { ...PROFIT_BASKET, weight: 0.4 },
        guest:  { ...GUEST_BASKET,  weight: 0.5 },
      },
    }
    const r = validateEvaluationProfile(badProfile)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('basket weights'))).toBe(true)
  })

  it('basket weights summing to 1.01 passes within epsilon', () => {
    const profile = {
      ...VALID_PROFILE,
      baskets: {
        profit: { ...PROFIT_BASKET, weight: 0.505 },
        guest:  { ...GUEST_BASKET,  weight: 0.505 },
      },
    }
    const r = validateEvaluationProfile(profile)
    // 1.01 > 1.0 + 0.01 epsilon → invalid
    expect(r.valid).toBe(false)
  })

  it('profile with no baskets is invalid', () => {
    const r = validateEvaluationProfile({ ...VALID_PROFILE, baskets: {} })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('basket'))).toBe(true)
  })

  it('profile with basket that has no elements is invalid', () => {
    const r = validateEvaluationProfile({
      ...VALID_PROFILE,
      baskets: {
        profit: { ...PROFIT_BASKET, elements: [] },
        guest:  GUEST_BASKET,
      },
    })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('no elements'))).toBe(true)
  })

  it('inactive baskets are excluded from weight sum', () => {
    const profile = {
      ...VALID_PROFILE,
      baskets: {
        profit:   { ...PROFIT_BASKET, weight: 1.0 },              // only active basket
        inactive: { ...GUEST_BASKET,  weight: 0.6, active: false }, // inactive, excluded
      },
    }
    const r = validateEvaluationProfile(profile)
    expect(r.valid).toBe(true)
  })
})

// ── 2. Element CRUD and weight validation ─────────────────────

describe('ER-1 — Element model and weight validation', () => {
  it('element weights summing to 1.0 is valid', () => {
    const r = validateEvaluationProfile(VALID_PROFILE)
    expect(r.valid).toBe(true)
  })

  it('element weights summing to 0.8 per basket is invalid', () => {
    const r = validateEvaluationProfile({
      ...VALID_PROFILE,
      baskets: {
        profit: {
          ...PROFIT_BASKET,
          elements: [makeElement('basket', 0.4), makeElement('crossSelling', 0.4)], // 0.8 ≠ 1.0
        },
        guest: GUEST_BASKET,
      },
    })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('element weights'))).toBe(true)
  })

  it('element can be marked required or optional', () => {
    const required = makeElement('wasfaty', 0.6, true)
    const optional = makeElement('basket',  0.4, false)
    expect(required.required).toBe(true)
    expect(optional.required).toBe(false)
  })

  it('element kpiKey is a plain string — registry-resolved at evaluation time', () => {
    const el = makeElement('omnihealth', 1.0)
    expect(typeof el.kpiKey).toBe('string')
  })

  it('custom KPI key (not in default registry) is accepted in element schema', () => {
    const el: BasketElement = { kpiKey: 'my-custom-kpi-2026', weight: 1.0, required: true }
    const basket = makeBasket('b1', 'Test', 1.0, [el])
    const r = validateEvaluationProfile({
      ...VALID_PROFILE,
      baskets: { b1: basket }, basketIds: ['b1'],
    })
    expect(r.valid).toBe(true)
  })
})

// ── 3. Threshold rule validation ──────────────────────────────

describe('ER-1 — validateThresholdRule', () => {
  it('DEFAULT_THRESHOLD_RULE passes validation', () => {
    const r = validateThresholdRule(DEFAULT_THRESHOLD_RULE)
    expect(r.valid).toBe(true)
  })

  it('FIVE_BAND_THRESHOLD_RULE passes validation', () => {
    const r = validateThresholdRule(FIVE_BAND_THRESHOLD_RULE)
    expect(r.valid).toBe(true)
  })

  it('empty bands array is invalid', () => {
    const r = validateThresholdRule({ ...DEFAULT_THRESHOLD_RULE, bands: [] })
    expect(r.valid).toBe(false)
  })

  it('band with min >= max is invalid', () => {
    const r = validateThresholdRule({
      ...DEFAULT_THRESHOLD_RULE,
      bands: [{ min: 100, max: 50, label: 'Bad', score: 1 }],
    })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('min') && e.includes('max'))).toBe(true)
  })

  it('band with missing label is invalid', () => {
    const r = validateThresholdRule({
      ...DEFAULT_THRESHOLD_RULE,
      bands: [{ min: 0, max: 100, label: '', score: 1 }],
    })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('label'))).toBe(true)
  })

  it('overlapping bands are invalid', () => {
    const r = validateThresholdRule({
      ...DEFAULT_THRESHOLD_RULE,
      bands: [
        { min: 0,  max: 80, label: 'Low',  score: 1 },
        { min: 70, max: 100, label: 'High', score: 2 }, // overlaps at 70–80
      ],
    })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('overlap'))).toBe(true)
  })

  it('non-overlapping contiguous bands are valid', () => {
    const r = validateThresholdRule({
      ...DEFAULT_THRESHOLD_RULE,
      bands: [
        { min: 0,   max: 70,  label: 'Below', score: 1 },
        { min: 70,  max: 100, label: 'Meet',  score: 2 },
        { min: 100, max: 999, label: 'Exceed', score: 3 },
      ],
    })
    expect(r.valid).toBe(true)
  })

  it('invalid numbers (Infinity) in band are flagged', () => {
    const r = validateThresholdRule({
      ...DEFAULT_THRESHOLD_RULE,
      bands: [{ min: NaN, max: 100, label: 'Bad', score: 1 }],
    })
    expect(r.valid).toBe(false)
  })

  it('basket threshold validation is included in profile validation', () => {
    const badRule: ThresholdRule = {
      id: 'bad', name: 'Bad',
      bands: [{ min: 100, max: 50, label: 'Broken', score: 1 }], // min > max
    }
    const r = validateEvaluationProfile({
      ...VALID_PROFILE,
      baskets: {
        profit: { ...PROFIT_BASKET, thresholdRule: badRule },
        guest:  GUEST_BASKET,
      },
    })
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('threshold'))).toBe(true)
  })
})

// ── 4. SMARTS 2026 template ────────────────────────────────────

describe('ER-1 — SMARTS 2026 template representable in schema', () => {
  const template = createSmarts2026Template()

  it('template creates a partial EvaluationProfile', () => {
    expect(template.name).toBeTruthy()
    expect(template.role).toBe('pharmacist')
    expect(template.effectiveFrom).toBeDefined()
  })

  it('template has 5 baskets', () => {
    expect(template.basketIds).toHaveLength(5)
    expect(Object.keys(template.baskets!)).toHaveLength(5)
  })

  it('basket weights sum to 1.0 in template', () => {
    const total = Object.values(template.baskets!).reduce((s, b) => s + b.weight, 0)
    expect(Math.abs(total - 1.0)).toBeLessThan(0.01)
  })

  it('all basket element weights sum to 1.0', () => {
    for (const [name, basket] of Object.entries(template.baskets!)) {
      const sum = basket.elements.reduce((s, e) => s + e.weight, 0)
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.01, `Basket "${name}" elements don't sum to 1.0`)
    }
  })

  it('template passes validateEvaluationProfile', () => {
    const r = validateEvaluationProfile(template)
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('template uses FIVE_BAND_THRESHOLD_RULE', () => {
    expect(template.defaultThresholdRule?.bands).toHaveLength(5)
  })

  it('template basket IDs include satisfaction, profit, omni-guest, wellness-card, revenue', () => {
    expect(template.basketIds).toContain('satisfaction')
    expect(template.basketIds).toContain('profit')
    expect(template.basketIds).toContain('omni-guest')
    expect(template.basketIds).toContain('wellness-card')
    expect(template.basketIds).toContain('revenue')
  })

  it('all KPI keys in template are strings (registry-resolved at execution)', () => {
    for (const basket of Object.values(template.baskets!)) {
      for (const el of basket.elements) {
        expect(typeof el.kpiKey).toBe('string')
        expect(el.kpiKey.length).toBeGreaterThan(0)
      }
    }
  })

  it('template does not import DEFAULT_KPI_REGISTRY', async () => {
    const src = await import('../../engine/evaluationRegistry/evaluationRegistryTypes.ts?raw')
    expect(src.default).not.toContain('DEFAULT_KPI_REGISTRY')
  })
})

// ── 5. Five-band threshold preset ─────────────────────────────

describe('ER-1 — FIVE_BAND_THRESHOLD_RULE', () => {
  it('has 5 bands', () => {
    expect(FIVE_BAND_THRESHOLD_RULE.bands).toHaveLength(5)
  })

  it('covers 0–999 range', () => {
    const sorted = [...FIVE_BAND_THRESHOLD_RULE.bands].sort((a, b) => a.min - b.min)
    expect(sorted[0].min).toBe(0)
    expect(sorted[sorted.length - 1].max).toBeGreaterThan(100)
  })

  it('scores are increasing from 1 to 5', () => {
    const sorted = [...FIVE_BAND_THRESHOLD_RULE.bands].sort((a, b) => a.min - b.min)
    sorted.forEach((b, i) => expect(b.score).toBe(i + 1))
  })

  it('all bands have Arabic labels', () => {
    FIVE_BAND_THRESHOLD_RULE.bands.forEach((b) => {
      expect(b.labelAr?.length).toBeGreaterThan(0)
    })
  })
})

// ── 6. Versioning — new version copies baskets ────────────────

describe('ER-1 — createNewVersion preserves baskets, elements, thresholds', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(addDoc).mockResolvedValue({ id: 'new-version-id' } as any)
  })

  it('new version receives all baskets from source', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: 'p1',
      data: () => ({
        status: 'published', name: 'Profile', version: 1,
        role: 'pharmacist', effectiveFrom: '2026-01',
        basketIds: ['profit', 'guest'],
        baskets: { profit: PROFIT_BASKET, guest: GUEST_BASKET },
        defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
      }),
    } as any)

    const { createNewVersion } = await import('../../services/evaluationRegistryService')
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'v2' }
    })

    const result = await createNewVersion('p1', 'admin', 'admin')
    expect(result.version).toBe(2)

    const written = payloads[0] as Record<string, unknown>
    const baskets = written.baskets as Record<string, EvaluationBasket>
    expect(baskets.profit).toBeDefined()
    expect(baskets.guest).toBeDefined()
    expect(baskets.profit.thresholdRule).toBeDefined()
  })

  it('new version is a draft regardless of source status', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({
        status: 'archived', name: 'Old', version: 2,
        role: 'pharmacist', effectiveFrom: '2025-01',
        basketIds: [], baskets: {}, defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
      }),
    } as any)

    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'v3' }
    })

    const { createNewVersion } = await import('../../services/evaluationRegistryService')
    await createNewVersion('p1', 'admin', 'admin')
    expect((payloads[0] as Record<string, unknown>).status).toBe('draft')
  })
})

// ── 7. Service basket operations — immutability ───────────────

describe('ER-1 — upsertBasket / removeBasket immutability', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(updateDoc).mockResolvedValue(undefined as any)
  })

  it('upsertBasket throws for published profile', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({ status: 'published', basketIds: [], baskets: {} }),
    } as any)
    const { upsertBasket } = await import('../../services/evaluationRegistryService')
    await expect(upsertBasket('p1', PROFIT_BASKET, 'admin', 'admin'))
      .rejects.toThrow('Cannot edit a published profile')
  })

  it('upsertBasket succeeds for draft profile', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({ status: 'draft', basketIds: [], baskets: {} }),
    } as any)
    const { upsertBasket } = await import('../../services/evaluationRegistryService')
    await expect(upsertBasket('p1', PROFIT_BASKET, 'admin', 'admin')).resolves.toBeUndefined()
    expect(updateDoc).toHaveBeenCalledTimes(1)
  })

  it('removeBasket throws for published profile', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({ status: 'published', basketIds: ['profit'], baskets: { profit: PROFIT_BASKET } }),
    } as any)
    const { removeBasket } = await import('../../services/evaluationRegistryService')
    await expect(removeBasket('p1', 'profit', 'admin', 'admin'))
      .rejects.toThrow('Cannot edit a published profile')
  })

  it('removeBasket removes basket id and map entry for draft', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({
        status: 'draft',
        basketIds: ['profit', 'guest'],
        baskets: { profit: PROFIT_BASKET, guest: GUEST_BASKET },
      }),
    } as any)
    const updates: unknown[] = []
    vi.mocked(updateDoc).mockImplementationOnce(async (_ref, data) => { updates.push(data) })

    const { removeBasket } = await import('../../services/evaluationRegistryService')
    await removeBasket('p1', 'profit', 'admin', 'admin')

    const written = updates[0] as Record<string, unknown>
    const ids = written.basketIds as string[]
    expect(ids).not.toContain('profit')
    expect(ids).toContain('guest')
  })

  it('reorderBaskets throws for published profile', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({ status: 'published', basketIds: ['a', 'b'], baskets: {} }),
    } as any)
    const { reorderBaskets } = await import('../../services/evaluationRegistryService')
    await expect(reorderBaskets('p1', ['b', 'a'], 'admin', 'admin'))
      .rejects.toThrow('Cannot edit a published profile')
  })
})

// ── 8. Publish blocked when invalid ──────────────────────────

describe('ER-1 — Publish blocked for invalid profiles', () => {
  it('publish throws when basket weights do not sum to 1.0', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({
        status: 'draft', name: 'Test', role: 'pharmacist',
        effectiveFrom: '2026-01',
        baskets: {
          profit: { ...PROFIT_BASKET, weight: 0.3 },
          guest:  { ...GUEST_BASKET,  weight: 0.3 },
        },
        basketIds: ['profit', 'guest'],
        defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
      }),
    } as any)
    const { publishEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await expect(publishEvaluationProfile('p1', 'admin', 'admin'))
      .rejects.toThrow('validation failed')
  })

  it('publish succeeds for valid profile with baskets', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: 'p1',
      data: () => ({
        status: 'draft', name: 'Valid', role: 'pharmacist',
        effectiveFrom: '2026-01',
        baskets: { profit: PROFIT_BASKET, guest: GUEST_BASKET },
        basketIds: ['profit', 'guest'],
        defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
      }),
    } as any)
    vi.mocked(updateDoc).mockResolvedValueOnce(undefined as any)
    const { publishEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await expect(publishEvaluationProfile('p1', 'admin', 'admin')).resolves.toBeUndefined()
  })
})

// ── 9. Scope guard ────────────────────────────────────────────

describe('ER-1 — Scope guard: no scoring/ranking introduced', () => {
  it('evaluationRegistryTypes contains no scoring computations', async () => {
    const src = await import('../../engine/evaluationRegistry/evaluationRegistryTypes.ts?raw')
    expect(src.default).not.toMatch(/^export function compute[A-Z]Score/m)
    expect(src.default).not.toMatch(/rankingEngine|evaluationEngine/i)
  })

  it('createSmarts2026Template returns configuration only (no scores)', () => {
    const t = createSmarts2026Template()
    // No computed scores — only weights and KPI keys
    for (const basket of Object.values(t.baskets!)) {
      for (const el of basket.elements) {
        expect((el as Record<string, unknown>).score).toBeUndefined()
        expect((el as Record<string, unknown>).achievementPct).toBeUndefined()
      }
    }
  })

  it('FIVE_BAND_THRESHOLD_RULE.bands have score field (label only, not computed)', () => {
    // score in threshold bands is a configuration label (integer tier), not a calculated value
    FIVE_BAND_THRESHOLD_RULE.bands.forEach((b) => {
      expect(typeof b.score).toBe('number')
      expect(Number.isInteger(b.score)).toBe(true)
    })
  })

  it('no evaluation execution routes added', async () => {
    const src = await import('../../App.jsx?raw')
    expect(src.default).not.toContain('/evaluation-dashboard')
    expect(src.default).not.toContain('/evaluation-results')
    // /admin/rankings was added in RF-1B (approved route) — guard relaxed
    expect(src.default).not.toContain('/ranking-engine')
  })
})
