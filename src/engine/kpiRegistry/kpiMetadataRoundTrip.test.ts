// ============================================================
// KPI Registry Metadata Round-Trip — Regression Tests
//
// ROOT CAUSE:
//   buildDocPayload (runtime, kpiRegistryService.ts) did not
//   include `aliasFor` or `description` in the Firestore payload.
//   docToKpiDefinition (kpiRegistryLogic.ts) did not read `aliasFor`.
//
//   Impact A — aliasFor (P0):
//     omnihealth.aliasFor = 'omni', wellnessCard.aliasFor = 'wellness'.
//     After any edit to omnihealth/wellnessCard, the saved Firestore doc
//     had no aliasFor field. On next read, aliasFor = undefined →
//     engineKey = kpi.aliasFor ?? kpi.key = 'omnihealth' (wrong).
//     KpiEntryPage and TargetsPage then look for entries[omnihealth]
//     instead of entries[omni] → all data appears as 0 / missing.
//
//   Impact B — description (P2):
//     buildDocPayload omitted description. On a fresh save of a KPI
//     that had never been written to Firestore, description would be
//     missing from the doc. After read-back, description = '' (default).
//     Existing docs preserved description via merge:true.
//
//   Impact C — SL label/unit/labelAr not appearing:
//     For sl (no aliasFor), the label chain is intact. The actual
//     cause for "changes not appearing" for SL:
//     - KpiEntryPage uses liveRegistry from subscribeKpiRegistry.
//     - After save, subscribeKpiRegistry fires with new registry.
//     - buildEntryFields uses kpi.labelAr || kpi.label || kpi.key.
//     - If labelAr was previously "" (coerced from null/undefined),
//       String("") = "" is falsy → falls back to label.
//     - Fix: description and aliasFor now persist correctly.
//       For sl specifically, labelAr/label/unit chain was always correct;
//       the user-visible fix is that all metadata fields now survive
//       round-trips, preventing silent data loss on edit.
//
// FIXES:
//   kpiRegistryService.ts buildDocPayload: added aliasFor + description
//   kpiRegistryLogic.ts docToKpiDefinition: reads aliasFor from doc
//   kpiRegistryLogic.ts buildDocPayloadSync: added aliasFor (test parity)
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  docToKpiDefinition,
  buildDocPayloadSync,
  mergeRemoteRegistryWithDefaults,
} from '../../services/kpiRegistryLogic'
import { DEFAULT_KPI_REGISTRY }              from '../../engine/kpiRegistry'
import type { KpiDefinition, KpiRegistry }   from '../../engine/kpiRegistry'

// ── Helpers ────────────────────────────────────────────────

/** Simulate a full Firestore round-trip: build payload → read back */
function roundTrip(def: KpiDefinition, uiStatus = 'ACTIVE') {
  const payload = buildDocPayloadSync(def, uiStatus as any, 'test-user')
  return docToKpiDefinition(payload as Record<string, unknown>)
}

// ── Fixtures ──────────────────────────────────────────────

const omnihealth = DEFAULT_KPI_REGISTRY['omnihealth']!
const wellnessCard = DEFAULT_KPI_REGISTRY['wellnessCard']!
const sl = DEFAULT_KPI_REGISTRY['sl']!
const wasfaty = DEFAULT_KPI_REGISTRY['wasfaty']!

// ══════════════════════════════════════════════════════════════
// 1 — aliasFor persists through Firestore round-trip
// ══════════════════════════════════════════════════════════════

describe('aliasFor — persists through Firestore round-trip', () => {
  it('omnihealth.aliasFor survives buildDocPayloadSync → docToKpiDefinition', () => {
    expect(omnihealth.aliasFor).toBe('omni')
    const result = roundTrip(omnihealth)
    expect(result).not.toBeNull()
    expect(result!.def.aliasFor).toBe('omni')
  })

  it('wellnessCard.aliasFor survives round-trip', () => {
    expect(wellnessCard.aliasFor).toBe('wellness')
    const result = roundTrip(wellnessCard)
    expect(result!.def.aliasFor).toBe('wellness')
  })

  it('sl has no aliasFor — round-trip returns undefined (correct)', () => {
    expect(sl.aliasFor).toBeUndefined()
    const result = roundTrip(sl)
    expect(result!.def.aliasFor).toBeUndefined()
  })

  it('wasfaty has no aliasFor — engineKey = wasfaty after round-trip', () => {
    const result = roundTrip(wasfaty)
    const engineKey = result!.def.aliasFor ?? result!.def.key
    expect(engineKey).toBe('wasfaty')
  })

  it('engineKey for omnihealth is omni after round-trip (not omnihealth)', () => {
    const result = roundTrip(omnihealth)
    const engineKey = result!.def.aliasFor ?? result!.def.key
    expect(engineKey).toBe('omni')    // CORRECT: used for entry field lookup
    expect(engineKey).not.toBe('omnihealth')  // was broken before fix
  })

  it('engineKey for wellnessCard is wellness after round-trip', () => {
    const result = roundTrip(wellnessCard)
    const engineKey = result!.def.aliasFor ?? result!.def.key
    expect(engineKey).toBe('wellness')
  })
})

// ══════════════════════════════════════════════════════════════
// 2 — label / labelAr / shortLabel persist through round-trip
// ══════════════════════════════════════════════════════════════

describe('SL label/unit metadata — round-trip after admin edit', () => {
  const editedSl: KpiDefinition = {
    ...sl,
    label:      'Service Level (Edited)',
    labelAr:    'مستوى الخدمة المحدّث',
    shortLabel: 'SL+',
    unit:       '%',
    unitAr:     '٪',
    description: 'Updated description for SL.',
  }

  it('edited label survives round-trip', () => {
    const result = roundTrip(editedSl)
    expect(result!.def.label).toBe('Service Level (Edited)')
  })

  it('edited labelAr survives round-trip', () => {
    const result = roundTrip(editedSl)
    expect(result!.def.labelAr).toBe('مستوى الخدمة المحدّث')
  })

  it('edited shortLabel survives round-trip', () => {
    const result = roundTrip(editedSl)
    expect(result!.def.shortLabel).toBe('SL+')
  })

  it('edited unit survives round-trip', () => {
    const result = roundTrip(editedSl)
    expect(result!.def.unit).toBe('%')
  })

  it('edited unitAr survives round-trip', () => {
    const result = roundTrip(editedSl)
    expect(result!.def.unitAr).toBe('٪')
  })

  it('edited description survives round-trip', () => {
    const result = roundTrip(editedSl)
    expect(result!.def.description).toBe('Updated description for SL.')
  })
})

// ══════════════════════════════════════════════════════════════
// 3 — description persists (previously missing from buildDocPayload)
// ══════════════════════════════════════════════════════════════

describe('description — persists through Firestore round-trip', () => {
  it('wasfaty description survives round-trip', () => {
    const result = roundTrip(wasfaty)
    // wasfaty has a description in defaultKpiRegistry
    expect(typeof result!.def.description).toBe('string')
  })

  it('custom KPI description survives round-trip', () => {
    const custom: KpiDefinition = {
      key: 'nps', label: 'NPS', shortLabel: 'NPS', labelAr: 'رضا العميل',
      category: 'commercial', valueType: 'count', unit: 'score', unitAr: 'نقطة',
      direction: 'higher_is_better', targetType: 'absolute',
      weight: 0, isActive: true, isCore: false,
      thresholds: { healthy: 90, watch: 75, risk: 55, critical: 35 },
      visibility: { dashboardEnabled: true, teamEnabled: false, executiveEnabled: false, regionalEnabled: false },
      sortOrder: 500,
      description: 'Net Promoter Score — customer satisfaction metric.',
    }
    const result = roundTrip(custom)
    expect(result!.def.description).toBe('Net Promoter Score — customer satisfaction metric.')
  })

  it('empty description defaults to empty string (not undefined)', () => {
    const noDesc: KpiDefinition = { ...sl, description: '' }
    const result = roundTrip(noDesc)
    expect(result!.def.description).toBe('')
  })
})

// ══════════════════════════════════════════════════════════════
// 4 — mergeRemoteRegistryWithDefaults preserves aliasFor from remote
// ══════════════════════════════════════════════════════════════

describe('mergeRemoteRegistryWithDefaults — aliasFor preserved after edit', () => {
  it('edited omnihealth keeps aliasFor in merged registry', () => {
    // Simulate what happens after admin edits omnihealth: Firestore returns
    // the doc with aliasFor (thanks to the fix), docToKpiDefinition reads it,
    // mergeRemoteRegistryWithDefaults replaces the default entry.
    const editedOmni = roundTrip({ ...omnihealth, label: 'OmniHealth V2' })!.def
    const merged = mergeRemoteRegistryWithDefaults({ omnihealth: editedOmni } as KpiRegistry)
    expect(merged['omnihealth']?.aliasFor).toBe('omni')
    expect(merged['omnihealth']?.label).toBe('OmniHealth V2')
  })

  it('merged registry engineKey for omnihealth is still omni', () => {
    const editedOmni = roundTrip({ ...omnihealth, label: 'OmniHealth V2' })!.def
    const merged = mergeRemoteRegistryWithDefaults({ omnihealth: editedOmni } as KpiRegistry)
    const kpi = merged['omnihealth']!
    expect(kpi.aliasFor ?? kpi.key).toBe('omni')
  })

  it('sl label update propagates correctly through merge', () => {
    const editedSl = roundTrip({ ...sl, labelAr: 'مستوى الخدمة المحدّث' })!.def
    const merged = mergeRemoteRegistryWithDefaults({ sl: editedSl } as KpiRegistry)
    expect(merged['sl']?.labelAr).toBe('مستوى الخدمة المحدّث')
  })
})

// ══════════════════════════════════════════════════════════════
// 5 — buildDocPayloadSync / buildDocPayload parity (source check)
// ══════════════════════════════════════════════════════════════

describe('buildDocPayloadSync — includes aliasFor and description', () => {
  it('omnihealth payload contains aliasFor field', () => {
    const payload = buildDocPayloadSync(omnihealth, 'ACTIVE', 'test')
    expect(payload).toHaveProperty('aliasFor', 'omni')
  })

  it('wellnessCard payload contains aliasFor field', () => {
    const payload = buildDocPayloadSync(wellnessCard, 'ACTIVE', 'test')
    expect(payload).toHaveProperty('aliasFor', 'wellness')
  })

  it('sl payload does NOT contain aliasFor (sl has none)', () => {
    const payload = buildDocPayloadSync(sl, 'ACTIVE', 'test')
    expect('aliasFor' in payload).toBe(false)
  })

  it('wasfaty payload contains description', () => {
    const payload = buildDocPayloadSync(wasfaty, 'ACTIVE', 'test')
    expect('description' in payload).toBe(true)
    expect(typeof payload.description).toBe('string')
  })

  it('payload for all core KPIs contains required label fields', () => {
    const coreKeys = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']
    for (const key of coreKeys) {
      const kpi = DEFAULT_KPI_REGISTRY[key]
      if (!kpi) continue
      const payload = buildDocPayloadSync(kpi, 'ACTIVE', 'test')
      expect(payload.label).toBeTruthy()
      expect(typeof payload.labelAr).toBe('string')
      expect(typeof payload.shortLabel).toBe('string')
      expect(payload.unit).toBeTruthy()
    }
  })
})

// ══════════════════════════════════════════════════════════════
// 6 — docToKpiDefinition reads aliasFor from Firestore doc
// ══════════════════════════════════════════════════════════════

describe('docToKpiDefinition — reads aliasFor from Firestore doc', () => {
  it('reads aliasFor when present in doc data', () => {
    const doc = {
      key: 'omnihealth', label: 'OmniHealth', shortLabel: 'Omni',
      labelAr: 'أومني هيلث', aliasFor: 'omni',
      isActive: true, isCore: true, weight: 0.2,
      category: 'commercial', valueType: 'count', unit: 'visits', unitAr: 'زيارة',
      direction: 'higher_is_better', targetType: 'absolute',
      thresholdHealthy: 90, thresholdWatch: 75, thresholdRisk: 55, thresholdCritical: 35,
      dashboardEnabled: true, teamEnabled: true, executiveEnabled: true, regionalEnabled: true,
      sortOrder: 2, description: 'OmniHealth visits',
    }
    const result = docToKpiDefinition(doc as Record<string, unknown>)
    expect(result).not.toBeNull()
    expect(result!.def.aliasFor).toBe('omni')
  })

  it('aliasFor is undefined when not in doc (correct for sl/wasfaty)', () => {
    const doc = {
      key: 'sl', label: 'Service Level', shortLabel: 'SL', labelAr: 'مستوى الخدمة',
      isActive: true, isCore: false, weight: 0,
      category: 'operational', valueType: 'percentage', unit: '%', unitAr: '٪',
      direction: 'higher_is_better', targetType: 'percentage',
      thresholdHealthy: 90, thresholdWatch: 75, thresholdRisk: 55, thresholdCritical: 35,
      dashboardEnabled: true, teamEnabled: true, executiveEnabled: false, regionalEnabled: false,
      sortOrder: 70,
    }
    const result = docToKpiDefinition(doc as Record<string, unknown>)
    expect(result!.def.aliasFor).toBeUndefined()
  })

  it('engineKey from round-tripped omnihealth doc is omni', () => {
    const doc = buildDocPayloadSync(omnihealth, 'ACTIVE', 'test')
    const result = docToKpiDefinition(doc as Record<string, unknown>)
    const engineKey = result!.def.aliasFor ?? result!.def.key
    expect(engineKey).toBe('omni')
  })

  it('engineKey from round-tripped wellnessCard doc is wellness', () => {
    const doc = buildDocPayloadSync(wellnessCard, 'ACTIVE', 'test')
    const result = docToKpiDefinition(doc as Record<string, unknown>)
    const engineKey = result!.def.aliasFor ?? result!.def.key
    expect(engineKey).toBe('wellness')
  })
})
