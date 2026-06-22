// ============================================================
// Phase 3C-2 — useActions Hook
//
// Verifies:
//  1.  useActions file exists and exports useActions
//  2.  hook imports useScopeProfile
//  3.  hook reads from suggestedActions collection
//  4.  all scope loads all (no relatedPharmacyId constraint)
//  5.  single scope filters by relatedPharmacyId == scope.id
//  6.  list scope filters by relatedPharmacyId 'in' ids
//  7.  list scope with [] returns [] without fetching
//  8.  list scope > 30 ids uses chunk queries (CHUNK_SIZE)
//  9.  scope error — actions cleared, error set
// 10.  no scope / none scope — actions = [], no fetch
// 11.  status filter is applied
// 12.  priority filter is applied
// 13.  ownerId filter is applied
// 14.  month filter is applied
// 15.  race safety — cancelled flag drops stale results
// 16.  no dashboard imports
// 17.  no Dynamic KPI imports
// 18.  no AI imports
// 19.  no signal generation
// 20.  no UI pages created (App.jsx unchanged)
// ============================================================

import { describe, it, expect } from 'vitest'

const hookSrc = () => import('./useActions.ts?raw').then((m) => m.default)
const appSrc  = () => import('../App.jsx?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1-3. File, scope import, collection
// ════════════════════════════════════════════════════════════

describe('3C-2 useActions — foundation', () => {
  it('useActions is exported from the hook file (test 1)', async () => {
    const s = await hookSrc()
    expect(s).toContain('export function useActions')
  })

  it('hook imports useScopeProfile (test 2)', async () => {
    const s = await hookSrc()
    expect(s).toContain("import { useScopeProfile }")
    expect(s).toContain("from './useScopeProfile'")
  })

  it("hook reads from 'suggestedActions' collection (test 3)", async () => {
    const s = await hookSrc()
    expect(s).toContain("'suggestedActions'")
  })
})

// ════════════════════════════════════════════════════════════
// 4-8. Query behavior per scope type
// ════════════════════════════════════════════════════════════

describe('3C-2 useActions — query behavior', () => {
  it("all scope loads all — no pharmacyId constraint on 'all' path (test 4)", async () => {
    const s = await hookSrc()
    // The 'all' branch exists and does NOT apply a where(relatedPharmacyId) constraint
    expect(s).toContain("scope.type === 'all'")
    const idx = s.indexOf("scope.type === 'all'")
    const block = s.slice(idx, idx + 200)
    // The all branch should reach getDocs without a where on relatedPharmacyId
    expect(block).not.toContain("where('relatedPharmacyId'")
  })

  it("single scope queries where relatedPharmacyId == scope.id (test 5)", async () => {
    const s = await hookSrc()
    expect(s).toContain("scope.type === 'single'")
    expect(s).toContain("where('relatedPharmacyId', '==', scope.id)")
  })

  it("list scope queries where relatedPharmacyId 'in' group (test 6)", async () => {
    const s = await hookSrc()
    expect(s).toContain("scope.type === 'list'")
    expect(s).toContain("where('relatedPharmacyId', 'in', group)")
  })

  it('list scope with empty ids returns [] immediately (test 7)', async () => {
    const s = await hookSrc()
    const idx = s.indexOf("scope.type === 'list'")
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('ids.length === 0')
    expect(block).toContain('return []')
  })

  it('list scope > 30 ids uses CHUNK_SIZE chunked queries (test 8)', async () => {
    const s = await hookSrc()
    expect(s).toContain('CHUNK_SIZE')
    // Chunk function exists to split ids array
    expect(s).toContain('function chunk')
    // chunk is called with CHUNK_SIZE
    expect(s).toContain('chunk(ids, CHUNK_SIZE)')
  })
})

// ════════════════════════════════════════════════════════════
// 9-10. Scope error and no-scope safety
// ════════════════════════════════════════════════════════════

describe('3C-2 useActions — scope safety', () => {
  it('scope error clears actions and sets error (test 9)', async () => {
    const s = await hookSrc()
    // Find the guard block — starts at `if (scopeError)`, not the destructuring line
    const idx = s.indexOf('if (scopeError)')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('setActions([])')
    expect(block).toContain('setError(scopeError)')
  })

  it('no scope or none scope returns [] without fetching (test 10)', async () => {
    const s = await hookSrc()
    expect(s).toContain("scope.type === 'none'")
    // Guard block sets empty actions before any fetch
    const idx = s.indexOf("!scope || scope.type === 'none'")
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 150)
    expect(block).toContain('setActions([])')
  })
})

// ════════════════════════════════════════════════════════════
// 11-14. Filter support
// ════════════════════════════════════════════════════════════

describe('3C-2 useActions — filter support', () => {
  it('status filter is applied to results (test 11)', async () => {
    const s = await hookSrc()
    expect(s).toContain('filters.status')
    // Verify it gates a filter over the results array using dot-notation access
    const idx = s.indexOf('filters.status')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain('a.status')
  })

  it('priority filter is applied to results (test 12)', async () => {
    const s = await hookSrc()
    expect(s).toContain('filters.priority')
    const idx = s.indexOf('filters.priority')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain('a.priority')
  })

  it('ownerId filter is applied to results (test 13)', async () => {
    const s = await hookSrc()
    expect(s).toContain('filters.ownerId')
    const idx = s.indexOf('filters.ownerId')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain('a.ownerId')
  })

  it('month filter is applied to results (test 14)', async () => {
    const s = await hookSrc()
    expect(s).toContain('filters.month')
    const idx = s.indexOf('filters.month')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain('a.month')
  })
})

// ════════════════════════════════════════════════════════════
// 15. Race safety
// ════════════════════════════════════════════════════════════

describe('3C-2 useActions — race safety', () => {
  it('stale async results dropped via cancelled flag (test 15)', async () => {
    const s = await hookSrc()
    // cancelled flag is set to false before fetch and true in cleanup
    expect(s).toContain('let cancelled = false')
    expect(s).toContain('if (!cancelled)')
    // cleanup sets cancelled = true to drop stale results
    expect(s).toContain('cancelled = true')
  })
})

// ════════════════════════════════════════════════════════════
// 16-20. Guardrails
// ════════════════════════════════════════════════════════════

describe('3C-2 guardrails', () => {
  it('no dashboard imports in useActions (test 16)', async () => {
    const s = await hookSrc()
    expect(s).not.toContain('DashboardPage')
    expect(s).not.toContain('dashboard')
  })

  it('no Dynamic KPI imports in useActions (test 17)', async () => {
    const s = await hookSrc()
    expect(s).not.toContain('dynamicKpi')
    expect(s).not.toContain('DynamicKpi')
    expect(s).not.toContain('kpiRegistry')
  })

  it('no AI imports in useActions (test 18)', async () => {
    const s = await hookSrc()
    expect(s).not.toContain('openai')
    expect(s).not.toContain('anthropic')
    expect(s).not.toContain('gemini')
    expect(s).not.toContain('gpt')
  })

  it('no signal generation in useActions (test 19)', async () => {
    const s = await hookSrc()
    expect(s).not.toContain('generateSignal')
    expect(s).not.toContain('detectSignal')
    expect(s).not.toContain('signalEngine')
    expect(s).not.toContain('executiveScore')
  })

  it('no new pages beyond Actions Layer added to App.jsx (test 20)', async () => {
    const s = await appSrc()
    // Phase 3C-3 legitimately added MyActionsPage and TasksPage routes.
    // Guard against unrelated page additions instead.
    expect(s).not.toContain('ActionsCreatorPage')
    expect(s).not.toContain('SignalPage')
    expect(s).not.toContain('AIAssistantPage')
  })
})
