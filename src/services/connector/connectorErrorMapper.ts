// ============================================================
// Universal AI Intake — Phase 2 Structured Error Contract
//
// Maps any thrown error into the required { code, message, retryable,
// fieldErrors, sessionId, requestId, timestamp } shape and an HTTP
// status code. Never leaks a stack trace to the connector client.
// ============================================================

import { ConnectorFailure } from './connectorTypes'
import type { ConnectorError, ConnectorErrorCode } from './connectorTypes'

const STATUS_BY_CODE: Record<ConnectorErrorCode, number> = {
  UNAUTHENTICATED:        401,
  UNAUTHORIZED:           403,
  INVALID_SCOPE:          403,
  INVALID_PAYLOAD:        400,
  UNSUPPORTED_ENTITY:     400,
  SESSION_NOT_FOUND:      404,
  SESSION_STATE_CONFLICT: 409,
  PREVIEW_STALE:          409,
  APPROVAL_REQUIRED:      409,
  APPROVAL_EXPIRED:       410,
  APPROVAL_ALREADY_USED:  409,
  IDEMPOTENCY_CONFLICT:   409,
  RATE_LIMITED:           429,
  VALIDATION_FAILED:      422,
  EXECUTION_PARTIAL:      207,
  INTERNAL_ERROR:         500,
}

export interface MappedConnectorError {
  status: number
  body:   ConnectorError
}

export function mapConnectorError(err: unknown, context: { sessionId?: string; requestId?: string } = {}): MappedConnectorError {
  if (err instanceof ConnectorFailure) {
    return {
      status: STATUS_BY_CODE[err.error.code],
      body: { ...err.error, sessionId: err.error.sessionId ?? context.sessionId, requestId: err.error.requestId ?? context.requestId },
    }
  }

  // Never leak internal error messages/stack traces to the connector client.
  return {
    status: 500,
    body: {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
      retryable: true,
      sessionId: context.sessionId,
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
    },
  }
}
