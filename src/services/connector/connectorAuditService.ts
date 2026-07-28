// ============================================================
// Universal AI Intake — Phase 2 Connector Audit Logging
//
// Every connector action writes one audit record with the exact
// field list the spec requires. Secrets/tokens/signatures are never
// stored — only a hash of the idempotency key, never the raw tokens.
// The sink is injected (ConnectorRepository) so the same shape is
// used in tests (in-memory) and production (Firestore, reusing the
// existing auditService.logAction() field conventions where they
// overlap).
// ============================================================

import { createHash } from 'crypto'

export interface ConnectorAuditRecord {
  connectorClientId: string
  mappedAdminUid:    string
  tool:              string
  sessionId?:        string
  requestId:         string
  timestamp:         string
  sourceType?:       string
  entityType?:       string
  requestedRowCount?: number
  approvedRowCount?:  number
  created?:          number
  updated?:          number
  skipped?:          number
  failed?:           number
  outcome:           'SUCCESS' | 'FAILURE'
  errorCode?:        string
  idempotencyKeyHash?: string
  approvalReference?: string
  executionReference?: string
}

export interface ConnectorAuditSink {
  writeAuditRecord(record: ConnectorAuditRecord): Promise<void>
}

export function hashIdempotencyKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/** Strips anything that must never be persisted, even if a caller
 *  accidentally includes it — belt-and-suspenders against a future
 *  field being added to the record shape carelessly. */
function redact(record: ConnectorAuditRecord): ConnectorAuditRecord {
  const { ...rest } = record
  delete (rest as Record<string, unknown>).token
  delete (rest as Record<string, unknown>).approvalToken
  delete (rest as Record<string, unknown>).signature
  delete (rest as Record<string, unknown>).secret
  delete (rest as Record<string, unknown>).password
  return rest
}

export async function recordConnectorAudit(sink: ConnectorAuditSink, record: ConnectorAuditRecord): Promise<void> {
  await sink.writeAuditRecord(redact(record))
}
