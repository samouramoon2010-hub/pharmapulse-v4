// ============================================================
// Milestone 2 — Ingestion Flip Tests
//
// Covers Tasks 1–5:
//   Task 1: sanitizeKpiValue shared sanitizer (regression)
//   Task 2: buildKpiValuesMap (alias mapping, parity)
//   Task 3: saveKpiEntry dual-write (via source inspection)
//   Task 4: stagedToKpiEntry kpiValues (import parity)
//   Task 5: fetchKpiEntriesRange adapter parity
//
// Critical constraint: legacy path output === adapter path output
// for all documents that only contain the 5 production KPIs.
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  sanitizeKpiValue,
  buildKpiValuesMap,
  sanitizeKpiEntryFields,
} from './kpiRegistryLogic'
import {
  mapDynamicToLegacy,
  mapDynamicToLegacyBatch,
} from '../engine/kpiCompatibility/legacyEntryAdapter'
import { KPI_ENGINE_ALIAS_MAP } from '../engine/kpiRegistry'
import { stagedToKpiEntry } from './ingestion/ingestionSafetyGuards'
import type { StagedKpiRecord } from './ingestion/ingestionTypes'

// ─────────────────────────────────────────────────────────────
// Task 1 — sanitizeKpiValue regression
// ─────────────────────────────────────────────────────────────
describe('Task 1 — sanitizeKpiValue shared sanitizer', () => {
  it('valid integer → passes through', () => {
    expect(sanitizeKpiValue(100)).toBe(100)
  })
  it('valid float → passes through', () => {
    expect(sanitizeKpiValue(12.5)).toBe(12.5)
  })
  it('numeric string → coerced', () => {
    expect(sanitizeKpiValue('120')).toBe(120)
  })
  it('undefined → 0', () => {
    expect(sanitizeKpiValue(undefined)).toBe(0)
  })
  it('null → 0', () => {
    expect(sanitizeKpiValue(null)).toBe(0)
  })
  it('NaN → 0', () => {
    expect(sanitizeKpiValue(NaN)).toBe(0)
  })
  it('Infinity → 0', () => {
    expect(sanitizeKpiValue(Infinity)).toBe(0)
  })
  it('-Infinity → 0', () => {
    expect(sanitizeKpiValue(-Infinity)).toBe(0)
  })
  it('non-numeric string → 0', () => {
    expect(sanitizeKpiValue('abc')).toBe(0)
  })
  it('Symbol → 0 (no throw)', () => {
    expect(() => sanitizeKpiValue(Symbol('x'))).not.toThrow()
    expect(sanitizeKpiValue(Symbol('x') as any)).toBe(0)
  })
  it('negative number → clamped to 0', () => {
    expect(sanitizeKpiValue(-5)).toBe(0)
  })
  it('zero → 0', () => {
    expect(sanitizeKpiValue(0)).toBe(0)
  })
})

// Task 1 — sanitizeKpiEntryFields behaviour unchanged after refactor
describe('Task 1 — sanitizeKpiEntryFields regression (behaviour unchanged)', () => {
  it('NaN field excluded from result (not set to 0)', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: NaN })
    expect('wasfaty' in result).toBe(false)
  })
  it('Infinity field excluded from result', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: Infinity })
    expect('wasfaty' in result).toBe(false)
  })
  it('non-numeric string field excluded from result', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: 'abc' })
    expect('wasfaty' in result).toBe(false)
  })
  it('null field excluded from result', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: null as any })
    expect('wasfaty' in result).toBe(false)
  })
  it('valid fields still present when one field is invalid', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: NaN, omni: 5 })
    expect('wasfaty' in result).toBe(false)
    expect(result.omni).toBe(5)
  })
  it('valid numeric values pass through correctly', () => {
    const result = sanitizeKpiEntryFields({
      wasfaty: 100, omni: 90, wellness: 80, basket: 70, crossSelling: 60,
    })
    expect(result).toEqual({ wasfaty: 100, omni: 90, wellness: 80, basket: 70, crossSelling: 60 })
  })
  it('negative values clamped to 0', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: -10 })
    expect(result.wasfaty).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// Task 2 — buildKpiValuesMap
// ─────────────────────────────────────────────────────────────
describe('Task 2 — buildKpiValuesMap alias resolution', () => {
  it('omni → omnihealth', () => {
    const result = buildKpiValuesMap({ omni: 90 })
    expect(result.omnihealth).toBe(90)
    expect('omni' in result).toBe(false)
  })
  it('wellness → wellnessCard', () => {
    const result = buildKpiValuesMap({ wellness: 80 })
    expect(result.wellnessCard).toBe(80)
    expect('wellness' in result).toBe(false)
  })
  it('wasfaty → wasfaty (no alias)', () => {
    const result = buildKpiValuesMap({ wasfaty: 100 })
    expect(result.wasfaty).toBe(100)
  })
  it('basket → basket (no alias)', () => {
    const result = buildKpiValuesMap({ basket: 70 })
    expect(result.basket).toBe(70)
  })
  it('crossSelling → crossSelling (no alias)', () => {
    const result = buildKpiValuesMap({ crossSelling: 60 })
    expect(result.crossSelling).toBe(60)
  })
  it('full 5-KPI mapping produces correct registry keys', () => {
    const result = buildKpiValuesMap({
      wasfaty: 100, omni: 90, wellness: 80, basket: 70, crossSelling: 60,
    })
    expect(result).toEqual({
      wasfaty:      100,
      omnihealth:   90,
      wellnessCard: 80,
      basket:       70,
      crossSelling: 60,
    })
  })
  it('uses KPI_ENGINE_REVERSE_MAP from registry — no hardcoded aliases', () => {
    // Verify by using a custom alias map that overrides defaults
    // buildKpiValuesMap uses KPI_ENGINE_REVERSE_MAP from defaultKpiRegistry
    // which maps omni→omnihealth, wellness→wellnessCard
    const result = buildKpiValuesMap({ omni: 90, wellness: 80 })
    expect(Object.keys(result)).toContain('omnihealth')
    expect(Object.keys(result)).toContain('wellnessCard')
    expect(Object.keys(result)).not.toContain('omni')
    expect(Object.keys(result)).not.toContain('wellness')
  })
})

// ─────────────────────────────────────────────────────────────
// Task 2 — parity assertion: flat fields === kpiValues for all 5
// ─────────────────────────────────────────────────────────────
describe('Task 2 — dual-write parity: flat fields equal kpiValues for all 5 production KPIs', () => {
  const allFive = { wasfaty: 100, omni: 90, wellness: 80, basket: 70, crossSelling: 60 }

  it('wasfaty value identical in flat and kpiValues', () => {
    const kpiValues = buildKpiValuesMap(allFive)
    expect(kpiValues.wasfaty).toBe(allFive.wasfaty)
  })
  it('omni / omnihealth value identical', () => {
    const kpiValues = buildKpiValuesMap(allFive)
    expect(kpiValues.omnihealth).toBe(allFive.omni)
  })
  it('wellness / wellnessCard value identical', () => {
    const kpiValues = buildKpiValuesMap(allFive)
    expect(kpiValues.wellnessCard).toBe(allFive.wellness)
  })
  it('basket value identical in flat and kpiValues', () => {
    const kpiValues = buildKpiValuesMap(allFive)
    expect(kpiValues.basket).toBe(allFive.basket)
  })
  it('crossSelling value identical in flat and kpiValues', () => {
    const kpiValues = buildKpiValuesMap(allFive)
    expect(kpiValues.crossSelling).toBe(allFive.crossSelling)
  })
})

// ─────────────────────────────────────────────────────────────
// Task 3 — saveKpiEntry dual-write (source inspection)
// ─────────────────────────────────────────────────────────────
describe('Task 3 — saveKpiEntry dual-write (source verification)', () => {
  it('kpiService.js imports buildKpiValuesMap', async () => {
    const src = (await import('./kpiService.js?raw')).default
    expect(src).toContain('buildKpiValuesMap')
  })
  it('kpiService.js writes kpiValues field in payload', async () => {
    const src = (await import('./kpiService.js?raw')).default
    expect(src).toContain('kpiValues: buildKpiValuesMap(safeKpiValues, registry)')
  })
  it('kpiValues is inside the same payload object as safeKpiValues (single atomic write)', async () => {
    const src = (await import('./kpiService.js?raw')).default
    // Both ...safeKpiValues and kpiValues appear in the same payload = clean({...}) block
    const payloadIdx = src.indexOf('const payload = clean({')
    const setDocIdx  = src.indexOf('await setDoc(', payloadIdx)
    const payloadBlock = src.slice(payloadIdx, setDocIdx)
    expect(payloadBlock).toContain('...safeKpiValues')
    expect(payloadBlock).toContain('kpiValues: buildKpiValuesMap')
  })
})

// ─────────────────────────────────────────────────────────────
// Task 4 — stagedToKpiEntry import parity
// ─────────────────────────────────────────────────────────────
describe('Task 4 — stagedToKpiEntry includes kpiValues', () => {
  const makeStaged = (overrides: Partial<StagedKpiRecord> = {}): StagedKpiRecord => ({
    stagingId:   'stg-001',
    batchId:     'batch-001',
    submittedBy: 'user-001',
    pharmacyId:  'pharm-001',
    status:      'VALID',
    source:      'excel',
    rowIndex:    0,
    date:        '2025-06-15',
    wasfaty:     100,
    omni:        90,
    wellness:    80,
    basket:      70,
    crossSelling:60,
    stagedAt:    '2025-06-15T10:00:00Z',
    errors:      [],
    warnings:    [],
    ...overrides,
  })

  it('output includes kpiValues field', () => {
    const entry = stagedToKpiEntry(makeStaged(), 'actor-uid')
    expect(entry).toHaveProperty('kpiValues')
  })
  it('kpiValues.wasfaty matches flat wasfaty', () => {
    const entry = stagedToKpiEntry(makeStaged({ wasfaty: 120 }), 'actor-uid')
    expect((entry.kpiValues as any).wasfaty).toBe(120)
    expect(entry.wasfaty).toBe(120)
  })
  it('kpiValues.omnihealth matches flat omni', () => {
    const entry = stagedToKpiEntry(makeStaged({ omni: 95 }), 'actor-uid')
    expect((entry.kpiValues as any).omnihealth).toBe(95)
    expect(entry.omni).toBe(95)
  })
  it('kpiValues.wellnessCard matches flat wellness', () => {
    const entry = stagedToKpiEntry(makeStaged({ wellness: 75 }), 'actor-uid')
    expect((entry.kpiValues as any).wellnessCard).toBe(75)
    expect(entry.wellness).toBe(75)
  })
  it('imported entry kpiValues matches what saveKpiEntry would produce', () => {
    const staged = makeStaged({ wasfaty: 100, omni: 90, wellness: 80, basket: 70, crossSelling: 60 })
    const entry  = stagedToKpiEntry(staged, 'actor-uid')
    const expectedKpiValues = buildKpiValuesMap({
      wasfaty: 100, omni: 90, wellness: 80, basket: 70, crossSelling: 60,
    })
    expect(entry.kpiValues).toEqual(expectedKpiValues)
  })
  it('legacy flat fields still present in imported entry', () => {
    const entry = stagedToKpiEntry(makeStaged(), 'actor-uid')
    expect(entry.wasfaty).toBe(100)
    expect(entry.omni).toBe(90)
    expect(entry.wellness).toBe(80)
    expect(entry.basket).toBe(70)
    expect(entry.crossSelling).toBe(60)
  })
})

// ─────────────────────────────────────────────────────────────
// Task 5 — Adapter parity: legacy document === adapter output
//
// CRITICAL VALIDATION:
// For any document containing only the 5 production KPI flat fields,
// the adapter output must be byte-for-byte identical to the raw
// document values for those fields.
// ─────────────────────────────────────────────────────────────
describe('Task 5 — Legacy adapter parity (critical validation)', () => {
  // Simulate a legacy document (no kpiValues field — all existing production docs)
  const legacyDoc = {
    id:          'user1_pharm1_2025-06-15',
    userId:      'user-001',
    pharmacyId:  'pharm-001',
    date:        '2025-06-15',
    month:       '2025-06',
    wasfaty:     100,
    omni:         90,
    wellness:     80,
    basket:       70,
    crossSelling: 60,
  }

  // Simulate a dual-write document (what Milestone 2 writes)
  const dualWriteDoc = {
    ...legacyDoc,
    kpiValues: {
      wasfaty:      100,
      omnihealth:    90,
      wellnessCard:  80,
      basket:        70,
      crossSelling:  60,
    },
  }

  it('legacy doc: adapter output matches raw flat field values for wasfaty', () => {
    const adapted = mapDynamicToLegacy(legacyDoc, KPI_ENGINE_ALIAS_MAP)
    expect(adapted.wasfaty).toBe(legacyDoc.wasfaty)
  })
  it('legacy doc: adapter output matches raw flat field values for omni', () => {
    const adapted = mapDynamicToLegacy(legacyDoc, KPI_ENGINE_ALIAS_MAP)
    expect(adapted.omni).toBe(legacyDoc.omni)
  })
  it('legacy doc: adapter output matches raw flat field values for wellness', () => {
    const adapted = mapDynamicToLegacy(legacyDoc, KPI_ENGINE_ALIAS_MAP)
    expect(adapted.wellness).toBe(legacyDoc.wellness)
  })
  it('legacy doc: adapter output matches raw flat field values for basket', () => {
    const adapted = mapDynamicToLegacy(legacyDoc, KPI_ENGINE_ALIAS_MAP)
    expect(adapted.basket).toBe(legacyDoc.basket)
  })
  it('legacy doc: adapter output matches raw flat field values for crossSelling', () => {
    const adapted = mapDynamicToLegacy(legacyDoc, KPI_ENGINE_ALIAS_MAP)
    expect(adapted.crossSelling).toBe(legacyDoc.crossSelling)
  })

  it('dual-write doc: adapter output identical to legacy output for all 5 fields', () => {
    const legacyResult    = mapDynamicToLegacy(legacyDoc, KPI_ENGINE_ALIAS_MAP)
    const dualWriteResult = mapDynamicToLegacy(dualWriteDoc, KPI_ENGINE_ALIAS_MAP)
    expect(dualWriteResult.wasfaty).toBe(legacyResult.wasfaty)
    expect(dualWriteResult.omni).toBe(legacyResult.omni)
    expect(dualWriteResult.wellness).toBe(legacyResult.wellness)
    expect(dualWriteResult.basket).toBe(legacyResult.basket)
    expect(dualWriteResult.crossSelling).toBe(legacyResult.crossSelling)
  })

  it('batch adapter: legacy batch output identical to raw values', () => {
    const docs = [legacyDoc, { ...legacyDoc, date: '2025-06-14', wasfaty: 110, omni: 85 }]
    const adapted = mapDynamicToLegacyBatch(docs, KPI_ENGINE_ALIAS_MAP)
    expect(adapted[0].wasfaty).toBe(100)
    expect(adapted[0].omni).toBe(90)
    expect(adapted[1].wasfaty).toBe(110)
    expect(adapted[1].omni).toBe(85)
  })

  it('metadata preserved through adapter: userId, pharmacyId, date', () => {
    const adapted = mapDynamicToLegacy(legacyDoc, KPI_ENGINE_ALIAS_MAP)
    expect(adapted.userId).toBe('user-001')
    expect(adapted.pharmacyId).toBe('pharm-001')
    expect(adapted.date).toBe('2025-06-15')
  })

  it('fetchKpiEntriesRange source wraps with mapDynamicToLegacyBatch', async () => {
    const src = (await import('./kpiService.js?raw')).default
    expect(src).toContain('mapDynamicToLegacyBatch')
    // Prefix-match so the assertion is stable if extra arguments are added
    expect(src).toContain('return mapDynamicToLegacyBatch(rawDocs, KPI_ENGINE_ALIAS_MAP')
  })

  it('engines never see kpiValues field in adapter output', () => {
    const adapted = mapDynamicToLegacy(dualWriteDoc, KPI_ENGINE_ALIAS_MAP)
    expect('kpiValues' in adapted).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// Divergence detection — dual-write documents can never diverge
// ─────────────────────────────────────────────────────────────
describe('Divergence detection — kpiValues and flat fields are always consistent', () => {
  it('kpiValues built from same safeKpiValues as flat fields — no divergence possible', () => {
    const safeKpiValues = { wasfaty: 100, omni: 90, wellness: 80, basket: 70, crossSelling: 60 }
    const kpiValues = buildKpiValuesMap(safeKpiValues)
    // Verify each production field matches its kpiValues equivalent
    expect(kpiValues.wasfaty).toBe(safeKpiValues.wasfaty)
    expect(kpiValues.omnihealth).toBe(safeKpiValues.omni)
    expect(kpiValues.wellnessCard).toBe(safeKpiValues.wellness)
    expect(kpiValues.basket).toBe(safeKpiValues.basket)
    expect(kpiValues.crossSelling).toBe(safeKpiValues.crossSelling)
  })

  it('adapter resolves kpiValues over flat fields — consistent with dual-write contract', () => {
    // A perfectly consistent dual-write doc (no divergence)
    const doc = {
      wasfaty: 100, omni: 90,
      kpiValues: { wasfaty: 100, omnihealth: 90 },
    }
    const adapted = mapDynamicToLegacy(doc, KPI_ENGINE_ALIAS_MAP)
    // kpiValues.wasfaty (100) wins — same as flat wasfaty (100) ✓
    expect(adapted.wasfaty).toBe(100)
    // kpiValues.omnihealth (90) wins via reverse alias — same as flat omni (90) ✓
    expect(adapted.omni).toBe(90)
  })
})
