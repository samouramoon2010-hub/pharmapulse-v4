// ============================================================
// Export Studio — Styling regression tests
//
// Guards the percentage display fix: engine percentages are on a
// 0-100 scale, so the Excel format must NOT use the built-in '%'
// token (which multiplies by 100 on display).
// ============================================================
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { PERCENTAGE_FORMAT, NUMBER_FORMAT, formatForUnit } from './exportStyling'

describe('exportStyling — percentage format uses literal % (0-100 scale values)', () => {
  it('formatForUnit(percentage) returns the literal-percent format', () => {
    expect(formatForUnit('percentage')).toBe(PERCENTAGE_FORMAT)
    expect(PERCENTAGE_FORMAT).toBe('0.0"%"')
  })

  it('renders 87.5 as "87.5%" — never "8750.0%"', () => {
    const rendered = XLSX.SSF.format(PERCENTAGE_FORMAT, 87.5)
    expect(rendered).toBe('87.5%')
  })

  it('renders 100 as "100.0%" and 0 as "0.0%"', () => {
    expect(XLSX.SSF.format(PERCENTAGE_FORMAT, 100)).toBe('100.0%')
    expect(XLSX.SSF.format(PERCENTAGE_FORMAT, 0)).toBe('0.0%')
  })

  it('number format keeps thousands separators', () => {
    expect(XLSX.SSF.format(NUMBER_FORMAT, 12500)).toBe('12,500')
  })
})
