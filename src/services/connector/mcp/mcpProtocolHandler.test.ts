// ============================================================
// Universal AI Intake — Phase 2.2 MCP Protocol Handler Tests
//
// Exercises handleMcpRequest() end-to-end against the in-memory
// connector repository — same mocking convention as
// connectorHttpHandler.test.ts (Phase 2): firebase/firestore mocked
// so nothing here ever attempts a live Firestore call. The
// tools/call path re-uses handleConnectorRequest() (unchanged), so
// this suite focuses on JSON-RPC/MCP framing, not re-testing every
// connector business rule already covered by connectorHttpHandler.test.ts.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../firebase', () => ({
  db: {}, auth: { currentUser: { uid: 'admin-uid-1' } },
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
vi.mock('../../auditService', () => ({ logAction: vi.fn(async () => {}), AUDIT_ACTION: { CREATE: 'create', UPDATE: 'update' } }))
vi.mock('../../territorySync', () => ({ recomputeAssignedPharmacyIds: vi.fn(async () => {}) }))

import { handleMcpRequest } from './mcpProtocolHandler'
import { issueConnectorToken } from '../connectorTokenService'
import { createInMemoryConnectorRepository } from '../repositories/inMemoryConnectorRepository'
import { makeFakeExistingData } from '../testSupport/fakeExistingData'
import { makeFakeCommitExecutor } from '../testSupport/fakeCommitExecutor'
import type { ConnectorRepository } from '../repositories/connectorRepository'
import type { HandlerEnv } from '../connectorHttpHandler'
import type { JsonRpcResponse } from './mcpTypes'

const ENV_BASE = { tokenSecret: 'tok-secret', audience: 'pharmapulse-connector', issuer: 'pharmapulse', approvalSecret: 'appr-secret' }

function makeEnv(overrides: Partial<HandlerEnv> = {}): HandlerEnv {
  return {
    ...ENV_BASE,
    getExistingData: async () => makeFakeExistingData(),
    resolveAdminMapping: (clientId: string) =>
      clientId === 'chatgpt-1' ? { mappedAdminUid: 'admin-uid-1', mappedAdminRole: 'admin' } : null,
    productionGuardFlags: { connectorEnabled: 'true', productionWritesEnabled: 'true', environmentName: 'development' },
    commitExecutor: makeFakeCommitExecutor(),
    ...overrides,
  }
}

function fullToken(scopes: string[] = ['intake:create', 'intake:read', 'intake:validate', 'intake:approve', 'intake:execute', 'intake:cancel', 'reference:read']) {
  return issueConnectorToken({ clientId: 'chatgpt-1', scopes: scopes as any, audience: ENV_BASE.audience, issuer: ENV_BASE.issuer, secret: ENV_BASE.tokenSecret, ttlSeconds: 300 })
}

function headers(token?: string) {
  return { authorization: `Bearer ${token ?? fullToken()}` }
}

let repo: ConnectorRepository
let env: HandlerEnv

beforeEach(() => {
  repo = createInMemoryConnectorRepository({ regions: [{ id: 'r1', code: 'EXIST', name: 'Existing Region', status: 'active' }] })
  env = makeEnv()
})

function successResult(res: { status: number; body: JsonRpcResponse | null }) {
  expect(res.status).toBe(200)
  expect(res.body).not.toBeNull()
  expect('result' in (res.body as any)).toBe(true)
  return (res.body as any).result
}

// ── 1-4: initialize / capabilities ────────────────────────────

describe('MCP protocol — initialize', () => {
  it('returns protocolVersion, capabilities, and serverInfo for a valid init request', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, headers(), env, repo)
    const result = successResult(res)
    expect(result.protocolVersion).toBe('2025-06-18')
    expect(result.capabilities).toEqual({ tools: { listChanged: false } })
    expect(result.serverInfo.name).toBe('pharmapulse-connector')
  })

  it('exposes a tools-only capability set — no resources, no prompts', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, headers(), env, repo)
    const result = successResult(res)
    expect(result.capabilities.resources).toBeUndefined()
    expect(result.capabilities.prompts).toBeUndefined()
  })

  it('rejects initialize without a valid connector token (not anonymous)', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, {}, env, repo)
    expect(res.status).toBe(401)
    expect((res.body as any).error.code).toBe(-32001)
  })

  it('rejects initialize with missing protocolVersion (invalid params)', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, headers(), env, repo)
    expect(res.status).toBe(400)
    expect((res.body as any).error.code).toBe(-32602)
  })
})

// ── 5-6: tools/list, tools/call basics ────────────────────────

describe('MCP protocol — tools/list', () => {
  it('lists all 8 tools with real JSON schema and _meta', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, headers(), env, repo)
    const result = successResult(res)
    expect(result.tools).toHaveLength(8)
    const names = result.tools.map((t: any) => t.name)
    expect(names).toContain('pharmapulse_execute_intake_session')
    const execTool = result.tools.find((t: any) => t.name === 'pharmapulse_execute_intake_session')
    expect(execTool.inputSchema.required).toEqual(['sessionId', 'approvalToken', 'idempotencyKey'])
    expect(execTool._meta.destructive).toBe(false)
    expect(execTool._meta.requiresConfirmation).toBe(true)
  })

  it('rejects tools/list without authentication', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, {}, env, repo)
    expect(res.status).toBe(401)
  })
})

describe('MCP protocol — tools/call framing', () => {
  it('rejects tools/call for an unknown tool name (protocol-level error)', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'pharmapulse_delete_everything', arguments: {} } }, headers(), env, repo)
    expect(res.status).toBe(400)
    expect((res.body as any).error.code).toBe(-32602)
  })

  it('rejects tools/call with no params.name', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {} }, headers(), env, repo)
    expect(res.status).toBe(400)
    expect((res.body as any).error.code).toBe(-32602)
  })

  it('rejects malformed tool arguments as a tool-result error (isError:true), not a protocol error', async () => {
    // pharmapulse_get_intake_status requires sessionId — omit it.
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'pharmapulse_get_intake_status', arguments: {} } }, headers(), env, repo)
    const result = successResult(res) // still a JSON-RPC SUCCESS envelope
    expect(result.isError).toBe(true)
    expect(result.structuredContent.code).toBe('INVALID_PAYLOAD')
  })

  it('rejects an unknown field per the tool schema (additionalProperties:false)', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'pharmapulse_get_intake_status', arguments: { sessionId: 'x', arbitraryField: 'nope' } } }, headers(), env, repo)
    const result = successResult(res)
    expect(result.isError).toBe(true)
  })
})

// ── unknown method / malformed JSON-RPC ───────────────────────

describe('MCP protocol — malformed / unsupported requests', () => {
  it('rejects a non-object body as a parse error', async () => {
    const res = await handleMcpRequest('not an object', headers(), env, repo)
    expect(res.status).toBe(400)
    expect((res.body as any).error.code).toBe(-32700)
  })

  it('rejects a request missing "jsonrpc":"2.0"', async () => {
    const res = await handleMcpRequest({ id: 1, method: 'initialize' }, headers(), env, repo)
    expect(res.status).toBe(400)
    expect((res.body as any).error.code).toBe(-32600)
  })

  it('rejects an unknown method (METHOD_NOT_FOUND)', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 4, method: 'resources/list' }, headers(), env, repo)
    expect(res.status).toBe(400)
    expect((res.body as any).error.code).toBe(-32601)
  })

  it('treats a request with no id (and an unsupported method) as invalid, not silently ignored', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'x' } }, headers(), env, repo)
    expect(res.status).toBe(400)
    expect(res.body).not.toBeNull()
    expect((res.body as any).error.code).toBe(-32600)
  })

  it('handles the notifications/initialized fire-and-forget notification with no response body', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }, headers(), env, repo)
    expect(res.status).toBe(202)
    expect(res.body).toBeNull()
  })
})

// ── full tool mapping: all 8 tools through tools/call ─────────

describe('MCP protocol — full 8-tool lifecycle via tools/call', () => {
  it('create -> validate -> preview -> approve -> execute -> status -> cancel-rejected, plus reference-data', async () => {
    const call = (id: number, name: string, args: Record<string, unknown>) =>
      handleMcpRequest({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, headers(), env, repo)

    const createRes = await call(1, 'pharmapulse_create_intake_session', {
      entityType: 'REGION', sourceType: 'chatgpt_structured', sourceName: 'chatgpt',
      rows: [{ clientRowId: 'row-1', rawValues: { code: 'MCPR', name: 'MCP Region' } }],
      idempotencyKey: 'mcp-create-1',
    })
    const createResult = successResult(createRes)
    expect(createResult.isError).toBeFalsy()
    const sessionId = createResult.structuredContent.sessionId
    expect(sessionId).toBeTruthy()

    const validateRes = await call(2, 'pharmapulse_validate_intake_session', { sessionId })
    const previewSignature = successResult(validateRes).structuredContent.previewSignature

    const previewRes = await call(3, 'pharmapulse_get_intake_preview', { sessionId })
    expect(successResult(previewRes).structuredContent.rows[0].proposedAction).toBe('create')

    const approveRes = await call(4, 'pharmapulse_approve_intake_session', { sessionId, previewSignature, idempotencyKey: 'mcp-approve-1' })
    const approvalToken = successResult(approveRes).structuredContent.approvalToken
    expect(approvalToken).toBeTruthy()

    const executeRes = await call(5, 'pharmapulse_execute_intake_session', { sessionId, approvalToken, idempotencyKey: 'mcp-execute-1' })
    const executeResult = successResult(executeRes)
    expect(executeResult.isError).toBeFalsy()
    expect(executeResult.structuredContent.created).toBe(1)
    expect(executeResult.structuredContent.executionId).toBeTruthy()
    expect(executeResult.structuredContent.auditReference).toBeTruthy()

    const statusRes = await call(6, 'pharmapulse_get_intake_status', { sessionId })
    expect(successResult(statusRes).structuredContent.lifecycleStatus).toBe('COMPLETED')

    const cancelRes = await call(7, 'pharmapulse_cancel_intake_session', { sessionId, reason: 'too late' })
    expect(successResult(cancelRes).isError).toBe(true) // SESSION_STATE_CONFLICT — already completed

    const refRes = await call(8, 'pharmapulse_get_reference_data', { referenceType: 'regions' })
    expect(successResult(refRes).structuredContent.records.length).toBeGreaterThan(0)
  })
})

// ── auth / scope / error-code preservation ────────────────────

describe('MCP protocol — authentication and scope enforcement (via tools/call)', () => {
  it('rejects tools/call with no Authorization header (UNAUTHENTICATED preserved as isError result)', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pharmapulse_get_reference_data', arguments: { referenceType: 'regions' } } }, {}, env, repo)
    const result = successResult(res)
    expect(result.isError).toBe(true)
    expect(result.structuredContent.code).toBe('UNAUTHENTICATED')
  })

  it('rejects tools/call missing the required scope (INVALID_SCOPE preserved)', async () => {
    const token = fullToken(['reference:read']) // no intake:create
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pharmapulse_create_intake_session', arguments: { entityType: 'REGION', sourceType: 'chatgpt_structured', rows: [], idempotencyKey: 'k1' } } }, headers(token), env, repo)
    const result = successResult(res)
    expect(result.isError).toBe(true)
    expect(result.structuredContent.code).toBe('INVALID_SCOPE')
  })

  it('never leaks a stack trace or credential value in a tool-call error result', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pharmapulse_get_intake_status', arguments: { sessionId: 'does-not-exist' } } }, headers(), env, repo)
    const result = successResult(res)
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/at\s+\S+\s+\(.*:\d+:\d+\)/) // no stack-trace-shaped text
    expect(JSON.stringify(result)).not.toContain(ENV_BASE.tokenSecret)
    expect(JSON.stringify(result)).not.toContain(ENV_BASE.approvalSecret)
  })
})

// ── rate limiting / oversized payload / pagination limits ─────

describe('MCP protocol — request limits', () => {
  it('surfaces rate limiting through tools/call as a tool-result error, not a crash', async () => {
    let lastResult: any
    for (let i = 0; i < 35; i++) {
      const res = await handleMcpRequest({ jsonrpc: '2.0', id: i, method: 'tools/call', params: { name: 'pharmapulse_get_reference_data', arguments: { referenceType: 'regions' } } }, headers(), env, repo)
      lastResult = successResult(res)
    }
    expect(lastResult.isError).toBe(true)
    expect(lastResult.structuredContent.code).toBe('RATE_LIMITED')
  })

  it('rejects a preview page-size request exceeding the documented ceiling', async () => {
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pharmapulse_get_intake_preview', arguments: { sessionId: 'x', limit: 99999 } } }, headers(), env, repo)
    const result = successResult(res)
    expect(result.isError).toBe(true)
    expect(result.structuredContent.message).toMatch(/maximum allowed value/)
  })

  it('rejects an oversized rows[] array on create-session rather than silently truncating', async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => ({ clientRowId: `r${i}`, rawValues: { code: `C${i}` } }))
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pharmapulse_create_intake_session', arguments: { entityType: 'REGION', sourceType: 'chatgpt_structured', rows, idempotencyKey: 'k-oversized' } } }, headers(), env, repo)
    const result = successResult(res)
    expect(result.isError).toBe(true)
    expect(result.structuredContent.message).toMatch(/maximum allowed item count/)
  })
})

// ── duplicate execution / stale approval (reuse existing connector guarantees through MCP framing) ──

describe('MCP protocol — duplicate execution and stale approval protection', () => {
  it('a second execute with a different idempotency key against an already-consumed approval is rejected', async () => {
    const call = (id: number, name: string, args: Record<string, unknown>) =>
      handleMcpRequest({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, headers(), env, repo)

    const createRes = await call(1, 'pharmapulse_create_intake_session', {
      entityType: 'REGION', sourceType: 'chatgpt_structured',
      rows: [{ clientRowId: 'row-1', rawValues: { code: 'DUP1', name: 'Dup Region' } }],
      idempotencyKey: 'mcp-dup-create',
    })
    const sessionId = successResult(createRes).structuredContent.sessionId
    const previewSignature = successResult(await call(2, 'pharmapulse_validate_intake_session', { sessionId })).structuredContent.previewSignature
    const approvalToken = successResult(await call(3, 'pharmapulse_approve_intake_session', { sessionId, previewSignature, idempotencyKey: 'mcp-dup-approve' })).structuredContent.approvalToken

    const first = successResult(await call(4, 'pharmapulse_execute_intake_session', { sessionId, approvalToken, idempotencyKey: 'mcp-dup-exec-1' }))
    expect(first.isError).toBeFalsy()

    const second = successResult(await call(5, 'pharmapulse_execute_intake_session', { sessionId, approvalToken, idempotencyKey: 'mcp-dup-exec-2' }))
    expect(second.isError).toBe(true)
    expect(second.structuredContent.code).toBe('APPROVAL_ALREADY_USED')
  })

  it('execute rejects a stale preview signature at approve-time', async () => {
    const call = (id: number, name: string, args: Record<string, unknown>) =>
      handleMcpRequest({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, headers(), env, repo)

    const createRes = await call(1, 'pharmapulse_create_intake_session', {
      entityType: 'REGION', sourceType: 'chatgpt_structured',
      rows: [{ clientRowId: 'row-1', rawValues: { code: 'STALE1', name: 'Stale' } }],
      idempotencyKey: 'mcp-stale-create',
    })
    const sessionId = successResult(createRes).structuredContent.sessionId
    const approveRes = successResult(await call(2, 'pharmapulse_approve_intake_session', { sessionId, previewSignature: 'wrong-signature', idempotencyKey: 'mcp-stale-approve' }))
    expect(approveRes.isError).toBe(true)
    expect(approveRes.structuredContent.code).toBe('PREVIEW_STALE')
  })
})

// ── connector-disabled / production-write-disabled behavior ───

describe('MCP protocol — production guard behavior', () => {
  it('execute is blocked when no productionGuardFlags are configured (fail closed)', async () => {
    const lockedDownEnv = makeEnv({ productionGuardFlags: undefined })
    const res = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pharmapulse_execute_intake_session', arguments: { sessionId: 'x', approvalToken: 'y', idempotencyKey: 'z' } } }, headers(), lockedDownEnv, repo)
    const result = successResult(res)
    expect(result.isError).toBe(true)
    expect(result.structuredContent.code).toBe('UNAUTHORIZED')
  })
})

// ── audit correlation ──────────────────────────────────────────

describe('MCP protocol — audit correlation', () => {
  it('every tools/call writes a traceable connector audit record', async () => {
    const before = (repo as any)._auditLog?.length ?? 0
    await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'pharmapulse_get_reference_data', arguments: { referenceType: 'regions' } } }, headers(), env, repo)
    const after = (repo as any)._auditLog?.length ?? 0
    expect(after).toBe(before + 1)
  })
})
