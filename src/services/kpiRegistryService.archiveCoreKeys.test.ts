// ============================================================
// Owner decision (2026-07-07) — archival restriction lifted for
// PROTECTED_CORE_KEYS (wasfaty, omnihealth, wellnessCard, basket,
// crossSelling).
//
// Proves:
//   1. the five listed KPIs can now be archived via archiveKpiDefinition()
//      and transitionKpiLifecycle() — no "protected core KPI" throw
//   2. no delete path exists for any KPI (archive only, never removed)
//   3. non-core KPI archival behavior is unchanged (no regression)
//   4. hideKpiDefinition() still blocks core keys — that restriction
//      was intentionally NOT lifted
//   5. audit trail (kpi_audit_logs + audit_logs) is still written on
//      archive, for both core and non-core keys
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest'

const registryDocs = new Map<string, Record<string, unknown>>()
const writes: Array<{ key: string; payload: Record<string, unknown> }> = []
const kpiAuditEntries: Array<Record<string, unknown>> = []
const auditLogEntries: Array<Record<string, unknown>> = []

vi.mock('./firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-admin-uid' } },
  COL: {
    KPI_REGISTRY:   'kpi_registry',
    KPI_AUDIT_LOGS: 'kpi_audit_logs',
  },
}))

vi.mock('./auditService', () => ({
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
  logAction: vi.fn(async (entry: Record<string, unknown>) => { auditLogEntries.push(entry) }),
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  doc: vi.fn((_db: unknown, _col: string, key: string) => ({ key })),
  getDoc: vi.fn(async (ref: { key: string }) => {
    const data = registryDocs.get(ref.key)
    return {
      exists: () => data !== undefined,
      data:   () => data,
    }
  }),
  setDoc: vi.fn(async (ref: { key: string }, payload: Record<string, unknown>) => {
    writes.push({ key: ref.key, payload })
    const existing = registryDocs.get(ref.key) ?? {}
    registryDocs.set(ref.key, { ...existing, ...payload })
  }),
  getDocs: vi.fn(async () => ({ forEach: () => {} })),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  query: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn(),
  addDoc: vi.fn(async (ref: { name: string }, entry: Record<string, unknown>) => {
    if (ref.name === 'kpi_audit_logs') kpiAuditEntries.push(entry)
  }),
}))

import {
  archiveKpiDefinition,
  hideKpiDefinition,
  transitionKpiLifecycle,
  PROTECTED_CORE_KEYS,
} from './kpiRegistryService'

const CORE_KEYS = ['wasfaty', 'omnihealth', 'wellnessCard', 'basket', 'crossSelling']

function seedKpi(key: string, overrides: Record<string, unknown> = {}) {
  registryDocs.set(key, {
    key, label: key, isActive: true, uiStatus: 'ACTIVE',
    lifecycleStage: 'production_evaluation', isCore: CORE_KEYS.includes(key),
    ...overrides,
  })
}

beforeEach(() => {
  registryDocs.clear()
  writes.length = 0
  kpiAuditEntries.length = 0
  auditLogEntries.length = 0
})

// ─────────────────────────────────────────────────────────────
// 1. The five core keys can now be archived
// ─────────────────────────────────────────────────────────────
describe('1 — PROTECTED_CORE_KEYS no longer blocks archiveKpiDefinition()', () => {
  it.each(CORE_KEYS)('archiveKpiDefinition("%s") does not throw', async (key) => {
    seedKpi(key)
    await expect(archiveKpiDefinition(key)).resolves.toBeUndefined()
  })

  it.each(CORE_KEYS)('archiveKpiDefinition("%s") writes isActive:false, uiStatus:ARCHIVED, lifecycleStage:archived', async (key) => {
    seedKpi(key)
    await archiveKpiDefinition(key)
    const write = writes.find((w) => w.key === key)
    expect(write?.payload).toMatchObject({
      isActive: false,
      uiStatus: 'ARCHIVED',
      lifecycleStage: 'archived',
    })
  })

  it.each(CORE_KEYS)('transitionKpiLifecycle("%s", "archived") does not throw', async (key) => {
    seedKpi(key)
    await expect(transitionKpiLifecycle(key, 'archived')).resolves.toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 2. No delete path exists for any KPI — archive only
// ─────────────────────────────────────────────────────────────
describe('2 — archiving never deletes a KPI document', () => {
  it.each(CORE_KEYS)('"%s" document still exists (in the mock store) after archiving', async (key) => {
    seedKpi(key)
    await archiveKpiDefinition(key)
    expect(registryDocs.has(key)).toBe(true)
  })

  it('kpiRegistryService.ts exports no deleteKpiDefinition / deleteDoc-based removal function', async () => {
    const src = (await import('./kpiRegistryService.ts?raw')).default
    expect(src).not.toContain('deleteDoc')
    expect(src).not.toMatch(/export\s+(async\s+)?function\s+deleteKpiDefinition/)
  })
})

// ─────────────────────────────────────────────────────────────
// 3. Non-core KPI archival behavior is unchanged (no regression)
// ─────────────────────────────────────────────────────────────
describe('3 — non-core KPI archival is unchanged', () => {
  it('archiveKpiDefinition("sales") (non-core) still succeeds exactly as before', async () => {
    seedKpi('sales', { isCore: false })
    await archiveKpiDefinition('sales')
    const write = writes.find((w) => w.key === 'sales')
    expect(write?.payload).toMatchObject({ isActive: false, uiStatus: 'ARCHIVED', lifecycleStage: 'archived' })
  })

  it('PROTECTED_CORE_KEYS still does not contain non-core keys', () => {
    ['sales', 'sl', 'ndf', 'inbody', 'liberation'].forEach((k) => {
      expect(PROTECTED_CORE_KEYS.has(k)).toBe(false)
    })
  })
})

// ─────────────────────────────────────────────────────────────
// 4. hideKpiDefinition() restriction was NOT lifted — still blocks core keys
// ─────────────────────────────────────────────────────────────
describe('4 — hideKpiDefinition() still blocks PROTECTED_CORE_KEYS (restriction preserved)', () => {
  it.each(CORE_KEYS)('hideKpiDefinition("%s") still throws', async (key) => {
    seedKpi(key)
    await expect(hideKpiDefinition(key)).rejects.toThrow(/protected core KPI/)
  })

  it('hideKpiDefinition("sales") (non-core) still succeeds', async () => {
    seedKpi('sales', { isCore: false })
    await expect(hideKpiDefinition('sales')).resolves.toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────
// 5. Audit trail still written for archived core keys
// ─────────────────────────────────────────────────────────────
describe('5 — archiving a core key still writes the full audit trail', () => {
  it.each(CORE_KEYS)('"%s" archive writes a kpi_audit_logs entry with action ARCHIVE', async (key) => {
    seedKpi(key)
    await archiveKpiDefinition(key)
    const entry = kpiAuditEntries.find((e) => e.kpiKey === key)
    expect(entry).toBeTruthy()
    expect(entry?.action).toBe('ARCHIVE')
    expect(entry?.after).toMatchObject({ lifecycleStage: 'archived', isActive: false })
  })

  it.each(CORE_KEYS)('"%s" archive writes an audit_logs entry via logAction()', async (key) => {
    seedKpi(key)
    await archiveKpiDefinition(key)
    const entry = auditLogEntries.find((e) => e.docId === key)
    expect(entry).toBeTruthy()
    expect(entry?.collection).toBe('kpi_registry')
  })
})
