// ============================================================
// Phase 3A-1A — Supervisor Target Management
//
// Verifies:
//   1. Firestore rules extended for territory roles (source audit)
//   2. TargetsPage imports scopeResolver
//   3. handleSave contains isPharmacyAllowed guard
//   4. handleDelete contains isPharmacyAllowed guard
//   5. TargetFormModal receives allowedPharmacies (scoped)
//   6. canDelete = isAdmin (delete remains admin-only)
//   7. Bulk entry still admin-only
//   8. Scope fixture behavior via filterAllowedPharmacies
//   9. Guardrails: no new routes, no new pages, no UsersPage changes
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  filterAllowedPharmacies,
  isPharmacyAllowed,
} from '../../services/scopeResolver'
import type { PharmacyScope } from '../../services/scopeResolver'

const targetsPageSrc  = () => import('./TargetsPage.jsx?raw').then((m) => m.default)
const firestoreRules  = () => import('../../../firestore.rules?raw').then((m) => m.default)
const appSrc          = () => import('../../App.jsx?raw').then((m) => m.default)

// ── Fixture data ──────────────────────────────────────────
const PHARMACIES = [
  { id: 'ph-a', name: 'Alpha', active: true },
  { id: 'ph-b', name: 'Beta',  active: true },
  { id: 'ph-c', name: 'Gamma', active: true },
]

// ════════════════════════════════════════════════════════════
// 1. Firestore rules — territory role read/write
// ════════════════════════════════════════════════════════════

describe('3A-1A Firestore rules — targets collection', () => {
  it('isTerritoryMgr() helper is defined', async () => {
    const r = await firestoreRules()
    expect(r).toContain('function isTerritoryMgr()')
    expect(r).toContain('isSupervisorRole() || isRegionalMgrRole()')
  })

  it('targets read rule includes isTerritoryMgr() + assignedPharmacyIds', async () => {
    const r = await firestoreRules()
    const tidIdx = r.indexOf('match /targets/{tid}')
    expect(tidIdx).toBeGreaterThan(-1)
    const block = r.slice(tidIdx, tidIdx + 600)
    expect(block).toContain('isTerritoryMgr()')
    expect(block).toContain("assignedPharmacyIds")
    expect(block).toContain('allow read:')
  })

  it('targets create rule includes isTerritoryMgr() territory check', async () => {
    const r = await firestoreRules()
    const tidIdx = r.indexOf('match /targets/{tid}')
    const block = r.slice(tidIdx, tidIdx + 600)
    expect(block).toContain('allow create:')
    // Must include both the existing isMgr() path and new territory path
    expect(block).toContain('isMgr()')
    expect(block).toContain('isTerritoryMgr()')
  })

  it('targets update rule includes isTerritoryMgr() territory check', async () => {
    const r = await firestoreRules()
    const tidIdx = r.indexOf('match /targets/{tid}')
    const block = r.slice(tidIdx, tidIdx + 600)
    expect(block).toContain('allow update:')
    expect(block).toContain('isTerritoryMgr()')
  })

  it('targets delete remains admin-only (no isTerritoryMgr on delete)', async () => {
    const r = await firestoreRules()
    const tidIdx = r.indexOf('match /targets/{tid}')
    expect(tidIdx).toBeGreaterThan(-1)
    const block = r.slice(tidIdx, tidIdx + 900)
    const deleteIdx = block.indexOf('allow delete:')
    expect(deleteIdx).toBeGreaterThan(-1)
    const deleteLine = block.slice(deleteIdx, deleteIdx + 60)
    expect(deleteLine).toContain('isAdmin()')
    expect(deleteLine).not.toContain('isTerritoryMgr')
  })

  it('Phase 3A-1A marker present in targets rule comment', async () => {
    const r = await firestoreRules()
    expect(r).toContain('Phase 3A-1A')
  })
})

// ════════════════════════════════════════════════════════════
// 2. TargetsPage — scopeResolver imports
// ════════════════════════════════════════════════════════════

describe('3A-1A TargetsPage — scopeResolver wiring', () => {
  it('imports filterAllowedPharmacies and isPharmacyAllowed from scopeResolver', async () => {
    const s = await targetsPageSrc()
    expect(s).toContain('filterAllowedPharmacies')
    expect(s).toContain('isPharmacyAllowed')
    expect(s).toContain("from '../../services/scopeResolver'")
  })

  it('computes allowedPharmacies from scope', async () => {
    const s = await targetsPageSrc()
    expect(s).toContain('allowedPharmacies = scope ?')
    expect(s).toContain('filterAllowedPharmacies(scope, pharmacies)')
  })

  it('passes allowedPharmacies to TargetFormModal (not raw pharmacies)', async () => {
    const s = await targetsPageSrc()
    const modalIdx = s.indexOf('<TargetFormModal')
    expect(modalIdx).toBeGreaterThan(-1)
    const block = s.slice(modalIdx, modalIdx + 400)
    expect(block).toContain('pharmacies={allowedPharmacies}')
    expect(block).not.toContain('pharmacies={pharmacies}')
  })
})

// ════════════════════════════════════════════════════════════
// 3. Service guards — isPharmacyAllowed before write
// ════════════════════════════════════════════════════════════

describe('3A-1A TargetsPage — service-layer guards', () => {
  it('handleSave contains isPharmacyAllowed guard', async () => {
    const s = await targetsPageSrc()
    const saveIdx = s.indexOf('const handleSave = async')
    expect(saveIdx).toBeGreaterThan(-1)
    const block = s.slice(saveIdx, saveIdx + 300)
    expect(block).toContain('isPharmacyAllowed(scope, form.pharmacyId)')
  })

  it('handleSave guard fires before saveTarget call', async () => {
    const s = await targetsPageSrc()
    const saveIdx = s.indexOf('const handleSave = async')
    const block = s.slice(saveIdx, saveIdx + 400)
    const guardIdx = block.indexOf('isPharmacyAllowed')
    const saveTargetIdx = block.indexOf('saveTarget(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(saveTargetIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(saveTargetIdx)
  })

  it('handleDelete contains isPharmacyAllowed guard', async () => {
    const s = await targetsPageSrc()
    const deleteIdx = s.indexOf('const handleDelete = async')
    expect(deleteIdx).toBeGreaterThan(-1)
    const block = s.slice(deleteIdx, deleteIdx + 200)
    expect(block).toContain('isPharmacyAllowed(scope, target.pharmacyId)')
  })

  it('handleDelete guard fires before deleteTarget call', async () => {
    const s = await targetsPageSrc()
    const deleteIdx = s.indexOf('const handleDelete = async')
    const block = s.slice(deleteIdx, deleteIdx + 300)
    const guardIdx = block.indexOf('isPharmacyAllowed')
    const deleteTargetIdx = block.indexOf('deleteTarget(')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(deleteTargetIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(deleteTargetIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 4. Delete / Bulk controls
// ════════════════════════════════════════════════════════════

describe('3A-1A TargetsPage — delete and bulk remain restricted', () => {
  it('canDelete is isAdmin (delete admin-only)', async () => {
    const s = await targetsPageSrc()
    expect(s).toContain('canDelete = isAdmin')
  })

  it('hideDelete passed as !canDelete to TargetCard', async () => {
    const s = await targetsPageSrc()
    expect(s).toContain('hideDelete={!canDelete}')
  })

  it('TargetCard Delete button filtered by hideDelete', async () => {
    const s = await targetsPageSrc()
    expect(s).toContain(".filter(a => !(a.title === 'Delete' && hideDelete))")
  })

  it('Bulk Entry button gated by isAdmin', async () => {
    const s = await targetsPageSrc()
    // isAdmin gates setShowBulk — both must be within 200 chars of each other
    const showBulkIdx = s.indexOf('setShowBulk(true)')
    expect(showBulkIdx).toBeGreaterThan(-1)
    // Look 200 chars before the bulk trigger for the isAdmin guard
    const block = s.slice(Math.max(0, showBulkIdx - 200), showBulkIdx + 20)
    expect(block).toContain('isAdmin')
  })
})

// ════════════════════════════════════════════════════════════
// 5. Scope fixture behavior — filterAllowedPharmacies
// ════════════════════════════════════════════════════════════

describe('3A-1A scope fixtures — supervisor territory filtering', () => {
  it("supervisor 'list' scope reads only assigned pharmacies", () => {
    const scope: PharmacyScope = { type: 'list', ids: ['ph-a', 'ph-b'] }
    const result = filterAllowedPharmacies(scope, PHARMACIES)
    expect(result.map(p => p.id).sort()).toEqual(['ph-a', 'ph-b'])
    expect(result.map(p => p.id)).not.toContain('ph-c')
  })

  it("supervisor denied foreign target pharmacy", () => {
    const scope: PharmacyScope = { type: 'list', ids: ['ph-a'] }
    expect(isPharmacyAllowed(scope, 'ph-b')).toBe(false)
    expect(isPharmacyAllowed(scope, 'ph-c')).toBe(false)
  })

  it("supervisor allowed own-territory target pharmacy", () => {
    const scope: PharmacyScope = { type: 'list', ids: ['ph-a', 'ph-c'] }
    expect(isPharmacyAllowed(scope, 'ph-a')).toBe(true)
    expect(isPharmacyAllowed(scope, 'ph-c')).toBe(true)
  })

  it("regional_manager 'list' scope reads only assigned pharmacies", () => {
    const scope: PharmacyScope = { type: 'list', ids: ['ph-b', 'ph-c'] }
    const result = filterAllowedPharmacies(scope, PHARMACIES)
    expect(result.map(p => p.id).sort()).toEqual(['ph-b', 'ph-c'])
    expect(result.map(p => p.id)).not.toContain('ph-a')
  })

  it("admin 'all' scope can create target in any pharmacy", () => {
    const scope: PharmacyScope = { type: 'all' }
    expect(isPharmacyAllowed(scope, 'ph-a')).toBe(true)
    expect(isPharmacyAllowed(scope, 'ph-b')).toBe(true)
    expect(isPharmacyAllowed(scope, 'ph-c')).toBe(true)
  })

  it("manager 'single' scope creates target only for own pharmacy", () => {
    const scope: PharmacyScope = { type: 'single', id: 'ph-b' }
    expect(isPharmacyAllowed(scope, 'ph-b')).toBe(true)
    expect(isPharmacyAllowed(scope, 'ph-a')).toBe(false)
  })

  it("supervisor with empty assignedPharmacyIds gets no targets", () => {
    const scope: PharmacyScope = { type: 'list', ids: [] }
    const result = filterAllowedPharmacies(scope, PHARMACIES)
    expect(result).toHaveLength(0)
  })

  it("scope 'none' denies all pharmacy access", () => {
    const scope: PharmacyScope = { type: 'none' }
    expect(isPharmacyAllowed(scope, 'ph-a')).toBe(false)
    expect(isPharmacyAllowed(scope, 'ph-b')).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// 6. Guardrails
// ════════════════════════════════════════════════════════════

describe('3A-1A guardrails — no new routes, no new pages', () => {
  it('App.jsx not modified by Phase 3A-1A', async () => {
    const s = await appSrc()
    expect(s).not.toContain('Phase 3A-1A')
  })

  it('No new /supervisor-targets route in App.jsx', async () => {
    const s = await appSrc()
    expect(s).not.toContain('/supervisor-targets')
  })

  it('Firestore rules not modified for users collection in Phase 3A-1A', async () => {
    const r = await firestoreRules()
    expect(r).not.toContain('Phase 3A-1A — users')
  })

  it('isViewOnly removed from TargetsPage (supervisor is writable)', async () => {
    const s = await targetsPageSrc()
    expect(s).not.toContain("isViewOnly = scope?.type === 'list'")
    expect(s).not.toContain('isViewOnly')
  })
})
