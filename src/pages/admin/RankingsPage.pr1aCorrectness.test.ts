// ============================================================
// PR-1A — Rankings Correctness Regression Tests
//
// Source-level tests (raw import, no DOM rendering) — RankingsPage
// is Firebase-store-backed and impractical to fully render here.
//
// Confirmed bug fixed in this bundle:
//   PharmacistCohortTable rendered a hardcoded 'Unknown Branch'
//   string for every pharmacist row instead of resolving the real
//   branch name via the pharmacy store.
//
// Re-verified, found already correct (no fix needed, asserted here
// so a future regression is caught):
//   cohortMap sorts each cohort by currentRank ascending — visual
//   row order already matches official rank.
// ============================================================

import { describe, it, expect } from 'vitest'

async function src(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('./RankingsPage.tsx?raw')).default
}

describe('PR-1A — canonical branch-name resolution (no Unknown Branch)', () => {
  it('no longer renders the hardcoded "Unknown Branch" string', async () => {
    const s = await src()
    expect(s).not.toContain('Unknown Branch')
  })

  it('imports usePharmacyStore for canonical name resolution', async () => {
    const s = await src()
    expect(s).toContain('usePharmacyStore')
    expect(s).toContain("from '../../store/pharmacyStore'")
  })

  it('subscribes to pharmacies and builds a pharmacyId -> name map', async () => {
    const s = await src()
    expect(s).toContain('subPharmacies()')
    expect(s).toContain('pharmacyNameById')
  })

  it('PharmacistCohortTable receives and uses the resolver map', async () => {
    const s = await src()
    expect(s).toContain('pharmacyNameById: Map<string, string>')
    expect(s).toContain('pharmacyNameById.get(pharmId)')
  })
})

describe('PR-1A — official ranking order (re-verified, no regression)', () => {
  it('each cohort is sorted by currentRank ascending', async () => {
    const s = await src()
    expect(s).toContain('arr.sort((a, b) => a.currentRank - b.currentRank)')
  })
})

describe('PR-1A — rank scope clarity', () => {
  it('both cohort tabs are explicitly labeled Company-Wide', async () => {
    const s = await src()
    expect(s).toContain("'Branch Rankings (Company-Wide)'")
    expect(s).toContain("'Pharmacist Rankings (Company-Wide)'")
  })

  it('shows a ranked-vs-eligible count derived from diagnostics, never invented', async () => {
    const s = await src()
    expect(s).toContain('Showing ${diagnostics.branchesRanked} of')
    expect(s).toContain('Showing ${diagnostics.pharmacistsRanked} of')
  })
})
