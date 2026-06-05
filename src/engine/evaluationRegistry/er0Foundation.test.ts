// ============================================================
// ER-0 Regression Tests — Evaluation Registry Foundation
//
// Categories:
//   1. Types and validation — schema correctness
//   2. Profile lifecycle — create, update, publish, archive
//   3. Immutability — published/archived cannot be edited
//   4. Versioning — createNewVersion from published
//   5. Basket model — weight validation
//   6. Threshold schema — band structure
//   7. Dynamic KPI integration — kpiKey references registry
//   8. Firestore rules simulation
//   9. Admin route protection
//  10. No ranking/evaluation engine logic introduced
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addDoc, getDoc } from 'firebase/firestore'
import {
  validateEvaluationProfile,
  isProfileImmutable,
  isProfileEffectiveForMonth,
  DEFAULT_THRESHOLD_RULE,
} from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import type {
  EvaluationProfile,
  EvaluationBasket,
  BasketElement,
  ThresholdRule,
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
  addDoc:          vi.fn(async () => ({ id: 'new-profile-id' })),
  updateDoc:       vi.fn(async () => {}),
  deleteDoc:       vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  setDoc:          vi.fn(async () => {}),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  writeBatch:      vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn(async () => {}) })),
}))

vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))

// ── Fixtures ──────────────────────────────────────────────────

const VALID_BASKET: EvaluationBasket = {
  id:       'basket-profit',
  name:     'Profit Basket',
  weight:   0.4,
  elements: [
    { kpiKey: 'basket', weight: 0.6, required: true },
    { kpiKey: 'crossSelling', weight: 0.4, required: false },
  ],
  thresholdRule: DEFAULT_THRESHOLD_RULE,
  sortOrder: 1,
  active:   true,
}

const VALID_BASKET_2: EvaluationBasket = {
  id:       'basket-guest',
  name:     'Guest Basket',
  weight:   0.6,
  elements: [
    { kpiKey: 'wasfaty', weight: 0.7, required: true },
    { kpiKey: 'omnihealth', weight: 0.3, required: false },
  ],
  thresholdRule: DEFAULT_THRESHOLD_RULE,
  sortOrder: 2,
  active:   true,
}

const VALID_PROFILE: Partial<EvaluationProfile> = {
  name:          'Pharmacist Q1 2025',
  role:          'pharmacist',
  effectiveFrom: '2025-01',
  effectiveTo:   null,
  version:       1,
  status:        'draft',
  basketIds:     ['basket-profit', 'basket-guest'],
  baskets:       { 'basket-profit': VALID_BASKET, 'basket-guest': VALID_BASKET_2 },
  defaultThresholdRule: DEFAULT_THRESHOLD_RULE,
}

// ── 1. Types and validation ───────────────────────────────────

describe('ER-0 — validateEvaluationProfile', () => {
  it('valid profile passes validation', () => {
    const result = validateEvaluationProfile(VALID_PROFILE)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('requires name', () => {
    const result = validateEvaluationProfile({ ...VALID_PROFILE, name: '' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Profile name is required')
  })

  it('requires role', () => {
    const result = validateEvaluationProfile({ ...VALID_PROFILE, role: undefined })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('role'))).toBe(true)
  })

  it('requires effectiveFrom', () => {
    const result = validateEvaluationProfile({ ...VALID_PROFILE, effectiveFrom: undefined })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Effective from'))).toBe(true)
  })

  it('requires at least one basket', () => {
    const result = validateEvaluationProfile({ ...VALID_PROFILE, baskets: {} })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('basket'))).toBe(true)
  })

  it('basket weights must sum to 1.0', () => {
    const badBaskets = {
      'basket-profit': { ...VALID_BASKET, weight: 0.3 },
      'basket-guest':  { ...VALID_BASKET_2, weight: 0.3 },
    }
    const result = validateEvaluationProfile({ ...VALID_PROFILE, baskets: badBaskets })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('basket weights'))).toBe(true)
  })

  it('element weights must sum to 1.0 per basket', () => {
    const badBasket: EvaluationBasket = {
      ...VALID_BASKET,
      elements: [
        { kpiKey: 'basket', weight: 0.4, required: true },
        { kpiKey: 'crossSelling', weight: 0.4, required: false },
        // sum = 0.8, not 1.0
      ],
    }
    const result = validateEvaluationProfile({
      ...VALID_PROFILE,
      baskets: { 'basket-profit': badBasket, 'basket-guest': VALID_BASKET_2 },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('element weights'))).toBe(true)
  })

  it('warns when effectiveTo is before effectiveFrom', () => {
    const result = validateEvaluationProfile({
      ...VALID_PROFILE, effectiveFrom: '2025-06', effectiveTo: '2025-01',
    })
    expect(result.warnings.some((w) => w.includes('effectiveTo'))).toBe(true)
  })

  it('empty baskets (no active) triggers error', () => {
    const result = validateEvaluationProfile({
      ...VALID_PROFILE,
      baskets: { 'x': { ...VALID_BASKET, active: false } },
    })
    // active basket weight sum = 0 ≠ 1.0
    expect(result.valid).toBe(false)
  })
})

// ── 2. Profile lifecycle ──────────────────────────────────────

describe('ER-0 — Profile lifecycle: create', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(addDoc).mockResolvedValue({ id: 'new-profile-id' } as any)
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => null } as any)
  })

  it('createEvaluationProfile calls addDoc', async () => {
    const { createEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await createEvaluationProfile(
      { name: 'Test Profile', role: 'pharmacist', effectiveFrom: '2025-01' },
      'admin', 'admin'
    )
    expect(vi.mocked(addDoc)).toHaveBeenCalledTimes(1)
  })

  it('new profile always starts as draft', async () => {
    const capturedPayload: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      capturedPayload.push(data); return { id: 'new-id' }
    })
    const { createEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await createEvaluationProfile(
      { name: 'Test', role: 'pharmacist', effectiveFrom: '2025-01' },
      'admin', 'admin'
    )
    expect((capturedPayload[0] as Record<string, unknown>).status).toBe('draft')
  })

  it('new profile starts at version 1', async () => {
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'new-id' }
    })
    const { createEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await createEvaluationProfile(
      { name: 'Test', role: 'pharmacist', effectiveFrom: '2025-01' },
      'admin', 'admin'
    )
    expect((payloads[0] as Record<string, unknown>).version).toBe(1)
  })

  it('createEvaluationProfile throws when name is missing', async () => {
    const { createEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await expect(createEvaluationProfile({ role: 'pharmacist', effectiveFrom: '2025-01' }, 'admin', 'admin'))
      .rejects.toThrow('Profile name is required')
  })

  it('createEvaluationProfile throws when role is missing', async () => {
    const { createEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await expect(createEvaluationProfile({ name: 'Test', effectiveFrom: '2025-01' }, 'admin', 'admin'))
      .rejects.toThrow('Profile role is required')
  })
})

// ── 3. Immutability ───────────────────────────────────────────

describe('ER-0 — Immutability enforcement', () => {
  it('isProfileImmutable: draft is NOT immutable', () => {
    expect(isProfileImmutable('draft')).toBe(false)
  })

  it('isProfileImmutable: published IS immutable', () => {
    expect(isProfileImmutable('published')).toBe(true)
  })

  it('isProfileImmutable: archived IS immutable', () => {
    expect(isProfileImmutable('archived')).toBe(true)
  })

  it('updateEvaluationProfile throws for published profile', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'published', name: 'Test', version: 1 }),
      id: 'p1',
    } as any)
    const { updateEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await expect(
      updateEvaluationProfile('p1', { name: 'New Name' }, 'admin', 'admin')
    ).rejects.toThrow('Cannot edit a published profile')
  })

  it('updateEvaluationProfile throws for archived profile', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'archived', name: 'Old', version: 1 }),
      id: 'p1',
    } as any)
    const { updateEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await expect(
      updateEvaluationProfile('p1', { name: 'New' }, 'admin', 'admin')
    ).rejects.toThrow('Cannot edit a archived profile')
  })

  it('publishEvaluationProfile throws for already-published profile', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'published', name: 'Test' }),
      id: 'p1',
    } as any)
    const { publishEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await expect(publishEvaluationProfile('p1', 'admin', 'admin'))
      .rejects.toThrow('Only draft profiles can be published')
  })

  it('archiveEvaluationProfile throws for draft profile', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'draft', name: 'Test' }),
      id: 'p1',
    } as any)
    const { archiveEvaluationProfile } = await import('../../services/evaluationRegistryService')
    await expect(archiveEvaluationProfile('p1', 'admin', 'admin'))
      .rejects.toThrow('Only published profiles can be archived')
  })
})

// ── 4. Versioning ─────────────────────────────────────────────

describe('ER-0 — Profile versioning', () => {
  it('createNewVersion copies source data and increments version', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        status: 'published', name: 'Profile v1', version: 1,
        role: 'pharmacist', effectiveFrom: '2025-01',
        basketIds: [], baskets: {},
      }),
      id: 'p1',
    } as any)
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'p2' }
    })
    const { createNewVersion } = await import('../../services/evaluationRegistryService')
    const result = await createNewVersion('p1', 'admin', 'admin')
    expect(result.version).toBe(2)
    expect((payloads[0] as Record<string, unknown>).version).toBe(2)
    expect((payloads[0] as Record<string, unknown>).status).toBe('draft')
    expect((payloads[0] as Record<string, unknown>).previousVersionId).toBe('p1')
  })

  it('createNewVersion throws when source is a draft', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'draft', name: 'Draft', version: 1 }),
      id: 'p1',
    } as any)
    const { createNewVersion } = await import('../../services/evaluationRegistryService')
    await expect(createNewVersion('p1', 'admin', 'admin'))
      .rejects.toThrow('published or archived')
  })
})

// ── 5. Basket model ───────────────────────────────────────────

describe('ER-0 — EvaluationBasket model', () => {
  it('basket has id, name, weight, elements, thresholdRule', () => {
    const basket: EvaluationBasket = VALID_BASKET
    expect(basket.id).toBe('basket-profit')
    expect(basket.weight).toBe(0.4)
    expect(basket.elements).toHaveLength(2)
    expect(basket.thresholdRule).toBeDefined()
  })

  it('element weights sum to 1.0 in fixture', () => {
    const sum = VALID_BASKET.elements.reduce((s, e) => s + e.weight, 0)
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01)
  })

  it('basket elements reference KPI keys (not hardcoded values)', () => {
    // Elements carry kpiKey string — resolved against live registry at evaluation time
    VALID_BASKET.elements.forEach((e) => {
      expect(typeof e.kpiKey).toBe('string')
      expect(e.kpiKey.length).toBeGreaterThan(0)
    })
  })

  it('basket element has required flag', () => {
    expect(typeof VALID_BASKET.elements[0].required).toBe('boolean')
  })

  it('multi-basket profile: total basket weight sums to 1.0', () => {
    const baskets = [VALID_BASKET, VALID_BASKET_2]
    const total = baskets.reduce((s, b) => s + b.weight, 0)
    expect(Math.abs(total - 1.0)).toBeLessThan(0.01)
  })
})

// ── 6. Threshold schema ───────────────────────────────────────

describe('ER-0 — ThresholdRule schema', () => {
  it('DEFAULT_THRESHOLD_RULE has 3 bands', () => {
    expect(DEFAULT_THRESHOLD_RULE.bands).toHaveLength(3)
  })

  it('bands cover the full 0–999 range without gaps', () => {
    const bands = [...DEFAULT_THRESHOLD_RULE.bands].sort((a, b) => a.min - b.min)
    // First band starts at 0
    expect(bands[0].min).toBe(0)
    // Each band's max is the next band's min
    for (let i = 0; i < bands.length - 1; i++) {
      expect(bands[i].max).toBe(bands[i + 1].min)
    }
  })

  it('band scores are increasing (higher achievement → higher score)', () => {
    const bands = [...DEFAULT_THRESHOLD_RULE.bands].sort((a, b) => a.min - b.min)
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].score).toBeGreaterThan(bands[i - 1].score)
    }
  })

  it('all bands have Arabic labels', () => {
    DEFAULT_THRESHOLD_RULE.bands.forEach((b) => {
      expect(b.labelAr).toBeDefined()
      expect(b.labelAr!.length).toBeGreaterThan(0)
    })
  })

  it('threshold band has color property', () => {
    DEFAULT_THRESHOLD_RULE.bands.forEach((b) => {
      expect(b.color).toMatch(/^#[0-9a-fA-F]{6}$/)
    })
  })
})

// ── 7. Dynamic KPI integration ────────────────────────────────

describe('ER-0 — Dynamic KPI integration', () => {
  it('basket elements use kpiKey strings (not hardcoded values)', () => {
    const elements: BasketElement[] = [
      { kpiKey: 'wasfaty',      weight: 0.4, required: true  },
      { kpiKey: 'omnihealth',   weight: 0.3, required: false },
      { kpiKey: 'wellnessCard', weight: 0.3, required: false },
    ]
    elements.forEach((e) => expect(typeof e.kpiKey).toBe('string'))
  })

  it('custom KPI key can be used as a basket element', () => {
    const element: BasketElement = {
      kpiKey: 'nps',   // custom KPI not in default registry
      weight: 1.0,
      required: true,
    }
    expect(element.kpiKey).toBe('nps')
  })

  it('evaluationRegistryTypes does not import DEFAULT_KPI_REGISTRY', async () => {
    const src = await import('../../engine/evaluationRegistry/evaluationRegistryTypes.ts?raw')
    // Types should not have a hard dependency on the default registry
    expect(src.default).not.toContain('DEFAULT_KPI_REGISTRY')
    expect(src.default).not.toContain("import.*defaultKpiRegistry")
  })

  it('isProfileEffectiveForMonth works for a valid month range', () => {
    const profile: EvaluationProfile = {
      ...VALID_PROFILE,
      id: 'p1', status: 'published',
      effectiveFrom: '2025-01', effectiveTo: '2025-12',
    } as EvaluationProfile
    expect(isProfileEffectiveForMonth(profile, '2025-06')).toBe(true)
    expect(isProfileEffectiveForMonth(profile, '2024-12')).toBe(false)
    expect(isProfileEffectiveForMonth(profile, '2026-01')).toBe(false)
  })

  it('isProfileEffectiveForMonth: null effectiveTo means indefinitely active', () => {
    const profile: EvaluationProfile = {
      ...VALID_PROFILE, id: 'p1', status: 'published',
      effectiveFrom: '2025-01', effectiveTo: null,
    } as EvaluationProfile
    expect(isProfileEffectiveForMonth(profile, '2030-12')).toBe(true)
  })

  it('isProfileEffectiveForMonth returns false for non-published profiles', () => {
    const draftProfile: EvaluationProfile = {
      ...VALID_PROFILE, id: 'p1', status: 'draft',
      effectiveFrom: '2025-01', effectiveTo: null,
    } as EvaluationProfile
    expect(isProfileEffectiveForMonth(draftProfile, '2025-06')).toBe(false)
  })
})

// ── 8. Firestore rules simulation ─────────────────────────────

describe('ER-0 — Firestore rules simulation', () => {
  function canRead(role: string, docStatus: string): boolean {
    const isAdmin = role === 'admin'
    const isAuth  = true // all authenticated
    const effectiveStatus = docStatus ?? 'draft'
    return isAdmin || (isAuth && effectiveStatus === 'published')
  }

  function canWrite(role: string): boolean {
    return role === 'admin'
  }

  it('admin can read draft profiles', () => {
    expect(canRead('admin', 'draft')).toBe(true)
  })

  it('admin can read published profiles', () => {
    expect(canRead('admin', 'published')).toBe(true)
  })

  it('admin can read archived profiles', () => {
    expect(canRead('admin', 'archived')).toBe(true)
  })

  it('pharmacist can read only published profiles', () => {
    expect(canRead('pharmacist', 'published')).toBe(true)
    expect(canRead('pharmacist', 'draft')).toBe(false)
    expect(canRead('pharmacist', 'archived')).toBe(false)
  })

  it('manager can read only published profiles', () => {
    expect(canRead('manager', 'published')).toBe(true)
    expect(canRead('manager', 'draft')).toBe(false)
  })

  it('only admin can write to evaluation_profiles', () => {
    expect(canWrite('admin')).toBe(true)
    expect(canWrite('manager')).toBe(false)
    expect(canWrite('pharmacist')).toBe(false)
    expect(canWrite('district_supervisor')).toBe(false)
    expect(canWrite('regional_manager')).toBe(false)
  })

  it('evaluation_profiles are never deleted (delete: if false)', async () => {
    const src = await import('../../../firestore.rules?raw')
    const ptBlock = src.default.match(
      /match \/evaluation_profiles\/\{profileId\} \{[\s\S]+?\}/
    )?.[0] ?? ''
    expect(ptBlock).toContain('allow delete: if false')
  })

  it('firestore.rules source contains evaluation_profiles collection', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain('evaluation_profiles')
  })
})

// ── 9. Admin route protection ─────────────────────────────────

describe('ER-0 — Admin route protection', () => {
  it('App.jsx contains evaluation-registry route', async () => {
    const src = await import('../../App.jsx?raw')
    expect(src.default).toContain('/admin/evaluation-registry')
  })

  it('evaluation-registry route is gated to ADMIN only', async () => {
    const src = await import('../../App.jsx?raw')
    const line = src.default.split('\n').find((l) => l.includes('/admin/evaluation-registry'))
    expect(line).toContain('ADMIN')
    expect(line).not.toContain('MGR_UP')
  })

  it('COL.EVALUATION_PROFILES is defined', async () => {
    const { COL } = await import('../../services/firebase')
    expect(COL.EVALUATION_PROFILES).toBe('evaluation_profiles')
  })
})

// ── 10. No ranking/evaluation engine logic introduced ──────────

describe('ER-0 — Scope guard: foundation only', () => {
  it('evaluationRegistryService contains no scoring functions', async () => {
    const src = await import('../../services/evaluationRegistryService.ts?raw')
    expect(src.default).not.toMatch(/^export function.*[Ss]core/m)
    expect(src.default).not.toMatch(/^export function.*[Rr]ank/m)
    expect(src.default).not.toMatch(/computeEvaluation|runEvaluation|executeEvaluation/i)
  })

  it('evaluationRegistryTypes contains no scoring computations', async () => {
    const src = await import('../../engine/evaluationRegistry/evaluationRegistryTypes.ts?raw')
    expect(src.default).not.toMatch(/computeScore|computeRank|evaluationScore/i)
    // Validation function is pure schema validation — not scoring
    expect(src.default).toContain('validateEvaluationProfile')
  })

  it('no evaluation dashboard routes were added', async () => {
    const src = await import('../../App.jsx?raw')
    expect(src.default).not.toContain('/evaluation-dashboard')
    expect(src.default).not.toContain('/ranking')
    expect(src.default).not.toContain('/evaluation-results')
  })
})
