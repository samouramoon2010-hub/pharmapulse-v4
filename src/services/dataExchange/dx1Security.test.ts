// ============================================================
// DX-1 — Security, Scope Isolation, No-Core-Fallback (Part 9, 10)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../firebase', () => ({
  db:  {},
  COL: { KPI_ENTRIES: 'kpi_entries', AUDIT_LOGS: 'audit_logs' },
}))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => {}) })),
}))
vi.mock('../auditService', () => ({ logAction: vi.fn(async () => {}), AUDIT_ACTION: { IMPORT: 'import' } }))
vi.mock('../historyService', () => ({ triggerHistorySnapshots: vi.fn(async () => {}) }))

import { createKpiActualsAdapter } from './adapters/kpiActualsAdapter'
import { createImportJob, runValidation } from './importJobEngine'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import type { GuardContext } from '../security/accessGuard'
import type { ImportValidationContext, ImportAuthorizationContext } from './importDomainAdapter'

const TODAY = new Date().toISOString().split('T')[0]
const OWN_BRANCH    = 'branch-own'
const OTHER_BRANCH  = 'branch-other'
const PHARMACIES = [{ id: OWN_BRANCH, code: '1001' }, { id: OTHER_BRANCH, code: '1002' }]

describe('DX-1 — Authorization & scope isolation', () => {
  it('a non-admin manager cannot stage a row for a branch outside their own scope', async () => {
    const managerCtx: GuardContext = { uid: 'mgr-1', role: 'branch_manager', pharmacyId: OWN_BRANCH }
    const adapter = createKpiActualsAdapter({ guardCtx: managerCtx, actorRole: 'branch_manager', pharmacies: PHARMACIES })

    const raw = adapter.parseRow({ date: TODAY, pharmacyId: OTHER_BRANCH, wasfaty: '5' }, 1, { domain: 'KPI_ACTUALS' })
    const validationCtx: ImportValidationContext = { actorUid: 'mgr-1', actorRole: 'branch_manager', pharmacyId: OWN_BRANCH, knownIds: PHARMACIES.map((p) => p.id) }
    const authCtx: ImportAuthorizationContext     = { actorUid: 'mgr-1', actorRole: 'branch_manager', pharmacyId: OWN_BRANCH }

    const job = createImportJob({ jobId: 'job-scope', domain: 'KPI_ACTUALS', createdBy: 'mgr-1' })
    const { rows } = await runValidation(job, adapter, [raw], validationCtx, authCtx)

    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.code === 'UNAUTHORIZED_ROW')).toBe(true)
  })

  it('admin may import for any branch (matches legacy guardPharmacyAccess admin bypass)', async () => {
    const adminCtx: GuardContext = { uid: 'admin-1', role: 'admin', pharmacyId: null }
    const adapter = createKpiActualsAdapter({ guardCtx: adminCtx, actorRole: 'admin', pharmacies: PHARMACIES })

    const raw = adapter.parseRow({ date: TODAY, pharmacyId: OTHER_BRANCH, wasfaty: '5' }, 1, { domain: 'KPI_ACTUALS' })
    const validationCtx: ImportValidationContext = { actorUid: 'admin-1', actorRole: 'admin', pharmacyId: OTHER_BRANCH, knownIds: PHARMACIES.map((p) => p.id) }
    const authCtx: ImportAuthorizationContext     = { actorUid: 'admin-1', actorRole: 'admin', pharmacyId: OTHER_BRANCH }

    const job = createImportJob({ jobId: 'job-admin', domain: 'KPI_ACTUALS', createdBy: 'admin-1' })
    const { rows } = await runValidation(job, adapter, [raw], validationCtx, authCtx)

    // WARNING (not ERROR) — the row only supplies wasfaty, so the other 4
    // legacy KPI fields are flagged MISSING_OPTIONAL_FIELD, same as legacy.
    // The point of this test is the branch guard never rejects an admin.
    expect(rows[0].classification).toBe('WARNING')
    expect(rows[0].issues.some((i) => i.code === 'UNAUTHORIZED_ROW')).toBe(false)
  })

  it('cannot stage a row claiming to be submitted by another user (impersonation guard)', async () => {
    const ctx: GuardContext = { uid: 'user-1', role: 'pharmacist', pharmacyId: OWN_BRANCH }
    const adapter = createKpiActualsAdapter({ guardCtx: ctx, actorRole: 'pharmacist', pharmacies: PHARMACIES })

    const raw = adapter.parseRow({ date: TODAY, pharmacyId: OWN_BRANCH, wasfaty: '5' }, 1, { domain: 'KPI_ACTUALS' })
    // Validate as if submittedBy were a different user than the actor.
    const validationCtx: ImportValidationContext = { actorUid: 'someone-else', actorRole: 'pharmacist', pharmacyId: OWN_BRANCH, knownIds: PHARMACIES.map((p) => p.id) }
    const authCtx: ImportAuthorizationContext     = { actorUid: 'user-1', actorRole: 'pharmacist', pharmacyId: OWN_BRANCH }

    const job = createImportJob({ jobId: 'job-imp', domain: 'KPI_ACTUALS', createdBy: 'user-1' })
    const { rows } = await runValidation(job, adapter, [raw], validationCtx, authCtx)

    expect(rows[0].classification).toBe('ERROR')
    expect(rows[0].issues.some((i) => i.message.includes('Submitter mismatch'))).toBe(true)
  })
})

describe('DX-1 — No Core KPI fallback', () => {
  it('an unknown KPI column is never silently rewritten into one of the 5 legacy Core fields', () => {
    const ctx: GuardContext = { uid: 'user-1', role: 'admin', pharmacyId: OWN_BRANCH }
    const adapter = createKpiActualsAdapter({ guardCtx: ctx, actorRole: 'admin', pharmacies: PHARMACIES, registry: DEFAULT_KPI_REGISTRY })

    const raw = adapter.parseRow({ date: TODAY, pharmacyId: OWN_BRANCH, definitelyNotARegistryKpi: '777' }, 1, { domain: 'KPI_ACTUALS' })
    const outcome = adapter.validateRow(raw, { actorUid: 'user-1', actorRole: 'admin', pharmacyId: OWN_BRANCH, knownIds: PHARMACIES.map((p) => p.id) })

    const CORE_FIELDS = ['wasfaty', 'omni', 'wellness', 'basket', 'crossSelling']
    for (const field of CORE_FIELDS) {
      expect(outcome.staged?.[field as keyof typeof outcome.staged]).toBe(0)
    }
    expect(outcome.issues.some((i) => i.code === 'UNKNOWN_KPI_KEY')).toBe(true)
  })

  it('the KPI_ACTUALS adapter never resolves an inactive registry KPI as a known column', () => {
    const inactiveRegistry = {
      ...DEFAULT_KPI_REGISTRY,
      dormant: {
        ...DEFAULT_KPI_REGISTRY.wasfaty,
        key: 'dormant', label: 'Dormant KPI', isActive: false, isCore: false, isPrimary: false,
      },
    }
    const ctx: GuardContext = { uid: 'user-1', role: 'admin', pharmacyId: OWN_BRANCH }
    const adapter = createKpiActualsAdapter({ guardCtx: ctx, actorRole: 'admin', pharmacies: PHARMACIES, registry: inactiveRegistry })

    const raw = adapter.parseRow({ date: TODAY, pharmacyId: OWN_BRANCH, 'Dormant KPI': '50' }, 1, { domain: 'KPI_ACTUALS' })
    expect(raw.rawKpiValues?.dormant).toBeUndefined()
    expect(raw.unknownKpiColumns).toContain('Dormant KPI')
  })
})
