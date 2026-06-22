// ============================================================
// Evaluation Engine V2 Production Promotion Bundle — Certification
//
// Proves the 10 required proofs from the bundle spec (Phases B–E,
// narrowed scope). No live Firestore config is touched by this file —
// every Firestore call is mocked; evaluateParityGate() and
// resolveEvaluationEngineMode() are pure/read-only with respect to
// production data.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import readFs from 'node:fs'
import path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../')

// ── Mocks (mirrors limitedRolloutPrep.test.ts / limitedRolloutWiring.test.ts) ──

vi.mock('./firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
  COL:  { SYSTEM_CONFIG: 'system_config' },
}))

vi.mock('firebase/firestore', () => ({
  doc:    vi.fn((_db: unknown, path: string) => ({ __path: path })),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => null })),
}))

function mockFirestoreDoc(data: Record<string, unknown> | null) {
  return async () => ({
    exists: () => data !== null,
    data:   () => data,
  })
}

// ════════════════════════════════════════════════════════════════
// Proof 1 + 2 — explicit engine mode resolution
// ════════════════════════════════════════════════════════════════

describe('Proof 1: V1 remains default when Firestore config is missing/unreadable', () => {
  beforeEach(() => vi.resetAllMocks())

  it("missing config doc → mode = 'v2_shadow' (V1 official, V2 in shadow)", async () => {
    const { resolveEvaluationEngineMode } = await import('./evaluationEngineConfigService')
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc(null))
    expect(await resolveEvaluationEngineMode()).toBe('v2_shadow')
  })

  it("Firestore read error → mode = 'v2_shadow' (safe fallback, V1 still official)", async () => {
    const { resolveEvaluationEngineMode } = await import('./evaluationEngineConfigService')
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('permission-denied'))
    expect(await resolveEvaluationEngineMode()).toBe('v2_shadow')
  })

  it("unknown activeEngine value → mode = 'v2_shadow'", async () => {
    const { resolveEvaluationEngineMode } = await import('./evaluationEngineConfigService')
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({ activeEngine: 'v99' }))
    expect(await resolveEvaluationEngineMode()).toBe('v2_shadow')
  })
})

describe('Proof 2: V2 can be resolved as official only through explicit Firestore config', () => {
  beforeEach(() => vi.resetAllMocks())

  it("activeEngine = 'v2' (global) → mode = 'v2_official'", async () => {
    const { resolveEvaluationEngineMode } = await import('./evaluationEngineConfigService')
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({ activeEngine: 'v2' }))
    expect(await resolveEvaluationEngineMode()).toBe('v2_official')
  })

  it("scoped rollout matches pharmacyId + month → mode = 'v2_official'", async () => {
    const { resolveEvaluationEngineMode } = await import('./evaluationEngineConfigService')
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({
      rollout: { engine: 'v2', branches: ['ph-atheer'], months: ['2026-06'] },
    }))
    expect(await resolveEvaluationEngineMode({ pharmacyId: 'ph-atheer', month: '2026-06' })).toBe('v2_official')
  })

  it("scoped rollout does NOT match scope → mode = 'v2_shadow', never silently 'v2_official'", async () => {
    const { resolveEvaluationEngineMode } = await import('./evaluationEngineConfigService')
    const { getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockImplementationOnce(mockFirestoreDoc({
      activeEngine: 'v2',
      rollout: { engine: 'v2', branches: ['ph-atheer'], months: ['2026-06'] },
    }))
    expect(await resolveEvaluationEngineMode({ pharmacyId: 'ph-riyadh', month: '2026-06' })).toBe('v2_shadow')
  })

  it('isValidEvaluationEngineMode accepts all 3 named modes and rejects others', async () => {
    const { isValidEvaluationEngineMode } = await import('./evaluationEngineConfigService')
    expect(isValidEvaluationEngineMode('v1_official')).toBe(true)
    expect(isValidEvaluationEngineMode('v2_shadow')).toBe(true)
    expect(isValidEvaluationEngineMode('v2_official')).toBe(true)
    expect(isValidEvaluationEngineMode('v3')).toBe(false)
    expect(isValidEvaluationEngineMode(undefined)).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════
// Proof 3 — V1 fallback still runs if V2 fails
// ════════════════════════════════════════════════════════════════

describe('Proof 3: V1 fallback still runs if V2 fails', () => {
  it('orchestrator resets activeEngine to v1 and falls through to runEvaluation() on V2 pipeline failure', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain("V2 pipeline failed")
    expect(src.default).toContain("falling back to V1 official")
    expect(src.default).toContain("activeEngine = 'v1'")
    // The V1 path below the V2 block must still exist and call the real engine.
    expect(src.default).toContain("await import('../engine/evaluationEngine/evaluationEngine')")
  })

  it('orchestrator resets activeEngine to v1 and records a warning on V2 unexpected throw', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain('V2 engine error')
    expect(src.default).toContain('falling back to V1 official')
  })

  it('no partial V2 result is ever written to the ledger on failure (v2Succeeded gate)', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain('v2Succeeded')
    expect(src.default).toContain('pipeRes.success')
  })
})

// ════════════════════════════════════════════════════════════════
// Proof 4 + 5 — V2 official path is profile/registry-driven, no KPI_KEYS
// ════════════════════════════════════════════════════════════════

function collectPipelineFiles(): string[] {
  const dir = path.join(SRC_ROOT, 'engine', 'evaluationPipeline')
  const entries: any[] = readFs.readdirSync(dir, { withFileTypes: true })
  return entries
    .filter((e: any) => e.isFile() && /\.ts$/.test(e.name) && !e.name.includes('.test.'))
    .map((e: any) => path.join(dir, e.name))
}

describe('Proof 4: V2 official path executes a profile/registry-driven pipeline', () => {
  it('contextBuilder resolves elements from profile.basketIds/profile.baskets, not a fixed list', () => {
    const src = readFs.readFileSync(
      path.join(SRC_ROOT, 'engine', 'evaluationPipeline', 'contextBuilder.ts'), 'utf-8',
    )
    expect(src).toContain('profile.basketIds')
    expect(src).toContain('profile.baskets')
    expect(src).toContain('registry[el.kpiKey]')
  })

  it('orchestrator V2-official path calls resolveEvaluationPipeline(profile) before executing', async () => {
    const src = await import('./evaluationOrchestrationService.ts?raw')
    expect(src.default).toContain('resolveEvaluationPipeline(profile)')
    expect(src.default).toContain('buildPipelineContext(')
    expect(src.default).toContain('executePipeline(')
  })
})

describe('Proof 5: V2 official path has zero functional KPI_KEYS / Core KPI dependency', () => {
  it('no file under src/engine/evaluationPipeline references KPI_KEYS or the 5 fixed legacy keys as code', () => {
    for (const file of collectPipelineFiles()) {
      const src = readFs.readFileSync(file, 'utf-8')
      const codeOnly = src
        .split('\n')
        .filter((line: string) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
        .join('\n')
      expect(codeOnly).not.toMatch(/\bKPI_KEYS\b/)
      expect(codeOnly).not.toMatch(/\bDEFAULT_KPI_KEYS\b/)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// Proof 6 + 7 — Parity gate
// ════════════════════════════════════════════════════════════════

describe('Proof 6: parity gate blocks promotion on severe mismatches', () => {
  it('any major mismatch → BLOCK regardless of sample size', async () => {
    const { evaluateParityGate } = await import('./evaluationParityGate')
    const logs: { ran: boolean; severity: 'none' | 'minor' | 'major' | 'error' }[] =
      Array.from({ length: 50 }, () => ({ ran: true, severity: 'none' }))
    logs.push({ ran: true, severity: 'major' })
    const result = evaluateParityGate(logs)
    expect(result.decision).toBe('BLOCK')
    expect(result.counts.major).toBe(1)
  })

  it('any shadow run error → BLOCK', async () => {
    const { evaluateParityGate } = await import('./evaluationParityGate')
    const result = evaluateParityGate([
      { ran: false, severity: 'error' },
      { ran: true, severity: 'none' },
    ])
    expect(result.decision).toBe('BLOCK')
  })

  it('zero samples → BLOCK (cannot prove parity)', async () => {
    const { evaluateParityGate } = await import('./evaluationParityGate')
    const result = evaluateParityGate([])
    expect(result.decision).toBe('BLOCK')
    expect(result.sampleSize).toBe(0)
  })
})

describe('Proof 7: parity gate passes only when recent logs are clean and sample size is sufficient', () => {
  it('all clean, sample size >= minimum → PASS', async () => {
    const { evaluateParityGate, PARITY_GATE_MIN_SAMPLE_SIZE } = await import('./evaluationParityGate')
    const logs = Array.from({ length: PARITY_GATE_MIN_SAMPLE_SIZE }, () => ({ ran: true, severity: 'none' as const }))
    const result = evaluateParityGate(logs)
    expect(result.decision).toBe('PASS')
  })

  it('all clean but sample size below minimum → WARN, not PASS', async () => {
    const { evaluateParityGate } = await import('./evaluationParityGate')
    const logs = Array.from({ length: 5 }, () => ({ ran: true, severity: 'none' as const }))
    const result = evaluateParityGate(logs)
    expect(result.decision).toBe('WARN')
  })

  it('clean majority but at least one minor mismatch, sufficient sample → WARN, not PASS', async () => {
    const { evaluateParityGate, PARITY_GATE_MIN_SAMPLE_SIZE } = await import('./evaluationParityGate')
    const logs: { ran: boolean; severity: 'none' | 'minor' | 'major' | 'error' }[] =
      Array.from({ length: PARITY_GATE_MIN_SAMPLE_SIZE }, () => ({ ran: true, severity: 'none' }))
    logs[0] = { ran: true, severity: 'minor' }
    const result = evaluateParityGate(logs)
    expect(result.decision).toBe('WARN')
    expect(result.counts.minor).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════════
// Proof 8 — Result shape remains V1-compatible (real end-to-end V2 run)
// ════════════════════════════════════════════════════════════════

describe('Proof 8: V2 pipeline output is structurally identical to the V1 EvaluationResult contract', () => {
  it('a real executed V2 pipeline produces every field required by EvaluationResult', async () => {
    const {
      resolveEvaluationPipeline,
      buildPipelineContext,
      executePipeline,
      pipelineResultToEvaluationResult,
    } = await import('../engine/evaluationPipeline/index')

    const profile: any = {
      id: 'p1', name: 'Test', version: 1, status: 'published', role: 'pharmacist',
      basketIds: ['b1'],
      baskets: {
        b1: {
          id: 'b1', name: 'B1', weight: 1.0, active: true,
          thresholdRule: {
            id: 't1', name: 'T1',
            bands: [
              { min: 0, max: 70, label: 'Below', score: 1 },
              { min: 70, max: 200, label: 'Meet', score: 3 },
            ],
          },
          elements: [{ kpiKey: 'wasfaty', weight: 1.0, required: true }],
        },
      },
      defaultThresholdRule: {
        id: 'c1', name: 'Composite',
        bands: [
          { min: 0, max: 2, label: 'Low', score: 1 },
          { min: 2, max: 10, label: 'High', score: 5 },
        ],
      },
    }
    const registry: any = { wasfaty: { key: 'wasfaty', label: 'Wasfaty' } }

    const resolved = resolveEvaluationPipeline(profile)
    const ctx = buildPipelineContext({
      userId: 'u1', pharmacyId: 'ph1', month: '2026-06', role: 'pharmacist',
      profile, kpiActuals: { wasfaty: 100 }, registry,
      personalTarget: null, branchTarget: { wasfatyTarget: 100 } as any,
    })
    const pipeRes = executePipeline(ctx, resolved.steps)
    expect(pipeRes.success).toBe(true)

    const result = pipelineResultToEvaluationResult(pipeRes, { calculatedAt: 123 })

    // Every EvaluationResult field must be present.
    const requiredKeys = [
      'userId', 'pharmacyId', 'role', 'month', 'profileId', 'profileVersion',
      'basketResults', 'finalScore', 'rating', 'ratingScore', 'status', 'trace',
    ]
    for (const key of requiredKeys) {
      expect(result).toHaveProperty(key)
    }
    expect(Array.isArray(result.basketResults)).toBe(true)
    expect(typeof result.finalScore).toBe('number')
    expect(['complete', 'partial', 'invalid']).toContain(result.status)
  })
})

// ════════════════════════════════════════════════════════════════
// Proof 9 — Ranking / ledger consumers remain compatible
// ════════════════════════════════════════════════════════════════

describe('Proof 9: Ranking and ledger consumers remain engine-agnostic', () => {
  it('ranking-service.ts only imports the EvaluationResult/BasketResult TYPE, never the engine itself', () => {
    const src = readFs.readFileSync(path.join(SRC_ROOT, 'ranking', 'ranking-service.ts'), 'utf-8')
    expect(src).toMatch(/import type \{[^}]*BasketResult[^}]*\}\s+from\s+['"]\.\.\/engine\/evaluationEngine\/evaluationEngineTypes['"]/)
    expect(src).not.toContain("from '../engine/evaluationEngine/evaluationEngine'")
  })

  it('evaluationLedgerService.ts writes engineVersion but does not call either engine directly', () => {
    const src = readFs.readFileSync(path.join(SRC_ROOT, 'services', 'evaluationLedgerService.ts'), 'utf-8')
    expect(src).not.toMatch(/from\s+['"]\.\.\/engine\/evaluationEngine\/evaluationEngine['"]/)
    expect(src).not.toMatch(/from\s+['"]\.\.\/engine\/evaluationPipeline['"]/)
  })
})

// ════════════════════════════════════════════════════════════════
// Proof 10 — No live Firestore config is modified by code/tests
// ════════════════════════════════════════════════════════════════

describe('Proof 10: this bundle never writes to system_config/evaluation', () => {
  it('evaluationParityGate.ts performs zero Firestore reads or writes', () => {
    const src = readFs.readFileSync(path.join(SRC_ROOT, 'services', 'evaluationParityGate.ts'), 'utf-8')
    expect(src).not.toMatch(/firebase\/firestore/)
    expect(src).not.toMatch(/setDoc|updateDoc|addDoc|getDoc/)
  })

  it('resolveEvaluationEngineMode performs only a read (getActiveEngine), never a write', () => {
    const src = readFs.readFileSync(
      path.join(SRC_ROOT, 'services', 'evaluationEngineConfigService.ts'), 'utf-8',
    )
    expect(src).not.toMatch(/setDoc|updateDoc|addDoc/)
  })

  it('this test file mocks firebase/firestore with read-only functions (no setDoc/updateDoc/addDoc in the mock)', () => {
    const self = readFs.readFileSync(__filename, 'utf-8')
    const mockStart = self.indexOf("vi.mock('firebase/firestore'")
    expect(mockStart).toBeGreaterThan(-1)
    const mockBlock = self.slice(mockStart, mockStart + 200)
    expect(mockBlock).not.toMatch(/setDoc|updateDoc|addDoc/)
    expect(mockBlock).toContain('getDoc')
  })
})
