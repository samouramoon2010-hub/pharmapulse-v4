// ============================================================
// Phase 1B-3D — Pharmacy Assignment Sync Regression Tests
//
// Verifies that districtService correctly recomputes
// assignedPharmacyIds after pharmacy assign / remove events:
//
//  assignPharmacyToDistrict:
//   - recomputes the district supervisor (best-effort)
//   - looks up the region to obtain managerUid
//   - recomputes the regional manager (best-effort)
//   - errors are caught — primary operation is never blocked
//
//  removePharmacyFromDistrict:
//   - same supervisor + regional manager recompute pattern
//   - errors are caught — primary operation is never blocked
//
//  Move flow safety:
//   - no special move orchestrator added
//   - move is handled naturally via remove-then-assign sequence
//
//  Scope guardrails:
//   - regionService.ts not modified
//   - userService.js not modified
//   - no Backfill, Validation utilities, or Scope Resolver added
//
// Source-level tests — no DOM rendering required.
// ============================================================

import { describe, it, expect } from 'vitest'

async function dsSrc(): Promise<string> {
  return (await import('../../services/districtService.ts?raw')).default
}

async function rsSrc(): Promise<string> {
  return (await import('../../services/regionService.ts?raw')).default
}

async function usSrc(): Promise<string> {
  return (await import('../../services/userService.js?raw')).default
}

// Helper: slice assignPharmacyToDistrict function body
async function assignBody(): Promise<string> {
  const src        = await dsSrc()
  const startIdx   = src.indexOf('export async function assignPharmacyToDistrict')
  const endIdx     = src.indexOf('\nexport async function removePharmacyFromDistrict', startIdx)
  return src.slice(startIdx, endIdx)
}

// Helper: slice removePharmacyFromDistrict function body
async function removeBody(): Promise<string> {
  const src      = await dsSrc()
  const startIdx = src.indexOf('export async function removePharmacyFromDistrict')
  const endIdx   = src.indexOf('\nexport async function deleteDistrict', startIdx)
  return src.slice(startIdx, endIdx)
}

// ════════════════════════════════════════════════════════════
// 1. assignPharmacyToDistrict has access to recomputeAssignedPharmacyIds
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — districtService import covers assign/remove hooks', () => {
  it('districtService imports recomputeAssignedPharmacyIds (already wired in 1B-3B)', async () => {
    const src = await dsSrc()
    expect(src).toContain('recomputeAssignedPharmacyIds')
  })

  it('import appears before assignPharmacyToDistrict function', async () => {
    const src       = await dsSrc()
    const impIdx    = src.indexOf('recomputeAssignedPharmacyIds')
    const assignIdx = src.indexOf('export async function assignPharmacyToDistrict')
    expect(impIdx).toBeLessThan(assignIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 2. assignPharmacyToDistrict recomputes district supervisor
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — assign recomputes district supervisor', () => {
  it('reads supervisorUid from district data', async () => {
    const body = await assignBody()
    expect(body).toContain('supervisorUid')
    expect(body).toContain('district.supervisorUid')
  })

  it('calls recomputeAssignedPharmacyIds with supervisorUid', async () => {
    const body = await assignBody()
    expect(body).toContain('recomputeAssignedPharmacyIds(supervisorUid')
  })
})

// ════════════════════════════════════════════════════════════
// 3. assignPharmacyToDistrict loads the region
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — assign loads region to find managerUid', () => {
  it('reads regionId from district data', async () => {
    const body = await assignBody()
    expect(body).toContain('district.regionId')
  })

  it('issues a getDoc call against COL.REGIONS', async () => {
    const body = await assignBody()
    expect(body).toContain('COL.REGIONS')
    expect(body).toContain('getDoc(')
  })
})

// ════════════════════════════════════════════════════════════
// 4. assignPharmacyToDistrict recomputes regional manager
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — assign recomputes regional manager', () => {
  it('reads managerUid from the region snapshot', async () => {
    const body = await assignBody()
    expect(body).toContain('managerUid')
    expect(body).toContain('regionSnap')
  })

  it('calls recomputeAssignedPharmacyIds with managerUid', async () => {
    const body = await assignBody()
    expect(body).toContain('recomputeAssignedPharmacyIds(managerUid')
  })
})

// ════════════════════════════════════════════════════════════
// 5. assign failures do not block the primary operation
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — assign sync errors are caught', () => {
  it('sync section in assign uses .catch() — never throws', async () => {
    const body       = await assignBody()
    // The Territory sync section must have at least one .catch() chain
    const syncStart  = body.indexOf('Territory sync — Phase 1B-3D')
    const syncBlock  = body.slice(syncStart)
    const catchCount = (syncBlock.match(/\.catch\(/g) || []).length
    expect(catchCount).toBeGreaterThanOrEqual(2)
  })

  it('supervisor recompute is fire-and-forget (not awaited)', async () => {
    const body      = await assignBody()
    const recompIdx = body.indexOf('recomputeAssignedPharmacyIds(supervisorUid')
    const preceding = body.slice(Math.max(0, recompIdx - 10), recompIdx)
    expect(preceding).not.toContain('await')
  })

  it('region lookup is fire-and-forget (not awaited)', async () => {
    const body     = await assignBody()
    const syncStart = body.indexOf('Territory sync — Phase 1B-3D')
    const syncBlock = body.slice(syncStart)
    // getDoc for region inside the sync section should not be awaited
    const getDocIdx = syncBlock.indexOf('getDoc(doc(db, COL.REGIONS')
    const preceding = syncBlock.slice(Math.max(0, getDocIdx - 10), getDocIdx)
    expect(preceding).not.toContain('await')
  })
})

// ════════════════════════════════════════════════════════════
// 6. removePharmacyFromDistrict recomputes district supervisor
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — remove recomputes district supervisor', () => {
  it('reads supervisorUid from district data', async () => {
    const body = await removeBody()
    expect(body).toContain('supervisorUid')
    expect(body).toContain('district.supervisorUid')
  })

  it('calls recomputeAssignedPharmacyIds with supervisorUid', async () => {
    const body = await removeBody()
    expect(body).toContain('recomputeAssignedPharmacyIds(supervisorUid')
  })
})

// ════════════════════════════════════════════════════════════
// 7. removePharmacyFromDistrict loads the region
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — remove loads region to find managerUid', () => {
  it('reads regionId from district data', async () => {
    const body = await removeBody()
    expect(body).toContain('district.regionId')
  })

  it('issues a getDoc call against COL.REGIONS', async () => {
    const body = await removeBody()
    expect(body).toContain('COL.REGIONS')
    expect(body).toContain('getDoc(')
  })
})

// ════════════════════════════════════════════════════════════
// 8. removePharmacyFromDistrict recomputes regional manager
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — remove recomputes regional manager', () => {
  it('reads managerUid from the region snapshot', async () => {
    const body = await removeBody()
    expect(body).toContain('managerUid')
    expect(body).toContain('regionSnap')
  })

  it('calls recomputeAssignedPharmacyIds with managerUid', async () => {
    const body = await removeBody()
    expect(body).toContain('recomputeAssignedPharmacyIds(managerUid')
  })
})

// ════════════════════════════════════════════════════════════
// 9. remove failures do not block the primary operation
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — remove sync errors are caught', () => {
  it('sync section in remove uses .catch() — never throws', async () => {
    const body      = await removeBody()
    const syncStart = body.indexOf('Territory sync — Phase 1B-3D')
    const syncBlock = body.slice(syncStart)
    const catchCount = (syncBlock.match(/\.catch\(/g) || []).length
    expect(catchCount).toBeGreaterThanOrEqual(2)
  })

  it('supervisor recompute in remove is fire-and-forget (not awaited)', async () => {
    const body      = await removeBody()
    const recompIdx = body.indexOf('recomputeAssignedPharmacyIds(supervisorUid')
    const preceding = body.slice(Math.max(0, recompIdx - 10), recompIdx)
    expect(preceding).not.toContain('await')
  })
})

// ════════════════════════════════════════════════════════════
// 10. Move flow relies on existing remove + assign sequence
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — move flow uses natural remove+assign sequence', () => {
  it('districtService does not export a movePharmacy function', async () => {
    const src = await dsSrc()
    expect(src).not.toContain('export async function movePharmacy')
    expect(src).not.toContain('export function movePharmacy')
  })

  it('assignPharmacyToDistrict does not reference removePharmacy internally', async () => {
    const body = await assignBody()
    expect(body).not.toContain('removePharmacyFromDistrict')
  })

  it('removePharmacyFromDistrict does not reference assignPharmacy internally', async () => {
    const body = await removeBody()
    expect(body).not.toContain('assignPharmacyToDistrict')
  })
})

// ════════════════════════════════════════════════════════════
// 11. No special move orchestrator exists
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — no move orchestrator added', () => {
  it('districtService does not contain a movePharmacy function declaration', async () => {
    const src = await dsSrc()
    expect(src).not.toContain('function movePharmacy')
  })

  it('districtService does not batch-coordinate assign+remove in a single call', async () => {
    const src = await dsSrc()
    // No function that calls both assign and remove together
    expect(src).not.toContain('orchestrate')
    expect(src).not.toContain('batchMove')
  })
})

// ════════════════════════════════════════════════════════════
// 12. No Backfill added
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — no Backfill added (Sprint 1B-3E)', () => {
  it('districtService does not contain backfill logic', async () => {
    const src = await dsSrc()
    expect(src).not.toContain('backfillAllAssigned')
    expect(src).not.toContain('backfill')
  })
})

// ════════════════════════════════════════════════════════════
// 13. No Validation utilities added
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — no Validation utilities added (Sprint 1B-3F)', () => {
  it('districtService does not contain validateAssignedPharmacyIds', async () => {
    const src = await dsSrc()
    expect(src).not.toContain('validateAssignedPharmacyIds')
  })
})

// ════════════════════════════════════════════════════════════
// 14. No Scope Resolver added
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — no Scope Resolver added', () => {
  it('districtService does not contain resolveScope', async () => {
    const src = await dsSrc()
    expect(src).not.toContain('resolveScope')
    expect(src).not.toContain('accessScopes')
  })
})

// ════════════════════════════════════════════════════════════
// 15. regionService and userService not modified
// ════════════════════════════════════════════════════════════

describe('Phase 1B-3D — regionService and userService not modified', () => {
  it('regionService does not contain a Phase 1B-3D comment', async () => {
    const src = await rsSrc()
    expect(src).not.toContain('Phase 1B-3D')
  })

  it('userService does not contain a Phase 1B-3D comment', async () => {
    const src = await usSrc()
    expect(src).not.toContain('Phase 1B-3D')
  })

  it('regionService Phase 1B-3C hook is still the last sync section', async () => {
    const src = await rsSrc()
    expect(src).toContain('Territory sync — Phase 1B-3C')
    expect(src).not.toContain('Territory sync — Phase 1B-3D')
  })
})
