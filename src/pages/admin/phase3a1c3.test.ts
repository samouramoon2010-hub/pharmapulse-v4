// ============================================================
// Phase 3A-1C3 — Supervisor Deactivate / Reactivate
//
// Verifies:
//   1.  SUPERVISOR_TOGGLEABLE_ROLES defined (pharmacist/manager/branch_manager)
//   2.  canToggleRow defined and checks SUPERVISOR_TOGGLEABLE_ROLES
//   3.  canToggleRow checks isPharmacyAllowed for territory roles
//   4.  admin role is NOT in SUPERVISOR_TOGGLEABLE_ROLES
//   5.  district_supervisor role is NOT in SUPERVISOR_TOGGLEABLE_ROLES
//   6.  regional_manager role is NOT in SUPERVISOR_TOGGLEABLE_ROLES
//   7.  requestToggle checks isPharmacyAllowed before opening confirm modal
//   8.  handleToggle checks isPharmacyAllowed before calling toggleUserStatus
//   9.  TERRITORY_ROLES_TOGGLE constant defined in toggleUserStatus
//  10.  service guard reads actorAssigned to verify territory
//  11.  service guard blocks protected roles (throws for admin)
//  12.  service guard blocks out-of-territory target
//  13.  service guard runs before updateDoc (ordering)
//  14.  Firestore: territory activation path uses hasOnly active/status/updatedAt
//  15.  Firestore: territory activation checks role in allowed list
//  16.  Firestore: delete remains admin-only
//  17.  No transfer functionality added
//  18.  No promotion functionality added
//  19.  No dashboard changes
//  20.  No Dynamic KPI changes
// ============================================================

import { describe, it, expect } from 'vitest'

const usersPageSrc   = () => import('./UsersPage.jsx?raw').then((m) => m.default)
const userServiceSrc = () => import('../../services/userService.js?raw').then((m) => m.default)
const firestoreRules = () => import('../../../firestore.rules?raw').then((m) => m.default)
const appSrc         = () => import('../../App.jsx?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1-3. SUPERVISOR_TOGGLEABLE_ROLES + canToggleRow
// ════════════════════════════════════════════════════════════

describe('3A-1C3 UsersPage — SUPERVISOR_TOGGLEABLE_ROLES', () => {
  it('SUPERVISOR_TOGGLEABLE_ROLES is defined in UsersPage', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('SUPERVISOR_TOGGLEABLE_ROLES')
  })

  it('SUPERVISOR_TOGGLEABLE_ROLES includes pharmacist', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_TOGGLEABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("'pharmacist'")
  })

  it('SUPERVISOR_TOGGLEABLE_ROLES includes manager', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_TOGGLEABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("'manager'")
  })

  it('SUPERVISOR_TOGGLEABLE_ROLES includes branch_manager', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_TOGGLEABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("'branch_manager'")
  })
})

describe('3A-1C3 UsersPage — canToggleRow', () => {
  it('canToggleRow is defined', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('canToggleRow')
  })

  it('canToggleRow checks SUPERVISOR_TOGGLEABLE_ROLES', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('canToggleRow')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('SUPERVISOR_TOGGLEABLE_ROLES')
  })

  it('canToggleRow checks isPharmacyAllowed for territory roles (test 3)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('canToggleRow')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('isPharmacyAllowed')
  })

  it('admin role is NOT in SUPERVISOR_TOGGLEABLE_ROLES (test 4)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_TOGGLEABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).not.toContain("'admin'")
  })

  it('district_supervisor is NOT in SUPERVISOR_TOGGLEABLE_ROLES (test 5)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_TOGGLEABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).not.toContain("'district_supervisor'")
  })

  it('regional_manager is NOT in SUPERVISOR_TOGGLEABLE_ROLES (test 6)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_TOGGLEABLE_ROLES')
    const block = s.slice(idx, idx + 80)
    expect(block).not.toContain("'regional_manager'")
  })
})

// ════════════════════════════════════════════════════════════
// 7-8. requestToggle + handleToggle guards
// ════════════════════════════════════════════════════════════

describe('3A-1C3 UsersPage — toggle guards', () => {
  it('requestToggle checks isPharmacyAllowed before opening confirm modal (test 7)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const requestToggle')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 350)
    expect(block).toContain('isPharmacyAllowed')
    expect(block).toContain('SUPERVISOR_TOGGLEABLE_ROLES')
  })

  it('handleToggle checks isPharmacyAllowed before calling toggleUserStatus (test 8)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const handleToggle = async')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 700)
    expect(block).toContain('isPharmacyAllowed')
    expect(block).toContain('SUPERVISOR_TOGGLEABLE_ROLES')
    // Guard appears before the `await toggleUserStatus(` call (not the comment mention)
    const guardIdx = block.indexOf('isPharmacyAllowed')
    const callIdx  = block.indexOf('await toggleUserStatus(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(callIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(callIdx)
  })

  it('RowActions uses canToggleRow to gate Suspend/Activate', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('canToggleRow(row)')
  })

  it('RowActions onClick uses requestToggle', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('requestToggle(row)')
  })
})

// ════════════════════════════════════════════════════════════
// 9-13. userService territory guard for toggleUserStatus
// ════════════════════════════════════════════════════════════

describe('3A-1C3 userService — toggleUserStatus territory guard', () => {
  it('TERRITORY_ROLES_TOGGLE constant defined in toggleUserStatus (test 9)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function toggleUserStatus')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1400)
    expect(block).toContain('TERRITORY_ROLES_TOGGLE')
  })

  it('service guard reads actorAssigned from Firestore (test 10)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function toggleUserStatus')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1400)
    expect(block).toContain('actorAssigned')
    expect(block).toContain('assignedPharmacyIds')
  })

  it('service blocks protected roles — throws when role not in SUPERVISOR_TOGGLEABLE_SVC (test 11)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function toggleUserStatus')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1400)
    expect(block).toContain('SUPERVISOR_TOGGLEABLE_SVC')
    expect(block).toContain('cannot be toggled')
  })

  it('service blocks out-of-territory target — throws User not in assigned territory (test 12)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function toggleUserStatus')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1400)
    expect(block).toContain('User not in your assigned territory')
  })

  it('service guard runs before updateDoc (test 13)', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('async function toggleUserStatus')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1400)
    const guardIdx  = block.indexOf('TERRITORY_ROLES_TOGGLE')
    const updateIdx = block.indexOf('updateDoc')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(updateIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 14-16. Firestore rules — territory activation path
// ════════════════════════════════════════════════════════════

describe('3A-1C3 Firestore rules — territory activation path', () => {
  it('Phase 3A-1C3 marker present in rules', async () => {
    const r = await firestoreRules()
    expect(r).toContain('Phase 3A-1C3')
  })

  it('territory activation path uses hasOnly active/status/updatedAt (test 13)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 1800)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 1000)
    // The 3A-1C3 path is identified by containing active and status in a hasOnly
    expect(updateBlock).toContain("'active'")
    expect(updateBlock).toContain("'status'")
    // Find the hasOnly that contains 'active'
    const activeIdx = updateBlock.indexOf("'active'")
    const contextBeforeActive = updateBlock.slice(Math.max(0, activeIdx - 50), activeIdx + 20)
    expect(contextBeforeActive).toContain('hasOnly')
  })

  it('territory activation checks role in allowed list (test 14)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 1800)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 1000)
    // The activation path checks resource.data.role in allowed roles
    expect(updateBlock).toContain("resource.data.role in ['pharmacist', 'manager', 'branch_manager']")
  })

  it('delete remains admin-only (test 15)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    // Use 2500-char window: 3A-1C5 added 6th update path, delete now at ~2211 chars
    const block = r.slice(idx, idx + 2500)
    const deleteIdx = block.indexOf('allow delete:')
    expect(deleteIdx).toBeGreaterThan(-1)
    const deleteLine = block.slice(deleteIdx, deleteIdx + 40)
    expect(deleteLine).toContain('isAdmin()')
    expect(deleteLine).not.toContain('isTerritoryMgr')
  })
})

// ════════════════════════════════════════════════════════════
// 17-20. Guardrails
// ════════════════════════════════════════════════════════════

describe('3A-1C3 guardrails', () => {
  it('No transfer pharmacist implementation in this sprint (test 16)', async () => {
    const s = await usersPageSrc()
    expect(s).not.toContain('transferPharmacist')
    expect(s).not.toContain('Transfer Pharmacist')
  })

  it('No promotion functionality added in this sprint (test 17)', async () => {
    const s = await usersPageSrc()
    expect(s).not.toContain('promoteTo')
    expect(s).not.toContain('Promote to')
  })

  it('No Dynamic KPI changes in UsersPage (test 19)', async () => {
    const s = await usersPageSrc()
    expect(s).not.toContain('dynamicKpi')
    expect(s).not.toContain('DynamicKpi')
    expect(s).not.toContain('kpiRegistry')
  })

  it('No new routes or supervisor dashboard added (test 20)', async () => {
    const s = await appSrc()
    expect(s).not.toContain('/supervisor-toggle')
    expect(s).not.toContain('SupervisorTogglePage')
  })
})
