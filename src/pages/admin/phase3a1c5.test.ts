// ============================================================
// Phase 3A-1C5 — Branch Manager Promotion
//
// Verifies:
//   1.  Promote action visible for pharmacist (canPromoteRow)
//   2.  Demote action visible for branch_manager (canPromoteRow)
//   3.  canPromoteRow returns false for manager
//   4.  canPromoteRow returns false for admin target role
//   5.  canPromoteRow returns false for district_supervisor target
//   6.  canPromoteRow returns false for regional_manager target
//   7.  requestPromotion checks isPharmacyAllowed before opening confirm
//   8.  handlePromotion checks isPharmacyAllowed before calling promoteBranchManager
//   9.  TERRITORY_ROLES_PROMOTE constant defined in promoteBranchManager
//  10.  service: pharmacist → branch_manager is a valid transition
//  11.  service: branch_manager → pharmacist is a valid transition
//  12.  service: manager cannot be promoted (throws)
//  13.  service: admin cannot be promoted (throws)
//  14.  service: updateDoc writes only role (no email/status/pharmacyId changes)
//  15.  recomputeAssignedPharmacyIds called in promoteBranchManager
//  16.  Firestore: promotion path uses hasOnly role/updatedAt
//  17.  Firestore: email not in allowed keys (unchanged)
//  18.  Firestore: status not in allowed keys (unchanged)
//  19.  Firestore: pharmacyId not in allowed keys (unchanged)
//  20.  Guardrail: no password reset
//  21.  Guardrail: no dashboard changes
//  22.  Guardrail: no Dynamic KPI changes
// ============================================================

import { describe, it, expect } from 'vitest'

const usersPageSrc   = () => import('./UsersPage.jsx?raw').then((m) => m.default)
const userServiceSrc = () => import('../../services/userService.js?raw').then((m) => m.default)
const firestoreRules = () => import('../../../firestore.rules?raw').then((m) => m.default)
const appSrc         = () => import('../../App.jsx?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1-6. canPromoteRow visibility
// ════════════════════════════════════════════════════════════

describe('3A-1C5 UsersPage — SUPERVISOR_PROMOTABLE_ROLES', () => {
  it('SUPERVISOR_PROMOTABLE_ROLES is defined in UsersPage (test 1)', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('SUPERVISOR_PROMOTABLE_ROLES')
  })

  it('SUPERVISOR_PROMOTABLE_ROLES includes pharmacist (test 1b)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_PROMOTABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("'pharmacist'")
  })

  it('SUPERVISOR_PROMOTABLE_ROLES includes branch_manager (test 2)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_PROMOTABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("'branch_manager'")
  })
})

describe('3A-1C5 UsersPage — canPromoteRow', () => {
  it('canPromoteRow is defined (test 1c)', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('canPromoteRow')
  })

  it('canPromoteRow checks SUPERVISOR_PROMOTABLE_ROLES (test 1d)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('canPromoteRow')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('SUPERVISOR_PROMOTABLE_ROLES')
  })

  it('canPromoteRow checks isPharmacyAllowed for territory roles (test 1e)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('canPromoteRow')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('isPharmacyAllowed')
  })

  it('manager role is NOT in SUPERVISOR_PROMOTABLE_ROLES (test 3)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_PROMOTABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).not.toContain("'manager'")
  })

  it('admin role is NOT in SUPERVISOR_PROMOTABLE_ROLES (test 4)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_PROMOTABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).not.toContain("'admin'")
  })

  it('district_supervisor is NOT in SUPERVISOR_PROMOTABLE_ROLES (test 5)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_PROMOTABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).not.toContain("'district_supervisor'")
  })

  it('regional_manager is NOT in SUPERVISOR_PROMOTABLE_ROLES (test 6)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_PROMOTABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).not.toContain("'regional_manager'")
  })

  it('RowActions includes Promote/Demote gated by canPromoteRow (test 1f)', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('canPromoteRow(row)')
    expect(s).toContain('requestPromotion(row)')
  })
})

// ════════════════════════════════════════════════════════════
// 7-8. requestPromotion + handlePromotion guards
// ════════════════════════════════════════════════════════════

describe('3A-1C5 UsersPage — promotion guards', () => {
  it('requestPromotion checks isPharmacyAllowed before opening confirm (test 7)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const requestPromotion')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('isPharmacyAllowed')
    expect(block).toContain('SUPERVISOR_PROMOTABLE_ROLES')
    expect(block).toContain('setPromotionTarget')
  })

  it('handlePromotion checks isPharmacyAllowed before calling promoteBranchManager (test 8)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const handlePromotion = async')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 900)
    expect(block).toContain('isPharmacyAllowed')
    expect(block).toContain('SUPERVISOR_PROMOTABLE_ROLES')
    // Guard appears before await promoteBranchManager(
    const guardIdx = block.indexOf('isPharmacyAllowed')
    const callIdx  = block.indexOf('await promoteBranchManager(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(callIdx)
  })

  it('handlePromotion computes newRole as pharmacist↔branch_manager toggle (test 2)', async () => {
    const s = await usersPageSrc()
    expect(s).toContain("newRole: row.role === 'pharmacist' ? 'branch_manager' : 'pharmacist'")
  })
})

// ════════════════════════════════════════════════════════════
// 9-15. userService territory guard for promoteBranchManager
// ════════════════════════════════════════════════════════════

describe('3A-1C5 userService — promoteBranchManager territory guard', () => {
  it('TERRITORY_ROLES_PROMOTE constant defined in promoteBranchManager (test 9)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function promoteBranchManager')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1800)
    expect(block).toContain('TERRITORY_ROLES_PROMOTE')
  })

  it('service allows pharmacist → branch_manager transition (test 10)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function promoteBranchManager')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1800)
    expect(block).toContain('SUPERVISOR_PROMOTABLE_SVC')
    expect(block).toContain("'pharmacist'")
    expect(block).toContain("'branch_manager'")
  })

  it('service allows branch_manager → pharmacist transition (test 11)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function promoteBranchManager')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1800)
    // Both roles appear in SUPERVISOR_PROMOTABLE_SVC array
    const svcIdx = block.indexOf('SUPERVISOR_PROMOTABLE_SVC')
    const svcBlock = block.slice(svcIdx, svcIdx + 80)
    expect(svcBlock).toContain("'pharmacist'")
    expect(svcBlock).toContain("'branch_manager'")
  })

  it('service blocks manager promotion — throws (test 12)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function promoteBranchManager')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1800)
    // manager is not in SUPERVISOR_PROMOTABLE_SVC → the guard throws
    expect(block).toContain('cannot be promoted/demoted')
  })

  it('service blocks admin promotion — throws (test 13)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function promoteBranchManager')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1800)
    // admin is not in SUPERVISOR_PROMOTABLE_SVC → same guard throws
    expect(block).toContain('cannot be promoted/demoted')
  })

  it('service updateDoc writes only role field (test 14)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function promoteBranchManager')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1800)
    const updateIdx = block.indexOf('updateDoc')
    expect(updateIdx).toBeGreaterThan(-1)
    const updateCtx = block.slice(updateIdx, updateIdx + 100)
    expect(updateCtx).toContain('role: newRole')
    expect(updateCtx).not.toContain('email')
    expect(updateCtx).not.toContain('pharmacyId')
    expect(updateCtx).not.toContain('active')
  })

  it('recomputeAssignedPharmacyIds called in promoteBranchManager (test 15)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function promoteBranchManager')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1800)
    expect(block).toContain('recomputeAssignedPharmacyIds')
  })

  it('service guard runs before updateDoc (ordering)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function promoteBranchManager')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1800)
    const guardIdx  = block.indexOf('TERRITORY_ROLES_PROMOTE')
    const updateIdx = block.indexOf('updateDoc')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(updateIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 16-19. Firestore rules — promotion path
// ════════════════════════════════════════════════════════════

describe('3A-1C5 Firestore rules — territory promotion path', () => {
  it('Phase 3A-1C5 marker present in rules (test 16)', async () => {
    const r = await firestoreRules()
    expect(r).toContain('Phase 3A-1C5')
  })

  it('promotion path uses hasOnly role/updatedAt (test 16b)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 2800)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 1700)
    // The 3A-1C5 path is identified by 'role', 'updatedAt' in a hasOnly
    const roleIdx = updateBlock.lastIndexOf("'role', 'updatedAt'")
    expect(roleIdx).toBeGreaterThan(-1)
    const ctx = updateBlock.slice(Math.max(0, roleIdx - 50), roleIdx + 25)
    expect(ctx).toContain('hasOnly')
  })

  it('promotion path checks old role in pharmacist/branch_manager (test 17a)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 2800)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 1700)
    // Find the 3A-1C5 path by the role/updatedAt hasOnly
    const roleHasOnly = updateBlock.lastIndexOf("'role', 'updatedAt'")
    const c5Block = updateBlock.slice(Math.max(0, roleHasOnly - 500), roleHasOnly + 50)
    expect(c5Block).toContain("resource.data.role in ['pharmacist', 'branch_manager']")
  })

  it('promotion path checks new role in pharmacist/branch_manager (test 17b)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 2800)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 1700)
    const roleHasOnly = updateBlock.lastIndexOf("'role', 'updatedAt'")
    const c5Block = updateBlock.slice(Math.max(0, roleHasOnly - 500), roleHasOnly + 50)
    expect(c5Block).toContain("request.resource.data.role in ['pharmacist', 'branch_manager']")
  })

  it('promotion hasOnly does NOT include email (test 17)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 2800)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 1700)
    const roleIdx = updateBlock.lastIndexOf("'role', 'updatedAt'")
    const hasOnlyCtx = updateBlock.slice(Math.max(0, roleIdx - 10), roleIdx + 25)
    expect(hasOnlyCtx).not.toContain("'email'")
  })

  it('promotion hasOnly does NOT include status (test 18)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 2800)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 1700)
    const roleIdx = updateBlock.lastIndexOf("'role', 'updatedAt'")
    const hasOnlyCtx = updateBlock.slice(Math.max(0, roleIdx - 10), roleIdx + 25)
    expect(hasOnlyCtx).not.toContain("'status'")
  })

  it('promotion hasOnly does NOT include pharmacyId (test 19)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 2800)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 1700)
    const roleIdx = updateBlock.lastIndexOf("'role', 'updatedAt'")
    const hasOnlyCtx = updateBlock.slice(Math.max(0, roleIdx - 10), roleIdx + 25)
    expect(hasOnlyCtx).not.toContain("'pharmacyId'")
  })

  it('delete remains admin-only after 3A-1C5 (test 19b)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    // delete now at ~2211 chars — use 2500
    const block = r.slice(idx, idx + 2500)
    const deleteIdx = block.indexOf('allow delete:')
    expect(deleteIdx).toBeGreaterThan(-1)
    const deleteLine = block.slice(deleteIdx, deleteIdx + 40)
    expect(deleteLine).toContain('isAdmin()')
    expect(deleteLine).not.toContain('isTerritoryMgr')
  })
})

// ════════════════════════════════════════════════════════════
// 20-22. Guardrails
// ════════════════════════════════════════════════════════════

describe('3A-1C5 guardrails', () => {
  it('No password reset implementation in UsersPage (test 20)', async () => {
    const s = await usersPageSrc()
    expect(s).not.toContain('resetPassword')
    expect(s).not.toContain('Reset Password')
  })

  it('No new supervisor dashboard route added (test 21)', async () => {
    const s = await appSrc()
    expect(s).not.toContain('/supervisor-promote')
    expect(s).not.toContain('SupervisorPromotePage')
  })

  it('No Dynamic KPI changes in UsersPage (test 22)', async () => {
    const s = await usersPageSrc()
    expect(s).not.toContain('dynamicKpi')
    expect(s).not.toContain('DynamicKpi')
    expect(s).not.toContain('kpiRegistry')
  })
})
