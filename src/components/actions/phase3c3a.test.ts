// ============================================================
// Phase 3C-3A — Shared Actions Components
//
// Verifies:
//  1.  All six component files exist
//  2.  No dashboard imports in any component
//  3.  No Dynamic KPI imports in any component
//  4.  No AI imports in any component
//  5.  ActionCard imports ActionStatusBadge
//  6.  ActionCard imports ActionPriorityBadge
//  7.  ActionCard supports onAccept prop
//  8.  ActionCard supports onDismiss prop
//  9.  ActionCard supports onClose prop
// 10.  ActionCard contains inline dismiss textarea
// 11.  ActionSummaryCards computes all four status counts
// 12.  ActionFilters supports showBranchFilter
// 13.  ActionEmptyState is pure (no Firestore, no engine)
// 14.  No Firestore access in any component
// 15.  No engine imports in any component
// ============================================================

import { describe, it, expect } from 'vitest'

const cardSrc     = () => import('./ActionCard.jsx?raw').then((m) => m.default)
const statusSrc   = () => import('./ActionStatusBadge.jsx?raw').then((m) => m.default)
const prioritySrc = () => import('./ActionPriorityBadge.jsx?raw').then((m) => m.default)
const summarySrc  = () => import('./ActionSummaryCards.jsx?raw').then((m) => m.default)
const filtersSrc  = () => import('./ActionFilters.jsx?raw').then((m) => m.default)
const emptySrc    = () => import('./ActionEmptyState.jsx?raw').then((m) => m.default)

// ════════════════════════════════════════════════════════════
// 1. All six component files exist
// ════════════════════════════════════════════════════════════

describe('3C-3A — component files exist', () => {
  it('ActionCard.jsx exists and exports a component (test 1a)', async () => {
    const s = await cardSrc()
    expect(s).toContain('export default function ActionCard')
  })

  it('ActionStatusBadge.jsx exists and exports a component (test 1b)', async () => {
    const s = await statusSrc()
    expect(s).toContain('export default function ActionStatusBadge')
  })

  it('ActionPriorityBadge.jsx exists and exports a component (test 1c)', async () => {
    const s = await prioritySrc()
    expect(s).toContain('export default function ActionPriorityBadge')
  })

  it('ActionSummaryCards.jsx exists and exports a component (test 1d)', async () => {
    const s = await summarySrc()
    expect(s).toContain('export default function ActionSummaryCards')
  })

  it('ActionFilters.jsx exists and exports a component (test 1e)', async () => {
    const s = await filtersSrc()
    expect(s).toContain('export default function ActionFilters')
  })

  it('ActionEmptyState.jsx exists and exports a component (test 1f)', async () => {
    const s = await emptySrc()
    expect(s).toContain('export default function ActionEmptyState')
  })
})

// ════════════════════════════════════════════════════════════
// 2-4. Guardrail imports
// ════════════════════════════════════════════════════════════

describe('3C-3A — no dashboard / DynamicKPI / AI imports', () => {
  it('no dashboard imports in any action component (test 2)', async () => {
    const srcs = await Promise.all([cardSrc(), statusSrc(), prioritySrc(), summarySrc(), filtersSrc(), emptySrc()])
    for (const s of srcs) {
      expect(s).not.toContain('DashboardPage')
      expect(s).not.toContain('/dashboard')
    }
  })

  it('no Dynamic KPI imports in any action component (test 3)', async () => {
    const srcs = await Promise.all([cardSrc(), statusSrc(), prioritySrc(), summarySrc(), filtersSrc(), emptySrc()])
    for (const s of srcs) {
      expect(s).not.toContain('dynamicKpi')
      expect(s).not.toContain('DynamicKpi')
      expect(s).not.toContain('kpiRegistry')
    }
  })

  it('no AI imports in any action component (test 4)', async () => {
    const srcs = await Promise.all([cardSrc(), statusSrc(), prioritySrc(), summarySrc(), filtersSrc(), emptySrc()])
    for (const s of srcs) {
      expect(s).not.toContain('openai')
      expect(s).not.toContain('anthropic')
      expect(s).not.toContain('gemini')
      expect(s).not.toContain('gpt')
    }
  })
})

// ════════════════════════════════════════════════════════════
// 5-6. ActionCard badge usage
// ════════════════════════════════════════════════════════════

describe('3C-3A — ActionCard badge integration', () => {
  it('ActionCard imports ActionStatusBadge (test 5)', async () => {
    const s = await cardSrc()
    expect(s).toContain("from './ActionStatusBadge'")
    // Badge must be rendered inside the card
    expect(s).toContain('ActionStatusBadge')
  })

  it('ActionCard imports ActionPriorityBadge (test 6)', async () => {
    const s = await cardSrc()
    expect(s).toContain("from './ActionPriorityBadge'")
    expect(s).toContain('ActionPriorityBadge')
  })
})

// ════════════════════════════════════════════════════════════
// 7-10. ActionCard button + dismiss support
// ════════════════════════════════════════════════════════════

describe('3C-3A — ActionCard action buttons', () => {
  it('ActionCard accepts onAccept prop and renders Accept button (test 7)', async () => {
    const s = await cardSrc()
    expect(s).toContain('onAccept')
    expect(s).toContain('Accept')
  })

  it('ActionCard accepts onDismiss prop and renders Dismiss button (test 8)', async () => {
    const s = await cardSrc()
    expect(s).toContain('onDismiss')
    expect(s).toContain('Dismiss')
  })

  it('ActionCard accepts onClose prop and renders Close button (test 9)', async () => {
    const s = await cardSrc()
    expect(s).toContain('onClose')
    expect(s).toContain('Close')
  })

  it('ActionCard contains inline dismiss textarea (test 10)', async () => {
    const s = await cardSrc()
    // Inline textarea for dismiss reason
    expect(s).toContain('textarea')
    // Dismiss reason state
    expect(s).toContain('dismissReason')
    // Dismiss expanded toggle
    expect(s).toContain('dismissExpanded')
  })
})

// ════════════════════════════════════════════════════════════
// 11. ActionSummaryCards four counts
// ════════════════════════════════════════════════════════════

describe('3C-3A — ActionSummaryCards count derivation', () => {
  it('ActionSummaryCards computes all four status counts (test 11)', async () => {
    const s = await summarySrc()
    // Each status filter must appear
    expect(s).toContain("'SUGGESTED'")
    expect(s).toContain("'ACCEPTED'")
    expect(s).toContain("'CLOSED'")
    expect(s).toContain("'DISMISSED'")
    // Derived via .filter
    expect(s).toContain('.filter')
  })
})

// ════════════════════════════════════════════════════════════
// 12. ActionFilters branch filter
// ════════════════════════════════════════════════════════════

describe('3C-3A — ActionFilters branch filter', () => {
  it('ActionFilters supports showBranchFilter prop (test 12)', async () => {
    const s = await filtersSrc()
    expect(s).toContain('showBranchFilter')
    // Branch dropdown conditionally rendered
    const idx = s.indexOf('showBranchFilter')
    expect(idx).toBeGreaterThan(-1)
    const block = s.slice(idx, idx + 200)
    expect(block).toContain('branch')
  })
})

// ════════════════════════════════════════════════════════════
// 13. ActionEmptyState purity
// ════════════════════════════════════════════════════════════

describe('3C-3A — ActionEmptyState is pure', () => {
  it('ActionEmptyState has no Firestore and no engine imports (test 13)', async () => {
    const s = await emptySrc()
    expect(s).not.toContain('firebase')
    expect(s).not.toContain('firestore')
    expect(s).not.toContain('engine')
    expect(s).not.toContain('useEffect')
    expect(s).not.toContain('useState')
  })
})

// ════════════════════════════════════════════════════════════
// 14-15. No Firestore / engine in any component
// ════════════════════════════════════════════════════════════

describe('3C-3A — no Firestore or engine in components', () => {
  it('no Firestore imports in any action component (test 14)', async () => {
    const srcs = await Promise.all([cardSrc(), statusSrc(), prioritySrc(), summarySrc(), filtersSrc(), emptySrc()])
    for (const s of srcs) {
      expect(s).not.toContain("from 'firebase/firestore'")
      expect(s).not.toContain("from 'firebase/app'")
      expect(s).not.toContain("getDocs")
      expect(s).not.toContain("collection(db")
    }
  })

  it('no engine imports in any action component (test 15)', async () => {
    const srcs = await Promise.all([cardSrc(), statusSrc(), prioritySrc(), summarySrc(), filtersSrc(), emptySrc()])
    for (const s of srcs) {
      expect(s).not.toContain("from '../../engine")
      expect(s).not.toContain("from '../engine")
      expect(s).not.toContain('executiveScore')
      expect(s).not.toContain('pharmacistPerformanceEngine')
      expect(s).not.toContain('signalEngine')
    }
  })
})
