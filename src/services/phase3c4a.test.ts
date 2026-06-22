// ============================================================
// Phase 3C-4A — Action History Foundation
//
// Verifies:
//  1.  firestore.rules has actionHistory collection block
//  2.  actionHistory allow update: if false (immutable)
//  3.  actionHistory delete: admin only
//  4.  recordActionHistory function exists in actionService.js
//  5.  recordActionHistory is NOT exported
//  6.  recordActionHistory uses addDoc
//  7.  recordActionHistory uses serverTimestamp
//  8.  recordActionHistory is wrapped in try/catch
//  9.  catch block swallows errors (console.error only, no rethrow)
// 10.  no engine imports in actionService
// 11.  no dashboard imports in actionService
// 12.  no dynamicKpi imports in actionService
// 13.  no AI imports in actionService
// 14.  no signal generation in actionService
// 15.  createSuggestedAction does NOT call recordActionHistory
// 16.  acceptAction does NOT call recordActionHistory
// 17.  dismissAction does NOT call recordActionHistory
// 18.  closeAction does NOT call recordActionHistory
// ============================================================

import { describe, it, expect } from 'vitest'

const rulesSrc   = () => import('../../firestore.rules?raw').then((m) => m.default)
const serviceSrc = () => import('./actionService.js?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1-3. Firestore rules — actionHistory block
// ════════════════════════════════════════════════════════════

describe('3C-4A Firestore rules — actionHistory collection', () => {
  it('actionHistory collection block exists (test 1)', async () => {
    const r = await rulesSrc()
    expect(r).toContain('match /actionHistory/{histId}')
  })

  it('actionHistory allow update: if false (test 2)', async () => {
    const r = await rulesSrc()
    const idx = r.indexOf('match /actionHistory/{histId}')
    expect(idx).toBeGreaterThan(-1)
    // Window 1400: read + create blocks with CRLF overhead push update/delete past 800
    const block = r.slice(idx, idx + 1400)
    expect(block).toContain('allow update: if false')
  })

  it('actionHistory delete is admin-only (test 3)', async () => {
    const r = await rulesSrc()
    const idx = r.indexOf('match /actionHistory/{histId}')
    expect(idx).toBeGreaterThan(-1)
    const block = r.slice(idx, idx + 1400)
    const deleteIdx = block.indexOf('allow delete:')
    expect(deleteIdx).toBeGreaterThan(-1)
    const deleteLine = block.slice(deleteIdx, deleteIdx + 40)
    expect(deleteLine).toContain('isAdmin()')
  })
})

// ════════════════════════════════════════════════════════════
// 4-9. Private helper in actionService.js
// ════════════════════════════════════════════════════════════

describe('3C-4A actionService — recordActionHistory helper', () => {
  it('recordActionHistory function is defined (test 4)', async () => {
    const s = await serviceSrc()
    expect(s).toContain('async function recordActionHistory(')
  })

  it('recordActionHistory is NOT exported (test 5)', async () => {
    const s = await serviceSrc()
    // The function must not have export in front of it
    expect(s).not.toContain('export async function recordActionHistory')
    expect(s).not.toContain('export function recordActionHistory')
    // Function is defined (private)
    expect(s).toContain('async function recordActionHistory(')
  })

  it("recordActionHistory writes to 'actionHistory' collection with addDoc (test 6)", async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('async function recordActionHistory(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 600)
    expect(block).toContain('addDoc')
    expect(block).toContain("'actionHistory'")
  })

  it('recordActionHistory uses serverTimestamp for changedAt (test 7)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('async function recordActionHistory(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 600)
    expect(block).toContain('serverTimestamp()')
    expect(block).toContain('changedAt')
  })

  it('recordActionHistory body is wrapped in try/catch (test 8)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('async function recordActionHistory(')
    expect(idx).toBeGreaterThan(-1)
    // Window 1000: function body with CRLF overhead exceeds 700 chars
    const block = s.slice(idx, idx + 1000)
    expect(block).toContain('try {')
    expect(block).toContain('} catch (')
  })

  it('catch block swallows error — no rethrow (test 9)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('async function recordActionHistory(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1000)
    const catchIdx = block.indexOf('} catch (')
    expect(catchIdx).toBeGreaterThan(-1)
    const catchBody = block.slice(catchIdx, catchIdx + 150)
    // Must log the error
    expect(catchBody).toContain('console.error')
    // Must NOT rethrow
    expect(catchBody).not.toContain('throw ')
  })
})

// ════════════════════════════════════════════════════════════
// 10-14. Guardrails — actionService.js
// ════════════════════════════════════════════════════════════

describe('3C-4A guardrails — actionService.js', () => {
  it('no engine imports in actionService (test 10)', async () => {
    const s = await serviceSrc()
    expect(s).not.toContain("from '../engine'")
    expect(s).not.toContain("from '../../engine'")
    expect(s).not.toContain('executiveScore')
    expect(s).not.toContain('pharmacistPerformanceEngine')
  })

  it('no dashboard imports in actionService (test 11)', async () => {
    const s = await serviceSrc()
    expect(s).not.toContain('DashboardPage')
    expect(s).not.toContain('/dashboard')
  })

  it('no dynamicKpi imports in actionService (test 12)', async () => {
    const s = await serviceSrc()
    expect(s).not.toContain('dynamicKpi')
    expect(s).not.toContain('DynamicKpi')
    expect(s).not.toContain('kpiRegistry')
  })

  it('no AI imports in actionService (test 13)', async () => {
    const s = await serviceSrc()
    expect(s).not.toContain('openai')
    expect(s).not.toContain('anthropic')
    expect(s).not.toContain('gemini')
    expect(s).not.toContain('gpt')
  })

  it('no signal generation in actionService (test 14)', async () => {
    const s = await serviceSrc()
    expect(s).not.toContain('generateSignal')
    expect(s).not.toContain('detectSignal')
    expect(s).not.toContain('signalEngine')
  })
})

// ════════════════════════════════════════════════════════════
// 15-18. Exports call recordActionHistory (wired in 3C-4B)
// ════════════════════════════════════════════════════════════

describe('3C-4A/3C-4B — exports call recordActionHistory after primary write', () => {
  it('createSuggestedAction calls recordActionHistory (test 15)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function createSuggestedAction(')
    expect(idx).toBeGreaterThan(-1)
    const nextIdx = s.indexOf('export async function', idx + 1)
    const block = s.slice(idx, nextIdx > idx ? nextIdx : idx + 700)
    expect(block).toContain('recordActionHistory')
  })

  it('acceptAction calls recordActionHistory (test 16)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function acceptAction(')
    expect(idx).toBeGreaterThan(-1)
    const nextIdx = s.indexOf('export async function', idx + 1)
    const block = s.slice(idx, nextIdx > idx ? nextIdx : idx + 700)
    expect(block).toContain('recordActionHistory')
  })

  it('dismissAction calls recordActionHistory (test 17)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function dismissAction(')
    expect(idx).toBeGreaterThan(-1)
    const nextIdx = s.indexOf('export async function', idx + 1)
    const block = s.slice(idx, nextIdx > idx ? nextIdx : idx + 700)
    expect(block).toContain('recordActionHistory')
  })

  it('closeAction calls recordActionHistory (test 18)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function closeAction(')
    expect(idx).toBeGreaterThan(-1)
    const nextIdx = s.indexOf('export async function addRecoveryObservation(')
    const block = s.slice(idx, nextIdx > idx ? nextIdx : idx + 700)
    expect(block).toContain('recordActionHistory')
  })
})
