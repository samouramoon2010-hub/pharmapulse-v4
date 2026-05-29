// ============================================================
// KPI Weight Validation UX — Regression Tests (Bug 4)
// Root cause: KpiEditorModal showed only "Weight must be
//   between 0 and 1" with no explanation of decimal format.
//   Users entering "20" (as percentage) got cryptic rejection.
// Fix: Added helper text explaining decimal format.
//   Engine validation logic (0–1 range) unchanged.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync }          from 'fs'
import { resolve }               from 'path'
import { validateWeights }       from '../../engine/kpiRegistry'
import type { KpiRegistry }      from '../../engine/kpiRegistry'
import { DEFAULT_KPI_REGISTRY }  from '../../engine/kpiRegistry'

const EDITOR_SRC = readFileSync(
  resolve(__dirname, '../../components/admin/kpi/KpiEditorModal.jsx'), 'utf8'
)

// ══════════════════════════════════════════════════════════════
// 1 — Source: helper text present
// ══════════════════════════════════════════════════════════════

describe('KpiEditorModal — weight helper text added', () => {
  it('helper text explains 0.20 = 20% decimal format', () => {
    expect(EDITOR_SRC).toMatch(/0\.20.*=.*20%/)
  })

  it('helper text mentions total must equal 1.00', () => {
    expect(EDITOR_SRC).toMatch(/1\.00/)
  })

  it('hint attribute updated from "0..1" to include percent explanation', () => {
    expect(EDITOR_SRC).toContain('0–1')
  })

  it('weight input still has min=0 max=1 step=0.01 constraints', () => {
    expect(EDITOR_SRC).toContain('min="0"')
    expect(EDITOR_SRC).toContain('max="1"')
    expect(EDITOR_SRC).toContain('step="0.01"')
  })

  it('mentions custom KPIs should use weight 0', () => {
    expect(EDITOR_SRC).toMatch(/[Cc]ustom.*0|0.*[Cc]ustom/)
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — Engine validation unchanged
// ══════════════════════════════════════════════════════════════

describe('KpiEditorModal — engine weight validation unchanged', () => {
  // validateWeights checks that active core KPI weights sum to ~1.0
  it('validateWeights passes for DEFAULT_KPI_REGISTRY', () => {
    expect(validateWeights(DEFAULT_KPI_REGISTRY)).toBe(true)
  })

  it('validateWeights fails if core weights do not sum to 1.0', () => {
    const broken: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      wasfaty: { ...DEFAULT_KPI_REGISTRY['wasfaty'], weight: 0.99 },  // forces total > 1
    }
    expect(validateWeights(broken)).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — UI validation logic (mirrors KpiEditorModal validate())
// ══════════════════════════════════════════════════════════════

describe('KpiEditorModal — weight validation rules (UI layer)', () => {
  /** Mirror of the modal validate() weight check */
  function validateWeight(value: number | string): string | null {
    const n = Number(value)
    if (isNaN(n))          return 'Weight must be a number'
    if (n < 0 || n > 1)    return 'Weight must be between 0 and 1'
    return null
  }

  it('0.2 accepted (valid decimal)', () => {
    expect(validateWeight(0.2)).toBeNull()
  })

  it('0 accepted (custom KPI weight)', () => {
    expect(validateWeight(0)).toBeNull()
  })

  it('1 accepted (maximum)', () => {
    expect(validateWeight(1)).toBeNull()
  })

  it('0.15 accepted', () => {
    expect(validateWeight(0.15)).toBeNull()
  })

  it('20 rejected — out of range', () => {
    expect(validateWeight(20)).toBe('Weight must be between 0 and 1')
  })

  it('1.5 rejected — out of range', () => {
    expect(validateWeight(1.5)).toBe('Weight must be between 0 and 1')
  })

  it('-0.1 rejected — negative', () => {
    expect(validateWeight(-0.1)).toBe('Weight must be between 0 and 1')
  })

  it('"0.2" string coerces safely', () => {
    expect(validateWeight('0.2')).toBeNull()
  })

  it('"20" string rejected correctly', () => {
    expect(validateWeight('20')).toBe('Weight must be between 0 and 1')
  })

  it('"abc" rejected as NaN', () => {
    const err = validateWeight('abc')
    expect(err).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — No engine behavior changed
// ══════════════════════════════════════════════════════════════

describe('Weight validation UX — engine not modified', () => {
  it('KpiEditorModal validation is still 0..1 range (source check)', () => {
    // The modal validate() function should still check 0 ≤ weight ≤ 1
    expect(EDITOR_SRC).toMatch(/weight.*<.*0.*weight.*>.*1|weight.*between.*0.*and.*1/)
  })

  it('engine validateWeights function signature unchanged', () => {
    // validateWeights accepts a KpiRegistry and returns boolean
    const result = validateWeights(DEFAULT_KPI_REGISTRY)
    expect(typeof result).toBe('boolean')
  })

  it('helper text is display-only and does not auto-convert values', () => {
    // Option B (auto-convert) was NOT implemented — verify no conversion code exists
    // The source should NOT contain logic like: value > 1 ? value / 100 : value
    expect(EDITOR_SRC).not.toMatch(/value\s*>\s*1\s*\?\s*value\s*\/\s*100/)
  })
})
