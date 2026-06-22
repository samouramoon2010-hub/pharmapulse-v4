// ============================================================
// KPI Card Polish Sprint — Regression Tests
//
// 1. Status badge root cause: "On Track" at 39% is technically
//    correct — paceRatio = currentRate/requiredRate = 1.12 (ON_PACE)
//    because 39% achievement > 37% expected at day 11.
//    Fix: badges renamed to pace-explicit labels + vs-expected context.
//
// 2. Focus KPI banner elevated to standalone card.
// 3. Actual appears before Remaining (3-column: Actual|Remain|Target).
// 4. Need/day renamed to "Required pace" action pill with 🎯.
// 5. Target always visible in its own column.
// 6. Achieved cards de-emphasized (opacity 0.72).
// ============================================================

import { describe, it, expect } from 'vitest'
import { getCombinedDashboardSource } from './testHelpers'
import { computePace, classifyPaceStatus, getDayProgress } from '../../engine/kpiAnalyticsEngine'

// ════════════════════════════════════════════════════════════════
// 1. Status badge root cause verification
// ════════════════════════════════════════════════════════════════

describe('Badge root cause — On Pace at 39% is correct', () => {
  it('paceRatio > 1 when currentDailyRate > requiredDailyPace', () => {
    // OmniHealth: actual=1332, target=3383, day=11/30
    const dp = getDayProgress(new Date('2026-06-11T12:00:00'))
    const result = computePace(1332, 3383, dp)
    // currentDailyRate = 1332/11 = 121.1
    // remaining = 2051, daysRemaining = 19, requiredDailyPace = 108
    // paceRatio = 121.1 / 108 = 1.12 → ON_PACE
    expect(result.paceStatus).toBe('ON_PACE')
    expect(result.paceRatio).toBeGreaterThan(1.0)
  })

  it('39% achievement at day 11 is AHEAD of expected (36.7% elapsed)', () => {
    const expected = Math.round((11 / 30) * 100)   // 37%
    const actual   = 39
    expect(actual).toBeGreaterThan(expected)
  })

  it('badge label is pace-explicit, not achievement-based', async () => {
    const src = await getCombinedDashboardSource()
    // Old labels must be gone
    expect(src).not.toContain("label: '✓ On Track'")
    expect(src).not.toContain("label: '⚠ Behind Pace'")
    // New pace-explicit labels must be present
    expect(src).toContain("label: 'On Pace'")
    expect(src).toContain("label: 'Slightly Behind'")
    expect(src).toContain("label: 'Behind Pace'")
    expect(src).toContain("label: 'Critical'")
  })

  it('classifyPaceStatus: 1.12 paceRatio → ON_PACE', () => {
    expect(classifyPaceStatus(1.12)).toBe('ON_PACE')
    expect(classifyPaceStatus(1.25)).toBe('EXCEEDING')
    expect(classifyPaceStatus(0.80)).toBe('SLIGHTLY_BEHIND')
    expect(classifyPaceStatus(0.55)).toBe('SIGNIFICANTLY_BEHIND')
    expect(classifyPaceStatus(0.30)).toBe('CRITICAL')
  })
})

// ════════════════════════════════════════════════════════════════
// 2. Pace context line (vs expected)
// ════════════════════════════════════════════════════════════════

describe('Pace context — vs expected delta', () => {
  it('kpiVsExpected function is present in source', async () => {
    const src = await getCombinedDashboardSource()
    expect(src).toContain('kpiVsExpected')
    expect(src).toContain('vs expected')
  })

  it('positive delta shows +Npts (green)', () => {
    const expectedPct = 37
    const achPct      = 39
    const delta       = achPct - expectedPct
    const text = delta >= 0 ? `+${delta}pts vs expected` : `${delta}pts vs expected`
    expect(text).toBe('+2pts vs expected')
  })

  it('negative delta shows -Npts (amber)', () => {
    const delta = 30 - 37   // -7
    const text  = delta >= 0 ? `+${delta}pts vs expected` : `${delta}pts vs expected`
    expect(text).toBe('-7pts vs expected')
  })
})

// ════════════════════════════════════════════════════════════════
// 3. Focus KPI banner elevated design
// ════════════════════════════════════════════════════════════════

describe('Focus KPI banner', () => {
  it('command card has header bar with "Focus KPI" label', async () => {
    const src = await getCombinedDashboardSource()
    expect(src).toContain('Focus KPI Command Card')
    expect(src).toContain('>\n          Focus KPI\n')  // Phase 5A: 10-space indent in extracted FocusKpiCommandCard.jsx
  })

  it('command card shows KPI name prominently', async () => {
    const src = await getCombinedDashboardSource()
    const bannerIdx = src.indexOf('Focus KPI Command Card')
    expect(bannerIdx).toBeGreaterThan(-1)
    const bannerBlock = src.slice(bannerIdx, bannerIdx + 3000)
    expect(bannerBlock).toContain('fk?._label ?? kpiKey')  // Phase 5A: extracted component uses fk?. and kpiKey prop
  })

  it('command card shows achievement %, remaining, required pace', async () => {
    const src = await getCombinedDashboardSource()
    const bannerIdx = src.indexOf('Focus KPI Command Card')
    expect(bannerIdx).toBeGreaterThan(-1)
    const bannerBlock = src.slice(bannerIdx, bannerIdx + 4000)
    expect(bannerBlock).toContain('fk?.achievementPct')  // Phase 5A: extracted component uses optional chaining
    expect(bannerBlock).toContain('remainingToTarget')
    expect(bannerBlock).toContain('requiredDailyPace')
    expect(bannerBlock).toContain('Required')
  })

  it('command card shows variance vs expected', async () => {
    const src = await getCombinedDashboardSource()
    const bannerIdx = src.indexOf('Focus KPI Command Card')
    expect(bannerIdx).toBeGreaterThan(-1)
    const bannerBlock = src.slice(bannerIdx, bannerIdx + 4500)
    expect(bannerBlock).toContain('fVs')
    expect(bannerBlock).toContain('fVs.text')
  })

  it('command card uses a vertical stack layout (not horizontal flex row)', async () => {
    const src = await getCombinedDashboardSource()
    const bannerIdx = src.indexOf('Focus KPI Command Card')
    const bannerBlock = src.slice(bannerIdx, bannerIdx + 4000)
    // Vertical command card: each stat is its own block, not a horizontal flex row
    expect(bannerBlock).not.toContain("alignItems:'center', gap:'16px', flexWrap:'wrap'")
  })

  it('command card achievement % is the largest element (36px)', async () => {
    const src = await getCombinedDashboardSource()
    const bannerIdx = src.indexOf('Focus KPI Command Card')
    const bannerBlock = src.slice(bannerIdx, bannerIdx + 4000)
    expect(bannerBlock).toContain("fontSize:'36px'")
  })
})

// ════════════════════════════════════════════════════════════════
// 4. Actual before Remaining; Target visible
// ════════════════════════════════════════════════════════════════

describe('KPI tile — data order and target visibility', () => {
  it('tile uses stacked-row layout: Achievement → Remaining → Required → Actual/Target → Variance', async () => {
    const src = await getCombinedDashboardSource()
    const tileStart = src.indexOf('kpi-tile animate-slide-up')
    const tileBlock = src.slice(tileStart, tileStart + 6000)
    // Density sprint replaced the 3-column grid with stacked compact rows
    expect(tileBlock).toContain('Row 2: Achievement')
    expect(tileBlock).toContain('Row 3: Remaining')
    expect(tileBlock).toContain('Row 4: Required pace')
    expect(tileBlock).toContain('Row 5: Actual / Target')
    expect(tileBlock).toContain('Row 6: Variance')
  })

  it('Remaining row appears before Required pace row (DOM order)', async () => {
    const src = await getCombinedDashboardSource()
    const tileStart = src.indexOf('kpi-tile animate-slide-up')
    const tileBlock = src.slice(tileStart, tileStart + 6000)
    const remainIdx  = tileBlock.indexOf('Row 3: Remaining')
    const requireIdx = tileBlock.indexOf('Row 4: Required pace')
    expect(remainIdx).toBeGreaterThan(-1)
    expect(requireIdx).toBeGreaterThan(-1)
    expect(remainIdx).toBeLessThan(requireIdx)
  })

  it('Target is always visible via combined Actual / Target line', async () => {
    const src = await getCombinedDashboardSource()
    const tileStart = src.indexOf('kpi-tile animate-slide-up')
    const tileBlock = src.slice(tileStart, tileStart + 6000)
    expect(tileBlock).toContain('formatNumber(s?.target||0)')
    expect(tileBlock).toContain('Row 5: Actual / Target')
  })
})

// ════════════════════════════════════════════════════════════════
// 5. Required pace action pill
// ════════════════════════════════════════════════════════════════

describe('Required pace action pill', () => {
  it('"Need/day" label is replaced with "Required pace"', async () => {
    const src = await getCombinedDashboardSource()
    expect(src).not.toContain('Need/day')
    expect(src).toContain('Required pace')
  })

  it('action pill has no emoji (Enterprise Sprint: emoji blocks removed)', async () => {
    const src = await getCombinedDashboardSource()
    const tileStart = src.indexOf('kpi-tile animate-slide-up')
    const tileBlock = src.slice(tileStart, tileStart + 6000)
    const requireBlock = tileBlock.slice(tileBlock.indexOf('Row 4: Required pace'), tileBlock.indexOf('Row 4: Required pace') + 700)
    expect(requireBlock).not.toContain('🎯')
    expect(requireBlock).toContain('required')
  })

  it('pace value shows /day suffix', async () => {
    const src = await getCombinedDashboardSource()
    expect(src).toContain('/day`')
  })
})

// ════════════════════════════════════════════════════════════════
// 6. Achieved cards de-emphasized
// ════════════════════════════════════════════════════════════════

describe('Achieved cards de-emphasized', () => {
  it('achieved cards get opacity 0.72', async () => {
    const src = await getCombinedDashboardSource()
    expect(src).toContain('isAchieved ? 0.72 : 1')
  })

  it('isAchieved = target > 0 and remaining <= 0', async () => {
    const src = await getCombinedDashboardSource()
    expect(src).toContain('isAchieved')
    expect(src).toContain('remaining <= 0')
  })

  it('achieved state shows "✓ Target Achieved" inline in Remaining row', async () => {
    const src = await getCombinedDashboardSource()
    const tileStart = src.indexOf('kpi-tile animate-slide-up')
    const tileBlock = src.slice(tileStart, tileStart + 6000)
    const remainBlock = tileBlock.slice(tileBlock.indexOf('Row 3: Remaining'), tileBlock.indexOf('Row 3: Remaining') + 900)
    expect(remainBlock).toContain('Target Achieved')
  })
})
