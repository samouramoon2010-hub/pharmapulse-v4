// ============================================================
// RBAC Phase 0 Regression Tests
//
// Covers all 7 test categories from the implementation plan:
//
//   A. manager alias — no regression (existing users unchanged)
//   B. branch_manager alias equivalence (same access as manager)
//   C. pharmacist access unchanged
//   D. admin access unchanged
//   E. new roles recognised but inert (no unexpected access)
//   F. user document schema — new fields safe
//   G. Firestore isMgr includes branch_manager
// ============================================================

import { describe, it, expect } from 'vitest'

// ── Import the changed modules ────────────────────────────────
import {
  ROLES, ROLE_LABELS, ROLE_COLORS, PERMISSIONS, can,
} from '../../constants/index.js'

import {
  effectiveRole, isAdmin, isManager, isBranchManager,
  isSupervisor, isRegionalManager, isAny,
  guardAdmin, guardManager, guardPharmacyAccess,
  guardKpiEntryWrite, guardTargetWrite,
} from '../../services/security/accessGuard'

import type { GuardContext } from '../../services/security/accessGuard'

// ── Fixtures ──────────────────────────────────────────────────

const ctx = (role: string, pharmacyId: string | null = 'ph-001'): GuardContext =>
  ({ uid: `uid-${role}`, role: role as GuardContext['role'], pharmacyId })

const ADMIN       = ctx('admin',               null)
const MANAGER     = ctx('manager',             'ph-001')
const BRANCH_MGR  = ctx('branch_manager',      'ph-001')
const DISTRICT    = ctx('district_supervisor', null)
const REGIONAL    = ctx('regional_manager',    null)
const PHARMACIST  = ctx('pharmacist',          'ph-001')

// ── A: manager alias — no regression ─────────────────────────

describe('Category A — manager alias: existing behaviour preserved', () => {
  it('isAdmin returns false for manager', () => {
    expect(isAdmin(MANAGER)).toBe(false)
  })

  it('isManager returns true for manager', () => {
    expect(isManager(MANAGER)).toBe(true)
  })

  it('guardManager allows manager', () => {
    expect(guardManager(MANAGER).allowed).toBe(true)
  })

  it('guardAdmin denies manager', () => {
    expect(guardAdmin(MANAGER).allowed).toBe(false)
  })

  it('guardPharmacyAccess allows manager for their own pharmacy', () => {
    expect(guardPharmacyAccess(MANAGER, 'ph-001').allowed).toBe(true)
  })

  it('guardPharmacyAccess denies manager for another pharmacy', () => {
    expect(guardPharmacyAccess(MANAGER, 'ph-999').allowed).toBe(false)
  })

  it('guardTargetWrite allows manager for their own pharmacy', () => {
    expect(guardTargetWrite(MANAGER, { pharmacyId: 'ph-001' }).allowed).toBe(true)
  })

  it('PERMISSIONS.VIEW_OWN_BRANCH includes manager', () => {
    expect(can('manager', 'VIEW_OWN_BRANCH')).toBe(true)
  })

  it('PERMISSIONS.MANAGE_TARGETS includes manager', () => {
    expect(can('manager', 'MANAGE_TARGETS')).toBe(true)
  })

  it('PERMISSIONS.MANAGE_USERS does NOT include manager', () => {
    expect(can('manager', 'MANAGE_USERS')).toBe(false)
  })

  it('PERMISSIONS.VIEW_AUDIT_LOGS does NOT include manager', () => {
    expect(can('manager', 'VIEW_AUDIT_LOGS')).toBe(false)
  })

  it('effectiveRole normalises manager to branch_manager', () => {
    expect(effectiveRole(MANAGER)).toBe('branch_manager')
  })
})

// ── B: branch_manager alias equivalence ─────────────────────

describe('Category B — branch_manager: same access as manager', () => {
  it('isAdmin returns false for branch_manager', () => {
    expect(isAdmin(BRANCH_MGR)).toBe(false)
  })

  it('isManager returns true for branch_manager', () => {
    expect(isManager(BRANCH_MGR)).toBe(true)
  })

  it('isBranchManager returns true for branch_manager', () => {
    expect(isBranchManager(BRANCH_MGR)).toBe(true)
  })

  it('isBranchManager returns true for manager (alias)', () => {
    expect(isBranchManager(MANAGER)).toBe(true)
  })

  it('guardManager allows branch_manager', () => {
    expect(guardManager(BRANCH_MGR).allowed).toBe(true)
  })

  it('guardAdmin denies branch_manager', () => {
    expect(guardAdmin(BRANCH_MGR).allowed).toBe(false)
  })

  it('guardPharmacyAccess allows branch_manager for their own pharmacy', () => {
    expect(guardPharmacyAccess(BRANCH_MGR, 'ph-001').allowed).toBe(true)
  })

  it('guardPharmacyAccess denies branch_manager for another pharmacy', () => {
    expect(guardPharmacyAccess(BRANCH_MGR, 'ph-999').allowed).toBe(false)
  })

  it('guardTargetWrite allows branch_manager for their pharmacy', () => {
    expect(guardTargetWrite(BRANCH_MGR, { pharmacyId: 'ph-001' }).allowed).toBe(true)
  })

  it('guardKpiEntryWrite allows branch_manager submitting for their pharmacy', () => {
    const result = guardKpiEntryWrite(BRANCH_MGR, {
      userId:     `uid-branch_manager`,
      pharmacyId: 'ph-001',
      date:       '2025-05-15',
    })
    expect(result.allowed).toBe(true)
  })

  it('PERMISSIONS.VIEW_OWN_BRANCH includes branch_manager', () => {
    expect(can('branch_manager', 'VIEW_OWN_BRANCH')).toBe(true)
  })

  it('PERMISSIONS.MANAGE_TARGETS includes branch_manager', () => {
    expect(can('branch_manager', 'MANAGE_TARGETS')).toBe(true)
  })

  it('PERMISSIONS.IMPORT_EXCEL includes branch_manager', () => {
    expect(can('branch_manager', 'IMPORT_EXCEL')).toBe(true)
  })

  it('PERMISSIONS.APPROVE_KPI includes branch_manager', () => {
    expect(can('branch_manager', 'APPROVE_KPI')).toBe(true)
  })

  it('PERMISSIONS.MANAGE_USERS does NOT include branch_manager', () => {
    expect(can('branch_manager', 'MANAGE_USERS')).toBe(false)
  })

  it('PERMISSIONS.VIEW_AUDIT_LOGS does NOT include branch_manager', () => {
    expect(can('branch_manager', 'VIEW_AUDIT_LOGS')).toBe(false)
  })

  it('effectiveRole normalises branch_manager to branch_manager', () => {
    expect(effectiveRole(BRANCH_MGR)).toBe('branch_manager')
  })

  // Symmetry: branch_manager and manager have identical permission set
  const managerPermissions = Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]
  managerPermissions.forEach((perm) => {
    it(`PERMISSIONS.${perm}: branch_manager matches manager`, () => {
      const managerHas      = can('manager',       perm)
      const branchMgrHas    = can('branch_manager', perm)
      expect(branchMgrHas).toBe(managerHas)
    })
  })
})

// ── C: pharmacist unchanged ───────────────────────────────────

describe('Category C — pharmacist: access unchanged', () => {
  it('isAdmin returns false for pharmacist', () => {
    expect(isAdmin(PHARMACIST)).toBe(false)
  })

  it('isManager returns false for pharmacist', () => {
    expect(isManager(PHARMACIST)).toBe(false)
  })

  it('isBranchManager returns false for pharmacist', () => {
    expect(isBranchManager(PHARMACIST)).toBe(false)
  })

  it('guardManager denies pharmacist', () => {
    expect(guardManager(PHARMACIST).allowed).toBe(false)
  })

  it('guardAdmin denies pharmacist', () => {
    expect(guardAdmin(PHARMACIST).allowed).toBe(false)
  })

  it('PERMISSIONS.VIEW_KPI_ENTRIES includes pharmacist', () => {
    expect(can('pharmacist', 'VIEW_KPI_ENTRIES')).toBe(true)
  })

  it('PERMISSIONS.VIEW_OWN_BRANCH does NOT include pharmacist', () => {
    expect(can('pharmacist', 'VIEW_OWN_BRANCH')).toBe(false)
  })

  it('PERMISSIONS.MANAGE_TARGETS does NOT include pharmacist', () => {
    expect(can('pharmacist', 'MANAGE_TARGETS')).toBe(false)
  })

  it('PERMISSIONS.IMPORT_EXCEL does NOT include pharmacist', () => {
    expect(can('pharmacist', 'IMPORT_EXCEL')).toBe(false)
  })

  it('effectiveRole returns pharmacist unchanged', () => {
    expect(effectiveRole(PHARMACIST)).toBe('pharmacist')
  })
})

// ── D: admin unchanged ────────────────────────────────────────

describe('Category D — admin: access unchanged', () => {
  it('isAdmin returns true for admin', () => {
    expect(isAdmin(ADMIN)).toBe(true)
  })

  it('isManager returns true for admin (admin is superset)', () => {
    expect(isManager(ADMIN)).toBe(true)
  })

  it('guardAdmin allows admin', () => {
    expect(guardAdmin(ADMIN).allowed).toBe(true)
  })

  it('guardManager allows admin', () => {
    expect(guardManager(ADMIN).allowed).toBe(true)
  })

  it('guardPharmacyAccess allows admin for any pharmacy', () => {
    expect(guardPharmacyAccess(ADMIN, 'ph-001').allowed).toBe(true)
    expect(guardPharmacyAccess(ADMIN, 'ph-999').allowed).toBe(true)
  })

  it('PERMISSIONS.VIEW_ALL_BRANCHES includes only admin', () => {
    expect(can('admin',       'VIEW_ALL_BRANCHES')).toBe(true)
    expect(can('manager',     'VIEW_ALL_BRANCHES')).toBe(false)
    expect(can('pharmacist',  'VIEW_ALL_BRANCHES')).toBe(false)
    expect(can('branch_manager', 'VIEW_ALL_BRANCHES')).toBe(false)
  })

  it('PERMISSIONS.MANAGE_USERS includes only admin', () => {
    expect(can('admin', 'MANAGE_USERS')).toBe(true)
    expect(can('manager', 'MANAGE_USERS')).toBe(false)
  })

  it('effectiveRole returns admin unchanged', () => {
    expect(effectiveRole(ADMIN)).toBe('admin')
  })
})

// ── E: new roles recognised but inert ────────────────────────

describe('Category E — new roles: recognised but inert in Phase 0', () => {
  // district_supervisor
  it('isSupervisor returns true for district_supervisor', () => {
    expect(isSupervisor(DISTRICT)).toBe(true)
  })

  it('isSupervisor returns false for all other roles', () => {
    expect(isSupervisor(ADMIN)).toBe(false)
    expect(isSupervisor(MANAGER)).toBe(false)
    expect(isSupervisor(BRANCH_MGR)).toBe(false)
    expect(isSupervisor(REGIONAL)).toBe(false)
    expect(isSupervisor(PHARMACIST)).toBe(false)
  })

  it('isManager returns false for district_supervisor (not yet elevated)', () => {
    expect(isManager(DISTRICT)).toBe(false)
  })

  it('guardManager denies district_supervisor in Phase 0', () => {
    expect(guardManager(DISTRICT).allowed).toBe(false)
  })

  it('guardAdmin denies district_supervisor', () => {
    expect(guardAdmin(DISTRICT).allowed).toBe(false)
  })

  it('PERMISSIONS.VIEW_OWN_BRANCH does NOT include district_supervisor yet', () => {
    expect(can('district_supervisor', 'VIEW_OWN_BRANCH')).toBe(false)
  })

  it('PERMISSIONS.MANAGE_TARGETS does NOT include district_supervisor yet', () => {
    expect(can('district_supervisor', 'MANAGE_TARGETS')).toBe(false)
  })

  // regional_manager
  it('isRegionalManager returns true for regional_manager', () => {
    expect(isRegionalManager(REGIONAL)).toBe(true)
  })

  it('isRegionalManager returns false for all other roles', () => {
    expect(isRegionalManager(ADMIN)).toBe(false)
    expect(isRegionalManager(MANAGER)).toBe(false)
    expect(isRegionalManager(BRANCH_MGR)).toBe(false)
    expect(isRegionalManager(DISTRICT)).toBe(false)
    expect(isRegionalManager(PHARMACIST)).toBe(false)
  })

  it('isManager returns false for regional_manager (not yet elevated)', () => {
    expect(isManager(REGIONAL)).toBe(false)
  })

  it('guardManager denies regional_manager in Phase 0', () => {
    expect(guardManager(REGIONAL).allowed).toBe(false)
  })

  it('PERMISSIONS.VIEW_REGIONAL_INTELLIGENCE limited to admin only in Phase 0', () => {
    expect(can('admin',               'VIEW_REGIONAL_INTELLIGENCE')).toBe(true)
    expect(can('regional_manager',    'VIEW_REGIONAL_INTELLIGENCE')).toBe(false)
    expect(can('district_supervisor', 'VIEW_REGIONAL_INTELLIGENCE')).toBe(false)
  })

  it('PERMISSIONS.VIEW_DISTRICT_INTELLIGENCE limited to admin only in Phase 0', () => {
    expect(can('admin',               'VIEW_DISTRICT_INTELLIGENCE')).toBe(true)
    expect(can('district_supervisor', 'VIEW_DISTRICT_INTELLIGENCE')).toBe(false)
  })

  // ROLE constants are present
  it('ROLES.BRANCH_MANAGER equals branch_manager', () => {
    expect(ROLES.BRANCH_MANAGER).toBe('branch_manager')
  })

  it('ROLES.DISTRICT_SUPERVISOR equals district_supervisor', () => {
    expect(ROLES.DISTRICT_SUPERVISOR).toBe('district_supervisor')
  })

  it('ROLES.REGIONAL_MANAGER equals regional_manager', () => {
    expect(ROLES.REGIONAL_MANAGER).toBe('regional_manager')
  })

  // ROLE_LABELS present for all new roles
  it('ROLE_LABELS has entry for branch_manager', () => {
    expect(ROLE_LABELS.branch_manager).toBeDefined()
    expect(typeof ROLE_LABELS.branch_manager).toBe('string')
  })

  it('ROLE_LABELS has entry for district_supervisor', () => {
    expect(ROLE_LABELS.district_supervisor).toBeDefined()
  })

  it('ROLE_LABELS has entry for regional_manager', () => {
    expect(ROLE_LABELS.regional_manager).toBeDefined()
  })

  // ROLE_COLORS present for all new roles
  it('ROLE_COLORS has entry for branch_manager', () => {
    expect(ROLE_COLORS.branch_manager).toBeDefined()
    expect(ROLE_COLORS.branch_manager.text).toBeDefined()
  })

  it('ROLE_COLORS has entry for district_supervisor', () => {
    expect(ROLE_COLORS.district_supervisor).toBeDefined()
  })

  it('ROLE_COLORS has entry for regional_manager', () => {
    expect(ROLE_COLORS.regional_manager).toBeDefined()
  })

  it('effectiveRole does NOT normalise district_supervisor', () => {
    expect(effectiveRole(DISTRICT)).toBe('district_supervisor')
  })

  it('effectiveRole does NOT normalise regional_manager', () => {
    expect(effectiveRole(REGIONAL)).toBe('regional_manager')
  })
})

// ── F: user document schema — Phase 0 fields safe ─────────────

describe('Category F — Phase 0 user document schema fields', () => {

  // computeInitialScopes logic — mirrored here for pure unit testing
  function computeInitialScopes(role: string, pharmacyId: string | null): string[] {
    if (role === 'admin') return ['tenant:default']
    if (pharmacyId)       return [`store:${pharmacyId}`]
    return []
  }

  it('pharmacist with pharmacyId gets store scope', () => {
    expect(computeInitialScopes('pharmacist', 'ph-001')).toEqual(['store:ph-001'])
  })

  it('manager with pharmacyId gets store scope', () => {
    expect(computeInitialScopes('manager', 'ph-001')).toEqual(['store:ph-001'])
  })

  it('branch_manager with pharmacyId gets store scope', () => {
    expect(computeInitialScopes('branch_manager', 'ph-001')).toEqual(['store:ph-001'])
  })

  it('admin gets tenant scope regardless of pharmacyId', () => {
    expect(computeInitialScopes('admin', null)).toEqual(['tenant:default'])
    expect(computeInitialScopes('admin', 'ph-001')).toEqual(['tenant:default'])
  })

  it('district_supervisor with no pharmacyId gets empty scopes', () => {
    expect(computeInitialScopes('district_supervisor', null)).toEqual([])
  })

  it('regional_manager with no pharmacyId gets empty scopes', () => {
    expect(computeInitialScopes('regional_manager', null)).toEqual([])
  })

  it('user without pharmacyId and non-admin role gets empty scopes', () => {
    expect(computeInitialScopes('pharmacist', null)).toEqual([])
  })

  // Default values for missing fields (backward compat with old documents)
  it('missing tenantId treated as default in resolveTenantContext', async () => {
    const { resolveTenantContext, DEFAULT_TENANT_ID } = await import('../../services/security/tenantContext')
    // Old document with no tenantId field
    const result = resolveTenantContext({ uid: 'old-user' })
    expect(result.tenantId).toBe(DEFAULT_TENANT_ID)
  })

  it('resolveTenantContext returns default when userProfile is null', async () => {
    const { resolveTenantContext, DEFAULT_TENANT_ID } = await import('../../services/security/tenantContext')
    const result = resolveTenantContext(null)
    expect(result.tenantId).toBe(DEFAULT_TENANT_ID)
  })

  it('resolveTenantContext reads explicit tenantId when present', async () => {
    const { resolveTenantContext } = await import('../../services/security/tenantContext')
    const result = resolveTenantContext({ uid: 'u1', tenantId: 'acme-pharma' })
    expect(result.tenantId).toBe('acme-pharma')
  })

  it('scope format uses colon separator (type:identifier)', () => {
    const scopes = computeInitialScopes('pharmacist', 'ph-001')
    expect(scopes[0]).toMatch(/^[a-z]+:[a-z0-9-]+$/)
  })

  it('store scope encodes the pharmacyId exactly', () => {
    const scopes = computeInitialScopes('manager', 'pharmacy-abc-123')
    expect(scopes[0]).toBe('store:pharmacy-abc-123')
  })

  it('accessScopes is advisory — not enforced in Phase 0 (no guard reads it)', () => {
    // Verify that none of the existing guards consume accessScopes
    // by checking they return ALLOW based only on role/uid/pharmacyId
    const ctxWithScopes = {
      uid:         'test-uid',
      role:        'pharmacist' as const,
      pharmacyId:  'ph-001',
      accessScopes: ['store:ph-999'], // different pharmacy in scopes — must not affect guards
    }
    // guardPharmacyAccess must use pharmacyId from GuardContext, not accessScopes
    const result = guardPharmacyAccess(ctxWithScopes as GuardContext, 'ph-001')
    expect(result.allowed).toBe(true)
  })
})

// ── G: Firestore isMgr rule logic ────────────────────────────

describe('Category G — Firestore isMgr rule logic simulation', () => {
  // Simulate the Firestore rule function isMgr()
  function isMgr(role: string): boolean {
    return ['admin', 'manager', 'branch_manager'].includes(role)
  }

  // Simulate isAnyMgr() — defined but unused in Phase 0
  function isAnyMgr(role: string): boolean {
    return ['admin', 'manager', 'branch_manager',
            'district_supervisor', 'regional_manager'].includes(role)
  }

  it('isMgr: admin returns true', () => {
    expect(isMgr('admin')).toBe(true)
  })

  it('isMgr: manager returns true (unchanged from before Phase 0)', () => {
    expect(isMgr('manager')).toBe(true)
  })

  it('isMgr: branch_manager returns true (Phase 0 addition)', () => {
    expect(isMgr('branch_manager')).toBe(true)
  })

  it('isMgr: pharmacist returns false', () => {
    expect(isMgr('pharmacist')).toBe(false)
  })

  it('isMgr: district_supervisor returns false (Phase 0: inert)', () => {
    expect(isMgr('district_supervisor')).toBe(false)
  })

  it('isMgr: regional_manager returns false (Phase 0: inert)', () => {
    expect(isMgr('regional_manager')).toBe(false)
  })

  // isAnyMgr is defined but not yet used — future guard hook
  it('isAnyMgr includes district_supervisor and regional_manager', () => {
    expect(isAnyMgr('district_supervisor')).toBe(true)
    expect(isAnyMgr('regional_manager')).toBe(true)
  })

  it('isAnyMgr also includes all isMgr roles', () => {
    expect(isAnyMgr('admin')).toBe(true)
    expect(isAnyMgr('manager')).toBe(true)
    expect(isAnyMgr('branch_manager')).toBe(true)
  })

  it('isAnyMgr excludes pharmacist', () => {
    expect(isAnyMgr('pharmacist')).toBe(false)
  })

  it('firestore.rules source contains branch_manager in isMgr', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain("role() in ['admin','manager','branch_manager']")
  })

  it('firestore.rules source contains isAnyMgr helper function', async () => {
    const src = await import('../../../firestore.rules?raw')
    expect(src.default).toContain('isAnyMgr')
  })
})

// ── Route guard arrays verification ──────────────────────────

describe('Route guard arrays — source text verification', () => {
  it('App.jsx MGR_UP includes branch_manager', async () => {
    const src = await import('../../App.jsx?raw')
    expect(src.default).toContain("'admin','manager','branch_manager'")
  })

  it('App.jsx MGR_UP does NOT include district_supervisor', async () => {
    const src = await import('../../App.jsx?raw')
    const mgrUpLine = src.default.split('\n').find(l => l.includes('MGR_UP ='))
    expect(mgrUpLine).not.toContain('district_supervisor')
  })

  it('App.jsx MGR_UP does NOT include regional_manager', async () => {
    const src = await import('../../App.jsx?raw')
    const mgrUpLine = src.default.split('\n').find(l => l.includes('MGR_UP ='))
    expect(mgrUpLine).not.toContain('regional_manager')
  })

  it('Sidebar resolveNav maps branch_manager to manager nav (alias restored — forward-compat)', async () => {
    const src = await import('../../components/layout/Sidebar.jsx?raw')
    // Phase A correction: branch_manager alias is restored. Executive BI is added
    // to manager nav directly (manager is the active production role). branch_manager
    // is not an active production role — it inherits manager nav via alias.
    expect(src.default).toContain('NAV_CONFIG.branch_manager = NAV_CONFIG.manager')
    // manager nav must now contain Executive BI (Phase A goal)
    const managerBlock = src.default
      .split('manager: [')[1]?.split('pharmacist: [')[0] ?? ''
    expect(managerBlock).toContain("path: '/executive'")
  })

  it('No supervisor/regional DASHBOARDS added (territory admin routes exist in Phase 1)', async () => {
    // Phase 0 assertion: no role-specific dashboards for new roles.
    // Phase 1 legitimately adds /admin/regions and /admin/districts (admin-only CRUD).
    // These are territory infrastructure pages, not dashboards for new roles.
    const src = await import('../../App.jsx?raw')
    // No supervisor dashboard
    expect(src.default).not.toContain('/supervisor')
    // No role-based regional dashboard
    expect(src.default).not.toContain('/regional-dashboard')
    expect(src.default).not.toContain('/regional-intelligence')
    // Territory admin routes (/admin/regions, /admin/districts) are expected in Phase 1
    // They are gated to ADMIN only — not accessible to new roles
  })
})
