// ============================================================
// Phase 3C-3E — Actions UI Pages + Routes + Sidebar
//
// Tests  1-12:  MyActionsPage structure and wiring
// Tests 13-23:  TasksPage structure and wiring
// Tests 24-27:  Routes in App.jsx
// Tests 28-32:  Sidebar Actions section per role
// Tests 33-39:  Guardrails
// ============================================================

import { describe, it, expect } from 'vitest'

const myPageSrc   = () => import('./MyActionsPage.jsx?raw').then((m) => m.default)
const taskPageSrc = () => import('./TasksPage.jsx?raw').then((m) => m.default)
const appSrc      = () => import('../../App.jsx?raw').then((m) => m.default)
const sidebarSrc  = () => import('../../components/layout/Sidebar.jsx?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1-12. MyActionsPage
// ════════════════════════════════════════════════════════════

describe('3C-3E — MyActionsPage', () => {
  it('MyActionsPage file exists and exports a component (test 1)', async () => {
    const s = await myPageSrc()
    expect(s).toContain('export default function MyActionsPage')
  })

  it('MyActionsPage imports useActions (test 2)', async () => {
    const s = await myPageSrc()
    expect(s).toContain("import { useActions }")
    expect(s).toContain("from '../../hooks/useActions'")
  })

  it('MyActionsPage passes ownerId to useActions (test 3)', async () => {
    const s = await myPageSrc()
    // useActions must be called with an ownerId filter
    const idx = s.indexOf('useActions(')
    expect(idx).toBeGreaterThan(-1)
    const callBlock = s.slice(idx, idx + 60)
    expect(callBlock).toContain('ownerId')
  })

  it('MyActionsPage uses ActionSummaryCards (test 4)', async () => {
    const s = await myPageSrc()
    expect(s).toContain('ActionSummaryCards')
    expect(s).toContain("from '../../components/actions/ActionSummaryCards'")
  })

  it('MyActionsPage uses ActionFilters (test 5)', async () => {
    const s = await myPageSrc()
    expect(s).toContain('ActionFilters')
    expect(s).toContain("from '../../components/actions/ActionFilters'")
  })

  it('MyActionsPage renders Suggested / Open section (test 6)', async () => {
    const s = await myPageSrc()
    // Filters for SUGGESTED status to build open section
    expect(s).toContain("'SUGGESTED'")
    // Open or Suggested label in JSX
    expect(s).toMatch(/Open|Suggested/)
  })

  it('MyActionsPage renders Accepted / In Progress section (test 7)', async () => {
    const s = await myPageSrc()
    expect(s).toContain("'ACCEPTED'")
    expect(s).toMatch(/Accepted|In Progress/)
  })

  it('MyActionsPage renders History section (test 8)', async () => {
    const s = await myPageSrc()
    // History contains DISMISSED and CLOSED
    expect(s).toContain("'DISMISSED'")
    expect(s).toContain("'CLOSED'")
    expect(s).toContain('History')
  })

  it('MyActionsPage calls acceptAction from actionService (test 9)', async () => {
    const s = await myPageSrc()
    expect(s).toContain('acceptAction(')
    expect(s).toContain("from '../../services/actionService'")
  })

  it('MyActionsPage calls dismissAction from actionService (test 10)', async () => {
    const s = await myPageSrc()
    expect(s).toContain('dismissAction(')
  })

  it('MyActionsPage calls closeAction from actionService (test 11)', async () => {
    const s = await myPageSrc()
    expect(s).toContain('closeAction(')
  })

  it('MyActionsPage calls refresh() after action update (test 12)', async () => {
    const s = await myPageSrc()
    // refresh is called after each successful action
    expect(s).toContain('refresh()')
    // Pattern: await then refresh
    const acceptIdx = s.indexOf('await acceptAction')
    const refreshIdx = s.indexOf('refresh()', acceptIdx)
    expect(refreshIdx).toBeGreaterThan(acceptIdx)
  })
})

// ════════════════════════════════════════════════════════════
// 13-23. TasksPage
// ════════════════════════════════════════════════════════════

describe('3C-3E — TasksPage', () => {
  it('TasksPage file exists and exports a component (test 13)', async () => {
    const s = await taskPageSrc()
    expect(s).toContain('export default function TasksPage')
  })

  it('TasksPage imports useActions (test 14)', async () => {
    const s = await taskPageSrc()
    expect(s).toContain("import { useActions }")
    expect(s).toContain("from '../../hooks/useActions'")
  })

  it('TasksPage does NOT pass ownerId to useActions (test 15)', async () => {
    const s = await taskPageSrc()
    // useActions() called with no arguments — no ownerId filter
    const idx = s.indexOf('useActions()')
    expect(idx).toBeGreaterThan(-1)
    // The call itself must not embed ownerId
    const callBlock = s.slice(idx, idx + 20)
    expect(callBlock).not.toContain('ownerId')
  })

  it('TasksPage renders Critical / High Priority section (test 16)', async () => {
    const s = await taskPageSrc()
    expect(s).toContain("'CRITICAL'")
    expect(s).toContain("'HIGH'")
    expect(s).toMatch(/Critical.*High|High.*Critical|Critical & High/i)
  })

  it('TasksPage renders All Open Actions section (test 17)', async () => {
    const s = await taskPageSrc()
    expect(s).toContain('All Open Actions')
  })

  it('TasksPage renders By Branch section (test 18)', async () => {
    const s = await taskPageSrc()
    expect(s).toContain('By Branch')
    // Groups by relatedPharmacyId
    expect(s).toContain('relatedPharmacyId')
  })

  it('TasksPage computes overdue actions (test 19)', async () => {
    const s = await taskPageSrc()
    expect(s).toContain('dueDate')
    expect(s).toContain('overdue')
    // Compared against today
    expect(s).toContain("today")
  })

  it('TasksPage uses ActionFilters with showBranchFilter (test 20)', async () => {
    const s = await taskPageSrc()
    expect(s).toContain('showBranchFilter')
    // showBranchFilter is computed from uniqueBranches
    expect(s).toContain('uniqueBranches')
  })

  it('TasksPage calls acceptAction from actionService (test 21)', async () => {
    const s = await taskPageSrc()
    expect(s).toContain('acceptAction(')
    expect(s).toContain("from '../../services/actionService'")
  })

  it('TasksPage calls dismissAction from actionService (test 22)', async () => {
    const s = await taskPageSrc()
    expect(s).toContain('dismissAction(')
  })

  it('TasksPage calls closeAction from actionService (test 23)', async () => {
    const s = await taskPageSrc()
    expect(s).toContain('closeAction(')
  })
})

// ════════════════════════════════════════════════════════════
// 24-27. Routes
// ════════════════════════════════════════════════════════════

describe('3C-3E — Routes', () => {
  it('/actions/my route exists in App.jsx (test 24)', async () => {
    const s = await appSrc()
    // JSX uses double-quoted attributes: path="/actions/my"
    expect(s).toContain('"/actions/my"')
    expect(s).toContain('MyActionsPage')
  })

  it('/actions/tasks route exists in App.jsx (test 25)', async () => {
    const s = await appSrc()
    expect(s).toContain('"/actions/tasks"')
    expect(s).toContain('TasksPage')
  })

  it('/actions/tasks uses MGR_UP guard — excludes pharmacist (test 26)', async () => {
    const s = await appSrc()
    const idx = s.indexOf('"/actions/tasks"')
    expect(idx).toBeGreaterThan(-1)
    // MGR_UP must appear near the tasks route (within 80 chars after path string)
    const block = s.slice(idx, idx + 80)
    expect(block).toContain('MGR_UP')
  })

  it('/actions/my uses default PR — available to all roles (test 27)', async () => {
    const s = await appSrc()
    const idx = s.indexOf('"/actions/my"')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 80)
    expect(block).toContain('MyActionsPage')
    // Must NOT restrict to MGR_UP (pharmacists should have access)
    expect(block).not.toContain('MGR_UP')
  })
})

// ════════════════════════════════════════════════════════════
// 28-32. Sidebar
// ════════════════════════════════════════════════════════════

describe('3C-3E — Sidebar Actions section', () => {
  it('Actions section exists in Sidebar (test 28)', async () => {
    const s = await sidebarSrc()
    expect(s).toContain('/actions/my')
    expect(s).toContain('/actions/tasks')
  })

  it('pharmacist sees My Actions but NOT Task Board (test 29)', async () => {
    const s = await sidebarSrc()
    // Window from pharmacist: [ to just before branch_manager alias
    const pharmIdx = s.indexOf('pharmacist: [')
    expect(pharmIdx).toBeGreaterThan(-1)
    // 700-char window covers pharmacist config, stops before district_supervisor
    const pharmBlock = s.slice(pharmIdx, pharmIdx + 700)
    expect(pharmBlock).toContain('/actions/my')
    expect(pharmBlock).not.toContain('/actions/tasks')
  })

  it('manager sees My Actions + Task Board (test 30)', async () => {
    const s = await sidebarSrc()
    const mgrIdx = s.indexOf('manager: [')
    expect(mgrIdx).toBeGreaterThan(-1)
    // Window 1100: manager config has My Work + Analytics (5 items) + Actions + System
    const mgrBlock = s.slice(mgrIdx, mgrIdx + 1100)
    expect(mgrBlock).toContain('/actions/my')
    expect(mgrBlock).toContain('/actions/tasks')
  })

  it('district_supervisor sees My Actions + Task Board (test 31)', async () => {
    const s = await sidebarSrc()
    const supIdx = s.indexOf('NAV_CONFIG.district_supervisor = [')
    expect(supIdx).toBeGreaterThan(-1)
    // Window 900: widened for the DX-12b Item Sales nav item (same
    // precedent as the admin window below, no structural change).
    const supBlock = s.slice(supIdx, supIdx + 900)
    expect(supBlock).toContain('/actions/my')
    expect(supBlock).toContain('/actions/tasks')
  })

  it('admin sees My Actions + Task Board (test 32)', async () => {
    const s = await sidebarSrc()
    const adminIdx = s.indexOf('admin: [')
    expect(adminIdx).toBeGreaterThan(-1)
    // Window 3500: admin has Analytics + Administration (11 items) + Actions + System
    // (widened for Sidebar-1/2/3 consolidation comments, no structural change)
    const adminBlock = s.slice(adminIdx, adminIdx + 3500)
    expect(adminBlock).toContain('/actions/my')
    expect(adminBlock).toContain('/actions/tasks')
  })
})

// ════════════════════════════════════════════════════════════
// 33-39. Guardrails
// ════════════════════════════════════════════════════════════

describe('3C-3E — guardrails', () => {
  it('no dashboard imports in MyActionsPage or TasksPage (test 33)', async () => {
    const [mp, tp] = await Promise.all([myPageSrc(), taskPageSrc()])
    for (const s of [mp, tp]) {
      expect(s).not.toContain('DashboardPage')
      expect(s).not.toContain('/dashboard')
    }
  })

  it('no engine imports in MyActionsPage or TasksPage (test 34)', async () => {
    const [mp, tp] = await Promise.all([myPageSrc(), taskPageSrc()])
    for (const s of [mp, tp]) {
      expect(s).not.toContain("from '../../engine'")
      expect(s).not.toContain("from '../engine'")
      expect(s).not.toContain('executiveScore')
      expect(s).not.toContain('pharmacistPerformanceEngine')
    }
  })

  it('no Dynamic KPI imports in MyActionsPage or TasksPage (test 35)', async () => {
    const [mp, tp] = await Promise.all([myPageSrc(), taskPageSrc()])
    for (const s of [mp, tp]) {
      expect(s).not.toContain('dynamicKpi')
      expect(s).not.toContain('DynamicKpi')
      expect(s).not.toContain('kpiRegistry')
    }
  })

  it('no AI imports in MyActionsPage or TasksPage (test 36)', async () => {
    const [mp, tp] = await Promise.all([myPageSrc(), taskPageSrc()])
    for (const s of [mp, tp]) {
      expect(s).not.toContain('openai')
      expect(s).not.toContain('anthropic')
      expect(s).not.toContain('gemini')
      expect(s).not.toContain('gpt')
    }
  })

  it('no signal generation in MyActionsPage or TasksPage (test 37)', async () => {
    const [mp, tp] = await Promise.all([myPageSrc(), taskPageSrc()])
    for (const s of [mp, tp]) {
      expect(s).not.toContain('generateSignal')
      expect(s).not.toContain('detectSignal')
      expect(s).not.toContain('signalEngine')
    }
  })

  it('no action creation UI in MyActionsPage or TasksPage (test 38)', async () => {
    const [mp, tp] = await Promise.all([myPageSrc(), taskPageSrc()])
    for (const s of [mp, tp]) {
      // createSuggestedAction is the creation export — should not be called in pages
      expect(s).not.toContain('createSuggestedAction')
      // No "Create Action" / "Add Action" form
      expect(s).not.toContain('Create Action')
      expect(s).not.toContain('Add Action')
    }
  })

  it('neither page imports Firestore directly (test 39)', async () => {
    const [mp, tp] = await Promise.all([myPageSrc(), taskPageSrc()])
    for (const s of [mp, tp]) {
      expect(s).not.toContain("from 'firebase/firestore'")
      expect(s).not.toContain('getDocs(')
      expect(s).not.toContain('collection(db')
    }
  })
})
