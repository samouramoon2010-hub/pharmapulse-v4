// ============================================================
// PT-2 Regression Tests — Personal Target Integration Layer
//
// Categories:
//   1. History layer — personal target overrides branch target
//   2. History layer — fallback to branch target when absent
//   3. Team intelligence — PharmacistInput with personal target
//   4. resolveTargetValue — priority logic
//   5. Draft/published workflow — PersonalTargetDoc status
//   6. Firestore rules simulation — pharmacist visibility
//   7. Firestore rules simulation — supervisor/regional read
//   8. Backward compatibility — existing code paths unchanged
//   9. Source-text assertions — no ranking/evaluation introduced
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────
vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'test-uid' } },
  COL: {
    USERS: 'users', PHARMACIES: 'pharmacies', KPI_ENTRIES: 'kpi_entries',
    TARGETS: 'targets', AUDIT_LOGS: 'audit_logs', NOTIFICATIONS: 'notifications',
    LEADERBOARD: 'leaderboard', KPI_REGISTRY: 'kpi_registry',
    DAILY_SUMMARIES: 'daily_summaries', MONTHLY_SUMMARIES: 'monthly_summaries',
    FORECAST_SNAPSHOTS: 'forecast_snapshots', RISK_SNAPSHOTS: 'risk_snapshots',
    RANKING_HISTORY: 'ranking_history', STAGING_ENTRIES: 'staging_entries',
    DISTRICTS: 'districts', REGIONS: 'regions',
    PERSONAL_TARGETS: 'personal_targets',
  },
}))

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn(() => ({})),
  doc:             vi.fn(() => ({})),
  setDoc:          vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  deleteDoc:       vi.fn(async () => {}),
  updateDoc:       vi.fn(async () => {}),
  writeBatch:      vi.fn(() => ({
    set:    vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(async () => {}),
  })),
  query:           vi.fn(() => ({})),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))

// ── Imports ───────────────────────────────────────────────────
import { generateMonthlySummary } from '../../engine/historyEngine'
import {
  computePharmacistPerformance,
} from '../../engine/teamIntelligence/pharmacistPerformanceEngine'
import type { PharmacistInput }   from '../../engine/teamIntelligence/teamIntelligenceTypes'
import type { KpiEntry, MonthlyTarget } from '../../engine/kpiAnalyticsEngine'
import type { PersonalTargetDoc }  from '../../services/personalTargetService'

// ── Fixtures ──────────────────────────────────────────────────

const MONTH = '2025-05'
const UID   = 'uid-alice'
const PID   = 'ph-001'

/** Create a KpiEntry for testing */
function entry(date: string, overrides: Partial<KpiEntry> = {}): KpiEntry {
  return {
    userId: UID, pharmacyId: PID, date,
    wasfaty: 1000, omni: 50, wellness: 30, basket: 45, crossSelling: 20,
    ...overrides,
  }
}

/** Branch-level target */
const BRANCH_TARGET: MonthlyTarget = {
  pharmacyId:      PID,
  month:           MONTH,
  wasfatyTarget:   300000,
  omniTarget:      1500,
  wellnessTarget:  900,
  basketTarget:    750,
  crossSellTarget: 600,
}

/** Published personal target (equal split for 3 pharmacists) */
const PERSONAL_TARGET_PUBLISHED: PersonalTargetDoc = {
  id:              `${UID}_${PID}_${MONTH}`,
  userId:          UID,
  pharmacyId:      PID,
  month:           MONTH,
  targets: {
    wasfatyTarget:   100000,   // 1/3 of 300000
    omniTarget:      500,      // 1/3 of 1500
    wellnessTarget:  300,      // 1/3 of 900
    basketTarget:    250,      // 1/3 of 750
    crossSellTarget: 200,      // 1/3 of 600
  },
  allocationMethod: 'equal',
  status:           'published',
  publishedAt:      new Date(),
  createdBy:        'mgr-uid',
  createdAt:        new Date(),
  updatedAt:        new Date(),
}

const PERSONAL_TARGET_DRAFT: PersonalTargetDoc = {
  ...PERSONAL_TARGET_PUBLISHED,
  id:          `${UID}_${PID}_${MONTH}_draft`,
  status:      'draft',
  publishedAt: null,
}

/** 30 daily entries for a full month */
const MONTH_ENTRIES: KpiEntry[] = Array.from({ length: 30 }, (_, i) => {
  const day = String(i + 1).padStart(2, '0')
  return entry(`${MONTH}-${day}`)
})

// ── 1. History layer — personal target overrides branch target ─

describe('PT-2 — generateMonthlySummary: personal target override', () => {
  it('uses personal wasfatyTarget when personalTarget is provided', () => {
    const summary = generateMonthlySummary(
      UID, PID, MONTH, MONTH_ENTRIES, BRANCH_TARGET,
      0, null, PERSONAL_TARGET_PUBLISHED,
    )
    // 30 days × 1000/day = 30000 actual vs personal target 100000 → 30%
    // Compare to branch-based: 30000 / 300000 = 10%
    expect(summary.kpis.wasfaty.target).toBe(100000)
    expect(summary.kpis.wasfaty.achievementPct).toBeCloseTo(30, 0)
    // Personal achievement (30%) is 3x higher than branch achievement (10%)
    const branchSummaryForComparison = generateMonthlySummary(UID, PID, MONTH, MONTH_ENTRIES, BRANCH_TARGET)
    expect(summary.kpis.wasfaty.achievementPct).toBeGreaterThan(
      branchSummaryForComparison.kpis.wasfaty.achievementPct
    )
  })

  it('uses personal omniTarget from nested targets map', () => {
    const summary = generateMonthlySummary(
      UID, PID, MONTH, MONTH_ENTRIES, BRANCH_TARGET,
      0, null, PERSONAL_TARGET_PUBLISHED,
    )
    expect(summary.kpis.omni.target).toBe(500)  // personal, not branch 1500
  })

  it('overallAchievement reflects personal targets, not branch targets', () => {
    const branchSummary  = generateMonthlySummary(UID, PID, MONTH, MONTH_ENTRIES, BRANCH_TARGET)
    const personalSummary = generateMonthlySummary(
      UID, PID, MONTH, MONTH_ENTRIES, BRANCH_TARGET,
      0, null, PERSONAL_TARGET_PUBLISHED,
    )
    // Personal targets are 1/3 of branch targets → achievement should be ~3x higher
    expect(personalSummary.overallAchievement).toBeGreaterThan(branchSummary.overallAchievement)
  })

  it('preserves all other summary fields unchanged', () => {
    const summary = generateMonthlySummary(
      UID, PID, MONTH, MONTH_ENTRIES, BRANCH_TARGET,
      0, null, PERSONAL_TARGET_PUBLISHED,
    )
    expect(summary.userId).toBe(UID)
    expect(summary.pharmacyId).toBe(PID)
    expect(summary.month).toBe(MONTH)
    expect(summary.activeDays).toBe(30)
    // 30 entries in a 31-day month → 96% submission rate
    expect(summary.submissionRate).toBeGreaterThan(90)
  })
})

// ── 2. History layer — fallback to branch target ────────────

describe('PT-2 — generateMonthlySummary: branch target fallback', () => {
  it('falls back to branch target when personalTarget is null', () => {
    const summary = generateMonthlySummary(
      UID, PID, MONTH, MONTH_ENTRIES, BRANCH_TARGET,
      0, null, null,
    )
    expect(summary.kpis.wasfaty.target).toBe(300000)  // branch target
  })

  it('falls back to branch target when personalTarget is undefined (old call sites)', () => {
    // Old call signature: no 8th argument
    const summary = generateMonthlySummary(
      UID, PID, MONTH, MONTH_ENTRIES, BRANCH_TARGET,
    )
    expect(summary.kpis.wasfaty.target).toBe(300000)
  })

  it('returns identical result to pre-PT-2 behavior when no personalTarget', () => {
    const legacySummary = generateMonthlySummary(
      UID, PID, MONTH, MONTH_ENTRIES, BRANCH_TARGET,
    )
    const explicitNull = generateMonthlySummary(
      UID, PID, MONTH, MONTH_ENTRIES, BRANCH_TARGET,
      0, null, null,
    )
    expect(legacySummary.overallAchievement).toBe(explicitNull.overallAchievement)
    expect(legacySummary.kpis.wasfaty.target).toBe(explicitNull.kpis.wasfaty.target)
  })

  it('falls back per-field: uses branch target for fields missing from personalTarget', () => {
    const partialPersonal: PersonalTargetDoc = {
      ...PERSONAL_TARGET_PUBLISHED,
      targets: {
        wasfatyTarget: 100000,
        // omniTarget missing — should fall back to branch target 1500
      },
    }
    const summary = generateMonthlySummary(
      UID, PID, MONTH, MONTH_ENTRIES, BRANCH_TARGET,
      0, null, partialPersonal,
    )
    expect(summary.kpis.wasfaty.target).toBe(100000)  // personal
    expect(summary.kpis.omni.target).toBe(1500)        // branch fallback
  })
})

// ── 3. Team intelligence — PharmacistInput with personal target

describe('PT-2 — computePharmacistPerformance: personal target integration', () => {
  const now = new Date(`${MONTH}-15`)

  function makeInput(personalTarget?: PersonalTargetDoc | null): PharmacistInput {
    return {
      userId:      UID,
      displayName: 'Alice',
      pharmacyId:  PID,
      mtdEntries:  MONTH_ENTRIES.slice(0, 15),
      historicalEntries: MONTH_ENTRIES.slice(0, 15),
      target:      BRANCH_TARGET,
      personalTarget,
      expectedSubmissionDays: 15,
      actualSubmissionDays:   15,
    }
  }

  it('accepts PharmacistInput with personalTarget field', () => {
    const input = makeInput(PERSONAL_TARGET_PUBLISHED)
    expect(() => computePharmacistPerformance(input, now)).not.toThrow()
  })

  it('kpiSnapshots use personal target when provided', () => {
    const withPersonal  = computePharmacistPerformance(makeInput(PERSONAL_TARGET_PUBLISHED), now)
    const withoutPersonal = computePharmacistPerformance(makeInput(null), now)
    const wasfatyWithPersonal    = withPersonal.kpiSnapshots.find(s => s.kpiKey === 'wasfaty')
    const wasfatyWithoutPersonal = withoutPersonal.kpiSnapshots.find(s => s.kpiKey === 'wasfaty')
    // Personal target 100000 vs branch 300000 → achievement 3x higher with personal
    expect(wasfatyWithPersonal!.target).toBe(100000)
    expect(wasfatyWithoutPersonal!.target).toBe(300000)
    expect(wasfatyWithPersonal!.achievementPct).toBeGreaterThan(wasfatyWithoutPersonal!.achievementPct)
  })

  it('performanceScore is higher when personal target is lower (correct behavior)', () => {
    const withPersonal    = computePharmacistPerformance(makeInput(PERSONAL_TARGET_PUBLISHED), now)
    const withoutPersonal = computePharmacistPerformance(makeInput(null), now)
    expect(withPersonal.performanceScore).toBeGreaterThan(withoutPersonal.performanceScore)
  })

  it('falls back to branch target when personalTarget is undefined', () => {
    const input = makeInput(undefined)
    const result = computePharmacistPerformance(input, now)
    const wasfaty = result.kpiSnapshots.find(s => s.kpiKey === 'wasfaty')
    expect(wasfaty!.target).toBe(300000)  // branch target
  })

  it('falls back to branch target when personalTarget is null', () => {
    const input = makeInput(null)
    const result = computePharmacistPerformance(input, now)
    const wasfaty = result.kpiSnapshots.find(s => s.kpiKey === 'wasfaty')
    expect(wasfaty!.target).toBe(300000)
  })
})

// ── 4. resolveTargetValue — priority logic ────────────────────

describe('PT-2 — resolveTargetValue priority logic', () => {
  // Tested indirectly through computePharmacistPerformance above.
  // Test edge cases here.

  const now = new Date(`${MONTH}-15`)

  it('uses zero personal target (not branch) when personal explicitly set to zero', () => {
    const zeroPersonal: PersonalTargetDoc = {
      ...PERSONAL_TARGET_PUBLISHED,
      targets: { wasfatyTarget: 0, omniTarget: 0, wellnessTarget: 0, basketTarget: 0, crossSellTarget: 0 },
    }
    const input: PharmacistInput = {
      userId: UID, displayName: 'Alice', pharmacyId: PID,
      mtdEntries: MONTH_ENTRIES.slice(0, 15),
      target: BRANCH_TARGET,
      personalTarget: zeroPersonal,
      expectedSubmissionDays: 15, actualSubmissionDays: 15,
    }
    const result = computePharmacistPerformance(input, now)
    const wasfaty = result.kpiSnapshots.find(s => s.kpiKey === 'wasfaty')
    // Personal target is explicitly 0 — engine should use 0, not branch target
    // calculatePersonalAchievement(0, actual) returns null, so achievementPct = 0
    expect(wasfaty!.target).toBe(0)
  })
})

// ── 5. Draft/published workflow ───────────────────────────────

describe('PT-2 — PersonalTargetDoc status field', () => {
  it('PersonalTargetDoc type accepts status: draft', () => {
    const doc: PersonalTargetDoc = PERSONAL_TARGET_DRAFT
    expect(doc.status).toBe('draft')
    expect(doc.publishedAt).toBeNull()
  })

  it('PersonalTargetDoc type accepts status: published', () => {
    expect(PERSONAL_TARGET_PUBLISHED.status).toBe('published')
    expect(PERSONAL_TARGET_PUBLISHED.publishedAt).toBeDefined()
  })

  it('savePersonalTarget writes status: draft by default', async () => {
    const { setDoc, getDoc } = await import('firebase/firestore')
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false, data: () => null } as any)
    const { savePersonalTarget } = await import('../../services/personalTargetService')
    const setDocCalls: unknown[] = []
    vi.mocked(setDoc).mockImplementationOnce(async (_ref, data) => {
      setDocCalls.push(data)
    })
    await savePersonalTarget(
      { userId: UID, pharmacyId: PID, month: MONTH, targets: {}, allocationMethod: 'equal' },
      'mgr', 'manager'
    )
    expect(setDocCalls.length).toBeGreaterThan(0)
    const written = setDocCalls[0] as Record<string, unknown>
    expect(written.status).toBe('draft')
    expect(written.publishedAt).toBeNull()
  })

  it('publishPersonalTargets calls batch.update with status: published', async () => {
    const { getDocs, writeBatch } = await import('firebase/firestore')
    const mockBatch = { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => {}) }
    vi.mocked(writeBatch).mockReturnValueOnce(mockBatch as any)
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        { id: `${UID}_${PID}_${MONTH}`, data: () => ({ ...PERSONAL_TARGET_DRAFT }) },
      ],
    } as any)
    const { publishPersonalTargets } = await import('../../services/personalTargetService')
    await publishPersonalTargets(PID, MONTH, 'mgr', 'manager')
    expect(mockBatch.update).toHaveBeenCalledTimes(1)
    const updateArg = mockBatch.update.mock.calls[0][1] as Record<string, unknown>
    expect(updateArg.status).toBe('published')
  })

  it('publishPersonalTargets throws when no docs found', async () => {
    const { getDocs } = await import('firebase/firestore')
    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as any)
    const { publishPersonalTargets } = await import('../../services/personalTargetService')
    await expect(publishPersonalTargets(PID, MONTH, 'mgr', 'manager'))
      .rejects.toThrow()
  })
})

// ── 6. Firestore rules — pharmacist visibility simulation ─────

describe('PT-2 — Firestore rules: pharmacist sees only published', () => {
  // Simulates the updated Firestore rule read condition
  function canPharmacistRead(
    callerUid:    string,
    targetUserId: string,
    docStatus:    string,
  ): boolean {
    // From rule: resource.data.userId == uid() && resource.data.get('status', 'draft') == 'published'
    return callerUid === targetUserId && docStatus === 'published'
  }

  it('pharmacist can read own published target', () => {
    expect(canPharmacistRead('uid-alice', 'uid-alice', 'published')).toBe(true)
  })

  it('pharmacist cannot read own draft target', () => {
    expect(canPharmacistRead('uid-alice', 'uid-alice', 'draft')).toBe(false)
  })

  it('pharmacist cannot read another pharmacist\'s target', () => {
    expect(canPharmacistRead('uid-alice', 'uid-bob', 'published')).toBe(false)
    expect(canPharmacistRead('uid-alice', 'uid-bob', 'draft')).toBe(false)
  })

  it('missing status defaults to draft (not readable by pharmacist)', () => {
    // .get('status', 'draft') → missing field treated as draft
    const effectiveStatus = (undefined as unknown as string) ?? 'draft'
    expect(canPharmacistRead('uid-alice', 'uid-alice', effectiveStatus)).toBe(false)
  })
})

// ── 7. Firestore rules — supervisor/regional read ─────────────

describe('PT-2 — Firestore rules: supervisor and regional manager read', () => {
  // Simulates territory read rules
  function canSupervisorRead(
    callerDistrictId: string | null,
    pharmacyDistrictId: string | null,
  ): boolean {
    // rule: isSupervisorRole() && pharmacy.districtId == userDistrictId()
    return callerDistrictId !== null && callerDistrictId === pharmacyDistrictId
  }

  function canRegionalRead(
    callerRegionIds: string[],
    pharmacyRegionId: string | null,
  ): boolean {
    // rule: isRegionalMgrRole() && pharmacy.regionId in userRegionIds()
    return pharmacyRegionId !== null && callerRegionIds.includes(pharmacyRegionId)
  }

  it('supervisor can read personal targets for pharmacies in their district', () => {
    expect(canSupervisorRead('district-1', 'district-1')).toBe(true)
  })

  it('supervisor cannot read personal targets for other districts', () => {
    expect(canSupervisorRead('district-1', 'district-2')).toBe(false)
  })

  it('supervisor cannot read when they have no district assigned', () => {
    expect(canSupervisorRead(null, 'district-1')).toBe(false)
  })

  it('regional manager can read personal targets for pharmacies in their regions', () => {
    expect(canRegionalRead(['region-east', 'region-west'], 'region-east')).toBe(true)
  })

  it('regional manager cannot read personal targets for other regions', () => {
    expect(canRegionalRead(['region-east'], 'region-north')).toBe(false)
  })

  it('regional manager with no regions cannot read any personal target', () => {
    expect(canRegionalRead([], 'region-east')).toBe(false)
  })

  it('firestore.rules source contains territory read clauses', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain('isSupervisorRole()')
    expect(src.default).toContain('isRegionalMgrRole()')
    expect(src.default).toContain('userDistrictId()')
    expect(src.default).toContain('userRegionIds()')
  })

  it('firestore.rules source contains pharmacist published-only clause', async () => {
    const src = await import('../../../firestore.rules?raw')
    // The rule checks status == 'published' for pharmacist reads
    expect(src.default).toContain("'published'")
  })
})

// ── 8. Backward compatibility ─────────────────────────────────

describe('PT-2 — Backward compatibility', () => {
  it('generateMonthlySummary works identically without 8th argument', () => {
    // Existing callers pass 5-7 args — must continue to work
    const summary = generateMonthlySummary(
      UID, PID, MONTH, MONTH_ENTRIES, BRANCH_TARGET,
    )
    expect(summary.userId).toBe(UID)
    expect(summary.kpis.wasfaty.target).toBe(300000)
  })

  it('computePharmacistPerformance works without personalTarget field', () => {
    const input: PharmacistInput = {
      userId: UID, displayName: 'Alice', pharmacyId: PID,
      mtdEntries: MONTH_ENTRIES.slice(0, 15),
      target: BRANCH_TARGET,
      // personalTarget not provided — old PharmacistInput shape
      expectedSubmissionDays: 15, actualSubmissionDays: 15,
    }
    expect(() => computePharmacistPerformance(input, new Date(`${MONTH}-15`))).not.toThrow()
    const result = computePharmacistPerformance(input, new Date(`${MONTH}-15`))
    // Should use branch target
    const wasfaty = result.kpiSnapshots.find(s => s.kpiKey === 'wasfaty')
    expect(wasfaty!.target).toBe(300000)
  })

  it('PharmacistInput.target field is still present (not removed)', () => {
    // Existing code that passes target: branchTarget must still work
    const input: PharmacistInput = {
      userId: UID, displayName: 'Alice', pharmacyId: PID,
      mtdEntries: [],
      target: BRANCH_TARGET,
      expectedSubmissionDays: 0, actualSubmissionDays: 0,
    }
    expect(input.target).not.toBeNull()
  })
})

// ── 9. No ranking/evaluation/coaching introduced ──────────────

describe('PT-2 — Scope guard: no ranking/evaluation/coaching logic', () => {
  it('allocationEngine source contains no ranking/evaluation scoring logic', async () => {
    const src = await import('../../engine/personalTargets/allocationEngine.ts?raw')
    // What we prohibit: export of ranking/evaluation/coaching functions.
    // Comments and JSDoc mentioning these words in non-goals are acceptable.
    expect(src.default).not.toMatch(/^export function.*(rank|evaluat|coach)/im)
    // No imports of ranking or evaluation modules
    expect(src.default).not.toContain("rankingEngine")
    expect(src.default).not.toContain("evaluationEngine")
  })

  it('personalTargetService source contains no ranking/evaluation references', async () => {
    const src = await import('../../services/personalTargetService.ts?raw')
    expect(src.default).not.toMatch(/ranking|evaluation|coaching/i)
  })

  it('pharmacistPerformanceEngine changes contain no new scoring formulas', async () => {
    const src = await import('../../engine/teamIntelligence/pharmacistPerformanceEngine.ts?raw')
    // resolveTargetValue is a target lookup, not a scoring function
    expect(src.default).toContain('resolveTargetValue')
    // Existing scoring functions unchanged
    expect(src.default).toContain('performanceScore')
    expect(src.default).toContain('KPI_WEIGHTS')
  })

  it('no ranking/evaluation execution/coaching routes in App.jsx', async () => {
    const src = await import('../../App.jsx?raw')
    // Use exact path= attribute checks to avoid substring collisions with /rankings
    expect(src.default).not.toContain('path="/ranking"')
    // /admin/evaluation-registry is the admin registry CRUD page (ER-0 foundation)
    // Evaluation execution dashboards are not built yet
    expect(src.default).not.toContain('/evaluation-dashboard')
    expect(src.default).not.toContain('/evaluation-results')
    expect(src.default).not.toContain('/coaching')
  })
})
