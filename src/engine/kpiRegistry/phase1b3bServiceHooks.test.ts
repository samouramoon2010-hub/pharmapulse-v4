// ============================================================
// Phase 1B-3B — Service Hook Regression Tests
//
// Verifies that districtService and userService correctly wire
// recomputeAssignedPharmacyIds into the right event hooks:
//
//  districtService.updateDistrict:
//   - imports recomputeAssignedPharmacyIds from territorySync
//   - detects supervisorUid change and recomputes old + new supervisor
//   - skips recompute when supervisorUid is unchanged
//   - detects regionId change and updates pharmacy.regionId (data integrity)
//
//  userService.updateUserProfile:
//   - imports recomputeAssignedPharmacyIds from territorySync
//   - detects role / districtId / regionIds changes and triggers recompute
//   - skips recompute for unrelated field updates
//
//  Both services:
//   - catch recompute errors — do not block primary operation
//   - contain no Backfill, Scope Resolver, updateRegion, or pharmacy wiring
//
// Source-level tests — no DOM rendering required.
// ============================================================

import { describe, it, expect } from 'vitest'

async function dsSrc(): Promise<string> {
  return (await import('../../services/districtService.ts?raw')).default
}

async function usSrc(): Promise<string> {
  return (await import('../../services/userService.js?raw')).default
}

// ════════════════════════════════════════════════════════════
// 1. districtService imports recomputeAssignedPharmacyIds
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — districtService imports territorySync', () => {
  it('imports recomputeAssignedPharmacyIds', async () => {
    const src = await dsSrc()
    expect(src).toContain('recomputeAssignedPharmacyIds')
  })

  it("imports from './territorySync'", async () => {
    const src     = await dsSrc()
    const impIdx  = src.indexOf('recomputeAssignedPharmacyIds')
    expect(impIdx).toBeGreaterThan(-1)
    // The import line should appear before the first export function
    const firstExportIdx = src.indexOf('\nexport ')
    expect(impIdx).toBeLessThan(firstExportIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 2. updateDistrict detects supervisorUid change
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — updateDistrict supervisorUid change detection', () => {
  it("checks 'supervisorUid' in data to detect the field being updated", async () => {
    const src = await dsSrc()
    expect(src).toContain("'supervisorUid' in data")
  })

  it('reads oldSupervisorUid from before state', async () => {
    const src        = await dsSrc()
    const updateIdx  = src.indexOf('export async function updateDistrict')
    const nextExport = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody     = src.slice(updateIdx, nextExport)
    expect(fnBody).toContain('oldSupervisorUid')
  })

  it('computes newSupervisorUid from data or before fallback', async () => {
    const src        = await dsSrc()
    const updateIdx  = src.indexOf('export async function updateDistrict')
    const nextExport = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody     = src.slice(updateIdx, nextExport)
    expect(fnBody).toContain('newSupervisorUid')
  })
})

// ════════════════════════════════════════════════════════════
// 3. updateDistrict recomputes old supervisor
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — updateDistrict recomputes old supervisor', () => {
  it('calls recomputeAssignedPharmacyIds with oldSupervisorUid', async () => {
    const src        = await dsSrc()
    const updateIdx  = src.indexOf('export async function updateDistrict')
    const nextExport = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody     = src.slice(updateIdx, nextExport)
    expect(fnBody).toContain('recomputeAssignedPharmacyIds(oldSupervisorUid')
  })
})

// ════════════════════════════════════════════════════════════
// 4. updateDistrict recomputes new supervisor
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — updateDistrict recomputes new supervisor', () => {
  it('calls recomputeAssignedPharmacyIds with newSupervisorUid', async () => {
    const src        = await dsSrc()
    const updateIdx  = src.indexOf('export async function updateDistrict')
    const nextExport = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody     = src.slice(updateIdx, nextExport)
    expect(fnBody).toContain('recomputeAssignedPharmacyIds(newSupervisorUid')
  })
})

// ════════════════════════════════════════════════════════════
// 5. updateDistrict does NOT recompute when supervisorUid unchanged
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — updateDistrict skips recompute when supervisor unchanged', () => {
  it('recompute is guarded by oldSupervisorUid !== newSupervisorUid check', async () => {
    const src        = await dsSrc()
    const updateIdx  = src.indexOf('export async function updateDistrict')
    const nextExport = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody     = src.slice(updateIdx, nextExport)
    // The guard condition must exist before the recompute calls
    const guardIdx   = fnBody.indexOf('oldSupervisorUid !== newSupervisorUid')
    const recompIdx  = fnBody.indexOf('recomputeAssignedPharmacyIds(oldSupervisorUid')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(recompIdx).toBeGreaterThan(guardIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 6. updateDistrict detects regionId change
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — updateDistrict regionId change detection', () => {
  it("checks 'regionId' in data to detect region change", async () => {
    const src = await dsSrc()
    expect(src).toContain("'regionId' in data")
  })

  it('compares oldRegionId with newRegionId to gate the pharmacy update', async () => {
    const src        = await dsSrc()
    const updateIdx  = src.indexOf('export async function updateDistrict')
    const nextExport = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody     = src.slice(updateIdx, nextExport)
    expect(fnBody).toContain('oldRegionId')
    expect(fnBody).toContain('newRegionId')
    expect(fnBody).toContain('oldRegionId !== newRegionId')
  })
})

// ════════════════════════════════════════════════════════════
// 7. updateDistrict updates pharmacy.regionId for district.pharmacyIds
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — updateDistrict fixes pharmacy.regionId denormalization', () => {
  it('maps over pharmacyIds to update each pharmacy', async () => {
    const src        = await dsSrc()
    const updateIdx  = src.indexOf('export async function updateDistrict')
    const nextExport = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody     = src.slice(updateIdx, nextExport)
    expect(fnBody).toContain('pharmacyIds.map')
  })

  it('writes to COL.PHARMACIES with the new regionId', async () => {
    const src          = await dsSrc()
    const updateIdx    = src.indexOf('export async function updateDistrict')
    const nextExport   = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody       = src.slice(updateIdx, nextExport)
    const mapIdx       = fnBody.indexOf('pharmacyIds.map')
    const mapBlock     = fnBody.slice(mapIdx, mapIdx + 300)
    expect(mapBlock).toContain('COL.PHARMACIES')
    expect(mapBlock).toContain('regionId')
    expect(mapBlock).toContain('newRegionId')
  })

  it('awaits the pharmacy batch update (not fire-and-forget)', async () => {
    const src        = await dsSrc()
    const updateIdx  = src.indexOf('export async function updateDistrict')
    const nextExport = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody     = src.slice(updateIdx, nextExport)
    // Promise.all wrapping the map must be awaited
    expect(fnBody).toContain('await Promise.all')
  })
})

// ════════════════════════════════════════════════════════════
// 8. userService imports recomputeAssignedPharmacyIds
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — userService imports territorySync', () => {
  it('imports recomputeAssignedPharmacyIds', async () => {
    const src = await usSrc()
    expect(src).toContain('recomputeAssignedPharmacyIds')
  })

  it("import statement is from './territorySync'", async () => {
    const src      = await usSrc()
    const impIdx   = src.indexOf("from './territorySync'")
    expect(impIdx).toBeGreaterThan(-1)
    // Import line should be near the top, before the first export function
    const firstFnIdx = src.indexOf('\nexport async function')
    expect(impIdx).toBeLessThan(firstFnIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 9. updateUserProfile detects role change
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — updateUserProfile detects role change', () => {
  it("TERRITORY_FIELDS array includes 'role'", async () => {
    const src      = await usSrc()
    const upfIdx   = src.indexOf('export async function updateUserProfile')
    const upfBlock = src.slice(upfIdx, upfIdx + 1900)
    expect(upfBlock).toContain("'role'")
    expect(upfBlock).toContain('TERRITORY_FIELDS')
  })
})

// ════════════════════════════════════════════════════════════
// 10. updateUserProfile detects districtId change
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — updateUserProfile detects districtId change', () => {
  it("TERRITORY_FIELDS array includes 'districtId'", async () => {
    const src      = await usSrc()
    const upfIdx   = src.indexOf('export async function updateUserProfile')
    const upfBlock = src.slice(upfIdx, upfIdx + 1900)
    expect(upfBlock).toContain("'districtId'")
  })
})

// ════════════════════════════════════════════════════════════
// 11. updateUserProfile detects regionIds change
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — updateUserProfile detects regionIds change', () => {
  it("TERRITORY_FIELDS array includes 'regionIds'", async () => {
    const src      = await usSrc()
    const upfIdx   = src.indexOf('export async function updateUserProfile')
    const upfBlock = src.slice(upfIdx, upfIdx + 1900)
    expect(upfBlock).toContain("'regionIds'")
  })
})

// ════════════════════════════════════════════════════════════
// 12. updateUserProfile does NOT recompute on displayName/phone only
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — updateUserProfile skips recompute for unrelated fields', () => {
  it('recompute is guarded by TERRITORY_FIELDS.some() conditional', async () => {
    const src          = await usSrc()
    const upfIdx       = src.indexOf('export async function updateUserProfile')
    const upfBlock     = src.slice(upfIdx, upfIdx + 1900)
    const recompIdx    = upfBlock.indexOf('recomputeAssignedPharmacyIds(uid')
    const condIdx      = upfBlock.lastIndexOf('if (', recompIdx)
    expect(condIdx).toBeGreaterThan(-1)
    expect(condIdx).toBeLessThan(recompIdx)
    // The condition uses .some() to check territory fields
    const condBlock = upfBlock.slice(condIdx, condIdx + 100)
    expect(condBlock).toContain('.some(')
  })

  it("'displayName' is not in TERRITORY_FIELDS", async () => {
    const src      = await usSrc()
    const upfIdx   = src.indexOf('export async function updateUserProfile')
    const upfBlock = src.slice(upfIdx, upfIdx + 1900)
    const terrIdx  = upfBlock.indexOf('TERRITORY_FIELDS')
    const terrBlock = upfBlock.slice(terrIdx, terrIdx + 80)
    expect(terrBlock).not.toContain('displayName')
    expect(terrBlock).not.toContain('phone')
  })
})

// ════════════════════════════════════════════════════════════
// 13. Recompute failures are caught and do not block updates
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — recompute errors are caught', () => {
  it('districtService recompute calls use .catch() for error handling', async () => {
    const src        = await dsSrc()
    const updateIdx  = src.indexOf('export async function updateDistrict')
    const nextExport = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody     = src.slice(updateIdx, nextExport)
    // Both old and new supervisor recomputes should have .catch()
    const catchCount = (fnBody.match(/\.catch\(/g) || []).length
    expect(catchCount).toBeGreaterThanOrEqual(2)
  })

  it('userService recompute call uses .catch() for error handling', async () => {
    const src      = await usSrc()
    const upfIdx   = src.indexOf('export async function updateUserProfile')
    const upfBlock = src.slice(upfIdx, upfIdx + 1900)
    expect(upfBlock).toContain('.catch(')
  })

  it('districtService recompute is NOT awaited (fire-and-forget)', async () => {
    const src        = await dsSrc()
    const updateIdx  = src.indexOf('export async function updateDistrict')
    const nextExport = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody     = src.slice(updateIdx, nextExport)
    // The supervisor recompute calls should not be prefixed with await
    // Check that recomputeAssignedPharmacyIds(oldSupervisorUid is NOT preceded by 'await '
    const recompOldIdx = fnBody.indexOf('recomputeAssignedPharmacyIds(oldSupervisorUid')
    const preceding    = fnBody.slice(Math.max(0, recompOldIdx - 10), recompOldIdx)
    expect(preceding).not.toContain('await')
  })
})

// ════════════════════════════════════════════════════════════
// 14. No Backfill function added
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — no Backfill added (Sprint 1B-3E)', () => {
  it('districtService does not contain backfillAllAssigned', async () => {
    const src = await dsSrc()
    expect(src).not.toContain('backfillAllAssigned')
    expect(src).not.toContain('backfill')
  })

  it('userService does not contain backfillAllAssigned', async () => {
    const src = await usSrc()
    expect(src).not.toContain('backfillAllAssigned')
    expect(src).not.toContain('backfill')
  })
})

// ════════════════════════════════════════════════════════════
// 15. No Scope Resolver added
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — no Scope Resolver added', () => {
  it('districtService does not contain resolveScope', async () => {
    const src = await dsSrc()
    expect(src).not.toContain('resolveScope')
    expect(src).not.toContain('accessScopes')
  })

  it('userService does not wire a Scope Resolver in the new sync code', async () => {
    const src    = await usSrc()
    const upfIdx = src.indexOf('export async function updateUserProfile')
    const upfBlock = src.slice(upfIdx, upfIdx + 1900)
    expect(upfBlock).not.toContain('resolveScope')
  })
})

// ════════════════════════════════════════════════════════════
// 16. No updateRegion wiring added
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — no updateRegion wiring (Sprint 1B-3C)', () => {
  it('districtService does not call updateRegion', async () => {
    const src = await dsSrc()
    expect(src).not.toContain('updateRegion(')
  })

  it('userService does not call updateRegion', async () => {
    const src = await usSrc()
    expect(src).not.toContain('updateRegion(')
  })
})

// ════════════════════════════════════════════════════════════
// 17. No assignPharmacy/removePharmacy wiring in sync hooks
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3B — no pharmacy assignment wiring in sync hooks (Sprint 1B-3D)', () => {
  it('updateDistrict function body does not call assignPharmacyToDistrict', async () => {
    const src        = await dsSrc()
    const updateIdx  = src.indexOf('export async function updateDistrict')
    const nextExport = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody     = src.slice(updateIdx, nextExport)
    expect(fnBody).not.toContain('assignPharmacyToDistrict')
  })

  it('updateDistrict function body does not call removePharmacyFromDistrict', async () => {
    const src        = await dsSrc()
    const updateIdx  = src.indexOf('export async function updateDistrict')
    const nextExport = src.indexOf('\nexport async function assign', updateIdx)
    const fnBody     = src.slice(updateIdx, nextExport)
    expect(fnBody).not.toContain('removePharmacyFromDistrict')
  })

  it('userService does not import or call assignPharmacyToDistrict', async () => {
    const src = await usSrc()
    expect(src).not.toContain('assignPharmacyToDistrict')
    expect(src).not.toContain('removePharmacyFromDistrict')
  })
})
