// ============================================================
// Universal AI Intake — Phase 2 Local Connector Simulator
//
// Walks the full connector lifecycle (authenticate -> create ->
// validate -> preview -> approve -> execute -> status) against the
// IN-MEMORY repository only — never Firestore, never a real
// deployment, no credentials required. This is the "isolated test
// repository" the spec's local-simulation requirement asks for.
//
// Run with:
//   npx vitest run scripts/connectorSimulate.demo.test.ts
//
// (Vitest is already this repo's test runner/TS transpiler — reusing
// it here avoids adding a new dependency like ts-node/tsx just to
// execute one script.)
// ============================================================

import { describe, it, expect, vi } from 'vitest'

// The execute step exercises the REAL Phase 1 commitJob()/commitBatch(),
// which for REGION calls createRegion()/updateRegion() — hard-wired to
// the client `firebase/firestore` SDK. Mocked here so the simulator
// genuinely never makes a live Firestore call, matching "isolated test
// repository only" — same mocks as connectorHttpHandler.test.ts.
vi.mock('../src/services/firebase', () => ({
  db: {}, auth: { currentUser: { uid: 'dev-admin-uid' } },
  COL: { REGIONS: 'regions', DISTRICTS: 'districts', PHARMACIES: 'pharmacies', USERS: 'users', KPI_REGISTRY: 'kpi_registry', KPI_AUDIT_LOGS: 'kpi_audit_logs', AUDIT_LOGS: 'audit_logs' },
}))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(async () => ({ id: 'new-doc-id' })),
  updateDoc: vi.fn(async () => {}),
  setDoc: vi.fn(async () => {}),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))
vi.mock('../src/services/auditService', () => ({ logAction: vi.fn(async () => {}), AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' } }))
vi.mock('../src/services/territorySync', () => ({ recomputeAssignedPharmacyIds: vi.fn(async () => {}) }))

import { handleConnectorRequest } from '../src/services/connector/connectorHttpHandler'
import { issueConnectorToken } from '../src/services/connector/connectorTokenService'
import { createInMemoryConnectorRepository } from '../src/services/connector/repositories/inMemoryConnectorRepository'
import { makeFakeExistingData } from '../src/services/connector/testSupport/fakeExistingData'
import { makeFakeCommitExecutor } from '../src/services/connector/testSupport/fakeCommitExecutor'
import type { HandlerEnv } from '../src/services/connector/connectorHttpHandler'

const ENV: HandlerEnv = {
  tokenSecret: 'local-sim-token-secret',
  approvalSecret: 'local-sim-approval-secret',
  audience: 'pharmapulse-connector',
  issuer: 'pharmapulse',
  getExistingData: async () => makeFakeExistingData(),
  resolveAdminMapping: (clientId) => (clientId === 'chatgpt-dev' ? { mappedAdminUid: 'dev-admin-uid', mappedAdminRole: 'admin' } : null),
  productionGuardFlags: { connectorEnabled: 'true', productionWritesEnabled: 'true', environmentName: 'development' },
  commitExecutor: makeFakeCommitExecutor(),
}

function bearer() {
  const token = issueConnectorToken({
    clientId: 'chatgpt-dev',
    scopes: ['intake:create', 'intake:read', 'intake:validate', 'intake:approve', 'intake:execute', 'intake:cancel', 'reference:read'],
    audience: ENV.audience, issuer: ENV.issuer, secret: ENV.tokenSecret, ttlSeconds: 600,
  })
  return `Bearer ${token}`
}

function call(tool: string, input: unknown, idempotencyKey?: string) {
  return { authorizationHeader: bearer(), body: { tool, input, requestId: `${tool}-${Math.random()}`, timestamp: new Date().toISOString(), idempotencyKey } }
}

describe('Local Connector Simulator (in-memory, offline)', () => {
  it('walks the full lifecycle and prints each step', async () => {
    const repo = createInMemoryConnectorRepository({ regions: [] })
    console.log('\n=== 1. Authenticate ===')
    console.log('Issued a dev connector access token for client "chatgpt-dev".')

    console.log('\n=== 2. Create intake session ===')
    const createRes = await handleConnectorRequest(call('pharmapulse_create_intake_session', {
      entityType: 'REGION', sourceType: 'chatgpt_structured', sourceName: 'simulator',
      rows: [{ clientRowId: 'sim-1', rawValues: { code: 'SIM', name: 'Simulator Region' } }],
      idempotencyKey: 'sim-create-1',
    }, 'sim-create-1'), ENV, repo)
    console.log(JSON.stringify(createRes.body, null, 2))
    expect(createRes.status).toBe(200)
    const sessionId = (createRes.body as any).sessionId

    console.log('\n=== 3. Validate ===')
    const validateRes = await handleConnectorRequest(call('pharmapulse_validate_intake_session', { sessionId }), ENV, repo)
    console.log(JSON.stringify(validateRes.body, null, 2))
    const previewSignature = (validateRes.body as any).previewSignature

    console.log('\n=== 4. Preview ===')
    const previewRes = await handleConnectorRequest(call('pharmapulse_get_intake_preview', { sessionId }), ENV, repo)
    console.log(JSON.stringify(previewRes.body, null, 2))

    console.log('\n=== 5. Approve ===')
    const approveRes = await handleConnectorRequest(call('pharmapulse_approve_intake_session', {
      sessionId, previewSignature, idempotencyKey: 'sim-approve-1',
    }, 'sim-approve-1'), ENV, repo)
    console.log(JSON.stringify(approveRes.body, null, 2))
    const approvalToken = (approveRes.body as any).approvalToken

    console.log('\n=== 6. Execute ===')
    const executeRes = await handleConnectorRequest(call('pharmapulse_execute_intake_session', {
      sessionId, approvalToken, idempotencyKey: 'sim-execute-1',
    }, 'sim-execute-1'), ENV, repo)
    console.log(JSON.stringify(executeRes.body, null, 2))
    expect((executeRes.body as any).created).toBe(1)

    console.log('\n=== 7. Status ===')
    const statusRes = await handleConnectorRequest(call('pharmapulse_get_intake_status', { sessionId }), ENV, repo)
    console.log(JSON.stringify(statusRes.body, null, 2))
    expect((statusRes.body as any).lifecycleStatus).toBe('COMPLETED')

    console.log('\n=== 8. Idempotent replay check (same key, same execute) ===')
    const replayRes = await handleConnectorRequest(call('pharmapulse_execute_intake_session', {
      sessionId, approvalToken, idempotencyKey: 'sim-execute-1',
    }, 'sim-execute-1'), ENV, repo)
    console.log('Replayed execute with the SAME idempotency key returned the cached result (no duplicate write):')
    console.log(JSON.stringify(replayRes.body, null, 2))
    expect(replayRes.body).toEqual(executeRes.body)

    console.log('\n=== 9. Audit events recorded ===')
    console.log(`${(repo as any)._auditLog.length} audit record(s) written during this simulation.`)

    console.log('\n✅ Local connector simulation completed successfully — zero live Firestore calls, zero real credentials used.\n')
  })
})
