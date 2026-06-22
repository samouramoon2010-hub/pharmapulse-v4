// ============================================================
// Required Daily Pace — bug-fix regression tests
//
// Root cause: KpiCard.jsx computed
//   requiredDailyPace = (gap !== null && daysRemaining > 0) ? gap / daysRemaining : null
// and rendered it through formatKpiValue()'s `default` branch
// (hit whenever kpi.type isn't 'currency'/'percentage'/'boolean'/'number'),
// which just interpolated the raw, unrounded float with no formatting
// at all — producing impossible displayed values like
// "33333333333333/day" for Omni (gap=1146) and
// "4444444444444446/day" for InBody (gap=31).
//
// Fix: computeRequiredDailyPace() in kpiVisualHelpers.js is now the
// single guarded implementation (never divides by zero, never returns
// Infinity/NaN, always rounds to 1 decimal), and every display site
// (KpiCard, FocusKpiCommandCard, KpiTile) renders the result through
// formatNumber() with maximumFractionDigits: 1.
// ============================================================
import { describe, it, expect } from 'vitest'
import { computeRequiredDailyPace } from './kpiVisualHelpers'
import { formatNumber } from '../../utils/helpers'

describe('computeRequiredDailyPace — guardrails', () => {
  it('remainingDays = 0 → returns 0, not Infinity', () => {
    expect(computeRequiredDailyPace(1146, 0)).toBe(0)
    expect(computeRequiredDailyPace(31, 0)).toBe(0)
  })

  it('remainingDays negative → returns 0, never a negative/garbage pace', () => {
    expect(computeRequiredDailyPace(100, -5)).toBe(0)
  })

  it('remainingGap = 0 → returns 0 (target already met)', () => {
    expect(computeRequiredDailyPace(0, 10)).toBe(0)
  })

  it('remainingGap negative → returns 0 (already exceeded target)', () => {
    expect(computeRequiredDailyPace(-50, 10)).toBe(0)
  })

  it('normal integer values divide cleanly', () => {
    expect(computeRequiredDailyPace(1000, 10)).toBe(100)
    expect(computeRequiredDailyPace(108, 19)).toBeCloseTo(5.7, 1)
  })

  it('decimal/repeating values are rounded to exactly 1 decimal place', () => {
    // 1146 / 9 = 127.33333333333333 in raw float — must round to 127.3
    expect(computeRequiredDailyPace(1146, 9)).toBe(127.3)
    // 31 / 7 = 4.428571428571429 — must round to 4.4
    expect(computeRequiredDailyPace(31, 7)).toBe(4.4)
  })

  it('the exact reported bug inputs no longer produce long repeating-digit floats', () => {
    const omni = computeRequiredDailyPace(1146, 9)
    const inBody = computeRequiredDailyPace(31, 7)
    expect(String(omni).replace('.', '').length).toBeLessThanOrEqual(6)
    expect(String(inBody).replace('.', '').length).toBeLessThanOrEqual(6)
    expect(Number.isFinite(omni)).toBe(true)
    expect(Number.isFinite(inBody)).toBe(true)
  })

  it('remainingDays undefined → returns null (caller did not supply day data, row is omitted)', () => {
    expect(computeRequiredDailyPace(1146, undefined)).toBeNull()
  })

  it('remainingGap undefined → returns null (no gap to pace at all)', () => {
    expect(computeRequiredDailyPace(undefined, 10)).toBeNull()
  })

  it('remainingDays NaN → returns 0, never NaN', () => {
    expect(computeRequiredDailyPace(100, NaN)).toBe(0)
  })

  it('remainingGap NaN → returns 0, never NaN', () => {
    expect(computeRequiredDailyPace(NaN, 10)).toBe(0)
  })

  it('result is never Infinity for any finite, non-zero remainingDays', () => {
    const result = computeRequiredDailyPace(999999, 0.5)
    expect(Number.isFinite(result)).toBe(true)
  })

  it('result is never NaN for any input combination', () => {
    const cases: Array<[unknown, unknown]> = [
      [0, 0], [null, null], [undefined, undefined], [NaN, NaN],
      [100, NaN], [NaN, 10], [-1, -1], [Infinity, 10], [100, Infinity],
    ]
    for (const [gap, days] of cases) {
      const result = computeRequiredDailyPace(gap as number, days as number)
      if (result !== null) expect(Number.isNaN(result)).toBe(false)
    }
  })

  it('remainingGap = Infinity → returns 0, never Infinity', () => {
    expect(computeRequiredDailyPace(Infinity, 10)).toBe(0)
  })

  it('remainingDays = Infinity → returns 0 (gap/Infinity would be ~0, treated as no measurable daily pace)', () => {
    expect(computeRequiredDailyPace(100, Infinity)).toBe(0)
  })
})

describe('Required Daily Pace — display formatting via formatNumber()', () => {
  it('127.3 displays as "127.3", not a long float', () => {
    expect(formatNumber(127.3, { maximumFractionDigits: 1 })).toBe('127.3')
  })

  it('4.4 displays as "4.4", not a long float', () => {
    expect(formatNumber(4.4, { maximumFractionDigits: 1 })).toBe('4.4')
  })

  it('0 displays as plain "0", not "0.0"', () => {
    expect(formatNumber(0, { maximumFractionDigits: 1 })).toBe('0')
  })

  it('an unrounded repeating float is still capped at 1 decimal even if rounding was skipped upstream', () => {
    expect(formatNumber(127.33333333333333, { maximumFractionDigits: 1 })).toBe('127.3')
    expect(formatNumber(4.444444444444446, { maximumFractionDigits: 1 })).toBe('4.4')
  })

  it('formatNumber never renders Infinity or NaN as text', () => {
    expect(formatNumber(NaN, { maximumFractionDigits: 1 })).toBe('—')
  })
})
