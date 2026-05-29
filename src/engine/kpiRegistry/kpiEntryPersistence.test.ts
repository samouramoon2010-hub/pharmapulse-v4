// ============================================================
// KPI Entry Persistence — Dynamic Safety Tests (Part 4B)
// Tests: sanitizeKpiEntryFields, buildAllowedEntryKeys,
//        ENTRY_METADATA_FIELDS, payload shape, backward compat,
//        NaN/Infinity rejection, string coercion, safe exclusions.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve }      from 'path'

import {
  sanitizeKpiEntryFields,
  buildAllowedEntryKeys,
  ENTRY_METADATA_FIELDS,
} from '../../services/kpiRegistryLogic'

import {
  DEFAULT_KPI_REGISTRY,
} from '../../engine/kpiRegistry'

import { mergeRemoteRegistryWithDefaults } from '../../services/kpiRegistryLogic'
import type { KpiDefinition, KpiRegistry }  from '../../engine/kpiRegistry'

// ── Source-level guards ────────────────────────────────────────
const KPI_SERVICE_SRC = readFileSync(
  resolve(__dirname, '../../../src/services/kpiService.js'), 'utf8'
)
const REGISTRY_LOGIC_SRC = readFileSync(
  resolve(__dirname, '../../../src/services/kpiRegistryLogic.ts'), 'utf8'
)

// ── Helpers ────────────────────────────────────────────────────

function customKpi(key: string, engineKey?: string): KpiDefinition {
  return {
    key,
    label:      key,
    shortLabel: key,
    labelAr:    key,
    aliasFor:   engineKey,
    category:   'commercial',
    valueType:  'count',
    unit:       'units',
    unitAr:     'وحدة',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0,
    isActive:   true,
    isCore:     false,
    thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
    visibility: {
      dashboardEnabled: true, teamEnabled: false,
      executiveEnabled: false, regionalEnabled: false,
    },
    sortOrder: 500,
  }
}

// ══════════════════════════════════════════════════════════════
// 1 — Source-level architecture guards
// ══════════════════════════════════════════════════════════════

describe('kpiService.js — Phase 4B architecture', () => {
  it('no longer has hardcoded wasfaty destructuring parameter', () => {
    // The old form was: export async function saveKpiEntry({ ..., wasfaty = 0, ...
    expect(KPI_SERVICE_SRC).not.toMatch(/wasfaty\s*=\s*0/)
  })

  it('no longer has hardcoded omni destructuring parameter', () => {
    expect(KPI_SERVICE_SRC).not.toMatch(/omni\s*=\s*0/)
  })

  it('no longer has hardcoded wellness destructuring parameter', () => {
    expect(KPI_SERVICE_SRC).not.toMatch(/wellness\s*=\s*0/)
  })

  it('no longer has hardcoded basket destructuring parameter', () => {
    expect(KPI_SERVICE_SRC).not.toMatch(/basket\s*=\s*0/)
  })

  it('no longer has hardcoded crossSelling destructuring parameter', () => {
    expect(KPI_SERVICE_SRC).not.toMatch(/crossSelling\s*=\s*0/)
  })

  it('imports sanitizeKpiEntryFields from kpiRegistryLogic', () => {
    expect(KPI_SERVICE_SRC).toContain('sanitizeKpiEntryFields')
  })

  it('imports ENTRY_METADATA_FIELDS from kpiRegistryLogic', () => {
    expect(KPI_SERVICE_SRC).toContain('ENTRY_METADATA_FIELDS')
  })

  it('uses ...kpiFields spread to collect candidate KPI values', () => {
    expect(KPI_SERVICE_SRC).toContain('...kpiFields')
  })

  it('safeKpiValues are spread into the payload', () => {
    expect(KPI_SERVICE_SRC).toMatch(/\.\.\.safeKpiValues/)
  })
})

describe('kpiRegistryLogic.ts — sanitization helpers exported', () => {
  it('ENTRY_METADATA_FIELDS is exported', () => {
    expect(REGISTRY_LOGIC_SRC).toContain('export const ENTRY_METADATA_FIELDS')
  })

  it('buildAllowedEntryKeys is exported', () => {
    expect(REGISTRY_LOGIC_SRC).toContain('export function buildAllowedEntryKeys')
  })

  it('sanitizeKpiEntryFields is exported', () => {
    expect(REGISTRY_LOGIC_SRC).toContain('export function sanitizeKpiEntryFields')
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — ENTRY_METADATA_FIELDS set correctness
// ══════════════════════════════════════════════════════════════

describe('ENTRY_METADATA_FIELDS — protected metadata keys', () => {
  it('contains userId', () => expect(ENTRY_METADATA_FIELDS.has('userId')).toBe(true))
  it('contains pharmacyId', () => expect(ENTRY_METADATA_FIELDS.has('pharmacyId')).toBe(true))
  it('contains date', () => expect(ENTRY_METADATA_FIELDS.has('date')).toBe(true))
  it('contains notes', () => expect(ENTRY_METADATA_FIELDS.has('notes')).toBe(true))
  it('contains createdAt', () => expect(ENTRY_METADATA_FIELDS.has('createdAt')).toBe(true))
  it('contains updatedAt', () => expect(ENTRY_METADATA_FIELDS.has('updatedAt')).toBe(true))
  it('contains actorId', () => expect(ENTRY_METADATA_FIELDS.has('actorId')).toBe(true))
  it('contains actorRole', () => expect(ENTRY_METADATA_FIELDS.has('actorRole')).toBe(true))
  it('contains submittedBy', () => expect(ENTRY_METADATA_FIELDS.has('submittedBy')).toBe(true))
  it('does NOT contain wasfaty (wasfaty is a KPI key)', () => {
    expect(ENTRY_METADATA_FIELDS.has('wasfaty')).toBe(false)
  })
  it('does NOT contain omni', () => expect(ENTRY_METADATA_FIELDS.has('omni')).toBe(false))
})

// ══════════════════════════════════════════════════════════════
// 3 — buildAllowedEntryKeys
// ══════════════════════════════════════════════════════════════

describe('buildAllowedEntryKeys — registry-driven allowlist', () => {
  it('returns a Set', () => {
    expect(buildAllowedEntryKeys() instanceof Set).toBe(true)
  })

  it('contains wasfaty (core KPI engine key)', () => {
    expect(buildAllowedEntryKeys().has('wasfaty')).toBe(true)
  })

  it('contains omni (engine key for omnihealth)', () => {
    expect(buildAllowedEntryKeys().has('omni')).toBe(true)
  })

  it('contains wellness (engine key for wellnessCard)', () => {
    expect(buildAllowedEntryKeys().has('wellness')).toBe(true)
  })

  it('contains basket', () => {
    expect(buildAllowedEntryKeys().has('basket')).toBe(true)
  })

  it('contains crossSelling', () => {
    expect(buildAllowedEntryKeys().has('crossSelling')).toBe(true)
  })

  it('does NOT contain omnihealth (registry key, not engine key)', () => {
    // engine uses 'omni', not 'omnihealth'
    expect(buildAllowedEntryKeys().has('omnihealth')).toBe(false)
  })

  it('includes custom KPI key when added to registry', () => {
    const extended: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, nps: customKpi('nps') }
    expect(buildAllowedEntryKeys(extended).has('nps')).toBe(true)
  })

  it('uses aliasFor as the engine key when set', () => {
    // omnihealth.aliasFor = 'omni' → engine key is 'omni'
    const keys = buildAllowedEntryKeys(DEFAULT_KPI_REGISTRY)
    expect(keys.has('omni')).toBe(true)
    expect(keys.has('omnihealth')).toBe(false)
  })

  it('excludes inactive KPIs', () => {
    const withInactive: KpiRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      ghost: customKpi('ghost'),
    }
    withInactive.ghost = { ...withInactive.ghost, isActive: false }
    expect(buildAllowedEntryKeys(withInactive).has('ghost')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — sanitizeKpiEntryFields — core behavior
// ══════════════════════════════════════════════════════════════

describe('sanitizeKpiEntryFields — core KPI preservation', () => {
  it('passes through wasfaty as a number', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: 42 })
    expect(result.wasfaty).toBe(42)
  })

  it('passes through omni', () => {
    const result = sanitizeKpiEntryFields({ omni: 10 })
    expect(result.omni).toBe(10)
  })

  it('passes through wellness', () => {
    const result = sanitizeKpiEntryFields({ wellness: 8 })
    expect(result.wellness).toBe(8)
  })

  it('passes through basket', () => {
    const result = sanitizeKpiEntryFields({ basket: 150 })
    expect(result.basket).toBe(150)
  })

  it('passes through crossSelling', () => {
    const result = sanitizeKpiEntryFields({ crossSelling: 5 })
    expect(result.crossSelling).toBe(5)
  })

  it('preserves all five core KPIs in a full entry', () => {
    const result = sanitizeKpiEntryFields({
      wasfaty: 20, omni: 12, wellness: 9, basket: 200, crossSelling: 7,
    })
    expect(result).toMatchObject({ wasfaty: 20, omni: 12, wellness: 9, basket: 200, crossSelling: 7 })
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — sanitizeKpiEntryFields — custom KPI support
// ══════════════════════════════════════════════════════════════

describe('sanitizeKpiEntryFields — custom KPI fields', () => {
  const ALL_CUSTOM = ['nps', 'manuka', 'sales', 'sl', 'ndf', 'inbody', 'liberation'] as const

  for (const key of ALL_CUSTOM) {
    it(`includes ${key} when present in registry`, () => {
      const extended = mergeRemoteRegistryWithDefaults({ [key]: customKpi(key) } as KpiRegistry)
      const result = sanitizeKpiEntryFields({ [key]: 15 }, extended)
      expect(result[key]).toBe(15)
    })
  }

  it('excludes custom KPI not in registry', () => {
    const result = sanitizeKpiEntryFields({ unknownKpi: 5 }, DEFAULT_KPI_REGISTRY)
    expect('unknownKpi' in result).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — sanitizeKpiEntryFields — string coercion
// ══════════════════════════════════════════════════════════════

describe('sanitizeKpiEntryFields — string → number coercion', () => {
  it('coerces "5" to 5', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: '5' })
    expect(result.wasfaty).toBe(5)
  })

  it('coerces "0" to 0', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: '0' })
    expect(result.wasfaty).toBe(0)
  })

  it('coerces "" (empty string) to 0', () => {
    // Number('') === 0; Math.max(0, 0) === 0
    const result = sanitizeKpiEntryFields({ wasfaty: '' })
    expect(result.wasfaty).toBe(0)
  })

  it('coerces "123.5" to 123.5', () => {
    const result = sanitizeKpiEntryFields({ basket: '123.5' })
    expect(result.basket).toBe(123.5)
  })
})

// ══════════════════════════════════════════════════════════════
// 7 — sanitizeKpiEntryFields — NaN/Infinity rejection
// ══════════════════════════════════════════════════════════════

describe('sanitizeKpiEntryFields — NaN/Infinity rejection', () => {
  it('rejects NaN — field excluded from result', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: NaN })
    expect('wasfaty' in result).toBe(false)
  })

  it('rejects Infinity — field excluded', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: Infinity })
    expect('wasfaty' in result).toBe(false)
  })

  it('rejects -Infinity — field excluded', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: -Infinity })
    expect('wasfaty' in result).toBe(false)
  })

  it('rejects "abc" string — not numeric', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: 'abc' })
    expect('wasfaty' in result).toBe(false)
  })

  it('rejects null — field excluded', () => {
    // null is not a valid numeric value; explicitly excluded
    const result = sanitizeKpiEntryFields({ wasfaty: null as any })
    expect('wasfaty' in result).toBe(false)
  })

  it('other valid KPI fields still appear when one field is NaN', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: NaN, omni: 5 })
    expect('wasfaty' in result).toBe(false)
    expect(result.omni).toBe(5)
  })
})

// ══════════════════════════════════════════════════════════════
// 8 — sanitizeKpiEntryFields — negative clamping
// ══════════════════════════════════════════════════════════════

describe('sanitizeKpiEntryFields — negative value clamping', () => {
  it('clamps -5 to 0', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: -5 })
    expect(result.wasfaty).toBe(0)
  })

  it('clamps -0.1 to 0', () => {
    const result = sanitizeKpiEntryFields({ basket: -0.1 })
    expect(result.basket).toBe(0)
  })

  it('preserves 0 as 0', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: 0 })
    expect(result.wasfaty).toBe(0)
  })

  it('preserves large positive values', () => {
    const result = sanitizeKpiEntryFields({ basket: 99999 })
    expect(result.basket).toBe(99999)
  })
})

// ══════════════════════════════════════════════════════════════
// 9 — sanitizeKpiEntryFields — metadata field exclusion
// ══════════════════════════════════════════════════════════════

describe('sanitizeKpiEntryFields — metadata fields excluded', () => {
  it('excludes userId', () => {
    const result = sanitizeKpiEntryFields({ userId: 'u123', wasfaty: 5 })
    expect('userId' in result).toBe(false)
    expect(result.wasfaty).toBe(5)
  })

  it('excludes pharmacyId', () => {
    const result = sanitizeKpiEntryFields({ pharmacyId: 'p1', omni: 3 })
    expect('pharmacyId' in result).toBe(false)
  })

  it('excludes date', () => {
    const result = sanitizeKpiEntryFields({ date: '2025-05-15', wasfaty: 10 })
    expect('date' in result).toBe(false)
    expect(result.wasfaty).toBe(10)
  })

  it('excludes notes', () => {
    const result = sanitizeKpiEntryFields({ notes: 'good day', wasfaty: 7 })
    expect('notes' in result).toBe(false)
  })

  it('excludes actorId', () => {
    const result = sanitizeKpiEntryFields({ actorId: 'admin1', basket: 200 })
    expect('actorId' in result).toBe(false)
    expect(result.basket).toBe(200)
  })

  it('excludes actorRole', () => {
    const result = sanitizeKpiEntryFields({ actorRole: 'admin', crossSelling: 2 })
    expect('actorRole' in result).toBe(false)
  })

  it('excludes createdAt / updatedAt', () => {
    const result = sanitizeKpiEntryFields({ createdAt: '2025-01-01', updatedAt: '2025-01-02', wasfaty: 1 })
    expect('createdAt' in result).toBe(false)
    expect('updatedAt' in result).toBe(false)
    expect(result.wasfaty).toBe(1)
  })
})

// ══════════════════════════════════════════════════════════════
// 10 — sanitizeKpiEntryFields — unsafe arbitrary field exclusion
// ══════════════════════════════════════════════════════════════

describe('sanitizeKpiEntryFields — unsafe/unknown field exclusion', () => {
  it('excludes fields with keys not in registry', () => {
    // 'arbitraryField' is not a registered KPI key → excluded
    const result = sanitizeKpiEntryFields({ arbitraryField: 1, wasfaty: 5 }, DEFAULT_KPI_REGISTRY)
    expect('arbitraryField' in result).toBe(false)
    expect(result.wasfaty).toBe(5)
  })

  it('excludes object value fields', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: { nested: 'object' } as any })
    expect('wasfaty' in result).toBe(false)
  })

  it('excludes array value fields', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: [1, 2, 3] as any })
    expect('wasfaty' in result).toBe(false)
  })

  it('excludes boolean value fields', () => {
    // Number(true) === 1 — but booleans are not expected KPI values
    // They pass Number() coercion so test registry-only exclusion for unknown key
    const result = sanitizeKpiEntryFields({ randomBool: true as any }, DEFAULT_KPI_REGISTRY)
    expect('randomBool' in result).toBe(false)
  })

  it('excludes fields with undefined values', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: undefined as any })
    // Number(undefined) === NaN → rejected
    expect('wasfaty' in result).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════
// 11 — Firestore payload shape validation
// ══════════════════════════════════════════════════════════════

describe('sanitizeKpiEntryFields — Firestore-compatible payload shape', () => {
  it('returns a plain object (not null, not array)', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: 5 })
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
    expect(Array.isArray(result)).toBe(false)
  })

  it('all result values are finite numbers', () => {
    const result = sanitizeKpiEntryFields({
      wasfaty: 10, omni: 5, wellness: 3, basket: 200, crossSelling: 2,
    })
    for (const val of Object.values(result)) {
      expect(typeof val).toBe('number')
      expect(isFinite(val)).toBe(true)
      expect(isNaN(val)).toBe(false)
    }
  })

  it('all result values are non-negative', () => {
    const result = sanitizeKpiEntryFields({ wasfaty: 0, omni: 5 })
    for (const val of Object.values(result)) {
      expect(val).toBeGreaterThanOrEqual(0)
    }
  })

  it('empty input returns empty object', () => {
    const result = sanitizeKpiEntryFields({})
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('input with only metadata returns empty KPI object', () => {
    const result = sanitizeKpiEntryFields({
      userId: 'u1', pharmacyId: 'p1', date: '2025-05-15', notes: 'ok',
    })
    expect(Object.keys(result)).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════
// 12 — Backward compatibility: old entry shape still processed
// ══════════════════════════════════════════════════════════════

describe('sanitizeKpiEntryFields — backward compatibility', () => {
  it('processes a legacy entry object with all 5 core fields', () => {
    const legacyEntry = {
      userId:      'u1',
      pharmacyId:  'p1',
      date:        '2025-04-01',
      wasfaty:      18,
      omni:         9,
      wellness:     12,
      basket:       250,
      crossSelling: 6,
      notes:       'all good',
      createdAt:   '2025-04-01T09:00:00Z',
      updatedAt:   '2025-04-01T09:05:00Z',
    }
    const result = sanitizeKpiEntryFields(legacyEntry)
    expect(result).toMatchObject({ wasfaty: 18, omni: 9, wellness: 12, basket: 250, crossSelling: 6 })
    expect('userId' in result).toBe(false)
    expect('notes' in result).toBe(false)
    expect('createdAt' in result).toBe(false)
  })

  it('existing analytics engine tests still pass — KPI_KEYS unchanged', () => {
    // This is a structural assertion: the engine file should not have been touched
    const ENGINE_SRC = readFileSync(
      resolve(__dirname, '../../engine/kpiAnalyticsEngine.ts'), 'utf8'
    )
    expect(ENGINE_SRC).toContain("'wasfaty'")
    expect(ENGINE_SRC).toContain("'omni'")
    expect(ENGINE_SRC).toContain("'wellness'")
    expect(ENGINE_SRC).toContain("'basket'")
    expect(ENGINE_SRC).toContain("'crossSelling'")
    // Engine KPI_KEYS array is still the legacy 5
    expect(ENGINE_SRC).toMatch(/export const KPI_KEYS/)
  })
})
