# Universal AI Intake — Phase 2 Test Report

## New test files (all passing)

| File | Tests |
|---|---:|
| `src/services/connector/connectorTokenService.test.ts` | 8 |
| `src/services/connector/connectorApprovalService.test.ts` | 6 |
| `src/services/connector/connectorIdempotencyService.test.ts` | 3 |
| `src/services/connector/connectorRateLimitService.test.ts` | 3 |
| `src/services/connector/connectorReplayGuard.test.ts` | 6 |
| `src/services/connector/connectorScopeService.test.ts` | 6 |
| `src/services/connector/connectorAuditService.test.ts` | 3 |
| `src/services/connector/connectorErrorMapper.test.ts` | 4 |
| `src/services/connector/connectorProductionGuard.test.ts` | 6 |
| `src/services/connector/repositories/inMemoryConnectorRepository.test.ts` | 10 |
| `src/services/connector/connectorToolRegistry.test.ts` | 7 |
| `src/services/connector/connectorHttpHandler.test.ts` | 21 |
| `scripts/connectorSimulate.demo.test.ts` | 1 (full lifecycle walkthrough) |
| `src/pages/admin/aiIntakePhase2Certification.test.ts` | 6 |
| **Total new** | **90** |

## 45 scenarios → test coverage

| # | Scenario | Covered by |
|---|---|---|
| 1-2 | Connector auth success/failure | `connectorTokenService.test.ts`, `connectorHttpHandler.test.ts` |
| 3 | Expired token | `connectorTokenService.test.ts` "rejects an expired token" |
| 4 | Invalid audience | `connectorTokenService.test.ts` |
| 5 | Invalid issuer | `connectorTokenService.test.ts` |
| 6 | Missing scope | `connectorScopeService.test.ts`, `connectorHttpHandler.test.ts` |
| 7 | Admin mapping | `connectorScopeService.test.ts` "accepts a properly mapped admin identity" |
| 8 | Non-admin rejection | `connectorScopeService.test.ts`, `connectorHttpHandler.test.ts` "rejects a connector client with no admin mapping" |
| 9-16 | Each of the 8 tools | `connectorHttpHandler.test.ts` "full session lifecycle (all 8 tools)" |
| 17 | Unsupported entity rejection | `connectorIntakeService.ts`'s `UNSUPPORTED_ENTITY` check (exercised transitively; direct case: entityType outside `INTAKE_DOMAIN_LABELS`) |
| 18-19 | Arbitrary collection/document-path rejection | Structural: no tool input schema accepts a collection name or document path (`connectorTypes.ts`) — reference-data reads go through a fixed `REFERENCE_FIELD_ALLOWLIST` |
| 20 | Server-side revalidation | `connectorHttpHandler.test.ts` "server re-validates rows itself, never trusting a client-claimed classification" |
| 21 | Draft-only KPI enforcement | `connectorHttpHandler.test.ts` "KPI Definitions submitted through the connector are always forced to draft/inactive" |
| 22 | Auth mutation rejection | `connectorHttpHandler.test.ts` "no tool accepts or would act on a password/Auth-UID-creation field" |
| 23 | Destructive-action rejection | `connectorToolRegistry.test.ts` "every tool is destructive: false" + "no delete/... scope exists" |
| 24 | Approval token expiry | `connectorApprovalService.test.ts` "rejects an expired approval token" |
| 25 | Approval token single use | `connectorApprovalService.test.ts` + `connectorHttpHandler.test.ts` "execute rejects an already-used approval" |
| 26 | Stale preview rejection | `connectorApprovalService.test.ts` "invalidates the token when the preview signature changed" |
| 27 | Changed approved-row-set rejection | Covered by the same preview-signature binding — any row-set change changes the signature |
| 28-31 | Idempotent session/approval/execution, conflict | `connectorIdempotencyService.test.ts`, `connectorHttpHandler.test.ts` "idempotent create", "idempotency conflict" |
| 32 | Partial execution retry | Inherited from Phase 1's existing `commitJob()` resume/retry (DX-7) — unchanged, not re-tested here |
| 33-34 | Replayed request / clock-skew rejection | `connectorReplayGuard.test.ts` |
| 35 | Rate limiting | `connectorRateLimitService.test.ts`, `connectorHttpHandler.test.ts` "enforces rate limiting" |
| 36 | Audit logging | `connectorAuditService.test.ts`, `connectorHttpHandler.test.ts` (every call asserts a 200/4xx and the handler always audits) |
| 37 | Sensitive-field redaction | `connectorAuditService.test.ts` "never persists a raw token/signature/secret/password" |
| 38 | Structured error contract | `connectorErrorMapper.test.ts` "maps every required error code" |
| 39-40 | Valid/invalid state transitions | `connectorHttpHandler.test.ts` "cancel is allowed before execution but rejected after" |
| 41 | Production-write guard | `connectorProductionGuard.test.ts`, `connectorHttpHandler.test.ts` "blocks execute by default" |
| 42 | Connector disabled-by-default | `connectorProductionGuard.test.ts` "blocks when no flags are supplied at all" |
| 43 | Reference-data minimization | `connectorHttpHandler.test.ts` "returns minimized reference records" |
| 44 | No duplicate successful rows on retry | `scripts/connectorSimulate.demo.test.ts` "idempotent replay check" |
| 45 | No direct Firestore path exposure | Structural: `connectorTypes.ts`'s input contracts have no path/collection field anywhere |

## Full validation sweep

- Focused: 90 new tests across 14 files — all pass.
- Full suite: **392 files / 25,837 tests — all pass**, zero regressions
  (up from Phase 1's 378/25,746).
- TypeScript: main project `tsc --noEmit` unaffected (netlify/functions/
  is outside `tsconfig.json`'s `include`); a standalone isolated
  typecheck of `netlify/functions/**` + its imports found and fixed one
  real type mismatch (`ConnectorSourceType` vs `IntakeSourceType`
  vocabularies — reconciled by widening the shared `intakeSourceType`
  field's union type) before confirming clean.
- Build: `npm run build` succeeds; `dist/` was grepped for the string
  `"firebase-admin"` — zero matches, proving the isolation boundary.
- Local simulator: `npx vitest run scripts/connectorSimulate.demo.test.ts`
  — full lifecycle walkthrough passes, zero live Firestore calls.

## Not run this session (by design)

- `netlify dev` / a real local Netlify Functions server.
- Any request against `netlify/functions/pharmapulse-connector.ts`
  with real Admin SDK credentials.
- `netlify deploy`.
