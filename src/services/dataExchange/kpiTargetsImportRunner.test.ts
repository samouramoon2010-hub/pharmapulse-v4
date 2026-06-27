// ============================================================
// KPI & Targets Bundle — single-domain import runner tests
// (DX-4/DX-5, mirrors onboardingOrchestrator.test.ts conventions)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const jobDocs = new Map<string, Record<string, unknown>>()
const targetDocs = new Map<string, Record<string, unknown>>()
const registryDocs = new Map<string, Record<string, unknown>>()
const rowDocs = new Map<string, Record<string, unknown>>()

vi.mock('../firebase', () => ({
  db: {}, auth: { currentUser: { uid: 'admin-1' } },
  COL: {
    USERS: 'users', PHARMACIES: 'pharmacies', DISTRICTS: 'districts', REGIONS: 'regions',
    AUDIT_LOGS: 'audit_logs', IMPORT_JOBS: 'import_jobs', TARGETS: 'targets',
    PERSONAL_TARGETS: 'personal_targets', KPI_REGISTRY: 'kpi_registry', KPI_AUDIT_LOGS: 'kpi_audit_logs',
  },
}))

interface DocRef { col: string; id: string; subId?: string }

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string, sub?: string, subId?: string): DocRef => ({ col, id, subId: sub ? subId : undefined })),
  collection: vi.fn((_db: unknown, col: string, id?: string): { col: string; id?: string } => ({ col, id })),
  query: vi.fn(() => ({})), where: vi.fn(() => ({})), orderBy: vi.fn(() => ({})), limit: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  setDoc: vi.fn(async (ref: DocRef, data: Record<string, unknown>) => {
    const store = ref.col === 'import_jobs' ? jobDocs : ref.col === 'targets' ? targetDocs : ref.col === 'kpi_registry' ? registryDocs : rowDocs
    store.set(ref.id, { ...(store.get(ref.id) ?? {}), ...data })
  }),
  getDoc: vi.fn(async (ref: DocRef) => {
    const store = ref.col === 'import_jobs' ? jobDocs : ref.col === 'targets' ? targetDocs : ref.col === 'kpi_registry' ? registryDocs : rowDocs
    const data = store.get(ref.id)
    return { exists: () => data != null, data: () => data, id: ref.id }
  }),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  addDoc: vi.fn(async () => ({ id: 'audit-1' })),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn(async () => {}) })),
  deleteDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('../auditService', () => ({
  logAction: vi.fn(async () => {}),
  AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' },
}))

import {
  validateKpiTargetsJob, commitKpiTargetsJob, jobIdForKpiTargetsDomain,
} from './kpiTargetsImportRunner'
import { FirestoreStagingRepository } from './firestoreStagingRepository'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import type { GuardContext } from '../security/accessGuard'
import type { KpiTargetsExistingData } from './kpiTargetsImportRunner'

const ADMIN: GuardContext = { uid: 'admin-1', role: 'admin', pharmacyId: null }
const repo = new FirestoreStagingRepository()

const EXISTING: KpiTargetsExistingData = {
  branches: [{ id: 'ph-1', code: 'B1', name: 'Branch One', active: true }],
  registry: DEFAULT_KPI_REGISTRY,
  pharmacistsByEmployeeId: new Map(),
  pharmacistsByEmail: new Map(),
}

beforeEach(() => { jobDocs.clear(); targetDocs.clear(); registryDocs.clear(); rowDocs.clear() })

describe('KPI & Targets Bundle — single-domain runner (DX-4/DX-5)', () => {
  it('validates a Branch Target job, persists it to import_jobs staging, and reports readyToCommit', async () => {
    const preview = await validateKpiTargetsJob({
      jobIdPrefix: 'kt-1', domain: 'BRANCH_TARGET', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: [{ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '300000' }],
      existing: EXISTING,
    }, repo)

    expect(preview.readyToCommit).toBe(true)
    expect(preview.summary.creates).toBe(1)
    const jobId = jobIdForKpiTargetsDomain('kt-1', 'BRANCH_TARGET')
    expect(jobDocs.has(jobId)).toBe(true)
  })

  it('commits a previewed Branch Target job and writes the real target document', async () => {
    const preview = await validateKpiTargetsJob({
      jobIdPrefix: 'kt-2', domain: 'BRANCH_TARGET', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: [{ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '300000' }],
      existing: EXISTING,
    }, repo)

    const outcome = await commitKpiTargetsJob({
      jobIdPrefix: 'kt-2', domain: 'BRANCH_TARGET', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: [{ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '300000' }],
      existing: EXISTING, expectedPreviewSignature: preview.previewSignature,
    }, repo)

    expect(outcome.stale).toBe(false)
    expect(outcome.result?.committed).toBe(1)
    expect(targetDocs.get('ph-1_2026-06')).toMatchObject({ wasfatyTarget: 300000 })
  })

  it('refuses a stale commit when Firestore data changed since the preview', async () => {
    const preview = await validateKpiTargetsJob({
      jobIdPrefix: 'kt-3', domain: 'BRANCH_TARGET', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: [{ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '300000' }],
      existing: EXISTING,
    }, repo)

    // Simulate a Firestore change between preview and commit — a different
    // branch list (B1 no longer active) changes the recomputed signature.
    const changedExisting: KpiTargetsExistingData = {
      ...EXISTING,
      branches: [{ id: 'ph-1', code: 'B1', name: 'Branch One', active: false }],
    }

    const outcome = await commitKpiTargetsJob({
      jobIdPrefix: 'kt-3', domain: 'BRANCH_TARGET', guardCtx: ADMIN, actorRole: 'admin',
      rawRows: [{ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '300000' }],
      existing: changedExisting, expectedPreviewSignature: preview.previewSignature,
    }, repo)

    expect(outcome.stale).toBe(true)
    expect(targetDocs.size).toBe(0)
  })

  it('refuses to commit the same job twice', async () => {
    const params = {
      jobIdPrefix: 'kt-4', domain: 'BRANCH_TARGET' as const, guardCtx: ADMIN, actorRole: 'admin',
      rawRows: [{ month: '2026-06', 'branch code': 'B1', 'kpi key': 'wasfaty', 'target value': '300000' }],
      existing: EXISTING,
    }
    const preview = await validateKpiTargetsJob(params, repo)
    const first = await commitKpiTargetsJob({ ...params, expectedPreviewSignature: preview.previewSignature }, repo)
    expect(first.stale).toBe(false)

    const second = await commitKpiTargetsJob({ ...params, expectedPreviewSignature: preview.previewSignature }, repo)
    expect(second.stale).toBe(true)
    expect(second.staleReason).toContain('already committed')
  })

  it('validates and commits a KPI Registry job end-to-end', async () => {
    const params = {
      jobIdPrefix: 'kt-5', domain: 'KPI_REGISTRY' as const, guardCtx: ADMIN, actorRole: 'admin',
      rawRows: [{ 'kpi key': 'newMetric', 'kpi name english': 'New Metric', 'kpi name arabic': 'مؤشر جديد', unit: 'u', category: 'operational', direction: 'higher_is_better', 'lifecycle stage': 'pilot_tracking' }],
      existing: EXISTING,
    }
    const preview = await validateKpiTargetsJob(params, repo)
    expect(preview.readyToCommit).toBe(true)
    const outcome = await commitKpiTargetsJob({ ...params, expectedPreviewSignature: preview.previewSignature }, repo)
    expect(outcome.result?.committed).toBe(1)
    expect(registryDocs.get('newMetric')).toMatchObject({ key: 'newMetric', label: 'New Metric' })
  })
})
