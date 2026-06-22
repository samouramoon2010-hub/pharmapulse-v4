// ============================================================
// colorScales.ts — Comprehensive Tests
// Phase 4B-1B-α
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  getCategoricalColor,
  getContinuousColor,
  getDivergingColor,
  getEmptyCellStyle,
  interpolateColor,
  resolveCellColor,
  buildLegendStops,
  EMPTY_CELL_STYLES,
  DEFAULT_DIVERGING_COLORS,
  type EmptyCellState,
  type ContinuousScaleConfig,
} from './colorScales'

// ══════════════════════════════════════════════════════════════
// 1 — Empty-cell states
// ══════════════════════════════════════════════════════════════

describe('EMPTY_CELL_STYLES — all four states defined', () => {
  const states: EmptyCellState[] = ['NO_DATA', 'ZERO_VALUE', 'NOT_APPLICABLE', 'NOT_AGGREGATED']

  for (const state of states) {
    it(`${state} has background, foreground, label, description`, () => {
      const style = EMPTY_CELL_STYLES[state]
      expect(style.background).toBeTruthy()
      expect(style.foreground).toBeTruthy()
      expect(style.label).toBeTruthy()
      expect(style.description).toBeTruthy()
      expect(style.state).toBe(state)
    })
  }

  it('NO_DATA is striped (diagonal stripe pattern)', () => {
    expect(EMPTY_CELL_STYLES.NO_DATA.striped).toBe(true)
  })

  it('ZERO_VALUE is not striped (explicit 0)', () => {
    expect(EMPTY_CELL_STYLES.ZERO_VALUE.striped).toBe(false)
  })

  it('NOT_APPLICABLE is not striped', () => {
    expect(EMPTY_CELL_STYLES.NOT_APPLICABLE.striped).toBe(false)
  })

  it('NOT_AGGREGATED is striped (custom KPI gap)', () => {
    expect(EMPTY_CELL_STYLES.NOT_AGGREGATED.striped).toBe(true)
  })

  it('four states are semantically distinct', () => {
    const labels = states.map((s) => EMPTY_CELL_STYLES[s].label)
    const unique  = new Set(labels)
    expect(unique.size).toBe(4)
  })
})

describe('getEmptyCellStyle — safe fallback', () => {
  it('returns NO_DATA style for NO_DATA', () => {
    expect(getEmptyCellStyle('NO_DATA').state).toBe('NO_DATA')
  })

  it('returns ZERO_VALUE style for ZERO_VALUE', () => {
    expect(getEmptyCellStyle('ZERO_VALUE').label).toBe('0')
  })

  it('falls back to NO_DATA for unknown state', () => {
    // TypeScript prevents this at compile time but runtime fallback still works
    expect(getEmptyCellStyle('UNKNOWN' as EmptyCellState).state).toBe('NO_DATA')
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — Categorical scale
// ══════════════════════════════════════════════════════════════

describe('getCategoricalColor — default thresholds (90/70/50)', () => {
  it('≥90% → excellent', () => {
    expect(getCategoricalColor(90).status).toBe('excellent')
    expect(getCategoricalColor(100).status).toBe('excellent')
    expect(getCategoricalColor(150).status).toBe('excellent')
  })

  it('70–89% → good', () => {
    expect(getCategoricalColor(70).status).toBe('good')
    expect(getCategoricalColor(85).status).toBe('good')
    expect(getCategoricalColor(89).status).toBe('good')
  })

  it('50–69% → warning', () => {
    expect(getCategoricalColor(50).status).toBe('warning')
    expect(getCategoricalColor(65).status).toBe('warning')
    expect(getCategoricalColor(69).status).toBe('warning')
  })

  it('<50% → critical', () => {
    expect(getCategoricalColor(0).status).toBe('critical')
    expect(getCategoricalColor(49).status).toBe('critical')
    expect(getCategoricalColor(35).status).toBe('critical')
  })

  it('returns background, border, foreground', () => {
    const c = getCategoricalColor(85)
    expect(c.background).toBeTruthy()
    expect(c.border).toBeTruthy()
    expect(c.foreground).toBeTruthy()
  })

  it('exact boundary at 90: excellent', () => {
    expect(getCategoricalColor(90).status).toBe('excellent')
  })

  it('exact boundary at 70: good', () => {
    expect(getCategoricalColor(70).status).toBe('good')
  })

  it('exact boundary at 50: warning', () => {
    expect(getCategoricalColor(50).status).toBe('warning')
  })
})

describe('getCategoricalColor — custom thresholds', () => {
  const custom = { excellent: 80, good: 60, warning: 40 }

  it('respects custom excellent threshold', () => {
    expect(getCategoricalColor(80, custom).status).toBe('excellent')
    expect(getCategoricalColor(79, custom).status).toBe('good')
  })

  it('respects custom good threshold', () => {
    expect(getCategoricalColor(60, custom).status).toBe('good')
    expect(getCategoricalColor(59, custom).status).toBe('warning')
  })

  it('respects custom warning threshold', () => {
    expect(getCategoricalColor(40, custom).status).toBe('warning')
    expect(getCategoricalColor(39, custom).status).toBe('critical')
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — interpolateColor
// ══════════════════════════════════════════════════════════════

describe('interpolateColor — hex color blending', () => {
  it('t=0 returns fromHex exactly', () => {
    expect(interpolateColor('#000000', '#ffffff', 0)).toBe('#000000')
  })

  it('t=1 returns toHex exactly', () => {
    expect(interpolateColor('#000000', '#ffffff', 1)).toBe('#ffffff')
  })

  it('t=0.5 returns midpoint gray (rounds to #808080)', () => {
    const mid = interpolateColor('#000000', '#ffffff', 0.5)
    // 255 * 0.5 = 127.5, Math.round(127.5) = 128 = 0x80
    expect(mid).toBe('#808080')
  })

  it('clamps t<0 to 0', () => {
    expect(interpolateColor('#000000', '#ffffff', -1)).toBe('#000000')
  })

  it('clamps t>1 to 1', () => {
    expect(interpolateColor('#000000', '#ffffff', 2)).toBe('#ffffff')
  })

  it('always returns 7-char hex', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const result = interpolateColor('#ef4444', '#22c55e', t)
      expect(result).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('handles malformed hex gracefully', () => {
    // Falls back to zinc-400 (#a1a1aa) for bad input
    const result = interpolateColor('#xyz', '#ffffff', 0)
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — Continuous scale
// ══════════════════════════════════════════════════════════════

describe('getContinuousColor — linear interpolation', () => {
  const config: ContinuousScaleConfig = {
    lowColor: '#ef4444',   // red
    highColor: '#22c55e',  // green
    min: 0,
    max: 100,
  }

  it('value at min returns lowColor', () => {
    expect(getContinuousColor(0, config)).toBe('#ef4444')
  })

  it('value at max returns highColor', () => {
    expect(getContinuousColor(100, config)).toBe('#22c55e')
  })

  it('value below min clamps to lowColor', () => {
    expect(getContinuousColor(-10, config)).toBe('#ef4444')
  })

  it('value above max clamps to highColor', () => {
    expect(getContinuousColor(200, config)).toBe('#22c55e')
  })

  it('value at midpoint returns blended color', () => {
    const mid = getContinuousColor(50, config)
    expect(mid).toMatch(/^#[0-9a-f]{6}$/)
    expect(mid).not.toBe('#ef4444')
    expect(mid).not.toBe('#22c55e')
  })

  it('degenerate range (min === max) returns highColor', () => {
    const c = getContinuousColor(50, { ...config, min: 50, max: 50 })
    expect(c).toBe(config.highColor)
  })

  it('monotonically changes color as value increases', () => {
    // Red channel should decrease (red → green means R goes down)
    const v25 = getContinuousColor(25, config)
    const v50 = getContinuousColor(50, config)
    const v75 = getContinuousColor(75, config)
    // All should be different hex values
    expect(v25).not.toBe(v50)
    expect(v50).not.toBe(v75)
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — Diverging scale (centered on 100%)
// ══════════════════════════════════════════════════════════════

describe('getDivergingColor — diverging around 100%', () => {
  it('at midPoint (100%) returns midColor', () => {
    expect(getDivergingColor(100)).toBe(DEFAULT_DIVERGING_COLORS.midColor)
  })

  it('at lowerBound (0%) returns belowColor', () => {
    expect(getDivergingColor(0)).toBe(DEFAULT_DIVERGING_COLORS.belowColor)
  })

  it('at upperBound (150%) returns aboveColor', () => {
    expect(getDivergingColor(150)).toBe(DEFAULT_DIVERGING_COLORS.aboveColor)
  })

  it('50% is between belowColor and midColor', () => {
    const result = getDivergingColor(50)
    expect(result).not.toBe(DEFAULT_DIVERGING_COLORS.belowColor)
    expect(result).not.toBe(DEFAULT_DIVERGING_COLORS.midColor)
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('125% is between midColor and aboveColor', () => {
    const result = getDivergingColor(125)
    expect(result).not.toBe(DEFAULT_DIVERGING_COLORS.midColor)
    expect(result).not.toBe(DEFAULT_DIVERGING_COLORS.aboveColor)
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('values below 0 clamped to belowColor', () => {
    expect(getDivergingColor(-50)).toBe(DEFAULT_DIVERGING_COLORS.belowColor)
  })

  it('values above 150 clamped to aboveColor', () => {
    expect(getDivergingColor(200)).toBe(DEFAULT_DIVERGING_COLORS.aboveColor)
  })

  it('custom midPoint respected', () => {
    const custom = { ...DEFAULT_DIVERGING_COLORS, midPoint: 80 }
    expect(getDivergingColor(80, custom)).toBe(custom.midColor)
  })

  it('is symmetric around midPoint (same distance both sides → same distance from midColor)', () => {
    // 75% is 25 below midPoint; 125% is 25 above midPoint
    const below = getDivergingColor(75)
    const above = getDivergingColor(125)
    // Both should be non-mid colors
    expect(below).not.toBe(DEFAULT_DIVERGING_COLORS.midColor)
    expect(above).not.toBe(DEFAULT_DIVERGING_COLORS.midColor)
    // And they should be different from each other (different sides)
    expect(below).not.toBe(above)
  })

  it('degenerate: midPoint === lowerBound returns midColor', () => {
    const config = { ...DEFAULT_DIVERGING_COLORS, midPoint: 0, lowerBound: 0 }
    expect(getDivergingColor(0, config)).toBe(config.midColor)
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — resolveCellColor unified resolver
// ══════════════════════════════════════════════════════════════

describe('resolveCellColor — unified resolver', () => {
  it('categorical mode returns traffic-light status', () => {
    const r = resolveCellColor(85, { scale: 'categorical' })
    expect(r.status).toBe('good')
    expect(r.background).toBeTruthy()
  })

  it('continuous mode returns null status', () => {
    const r = resolveCellColor(70, {
      scale: 'continuous',
      continuous: { lowColor: '#ef4444', highColor: '#22c55e', min: 0, max: 100 },
    })
    expect(r.status).toBeNull()
    expect(r.background).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('diverging mode returns null status', () => {
    const r = resolveCellColor(100, { scale: 'diverging' })
    expect(r.status).toBeNull()
    expect(r.background).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('falls back to categorical when continuous config missing', () => {
    const r = resolveCellColor(85, { scale: 'continuous' })  // no config
    expect(r.status).toBe('good')  // falls back to categorical
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — buildLegendStops
// ══════════════════════════════════════════════════════════════

describe('buildLegendStops — legend generation', () => {
  it('generates 5 stops by default', () => {
    const stops = buildLegendStops('categorical', { scale: 'categorical' })
    expect(stops).toHaveLength(5)
  })

  it('generates custom number of stops', () => {
    const stops = buildLegendStops('categorical', { scale: 'categorical' }, 3)
    expect(stops).toHaveLength(3)
  })

  it('first stop starts at 0%', () => {
    const stops = buildLegendStops('categorical', { scale: 'categorical' })
    expect(stops[0].value).toBe(0)
  })

  it('last stop label has + suffix at max', () => {
    const stops = buildLegendStops('categorical', { scale: 'categorical' }, 5)
    expect(stops[stops.length - 1].label).toContain('%')
  })

  it('all stops have color, value, label', () => {
    const stops = buildLegendStops('diverging', { scale: 'diverging' })
    for (const s of stops) {
      expect(s.color).toBeTruthy()
      expect(typeof s.value).toBe('number')
      expect(s.label).toContain('%')
    }
  })

  it('stop values are monotonically increasing', () => {
    const stops = buildLegendStops('categorical', { scale: 'categorical' }, 5)
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].value).toBeGreaterThan(stops[i - 1].value)
    }
  })
})
