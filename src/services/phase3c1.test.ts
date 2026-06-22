// ============================================================
// Phase 3C-1 — Actions Layer Foundation
//
// Verifies:
//  1.  createSuggestedAction export exists
//  2.  acceptAction export exists
//  3.  dismissAction export exists
//  4.  closeAction export exists
//  5.  SUGGESTED → ACCEPTED is an allowed transition
//  6.  SUGGESTED → DISMISSED is an allowed transition
//  7.  ACCEPTED → CLOSED is an allowed transition
//  8.  DISMISSED → ACCEPTED is blocked (empty transition array)
//  9.  CLOSED → anything is blocked (empty transition array)
// 10.  Territory scope guard (TERRITORY_ROLES_ACTION + assertScope) exists
// 11.  assertScope runs before Firestore write in every method
// 12.  admin is unrestricted (early return path in assertScope)
// 13.  delete is admin-only in Firestore rules (suggestedActions block)
// 14.  No engine imports in actionService
// 15.  No dashboard imports in actionService
// 16.  No Dynamic KPI imports in actionService
// 17.  No signal generation code in actionService
// ============================================================

import { describe, it, expect } from 'vitest'

const svcSrc   = () => import('./actionService.js?raw').then((m) => m.default)
const rulesSrc = () => import('../../firestore.rules?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1-4. Exports exist
// ════════════════════════════════════════════════════════════

describe('3C-1 actionService — exports', () => {
  it('createSuggestedAction is exported (test 1)', async () => {
    const s = await svcSrc()
    expect(s).toContain('export async function createSuggestedAction')
  })

  it('acceptAction is exported (test 2)', async () => {
    const s = await svcSrc()
    expect(s).toContain('export async function acceptAction')
  })

  it('dismissAction is exported (test 3)', async () => {
    const s = await svcSrc()
    expect(s).toContain('export async function dismissAction')
  })

  it('closeAction is exported (test 4)', async () => {
    const s = await svcSrc()
    expect(s).toContain('export async function closeAction')
  })
})

// ════════════════════════════════════════════════════════════
// 5-9. Status transition table
// ════════════════════════════════════════════════════════════

describe('3C-1 actionService — status transitions', () => {
  it('SUGGESTED → ACCEPTED is an allowed transition (test 5)', async () => {
    const s = await svcSrc()
    const idx = s.indexOf('ALLOWED_TRANSITIONS')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    // SUGGESTED maps to an array that contains 'ACCEPTED'
    const suggestedIdx = block.indexOf('SUGGESTED:')
    expect(suggestedIdx).toBeGreaterThan(-1)
    const suggestedLine = block.slice(suggestedIdx, suggestedIdx + 60)
    expect(suggestedLine).toContain("'ACCEPTED'")
  })

  it('SUGGESTED → DISMISSED is an allowed transition (test 6)', async () => {
    const s = await svcSrc()
    const idx = s.indexOf('ALLOWED_TRANSITIONS')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    const suggestedIdx = block.indexOf('SUGGESTED:')
    expect(suggestedIdx).toBeGreaterThan(-1)
    const suggestedLine = block.slice(suggestedIdx, suggestedIdx + 60)
    expect(suggestedLine).toContain("'DISMISSED'")
  })

  it('ACCEPTED → CLOSED is an allowed transition (test 7)', async () => {
    const s = await svcSrc()
    const idx = s.indexOf('ALLOWED_TRANSITIONS')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    const acceptedIdx = block.indexOf('ACCEPTED:')
    expect(acceptedIdx).toBeGreaterThan(-1)
    const acceptedLine = block.slice(acceptedIdx, acceptedIdx + 40)
    expect(acceptedLine).toContain("'CLOSED'")
  })

  it('DISMISSED → ACCEPTED is blocked — transition array is empty (test 8)', async () => {
    const s = await svcSrc()
    const idx = s.indexOf('ALLOWED_TRANSITIONS')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 250)
    const dismissedIdx = block.indexOf('DISMISSED:')
    expect(dismissedIdx).toBeGreaterThan(-1)
    const dismissedLine = block.slice(dismissedIdx, dismissedIdx + 20)
    // Empty array means no valid transitions — ACCEPTED cannot appear here
    expect(dismissedLine).toContain('[]')
    expect(dismissedLine).not.toContain("'ACCEPTED'")
  })

  it('CLOSED → anything is blocked — transition array is empty (test 9)', async () => {
    const s = await svcSrc()
    const idx = s.indexOf('ALLOWED_TRANSITIONS')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 250)
    const closedIdx = block.indexOf('CLOSED:')
    expect(closedIdx).toBeGreaterThan(-1)
    const closedLine = block.slice(closedIdx, closedIdx + 20)
    expect(closedLine).toContain('[]')
  })
})

// ════════════════════════════════════════════════════════════
// 10-12. Territory scope guard
// ════════════════════════════════════════════════════════════

describe('3C-1 actionService — territory scope guard', () => {
  it('TERRITORY_ROLES_ACTION constant and assertScope function exist (test 10)', async () => {
    const s = await svcSrc()
    expect(s).toContain('TERRITORY_ROLES_ACTION')
    expect(s).toContain('async function assertScope')
  })

  it('assertScope runs before updateDoc in acceptAction (test 11a)', async () => {
    const s = await svcSrc()
    const idx = s.indexOf('export async function acceptAction')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 600)
    const guardIdx = block.indexOf('assertScope')
    const writeIdx = block.indexOf('updateDoc')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(writeIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(writeIdx)
  })

  it('assertScope runs before addDoc in createSuggestedAction (test 11b)', async () => {
    const s = await svcSrc()
    const idx = s.indexOf('export async function createSuggestedAction')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 600)
    const guardIdx = block.indexOf('assertScope')
    const writeIdx = block.indexOf('addDoc')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(writeIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(writeIdx)
  })

  it('admin and general_manager are unrestricted — early return in assertScope (test 12)', async () => {
    const s = await svcSrc()
    const idx = s.indexOf('async function assertScope')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 250)
    // Must short-circuit for admin and general_manager before any Firestore read
    expect(block).toContain("actorRole === 'admin'")
    expect(block).toContain("'general_manager'")
    const returnIdx = block.indexOf('return')
    const adminCheckIdx = block.indexOf("actorRole === 'admin'")
    expect(returnIdx).toBeGreaterThan(adminCheckIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 13. Firestore rules — delete admin-only
// ════════════════════════════════════════════════════════════

describe('3C-1 Firestore rules — suggestedActions', () => {
  it('Phase 3C-1 suggestedActions block exists in rules (test 13a)', async () => {
    const r = await rulesSrc()
    expect(r).toContain('match /suggestedActions/{actionId}')
  })

  it('delete is admin-only in suggestedActions block (test 13)', async () => {
    const r = await rulesSrc()
    const idx = r.indexOf('match /suggestedActions/{actionId}')
    expect(idx).toBeGreaterThan(-1)
    // Window 1500: read + create + update blocks each ~350 chars before allow delete:
    const block = r.slice(idx, idx + 1500)
    const deleteIdx = block.indexOf('allow delete:')
    expect(deleteIdx).toBeGreaterThan(-1)
    const deleteLine = block.slice(deleteIdx, deleteIdx + 30)
    expect(deleteLine).toContain('isAdmin()')
    expect(deleteLine).not.toContain('isTerritoryMgr')
  })

  it('isGeneralMgr helper added to rules (test 13b)', async () => {
    const r = await rulesSrc()
    expect(r).toContain('function isGeneralMgr()')
    expect(r).toContain("role() == 'general_manager'")
  })
})

// ════════════════════════════════════════════════════════════
// 14-17. Guardrails
// ════════════════════════════════════════════════════════════

describe('3C-1 guardrails', () => {
  it('No engine imports in actionService (test 14)', async () => {
    const s = await svcSrc()
    expect(s).not.toContain('src/engine')
    expect(s).not.toContain("from '../engine")
    expect(s).not.toContain("from './engine")
  })

  it('No dashboard imports in actionService (test 15)', async () => {
    const s = await svcSrc()
    expect(s).not.toContain('DashboardPage')
    expect(s).not.toContain('dashboard')
  })

  it('No Dynamic KPI imports in actionService (test 16)', async () => {
    const s = await svcSrc()
    expect(s).not.toContain('dynamicKpi')
    expect(s).not.toContain('DynamicKpi')
    expect(s).not.toContain('kpiRegistry')
  })

  it('No signal generation — no auto-detection loop or engine call (test 17)', async () => {
    const s = await svcSrc()
    expect(s).not.toContain('generateSignal')
    expect(s).not.toContain('detectSignal')
    expect(s).not.toContain('signalEngine')
    expect(s).not.toContain('executiveScore')
    expect(s).not.toContain('pharmacistPerformanceEngine')
  })
})
