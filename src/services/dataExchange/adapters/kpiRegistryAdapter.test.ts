import { describe, it, expect, vi, beforeEach } from 'vitest'

const setDocCalls: Array<{ id: string; data: Record<string, unknown> }> = []
const addDocCalls: Array<{ data: Record<string, unknown> }> = []
const registryDocs = new Map<string, Record<string, unknown>>()

vi.mock('../../firebase', () => ({
  db: {}, auth: { currentUser: { uid: 'admin-1' } },
  COL: { KPI_REGISTRY: 'kpi_registry', KPI_AUDIT_LOGS: 'kpi_audit_logs', AUDIT_LOGS: 'audit_logs' },
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db, _col, id) => ({ id })),
  setDoc: vi.fn(async (ref: { id: string }, data: Record<string, unknown>) => {
    setDocCalls.push({ id: ref.id, data })
    registryDocs.set(ref.id, { ...(registryDocs.get(ref.id) ?? {}), ...data })
  }),
  getDoc: vi.fn(async (ref: { id: string }) => {
    const data = registryDocs.get(ref.id)
    return { exists: () => data != null, data: () => data, id: ref.id }
  }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  addDoc: vi.fn(async (_ref, data) => { addDocCalls.push({ data }); return { id: 'audit-1' } }),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../../auditService', () => ({
  logAction: vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
}))

import { createKpiRegistryAdapter } from './kpiRegistryAdapter'
import { createImportJob, runValidation, commitJob } from '../importJobEngine'
import { DEFAULT_KPI_REGISTRY } from '../../../engine/kpiRegistry'
import type { KpiRegistry } from '../../../engine/kpiRegistry'
import type { ImportValidationContext, ImportAuthorizationContext } from '../importDomainAdapter'

const vCtx: ImportValidationContext = { actorUid: 'admin-1', actorRole: 'admin' }
const aCtx: ImportAuthorizationContext = { actorUid: 'admin-1', actorRole: 'admin' }
const ctx = { actorUid: 'admin-1', actorRole: 'admin', jobId: 'job-1' }

beforeEach(() => { setDocCalls.length = 0; addDocCalls.length = 0; registryDocs.clear() })

async function runRow(registry: KpiRegistry, row: Record<string, unknown>, actorRole = 'admin') {
  const adapter = createKpiRegistryAdapter({ actorRole, existingRegistry: registry })
  const raw = adapter.parseRow(row, 1, { domain: 'KPI_REGISTRY' })
  const job0 = createImportJob({ jobId: 'job-1', domain: 'KPI_REGISTRY', createdBy: 'admin-1' })
  const { job, rows } = await runValidation(job0, adapter, [raw], { ...vCtx, actorRole }, { ...aCtx, actorRole })
  return { adapter, job, row: rows[0] }
}

describe('DX-4 — KPI Registry adapter', () => {
  it('stages a valid new KPI as VALID and commits it', async () => {
    const { adapter, job, row } = await runRow({}, {
      'kpi key': 'inboundCalls', 'kpi name english': 'Inbound Calls', 'kpi name arabic': 'المكالمات الواردة',
      unit: 'calls', category: 'operational', direction: 'higher_is_better',
      'lifecycle stage': 'pilot_tracking', 'target enabled': 'true', active: 'true',
    })
    expect(row.classification).toBe('VALID')
    const { result } = await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    expect(result.committed).toBe(1)
    expect(setDocCalls[0].id).toBe('inboundCalls')
    expect(setDocCalls[0].data).toMatchObject({ key: 'inboundCalls', label: 'Inbound Calls', isCore: false, weight: 0 })
  })

  it('a safe metadata-only change on an existing KPI classifies as UPDATE and commits', async () => {
    const registry: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, custom1: {
      ...DEFAULT_KPI_REGISTRY.sales, key: 'custom1', label: 'Old Label', isCore: false,
    } }
    const { adapter, job, row } = await runRow(registry, {
      'kpi key': 'custom1', 'kpi name english': 'New Label', 'kpi name arabic': 'تسمية',
      unit: registry.custom1.unit, category: registry.custom1.category, direction: registry.custom1.direction,
      'lifecycle stage': registry.custom1.lifecycleStage, active: 'true',
    })
    expect(row.classification).toBe('UPDATE')
    const { result } = await commitJob(job, adapter, [row], ctx, { chunkSize: 1 })
    expect(result.committed).toBe(1)
  })

  it('an unchanged KPI classifies as SKIP', async () => {
    const registry: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, custom2: { ...DEFAULT_KPI_REGISTRY.sales, key: 'custom2' } }
    const def = registry.custom2
    const { row } = await runRow(registry, {
      'kpi key': 'custom2', 'kpi name english': def.label, 'kpi name arabic': def.labelAr,
      'description english': def.description, unit: def.unit, category: def.category, direction: def.direction,
      'lifecycle stage': def.lifecycleStage, active: String(def.isActive), 'sort order': String(def.sortOrder),
      'dashboard enabled': String(def.visibility.dashboardEnabled),
    })
    expect(row.classification).toBe('SKIP')
  })

  it('rejects a duplicate key within the file (last row wins, reported)', async () => {
    const adapter = createKpiRegistryAdapter({ actorRole: 'admin', existingRegistry: {} })
    const rows = [
      { 'kpi key': 'dupKey', 'kpi name english': 'First', 'kpi name arabic': 'أ', unit: 'u', category: 'operational', direction: 'higher_is_better' },
      { 'kpi key': 'dupKey', 'kpi name english': 'Second', 'kpi name arabic': 'ب', unit: 'u', category: 'operational', direction: 'higher_is_better' },
    ].map((r, i) => adapter.parseRow(r, i + 1, { domain: 'KPI_REGISTRY' }))
    const job0 = createImportJob({ jobId: 'job-dup', domain: 'KPI_REGISTRY', createdBy: 'admin-1' })
    const { rows: staged } = await runValidation(job0, adapter, rows, vCtx, aCtx)
    expect(staged[0].classification).toBe('VALID')
    expect(staged[1].classification).toBe('DUPLICATE')
  })

  it('rejects a normalized-key collision against an existing different-case key', async () => {
    const registry: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, wasfaty: DEFAULT_KPI_REGISTRY.wasfaty }
    const { row } = await runRow(registry, {
      'kpi key': 'Wasfaty', 'kpi name english': 'X', 'kpi name arabic': 'س', unit: 'u', category: 'operational', direction: 'higher_is_better',
    })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'NORMALIZED_KEY_COLLISION')).toBe(true)
  })

  it('rejects an invalid unit/category/lifecycle/aggregation value', async () => {
    const { row } = await runRow({}, {
      'kpi key': 'badRow', 'kpi name english': 'X', 'kpi name arabic': 'س',
      category: 'not-a-category', direction: 'sideways', 'lifecycle stage': 'nonsense', 'aggregation method': 'WRONG',
    })
    expect(row.classification).toBe('ERROR')
    const codes = row.issues.map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(['MISSING_REQUIRED_FIELD', 'INVALID_CATEGORY', 'INVALID_DIRECTION', 'INVALID_LIFECYCLE_STAGE', 'INVALID_AGGREGATION_METHOD']))
  })

  it('rejects min greater than max as a non-blocking warning (field not persisted)', async () => {
    const { row } = await runRow({}, {
      'kpi key': 'mmKpi', 'kpi name english': 'X', 'kpi name arabic': 'س', unit: 'u', category: 'operational', direction: 'higher_is_better',
      'minimum value': '100', 'maximum value': '10',
    })
    expect(row.classification).toBe('WARNING')
    expect(row.issues.some((i) => i.code === 'INVALID_MIN_MAX')).toBe(true)
    expect(row.issues.some((i) => i.code === 'FIELD_NOT_PERSISTED')).toBe(true)
  })

  it('blocks a structural change (unit) on an existing KPI as CONFLICT, never silently overwritten', async () => {
    const registry: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, custom3: { ...DEFAULT_KPI_REGISTRY.sales, key: 'custom3' } }
    const def = registry.custom3
    const { row } = await runRow(registry, {
      'kpi key': 'custom3', 'kpi name english': def.label, 'kpi name arabic': def.labelAr,
      unit: 'a-different-unit', category: def.category, direction: def.direction, 'lifecycle stage': def.lifecycleStage,
    })
    expect(row.classification).toBe('CONFLICT')
  })

  it('blocks any change to a protected core KPI as CONFLICT', async () => {
    const def = DEFAULT_KPI_REGISTRY.wasfaty
    const { row } = await runRow(DEFAULT_KPI_REGISTRY, {
      'kpi key': 'wasfaty', 'kpi name english': 'Renamed', 'kpi name arabic': def.labelAr,
      unit: def.unit, category: def.category, direction: def.direction, 'lifecycle stage': def.lifecycleStage,
    })
    expect(row.classification).toBe('CONFLICT')
  })

  it('blocks promoting a test/demo-pattern key straight to production_evaluation', async () => {
    const { row } = await runRow({}, {
      'kpi key': 'testMetric', 'kpi name english': 'X', 'kpi name arabic': 'س', unit: 'u', category: 'operational',
      direction: 'higher_is_better', 'lifecycle stage': 'production_evaluation',
    })
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'TEST_KEY_PROMOTION_BLOCKED')).toBe(true)
  })

  it('blocks an illegal lifecycle transition (archived KPI cannot jump to production_evaluation)', async () => {
    const registry: KpiRegistry = { ...DEFAULT_KPI_REGISTRY, archivedOne: { ...DEFAULT_KPI_REGISTRY.sales, key: 'archivedOne', lifecycleStage: 'archived' } }
    const def = registry.archivedOne
    const { row } = await runRow(registry, {
      'kpi key': 'archivedOne', 'kpi name english': def.label, 'kpi name arabic': def.labelAr,
      unit: def.unit, category: def.category, direction: def.direction, 'lifecycle stage': 'production_evaluation',
    })
    expect(row.classification).toBe('CONFLICT')
  })

  it('denies a non-admin actor', async () => {
    const { row } = await runRow({}, {
      'kpi key': 'someKpi', 'kpi name english': 'X', 'kpi name arabic': 'س', unit: 'u', category: 'operational', direction: 'higher_is_better',
    }, 'manager')
    expect(row.classification).toBe('ERROR')
    expect(row.issues.some((i) => i.code === 'UNAUTHORIZED_ROW')).toBe(true)
  })

  it('is idempotent — re-importing the identical row twice classifies SKIP the second time', async () => {
    const adapter1 = createKpiRegistryAdapter({ actorRole: 'admin', existingRegistry: {} })
    const raw = adapter1.parseRow({
      'kpi key': 'idemKpi', 'kpi name english': 'Idem', 'kpi name arabic': 'إيديم',
      unit: 'u', category: 'operational', direction: 'higher_is_better', 'lifecycle stage': 'pilot_tracking',
    }, 1, { domain: 'KPI_REGISTRY' })
    const job0 = createImportJob({ jobId: 'job-idem-1', domain: 'KPI_REGISTRY', createdBy: 'admin-1' })
    const { job, rows } = await runValidation(job0, adapter1, [raw], vCtx, aCtx)
    await commitJob(job, adapter1, rows, ctx, { chunkSize: 1 })

    const writtenDef = registryDocs.get('idemKpi')
    const registryAfter: KpiRegistry = { idemKpi: {
      key: 'idemKpi', label: writtenDef!.label as string, shortLabel: writtenDef!.shortLabel as string,
      labelAr: writtenDef!.labelAr as string, category: writtenDef!.category as KpiRegistry['idemKpi']['category'],
      valueType: 'number', unit: writtenDef!.unit as string, unitAr: writtenDef!.unitAr as string,
      direction: writtenDef!.direction as KpiRegistry['idemKpi']['direction'], targetType: 'absolute',
      weight: 0, isActive: writtenDef!.isActive as boolean, isCore: false,
      thresholds: { healthy: 95, watch: 80, risk: 60, critical: 40 },
      visibility: { dashboardEnabled: writtenDef!.dashboardEnabled as boolean, teamEnabled: false, executiveEnabled: false, regionalEnabled: false, targetInputEnabled: writtenDef!.targetInputEnabled as boolean },
      sortOrder: writtenDef!.sortOrder as number, description: '', isPrimary: false, coachingAction: '', coachingActionAr: '',
      lifecycleStage: writtenDef!.lifecycleStage as KpiRegistry['idemKpi']['lifecycleStage'],
    } }

    const { row: secondRow } = await runRow(registryAfter, {
      'kpi key': 'idemKpi', 'kpi name english': 'Idem', 'kpi name arabic': 'إيديم',
      unit: 'u', category: 'operational', direction: 'higher_is_better', 'lifecycle stage': 'pilot_tracking',
    })
    expect(secondRow.classification).toBe('SKIP')
  })
})
