// ============================================================
// Phase 3A-1C4 — Supervisor Transfer Pharmacist
//
// Verifies:
//   1.  SUPERVISOR_TRANSFERABLE_ROLES defined (pharmacist/manager/branch_manager)
//   2.  SUPERVISOR_TRANSFERABLE_ROLES includes pharmacist
//   3.  SUPERVISOR_TRANSFERABLE_ROLES includes manager
//   4.  SUPERVISOR_TRANSFERABLE_ROLES includes branch_manager
//   5.  admin role is NOT in SUPERVISOR_TRANSFERABLE_ROLES
//   6.  district_supervisor is NOT in SUPERVISOR_TRANSFERABLE_ROLES
//   7.  canTransferRow defined and checks SUPERVISOR_TRANSFERABLE_ROLES
//   8.  canTransferRow checks isPharmacyAllowed for territory roles
//   9.  requestTransfer checks isPharmacyAllowed before opening modal
//  10.  requestTransfer checks SUPERVISOR_TRANSFERABLE_ROLES before opening modal
//  11.  destination list excludes current branch (same-branch prevention in JSX)
//  12.  handleTransfer checks source isPharmacyAllowed (defense layer 2 — source)
//  13.  handleTransfer checks dest isPharmacyAllowed (defense layer 2 — destination)
//  14.  handleTransfer checks role before calling transferUser
//  15.  TERRITORY_ROLES_TRANSFER constant defined in transferUser service
//  16.  service guard blocks out-of-scope source (throws User not in assigned territory)
//  17.  service guard blocks out-of-scope destination
//  18.  service guard blocks protected roles (throws for admin)
//  19.  recomputeAssignedPharmacyIds called in transferUser
//  20.  Firestore: transfer path uses hasOnly pharmacyId/updatedAt
//  21.  Firestore: transfer path checks old pharmacyId in assignedPharmacyIds
//  22.  Firestore: transfer path checks new pharmacyId in assignedPharmacyIds
//  23.  Guardrails: no promotion, no password reset, no dashboard, no Dynamic KPI
// ============================================================

import { describe, it, expect } from 'vitest'

const usersPageSrc   = () => import('./UsersPage.jsx?raw').then((m) => m.default)
const userServiceSrc = () => import('../../services/userService.js?raw').then((m) => m.default)
const firestoreRules = () => import('../../../firestore.rules?raw').then((m) => m.default)
const appSrc         = () => import('../../App.jsx?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1-6. SUPERVISOR_TRANSFERABLE_ROLES constant
// ════════════════════════════════════════════════════════════

describe('3A-1C4 UsersPage — SUPERVISOR_TRANSFERABLE_ROLES', () => {
  it('SUPERVISOR_TRANSFERABLE_ROLES is defined in UsersPage (test 1)', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('SUPERVISOR_TRANSFERABLE_ROLES')
  })

  it('SUPERVISOR_TRANSFERABLE_ROLES includes pharmacist (test 2)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_TRANSFERABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("'pharmacist'")
  })

  it('SUPERVISOR_TRANSFERABLE_ROLES includes manager (test 3)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_TRANSFERABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("'manager'")
  })

  it('SUPERVISOR_TRANSFERABLE_ROLES includes branch_manager (test 4)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_TRANSFERABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("'branch_manager'")
  })

  it('admin role is NOT in SUPERVISOR_TRANSFERABLE_ROLES (test 5)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_TRANSFERABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).not.toContain("'admin'")
  })

  it('district_supervisor is NOT in SUPERVISOR_TRANSFERABLE_ROLES (test 6)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_TRANSFERABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).not.toContain("'district_supervisor'")
  })
})

// ════════════════════════════════════════════════════════════
// 7-8. canTransferRow
// ════════════════════════════════════════════════════════════

describe('3A-1C4 UsersPage — canTransferRow', () => {
  it('canTransferRow is defined (test 7)', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('canTransferRow')
  })

  it('canTransferRow checks SUPERVISOR_TRANSFERABLE_ROLES (test 7b)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('canTransferRow')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('SUPERVISOR_TRANSFERABLE_ROLES')
  })

  it('canTransferRow checks isPharmacyAllowed for territory roles (test 8)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('canTransferRow')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('isPharmacyAllowed')
  })
})

// ════════════════════════════════════════════════════════════
// 9-11. requestTransfer + destination list
// ════════════════════════════════════════════════════════════

describe('3A-1C4 UsersPage — requestTransfer + destination filter', () => {
  it('requestTransfer checks isPharmacyAllowed before opening modal (test 9)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const requestTransfer')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('isPharmacyAllowed')
    expect(block).toContain('SUPERVISOR_TRANSFERABLE_ROLES')
  })

  it('requestTransfer sets transferTarget on success (test 9b)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const requestTransfer')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('setTransferTarget')
  })

  it('destination list excludes current branch (p.id !== transferTarget.pharmacyId) (test 11)', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('p.id !== transferTarget.pharmacyId')
  })
})

// ════════════════════════════════════════════════════════════
// 12-14. handleTransfer guards
// ════════════════════════════════════════════════════════════

describe('3A-1C4 UsersPage — handleTransfer guards', () => {
  it('handleTransfer checks source isPharmacyAllowed before calling transferUser (test 12)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const handleTransfer = async')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1000)
    expect(block).toContain('isPharmacyAllowed(scope, transferTarget.pharmacyId)')
    // Guard appears before await transferUser(
    const guardIdx = block.indexOf('isPharmacyAllowed(scope, transferTarget.pharmacyId)')
    const callIdx  = block.indexOf('await transferUser(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(callIdx)
  })

  it('handleTransfer checks dest isPharmacyAllowed before calling transferUser (test 13)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const handleTransfer = async')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1000)
    expect(block).toContain('isPharmacyAllowed(scope, transferDest)')
    const guardIdx = block.indexOf('isPharmacyAllowed(scope, transferDest)')
    const callIdx  = block.indexOf('await transferUser(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(callIdx)
  })

  it('handleTransfer checks SUPERVISOR_TRANSFERABLE_ROLES before calling transferUser (test 14)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const handleTransfer = async')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1000)
    expect(block).toContain('SUPERVISOR_TRANSFERABLE_ROLES')
    const guardIdx = block.indexOf('SUPERVISOR_TRANSFERABLE_ROLES')
    const callIdx  = block.indexOf('await transferUser(')
    expect(guardIdx).toBeLessThan(callIdx)
  })

  it('RowActions uses canTransferRow to gate Transfer action', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('canTransferRow(row)')
    expect(s).toContain('requestTransfer(row)')
  })
})

// ════════════════════════════════════════════════════════════
// 15-19. userService territory guard for transferUser
// ════════════════════════════════════════════════════════════

describe('3A-1C4 userService — transferUser territory guard', () => {
  it('TERRITORY_ROLES_TRANSFER constant defined in transferUser (test 15)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function transferUser')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1500)
    expect(block).toContain('TERRITORY_ROLES_TRANSFER')
  })

  it('service guard reads actorAssigned to verify territory (test 15b)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function transferUser')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1500)
    expect(block).toContain('actorAssigned')
    expect(block).toContain('assignedPharmacyIds')
  })

  it('service blocks out-of-scope source — throws User not in assigned territory (test 16)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function transferUser')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1500)
    expect(block).toContain('User not in your assigned territory')
  })

  it('service blocks out-of-scope destination — throws Destination branch not in territory (test 17)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function transferUser')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1500)
    expect(block).toContain('Destination branch not in your assigned territory')
  })

  it('service blocks protected roles — throws cannot be transferred (test 18)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function transferUser')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1500)
    expect(block).toContain('SUPERVISOR_TRANSFERABLE_SVC')
    expect(block).toContain('cannot be transferred')
  })

  it('recomputeAssignedPharmacyIds is called inside transferUser (test 19)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function transferUser')
    expect(idx).toBeGreaterThan(-1)
    // Window 1800: territory guard + updateDoc + logAction + recompute call
    const block = s.slice(idx, idx + 1800)
    expect(block).toContain('recomputeAssignedPharmacyIds')
  })

  it('service guard runs before updateDoc (ordering)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function transferUser')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1500)
    const guardIdx  = block.indexOf('TERRITORY_ROLES_TRANSFER')
    const updateIdx = block.indexOf('updateDoc')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(updateIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 20-22. Firestore rules — territory transfer path
// ════════════════════════════════════════════════════════════

describe('3A-1C4 Firestore rules — territory transfer path', () => {
  it('Phase 3A-1C4 marker present in rules (test 20)', async () => {
    const r = await firestoreRules()
    expect(r).toContain('Phase 3A-1C4')
  })

  it('transfer path uses hasOnly pharmacyId/updatedAt (test 20b)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 2100)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 1300)
    // The 3A-1C4 path is identified by pharmacyId inside a hasOnly
    const pharmaIdx = updateBlock.indexOf("'pharmacyId', 'updatedAt'")
    expect(pharmaIdx).toBeGreaterThan(-1)
    const context = updateBlock.slice(Math.max(0, pharmaIdx - 50), pharmaIdx + 30)
    expect(context).toContain('hasOnly')
  })

  it('transfer path checks old pharmacyId (source) in assignedPharmacyIds (test 21)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 2100)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 1300)
    // Find the 3A-1C4 path — it's after the 3A-1C3 path (which ends with active/status/updatedAt hasOnly)
    const c4Start = updateBlock.lastIndexOf('isTerritoryMgr()')
    const c4Block = updateBlock.slice(c4Start, c4Start + 400)
    expect(c4Block).toContain("resource.data.get('pharmacyId', null) in userDoc().get('assignedPharmacyIds', [])")
  })

  it('transfer path checks new pharmacyId (destination) in assignedPharmacyIds (test 22)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 2100)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 1300)
    const c4Start = updateBlock.lastIndexOf('isTerritoryMgr()')
    const c4Block = updateBlock.slice(c4Start, c4Start + 400)
    expect(c4Block).toContain("request.resource.data.get('pharmacyId', null) in userDoc().get('assignedPharmacyIds', [])")
  })

  it('delete remains admin-only after 3A-1C4 (test 22b)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    // 3A-1C5 added 6th update path, delete now at ~2211 chars — use 2500
    const block = r.slice(idx, idx + 2500)
    const deleteIdx = block.indexOf('allow delete:')
    expect(deleteIdx).toBeGreaterThan(-1)
    const deleteLine = block.slice(deleteIdx, deleteIdx + 40)
    expect(deleteLine).toContain('isAdmin()')
    expect(deleteLine).not.toContain('isTerritoryMgr')
  })
})

// ════════════════════════════════════════════════════════════
// 23. Guardrails
// ════════════════════════════════════════════════════════════

describe('3A-1C4 guardrails', () => {
  it('No promotion functionality added in this sprint (test 23a)', async () => {
    const s = await usersPageSrc()
    expect(s).not.toContain('promoteTo')
    expect(s).not.toContain('Promote to')
  })

  it('No password reset implementation in this sprint (test 23b)', async () => {
    const s = await usersPageSrc()
    expect(s).not.toContain('resetPassword')
    expect(s).not.toContain('Reset Password')
  })

  it('No Dynamic KPI changes in UsersPage (test 23c)', async () => {
    const s = await usersPageSrc()
    expect(s).not.toContain('dynamicKpi')
    expect(s).not.toContain('DynamicKpi')
    expect(s).not.toContain('kpiRegistry')
  })

  it('No new supervisor dashboard route added (test 23d)', async () => {
    const s = await appSrc()
    expect(s).not.toContain('/supervisor-transfer')
    expect(s).not.toContain('SupervisorTransferPage')
  })
})
