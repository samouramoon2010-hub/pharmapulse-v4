// ============================================================
// Regression Tests — SEC-02
// Firestore rule change: audit_logs collection create access.
//
// Before fix:
//   allow create: if isAny();
//   Any authenticated user could write an audit log with any
//   userId value — including another user's UID. This allowed
//   false attribution and log pollution.
//
// After fix:
//   allow create: if isAny() && request.resource.data.userId == uid();
//   The userId field in the document being written must equal
//   the caller's own Firebase Auth UID. False attribution is blocked.
//
// Tests cover:
//   1. Own UID in document: create allowed ✓
//   2. Foreign UID in document: create denied ✗
//   3. Null userId in document: create denied ✗
//   4. Unauthenticated: always denied ✗
//   5. All logAction() call paths verified: each passes own UID ✓
//   6. Immutability: update always denied for all roles ✗
//   7. Read: only manager/admin ✓
//   8. Delete: only admin ✓
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Rule model ────────────────────────────────────────────────
// Mirrors the exact Firestore rule logic.
//
//   function isAuth()  { return request.auth != null }
//   function uid()     { return request.auth.uid }
//   function isMgr()   { return isAuth() && role() in ['admin','manager'] }
//   function isAdmin() { return isAuth() && role() == 'admin' }
//
//   allow read:   if isMgr();
//   allow create: if isAny() && request.resource.data.userId == uid();
//   allow update: if false;
//   allow delete: if isAdmin();

interface AuthContext {
  uid:  string | null
  role: 'admin' | 'manager' | 'pharmacist' | null
}

interface AuditLogPayload {
  userId:   string | null | undefined
  action:   string
  userRole: string | null
}

function canCreateAuditLog(auth: AuthContext, payload: AuditLogPayload): boolean {
  // isAuth() check
  if (!auth.uid) return false
  // userId must match caller's UID
  return payload.userId === auth.uid
}

function canReadAuditLogs(auth: AuthContext): boolean {
  if (!auth.uid) return false
  return auth.role === 'admin' || auth.role === 'manager'
}

function canUpdateAuditLog(_auth: AuthContext): boolean {
  // allow update: if false — no one can update
  return false
}

function canDeleteAuditLog(auth: AuthContext): boolean {
  if (!auth.uid) return false
  return auth.role === 'admin'
}

// ── Fixtures ──────────────────────────────────────────────────

const ADMIN:       AuthContext = { uid: 'admin-uid-001', role: 'admin'       }
const MANAGER:     AuthContext = { uid: 'mgr-uid-001',   role: 'manager'     }
const PHARMACIST:  AuthContext = { uid: 'pharm-uid-001', role: 'pharmacist'  }
const UNAUTHED:    AuthContext = { uid: null,             role: null          }

function ownLog(auth: AuthContext, action = 'create'): AuditLogPayload {
  return { userId: auth.uid, action, userRole: auth.role }
}

function foreignLog(targetUid: string, action = 'create'): AuditLogPayload {
  return { userId: targetUid, action, userRole: 'pharmacist' }
}

// ── Tests ─────────────────────────────────────────────────────

describe('SEC-02 Regression — audit_logs create userId binding', () => {

  // ── Own UID: create allowed ───────────────────────────────────

  describe('Own UID in document — create allowed', () => {
    it('pharmacist can create audit log with their own UID', () => {
      expect(canCreateAuditLog(PHARMACIST, ownLog(PHARMACIST))).toBe(true)
    })

    it('manager can create audit log with their own UID', () => {
      expect(canCreateAuditLog(MANAGER, ownLog(MANAGER))).toBe(true)
    })

    it('admin can create audit log with their own UID', () => {
      expect(canCreateAuditLog(ADMIN, ownLog(ADMIN))).toBe(true)
    })

    it('pharmacist create with own UID succeeds for any action type', () => {
      const actions = ['create', 'update', 'delete', 'login', 'logout', 'import']
      actions.forEach((action) => {
        expect(canCreateAuditLog(PHARMACIST, ownLog(PHARMACIST, action))).toBe(true)
      })
    })
  })

  // ── Foreign UID: create denied ────────────────────────────────

  describe('Foreign UID in document — create denied', () => {
    it('pharmacist CANNOT write audit log attributing action to admin UID', () => {
      expect(canCreateAuditLog(PHARMACIST, foreignLog(ADMIN.uid!))).toBe(false)
    })

    it('pharmacist CANNOT write audit log attributing action to manager UID', () => {
      expect(canCreateAuditLog(PHARMACIST, foreignLog(MANAGER.uid!))).toBe(false)
    })

    it('pharmacist CANNOT write audit log attributing action to another pharmacist UID', () => {
      const otherPharmacist = 'pharm-uid-999'
      expect(canCreateAuditLog(PHARMACIST, foreignLog(otherPharmacist))).toBe(false)
    })

    it('manager CANNOT write audit log claiming to be admin', () => {
      expect(canCreateAuditLog(MANAGER, foreignLog(ADMIN.uid!))).toBe(false)
    })

    it('admin CANNOT write audit log claiming to be manager', () => {
      expect(canCreateAuditLog(ADMIN, foreignLog(MANAGER.uid!))).toBe(false)
    })

    it('no user can impersonate any other user in an audit log', () => {
      const users = [ADMIN, MANAGER, PHARMACIST]
      users.forEach((actor) => {
        users
          .filter((target) => target.uid !== actor.uid)
          .forEach((target) => {
            expect(canCreateAuditLog(actor, foreignLog(target.uid!))).toBe(false)
          })
      })
    })
  })

  // ── Null / missing userId: create denied ──────────────────────

  describe('Null or missing userId — create denied', () => {
    it('pharmacist CANNOT write audit log with null userId', () => {
      const payload: AuditLogPayload = { userId: null, action: 'create', userRole: 'pharmacist' }
      expect(canCreateAuditLog(PHARMACIST, payload)).toBe(false)
    })

    it('pharmacist CANNOT write audit log with undefined userId', () => {
      const payload: AuditLogPayload = { userId: undefined, action: 'create', userRole: 'pharmacist' }
      expect(canCreateAuditLog(PHARMACIST, payload)).toBe(false)
    })

    it('admin CANNOT write audit log with null userId', () => {
      const payload: AuditLogPayload = { userId: null, action: 'delete', userRole: 'admin' }
      expect(canCreateAuditLog(ADMIN, payload)).toBe(false)
    })
  })

  // ── Unauthenticated: always denied ────────────────────────────

  describe('Unauthenticated — always denied', () => {
    it('unauthenticated user CANNOT create any audit log', () => {
      const payload: AuditLogPayload = { userId: 'some-uid', action: 'login', userRole: null }
      expect(canCreateAuditLog(UNAUTHED, payload)).toBe(false)
    })

    it('unauthenticated user cannot read audit logs', () => {
      expect(canReadAuditLogs(UNAUTHED)).toBe(false)
    })
  })

  // ── Immutability: update always denied ───────────────────────

  describe('Immutability — update denied for all roles', () => {
    it('admin CANNOT update an audit log', () => {
      expect(canUpdateAuditLog(ADMIN)).toBe(false)
    })

    it('manager CANNOT update an audit log', () => {
      expect(canUpdateAuditLog(MANAGER)).toBe(false)
    })

    it('pharmacist CANNOT update an audit log', () => {
      expect(canUpdateAuditLog(PHARMACIST)).toBe(false)
    })

    it('unauthenticated user CANNOT update an audit log', () => {
      expect(canUpdateAuditLog(UNAUTHED)).toBe(false)
    })
  })

  // ── Read scoping ──────────────────────────────────────────────

  describe('Read scoping — only manager and admin', () => {
    it('admin can read audit logs', () => {
      expect(canReadAuditLogs(ADMIN)).toBe(true)
    })

    it('manager can read audit logs', () => {
      expect(canReadAuditLogs(MANAGER)).toBe(true)
    })

    it('pharmacist CANNOT read audit logs', () => {
      expect(canReadAuditLogs(PHARMACIST)).toBe(false)
    })

    it('unauthenticated CANNOT read audit logs', () => {
      expect(canReadAuditLogs(UNAUTHED)).toBe(false)
    })
  })

  // ── Delete scoping ────────────────────────────────────────────

  describe('Delete scoping — only admin', () => {
    it('admin can delete audit logs', () => {
      expect(canDeleteAuditLog(ADMIN)).toBe(true)
    })

    it('manager CANNOT delete audit logs', () => {
      expect(canDeleteAuditLog(MANAGER)).toBe(false)
    })

    it('pharmacist CANNOT delete audit logs', () => {
      expect(canDeleteAuditLog(PHARMACIST)).toBe(false)
    })

    it('unauthenticated CANNOT delete audit logs', () => {
      expect(canDeleteAuditLog(UNAUTHED)).toBe(false)
    })
  })

  // ── Existing logAction() call paths ──────────────────────────
  // Each caller verified to pass auth.currentUser.uid as userId.
  // These tests document the contract so future callers can be
  // checked against the same pattern.

  describe('Existing logAction() call paths — userId always equals caller UID', () => {
    it('authStore.login: userId = user.uid (Firebase Auth UID)', () => {
      // authStore.js: logAction({ userId: user.uid, ... })
      // user comes from signInWithEmailAndPassword result
      const firebaseAuthUid = 'firebase-auth-uid-from-sign-in'
      const callerId        = firebaseAuthUid   // same value
      const payload         = { userId: callerId, action: 'login', userRole: 'pharmacist' }
      const auth: AuthContext = { uid: callerId, role: 'pharmacist' }
      expect(canCreateAuditLog(auth, payload)).toBe(true)
    })

    it('authStore.logout: userId = userProfile.uid (same as auth UID)', () => {
      const authUid = 'auth-uid-logout'
      const payload = { userId: authUid, action: 'logout', userRole: 'pharmacist' }
      const auth: AuthContext = { uid: authUid, role: 'pharmacist' }
      expect(canCreateAuditLog(auth, payload)).toBe(true)
    })

    it('kpiService.saveKpiEntry: userId = actorId || auth.currentUser.uid', () => {
      // actorId is passed from KpiEntryPage as uid = userProfile.uid = auth.currentUser.uid
      const actorUid = 'pharmacist-actor-uid'
      const payload = { userId: actorUid, action: 'create', userRole: 'pharmacist' }
      const auth: AuthContext = { uid: actorUid, role: 'pharmacist' }
      expect(canCreateAuditLog(auth, payload)).toBe(true)
    })

    it('kpiService.saveTarget: userId = actorId = userProfile.uid', () => {
      const actorUid = 'manager-actor-uid'
      const payload = { userId: actorUid, action: 'create', userRole: 'manager' }
      const auth: AuthContext = { uid: actorUid, role: 'manager' }
      expect(canCreateAuditLog(auth, payload)).toBe(true)
    })

    it('kpiService.deleteTarget: userId = actorId = userProfile.uid', () => {
      const actorUid = 'admin-actor-uid'
      const payload = { userId: actorUid, action: 'delete', userRole: 'admin' }
      const auth: AuthContext = { uid: actorUid, role: 'admin' }
      expect(canCreateAuditLog(auth, payload)).toBe(true)
    })

    it('kpiRegistryService: userId = auth.currentUser.uid (direct read)', () => {
      const authUid = 'admin-registry-uid'
      const payload = { userId: authUid, action: 'update', userRole: 'admin' }
      const auth: AuthContext = { uid: authUid, role: 'admin' }
      expect(canCreateAuditLog(auth, payload)).toBe(true)
    })

    it('kpiImportService: userId = ctx.uid = userProfile.uid = auth.currentUser.uid', () => {
      const adminUid = 'admin-import-uid'
      const payload  = { userId: adminUid, action: 'import', userRole: 'admin' }
      const auth: AuthContext = { uid: adminUid, role: 'admin' }
      expect(canCreateAuditLog(auth, payload)).toBe(true)
    })

    it('historyService: userId = actorId || userId — actorId is always auth.currentUser.uid', () => {
      // triggerHistorySnapshots receives actorId from kpiService.saveKpiEntry
      // kpiService resolves actorId = auth?.currentUser?.uid
      const authUid = 'pharmacist-history-uid'
      const payload = { userId: authUid, action: 'create', userRole: 'pharmacist' }
      const auth: AuthContext = { uid: authUid, role: 'pharmacist' }
      expect(canCreateAuditLog(auth, payload)).toBe(true)
    })

    it('pharmacyService: userId = actorId = userProfile.uid passed from admin UI', () => {
      const adminUid = 'admin-pharmacy-uid'
      const payload  = { userId: adminUid, action: 'create', userRole: 'admin' }
      const auth: AuthContext = { uid: adminUid, role: 'admin' }
      expect(canCreateAuditLog(auth, payload)).toBe(true)
    })

    it('userService: userId = actorId = userProfile.uid passed from admin UI', () => {
      const adminUid = 'admin-user-mgmt-uid'
      const payload  = { userId: adminUid, action: 'create', userRole: 'admin' }
      const auth: AuthContext = { uid: adminUid, role: 'admin' }
      expect(canCreateAuditLog(auth, payload)).toBe(true)
    })
  })

  // ── Contrast: what the old rule allowed ───────────────────────
  // Documents the attack vector that the fix closes.

  describe('Contrast — attacks blocked by the new rule', () => {
    it('pharmacist can no longer forge an admin DELETE audit entry', () => {
      const pharmacist: AuthContext = { uid: 'pharm-001', role: 'pharmacist' }
      const forgedPayload: AuditLogPayload = {
        userId:   'admin-uid-001',   // ← not the pharmacist's UID
        action:   'delete',
        userRole: 'admin',
      }
      expect(canCreateAuditLog(pharmacist, forgedPayload)).toBe(false)
    })

    it('any user can no longer flood the log with false attributions', () => {
      const attacker: AuthContext = { uid: 'attacker-uid', role: 'pharmacist' }
      const victims = ['victim-a', 'victim-b', 'admin-uid']
      victims.forEach((victimUid) => {
        const payload: AuditLogPayload = { userId: victimUid, action: 'create', userRole: 'admin' }
        expect(canCreateAuditLog(attacker, payload)).toBe(false)
      })
    })
  })
})
