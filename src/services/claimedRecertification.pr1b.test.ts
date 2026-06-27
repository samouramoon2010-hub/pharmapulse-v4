// ============================================================
// PR-1B — CLAIMED-record recertification (requirement #6)
//
// Re-audits two operational user readers found during this section's
// Phase 0 sweep that did not yet exclude authStatus === 'CLAIMED':
//   - historyService.fetchBranchPharmacists() (missing-submission risk
//     detection + ranking history roster)
//   - ranking-service.fetchUserDisplayNames() (rankings name enrichment)
// Both now match the established exclusion pattern already certified
// for userService.getUsersByPharmacy() in claimedVisibility.test.ts.
// ============================================================
import { describe, it, expect } from 'vitest'

async function historyServiceSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('./historyService.js?raw')).default
}

async function rankingServiceSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('../ranking/ranking-service.ts?raw')).default
}

async function districtsPageSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('../pages/admin/DistrictsPage.tsx?raw')).default
}

async function regionsPageSrc(): Promise<string> {
  // @ts-expect-error — vite ?raw import, no type declaration
  return (await import('../pages/admin/RegionsPage.tsx?raw')).default
}

describe('PR-1B — historyService.fetchBranchPharmacists excludes CLAIMED', () => {
  it('filters authStatus === CLAIMED before building the branch pharmacist roster', async () => {
    const s = await historyServiceSrc()
    expect(s).toContain("d.data().authStatus !== 'CLAIMED'")
  })
})

describe('PR-1B — ranking-service.fetchUserDisplayNames excludes CLAIMED', () => {
  it('skips CLAIMED docs before adding a display name to the rankings name map', async () => {
    const s = await rankingServiceSrc()
    expect(s).toContain("data.authStatus === 'CLAIMED'")
  })
})

describe('PR-1B — district supervisor / regional manager role pickers exclude CLAIMED', () => {
  it('DistrictsPage supervisor dropdown filters authStatus === CLAIMED', async () => {
    const s = await districtsPageSrc()
    expect(s).toContain("d.data().authStatus !== 'CLAIMED'")
  })

  it('RegionsPage manager dropdown filters authStatus === CLAIMED', async () => {
    const s = await regionsPageSrc()
    expect(s).toContain("d.data().authStatus !== 'CLAIMED'")
  })
})
