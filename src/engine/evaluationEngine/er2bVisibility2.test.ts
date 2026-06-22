// ============================================================
// Evaluation Registry Visibility — ER-2B Regression Tests
//
// Root cause: EvaluationRegistryPage passed data={filtered}
// to DataTable, but DataTable expects rows={}.
// `data` is silently ignored → DataTable always receives rows=[]
// → always renders "No evaluation profiles yet" even with real data.
//
// Same bug existed in RegionsPage and DistrictsPage.
//
// These tests lock in the correct behaviour permanently.
// ============================================================

import { describe, it, expect, vi } from 'vitest'
import { onSnapshot } from 'firebase/firestore'

vi.mock('../../services/firebase', () => ({
  db:   {},
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
  collection:      vi.fn(() => ({ id: 'evaluation_profiles' })),
  doc:             vi.fn(() => ({})),
  addDoc:          vi.fn(async () => ({ id: 'new-id' })),
  updateDoc:       vi.fn(async () => {}),
  getDoc:          vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs:         vi.fn(async () => ({ docs: [] })),
  query:           vi.fn((...args) => args[0]),   // pass-through
  where:           vi.fn(() => ({})),
  orderBy:         vi.fn(() => ({})),
  onSnapshot:      vi.fn(() => vi.fn()),
  serverTimestamp: vi.fn(() => ({ _type: 'ts' })),
}))

vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))

// ── 1. Root cause — prop name ─────────────────────────────────

describe('ER visibility — DataTable prop name (root cause)', () => {
  it('EvaluationRegistryPage passes rows= to DataTable, NOT data=', async () => {
    const src = await import('../../pages/admin/EvaluationRegistryPage.tsx?raw')
    // Must use rows={filtered}, not data={filtered}
    expect(src.default).toContain('rows={filtered}')
    // Must NOT have data={filtered} (the broken prop name)
    expect(src.default).not.toContain('data={filtered}')
  })

  it('RegionsPage passes rows= to DataTable, NOT data=', async () => {
    const src = await import('../../pages/admin/RegionsPage.tsx?raw')
    expect(src.default).toContain('rows={filtered}')
    expect(src.default).not.toContain('data={filtered}')
  })

  it('DistrictsPage passes rows= to DataTable, NOT data=', async () => {
    const src = await import('../../pages/admin/DistrictsPage.tsx?raw')
    expect(src.default).toContain('rows={filtered}')
    expect(src.default).not.toContain('data={filtered}')
  })

  it('DataTable component accepts rows prop (not data)', async () => {
    const src = await import('../../components/ui/DataTable.jsx?raw')
    // DataTable destructures `rows`, not `data`
    expect(src.default).toContain('rows = []')
    expect(src.default).not.toMatch(/^\s*data\s*=\s*\[\]/m)
  })
})

// ── 2. subscribeEvaluationProfiles delivers all statuses ──────

describe('ER visibility — subscription delivers all profile statuses', () => {
  it('subscribeEvaluationProfiles uses collection() directly (not query wrapper)', async () => {
    const src = await import('../../services/evaluationRegistryService.ts?raw')
    const block = src.default
      .split('export function subscribeEvaluationProfiles')[1]
      ?.split('export function subscribePublishedProfiles')[0] ?? ''
    const lines = block.split('\n').filter((l) => !l.trim().startsWith('//'))
    // Must NOT have bare query() with no constraints
    const hasBareQuery = lines.some((l) =>
      l.includes('const q = query(collection(') &&
      !l.includes('where(') && !l.includes('orderBy(')
    )
    expect(hasBareQuery).toBe(false)
    // Must use colRef directly
    expect(block).toContain('colRef = collection(')
    expect(block).toContain('onSnapshot(\n    colRef')
  })

  it('subscribeEvaluationProfiles has NO status filter — all docs returned', async () => {
    const src = await import('../../services/evaluationRegistryService.ts?raw')
    const block = src.default
      .split('export function subscribeEvaluationProfiles')[1]
      ?.split('export function subscribePublishedProfiles')[0] ?? ''
    const lines = block.split('\n').filter((l) => !l.trim().startsWith('//'))
    expect(lines.some((l) => l.includes("where('status'"))).toBe(false)
  })

  it('subscribeEvaluationProfiles fires callback with all docs including drafts', async () => {
    const mockDraft = {
      id: 'smarts-draft',
      data: () => ({
        name: 'SMARTS 2026', status: 'draft', role: 'pharmacist',
        version: 1, effectiveFrom: '2026-01', createdAt: null,
      }),
    }
    const mockPublished = {
      id: 'profile-published',
      data: () => ({
        name: 'Old Profile', status: 'published', role: 'pharmacist',
        version: 1, effectiveFrom: '2025-01', createdAt: null,
      }),
    }
    let captured: unknown[] = []
    vi.mocked(onSnapshot).mockImplementationOnce((_ref, successCb) => {
      successCb({ docs: [mockDraft, mockPublished] } as any)
      return vi.fn()
    })
    const { subscribeEvaluationProfiles } = await import('../../services/evaluationRegistryService')
    subscribeEvaluationProfiles((list) => { captured = list })
    expect(captured).toHaveLength(2)
    const statuses = (captured as Array<{ status: string }>).map((p) => p.status)
    expect(statuses).toContain('draft')
    expect(statuses).toContain('published')
  })
})

// ── 3. Store receives and forwards all profiles ───────────────

describe('ER visibility — store receives and forwards profiles', () => {
  it('store subscribe() resets loading=true before creating listener', async () => {
    const src = await import('../../store/evaluationRegistryStore.ts?raw')
    const block = src.default.split('subscribe: () => {')[1]?.split('create:')[0] ?? ''
    expect(block).toContain('loading: true')
    expect(block).toContain('profiles: []')
    const setIdx = block.indexOf('set({')
    const subIdx = block.indexOf('subscribeEvaluationProfiles')
    expect(setIdx).toBeLessThan(subIdx)
  })

  it('store passes onError handler to subscription', async () => {
    const src = await import('../../store/evaluationRegistryStore.ts?raw')
    const block = src.default.split('subscribe: () => {')[1]?.split('create:')[0] ?? ''
    expect(block).toContain('err.message')
    expect(block).toContain('error:')
  })
})

// ── 4. Draft appears in Registry, not in Run Evaluation ───────

describe('ER visibility — draft vs published routing', () => {
  it('EvaluationRegistryPage uses store (subscribeEvaluationProfiles = all)', async () => {
    const storeSrc = await import('../../store/evaluationRegistryStore.ts?raw')
    expect(storeSrc.default).toContain('subscribeEvaluationProfiles')
  })

  it('EvaluationRunPage uses subscribePublishedProfiles (published only)', async () => {
    const src = await import('../../pages/admin/EvaluationRunPage.tsx?raw')
    expect(src.default).toContain('subscribePublishedProfiles')
    expect(src.default).not.toContain('subscribeEvaluationProfiles')
  })

  it('subscribePublishedProfiles filters status = published', async () => {
    const src = await import('../../services/evaluationRegistryService.ts?raw')
    const block = src.default
      .split('export function subscribePublishedProfiles')[1]
      ?.split('export function')[0] ?? ''
    expect(block).toContain("'published'")
    expect(block).toContain('status')
  })
})

// ── 5. Empty state only when snapshot is truly empty ─────────

describe('ER visibility — empty state only for zero docs', () => {
  it('filtered array is source of truth for empty state', async () => {
    const src = await import('../../pages/admin/EvaluationRegistryPage.tsx?raw')
    // emptyText is passed to DataTable only — no other empty state guard on filtered
    expect(src.default).toContain('emptyText="No evaluation profiles yet"')
    // The filter only applies the search string — no status filter
    const filterLine = src.default.split('const filtered')[1]?.split('\n')[1] ?? ''
    expect(filterLine).not.toContain("status")
    expect(filterLine).not.toContain("published")
  })

  it('uid dependency on subscribe useEffect ensures auth is resolved', async () => {
    const src = await import('../../pages/admin/EvaluationRegistryPage.tsx?raw')
    expect(src.default).toContain('userProfile?.uid])')
  })
})

// ── 6. Status badges correct ──────────────────────────────────

describe('ER visibility — status badge colours', () => {
  it('STATUS_COLORS has draft=amber, published=green, archived=grey', async () => {
    const src = await import('../../pages/admin/EvaluationRegistryPage.tsx?raw')
    expect(src.default).toContain("draft: '#fbbf24'")
    expect(src.default).toContain("published: '#22c55e'")
    expect(src.default).toContain("archived: '#6b7280'")
  })
})
