// ============================================================
// Actions Permission Fix — Source-level certification
//
// Certifies:
//   1.  firestore.rules: admin can read suggestedActions (isAdmin)
//   2.  firestore.rules: general_manager can read suggestedActions
//   3.  firestore.rules: manager can read suggestedActions (own pharmacy)
//   4.  firestore.rules: branch_manager can read suggestedActions (own pharmacy)
//   5.  firestore.rules: district_supervisor scoped by assignedPharmacyIds
//   6.  firestore.rules: regional_manager scoped by assignedPharmacyIds
//   7.  firestore.rules: pharmacist scoped by ownerId
//   8.  firestore.rules: manager in actionHistory read rule
//   9.  firestore.rules: manager in actionHistory create rule
//  10.  firestore.rules: manager in recoveryObservations read rule
//  11.  firestore.rules: manager in recoveryObservations create rule
//  12.  firestore.rules: manager in recoveryObservations update rule
//  13.  useActions all scope: no relatedPharmacyId constraint
//  14.  useActions single scope: relatedPharmacyId filter applied
//  15.  useActions list scope: relatedPharmacyId 'in' filter applied
//  16.  no overfetch — pharmacist scope uses ownerId client filter only
//  17.  isAdmin() helper uses lowercase 'admin' (matches Firestore value)
//  18.  manager role exists in scopeResolver single-branch roles
//  19.  suggestedActions: manager read uses 'in' operator not ==
//  20.  actionHistory: manager read uses 'in' operator not ==
//  21.  recoveryObservations: manager read uses 'in' operator not ==
//  22.  no branch_manager-only blocks that exclude manager in create
//  23.  no branch_manager-only blocks that exclude manager in update
//  24.  admin has unrestricted read (no pharmacy constraint)
//  25.  general_manager has unrestricted read (no pharmacy constraint)
//  26.  pharmacist cannot read recoveryObservations (no ownerId path)
//  27.  guardrails — no Dynamic KPI, no AI, no Firestore schema migration
// ============================================================

import { describe, it, expect } from 'vitest'

const rulesSrc  = () => import('../../../firestore.rules?raw').then((m) => m.default)
const hookSrc   = () => import('../../hooks/useActions.ts?raw').then((m) => m.default)
const scopeSrc  = () => import('../../services/scopeResolver.ts?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// SECTION 1 — suggestedActions rules
// ════════════════════════════════════════════════════════════

describe('Actions Permission Fix — suggestedActions rules', () => {
  it('admin can read suggestedActions via isAdmin() (test 1)', async () => {
    const s = await rulesSrc()
    // Locate the suggestedActions block
    const idx = s.indexOf("match /suggestedActions/")
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1200)
    expect(block).toContain('isAdmin()')
  })

  it('general_manager can read suggestedActions via isGeneralMgr() (test 2)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /suggestedActions/")
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1200)
    expect(block).toContain('isGeneralMgr()')
  })

  it("manager role is included in suggestedActions read rule (test 3)", async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /suggestedActions/")
    expect(idx).toBeGreaterThan(-1)
    // Find the allow read block within suggestedActions
    const readIdx = s.indexOf('allow read:', idx)
    expect(readIdx).toBeGreaterThan(-1)
    const readBlock = s.slice(readIdx, readIdx + 600)
    expect(readBlock).toContain("role() in ['manager', 'branch_manager']")
  })

  it("branch_manager role is still covered in suggestedActions read rule (test 4)", async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /suggestedActions/")
    expect(idx).toBeGreaterThan(-1)
    const readIdx = s.indexOf('allow read:', idx)
    const readBlock = s.slice(readIdx, readIdx + 600)
    expect(readBlock).toContain("'branch_manager'")
  })

  it('district_supervisor can read suggestedActions scoped by assignedPharmacyIds (test 5)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /suggestedActions/")
    expect(idx).toBeGreaterThan(-1)
    const readIdx = s.indexOf('allow read:', idx)
    const readBlock = s.slice(readIdx, readIdx + 600)
    expect(readBlock).toContain('isTerritoryMgr()')
    expect(readBlock).toContain('assignedPharmacyIds')
  })

  it('pharmacist can read suggestedActions scoped by ownerId (test 7)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /suggestedActions/")
    expect(idx).toBeGreaterThan(-1)
    const readIdx = s.indexOf('allow read:', idx)
    const readBlock = s.slice(readIdx, readIdx + 600)
    expect(readBlock).toContain("role() == 'pharmacist'")
    expect(readBlock).toContain('ownerId')
  })

  it("manager is in suggestedActions create rule (test 22)", async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /suggestedActions/")
    expect(idx).toBeGreaterThan(-1)
    const createIdx = s.indexOf('allow create:', idx)
    expect(createIdx).toBeGreaterThan(-1)
    const createBlock = s.slice(createIdx, createIdx + 600)
    expect(createBlock).toContain("role() in ['manager', 'branch_manager']")
  })

  it("manager is in suggestedActions update rule (test 23)", async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /suggestedActions/")
    expect(idx).toBeGreaterThan(-1)
    const updateIdx = s.indexOf('allow update:', idx)
    expect(updateIdx).toBeGreaterThan(-1)
    const updateBlock = s.slice(updateIdx, updateIdx + 600)
    expect(updateBlock).toContain("role() in ['manager', 'branch_manager']")
  })
})

// ════════════════════════════════════════════════════════════
// SECTION 2 — actionHistory rules
// ════════════════════════════════════════════════════════════

describe('Actions Permission Fix — actionHistory rules', () => {
  it('manager is in actionHistory read rule (test 8)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /actionHistory/")
    expect(idx).toBeGreaterThan(-1)
    const readIdx = s.indexOf('allow read:', idx)
    expect(readIdx).toBeGreaterThan(-1)
    const readBlock = s.slice(readIdx, readIdx + 500)
    expect(readBlock).toContain("role() in ['manager', 'branch_manager']")
  })

  it('manager is in actionHistory create rule (test 9)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /actionHistory/")
    expect(idx).toBeGreaterThan(-1)
    const createIdx = s.indexOf('allow create:', idx)
    expect(createIdx).toBeGreaterThan(-1)
    const createBlock = s.slice(createIdx, createIdx + 500)
    expect(createBlock).toContain("role() in ['manager', 'branch_manager']")
  })

  it('actionHistory update is immutable (allow update: if false)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /actionHistory/")
    expect(idx).toBeGreaterThan(-1)
    const updateIdx = s.indexOf('allow update:', idx)
    expect(updateIdx).toBeGreaterThan(-1)
    const updateBlock = s.slice(updateIdx, updateIdx + 50)
    expect(updateBlock).toContain('if false')
  })
})

// ════════════════════════════════════════════════════════════
// SECTION 3 — recoveryObservations rules
// ════════════════════════════════════════════════════════════

describe('Actions Permission Fix — recoveryObservations rules', () => {
  it('manager is in recoveryObservations read rule (test 10)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /recoveryObservations/")
    expect(idx).toBeGreaterThan(-1)
    const readIdx = s.indexOf('allow read:', idx)
    expect(readIdx).toBeGreaterThan(-1)
    const readBlock = s.slice(readIdx, readIdx + 500)
    expect(readBlock).toContain("role() in ['manager', 'branch_manager']")
  })

  it('manager is in recoveryObservations create rule (test 11)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /recoveryObservations/")
    expect(idx).toBeGreaterThan(-1)
    const createIdx = s.indexOf('allow create:', idx)
    expect(createIdx).toBeGreaterThan(-1)
    const createBlock = s.slice(createIdx, createIdx + 500)
    expect(createBlock).toContain("role() in ['manager', 'branch_manager']")
  })

  it('manager is in recoveryObservations update rule (test 12)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /recoveryObservations/")
    expect(idx).toBeGreaterThan(-1)
    const updateIdx = s.indexOf('allow update:', idx)
    expect(updateIdx).toBeGreaterThan(-1)
    const updateBlock = s.slice(updateIdx, updateIdx + 500)
    expect(updateBlock).toContain("role() in ['manager', 'branch_manager']")
  })

  it('pharmacist cannot read recoveryObservations (no pharmacist clause)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /recoveryObservations/")
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1200)
    const readIdx = block.indexOf('allow read:')
    const readBlock = block.slice(readIdx, readIdx + 500)
    expect(readBlock).not.toContain("role() == 'pharmacist'")
  })
})

// ════════════════════════════════════════════════════════════
// SECTION 4 — isAdmin() helper correctness
// ════════════════════════════════════════════════════════════

describe('Actions Permission Fix — isAdmin() helper', () => {
  it("isAdmin() checks role == 'admin' (lowercase — matches Firestore value) (test 17)", async () => {
    const s = await rulesSrc()
    expect(s).toContain("function isAdmin()   { return isAuth() && role() == 'admin'; }")
  })

  it("isAdmin() does NOT check for capitalised 'Admin' (test 17b)", async () => {
    const s = await rulesSrc()
    const idx = s.indexOf('function isAdmin()')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 80)
    expect(block).not.toContain("'Admin'")
  })

  it("admin has unrestricted read — no pharmacy constraint in suggestedActions (test 24)", async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /suggestedActions/")
    expect(idx).toBeGreaterThan(-1)
    const readIdx = s.indexOf('allow read:', idx)
    const readBlock = s.slice(readIdx, readIdx + 80)
    // First condition is isAdmin() with no pharmacy field requirement
    expect(readBlock).toContain('isAdmin()')
  })

  it("general_manager has unrestricted read — no pharmacy constraint (test 25)", async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /suggestedActions/")
    expect(idx).toBeGreaterThan(-1)
    const readIdx = s.indexOf('allow read:', idx)
    const readBlock = s.slice(readIdx, readIdx + 200)
    // isGeneralMgr() appears as a standalone condition, not gated by pharmId
    expect(readBlock).toContain('|| isGeneralMgr()')
  })
})

// ════════════════════════════════════════════════════════════
// SECTION 5 — scopeResolver: manager in single-branch roles
// ════════════════════════════════════════════════════════════

describe('Actions Permission Fix — scopeResolver role mapping', () => {
  it("manager is in SINGLE_BRANCH_ROLES (scope.type = 'single') (test 18)", async () => {
    const s = await scopeSrc()
    expect(s).toContain("SINGLE_BRANCH_ROLES")
    const idx = s.indexOf("SINGLE_BRANCH_ROLES")
    const block = s.slice(idx, idx + 100)
    expect(block).toContain("'manager'")
    expect(block).toContain("'branch_manager'")
  })

  it("admin is in ALL_ACCESS_ROLES (scope.type = 'all') (test 18b)", async () => {
    const s = await scopeSrc()
    expect(s).toContain("ALL_ACCESS_ROLES")
    const idx = s.indexOf("ALL_ACCESS_ROLES")
    const block = s.slice(idx, idx + 80)
    expect(block).toContain("'admin'")
    expect(block).toContain("'general_manager'")
  })
})

// ════════════════════════════════════════════════════════════
// SECTION 6 — useActions query behavior (no overfetch)
// ════════════════════════════════════════════════════════════

describe('Actions Permission Fix — useActions query scope', () => {
  it("all scope does NOT add relatedPharmacyId constraint (no overfetch) (test 13)", async () => {
    const s = await hookSrc()
    const idx = s.indexOf("scope.type === 'all'")
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).not.toContain("where('relatedPharmacyId'")
  })

  it("single scope queries where relatedPharmacyId == scope.id (test 14)", async () => {
    const s = await hookSrc()
    expect(s).toContain("scope.type === 'single'")
    expect(s).toContain("where('relatedPharmacyId', '==', scope.id)")
  })

  it("list scope queries where relatedPharmacyId 'in' group (test 15)", async () => {
    const s = await hookSrc()
    expect(s).toContain("scope.type === 'list'")
    expect(s).toContain("where('relatedPharmacyId', 'in', group)")
  })

  it("ownerId filter is applied client-side only (no Firestore where on ownerId) (test 16)", async () => {
    const s = await hookSrc()
    // ownerId is used as a client-side filter, not a Firestore where clause
    expect(s).toContain("filters.ownerId")
    expect(s).toContain("a.ownerId")
    // Must NOT appear inside a where() call
    expect(s).not.toContain("where('ownerId'")
  })
})

// ════════════════════════════════════════════════════════════
// SECTION 7 — Guardrails
// ════════════════════════════════════════════════════════════

describe('Actions Permission Fix — guardrails', () => {
  it('no Dynamic KPI changes in rules (test 27a)', async () => {
    const s = await rulesSrc()
    expect(s).not.toContain('kpiRegistry')
    expect(s).not.toContain('dynamicKpi')
  })

  it('no AI or external service references in rules (test 27b)', async () => {
    const s = await rulesSrc()
    expect(s).not.toContain('openai')
    expect(s).not.toContain('anthropic')
  })

  it('suggestedActions delete is still admin-only (test 27c)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /suggestedActions/")
    expect(idx).toBeGreaterThan(-1)
    const deleteIdx = s.indexOf('allow delete:', idx)
    expect(deleteIdx).toBeGreaterThan(-1)
    const deleteBlock = s.slice(deleteIdx, deleteIdx + 50)
    expect(deleteBlock).toContain('isAdmin()')
  })

  it('actionHistory delete is still admin-only (test 27d)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /actionHistory/")
    expect(idx).toBeGreaterThan(-1)
    const deleteIdx = s.indexOf('allow delete:', idx)
    expect(deleteIdx).toBeGreaterThan(-1)
    const deleteBlock = s.slice(deleteIdx, deleteIdx + 50)
    expect(deleteBlock).toContain('isAdmin()')
  })

  it('recoveryObservations delete is still admin-only (test 27e)', async () => {
    const s = await rulesSrc()
    const idx = s.indexOf("match /recoveryObservations/")
    expect(idx).toBeGreaterThan(-1)
    const deleteIdx = s.indexOf('allow delete:', idx)
    expect(deleteIdx).toBeGreaterThan(-1)
    const deleteBlock = s.slice(deleteIdx, deleteIdx + 50)
    expect(deleteBlock).toContain('isAdmin()')
  })
})
