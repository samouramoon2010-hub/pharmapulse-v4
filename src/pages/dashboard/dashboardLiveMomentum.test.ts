// ============================================================
// Dashboard — Live Momentum surfacing
//
// generateLiveAnalytics() was already called on DashboardPage (it
// powers Smart Alerts / KPI Health / Activity Feed), and its result
// already includes .momentum (BranchMomentum, from liveMomentumEngine)
// — but nothing on the page ever read that field. This suite guards
// that the existing liveAnalytics result is reused (no second engine
// call, no new data fetch) to render it.
//
// Source-level (raw import) — no DOM rendering, matching this file's
// existing test convention (DashboardPage.phase2g1.test.ts etc.).
// ============================================================
import { describe, it, expect } from 'vitest'

async function src(): Promise<string> {
  return (await import('./DashboardPage.jsx?raw')).default.replace(/\r\n/g, '\n')
}

describe('Dashboard — Live Momentum panel', () => {
  it('reads momentum from the existing liveAnalytics result, not a new engine call', async () => {
    const s = await src()
    expect(s).toContain('liveAnalytics?.momentum')
    expect(s).toContain('liveAnalytics.momentum.kpiMomentum')
    expect(s).toContain('liveAnalytics.momentum.overallDirection')
    // Exactly one generateLiveAnalytics(...) call site — this feature
    // must not introduce a second, duplicate live-analytics computation.
    const calls = s.match(/generateLiveAnalytics\(input/g) ?? []
    expect(calls).toHaveLength(1)
  })

  it('defines a local LIVE_MOMENTUM_LABELS map matching liveMomentumEngine.MomentumDirection', async () => {
    const s = await src()
    expect(s).toContain('const LIVE_MOMENTUM_LABELS')
    for (const key of ['surging', 'improving', 'stable', 'cooling', 'stalling']) {
      expect(s).toContain(`${key}:`)
    }
  })

  it('renders the momentum panel conditionally, never showing an empty shell', async () => {
    const s = await src()
    expect(s).toContain('liveAnalytics?.momentum && liveAnalytics.momentum.kpiMomentum.length > 0')
  })
})
