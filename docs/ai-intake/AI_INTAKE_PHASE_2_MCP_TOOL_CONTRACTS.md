# Universal AI Intake — Phase 2 MCP Tool Contracts

Manifest source of truth: `src/services/connector/connectorToolRegistry.ts`
(`MCP_TOOL_MANIFEST`). All 8 tools are `destructive: false` — none can
delete a record. `pharmapulse_execute_intake_session` writes data but
is still classified non-destructive because it can only create/update
rows already shown in an approved preview, per the spec's own required
distinction.

## 1. `pharmapulse_create_intake_session`
- **Scope**: `intake:create` · **Confirmation**: no · **Idempotency**: required
- **Input**: `entityType, sourceType, sourceName?, rows[], metadata?, idempotencyKey`
- **Output**: `sessionId, status, detectedEntityType, acceptedRowCount, rejectedRowCount, validationSummary, nextAction`
- Rows are structured (`rawValues` objects), not raw binary files — raw
  file transport is explicitly deferred to a future phase.

## 2. `pharmapulse_validate_intake_session`
- **Scope**: `intake:validate` · **Confirmation**: no · **Idempotency**: not required
- **Input**: `sessionId`
- **Output**: `status, validationSummary, rowClassifications[], duplicateSummary, unresolvedReferences[], previewSignature`

## 3. `pharmapulse_get_intake_preview`
- **Scope**: `intake:read` · **Confirmation**: no · **Idempotency**: not required
- **Input**: `sessionId, filter?, limit?, offset?`
- **Output**: `createCount, updateCount, skipCount, conflictCount, invalidCount, warningCount, rows[], executionEligible, previewSignature`

## 4. `pharmapulse_approve_intake_session`
- **Scope**: `intake:approve` · **Confirmation**: yes · **Idempotency**: required
- **Input**: `sessionId, previewSignature, approvalPhrase?, selectedRowIds?, excludedRowIds?, idempotencyKey`
- **Output**: `approvalId, approvalToken, approvedRowCount, excludedRowCount, expiresAt, status`
- Above 50 committable rows, `approvalPhrase` must equal `"APPROVE IMPORT"`.
- Issues a token — never writes data itself.

## 5. `pharmapulse_execute_intake_session`
- **Scope**: `intake:execute` · **Confirmation**: yes · **Idempotency**: required
- **Input**: `sessionId, approvalToken, idempotencyKey`
- **Output**: `executionId, status, created, updated, skipped, failed, failureDetails[], auditReference`
- Rejects: expired approval, changed preview signature, already-consumed
  token, idempotency-key/payload mismatch, missing authorization,
  non-admin connector identity, and disabled production-write guard.

## 6. `pharmapulse_get_intake_status`
- **Scope**: `intake:read` · **Confirmation**: no · **Idempotency**: not required
- **Input**: `sessionId`
- **Output**: `lifecycleStatus, validationState, approvalState, executionState, counts, timestamps, failureReason?`

## 7. `pharmapulse_cancel_intake_session`
- **Scope**: `intake:cancel` · **Confirmation**: no · **Idempotency**: not required
- **Input**: `sessionId, reason`
- Allowed only before execution (`COMMITTING`/`COMPLETED`/
  `PARTIALLY_COMPLETED` → `SESSION_STATE_CONFLICT`).

## 8. `pharmapulse_get_reference_data`
- **Scope**: `reference:read` · **Confirmation**: no · **Idempotency**: not required
- **Input**: `referenceType, exactCode?, searchText?, limit?`
- **Output**: `referenceType, records[]` — minimized fields only (see
  `AI_INTAKE_PHASE_2_ARCHITECTURE.md`'s reference-data allowlist).

## Supported entity types (unchanged from Phase 1)

Regions, Groups, Pharmacies, Users, Assignments, KPI Definitions, KPI
Targets, KPI Actuals. No Smart List, Item-level, or Evaluation Profile
support — verified by `connectorToolRegistry.test.ts`.
