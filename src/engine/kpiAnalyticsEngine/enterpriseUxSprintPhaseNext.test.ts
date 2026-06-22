// ============================================================
// Enterprise UX Sprint — Phase Next — Regression Tests
//
// P1: Enterprise 5-tier color system (Critical/Behind/OnPace/
//     Exceeding/Achieved-muted) replacing "Neon Green Fatigue"
// P2: Header duplication removed — single merged Executive header
// P3: Focus KPI Command Card (vertical stack layout)
// P4: Alert actions converted to small enterprise pill buttons,
//     emoji blocks removed
// P5: KPI tile density — stacked compact rows
// P6: Segmented progress bar preserved (10 segments, status colors)
// ============================================================

import { describe, it, expect } from 'vitest'

import { getCombinedDashboardSource } from './testHelpers'

// Phase 5A: KPI_STATUS_BADGE, kpiBadge, kpiVsExpected, enterpriseStatusColor,
// the Focus KPI Command Card, and the KPI tile grid were extracted from
// DashboardPage.jsx into shared components under src/components/kpi/ so
// BranchIntelligencePage can reuse them without forking. This helper scans
// the union of DashboardPage.jsx + the extracted files.
async function src() {
  return getCombinedDashboardSource()
}

// ════════════════════════════════════════════════════════════════
// P1 — Enterprise color system
// ════════════════════════════════════════════════════════════════

describe('P1 — Enterprise 5-tier color system', () => {
  it('KPI_STATUS_BADGE includes ACHIEVED (muted) tier distinct from EXCEEDING', async () => {
    const s = await src()
    expect(s).toContain("ACHIEVED:")
    expect(s).toContain("'Target Achieved'")
    expect(s).toContain("color: '#6b9c84'")  // muted grey-green
    expect(s).toContain("EXCEEDING:")
    expect(s).toContain("color: '#22c55e'")  // bright green reserved for exceeding-not-yet-achieved
  })

  it('kpiBadge returns ACHIEVED (not bright EXCEEDING) for KPIs >= 100%', async () => {
    const s = await src()
    // Phase 5A: kpiBadge extracted to kpiVisualHelpers.js, taking explicit
    // (stats, pace) params instead of closing over kpiStats[k]/paceMap[k].
    expect(s).toContain('if (stats.achievementPct >= 100) return KPI_STATUS_BADGE.ACHIEVED')
  })

  it('EXCEEDING is reserved for paceStatus EXCEEDING below 100%', async () => {
    const s = await src()
    expect(s).toContain("if (ps === 'EXCEEDING') return KPI_STATUS_BADGE.EXCEEDING")
  })

  it('enterpriseStatusColor helper exists for hero cards without per-KPI badges', async () => {
    const s = await src()
    expect(s).toContain('function enterpriseStatusColor(pct, expectedPct)')
    expect(s).toContain('if (pct >= 100) return KPI_STATUS_BADGE.ACHIEVED.color')
  })

  it('Branch Health card uses enterpriseStatusColor and fades when achieved', async () => {
    const s = await src()
    expect(s).toContain('const bhColor     = enterpriseStatusColor(overallAch, expectedPct)')
    expect(s).toContain('const isAchievedBH = overallAch >= 100')
    expect(s).toContain("opacity: isAchievedBH ? 0.78 : 1")
  })

  it('Forecast EOM card uses enterpriseStatusColor and fades when achieved', async () => {
    const s = await src()
    expect(s).toContain('const fcColor     = enterpriseStatusColor(fcVal, expectedPct)')
    expect(s).toContain('const isAchievedFC = fcVal >= 100')
    expect(s).toContain("opacity: isAchievedFC ? 0.78 : 1")
  })

  it('color tier math: 200% achievement → ACHIEVED muted, not bright green', () => {
    // Simulate kpiBadge logic
    function tierFor(achievementPct, paceStatus) {
      if (achievementPct >= 100) return 'ACHIEVED'
      if (paceStatus === 'EXCEEDING') return 'EXCEEDING'
      return paceStatus
    }
    expect(tierFor(200, 'EXCEEDING')).toBe('ACHIEVED')
    expect(tierFor(144, 'EXCEEDING')).toBe('ACHIEVED')
    expect(tierFor(178, 'ON_PACE')).toBe('ACHIEVED')
    // Below 100%, paceStatus EXCEEDING still shows bright green
    expect(tierFor(85, 'EXCEEDING')).toBe('EXCEEDING')
  })
})

// ════════════════════════════════════════════════════════════════
// P2 — Header duplication removed
// ════════════════════════════════════════════════════════════════

describe('P2 — Merged Executive header (no duplication)', () => {
  it('old duplicate "page-header" div with "Dashboard" title is removed', async () => {
    const s = await src()
    expect(s).not.toContain('<div className="page-header">')
    expect(s).not.toContain('<div className="page-title">Dashboard</div>')
  })

  it('Refresh button is preserved inside hero Row 1 (Customize removed in UI3.2 — superseded by Settings Center)', async () => {
    const s = await src()
    expect(s).toContain("setLoading(true); setTick((t) => t + 1)")
    expect(s).toContain('Refresh')
    // UI3.2-A: the dashboard-card customizer (StatCard row + Settings2
    // trigger) was removed as decluttering — Settings Center's
    // "Dashboard cards" section (built in the Theme T2 bundle) already
    // covers the same customization, so no functionality was lost.
    expect(s).not.toContain('setShowCustom(true)')
  })

  it('Customize button trigger and CardCustomizer modal no longer exist (UI3.2 declutter)', async () => {
    const s = await src()
    const matches = s.match(/setShowCustom\(true\)/g) ?? []
    expect(matches.length).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════
// P3 — Focus KPI Command Card
// ════════════════════════════════════════════════════════════════

describe('P3 — Focus KPI Command Card (vertical layout)', () => {
  it('card title is "Focus KPI" (shortened from "Focus KPI — Requires Attention")', async () => {
    const s = await src()
    expect(s).toContain('Focus KPI Command Card')
    // Phase 5A: extracted to FocusKpiCommandCard.jsx as a top-level component —
    // indentation is now 10 spaces (was 16 when nested inside DashboardPage's JSX).
    expect(s).toContain('>\n          Focus KPI\n')
  })

  it('vertical hierarchy: name → achievement → remaining → pace → variance', async () => {
    const s = await src()
    const idx = s.indexOf('Focus KPI Command Card')
    const block = s.slice(idx, idx + 4500)
    const nameIdx   = block.indexOf('1. KPI name')
    const achIdx    = block.indexOf('2. Achievement')
    const remIdx    = block.indexOf('3. Remaining')
    const paceIdx   = block.indexOf('4. Required pace')
    const varIdx    = block.indexOf('5. Variance')
    expect(nameIdx).toBeGreaterThan(-1)
    expect(achIdx).toBeGreaterThan(nameIdx)
    expect(remIdx).toBeGreaterThan(achIdx)
    expect(paceIdx).toBeGreaterThan(remIdx)
    expect(varIdx).toBeGreaterThan(paceIdx)
  })

  it('card has constrained width (sidebar-style, not full-width strip)', async () => {
    const s = await src()
    const idx = s.indexOf('Focus KPI Command Card')
    const block = s.slice(idx, idx + 2000)
    expect(block).toContain("maxWidth: '320px'")
  })
})

// ════════════════════════════════════════════════════════════════
// P4 — Actionable alerts (enterprise pill buttons, no emoji)
// ════════════════════════════════════════════════════════════════

describe('P4 — Actionable alert pills', () => {
  it('alert action renders as small pill button with text only', async () => {
    const s = await src()
    expect(s).toContain('onNavigate(alert.actionRoute)')
    expect(s).toContain('{alert.action}')
    // No arrow suffix on alert action text
    expect(s).not.toContain('{alert.action} →')
    // The alert pill itself doesn't use underline styling (scoped check)
    const idx = s.indexOf('onNavigate(alert.actionRoute)')
    const block = s.slice(idx, idx + 700)
    expect(block).not.toContain("textDecoration:'underline'")
  })

  it('alert pill uses small enterprise styling (compact, bordered, uppercase)', async () => {
    const s = await src()
    const idx = s.indexOf('onNavigate(alert.actionRoute)')
    const block = s.slice(idx, idx + 700)
    expect(block).toContain("fontSize: '10px'")
    expect(block).toContain("borderRadius: '5px'")
    expect(block).toContain("textTransform: 'uppercase'")
  })

  it('alert severity indicator uses a colored dot, not emoji blocks', async () => {
    const s = await src()
    const idx = s.indexOf('Top Alerts')
    const block = s.slice(idx, idx + 1200)
    expect(block).not.toContain('🔴')
    expect(block).not.toContain('🟡')
    expect(block).toContain("borderRadius: '50%'")  // dot indicator
  })
})

// ════════════════════════════════════════════════════════════════
// P5 — KPI tile density
// ════════════════════════════════════════════════════════════════

describe('P5 — KPI tile density (compact stacked rows)', () => {
  it('tile padding reduced from 10px to 8px', async () => {
    const s = await src()
    const tileStart = s.indexOf('kpi-tile animate-slide-up')
    const tileBlock = s.slice(tileStart, tileStart + 500)
    expect(tileBlock).toContain("padding:'8px 10px'")
  })

  it('achievement % reduced from 26px to 22px (compact primary value)', async () => {
    const s = await src()
    const tileStart = s.indexOf('kpi-tile animate-slide-up')
    const tileBlock = s.slice(tileStart, tileStart + 6000)
    expect(tileBlock).toContain("fontSize:'22px'")
  })

  it('all 7 rows present in correct order', async () => {
    const s = await src()
    const tileStart = s.indexOf('kpi-tile animate-slide-up')
    const tileBlock = s.slice(tileStart, tileStart + 6000)
    const rows = [
      'Row 1: KPI name + status badge',
      'Row 2: Achievement',
      'Row 3: Remaining',
      'Row 4: Required pace',
      'Row 5: Actual / Target',
      'Row 6: Variance',
      'Row 7: Segmented progress bar',
    ]
    let lastIdx = -1
    for (const row of rows) {
      const idx = tileBlock.indexOf(row)
      expect(idx).toBeGreaterThan(lastIdx)
      lastIdx = idx
    }
  })

  it('redundant separate "Achievement" sub-label removed (name+badge establish context)', async () => {
    const s = await src()
    const tileStart = s.indexOf('kpi-tile animate-slide-up')
    const tileBlock = s.slice(tileStart, tileStart + 1200)
    // The old standalone "Achievement" text label under the % is gone
    expect(tileBlock).not.toContain('>\n                      Achievement\n')
  })
})

// ════════════════════════════════════════════════════════════════
// P6 — Segmented progress bar preserved
// ════════════════════════════════════════════════════════════════

describe('P6 — Segmented progress bar preserved', () => {
  it('10-segment bar still present with status-driven color', async () => {
    const s = await src()
    const tileStart = s.indexOf('kpi-tile animate-slide-up')
    const tileBlock = s.slice(tileStart, tileStart + 8000)
    expect(tileBlock).toContain('const SEGS      = 10')
    expect(tileBlock).toContain('badge?.color ?? accentColor')
  })

  it('staggered animation and ARIA accessibility preserved', async () => {
    const s = await src()
    const tileStart = s.indexOf('kpi-tile animate-slide-up')
    const tileBlock = s.slice(tileStart, tileStart + 8000)
    expect(tileBlock).toContain('idx * 30}ms')
    expect(tileBlock).toContain('role="progressbar"')
    expect(tileBlock).toContain('aria-valuenow={achPct}')
  })
})
