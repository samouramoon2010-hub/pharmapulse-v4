// ============================================================
// Phase 3A-1C1 — Supervisor Create Pharmacist / Branch Manager
//
// Verifies:
//   1.  Add User button gated by canCreate (not isReadOnly)
//   2.  canCreate derived from isTerritoryRole (covers DS and RM)
//   3.  SUPERVISOR_CREATABLE_ROLES defined with correct members
//   4.  visibleRoles filters to SUPERVISOR_CREATABLE_ROLES for territory actors
//   5.  visibleRoles excludes admin for territory
//   6.  visibleRoles excludes general_manager for territory
//   7.  visibleRoles excludes district_supervisor for territory
//   8.  visibleRoles excludes regional_manager for territory
//   9.  pharmacy picker uses pickablePharmacies (scope-aware)
//  10.  handleSave checks SUPERVISOR_CREATABLE_ROLES before createUser()
//  11.  handleSave checks isPharmacyAllowed before createUser()
//  12.  handleSave territory guards appear before validate() call
//  13.  userService guard runs before createFirebaseAuthUser
//  14.  userService SUPERVISOR_CREATABLE_SVC includes pharmacist
//  15.  userService SUPERVISOR_CREATABLE_SVC includes branch_manager
//  16.  userService blocks admin role for territory actor
//  17.  userService blocks district_supervisor role for territory actor
//  18.  userService reads actor document to verify assignedPharmacyIds
//  19.  Firestore users create includes isTerritoryMgr() path
//  20.  Firestore users create restricts role to allowed list
//  21.  Firestore users create restricts pharmacyId to assignedPharmacyIds
//  22.  Firestore users update rule unchanged (no territory path)
//  23.  Firestore users delete remains admin-only
//  24.  No edit functionality added in this sprint (RowActions still gated)
//  25.  No deactivate functionality added (handleToggle still gated)
// ============================================================

import { describe, it, expect } from 'vitest'

const usersPageSrc   = () => import('./UsersPage.jsx?raw').then((m) => m.default)
const userServiceSrc = () => import('../../services/userService.js?raw').then((m) => m.default)
const firestoreRules = () => import('../../../firestore.rules?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1–2. Add User button + canCreate flag
// ════════════════════════════════════════════════════════════

describe('3A-1C1 UsersPage — canCreate flag', () => {
  it('canCreate is defined in UsersPage', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('canCreate')
  })

  it('Add User button is gated by canCreate (not !isReadOnly)', async () => {
    const s = await usersPageSrc()
    const btnIdx = s.indexOf('Add User')
    expect(btnIdx).toBeGreaterThan(-1)
    const block = s.slice(Math.max(0, btnIdx - 220), btnIdx + 10)
    expect(block).toContain('canCreate')
    expect(block).not.toContain('!isReadOnly')
  })

  it('canCreate derived from isTerritoryRole (covers both DS and RM)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('canCreate =')
    expect(idx).toBeGreaterThan(-1)
    const line = s.slice(idx, idx + 80)
    expect(line).toContain('isTerritoryRole')
  })

  it('isTerritoryRole is defined as alias for list scope', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('isTerritoryRole = isReadOnly')
  })

  it('openCreate gate uses canCreate (not isReadOnly)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const openCreate = ()')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 80)
    expect(block).toContain('canCreate')
    expect(block).not.toContain('isReadOnly')
  })
})

// ════════════════════════════════════════════════════════════
// 3–8. Role picker — SUPERVISOR_CREATABLE_ROLES and visibleRoles
// ════════════════════════════════════════════════════════════

describe('3A-1C1 UsersPage — role picker filtering', () => {
  it('SUPERVISOR_CREATABLE_ROLES defined with pharmacist, manager, branch_manager', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_CREATABLE_ROLES')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 120)
    expect(block).toContain("'pharmacist'")
    expect(block).toContain("'manager'")
    expect(block).toContain("'branch_manager'")
  })

  it('SUPERVISOR_CREATABLE_ROLES does NOT include admin', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_CREATABLE_ROLES = [')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 120)
    expect(block).not.toContain("'admin'")
  })

  it('SUPERVISOR_CREATABLE_ROLES does NOT include general_manager', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_CREATABLE_ROLES = [')
    const block = s.slice(idx, idx + 120)
    expect(block).not.toContain("'general_manager'")
  })

  it('SUPERVISOR_CREATABLE_ROLES does NOT include district_supervisor', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_CREATABLE_ROLES = [')
    const block = s.slice(idx, idx + 120)
    expect(block).not.toContain("'district_supervisor'")
  })

  it('SUPERVISOR_CREATABLE_ROLES does NOT include regional_manager', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('SUPERVISOR_CREATABLE_ROLES = [')
    const block = s.slice(idx, idx + 120)
    expect(block).not.toContain("'regional_manager'")
  })

  it('visibleRoles filters ROLES by SUPERVISOR_CREATABLE_ROLES for territory', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('visibleRoles')
    const idx = s.indexOf('visibleRoles =')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('isTerritoryRole')
    expect(block).toContain('SUPERVISOR_CREATABLE_ROLES')
  })

  it('role picker renders visibleRoles (not raw ROLES)', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('visibleRoles.map')
    // raw ROLES.map should no longer appear in the modal section
    const modalIdx = s.indexOf('{step===\'success\'')
    const afterModal = s.slice(modalIdx)
    expect(afterModal).not.toContain('ROLES.map')
  })
})

// ════════════════════════════════════════════════════════════
// 9. Pharmacy picker — pickablePharmacies
// ════════════════════════════════════════════════════════════

describe('3A-1C1 UsersPage — pharmacy picker scoping', () => {
  it('pickablePharmacies computed from isTerritoryRole', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('pickablePharmacies =')
    expect(idx).toBeGreaterThan(-1)
    const line = s.slice(idx, idx + 80)
    expect(line).toContain('isTerritoryRole')
    expect(line).toContain('allowedPharmacies')
  })

  it('pharmacy picker uses pickablePharmacies (not raw pharmacies)', async () => {
    const s = await usersPageSrc()
    const selectIdx = s.indexOf("Select branch...")
    expect(selectIdx).toBeGreaterThan(-1)
    const block = s.slice(selectIdx, selectIdx + 200)
    expect(block).toContain('pickablePharmacies')
    expect(block).not.toContain('{pharmacies.filter')
  })

  it('allowedPharmacies computed from filterAllowedPharmacies', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('filterAllowedPharmacies')
    const idx = s.indexOf('allowedPharmacies =')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 80)
    expect(block).toContain('filterAllowedPharmacies')
  })
})

// ════════════════════════════════════════════════════════════
// 10–12. handleSave — territory create guards
// ════════════════════════════════════════════════════════════

describe('3A-1C1 UsersPage — handleSave territory guards', () => {
  it('handleSave checks SUPERVISOR_CREATABLE_ROLES for territory create', async () => {
    const s = await usersPageSrc()
    const saveIdx = s.indexOf('const handleSave = async')
    const block = s.slice(saveIdx, saveIdx + 700)
    expect(block).toContain('isTerritoryRole')
    expect(block).toContain('SUPERVISOR_CREATABLE_ROLES')
  })

  it('handleSave checks isPharmacyAllowed(scope, form.pharmacyId) for territory create', async () => {
    const s = await usersPageSrc()
    const saveIdx = s.indexOf('const handleSave = async')
    const block = s.slice(saveIdx, saveIdx + 700)
    expect(block).toContain('isPharmacyAllowed(scope, form.pharmacyId)')
  })

  it('territory guards appear before validate() in handleSave', async () => {
    const s = await usersPageSrc()
    const saveIdx = s.indexOf('const handleSave = async')
    const block = s.slice(saveIdx, saveIdx + 800)
    const guardIdx = block.indexOf('SUPERVISOR_CREATABLE_ROLES')
    const validateIdx = block.indexOf('validate()')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(validateIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(validateIdx)
  })

  it('isNew && isTerritoryRole guard wraps both create checks', async () => {
    const s = await usersPageSrc()
    const saveIdx = s.indexOf('const handleSave = async')
    const block = s.slice(saveIdx, saveIdx + 700)
    expect(block).toContain('isNew && isTerritoryRole')
  })
})

// ════════════════════════════════════════════════════════════
// 13–18. userService.js — territory create guard
// ════════════════════════════════════════════════════════════

describe('3A-1C1 userService — pre-Auth territory guard', () => {
  it('TERRITORY_ROLES_SVC and SUPERVISOR_CREATABLE_SVC defined in createUser', async () => {
    const s = await userServiceSrc()
    const createIdx = s.indexOf('export async function createUser')
    // Long function signature (~500 chars CRLF) before the guard body — use 1200
    const block = s.slice(createIdx, createIdx + 1200)
    expect(block).toContain('TERRITORY_ROLES_SVC')
    expect(block).toContain('SUPERVISOR_CREATABLE_SVC')
  })

  it('guard runs before createFirebaseAuthUser (no orphan Auth accounts)', async () => {
    const s = await userServiceSrc()
    const createIdx = s.indexOf('export async function createUser')
    // Function signature (~500 chars) + guard block (~600 chars) + CRLF overhead — use 2000
    const block = s.slice(createIdx, createIdx + 2000)
    const guardIdx = block.indexOf('TERRITORY_ROLES_SVC')
    // Search for the actual call (await), not the comment that mentions the function name
    const authIdx  = block.indexOf('await createFirebaseAuthUser')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(authIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(authIdx)
  })

  it("SUPERVISOR_CREATABLE_SVC includes 'pharmacist'", async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('SUPERVISOR_CREATABLE_SVC')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("'pharmacist'")
  })

  it("SUPERVISOR_CREATABLE_SVC includes 'branch_manager'", async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('SUPERVISOR_CREATABLE_SVC')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("'branch_manager'")
  })

  it("SUPERVISOR_CREATABLE_SVC does not include 'admin'", async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('SUPERVISOR_CREATABLE_SVC = [')
    const block = s.slice(idx, idx + 80)
    expect(block).not.toContain("'admin'")
  })

  it("SUPERVISOR_CREATABLE_SVC does not include 'district_supervisor'", async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('SUPERVISOR_CREATABLE_SVC = [')
    const block = s.slice(idx, idx + 80)
    expect(block).not.toContain("'district_supervisor'")
  })

  it('guard reads actor Firestore document to verify assignedPharmacyIds', async () => {
    const s = await userServiceSrc()
    const createIdx = s.indexOf('export async function createUser')
    // Function signature is ~450 chars; guard block follows — use 1800 to be safe
    const block = s.slice(createIdx, createIdx + 1800)
    expect(block).toContain('actorSnap')
    expect(block).toContain('assignedPharmacyIds')
    expect(block).toContain('actorAssigned')
  })

  it('guard throws if pharmacyId not in assignedPharmacyIds', async () => {
    const s = await userServiceSrc()
    const createIdx = s.indexOf('export async function createUser')
    const block = s.slice(createIdx, createIdx + 1800)
    expect(block).toContain('actorAssigned.includes(pharmacyId)')
  })
})

// ════════════════════════════════════════════════════════════
// 19–23. Firestore rules — users collection
// ════════════════════════════════════════════════════════════

describe('3A-1C1 Firestore rules — users create extended', () => {
  it('Phase 3A-1C1 marker present in rules', async () => {
    const r = await firestoreRules()
    expect(r).toContain('Phase 3A-1C1')
  })

  it('users create rule includes isTerritoryMgr() path', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    expect(idx).toBeGreaterThan(-1)
    const block = r.slice(idx, idx + 600)
    expect(block).toContain('isTerritoryMgr()')
    const createIdx = block.indexOf('allow create:')
    expect(createIdx).toBeGreaterThan(-1)
    const createBlock = block.slice(createIdx, createIdx + 250)
    expect(createBlock).toContain('isTerritoryMgr()')
  })

  it('users create rule restricts role to pharmacist/manager/branch_manager', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 600)
    const createIdx = block.indexOf('allow create:')
    const createBlock = block.slice(createIdx, createIdx + 250)
    expect(createBlock).toContain("'pharmacist'")
    expect(createBlock).toContain("'manager'")
    expect(createBlock).toContain("'branch_manager'")
  })

  it('users create rule restricts pharmacyId to assignedPharmacyIds', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 600)
    const createIdx = block.indexOf('allow create:')
    const createBlock = block.slice(createIdx, createIdx + 250)
    expect(createBlock).toContain('assignedPharmacyIds')
  })

  it('users create rule does NOT include admin in the territory path', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 600)
    const createIdx = block.indexOf('allow create:')
    const createBlock = block.slice(createIdx, createIdx + 250)
    // The isTerritoryMgr path must not list 'admin' in the role array
    const territoryIdx = createBlock.indexOf('isTerritoryMgr()')
    const territoryBlock = createBlock.slice(territoryIdx, territoryIdx + 150)
    expect(territoryBlock).not.toContain("'admin'")
  })

  it('users update rule has no territory path (unchanged from 3A-1B)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 600)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 150)
    expect(updateBlock).not.toContain('isTerritoryMgr()')
  })

  it('users delete remains admin-only', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    // Window extended to 2500: 3A-1C5 added 6th update path, delete now at ~2211 chars
    const block = r.slice(idx, idx + 2500)
    const deleteIdx = block.indexOf('allow delete:')
    expect(deleteIdx).toBeGreaterThan(-1)
    const deleteLine = block.slice(deleteIdx, deleteIdx + 40)
    expect(deleteLine).toContain('isAdmin()')
    expect(deleteLine).not.toContain('isTerritoryMgr')
  })
})

// ════════════════════════════════════════════════════════════
// 24–25. Guardrails — no edit, no deactivate
// ════════════════════════════════════════════════════════════

describe('3A-1C1 guardrails — sprint scope limited to create only', () => {
  it('edit action unlocked via canEdit in 3A-1C2 (RowActions uses spread pattern)', async () => {
    const s = await usersPageSrc()
    // 3A-1C2 replaced `isReadOnly ? [] :` with a spread-based pattern so
    // territory can edit basic info while Suspend stays gated by !isReadOnly.
    expect(s).toContain('canEdit')
    expect(s).not.toContain('isReadOnly ? [] :')
  })

  it('deactivate unlocked by 3A-1C3: handleToggle uses isTerritoryRole guard (not bare isReadOnly)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const handleToggle = async')
    expect(idx).toBeGreaterThan(-1)
    // 3A-1C3 replaced `if (isReadOnly) return` with a scoped guard so territory CAN toggle.
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('isTerritoryRole')
    expect(block).not.toContain('if (isReadOnly) return')
  })

  it('no transferPharmacist function in userService', async () => {
    const s = await userServiceSrc()
    expect(s).not.toContain('transferPharmacist')
  })

  it('no promoteToManager function in userService', async () => {
    const s = await userServiceSrc()
    expect(s).not.toContain('promoteToManager')
  })

  it('no new routes added for supervisor create', async () => {
    const appSrc = (await import('../../App.jsx?raw')).default
    expect(appSrc).not.toContain('/supervisor-create')
    expect(appSrc).not.toContain('SupervisorCreatePage')
  })
})
