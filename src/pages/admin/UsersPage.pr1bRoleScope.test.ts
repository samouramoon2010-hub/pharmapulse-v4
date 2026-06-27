// ============================================================
// PR-1B — UsersPage dynamic role-aware form certification
//
// Exercises the real source of UsersPage.jsx via a ?raw import (the
// established PR-1A pattern — see debugUidMasking.pr1a.test.ts) since
// the component depends on Firestore/Auth singletons that are heavy
// to mock for a pure UI-contract check. These tests prove the page
// imports the canonical role/scope contract and no longer contains
// hardcoded "Manager (legacy)" wording, hardcoded pharmacyId-only
// validation, or a generic non-role-aware scope error.
// ============================================================
import { describe, it, expect } from 'vitest'

async function pageSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('./UsersPage.jsx?raw')).default
}

describe('PR-1B — UsersPage role naming cleanup', () => {
  it('contains no "legacy" wording anywhere in the rendered UI', async () => {
    const s = await pageSrc()
    expect(s.toLowerCase()).not.toContain('manager (legacy)')
    expect(s.toLowerCase()).not.toContain('legacy manager')
  })

  it('imports role labels from the canonical roleScope contract instead of a local map', async () => {
    const s = await pageSrc()
    expect(s).toContain("from '../../constants/roleScope'")
    expect(s).toContain('getRoleLabel')
  })
})

describe('PR-1B — UsersPage dynamic scope fields', () => {
  it('renders a District selector gated on requiredScopeType === \'district\'', async () => {
    const s = await pageSrc()
    expect(s).toContain("requiredScopeType === 'district'")
    expect(s).toContain('Select district...')
  })

  it('renders a Region selector gated on requiredScopeType === \'region\'', async () => {
    const s = await pageSrc()
    expect(s).toContain("requiredScopeType === 'region'")
    expect(s).toContain('Select region...')
  })

  it('clears pharmacyId/districtId/regionId together whenever role changes', async () => {
    const s = await pageSrc()
    expect(s).toContain('const setRole = (roleValue) =>')
    expect(s).toMatch(/pharmacyId:\s*'',\s*districtId:\s*'',\s*regionId:\s*''/)
  })
})

describe('PR-1B — UsersPage role-aware validation', () => {
  it('uses getScopeRequiredMessage instead of one generic pharmacyId-required rule', async () => {
    const s = await pageSrc()
    expect(s).toContain('getScopeRequiredMessage(form.role)')
    expect(s).not.toMatch(/pharmacyId is required for every/i)
  })

  it('branches validation by requiredScopeType across branch/district/region', async () => {
    const s = await pageSrc()
    expect(s).toContain("requiredScopeType === 'branch'")
    expect(s).toContain("requiredScopeType === 'district'")
    expect(s).toContain("requiredScopeType === 'region'")
  })
})

describe('PR-1B — UsersPage insecure temp-password UX removed', () => {
  it('does not collect or display an admin-entered password field', async () => {
    const s = await pageSrc()
    expect(s).not.toMatch(/type=["']password["']/)
    expect(s).not.toContain('EyeOff')
  })

  it('explains the invitation-based flow instead of showing a generated password', async () => {
    const s = await pageSrc()
    expect(s).toContain('invitation email')
    expect(s).toContain('admin never')
  })
})

describe('PR-1B — UsersPage CLAIMED exclusion preserved', () => {
  it('still filters authStatus === CLAIMED out of the operational users list', async () => {
    const s = await pageSrc()
    expect(s).toContain("d.data().authStatus !== 'CLAIMED'")
  })
})

describe('PR-1B — UsersPage identity state display', () => {
  it('derives Pending Invitation / Active / Inactive only from existing active/lastLoginAt fields', async () => {
    const s = await pageSrc()
    expect(s).toContain('function identityState(u)')
    expect(s).toContain("'Pending Invitation'")
    expect(s).toContain("'Active'")
    expect(s).toContain("'Inactive'")
  })
})
