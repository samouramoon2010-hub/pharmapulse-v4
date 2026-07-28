import { describe, it, expect } from 'vitest'
import { detectEntityType } from './entityDetection'

describe('Universal AI Intake — entity auto-detection', () => {
  it('detects REGION from a clean region header row with full confidence', () => {
    const result = detectEntityType(['Region Code', 'Region Name', 'Status'])
    expect(result.best?.domain).toBe('REGION')
    expect(result.best?.confidence).toBe(100)
  })

  it('detects GROUP from Arabic headers', () => {
    const result = detectEntityType(['كود المجموعة', 'اسم المجموعة', 'كود المنطقة'])
    expect(result.best?.domain).toBe('GROUP')
  })

  it('detects BRANCH (Pharmacies) from a branch header row', () => {
    const result = detectEntityType(['Branch Code', 'Branch Name', 'City', 'Region'])
    expect(result.best?.domain).toBe('BRANCH')
  })

  it('detects PHARMACIST (Users) from an employee header row', () => {
    const result = detectEntityType(['Employee ID', 'Name', 'Email', 'Role'])
    expect(result.best?.domain).toBe('PHARMACIST')
  })

  it('returns a lower confidence when only some headers resolve', () => {
    const result = detectEntityType(['Region Code', 'Region Name', 'Some Random Unmapped Column'])
    expect(result.best?.domain).toBe('REGION')
    expect(result.best?.confidence).toBeLessThan(100)
    expect(result.best?.confidence).toBeGreaterThan(0)
  })

  it('returns best: null for a header row with zero recognizable columns (no guessing)', () => {
    const result = detectEntityType(['Foo', 'Bar', 'Baz'])
    expect(result.best).toBeNull()
    expect(result.candidates).toHaveLength(0)
  })

  it('returns best: null for an empty header row', () => {
    const result = detectEntityType([])
    expect(result.best).toBeNull()
  })

  it('candidates are sorted highest-confidence first', () => {
    // Headers that resolve for both REGION and GROUP (both have "status"/name-like
    // aliases) — GROUP has more of its required columns present here.
    const result = detectEntityType(['Group Code', 'Group Name', 'Region Code', 'Status'])
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(result.candidates[1]?.confidence ?? 0)
  })
})
