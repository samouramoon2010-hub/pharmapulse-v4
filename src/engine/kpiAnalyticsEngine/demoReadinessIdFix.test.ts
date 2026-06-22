// ============================================================
// Demo Readiness — ID Leakage Fix Regression Tests
//
// Verifies that every raw-ID fallback identified in the audit
// has been replaced with a human-readable 'Unknown User' or
// 'Unknown Branch' sentinel.
//
// Test strategy: source-inspection (raw imports) so these tests
// are immune to Firebase env failures and don't require mocks.
//
//  1.  TeamIntelligenceCard: no s.userId fallback
//  2.  TeamIntelligenceCard: 'Unknown User' fallback present
//  3.  TeamPage: no uid.slice fallback anywhere
//  4.  TeamPage PharmacistInput: 'Unknown User' fallback present
//  5.  TeamPage Top Performers callout: 'Unknown User' fallback present
//  6.  TeamPage Needs Attention callout: 'Unknown User' fallback present
//  7.  TeamPage userMap build: 'Unknown User' fallback present
//  8.  DashboardPage userMap build: no u.id fallback
//  9.  DashboardPage userMap build: 'Unknown User' fallback present
// 10.  RankingsPage branch table: no s.entityId fallback
// 11.  RankingsPage pharmacist table: no s.entityId fallback
// 12.  RankingsPage excluded table: no ex.entityId fallback
// 13.  RankingsPage: all entityId fallbacks replaced with 'Unknown'
// 14.  RankingsPage pharmId column: no raw pharmacyId rendered
// 15.  bulkEvaluationService: no user.id displayName fallback
// 16.  bulkEvaluationService: no u.id displayName fallback
// 17.  bulkEvaluationService: 'Unknown User' fallback present
// 18.  classificationId column: unchanged (business label, not raw ID)
// ============================================================

import { describe, it, expect } from 'vitest'

describe('Demo Readiness — ID Leakage: TeamIntelligenceCard', () => {
  it('1: s.userId text-content fallback removed (key= usage intentional)', async () => {
    const src = await import('../../components/ui/TeamIntelligenceCard.jsx?raw')
    // The only banned pattern is the OR-fallback rendering userId as visible text
    expect(src.default).not.toContain('|| s.userId')
    // key={s.userId} is correct React reconciliation — not a visible text leak
  })

  it("2: 'Unknown User' fallback present in both member lists", async () => {
    const src = await import('../../components/ui/TeamIntelligenceCard.jsx?raw')
    const occurrences = (src.default.match(/\|\| 'Unknown User'/g) ?? []).length
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })
})

describe('Demo Readiness — ID Leakage: TeamPage', () => {
  it('3: no uid.slice(0,6) anywhere in TeamPage', async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    expect(src.default).not.toContain('uid.slice(0,6)')
    expect(src.default).not.toContain('uid.slice(0, 6)')
  })

  it("4: PharmacistInput uses 'Unknown User' fallback", async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    expect(src.default).toContain("userMap.get(uid) ?? 'Unknown User'")
  })

  it("5: Top Performers callout uses 'Unknown User' fallback", async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    const topSection = src.default.slice(
      src.default.indexOf('Top Performers'),
      src.default.indexOf('Needs Attention'),
    )
    expect(topSection).toContain("?? 'Unknown User'")
  })

  it("6: Needs Attention callout uses 'Unknown User' fallback", async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    const atRiskSection = src.default.slice(
      src.default.indexOf('Needs Attention'),
      src.default.indexOf('A1: Team KPI Profile'),
    )
    expect(atRiskSection).toContain("?? 'Unknown User'")
  })

  it("7: userMap build uses 'Unknown User' not u.id", async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw')
    expect(src.default).toContain("u.displayName || 'Unknown User'")
    expect(src.default).not.toContain('u.displayName || u.id')
  })
})

describe('Demo Readiness — ID Leakage: DashboardPage', () => {
  it('8: pharmacyUserMap build no longer falls back to u.id', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).not.toContain('u.displayName || u.id')
  })

  it("9: pharmacyUserMap build uses 'Unknown User' fallback", async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw')
    expect(src.default).toContain("u.displayName || 'Unknown User'")
  })
})

describe('Demo Readiness — ID Leakage: RankingsPage', () => {
  it('10: branch ranking table: entityId fallback removed', async () => {
    const src = await import('../../pages/admin/RankingsPage.tsx?raw')
    expect(src.default).not.toContain('s.entityName ?? s.entityId')
  })

  it('11: pharmacist ranking table: entityId fallback removed', async () => {
    // Both tables share the same pattern — count confirms both are gone
    const src = await import('../../pages/admin/RankingsPage.tsx?raw')
    const remaining = (src.default.match(/entityName \?\? .+entityId/g) ?? []).length
    expect(remaining).toBe(0)
  })

  it('12: excluded-entries table: entityId fallback removed', async () => {
    const src = await import('../../pages/admin/RankingsPage.tsx?raw')
    expect(src.default).not.toContain('ex.entityName ?? ex.entityId')
  })

  it("13: all entityId fallbacks replaced with 'Unknown'", async () => {
    const src = await import('../../pages/admin/RankingsPage.tsx?raw')
    const unknownCount = (src.default.match(/entityName \?\? 'Unknown'/g) ?? []).length
    expect(unknownCount).toBeGreaterThanOrEqual(3)
  })

  it('14: pharmId column does not render raw pharmacyId string', async () => {
    const src = await import('../../pages/admin/RankingsPage.tsx?raw')
    // The old pattern rendered the raw ID: {pharmId ?? '—'}
    expect(src.default).not.toContain("{pharmId ?? '—'}")
    // The new pattern uses a branch-name sentinel
    expect(src.default).toContain("pharmId !== undefined ? 'Unknown Branch' : '—'")
  })

  it('18: classificationId column unchanged (business label)', async () => {
    const src = await import('../../pages/admin/RankingsPage.tsx?raw')
    // classificationId is a user-configured label — should still be rendered as-is
    expect(src.default).toContain('{s.classificationId}')
  })
})

describe('Demo Readiness — ID Leakage: bulkEvaluationService', () => {
  it('15: user.id displayName fallback removed', async () => {
    const src = await import('../../services/bulkEvaluationService.ts?raw')
    expect(src.default).not.toContain('user.displayName ?? user.id')
  })

  it('16: u.id displayName fallback removed', async () => {
    const src = await import('../../services/bulkEvaluationService.ts?raw')
    expect(src.default).not.toContain('u.displayName ?? u.id')
  })

  it("17: 'Unknown User' fallback present in both paths", async () => {
    const src = await import('../../services/bulkEvaluationService.ts?raw')
    // Count occurrences using split (avoids regex special chars in ??)
    const occurrences = src.default.split("?? 'Unknown User'").length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })
})
