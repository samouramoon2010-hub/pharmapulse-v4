// ============================================================
// Phase 1A — Hierarchy Route Access Regression Tests
//
// Verifies that the route guard arrays (EXEC_ROLES, MGR_UP, ALL)
// and role constants are updated correctly for Phase 1A.
//
// Source-level tests (raw imports) — no DOM rendering required.
// ============================================================

import { describe, it, expect } from 'vitest'

async function appSrc() {
  return (await import('../../App.jsx?raw')).default
}

async function constantsSrc() {
  return (await import('../../constants/index.js?raw')).default
}

async function accessGuardSrc() {
  return (await import('../../services/security/accessGuard.ts?raw')).default
}

// ════════════════════════════════════════════════════════════
// 1. Role constants
// ════════════════════════════════════════════════════════════

describe('Phase 1A — general_manager role constant', () => {
  it('ROLES.GENERAL_MANAGER is defined in constants/index.js', async () => {
    const src = await constantsSrc()
    expect(src).toContain("GENERAL_MANAGER:")
    expect(src).toContain("'general_manager'")
  })

  it('ROLE_LABELS has a label for general_manager', async () => {
    const src = await constantsSrc()
    expect(src).toContain('general_manager:')
    // label is defined (Arabic text present alongside key)
    const idx = src.indexOf('general_manager:')
    const slice = src.slice(idx, idx + 60)
    expect(slice.length).toBeGreaterThan(20)
  })

  it('ROLE_COLORS has an entry for general_manager', async () => {
    const src = await constantsSrc()
    // Verify the colors block contains general_manager
    const colorsIdx   = src.indexOf('ROLE_COLORS')
    const colorsBlock = src.slice(colorsIdx, colorsIdx + 600)
    expect(colorsBlock).toContain('general_manager:')
  })

  it('accessGuard.ts UserRole type includes general_manager', async () => {
    const src = await accessGuardSrc()
    expect(src).toContain("'general_manager'")
  })

  it('accessGuard.ts has isGeneralManager() helper', async () => {
    const src = await accessGuardSrc()
    expect(src).toContain('isGeneralManager')
    expect(src).toContain("ctx.role === 'general_manager'")
  })
})

// ════════════════════════════════════════════════════════════
// 2. EXEC_ROLES — Executive BI route
// ════════════════════════════════════════════════════════════

describe('Phase 1A — EXEC_ROLES includes hierarchy roles', () => {
  it('district_supervisor is allowed through Executive BI route', async () => {
    const src = await appSrc()
    const execIdx   = src.indexOf('const EXEC_ROLES')
    const execBlock = src.slice(execIdx, execIdx + 600)
    expect(execBlock).toContain("'district_supervisor'")
  })

  it('regional_manager is allowed through Executive BI route', async () => {
    const src = await appSrc()
    const execIdx   = src.indexOf('const EXEC_ROLES')
    const execBlock = src.slice(execIdx, execIdx + 600)
    expect(execBlock).toContain("'regional_manager'")
  })

  it('general_manager is allowed through Executive BI route', async () => {
    const src = await appSrc()
    const execIdx   = src.indexOf('const EXEC_ROLES')
    const execBlock = src.slice(execIdx, execIdx + 600)
    expect(execBlock).toContain("'general_manager'")
  })

  it('admin is still in EXEC_ROLES (regression guard)', async () => {
    const src = await appSrc()
    const execIdx   = src.indexOf('const EXEC_ROLES')
    const execBlock = src.slice(execIdx, execIdx + 600)
    expect(execBlock).toContain("'admin'")
  })

  it('manager is still in EXEC_ROLES (regression guard)', async () => {
    const src = await appSrc()
    const execIdx   = src.indexOf('const EXEC_ROLES')
    const execBlock = src.slice(execIdx, execIdx + 600)
    expect(execBlock).toContain("'manager'")
  })
})

// ════════════════════════════════════════════════════════════
// 3. MGR_UP — branch intelligence / team / targets routes
// ════════════════════════════════════════════════════════════

describe('Phase 1A — MGR_UP includes hierarchy roles', () => {
  it('district_supervisor is in MGR_UP', async () => {
    const src = await appSrc()
    const mgrIdx   = src.indexOf('const MGR_UP')
    const mgrBlock = src.slice(mgrIdx, mgrIdx + 600)
    expect(mgrBlock).toContain("'district_supervisor'")
  })

  it('regional_manager is in MGR_UP', async () => {
    const src = await appSrc()
    const mgrIdx   = src.indexOf('const MGR_UP')
    const mgrBlock = src.slice(mgrIdx, mgrIdx + 600)
    expect(mgrBlock).toContain("'regional_manager'")
  })

  it('general_manager is in MGR_UP', async () => {
    const src = await appSrc()
    const mgrIdx   = src.indexOf('const MGR_UP')
    const mgrBlock = src.slice(mgrIdx, mgrIdx + 600)
    expect(mgrBlock).toContain("'general_manager'")
  })

  it('admin and manager still in MGR_UP (regression guard)', async () => {
    const src = await appSrc()
    const mgrIdx   = src.indexOf('const MGR_UP')
    const mgrBlock = src.slice(mgrIdx, mgrIdx + 600)
    expect(mgrBlock).toContain("'admin'")
    expect(mgrBlock).toContain("'manager'")
    expect(mgrBlock).toContain("'branch_manager'")
  })
})

// ════════════════════════════════════════════════════════════
// 4. ALL — pharmacist intelligence and shared routes
// ════════════════════════════════════════════════════════════

describe('Phase 1A — ALL array includes general_manager', () => {
  it('general_manager is in ALL', async () => {
    const src = await appSrc()
    const allIdx   = src.indexOf("const ALL")
    const allBlock = src.slice(allIdx, allIdx + 200)
    expect(allBlock).toContain("'general_manager'")
  })

  it('pharmacist is still in ALL (regression guard)', async () => {
    const src = await appSrc()
    const allIdx   = src.indexOf("const ALL")
    const allBlock = src.slice(allIdx, allIdx + 200)
    expect(allBlock).toContain("'pharmacist'")
  })
})

// ════════════════════════════════════════════════════════════
// 5. ADMIN array — pharmacist and hierarchy roles cannot reach admin-only pages
// ════════════════════════════════════════════════════════════

describe('Phase 1A — ADMIN array unchanged (pharmacist/hierarchy blocked)', () => {
  it('ADMIN array contains only admin', async () => {
    const src = await appSrc()
    const adminIdx   = src.indexOf("const ADMIN")
    const adminBlock = src.slice(adminIdx, adminIdx + 60)
    expect(adminBlock).toContain("['admin']")
  })

  it('pharmacist is not in ADMIN (cannot reach /users or /pharmacies)', async () => {
    const src = await appSrc()
    const adminIdx   = src.indexOf("const ADMIN")
    const adminBlock = src.slice(adminIdx, adminIdx + 60)
    expect(adminBlock).not.toContain("'pharmacist'")
  })

  it('general_manager is not in ADMIN (cannot manage users/pharmacies)', async () => {
    const src = await appSrc()
    const adminIdx   = src.indexOf("const ADMIN")
    const adminBlock = src.slice(adminIdx, adminIdx + 60)
    expect(adminBlock).not.toContain("'general_manager'")
  })

  it('district_supervisor is not in ADMIN', async () => {
    const src = await appSrc()
    const adminIdx   = src.indexOf("const ADMIN")
    const adminBlock = src.slice(adminIdx, adminIdx + 60)
    expect(adminBlock).not.toContain("'district_supervisor'")
  })
})

// ════════════════════════════════════════════════════════════
// 6. pharmacist cannot access manager-only pages (regression)
// ════════════════════════════════════════════════════════════

describe('Phase 1A — pharmacist still blocked from manager pages (regression)', () => {
  it('/team route still uses MGR_UP (pharmacist excluded)', async () => {
    const src = await appSrc()
    expect(src).toContain('path="/team"')
    const teamIdx   = src.indexOf('path="/team"')
    const teamBlock = src.slice(teamIdx - 20, teamIdx + 80)
    expect(teamBlock).toContain('roles={MGR_UP}')
  })

  it('/branch/:id/intelligence route still uses MGR_UP', async () => {
    const src = await appSrc()
    expect(src).toContain('path="/branch/:branchId/intelligence"')
    const branchIdx   = src.indexOf('path="/branch/:branchId/intelligence"')
    const branchBlock = src.slice(branchIdx - 20, branchIdx + 80)
    expect(branchBlock).toContain('roles={MGR_UP}')
  })

  it('/my-intelligence route still restricts to pharmacist only', async () => {
    const src = await appSrc()
    const myIntelIdx   = src.indexOf('my-intelligence')
    const myIntelBlock = src.slice(myIntelIdx - 10, myIntelIdx + 100)
    expect(myIntelBlock).toContain("'pharmacist'")
  })

  it('/executive route still uses EXEC_ROLES (not ADMIN)', async () => {
    const src = await appSrc()
    const execRouteIdx   = src.indexOf('path="/executive"')
    const execRouteBlock = src.slice(execRouteIdx - 20, execRouteIdx + 80)
    expect(execRouteBlock).toContain('roles={EXEC_ROLES}')
  })
})
