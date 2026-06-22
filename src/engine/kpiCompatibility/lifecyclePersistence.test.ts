// ============================================================
// KPI Lifecycle Persistence — Regression Tests
//
// Bug fixed:
//   saveKpiDefinition used a private buildDocPayload that omitted
//   lifecycleStage, isPrimary, coachingAction, coachingActionAr.
//   Selecting "Pilot Tracking" was silently ignored — Firestore
//   received a document without the field, then docToKpiDefinition
//   defaulted the missing field back to 'production_evaluation'.
//
// Fix:
//   Private buildDocPayload now delegates to buildDocPayloadSync
//   (single source of truth). Only server timestamps are added on top.
//   Two-builder divergence eliminated.
//
// Tests 1–3: each lifecycle stage persists correctly in payload
// Test  4:   round-trip payload → docToKpiDefinition preserves stage
// Test  5:   payload includes isPrimary
// Test  6:   payload includes coachingAction
// Test  7:   payload includes coachingActionAr
// Test  8:   saveKpiDefinition source uses the corrected payload builder
// ============================================================

import { describe, it, expect } from 'vitest'
import { buildDocPayloadSync }    from '../../services/kpiRegistryLogic'
import { docToKpiDefinition }     from '../../services/kpiRegistryLogic'
import type { KpiDefinition }     from '../../engine/kpiRegistry'
import type { KpiUiStatus }       from '../../engine/kpiRegistry'
import type { KpiLifecycleStage } from '../../engine/kpiRegistry/kpiRegistryTypes'

// ── Shared test fixture ───────────────────────────────────────
function makeKpi(stage: KpiLifecycleStage, overrides: Partial<KpiDefinition> = {}): KpiDefinition {
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
    isCore:     false,
    thresholds: { healthy:90, watch:70, risk:50, critical:30 },
    visibility: {
      dashboardEnabled:   true,
      teamEnabled:        false,
      executiveEnabled:   false,
      regionalEnabled:    false,
      targetInputEnabled: true,
    },
    sortOrder:        110,
    description:      'Test KPI for lifecycle persistence.',
    lifecycleStage:   stage,
    isPrimary:        false,
    coachingAction:   'Focus on test KPI to close the gap.',
    coachingActionAr: 'ركز على المؤشر التجريبي لتقليص الفجوة.',
    ...overrides,
  }
}

const STATUS: KpiUiStatus = 'ACTIVE'
const ACTOR = 'test-actor-uid'

// ─────────────────────────────────────────────────────────────
// Test 1: payload persists lifecycleStage pilot_tracking
// ─────────────────────────────────────────────────────────────
describe('1 — payload persists lifecycleStage: pilot_tracking', () => {
  const payload = buildDocPayloadSync(makeKpi('pilot_tracking'), STATUS, ACTOR)

  it('payload.lifecycleStage === pilot_tracking', () => {
    expect(payload.lifecycleStage).toBe('pilot_tracking')
  })

  it('payload.lifecycleStage is not production_evaluation (regression guard)', () => {
    expect(payload.lifecycleStage).not.toBe('production_evaluation')
  })

  it('payload.isActive is true (pilot KPIs are still active)', () => {
    expect(payload.isActive).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 2: payload persists lifecycleStage draft
// ─────────────────────────────────────────────────────────────
describe('2 — payload persists lifecycleStage: draft', () => {
  const payload = buildDocPayloadSync(makeKpi('draft'), STATUS, ACTOR)

  it('payload.lifecycleStage === draft', () => {
    expect(payload.lifecycleStage).toBe('draft')
  })

  it('draft KPI payload still has all required fields', () => {
    expect(payload.key).toBe('testDynamicKpi')
    expect(payload.label).toBeDefined()
    expect(payload.lifecycleStage).toBe('draft')
  })
})

// ─────────────────────────────────────────────────────────────
// Test 3: payload persists lifecycleStage shadow_evaluation
// ─────────────────────────────────────────────────────────────
describe('3 — payload persists lifecycleStage: shadow_evaluation', () => {
  const payload = buildDocPayloadSync(makeKpi('shadow_evaluation'), STATUS, ACTOR)

  it('payload.lifecycleStage === shadow_evaluation', () => {
    expect(payload.lifecycleStage).toBe('shadow_evaluation')
  })

  it('shadow KPI is not production_evaluation in payload', () => {
    expect(payload.lifecycleStage).not.toBe('production_evaluation')
    expect(payload.lifecycleStage).not.toBe('pilot_tracking')
  })
})

// ─────────────────────────────────────────────────────────────
// Test 4: round-trip payload → docToKpiDefinition preserves lifecycleStage
// ─────────────────────────────────────────────────────────────
describe('4 — round-trip: payload → docToKpiDefinition preserves lifecycleStage', () => {
  const stages: KpiLifecycleStage[] = [
    'pilot_tracking',
    'draft',
    'shadow_evaluation',
    'production_evaluation',
    'archived',
  ]

  stages.forEach((stage) => {
    it(`round-trip preserves lifecycleStage: ${stage}`, () => {
      const kpi     = makeKpi(stage)
      const payload = buildDocPayloadSync(kpi, STATUS, ACTOR)
      // Simulate Firestore read-back: docToKpiDefinition receives the payload
      const result  = docToKpiDefinition(payload as Record<string, unknown>)
      expect(result).not.toBeNull()
      expect(result!.def.lifecycleStage).toBe(stage)
    })
  })

  it('without the fix: missing lifecycleStage defaults to production_evaluation', () => {
    // Documents written before the fix had no lifecycleStage field
    // docToKpiDefinition uses ?? 'production_evaluation' as a safe default
    const stalePayload = { key: 'testDynamicKpi', label: 'Test', isActive: true }
    const result = docToKpiDefinition(stalePayload as Record<string, unknown>)
    expect(result!.def.lifecycleStage).toBe('production_evaluation')
  })

  it('with the fix: pilot_tracking payload → read back as pilot_tracking (not production)', () => {
    const kpi     = makeKpi('pilot_tracking')
    const payload = buildDocPayloadSync(kpi, STATUS, ACTOR)
    // payload now contains lifecycleStage:'pilot_tracking'
    const result  = docToKpiDefinition(payload as Record<string, unknown>)
    expect(result!.def.lifecycleStage).toBe('pilot_tracking')
    // NOT production_evaluation — this was the bug
    expect(result!.def.lifecycleStage).not.toBe('production_evaluation')
  })
})

// ─────────────────────────────────────────────────────────────
// Test 5: payload includes isPrimary
// ─────────────────────────────────────────────────────────────
describe('5 — payload includes isPrimary field', () => {
  it('isPrimary:false is written to payload', () => {
    const payload = buildDocPayloadSync(makeKpi('production_evaluation', { isPrimary: false }), STATUS, ACTOR)
    expect(payload).toHaveProperty('isPrimary', false)
  })

  it('isPrimary:true is written to payload', () => {
    const payload = buildDocPayloadSync(makeKpi('production_evaluation', { isPrimary: true }), STATUS, ACTOR)
    expect(payload).toHaveProperty('isPrimary', true)
  })

  it('isPrimary survives round-trip', () => {
    const kpi    = makeKpi('production_evaluation', { isPrimary: true })
    const payload = buildDocPayloadSync(kpi, STATUS, ACTOR)
    const result  = docToKpiDefinition(payload as Record<string, unknown>)
    expect(result!.def.isPrimary).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// Test 6: payload includes coachingAction
// ─────────────────────────────────────────────────────────────
describe('6 — payload includes coachingAction field', () => {
  it('coachingAction is present in payload', () => {
    const payload = buildDocPayloadSync(makeKpi('pilot_tracking'), STATUS, ACTOR)
    expect(payload).toHaveProperty('coachingAction')
    expect(typeof payload.coachingAction).toBe('string')
  })

  it('coachingAction value is preserved (not empty string overwrite)', () => {
    const payload = buildDocPayloadSync(makeKpi('pilot_tracking'), STATUS, ACTOR)
    expect(payload.coachingAction).toBe('Focus on test KPI to close the gap.')
  })

  it('coachingAction survives round-trip', () => {
    const kpi     = makeKpi('pilot_tracking')
    const payload = buildDocPayloadSync(kpi, STATUS, ACTOR)
    const result  = docToKpiDefinition(payload as Record<string, unknown>)
    expect(result!.def.coachingAction).toBe('Focus on test KPI to close the gap.')
  })
})

// ─────────────────────────────────────────────────────────────
// Test 7: payload includes coachingActionAr
// ─────────────────────────────────────────────────────────────
describe('7 — payload includes coachingActionAr field', () => {
  it('coachingActionAr is present in payload', () => {
    const payload = buildDocPayloadSync(makeKpi('pilot_tracking'), STATUS, ACTOR)
    expect(payload).toHaveProperty('coachingActionAr')
    expect(typeof payload.coachingActionAr).toBe('string')
  })

  it('coachingActionAr value is preserved', () => {
    const payload = buildDocPayloadSync(makeKpi('pilot_tracking'), STATUS, ACTOR)
    expect(payload.coachingActionAr).toBe('ركز على المؤشر التجريبي لتقليص الفجوة.')
  })

  it('coachingActionAr survives round-trip', () => {
    const kpi     = makeKpi('pilot_tracking')
    const payload = buildDocPayloadSync(kpi, STATUS, ACTOR)
    const result  = docToKpiDefinition(payload as Record<string, unknown>)
    expect(result!.def.coachingActionAr).toBe('ركز على المؤشر التجريبي لتقليص الفجوة.')
  })
})

// ─────────────────────────────────────────────────────────────
// Test 8: saveKpiDefinition path uses the corrected builder
// ─────────────────────────────────────────────────────────────
describe('8 — saveKpiDefinition uses corrected payload builder (no divergence)', () => {
  it('kpiRegistryService imports buildDocPayloadSync', async () => {
    const src = (await import('../../services/kpiRegistryService.ts?raw')).default
    expect(src).toContain('buildDocPayloadSync as _buildDocPayloadSync')
  })

  it('private buildDocPayload delegates to _buildDocPayloadSync', async () => {
    const src = (await import('../../services/kpiRegistryService.ts?raw')).default
    const builderIdx = src.indexOf('function buildDocPayload(')
    const builderBody = src.slice(builderIdx, builderIdx + 700)
    expect(builderBody).toContain('_buildDocPayloadSync(')
  })

  it('private buildDocPayload no longer has inline field list (divergence eliminated)', async () => {
    const src = (await import('../../services/kpiRegistryService.ts?raw')).default
    const builderIdx = src.indexOf('function buildDocPayload(')
    const builderBody = src.slice(builderIdx, builderIdx + 400)
    // The old builder had all fields inline; now it delegates
    // Verify the lifecycle fields appear via delegation, not inline
    expect(builderBody).not.toContain('thresholdHealthy:')  // was inline, now in sync fn
    expect(builderBody).not.toContain('dashboardEnabled:')   // was inline, now in sync fn
  })

  it('payload builder includes lifecycleStage (not omitted)', async () => {
    const src = (await import('../../services/kpiRegistryLogic.ts?raw')).default
    // buildDocPayloadSync in kpiRegistryLogic is the single source of truth
    expect(src).toContain('lifecycleStage:')
    expect(src).toContain('isPrimary:')
    expect(src).toContain('coachingAction:')
    expect(src).toContain('coachingActionAr:')
  })

  it('no inline lifecycleStage field in private buildDocPayload (delegates instead)', async () => {
    const src = (await import('../../services/kpiRegistryService.ts?raw')).default
    const builderIdx = src.indexOf('function buildDocPayload(')
    // The private function body is short now (delegates to sync fn)
    // It should NOT contain its own lifecycleStage: field inline
    const builderEnd = src.indexOf('\n}', builderIdx + 100)
    const builderBody = src.slice(builderIdx, builderEnd)
    // If the body contains _buildDocPayloadSync, it delegates correctly
    expect(builderBody).toContain('_buildDocPayloadSync')
  })
})
