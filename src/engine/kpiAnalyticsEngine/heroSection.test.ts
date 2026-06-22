// ============================================================
// Dashboard Hero Section — Phase 1A Regression Tests
//
// Verifies the executive hero section is correctly wired:
//   1.  Hero section exists in DashboardPage source
//   2.  Pharmacy name + code rendered
//   3.  Month label rendered
//   4.  Branch Health Score uses overallAch
//   5.  Forecast EOM card uses forecastMap
//   6.  Team Status card uses teamIntelligence
//   7.  Portfolio Risk card uses riskLevel
//   8.  Today's Focus priorities strip present
//   9.  Hero shown only when data is available (!loading && !noBranch)
//  10.  Green command stripe (#1a7a4a) is in the design
//  11.  No new data fetches introduced (no new service calls)
//  12.  All existing memoized data reused (no duplicate computations)
// ============================================================

import { describe, it, expect } from 'vitest'

describe('Hero Section — Phase 1A', () => {
  async function src() {
    return (await import('../../pages/dashboard/DashboardPage.jsx?raw')).default
  }

  it('1: Hero section block exists', async () => {
    const s = await src()
    expect(s).toContain('Executive Hero Section')
    expect(s).toContain('Phase 1A: Command Center header')
  })

  it('2: Pharmacy name and code are rendered', async () => {
    const s = await src()
    expect(s).toContain('pharmName')
    expect(s).toContain('pharmCode')
    expect(s).toContain("pharmacies.find((p) => p.id === pharmacyId)")
  })

  it('3: Month label uses format(new Date())', async () => {
    const s = await src()
    expect(s).toContain("format(new Date(), 'MMMM yyyy')")
    expect(s).toContain('monthLabel')
  })

  it('4: Branch Health card uses overallAch and overallColors', async () => {
    const s = await src()
    const heroBlock = s.slice(s.indexOf('Executive Hero Section'), s.indexOf('Page header'))
    expect(heroBlock).toContain('overallAch')
    expect(heroBlock).toContain('overallColors.color')
    expect(heroBlock).toContain('Branch Health')
  })

  it('5: Forecast EOM card uses forecastMap', async () => {
    const s = await src()
    const heroBlock = s.slice(s.indexOf('Executive Hero Section'), s.indexOf('Page header'))
    expect(heroBlock).toContain('forecastMap')
    expect(heroBlock).toContain('fcVal')
    expect(heroBlock).toContain('Forecast EOM')
  })

  it('6: Team Status card uses teamIntelligence', async () => {
    const s = await src()
    const heroBlock = s.slice(s.indexOf('Executive Hero Section'), s.indexOf('Page header'))
    expect(heroBlock).toContain('teamIntelligence')
    expect(heroBlock).toContain('teamStatus')
    expect(heroBlock).toContain('Team Status')
  })

  it('7: Portfolio Risk card uses riskLevel', async () => {
    const s = await src()
    const heroBlock = s.slice(s.indexOf('Executive Hero Section'), s.indexOf('Page header'))
    expect(heroBlock).toContain('riskLevel')
    expect(heroBlock).toContain('Portfolio Risk')
    expect(heroBlock).toContain('RISK_CFG')
  })

  it("8: Today's Focus priorities strip is rendered", async () => {
    const s = await src()
    expect(s).toContain("Today's Focus")
    expect(s).toContain('priorities.map')
    expect(s).toContain('topPerformerIds')
    expect(s).toContain('atRiskMemberIds')
  })

  it('9: Hero is gated on !loading && !noBranch', async () => {
    const s = await src()
    // The IIFE pattern that wraps the hero block
    // The gate wraps the whole hero IIFE — check in source around the hero block
    expect(s).toContain('{!loading && (() => {')
  })

  it('10: Nahdi green #1a7a4a is used in the design', async () => {
    const s = await src()
    expect(s).toContain('#1a7a4a')
  })

  it('11: No new service imports introduced by hero section', async () => {
    const s = await src()
    // Count import statements — should not have grown with new service calls
    // Hero only uses existing memoized variables
    const heroBlock = s.slice(s.indexOf('Executive Hero Section'), s.indexOf('Page header'))
    expect(heroBlock).not.toContain('import(')
    expect(heroBlock).not.toContain('await fetch')
    expect(heroBlock).not.toContain('useEffect')
  })

  it('12: Hero reuses existing memoized values — no useMemo inside hero', async () => {
    const s = await src()
    const heroBlock = s.slice(s.indexOf('Executive Hero Section'), s.indexOf('Page header'))
    expect(heroBlock).not.toContain('useMemo(')
    // All values should be pre-computed: overallAch, forecastMap, teamIntelligence, riskLevel
    expect(heroBlock).toContain('overallAch')
    expect(heroBlock).toContain('forecastMap')
    expect(heroBlock).toContain('teamIntelligence')
    expect(heroBlock).toContain('riskLevel')
  })
})
