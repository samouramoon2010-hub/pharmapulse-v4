// ============================================================
// Phase 3A-1C2 — Supervisor Edit Pharmacist Basic Info
//
// Verifies:
//   1.  canEdit flag defined (admin || isTerritoryRole)
//   2.  openEdit uses canEdit gate (not isReadOnly)
//   3.  RowActions: Edit gated by canEdit (spread pattern)
//   4.  RowActions: Suspend still gated by !isReadOnly
//   5.  handleSave: edit guard uses !canEdit (not isReadOnly)
//   6.  handleSave: territory edit isPharmacyAllowed guard
//   7.  handleSave: territory edit sends restricted payload only
//   8.  handleSave: admin edit sends full payload
//   9.  handleSave: territory edit guard comes before validate()
//  10.  modal: Role section hidden for territory edit
//  11.  modal: Branch section hidden for territory edit
//  12.  modal: Status section hidden for territory edit
//  13.  userService: updateUserProfile has TERRITORY_ROLES_UPDATE constant
//  14.  userService: reads actorAssigned from actor doc
//  15.  userService: throws when target not in assigned territory
//  16.  userService: strips data to ALLOWED_UPDATE_FIELDS
//  17.  userService: territory guard runs before updateDoc
//  18.  Firestore: Phase 3A-1C2 marker present
//  19.  Firestore: territory update path uses isTerritoryMgr()
//  20.  Firestore: territory update checks pharmacyId in assignedPharmacyIds
//  21.  Firestore: territory update uses hasOnly with allowed fields
//  22.  Firestore: allowed fields include employeeId (new in 3A-1C2)
//  23.  Guardrail: no deactivate/reactivate for territory in this sprint
//  24.  Guardrail: no transfer pharmacist in this sprint
//  25.  Guardrail: no Dynamic KPI changes
//  26.  Guardrail: no new routes or dashboards
// ============================================================

import { describe, it, expect } from 'vitest'

const usersPageSrc   = () => import('./UsersPage.jsx?raw').then((m) => m.default)
const userServiceSrc = () => import('../../services/userService.js?raw').then((m) => m.default)
const firestoreRules = () => import('../../../firestore.rules?raw').then((m) => m.default)
const appSrc         = () => import('../../App.jsx?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1-2. canEdit flag + openEdit gate
// ════════════════════════════════════════════════════════════

describe('3A-1C2 UsersPage — canEdit flag', () => {
  it('canEdit is defined in UsersPage', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('canEdit')
  })

  it('canEdit includes admin role', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('canEdit')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("'admin'")
  })

  it('canEdit includes isTerritoryRole', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('canEdit')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 80)
    expect(block).toContain('isTerritoryRole')
  })

  it('openEdit uses !canEdit gate (not isReadOnly)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const openEdit')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 80)
    expect(block).toContain('canEdit')
    expect(block).not.toContain('isReadOnly')
  })
})

// ════════════════════════════════════════════════════════════
// 3-4. RowActions spread pattern
// ════════════════════════════════════════════════════════════

describe('3A-1C2 UsersPage — RowActions spread pattern', () => {
  it('RowActions no longer uses isReadOnly ? [] : pattern', async () => {
    const s = await usersPageSrc()
    expect(s).not.toContain('isReadOnly ? [] :')
  })

  it('RowActions Edit action gated by canEdit', async () => {
    const s = await usersPageSrc()
    const editIdx = s.indexOf("label:'Edit'")
    expect(editIdx).toBeGreaterThan(-1)
    const context = s.slice(Math.max(0, editIdx - 80), editIdx + 10)
    expect(context).toContain('canEdit')
  })

  it('RowActions Suspend action gated by canToggleRow (Phase 3A-1C3: territory can toggle)', async () => {
    const s = await usersPageSrc()
    const suspendIdx = s.indexOf("label: row.active!==false?'Suspend':'Activate'")
    expect(suspendIdx).toBeGreaterThan(-1)
    // 3A-1C3 replaced !isReadOnly with canToggleRow(row) so territory roles with
    // allowed target roles see the Suspend/Activate action.
    const context = s.slice(Math.max(0, suspendIdx - 80), suspendIdx + 10)
    expect(context).toContain('canToggleRow')
  })
})

// ════════════════════════════════════════════════════════════
// 5-9. handleSave guards
// ════════════════════════════════════════════════════════════

describe('3A-1C2 UsersPage — handleSave guards', () => {
  it('handleSave edit guard uses !canEdit not isReadOnly', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const handleSave = async')
    const block = s.slice(idx, idx + 80)
    expect(block).toContain('canEdit')
    expect(block).not.toContain('isReadOnly')
  })

  it('handleSave territory edit guard checks isPharmacyAllowed for editUser.pharmacyId', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const handleSave = async')
    const block = s.slice(idx, idx + 900)
    expect(block).toContain('editUser.pharmacyId')
    expect(block).toContain('isPharmacyAllowed(scope, editUser.pharmacyId)')
  })

  it('handleSave territory edit sends restricted payload (displayName/phone/employeeId only)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('isTerritoryRole')
    // Find the territory branch in the update payload section
    const updateIdx = s.indexOf('isTerritoryRole\n', idx + 100)
    const payloadBlock = s.slice(updateIdx > -1 ? updateIdx : idx, (updateIdx > -1 ? updateIdx : idx) + 500)
    expect(payloadBlock).toContain('displayName')
    expect(payloadBlock).toContain('phone')
    expect(payloadBlock).toContain('employeeId')
  })

  it('handleSave admin edit sends full payload including role and status', async () => {
    const s = await usersPageSrc()
    const saveIdx = s.indexOf('const handleSave = async')
    const block = s.slice(saveIdx, saveIdx + 1200)
    // The full payload (non-territory branch) includes role, status, pharmacyId
    expect(block).toContain('form.role')
    expect(block).toContain('form.status')
  })

  it('handleSave territory edit guard appears before validate()', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const handleSave = async')
    const block = s.slice(idx, idx + 900)
    const editGuardIdx = block.indexOf('editUser.pharmacyId')
    const validateIdx  = block.indexOf('validate()')
    expect(editGuardIdx).toBeGreaterThan(-1)
    expect(validateIdx).toBeGreaterThan(-1)
    expect(editGuardIdx).toBeLessThan(validateIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 10-12. Modal field restrictions for territory edit
// ════════════════════════════════════════════════════════════

describe('3A-1C2 UsersPage — modal restricted for territory edit', () => {
  it('Role section wrapped in (!isTerritoryRole || isNew) guard', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('(!isTerritoryRole || isNew)')
    expect(idx).toBeGreaterThan(-1)
    // Should appear before Role label
    const roleIdx = s.indexOf("label=\"Role\"")
    expect(idx).toBeLessThan(roleIdx)
  })

  it('Branch section guarded with (!isTerritoryRole || isNew)', async () => {
    const s = await usersPageSrc()
    // The branch section condition was extended to include (!isTerritoryRole || isNew).
    // Search for the combined guard expression directly.
    expect(s).toContain('needsPharmacy && (!isTerritoryRole || isNew)')
  })

  it('Status section wrapped in (!isTerritoryRole || isNew) guard', async () => {
    const s = await usersPageSrc()
    // Find the last (!isTerritoryRole || isNew) before "Status"
    const statusIdx = s.indexOf('label="Status"')
    expect(statusIdx).toBeGreaterThan(-1)
    const region = s.slice(0, statusIdx)
    const lastGuard = region.lastIndexOf('(!isTerritoryRole || isNew)')
    expect(lastGuard).toBeGreaterThan(-1)
  })
})

// ════════════════════════════════════════════════════════════
// 13-17. userService territory guard
// ════════════════════════════════════════════════════════════

describe('3A-1C2 userService — updateUserProfile territory guard', () => {
  it('TERRITORY_ROLES_UPDATE constant is defined', async () => {
    const s = await userServiceSrc()
    expect(s).toContain('TERRITORY_ROLES_UPDATE')
  })

  it('territory guard checks actorAssigned from Firestore', async () => {
    const s = await userServiceSrc()
    expect(s).toContain('actorAssigned')
    expect(s).toContain('assignedPharmacyIds')
  })

  it('territory guard throws when user not in assigned territory', async () => {
    const s = await userServiceSrc()
    const idx = s.indexOf('TERRITORY_ROLES_UPDATE')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 800)
    expect(block).toContain('User not in your assigned territory')
  })

  it('territory guard strips data to ALLOWED_UPDATE_FIELDS', async () => {
    const s = await userServiceSrc()
    expect(s).toContain('ALLOWED_UPDATE_FIELDS')
    const idx = s.indexOf('ALLOWED_UPDATE_FIELDS')
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('displayName')
    expect(block).toContain('phone')
    expect(block).toContain('employeeId')
  })

  it('territory guard runs before updateDoc call', async () => {
    const s = await userServiceSrc()
    const fnIdx = s.indexOf('async function updateUserProfile')
    expect(fnIdx).toBeGreaterThan(-1)
    const block = s.slice(fnIdx, fnIdx + 1200)
    const guardIdx   = block.indexOf('TERRITORY_ROLES_UPDATE')
    const updateIdx  = block.indexOf('updateDoc')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(updateIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 18-22. Firestore rules — territory update path
// ════════════════════════════════════════════════════════════

describe('3A-1C2 Firestore rules — users update extended', () => {
  it('Phase 3A-1C2 marker present in rules', async () => {
    const r = await firestoreRules()
    expect(r).toContain('Phase 3A-1C2')
  })

  it('users update rule includes isTerritoryMgr() path', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    // Outer window 1400: allow update: is ~500 chars in, leaving 900 for the rule body.
    const block = r.slice(idx, idx + 1400)
    const updateIdx = block.indexOf('allow update:')
    expect(updateIdx).toBeGreaterThan(-1)
    const updateBlock = block.slice(updateIdx, updateIdx + 650)
    expect(updateBlock).toContain('isTerritoryMgr()')
  })

  it('territory update rule checks pharmacyId in assignedPharmacyIds', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 1400)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 650)
    expect(updateBlock).toContain('assignedPharmacyIds')
  })

  it('territory update rule uses hasOnly to restrict fields', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 1400)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 650)
    expect(updateBlock).toContain('hasOnly')
  })

  it('territory edit hasOnly includes employeeId (new in 3A-1C2)', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 1800)
    const updateIdx = block.indexOf('allow update:')
    const updateBlock = block.slice(updateIdx, updateIdx + 1000)
    // The 3A-1C2 territory edit path contains 'employeeId' inside a hasOnly call.
    // 3A-1C3 added a further path so lastIndexOf('hasOnly') is no longer reliable.
    const empIdx = updateBlock.indexOf("'employeeId'")
    expect(empIdx).toBeGreaterThan(-1)
    const surroundingCtx = updateBlock.slice(Math.max(0, empIdx - 40), empIdx + 20)
    expect(surroundingCtx).toContain('hasOnly')
  })
})

// ════════════════════════════════════════════════════════════
// 23-26. Guardrails
// ════════════════════════════════════════════════════════════

describe('3A-1C2 guardrails', () => {
  it('Deactivate unlocked in 3A-1C3: handleToggle uses scoped isTerritoryRole guard', async () => {
    const s = await usersPageSrc()
    // 3A-1C3 replaced `if (isReadOnly) return` with isTerritoryRole + isPharmacyAllowed guard.
    const idx = s.indexOf('const handleToggle = async')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('isTerritoryRole')
    expect(block).not.toContain('if (isReadOnly) return')
  })

  it('No transfer pharmacist implementation in this sprint', async () => {
    const s = await usersPageSrc()
    expect(s).not.toContain('transferPharmacist')
    expect(s).not.toContain('Transfer Pharmacist')
  })

  it('No Dynamic KPI changes in UsersPage', async () => {
    const s = await usersPageSrc()
    expect(s).not.toContain('dynamicKpi')
    expect(s).not.toContain('DynamicKpi')
    expect(s).not.toContain('kpiRegistry')
  })

  it('No new routes or supervisor dashboard added', async () => {
    const s = await appSrc()
    expect(s).not.toContain('/supervisor-edit')
    expect(s).not.toContain('SupervisorEditPage')
    expect(s).not.toContain('TerritoryEditPage')
  })
})
