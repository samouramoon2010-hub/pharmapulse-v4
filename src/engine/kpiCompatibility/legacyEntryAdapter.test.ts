// ============================================================
// Legacy Entry Adapter — Test Suite
// Target: 100% branch coverage on mapDynamicToLegacy
//
// Tests cover all 14 required scenarios plus edge cases:
//  1.  Legacy-only document mapped unchanged
//  2.  Dynamic kpiValues mapped to legacy output
//  3.  omnihealth → omni alias resolution
//  4.  wellnessCard → wellness alias resolution
//  5.  Falls back to legacy field when kpiValues missing
//  6.  Falls back to 0 when both kpiValues and legacy field missing
//  7.  Pilot/unknown KPI keys ignored in output
//  8.  Metadata fields pass through (userId, pharmacyId, date, month)
//  9.  Extended legacy fields pass through (ndf, sl, sales)
// 10.  Invalid values sanitized (undefined, null, NaN, non-numeric)
// 11.  Batch adapter maps all documents
// 12.  Adapter never throws on malformed input
// 13.  All 5 production fields always present
// 14.  Precedence: kpiValues wins over legacy flat field
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  mapDynamicToLegacy,
  mapDynamicToLegacyBatch,
  type DynamicEntryDoc,
  type LegacyFlatEntry,
} from './legacyEntryAdapter'
import type { KpiAliasMap } from '../kpiRegistry/kpiRegistryTypes'

// ── Test alias map — matches production registry ──────────────
const ALIAS_MAP: KpiAliasMap = {
  omnihealth:   'omni',
  wellnessCard: 'wellness',
}

// ── Helpers ───────────────────────────────────────────────────
function assertAllFiveFields(entry: LegacyFlatEntry) {
  expect(typeof entry.wasfaty).toBe('number')
  expect(typeof entry.omni).toBe('number')
  expect(typeof entry.wellness).toBe('number')
  expect(typeof entry.basket).toBe('number')
  expect(typeof entry.crossSelling).toBe('number')
  expect(isNaN(entry.wasfaty)).toBe(false)
  expect(isNaN(entry.omni)).toBe(false)
  expect(isNaN(entry.wellness)).toBe(false)
  expect(isNaN(entry.basket)).toBe(false)
  expect(isNaN(entry.crossSelling)).toBe(false)
}

// ─────────────────────────────────────────────────────────────
// 1. Legacy-only document mapped unchanged
// ─────────────────────────────────────────────────────────────
describe('1 — Legacy-only document', () => {
  it('maps all five legacy flat fields to output unchanged', () => {
    const doc: DynamicEntryDoc = {
      userId: 'u1', pharmacyId: 'p1', date: '2025-06-15', month: '2025-06',
      wasfaty: 120, omni: 85, wellness: 60, basket: 450, crossSelling: 30,
    }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(120)
    expect(result.omni).toBe(85)
    expect(result.wellness).toBe(60)
    expect(result.basket).toBe(450)
    expect(result.crossSelling).toBe(30)
  })

  it('partial legacy doc fills missing fields with 0', () => {
    const doc: DynamicEntryDoc = { wasfaty: 100 }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(100)
    expect(result.omni).toBe(0)
    expect(result.wellness).toBe(0)
    expect(result.basket).toBe(0)
    expect(result.crossSelling).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// 2. Dynamic kpiValues mapped to legacy flat output
// ─────────────────────────────────────────────────────────────
describe('2 — Dynamic kpiValues mapping', () => {
  it('maps kpiValues with direct engine keys (no alias) + legacy flat for aliased keys', () => {
    // wasfaty, basket, crossSelling have no alias — direct match from kpiValues
    // omni, wellness have aliases (omnihealth, wellnessCard) — direct engine key in kpiValues
    // falls through to legacy flat field or 0
    const doc: DynamicEntryDoc = {
      kpiValues: { wasfaty: 100, basket: 300, crossSelling: 20 },
      omni: 80,       // legacy flat for aliased key
      wellness: 55,   // legacy flat for aliased key
    }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(100)    // kpiValues direct match
    expect(result.omni).toBe(80)        // legacy flat (omni has alias, kpiValues['omnihealth'] absent)
    expect(result.wellness).toBe(55)    // legacy flat (wellness has alias)
    expect(result.basket).toBe(300)     // kpiValues direct match
    expect(result.crossSelling).toBe(20) // kpiValues direct match
  })

  it('empty kpiValues produces all zeros', () => {
    const doc: DynamicEntryDoc = { kpiValues: {} }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(0)
    expect(result.omni).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. Alias resolution: omnihealth → omni
// ─────────────────────────────────────────────────────────────
describe('3 — Alias resolution: omnihealth → omni', () => {
  it('resolves kpiValues.omnihealth to output.omni', () => {
    const doc: DynamicEntryDoc = { kpiValues: { omnihealth: 90 } }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.omni).toBe(90)
  })

  it('registry business key omnihealth takes precedence over engine key omni in kpiValues', () => {
    const doc: DynamicEntryDoc = { kpiValues: { omnihealth: 90, omni: 50 } }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    // omnihealth is the registry key — it is resolved first via alias
    expect(result.omni).toBe(90)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. Alias resolution: wellnessCard → wellness
// ─────────────────────────────────────────────────────────────
describe('4 — Alias resolution: wellnessCard → wellness', () => {
  it('resolves kpiValues.wellnessCard to output.wellness', () => {
    const doc: DynamicEntryDoc = { kpiValues: { wellnessCard: 75 } }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wellness).toBe(75)
  })

  it('alias resolution works when alias map has multiple entries', () => {
    const doc: DynamicEntryDoc = {
      kpiValues: { omnihealth: 90, wellnessCard: 75 },
    }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.omni).toBe(90)
    expect(result.wellness).toBe(75)
  })
})

// ─────────────────────────────────────────────────────────────
// 5. Falls back to legacy flat field when kpiValues missing
// ─────────────────────────────────────────────────────────────
describe('5 — Fallback to legacy flat field', () => {
  it('uses legacy flat field when kpiValues is absent', () => {
    const doc: DynamicEntryDoc = { omni: 88, wellness: 44 }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.omni).toBe(88)
    expect(result.wellness).toBe(44)
  })

  it('uses legacy flat field when kpiValues does not contain that key', () => {
    const doc: DynamicEntryDoc = {
      kpiValues: { wasfaty: 100 },
      omni: 88,
    }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(100)  // from kpiValues
    expect(result.omni).toBe(88)      // from legacy flat (kpiValues had no omnihealth or omni)
  })
})

// ─────────────────────────────────────────────────────────────
// 6. Falls back to 0 when both are missing
// ─────────────────────────────────────────────────────────────
describe('6 — Fallback to 0', () => {
  it('produces 0 for engine keys absent from both kpiValues and legacy flat', () => {
    const doc: DynamicEntryDoc = { userId: 'u1' }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(0)
    expect(result.omni).toBe(0)
    expect(result.wellness).toBe(0)
    expect(result.basket).toBe(0)
    expect(result.crossSelling).toBe(0)
  })

  it('empty document produces all zeros for production fields', () => {
    const result = mapDynamicToLegacy({}, ALIAS_MAP)
    assertAllFiveFields(result)
    expect(result.wasfaty).toBe(0)
    expect(result.crossSelling).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// 7. Pilot/unknown KPI keys ignored in output
// ─────────────────────────────────────────────────────────────
describe('7 — Pilot/unknown KPI keys ignored', () => {
  it('does not include insurance KPI in output', () => {
    const doc: DynamicEntryDoc = {
      wasfaty: 100,
      kpiValues: { wasfaty: 100, insurance: 15, nps: 4.5 },
    }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect((result as any).insurance).toBeUndefined()
    expect((result as any).nps).toBeUndefined()
  })

  it('does not include any unknown key from kpiValues in output', () => {
    const doc: DynamicEntryDoc = {
      kpiValues: { pilotKpi: 999, futureKpi: 123 },
    }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(Object.keys(result)).not.toContain('pilotKpi')
    expect(Object.keys(result)).not.toContain('futureKpi')
    // Production fields still present with zero values
    expect(result.wasfaty).toBe(0)
  })

  it('output contains no more than the 5 production fields + metadata + extended', () => {
    const doc: DynamicEntryDoc = {
      userId: 'u1', pharmacyId: 'p1',
      kpiValues: { wasfaty: 100, insurance: 15 },
      ndf: 5,
    }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    const allowedKeys = new Set([
      'id','userId','pharmacyId','date','month',
      'wasfaty','omni','wellness','basket','crossSelling',
      'ndf','sl','sales',
    ])
    Object.keys(result).forEach(k => {
      // result[k] must not be undefined if present (metadata can be undefined if source was undefined)
      expect(allowedKeys.has(k)).toBe(true)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 8. Metadata fields pass through unchanged
// ─────────────────────────────────────────────────────────────
describe('8 — Metadata pass-through', () => {
  it('preserves userId, pharmacyId, date, month', () => {
    const doc: DynamicEntryDoc = {
      userId: 'user-abc', pharmacyId: 'pharm-xyz',
      date: '2025-06-15', month: '2025-06',
      wasfaty: 100,
    }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.userId).toBe('user-abc')
    expect(result.pharmacyId).toBe('pharm-xyz')
    expect(result.date).toBe('2025-06-15')
    expect(result.month).toBe('2025-06')
  })

  it('preserves undefined metadata fields as undefined', () => {
    const doc: DynamicEntryDoc = { wasfaty: 50 }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.userId).toBeUndefined()
    expect(result.pharmacyId).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 9. Extended legacy fields (ndf, sl, sales) pass through
// ─────────────────────────────────────────────────────────────
describe('9 — Extended legacy field pass-through', () => {
  it('passes through ndf when present', () => {
    const doc: DynamicEntryDoc = { ndf: 12 }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.ndf).toBe(12)
  })

  it('passes through sl when present', () => {
    const doc: DynamicEntryDoc = { sl: 98 }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.sl).toBe(98)
  })

  it('passes through sales when present', () => {
    const doc: DynamicEntryDoc = { sales: 45000 }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.sales).toBe(45000)
  })

  it('does not include ndf/sl/sales in output when absent from doc', () => {
    const doc: DynamicEntryDoc = { wasfaty: 100 }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.ndf).toBeUndefined()
    expect(result.sl).toBeUndefined()
    expect(result.sales).toBeUndefined()
  })

  it('sanitizes extended fields — NaN becomes 0', () => {
    const doc: DynamicEntryDoc = { ndf: NaN }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.ndf).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// 10. Invalid value sanitization
// ─────────────────────────────────────────────────────────────
describe('10 — Value sanitization', () => {
  it('sanitizes undefined → 0 in kpiValues', () => {
    const doc: DynamicEntryDoc = { kpiValues: { wasfaty: undefined as any } }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(0)
  })

  it('sanitizes null → 0 in legacy flat field', () => {
    const doc: DynamicEntryDoc = { wasfaty: null as any }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(0)
  })

  it('sanitizes NaN → 0', () => {
    const doc: DynamicEntryDoc = { wasfaty: NaN }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(0)
  })

  it('sanitizes non-numeric string → 0', () => {
    const doc: DynamicEntryDoc = { wasfaty: 'invalid' as any }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(0)
  })

  it('sanitizes Infinity → 0', () => {
    const doc: DynamicEntryDoc = { wasfaty: Infinity }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(0)
  })

  it('sanitizes -Infinity → 0', () => {
    const doc: DynamicEntryDoc = { omni: -Infinity }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.omni).toBe(0)
  })

  it('preserves negative numbers (system does not clamp)', () => {
    const doc: DynamicEntryDoc = { basket: -50 }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.basket).toBe(-50)
  })

  it('numeric string is coerced to number', () => {
    const doc: DynamicEntryDoc = { wasfaty: '120' as any }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(120)
  })
})

// ─────────────────────────────────────────────────────────────
// 11. Batch adapter
// ─────────────────────────────────────────────────────────────
describe('11 — Batch adapter', () => {
  it('maps all documents in batch', () => {
    const docs: DynamicEntryDoc[] = [
      { wasfaty: 100, omni: 80 },
      { kpiValues: { wasfaty: 90, omnihealth: 60 } },
      { wasfaty: 110 },
    ]
    const results = mapDynamicToLegacyBatch(docs, ALIAS_MAP)
    expect(results).toHaveLength(3)
    expect(results[0].wasfaty).toBe(100)
    expect(results[0].omni).toBe(80)
    expect(results[1].wasfaty).toBe(90)
    expect(results[1].omni).toBe(60)
    expect(results[2].wasfaty).toBe(110)
  })

  it('preserves doc order in batch output', () => {
    const docs: DynamicEntryDoc[] = [
      { wasfaty: 1 }, { wasfaty: 2 }, { wasfaty: 3 },
    ]
    const results = mapDynamicToLegacyBatch(docs, ALIAS_MAP)
    expect(results.map(r => r.wasfaty)).toEqual([1, 2, 3])
  })

  it('empty batch returns empty array', () => {
    expect(mapDynamicToLegacyBatch([], ALIAS_MAP)).toEqual([])
  })

  it('single-element batch works correctly', () => {
    const results = mapDynamicToLegacyBatch([{ wasfaty: 55 }], ALIAS_MAP)
    expect(results).toHaveLength(1)
    expect(results[0].wasfaty).toBe(55)
  })

  it('batch continues after one malformed document', () => {
    const docs: DynamicEntryDoc[] = [
      { wasfaty: 100 },
      null as any,     // malformed — should not abort the batch
      { wasfaty: 80 },
    ]
    expect(() => mapDynamicToLegacyBatch(docs, ALIAS_MAP)).not.toThrow()
    const results = mapDynamicToLegacyBatch(docs, ALIAS_MAP)
    expect(results).toHaveLength(3)
    expect(results[0].wasfaty).toBe(100)
    // null doc produces safe zero output
    assertAllFiveFields(results[1])
    expect(results[2].wasfaty).toBe(80)
  })
})

// ─────────────────────────────────────────────────────────────
// 12. Adapter never throws on malformed input
// ─────────────────────────────────────────────────────────────
describe('12 — Adapter never throws', () => {
  const malformedInputs = [
    null,
    undefined,
    0,
    'string',
    [],
    { kpiValues: null },
    { kpiValues: 'not an object' },
    { wasfaty: Symbol('test') as any },
    { kpiValues: { wasfaty: {} as any } },
  ]

  malformedInputs.forEach((input, i) => {
    it(`does not throw on malformed input #${i}`, () => {
      expect(() => mapDynamicToLegacy(input as any, ALIAS_MAP)).not.toThrow()
    })
  })

  it('returns safe output even for completely invalid input', () => {
    const result = mapDynamicToLegacy(null as any, ALIAS_MAP)
    assertAllFiveFields(result)
  })
})

// ─────────────────────────────────────────────────────────────
// 13. All 5 production fields always present
// ─────────────────────────────────────────────────────────────
describe('13 — Five production fields always present', () => {
  const testCases: DynamicEntryDoc[] = [
    {},
    { wasfaty: 100 },
    { kpiValues: { insurance: 15 } },
    { kpiValues: { wasfaty: 100, omnihealth: 90 } },
    null as any,
  ]

  testCases.forEach((doc, i) => {
    it(`all 5 fields present for test case ${i}`, () => {
      const result = mapDynamicToLegacy(doc, ALIAS_MAP)
      assertAllFiveFields(result)
      expect('wasfaty'      in result).toBe(true)
      expect('omni'         in result).toBe(true)
      expect('wellness'     in result).toBe(true)
      expect('basket'       in result).toBe(true)
      expect('crossSelling' in result).toBe(true)
    })
  })

  it('no production field is ever undefined', () => {
    const result = mapDynamicToLegacy({}, ALIAS_MAP)
    expect(result.wasfaty).not.toBeUndefined()
    expect(result.omni).not.toBeUndefined()
    expect(result.wellness).not.toBeUndefined()
    expect(result.basket).not.toBeUndefined()
    expect(result.crossSelling).not.toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 14. Precedence: kpiValues wins over legacy flat field
// ─────────────────────────────────────────────────────────────
describe('14 — kpiValues precedence over legacy flat field', () => {
  it('kpiValues.wasfaty wins over doc.wasfaty', () => {
    const doc: DynamicEntryDoc = {
      wasfaty: 50,           // legacy flat — should be overridden
      kpiValues: { wasfaty: 100 },  // kpiValues — should win
    }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(100)
  })

  it('kpiValues.omnihealth wins over doc.omni', () => {
    const doc: DynamicEntryDoc = {
      omni: 40,             // legacy flat
      kpiValues: { omnihealth: 90 },  // kpiValues via alias
    }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.omni).toBe(90)
  })

  it('kpiValues.wellnessCard wins over doc.wellness', () => {
    const doc: DynamicEntryDoc = {
      wellness: 30,
      kpiValues: { wellnessCard: 75 },
    }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wellness).toBe(75)
  })

  it('full precedence test: kpiValues, then flat, then 0', () => {
    const doc: DynamicEntryDoc = {
      // wasfaty: kpiValues wins
      kpiValues: { wasfaty: 100 },
      wasfaty: 50,
      // omni: legacy flat (no kpiValues.omnihealth)
      omni: 80,
      // wellness: kpiValues.wellnessCard wins over doc.wellness
      wellness: 30,
      // basket: fallback to 0 (neither present)
      // crossSelling: fallback to 0
    }
    // Add wellnessCard after construction to test alias
    doc.kpiValues!['wellnessCard'] = 75
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.wasfaty).toBe(100)      // kpiValues.wasfaty
    expect(result.omni).toBe(80)          // doc.omni (legacy flat)
    expect(result.wellness).toBe(75)      // kpiValues.wellnessCard
    expect(result.basket).toBe(0)         // fallback
    expect(result.crossSelling).toBe(0)   // fallback
  })

  it('empty kpiValues does NOT override populated legacy flat field', () => {
    const doc: DynamicEntryDoc = {
      omni: 80,
      kpiValues: {},  // empty — omnihealth not present
    }
    const result = mapDynamicToLegacy(doc, ALIAS_MAP)
    expect(result.omni).toBe(80)  // falls back to legacy flat
  })
})

// ─────────────────────────────────────────────────────────────
// 15. Adapter with empty alias map
// ─────────────────────────────────────────────────────────────
describe('15 — Empty alias map edge case', () => {
  it('works with empty alias map (all keys map to themselves)', () => {
    const doc: DynamicEntryDoc = {
      kpiValues: { wasfaty: 100, omni: 80, wellness: 60 },
    }
    const result = mapDynamicToLegacy(doc, {})
    // Without alias map, kpiValues keys match engine keys directly
    expect(result.wasfaty).toBe(100)
    expect(result.omni).toBe(80)
    expect(result.wellness).toBe(60)
  })
})
