// ============================================================
// Shadow Log Sanitizer Tests
//
// Verifies that sanitizeForFirestore (via writeShadowEvaluationLog)
// produces payloads that Firestore accepts — no undefined, NaN,
// or Infinity values anywhere in the document tree.
//
// Tests:
//   1.  undefined optional fields (error, ledgerDocId) are omitted
//   2.  EvaluationDifference.delta undefined → field omitted from diff object
//   3.  EvaluationDifference.delta NaN → null
//   4.  EvaluationDifference.delta Infinity → null
//   5.  v1.finalScore NaN → null
//   6.  v2.ratingScore Infinity → null
//   7.  warnings[] undefined entries removed
//   8.  differences[] with mixed valid/invalid delta → only valid ones survive intact
//   9.  all top-level required string fields preserved
//  10.  string-comparison diffs (v1/v2 as string, no delta) are written correctly
//  11.  nested object sanitization depth (differences[].delta inside array)
//  12.  clean payload passes through unchanged
// ============================================================

import { describe, it, expect, vi } from 'vitest'
import { buildShadowLog } from './shadowEvaluationLogService'

// ── Minimal fixtures ──────────────────────────────────────────

const BASE_V1 = {
  finalScore:  4.0,
  ratingScore: 4,
  status:      'complete' as const,
  trace:       { normalizedFinalScorePct: 75 },
}

const BASE_SHADOW_RAN = {
  ran:       true,
  pipelineId: 'legacy-band-score' as const,
  summary:   'V2 Shadow: ✅ Matched',
  comparison: { severity: 'none' as const, differences: [] },
  v2Result:  {
    finalScore:  4.0,
    ratingScore: 4,
    status:      'complete' as const,
    trace:       { normalizedFinalScorePct: 75 },
  },
}

function makeLog(overrides: Partial<Parameters<typeof buildShadowLog>[0]> = {}) {
  return buildShadowLog({
    userId: 'u1', pharmacyId: 'ph1', month: '2026-06', role: 'pharmacist',
    profileId: 'p1', profileVersion: 1,
    source: 'single_user',
    shadow: BASE_SHADOW_RAN,
    v1: BASE_V1,
    warnings: [],
    ...overrides,
  })
}

// ── Expose sanitizeForFirestore via dynamic import for white-box tests ─
// We test the behaviour through buildShadowLog + the shape of the output,
// and via the integration test of writeShadowEvaluationLog with addDoc mocked.

vi.mock('./firebase', () => ({
  db: {}, auth: { currentUser: { uid: 'admin' } },
  COL: { SHADOW_EVALUATION_LOGS: 'shadow_evaluation_logs' },
}))

// addDoc mock — uses mockImplementation so we can capture the payload per call
vi.mock('firebase/firestore', () => ({
  addDoc:     vi.fn(async () => ({ id: 'test-doc-id' })),
  collection: vi.fn((_db: unknown, col: string) => ({ __col: col })),
}))

async function getWrittenPayload(log: ReturnType<typeof buildShadowLog>) {
  const { addDoc } = await import('firebase/firestore')
  let captured: Record<string, unknown> | undefined
  vi.mocked(addDoc).mockImplementationOnce(async (_col: unknown, payload: unknown) => {
    captured = payload as Record<string, unknown>
    return { id: 'test-doc-id' }
  })
  const { writeShadowEvaluationLog } = await import('./shadowEvaluationLogService')
  await writeShadowEvaluationLog(log)
  if (!captured) throw new Error('addDoc was not called — writeShadowEvaluationLog may have thrown')
  return captured
}

// ════════════════════════════════════════════════════════════════
// 1–2. Optional undefined fields omitted
// ════════════════════════════════════════════════════════════════

describe('Sanitizer — undefined field omission', () => {
  it('error field absent when shadow ran successfully', async () => {
    const log     = makeLog()               // shadow ran = true, no error
    const payload = await getWrittenPayload(log)
    expect('error' in payload).toBe(false)
  })

  it('ledgerDocId absent when not provided', async () => {
    const log     = makeLog()               // no ledgerDocId in base call
    const payload = await getWrittenPayload(log)
    expect('ledgerDocId' in payload).toBe(false)
  })

  it('ledgerDocId present when provided', async () => {
    const log     = makeLog({ ledgerDocId: 'ledger-abc' })
    const payload = await getWrittenPayload(log)
    expect(payload.ledgerDocId).toBe('ledger-abc')
  })
})

// ════════════════════════════════════════════════════════════════
// 2–4. EvaluationDifference.delta sanitization
// ════════════════════════════════════════════════════════════════

describe('Sanitizer — EvaluationDifference.delta', () => {
  it('delta undefined → key omitted from written diff object', async () => {
    const log = makeLog({
      shadow: {
        ...BASE_SHADOW_RAN,
        comparison: {
          severity: 'major',
          differences: [
            { field: 'status', v1: 'complete', v2: 'partial' },  // no delta
          ],
        },
      },
    })
    const payload = await getWrittenPayload(log)
    const diffs = payload.differences as Record<string, unknown>[]
    expect(diffs).toHaveLength(1)
    expect('delta' in diffs[0]).toBe(false)           // undefined was omitted
    expect(diffs[0].field).toBe('status')
    expect(diffs[0].v1).toBe('complete')
    expect(diffs[0].v2).toBe('partial')
  })

  it('delta NaN → null', async () => {
    const log = makeLog({
      shadow: {
        ...BASE_SHADOW_RAN,
        comparison: {
          severity: 'minor',
          differences: [{ field: 'finalScore', v1: 4.0, v2: 4.0, delta: NaN }],
        },
      },
    })
    const payload = await getWrittenPayload(log)
    const diffs = payload.differences as Record<string, unknown>[]
    expect(diffs[0].delta).toBeNull()
  })

  it('delta Infinity → null', async () => {
    const log = makeLog({
      shadow: {
        ...BASE_SHADOW_RAN,
        comparison: {
          severity: 'minor',
          differences: [{ field: 'finalScore', v1: 4.0, v2: 0, delta: Infinity }],
        },
      },
    })
    const payload = await getWrittenPayload(log)
    const diffs = payload.differences as Record<string, unknown>[]
    expect(diffs[0].delta).toBeNull()
  })

  it('valid delta number preserved exactly', async () => {
    const log = makeLog({
      shadow: {
        ...BASE_SHADOW_RAN,
        comparison: {
          severity: 'minor',
          differences: [{ field: 'finalScore', v1: 4.0, v2: 3.9, delta: 0.1 }],
        },
      },
    })
    const payload = await getWrittenPayload(log)
    const diffs = payload.differences as Record<string, unknown>[]
    expect(diffs[0].delta).toBe(0.1)
  })
})

// ════════════════════════════════════════════════════════════════
// 5–6. v1/v2 numeric field sanitization
// ════════════════════════════════════════════════════════════════

describe('Sanitizer — v1/v2 numeric fields', () => {
  it('v1.finalScore NaN → null', async () => {
    const log = makeLog({
      v1: { ...BASE_V1, finalScore: NaN },
    })
    const payload = await getWrittenPayload(log)
    expect((payload.v1 as any).finalScore).toBeNull()
  })

  it('v2.ratingScore Infinity → null', async () => {
    const log = makeLog({
      shadow: {
        ...BASE_SHADOW_RAN,
        v2Result: { ...BASE_SHADOW_RAN.v2Result!, ratingScore: Infinity },
      },
    })
    const payload = await getWrittenPayload(log)
    expect((payload.v2 as any).ratingScore).toBeNull()
  })

  it('v1 finite numbers preserved', async () => {
    const log     = makeLog()
    const payload = await getWrittenPayload(log)
    expect((payload.v1 as any).finalScore).toBe(4.0)
    expect((payload.v1 as any).ratingScore).toBe(4)
  })
})

// ════════════════════════════════════════════════════════════════
// 7. warnings[] undefined entries removed
// ════════════════════════════════════════════════════════════════

describe('Sanitizer — warnings array', () => {
  it('undefined entries in warnings[] are removed', async () => {
    const log = makeLog({ warnings: ['valid warning', undefined as any, 'another'] })
    const payload = await getWrittenPayload(log)
    const warnings = payload.warnings as unknown[]
    expect(warnings).not.toContain(undefined)
    expect(warnings).toHaveLength(2)
    expect(warnings).toContain('valid warning')
    expect(warnings).toContain('another')
  })

  it('empty warnings[] written as empty array', async () => {
    const log     = makeLog({ warnings: [] })
    const payload = await getWrittenPayload(log)
    expect(payload.warnings).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════
// 8. Mixed valid/invalid differences[]
// ════════════════════════════════════════════════════════════════

describe('Sanitizer — mixed differences array', () => {
  it('valid diffs survive intact, invalid delta coerced', async () => {
    const log = makeLog({
      shadow: {
        ...BASE_SHADOW_RAN,
        comparison: {
          severity: 'major',
          differences: [
            { field: 'status',     v1: 'complete', v2: 'partial' },          // no delta
            { field: 'finalScore', v1: 4.0, v2: 3.0, delta: 1.0 },           // valid
            { field: 'ratingScore', v1: 4, v2: 3, delta: NaN },              // NaN
          ],
        },
      },
    })
    const payload = await getWrittenPayload(log)
    const diffs = payload.differences as Record<string, unknown>[]
    expect(diffs).toHaveLength(3)
    expect('delta' in diffs[0]).toBe(false)   // no delta on string diff
    expect(diffs[1].delta).toBe(1.0)           // valid preserved
    expect(diffs[2].delta).toBeNull()          // NaN → null
  })
})

// ════════════════════════════════════════════════════════════════
// 9. Required string fields preserved
// ════════════════════════════════════════════════════════════════

describe('Sanitizer — required fields preserved', () => {
  it('all required string fields are present in payload', async () => {
    const log     = makeLog()
    const payload = await getWrittenPayload(log)
    for (const field of ['userId','pharmacyId','month','role','profileId','source','computedAt','pipelineId']) {
      expect(payload[field]).toBeDefined()
      expect(typeof payload[field]).toBe('string')
    }
  })

  it('ran and severity booleans/strings preserved', async () => {
    const log     = makeLog()
    const payload = await getWrittenPayload(log)
    expect(payload.ran).toBe(true)
    expect(payload.severity).toBe('none')
  })
})

// ════════════════════════════════════════════════════════════════
// 12. Clean payload unchanged
// ════════════════════════════════════════════════════════════════

describe('Sanitizer — clean payload passthrough', () => {
  it('a fully valid payload is written with all fields intact', async () => {
    const log = makeLog({
      ledgerDocId: 'ledger-123',
      shadow: {
        ...BASE_SHADOW_RAN,
        comparison: {
          severity: 'minor',
          differences: [{ field: 'finalScore', v1: 4.0, v2: 3.99, delta: 0.01 }],
        },
      },
      warnings: ['No branch target found'],
    })
    const payload = await getWrittenPayload(log)
    expect(payload.ledgerDocId).toBe('ledger-123')
    expect((payload.differences as any[])[0].delta).toBe(0.01)
    expect(payload.warnings).toEqual(['No branch target found'])
  })
})
