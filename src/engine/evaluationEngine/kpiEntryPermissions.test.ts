// ============================================================
// kpi_entries Firestore Rule — Permission Regression Tests
//
// Root cause: isOwnPharmacy() = pharmacyId == pharmId() || isAdmin()
// For managers: isAdmin() = false.
// pharmId() reads userDoc().pharmacyId from Firestore at rule eval time.
// If userDoc().pharmacyId is null OR mismatches payload.pharmacyId,
// isOwnPharmacy() → false → DENIED.
//
// Fix: allow create: if isOwnData() && notFutureDate() && (isOwnPharmacy() || isMgr())
//
// Security invariants (always hold):
//   isOwnData() → payload.userId == auth.uid (no cross-user writes)
//   notFutureDate() → date must be present day or past
//   isMgr() → role must be admin/manager/branch_manager
//   The three together mean: authenticated manager can only write their own entry.
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Rule simulation helpers ───────────────────────────────────
// Simulate the exact Firestore rule evaluation logic in JS.
// These are NOT connected to Firestore — they test the rule LOGIC.

interface SimUser { uid: string; role: string; pharmacyId: string | null }
interface SimPayload { userId: string; pharmacyId: string; date: string }

function isAuth(user: SimUser | null): boolean { return user !== null }
function uid(user: SimUser): string { return user.uid }
function userDocRole(user: SimUser): string { return user.role }
function pharmId(user: SimUser): string | null { return user.pharmacyId }

function isAdmin(user: SimUser): boolean { return isAuth(user) && userDocRole(user) === 'admin' }
function isMgr(user: SimUser): boolean {
  return isAuth(user) && ['admin', 'manager', 'branch_manager'].includes(userDocRole(user))
}
function isAny(user: SimUser): boolean { return isAuth(user) }

function isOwnData(user: SimUser, payload: SimPayload): boolean {
  return payload.userId === uid(user)
}
function isOwnPharmacy(user: SimUser, payload: SimPayload): boolean {
  return payload.pharmacyId === pharmId(user) || isAdmin(user)
}
function notFutureDate(payload: SimPayload): boolean {
  const today = '2026-06-04'
  return !payload.date || payload.date <= today
}

// OLD rule (broken for managers)
function canCreateOldRule(user: SimUser, payload: SimPayload): boolean {
  return isAny(user) && isOwnData(user, payload) && isOwnPharmacy(user, payload) && notFutureDate(payload)
}

// NEW rule (fixed)
function canCreateNewRule(user: SimUser, payload: SimPayload): boolean {
  return isOwnData(user, payload) && notFutureDate(payload) && (
    isOwnPharmacy(user, payload) || isMgr(user)
  )
}

// ── 1. Old rule — documents the bug ──────────────────────────

describe('kpi_entries create — OLD rule (documents bug)', () => {
  it('OLD: pharmacist with matching pharmacyId → ALLOWED', () => {
    const user: SimUser = { uid: 'uid-pharma', role: 'pharmacist', pharmacyId: '5074' }
    const payload: SimPayload = { userId: 'uid-pharma', pharmacyId: '5074', date: '2026-06-04' }
    expect(canCreateOldRule(user, payload)).toBe(true)
  })

  it('OLD: manager with matching pharmacyId → ALLOWED (but relies on pharmId match)', () => {
    const user: SimUser = { uid: 'uid-mgr', role: 'manager', pharmacyId: '5074' }
    const payload: SimPayload = { userId: 'uid-mgr', pharmacyId: '5074', date: '2026-06-04' }
    expect(canCreateOldRule(user, payload)).toBe(true)
  })

  it('OLD: manager with null pharmacyId in userDoc → DENIED (the bug)', () => {
    const user: SimUser = { uid: 'uid-mgr', role: 'manager', pharmacyId: null }
    const payload: SimPayload = { userId: 'uid-mgr', pharmacyId: '5074', date: '2026-06-04' }
    // pharmId() = null, payload.pharmacyId = '5074', isAdmin() = false → DENIED
    expect(canCreateOldRule(user, payload)).toBe(false)
  })

  it('OLD: branch_manager with null pharmacyId → DENIED (the bug)', () => {
    const user: SimUser = { uid: 'uid-bm', role: 'branch_manager', pharmacyId: null }
    const payload: SimPayload = { userId: 'uid-bm', pharmacyId: '5074', date: '2026-06-04' }
    expect(canCreateOldRule(user, payload)).toBe(false)
  })
})

// ── 2. New rule — all three roles allowed ─────────────────────

describe('kpi_entries create — NEW rule (fix)', () => {
  it('pharmacist with matching pharmacyId → ALLOWED', () => {
    const user: SimUser = { uid: 'uid-pharma', role: 'pharmacist', pharmacyId: '5074' }
    const payload: SimPayload = { userId: 'uid-pharma', pharmacyId: '5074', date: '2026-06-04' }
    expect(canCreateNewRule(user, payload)).toBe(true)
  })

  it('manager with matching pharmacyId → ALLOWED', () => {
    const user: SimUser = { uid: 'uid-mgr', role: 'manager', pharmacyId: '5074' }
    const payload: SimPayload = { userId: 'uid-mgr', pharmacyId: '5074', date: '2026-06-04' }
    expect(canCreateNewRule(user, payload)).toBe(true)
  })

  it('manager with null pharmacyId in userDoc → ALLOWED via isMgr() fallback', () => {
    // This is the case that was previously broken
    const user: SimUser = { uid: 'uid-mgr', role: 'manager', pharmacyId: null }
    const payload: SimPayload = { userId: 'uid-mgr', pharmacyId: '5074', date: '2026-06-04' }
    expect(canCreateNewRule(user, payload)).toBe(true)
  })

  it('branch_manager with null pharmacyId → ALLOWED via isMgr() fallback', () => {
    const user: SimUser = { uid: 'uid-bm', role: 'branch_manager', pharmacyId: null }
    const payload: SimPayload = { userId: 'uid-bm', pharmacyId: '5074', date: '2026-06-04' }
    expect(canCreateNewRule(user, payload)).toBe(true)
  })

  it('branch_manager with matching pharmacyId → ALLOWED', () => {
    const user: SimUser = { uid: 'uid-bm', role: 'branch_manager', pharmacyId: '5074' }
    const payload: SimPayload = { userId: 'uid-bm', pharmacyId: '5074', date: '2026-06-04' }
    expect(canCreateNewRule(user, payload)).toBe(true)
  })
})

// ── 3. Security invariants — must NOT be weakened ─────────────

describe('kpi_entries create — security invariants preserved', () => {
  it('pharmacist cannot write entry for another user (isOwnData)', () => {
    const user: SimUser = { uid: 'uid-pharma', role: 'pharmacist', pharmacyId: '5074' }
    const payload: SimPayload = { userId: 'uid-OTHER', pharmacyId: '5074', date: '2026-06-04' }
    expect(canCreateNewRule(user, payload)).toBe(false)
  })

  it('manager cannot write entry for another user (isOwnData)', () => {
    const user: SimUser = { uid: 'uid-mgr', role: 'manager', pharmacyId: '5074' }
    const payload: SimPayload = { userId: 'uid-OTHER', pharmacyId: '5074', date: '2026-06-04' }
    // isOwnData() = 'uid-OTHER' == 'uid-mgr' → false → DENIED
    expect(canCreateNewRule(user, payload)).toBe(false)
  })

  it('branch_manager cannot write entry for another user (isOwnData)', () => {
    const user: SimUser = { uid: 'uid-bm', role: 'branch_manager', pharmacyId: '5074' }
    const payload: SimPayload = { userId: 'uid-OTHER-PHARMA', pharmacyId: '5074', date: '2026-06-04' }
    expect(canCreateNewRule(user, payload)).toBe(false)
  })

  it('unauthenticated user cannot write', () => {
    // isOwnData checks uid() which requires auth — simulated as role='' (unauthenticated)
    const user: SimUser = { uid: '', role: '', pharmacyId: null }
    const payload: SimPayload = { userId: '', pharmacyId: '5074', date: '2026-06-04' }
    // isOwnData: '' == '' → true, but isMgr: role '' not in list → false
    // isOwnPharmacy: '' == null → false
    expect(canCreateNewRule(user, payload)).toBe(false)
  })

  it('district_supervisor cannot write kpi entries (not in isMgr)', () => {
    const user: SimUser = { uid: 'uid-sup', role: 'district_supervisor', pharmacyId: null }
    const payload: SimPayload = { userId: 'uid-sup', pharmacyId: '5074', date: '2026-06-04' }
    // isMgr: 'district_supervisor' not in ['admin','manager','branch_manager'] → false
    // isOwnPharmacy: null == null → could be true in edge case? Let's be precise:
    // null == null in JS is true — but pharmId=null and payload=null means
    // the entry would have null pharmacyId which KpiEntryPage prevents at app layer
    // For this test: pharmacyId = '5074' in payload, pharmId = null → false
    expect(canCreateNewRule(user, payload)).toBe(false)
  })

  it('no future dates allowed for any role', () => {
    const futurePayload: SimPayload = { userId: 'uid-mgr', pharmacyId: '5074', date: '2030-01-01' }
    const manager: SimUser = { uid: 'uid-mgr', role: 'manager', pharmacyId: '5074' }
    const pharmacist: SimUser = { uid: 'uid-mgr', role: 'pharmacist', pharmacyId: '5074' }
    expect(canCreateNewRule(manager, futurePayload)).toBe(false)
    expect(canCreateNewRule(pharmacist, futurePayload)).toBe(false)
  })
})

// ── 4. Firestore rules source audit ──────────────────────────

describe('kpi_entries create — Firestore rules source audit', () => {
  it('create rule contains isMgr() fallback', async () => {
    const src = await import('../../../firestore.rules?raw')
    const block = src.default.split('match /kpi_entries/')[1]?.split('match /')[0] ?? ''
    expect(block).toContain('isMgr()')
    expect(block).toContain('isOwnData()')
    expect(block).toContain('notFutureDate()')
  })

  it('isOwnData still enforced on create — no cross-user writes', async () => {
    const src = await import('../../../firestore.rules?raw')
    const block = src.default.split('match /kpi_entries/')[1]?.split('match /')[0] ?? ''
    const createBlock = block.split('allow create:')[1]?.split('allow update:')[0] ?? ''
    expect(createBlock).toContain('isOwnData()')
  })

  it('isMgr() helper covers manager and branch_manager', async () => {
    const src = await import('../../../firestore.rules?raw')
    const isMgrDef = src.default.split('function isMgr()')[1]?.split('}')[0] ?? ''
    expect(isMgrDef).toContain('manager')
    expect(isMgrDef).toContain('branch_manager')
  })

  it('update and delete rules unchanged (no regression)', async () => {
    const src = await import('../../../firestore.rules?raw')
    const block = src.default.split('match /kpi_entries/')[1]?.split('match /')[0] ?? ''
    expect(block).toContain('allow update:')
    expect(block).toContain('allow delete:')
    expect(block).toContain('ownsPharmacy(resource.data.pharmacyId)')
  })
})
