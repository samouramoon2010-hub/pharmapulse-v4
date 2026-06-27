// ============================================================
// PR-1D — Core Application UI Cleanup — focused certification
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// @ts-expect-error — ?raw import has no type declaration
async function appLayoutSrc() { return (await import('../../components/layout/AppLayout.jsx?raw')).default }
// @ts-expect-error — ?raw import has no type declaration
async function kpiEntryPageSrc() { return (await import('../pharmacist/KpiEntryPage.jsx?raw')).default }
// @ts-expect-error — ?raw import has no type declaration
async function rankingsPageSrc() { return (await import('./RankingsPage.tsx?raw')).default }
// @ts-expect-error — ?raw import has no type declaration
async function reportsPageSrc() { return (await import('../shared/ReportsPage.jsx?raw')).default }
// @ts-expect-error — ?raw import has no type declaration
async function dashboardPageSrc() { return (await import('../dashboard/DashboardPage.jsx?raw')).default }
// @ts-expect-error — ?raw import has no type declaration
async function targetsPageSrc() { return (await import('../shared/TargetsPage.jsx?raw')).default }
// @ts-expect-error — ?raw import has no type declaration
async function kpiRegistryLogicSrc() { return (await import('../../services/kpiRegistryLogic.ts?raw')).default }
// CSS files aren't transformed the same way as ?raw JS/TS imports under
// the vitest CSS pipeline, so this one is read directly from disk.
function indexCssSrc() { return readFileSync(join(__dirname, '../../index.css'), 'utf8') }

describe('PR-1D1 — global shell: no duplicate Live indicator', () => {
  it('AppLayout no longer renders a hardcoded "Live" pill', async () => {
    const src = await appLayoutSrc()
    expect(src).not.toMatch(/>\s*Live\s*</)
  })
  it('SyncStatusIndicator remains the single connectivity indicator', async () => {
    const src = await appLayoutSrc()
    expect(src).toContain('<SyncStatusIndicator')
  })
})

describe('PR-1D1 — global shell: real Profile menu', () => {
  it('AppLayout defines a ProfileMenu component with profile/settings/sign-out items', async () => {
    const src = await appLayoutSrc()
    expect(src).toContain('function ProfileMenu')
    expect(src).toContain('logout()')
    expect(src).toContain("navigate('/settings')")
  })
  it('ProfileMenu shows the canonical role label, not an invented one', async () => {
    const src = await appLayoutSrc()
    expect(src).toContain("import { getRoleLabel } from '../../constants/roleScope'")
    expect(src).toContain('getRoleLabel(userProfile?.role)')
  })
  it('icon-only header controls carry aria-labels', async () => {
    const src = await appLayoutSrc()
    expect(src).toContain('aria-label="Notifications"')
    expect(src).toContain('aria-label="Account menu"')
    expect(src).toContain('aria-label="Theme switcher"')
  })
})

describe('PR-1D2 — KPI Entry: blank vs zero preserved', () => {
  it('payload loop no longer coerces a blank field to 0', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toContain('payload[key] = Number(form[key]) || 0')
    expect(src).toContain('payload[key] = Number(form[key])')
  })
  it('blank fields are explicitly skipped, not zeroed', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toMatch(/if \(form\[key\] === '' \|\| form\[key\] == null\) continue/)
  })
})

describe('PR-1D2 — KPI Entry: category grouping', () => {
  it('entry fields are grouped using the registry category field', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('function groupByCategory')
    expect(src).toContain('category:    kpi.category || \'uncategorized\'')
  })
  it('a field with no category falls back to a single group, not an invented category', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain("uncategorized:   'Other'")
  })
})

describe('PR-1D2 — KPI Entry: sticky save bar with explicit states', () => {
  it('defines a save-state machine with all required states', async () => {
    const src = await kpiEntryPageSrc()
    for (const state of ["'idle'", "'unsaved'", "'saving'", "'saved'", "'failed'"]) {
      expect(src).toContain(state)
    }
  })
  it('write payload/contract is unchanged by the save-bar UI (saveEntry call site untouched)', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('saveEntry(payload, liveRegistry)')
  })
})

describe('PR-1D3 — Rankings: classification label humanized, not replaced', () => {
  it('renders the humanized classification via classificationLabel(), same underlying value', async () => {
    const src = await rankingsPageSrc()
    expect(src).toContain('function classificationLabel(')
    expect(src).toContain('classificationLabel(s.classificationId)')
  })
})

describe('PR-1D5 — accessibility: reduced motion respected globally', () => {
  it('index.css defines a prefers-reduced-motion override', () => {
    const src = indexCssSrc()
    expect(src).toContain('prefers-reduced-motion: reduce')
  })
})

describe('PR-1D closure — pilot-tracking field investigation (Resolution B: unsupported, removed)', () => {
  it('1. pilot fields are absent from production KPI Entry rendering — no pilot import/section/badge', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toContain('getPilotTrackingKpis')
    expect(src).not.toContain('TrackingOnlyBadge')
    expect(src).not.toContain('PilotKpiSectionHeader')
    expect(src).not.toMatch(/Pilot KPI Section/)
  })

  it('2. dead form state (buildPilotEntryFields / pilotEntryFields) is fully removed', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toContain('function buildPilotEntryFields')
    expect(src).not.toContain('pilotEntryFields')
  })

  it('3. save payload remains unchanged — handleSave still loops only entryFields', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toContain('for (const { key } of entryFields) {')
    expect(src).toContain("if (form[key] === '' || form[key] == null) continue")
    expect(src).toContain('payload[key] = Number(form[key])')
    // The only payload-building loop is over entryFields — confirm no
    // second loop over a pilot field collection was added.
    expect(src.match(/for \(const \{ key \} of \w+EntryFields\)/g) ?? []).toEqual([])
  })

  it('4a. ReportsPage pilot KPI section is untouched (historical reader unaffected)', async () => {
    const src = await reportsPageSrc()
    expect(src).toContain('getPilotTrackingKpis')
    expect(src).toContain('PILOT_KPI_FIELDS')
  })

  it('4b. DashboardPage pilot KPI section is untouched (historical reader unaffected)', async () => {
    const src = await dashboardPageSrc()
    expect(src).toContain('getPilotTrackingKpis')
    expect(src).toContain('TrackingOnlyBadge')
  })

  it('4c. TargetsPage pilot KPI handling is untouched (historical reader unaffected)', async () => {
    const src = await targetsPageSrc()
    expect(src).toContain('Pilot')
  })

  it('4d. the write-path hardening this investigation traced through is untouched', async () => {
    const src = await kpiRegistryLogicSrc()
    expect(src).toContain('Pre-Milestone 4 hardening')
    expect(src).toContain("if (stage !== 'production_evaluation') continue")
  })

  it('5. no "Tracking Only" or pilot-specific label remains visible in KPI Entry', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).not.toContain('Tracking Only')
    expect(src).not.toContain('للمتابعة فقط')
  })
})

describe('PR-1D — no scope creep into forbidden sections', () => {
  it('AppLayout does not introduce a mobile bottom-nav redesign (MobileNav untouched/still referenced as-is)', async () => {
    const src = await appLayoutSrc()
    expect(src).toContain('<MobileNav')
  })
  it('KpiEntryPage save bar reuses the existing .card/.btn classes, not a new component', async () => {
    const src = await kpiEntryPageSrc()
    expect(src).toMatch(/className="sticky sticky-save-bar z-10 card card-p/)
  })
})
