// ============================================================
// Dynamic KPI Target Visibility — Regression Tests
//
// Root cause fixed:
//   KpiEditorModal.defaultForm() had targetInputEnabled:false.
//   Any new KPI created via Admin UI silently excluded from
//   Targets page because getTargetInputConfigs requires either
//   isCore:true OR visibility.targetInputEnabled:true.
//
// Fix: defaultForm() now sets targetInputEnabled:true.
//
// Tests:
//   1. defaultForm() sets targetInputEnabled:true
//   2. New KPI with targetInputEnabled:true appears in getTargetInputConfigs
//   3. New KPI with targetInputEnabled:false is excluded
//   4. getTargetFieldName('testDynamicKpi') → 'testDynamicKpiTarget'
//   5. Dynamic target save payload supports testDynamicKpiTarget
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  getTargetInputConfigs,
  getTargetFieldName,
  buildTargetPayload,
} from '../../engine/kpiRegistry/kpiUiAdapter'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import type { KpiDefinition } from '../../engine/kpiRegistry'

// ── Helper: build a minimal valid KpiDefinition for testDynamicKpi ──
function makeTestKpi(targetInputEnabled: boolean): KpiDefinition {
  return {
    key:        'testDynamicKpi',
    label:      'Test Dynamic KPI',
    shortLabel: 'TestKPI',
    labelAr:    'مؤشر تجريبي',
    category:   'commercial',
    valueType:  'count',
    unit:       'units',
    unitAr:     'وحدة',
    direction:  'higher_is_better',
    targetType: 'absolute',
    weight:     0,
    isActive:   true,
    isCore:     false,           // not a core KPI — relies on targetInputEnabled
    thresholds: { healthy: 90, watch: 70, risk: 50, critical: 30 },
    visibility: {
      dashboardEnabled:   true,
      teamEnabled:        false,
      executiveEnabled:   false,
      regionalEnabled:    false,
      targetInputEnabled,        // the field under test
    },
    sortOrder:        110,
    description:      'A dynamically created test KPI.',
    lifecycleStage:   'pilot_tracking',
    isPrimary:        false,
    coachingAction:   'Focus on test KPI.',
    coachingActionAr: 'ركز على المؤشر التجريبي.',
  }
}

// ── Test registry helpers ────────────────────────────────────
function registryWith(kpi: KpiDefinition) {
  return { ...DEFAULT_KPI_REGISTRY, [kpi.key]: kpi }
}

// ─────────────────────────────────────────────────────────────
// Test 1: defaultForm() sets targetInputEnabled:true
// ─────────────────────────────────────────────────────────────
describe('1 — KpiEditorModal defaultForm sets targetInputEnabled:true', () => {
  it('defaultForm visibility.targetInputEnabled is true', async () => {
    const src = (await import('../../components/admin/kpi/KpiEditorModal.jsx?raw')).default
    // Find the defaultForm function and verify the default value
    const idx = src.indexOf('function defaultForm()')
    const block = src.slice(idx, idx + 600)
    expect(block).toContain('targetInputEnabled:true')
    expect(block).not.toContain('targetInputEnabled:false')
  })

  it('defaultForm does not disable targetInputEnabled by default', async () => {
    const src = (await import('../../components/admin/kpi/KpiEditorModal.jsx?raw')).default
    // Ensure the ONLY false value in defaultForm for targetInputEnabled is gone
    const idx = src.indexOf('function defaultForm()')
    const block = src.slice(idx, idx + 600)
    // dashboardEnabled:true must still be present
    expect(block).toContain('dashboardEnabled:true')
    // targetInputEnabled must now be true in defaultForm
    expect(block).toContain('targetInputEnabled:true')
  })
})

// ─────────────────────────────────────────────────────────────
// Test 2: New KPI with targetInputEnabled:true appears in
//         getTargetInputConfigs
// ─────────────────────────────────────────────────────────────
describe('2 — New KPI with targetInputEnabled:true appears in getTargetInputConfigs', () => {
  const kpi      = makeTestKpi(true)
  const registry = registryWith(kpi)
  const configs  = getTargetInputConfigs(registry)
  const keys     = configs.map((c) => c.key)

  it('testDynamicKpi appears in getTargetInputConfigs output', () => {
    expect(keys).toContain('testDynamicKpi')
  })

  it('testDynamicKpi isVisibleForTargetInput is true', () => {
    const cfg = configs.find((c) => c.key === 'testDynamicKpi')
    expect(cfg).toBeDefined()
    expect(cfg!.isVisibleForTargetInput).toBe(true)
  })

  it('testDynamicKpi has correct targetFieldName', () => {
    const cfg = configs.find((c) => c.key === 'testDynamicKpi')
    expect(cfg!.targetFieldName).toBe('testDynamicKpiTarget')
  })

  it('testDynamicKpi has correct label', () => {
    const cfg = configs.find((c) => c.key === 'testDynamicKpi')
    expect(cfg!.label).toBe('Test Dynamic KPI')
  })

  it('all 5 core KPIs still appear alongside testDynamicKpi', () => {
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('omnihealth')
    expect(keys).toContain('wellnessCard')
    expect(keys).toContain('basket')
    expect(keys).toContain('crossSelling')
  })
})

// ─────────────────────────────────────────────────────────────
// Test 3: New KPI with targetInputEnabled:false is excluded
// ─────────────────────────────────────────────────────────────
describe('3 — New KPI with targetInputEnabled:false is excluded from getTargetInputConfigs', () => {
  const kpi      = makeTestKpi(false)
  const registry = registryWith(kpi)
  const configs  = getTargetInputConfigs(registry)
  const keys     = configs.map((c) => c.key)

  it('testDynamicKpi is NOT in getTargetInputConfigs when targetInputEnabled:false', () => {
    expect(keys).not.toContain('testDynamicKpi')
  })

  it('core KPIs still appear when testDynamicKpi is excluded', () => {
    expect(keys).toContain('wasfaty')
    expect(keys).toContain('basket')
    expect(keys).toContain('crossSelling')
  })

  it('explicit false correctly disables target input (admin can still turn it off)', () => {
    const cfg = configs.find((c) => c.key === 'testDynamicKpi')
    expect(cfg).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// Test 4: getTargetFieldName('testDynamicKpi') → 'testDynamicKpiTarget'
// ─────────────────────────────────────────────────────────────
describe('4 — getTargetFieldName dynamic fallback for new KPIs', () => {
  it("getTargetFieldName('testDynamicKpi') returns 'testDynamicKpiTarget'", () => {
    expect(getTargetFieldName('testDynamicKpi')).toBe('testDynamicKpiTarget')
  })

  it('dynamic fallback uses camelCase key + Target suffix', () => {
    expect(getTargetFieldName('insuranceConversion')).toBe('insuranceConversionTarget')
    expect(getTargetFieldName('selfMedication')).toBe('selfMedicationTarget')
    expect(getTargetFieldName('npsScore')).toBe('npsScoreTarget')
  })

  it('core KPIs still resolve via static TARGET_FIELD_MAP', () => {
    // Static map entries take precedence over dynamic fallback
    expect(getTargetFieldName('wasfaty')).toBe('wasfatyTarget')
    expect(getTargetFieldName('omnihealth')).toBe('omniTarget')
    expect(getTargetFieldName('wellnessCard')).toBe('wellnessTarget')
    expect(getTargetFieldName('basket')).toBe('basketTarget')
    expect(getTargetFieldName('crossSelling')).toBe('crossSellTarget')
  })
})

// ─────────────────────────────────────────────────────────────
// Test 5: Dynamic target save payload supports testDynamicKpiTarget
// ─────────────────────────────────────────────────────────────
describe('5 — Dynamic target save payload includes testDynamicKpiTarget', () => {
  const kpi      = makeTestKpi(true)
  const registry = registryWith(kpi)
  const configs  = getTargetInputConfigs(registry)

  it('buildTargetPayload includes testDynamicKpiTarget field', () => {
    // Simulate form values with testDynamicKpiTarget set to 100
    const formValues: Record<string, number> = {
      wasfatyTarget:          500,
      omniTarget:             300,
      wellnessTarget:         200,
      basketTarget:           150,
      crossSellTarget:        100,
      insuranceConversionTarget: 50,
      testDynamicKpiTarget:   100,   // the new dynamic target
    }
    const payload = buildTargetPayload('pharm-001', '2025-06', formValues, configs)
    expect(payload).toHaveProperty('testDynamicKpiTarget', 100)
  })

  it('buildTargetPayload includes all core target fields', () => {
    const formValues: Record<string, number> = {
      wasfatyTarget: 500, omniTarget: 300, wellnessTarget: 200,
      basketTarget: 150, crossSellTarget: 100, testDynamicKpiTarget: 50,
    }
    const payload = buildTargetPayload('pharm-001', '2025-06', formValues, configs)
    expect(payload).toHaveProperty('wasfatyTarget')
    expect(payload).toHaveProperty('omniTarget')
    expect(payload).toHaveProperty('wellnessTarget')
    expect(payload).toHaveProperty('basketTarget')
    expect(payload).toHaveProperty('crossSellTarget')
  })

  it('testDynamicKpiTarget value is correctly sanitised in payload', () => {
    const formValues: Record<string, number> = { testDynamicKpiTarget: 75.5 }
    const payload = buildTargetPayload('pharm-001', '2025-06', formValues, configs)
    // buildTargetPayload sanitises: floors/rounds or keeps numeric
    expect(typeof payload.testDynamicKpiTarget).toBe('number')
    expect(payload.testDynamicKpiTarget).toBeGreaterThanOrEqual(0)
  })

  it('TargetsPage save uses targetInputConfigs.map(c => c.targetFieldName) dynamically', async () => {
    // Verify TargetsPage builds save payload from configs, not hardcoded fields
    const src = (await import('../../pages/shared/TargetsPage.jsx?raw')).default
    expect(src).toContain('targetInputConfigs.map(c => [c.targetFieldName,')
    // Must NOT have hardcoded target field names in the save path
    expect(src).not.toContain("'wasfatyTarget': ")
    expect(src).not.toContain("'omniTarget': ")
  })
})
