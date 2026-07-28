import { describe, it, expect } from 'vitest'
import { buildCriticalRiskAlert, selectCriticalRiskBranches } from './criticalRiskAlertBuilder'
import type { BranchRollupSummary } from '../../engine/regionalIntelligence/regionalTypes'

function makeBranch(overrides: Partial<BranchRollupSummary> = {}): BranchRollupSummary {
  return {
    branchId: 'b1', branchName: 'Branch One', branchCode: 'B01', region: 'Cairo',
    period: { type: 'MTD', startDate: '2026-06-01', endDate: '2026-06-15', month: '2026-06', dayRatio: 0.5 } as any,
    kpiAchievementSummary: [],
    overallAchievementPct: 40,
    branchScore: 35,
    riskLevel: 'HIGH_RISK',
    momentumDirection: 'DECLINING',
    operationalStatus: 'INTERVENTION' as any,
    ...overrides,
  } as BranchRollupSummary
}

describe('selectCriticalRiskBranches', () => {
  it('keeps only HIGH_RISK branches', () => {
    const branches = [
      makeBranch({ branchId: 'b1', riskLevel: 'HIGH_RISK' }),
      makeBranch({ branchId: 'b2', riskLevel: 'MEDIUM_RISK' }),
      makeBranch({ branchId: 'b3', riskLevel: 'ON_TRACK' }),
    ]
    expect(selectCriticalRiskBranches(branches).map((b) => b.branchId)).toEqual(['b1'])
  })
})

describe('buildCriticalRiskAlert', () => {
  it('returns null when there are no HIGH_RISK branches (never sends an empty alert)', () => {
    const branches = [makeBranch({ riskLevel: 'MEDIUM_RISK' })]
    expect(buildCriticalRiskAlert(branches, '2026-06')).toBeNull()
  })

  it('builds subject/html/text for the real critical branches, sorted worst score first', () => {
    const branches = [
      makeBranch({ branchId: 'b1', branchName: 'Weak Branch', branchScore: 50, riskLevel: 'HIGH_RISK' }),
      makeBranch({ branchId: 'b2', branchName: 'Weaker Branch', branchScore: 20, riskLevel: 'HIGH_RISK' }),
      makeBranch({ branchId: 'b3', branchName: 'Fine Branch', branchScore: 90, riskLevel: 'ON_TRACK' }),
    ]
    const alert = buildCriticalRiskAlert(branches, '2026-06')!
    expect(alert.branchCount).toBe(2)
    expect(alert.subject).toContain('2 branches')
    expect(alert.subject).toContain('2026-06')
    // Worst score (Weaker Branch, 20) must appear before Weak Branch (50)
    expect(alert.text.indexOf('Weaker Branch')).toBeLessThan(alert.text.indexOf('Weak Branch'))
    expect(alert.html).toContain('Weaker Branch')
    expect(alert.html).not.toContain('Fine Branch')
  })

  it('HTML-escapes branch names to prevent injection into the email body', () => {
    const branches = [makeBranch({ branchName: '<img src=x onerror=alert(1)>', riskLevel: 'HIGH_RISK' })]
    const alert = buildCriticalRiskAlert(branches, '2026-06')!
    expect(alert.html).not.toContain('<img')
    expect(alert.html).toContain('&lt;img')
  })

  it('uses singular phrasing for exactly one critical branch', () => {
    const branches = [makeBranch({ riskLevel: 'HIGH_RISK' })]
    const alert = buildCriticalRiskAlert(branches, '2026-06')!
    expect(alert.subject).toContain('1 branch at critical risk')
  })
})
