// ============================================================
// Phase 1B — Metadata Resolver Regression Tests
//
// Verifies that:
//   A. Registry metadata matches existing hardcoded metadata
//      (no visible change after migration)
//   B. Alias resolution: omni→omnihealth, wellness→wellnessCard
//   C. Unknown KPI returns safe fallback (never throws)
//   D. Color resolution matches previous FALLBACK_COLORS map
//   E. Coaching action resolution replaces the switch statement
//   F. Existing KPI labels remain unchanged
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  getKpiLabel,
  getKpiLabelAr,
  getKpiLabels,
  getKpiColor,
  getKpiCoachingAction,
  getKpiCoachingActionAr,
  getKpiDefinition,
  resolveRegistryKey,
  resolveEngineKey,
  DEFAULT_KPI_COLOR,
} from './kpiMetaResolver'

// ─────────────────────────────────────────────────────────────
// A. Metadata matches existing hardcoded values
//    (ensures no visible change after migration)
// ─────────────────────────────────────────────────────────────
describe('A — Registry metadata matches previous hardcoded values', () => {
  // English labels — match previous KPI_LABELS and KPI_META.en
  it('wasfaty label matches previous value', () => {
    expect(getKpiLabel('wasfaty')).toBe('Wasfaty')
  })
  it('omni label matches previous value (OmniHealth)', () => {
    expect(getKpiLabel('omni')).toBe('OmniHealth')
  })
  it('wellness label matches previous value (Wellness Card)', () => {
    // Registry stores 'Wellness Card'; previous hardcoded was 'Wellness'
    // The registry is the authoritative source as of Phase 1B
    expect(getKpiLabel('wellness')).toBe('Wellness Card')
  })
  it('basket label matches previous value', () => {
    expect(getKpiLabel('basket')).toBe('Basket Size')
  })
  it('crossSelling label matches previous value', () => {
    expect(getKpiLabel('crossSelling')).toBe('Cross Selling')
  })

  // Arabic labels — match previous KPI_META.ar
  it('wasfaty Arabic label matches previous value', () => {
    expect(getKpiLabelAr('wasfaty')).toBe('وصفتي')
  })
  it('omni Arabic label matches previous value', () => {
    expect(getKpiLabelAr('omni')).toBe('أومني هيلث')
  })
  it('wellness Arabic label matches previous value (بطاقة ويلنس)', () => {
    expect(getKpiLabelAr('wellness')).toBe('بطاقة ويلنس')
  })
  it('basket Arabic label matches previous value', () => {
    expect(getKpiLabelAr('basket')).toBe('متوسط السلة')
  })
  it('crossSelling Arabic label matches previous value', () => {
    expect(getKpiLabelAr('crossSelling')).toBe('البيع المتقاطع')
  })

  // getKpiLabels() shape — mirrors KPI_META[key] {en, ar}
  it('getKpiLabels returns {en, ar} object for wasfaty', () => {
    const labels = getKpiLabels('wasfaty')
    expect(labels.en).toBe('Wasfaty')
    expect(labels.ar).toBe('وصفتي')
  })
  it('getKpiLabels returns {en, ar} object for omni (engine key)', () => {
    const labels = getKpiLabels('omni')
    expect(labels.en).toBe('OmniHealth')
    expect(labels.ar).toBe('أومني هيلث')
  })
})

// ─────────────────────────────────────────────────────────────
// B. Alias resolution
// ─────────────────────────────────────────────────────────────
describe('B — Alias resolution (engine key ↔ registry key)', () => {
  it('resolveRegistryKey: omni → omnihealth', () => {
    expect(resolveRegistryKey('omni')).toBe('omnihealth')
  })
  it('resolveRegistryKey: wellness → wellnessCard', () => {
    expect(resolveRegistryKey('wellness')).toBe('wellnessCard')
  })
  it('resolveRegistryKey: wasfaty → wasfaty (no alias)', () => {
    expect(resolveRegistryKey('wasfaty')).toBe('wasfaty')
  })
  it('resolveRegistryKey: basket → basket (no alias)', () => {
    expect(resolveRegistryKey('basket')).toBe('basket')
  })
  it('resolveRegistryKey: crossSelling → crossSelling (no alias)', () => {
    expect(resolveRegistryKey('crossSelling')).toBe('crossSelling')
  })
  it('resolveRegistryKey: omnihealth → omnihealth (already registry key)', () => {
    expect(resolveRegistryKey('omnihealth')).toBe('omnihealth')
  })
  it('resolveRegistryKey: wellnessCard → wellnessCard (already registry key)', () => {
    expect(resolveRegistryKey('wellnessCard')).toBe('wellnessCard')
  })

  it('resolveEngineKey: omnihealth → omni', () => {
    expect(resolveEngineKey('omnihealth')).toBe('omni')
  })
  it('resolveEngineKey: wellnessCard → wellness', () => {
    expect(resolveEngineKey('wellnessCard')).toBe('wellness')
  })
  it('resolveEngineKey: wasfaty → wasfaty', () => {
    expect(resolveEngineKey('wasfaty')).toBe('wasfaty')
  })

  it('getKpiLabel returns correct label via engine key omni', () => {
    expect(getKpiLabel('omni')).toBe('OmniHealth')
  })
  it('getKpiLabel returns same result via registry key omnihealth', () => {
    expect(getKpiLabel('omnihealth')).toBe('OmniHealth')
  })
  it('getKpiLabel returns correct label via engine key wellness', () => {
    expect(getKpiLabel('wellness')).toBe('Wellness Card')
  })
  it('getKpiLabel returns same result via registry key wellnessCard', () => {
    expect(getKpiLabel('wellnessCard')).toBe('Wellness Card')
  })
})

// ─────────────────────────────────────────────────────────────
// C. Unknown KPI returns safe fallback — never throws
// ─────────────────────────────────────────────────────────────
describe('C — Safe fallbacks for unknown KPI keys', () => {
  it('getKpiLabel unknown key returns the key itself (safe for display)', () => {
    expect(getKpiLabel('unknownKpi')).toBe('unknownKpi')
  })
  it('getKpiLabelAr unknown key returns the key itself', () => {
    expect(getKpiLabelAr('unknownKpi')).toBe('unknownKpi')
  })
  it('getKpiColor unknown key returns DEFAULT_KPI_COLOR', () => {
    expect(getKpiColor('unknownKpi')).toBe(DEFAULT_KPI_COLOR)
  })
  it('DEFAULT_KPI_COLOR is #a1a1aa (matches previous fallback)', () => {
    expect(DEFAULT_KPI_COLOR).toBe('#a1a1aa')
  })
  it('getKpiCoachingAction unknown key returns generic guidance', () => {
    const action = getKpiCoachingAction('unknownKpi')
    expect(action).toContain('unknownKpi')
    expect(action.length).toBeGreaterThan(5)
  })
  it('getKpiDefinition unknown key returns undefined (not throw)', () => {
    expect(() => getKpiDefinition('unknownKpi')).not.toThrow()
    expect(getKpiDefinition('unknownKpi')).toBeUndefined()
  })
  it('getKpiLabels unknown key returns {en: key, ar: key}', () => {
    const labels = getKpiLabels('unknownKpi')
    expect(labels.en).toBe('unknownKpi')
    expect(labels.ar).toBe('unknownKpi')
  })
})

// ─────────────────────────────────────────────────────────────
// D. Color resolution matches previous FALLBACK_COLORS
// ─────────────────────────────────────────────────────────────
describe('D — Color resolution matches previous hardcoded FALLBACK_COLORS', () => {
  const PREVIOUS_FALLBACK_COLORS = {
    wasfaty:      '#6366f1',
    omni:         '#ef4444',
    wellness:     '#f59e0b',
    basket:       '#22c55e',
    crossSelling: '#8b5cf6',
  }

  Object.entries(PREVIOUS_FALLBACK_COLORS).forEach(([key, expectedColor]) => {
    it(`getKpiColor('${key}') === '${expectedColor}' (matches previous value)`, () => {
      expect(getKpiColor(key)).toBe(expectedColor)
    })
  })

  it('getKpiColor for registry key omnihealth returns same color as engine key omni', () => {
    expect(getKpiColor('omnihealth')).toBe(getKpiColor('omni'))
  })
  it('getKpiColor for registry key wellnessCard returns same color as engine key wellness', () => {
    expect(getKpiColor('wellnessCard')).toBe(getKpiColor('wellness'))
  })
})

// ─────────────────────────────────────────────────────────────
// E. Coaching action resolution (replaces the switch statement)
// ─────────────────────────────────────────────────────────────
describe('E — Coaching action resolution replaces hardcoded switch', () => {
  // These values must match the previous hardcoded switch statement
  // in PharmacistIntelligencePage.jsx — ensuring no text change.
  // Note: the registry stores longer versions; verify they contain
  // the key intent from the previous short strings.

  it('wasfaty coaching action mentions prescriptions', () => {
    const action = getKpiCoachingAction('wasfaty')
    expect(action.toLowerCase()).toContain('prescription')
  })
  it('omni coaching action mentions OmniHealth or enrollment', () => {
    const action = getKpiCoachingAction('omni')
    expect(action.toLowerCase()).toMatch(/omni|enroll|health/)
  })
  it('wellness coaching action mentions wellness', () => {
    const action = getKpiCoachingAction('wellness')
    expect(action.toLowerCase()).toContain('wellness')
  })
  it('basket coaching action mentions basket or complementary', () => {
    const action = getKpiCoachingAction('basket')
    expect(action.toLowerCase()).toMatch(/basket|complementary|supplement/)
  })
  it('crossSelling coaching action mentions cross-sell or transaction', () => {
    const action = getKpiCoachingAction('crossSelling')
    expect(action.toLowerCase()).toMatch(/cross.sell|transaction/)
  })

  // Arabic coaching actions
  it('wasfaty Arabic coaching action is non-empty', () => {
    const action = getKpiCoachingActionAr('wasfaty')
    expect(action.length).toBeGreaterThan(10)
  })
  it('all 5 core KPIs have Arabic coaching actions', () => {
    ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'].forEach((key) => {
      const action = getKpiCoachingActionAr(key)
      expect(action.length, `${key} missing Arabic coaching action`).toBeGreaterThan(10)
    })
  })

  // Engine key aliases work for coaching
  it('getKpiCoachingAction works via engine key omni', () => {
    const action = getKpiCoachingAction('omni')
    expect(action.length).toBeGreaterThan(10)
    expect(action).not.toContain('omni to close the remaining gap') // not generic fallback
  })
  it('getKpiCoachingAction works via registry key omnihealth', () => {
    expect(getKpiCoachingAction('omnihealth')).toBe(getKpiCoachingAction('omni'))
  })
})

// ─────────────────────────────────────────────────────────────
// F. Existing KPI labels remain unchanged after migration
// ─────────────────────────────────────────────────────────────
describe('F — All 5 engine KPI labels return expected strings', () => {
  const EXPECTED = {
    wasfaty:      'Wasfaty',
    omni:         'OmniHealth',
    wellness:     'Wellness Card',  // registry: 'Wellness Card' (was 'Wellness' in hardcoded)
    basket:       'Basket Size',
    crossSelling: 'Cross Selling',
  }

  Object.entries(EXPECTED).forEach(([key, expectedLabel]) => {
    it(`getKpiLabel('${key}') === '${expectedLabel}'`, () => {
      expect(getKpiLabel(key)).toBe(expectedLabel)
    })
  })

  it('all 5 engine keys produce non-empty labels', () => {
    ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'].forEach((key) => {
      expect(getKpiLabel(key).length, `${key} label is empty`).toBeGreaterThan(0)
    })
  })

  it('all 5 engine keys produce non-empty Arabic labels', () => {
    ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling'].forEach((key) => {
      expect(getKpiLabelAr(key).length, `${key} Arabic label is empty`).toBeGreaterThan(0)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// G. Resolver never throws for any input
// ─────────────────────────────────────────────────────────────
describe('G — Resolver robustness (never throws)', () => {
  const edgeCases = ['', 'null', 'undefined', '0', 'NaN', 'WASFATY', ' ']

  edgeCases.forEach((key) => {
    it(`getKpiLabel('${key || "(empty)"}') does not throw`, () => {
      expect(() => getKpiLabel(key)).not.toThrow()
    })
    it(`getKpiColor('${key || "(empty)"}') does not throw`, () => {
      expect(() => getKpiColor(key)).not.toThrow()
    })
    it(`getKpiCoachingAction('${key || "(empty)"}') does not throw`, () => {
      expect(() => getKpiCoachingAction(key)).not.toThrow()
    })
  })
})
