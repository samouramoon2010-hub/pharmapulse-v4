import { describe, it, expect } from 'vitest'
import { mapConnectorError } from './connectorErrorMapper'
import { ConnectorFailure } from './connectorTypes'

describe('Structured error contract', () => {
  it('maps a ConnectorFailure to its declared code and status', () => {
    const err = new ConnectorFailure({ code: 'RATE_LIMITED', message: 'too many requests', retryable: true })
    const mapped = mapConnectorError(err)
    expect(mapped.status).toBe(429)
    expect(mapped.body.code).toBe('RATE_LIMITED')
    expect(mapped.body.retryable).toBe(true)
    expect(mapped.body.timestamp).toBeTruthy()
  })

  it('maps every required error code to a sensible HTTP status', () => {
    const codes: any[] = [
      'UNAUTHENTICATED', 'UNAUTHORIZED', 'INVALID_SCOPE', 'INVALID_PAYLOAD', 'UNSUPPORTED_ENTITY',
      'SESSION_NOT_FOUND', 'SESSION_STATE_CONFLICT', 'PREVIEW_STALE', 'APPROVAL_REQUIRED',
      'APPROVAL_EXPIRED', 'APPROVAL_ALREADY_USED', 'IDEMPOTENCY_CONFLICT', 'RATE_LIMITED',
      'VALIDATION_FAILED', 'EXECUTION_PARTIAL', 'INTERNAL_ERROR',
    ]
    for (const code of codes) {
      const mapped = mapConnectorError(new ConnectorFailure({ code, message: 'x', retryable: false }))
      expect(mapped.status).toBeGreaterThanOrEqual(200)
      expect(mapped.body.code).toBe(code)
    }
  })

  it('maps an unknown/unexpected error to INTERNAL_ERROR without leaking its message', () => {
    const mapped = mapConnectorError(new Error('some internal stack trace detail leaked here'))
    expect(mapped.status).toBe(500)
    expect(mapped.body.code).toBe('INTERNAL_ERROR')
    expect(mapped.body.message).not.toContain('stack trace')
  })

  it('carries sessionId/requestId context through when provided', () => {
    const err = new ConnectorFailure({ code: 'SESSION_NOT_FOUND', message: 'nope', retryable: false })
    const mapped = mapConnectorError(err, { sessionId: 'job-1', requestId: 'req-1' })
    expect(mapped.body.sessionId).toBe('job-1')
    expect(mapped.body.requestId).toBe('req-1')
  })
})
