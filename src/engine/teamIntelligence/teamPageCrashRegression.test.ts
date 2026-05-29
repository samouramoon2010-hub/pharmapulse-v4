// ============================================================
// TeamPage — QA-found crash regression tests
// Root cause: teamHealth.status is not a field on TeamHealthSummary.
//   Correct field: teamHealth.overallTeamStatus
//   Crash: statusCfg = undefined → statusCfg.color throws
//   Additional: teamHealth.teamSize / avgPerformance / avgConsistency
//               also don't exist; correct names are memberCount /
//               teamPerformanceScore / teamConsistencyScore
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'
import {
  generateTeamIntelligence,
} from '../../engine/teamIntelligence'
import type { TeamIntelligenceInput } from '../../engine/teamIntelligence'

const TEAM_PAGE_SRC = readFileSync(
  resolve(__dirname, '../../pages/manager/TeamPage.jsx'), 'utf8'
)

// ── Minimal fixtures ───────────────────────────────────────

const TODAY = new Date().toISOString().split('T')[0]
const MONTH = TODAY.slice(0, 7)

function makeKpiEntry(userId: string, date: string, overrides: Record<string, number> = {}) {
  return {
    id: `${userId}_ph1_${date}`, userId, pharmacyId: 'ph1', date,
    wasfaty: 15, omni: 8, wellness: 10, basket: 200, crossSelling: 5,
    ...overrides,
  }
}

function makeTarget() {
  return {
    pharmacyId: 'ph1', month: MONTH,
    wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 120,
    basketTarget: 2500, crossSellingTarget: 80,
  }
}

function makePharmacistInput(userId: string, entryCount = 10) {
  const mtdEntries = Array.from({ length: entryCount }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - i)
    return makeKpiEntry(userId, d.toISOString().split('T')[0])
  })
  return {
    userId,
    displayName: `User ${userId}`,
    pharmacyId: 'ph1',
    mtdEntries,
    historicalEntries: mtdEntries,
    target: makeTarget(),
    expectedSubmissionDays: 25,
    actualSubmissionDays: entryCount,
  }
}

function buildInput(userIds: string[], entryCount = 10): TeamIntelligenceInput {
  return {
    pharmacyId: 'ph1',
    month: MONTH,
    pharmacists: userIds.map(uid => makePharmacistInput(uid, entryCount)),
  }
}

// ══════════════════════════════════════════════════════════════
// 1 — Root cause: correct TeamHealthSummary field names
// ══════════════════════════════════════════════════════════════

describe('TeamPage crash — root cause: teamHealth field names', () => {
  it('generateTeamIntelligence returns overallTeamStatus (not .status)', () => {
    const intel = generateTeamIntelligence(buildInput(['u1', 'u2']))
    const health = intel.teamHealth
    // The crash field
    expect((health as any).status).toBeUndefined()
    // The correct field
    expect(health.overallTeamStatus).toBeDefined()
  })

  it('overallTeamStatus is one of the four valid values', () => {
    const intel = generateTeamIntelligence(buildInput(['u1', 'u2']))
    const valid = ['stable', 'monitoring', 'intervention_required', 'critical_operation']
    expect(valid).toContain(intel.teamHealth.overallTeamStatus)
  })

  it('teamHealth has memberCount (not .teamSize)', () => {
    const intel = generateTeamIntelligence(buildInput(['u1', 'u2']))
    expect((intel.teamHealth as any).teamSize).toBeUndefined()
    expect(intel.teamHealth.memberCount).toBeDefined()
    expect(intel.teamHealth.memberCount).toBe(2)
  })

  it('teamHealth has teamPerformanceScore (not .avgPerformance)', () => {
    const intel = generateTeamIntelligence(buildInput(['u1']))
    expect((intel.teamHealth as any).avgPerformance).toBeUndefined()
    expect(intel.teamHealth.teamPerformanceScore).toBeDefined()
    expect(typeof intel.teamHealth.teamPerformanceScore).toBe('number')
  })

  it('teamHealth has teamConsistencyScore (not .avgConsistency)', () => {
    const intel = generateTeamIntelligence(buildInput(['u1']))
    expect((intel.teamHealth as any).avgConsistency).toBeUndefined()
    expect(intel.teamHealth.teamConsistencyScore).toBeDefined()
    expect(typeof intel.teamHealth.teamConsistencyScore).toBe('number')
  })

  it('teamHealth has activeMembers ✅ (correct on both sides)', () => {
    const intel = generateTeamIntelligence(buildInput(['u1', 'u2']))
    expect(intel.teamHealth.activeMembers).toBeDefined()
    expect(intel.teamHealth.activeMembers).toBeGreaterThanOrEqual(0)
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — statusCfg never undefined after patch
// ══════════════════════════════════════════════════════════════

describe('statusCfg — safe lookup never returns undefined', () => {
  const STATUS_MAP: Record<string, { color: string; label: string }> = {
    stable:                { color:'#22c55e', label:'Stable'               },
    monitoring:            { color:'#00d2ad', label:'Monitoring'           },
    intervention_required: { color:'#f59e0b', label:'Intervention Required'},
    critical_operation:    { color:'#ef4444', label:'Critical Operation'   },
  }
  const FALLBACK = { color: '#a1a1aa', label: 'Unknown' }

  const safeStatusCfg = (status: string | undefined) =>
    STATUS_MAP[status ?? ''] ?? { color: '#a1a1aa', label: status ?? 'Unknown' }

  it('returns config for all four known statuses', () => {
    const statuses = ['stable', 'monitoring', 'intervention_required', 'critical_operation']
    for (const s of statuses) {
      const cfg = safeStatusCfg(s)
      expect(cfg).toBeDefined()
      expect(cfg.color).toMatch(/^#[0-9a-fA-F]{6}$|^var\(/)
      expect(cfg.label).toBeTruthy()
    }
  })

  it('returns fallback for undefined status (the crash case)', () => {
    const cfg = safeStatusCfg(undefined)
    expect(cfg).toBeDefined()
    expect(cfg.color).toBe('#a1a1aa')
    expect(cfg.label).toBe('Unknown')
  })

  it('returns fallback for empty string', () => {
    const cfg = safeStatusCfg('')
    expect(cfg).toBeDefined()
    expect(cfg.color).toBe('#a1a1aa')
  })

  it('returns fallback for unexpected engine status', () => {
    const cfg = safeStatusCfg('new_status_from_engine_v2')
    expect(cfg).toBeDefined()
    expect(cfg.color).toBe('#a1a1aa')
  })

  it('cfg.color never throws when accessed on result', () => {
    const testCases = [undefined, '', 'stable', 'critical_operation', 'unknown_xyz']
    for (const s of testCases) {
      expect(() => safeStatusCfg(s).color).not.toThrow()
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — Source patch verification
// ══════════════════════════════════════════════════════════════

describe('TeamPage source — patch applied correctly', () => {
  it('uses overallTeamStatus (not .status) for primary lookup', () => {
    expect(TEAM_PAGE_SRC).toContain('overallTeamStatus')
  })

  it('has nullish fallback chain on status: overallTeamStatus ?? ... ?? stable', () => {
    expect(TEAM_PAGE_SRC).toMatch(/overallTeamStatus\s*\?\?.*\?\?\s*'stable'/)
  })

  it('statusCfg has a final fallback for unknown statuses', () => {
    // Patched: ?? { color:'#a1a1aa', label: teamStatus ?? 'Unknown' }
    expect(TEAM_PAGE_SRC).toMatch(/statusCfg\s*=[\s\S]*\?\?\s*\{/)
  })

  it('uses memberCount (not teamSize) from teamHealth', () => {
    expect(TEAM_PAGE_SRC).toContain('memberCount')
    // No bare teamHealth.teamSize remaining
    expect(TEAM_PAGE_SRC).not.toMatch(/teamHealth\.teamSize\b/)
  })

  it('uses teamPerformanceScore (not avgPerformance) from teamHealth', () => {
    expect(TEAM_PAGE_SRC).toContain('teamPerformanceScore')
    expect(TEAM_PAGE_SRC).not.toMatch(/teamHealth\.avgPerformance\b/)
  })

  it('uses teamConsistencyScore (not avgConsistency) from teamHealth', () => {
    expect(TEAM_PAGE_SRC).toContain('teamConsistencyScore')
    expect(TEAM_PAGE_SRC).not.toMatch(/teamHealth\.avgConsistency\b/)
  })

  it('extracted local variables: teamSize, avgPerformance, avgConsistency, activeMembers', () => {
    expect(TEAM_PAGE_SRC).toMatch(/const teamSize\s*=/)
    expect(TEAM_PAGE_SRC).toMatch(/const avgPerformance\s*=/)
    expect(TEAM_PAGE_SRC).toMatch(/const avgConsistency\s*=/)
    expect(TEAM_PAGE_SRC).toMatch(/const activeMembers\s*=/)
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — TeamManagementPage kpi.color still correct (Part 3 fix)
// ══════════════════════════════════════════════════════════════

describe('TeamManagementPage — Part 3 color fix still intact', () => {
  const TEAM_MGMT_SRC = readFileSync(
    resolve(__dirname, '../../pages/shared/TeamManagementPage.jsx'), 'utf8'
  )

  it('dot indicator uses kpi.color ?? kpi.defaultColor ?? fallback', () => {
    expect(TEAM_MGMT_SRC).toMatch(/kpi\.color\s*\?\?\s*kpi\.defaultColor\s*\?\?\s*'#a1a1aa'/)
  })

  it('progress bar fill uses kpi.color ?? kpi.defaultColor ?? fallback', () => {
    const matches = [...TEAM_MGMT_SRC.matchAll(/kpi\.color\s*\?\?\s*kpi\.defaultColor\s*\?\?\s*'#a1a1aa'/g)]
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('no bare kpi.color without fallback remains', () => {
    expect(TEAM_MGMT_SRC).not.toMatch(/background:\s*kpi\.color\s*(?!\s*\?\?|\s*\|\|)/)
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — End-to-end: engine → page data flow does not crash
// ══════════════════════════════════════════════════════════════

describe('TeamPage — end-to-end data flow safety', () => {
  it('generateTeamIntelligence with 1 user does not produce undefined status', () => {
    const intel = generateTeamIntelligence(buildInput(['u1']))
    expect(intel.teamHealth.overallTeamStatus).toBeTruthy()
  })

  it('generateTeamIntelligence with 5 users returns valid health scores', () => {
    const intel = generateTeamIntelligence(buildInput(['u1','u2','u3','u4','u5']))
    const h = intel.teamHealth
    expect(h.teamPerformanceScore).toBeGreaterThanOrEqual(0)
    expect(h.teamPerformanceScore).toBeLessThanOrEqual(100)
    expect(h.teamConsistencyScore).toBeGreaterThanOrEqual(0)
    expect(h.memberCount).toBe(5)
  })

  it('status strip values resolve without NaN', () => {
    const intel = generateTeamIntelligence(buildInput(['u1', 'u2']))
    const h = intel.teamHealth
    const perf = h.teamPerformanceScore ?? 0
    const cons = h.teamConsistencyScore ?? 0
    const mc   = h.memberCount          ?? 0
    const am   = h.activeMembers        ?? 0
    expect(isNaN(perf)).toBe(false)
    expect(isNaN(cons)).toBe(false)
    expect(isNaN(mc)).toBe(false)
    expect(isNaN(am)).toBe(false)
    expect(`${perf}%`).toBeTruthy()
    expect(`${am}/${mc}`).toBeTruthy()
  })
})
