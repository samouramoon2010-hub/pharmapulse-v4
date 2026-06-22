// ============================================================
// Phase 1B-3C — Region Manager Sync Regression Tests
//
// Verifies that regionService.updateRegion correctly wires
// recomputeAssignedPharmacyIds when managerUid changes:
//
//  - imports recomputeAssignedPharmacyIds from territorySync
//  - detects managerUid change via 'managerUid' in data
//  - recomputes old manager and new manager (best-effort)
//  - skips recompute when managerUid is unchanged
//  - catches errors — recompute failure does not block update
//  - recompute calls are fire-and-forget (not awaited)
//
//  Scope guardrails:
//  - districtService.ts was NOT modified in this sprint
//  - userService.js was NOT modified in this sprint
//  - No pharmacy assignment/remove wiring in regionService
//  - No Backfill, Validation utilities, or Scope Resolver added
//
// Source-level tests — no DOM rendering required.
// ============================================================

import { describe, it, expect } from 'vitest'

async function rsSrc(): Promise<string> {
  return (await import('../../services/regionService.ts?raw')).default
}

async function dsSrc(): Promise<string> {
  return (await import('../../services/districtService.ts?raw')).default
}

async function usSrc(): Promise<string> {
  return (await import('../../services/userService.js?raw')).default
}

// Helper: slice the updateRegion function body
async function updateRegionBody(): Promise<string> {
  const src        = await rsSrc()
  const updateIdx  = src.indexOf('export async function updateRegion')
  const nextExport = src.indexOf('\nexport async function deleteRegion', updateIdx)
  return src.slice(updateIdx, nextExport)
}

// ════════════════════════════════════════════════════════════
// 1. regionService imports recomputeAssignedPharmacyIds
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3C — regionService imports territorySync', () => {
  it('imports recomputeAssignedPharmacyIds', async () => {
    const src = await rsSrc()
    expect(src).toContain('recomputeAssignedPharmacyIds')
  })

  it("import is from './territorySync'", async () => {
    const src        = await rsSrc()
    const impIdx     = src.indexOf("from './territorySync'")
    expect(impIdx).toBeGreaterThan(-1)
    const firstExport = src.indexOf('\nexport ')
    expect(impIdx).toBeLessThan(firstExport)
  })
})

// ════════════════════════════════════════════════════════════
// 2. updateRegion detects managerUid change
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3C — updateRegion managerUid change detection', () => {
  it("checks 'managerUid' in data to detect the field being updated", async () => {
    const body = await updateRegionBody()
    expect(body).toContain("'managerUid' in data")
  })

  it('reads oldManagerUid from before state', async () => {
    const body = await updateRegionBody()
    expect(body).toContain('oldManagerUid')
  })

  it('computes newManagerUid from data or before fallback', async () => {
    const body = await updateRegionBody()
    expect(body).toContain('newManagerUid')
  })
})

// ════════════════════════════════════════════════════════════
// 3. updateRegion recomputes old manager
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3C — updateRegion recomputes old manager', () => {
  it('calls recomputeAssignedPharmacyIds with oldManagerUid', async () => {
    const body = await updateRegionBody()
    expect(body).toContain('recomputeAssignedPharmacyIds(oldManagerUid')
  })
})

// ════════════════════════════════════════════════════════════
// 4. updateRegion recomputes new manager
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3C — updateRegion recomputes new manager', () => {
  it('calls recomputeAssignedPharmacyIds with newManagerUid', async () => {
    const body = await updateRegionBody()
    expect(body).toContain('recomputeAssignedPharmacyIds(newManagerUid')
  })
})

// ════════════════════════════════════════════════════════════
// 5. updateRegion does NOT recompute when managerUid unchanged
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3C — updateRegion skips recompute when manager unchanged', () => {
  it('recompute is guarded by oldManagerUid !== newManagerUid check', async () => {
    const body      = await updateRegionBody()
    const guardIdx  = body.indexOf('oldManagerUid !== newManagerUid')
    const recompIdx = body.indexOf('recomputeAssignedPharmacyIds(oldManagerUid')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(recompIdx).toBeGreaterThan(guardIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 6. Recompute failures are caught — do not block region update
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3C — recompute errors are caught', () => {
  it('both recompute calls use .catch() for error handling', async () => {
    const body       = await updateRegionBody()
    const catchCount = (body.match(/\.catch\(/g) || []).length
    expect(catchCount).toBeGreaterThanOrEqual(2)
  })

  it('recompute calls are fire-and-forget (not awaited)', async () => {
    const body         = await updateRegionBody()
    const recompOldIdx = body.indexOf('recomputeAssignedPharmacyIds(oldManagerUid')
    const preceding    = body.slice(Math.max(0, recompOldIdx - 10), recompOldIdx)
    expect(preceding).not.toContain('await')
  })
})

// ════════════════════════════════════════════════════════════
// 7. No districtService changes in this sprint
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3C — districtService not modified', () => {
  it('districtService does not contain a Phase 1B-3C comment', async () => {
    const src = await dsSrc()
    expect(src).not.toContain('Phase 1B-3C')
  })

  it('districtService still has its Phase 1B-3B sync section and no extra hooks', async () => {
    const src = await dsSrc()
    // The 1B-3B section is the last sync comment — no 1B-3C was appended
    expect(src).toContain('Territory sync — Phase 1B-3B')
    expect(src).not.toContain('Territory sync — Phase 1B-3C')
  })
})

// ════════════════════════════════════════════════════════════
// 8. No userService changes in this sprint
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3C — userService not modified', () => {
  it('userService does not contain a Phase 1B-3C comment', async () => {
    const src = await usSrc()
    expect(src).not.toContain('Phase 1B-3C')
  })

  it('userService TERRITORY_FIELDS list is unchanged (role/districtId/regionIds only)', async () => {
    const src      = await usSrc()
    const upfIdx   = src.indexOf('export async function updateUserProfile')
    const upfBlock = src.slice(upfIdx, upfIdx + 1900)
    const tfIdx    = upfBlock.indexOf('TERRITORY_FIELDS')
    const tfLine   = upfBlock.slice(tfIdx, tfIdx + 80)
    // Must contain exactly the three 1B-3B fields and no extras
    expect(tfLine).toContain("'role'")
    expect(tfLine).toContain("'districtId'")
    expect(tfLine).toContain("'regionIds'")
    expect(tfLine).not.toContain("'managerUid'")
  })
})

// ════════════════════════════════════════════════════════════
// 9. No assignPharmacy/removePharmacy wiring in regionService
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3C — no pharmacy assignment wiring (Sprint 1B-3D)', () => {
  it('regionService does not call assignPharmacyToDistrict', async () => {
    const src = await rsSrc()
    expect(src).not.toContain('assignPharmacyToDistrict')
  })

  it('regionService does not call removePharmacyFromDistrict', async () => {
    const src = await rsSrc()
    expect(src).not.toContain('removePharmacyFromDistrict')
  })
})

// ════════════════════════════════════════════════════════════
// 10. No Backfill function added
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3C — no Backfill added (Sprint 1B-3E)', () => {
  it('regionService does not contain backfillAllAssigned', async () => {
    const src = await rsSrc()
    expect(src).not.toContain('backfillAllAssigned')
    expect(src).not.toContain('backfill')
  })
})

// ════════════════════════════════════════════════════════════
// 11. No Validation utilities added
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3C — no Validation utilities added (Sprint 1B-3F)', () => {
  it('regionService does not contain validateAssignedPharmacyIds', async () => {
    const src = await rsSrc()
    expect(src).not.toContain('validateAssignedPharmacyIds')
  })

  it('regionService does not contain auditAllAssignedPharmacyIds', async () => {
    const src = await rsSrc()
    expect(src).not.toContain('auditAllAssignedPharmacyIds')
  })
})

// ════════════════════════════════════════════════════════════
// 12. No Scope Resolver added
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3C — no Scope Resolver added', () => {
  it('regionService does not contain resolveScope', async () => {
    const src = await rsSrc()
    expect(src).not.toContain('resolveScope')
  })

  it('regionService does not write accessScopes in the sync section', async () => {
    const body = await updateRegionBody()
    expect(body).not.toContain('accessScopes')
  })
})
