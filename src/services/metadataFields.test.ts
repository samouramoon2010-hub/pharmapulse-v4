// ============================================================
// Limited Rollout Metadata — Regression Tests
//
// Covers:
//   Ledger engineVersion
//     1.  EvaluationLedgerDoc type includes engineVersion field
//     2.  writeEvaluationResult defaults to 'v1' when engineVersion absent
//     3.  writeEvaluationResult writes 'v2' when explicitly passed
//     4.  Current V1 official path writes engineVersion = 'v1'
//     5.  payload sent to Firestore contains engineVersion = 'v1'
//
//   Shadow log direction fields
//     6.  ShadowEvaluationLog type includes officialEngine
//     7.  ShadowEvaluationLog type includes shadowEngine
//     8.  ShadowEvaluationLog type includes comparisonDirection
//     9.  buildShadowLog defaults officialEngine = 'v1'
//    10.  buildShadowLog sets shadowEngine = 'v2' when officialEngine absent
//    11.  buildShadowLog sets comparisonDirection = 'v1_vs_v2' when officialEngine absent
//    12.  buildShadowLog: officialEngine='v2' → shadowEngine='v1', direction='v2_vs_v1'
//    13.  shadow log payload written to Firestore includes all three fields
//    14.  Orchestrator source confirms officialEngine is not passed (defaults to v1)
//    15.  V1 routing remains official — no getActiveEngine call in orchestrator yet
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildShadowLog } from './shadowEvaluationLogService'
import type { ShadowEvaluationLog } from './shadowEvaluationLogService'

// ── Mocks ─────────────────────────────────────────────────────

vi.mock('./firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
  COL:  {
    EVALUATION_RESULTS:     'evaluation_results',
    SHADOW_EVALUATION_LOGS: 'shadow_evaluation_logs',
  },
}))

vi.mock('firebase/firestore', () => ({
  addDoc:          vi.fn(async () => ({ id: 'doc-id' })),
  collection:      vi.fn((_db: unknown, col: string) => ({ __col: col })),
  doc:             vi.fn((_db: unknown, path: string) => ({ __path: path })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

// Capture addDoc payload per call
async function capturePayload(
  fn: () => Promise<void>,
): Promise<Record<string, unknown>> {
  const { addDoc } = await import('firebase/firestore')
  let captured: Record<string, unknown> | undefined
  vi.mocked(addDoc).mockImplementationOnce(async (_col: unknown, payload: unknown) => {
    captured = payload as Record<string, unknown>
    return { id: 'doc-id' }
  })
  await fn()
  if (!captured) throw new Error('addDoc was not called')
  return captured
}

// ── Fixtures ──────────────────────────────────────────────────

const BASE_V1_RESULT = {
  finalScore: 4.0, ratingScore: 4, status: 'complete' as const,
  trace: { normalizedFinalScorePct: 75 },
}

const BASE_SHADOW_RAN = {
  ran: true, pipelineId: 'legacy-band-score' as const,
  summary: '✅ Matched',
  comparison: { severity: 'none' as const, differences: [] },
  v2Result: { ...BASE_V1_RESULT },
}

function makeBaseLog(overrides: Partial<Parameters<typeof buildShadowLog>[0]> = {}) {
  return buildShadowLog({
    userId: 'u1', pharmacyId: 'ph1', month: '2026-06', role: 'pharmacist',
    profileId: 'p1', profileVersion: 1,
    source: 'single_user',
    shadow: BASE_SHADOW_RAN,
    v1: BASE_V1_RESULT,
    warnings: [],
    ...overrides,
  })
}

// ════════════════════════════════════════════════════════════════
// Ledger engineVersion
// ════════════════════════════════════════════════════════════════

describe('Metadata — EvaluationLedgerDoc.engineVersion', () => {
  it('EvaluationLedgerDoc type includes engineVersion field', async () => {
    // TypeScript structural check via source inspection
    const src = await import('./evaluationLedgerService.ts?raw')
    expect(src.default).toContain("engineVersion:")
    expect(src.default).toContain("'v1' | 'v2'")
  })

  it("writeEvaluationResult defaults engineVersion = 'v1' when not provided", async () => {
    const src = await import('./evaluationLedgerService.ts?raw')
    // The destructuring must include engineVersion with a 'v1' default
    expect(src.default).toContain("engineVersion = 'v1'")
  })

  it("WriteEvaluationResultOptions includes engineVersion? optional field", async () => {
    const src = await import('./evaluationLedgerService.ts?raw')
    expect(src.default).toContain("engineVersion?:")
  })

  it("payload written to Firestore includes engineVersion = 'v1' for current V1 path", async () => {
    const { addDoc } = await import('firebase/firestore')
    const { serverTimestamp } = await import('firebase/firestore')
    const { writeEvaluationResult } = await import('./evaluationLedgerService')

    const payload = await capturePayload(async () => {
      // Minimal EvaluationResult shape for the write
      const result: any = {
        userId: 'u1', pharmacyId: 'ph1', role: 'pharmacist', month: '2026-06',
        profileId: 'p1', profileVersion: 1,
        finalScore: 4.0, rating: 'Exceed', ratingScore: 4,
        status: 'complete',
        basketResults: [],
        trace: { personalTargetUsed: false, missingKpis: [], cappedKpis: [],
                 profileSnapshotId: 'p1', profileVersion: 1, calculatedAtMs: 0,
                 normalizedFinalScorePct: 75 },
      }
      const profile: any = {
        id: 'p1', name: 'P', version: 1, status: 'published',
        basketIds: [], baskets: {}, defaultThresholdRule: {},
        role: 'pharmacist', effectiveFrom: '2026-01',
      }
      await writeEvaluationResult(
        { result, profileSnapshot: profile, kpiActuals: {}, calculatedBy: 'admin-uid' },
        'admin',
      ).catch(() => {})  // Firestore auth will fail in test env; we just want the payload
    })

    expect(payload.engineVersion).toBe('v1')
  })

  it("payload includes engineVersion = 'v2' when explicitly passed", async () => {
    const { writeEvaluationResult } = await import('./evaluationLedgerService')

    const payload = await capturePayload(async () => {
      const result: any = {
        userId: 'u1', pharmacyId: 'ph1', role: 'pharmacist', month: '2026-06',
        profileId: 'p1', profileVersion: 1,
        finalScore: 4.0, rating: 'Exceed', ratingScore: 4, status: 'complete',
        basketResults: [],
        trace: { personalTargetUsed: false, missingKpis: [], cappedKpis: [],
                 profileSnapshotId: 'p1', profileVersion: 1, calculatedAtMs: 0 },
      }
      const profile: any = {
        id: 'p1', name: 'P', version: 1, status: 'published',
        basketIds: [], baskets: {}, defaultThresholdRule: {},
        role: 'pharmacist', effectiveFrom: '2026-01',
      }
      await writeEvaluationResult(
        { result, profileSnapshot: profile, kpiActuals: {}, calculatedBy: 'admin-uid',
          engineVersion: 'v2' },
        'admin',
      ).catch(() => {})
    })

    expect(payload.engineVersion).toBe('v2')
  })
})

// ════════════════════════════════════════════════════════════════
// Shadow log direction fields
// ════════════════════════════════════════════════════════════════

describe('Metadata — ShadowEvaluationLog direction fields', () => {
  it('ShadowEvaluationLog type includes officialEngine', async () => {
    const src = await import('./shadowEvaluationLogService.ts?raw')
    expect(src.default).toContain('officialEngine:')
  })

  it('ShadowEvaluationLog type includes shadowEngine', async () => {
    const src = await import('./shadowEvaluationLogService.ts?raw')
    expect(src.default).toContain('shadowEngine:')
  })

  it('ShadowEvaluationLog type includes comparisonDirection', async () => {
    const src = await import('./shadowEvaluationLogService.ts?raw')
    expect(src.default).toContain('comparisonDirection:')
    expect(src.default).toContain("'v1_vs_v2' | 'v2_vs_v1'")
  })

  it("buildShadowLog: officialEngine absent → defaults to 'v1'", () => {
    const log = makeBaseLog()
    expect(log.officialEngine).toBe('v1')
  })

  it("buildShadowLog: officialEngine absent → shadowEngine = 'v2'", () => {
    const log = makeBaseLog()
    expect(log.shadowEngine).toBe('v2')
  })

  it("buildShadowLog: officialEngine absent → comparisonDirection = 'v1_vs_v2'", () => {
    const log = makeBaseLog()
    expect(log.comparisonDirection).toBe('v1_vs_v2')
  })

  it("buildShadowLog: officialEngine='v2' → shadowEngine='v1', direction='v2_vs_v1'", () => {
    const log = makeBaseLog({ officialEngine: 'v2' })
    expect(log.officialEngine).toBe('v2')
    expect(log.shadowEngine).toBe('v1')
    expect(log.comparisonDirection).toBe('v2_vs_v1')
  })

  it("buildShadowLog: officialEngine='v1' explicit → direction='v1_vs_v2'", () => {
    const log = makeBaseLog({ officialEngine: 'v1' })
    expect(log.officialEngine).toBe('v1')
    expect(log.shadowEngine).toBe('v2')
    expect(log.comparisonDirection).toBe('v1_vs_v2')
  })
})

// ════════════════════════════════════════════════════════════════
// Shadow log Firestore payload includes direction fields
// ════════════════════════════════════════════════════════════════

describe('Metadata — shadow log Firestore payload', () => {
  beforeEach(() => vi.resetAllMocks())

  it('written payload includes officialEngine, shadowEngine, comparisonDirection', async () => {
    const { writeShadowEvaluationLog } = await import('./shadowEvaluationLogService')
    const log = makeBaseLog()  // defaults to v1 official

    const payload = await capturePayload(async () => {
      await writeShadowEvaluationLog(log)
    })

    expect(payload.officialEngine).toBe('v1')
    expect(payload.shadowEngine).toBe('v2')
    expect(payload.comparisonDirection).toBe('v1_vs_v2')
  })
})

// ════════════════════════════════════════════════════════════════
// V1 routing invariant — no wiring yet
// ════════════════════════════════════════════════════════════════

describe('Metadata — V1 routing invariant', () => {
  it('orchestrator now calls getActiveEngine (wired in Limited Rollout phase)', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain('getActiveEngine')
    expect(src.default).toContain('getActiveEngine({ pharmacyId, month })')
  })

  it('orchestrator V1 path still calls runEvaluation (inside conditional branch)', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    // V1 still uses runEvaluation — now inside the activeEngine==='v1' branch
    expect(src.default).toContain("const { runEvaluation } = await import('../engine/evaluationEngine/evaluationEngine')")
    // V1 official result is still assigned correctly
    expect(src.default).toContain('officialResult = runEvaluation(')
  })

  it('orchestrator V1 path passes engineVersion=v1, V2 path passes engineVersion=v2', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    // Both paths now explicitly set engineVersion
    expect(src.default).toContain("engineVersion:   'v1'")
    expect(src.default).toContain("engineVersion:   'v2'")
  })
})
