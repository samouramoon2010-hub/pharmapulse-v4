// ============================================================
// Evaluation Registry Visibility — Regression Tests
//
// Root cause confirmed: Firestore rule used isAdmin() (role='admin' only)
// for collection queries on evaluation_profiles. Manager-role users could
// not see draft profiles because the rule excluded them from list results.
//
// Fix: changed to isMgr() which includes admin, manager, branch_manager.
//
// Categories:
//   1. Firestore rules — manager sees drafts, non-manager sees only published
//   2. Collection name consistency — write and read use the same collection
//   3. subscribeEvaluationProfiles — returns all statuses
//   4. subscribePublishedProfiles — returns only published (for Run Evaluation)
//   5. Status badge rendering — draft vs published display
//   6. Scope guard — no ranking/coaching
// ============================================================

import { describe, it, expect, vi } from 'vitest'

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
  addDoc:          vi.fn(async () => ({ id: 'new-id' })),
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

// ── 1. Firestore rules simulation ─────────────────────────────

describe('Evaluation Registry visibility — Firestore rules simulation', () => {
  // Simulates the FIXED rule:
  //   allow read: if isMgr() || (isAny() && status == 'published')
  function canRead(role: string, docStatus: string): boolean {
    const isMgr  = ['admin', 'manager', 'branch_manager'].includes(role)
    const isAny  = true  // any authenticated user
    const effectiveStatus = docStatus ?? 'draft'
    return isMgr || (isAny && effectiveStatus === 'published')
  }

  // The OLD (broken) rule was:
  //   allow read: if isAdmin() || (isAny() && status == 'published')
  function canReadOldRule(role: string, docStatus: string): boolean {
    const isAdmin = role === 'admin'
    const isAny   = true
    const effectiveStatus = docStatus ?? 'draft'
    return isAdmin || (isAny && effectiveStatus === 'published')
  }

  it('OLD rule — manager cannot read draft profiles (BUG)', () => {
    expect(canReadOldRule('manager', 'draft')).toBe(false)  // This was the bug
  })

  it('FIXED rule — manager can read draft profiles', () => {
    expect(canRead('manager', 'draft')).toBe(true)
  })

  it('FIXED rule — branch_manager can read draft profiles', () => {
    expect(canRead('branch_manager', 'draft')).toBe(true)
  })

  it('FIXED rule — admin can read draft profiles', () => {
    expect(canRead('admin', 'draft')).toBe(true)
  })

  it('FIXED rule — manager can read published profiles', () => {
    expect(canRead('manager', 'published')).toBe(true)
  })

  it('FIXED rule — manager can read archived profiles', () => {
    expect(canRead('manager', 'archived')).toBe(true)
  })

  it('FIXED rule — pharmacist can NOT read draft profiles', () => {
    expect(canRead('pharmacist', 'draft')).toBe(false)
  })

  it('FIXED rule — pharmacist CAN read published profiles', () => {
    expect(canRead('pharmacist', 'published')).toBe(true)
  })

  it('FIXED rule — district_supervisor cannot read drafts', () => {
    expect(canRead('district_supervisor', 'draft')).toBe(false)
  })

  it('firestore.rules source uses isMgr() not isAdmin() for evaluation_profiles read', async () => {
    const src = await import('../../../firestore.rules?raw')
    // Extract the evaluation_profiles block
    const block = src.default
      .split('match /evaluation_profiles/')[1]
      ?.split('match /')[0] ?? ''
    // The allow read line must use isMgr(), not isAdmin()
    const readLine = block.split('\n').find((l) => l.includes('allow read'))
    expect(readLine).toContain('isMgr()')
    expect(readLine).not.toContain('isAdmin()')
  })
})

// ── 2. Collection name consistency ────────────────────────────

describe('Evaluation Registry visibility — collection name consistency', () => {
  it('write path (createEvaluationProfile) and read path use the same COL constant', async () => {
    const src = await import('../../services/evaluationRegistryService.ts?raw')
    // Both addDoc (write) and onSnapshot (read) must reference COL.EVALUATION_PROFILES
    // Count occurrences to confirm both paths use the same constant
    const occurrences = (src.default.match(/COL\.EVALUATION_PROFILES/g) || []).length
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  it('COL.EVALUATION_PROFILES equals "evaluation_profiles"', async () => {
    const { COL } = await import('../../services/firebase')
    expect(COL.EVALUATION_PROFILES).toBe('evaluation_profiles')
  })

  it('SMARTS template creation calls createEvaluationProfile (same write path)', async () => {
    const src = await import('../../services/evaluationRegistryService.ts?raw')
    // createSmarts2026DraftProfile must delegate to createEvaluationProfile
    const block = src.default
      .split('export async function createSmarts2026DraftProfile')[1]
      ?.split('export ')[0] ?? ''
    expect(block).toContain('createEvaluationProfile')
  })
})

// ── 3. subscribeEvaluationProfiles returns all statuses ───────

describe('Evaluation Registry visibility — store loading reset', () => {
  it('store subscribe() resets loading=true before registering listener', async () => {
    const src = await import('../../store/evaluationRegistryStore.ts?raw')
    const block = src.default
      .split('subscribe: () => {')[1]
      ?.split('create:')[0] ?? ''
    // Must reset loading before subscribing
    expect(block).toContain("loading: true")
    expect(block).toContain("profiles: []")
    expect(block).toContain("error: null")
    // set() call must come BEFORE subscribeEvaluationProfiles call
    const setIdx  = block.indexOf('set({')
    const subIdx  = block.indexOf('subscribeEvaluationProfiles')
    expect(setIdx).toBeLessThan(subIdx)
  })
})

describe('Evaluation Registry visibility — subscribeEvaluationProfiles', () => {
  it('subscription has no status filter (returns draft + published + archived)', async () => {
    const src = await import('../../services/evaluationRegistryService.ts?raw')
    // Extract the subscribeEvaluationProfiles function body
    const block = src.default
      .split('export function subscribeEvaluationProfiles')[1]
      ?.split('export function')[0] ?? ''
    // Must NOT contain a where clause filtering by status
    expect(block).not.toMatch(/where.*status/)
    // Must use the collection without a status filter
    expect(block).toContain('COL.EVALUATION_PROFILES')
  })

  it('subscription uses collection() directly — not query(collection()) wrapper', async () => {
    const src = await import('../../services/evaluationRegistryService.ts?raw')
    const block = src.default
      .split('export function subscribeEvaluationProfiles')[1]
      ?.split('export function subscribePublishedProfiles')[0] ?? ''
    // Must use colRef (collection ref) directly, not q (query wrapper)
    const lines = block.split('\n').filter((l) => !l.trim().startsWith('//'))
    // No bare query() wrapper with no constraints
    const hasQueryWrapper = lines.some((l) =>
      l.includes('const q = query(collection(') && !l.includes('where(') && !l.includes('orderBy(')
    )
    expect(hasQueryWrapper).toBe(false)
    // Uses collection reference directly
    expect(block).toContain('colRef = collection(')
    // Client-side sort present
    expect(block).toContain('.sort(')
  })

  it('subscription has error handler to surface permission errors', async () => {
    const src = await import('../../services/evaluationRegistryService.ts?raw')
    const block = src.default
      .split('export function subscribeEvaluationProfiles')[1]
      ?.split('export function')[0] ?? ''
    expect(block).toContain('onError')
    expect(block).toContain('console.error')
  })
})

// ── 4. subscribePublishedProfiles — Run Evaluation only ───────

describe('Evaluation Registry visibility — subscribePublishedProfiles', () => {
  it('published profiles subscription filters status = published', async () => {
    const src = await import('../../services/evaluationRegistryService.ts?raw')
    const block = src.default
      .split('export function subscribePublishedProfiles')[1]
      ?.split('export function')[0] ?? ''
    expect(block).toContain("'published'")
    expect(block).toContain('status')
  })

  it('EvaluationRunPage uses subscribePublishedProfiles for dropdown', async () => {
    const src = await import('../../pages/admin/EvaluationRunPage.tsx?raw')
    expect(src.default).toContain('subscribePublishedProfiles')
    // Must NOT use subscribeEvaluationProfiles (which includes drafts)
    expect(src.default).not.toContain('subscribeEvaluationProfiles')
  })

  it('EvaluationRegistryPage uses subscribeEvaluationProfiles (all statuses)', async () => {
    // The registry page uses the store which uses subscribeEvaluationProfiles
    const storeSrc = await import('../../store/evaluationRegistryStore.ts?raw')
    expect(storeSrc.default).toContain('subscribeEvaluationProfiles')
  })
})

// ── 5. Status badge rendering ─────────────────────────────────

describe('Evaluation Registry visibility — status badge rendering', () => {
  it('EvaluationRegistryPage renders a status column with badge', async () => {
    const src = await import('../../pages/admin/EvaluationRegistryPage.tsx?raw')
    // The STATUS_COLORS map must include draft, published, and archived
    expect(src.default).toContain("'draft'")
    expect(src.default).toContain("'published'")
    expect(src.default).toContain("'archived'")
    // The status column renders a span with the status value
    expect(src.default).toContain('status')
  })

  it('STATUS_COLORS has entries for all three lifecycle states', async () => {
    const src = await import('../../pages/admin/EvaluationRegistryPage.tsx?raw')
    expect(src.default).toMatch(/draft.*:.*'#fbbf24'|'#fbbf24'.*draft/)
    expect(src.default).toMatch(/published.*:.*'#22c55e'|'#22c55e'.*published/)
    expect(src.default).toMatch(/archived.*:.*'#6b7280'|'#6b7280'.*archived/)
  })
})

// ── 6. Scope guard ────────────────────────────────────────────

describe('Evaluation Registry visibility — scope guard', () => {
  it('firestore.rules evaluation_profiles rule change does not affect evaluation_results', async () => {
    const src = await import('../../../firestore.rules?raw')
    // evaluation_results must still use isAdmin() for create (not isMgr())
    const resultsBlock = src.default
      .split('match /evaluation_results/')[1]
      ?.split('match /')[0] ?? ''
    expect(resultsBlock).toContain('allow create: if isAdmin()')
  })

  it('no ranking logic introduced in rule change', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).not.toContain('ranking_results')
    expect(src.default).not.toContain('coaching_results')
  })
})
