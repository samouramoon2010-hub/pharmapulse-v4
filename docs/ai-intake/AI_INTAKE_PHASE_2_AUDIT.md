# Universal AI Intake — Phase 2 Audit Logging

## What's recorded

Every connector request — success or failure — produces one
`ConnectorAuditRecord` (`connectorAuditService.ts`) via
`connectorHttpHandler.ts`:

`connectorClientId, mappedAdminUid, tool, sessionId?, requestId, timestamp, sourceType?, entityType?, requestedRowCount?, approvedRowCount?, created?, updated?, skipped?, failed?, outcome (SUCCESS|FAILURE), errorCode?, idempotencyKeyHash?, approvalReference?, executionReference?`

## What's never recorded

`redact()` strips `token`, `approvalToken`, `signature`, `secret`,
`password` from every record before it's written, even if a future
change accidentally passes one of these fields in. Idempotency keys
are stored only as a SHA-256 hash (`hashIdempotencyKey()`), never in
plaintext. No raw uploaded row content is stored in the audit record
itself (row data lives in the session, not the audit log).

## Storage

In-memory array for tests/simulator (inspectable via `_auditLog` on
the in-memory repository — the simulator prints its count as the
final step). Production: `connector_audit_logs` Firestore collection
(`firestoreConnectorRepository.ts`), a collection distinct from the
existing `audit_logs` used by the rest of the app (kept separate since
the field shapes differ — connector audit records are
request/tool-centric, not document-CRUD-centric like `logAction()`'s
existing records).

## Failure auditing

A failed request (any thrown `ConnectorFailure` or unexpected error)
also produces an audit record (`outcome: 'FAILURE'`, `errorCode` set)
— wrapped in its own try/catch so an audit-write failure can never
mask or replace the original error response to the caller.
