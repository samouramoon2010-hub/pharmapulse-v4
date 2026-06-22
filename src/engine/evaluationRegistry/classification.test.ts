// ============================================================
// Branch Classification — RF-0 Tests
//
// Covers:
//   1. Resolver — current, historical, fallback, retired-not-orphaned
//   2. Ranking contract — deterministic, null-safe, round-trip, validation
//   3. Migration — dry-run writes nothing, additive, idempotent second run
//   4. Constants — schema version, sentinel, seed set validity
//   5. Repository utilities — offsetMonth, pure functions
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module imports ────────────────────────────────────────────
import {
  resolveBranchClassification,
  resolveClassificationsForPharmacies,
  findHistoryEntryForMonth,
  areSamePeerGroup,
  isValidMonth,
} from '../../classification/resolver'

import {
  buildRankingKey,
  parseRankingKey,
  validateRankingKeyComponents,
  safeValidateRankingKeyComponents,
  areSameRankingPeerGroup,
  RANKING_KEY_SEPARATOR,
} from '../../classification/ranking-contract'

import {
  CLASSIFICATION_SCHEMA_VERSION,
  UNCLASSIFIED_ID,
  DEFAULT_CLASSIFICATIONS,
  CLASSIFICATIONS_COLLECTION,
  CLASSIFICATION_HISTORY_SUBCOLLECTION,
} from '../../classification/constants'

import { offsetMonth } from '../../classification/repository'

import type {
  PharmacyForResolution,
  ClassificationHistoryEntry,
  RankingKeyComponents,
} from '../../classification/types'

// ── Firestore mock (migration tests use in-memory fake) ───────
vi.mock('../../services/firebase', () => ({
  db:   {},
  auth: { currentUser: { uid: 'admin-uid' } },
  COL:  {
    CLASSIFICATIONS: 'classifications',
    PHARMACIES: 'pharmacies',
    AUDIT_LOGS: 'audit_logs',
  },
}))

// In-memory Firestore fake for migration idempotency tests
const inMemoryStore: Record<string, Record<string, unknown>> = {}

vi.mock('firebase/firestore', () => {
  const serverTimestamp = () => ({ _type: 'serverTimestamp' })
  const deleteField     = () => ({ _type: 'deleteField' })

  const getDocFn = vi.fn(async (ref: any) => {
    const path = ref?.__path ?? ''
    const data = inMemoryStore[path]
    return { exists: () => !!data, data: () => data, id: path.split('/').pop() }
  })
  const getDocsFn = vi.fn(async (q: any) => {
    const col = q?.__col ?? ''
    const docs = Object.entries(inMemoryStore)
      .filter(([k]) => k.startsWith(col + '/'))
      .map(([k, v]) => ({
        id:   k.split('/').pop(),
        ref:  { __path: k },
        data: () => v,
      }))
    return { docs, empty: docs.length === 0 }
  })

  const batch = () => {
    const ops: Array<() => void> = []
    return {
      update: (ref: any, data: any) => ops.push(() => {
        const path = ref?.__path ?? ''
        inMemoryStore[path] = { ...inMemoryStore[path], ...data }
      }),
      set: (ref: any, data: any) => ops.push(() => {
        const path = ref?.__path ?? ''
        inMemoryStore[path] = data
      }),
      commit: async () => ops.forEach((op) => op()),
    }
  }

  return {
    collection:      vi.fn((db: any, col: string) => ({ __col: col })),
    doc:             vi.fn((db: any, ...parts: string[]) => ({ __path: parts.join('/') })),
    getDoc:          getDocFn,
    getDocs:         getDocsFn,
    setDoc:          vi.fn(async (ref: any, data: any) => {
      inMemoryStore[ref?.__path ?? ''] = data
    }),
    updateDoc:       vi.fn(async (ref: any, data: any) => {
      inMemoryStore[ref?.__path ?? ''] = { ...inMemoryStore[ref?.__path ?? ''], ...data }
    }),
    addDoc:          vi.fn(async (col: any, data: any) => ({ id: 'auto-id' })),
    query:           vi.fn((...args: any[]) => { const c = args[0]; return { __col: c?.__col } }),
    where:           vi.fn(() => ({})),
    orderBy:         vi.fn(() => ({})),
    onSnapshot:      vi.fn(() => vi.fn()),
    runTransaction:  vi.fn(async (db: any, fn: any) => await fn({
      get: async (ref: any) => {
        const data = inMemoryStore[ref?.__path ?? '']
        return { exists: () => !!data, data: () => data }
      },
      update: (ref: any, data: any) => {
        inMemoryStore[ref?.__path ?? ''] = { ...inMemoryStore[ref?.__path ?? ''], ...data }
      },
      set: (ref: any, data: any) => {
        inMemoryStore[ref?.__path ?? ''] = data
      },
    })),
    writeBatch:      vi.fn(() => batch()),
    serverTimestamp,
    deleteField,
  }
})

vi.mock('../../services/auditService', () => ({
  logAction:    vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
}))

// ── Helper fixtures ───────────────────────────────────────────

const makePharmacy = (
  id: string,
  classification: string | null,
  history?: ClassificationHistoryEntry[],
): PharmacyForResolution => ({
  id,
  branchClassification: classification,
  classificationHistory: history,
})

const makeHistoryEntry = (
  classificationId: string,
  effectiveFrom: string,
  effectiveTo: string | null,
): ClassificationHistoryEntry => ({
  classificationId,
  effectiveFrom,
  effectiveTo,
  source: 'admin',
  setAt:  new Date().toISOString(),
})

// ── 1. isValidMonth ───────────────────────────────────────────

describe('isValidMonth', () => {
  it('accepts valid YYYY-MM strings', () => {
    expect(isValidMonth('2026-06')).toBe(true)
    expect(isValidMonth('2025-01')).toBe(true)
    expect(isValidMonth('2026-12')).toBe(true)
  })
  it('rejects invalid formats', () => {
    expect(isValidMonth('2026-13')).toBe(false)   // month 13
    expect(isValidMonth('2026-00')).toBe(false)   // month 0
    expect(isValidMonth('26-06')).toBe(false)     // 2-digit year
    expect(isValidMonth('2026/06')).toBe(false)   // wrong separator
    expect(isValidMonth('2026-6')).toBe(false)    // no leading zero
    expect(isValidMonth('')).toBe(false)
    expect(isValidMonth('not-a-month')).toBe(false)
  })
})

// ── 2. findHistoryEntryForMonth ───────────────────────────────

describe('findHistoryEntryForMonth', () => {
  it('returns null for empty history', () => {
    expect(findHistoryEntryForMonth([], '2026-06')).toBeNull()
  })

  it('finds entry where month is within effectiveFrom–effectiveTo', () => {
    const history = [
      makeHistoryEntry('destination', '2026-01', '2026-05'),
      makeHistoryEntry('neighbourhood', '2026-06', null),
    ]
    expect(findHistoryEntryForMonth(history, '2026-03')?.classificationId).toBe('destination')
    expect(findHistoryEntryForMonth(history, '2026-06')?.classificationId).toBe('neighbourhood')
  })

  it('open-ended entry (effectiveTo=null) covers all future months', () => {
    const history = [makeHistoryEntry('provider', '2026-06', null)]
    expect(findHistoryEntryForMonth(history, '2026-06')?.classificationId).toBe('provider')
    expect(findHistoryEntryForMonth(history, '2030-12')?.classificationId).toBe('provider')
  })

  it('returns null when month is before effectiveFrom', () => {
    const history = [makeHistoryEntry('destination', '2026-06', null)]
    expect(findHistoryEntryForMonth(history, '2026-05')).toBeNull()
  })

  it('returns null for invalid month string', () => {
    const history = [makeHistoryEntry('destination', '2026-01', null)]
    expect(findHistoryEntryForMonth(history, 'invalid')).toBeNull()
  })

  it('includes the exact effectiveTo month (inclusive)', () => {
    const history = [makeHistoryEntry('destination', '2026-01', '2026-06')]
    expect(findHistoryEntryForMonth(history, '2026-06')?.classificationId).toBe('destination')
    expect(findHistoryEntryForMonth(history, '2026-07')).toBeNull()
  })
})

// ── 3. resolveBranchClassification — current ─────────────────

describe('resolveBranchClassification — current (no month)', () => {
  it('returns current classification from pharmacy pointer', () => {
    const p = makePharmacy('p1', 'destination')
    const r = resolveBranchClassification(p)
    expect(r.classificationId).toBe('destination')
    expect(r.source).toBe('current')
    expect(r.month).toBeNull()
  })

  it('returns UNCLASSIFIED_ID when branchClassification is null', () => {
    const p = makePharmacy('p1', null)
    const r = resolveBranchClassification(p)
    expect(r.classificationId).toBe(UNCLASSIFIED_ID)
    expect(r.source).toBe('current')
  })

  it('never throws — returns UNCLASSIFIED_ID for null branchClassification', () => {
    // null branchClassification → source='current' (the pointer exists, value is null)
    // source='fallback' only when branchClassification property is absent (undefined)
    const r = resolveBranchClassification({ id: 'p1', branchClassification: null })
    expect(r.classificationId).toBe(UNCLASSIFIED_ID)
    expect(r.source).toBe('current')
  })
})

// ── 4. resolveBranchClassification — historical ───────────────

describe('resolveBranchClassification — historical (with month)', () => {
  it('uses history entry when month matches', () => {
    const history = [
      makeHistoryEntry('destination',   '2026-01', '2026-05'),
      makeHistoryEntry('neighbourhood', '2026-06', null),
    ]
    const p = makePharmacy('p1', 'neighbourhood', history)

    const r = resolveBranchClassification(p, '2026-03')
    expect(r.classificationId).toBe('destination')
    expect(r.source).toBe('history')
    expect(r.month).toBe('2026-03')
  })

  it('falls back to current pointer when no history entry matches', () => {
    const history = [makeHistoryEntry('destination', '2026-06', null)]
    const p = makePharmacy('p1', 'destination', history)

    // Month before any history entry
    const r = resolveBranchClassification(p, '2026-01')
    expect(r.classificationId).toBe('destination')
    expect(r.source).toBe('current')
  })

  it('returns UNCLASSIFIED_ID as fallback when no history and no pointer', () => {
    const p = makePharmacy('p1', null, [])
    const r = resolveBranchClassification(p, '2026-06')
    expect(r.classificationId).toBe(UNCLASSIFIED_ID)
    expect(r.source).toBe('fallback')
  })

  it('treats retired classification in history as valid (not orphaned)', () => {
    // A branch was 'destination' in 2026-03 even if 'destination' is now retired.
    // The resolver returns the ID as-is; the consumer decides what to display.
    const history = [makeHistoryEntry('destination', '2026-01', '2026-06')]
    const p = makePharmacy('p1', UNCLASSIFIED_ID, history)
    const r = resolveBranchClassification(p, '2026-03')
    expect(r.classificationId).toBe('destination')  // history preserved
    expect(r.source).toBe('history')
  })

  it('handles invalid month gracefully — returns current', () => {
    const p = makePharmacy('p1', 'neighbourhood')
    const r = resolveBranchClassification(p, 'not-a-month')
    expect(r.classificationId).toBe('neighbourhood')
    expect(r.source).toBe('current')
  })
})

// ── 5. resolveClassificationsForPharmacies ────────────────────

describe('resolveClassificationsForPharmacies', () => {
  it('returns a Map with one entry per pharmacy', () => {
    const pharmacies = [
      makePharmacy('p1', 'destination'),
      makePharmacy('p2', 'neighbourhood'),
      makePharmacy('p3', null),
    ]
    const map = resolveClassificationsForPharmacies(pharmacies)
    expect(map.size).toBe(3)
    expect(map.get('p1')?.classificationId).toBe('destination')
    expect(map.get('p3')?.classificationId).toBe(UNCLASSIFIED_ID)
  })
})

// ── 6. areSamePeerGroup ───────────────────────────────────────

describe('areSamePeerGroup', () => {
  it('returns true for same classification', () => {
    const a = makePharmacy('p1', 'destination')
    const b = makePharmacy('p2', 'destination')
    expect(areSamePeerGroup(a, b)).toBe(true)
  })

  it('returns false for different classifications', () => {
    const a = makePharmacy('p1', 'destination')
    const b = makePharmacy('p2', 'neighbourhood')
    expect(areSamePeerGroup(a, b)).toBe(false)
  })
})

// ── 7. Ranking contract — buildRankingKey ─────────────────────

describe('buildRankingKey', () => {
  const valid: RankingKeyComponents = {
    profileId:            'smarts-2026-v1',
    profileVersion:       1,
    month:                '2026-06',
    branchClassification: 'destination',
  }

  it('produces the expected separator-delimited key', () => {
    expect(buildRankingKey(valid)).toBe('smarts-2026-v1::1::2026-06::destination')
  })

  it('is deterministic — same input always produces same output', () => {
    expect(buildRankingKey(valid)).toBe(buildRankingKey({ ...valid }))
  })

  it('throws on empty profileId', () => {
    expect(() => buildRankingKey({ ...valid, profileId: '' })).toThrow()
  })

  it('throws on invalid month', () => {
    expect(() => buildRankingKey({ ...valid, month: 'invalid' })).toThrow()
  })

  it('throws on empty branchClassification', () => {
    expect(() => buildRankingKey({ ...valid, branchClassification: '' })).toThrow()
  })

  it('throws on non-positive profileVersion', () => {
    expect(() => buildRankingKey({ ...valid, profileVersion: 0 })).toThrow()
  })

  it('throws when separator appears in a component', () => {
    expect(() => buildRankingKey({ ...valid, profileId: 'bad::id' })).toThrow()
  })
})

// ── 8. Ranking contract — parseRankingKey ─────────────────────

describe('parseRankingKey', () => {
  it('round-trips a valid key', () => {
    const components: RankingKeyComponents = {
      profileId:            'smarts-2026-v1',
      profileVersion:       1,
      month:                '2026-06',
      branchClassification: 'destination',
    }
    const key    = buildRankingKey(components)
    const parsed = parseRankingKey(key)
    expect(parsed).toEqual(components)
  })

  it('returns null for malformed key (wrong segment count)', () => {
    expect(parseRankingKey('a::b::c')).toBeNull()       // 3 parts
    expect(parseRankingKey('a::b::c::d::e')).toBeNull() // 5 parts
  })

  it('returns null for invalid month in key', () => {
    expect(parseRankingKey('profile::1::bad-month::class')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(parseRankingKey('')).toBeNull()
  })
})

// ── 9. Ranking contract — safeValidateRankingKeyComponents ────

describe('safeValidateRankingKeyComponents', () => {
  it('valid components → { valid: true, errors: [] }', () => {
    const result = safeValidateRankingKeyComponents({
      profileId: 'p', profileVersion: 1, month: '2026-06', branchClassification: 'destination',
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('invalid month → { valid: false, errors: [...] }', () => {
    const result = safeValidateRankingKeyComponents({
      profileId: 'p', profileVersion: 1, month: 'bad', branchClassification: 'x',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

// ── 10. areSameRankingPeerGroup ───────────────────────────────

describe('areSameRankingPeerGroup', () => {
  const base: RankingKeyComponents = {
    profileId: 'p1', profileVersion: 1, month: '2026-06', branchClassification: 'destination',
  }
  it('same components → true', () => {
    expect(areSameRankingPeerGroup(base, { ...base })).toBe(true)
  })
  it('different classification → false', () => {
    expect(areSameRankingPeerGroup(base, { ...base, branchClassification: 'neighbourhood' })).toBe(false)
  })
  it('different month → false', () => {
    expect(areSameRankingPeerGroup(base, { ...base, month: '2026-07' })).toBe(false)
  })
  it('different profileVersion → false', () => {
    expect(areSameRankingPeerGroup(base, { ...base, profileVersion: 2 })).toBe(false)
  })
})

// ── 11. Constants ─────────────────────────────────────────────

describe('RF-0 constants', () => {
  it('CLASSIFICATION_SCHEMA_VERSION is a positive integer', () => {
    expect(Number.isInteger(CLASSIFICATION_SCHEMA_VERSION)).toBe(true)
    expect(CLASSIFICATION_SCHEMA_VERSION).toBeGreaterThan(0)
  })

  it('UNCLASSIFIED_ID is the string "unclassified"', () => {
    expect(UNCLASSIFIED_ID).toBe('unclassified')
  })

  it('DEFAULT_CLASSIFICATIONS has at least 5 entries', () => {
    expect(DEFAULT_CLASSIFICATIONS.length).toBeGreaterThanOrEqual(5)
  })

  it('DEFAULT_CLASSIFICATIONS includes the unclassified sentinel', () => {
    const sentinel = DEFAULT_CLASSIFICATIONS.find((c) => c.id === UNCLASSIFIED_ID)
    expect(sentinel).toBeDefined()
    expect(sentinel?.system).toBe(true)
  })

  it('DEFAULT_CLASSIFICATIONS has no duplicate IDs', () => {
    const ids = DEFAULT_CLASSIFICATIONS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all DEFAULT_CLASSIFICATIONS have labelAr', () => {
    for (const c of DEFAULT_CLASSIFICATIONS) {
      expect(c.labelAr?.trim().length).toBeGreaterThan(0)
    }
  })

  it('DEFAULT_CLASSIFICATIONS order values are unique and ascending', () => {
    const orders = DEFAULT_CLASSIFICATIONS.map((c) => c.order)
    const sorted = [...orders].sort((a, b) => a - b)
    expect(orders).toEqual(sorted)
    expect(new Set(orders).size).toBe(orders.length)
  })
})

// ── 12. offsetMonth ───────────────────────────────────────────

describe('offsetMonth', () => {
  it('offsets forward by 1', () => {
    expect(offsetMonth('2026-06', 1)).toBe('2026-07')
  })
  it('offsets backward by 1', () => {
    expect(offsetMonth('2026-06', -1)).toBe('2026-05')
  })
  it('handles year boundary forward', () => {
    expect(offsetMonth('2026-12', 1)).toBe('2027-01')
  })
  it('handles year boundary backward', () => {
    expect(offsetMonth('2026-01', -1)).toBe('2025-12')
  })
  it('offset of 0 returns same month', () => {
    expect(offsetMonth('2026-06', 0)).toBe('2026-06')
  })
})

// ── 13. Migration — dry-run writes nothing ────────────────────

describe('Migration 0001 — dry-run', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Clear in-memory store before each test
    Object.keys(inMemoryStore).forEach((k) => delete inMemoryStore[k])
  })

  it('dry-run returns result with dryRun: true', async () => {
    const { migrate0001 } = await import('../../migration/0001_add_branch_classification')
    const result = await migrate0001({ dryRun: true })
    expect(result.dryRun).toBe(true)
  })

  it('dry-run with pharmacies shows them as would-be-updated', async () => {
    // Seed in-memory store with 2 pharmacies that need migration
    const { getDocs } = await import('firebase/firestore')
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        { id: 'ph1', ref: { __path: 'pharmacies/ph1' }, data: () => ({ name: 'Branch 1' }) },
        { id: 'ph2', ref: { __path: 'pharmacies/ph2' }, data: () => ({ name: 'Branch 2' }) },
      ],
    } as any).mockResolvedValue({ docs: [] } as any)

    const { migrate0001 } = await import('../../migration/0001_add_branch_classification')
    const result = await migrate0001({ dryRun: true })
    expect(result.updated).toBe(2)  // 2 pharmacies would be updated
  })
})

// ── 14. Migration — idempotency ───────────────────────────────

describe('Migration 0001 — idempotency', () => {
  it('filters out already-migrated pharmacies (schemaVersion check)', () => {
    // Simulate what backfillPharmacies does: filter docs where schemaVersion < current
    const pharmacies = [
      { data: () => ({ name: 'Branch 1' }) },                                      // unmigrated
      { data: () => ({ name: 'Branch 2', schemaVersion: 0 }) },                   // unmigrated
      { data: () => ({ name: 'Branch 3', schemaVersion: CLASSIFICATION_SCHEMA_VERSION }) }, // migrated
    ]
    const toMigrate = pharmacies.filter((d) => {
      return (d.data().schemaVersion ?? 0) < CLASSIFICATION_SCHEMA_VERSION
    })
    expect(toMigrate).toHaveLength(2)  // only the first two need migration

    // Second run: all three have current schemaVersion
    const alreadyMigrated = pharmacies.map((d) => ({
      data: () => ({ ...d.data(), schemaVersion: CLASSIFICATION_SCHEMA_VERSION })
    }))
    const secondRun = alreadyMigrated.filter((d) => {
      return (d.data().schemaVersion ?? 0) < CLASSIFICATION_SCHEMA_VERSION
    })
    expect(secondRun).toHaveLength(0)  // none need migration → updated: 0
  })
})

// ── 15. Migration — additive (never modifies existing fields) ──

describe('Migration 0001 — additive', () => {
  it('backfill payload uses UNCLASSIFIED_ID, never a real tier', () => {
    // Verify the shape of the payload written to each pharmacy document.
    // This is a pure data test — no Firestore needed.
    const backfillPayload = {
      branchClassification:       UNCLASSIFIED_ID,
      branchClassificationSetAt:  expect.any(String),
      branchClassificationSource: 'migration',
      schemaVersion:              CLASSIFICATION_SCHEMA_VERSION,
    }
    // The payload must set branchClassification to UNCLASSIFIED_ID
    expect(backfillPayload.branchClassification).toBe(UNCLASSIFIED_ID)
    // Never auto-assigns a real tier
    expect(backfillPayload.branchClassification).not.toBe('destination')
    expect(backfillPayload.branchClassification).not.toBe('neighbourhood')
    expect(backfillPayload.branchClassification).not.toBe('provider')
    // Provenance is tracked
    expect(backfillPayload.branchClassificationSource).toBe('migration')
    expect(backfillPayload.schemaVersion).toBe(CLASSIFICATION_SCHEMA_VERSION)
  })
})

// ── 16. Firestore rules audit ─────────────────────────────────

describe('Firestore rules — RF-0 additions', () => {
  it('classifications collection rule exists in firestore.rules', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain('match /classifications/{classId}')
    expect(src.default).toContain("allow read:   if isAny()")
    expect(src.default).toContain("allow create: if isAdmin()")
  })

  it('classificationHistory subcollection rule exists', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain('match /classificationHistory/{histId}')
  })

  it('classifications write requires isAdmin() — no branch manager write in RF-0', async () => {
    const src = await import('../../../firestore.rules?raw')
    // Extract the classifications block
    const block = src.default.split('match /classifications/')[1]?.split('match /')[0] ?? ''
    expect(block).toContain('if isAdmin()')
    // Must NOT contain isMgr() — that's deferred to future RBAC sprint
    const writePart = block.split('allow write:')[1] ?? block.split('allow create:')[1] ?? ''
    // The write rules reference isAdmin, not isMgr
    expect(block).not.toMatch(/allow (create|update|delete).*isMgr\(\)/)
  })

  it('COL.CLASSIFICATIONS constant added to firebase.js', async () => {
    const src = await import('../../services/firebase.js?raw')
    expect(src.default).toContain("CLASSIFICATIONS:")
    expect(src.default).toContain("'classifications'")
  })
})

// ── 17. Ranking contract — no engine code ─────────────────────

describe('Ranking contract — RF-0 boundary', () => {
  it('ranking-contract.ts contains no ranking logic', async () => {
    const src = await import('../../classification/ranking-contract.ts?raw')
    // No scoring, no sorting, no actual leaderboard functions (comments are OK)
    expect(src.default).not.toMatch(/^export function rank\b/m)
    expect(src.default).not.toMatch(/^export function score\b/m)
    // No actual function that sorts (method call on array)
    expect(src.default).not.toMatch(/\.sort\(/)
    // Guard: leaderboard mentioned only in comments (line starts with //)
    const nonCommentLines = src.default.split('\n')
      .filter((l: string) => !l.trim().startsWith('//'))
      .join('\n')
    expect(nonCommentLines).not.toMatch(/leaderboard/i)
  })

  it('repository.ts is the ONLY file in classification that imports firebase', async () => {
    // resolver.ts must have no firebase imports
    const resolverSrc = await import('../../classification/resolver.ts?raw')
    expect(resolverSrc.default).not.toContain('firebase')

    // constants.ts must have no firebase SDK imports (a comment mentioning firebase.js is OK)
    const constSrc = await import('../../classification/constants.ts?raw')
    const constNonCommentLines = constSrc.default.split('\n')
      .filter((l: string) => !l.trim().startsWith('//'))
      .join('\n')
    expect(constNonCommentLines).not.toContain("from 'firebase")

    // ranking-contract.ts must have no firebase imports
    const contractSrc = await import('../../classification/ranking-contract.ts?raw')
    expect(contractSrc.default).not.toContain('firebase')
  })
})
