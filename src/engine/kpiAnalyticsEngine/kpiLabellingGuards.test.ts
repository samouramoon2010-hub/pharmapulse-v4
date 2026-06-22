// ============================================================
// Dashboard KPI Percentage Labelling — Source Guards
//
// Verifies that each of the three % sections on the dashboard
// carries a clear human-readable label distinguishing:
//   1. kpi-tile         → "Achievement" label (redesigned tile)
//   2. Run Rate Forecast → "Projected EOM"
//   3. Health strip      → "Live KPI Health"
//
// No calculation changes — labels only.
// Note: "Achievement so far" was renamed to "Achievement" during
// the KPI Card Redesign Sprint. Tests updated accordingly.
// ============================================================

import { describe, it, expect } from 'vitest'
import { getCombinedDashboardSource } from './testHelpers'

describe('KPI Percentage Labelling', () => {
  async function src() {
    return getCombinedDashboardSource()
  }

  it('1: kpi-tile contains achievement label (redesigned from "Achievement so far")', async () => {
    const s = await src()
    // Redesigned tile uses "Achievement" as the sub-label under the big %
    expect(s).toContain('Achievement')
    expect(s).toContain('achievementPct')
  })

  it('1b: kpi-tile achievement content is gated on s?.target > 0', async () => {
    const s = await src()
    const tileSection = s.slice(s.indexOf('kpi-tile animate-slide-up'), s.indexOf('kpi-tile animate-slide-up') + 3500)
    expect(tileSection).toContain('s?.target > 0')
    expect(tileSection).toContain('Achievement')
  })

  it('2: Run Rate Forecast shows "Projected EOM" label per row', async () => {
    const s = await src()
    expect(s).toContain('Projected EOM')
  })

  it('2b: "Projected EOM" label sits inside the forecast row block', async () => {
    const s = await src()
    const sectionStart = s.lastIndexOf('Run Rate Forecast')
    expect(sectionStart).toBeGreaterThan(-1)
    const forecastBlock = s.slice(sectionStart, sectionStart + 2500)
    expect(forecastBlock).toContain('Projected EOM')
  })

  it('3: Health strip label reads "Live KPI Health"', async () => {
    const s = await src()
    expect(s).toContain('Live KPI Health')
  })

  it('3b: Health strip prefix label is no longer the bare word "Health"', async () => {
    const s = await src()
    const healthSection = s.slice(
      s.indexOf('KpiHealthHeatmap'),
      s.indexOf('KpiHealthHeatmap') + 700
    )
    expect(healthSection).toContain('Live KPI Health')
    expect(s).not.toContain('>\n            Health\n          </span>')
  })

  it('4: Health pill tooltip explicitly says "current achievement" and "Live KPI Health"', async () => {
    const s = await src()
    expect(s).toContain('current achievement')
    expect(s).toContain('Live KPI Health')
    expect(s).not.toContain("h.achievementPct}% achievement · ${h.state}`}>")
  })

  it('Labels use subtle 8px font size', async () => {
    const s = await src()
    // Redesigned tile uses fontSize:'8px' for sub-labels
    const tileBlock = s.slice(s.indexOf('kpi-tile animate-slide-up'), s.indexOf('kpi-tile animate-slide-up') + 3500)
    expect(tileBlock).toContain("fontSize:'8px'")

    // Projected EOM in the run-rate section
    const sectionStart = s.lastIndexOf('Run Rate Forecast')
    const projBlock    = s.slice(sectionStart, sectionStart + 2500)
    const projIdx      = projBlock.indexOf('Projected EOM')
    expect(projIdx).toBeGreaterThan(-1)
    const projRegion   = projBlock.slice(Math.max(0, projIdx - 400), projIdx + 50)
    expect(projRegion.includes("fontSize:'8px'") || projRegion.includes("fontSize: '8px'")).toBe(true)
  })

  it('No calculation fields were changed', async () => {
    const s = await src()
    // achievementPct still used in kpi-tile (via achPct variable)
    expect(s).toContain('achievementPct')
    // forecastAchPct still rendered in Run Rate Forecast
    expect(s).toContain('fc?.forecastAchPct ?? 0}%')
    // h.achievementPct still rendered in health strip
    expect(s).toContain('h.achievementPct}%')
  })
})
