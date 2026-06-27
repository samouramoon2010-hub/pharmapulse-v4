// ============================================================
// PR-1B — Canonical role/scope contract certification
// ============================================================
import { describe, it, expect } from 'vitest'
import {
  ROLE_METADATA, CREATABLE_ROLES, getRoleLabel, getRoleMeta,
  getRequiredScopeType, isOrgWideRole, getScopeRequiredMessage,
  getCanonicalRoleValue,
} from './roleScope'

describe('PR-1B — role label mapping', () => {
  it('maps every internal role value to a clean production label', () => {
    expect(getRoleLabel('admin')).toBe('Admin')
    expect(getRoleLabel('general_manager')).toBe('General Manager')
    expect(getRoleLabel('regional_manager')).toBe('Regional Manager')
    expect(getRoleLabel('district_supervisor')).toBe('District Supervisor')
    expect(getRoleLabel('branch_manager')).toBe('Branch Manager')
    expect(getRoleLabel('pharmacist')).toBe('Pharmacist')
  })

  it('legacy manager value never displays "legacy" wording', () => {
    const label = getRoleLabel('manager')
    expect(label).toBe('Branch Manager')
    expect(label.toLowerCase()).not.toContain('legacy')
  })

  it('unknown role falls back safely instead of throwing or rendering blank', () => {
    expect(getRoleLabel('totally_unknown_role')).toBe('totally_unknown_role')
    expect(getRoleLabel(undefined as unknown as string)).toBe('Unknown')
    expect(getRoleMeta('totally_unknown_role')).toBeNull()
  })

  it('role hierarchy metadata is internally consistent (higher level = broader authority)', () => {
    const byValue = Object.fromEntries(ROLE_METADATA.map((r) => [r.value, r]))
    expect(byValue.admin.level).toBeGreaterThan(byValue.general_manager.level)
    expect(byValue.general_manager.level).toBeGreaterThan(byValue.regional_manager.level)
    expect(byValue.regional_manager.level).toBeGreaterThan(byValue.district_supervisor.level)
    expect(byValue.district_supervisor.level).toBeGreaterThan(byValue.branch_manager.level)
    expect(byValue.branch_manager.level).toBeGreaterThan(byValue.pharmacist.level)
    expect(byValue.manager.level).toBe(byValue.branch_manager.level)
  })

  it('legacy alias is excluded from the creatable-role list shown in the New User form', () => {
    expect(CREATABLE_ROLES.find((r) => r.value === 'manager')).toBeUndefined()
    expect(CREATABLE_ROLES.find((r) => r.value === 'branch_manager')).toBeTruthy()
  })

  it('getCanonicalRoleValue groups the legacy alias under its production-equivalent role', () => {
    expect(getCanonicalRoleValue('manager')).toBe('branch_manager')
    expect(getCanonicalRoleValue('branch_manager')).toBe('branch_manager')
    expect(getCanonicalRoleValue('admin')).toBe('admin')
    expect(getCanonicalRoleValue('unknown_role')).toBe('unknown_role')
  })
})

describe('PR-1B — required scope type per role', () => {
  it('pharmacist and branch_manager require a branch', () => {
    expect(getRequiredScopeType('pharmacist')).toBe('branch')
    expect(getRequiredScopeType('branch_manager')).toBe('branch')
    expect(getRequiredScopeType('manager')).toBe('branch')
  })
  it('district_supervisor requires a district, not a branch', () => {
    expect(getRequiredScopeType('district_supervisor')).toBe('district')
  })
  it('regional_manager requires a region, not a branch', () => {
    expect(getRequiredScopeType('regional_manager')).toBe('region')
  })
  it('admin and general_manager require no scope assignment (organization-wide)', () => {
    expect(getRequiredScopeType('admin')).toBe('none')
    expect(getRequiredScopeType('general_manager')).toBe('none')
    expect(isOrgWideRole('admin')).toBe(true)
    expect(isOrgWideRole('general_manager')).toBe(true)
    expect(isOrgWideRole('regional_manager')).toBe(false)
  })
})

describe('PR-1B — role-specific validation messages never expose internal field names', () => {
  it('produces a human message naming the role, not the Firestore field', () => {
    expect(getScopeRequiredMessage('pharmacist')).toBe('Select a branch for this pharmacist.')
    expect(getScopeRequiredMessage('district_supervisor')).toBe('Select a district for this district supervisor.')
    expect(getScopeRequiredMessage('regional_manager')).toBe('Select a region for this regional manager.')
    for (const role of ['pharmacist', 'district_supervisor', 'regional_manager']) {
      expect(getScopeRequiredMessage(role)).not.toMatch(/pharmacyId|districtId|regionId/i)
    }
  })
  it('returns null for roles that require no scope', () => {
    expect(getScopeRequiredMessage('admin')).toBeNull()
    expect(getScopeRequiredMessage('general_manager')).toBeNull()
  })
})
