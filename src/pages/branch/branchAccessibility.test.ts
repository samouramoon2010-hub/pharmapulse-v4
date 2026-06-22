// ============================================================
// Regression tests — Branch Intelligence accessibility
// Sprint: Branch Intelligence Accessibility
//
// Verifies that Branch Intelligence (/branch/:branchId/intelligence)
// is reachable from both natural drilldown paths without any sidebar
// entry being added.
//
// Tests are source-level (raw imports) — no DOM/rendering required.
// ============================================================

import { describe, it, expect } from 'vitest'

async function branchDrilldownSrc() {
  return (await import('../../components/executive/BranchDrilldown.jsx?raw')).default
}

async function teamPageSrc() {
  return (await import('../manager/TeamPage.jsx?raw')).default
}

async function sidebarSrc() {
  return (await import('../../components/layout/Sidebar.jsx?raw')).default
}

async function appSrc() {
  return (await import('../../App.jsx?raw')).default
}

// ══════════════════════════════════════════════════════════════
// 1. BranchDrilldown — Executive BI entry point
// ══════════════════════════════════════════════════════════════

describe('BranchDrilldown — Branch Intelligence link', () => {
  it('imports Link from react-router-dom', async () => {
    const s = await branchDrilldownSrc()
    expect(s).toContain("import { Link } from 'react-router-dom'")
  })

  it('renders a Link to /branch/${branch.pharmacyId}/intelligence', async () => {
    const s = await branchDrilldownSrc()
    expect(s).toContain('to={`/branch/${branch.pharmacyId}/intelligence`}')
  })

  it('link text is "View Branch Intelligence →"', async () => {
    const s = await branchDrilldownSrc()
    expect(s).toContain('View Branch Intelligence →')
  })

  it('link is guarded by branch.pharmacyId (hidden when pharmacyId is absent)', async () => {
    const s = await branchDrilldownSrc()
    expect(s).toContain('{branch.pharmacyId && (')
  })
})

// ══════════════════════════════════════════════════════════════
// 2. TeamPage — Team Page entry point
// ══════════════════════════════════════════════════════════════

describe('TeamPage — Branch Intelligence link', () => {
  it('imports Link from react-router-dom', async () => {
    const s = await teamPageSrc()
    expect(s).toContain('Link')
    expect(s).toContain("from 'react-router-dom'")
  })

  it('renders a Link to /branch/${selectedPharmacyId}/intelligence (Phase 2F-1: scope-driven)', async () => {
    const s = await teamPageSrc()
    expect(s).toContain('to={`/branch/${selectedPharmacyId}/intelligence`}')
  })

  it('link text is "Branch Intelligence →"', async () => {
    const s = await teamPageSrc()
    expect(s).toContain('Branch Intelligence →')
  })

  it('link is guarded by selectedPharmacyId (hidden when no branch selected)', async () => {
    const s = await teamPageSrc()
    expect(s).toContain('{selectedPharmacyId && (')
  })
})

// ══════════════════════════════════════════════════════════════
// 3. Sidebar — no Branch Intelligence nav item added
// ══════════════════════════════════════════════════════════════

describe('Sidebar — Branch Intelligence not added as nav item', () => {
  it('NAV_CONFIG does not contain a Branch Intelligence path', async () => {
    const s = await sidebarSrc()
    // Verify the sidebar does not route directly to /branch/*/intelligence
    expect(s).not.toContain('/branch/')
    expect(s).not.toContain('Branch Intelligence')
  })
})

// ══════════════════════════════════════════════════════════════
// 4. Route still registered (regression guard)
// ══════════════════════════════════════════════════════════════

describe('App — /branch/:branchId/intelligence route intact', () => {
  it('route is still registered in App.jsx', async () => {
    const s = await appSrc()
    expect(s).toContain('path="/branch/:branchId/intelligence"')
    expect(s).toContain('<BranchIntelligencePage />')
  })

  it('route still requires MGR_UP roles', async () => {
    const s = await appSrc()
    const idx = s.indexOf('path="/branch/:branchId/intelligence"')
    const ctx = s.slice(idx - 30, idx + 120)
    expect(ctx).toContain('roles={MGR_UP}')
  })
})
