import { describe, it, expect, vi } from 'vitest'
import { recordConnectorAudit, hashIdempotencyKey } from './connectorAuditService'

describe('Connector audit logging', () => {
  it('writes a record with the required fields', async () => {
    const sink = { writeAuditRecord: vi.fn(async () => {}) }
    await recordConnectorAudit(sink, {
      connectorClientId: 'chatgpt-1', mappedAdminUid: 'admin-1', tool: 'pharmapulse_execute_intake_session',
      sessionId: 'job-1', requestId: 'req-1', timestamp: new Date().toISOString(),
      outcome: 'SUCCESS', created: 3, updated: 0, skipped: 0, failed: 0,
    })
    expect(sink.writeAuditRecord).toHaveBeenCalledTimes(1)
    const record = sink.writeAuditRecord.mock.calls[0][0]
    expect(record.tool).toBe('pharmapulse_execute_intake_session')
    expect(record.outcome).toBe('SUCCESS')
  })

  it('never persists a raw token/signature/secret/password even if accidentally included', async () => {
    const sink = { writeAuditRecord: vi.fn(async () => {}) }
    await recordConnectorAudit(sink, {
      connectorClientId: 'chatgpt-1', mappedAdminUid: 'admin-1', tool: 'pharmapulse_approve_intake_session',
      requestId: 'req-2', timestamp: new Date().toISOString(), outcome: 'SUCCESS',
      // @ts-expect-error deliberately injecting forbidden fields to prove redaction
      token: 'raw-access-token', approvalToken: 'raw-approval-token', signature: 'sig', secret: 'shh', password: 'hunter2',
    })
    const record = sink.writeAuditRecord.mock.calls[0][0]
    expect(record.token).toBeUndefined()
    expect(record.approvalToken).toBeUndefined()
    expect(record.signature).toBeUndefined()
    expect(record.secret).toBeUndefined()
    expect(record.password).toBeUndefined()
  })

  it('hashIdempotencyKey never returns the raw key', () => {
    const hash = hashIdempotencyKey('my-idempotency-key')
    expect(hash).not.toBe('my-idempotency-key')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
