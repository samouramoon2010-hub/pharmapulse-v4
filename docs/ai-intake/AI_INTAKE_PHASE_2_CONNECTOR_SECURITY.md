# Universal AI Intake — Phase 2 Connector Security

## Deny-by-default checklist (every request)

1. **Authenticated request only** — missing/invalid/expired/tampered
   token → `UNAUTHENTICATED` (401).
2. **Replay protection** — reused `requestId`, expired timestamp, or
   future-dated timestamp beyond clock skew → rejected.
3. **Rate limiting** — per connector client + admin + tool sliding
   window → `RATE_LIMITED` (429).
4. **Allowlisted scope** — the token's scopes must include the exact
   scope the requested tool declares → `INVALID_SCOPE` (403).
5. **Admin mapping** — the verified `clientId` must resolve, via
   server-side configuration only (`CONNECTOR_CLIENT_ADMIN_MAP`), to
   exactly one protected admin uid. A client with no mapping is
   rejected — **never** falls back to a client-supplied uid, never
   impersonates an arbitrary user.
6. **Idempotency** — session creation, approval, and execution all
   require an idempotency key; a repeated key with a different payload
   is a hard conflict, never silently overwritten.

## No raw Firestore access, ever

Every tool maps to one specific server-side handler
(`connectorIntakeService.ts`). There is:

- no arbitrary collection name accepted from the client
- no arbitrary document path accepted from the client
- no arbitrary query accepted from the client
- no arbitrary mutation payload — every write goes through a Phase 1
  adapter's `validateRow()`/`diffAgainstExisting()` first, so a
  connector call can only produce the same shapes a browser upload
  could produce
- no unrestricted code execution — the tool name is checked against a
  fixed union (`CONNECTOR_TOOL_NAMES`) before dispatch

## Server-side revalidation (never trusts the client)

Every row submitted through `pharmapulse_create_intake_session` is
re-parsed and re-validated by the same Phase 1 adapter `parseRow()`/
`validateRow()` used by the browser UI — a client-claimed `confidence`
or pre-computed classification is never trusted. Verified in
`connectorHttpHandler.test.ts` ("server re-validates rows itself,
never trusting a client-claimed classification").

## No secrets in the frontend bundle

Confirmed by build-output proof (see
`AI_INTAKE_PHASE_2_ARCHITECTURE.md`): `firebase-admin` and all
connector server secrets (`CONNECTOR_TOKEN_SECRET`,
`CONNECTOR_APPROVAL_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`) are read
only via `process.env` inside `netlify/functions/`, never imported by
anything Vite bundles for the browser.

## No service-account key committed to the repository

`FIREBASE_SERVICE_ACCOUNT_JSON` is documented in `.env.example` as a
**name only** (no value) and is read exclusively from
`process.env.FIREBASE_SERVICE_ACCOUNT_JSON` at runtime — it must be
set as a Netlify dashboard secret environment variable, never as a
file in this repo. `getAdminApp()` throws (fails closed) if the
variable is unset, rather than falling back to any default credential
lookup.

## No direct Auth-account mutation

No tool creates, deletes, or modifies a Firebase Auth account. User
import (`pharmapulse_create_intake_session` with `entityType:
'PHARMACIST'`) reuses `pharmacistsAdapter.ts` unchanged — Firestore
profile only, `authStatus: 'PENDING_INVITATION'`. A `password` or
`authUid` field in a submitted row is silently ignored (not a
recognized field on the adapter's raw-row contract) — verified in
`connectorHttpHandler.test.ts`.

## No destructive operations

No tool can delete a record. `pharmapulse_execute_intake_session` can
only create/update rows that were already shown in an approved
preview — see `AI_INTAKE_PHASE_2_MCP_TOOL_CONTRACTS.md`'s
`destructive: false` classification and its rationale.

## No silent overwrite

`diffAgainstExisting()` (reused from Phase 1 adapters) classifies a
conflicting existing record as `CONFLICT`, never auto-resolves it —
the row is excluded from the committable set unless the caller
explicitly includes it, and even then only as an `UPDATE`, never a
silent field replacement without the caller having seen it in preview.
