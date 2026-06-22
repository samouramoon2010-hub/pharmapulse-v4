// ============================================================
// Phase 1B-2B — Regional Manager → Region Assignment Regression Tests
//
// Verifies that RegionsPage correctly:
//  - includes managerUid in EMPTY / openEdit
//  - renders the Manager select field
//  - filters for regional_manager role only
//  - excludes inactive users
//  - provides the empty "no manager" option
//  - normalises '' → null before save (payload construction)
//  - passes managerUid through to updateRegion
//  - tolerates existing regions that have no managerUid
//  - displays manager name in the Name column
//
// Source-level tests — no DOM rendering required.
// ============================================================

import { describe, it, expect } from 'vitest'

async function regionsSrc(): Promise<string> {
  return (await import('../../pages/admin/RegionsPage.tsx?raw')).default
}

// ════════════════════════════════════════════════════════════
// 1. EMPTY constant
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2B — EMPTY constant', () => {
  it('EMPTY contains managerUid', async () => {
    const src        = await regionsSrc()
    const emptyIdx   = src.indexOf('const EMPTY')
    const emptyBlock = src.slice(emptyIdx, emptyIdx + 100)
    expect(emptyBlock).toContain('managerUid')
  })

  it("EMPTY.managerUid initialises to empty string ''", async () => {
    const src        = await regionsSrc()
    const emptyIdx   = src.indexOf('const EMPTY')
    const emptyBlock = src.slice(emptyIdx, emptyIdx + 100)
    expect(emptyBlock).toContain("managerUid: ''")
  })
})

// ════════════════════════════════════════════════════════════
// 2. openEdit captures managerUid
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2B — openEdit captures managerUid', () => {
  it('openEdit sets form.managerUid from the region', async () => {
    const src      = await regionsSrc()
    const editIdx  = src.indexOf('const openEdit')
    const editBlock = src.slice(editIdx, editIdx + 300)
    expect(editBlock).toContain('managerUid')
  })

  it('openEdit uses || to fall back to empty string for null managerUid', async () => {
    const src      = await regionsSrc()
    const editIdx  = src.indexOf('const openEdit')
    const editBlock = src.slice(editIdx, editIdx + 300)
    expect(editBlock).toContain("r.managerUid || ''")
  })
})

// ════════════════════════════════════════════════════════════
// 3. Modal renders Manager select
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2B — modal Manager field', () => {
  it('modal renders a Manager label', async () => {
    const src = await regionsSrc()
    expect(src).toContain('label="Manager"')
  })

  it('modal renders a select bound to managerUid', async () => {
    const src       = await regionsSrc()
    const mgrIdx    = src.indexOf('label="Manager"')
    expect(mgrIdx).toBeGreaterThan(-1)
    const mgrBlock  = src.slice(mgrIdx, mgrIdx + 400)
    expect(mgrBlock).toContain('select')
    expect(mgrBlock).toContain('managerUid')
  })

  it('Manager field is placed after Name field and before Status field', async () => {
    const src        = await regionsSrc()
    const nameIdx    = src.indexOf('label="Name"')
    const managerIdx = src.indexOf('label="Manager"')
    const statusIdx  = src.indexOf('label="Status"')
    expect(nameIdx).toBeGreaterThan(-1)
    expect(managerIdx).toBeGreaterThan(nameIdx)
    expect(statusIdx).toBeGreaterThan(managerIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 4. Manager query filters role === 'regional_manager'
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2B — manager query filters by role', () => {
  it("query uses where('role', '==', 'regional_manager')", async () => {
    const src      = await regionsSrc()
    expect(src).toContain("'regional_manager'")
    const queryIdx = src.indexOf('getDocs(query(')
    expect(queryIdx).toBeGreaterThan(-1)
    const block    = src.slice(queryIdx, queryIdx + 350)
    expect(block).toContain('regional_manager')
  })

  it('managers state is populated from the regional_manager query result', async () => {
    const src    = await regionsSrc()
    const setIdx = src.indexOf('setManagers')
    expect(setIdx).toBeGreaterThan(-1)
    const block  = src.slice(Math.max(0, setIdx - 200), setIdx + 100)
    expect(block).toContain('regional_manager')
  })
})

// ════════════════════════════════════════════════════════════
// 5. Inactive managers are excluded
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2B — inactive managers excluded', () => {
  it("query includes where('active', '==', true)", async () => {
    const src      = await regionsSrc()
    const queryIdx = src.indexOf('getDocs(query(')
    expect(queryIdx).toBeGreaterThan(-1)
    const block    = src.slice(queryIdx, queryIdx + 350)
    expect(block).toContain("'active'")
    expect(block).toContain('true')
  })
})

// ════════════════════════════════════════════════════════════
// 6. Empty "no manager" option exists
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2B — no manager option', () => {
  it('dropdown has an option labelled "No manager assigned"', async () => {
    const src = await regionsSrc()
    expect(src).toContain('No manager assigned')
  })

  it('empty option value is empty string', async () => {
    const src      = await regionsSrc()
    const noMgrIdx = src.indexOf('No manager assigned')
    const block    = src.slice(Math.max(0, noMgrIdx - 30), noMgrIdx + 30)
    expect(block).toContain('value=""')
  })
})

// ════════════════════════════════════════════════════════════
// 7. Save normalises '' → null
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2B — save normalises empty string to null', () => {
  it('handleSave builds a payload that converts managerUid empty string to null', async () => {
    const src     = await regionsSrc()
    const saveIdx = src.indexOf('const handleSave')
    const block   = src.slice(saveIdx, saveIdx + 400)
    expect(block).toContain('managerUid')
    expect(block).toContain('null')
  })

  it('payload is used in both update and create calls', async () => {
    const src     = await regionsSrc()
    const saveIdx = src.indexOf('const handleSave')
    const block   = src.slice(saveIdx, saveIdx + 500)
    expect(block).toContain('update(editId, payload')
    expect(block).toContain('create(payload')
  })
})

// ════════════════════════════════════════════════════════════
// 8. updateRegion receives managerUid via payload
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2B — updateRegion receives managerUid', () => {
  it('update() call uses payload (not raw form) to avoid passing empty string', async () => {
    const src     = await regionsSrc()
    const saveIdx = src.indexOf('const handleSave')
    const block   = src.slice(saveIdx, saveIdx + 500)
    expect(block).not.toContain('update(editId, form,')
    expect(block).toContain('update(editId, payload,')
  })
})

// ════════════════════════════════════════════════════════════
// 9. Existing regions without managerUid remain valid
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2B — backward compatibility', () => {
  it('openEdit uses || fallback — safe for regions without managerUid', async () => {
    const src     = await regionsSrc()
    const editIdx = src.indexOf('const openEdit')
    const block   = src.slice(editIdx, editIdx + 300)
    expect(block).toContain("r.managerUid || ''")
  })

  it('managerMap lookup falls through to "No manager" for absent managerUid', async () => {
    const src    = await regionsSrc()
    const colIdx = src.indexOf('managerMap[row.managerUid]')
    expect(colIdx).toBeGreaterThan(-1)
    const block  = src.slice(colIdx, colIdx + 60)
    expect(block).toContain('No manager')
  })
})

// ════════════════════════════════════════════════════════════
// 10. Manager name renders in the Name table column
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2B — manager name in table', () => {
  it('Name column render function references managerMap', async () => {
    const src    = await regionsSrc()
    const colIdx = src.indexOf("key: 'name'")
    expect(colIdx).toBeGreaterThan(-1)
    const block  = src.slice(colIdx, colIdx + 450)
    expect(block).toContain('managerMap')
  })

  it('"No manager" is shown when managerUid is absent', async () => {
    const src    = await regionsSrc()
    const colIdx = src.indexOf("key: 'name'")
    const block  = src.slice(colIdx, colIdx + 450)
    expect(block).toContain('No manager')
  })
})

// ════════════════════════════════════════════════════════════
// 11. Scope guardrails — no out-of-scope features
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2B — no out-of-scope features added', () => {
  it('RegionsPage does not contain supervisorUid (Districts — Phase 1B-2A)', async () => {
    const src = await regionsSrc()
    expect(src).not.toContain('supervisorUid')
  })

  it('RegionsPage does not contain assignedPharmacyIds (Phase 1B-3)', async () => {
    const src = await regionsSrc()
    expect(src).not.toContain('assignedPharmacyIds')
  })

  it('RegionsPage does not contain recomputeAssignedPharmacyIds (Phase 1B-3)', async () => {
    const src = await regionsSrc()
    expect(src).not.toContain('recomputeAssignedPharmacyIds')
  })

  it('RegionsPage does not contain pharmacy assignment logic (Phase 1B-2C)', async () => {
    const src = await regionsSrc()
    expect(src).not.toContain('assignPharmacy')
    expect(src).not.toContain('pharmacyIds')
  })
})
