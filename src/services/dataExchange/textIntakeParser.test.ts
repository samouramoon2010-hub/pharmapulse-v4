import { describe, it, expect } from 'vitest'
import { parsePastedText } from './textIntakeParser'

describe('Universal AI Intake — pasted-text parser', () => {
  it('parses a valid JSON array of objects', () => {
    const result = parsePastedText('[{"code":"RUH","name":"Riyadh"},{"code":"JED","name":"Jeddah"}]')
    expect(result.format).toBe('JSON')
    expect(result.rows).toHaveLength(2)
    expect(result.headerRow.sort()).toEqual(['code', 'name'])
    expect(result.rows[0]).toEqual({ code: 'RUH', name: 'Riyadh' })
  })

  it('parses tab-separated pasted-from-spreadsheet data', () => {
    const text = 'Region Code\tRegion Name\nRUH\tRiyadh\nJED\tJeddah'
    const result = parsePastedText(text)
    expect(result.format).toBe('TSV')
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ 'Region Code': 'RUH', 'Region Name': 'Riyadh' })
  })

  it('parses comma-separated pasted text', () => {
    const text = 'Region Code,Region Name\nRUH,Riyadh\nJED,Jeddah'
    const result = parsePastedText(text)
    expect(result.format).toBe('CSV')
    expect(result.rows).toHaveLength(2)
    expect(result.rows[1]).toEqual({ 'Region Code': 'JED', 'Region Name': 'Jeddah' })
  })

  it('parses line-based key:value blocks, one record per blank-line-separated block', () => {
    const text = 'Code: RUH\nName: Riyadh\n\nCode: JED\nName: Jeddah'
    const result = parsePastedText(text)
    expect(result.format).toBe('KEY_VALUE_BLOCKS')
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual({ Code: 'RUH', Name: 'Riyadh' })
    expect(result.rows[1]).toEqual({ Code: 'JED', Name: 'Jeddah' })
  })

  it('returns UNRECOGNIZED for empty input rather than guessing', () => {
    expect(parsePastedText('').format).toBe('UNRECOGNIZED')
    expect(parsePastedText('   ').format).toBe('UNRECOGNIZED')
  })

  it('returns UNRECOGNIZED for a single unstructured line (never fabricates rows)', () => {
    const result = parsePastedText('just some random sentence with no structure')
    expect(result.format).toBe('UNRECOGNIZED')
    expect(result.rows).toHaveLength(0)
  })

  it('returns UNRECOGNIZED for malformed JSON rather than silently falling back to a wrong split', () => {
    const result = parsePastedText('[{"code":"RUH"')
    // Falls through to line-based parsing; a truncated JSON fragment has no
    // ":" per line matching KEY_VALUE_BLOCKS either, so it must be UNRECOGNIZED.
    expect(result.format).toBe('UNRECOGNIZED')
  })
})
