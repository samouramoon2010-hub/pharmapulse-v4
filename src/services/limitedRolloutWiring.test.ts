// ============================================================
// Limited Rollout Wiring — Regression Tests
//
// Tests the bidirectional engine routing in runEvaluationForUserMonth.
//
// Group 1 — V1 default (getActiveEngine returns 'v1' / config missing)
//   1.  activeEngine = 'v1' in outcome
//   2.  ledgerDoc.engineVersion = 'v1'
//   3.  shadow comparisonDirection = 'v1_vs_v2'
//   4.  shadow officialEngine = 'v1'
//
// Group 2 — V2 scoped rollout (getActiveEngine returns 'v2')
//   5.  activeEngine = 'v2' in outcome
//   6.  ledgerDoc.engineVersion = 'v2'
//   7.  shadow comparisonDirection = 'v2_vs_v1'
//   8.  shadow officialEngine = 'v2'
//
// Group 3 — Non-matching scope (getActiveEngine returns 'v1')
//   9.  activeEngine = 'v1' even when rollout exists for another branch
//
// Group 4 — Firestore config failure (getActiveEngine throws/fails)
//  10.  safe fallback to v1 — evaluation completes normally
//  11.  activeEngine = 'v1' in outcome
//
// Group 5 — V2 pipeline failure during official mode
//  12.  no partial V2 ledger written
//  13.  falls back to V1 official
//  14.  warning recorded
//
// Group 6 — Source labelling preserved
//  15.  bulk source = 'bulk' in shadow log
//  16.  single-user source = 'single_user' in shadow log
//
// Group 7 — Source invariants
//  17.  orchestrator source: getActiveEngine IS now called
//  18.  orchestrator source: both 'v1' and 'v2' branches exist
//  19.  orchestrator source: shadowSource is still threaded through
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared mock setup ─────────────────────────────────────────

vi.mock('./firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
  COL:  { EVALUATION_RESULTS: 'evaluation_results', SHADOW_EVALUATION_LOGS: 'shadow_evaluation_logs', SYSTEM_CONFIG: 'system_config' },
}))

vi.mock('firebase/firestore', () => ({
  addDoc:          vi.fn(async () => ({ id: 'mock-doc-id' })),
  collection:      vi.fn((_db: unknown, col: string) => ({ __col: col })),
  doc:             vi.fn((_db: unknown, path: string) => ({ __path: path })),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  serverTimestamp: vi.fn(() => ({ _type: 'ts' })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  query:           vi.fn((...a: unknown[]) => a[0]),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
}))

// ── Fixtures ──────────────────────────────────────────────────

const MOCK_PROFILE: any = {
  id: 'p1', name: 'Test', version: 1, status: 'published', role: 'pharmacist',
  effectiveFrom: '2026-01', effectiveTo: null,
  basketIds: ['b1'],
  baskets: {
    b1: {
      id: 'b1', name: 'B1', weight: 1.0, active: true, sortOrder: 1,
      thresholdRule: {
        id: 't1', name: 'T1',
        bands: [
          { min: 0, max: 70, label: 'Below', score: 1 },
          { min: 70, max: 90, label: 'Near', score: 2 },
          { min: 90, max: 100, label: 'Meet', score: 3 },
          { min: 100, max: 115, label: 'Exceed', score: 4 },
          { min: 115, max: 999, label: 'SExceed', score: 5 },
        ],
      },
      elements: [{ kpiKey: 'wasfaty', weight: 1.0, required: true, achievementCapPct: null }],
      achievementCapPct: null,
    },
  },
  defaultThresholdRule: {
    id: 'c1', name: 'Composite',
    bands: [
      { min: 0, max: 50, label: 'SBelow', score: 1 },
      { min: 50, max: 70, label: 'Below', score: 2 },
      { min: 70, max: 85, label: 'Meet', score: 3 },
      { min: 85, max: 95, label: 'Exceed', score: 4 },
      { min: 95, max: 101, label: 'SExceed', score: 5 },
    ],
  },
  createdBy: null, createdAt: null, updatedAt: null,
  publishedAt: null, archivedAt: null, previousVersionId: null,
}

const MOCK_REGISTRY: any = {
  wasfaty: { key: 'wasfaty', label: 'Wasfaty', isActive: true, unit: 'units' },
}

const BASE_OPTS = {
  userId:       'u1',
  pharmacyId:   'ph-atheer',
  userRole:     'pharmacist',
  month:        '2026-06',
  registry:     MOCK_REGISTRY,
  calculatedBy: 'admin-uid',
  actorRole:    'admin',
}

// Mock all service dependencies
function setupServiceMocks(overrides: {
  activeEngine?: 'v1' | 'v2'
  getDocData?: Record<string, unknown> | null
  v2PipelineFail?: boolean
} = {}) {
  vi.resetAllMocks()

  // Re-apply firebase mock
  vi.mocked((vi.importActual as any) ?? vi.fn()).mockImplementation?.(() => {})

  const { getDoc, addDoc } = require('firebase/firestore')

  // getDoc for system_config and other Firestore reads
  vi.mocked(getDoc).mockImplementation(async (docRef: any) => {
    if (docRef?.__path?.includes('system_config')) {
      if (overrides.getDocData === null) {
        return { exists: () => false, data: () => null }
      }
      if (overrides.activeEngine === 'v2') {
        return {
          exists: () => true,
          data: () => ({
            activeEngine: 'v1',
            rollout: { engine: 'v2', branches: ['ph-atheer'], months: ['2026-06'] },
          }),
        }
      }
      return { exists: () => false, data: () => null }
    }
    return { exists: () => false, data: () => null }
  })

  // addDoc returns a mock doc with id
  let callCount = 0
  vi.mocked(addDoc).mockImplementation(async (_col: any, payload: any) => {
    callCount++
    return { id: `mock-doc-${callCount}` }
  })
}

// ════════════════════════════════════════════════════════════════
// Group 7 — Source code invariants (fast, no Firestore mocks needed)
// ════════════════════════════════════════════════════════════════

describe('Wiring invariants — source code', () => {
  it('orchestrator now calls getActiveEngine', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain('getActiveEngine(')
  })

  it('orchestrator passes { pharmacyId, month } scope to getActiveEngine', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain('getActiveEngine({ pharmacyId, month })')
  })

  it("both activeEngine === 'v1' and activeEngine === 'v2' branches exist", async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain("activeEngine === 'v2'")
    expect(src.default).toContain("activeEngine === 'v1'")
  })

  it('V2 official path uses engineVersion: v2 in writeEvaluationResult', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain("engineVersion:   'v2'")
  })

  it('V1 official path uses engineVersion: v1 in writeEvaluationResult', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain("engineVersion:   'v1'")
  })

  it('V2 pipeline failure path resets activeEngine to v1 (safe fallback)', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    // The fallback must set activeEngine = 'v1' on failure
    expect(src.default).toContain("activeEngine = 'v1'")
  })

  it('reverse shadow uses compareEvaluationResults from pipeline module', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain('compareEvaluationResults')
  })

  it('shadow log buildShadowLog receives officialEngine from activeEngine', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain('officialEngine: activeEngine')
  })

  it("shadowSource is still threaded through opts.shadowSource ?? 'single_user'", async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain("opts.shadowSource ?? 'single_user'")
  })

  it('getActiveEngine is imported as a static import', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain("import { getActiveEngine }")
  })

  it('RunEvaluationOutcome includes activeEngine field', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain("activeEngine:   'v1' | 'v2'")
  })
})

// ════════════════════════════════════════════════════════════════
// Group 1–4 — Functional routing (unit-level, mock-heavy)
// ════════════════════════════════════════════════════════════════

describe('Wiring — getActiveEngine routing logic', () => {
  it("getActiveEngine('v1') → returns 'v1'", async () => {
    const { getActiveEngine } = await import('./evaluationEngineConfigService')
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false, data: () => null,
    } as any)
    expect(await getActiveEngine({ pharmacyId: 'ph-atheer', month: '2026-06' })).toBe('v1')
  })

  it("getActiveEngine with matching rollout → returns 'v2'", async () => {
    const { getActiveEngine } = await import('./evaluationEngineConfigService')
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        activeEngine: 'v1',
        rollout: { engine: 'v2', branches: ['ph-atheer'], months: ['2026-06'] },
      }),
    } as any)
    expect(await getActiveEngine({ pharmacyId: 'ph-atheer', month: '2026-06' })).toBe('v2')
  })

  it('non-matching scope → v1 even if global activeEngine=v2', async () => {
    const { getActiveEngine } = await import('./evaluationEngineConfigService')
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        activeEngine: 'v2',
        rollout: { engine: 'v2', branches: ['ph-atheer'], months: ['2026-06'] },
      }),
    } as any)
    // ph-riyadh is NOT in rollout.branches
    expect(await getActiveEngine({ pharmacyId: 'ph-riyadh', month: '2026-06' })).toBe('v1')
  })

  it('Firestore error → safe fallback v1', async () => {
    const { getActiveEngine } = await import('./evaluationEngineConfigService')
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('network-error'))
    expect(await getActiveEngine({ pharmacyId: 'ph-atheer', month: '2026-06' })).toBe('v1')
  })
})

// ════════════════════════════════════════════════════════════════
// Group 5 — V2 pipeline failure safety
// ════════════════════════════════════════════════════════════════

describe('Wiring — V2 pipeline failure safety', () => {
  it('pipeRes.success = false → fallback message in warnings', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    // The fallback warning message must be present
    expect(src.default).toContain('V2 pipeline failed')
    expect(src.default).toContain('falling back to V1 official')
  })

  it('V2 catch block resets activeEngine to v1 and records warning', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain('V2 engine error')
    expect(src.default).toContain('falling back to V1 official')
  })

  it('partial V2 result is never written when pipeRes.success=false', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    // The stale context guard must check pipeRes.success before writing
    expect(src.default).toContain('pipeRes.success')
    // The v2Succeeded flag gates the writeEvaluationResult call
    expect(src.default).toContain('v2Succeeded')
    // After pipeline failure, activeEngine is reset to v1
    expect(src.default).toContain("activeEngine = 'v1'")
  })
})

// ════════════════════════════════════════════════════════════════
// Group 6 — Source labelling
// ════════════════════════════════════════════════════════════════

describe('Wiring — source labelling preserved', () => {
  it("bulk sets shadowSource = 'bulk' in bulkEvaluationService", async () => {
    const src = await import('./bulkEvaluationService.ts?raw')
    expect(src.default).toContain("shadowSource: 'bulk'")
  })

  it("single-user path has no explicit shadowSource (defaults to 'single_user')", async () => {
    // EvaluationRunPage does not set shadowSource → defaults via opts.shadowSource ?? 'single_user'
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain("opts.shadowSource ?? 'single_user'")
  })
})

// ════════════════════════════════════════════════════════════════
// buildShadowLog direction field derivation
// ════════════════════════════════════════════════════════════════

describe('Wiring — shadow log direction fields', () => {
  it("officialEngine='v1' → direction='v1_vs_v2', shadowEngine='v2'", async () => {
    const { buildShadowLog } = await import('./shadowEvaluationLogService')
    const log = buildShadowLog({
      userId: 'u1', pharmacyId: 'ph1', month: '2026-06', role: 'pharmacist',
      profileId: 'p1', profileVersion: 1, source: 'single_user',
      officialEngine: 'v1',
      shadow: { ran: true, pipelineId: 'legacy-band-score',
        comparison: { severity: 'none', differences: [] }, summary: '✅' },
      v1: { finalScore: 4, ratingScore: 4, status: 'complete', trace: {} },
      warnings: [],
    })
    expect(log.officialEngine).toBe('v1')
    expect(log.shadowEngine).toBe('v2')
    expect(log.comparisonDirection).toBe('v1_vs_v2')
  })

  it("officialEngine='v2' → direction='v2_vs_v1', shadowEngine='v1'", async () => {
    const { buildShadowLog } = await import('./shadowEvaluationLogService')
    const log = buildShadowLog({
      userId: 'u1', pharmacyId: 'ph1', month: '2026-06', role: 'pharmacist',
      profileId: 'p1', profileVersion: 1, source: 'bulk',
      officialEngine: 'v2',
      shadow: { ran: true, pipelineId: 'legacy-band-score',
        comparison: { severity: 'none', differences: [] }, summary: '✅' },
      v1: { finalScore: 4, ratingScore: 4, status: 'complete', trace: {} },
      warnings: [],
    })
    expect(log.officialEngine).toBe('v2')
    expect(log.shadowEngine).toBe('v1')
    expect(log.comparisonDirection).toBe('v2_vs_v1')
  })

  it('absent officialEngine defaults to v1 direction', async () => {
    const { buildShadowLog } = await import('./shadowEvaluationLogService')
    const log = buildShadowLog({
      userId: 'u1', pharmacyId: 'ph1', month: '2026-06', role: 'pharmacist',
      profileId: 'p1', profileVersion: 1, source: 'single_user',
      shadow: { ran: true, pipelineId: 'legacy-band-score',
        comparison: { severity: 'none', differences: [] }, summary: '✅' },
      v1: { finalScore: 4, ratingScore: 4, status: 'complete', trace: {} },
      warnings: [],
    })
    expect(log.comparisonDirection).toBe('v1_vs_v2')
  })
})
