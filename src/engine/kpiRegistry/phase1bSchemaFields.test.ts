// ============================================================
// Phase 1B-1 — Territory Cache Schema Regression Tests
//
// Verifies that:
//  - UserTerritoryFields exposes assignedPharmacyIds and assignedDistrictIds
//  - createUser() accepts and defaults the two new cache fields
//  - Existing users without these fields remain valid
//  - updateUserProfile() does not require these fields
//  - No sync logic, UI, backfill, or scope resolver code is present
//
// Source-level tests — no DOM rendering required.
// ============================================================

import { describe, it, expect } from 'vitest'

async function territorySrc(): Promise<string> {
  return (await import('../../services/territoryTypes.ts?raw')).default
}

async function userServiceSrc(): Promise<string> {
  return (await import('../../services/userService.js?raw')).default
}

// ════════════════════════════════════════════════════════════
// 1. UserTerritoryFields type shape
// ════════════════════════════════════════════════════════════

describe('Phase 1B-1 — UserTerritoryFields schema', () => {
  it('UserTerritoryFields contains assignedPharmacyIds', async () => {
    const src = await territorySrc()
    const idx = src.indexOf('UserTerritoryFields')
    const block = src.slice(idx, idx + 600)
    expect(block).toContain('assignedPharmacyIds')
  })

  it('assignedPharmacyIds is typed as string[] | null (optional)', async () => {
    const src = await territorySrc()
    expect(src).toContain('assignedPharmacyIds?: string[] | null')
  })

  it('UserTerritoryFields contains assignedDistrictIds', async () => {
    const src = await territorySrc()
    const idx = src.indexOf('UserTerritoryFields')
    const block = src.slice(idx, idx + 900)
    expect(block).toContain('assignedDistrictIds')
  })

  it('assignedDistrictIds is typed as string[] (optional)', async () => {
    const src = await territorySrc()
    expect(src).toContain('assignedDistrictIds?: string[]')
  })

  it('existing fields districtId and regionIds are still present (regression guard)', async () => {
    const src = await territorySrc()
    const idx = src.indexOf('UserTerritoryFields')
    const block = src.slice(idx, idx + 600)
    expect(block).toContain('districtId?')
    expect(block).toContain('regionIds?')
  })
})

// ════════════════════════════════════════════════════════════
// 2. createUser() signature and defaults
// ════════════════════════════════════════════════════════════

describe('Phase 1B-1 — createUser supports assignedPharmacyIds', () => {
  it('createUser destructures assignedPharmacyIds parameter', async () => {
    const src = await userServiceSrc()
    const fnIdx = src.indexOf('export async function createUser(')
    const block = src.slice(fnIdx, fnIdx + 800)
    expect(block).toContain('assignedPharmacyIds')
  })

  it('createUser defaults assignedPharmacyIds to null', async () => {
    const src = await userServiceSrc()
    const fnIdx = src.indexOf('export async function createUser(')
    const block = src.slice(fnIdx, fnIdx + 800)
    expect(block).toContain('assignedPharmacyIds = null')
  })

  it('createUser defaults assignedDistrictIds to []', async () => {
    const src = await userServiceSrc()
    const fnIdx = src.indexOf('export async function createUser(')
    const block = src.slice(fnIdx, fnIdx + 800)
    expect(block).toContain('assignedDistrictIds = []')
  })

  it('createUser writes assignedPharmacyIds to the Firestore profile', async () => {
    const src = await userServiceSrc()
    const profileIdx = src.indexOf('const profile = clean(')
    const profileBlock = src.slice(profileIdx, profileIdx + 1400)
    expect(profileBlock).toContain('assignedPharmacyIds')
  })

  it('createUser writes assignedDistrictIds to the Firestore profile', async () => {
    const src = await userServiceSrc()
    const profileIdx = src.indexOf('const profile = clean(')
    const profileBlock = src.slice(profileIdx, profileIdx + 1400)
    expect(profileBlock).toContain('assignedDistrictIds')
  })
})

// ════════════════════════════════════════════════════════════
// 3. Backward compatibility
// ════════════════════════════════════════════════════════════

describe('Phase 1B-1 — backward compatibility for existing user documents', () => {
  it('existing createUser parameters (districtId, regionIds) still present', async () => {
    const src = await userServiceSrc()
    const fnIdx = src.indexOf('export async function createUser(')
    const block = src.slice(fnIdx, fnIdx + 800)
    expect(block).toContain('districtId = null')
    expect(block).toContain('regionIds = null')
  })

  it('updateUserProfile does not require assignedPharmacyIds (generic update)', async () => {
    const src = await userServiceSrc()
    const fnIdx = src.indexOf('export async function updateUserProfile(')
    // Check the function SIGNATURE only (first 100 chars) — it has no assignedPharmacyIds param.
    // 3A-1C2 added a territory guard that references assignedPharmacyIds internally, but the
    // function signature remains generic (uid, data, actorId, actorRole).
    const fnSig = src.slice(fnIdx, fnIdx + 100)
    expect(fnSig).not.toContain('assignedPharmacyIds')
  })
})

// ════════════════════════════════════════════════════════════
// 4. No premature sync / scope resolver logic
// ════════════════════════════════════════════════════════════

describe('Phase 1B-1 — no sync logic introduced', () => {
  it('userService does not export recomputeAssignedPharmacyIds function (Phase 1B-3 only)', async () => {
    // Comments may reference the function name; check that no declaration exists
    const src = await userServiceSrc()
    expect(src).not.toContain('export async function recomputeAssignedPharmacyIds')
    expect(src).not.toContain('export function recomputeAssignedPharmacyIds')
  })

  it('userService does not export resolveAllowedPharmacyIds function (Phase 2 only)', async () => {
    const src = await userServiceSrc()
    expect(src).not.toContain('export async function resolveAllowedPharmacyIds')
    expect(src).not.toContain('export function resolveAllowedPharmacyIds')
  })

  it('territoryTypes does not declare scope resolver functions', async () => {
    const src = await territorySrc()
    // Comments may mention these names; check no function declarations are present
    expect(src).not.toContain('export function resolveAllowedPharmacyIds')
    expect(src).not.toContain('export async function recomputeAssignedPharmacyIds')
  })
})
