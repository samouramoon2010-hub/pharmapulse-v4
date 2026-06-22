// ============================================================
// Phase 3A-1B — Supervisor Pharmacist Read-only Roster
//
// Verifies:
//   1. App.jsx: USERS_ROLES includes territory roles
//   2. Firestore rules: users read extended for territory roles
//   3. UsersPage: imports useScopeProfile + isPharmacyAllowed
//   4. UsersPage: isReadOnly computed from scope.type === 'list'
//   5. UsersPage: scopedUsers filters to assignedPharmacyIds
//   6. UsersPage: scopeLoading / scopeError early guards
//   7. UsersPage: Add User button hidden when isReadOnly
//   8. UsersPage: RowActions empty when isReadOnly
//   9. UsersPage: handleSave blocked when isReadOnly
//  10. UsersPage: handleToggle blocked when isReadOnly
//  11. UsersPage: openCreate blocked when isReadOnly
//  12. UsersPage: openEdit blocked when isReadOnly
//  13. Sidebar: district_supervisor nav includes /users
//  14. Sidebar: regional_manager is aliased to district_supervisor
//  15. Guardrails: no new routes, no Dynamic KPI
// ============================================================

import { describe, it, expect } from 'vitest'

const usersPageSrc   = () => import('./UsersPage.jsx?raw').then((m) => m.default)
const appSrc         = () => import('../../App.jsx?raw').then((m) => m.default)
const firestoreRules = () => import('../../../firestore.rules?raw').then((m) => m.default)
const sidebarSrc     = () => import('../../components/layout/Sidebar.jsx?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1. App.jsx — USERS_ROLES
// ════════════════════════════════════════════════════════════

describe('3A-1B App.jsx — USERS_ROLES route gate', () => {
  it('USERS_ROLES const is defined', async () => {
    const s = await appSrc()
    expect(s).toContain('USERS_ROLES')
  })

  it('USERS_ROLES includes district_supervisor', async () => {
    const s = await appSrc()
    const idx = s.indexOf('USERS_ROLES')
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('district_supervisor')
  })

  it('USERS_ROLES includes regional_manager', async () => {
    const s = await appSrc()
    const idx = s.indexOf('USERS_ROLES')
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('regional_manager')
  })

  it('/users route uses USERS_ROLES gate', async () => {
    const s = await appSrc()
    expect(s).toContain('roles={USERS_ROLES}')
    const idx = s.indexOf('roles={USERS_ROLES}')
    const block = s.slice(Math.max(0, idx - 30), idx + 80)
    expect(block).toContain('/users')
  })
})

// ════════════════════════════════════════════════════════════
// 2. Firestore rules — users read extended
// ════════════════════════════════════════════════════════════

describe('3A-1B Firestore rules — users collection', () => {
  it('Phase 3A-1B marker present', async () => {
    const r = await firestoreRules()
    expect(r).toContain('Phase 3A-1B')
  })

  it('users read rule includes isTerritoryMgr() check', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    expect(idx).toBeGreaterThan(-1)
    const block = r.slice(idx, idx + 700)
    expect(block).toContain('isTerritoryMgr()')
    expect(block).toContain('assignedPharmacyIds')
  })

  it('users read rule allows own-uid read', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 400)
    expect(block).toContain('uid() == userId')
  })

  it('users create/update/delete remain admin-only', async () => {
    const r = await firestoreRules()
    const idx = r.indexOf('match /users/{userId}')
    const block = r.slice(idx, idx + 700)
    const createIdx = block.indexOf('allow create:')
    expect(createIdx).toBeGreaterThan(-1)
    const createLine = block.slice(createIdx, createIdx + 40)
    expect(createLine).toContain('isAdmin()')
    expect(createLine).not.toContain('isTerritoryMgr')
  })
})

// ════════════════════════════════════════════════════════════
// 3. UsersPage — imports
// ════════════════════════════════════════════════════════════

describe('3A-1B UsersPage — scope imports', () => {
  it('imports useScopeProfile', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('useScopeProfile')
    expect(s).toContain("from '../../hooks/useScopeProfile'")
  })

  it('imports isPharmacyAllowed from scopeResolver', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('isPharmacyAllowed')
    expect(s).toContain("from '../../services/scopeResolver'")
  })
})

// ════════════════════════════════════════════════════════════
// 4. UsersPage — isReadOnly flag
// ════════════════════════════════════════════════════════════

describe('3A-1B UsersPage — isReadOnly flag', () => {
  it("isReadOnly is derived from scope.type === 'list'", async () => {
    const s = await usersPageSrc()
    expect(s).toContain("isReadOnly = scope?.type === 'list'")
  })
})

// ════════════════════════════════════════════════════════════
// 5. UsersPage — scopedUsers filtering
// ════════════════════════════════════════════════════════════

describe('3A-1B UsersPage — scopedUsers scope filtering', () => {
  it('scopedUsers computed via useMemo', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('scopedUsers')
    const idx = s.indexOf('const scopedUsers = useMemo')
    expect(idx).toBeGreaterThan(-1)
  })

  it("scopedUsers handles scope.type === 'all' (admin)", async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const scopedUsers = useMemo')
    const block = s.slice(idx, idx + 300)
    expect(block).toContain("scope.type === 'all'")
    expect(block).toContain('return users')
  })

  it("scopedUsers filters by isPharmacyAllowed for list scope", async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const scopedUsers = useMemo')
    const block = s.slice(idx, idx + 300)
    expect(block).toContain("scope.type === 'list'")
    expect(block).toContain('isPharmacyAllowed(scope, u.pharmacyId)')
  })

  it('stats and filtered use scopedUsers, not raw users', async () => {
    const s = await usersPageSrc()
    const statsIdx = s.indexOf('const stats = useMemo')
    expect(statsIdx).toBeGreaterThan(-1)
    const statsBlock = s.slice(statsIdx, statsIdx + 150)
    expect(statsBlock).toContain('scopedUsers')

    const filteredIdx = s.indexOf('const filtered = useMemo')
    expect(filteredIdx).toBeGreaterThan(-1)
    const filteredBlock = s.slice(filteredIdx, filteredIdx + 150)
    expect(filteredBlock).toContain('scopedUsers')
  })
})

// ════════════════════════════════════════════════════════════
// 6. UsersPage — scope guards
// ════════════════════════════════════════════════════════════

describe('3A-1B UsersPage — scope early-return guards', () => {
  it('scopeLoading guard renders loading state', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('scopeLoading')
    expect(s).toContain('Loading users')
  })

  it('scopeError guard renders access-denied message', async () => {
    const s = await usersPageSrc()
    expect(s).toContain('scopeError')
    expect(s).toContain('Access denied')
  })
})

// ════════════════════════════════════════════════════════════
// 7. UsersPage — Add User button hidden when isReadOnly
// ════════════════════════════════════════════════════════════

describe('3A-1B UsersPage — Add User button gated', () => {
  it('Add User button wrapped in canCreate guard (Phase 3A-1C1: territory can create)', async () => {
    const s = await usersPageSrc()
    const btnIdx = s.indexOf('Add User')
    expect(btnIdx).toBeGreaterThan(-1)
    const block = s.slice(Math.max(0, btnIdx - 220), btnIdx + 10)
    // 3A-1C1 replaced !isReadOnly with canCreate so territory roles see the button
    expect(block).toContain('canCreate')
  })
})

// ════════════════════════════════════════════════════════════
// 8. UsersPage — RowActions empty when isReadOnly
// ════════════════════════════════════════════════════════════

describe('3A-1B UsersPage — RowActions gated by isReadOnly', () => {
  it('RowActions uses canEdit to conditionally show Edit action (Phase 3A-1C2: spread pattern)', async () => {
    const s = await usersPageSrc()
    // 3A-1C2 replaced isReadOnly ? [] : with spread so Edit/Suspend can be gated separately
    const idx = s.indexOf("label:'Edit'")
    expect(idx).toBeGreaterThan(-1)
    const context = s.slice(Math.max(0, idx - 60), idx + 10)
    expect(context).toContain('canEdit')
  })

  it('RowActions Edit action present in source', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf("label:'Edit'")
    expect(idx).toBeGreaterThan(-1)
  })
})

// ════════════════════════════════════════════════════════════
// 9-12. UsersPage — write handler guards
// ════════════════════════════════════════════════════════════

describe('3A-1B UsersPage — write handlers blocked when isReadOnly', () => {
  it('handleSave checks canEdit for edit operations (Phase 3A-1C2: !isNew && !canEdit guard)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const handleSave = async')
    expect(idx).toBeGreaterThan(-1)
    // 3A-1C2 changed guard to `if (!isNew && !canEdit)` so territory roles can edit.
    const block = s.slice(idx, idx + 80)
    expect(block).toContain('canEdit')
  })

  it('handleSave guard is before validate() call', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const handleSave = async')
    // 3A-1C2: guard is `!canEdit`, then territory create guards, then territory edit guard, then validate().
    const block = s.slice(idx, idx + 900)
    const guardIdx = block.indexOf('canEdit')
    const validateIdx = block.indexOf('validate()')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(validateIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(validateIdx)
  })

  it('handleToggle checks isTerritoryRole before calling toggleUserStatus (Phase 3A-1C3)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const handleToggle = async')
    expect(idx).toBeGreaterThan(-1)
    // 3A-1C3 replaced the `if (isReadOnly) return` gate with a territory-specific guard
    // that checks isPharmacyAllowed + SUPERVISOR_TOGGLEABLE_ROLES inside isTerritoryRole.
    const block = s.slice(idx, idx + 400)
    expect(block).toContain('isTerritoryRole')
    expect(block).toContain('isPharmacyAllowed')
  })

  it('openCreate checks canCreate before opening modal (Phase 3A-1C1: territory can create)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const openCreate = ()')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 80)
    // 3A-1C1 changed the gate from isReadOnly to canCreate
    expect(block).toContain('canCreate')
  })

  it('openEdit checks canEdit before opening modal (Phase 3A-1C2: territory can edit)', async () => {
    const s = await usersPageSrc()
    const idx = s.indexOf('const openEdit')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 80)
    // 3A-1C2 changed gate from isReadOnly to !canEdit so territory roles see Edit.
    expect(block).toContain('canEdit')
  })
})

// ════════════════════════════════════════════════════════════
// 13. Sidebar — district_supervisor includes /users
// ════════════════════════════════════════════════════════════

describe('3A-1B Sidebar — district_supervisor people nav', () => {
  it('district_supervisor nav includes /users path', async () => {
    const s = await sidebarSrc()
    const idx = s.indexOf('NAV_CONFIG.district_supervisor')
    expect(idx).toBeGreaterThan(-1)
    // Window 950: Phase 3C-3D inserted an Actions group before People, pushing /users further
    const block = s.slice(idx, idx + 950)
    expect(block).toContain("path: '/users'")
  })

  it('district_supervisor /users nav uses UserCheck icon', async () => {
    const s = await sidebarSrc()
    const idx = s.indexOf('NAV_CONFIG.district_supervisor')
    // Window 950: Phase 3C-3D inserted an Actions group before People
    const block = s.slice(idx, idx + 950)
    const usersIdx = block.indexOf("path: '/users'")
    const nearby = block.slice(Math.max(0, usersIdx - 60), usersIdx + 10)
    expect(nearby).toContain('UserCheck')
  })
})

// ════════════════════════════════════════════════════════════
// 14. Sidebar — regional_manager alias
// ════════════════════════════════════════════════════════════

describe('3A-1B Sidebar — regional_manager nav alias', () => {
  it('NAV_CONFIG.regional_manager is defined', async () => {
    const s = await sidebarSrc()
    expect(s).toContain('NAV_CONFIG.regional_manager')
  })

  it('NAV_CONFIG.regional_manager aliased to district_supervisor', async () => {
    const s = await sidebarSrc()
    const idx = s.indexOf('NAV_CONFIG.regional_manager')
    expect(idx).toBeGreaterThan(-1)
    const line = s.slice(idx, idx + 80)
    expect(line).toContain('NAV_CONFIG.district_supervisor')
  })
})

// ════════════════════════════════════════════════════════════
// 15. Guardrails — no new routes, no Dynamic KPI
// ════════════════════════════════════════════════════════════

describe('3A-1B guardrails', () => {
  it('No new /supervisor-users route in App.jsx', async () => {
    const s = await appSrc()
    expect(s).not.toContain('/supervisor-users')
  })

  it('No new dashboard added for territory roles', async () => {
    const s = await appSrc()
    expect(s).not.toContain('SupervisorUsersPage')
    expect(s).not.toContain('TerritoryRosterPage')
  })

  it('UsersPage openCreate uses canCreate, openEdit uses canEdit (Phase 3A-1C2)', async () => {
    const s = await usersPageSrc()
    // 3A-1C1: openCreate uses canCreate (territory CAN create).
    const openCreateIdx = s.indexOf('const openCreate = ()')
    const openCreateBlock = s.slice(openCreateIdx, openCreateIdx + 80)
    expect(openCreateBlock).toContain('canCreate')

    // 3A-1C2: openEdit now uses canEdit (territory CAN edit basic info).
    const openEditIdx = s.indexOf('const openEdit')
    const openEditBlock = s.slice(openEditIdx, openEditIdx + 80)
    expect(openEditBlock).toContain('canEdit')
  })
})
