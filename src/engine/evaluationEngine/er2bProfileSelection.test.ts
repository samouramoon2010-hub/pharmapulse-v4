// ============================================================
// Profile Selection Fix — Regression Tests
//
// Covers the ER-2B fix that separates:
//   - evaluated user's organisational role (ledger identity)
//   - evaluation profile applied (explicit selection)
//
// Ranking architecture note embedded in tests:
//   Future Ranking groups ledger documents by
//   profileId + profileVersion + month, NOT by userRole alone.
//
// Categories:
//   1. Orchestration — profileId explicit selection path
//   2. Orchestration — role-based fallback (no profileId)
//   3. Preflight — profileId shortcircuits role-based check
//   4. Ledger — userRole and profileId stored independently
//   5. Draft profile rejected
//   6. Scope guard — no ranking/coaching introduced
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDoc, getDocs, addDoc } from 'firebase/firestore'

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
    EVALUATION_RESULTS:  'evaluation_results',
  },
}))
vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  addDoc:          vi.fn(async () => ({ id: 'ledger-auto-id' })),
  updateDoc:       vi.fn(async () => {}),
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
import { DEFAULT_KPI_REGISTRY }           from '../../engine/kpiRegistry'
import { DEFAULT_THRESHOLD_RULE }         from '../../engine/evaluationRegistry/evaluationRegistryTypes'
import type { EvaluationProfile }         from '../../engine/evaluationRegistry/evaluationRegistryTypes'

const MONTH = '2026-01'
const UID   = 'uid-samir'
const PID   = 'ph-5074'

const PUBLISHED_PHARMACIST_PROFILE: EvaluationProfile = {
  id: 'profile-smarts-2026', name: 'SMARTS 2026', role: 'pharmacist',
  version: 1, status: 'published',
  effectiveFrom: '2026-01', effectiveTo: null,
  basketIds: ['guest'],
  baskets: {
    guest: {
      id: 'guest', name: 'Guest', weight: 1.0, active: true, sortOrder: 1,
      elements: [{ kpiKey: 'wasfaty', weight: 1.0, required: true }],
      thresholdRule: { ...DEFAULT_THRESHOLD_RULE },
    },
  },
  defaultThresholdRule: { ...DEFAULT_THRESHOLD_RULE },
  createdBy: null, createdAt: null, updatedAt: null,
  publishedAt: null, archivedAt: null, previousVersionId: null,
}

const DRAFT_PROFILE: EvaluationProfile = {
  ...PUBLISHED_PHARMACIST_PROFILE,
  id: 'profile-draft', name: 'Draft Profile', status: 'draft',
}

// ── 1. Explicit profileId path ────────────────────────────────

describe('Profile selection fix — explicit profileId overrides role lookup', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(addDoc).mockResolvedValue({ id: 'ledger-id' } as any)
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
  })

  it('when profileId provided, fetches profile by ID regardless of userRole', async () => {
    const profileSnap = { exists: () => true, id: PUBLISHED_PHARMACIST_PROFILE.id, data: () => PUBLISHED_PHARMACIST_PROFILE }
    const nullSnap    = { exists: () => false, data: () => null }
    // preflight: getDoc(profile), getDoc(branchTarget)
    // orchestrator: getDoc(profile), getDoc(branchTarget), getDoc(personalTarget)
    vi.mocked(getDoc)
      .mockResolvedValueOnce(profileSnap as any)  // preflight profile check
      .mockResolvedValueOnce(nullSnap as any)      // preflight branch target
      .mockResolvedValueOnce(profileSnap as any)  // orchestrator profile fetch
      .mockResolvedValueOnce(nullSnap as any)      // orchestrator branch target
      .mockResolvedValueOnce(nullSnap as any)      // orchestrator personal target

    const { runEvaluationForUserMonth } = await import('../../services/evaluationOrchestrationService')
    const outcome = await runEvaluationForUserMonth({
      userId: UID, pharmacyId: PID, month: MONTH,
      userRole:    'manager',                          // user is a manager
      profileId:   PUBLISHED_PHARMACIST_PROFILE.id,   // but explicitly selecting pharmacist profile
      registry:    DEFAULT_KPI_REGISTRY,
      calculatedBy: 'admin-uid', actorRole: 'admin',
    })
    // Profile used should be the pharmacist profile, not a manager profile
    expect(outcome.profile.id).toBe(PUBLISHED_PHARMACIST_PROFILE.id)
    expect(outcome.profile.role).toBe('pharmacist')
  })

  it('manager user evaluated using pharmacist profile does not throw', async () => {
    const profileSnap = { exists: () => true, id: PUBLISHED_PHARMACIST_PROFILE.id, data: () => PUBLISHED_PHARMACIST_PROFILE }
    const nullSnap    = { exists: () => false, data: () => null }
    vi.mocked(getDoc)
      .mockResolvedValueOnce(profileSnap as any)  // preflight
      .mockResolvedValueOnce(nullSnap as any)
      .mockResolvedValueOnce(profileSnap as any)  // orchestrator
      .mockResolvedValueOnce(nullSnap as any)
      .mockResolvedValueOnce(nullSnap as any)

    const { runEvaluationForUserMonth } = await import('../../services/evaluationOrchestrationService')
    await expect(
      runEvaluationForUserMonth({
        userId: UID, pharmacyId: PID, month: MONTH,
        userRole: 'manager', profileId: PUBLISHED_PHARMACIST_PROFILE.id,
        registry: DEFAULT_KPI_REGISTRY,
        calculatedBy: 'admin', actorRole: 'admin',
      })
    ).resolves.toBeDefined()
  })

  it('throws when profileId is provided but profile does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => null } as any)

    const { runEvaluationForUserMonth } = await import('../../services/evaluationOrchestrationService')
    await expect(
      runEvaluationForUserMonth({
        userId: UID, pharmacyId: PID, month: MONTH,
        userRole: 'manager', profileId: 'nonexistent-id',
        registry: DEFAULT_KPI_REGISTRY,
        calculatedBy: 'admin', actorRole: 'admin',
      })
    ).rejects.toThrow('not found')
  })
})

// ── 2. Role-based fallback (no profileId) ─────────────────────

describe('Profile selection fix — role-based fallback when no profileId', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(addDoc).mockResolvedValue({ id: 'ledger-id' } as any)
  })

  it('when profileId absent, uses fetchActiveProfileForMonth(userRole, month)', async () => {
    // preflight: getDocs for role-based profile check (finds it)
    // orchestrator: getDocs again for role-based fetch
    vi.mocked(getDocs)
      .mockResolvedValueOnce({
        docs: [{ id: PUBLISHED_PHARMACIST_PROFILE.id, data: () => PUBLISHED_PHARMACIST_PROFILE }],
      } as any)  // preflight profile check
      .mockResolvedValueOnce({
        docs: [{ id: PUBLISHED_PHARMACIST_PROFILE.id, data: () => PUBLISHED_PHARMACIST_PROFILE }],
      } as any)  // orchestrator profile fetch
    // fetchBranchTarget + fetchMyPersonalTarget
    vi.mocked(getDoc)
      .mockResolvedValueOnce({ exists: () => false, data: () => null } as any)
      .mockResolvedValueOnce({ exists: () => false, data: () => null } as any)
      .mockResolvedValueOnce({ exists: () => false, data: () => null } as any)

    const { runEvaluationForUserMonth } = await import('../../services/evaluationOrchestrationService')
    const outcome = await runEvaluationForUserMonth({
      userId: UID, pharmacyId: PID, month: MONTH,
      userRole: 'pharmacist',  // no profileId → uses role
      registry: DEFAULT_KPI_REGISTRY,
      calculatedBy: 'admin', actorRole: 'admin',
    })
    expect(outcome.profile.role).toBe('pharmacist')
  })

  it('when no profileId and no matching profile, throws role-based error', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => null } as any)

    const { runEvaluationForUserMonth } = await import('../../services/evaluationOrchestrationService')
    await expect(
      runEvaluationForUserMonth({
        userId: UID, pharmacyId: PID, month: MONTH,
        userRole: 'manager',  // no profile for manager role
        registry: DEFAULT_KPI_REGISTRY,
        calculatedBy: 'admin', actorRole: 'admin',
      })
    ).rejects.toThrow('No published evaluation profile found for role "manager"')
  })
})

// ── 3. Preflight with profileId ───────────────────────────────

describe('Profile selection fix — preflightEvaluationCheck with profileId', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
  })

  it('preflight passes when profileId points to a published profile', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce({
        exists: () => true, id: PUBLISHED_PHARMACIST_PROFILE.id,
        data: () => PUBLISHED_PHARMACIST_PROFILE,
      } as any)
      .mockResolvedValueOnce({ exists: () => false, data: () => null } as any) // branch target

    const { preflightEvaluationCheck } = await import('../../services/evaluationActualsService')
    const result = await preflightEvaluationCheck(
      UID, PID, 'manager', MONTH, PUBLISHED_PHARMACIST_PROFILE.id
    )
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('preflight fails when profileId points to a draft profile', async () => {
    vi.mocked(getDoc)
      .mockResolvedValueOnce({
        exists: () => true, id: DRAFT_PROFILE.id,
        data: () => DRAFT_PROFILE,
      } as any)

    const { preflightEvaluationCheck } = await import('../../services/evaluationActualsService')
    const result = await preflightEvaluationCheck(
      UID, PID, 'manager', MONTH, DRAFT_PROFILE.id
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('draft'))).toBe(true)
  })

  it('preflight skips role-based profile check when profileId is provided', async () => {
    // If role-based check ran, it would use getDocs and find nothing → error
    // With profileId, getDoc is used instead
    vi.mocked(getDoc)
      .mockResolvedValueOnce({
        exists: () => true, id: PUBLISHED_PHARMACIST_PROFILE.id,
        data: () => PUBLISHED_PHARMACIST_PROFILE,
      } as any)
      .mockResolvedValueOnce({ exists: () => false, data: () => null } as any) // branch target

    const { preflightEvaluationCheck } = await import('../../services/evaluationActualsService')
    const result = await preflightEvaluationCheck(
      UID, PID, 'manager', MONTH, PUBLISHED_PHARMACIST_PROFILE.id
    )
    // Would fail without profileId because no manager profile exists
    expect(result.valid).toBe(true)
  })
})

// ── 4. Ledger stores role and profileId independently ────────

describe('Profile selection fix — ledger stores userRole and profileId independently', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(addDoc).mockResolvedValue({ id: 'ledger-id' } as any)
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
  })

  it('ledger doc stores the evaluated user role (manager), not the profile role (pharmacist)', async () => {
    const profileSnap = { exists: () => true, id: PUBLISHED_PHARMACIST_PROFILE.id, data: () => PUBLISHED_PHARMACIST_PROFILE }
    const nullSnap    = { exists: () => false, data: () => null }
    vi.mocked(getDoc)
      .mockResolvedValueOnce(profileSnap as any)
      .mockResolvedValueOnce(nullSnap as any)
      .mockResolvedValueOnce(profileSnap as any)
      .mockResolvedValueOnce(nullSnap as any)
      .mockResolvedValueOnce(nullSnap as any)

    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'ledger-id' }
    })

    const { runEvaluationForUserMonth } = await import('../../services/evaluationOrchestrationService')
    await runEvaluationForUserMonth({
      userId: UID, pharmacyId: PID, month: MONTH,
      userRole: 'manager', profileId: PUBLISHED_PHARMACIST_PROFILE.id,
      registry: DEFAULT_KPI_REGISTRY,
      calculatedBy: 'admin', actorRole: 'admin',
    })

    const doc = payloads[0] as Record<string, unknown>
    // role in ledger = evaluated user's actual role
    expect(doc.role).toBe('manager')
    // profileId in ledger = the profile that was applied
    expect(doc.profileId).toBe(PUBLISHED_PHARMACIST_PROFILE.id)
    // These must be different — this is the key architectural invariant
    expect(doc.role).not.toBe((doc.profileSnapshot as EvaluationProfile).role)
  })

  it('ledger doc stores profileVersion from the selected profile', async () => {
    const profileSnap = { exists: () => true, id: PUBLISHED_PHARMACIST_PROFILE.id, data: () => PUBLISHED_PHARMACIST_PROFILE }
    const nullSnap    = { exists: () => false, data: () => null }
    vi.mocked(getDoc)
      .mockResolvedValueOnce(profileSnap as any)
      .mockResolvedValueOnce(nullSnap as any)
      .mockResolvedValueOnce(profileSnap as any)
      .mockResolvedValueOnce(nullSnap as any)
      .mockResolvedValueOnce(nullSnap as any)

    const payloads: unknown[] = []
    vi.mocked(addDoc).mockImplementationOnce(async (_col, data) => {
      payloads.push(data); return { id: 'ledger-id' }
    })

    const { runEvaluationForUserMonth } = await import('../../services/evaluationOrchestrationService')
    await runEvaluationForUserMonth({
      userId: UID, pharmacyId: PID, month: MONTH,
      userRole: 'manager', profileId: PUBLISHED_PHARMACIST_PROFILE.id,
      registry: DEFAULT_KPI_REGISTRY,
      calculatedBy: 'admin', actorRole: 'admin',
    })

    const doc = payloads[0] as Record<string, unknown>
    expect(doc.profileVersion).toBe(PUBLISHED_PHARMACIST_PROFILE.version)
  })

  // Ranking architecture assertion:
  // Ranking must group by profileId+profileVersion+month, NOT by userRole alone.
  it('ranking grouping key = profileId+profileVersion+month (not userRole)', () => {
    // This test documents the ranking contract for future implementation.
    // Two ledger docs from the same month with the same profileId+version
    // are directly comparable in ranking, regardless of their userRole field.
    const doc1 = { userId: 'u1', userRole: 'manager',    profileId: 'p1', profileVersion: 1, month: '2026-01' }
    const doc2 = { userId: 'u2', userRole: 'pharmacist',  profileId: 'p1', profileVersion: 1, month: '2026-01' }
    const doc3 = { userId: 'u3', userRole: 'pharmacist',  profileId: 'p2', profileVersion: 1, month: '2026-01' }

    // doc1 and doc2 are comparable (same profile version)
    expect(doc1.profileId + doc1.profileVersion + doc1.month)
      .toBe(doc2.profileId + doc2.profileVersion + doc2.month)

    // doc2 and doc3 are NOT comparable (different profiles)
    expect(doc2.profileId + doc2.profileVersion + doc2.month)
      .not.toBe(doc3.profileId + doc3.profileVersion + doc3.month)
  })
})

// ── 5. Draft profile rejected ─────────────────────────────────

describe('Profile selection fix — draft profile is rejected', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as any)
  })

  it('throws when explicit profileId points to a draft profile', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true, id: DRAFT_PROFILE.id,
      data: () => DRAFT_PROFILE,
    } as any)

    const { runEvaluationForUserMonth } = await import('../../services/evaluationOrchestrationService')
    await expect(
      runEvaluationForUserMonth({
        userId: UID, pharmacyId: PID, month: MONTH,
        userRole: 'pharmacist', profileId: DRAFT_PROFILE.id,
        registry: DEFAULT_KPI_REGISTRY,
        calculatedBy: 'admin', actorRole: 'admin',
      })
    ).rejects.toThrow('draft')
  })

  it('profile dropdown (source) only exposes published profiles', async () => {
    // Verify subscribePublishedProfiles query filters to status=published
    const src = await import('../../services/evaluationRegistryService.ts?raw')
    const block = src.default
      .split('export function subscribePublishedProfiles')[1]
      ?.split('export function')[0] ?? ''
    expect(block).toContain("'published'")
    expect(block).toContain("status")
  })
})

// ── 6. Scope guard ────────────────────────────────────────────

describe('Profile selection fix — scope guard', () => {
  it('orchestration service has no ranking logic', async () => {
    const src = await import('../../services/evaluationOrchestrationService.ts?raw')
    expect(src.default).not.toMatch(/^export function.*(rank|leaderboard|coaching)/im)
    expect(src.default).not.toMatch(/computeRank|buildLeaderboard/i)
  })

  it('no new ranking/coaching routes added', async () => {
    const src = await import('../../App.jsx?raw')
    // /admin/rankings was added in RF-1B (approved route) — guard relaxed
    expect(src.default).not.toContain('/ranking-engine')
    expect(src.default).not.toContain('/leaderboard')
    expect(src.default).not.toContain('/coaching')
  })

  it('evaluation engine is not imported or modified by this fix', async () => {
    const src = await import('../../services/evaluationOrchestrationService.ts?raw')
    // Engine is only dynamically imported inside the function — not at module level
    expect(src.default).toContain("import('../engine/evaluationEngine/evaluationEngine')")
    // Static-level import of the engine would indicate module coupling
    // Type-only imports from evaluationEngineTypes are safe — they don't create runtime coupling
    // Guard: no runtime (value) import of evaluationEngine.ts at module top level
    expect(src.default).not.toMatch(/^import \{[^}]*runEvaluation[^}]*\}.*evaluationEngine(?!Types)/m)
  })
})
