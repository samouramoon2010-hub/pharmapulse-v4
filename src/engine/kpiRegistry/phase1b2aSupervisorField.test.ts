// ============================================================
// Phase 1B-2A — Supervisor → District Assignment Regression Tests
//
// Verifies that DistrictsPage correctly:
//  - includes supervisorUid in EMPTY / openEdit
//  - renders the Supervisor select field
//  - filters for district_supervisor role only
//  - excludes inactive users
//  - provides the empty "no supervisor" option
//  - normalises '' → null before save (payload construction)
//  - passes supervisorUid through to updateDistrict
//  - tolerates existing districts that have no supervisorUid
//  - displays supervisor name in the Name column
//
// Source-level tests — no DOM rendering required.
// ============================================================

import { describe, it, expect } from 'vitest'

async function districtsSrc(): Promise<string> {
  return (await import('../../pages/admin/DistrictsPage.tsx?raw')).default
}

// ════════════════════════════════════════════════════════════
// 1. EMPTY constant
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2A — EMPTY constant', () => {
  it('EMPTY contains supervisorUid', async () => {
    const src = await districtsSrc()
    const emptyIdx   = src.indexOf('const EMPTY')
    const emptyBlock = src.slice(emptyIdx, emptyIdx + 120)
    expect(emptyBlock).toContain('supervisorUid')
  })

  it("EMPTY.supervisorUid initialises to empty string ''", async () => {
    const src = await districtsSrc()
    const emptyIdx   = src.indexOf('const EMPTY')
    const emptyBlock = src.slice(emptyIdx, emptyIdx + 120)
    expect(emptyBlock).toContain("supervisorUid: ''")
  })
})

// ════════════════════════════════════════════════════════════
// 2. openEdit captures supervisorUid
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2A — openEdit captures supervisorUid', () => {
  it('openEdit sets form.supervisorUid from the district', async () => {
    const src = await districtsSrc()
    const editIdx   = src.indexOf('const openEdit')
    const editBlock = src.slice(editIdx, editIdx + 300)
    expect(editBlock).toContain('supervisorUid')
  })

  it('openEdit uses || to fall back to empty string for null supervisorUid', async () => {
    const src = await districtsSrc()
    const editIdx   = src.indexOf('const openEdit')
    const editBlock = src.slice(editIdx, editIdx + 300)
    // d.supervisorUid || '' handles both null and undefined gracefully
    expect(editBlock).toContain("supervisorUid")
    expect(editBlock).toContain("''")
  })
})

// ════════════════════════════════════════════════════════════
// 3. Modal renders Supervisor select
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2A — modal Supervisor field', () => {
  it('modal renders a Supervisor label', async () => {
    const src = await districtsSrc()
    expect(src).toContain('Supervisor')
  })

  it('modal renders a select for supervisorUid', async () => {
    const src = await districtsSrc()
    // The select binds to form.supervisorUid
    expect(src).toContain('supervisorUid')
    // There should be a select element inside the Supervisor <F> field block
    // Use label="Supervisor" as anchor (more specific than the bare word)
    const supIdx   = src.indexOf('label="Supervisor"')
    expect(supIdx).toBeGreaterThan(-1)
    const supBlock = src.slice(supIdx, supIdx + 400)
    expect(supBlock).toContain('select')
    expect(supBlock).toContain('supervisorUid')
  })

  it('supervisor select is placed after Region field and before Status field', async () => {
    const src = await districtsSrc()
    const regionIdx     = src.indexOf('label="Region"')
    const supervisorIdx = src.indexOf('label="Supervisor"')
    const statusIdx     = src.indexOf('label="Status"')
    expect(regionIdx).toBeGreaterThan(-1)
    expect(supervisorIdx).toBeGreaterThan(regionIdx)
    expect(statusIdx).toBeGreaterThan(supervisorIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 4. Supervisor query filters role === 'district_supervisor'
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2A — supervisor query filters by role', () => {
  it("query uses where('role', '==', 'district_supervisor')", async () => {
    const src = await districtsSrc()
    expect(src).toContain("'district_supervisor'")
    // Use 'getDocs(query(' to target the call site, not the import line
    const queryIdx   = src.indexOf('getDocs(query(')
    expect(queryIdx).toBeGreaterThan(-1)
    const queryBlock = src.slice(queryIdx, queryIdx + 350)
    expect(queryBlock).toContain('district_supervisor')
  })

  it('supervisor list comes only from the district_supervisor role query', async () => {
    const src = await districtsSrc()
    // The supervisors state is set ONLY from the getDocs result for district_supervisor
    const setIdx   = src.indexOf('setSupervisors')
    const setBlock = src.slice(Math.max(0, setIdx - 200), setIdx + 100)
    expect(setBlock).toContain('district_supervisor')
  })
})

// ════════════════════════════════════════════════════════════
// 5. Inactive supervisors are excluded
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2A — inactive supervisors excluded', () => {
  it("query includes where('active', '==', true)", async () => {
    const src      = await districtsSrc()
    // Use 'getDocs(query(' to target the call site, not the import line
    const queryIdx = src.indexOf('getDocs(query(')
    expect(queryIdx).toBeGreaterThan(-1)
    const block    = src.slice(queryIdx, queryIdx + 350)
    expect(block).toContain("'active'")
    expect(block).toContain('true')
  })
})

// ════════════════════════════════════════════════════════════
// 6. Empty "no supervisor" option exists
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2A — no supervisor option', () => {
  it('dropdown has an empty-value option for "no supervisor"', async () => {
    const src = await districtsSrc()
    // The option element with value="" (clears supervisor)
    expect(src).toContain('No supervisor assigned')
  })

  it('empty option value is empty string', async () => {
    const src      = await districtsSrc()
    const noSupIdx = src.indexOf('No supervisor assigned')
    const block    = src.slice(Math.max(0, noSupIdx - 30), noSupIdx + 30)
    expect(block).toContain('value=""')
  })
})

// ════════════════════════════════════════════════════════════
// 7. Save normalises '' → null
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2A — save normalises empty string to null', () => {
  it('handleSave builds a payload that converts supervisorUid to null', async () => {
    const src      = await districtsSrc()
    const saveIdx  = src.indexOf('const handleSave')
    const block    = src.slice(saveIdx, saveIdx + 400)
    // The pattern: supervisorUid: form.supervisorUid || null
    expect(block).toContain('supervisorUid')
    expect(block).toContain('null')
  })

  it('payload is derived from form before calling update/create', async () => {
    const src     = await districtsSrc()
    const saveIdx = src.indexOf('const handleSave')
    const block   = src.slice(saveIdx, saveIdx + 500)
    // payload variable exists and is used in update/create calls
    expect(block).toContain('payload')
    expect(block).toContain('update(editId, payload')
    expect(block).toContain('create(payload')
  })
})

// ════════════════════════════════════════════════════════════
// 8. updateDistrict receives supervisorUid via payload
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2A — updateDistrict receives supervisorUid', () => {
  it('update() call uses payload (which contains supervisorUid), not raw form', async () => {
    const src     = await districtsSrc()
    const saveIdx = src.indexOf('const handleSave')
    const block   = src.slice(saveIdx, saveIdx + 500)
    // Must NOT call update with raw form (which has '' instead of null)
    expect(block).not.toContain('update(editId, form,')
    expect(block).toContain('update(editId, payload,')
  })
})

// ════════════════════════════════════════════════════════════
// 9. Existing districts without supervisorUid remain valid
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2A — backward compatibility', () => {
  it('supervisorUid is optional on District type (uses || fallback, not required)', async () => {
    const src = await districtsSrc()
    // openEdit uses d.supervisorUid || '' — safe if field is absent
    const editIdx = src.indexOf('const openEdit')
    const block   = src.slice(editIdx, editIdx + 200)
    expect(block).toContain("d.supervisorUid || ''")
  })

  it('supervisorMap lookup is safe for districts missing supervisorUid', async () => {
    const src = await districtsSrc()
    // supervisorMap[row.supervisorUid] returns undefined → falls to 'No supervisor'
    const colIdx = src.indexOf('supervisorMap[row.supervisorUid]')
    expect(colIdx).toBeGreaterThan(-1)
    const block = src.slice(colIdx, colIdx + 60)
    expect(block).toContain('No supervisor')
  })
})

// ════════════════════════════════════════════════════════════
// 10. Supervisor name renders in the Name table column
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2A — supervisor name in table', () => {
  it('Name column render function references supervisorMap', async () => {
    const src = await districtsSrc()
    expect(src).toContain('supervisorMap')
    // supervisorMap is used in the Name column render
    const colIdx   = src.indexOf("key: 'name'")
    const colBlock = src.slice(colIdx, colIdx + 300)
    expect(colBlock).toContain('supervisorMap')
  })

  it("'No supervisor' is shown when supervisorUid is absent", async () => {
    const src      = await districtsSrc()
    const colIdx   = src.indexOf("key: 'name'")
    // Increase window to 450 chars — the render function body extends further down
    const colBlock = src.slice(colIdx, colIdx + 450)
    expect(colBlock).toContain('No supervisor')
  })
})

// ════════════════════════════════════════════════════════════
// 11. Scope guardrails — no out-of-scope features
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2A — no out-of-scope features added', () => {
  it('DistrictsPage does not contain managerUid (Region Manager — Phase 1B-2B)', async () => {
    const src = await districtsSrc()
    expect(src).not.toContain('managerUid')
  })

  it('DistrictsPage does not contain assignedPharmacyIds (Phase 1B-3)', async () => {
    const src = await districtsSrc()
    expect(src).not.toContain('assignedPharmacyIds')
  })

  it('DistrictsPage does not contain recomputeAssignedPharmacyIds (Phase 1B-3)', async () => {
    const src = await districtsSrc()
    expect(src).not.toContain('recomputeAssignedPharmacyIds')
  })

  it('DistrictsPage destructures assignPharmacy from useDistrictStore (Phase 1B-2C implemented)', async () => {
    // Phase 1B-2C is now implemented — assignPharmacy must be destructured
    const src         = await districtsSrc()
    const destructIdx = src.indexOf('const { districts')
    expect(destructIdx).toBeGreaterThan(-1)
    const block       = src.slice(destructIdx, destructIdx + 200)
    expect(block).toContain('assignPharmacy')
  })
})
