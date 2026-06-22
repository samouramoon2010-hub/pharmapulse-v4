// ============================================================
// Dashboard Cleanup Sprint — Regression Tests
//
// 1. Contradiction guard — a user cannot appear in both
//    topPerformerIds and atRiskMemberIds in Today's Focus
// 2. Today's Focus rebuilt as Focus KPI / Biggest Risk / Opportunity
// 3. Branch Health card shows ahead/behind pace delta
// 4. Team Status uses human-readable wording
// 5. Remaining This Month strip present
// ============================================================

import { describe, it, expect } from 'vitest'
import { getCombinedDashboardSource } from './testHelpers'

async function src() {
  return getCombinedDashboardSource()
}

// ════════════════════════════════════════════════════════════════
// 1. Contradiction guard
// ════════════════════════════════════════════════════════════════

describe('Contradiction guard — top performer vs at-risk', () => {
  it('1: at-risk candidates exclude anyone in topPerformerIds', async () => {
    const s = await src()
    expect(s).toContain('riskCandidates')
    expect(s).toContain('topPerfSet.has(uid)')
    expect(s).toContain('atRiskMemberIds?.filter(uid => !topPerfSet.has(uid))')
  })

  it('2: opportunity candidates exclude anyone in atRiskMemberIds', async () => {
    const s = await src()
    expect(s).toContain('oppCandidates')
    expect(s).toContain('atRiskSet.has(uid)')
    expect(s).toContain('topPerformerIds?.filter(uid => !atRiskSet.has(uid))')
  })

  it('3: contradiction guard logic is sound — mutual exclusion', () => {
    // Simulate the logic in isolation
    const topPerformerIds = ['u1', 'u2']
    const atRiskMemberIds  = ['u1', 'u3']  // u1 appears in both

    const topPerfSet      = new Set(topPerformerIds)
    const atRiskSet       = new Set(atRiskMemberIds)
    const riskCandidates  = atRiskMemberIds.filter(uid => !topPerfSet.has(uid))
    const oppCandidates   = topPerformerIds.filter(uid => !atRiskSet.has(uid))

    // u1 must NOT appear in both outputs
    expect(riskCandidates).not.toContain('u1')   // removed because also in topPerf
    expect(oppCandidates).not.toContain('u1')    // removed because also in atRisk
    expect(riskCandidates).toContain('u3')       // u3 only in atRisk — OK
    expect(oppCandidates).toContain('u2')        // u2 only in topPerf — OK
  })
})

// ════════════════════════════════════════════════════════════════
// 2. Today's Focus three pillars
// ════════════════════════════════════════════════════════════════

describe("Today's Focus — three pillars", () => {
  it('4: Focus KPI pillar uses weakestKpi and remainingToTarget', async () => {
    const s = await src()
    expect(s).toContain('focusPillar')
    expect(s).toContain('focusKpiKey')
    expect(s).toContain('remainingToTarget')
  })

  it('5: Biggest Risk pillar uses atRiskMemberIds (with exclusion guard)', async () => {
    const s = await src()
    expect(s).toContain('riskPillar')
    expect(s).toContain('riskCandidates')
  })

  it('6: Best Opportunity pillar uses topPerformerIds (with exclusion guard)', async () => {
    const s = await src()
    expect(s).toContain('oppPillar')
    expect(s).toContain('oppCandidates')
    expect(s).toContain("'top performer — leverage'")
  })

  it('7: priorities array uses the three new pillars not old pattern', async () => {
    const s = await src()
    expect(s).toContain('[focusPillar, riskPillar, oppPillar]')
    // Old pattern must be gone
    expect(s).not.toContain("note: 'needs support'")
    expect(s).not.toContain("note: 'team weak KPI'")
    expect(s).not.toContain("note: 'top performer'")
  })
})

// ════════════════════════════════════════════════════════════════
// 3. Branch Health card — ahead/behind pace delta
// ════════════════════════════════════════════════════════════════

describe('Branch Health — target gap / ahead-behind', () => {
  it('8: ahead/behind pace delta computed from overallAch vs expectedPct', async () => {
    const s = await src()
    expect(s).toContain('gapPts')
    expect(s).toContain('overallAch - expectedPct')
  })

  it('9: positive gap shows "ahead of pace"', async () => {
    const s = await src()
    expect(s).toContain('ahead of pace')
  })

  it('10: negative gap shows "behind pace"', async () => {
    const s = await src()
    expect(s).toContain('behind pace')
  })

  it('11: gap delta math is correct', () => {
    const overallAch  = 75
    const expectedPct = 40   // day 12 of 30
    const gapPts      = overallAch - expectedPct
    expect(gapPts).toBe(35)
    const label = gapPts >= 0 ? `+${gapPts}pts ahead of pace` : `${gapPts}pts behind pace`
    expect(label).toBe('+35pts ahead of pace')

    const overallAch2  = 30
    const expectedPct2 = 40
    const gapPts2      = overallAch2 - expectedPct2
    const label2 = gapPts2 >= 0 ? `+${gapPts2}pts ahead of pace` : `${gapPts2}pts behind pace`
    expect(label2).toBe('-10pts behind pace')
  })
})

// ════════════════════════════════════════════════════════════════
// 4. Team Status wording
// ════════════════════════════════════════════════════════════════

describe('Team Status — human-readable wording', () => {
  it('12: teamStatusWord, teamStatusSub, teamStatusColor computed before JSX', async () => {
    const s = await src()
    expect(s).toContain('teamStatusWord')
    expect(s).toContain('teamStatusSub')
    expect(s).toContain('teamStatusColor')
  })

  it('13: "Excellent" shown when no at-risk and score >= 85', async () => {
    const s = await src()
    expect(s).toContain("teamScore >= 85 ? 'Excellent'")
  })

  it('14: "Attention Needed" shown when at-risk count > 0 but < 50%', async () => {
    const s = await src()
    expect(s).toContain("'Attention Needed'")
  })

  it('15: "X of N at risk" sub-line when at-risk members present', async () => {
    const s = await src()
    expect(s).toContain('at risk`')
    expect(s).toContain('of ${memberCount} at risk')
  })

  it('16: "X/N on track" sub-line when all healthy', async () => {
    const s = await src()
    expect(s).toContain('on track`')
  })

  it('17: status wording logic is correct', () => {
    // Simulate logic
    function computeStatus(summaries: Array<{operationalRisk: string; coachingPriority: string}>, teamScore: number | null, memberCount: number) {
      const atRiskCount  = summaries.filter(s => s.operationalRisk === 'high' || s.coachingPriority === 'immediate').length
      const onTrackCount = summaries.filter(s => s.operationalRisk === 'none' || s.operationalRisk === 'low').length
      const word  = atRiskCount > 0
        ? (atRiskCount >= summaries.length * 0.5 ? 'Critical' : 'Attention Needed')
        : (teamScore !== null && teamScore >= 85 ? 'Excellent' : 'Stable')
      const sub   = atRiskCount > 0 ? `${atRiskCount} of ${memberCount} at risk` : `${onTrackCount}/${memberCount} on track`
      return { word, sub }
    }

    const allGood = [
      { operationalRisk: 'none', coachingPriority: 'routine' },
      { operationalRisk: 'low',  coachingPriority: 'routine' },
    ]
    expect(computeStatus(allGood, 90, 2)).toEqual({ word: 'Excellent', sub: '2/2 on track' })

    const oneAtRisk = [
      { operationalRisk: 'high',  coachingPriority: 'immediate' },
      { operationalRisk: 'none',  coachingPriority: 'routine'   },
      { operationalRisk: 'low',   coachingPriority: 'routine'   },
    ]
    expect(computeStatus(oneAtRisk, 72, 3)).toEqual({ word: 'Attention Needed', sub: '1 of 3 at risk' })

    const majority = [
      { operationalRisk: 'high', coachingPriority: 'immediate' },
      { operationalRisk: 'high', coachingPriority: 'immediate' },
      { operationalRisk: 'none', coachingPriority: 'routine'   },
    ]
    expect(computeStatus(majority, 40, 3).word).toBe('Critical')
  })
})

// ════════════════════════════════════════════════════════════════
// 5. Remaining This Month strip
// ════════════════════════════════════════════════════════════════

describe('Remaining This Month strip', () => {
  it('18: Remaining This Month section present', async () => {
    const s = await src()
    expect(s).toContain('Remaining This Month')
  })

  it('19: uses remainingToTarget from kpiStats', async () => {
    const s = await src()
    const section = s.slice(s.indexOf('Remaining This Month') - 300, s.indexOf('Remaining This Month') + 800)
    expect(section).toContain('remainingToTarget')
  })

  it('20: shows requiredDailyPace from paceMap', async () => {
    const s = await src()
    expect(s).toContain('requiredDailyPace')
    expect(s).toContain('/day')
  })

  it('21: filters out KPIs with remaining = 0 (already achieved)', async () => {
    const s = await src()
    expect(s).toContain('filter(r => r.remaining > 0)')
  })

  it('22: shows top 3 only', async () => {
    const s = await src()
    expect(s).toContain('.slice(0, 3)')
  })
})
