// ============================================================
// Phase 4D-C — Target Field Adapter + KpiEntry Audit + Full Parity
//
// Tests 1-8:   getTargetFieldName / getActualFieldName adapter behavior
// Tests 9-13:  KpiEntry write path audit (source-level)
// Tests 14-16: Constants cleanup checkpoint
// Tests 17-22: Full parity for 5 core KPIs
// Tests 23-28: Guardrails — no unexpected side-effects
//
// crossSelling INVARIANT: targetField must always be 'crossSellTarget'
// ============================================================

import { describe, it, expect } from 'vitest'
import { DEFAULT_KPI_REGISTRY } from './defaultKpiRegistry'
import {
  getTargetFieldName,
  getActualFieldName,
  getKpiColor,
  getKpiLabel,
  getKpiUnit,
  getKpiCategory,
  getKpiMetaForDisplay,
} from './kpiUiAdapter'
import {
  getCoreEngineKeys,
  KPI_META,
  readKpiActual,
  readKpiTarget,
  computeKpiStats,
  getDayProgress,
} from '../kpiAnalyticsEngine'

// Core registry keys (distinct from engine keys for aliases)
// omni engine key → omnihealth registry key
// wellness engine key → wellnessCard registry key
const REGISTRY_KEYS = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling'] as const
const ENGINE_KEYS   = ['wasfaty', 'omni',        'wellness',     'basket', 'crossSelling'] as const

const SAMPLE_ENTRY  = { wasfaty: 150, omni: 80, wellness: 60, basket: 250, crossSelling: 45 }
const SAMPLE_TARGET = { wasfatyTarget: 200, omniTarget: 100, wellnessTarget: 80, basketTarget: 300, crossSellTarget: 60 }
const TEST_DATE     = new Date('2025-01-15')

// ════════════════════════════════════════════════════════════
// TESTS 1-5 — getTargetFieldName registry-first + fallbacks
// ════════════════════════════════════════════════════════════

describe('4D-C test 1: getTargetFieldName accepts optional registry parameter', () => {
  it('accepts two-arg form without error', () => {
    expect(() => getTargetFieldName('wasfaty', DEFAULT_KPI_REGISTRY as any)).not.toThrow()
    expect(() => getTargetFieldName('wasfaty')).not.toThrow()
  })
})

describe('4D-C test 2: getTargetFieldName returns registry targetField when registry provided', () => {
  it('wasfaty → wasfatyTarget from registry', () => {
    expect(getTargetFieldName('wasfaty', DEFAULT_KPI_REGISTRY as any)).toBe('wasfatyTarget')
  })

  it('omnihealth → omniTarget from registry', () => {
    expect(getTargetFieldName('omnihealth', DEFAULT_KPI_REGISTRY as any)).toBe('omniTarget')
  })

  it('wellnessCard → wellnessTarget from registry', () => {
    expect(getTargetFieldName('wellnessCard', DEFAULT_KPI_REGISTRY as any)).toBe('wellnessTarget')
  })

  it('basket → basketTarget from registry', () => {
    expect(getTargetFieldName('basket', DEFAULT_KPI_REGISTRY as any)).toBe('basketTarget')
  })
})

describe('4D-C test 3: getTargetFieldName falls back to TARGET_FIELD_MAP without registry', () => {
  it('wasfaty falls back to TARGET_FIELD_MAP', () => {
    expect(getTargetFieldName('wasfaty')).toBe('wasfatyTarget')
  })

  it('omnihealth falls back to TARGET_FIELD_MAP → omniTarget', () => {
    expect(getTargetFieldName('omnihealth')).toBe('omniTarget')
  })

  it('crossSelling falls back to TARGET_FIELD_MAP → crossSellTarget', () => {
    expect(getTargetFieldName('crossSelling')).toBe('crossSellTarget')
  })
})

describe('4D-C test 4: getTargetFieldName final fallback preserves old behavior', () => {
  it('unknown key → unknownKeyTarget (engine-key fallback)', () => {
    expect(getTargetFieldName('unknownCustomKpi')).toBe('unknownCustomKpiTarget')
    expect(getTargetFieldName('unknownCustomKpi', {} as any)).toBe('unknownCustomKpiTarget')
  })
})

describe('4D-C test 5: crossSelling INVARIANT — must always return crossSellTarget', () => {
  it('crossSelling with registry → crossSellTarget (NOT crossSellingTarget)', () => {
    const result = getTargetFieldName('crossSelling', DEFAULT_KPI_REGISTRY as any)
    expect(result).toBe('crossSellTarget')
    expect(result).not.toBe('crossSellingTarget')
  })

  it('crossSelling without registry → crossSellTarget (NOT crossSellingTarget)', () => {
    const result = getTargetFieldName('crossSelling')
    expect(result).toBe('crossSellTarget')
    expect(result).not.toBe('crossSellingTarget')
  })

  it('crossSelling registry.targetField is crossSellTarget', () => {
    const kpi = (DEFAULT_KPI_REGISTRY as any)['crossSelling']
    expect(kpi?.targetField).toBe('crossSellTarget')
  })
})

// ════════════════════════════════════════════════════════════
// TESTS 6-8 — getActualFieldName
// ════════════════════════════════════════════════════════════

describe('4D-C test 6: getActualFieldName is exported', () => {
  it('getActualFieldName is a function', () => {
    expect(typeof getActualFieldName).toBe('function')
  })
})

describe('4D-C test 7: getActualFieldName returns registry actualField', () => {
  it('wasfaty → wasfaty', () => {
    expect(getActualFieldName('wasfaty', DEFAULT_KPI_REGISTRY as any)).toBe('wasfaty')
  })

  it('omnihealth → omni (via registry actualField)', () => {
    expect(getActualFieldName('omnihealth', DEFAULT_KPI_REGISTRY as any)).toBe('omni')
  })

  it('wellnessCard → wellness (via registry actualField)', () => {
    expect(getActualFieldName('wellnessCard', DEFAULT_KPI_REGISTRY as any)).toBe('wellness')
  })

  it('basket → basket', () => {
    expect(getActualFieldName('basket', DEFAULT_KPI_REGISTRY as any)).toBe('basket')
  })

  it('crossSelling → crossSelling', () => {
    expect(getActualFieldName('crossSelling', DEFAULT_KPI_REGISTRY as any)).toBe('crossSelling')
  })
})

describe('4D-C test 8: getActualFieldName falls back to engine key', () => {
  it('omnihealth without registry → omni (via alias resolution)', () => {
    expect(getActualFieldName('omnihealth')).toBe('omni')
  })

  it('unknown key without registry → key itself (pass-through)', () => {
    expect(getActualFieldName('myCustomKpi')).toBe('myCustomKpi')
  })
})

// ════════════════════════════════════════════════════════════
// TESTS 9-13 — KpiEntry write path audit (source-level)
// ════════════════════════════════════════════════════════════

describe('4D-C test 9: KpiEntry write path uses engineKey = aliasFor ?? key', async () => {
  it('buildEntryFields uses kpi.aliasFor ?? kpi.key as the field key', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw').then((m) => m.default)
    expect(src).toContain('kpi.aliasFor ?? kpi.key')
  })
})

describe('4D-C test 10: KpiEntry write path uses sanitizeKpiEntryFields', async () => {
  it('saveEntry is called with liveRegistry argument', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw').then((m) => m.default)
    expect(src).toContain('saveEntry(payload, liveRegistry)')
  })
})

describe('4D-C test 11: KpiEntry does not write targetField values', async () => {
  it('KpiEntry payload loop writes form[key] (engineKey), not any targetField', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw').then((m) => m.default)
    // PR-1D2: payload loop is keyed on form[key] (engineKey); the blank→0
    // coercion ("|| 0") was removed so a blank field is omitted rather
    // than silently written as zero. Still never writes a targetField.
    expect(src).toContain('payload[key] = Number(form[key])')
    expect(src).not.toContain('payload[key] = Number(form[key]) || 0')
    // Must not write any target field suffixes to the entry payload
    expect(src).not.toContain("payload['wasfatyTarget']")
    expect(src).not.toContain("payload['crossSellTarget']")
  })
})

describe('4D-C test 12: KpiEntry does not use legacy constants KPI_KEYS', async () => {
  it('KpiEntryPage does not import KPI_KEYS from constants', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw').then((m) => m.default)
    expect(src).not.toContain("from '../../constants'")
    expect(src).not.toContain("from '../constants'")
    expect(src).not.toContain("KPI_KEYS")
  })
})

describe('4D-C test 13: KpiEntry does not use legacy constants KPI_META', async () => {
  it('KpiEntryPage does not import KPI_META from constants', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw').then((m) => m.default)
    expect(src).not.toContain('KPI_META')
  })
})

// ════════════════════════════════════════════════════════════
// TESTS 14-16 — Constants cleanup checkpoint
// ════════════════════════════════════════════════════════════

describe('4D-C test 14: constants KPI_KEYS not imported by active pages', async () => {
  it('BranchIntelligencePage does not import KPI_KEYS from constants', async () => {
    const src = await import('../../pages/branch/BranchIntelligencePage.jsx?raw').then((m) => m.default)
    expect(src).not.toContain("from '../../constants'")
    expect(src).not.toMatch(/import.*KPI_KEYS.*constants/)
  })

  it('PharmacistIntelligencePage does not import KPI_KEYS from constants', async () => {
    const src = await import('../../pages/pharmacist/PharmacistIntelligencePage.jsx?raw').then((m) => m.default)
    expect(src).not.toMatch(/import.*KPI_KEYS.*constants/)
  })

  it('TeamPage does not import KPI_KEYS from constants', async () => {
    const src = await import('../../pages/manager/TeamPage.jsx?raw').then((m) => m.default)
    expect(src).not.toMatch(/import.*KPI_KEYS.*constants/)
  })
})

describe('4D-C test 15: constants KPI_META not imported by active pages', async () => {
  it('BranchIntelligencePage does not import KPI_META from constants', async () => {
    const src = await import('../../pages/branch/BranchIntelligencePage.jsx?raw').then((m) => m.default)
    expect(src).not.toMatch(/import.*KPI_META.*constants/)
  })

  it('DashboardPage does not import KPI_META from constants', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw').then((m) => m.default)
    expect(src).not.toMatch(/import.*KPI_META.*constants/)
  })

  it('KpiEntryPage does not import KPI_META from constants', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw').then((m) => m.default)
    expect(src).not.toContain('KPI_META')
  })
})

describe('4D-C test 16: cross_selling legacy key not used in active page code', async () => {
  it('DashboardPage does not contain cross_selling (underscore form)', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw').then((m) => m.default)
    expect(src).not.toContain("'cross_selling'")
    expect(src).not.toContain('"cross_selling"')
  })

  it('KpiEntryPage does not contain cross_selling (underscore form)', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw').then((m) => m.default)
    expect(src).not.toContain("'cross_selling'")
    expect(src).not.toContain('"cross_selling"')
  })

  it('BranchIntelligencePage does not contain cross_selling', async () => {
    const src = await import('../../pages/branch/BranchIntelligencePage.jsx?raw').then((m) => m.default)
    expect(src).not.toContain("'cross_selling'")
  })
})

// ════════════════════════════════════════════════════════════
// TESTS 17-22 — Full 4D parity checkpoint
// ════════════════════════════════════════════════════════════

// Registry key → engine key mapping for parity lookups
const REGISTRY_TO_ENGINE: Record<string, string> = {
  wasfaty:      'wasfaty',
  omnihealth:   'omni',
  wellnessCard: 'wellness',
  basket:       'basket',
  crossSelling: 'crossSelling',
}

describe('4D-C test 17: parity actualField — registry resolves to same key the legacy code used', () => {
  for (const rk of REGISTRY_KEYS) {
    const ek = REGISTRY_TO_ENGINE[rk]
    it(`${rk}: getActualFieldName → '${ek}' (matches legacy direct key)`, () => {
      expect(getActualFieldName(rk, DEFAULT_KPI_REGISTRY as any)).toBe(ek)
    })
  }
})

describe('4D-C test 18: parity targetField — registry matches KPI_META.targetField', () => {
  for (const rk of REGISTRY_KEYS) {
    const ek = REGISTRY_TO_ENGINE[rk]
    it(`${rk}: getTargetFieldName → matches KPI_META[${ek}].targetField`, () => {
      const registryTarget = getTargetFieldName(rk, DEFAULT_KPI_REGISTRY as any)
      const legacyTarget   = (KPI_META as any)[ek].targetField
      expect(registryTarget).toBe(legacyTarget)
    })
  }
})

describe('4D-C test 19: parity achievement — registry read path matches legacy', () => {
  const dp = getDayProgress(TEST_DATE)

  for (const ek of ENGINE_KEYS) {
    it(`${ek}: achievement parity between registry and legacy paths`, () => {
      const legacyActual  = Number((SAMPLE_ENTRY as any)[ek]) || 0
      const legacyTarget  = Number((SAMPLE_TARGET as any)[(KPI_META as any)[ek].targetField]) || 0
      const legacyStats   = computeKpiStats(legacyActual, legacyTarget, dp, ek)

      const dynActual = readKpiActual(SAMPLE_ENTRY, ek, DEFAULT_KPI_REGISTRY as any)
      const dynTarget = readKpiTarget(SAMPLE_TARGET, ek, DEFAULT_KPI_REGISTRY as any)
      const dynStats  = computeKpiStats(dynActual, dynTarget, dp, ek)

      expect(dynStats.achievementPct).toBe(legacyStats.achievementPct)
    })
  }
})

describe('4D-C test 20: parity color — getKpiColor returns valid hex for all core keys', () => {
  for (const ek of ENGINE_KEYS) {
    it(`${ek}: getKpiColor returns valid hex`, () => {
      expect(getKpiColor(ek)).toMatch(/^#[0-9a-fA-F]{3,8}$/)
    })
  }
})

describe('4D-C test 21: parity label — getKpiLabel returns non-empty string for all core keys', () => {
  for (const ek of ENGINE_KEYS) {
    it(`${ek}: getKpiLabel returns non-empty string`, () => {
      const label = getKpiLabel(ek)
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    })
  }
})

describe('4D-C test 22: parity unit and category exist for all core keys', () => {
  for (const ek of ENGINE_KEYS) {
    it(`${ek}: getKpiUnit returns a string`, () => {
      expect(typeof getKpiUnit(ek)).toBe('string')
    })

    it(`${ek}: getKpiCategory returns a non-empty string`, () => {
      const cat = getKpiCategory(ek)
      expect(typeof cat).toBe('string')
      expect(cat.length).toBeGreaterThan(0)
    })
  }

  it('getKpiMetaForDisplay returns complete shape for all core engine keys', () => {
    for (const ek of ENGINE_KEYS) {
      const meta = getKpiMetaForDisplay(ek, DEFAULT_KPI_REGISTRY as any)
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.color).toMatch(/^#[0-9a-fA-F]{3,8}$/)
      expect(typeof meta.unit).toBe('string')
      expect(typeof meta.category).toBe('string')
    }
  })

  it('getCoreEngineKeys with registry returns exactly 5 core keys', () => {
    const keys = getCoreEngineKeys(DEFAULT_KPI_REGISTRY as any)
    expect(keys).toHaveLength(5)
    for (const ek of ENGINE_KEYS) {
      expect(keys).toContain(ek)
    }
  })
})

// ════════════════════════════════════════════════════════════
// TESTS 23-28 — Guardrails
// ════════════════════════════════════════════════════════════

describe('4D-C test 23: no Firestore changes in kpiUiAdapter', async () => {
  it('kpiUiAdapter does not import Firestore', async () => {
    const src = await import('./kpiUiAdapter.ts?raw').then((m) => m.default)
    expect(src).not.toContain('firestore')
    expect(src).not.toContain('firebase')
    expect(src).not.toContain('setDoc')
    expect(src).not.toContain('getDoc')
  })
})

describe('4D-C test 24: no Dashboard calculation changes', async () => {
  it('DashboardPage calculation core (computeKpiStats) is unchanged', async () => {
    const src = await import('../../pages/dashboard/DashboardPage.jsx?raw').then((m) => m.default)
    expect(src).toContain('computeKpiStats(')
    // Color migration used getKpiColor, not FALLBACK_COLORS
    expect(src).not.toContain('FALLBACK_COLORS')
    expect(src).not.toContain('DEFAULT_KPI_COLOR')
  })
})

describe('4D-C test 25: no Reports calculation changes', async () => {
  it('ReportsPage does not use legacy FALLBACK_COLORS', async () => {
    const src = await import('../../pages/shared/ReportsPage.jsx?raw').then((m) => m.default)
    // ReportsPage was already migrated before Phase 4D
    expect(src).not.toContain('FALLBACK_COLORS')
  })
})

describe('4D-C test 26: no KpiEntry behavior changes', async () => {
  // PR-1D2 deliberately changed this one line: blank fields are no longer
  // coerced to 0 (a verified UI-state bug — see KPI_REGISTRY_GOVERNANCE.md
  // and the PR-1D closure report). The payload is still keyed on
  // form[key]/engineKey; only the blank→0 coercion was removed.
  it('KpiEntry save path keyed on form[key]/engineKey, no blank→0 coercion', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw').then((m) => m.default)
    expect(src).toContain('payload[key] = Number(form[key])')
    expect(src).not.toContain('payload[key] = Number(form[key]) || 0')
  })

  it('KpiEntry still calls saveEntry with liveRegistry for sanitizeKpiEntryFields', async () => {
    const src = await import('../../pages/pharmacist/KpiEntryPage.jsx?raw').then((m) => m.default)
    expect(src).toContain('saveEntry(payload, liveRegistry)')
  })
})

describe('4D-C test 27: no Dynamic KPI regional wiring in kpiUiAdapter or kpiMetaResolver', async () => {
  it('kpiUiAdapter does not reference dynamicKpiRegionalWiring', async () => {
    const src = await import('./kpiUiAdapter.ts?raw').then((m) => m.default)
    expect(src).not.toContain('dynamicKpi')
    expect(src).not.toContain('regionalWiring')
  })
})

describe('4D-C test 28: dynamicKpiRegionalWiring.test.ts was not modified in Phase 4D-C', async () => {
  it('dynamicKpiRegionalWiring.test.ts does not import from kpiUiAdapter', async () => {
    const src = await import('../regionalIntelligence/dynamicKpiRegionalWiring.test.ts?raw').then((m) => m.default)
    expect(src).not.toContain("from './kpiUiAdapter'")
  })

  it('getTargetFieldName is not called in dynamicKpiRegionalWiring.test.ts', async () => {
    const src = await import('../regionalIntelligence/dynamicKpiRegionalWiring.test.ts?raw').then((m) => m.default)
    expect(src).not.toContain('getTargetFieldName')
    expect(src).not.toContain('getActualFieldName')
  })
})
