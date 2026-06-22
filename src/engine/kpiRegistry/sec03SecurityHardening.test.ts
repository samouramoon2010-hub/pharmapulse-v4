// ============================================================
// Security Hardening Sprint 1 — Regression Tests
// Sprint: RBAC Hardening Fix 1–4
//
// Source-level tests (raw imports) — no Firestore emulator required.
// Verify that rule text and client code match the hardened security model.
// ============================================================

import { describe, it, expect } from 'vitest'

async function rulesSrc() {
  return (await import('../../../firestore.rules?raw')).default
}

async function authStoreSrc() {
  return (await import('../../store/authStore.js?raw')).default
}

// ── helpers ───────────────────────────────────────────────────

function extractBlock(src: string, startMarker: string, nextMatchSuffix = 'match /'): string {
  const start = src.indexOf(startMarker)
  if (start === -1) return ''
  const end = src.indexOf(nextMatchSuffix, start + startMarker.length)
  return end === -1 ? src.slice(start) : src.slice(start, end)
}

function usersBlock(src: string): string {
  return extractBlock(src, 'match /users/')
}

function kpiEntriesBlock(src: string): string {
  return extractBlock(src, 'match /kpi_entries/')
}

// ════════════════════════════════════════════════════════════
// 1–5: FIX 1 + FIX 2 — Users self-update field whitelist
// ════════════════════════════════════════════════════════════

describe('Fix 1 — firestore.rules: users self-update field whitelist', () => {
  it('1. update rule uses affectedKeys().hasOnly() to whitelist allowed fields', async () => {
    const src   = await rulesSrc()
    const block = usersBlock(src)
    expect(block).toContain('affectedKeys()')
    expect(block).toContain('hasOnly(')
  })

  it('2. self-update whitelist includes displayName and phone (safe display fields)', async () => {
    const src   = await rulesSrc()
    const block = usersBlock(src)
    expect(block).toContain("'displayName'")
    expect(block).toContain("'phone'")
  })

  it('3. self-update whitelist includes updatedAt and lastLoginAt (server timestamps)', async () => {
    const src   = await rulesSrc()
    const block = usersBlock(src)
    expect(block).toContain("'updatedAt'")
    expect(block).toContain("'lastLoginAt'")
  })

  it('4. self-update whitelist does NOT include role, active, pharmacyId', async () => {
    const src   = await rulesSrc()
    const block = usersBlock(src)
    // The whitelist array in hasOnly() should not contain sensitive fields
    const hasOnlyStart  = block.indexOf('hasOnly(')
    const hasOnlyEnd    = block.indexOf(')', hasOnlyStart)
    const hasOnlyClause = block.slice(hasOnlyStart, hasOnlyEnd + 1)
    expect(hasOnlyClause).not.toContain("'role'")
    expect(hasOnlyClause).not.toContain("'active'")
    expect(hasOnlyClause).not.toContain("'pharmacyId'")
    expect(hasOnlyClause).not.toContain("'regionIds'")
    expect(hasOnlyClause).not.toContain("'districtId'")
  })

  it('5. admin update path is unrestricted (isAdmin() branch exists independently)', async () => {
    const src   = await rulesSrc()
    const block = usersBlock(src)
    // Admin branch must exist as a top-level OR before the self-update branch
    expect(block).toContain('allow update: if isAdmin()')
  })

  it('5b. old unrestricted self-update rule is removed', async () => {
    const src   = await rulesSrc()
    const block = usersBlock(src)
    // The original open rule that allowed any field — must not exist
    expect(block).not.toContain('isAny() && (uid() == userId || isAdmin())')
  })
})

// ════════════════════════════════════════════════════════════
// Fix 2 — authStore.js: client-side defense in depth
// ════════════════════════════════════════════════════════════

describe('Fix 2 — authStore.js: SELF_UPDATE_WHITELIST filters updateProfile()', () => {
  it('SELF_UPDATE_WHITELIST constant is defined', async () => {
    const src = await authStoreSrc()
    expect(src).toContain('SELF_UPDATE_WHITELIST')
  })

  it('SELF_UPDATE_WHITELIST contains displayName and phone', async () => {
    const src = await authStoreSrc()
    expect(src).toContain("SELF_UPDATE_WHITELIST = ['displayName', 'phone']")
  })

  it('updateProfile filters data through SELF_UPDATE_WHITELIST before writing', async () => {
    const src = await authStoreSrc()
    expect(src).toContain('SELF_UPDATE_WHITELIST.includes(k)')
  })

  it('updateProfile writes safe (filtered) object, not raw data spread', async () => {
    const src = await authStoreSrc()
    // safe object with updatedAt is written — not the raw { ...data } spread
    expect(src).toContain('...safe, updatedAt: serverTimestamp()')
    expect(src).not.toContain('...data, updatedAt: serverTimestamp()')
  })

  it('userProfile in-memory state is updated with filtered safe object, not raw data', async () => {
    const src = await authStoreSrc()
    expect(src).toContain('{ ...userProfile, ...safe }')
    expect(src).not.toContain('{ ...userProfile, ...data }')
  })
})

// ════════════════════════════════════════════════════════════
// 6–8: FIX 3 — kpi_entries read scope
// ════════════════════════════════════════════════════════════

describe('Fix 3 — firestore.rules: kpi_entries read scope (no cross-branch leak)', () => {
  it('6. manager cannot read kpi_entries outside own pharmacy — standalone isMgr() removed from read rule', async () => {
    const src   = await rulesSrc()
    const block = kpiEntriesBlock(src)
    // Extract only the allow read clause
    const readStart = block.indexOf('allow read:')
    const readEnd   = block.indexOf(';', readStart)
    const readClause = block.slice(readStart, readEnd + 1)
    expect(readClause).not.toContain('isMgr()')
  })

  it('7. manager can read kpi_entries inside own pharmacy — ownsPharmacy() still in read rule', async () => {
    const src   = await rulesSrc()
    const block = kpiEntriesBlock(src)
    const readStart  = block.indexOf('allow read:')
    const readEnd    = block.indexOf(';', readStart)
    const readClause = block.slice(readStart, readEnd + 1)
    expect(readClause).toContain('ownsPharmacy(resource.data.pharmacyId)')
  })

  it('8. pharmacist can read own kpi_entries — userId == uid() still in read rule', async () => {
    const src   = await rulesSrc()
    const block = kpiEntriesBlock(src)
    const readStart  = block.indexOf('allow read:')
    const readEnd    = block.indexOf(';', readStart)
    const readClause = block.slice(readStart, readEnd + 1)
    expect(readClause).toContain('resource.data.userId == uid()')
  })
})

// ════════════════════════════════════════════════════════════
// 9–10: FIX 4 — kpi_entries delete scope
// ════════════════════════════════════════════════════════════

describe('Fix 4 — firestore.rules: kpi_entries delete scope', () => {
  it('9. pharmacist cannot delete own kpi_entries — delete does not use userId == uid()', async () => {
    const src   = await rulesSrc()
    const block = kpiEntriesBlock(src)
    const delStart  = block.indexOf('allow delete:')
    const delEnd    = block.indexOf(';', delStart)
    const delClause = block.slice(delStart, delEnd + 1)
    // Pharmacist self-delete pattern must not appear in delete rule
    expect(delClause).not.toContain('resource.data.userId == uid()')
    expect(delClause).not.toContain('isAny()')
  })

  it('10. delete is restricted to ownsPharmacy (admin + branch-owning manager only)', async () => {
    const src   = await rulesSrc()
    const block = kpiEntriesBlock(src)
    const delStart  = block.indexOf('allow delete:')
    const delEnd    = block.indexOf(';', delStart)
    const delClause = block.slice(delStart, delEnd + 1)
    expect(delClause).toContain('ownsPharmacy(resource.data.pharmacyId)')
  })
})
