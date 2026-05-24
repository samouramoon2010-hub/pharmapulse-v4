// ============================================================
// KPI Registry Adapter Tests
// Covers: key translation, record normalization, target
//         conversion, result mapping, safety, unknown keys,
//         and engine compatibility.
// ============================================================

import { describe, it, expect } from 'vitest'

import {
  toEngineKey,
  toRegistryKey,
  normalizeKpiRecord,
  denormalizeKpiRecord,
  getEngineCompatibleKpiKeys,
  getRegistryCompatibleKpiKeys,
  mapRegistryTargetsToEngineTargets,
  mapEngineTargetsToRegistryTargets,
  mapEngineResultsToRegistryResults,
  mapRegistryResultsToEngineResults,
  isKnownKpiKey,
  findKpiDefinition,
} from './kpiRegistryAdapter'

import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'

// ── Shared fixtures ───────────────────────────────────────────

const ENGINE_ENTRY = {
  wasfaty: 200, omni: 150, wellness: 120, basket: 95, crossSelling: 75,
}

const REGISTRY_ENTRY = {
  wasfaty: 200, omnihealth: 150, wellnessCard: 120, basket: 95, crossSelling: 75,
}

const ENGINE_TARGET = {
  pharmacyId:      'p1',
  month:           '2025-05',
  wasfatyTarget:   200,
  omniTarget:      160,
  wellnessTarget:  120,
  basketTarget:    100,
  crossSellTarget: 80,
}

const REGISTRY_TARGET = {
  pharmacyId:   'p1',
  month:        '2025-05',
  wasfaty:      200,
  omnihealth:   160,
  wellnessCard: 120,
  basket:       100,
  crossSelling: 80,
}

// ─────────────────────────────────────────────────────────────
// 1. KEY TRANSLATION — toEngineKey
// ─────────────────────────────────────────────────────────────

describe('toEngineKey — registry key → engine key', () => {
  it('omnihealth → omni', () => {
    expect(toEngineKey('omnihealth')).toBe('omni')
  })

  it('wellnessCard → wellness', () => {
    expect(toEngineKey('wellnessCard')).toBe('wellness')
  })

  it('wasfaty → wasfaty (no alias)', () => {
    expect(toEngineKey('wasfaty')).toBe('wasfaty')
  })

  it('basket → basket (no alias)', () => {
    expect(toEngineKey('basket')).toBe('basket')
  })

  it('crossSelling → crossSelling (no alias)', () => {
    expect(toEngineKey('crossSelling')).toBe('crossSelling')
  })

  it('engine keys pass through unchanged (omni → omni)', () => {
    expect(toEngineKey('omni')).toBe('omni')
  })

  it('unknown key passes through unchanged', () => {
    expect(toEngineKey('unknownKpi')).toBe('unknownKpi')
    expect(toEngineKey('')).toBe('')
  })

  it('non-core production keys pass through (no alias needed)', () => {
    ['sales', 'sl', 'ndf', 'inbody', 'liberation'].forEach((key) => {
      expect(toEngineKey(key)).toBe(key)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 2. KEY TRANSLATION — toRegistryKey
// ─────────────────────────────────────────────────────────────

describe('toRegistryKey — engine key → registry key', () => {
  it('omni → omnihealth', () => {
    expect(toRegistryKey('omni')).toBe('omnihealth')
  })

  it('wellness → wellnessCard', () => {
    expect(toRegistryKey('wellness')).toBe('wellnessCard')
  })

  it('wasfaty → wasfaty (no alias)', () => {
    expect(toRegistryKey('wasfaty')).toBe('wasfaty')
  })

  it('basket → basket (no alias)', () => {
    expect(toRegistryKey('basket')).toBe('basket')
  })

  it('crossSelling → crossSelling (no alias)', () => {
    expect(toRegistryKey('crossSelling')).toBe('crossSelling')
  })

  it('registry keys pass through unchanged (omnihealth → omnihealth)', () => {
    expect(toRegistryKey('omnihealth')).toBe('omnihealth')
  })

  it('unknown engine key passes through unchanged', () => {
    expect(toRegistryKey('unknownEngineKey')).toBe('unknownEngineKey')
  })

  it('toEngineKey and toRegistryKey are inverses for aliased keys', () => {
    expect(toRegistryKey(toEngineKey('omnihealth'))).toBe('omnihealth')
    expect(toRegistryKey(toEngineKey('wellnessCard'))).toBe('wellnessCard')
    expect(toEngineKey(toRegistryKey('omni'))).toBe('omni')
    expect(toEngineKey(toRegistryKey('wellness'))).toBe('wellness')
  })
})

// ─────────────────────────────────────────────────────────────
// 3. RECORD NORMALIZATION — normalizeKpiRecord
// ─────────────────────────────────────────────────────────────

describe('normalizeKpiRecord — registry keys → engine keys', () => {
  it('translates omnihealth to omni', () => {
    const result = normalizeKpiRecord({ omnihealth: 150 })
    expect(result).toHaveProperty('omni', 150)
    expect(result).not.toHaveProperty('omnihealth')
  })

  it('translates wellnessCard to wellness', () => {
    const result = normalizeKpiRecord({ wellnessCard: 80 })
    expect(result).toHaveProperty('wellness', 80)
    expect(result).not.toHaveProperty('wellnessCard')
  })

  it('normalizes full registry-keyed record correctly', () => {
    const result = normalizeKpiRecord(REGISTRY_ENTRY)
    expect(result).toEqual(ENGINE_ENTRY)
  })

  it('leaves already-engine-keyed record unchanged', () => {
    const result = normalizeKpiRecord(ENGINE_ENTRY)
    expect(result).toEqual(ENGINE_ENTRY)
  })

  it('passes through unknown keys unchanged', () => {
    const result = normalizeKpiRecord({ unknownKpi: 42, wasfaty: 100 })
    expect(result).toHaveProperty('unknownKpi', 42)
    expect(result).toHaveProperty('wasfaty', 100)
  })

  it('preserves zero values — does not silently drop falsy values', () => {
    const result = normalizeKpiRecord({ omnihealth: 0, wasfaty: 0 })
    expect(result.omni).toBe(0)
    expect(result.wasfaty).toBe(0)
  })

  it('preserves negative values (edge case)', () => {
    const result = normalizeKpiRecord({ basket: -5 })
    expect(result.basket).toBe(-5)
  })

  it('does not mutate the input record', () => {
    const input = { omnihealth: 150, wasfaty: 200 }
    const inputCopy = { ...input }
    normalizeKpiRecord(input)
    expect(input).toEqual(inputCopy)
  })
})

// ─────────────────────────────────────────────────────────────
// 4. RECORD DENORMALIZATION — denormalizeKpiRecord
// ─────────────────────────────────────────────────────────────

describe('denormalizeKpiRecord — engine keys → registry keys', () => {
  it('translates omni to omnihealth', () => {
    const result = denormalizeKpiRecord({ omni: 150 })
    expect(result).toHaveProperty('omnihealth', 150)
    expect(result).not.toHaveProperty('omni')
  })

  it('translates wellness to wellnessCard', () => {
    const result = denormalizeKpiRecord({ wellness: 80 })
    expect(result).toHaveProperty('wellnessCard', 80)
    expect(result).not.toHaveProperty('wellness')
  })

  it('normalizes full engine-keyed record to registry keys', () => {
    const result = denormalizeKpiRecord(ENGINE_ENTRY)
    expect(result).toEqual(REGISTRY_ENTRY)
  })

  it('denormalize(normalize(record)) round-trips correctly', () => {
    const result = denormalizeKpiRecord(normalizeKpiRecord(REGISTRY_ENTRY))
    expect(result).toEqual(REGISTRY_ENTRY)
  })
})

// ─────────────────────────────────────────────────────────────
// 5. KEY ENUMERATION
// ─────────────────────────────────────────────────────────────

describe('getEngineCompatibleKpiKeys — engine key list', () => {
  it('returns exactly the 5 engine KPI keys', () => {
    const keys = getEngineCompatibleKpiKeys()
    expect(keys).toHaveLength(5)
  })

  it('existing engine key order is preserved: wasfaty, omni, wellness, basket, crossSelling', () => {
    expect(getEngineCompatibleKpiKeys()).toEqual([
      'wasfaty', 'omni', 'wellness', 'basket', 'crossSelling',
    ])
  })

  it('does not contain registry-only keys (omnihealth, wellnessCard)', () => {
    const keys = getEngineCompatibleKpiKeys()
    expect(keys).not.toContain('omnihealth')
    expect(keys).not.toContain('wellnessCard')
  })

  it('returns a new array each call (no mutation risk)', () => {
    const k1 = getEngineCompatibleKpiKeys()
    const k2 = getEngineCompatibleKpiKeys()
    expect(k1).not.toBe(k2)
    expect(k1).toEqual(k2)
  })
})

describe('getRegistryCompatibleKpiKeys — registry key list', () => {
  it('returns all 10 active production KPI keys', () => {
    const keys = getRegistryCompatibleKpiKeys()
    expect(keys).toHaveLength(10)
  })

  it('contains omnihealth, not omni', () => {
    const keys = getRegistryCompatibleKpiKeys()
    expect(keys).toContain('omnihealth')
    expect(keys).not.toContain('omni')
  })

  it('contains wellnessCard, not wellness', () => {
    const keys = getRegistryCompatibleKpiKeys()
    expect(keys).toContain('wellnessCard')
    expect(keys).not.toContain('wellness')
  })

  it('contains all production keys: sales, sl, ndf, inbody, liberation', () => {
    const keys = getRegistryCompatibleKpiKeys()
    ;['sales', 'sl', 'ndf', 'inbody', 'liberation'].forEach((key) => {
      expect(keys).toContain(key)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 6. TARGET CONVERSION — mapRegistryTargetsToEngineTargets
// ─────────────────────────────────────────────────────────────

describe('mapRegistryTargetsToEngineTargets', () => {
  it('converts a registry target to engine target format', () => {
    const result = mapRegistryTargetsToEngineTargets(REGISTRY_TARGET)
    expect(result).toEqual(ENGINE_TARGET)
  })

  it('omnihealth → omniTarget without losing the value', () => {
    const result = mapRegistryTargetsToEngineTargets({ pharmacyId:'p1', month:'2025-05', omnihealth: 160 })
    expect(result.omniTarget).toBe(160)
  })

  it('wellnessCard → wellnessTarget without losing the value', () => {
    const result = mapRegistryTargetsToEngineTargets({ pharmacyId:'p1', month:'2025-05', wellnessCard: 120 })
    expect(result.wellnessTarget).toBe(120)
  })

  it('also accepts engine key "omni" for backward compat', () => {
    const result = mapRegistryTargetsToEngineTargets({ pharmacyId:'p1', month:'2025-05', omni: 160 } as any)
    expect(result.omniTarget).toBe(160)
  })

  it('also accepts engine key "wellness" for backward compat', () => {
    const result = mapRegistryTargetsToEngineTargets({ pharmacyId:'p1', month:'2025-05', wellness: 120 } as any)
    expect(result.wellnessTarget).toBe(120)
  })

  it('missing values default to 0 — no NaN in output', () => {
    const result = mapRegistryTargetsToEngineTargets({ pharmacyId:'p1', month:'2025-05' })
    expect(result.wasfatyTarget).toBe(0)
    expect(result.omniTarget).toBe(0)
    expect(result.wellnessTarget).toBe(0)
    expect(result.basketTarget).toBe(0)
    expect(result.crossSellTarget).toBe(0)
    expect(isNaN(result.wasfatyTarget)).toBe(false)
  })

  it('includes salesTarget when sales is present', () => {
    const result = mapRegistryTargetsToEngineTargets({ pharmacyId:'p1', month:'2025-05', sales: 50000 })
    expect(result.salesTarget).toBe(50000)
  })

  it('omits salesTarget when sales is absent', () => {
    const result = mapRegistryTargetsToEngineTargets({ pharmacyId:'p1', month:'2025-05' })
    expect(result.salesTarget).toBeUndefined()
  })

  it('handles NaN and null values safely', () => {
    const result = mapRegistryTargetsToEngineTargets({
      pharmacyId:'p1', month:'2025-05',
      wasfaty: NaN as any,
      omnihealth: null as any,
    })
    expect(result.wasfatyTarget).toBe(0)
    expect(result.omniTarget).toBe(0)
  })

  it('does not mutate the input target', () => {
    const input = { ...REGISTRY_TARGET }
    mapRegistryTargetsToEngineTargets(input)
    expect(input).toEqual(REGISTRY_TARGET)
  })
})

// ─────────────────────────────────────────────────────────────
// 7. TARGET REVERSE CONVERSION — mapEngineTargetsToRegistryTargets
// ─────────────────────────────────────────────────────────────

describe('mapEngineTargetsToRegistryTargets', () => {
  it('converts an engine target to registry key format', () => {
    const result = mapEngineTargetsToRegistryTargets(ENGINE_TARGET)
    expect(result.omnihealth).toBe(160)
    expect(result.wellnessCard).toBe(120)
    expect(result.wasfaty).toBe(200)
    expect(result.basket).toBe(100)
    expect(result.crossSelling).toBe(80)
  })

  it('round-trip: registry → engine → registry preserves values', () => {
    const engineTarget = mapRegistryTargetsToEngineTargets(REGISTRY_TARGET)
    const backToRegistry = mapEngineTargetsToRegistryTargets(engineTarget)
    expect(backToRegistry.wasfaty).toBe(REGISTRY_TARGET.wasfaty)
    expect(backToRegistry.omnihealth).toBe(REGISTRY_TARGET.omnihealth)
    expect(backToRegistry.wellnessCard).toBe(REGISTRY_TARGET.wellnessCard)
    expect(backToRegistry.basket).toBe(REGISTRY_TARGET.basket)
    expect(backToRegistry.crossSelling).toBe(REGISTRY_TARGET.crossSelling)
  })
})

// ─────────────────────────────────────────────────────────────
// 8. RESULT MAPPING — mapEngineResultsToRegistryResults
// ─────────────────────────────────────────────────────────────

describe('mapEngineResultsToRegistryResults', () => {
  it('maps engine keys to registry keys in result objects', () => {
    const engineResults = {
      omni:     { achievementPct: 94, status: 'good' },
      wellness: { achievementPct: 85, status: 'good' },
      wasfaty:  { achievementPct: 100, status: 'excellent' },
    }
    const result = mapEngineResultsToRegistryResults(engineResults)
    expect(result).toHaveProperty('omnihealth')
    expect(result).toHaveProperty('wellnessCard')
    expect(result).toHaveProperty('wasfaty')
    expect(result).not.toHaveProperty('omni')
    expect(result).not.toHaveProperty('wellness')
  })

  it('preserves nested values when translating keys', () => {
    const engineResults = {
      omni: { achievementPct: 94, status: 'good', actual: 150 },
    }
    const result = mapEngineResultsToRegistryResults(engineResults)
    expect(result.omnihealth).toEqual({ achievementPct: 94, status: 'good', actual: 150 })
  })

  it('handles empty results safely', () => {
    expect(mapEngineResultsToRegistryResults({})).toEqual({})
  })

  it('does not mutate the input object', () => {
    const input = { omni: { achievementPct: 90 } }
    mapEngineResultsToRegistryResults(input)
    expect(input).toHaveProperty('omni')
    expect(input).not.toHaveProperty('omnihealth')
  })
})

describe('mapRegistryResultsToEngineResults', () => {
  it('maps registry keys to engine keys', () => {
    const registryResults = {
      omnihealth:   { achievementPct: 94 },
      wellnessCard: { achievementPct: 85 },
      wasfaty:      { achievementPct: 100 },
    }
    const result = mapRegistryResultsToEngineResults(registryResults)
    expect(result).toHaveProperty('omni')
    expect(result).toHaveProperty('wellness')
    expect(result).toHaveProperty('wasfaty')
    expect(result).not.toHaveProperty('omnihealth')
  })

  it('round-trips: mapEngineResultsToRegistryResults → mapRegistryResultsToEngineResults', () => {
    const original = { omni: { val: 150 }, wellness: { val: 80 }, basket: { val: 95 } }
    const roundTripped = mapRegistryResultsToEngineResults(
      mapEngineResultsToRegistryResults(original)
    )
    expect(roundTripped).toEqual(original)
  })
})

// ─────────────────────────────────────────────────────────────
// 9. SAFETY — isKnownKpiKey and findKpiDefinition
// ─────────────────────────────────────────────────────────────

describe('isKnownKpiKey', () => {
  it('returns true for all registry keys', () => {
    Object.keys(DEFAULT_KPI_REGISTRY).forEach((key) => {
      expect(isKnownKpiKey(key)).toBe(true)
    })
  })

  it('returns true for engine alias keys (omni, wellness)', () => {
    expect(isKnownKpiKey('omni')).toBe(true)
    expect(isKnownKpiKey('wellness')).toBe(true)
  })

  it('returns false for unknown keys', () => {
    expect(isKnownKpiKey('unknownKpi')).toBe(false)
    expect(isKnownKpiKey('')).toBe(false)
    expect(isKnownKpiKey('WASFATY')).toBe(false)  // case-sensitive
  })
})

describe('findKpiDefinition', () => {
  it('finds a definition by registry key', () => {
    const def = findKpiDefinition('omnihealth')
    expect(def).toBeDefined()
    expect(def?.key).toBe('omnihealth')
  })

  it('finds omnihealth definition when given engine key "omni"', () => {
    const def = findKpiDefinition('omni')
    expect(def).toBeDefined()
    expect(def?.key).toBe('omnihealth')
  })

  it('finds wellnessCard definition when given engine key "wellness"', () => {
    const def = findKpiDefinition('wellness')
    expect(def).toBeDefined()
    expect(def?.key).toBe('wellnessCard')
  })

  it('returns undefined for unknown keys — does not throw', () => {
    expect(() => findKpiDefinition('doesNotExist')).not.toThrow()
    expect(findKpiDefinition('doesNotExist')).toBeUndefined()
  })

  it('finds definitions for all core production KPIs', () => {
    const coreKeys = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']
    coreKeys.forEach((key) => {
      const def = findKpiDefinition(key)
      expect(def).toBeDefined()
      expect(def?.isActive).toBe(true)
      expect(def?.isCore).toBe(true)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 10. ENGINE COMPATIBILITY — existing engine key order
// ─────────────────────────────────────────────────────────────

describe('engine compatibility — key order stability', () => {
  it('getEngineCompatibleKpiKeys() matches the existing KPI_KEYS order in kpiAnalyticsEngine', () => {
    // This order must never change — engines depend on it
    const EXPECTED_ORDER = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
    expect(getEngineCompatibleKpiKeys()).toEqual(EXPECTED_ORDER)
  })

  it('normalizing an engine-keyed record is an identity operation', () => {
    // The engine already uses correct keys — no translation needed
    const result = normalizeKpiRecord(ENGINE_ENTRY)
    expect(result).toEqual(ENGINE_ENTRY)
  })

  it('all engine keys map to themselves via toEngineKey', () => {
    getEngineCompatibleKpiKeys().forEach((key) => {
      if (key !== 'omni' && key !== 'wellness') {
        // Non-aliased keys pass through
        expect(toEngineKey(key)).toBe(key)
      }
    })
  })

  it('adapter does not alter existing engine KPI calculations', () => {
    // Verify the adapter is purely a translation layer:
    // engine keys in → same engine keys out after normalization
    const engineOnlyRecord = { wasfaty: 200, omni: 150, wellness: 120, basket: 95, crossSelling: 75 }
    const normalized = normalizeKpiRecord(engineOnlyRecord)
    // Same keys, same values — nothing changed
    expect(normalized.wasfaty).toBe(200)
    expect(normalized.omni).toBe(150)
    expect(normalized.wellness).toBe(120)
    expect(normalized.basket).toBe(95)
    expect(normalized.crossSelling).toBe(75)
  })
})
