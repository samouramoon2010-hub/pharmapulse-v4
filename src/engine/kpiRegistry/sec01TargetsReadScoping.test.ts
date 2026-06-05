// ============================================================
// Regression Tests — SEC-01
// Firestore rule change: targets collection read access.
//
// Before fix:
//   allow read: if isAny();
//   Any authenticated user could read any target document,
//   including targets belonging to pharmacies they have no
//   connection to.
//
// After fix:
//   allow read: if isAdmin() || resource.data.pharmacyId == pharmId();
//   Admin reads all. Everyone else reads only their own pharmacy.
//
// These tests model the rule logic in pure TypeScript to verify
// the policy is correct across all role/pharmacyId combinations.
// Firestore security rules cannot be unit-tested against a live
// emulator here, so we replicate the exact decision function and
// test the logic comprehensively.
//
// Tests cover:
//   Admin        — reads any pharmacy's target ✓
//   Manager      — reads own pharmacy ✓
//   Manager      — denied other pharmacy ✗
//   Pharmacist   — reads own pharmacy ✓
//   Pharmacist   — denied other pharmacy ✗
//   Unauthenticated — denied everything ✗
//   Missing pharmacyId on doc — denied for non-admin ✗
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Rule model ────────────────────────────────────────────────
// Mirrors the exact Firestore rule logic.
//
//   function isAuth()  { return request.auth != null }
//   function uid()     { return request.auth.uid }
//   function role()    { return userDoc().role }
//   function pharmId() { return userDoc().pharmacyId }
//   function isAdmin() { return isAuth() && role() == 'admin' }
//
//   allow read: if isAdmin() || resource.data.pharmacyId == pharmId();

interface AuthContext {
  uid:        string | null   // null = unauthenticated
  role:       'admin' | 'manager' | 'pharmacist' | null
  pharmacyId: string | null
}

interface TargetDocument {
  pharmacyId: string | undefined
  month:      string
}

function canReadTarget(auth: AuthContext, doc: TargetDocument): boolean {
  // isAuth() check: uid must be non-null
  if (!auth.uid) return false

  // isAdmin(): role must be 'admin'
  const isAdmin = auth.role === 'admin'
  if (isAdmin) return true

  // pharmacyId match: document pharmacyId must equal caller's pharmacyId
  // pharmId() returns null if not set on the user doc
  if (!auth.pharmacyId) return false
  if (doc.pharmacyId === undefined) return false
  return doc.pharmacyId === auth.pharmacyId
}

// ── Fixtures ──────────────────────────────────────────────────

const TARGET_BRANCH_A: TargetDocument = { pharmacyId: 'pharmacy-aaa', month: '2025-05' }
const TARGET_BRANCH_B: TargetDocument = { pharmacyId: 'pharmacy-bbb', month: '2025-05' }
const TARGET_BRANCH_C: TargetDocument = { pharmacyId: 'pharmacy-ccc', month: '2025-05' }
const TARGET_NO_PHARMACY: TargetDocument = { pharmacyId: undefined, month: '2025-05' }

const ADMIN: AuthContext = {
  uid: 'admin-uid-001', role: 'admin', pharmacyId: null,
}
const MANAGER_A: AuthContext = {
  uid: 'mgr-uid-001', role: 'manager', pharmacyId: 'pharmacy-aaa',
}
const MANAGER_B: AuthContext = {
  uid: 'mgr-uid-002', role: 'manager', pharmacyId: 'pharmacy-bbb',
}
const PHARMACIST_A: AuthContext = {
  uid: 'pharm-uid-001', role: 'pharmacist', pharmacyId: 'pharmacy-aaa',
}
const PHARMACIST_B: AuthContext = {
  uid: 'pharm-uid-002', role: 'pharmacist', pharmacyId: 'pharmacy-bbb',
}
const UNAUTHENTICATED: AuthContext = {
  uid: null, role: null, pharmacyId: null,
}
const AUTHENTICATED_NO_BRANCH: AuthContext = {
  uid: 'orphan-uid-001', role: 'pharmacist', pharmacyId: null,
}

// ── Tests ─────────────────────────────────────────────────────

describe('SEC-01 Regression — targets collection read scoping', () => {

  // ── Admin: unrestricted read ──────────────────────────────────

  describe('Admin role — can read any pharmacy target', () => {
    it('admin can read Branch A target', () => {
      expect(canReadTarget(ADMIN, TARGET_BRANCH_A)).toBe(true)
    })

    it('admin can read Branch B target', () => {
      expect(canReadTarget(ADMIN, TARGET_BRANCH_B)).toBe(true)
    })

    it('admin can read Branch C target', () => {
      expect(canReadTarget(ADMIN, TARGET_BRANCH_C)).toBe(true)
    })

    it('admin can read a target document with no pharmacyId set', () => {
      // Admin bypass: isAdmin() returns true before pharmacyId check
      expect(canReadTarget(ADMIN, TARGET_NO_PHARMACY)).toBe(true)
    })

    it('admin without a pharmacyId assigned can still read all targets', () => {
      // Admins typically have no pharmacyId — must not block them
      const adminNoBranch: AuthContext = { ...ADMIN, pharmacyId: null }
      expect(canReadTarget(adminNoBranch, TARGET_BRANCH_A)).toBe(true)
      expect(canReadTarget(adminNoBranch, TARGET_BRANCH_B)).toBe(true)
    })
  })

  // ── Manager: own branch only ──────────────────────────────────

  describe('Manager role — own branch allowed, other branches denied', () => {
    it('manager of Branch A can read Branch A target', () => {
      expect(canReadTarget(MANAGER_A, TARGET_BRANCH_A)).toBe(true)
    })

    it('manager of Branch A CANNOT read Branch B target', () => {
      expect(canReadTarget(MANAGER_A, TARGET_BRANCH_B)).toBe(false)
    })

    it('manager of Branch A CANNOT read Branch C target', () => {
      expect(canReadTarget(MANAGER_A, TARGET_BRANCH_C)).toBe(false)
    })

    it('manager of Branch B can read Branch B target', () => {
      expect(canReadTarget(MANAGER_B, TARGET_BRANCH_B)).toBe(true)
    })

    it('manager of Branch B CANNOT read Branch A target', () => {
      expect(canReadTarget(MANAGER_B, TARGET_BRANCH_A)).toBe(false)
    })

    it('manager CANNOT read a target doc with undefined pharmacyId', () => {
      expect(canReadTarget(MANAGER_A, TARGET_NO_PHARMACY)).toBe(false)
    })
  })

  // ── Pharmacist: own branch only ───────────────────────────────

  describe('Pharmacist role — own branch allowed, other branches denied', () => {
    it('pharmacist of Branch A can read Branch A target', () => {
      expect(canReadTarget(PHARMACIST_A, TARGET_BRANCH_A)).toBe(true)
    })

    it('pharmacist of Branch A CANNOT read Branch B target', () => {
      expect(canReadTarget(PHARMACIST_A, TARGET_BRANCH_B)).toBe(false)
    })

    it('pharmacist of Branch A CANNOT read Branch C target', () => {
      expect(canReadTarget(PHARMACIST_A, TARGET_BRANCH_C)).toBe(false)
    })

    it('pharmacist of Branch B can read Branch B target', () => {
      expect(canReadTarget(PHARMACIST_B, TARGET_BRANCH_B)).toBe(true)
    })

    it('pharmacist of Branch B CANNOT read Branch A target', () => {
      expect(canReadTarget(PHARMACIST_B, TARGET_BRANCH_A)).toBe(false)
    })

    it('pharmacist CANNOT read a target doc with undefined pharmacyId', () => {
      expect(canReadTarget(PHARMACIST_A, TARGET_NO_PHARMACY)).toBe(false)
    })
  })

  // ── Cross-branch access denial ────────────────────────────────

  describe('Cross-branch access denial — explicit isolation checks', () => {
    it('Branch A pharmacist cannot read any of B, C targets', () => {
      expect(canReadTarget(PHARMACIST_A, TARGET_BRANCH_B)).toBe(false)
      expect(canReadTarget(PHARMACIST_A, TARGET_BRANCH_C)).toBe(false)
    })

    it('Branch B pharmacist cannot read any of A, C targets', () => {
      expect(canReadTarget(PHARMACIST_B, TARGET_BRANCH_A)).toBe(false)
      expect(canReadTarget(PHARMACIST_B, TARGET_BRANCH_C)).toBe(false)
    })

    it('Branch A manager cannot read Branch B target', () => {
      expect(canReadTarget(MANAGER_A, TARGET_BRANCH_B)).toBe(false)
    })

    it('Branch B manager cannot read Branch A target', () => {
      expect(canReadTarget(MANAGER_B, TARGET_BRANCH_A)).toBe(false)
    })

    it('no two non-admin users from different branches can read each other\'s targets', () => {
      // All non-admin users from different branches are isolated
      const nonAdminPairs: [AuthContext, TargetDocument][] = [
        [PHARMACIST_A, TARGET_BRANCH_B],
        [PHARMACIST_A, TARGET_BRANCH_C],
        [PHARMACIST_B, TARGET_BRANCH_A],
        [PHARMACIST_B, TARGET_BRANCH_C],
        [MANAGER_A,    TARGET_BRANCH_B],
        [MANAGER_A,    TARGET_BRANCH_C],
        [MANAGER_B,    TARGET_BRANCH_A],
        [MANAGER_B,    TARGET_BRANCH_C],
      ]
      nonAdminPairs.forEach(([auth, doc]) => {
        expect(canReadTarget(auth, doc)).toBe(false)
      })
    })
  })

  // ── Unauthenticated denial ────────────────────────────────────

  describe('Unauthenticated access — always denied', () => {
    it('unauthenticated user CANNOT read any target', () => {
      expect(canReadTarget(UNAUTHENTICATED, TARGET_BRANCH_A)).toBe(false)
      expect(canReadTarget(UNAUTHENTICATED, TARGET_BRANCH_B)).toBe(false)
      expect(canReadTarget(UNAUTHENTICATED, TARGET_BRANCH_C)).toBe(false)
    })

    it('authenticated user with no pharmacyId CANNOT read any target', () => {
      expect(canReadTarget(AUTHENTICATED_NO_BRANCH, TARGET_BRANCH_A)).toBe(false)
      expect(canReadTarget(AUTHENTICATED_NO_BRANCH, TARGET_BRANCH_B)).toBe(false)
    })
  })

  // ── Existing workflows: subscription method compatibility ──────

  describe('Existing subscription compatibility', () => {
    // subscribeTargets(pharmacyId) — used by manager and pharmacist
    // Builds: where('pharmacyId', '==', pharmacyId)
    // Rule now requires: resource.data.pharmacyId == pharmId()
    // These are equivalent when the UI passes the user's own pharmacyId ✓

    it('scoped subscription matches the read rule for a manager', () => {
      // If the query is where('pharmacyId', '==', MANAGER_A.pharmacyId),
      // every doc returned has pharmacyId === MANAGER_A.pharmacyId,
      // so the rule resource.data.pharmacyId == pharmId() passes for each doc
      const queriedDocs = [TARGET_BRANCH_A] // only docs matching the where clause
      queriedDocs.forEach((doc) => {
        expect(canReadTarget(MANAGER_A, doc)).toBe(true)
      })
    })

    it('scoped subscription matches the read rule for a pharmacist', () => {
      const queriedDocs = [TARGET_BRANCH_A] // only docs matching the where clause
      queriedDocs.forEach((doc) => {
        expect(canReadTarget(PHARMACIST_A, doc)).toBe(true)
      })
    })

    it('subscribeAllTargets (admin) satisfies the rule for all docs', () => {
      const allTargets = [TARGET_BRANCH_A, TARGET_BRANCH_B, TARGET_BRANCH_C]
      allTargets.forEach((doc) => {
        expect(canReadTarget(ADMIN, doc)).toBe(true)
      })
    })

    it('historyService fetchTarget reads own pharmacy — rule allows it', () => {
      // historyService.fetchTarget(pharmacyId, month) is called during KPI entry save.
      // The pharmacyId passed is always the submitting user's own pharmacyId.
      // A pharmacist at Branch A reading targets/{pharmacy-aaa}_{month} satisfies
      // resource.data.pharmacyId == pharmId() because both equal 'pharmacy-aaa'.
      const pharmacistContext = PHARMACIST_A
      const ownBranchTarget   = TARGET_BRANCH_A
      expect(canReadTarget(pharmacistContext, ownBranchTarget)).toBe(true)
    })
  })
})
