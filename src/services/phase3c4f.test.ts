// ============================================================
// Phase 3C-4F — History Wiring + Recovery Observations Tests
//
// Tests  1- 7: History wiring in actionService
// Tests  8-14: recoveryObservations Firestore rules
// Tests 15-21: Recovery service exports
// Tests 22-27: ActionCard inline recovery panel
// Tests 28-32: Page wiring (MyActionsPage + TasksPage)
// Tests 33-41: Guardrails
// ============================================================

import { describe, it, expect } from 'vitest'

const serviceSrc  = () => import('./actionService.js?raw').then((m) => m.default)
const rulesSrc    = () => import('../../firestore.rules?raw').then((m) => m.default)
const cardSrc     = () => import('../components/actions/ActionCard.jsx?raw').then((m) => m.default)
const myPageSrc   = () => import('../pages/actions/MyActionsPage.jsx?raw').then((m) => m.default)
const taskPageSrc = () => import('../pages/actions/TasksPage.jsx?raw').then((m) => m.default)
const appSrc      = () => import('../App.jsx?raw').then((m) => m.default)
const sidebarSrc  = () => import('../components/layout/Sidebar.jsx?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1-7. History wiring
// ════════════════════════════════════════════════════════════

describe('3C-4F — history wiring', () => {
  it('createSuggestedAction calls recordActionHistory after addDoc (test 1)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function createSuggestedAction(')
    expect(idx).toBeGreaterThan(-1)
    const nextIdx = s.indexOf('export async function', idx + 1)
    const block = s.slice(idx, nextIdx > idx ? nextIdx : idx + 600)
    // addDoc must come before recordActionHistory in the block
    const addDocIdx  = block.indexOf('await addDoc(')
    const historyIdx = block.indexOf('recordActionHistory(')
    expect(addDocIdx).toBeGreaterThan(-1)
    expect(historyIdx).toBeGreaterThan(-1)
    expect(historyIdx).toBeGreaterThan(addDocIdx)
  })

  it('acceptAction calls recordActionHistory after updateDoc (test 2)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function acceptAction(')
    expect(idx).toBeGreaterThan(-1)
    const nextIdx = s.indexOf('export async function', idx + 1)
    const block = s.slice(idx, nextIdx > idx ? nextIdx : idx + 600)
    const updateIdx  = block.indexOf('await updateDoc(')
    const historyIdx = block.indexOf('recordActionHistory(')
    expect(updateIdx).toBeGreaterThan(-1)
    expect(historyIdx).toBeGreaterThan(-1)
    expect(historyIdx).toBeGreaterThan(updateIdx)
  })

  it('dismissAction calls recordActionHistory after updateDoc (test 3)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function dismissAction(')
    expect(idx).toBeGreaterThan(-1)
    const nextIdx = s.indexOf('export async function', idx + 1)
    const block = s.slice(idx, nextIdx > idx ? nextIdx : idx + 700)
    const updateIdx  = block.indexOf('await updateDoc(')
    const historyIdx = block.indexOf('recordActionHistory(')
    expect(updateIdx).toBeGreaterThan(-1)
    expect(historyIdx).toBeGreaterThan(-1)
    expect(historyIdx).toBeGreaterThan(updateIdx)
  })

  it('closeAction calls recordActionHistory after updateDoc (test 4)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function closeAction(')
    expect(idx).toBeGreaterThan(-1)
    // closeAction is followed by addRecoveryObservation export
    const nextIdx = s.indexOf('export async function addRecoveryObservation(')
    const block = s.slice(idx, nextIdx > idx ? nextIdx : idx + 600)
    const updateIdx  = block.indexOf('await updateDoc(')
    const historyIdx = block.indexOf('recordActionHistory(')
    expect(updateIdx).toBeGreaterThan(-1)
    expect(historyIdx).toBeGreaterThan(-1)
    expect(historyIdx).toBeGreaterThan(updateIdx)
  })

  it('history failure does not throw — recordActionHistory has no rethrow (test 5)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('async function recordActionHistory(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 1000)
    const catchIdx = block.indexOf('} catch (')
    expect(catchIdx).toBeGreaterThan(-1)
    const catchBody = block.slice(catchIdx, catchIdx + 150)
    expect(catchBody).not.toContain('throw ')
  })

  it('recordActionHistory remains private — not exported (test 6)', async () => {
    const s = await serviceSrc()
    expect(s).not.toContain('export async function recordActionHistory')
    expect(s).not.toContain('export function recordActionHistory')
    expect(s).toContain('async function recordActionHistory(')
  })

  it('actionHistory allow update: if false is still in rules (test 7)', async () => {
    const r = await rulesSrc()
    const idx = r.indexOf('match /actionHistory/{histId}')
    expect(idx).toBeGreaterThan(-1)
    const block = r.slice(idx, idx + 1400)
    expect(block).toContain('allow update: if false')
  })
})

// ════════════════════════════════════════════════════════════
// 8-14. recoveryObservations rules
// ════════════════════════════════════════════════════════════

describe('3C-4F — recoveryObservations rules', () => {
  it('recoveryObservations collection block exists (test 8)', async () => {
    const r = await rulesSrc()
    expect(r).toContain('match /recoveryObservations/{docId}')
  })

  it('service uses setDoc for recoveryObservations (one per action) (test 9)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function addRecoveryObservation(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 600)
    expect(block).toContain('setDoc(')
    expect(block).toContain("'recoveryObservations'")
  })

  it('recoveryObservations read scoped by relatedPharmacyId (test 10)', async () => {
    const r = await rulesSrc()
    const idx = r.indexOf('match /recoveryObservations/{docId}')
    expect(idx).toBeGreaterThan(-1)
    // Window 1400: covers full block with CRLF overhead
    const block = r.slice(idx, idx + 1400)
    const readIdx = block.indexOf('allow read:')
    expect(readIdx).toBeGreaterThan(-1)
    const readSection = block.slice(readIdx, readIdx + 300)
    expect(readSection).toContain('relatedPharmacyId')
  })

  it('recoveryObservations create scoped by relatedPharmacyId (test 11)', async () => {
    const r = await rulesSrc()
    const idx = r.indexOf('match /recoveryObservations/{docId}')
    expect(idx).toBeGreaterThan(-1)
    const block = r.slice(idx, idx + 1400)
    const createIdx = block.indexOf('allow create:')
    expect(createIdx).toBeGreaterThan(-1)
    const createSection = block.slice(createIdx, createIdx + 300)
    expect(createSection).toContain('relatedPharmacyId')
  })

  it('recoveryObservations update scoped by relatedPharmacyId (test 12)', async () => {
    const r = await rulesSrc()
    const idx = r.indexOf('match /recoveryObservations/{docId}')
    expect(idx).toBeGreaterThan(-1)
    const block = r.slice(idx, idx + 1400)
    const updateIdx = block.indexOf('allow update:')
    expect(updateIdx).toBeGreaterThan(-1)
    const updateSection = block.slice(updateIdx, updateIdx + 300)
    expect(updateSection).toContain('relatedPharmacyId')
  })

  it('recoveryObservations delete is admin-only (test 13)', async () => {
    const r = await rulesSrc()
    const idx = r.indexOf('match /recoveryObservations/{docId}')
    expect(idx).toBeGreaterThan(-1)
    const block = r.slice(idx, idx + 1400)
    const deleteIdx = block.indexOf('allow delete:')
    expect(deleteIdx).toBeGreaterThan(-1)
    const deleteLine = block.slice(deleteIdx, deleteIdx + 40)
    expect(deleteLine).toContain('isAdmin()')
  })

  it('pharmacist is NOT in recoveryObservations create rule (test 14)', async () => {
    const r = await rulesSrc()
    const idx = r.indexOf('match /recoveryObservations/{docId}')
    expect(idx).toBeGreaterThan(-1)
    const block = r.slice(idx, idx + 1400)
    const createIdx = block.indexOf('allow create:')
    expect(createIdx).toBeGreaterThan(-1)
    const createSection = block.slice(createIdx, createIdx + 400)
    // pharmacist role must not appear in create rule
    expect(createSection).not.toContain("'pharmacist'")
    expect(createSection).not.toContain('"pharmacist"')
  })
})

// ════════════════════════════════════════════════════════════
// 15-21. Recovery service exports
// ════════════════════════════════════════════════════════════

describe('3C-4F — recovery service exports', () => {
  it('addRecoveryObservation is exported (test 15)', async () => {
    const s = await serviceSrc()
    expect(s).toContain('export async function addRecoveryObservation(')
  })

  it('markRecovered is exported (test 16)', async () => {
    const s = await serviceSrc()
    expect(s).toContain('export async function markRecovered(')
  })

  it('markNotRecovered is exported (test 17)', async () => {
    const s = await serviceSrc()
    expect(s).toContain('export async function markNotRecovered(')
  })

  it('addRecoveryObservation calls assertScope before setDoc (test 18)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function addRecoveryObservation(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 600)
    const scopeIdx  = block.indexOf('await assertScope(')
    const setDocIdx = block.indexOf('await setDoc(')
    expect(scopeIdx).toBeGreaterThan(-1)
    expect(setDocIdx).toBeGreaterThan(-1)
    expect(scopeIdx).toBeLessThan(setDocIdx)
  })

  it('markRecovered passes recovered: true (test 19)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function markRecovered(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('recovered: true')
  })

  it('markNotRecovered passes recovered: false (test 20)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function markNotRecovered(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('recovered: false')
  })

  it('addRecoveryObservation does NOT update suggestedActions collection (test 21)', async () => {
    const s = await serviceSrc()
    const idx = s.indexOf('export async function addRecoveryObservation(')
    expect(idx).toBeGreaterThan(-1)
    // Slice to end of addRecoveryObservation (before markRecovered)
    const nextIdx = s.indexOf('export async function markRecovered(')
    const block = s.slice(idx, nextIdx > idx ? nextIdx : idx + 700)
    // Must not reference the suggestedActions collection
    expect(block).not.toContain("'suggestedActions'")
    expect(block).not.toContain('ACTIONS_COL')
  })
})

// ════════════════════════════════════════════════════════════
// 22-27. ActionCard inline recovery panel
// ════════════════════════════════════════════════════════════

describe('3C-4F — ActionCard recovery panel', () => {
  it('accepted action close click opens recovery panel (test 22)', async () => {
    const s = await cardSrc()
    // Recovery panel is shown when recoveryExpanded is true
    expect(s).toContain('recoveryExpanded')
    // Close button triggers handleCloseClick which sets recoveryExpanded
    expect(s).toContain('handleCloseClick')
    expect(s).toContain('setRecoveryExpanded(true)')
  })

  it('Recovered button calls onClose with recovered: true (test 23)', async () => {
    const s = await cardSrc()
    expect(s).toContain('handleCloseRecovered')
    const idx = s.indexOf('function handleCloseRecovered(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 150)
    expect(block).toContain('recovered: true')
    expect(block).toContain('onClose(id,')
  })

  it('Not recovered button calls onClose with recovered: false (test 24)', async () => {
    const s = await cardSrc()
    expect(s).toContain('handleCloseNotRecovered')
    const idx = s.indexOf('function handleCloseNotRecovered(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 150)
    expect(block).toContain('recovered: false')
    expect(block).toContain('onClose(id,')
  })

  it('Close without recovery calls onClose without payload (test 25)', async () => {
    const s = await cardSrc()
    expect(s).toContain('handleCloseWithoutRecovery')
    const idx = s.indexOf('function handleCloseWithoutRecovery(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 150)
    // Calls onClose(id) — no second argument
    expect(block).toContain('onClose(id)')
  })

  it('Cancel collapses recovery panel (test 26)', async () => {
    const s = await cardSrc()
    expect(s).toContain('handleRecoveryCancel')
    const idx = s.indexOf('function handleRecoveryCancel(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 100)
    expect(block).toContain('setRecoveryExpanded(false)')
  })

  it('ActionCard does not import actionService (test 27)', async () => {
    const s = await cardSrc()
    expect(s).not.toContain("from '../../services/actionService'")
    expect(s).not.toContain("from '../services/actionService'")
    expect(s).not.toContain('actionService')
  })
})

// ════════════════════════════════════════════════════════════
// 28-32. Page wiring
// ════════════════════════════════════════════════════════════

describe('3C-4F — page wiring', () => {
  it('MyActionsPage imports markRecovered and markNotRecovered (test 28)', async () => {
    const s = await myPageSrc()
    expect(s).toContain('markRecovered')
    expect(s).toContain('markNotRecovered')
    expect(s).toContain("from '../../services/actionService'")
  })

  it('TasksPage imports markRecovered and markNotRecovered (test 29)', async () => {
    const s = await taskPageSrc()
    expect(s).toContain('markRecovered')
    expect(s).toContain('markNotRecovered')
    expect(s).toContain("from '../../services/actionService'")
  })

  it('MyActionsPage handleClose calls closeAction before recovery (test 30)', async () => {
    const s = await myPageSrc()
    const idx = s.indexOf('async function handleClose(')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 800)
    const closeIdx    = block.indexOf('await closeAction(')
    const recoveryIdx = block.indexOf('markRecovered(')
    expect(closeIdx).toBeGreaterThan(-1)
    expect(recoveryIdx).toBeGreaterThan(-1)
    expect(closeIdx).toBeLessThan(recoveryIdx)
  })

  it('TasksPage close handler calls recovery observation only when payload exists (test 31)', async () => {
    const s = await taskPageSrc()
    const idx = s.indexOf('async function handleClose(')
    expect(idx).toBeGreaterThan(-1)
    // Window 1200: handleClose body with CRLF overhead exceeds 800 chars
    const block = s.slice(idx, idx + 1200)
    // Recovery is inside a conditional — only when recoveryPayload exists
    expect(block).toContain('if (recoveryPayload)')
    expect(block).toContain('markRecovered(')
    expect(block).toContain('markNotRecovered(')
  })

  it('MyActionsPage refresh() is called after close (test 32)', async () => {
    const s = await myPageSrc()
    const idx = s.indexOf('async function handleClose(')
    expect(idx).toBeGreaterThan(-1)
    // Window 1200: handleClose body with CRLF overhead exceeds 800 chars
    const block = s.slice(idx, idx + 1200)
    const closeIdx   = block.indexOf('await closeAction(')
    const refreshIdx = block.indexOf('refresh()', closeIdx)
    expect(refreshIdx).toBeGreaterThan(closeIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 33-41. Guardrails
// ════════════════════════════════════════════════════════════

describe('3C-4F — guardrails', () => {
  it('no Recovery Center page imported in App.jsx (test 33)', async () => {
    const s = await appSrc()
    expect(s).not.toContain('RecoveryCenterPage')
    expect(s).not.toContain('RecoveryCenter')
  })

  it('no new routes for recovery in App.jsx (test 34)', async () => {
    const s = await appSrc()
    expect(s).not.toContain('/recovery')
    expect(s).not.toContain('/actions/recovery')
  })

  it('no sidebar changes — no recovery nav items (test 35)', async () => {
    const s = await sidebarSrc()
    expect(s).not.toContain('/recovery')
    expect(s).not.toContain('RecoveryCenter')
  })

  it('no dashboard imports in actionService (test 36)', async () => {
    const s = await serviceSrc()
    expect(s).not.toContain('DashboardPage')
    expect(s).not.toContain('/dashboard')
  })

  it('no Dynamic KPI imports in actionService (test 37)', async () => {
    const s = await serviceSrc()
    expect(s).not.toContain('dynamicKpi')
    expect(s).not.toContain('DynamicKpi')
    expect(s).not.toContain('kpiRegistry')
  })

  it('no AI imports in actionService or ActionCard (test 38)', async () => {
    const [svc, card] = await Promise.all([serviceSrc(), cardSrc()])
    for (const s of [svc, card]) {
      expect(s).not.toContain('openai')
      expect(s).not.toContain('anthropic')
      expect(s).not.toContain('gemini')
      expect(s).not.toContain('gpt')
    }
  })

  it('no Product Intelligence imports (test 39)', async () => {
    const [svc, mp, tp] = await Promise.all([serviceSrc(), myPageSrc(), taskPageSrc()])
    for (const s of [svc, mp, tp]) {
      expect(s).not.toContain('ProductIntelligence')
      expect(s).not.toContain('productIntelligence')
    }
  })

  it('no signal generation in any modified file (test 40)', async () => {
    const [svc, mp, tp] = await Promise.all([serviceSrc(), myPageSrc(), taskPageSrc()])
    for (const s of [svc, mp, tp]) {
      expect(s).not.toContain('generateSignal')
      expect(s).not.toContain('detectSignal')
      expect(s).not.toContain('signalEngine')
      expect(s).not.toContain('executiveScore')
    }
  })

  it('dynamicKpiRegionalWiring test file is not imported or referenced in new tests (test 41)', async () => {
    // The only expected failing test file is dynamicKpiRegionalWiring.test.ts.
    // Verify this bundle introduces no references to it.
    const s = await serviceSrc()
    expect(s).not.toContain('dynamicKpiRegionalWiring')
  })
})
