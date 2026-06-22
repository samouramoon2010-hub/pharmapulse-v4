// ============================================================
// KPI Card — Segmented Progress Bar Tests
//
// 10 segments, filled = floor(achPct / 10), capped at 10.
// Color inherits badge?.color (status-driven).
// ============================================================

import { describe, it, expect } from 'vitest'
import { getCombinedDashboardSource } from './testHelpers'

const SEGS = 10
function filled(achPct: number) {
  return Math.min(Math.floor(Math.max(achPct, 0) / SEGS), SEGS)
}

describe('Segmented progress bar — fill logic', () => {
  it('39% → 3 filled segments',  () => expect(filled(39)).toBe(3))
  it('75% → 7 filled segments',  () => expect(filled(75)).toBe(7))
  it('100% → 10 filled segments', () => expect(filled(100)).toBe(10))
  it('144% (capped) → 10 segments', () => expect(filled(144)).toBe(10))
  it('0% → 0 filled segments',   () => expect(filled(0)).toBe(0))
  it('9% → 0 filled segments',   () => expect(filled(9)).toBe(0))
  it('10% → 1 filled segment',   () => expect(filled(10)).toBe(1))
  it('negative → 0 segments',    () => expect(filled(-5)).toBe(0))
})

describe('Segmented progress bar — source guards', () => {
  it('tile uses 10-segment bar not continuous bar', async () => {
    const src = await getCombinedDashboardSource()
    const tileStart = src.indexOf('kpi-tile animate-slide-up')
    const tileBlock = src.slice(tileStart, tileStart + 10000)
    expect(tileBlock).toContain('SEGS')
    expect(tileBlock).toContain('Segmented progress bar')
    // Old continuous bar must be gone from the tile
    expect(tileBlock).not.toContain("width:`${Math.min(achPct,100)}%`")
  })

  it('segment count is exactly 10', async () => {
    const src = await getCombinedDashboardSource()
    expect(src).toContain('const SEGS      = 10')
  })

  it('has ARIA progressbar role and labels', async () => {
    const src = await getCombinedDashboardSource()
    expect(src).toContain('role="progressbar"')
    expect(src).toContain('aria-valuenow={achPct}')
    expect(src).toContain('aria-valuemin={0}')
    expect(src).toContain('aria-valuemax={100}')
  })

  it('fill color uses badge color (status-driven)', async () => {
    const src = await getCombinedDashboardSource()
    const tileStart = src.indexOf('kpi-tile animate-slide-up')
    const segBlock  = src.slice(tileStart, tileStart + 10000)
    expect(segBlock).toContain('badge?.color ?? accentColor')
  })

  it('staggered transition delay per segment', async () => {
    const src = await getCombinedDashboardSource()
    expect(src).toContain('idx * 30}ms')
  })
})
