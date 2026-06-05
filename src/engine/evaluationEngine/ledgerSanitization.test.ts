// ============================================================
// Ledger Payload Sanitization — Regression Tests
//
// Root cause: Firestore rejects undefined field values.
// Optional TypeScript fields (ratingAr?, bandColor?, bandLabelAr?,
// nameAr? on profiles/baskets, thresholdOverride? on elements, etc.)
// become `undefined` at runtime when not set on the object.
// `writeEvaluationResult` was passing these straight to addDoc.
//
// Fix: sanitizeForFirestore() recursively converts undefined → null.
// Top-level optional fields (ratingAr, ratingColor) also get ?? null.
//
// These tests lock in the no-undefined guarantee permanently.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addDoc } from 'firebase/firestore'
import { DEFAULT_THRESHOLD_RULE, FIVE_BAND_THRESHOLD_RULE }
  from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import type { EvaluationProfile, EvaluationBasket }
  from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import type { EvaluationResult }
  from '../../engine/evaluationEngine/evaluationEngineTypes'

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
  addDoc:          vi.fn(async () => ({ id: 'ledger-id' })),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({ _methodName: 'serverTimestamp' })),
}))
vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create' },
}))

// ── Fixtures ──────────────────────────────────────────────────

const BASKET: EvaluationBasket = {
  id: 'b1', name: 'Guest', weight: 1.0, active: true, sortOrder: 1,
  elements: [{ kpiKey: 'wasfaty', weight: 1.0, required: true }],
  thresholdRule: { ...DEFAULT_THRESHOLD_RULE },
}

const PROFILE: EvaluationProfile = {
  id: 'p1', name: 'Test', role: 'pharmacist',
  version: 1, status: 'published',
  effectiveFrom: '2026-05', effectiveTo: null,
  basketIds: ['b1'], baskets: { b1: BASKET },
  defaultThresholdRule: { ...DEFAULT_THRESHOLD_RULE },
  createdBy: null, createdAt: null, updatedAt: null,
  publishedAt: null, archivedAt: null, previousVersionId: null,
}

// EvaluationResult with undefined optional fields (ratingAr, ratingColor not set)
const RESULT_WITH_UNDEFINED_OPTIONALS: EvaluationResult = {
  userId: 'u1', pharmacyId: 'ph1', role: 'pharmacist', month: '2026-05',
  profileId: 'p1', profileVersion: 1,
  basketResults: [{
    basketId: 'b1', basketName: 'Guest', weight: 1.0,
    elements: [{
      kpiKey: 'wasfaty', engineKey: 'wasfaty', label: 'Wasfaty',
      weight: 1.0, actual: 31000, target: 40000, targetSource: 'branch',
      achievementPct: 77.5,
      bandLabel: 'Meet Expectation',
      bandLabelAr: undefined as unknown as string, // <- UNDEFINED
      bandScore: 2,
      bandColor: undefined as unknown as string,   // <- UNDEFINED
      weightedScore: 2.0,
      required: true, dataAvailable: true,
    }],
    aggregateAchievementPct: 77.5,
    bandLabel: 'Meet Expectation',
    bandLabelAr: undefined as unknown as string, // <- UNDEFINED
    bandScore: 2,
    bandColor: undefined as unknown as string,   // <- UNDEFINED
    weightedScore: 2.0,
    isValid: true,
  }],
  finalScore: 2.0,
  rating: 'Meet Expectation',
  ratingAr: undefined,    // <- UNDEFINED (no labelAr on default threshold)
  ratingScore: 2,
  ratingColor: undefined, // <- UNDEFINED (color may be missing)
  status: 'complete',
  trace: {
    personalTargetUsed: false,
    missingKpis: [],
    cappedKpis: [],
    profileSnapshotId: 'p1',
    profileVersion: 1,
    calculatedAtMs: Date.now(),
  },
}

// ── Helper: find all undefined paths in an object ─────────────

function findUndefinedPaths(obj: unknown, path = ''): string[] {
  if (obj === undefined) return [path || '(root)']
  if (obj === null || typeof obj !== 'object') return []
  if (Array.isArray(obj)) {
    return obj.flatMap((item, i) => findUndefinedPaths(item, `${path}[${i}]`))
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    findUndefinedPaths(v, path ? `${path}.${k}` : k)
  )
}

// ── 1. sanitizeForFirestore unit tests ───────────────────────

describe('sanitizeForFirestore — unit', () => {
  // Import the function by reading the service and testing via writeEvaluationResult
  // (sanitizeForFirestore is module-private, so we test through the public API)

  it('undefined at top level becomes null in addDoc payload', async () => {
    vi.mocked(addDoc).mockResolvedValue({ id: 'led' } as any)
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'led' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result: RESULT_WITH_UNDEFINED_OPTIONALS, profileSnapshot: PROFILE,
        personalTarget: null, branchTarget: null,
        kpiActuals: { wasfaty: 31000 }, calculatedBy: 'admin' },
      'admin'
    )
    const doc = payloads[0] as Record<string, unknown>
    // ratingAr was undefined — must be null in the payload
    expect(doc.ratingAr).toBeNull()
    // ratingColor was undefined — must be null
    expect(doc.ratingColor).toBeNull()
  })

  it('undefined nested in basketResults.elements becomes null', async () => {
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'led' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result: RESULT_WITH_UNDEFINED_OPTIONALS, profileSnapshot: PROFILE,
        personalTarget: null, branchTarget: null,
        kpiActuals: { wasfaty: 31000 }, calculatedBy: 'admin' },
      'admin'
    )
    const doc = payloads[0] as Record<string, unknown>
    const basketResults = doc.basketResults as Array<Record<string, unknown>>
    const el = (basketResults[0].elements as Array<Record<string, unknown>>)[0]
    // bandLabelAr was undefined on element
    expect(el.bandLabelAr).toBeNull()
    expect(el.bandColor).toBeNull()
    // basketResult-level fields
    expect(basketResults[0].bandLabelAr).toBeNull()
    expect(basketResults[0].bandColor).toBeNull()
  })

  it('full payload contains NO undefined values after sanitization', async () => {
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'led' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result: RESULT_WITH_UNDEFINED_OPTIONALS, profileSnapshot: PROFILE,
        personalTarget: null, branchTarget: null,
        kpiActuals: { wasfaty: 31000 }, calculatedBy: 'admin' },
      'admin'
    )
    const undefinedPaths = findUndefinedPaths(payloads[0])
    expect(undefinedPaths).toHaveLength(0)
  })
})

// ── 2. Missing personal target → personalTargetSnapshot = null ─

describe('sanitizeForFirestore — missing personal target', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(addDoc).mockResolvedValue({ id: 'led' } as any)
  })

  it('null personalTarget produces personalTargetSnapshot = null', async () => {
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'led' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result: RESULT_WITH_UNDEFINED_OPTIONALS, profileSnapshot: PROFILE,
        personalTarget: null, branchTarget: null,
        kpiActuals: { wasfaty: 31000 }, calculatedBy: 'admin' },
      'admin'
    )
    const doc = payloads[0] as Record<string, unknown>
    expect(doc.personalTargetSnapshot).toBeNull()
  })

  it('null branchTarget produces branchTargetSnapshot = null', async () => {
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'led' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result: RESULT_WITH_UNDEFINED_OPTIONALS, profileSnapshot: PROFILE,
        personalTarget: null, branchTarget: null,
        kpiActuals: { wasfaty: 31000 }, calculatedBy: 'admin' },
      'admin'
    )
    const doc = payloads[0] as Record<string, unknown>
    expect(doc.branchTargetSnapshot).toBeNull()
  })

  it('recalculationOf is always null in ER-2A', async () => {
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'led' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result: RESULT_WITH_UNDEFINED_OPTIONALS, profileSnapshot: PROFILE,
        personalTarget: null, branchTarget: null,
        kpiActuals: { wasfaty: 31000 }, calculatedBy: 'admin' },
      'admin'
    )
    const doc = payloads[0] as Record<string, unknown>
    expect(doc.recalculationOf).toBeNull()
  })
})

// ── 3. Profile snapshot with optional fields ──────────────────

describe('sanitizeForFirestore — profile snapshot optional fields', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(addDoc).mockResolvedValue({ id: 'led' } as any)
  })

  it('profileSnapshot with undefined nameAr/description becomes null in payload', async () => {
    const profileWithUndefined: EvaluationProfile = {
      ...PROFILE,
      nameAr:      undefined,   // <- optional field not set
      description: undefined,   // <- optional field not set
    }
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'led' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result: RESULT_WITH_UNDEFINED_OPTIONALS,
        profileSnapshot: profileWithUndefined,
        personalTarget: null, branchTarget: null,
        kpiActuals: { wasfaty: 31000 }, calculatedBy: 'admin' },
      'admin'
    )
    const doc = payloads[0] as Record<string, unknown>
    const snapshot = doc.profileSnapshot as Record<string, unknown>
    expect(snapshot.nameAr).toBeNull()
    expect(snapshot.description).toBeNull()
  })

  it('no undefined paths in payload with partial profile snapshot', async () => {
    const profileWithOptionals: EvaluationProfile = {
      ...PROFILE,
      nameAr: undefined, description: undefined, metadata: undefined,
    }
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'led' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result: RESULT_WITH_UNDEFINED_OPTIONALS,
        profileSnapshot: profileWithOptionals,
        personalTarget: null, branchTarget: null,
        kpiActuals: {}, calculatedBy: 'admin' },
      'admin'
    )
    const undefinedPaths = findUndefinedPaths(payloads[0])
    expect(undefinedPaths).toHaveLength(0)
  })
})

// ── 4. Partial KPI actuals — empty map ───────────────────────

describe('sanitizeForFirestore — partial KPI data', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(addDoc).mockResolvedValue({ id: 'led' } as any)
  })

  it('empty kpiActuals produces empty actualsSnapshot (not undefined)', async () => {
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'led' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result: RESULT_WITH_UNDEFINED_OPTIONALS, profileSnapshot: PROFILE,
        personalTarget: null, branchTarget: null,
        kpiActuals: {}, calculatedBy: 'admin' },
      'admin'
    )
    const doc = payloads[0] as Record<string, unknown>
    expect(doc.actualsSnapshot).toEqual({})
    expect(doc.actualsSnapshot).not.toBeUndefined()
  })

  it('no undefined paths with empty actuals', async () => {
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'led' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result: RESULT_WITH_UNDEFINED_OPTIONALS, profileSnapshot: PROFILE,
        personalTarget: null, branchTarget: null,
        kpiActuals: {}, calculatedBy: 'admin' },
      'admin'
    )
    expect(findUndefinedPaths(payloads[0])).toHaveLength(0)
  })
})

// ── 5. five-band result (all fields defined) ──────────────────

describe('sanitizeForFirestore — five-band result with all fields', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(addDoc).mockResolvedValue({ id: 'led' } as any)
  })

  it('five-band result with labelAr and color has no undefined', async () => {
    const resultFiveBand: EvaluationResult = {
      ...RESULT_WITH_UNDEFINED_OPTIONALS,
      ratingAr:    'يلبي التوقعات',  // defined
      ratingColor: '#f59e0b',          // defined
      basketResults: [{
        ...RESULT_WITH_UNDEFINED_OPTIONALS.basketResults[0],
        bandLabelAr: 'يلبي التوقعات',
        bandColor:   '#f59e0b',
        elements: [{
          ...RESULT_WITH_UNDEFINED_OPTIONALS.basketResults[0].elements[0],
          bandLabelAr: 'يلبي التوقعات',
          bandColor:   '#f59e0b',
        }],
      }],
    }
    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'led' }
    })
    const { writeEvaluationResult } = await import('../../services/evaluationLedgerService')
    await writeEvaluationResult(
      { result: resultFiveBand, profileSnapshot: PROFILE,
        personalTarget: null, branchTarget: null,
        kpiActuals: { wasfaty: 31000 }, calculatedBy: 'admin' },
      'admin'
    )
    expect(findUndefinedPaths(payloads[0])).toHaveLength(0)
    const doc = payloads[0] as Record<string, unknown>
    expect(doc.ratingAr).toBe('يلبي التوقعات')
    expect(doc.ratingColor).toBe('#f59e0b')
  })
})

// ── 6. findUndefinedPaths helper self-test ────────────────────

describe('findUndefinedPaths helper', () => {
  it('finds nested undefined', () => {
    const paths = findUndefinedPaths({ a: 1, b: undefined, c: { d: undefined } })
    expect(paths).toContain('b')
    expect(paths).toContain('c.d')
  })

  it('returns empty for clean object', () => {
    expect(findUndefinedPaths({ a: 1, b: null, c: [1, 2] })).toHaveLength(0)
  })

  it('finds undefined in array', () => {
    const paths = findUndefinedPaths([1, undefined, { x: undefined }])
    expect(paths).toContain('[1]')
    expect(paths).toContain('[2].x')
  })
})
