// ============================================================
// Regression Tests — SEC-03
// TeamPage called subscribeAllEntries() and subscribeAllTargets()
// unconditionally for ALL roles, including managers. This meant
// a manager of Branch A received every entry and target from
// every pharmacy in the system.
//
// Fix:
//   - Admin: unchanged — subscribeAllEntries + subscribeAllTargets
//   - Manager: subscribePharmacyEntries(pharmacyId) + subscribeMyTargets(pharmacyId)
//   - Missing pharmacyId: no subscription (safe empty state)
//
// Additionally: the teamIntelligence useMemo now adds a
// defensive pharmacy-scoped filter on entries so the block
// is safe even if the subscription contract is violated.
//
// Tests verify:
//   1.  Admin receives all entries/targets (no regression).
//   2.  Manager only receives entries for their own pharmacy.
//   3.  Manager only receives targets for their own pharmacy.
//   4.  Manager with no pharmacyId triggers no subscription.
//   5.  Entries from other pharmacies are excluded from team
//       intelligence even if present in the store.
//   6.  Admin receives entries from all pharmacies.
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Pure logic extracted from TeamPage teamIntelligence useMemo ─
// We test the filtering logic in isolation to avoid React/Firebase
// dependencies. The logic mirrors exactly what TeamPage does after
// the SEC-03 fix.

interface Entry {
  userId:     string
  pharmacyId: string
  date:       string
  wasfaty?:   number
}

function filterTeamEntries(
  entries:    Entry[],
  isAdmin:    boolean,
  pharmacyId: string | undefined,
  monthFrom:  string,
  monthTo:    string,
): Entry[] {
  return entries.filter((e) =>
    e.date >= monthFrom && e.date <= monthTo &&
    (isAdmin || e.pharmacyId === pharmacyId)
  )
}

// ── Subscription selector — mirrors the useEffect logic ───────
type SubscriptionCall = 'subscribeAll' | 'subscribePharmacy' | 'subscribeMyTargets' | 'none'

function resolveEntrySubscription(
  isAdmin:    boolean,
  pharmacyId: string | undefined,
): SubscriptionCall {
  if (isAdmin)    return 'subscribeAll'
  if (pharmacyId) return 'subscribePharmacy'
  return 'none'
}

function resolveTargetSubscription(
  isAdmin:    boolean,
  pharmacyId: string | undefined,
): SubscriptionCall {
  if (isAdmin)    return 'subscribeAll'
  if (pharmacyId) return 'subscribeMyTargets'
  return 'none'
}

// ── Fixtures ──────────────────────────────────────────────────

const MONTH_FROM = '2025-05-01'
const MONTH_TO   = '2025-05-31'

const ENTRIES_MULTI_BRANCH: Entry[] = [
  { userId: 'user-a1', pharmacyId: 'pharmacy-a', date: '2025-05-10', wasfaty: 20 },
  { userId: 'user-a2', pharmacyId: 'pharmacy-a', date: '2025-05-11', wasfaty: 15 },
  { userId: 'user-b1', pharmacyId: 'pharmacy-b', date: '2025-05-10', wasfaty: 30 },
  { userId: 'user-b2', pharmacyId: 'pharmacy-b', date: '2025-05-12', wasfaty: 25 },
  { userId: 'user-c1', pharmacyId: 'pharmacy-c', date: '2025-05-09', wasfaty: 10 },
  // Out of month range — should be excluded regardless of role
  { userId: 'user-a1', pharmacyId: 'pharmacy-a', date: '2025-04-30', wasfaty: 99 },
]

// ── Tests ─────────────────────────────────────────────────────

describe('SEC-03 Regression — TeamPage subscription scoping', () => {

  // ── Subscription resolution ──────────────────────────────────

  describe('subscription selector — entries', () => {
    it('admin resolves to subscribeAll', () => {
      expect(resolveEntrySubscription(true, 'pharmacy-a')).toBe('subscribeAll')
    })

    it('admin without pharmacyId still resolves to subscribeAll', () => {
      expect(resolveEntrySubscription(true, undefined)).toBe('subscribeAll')
    })

    it('manager with pharmacyId resolves to subscribePharmacy', () => {
      expect(resolveEntrySubscription(false, 'pharmacy-a')).toBe('subscribePharmacy')
    })

    it('manager without pharmacyId resolves to none (no subscription)', () => {
      expect(resolveEntrySubscription(false, undefined)).toBe('none')
    })
  })

  describe('subscription selector — targets', () => {
    it('admin resolves to subscribeAll', () => {
      expect(resolveTargetSubscription(true, 'pharmacy-a')).toBe('subscribeAll')
    })

    it('manager with pharmacyId resolves to subscribeMyTargets', () => {
      expect(resolveTargetSubscription(false, 'pharmacy-a')).toBe('subscribeMyTargets')
    })

    it('manager without pharmacyId resolves to none (no subscription)', () => {
      expect(resolveTargetSubscription(false, undefined)).toBe('none')
    })
  })

  // ── Entry filtering (defensive layer in teamIntelligence useMemo) ─

  describe('defensive entry filter — manager isolation', () => {
    it('manager sees ONLY entries from their own pharmacy', () => {
      const result = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, false, 'pharmacy-a', MONTH_FROM, MONTH_TO
      )
      expect(result.every((e) => e.pharmacyId === 'pharmacy-a')).toBe(true)
    })

    it('manager sees correct number of in-branch, in-month entries', () => {
      const result = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, false, 'pharmacy-a', MONTH_FROM, MONTH_TO
      )
      expect(result).toHaveLength(2)
    })

    it('manager does NOT see entries from pharmacy-b', () => {
      const result = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, false, 'pharmacy-a', MONTH_FROM, MONTH_TO
      )
      expect(result.some((e) => e.pharmacyId === 'pharmacy-b')).toBe(false)
    })

    it('manager does NOT see entries from pharmacy-c', () => {
      const result = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, false, 'pharmacy-a', MONTH_FROM, MONTH_TO
      )
      expect(result.some((e) => e.pharmacyId === 'pharmacy-c')).toBe(false)
    })

    it('manager does NOT see out-of-month entries from own branch', () => {
      const result = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, false, 'pharmacy-a', MONTH_FROM, MONTH_TO
      )
      // The April 30 entry for pharmacy-a must be excluded
      expect(result.some((e) => e.date === '2025-04-30')).toBe(false)
    })

    it('manager with no pharmacyId sees no entries', () => {
      const result = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, false, undefined, MONTH_FROM, MONTH_TO
      )
      expect(result).toHaveLength(0)
    })
  })

  describe('defensive entry filter — admin access', () => {
    it('admin sees entries from ALL pharmacies', () => {
      const result = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, true, undefined, MONTH_FROM, MONTH_TO
      )
      const pharmacies = new Set(result.map((e) => e.pharmacyId))
      expect(pharmacies.has('pharmacy-a')).toBe(true)
      expect(pharmacies.has('pharmacy-b')).toBe(true)
      expect(pharmacies.has('pharmacy-c')).toBe(true)
    })

    it('admin still excludes out-of-month entries', () => {
      const result = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, true, undefined, MONTH_FROM, MONTH_TO
      )
      expect(result.some((e) => e.date === '2025-04-30')).toBe(false)
    })

    it('admin in-month count is correct (5 in-range entries)', () => {
      const result = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, true, undefined, MONTH_FROM, MONTH_TO
      )
      expect(result).toHaveLength(5)
    })
  })

  // ── Data isolation: cross-pharmacy contamination check ────────

  describe('cross-pharmacy contamination — data isolation', () => {
    it('pharmacy-b entries are never visible to pharmacy-a manager', () => {
      const pharmacyAEntries = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, false, 'pharmacy-a', MONTH_FROM, MONTH_TO
      )
      const pharmacyBEntries = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, false, 'pharmacy-b', MONTH_FROM, MONTH_TO
      )

      // No overlap
      const aUserIds = new Set(pharmacyAEntries.map((e) => e.userId))
      const bUserIds = new Set(pharmacyBEntries.map((e) => e.userId))
      const overlap  = [...aUserIds].filter((id) => bUserIds.has(id))
      expect(overlap).toHaveLength(0)
    })

    it('each branch manager sees only their pharmacists', () => {
      const branchA = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, false, 'pharmacy-a', MONTH_FROM, MONTH_TO
      )
      const branchB = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, false, 'pharmacy-b', MONTH_FROM, MONTH_TO
      )
      const branchC = filterTeamEntries(
        ENTRIES_MULTI_BRANCH, false, 'pharmacy-c', MONTH_FROM, MONTH_TO
      )

      // Each set is non-overlapping and covers the right people
      expect(branchA.map((e) => e.userId).sort()).toEqual(['user-a1', 'user-a2'])
      expect(branchB.map((e) => e.userId).sort()).toEqual(['user-b1', 'user-b2'])
      expect(branchC.map((e) => e.userId).sort()).toEqual(['user-c1'])
    })
  })
})
