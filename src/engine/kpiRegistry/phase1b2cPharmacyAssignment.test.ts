// ============================================================
// Phase 1B-2C — Pharmacy → District Assignment UI Regression Tests
//
// Verifies that DistrictsPage correctly:
//  - imports usePharmacyStore and subscribes to pharmacies
//  - destructures assignPharmacy / removePharmacy from districtStore
//  - derives assignDistrict and districtMap reactively from store
//  - derives assigned/available pharmacy lists from district.pharmacyIds
//  - excludes inactive pharmacies from the Add section
//  - provides Add, Remove, and Move flows with correct confirmation UX
//  - executes Move as sequential removePharmacy → assignPharmacy
//  - resets all modal state on close
//  - contains empty states for all list scenarios
//  - does NOT contain any Phase 1B-3 (sync) logic
//
// Source-level tests — no DOM rendering required.
// ============================================================

import { describe, it, expect } from 'vitest'

async function districtsSrc(): Promise<string> {
  return (await import('../../pages/admin/DistrictsPage.tsx?raw')).default
}

// ════════════════════════════════════════════════════════════
// 1. Manage Pharmacies action exists in RowActions
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — Manage Pharmacies RowAction', () => {
  it('RowActions contains "Manage Pharmacies" label', async () => {
    const src = await districtsSrc()
    expect(src).toContain('Manage Pharmacies')
  })

  it('"Manage Pharmacies" action is placed between Edit and Delete', async () => {
    const src     = await districtsSrc()
    const editIdx = src.indexOf("label: 'Edit'")
    const mgrIdx  = src.indexOf("label: 'Manage Pharmacies'")
    const delIdx  = src.indexOf("label: 'Delete'")
    expect(editIdx).toBeGreaterThan(-1)
    expect(mgrIdx).toBeGreaterThan(editIdx)
    expect(delIdx).toBeGreaterThan(mgrIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 2. usePharmacyStore imported
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — usePharmacyStore import', () => {
  it('imports usePharmacyStore from pharmacyStore', async () => {
    const src = await districtsSrc()
    expect(src).toContain("from '../../store/pharmacyStore'")
  })

  it('pharmacies is destructured from usePharmacyStore', async () => {
    const src      = await districtsSrc()
    const storeIdx = src.indexOf('usePharmacyStore()')
    expect(storeIdx).toBeGreaterThan(-1)
    const block    = src.slice(Math.max(0, storeIdx - 120), storeIdx + 10)
    expect(block).toContain('pharmacies')
  })
})

// ════════════════════════════════════════════════════════════
// 3. pharmacies subscription in useEffect
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — pharmacies subscription', () => {
  it('subPharmacies is called in useEffect', async () => {
    const src = await districtsSrc()
    expect(src).toContain('const u3 = subPharmacies()')
  })

  it('u3 is included in the useEffect cleanup return', async () => {
    const src      = await districtsSrc()
    const cleanIdx = src.indexOf('return () =>')
    expect(cleanIdx).toBeGreaterThan(-1)
    const block    = src.slice(cleanIdx, cleanIdx + 60)
    expect(block).toContain('u3()')
  })
})

// ════════════════════════════════════════════════════════════
// 4. assignPharmacy destructured from useDistrictStore
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — assignPharmacy destructured', () => {
  it('assignPharmacy is in the useDistrictStore destructure', async () => {
    const src         = await districtsSrc()
    const destructIdx = src.indexOf('const { districts')
    expect(destructIdx).toBeGreaterThan(-1)
    const block       = src.slice(destructIdx, destructIdx + 200)
    expect(block).toContain('assignPharmacy')
  })
})

// ════════════════════════════════════════════════════════════
// 5. removePharmacy destructured from useDistrictStore
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — removePharmacy destructured', () => {
  it('removePharmacy is in the useDistrictStore destructure', async () => {
    const src         = await districtsSrc()
    const destructIdx = src.indexOf('const { districts')
    expect(destructIdx).toBeGreaterThan(-1)
    const block       = src.slice(destructIdx, destructIdx + 200)
    expect(block).toContain('removePharmacy')
  })
})

// ════════════════════════════════════════════════════════════
// 6. assignDistrict memo exists
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — assignDistrict derived memo', () => {
  it('assignDistrict is derived with useMemo from districts', async () => {
    const src    = await districtsSrc()
    const memoIdx = src.indexOf('const assignDistrict = useMemo(')
    expect(memoIdx).toBeGreaterThan(-1)
  })

  it('assignDistrict looks up by assignDistrictId', async () => {
    const src     = await districtsSrc()
    const memoIdx = src.indexOf('const assignDistrict = useMemo(')
    const block   = src.slice(memoIdx, memoIdx + 200)
    expect(block).toContain('assignDistrictId')
  })
})

// ════════════════════════════════════════════════════════════
// 7. districtMap memo exists
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — districtMap memo', () => {
  it('districtMap is computed with useMemo', async () => {
    const src     = await districtsSrc()
    const memoIdx = src.indexOf('const districtMap = useMemo(')
    expect(memoIdx).toBeGreaterThan(-1)
  })

  it('districtMap maps district id → name', async () => {
    const src     = await districtsSrc()
    const memoIdx = src.indexOf('const districtMap = useMemo(')
    const block   = src.slice(memoIdx, memoIdx + 150)
    expect(block).toContain('d.id')
    expect(block).toContain('d.name')
  })
})

// ════════════════════════════════════════════════════════════
// 8. Assigned list derived from district.pharmacyIds
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — assigned pharmacies derived from district.pharmacyIds', () => {
  it('assignedPharmaciesAll memo filters by pharmacyIds', async () => {
    const src         = await districtsSrc()
    const assignedIdx = src.indexOf('assignedPharmaciesAll = useMemo')
    expect(assignedIdx).toBeGreaterThan(-1)
    const block       = src.slice(assignedIdx, assignedIdx + 300)
    expect(block).toContain('pharmacyIds')
  })

  it('assignedPharmacies applies search filter on top of assignedPharmaciesAll', async () => {
    const src      = await districtsSrc()
    const filtIdx  = src.indexOf('const assignedPharmacies = useMemo')
    expect(filtIdx).toBeGreaterThan(-1)
    const block    = src.slice(filtIdx, filtIdx + 250)
    expect(block).toContain('assignedPharmaciesAll')
    expect(block).toContain('pharmSearchAssigned')
  })
})

// ════════════════════════════════════════════════════════════
// 9. Add handler calls assignPharmacy
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — handleAssignPharmacy calls assignPharmacy', () => {
  it('handleAssignPharmacy contains assignPharmacy call', async () => {
    const src      = await districtsSrc()
    const handIdx  = src.indexOf('const handleAssignPharmacy')
    expect(handIdx).toBeGreaterThan(-1)
    const block    = src.slice(handIdx, handIdx + 300)
    expect(block).toContain('assignPharmacy(')
  })

  it('handleAssignPharmacy uses assignDistrictId', async () => {
    const src     = await districtsSrc()
    const handIdx = src.indexOf('const handleAssignPharmacy')
    const block   = src.slice(handIdx, handIdx + 300)
    expect(block).toContain('assignDistrictId')
  })
})

// ════════════════════════════════════════════════════════════
// 10. Remove handler calls removePharmacy
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — handleRemovePharmacy calls removePharmacy', () => {
  it('handleRemovePharmacy contains removePharmacy call', async () => {
    const src     = await districtsSrc()
    const handIdx = src.indexOf('const handleRemovePharmacy')
    expect(handIdx).toBeGreaterThan(-1)
    const block   = src.slice(handIdx, handIdx + 300)
    expect(block).toContain('removePharmacy(')
  })

  it('handleRemovePharmacy reads from pharmRemoveConfirm', async () => {
    const src     = await districtsSrc()
    const handIdx = src.indexOf('const handleRemovePharmacy')
    const block   = src.slice(handIdx, handIdx + 300)
    expect(block).toContain('pharmRemoveConfirm')
  })
})

// ════════════════════════════════════════════════════════════
// 11. Move flow: removePharmacy called before assignPharmacy (sequential)
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — handleMovePharmacy sequential execution', () => {
  it('handleMovePharmacy calls removePharmacy before assignPharmacy', async () => {
    const src        = await districtsSrc()
    const moveIdx    = src.indexOf('const handleMovePharmacy')
    expect(moveIdx).toBeGreaterThan(-1)
    const moveBlock  = src.slice(moveIdx, moveIdx + 800)
    const removePos  = moveBlock.indexOf('removePharmacy(')
    const assignPos  = moveBlock.indexOf('assignPharmacy(')
    expect(removePos).toBeGreaterThan(-1)
    expect(assignPos).toBeGreaterThan(-1)
    expect(removePos).toBeLessThan(assignPos)
  })

  it('handleMovePharmacy shows partial-failure toast if step 2 fails', async () => {
    const src     = await districtsSrc()
    const moveIdx = src.indexOf('const handleMovePharmacy')
    const block   = src.slice(moveIdx, moveIdx + 800)
    expect(block).toContain('Move partially failed')
  })
})

// ════════════════════════════════════════════════════════════
// 12. Inactive pharmacies excluded from Add list
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — inactive pharmacies excluded from Add section', () => {
  it('availablePharmaciesAll filters active !== false', async () => {
    const src      = await districtsSrc()
    const availIdx = src.indexOf('availablePharmaciesAll = useMemo')
    expect(availIdx).toBeGreaterThan(-1)
    const block    = src.slice(availIdx, availIdx + 300)
    expect(block).toContain('active !== false')
  })
})

// ════════════════════════════════════════════════════════════
// 13. Move confirmation state exists
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — Move confirmation state', () => {
  it('pharmMoveConfirm state is declared', async () => {
    const src    = await districtsSrc()
    const stIdx  = src.indexOf('const [pharmMoveConfirm')
    expect(stIdx).toBeGreaterThan(-1)
  })

  it('ConfirmModal for Move Pharmacy exists', async () => {
    const src = await districtsSrc()
    expect(src).toContain("title=\"Move Pharmacy\"")
  })
})

// ════════════════════════════════════════════════════════════
// 14. Remove confirmation state exists
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — Remove confirmation state', () => {
  it('pharmRemoveConfirm state is declared', async () => {
    const src   = await districtsSrc()
    const stIdx = src.indexOf('const [pharmRemoveConfirm')
    expect(stIdx).toBeGreaterThan(-1)
  })

  it('ConfirmModal for Remove Pharmacy exists', async () => {
    const src = await districtsSrc()
    expect(src).toContain("title=\"Remove Pharmacy\"")
  })
})

// ════════════════════════════════════════════════════════════
// 15. Empty states for all list scenarios
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — empty states', () => {
  it('empty state for no assigned pharmacies exists', async () => {
    const src = await districtsSrc()
    expect(src).toContain('No pharmacies assigned to this district yet')
  })

  it('empty state for all pharmacies already assigned exists', async () => {
    const src = await districtsSrc()
    expect(src).toContain('All active pharmacies are already assigned')
  })

  it('empty state for search returning no results exists', async () => {
    const src = await districtsSrc()
    expect(src).toContain('No pharmacies match your search')
  })
})

// ════════════════════════════════════════════════════════════
// 16. Done button resets modal state
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — closePharmacyModal resets all state', () => {
  it('closePharmacyModal resets assignDistrictId to null', async () => {
    const src      = await districtsSrc()
    const closeIdx = src.indexOf('const closePharmacyModal')
    expect(closeIdx).toBeGreaterThan(-1)
    const block    = src.slice(closeIdx, closeIdx + 300)
    expect(block).toContain('setAssignDistrictId(null)')
  })

  it('closePharmacyModal resets both search states', async () => {
    const src      = await districtsSrc()
    const closeIdx = src.indexOf('const closePharmacyModal')
    const block    = src.slice(closeIdx, closeIdx + 300)
    expect(block).toContain("setPharmSearch('')")
    expect(block).toContain("setPharmSearchAssigned('')")
  })

  it('closePharmacyModal resets both confirm states', async () => {
    const src      = await districtsSrc()
    const closeIdx = src.indexOf('const closePharmacyModal')
    const block    = src.slice(closeIdx, closeIdx + 300)
    expect(block).toContain('setPharmRemoveConfirm(null)')
    expect(block).toContain('setPharmMoveConfirm(null)')
  })

  it('Done button calls closePharmacyModal', async () => {
    const src     = await districtsSrc()
    const doneIdx = src.indexOf('>Done<')
    expect(doneIdx).toBeGreaterThan(-1)
    // The style object between onClick and >Done< can span ~250 chars — use a 350-char window
    const block   = src.slice(Math.max(0, doneIdx - 350), doneIdx + 10)
    expect(block).toContain('closePharmacyModal')
  })
})

// ════════════════════════════════════════════════════════════
// 17. No Phase 1B-3 sync logic
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — no assignedPharmacyIds sync logic', () => {
  it('DistrictsPage does not contain recomputeAssignedPharmacyIds', async () => {
    const src = await districtsSrc()
    expect(src).not.toContain('recomputeAssignedPharmacyIds')
  })

  it('DistrictsPage does not write assignedPharmacyIds directly', async () => {
    const src = await districtsSrc()
    expect(src).not.toContain('assignedPharmacyIds')
  })
})

// ════════════════════════════════════════════════════════════
// 18. No Scope Resolver logic
// ════════════════════════════════════════════════════════════

describe('Phase 1B-2C — no Scope Resolver logic', () => {
  it('DistrictsPage does not contain accessScopes', async () => {
    const src = await districtsSrc()
    expect(src).not.toContain('accessScopes')
  })

  it('DistrictsPage does not contain resolveScope', async () => {
    const src = await districtsSrc()
    expect(src).not.toContain('resolveScope')
  })
})
