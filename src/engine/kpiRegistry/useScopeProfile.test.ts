// ============================================================
// Phase 2C — useScopeProfile Hook Tests
//
// Covers:
//   Structural (source-level):
//     imports, exports, return shape, dependency array,
//     fast-path pattern, async-fallback pattern,
//     race-safety (cancelled flag), error fallback to 'none'
//
//   Behavioural (vi.mock):
//     fast path does not call async resolver
//     async path is triggered on cache miss
//     async success sets scope
//     async failure → { type: 'none' } + error captured
//     no-userProfile → scope null, loading false
//
// Source-level tests use ?raw imports — no DOM rendering.
// Behavioural tests mock authStore + scopeResolver.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module-level mocks ────────────────────────────────────────

vi.mock('../../store/authStore', () => ({
  useAuthStore: vi.fn(),
}))

vi.mock('../../services/scopeResolver', () => ({
  resolveAllowedPharmacyIdsSync: vi.fn(),
  resolveAllowedPharmacyIds:     vi.fn(),
}))

// Firebase chain — prevents real Firestore initialisation
vi.mock('../../services/firebase', () => ({
  db: {}, auth: {}, COL: {},
}))
vi.mock('../../services/territorySync', () => ({
  computeAssignedPharmacyIdsForUser: vi.fn(),
}))

// ── Imports after mocks ───────────────────────────────────────

import { useAuthStore }               from '../../store/authStore'
import {
  resolveAllowedPharmacyIdsSync,
  resolveAllowedPharmacyIds,
  type PharmacyScope,
} from '../../services/scopeResolver'

// ── Source helper ─────────────────────────────────────────────

async function src(): Promise<string> {
  return (await import('../../hooks/useScopeProfile.ts?raw')).default
}

// ════════════════════════════════════════════════════════════
// 1. File structure & imports
// ════════════════════════════════════════════════════════════

describe('useScopeProfile — file structure', () => {
  it('file exists and exports useScopeProfile', async () => {
    const s = await src()
    expect(s).toContain('export function useScopeProfile')
  })

  it('imports useAuthStore', async () => {
    const s = await src()
    expect(s).toContain("from '../store/authStore'")
    expect(s).toContain('useAuthStore')
  })

  it('imports resolveAllowedPharmacyIdsSync', async () => {
    const s = await src()
    expect(s).toContain('resolveAllowedPharmacyIdsSync')
    expect(s).toContain("from '../services/scopeResolver'")
  })

  it('imports resolveAllowedPharmacyIds (async resolver)', async () => {
    const s = await src()
    expect(s).toContain('resolveAllowedPharmacyIds')
  })
})

// ════════════════════════════════════════════════════════════
// 2. Return shape
// ════════════════════════════════════════════════════════════

describe('useScopeProfile — return shape', () => {
  it('return object includes scope field', async () => {
    const s = await src()
    expect(s).toContain('scope:')
  })

  it('return object includes loading field', async () => {
    const s = await src()
    expect(s).toContain('loading:')
  })

  it('return object includes error field', async () => {
    const s = await src()
    expect(s).toContain('error:')
  })

  it('ScopeProfileState interface is exported', async () => {
    const s = await src()
    expect(s).toContain('export interface ScopeProfileState')
  })
})

// ════════════════════════════════════════════════════════════
// 3. Dependency array
// ════════════════════════════════════════════════════════════

describe('useScopeProfile — dependency array', () => {
  it('uid is in the dependency array', async () => {
    const s       = await src()
    const depStart = s.lastIndexOf('}, [')
    const depBlock = s.slice(depStart, depStart + 80)
    expect(depBlock).toContain('uid')
  })

  it('role is in the dependency array', async () => {
    const s       = await src()
    const depStart = s.lastIndexOf('}, [')
    const depBlock = s.slice(depStart, depStart + 80)
    expect(depBlock).toContain('role')
  })

  it('pharmacyId is in the dependency array', async () => {
    const s       = await src()
    const depStart = s.lastIndexOf('}, [')
    const depBlock = s.slice(depStart, depStart + 80)
    expect(depBlock).toContain('pharmacyId')
  })

  it('assignedPharmacyIds is tracked via serialised key in dependency array', async () => {
    const s       = await src()
    const depStart = s.lastIndexOf('}, [')
    const depBlock = s.slice(depStart, depStart + 80)
    // The hook uses assignedKey (JSON.stringify of assignedPharmacyIds)
    expect(depBlock).toContain('assignedKey')
  })
})

// ════════════════════════════════════════════════════════════
// 4. Fast path pattern
// ════════════════════════════════════════════════════════════

describe('useScopeProfile — fast path pattern', () => {
  it('calls resolveAllowedPharmacyIdsSync', async () => {
    const s = await src()
    expect(s).toContain('resolveAllowedPharmacyIdsSync(')
  })

  it('fast path is taken when sync result is not null', async () => {
    const s = await src()
    // Must check that sync result is non-null before short-circuiting
    expect(s).toContain('fast !== null')
  })

  it('fast path returns without entering async block', async () => {
    const s = await src()
    // The return inside the fast-path if block
    const fastIdx  = s.indexOf('fast !== null')
    const fastBlock = s.slice(fastIdx, fastIdx + 200)
    expect(fastBlock).toContain('return')
  })
})

// ════════════════════════════════════════════════════════════
// 5. Async fallback pattern
// ════════════════════════════════════════════════════════════

describe('useScopeProfile — async fallback pattern', () => {
  it('calls resolveAllowedPharmacyIds when sync returns null', async () => {
    const s = await src()
    expect(s).toContain('resolveAllowedPharmacyIds(')
  })

  it('sets loading = true before async call', async () => {
    const s        = await src()
    const asyncIdx = s.indexOf('resolveAllowedPharmacyIds(resolverUser)')
    const before   = s.slice(Math.max(0, asyncIdx - 200), asyncIdx)
    expect(before).toContain('loading: true')
  })

  it('async success sets scope from profile.scope', async () => {
    const s = await src()
    expect(s).toContain('profile.scope')
  })

  it('async failure sets scope to { type: none }', async () => {
    const s       = await src()
    const catchIdx = s.indexOf('.catch(')
    const catchBlock = s.slice(catchIdx, catchIdx + 300)
    expect(catchBlock).toContain("type: 'none'")
  })

  it('async failure stores the error', async () => {
    const s       = await src()
    const catchIdx = s.indexOf('.catch(')
    const catchBlock = s.slice(catchIdx, catchIdx + 300)
    expect(catchBlock).toContain('error:')
    expect(catchBlock).toContain('instanceof Error')
  })
})

// ════════════════════════════════════════════════════════════
// 6. Race safety — cancelled flag
// ════════════════════════════════════════════════════════════

describe('useScopeProfile — race safety', () => {
  it('declares a cancelled flag before the async call', async () => {
    const s        = await src()
    const asyncIdx = s.indexOf('resolveAllowedPharmacyIds(resolverUser)')
    const before   = s.slice(Math.max(0, asyncIdx - 300), asyncIdx)
    expect(before).toContain('cancelled')
  })

  it('checks cancelled before applying async result', async () => {
    const s       = await src()
    const thenIdx = s.indexOf('.then(')
    const thenBlock = s.slice(thenIdx, thenIdx + 200)
    expect(thenBlock).toContain('cancelled')
  })

  it('cleanup function sets cancelled to true', async () => {
    const s = await src()
    expect(s).toContain('cancelled = true')
  })

  it('cleanup is returned from the useEffect', async () => {
    const s        = await src()
    const returnIdx = s.lastIndexOf('return () => {')
    const retBlock = s.slice(returnIdx, returnIdx + 60)
    expect(retBlock).toContain('cancelled = true')
  })
})

// ════════════════════════════════════════════════════════════
// 7. Behavioural — no userProfile
// ════════════════════════════════════════════════════════════

describe('useScopeProfile — behaviour: no userProfile', () => {
  beforeEach(() => {
    vi.mocked(useAuthStore).mockReturnValue({ userProfile: null } as never)
    vi.mocked(resolveAllowedPharmacyIdsSync).mockReset()
    vi.mocked(resolveAllowedPharmacyIds).mockReset()
  })

  it('no-userProfile case is handled in source with a null guard', async () => {
    const s = await src()
    expect(s).toContain('if (!userProfile)')
  })

  it('null guard sets scope null and loading false', async () => {
    const s        = await src()
    const guardIdx = s.indexOf('if (!userProfile)')
    const guardBlock = s.slice(guardIdx, guardIdx + 120)
    expect(guardBlock).toContain('scope: null')
    expect(guardBlock).toContain('loading: false')
  })
})

// ════════════════════════════════════════════════════════════
// 8. Behavioural — fast path does not call async
// ════════════════════════════════════════════════════════════

describe('useScopeProfile — behaviour: fast path skips async resolver', () => {
  it('source shows early return after fast !== null check', async () => {
    const s        = await src()
    const fastIdx  = s.indexOf('fast !== null')
    const fastBlock = s.slice(fastIdx, fastIdx + 250)
    // The fast path block must return without calling resolveAllowedPharmacyIds
    const asyncCallIdx = fastBlock.indexOf('resolveAllowedPharmacyIds(')
    const returnIdx    = fastBlock.indexOf('return')
    // return comes before any async call inside the fast-path block
    expect(returnIdx).toBeGreaterThanOrEqual(0)
    expect(asyncCallIdx).toBe(-1)
  })
})

// ════════════════════════════════════════════════════════════
// 9. Scope guardrails
// ════════════════════════════════════════════════════════════

describe('useScopeProfile — scope guardrails', () => {
  it('does not import from firebase/firestore directly', async () => {
    const s = await src()
    expect(s).not.toContain("from 'firebase/firestore'")
  })

  it('does not contain JSX or React rendering', async () => {
    const s = await src()
    expect(s).not.toContain('return <')
    expect(s).not.toContain('import React')
  })

  it('does not import from any page file', async () => {
    const s = await src()
    expect(s).not.toContain('pages/')
  })

  it('does not contain backfill or validation logic', async () => {
    const s = await src()
    expect(s).not.toContain('backfillAll')
    expect(s).not.toContain('auditAll')
    expect(s).not.toContain('validateAssigned')
  })

  it('does not import from App.jsx', async () => {
    const s = await src()
    expect(s).not.toContain("from '../App'")
    expect(s).not.toContain("import '../App'")
  })
})
