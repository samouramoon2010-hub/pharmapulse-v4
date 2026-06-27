// ============================================================
// Milestone 3.5 — Dynamic KPI Registry Management Tests
//
// Tests:
//   A. KPI Catalog — lifecycle stage display in registry
//   B. Validation Engine — key uniqueness, isPrimary invariant,
//      lifecycle validity, lifecycle transition enforcement
//   C. Lifecycle Governance — canTransitionKpiLifecycle rules
//   D. buildDocPayloadSync — includes lifecycle/isPrimary/coaching
//   E. Audit trail — logKpiAudit function exists and is exported
//   F. Registry health — counts by lifecycle stage
//   G. RBAC — Firestore rules source contains kpi_audit_logs
//   H. KPI_AUDIT_LOGS constant exists in firebase COL
// ============================================================

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_KPI_REGISTRY,
} from '../../engine/kpiRegistry'
import {
  canTransitionKpiLifecycle,
} from '../../engine/kpiRegistry/kpiRegistryTypes'
import {
  buildDocPayloadSync,
  PROTECTED_CORE_KEYS,
} from '../../services/kpiRegistryLogic'
import type { KpiUiStatus } from '../../engine/kpiRegistry'
import {
  getProductionEvaluationKpis,
  getPilotTrackingKpis,
} from '../../engine/kpiRegistry/kpiMetaResolver'

// ─────────────────────────────────────────────────────────────
// A. KPI Catalog — all registry KPIs have lifecycleStage
// ─────────────────────────────────────────────────────────────
describe('A — KPI Catalog: lifecycle stage in registry', () => {
  const allKpis = Object.values(DEFAULT_KPI_REGISTRY)

  it('every KPI has a lifecycleStage field', () => {
    allKpis.forEach((kpi) => {
      expect(kpi.lifecycleStage, `${kpi.key} missing lifecycleStage`).toBeTruthy()
    })
  })

  it('insuranceConversion is pilot_tracking (visible in catalog)', () => {
    expect(DEFAULT_KPI_REGISTRY.insuranceConversion.lifecycleStage).toBe('pilot_tracking')
  })

  it('all core production KPIs are production_evaluation', () => {
    const production = getProductionEvaluationKpis()
    production.filter((k) => k.isCore).forEach((kpi) => {
      expect(kpi.lifecycleStage).toBe('production_evaluation')
    })
  })

  it('pilot KPI list returns insuranceConversion', () => {
    const pilots = getPilotTrackingKpis()
    expect(pilots.map((k) => k.key)).toContain('insuranceConversion')
  })

  it('catalog can filter by lifecycleStage', () => {
    const production = allKpis.filter((k) => k.lifecycleStage === 'production_evaluation')
    const pilot      = allKpis.filter((k) => k.lifecycleStage === 'pilot_tracking')
    const draft      = allKpis.filter((k) => k.lifecycleStage === 'draft')
    expect(production.length).toBeGreaterThan(0)
    expect(pilot.length).toBeGreaterThan(0)
    expect(draft.length).toBe(0) // no draft KPIs at Milestone 3
  })
})

// ─────────────────────────────────────────────────────────────
// B. Validation Engine
// ─────────────────────────────────────────────────────────────
describe('B — Validation Engine: isPrimary invariant', () => {
  it('exactly one KPI has isPrimary:true (invariant)', () => {
    const primaries = Object.values(DEFAULT_KPI_REGISTRY).filter((k) => k.isPrimary)
    expect(primaries).toHaveLength(1)
    expect(primaries[0].key).toBe('wasfaty')
  })

  it('primary KPI is production_evaluation (not pilot)', () => {
    const primary = Object.values(DEFAULT_KPI_REGISTRY).find((k) => k.isPrimary)
    expect(primary?.lifecycleStage).toBe('production_evaluation')
  })

  it('insuranceConversion isPrimary is false', () => {
    expect(DEFAULT_KPI_REGISTRY.insuranceConversion.isPrimary).toBe(false)
  })

  it('protected core keys cannot be archived', () => {
    PROTECTED_CORE_KEYS.forEach((key) => {
      expect(DEFAULT_KPI_REGISTRY[key]).toBeDefined()
      expect(DEFAULT_KPI_REGISTRY[key].isCore).toBe(true)
    })
  })
})

describe('B — Validation Engine: lifecycle validity', () => {
  const validStages = ['draft','pilot_tracking','shadow_evaluation','production_evaluation','archived']

  it('all registry KPIs have a valid lifecycleStage', () => {
    Object.values(DEFAULT_KPI_REGISTRY).forEach((kpi) => {
      expect(validStages, `${kpi.key} has invalid lifecycleStage: ${kpi.lifecycleStage}`)
        .toContain(kpi.lifecycleStage)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// C. Lifecycle Governance
// ─────────────────────────────────────────────────────────────
describe('C — Lifecycle Governance: transition rules', () => {
  // Allowed
  it('ALLOWED: draft → pilot_tracking', () => expect(canTransitionKpiLifecycle('draft','pilot_tracking')).toBe(true))
  it('ALLOWED: pilot_tracking → shadow_evaluation', () => expect(canTransitionKpiLifecycle('pilot_tracking','shadow_evaluation')).toBe(true))
  it('ALLOWED: shadow_evaluation → production_evaluation', () => expect(canTransitionKpiLifecycle('shadow_evaluation','production_evaluation')).toBe(true))
  it('ALLOWED: production_evaluation → archived', () => expect(canTransitionKpiLifecycle('production_evaluation','archived')).toBe(true))
  it('ALLOWED: archived → pilot_tracking (re-activation)', () => expect(canTransitionKpiLifecycle('archived','pilot_tracking')).toBe(true))
  it('ALLOWED: shadow_evaluation → pilot_tracking (demote)', () => expect(canTransitionKpiLifecycle('shadow_evaluation','pilot_tracking')).toBe(true))

  // Blocked
  it('BLOCKED: pilot_tracking → production_evaluation (must pass shadow)', () => expect(canTransitionKpiLifecycle('pilot_tracking','production_evaluation')).toBe(false))
  it('BLOCKED: draft → production_evaluation (must pass pilot + shadow)', () => expect(canTransitionKpiLifecycle('draft','production_evaluation')).toBe(false))
  it('BLOCKED: archived → production_evaluation', () => expect(canTransitionKpiLifecycle('archived','production_evaluation')).toBe(false))
  it('BLOCKED: production_evaluation → draft', () => expect(canTransitionKpiLifecycle('production_evaluation','draft')).toBe(false))
  it('BLOCKED: no-op same stage', () => {
    expect(canTransitionKpiLifecycle('pilot_tracking','pilot_tracking')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// D. buildDocPayloadSync includes all new fields
// ─────────────────────────────────────────────────────────────
describe('D — buildDocPayloadSync includes lifecycle/governance fields', () => {
  const kpi    = DEFAULT_KPI_REGISTRY.wasfaty
  const status: KpiUiStatus = 'ACTIVE'
  const payload = buildDocPayloadSync(kpi, status, 'test-actor')

  it('includes lifecycleStage', () => {
    expect(payload.lifecycleStage).toBe('production_evaluation')
  })

  it('includes isPrimary', () => {
    expect(payload.isPrimary).toBe(true)
  })

  it('includes coachingAction', () => {
    expect(typeof payload.coachingAction).toBe('string')
    expect((payload.coachingAction as string).length).toBeGreaterThan(0)
  })

  it('includes coachingActionAr', () => {
    expect(typeof payload.coachingActionAr).toBe('string')
    expect((payload.coachingActionAr as string).length).toBeGreaterThan(0)
  })

  it('includes description', () => {
    expect(typeof payload.description).toBe('string')
  })

  it('pilot KPI payload has lifecycleStage:pilot_tracking', () => {
    const ins = DEFAULT_KPI_REGISTRY.insuranceConversion
    const p   = buildDocPayloadSync(ins, 'ACTIVE', 'test')
    expect(p.lifecycleStage).toBe('pilot_tracking')
    expect(p.isPrimary).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// E. Audit trail — logKpiAudit export exists
// ─────────────────────────────────────────────────────────────
describe('E — Audit trail: logKpiAudit and transitionKpiLifecycle exported', () => {
  it('kpiRegistryService source exports logKpiAudit function', async () => {
    const src = (await import('../../services/kpiRegistryService.ts?raw')).default
    expect(src).toContain('export async function logKpiAudit')
  })

  it('kpiRegistryService source exports transitionKpiLifecycle function', async () => {
    const src = (await import('../../services/kpiRegistryService.ts?raw')).default
    expect(src).toContain('export async function transitionKpiLifecycle')
  })

  it('transitionKpiLifecycle source enforces canTransitionKpiLifecycle', async () => {
    const src = (await import('../../services/kpiRegistryService.ts?raw')).default
    expect(src).toContain('canTransitionKpiLifecycle')
    expect(src).toContain('logKpiAudit')
  })

  it('logKpiAudit writes to KPI_AUDIT_LOGS collection', async () => {
    const src = (await import('../../services/kpiRegistryService.ts?raw')).default
    expect(src).toContain('COL.KPI_AUDIT_LOGS')
  })

  it('audit entry includes kpiKey, action, changedBy, changedAt', async () => {
    const src = (await import('../../services/kpiRegistryService.ts?raw')).default
    expect(src).toContain('kpiKey:')
    expect(src).toContain('action:')
    expect(src).toContain('changedBy:')
    expect(src).toContain('changedAt: serverTimestamp()')
  })
})

// ─────────────────────────────────────────────────────────────
// F. Registry health — lifecycle counts
// ─────────────────────────────────────────────────────────────
describe('F — Registry health dashboard', () => {
  const allKpis = Object.values(DEFAULT_KPI_REGISTRY)

  it('can count KPIs by lifecycle stage', () => {
    const counts = { draft:0, pilot_tracking:0, shadow_evaluation:0, production_evaluation:0, archived:0 }
    allKpis.forEach((kpi) => {
      const stage = kpi.lifecycleStage ?? 'production_evaluation'
      if (stage in counts) counts[stage as keyof typeof counts]++
    })
    expect(counts.production_evaluation).toBeGreaterThan(0)
    expect(counts.pilot_tracking).toBe(1)  // insuranceConversion
    expect(counts.draft).toBe(0)
    expect(counts.archived).toBe(0)
  })

  it('health dashboard component exists in KpiManagementPage', async () => {
    const src = (await import('../../pages/admin/KpiManagementPage.jsx?raw')).default
    expect(src).toContain('healthStats')
    expect(src).toContain('pilot_tracking')
    // PR-1C: the flat "Validation Warnings" list was split into grouped
    // Blockers / Recommendations sections.
    expect(src).toContain('Blockers')
    expect(src).toContain('Recommendations')
  })

  it('health counts include total KPI count', async () => {
    const src = (await import('../../pages/admin/KpiManagementPage.jsx?raw')).default
    expect(src).toContain('allKpis.length')
  })
})

// ─────────────────────────────────────────────────────────────
// G. RBAC — Firestore rules
// ─────────────────────────────────────────────────────────────
describe('G — RBAC: Firestore rules', () => {
  it('firestore.rules contains kpi_audit_logs collection', async () => {
    const src = (await import('../../../firestore.rules?raw')).default
    expect(src).toContain('kpi_audit_logs')
  })

  it('kpi_audit_logs allows only admin reads', async () => {
    const src = (await import('../../../firestore.rules?raw')).default
    const idx = src.indexOf('kpi_audit_logs')
    const block = src.slice(idx, idx + 600)
    expect(block).toContain('isAdmin()')
    expect(block).toContain('allow read: if isAdmin()')
  })

  it('kpi_audit_logs blocks updates and deletes', async () => {
    const src = (await import('../../../firestore.rules?raw')).default
    const idx = src.indexOf('kpi_audit_logs')
    const block = src.slice(idx, idx + 900)
    expect(block).toContain('update: if false')
    expect(block).toContain('delete: if false')
  })

  it('kpi_registry update rule enforces key immutability', async () => {
    const src = (await import('../../../firestore.rules?raw')).default
    const idx = src.indexOf('match /kpi_registry/{kpiKey}')
    const block = src.slice(idx, idx + 900)
    expect(block).toContain('isAdmin()')
    expect(block).toContain('request.resource.data.key == resource.data.key')  // key immutability
  })
})

// ─────────────────────────────────────────────────────────────
// H. KPI_AUDIT_LOGS constant
// ─────────────────────────────────────────────────────────────
describe('H — KPI_AUDIT_LOGS COL constant', () => {
  it('COL.KPI_AUDIT_LOGS is defined in firebase.js', async () => {
    const src = (await import('../../services/firebase.js?raw')).default
    expect(src).toContain('KPI_AUDIT_LOGS')
    expect(src).toContain("'kpi_audit_logs'")
  })

  it('KpiEditorModal includes lifecycle stage selector', async () => {
    const src = (await import('../../components/admin/kpi/KpiEditorModal.jsx?raw')).default
    expect(src).toContain('lifecycleStage')
    expect(src).toContain('pilot_tracking')
    expect(src).toContain('shadow_evaluation')
  })

  it('KpiEditorModal includes coachingAction fields', async () => {
    const src = (await import('../../components/admin/kpi/KpiEditorModal.jsx?raw')).default
    expect(src).toContain('coachingAction')
    expect(src).toContain('coachingActionAr')
  })

  it('KpiRegistryTable shows Lifecycle Stage column', async () => {
    const src = (await import('../../components/admin/kpi/KpiRegistryTable.jsx?raw')).default
    expect(src).toContain('Lifecycle Stage')
    expect(src).toContain('lifecycleStage')
  })
})
