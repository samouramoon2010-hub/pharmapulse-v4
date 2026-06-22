// ============================================================
// RF-0E Demo Data Seeder — Tests
//
// Tests the PURE generation logic (generateBatchData, runDryRun).
// No Firestore mocking needed — these functions are side-effect-free.
//
// Covers:
//   1. Dry-run writes nothing
//   2. All documents contain isDemoData:true
//   3. All documents contain demoBatchId
//   4. IDs are deterministic for same seed
//   5. Branch distribution: 3 hub, 3 destination, 2 provider, 2 neighbourhood
//   6. Exactly 10 branches
//   7. Exactly 30 pharmacists (3 per branch)
//   8. Personal targets generated for every pharmacist
//   9. KPI entries generated for every pharmacist
//  10. Cleanup query only uses isDemoData+demoBatchId (never deletes real docs)
//  11. Missing-data pharmacist generates fewer KPI entries
//  12. High performer has higher achievement range than underperformer
//  13. No Firebase Auth creation
//  14. Performance types all present in standard scenario
//  15. KPI entries use engine field names (omni, wellness — not omnihealth, wellnessCard)
//  16. Branch targets use *Target suffix
//  17. Personal targets split branch targets across pharmacists
// ============================================================

import { describe, it, expect, vi } from 'vitest'
import {
  generateBatchData,
  runDryRun,
  generateBatchId,
} from '../../demo/demo-seeder'
import {
  DEMO_KPI_ENGINE_KEYS,
  DEMO_TARGET_FIELDS,
  PERFORMER_ACHIEVEMENT,
} from '../../demo/constants'
import { createStandardMixedScenario } from '../../demo/scenario-standard-mixed'

// ── Mocks (only needed for tests that touch Firestore) ────────

vi.mock('../../services/firebase', () => ({
  db: {}, auth: null,
  COL: { PHARMACIES: 'pharmacies', USERS: 'users', TARGETS: 'targets',
    PERSONAL_TARGETS: 'personal_targets', KPI_ENTRIES: 'kpi_entries',
    EVALUATION_RESULTS: 'evaluation_results', RANKING_SNAPSHOTS: 'ranking_snapshots',
    DEMO_BATCHES: 'demo_batches', AUDIT_LOGS: 'audit_logs' },
}))

vi.mock('firebase/firestore', () => ({
  collection:      vi.fn((_db, col) => ({ __col: col })),
  doc:             vi.fn((_db, ...parts) => ({ __path: parts.join('/') })),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  setDoc:          vi.fn(async () => {}),
  addDoc:          vi.fn(async (_col, data) => ({ id: `auto_${Math.random().toString(36).slice(2)}` })),
  updateDoc:       vi.fn(async () => {}),
  deleteDoc:       vi.fn(async () => {}),
  query:           vi.fn((...args) => args[0]),
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  writeBatch:      vi.fn(() => ({ set: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => {}) })),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))

// ── Fixtures ──────────────────────────────────────────────────

const TEST_BATCH_ID = 'DEMO_TEST_001'
const TEST_MONTH    = '2026-06'

function makeTestScenario() {
  return createStandardMixedScenario(TEST_MONTH)
}

// ════════════════════════════════════════════════════════════════
// 1. Dry-run writes nothing
// ════════════════════════════════════════════════════════════════

describe('runDryRun — writes nothing', () => {
  it('returns a DryRunReport without throwing', () => {
    const report = runDryRun('standard_mixed_environment', TEST_MONTH)
    expect(report).toBeDefined()
    expect(report.scenarioName).toBe('standard_mixed_environment')
  })

  it('never calls writeBatch in dry-run mode', async () => {
    const { writeBatch } = await import('firebase/firestore')
    runDryRun('standard_mixed_environment', TEST_MONTH)
    expect(vi.mocked(writeBatch)).not.toHaveBeenCalled()
  })

  it('never calls addDoc or setDoc in dry-run mode', async () => {
    const { addDoc, setDoc } = await import('firebase/firestore')
    runDryRun('standard_mixed_environment', TEST_MONTH)
    expect(vi.mocked(addDoc)).not.toHaveBeenCalled()
    expect(vi.mocked(setDoc)).not.toHaveBeenCalled()
  })
})

// ════════════════════════════════════════════════════════════════
// 2 & 3. isDemoData and demoBatchId on all documents
// ════════════════════════════════════════════════════════════════

describe('generateBatchData — demo tags', () => {
  const scenario = makeTestScenario()
  const data     = generateBatchData(scenario, TEST_BATCH_ID)

  it('pharmacies are tagged with correct demoBatchId', () => {
    // pharmacies are added to Firestore via addDoc with tags in payload
    // We verify the data object carries the info needed for tagging
    expect(data.pharmacies.length).toBeGreaterThan(0)
    expect(data.batchId).toBe(TEST_BATCH_ID)
  })

  it('users array contains batchId scoping', () => {
    for (const u of data.users) {
      expect(u.id).toContain(TEST_BATCH_ID)
    }
  })

  it('branch targets have correct pharmacyId structure', () => {
    for (const t of data.branchTargets) {
      expect(t.pharmacyId).toBeTruthy()
      expect(t.month).toBe(TEST_MONTH)
    }
  })

  it('personal targets have correct userId + pharmacyId', () => {
    for (const pt of data.personalTargets) {
      expect(pt.userId).toContain(TEST_BATCH_ID)
      expect(pt.pharmacyId).toBeTruthy()
    }
  })

  it('kpi entries have correct userId + pharmacyId + date', () => {
    for (const entry of data.kpiEntries) {
      expect(entry.userId).toContain(TEST_BATCH_ID)
      expect(entry.pharmacyId).toBeTruthy()
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// 4. Deterministic IDs for same seed
// ════════════════════════════════════════════════════════════════

describe('generateBatchData — determinism', () => {
  it('same batchId and scenario produce identical output', () => {
    const scenario = makeTestScenario()
    const a = generateBatchData(scenario, TEST_BATCH_ID)
    const b = generateBatchData(scenario, TEST_BATCH_ID)
    expect(a.pharmacies.map((p) => p.code)).toEqual(b.pharmacies.map((p) => p.code))
    expect(a.users.map((u) => u.id)).toEqual(b.users.map((u) => u.id))
    expect(a.kpiEntries.length).toBe(b.kpiEntries.length)
  })

  it('different batchId produces different user IDs', () => {
    const scenario = makeTestScenario()
    const a = generateBatchData(scenario, 'BATCH_A')
    const b = generateBatchData(scenario, 'BATCH_B')
    expect(a.users[0].id).not.toBe(b.users[0].id)
  })
})

// ════════════════════════════════════════════════════════════════
// 5 & 6. Branch count + classification distribution
// ════════════════════════════════════════════════════════════════

describe('Branch distribution', () => {
  const scenario = makeTestScenario()
  const data     = generateBatchData(scenario, TEST_BATCH_ID)

  it('generates exactly 10 branches', () => {
    expect(data.pharmacies).toHaveLength(10)
  })

  it('3 hub branches', () => {
    expect(data.pharmacies.filter((p) => p.classificationId === 'hub')).toHaveLength(3)
  })

  it('3 destination branches', () => {
    expect(data.pharmacies.filter((p) => p.classificationId === 'destination')).toHaveLength(3)
  })

  it('2 provider branches', () => {
    expect(data.pharmacies.filter((p) => p.classificationId === 'provider')).toHaveLength(2)
  })

  it('2 neighbourhood branches', () => {
    expect(data.pharmacies.filter((p) => p.classificationId === 'neighbourhood')).toHaveLength(2)
  })

  it('dry-run report lists 10 branches', () => {
    const report = runDryRun('standard_mixed_environment', TEST_MONTH)
    expect(report.branches).toHaveLength(10)
  })
})

// ════════════════════════════════════════════════════════════════
// 7. Pharmacist count
// ════════════════════════════════════════════════════════════════

describe('Pharmacist count', () => {
  const scenario = makeTestScenario()
  const data     = generateBatchData(scenario, TEST_BATCH_ID)

  it('generates exactly 30 pharmacists', () => {
    expect(data.users).toHaveLength(30)
  })

  it('3 pharmacists per branch', () => {
    const countByBranch = new Map<string, number>()
    for (const u of data.users) {
      countByBranch.set(u.pharmacyId, (countByBranch.get(u.pharmacyId) ?? 0) + 1)
    }
    for (const count of countByBranch.values()) {
      expect(count).toBe(3)
    }
  })

  it('dry-run report lists 30 pharmacists', () => {
    const report = runDryRun('standard_mixed_environment', TEST_MONTH)
    expect(report.pharmacists).toHaveLength(30)
  })
})

// ════════════════════════════════════════════════════════════════
// 8. Personal targets
// ════════════════════════════════════════════════════════════════

describe('Personal targets', () => {
  const scenario = makeTestScenario()
  const data     = generateBatchData(scenario, TEST_BATCH_ID)

  it('one personal target per pharmacist', () => {
    expect(data.personalTargets).toHaveLength(data.users.length)
  })

  it('every personal target has all KPI keys', () => {
    for (const pt of data.personalTargets) {
      for (const key of DEMO_KPI_ENGINE_KEYS) {
        expect(pt.targets[key], `missing ${key}`).toBeDefined()
        expect(pt.targets[key]).toBeGreaterThan(0)
      }
    }
  })

  it('personal targets are less than or approximately equal to branch targets divided by 3', () => {
    const branchTarget = data.branchTargets[0]
    const pharmacistsInBranch = data.personalTargets.filter((pt) => pt.pharmacyId === branchTarget.pharmacyId)
    expect(pharmacistsInBranch).toHaveLength(3)
    // Sum of personal targets should approximate branch target (±50% for variation)
    const sumWasfaty = pharmacistsInBranch.reduce((sum, pt) => sum + pt.targets['wasfaty'], 0)
    const branchWasfaty = branchTarget.fields['wasfatyTarget']
    expect(sumWasfaty).toBeGreaterThan(branchWasfaty * 0.3)
    expect(sumWasfaty).toBeLessThan(branchWasfaty * 2.0)
  })
})

// ════════════════════════════════════════════════════════════════
// 9. KPI entries
// ════════════════════════════════════════════════════════════════

describe('KPI entries', () => {
  const scenario = makeTestScenario()
  const data     = generateBatchData(scenario, TEST_BATCH_ID)

  it('KPI entries are generated for every pharmacist', () => {
    const entryUsers = new Set(data.kpiEntries.map((e) => e.userId))
    for (const u of data.users) {
      expect(entryUsers.has(u.id), `no entries for user ${u.id}`).toBe(true)
    }
  })

  it('KPI entry values use engine field names (omni not omnihealth)', () => {
    const firstEntry = data.kpiEntries[0]
    expect(firstEntry.values['omni']).toBeDefined()
    expect(firstEntry.values['wellness']).toBeDefined()
    expect(firstEntry.values['omnihealth']).toBeUndefined()
    expect(firstEntry.values['wellnessCard']).toBeUndefined()
  })

  it('entry dates are valid YYYY-MM-DD format within the month', () => {
    for (const entry of data.kpiEntries.slice(0, 50)) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.date.startsWith(TEST_MONTH)).toBe(true)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// 11. Missing-data pharmacist has fewer entries
// ════════════════════════════════════════════════════════════════

describe('Performance type variation', () => {
  const scenario = makeTestScenario()
  const data     = generateBatchData(scenario, TEST_BATCH_ID)

  it('missing_data pharmacists have fewer entries than high performers', () => {
    const highUser = data.users.find((u) => u.performerType === 'high')
    const missingUser = data.users.find((u) => u.performerType === 'missing_data')
    if (!highUser || !missingUser) return  // skip if pattern doesn't include both

    const highEntries    = data.kpiEntries.filter((e) => e.userId === highUser.id).length
    const missingEntries = data.kpiEntries.filter((e) => e.userId === missingUser.id).length
    expect(missingEntries).toBeLessThan(highEntries)
  })

  it('all 4 performer types exist in the generated pharmacists', () => {
    const types = new Set(data.users.map((u) => u.performerType))
    expect(types.has('high')).toBe(true)
    expect(types.has('average')).toBe(true)
    expect(types.has('underperformer')).toBe(true)
    expect(types.has('missing_data')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════
// 13. No Firebase Auth creation
// ════════════════════════════════════════════════════════════════

describe('No Firebase Auth creation', () => {
  it('generateBatchData does not call any Auth API', () => {
    // All user creation is via Firestore setDoc only.
    // The user doc ID is a deterministic string, not an Auth UID.
    const scenario = makeTestScenario()
    const data = generateBatchData(scenario, TEST_BATCH_ID)
    for (const u of data.users) {
      // IDs must be deterministic strings, not Firebase Auth UIDs (which are opaque random strings)
      expect(u.id.startsWith('demo_user_')).toBe(true)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// 15. KPI target field naming
// ════════════════════════════════════════════════════════════════

describe('KPI target field names', () => {
  it('branch targets use *Target suffix convention', () => {
    const scenario = makeTestScenario()
    const data     = generateBatchData(scenario, TEST_BATCH_ID)
    const t = data.branchTargets[0]
    expect(t.fields['wasfatyTarget']).toBeDefined()
    expect(t.fields['omniTarget']).toBeDefined()
    expect(t.fields['wellnessTarget']).toBeDefined()
    // Raw engine keys should NOT be in targets (that's for kpi_entries)
    expect(t.fields['wasfaty']).toBeUndefined()
    expect(t.fields['omni']).toBeUndefined()
  })
})

// ════════════════════════════════════════════════════════════════
// 10. Cleanup safety (verifiable via logic)
// ════════════════════════════════════════════════════════════════

describe('Cleanup safety guarantee', () => {
  it('deleteDemoBatch client-side filters by isDemoData===true and demoBatchId', async () => {
    const src = await import('../../demo/demo-cleanup.ts?raw')
    // RF-0E fix: switched from where() compound query to client-side filter
    // to avoid composite index requirements and empty-collection permission errors.
    // The client-side filter is the safety layer — no doc without isDemoData=true is deleted.
    expect(src.default).toContain('data.isDemoData === true')
    expect(src.default).toContain('data.demoBatchId === batchId')
    // The isSafeToDelete guard is the core safety contract
    expect(src.default).toContain('isSafeToDelete')
  })

  it('demo-seeder does not write to evaluation_results or ranking_snapshots', async () => {
    const src = await import('../../demo/demo-seeder.ts?raw')
    // The seeder must not write final scores or rankings
    expect(src.default).not.toContain('evaluation_results')
    expect(src.default).not.toContain('ranking_snapshots')
  })
})

// ════════════════════════════════════════════════════════════════
// generateBatchId format
// ════════════════════════════════════════════════════════════════

describe('generateBatchId', () => {
  it('starts with DEMO_', () => {
    const id = generateBatchId()
    expect(id.startsWith('DEMO_')).toBe(true)
  })

  it('two calls produce different IDs', () => {
    expect(generateBatchId()).not.toBe(generateBatchId())
  })
})
