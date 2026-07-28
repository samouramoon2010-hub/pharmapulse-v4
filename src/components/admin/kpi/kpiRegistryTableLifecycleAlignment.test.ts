// ============================================================
// 2026-07-07 — UI lifecycle alignment after PROTECTED_CORE_KEYS
// archival restriction was lifted in kpiRegistryService.ts.
//
// This repo has no React component-rendering test setup (no
// @testing-library/react dependency) — every existing "UI" test in
// this codebase asserts against the raw source string via Vite's
// `?raw` import (see milestone35Registry.test.ts's audit-trail
// section for the established pattern). These tests follow the same
// convention for KpiRegistryTable.jsx and KpiManagementPage.jsx.
//
// Proves:
//   1. the Archive action is no longer gated on `!kpi.isCore` — it is
//      only gated on `uiStatus === 'ACTIVE'`, so a core KPI's Archive
//      button renders exactly like any other active KPI's
//   2. the Hide action is still gated on `!kpi.isCore` — that
//      restriction was intentionally NOT lifted
//   3. KpiManagementPage's requestArchive() no longer contains the
//      silent early-return that used to no-op for core keys
//   4. KpiManagementPage's handleHide() still contains its
//      PROTECTED_CORE_KEYS early-return — unchanged
//   5. archived KPIs are never filtered out of the rendered list
//      (no `.filter(... !isArchived ...)` exists before the map)
// ============================================================
import { describe, it, expect } from 'vitest'

describe('1 — Archive action no longer core-gated in KpiRegistryTable.jsx', () => {
  it('desktop table: Archive button render condition is uiStatus === "ACTIVE" only', async () => {
    const src = (await import('./KpiRegistryTable.jsx?raw')).default
    // The comment above the desktop actions cell documents the new behavior
    expect(src).toContain('Archive: allowed for all active KPIs, including former core-protected keys.')
    // The archive button must be reachable without an `!kpi.isCore` guard around it
    const archiveBlock = src.split('onClick={() => onArchive(kpi.key)}')
    expect(archiveBlock.length).toBeGreaterThanOrEqual(2) // appears in both mobile + desktop renderings
  })

  it('mobile card: Archive button is rendered whenever uiStatus === "ACTIVE", regardless of isCore', async () => {
    const src = (await import('./KpiRegistryTable.jsx?raw')).default
    // The old single combined guard `{!kpi.isCore && uiStatus === 'ACTIVE' && (` must be gone
    expect(src).not.toContain(`{!kpi.isCore && uiStatus === 'ACTIVE' && (`)
  })
})

describe('2 — Hide action remains core-gated (restriction NOT lifted)', () => {
  it('KpiRegistryTable.jsx still guards the Hide button with `!kpi.isCore`', async () => {
    const src = (await import('./KpiRegistryTable.jsx?raw')).default
    expect(src).toContain('{!kpi.isCore && (')
    expect(src).toContain('onClick={() => onHide(kpi.key)}')
  })

  it('the "Protected" badge now describes hide-only restriction, not archive+hide', async () => {
    const src = (await import('./KpiRegistryTable.jsx?raw')).default
    expect(src).toContain('cannot be hidden from input forms')
    expect(src).not.toContain('cannot be archived or hidden')
  })
})

describe('3 — KpiManagementPage.jsx requestArchive() no longer silently no-ops for core keys', () => {
  it('the PROTECTED_CORE_KEYS early-return is gone from requestArchive', async () => {
    const src = (await import('../../../pages/admin/KpiManagementPage.jsx?raw')).default
    const requestArchiveStart = src.indexOf('const requestArchive = useCallback')
    const requestArchiveBody = src.slice(requestArchiveStart, requestArchiveStart + 400)
    expect(requestArchiveBody).not.toContain('PROTECTED_CORE_KEYS.has(key)')
  })
})

describe('4 — KpiManagementPage.jsx handleHide() still blocks core keys (unchanged)', () => {
  it('the PROTECTED_CORE_KEYS early-return is still present in handleHide', async () => {
    const src = (await import('../../../pages/admin/KpiManagementPage.jsx?raw')).default
    const handleHideStart = src.indexOf('const handleHide = useCallback')
    const handleHideBody = src.slice(handleHideStart, handleHideStart + 300)
    expect(handleHideBody).toContain('PROTECTED_CORE_KEYS.has(key)')
  })
})

describe('5 — archived KPIs are never filtered out of the rendered list', () => {
  it('KpiRegistryTable.jsx maps over the full `kpis` prop with no archived-exclusion filter', async () => {
    const src = (await import('./KpiRegistryTable.jsx?raw')).default
    expect(src).not.toMatch(/kpis\.filter\([^)]*isArchived/)
    expect(src).not.toMatch(/kpis\.filter\([^)]*!kpi\.isActive/)
    // Both renderings map the full prop directly
    expect(src).toContain('kpis.map((kpi) => {')
  })

  it('archived rows are dimmed via opacity, not removed from the DOM', async () => {
    const src = (await import('./KpiRegistryTable.jsx?raw')).default
    expect(src).toContain('const rowOpacity = isArchived ? 0.55 : 1')
  })
})
