# Universal AI Intake — Phase 2 Architecture

## Backend decision: Netlify Functions

Per the spec's preferred order — Netlify Functions first, if the app
is already deployed through Netlify — investigation confirmed: this
app genuinely deploys to Netlify (`netlify.toml` exists, RC1
Deployment did a real production deploy), but had **no functions
capability set up at all** (no `netlify/functions/` dir, no
`[functions]` block, no `@netlify/functions` dependency). No Firebase
Cloud Functions exist either (no `functions/` dir, no
`firebase-functions` dependency). No repo-local server exists.

**Decision: Netlify Functions**, added from scratch this phase —
exactly one connector backend, `netlify/functions/pharmapulse-connector.ts`.
Not deployed this session (`netlify.toml` now points at the directory,
but no `netlify deploy` was run).

## Critical isolation boundary

`firebase-admin` (Node-only: `fs`/`net`/gRPC) must never reach Vite's
client bundle. Enforced by directory placement, not convention alone:

- **`src/services/connector/`** — every piece of connector *logic*
  (auth tokens, approval tokens, idempotency, rate limiting, replay
  guard, scope checks, the 8 tool handlers, the MCP manifest, the
  framework-agnostic HTTP dispatcher) is pure TypeScript operating over
  an injected `ConnectorRepository` interface. **Zero import of
  `firebase-admin` or `firebase/firestore` anywhere in this directory.**
  Fully unit-testable with vitest, same convention as every other
  `src/services/*` module.
- **`netlify/functions/`** — the real Netlify Function
  (`pharmapulse-connector.ts`, ~90 lines, translates HTTP ↔
  `connectorHttpHandler`'s request/response shape) plus
  `firestoreConnectorRepository.ts` (the only file in this codebase
  that imports `firebase-admin`). This directory is never imported by
  anything under `src/`.

**Verified, not assumed:** `npm run build` was run after adding
`firebase-admin` as a dependency, and `dist/` was grepped for the
string `"firebase-admin"` — zero matches. The isolation boundary holds
by build-output proof, not just code review.

## Request flow

```
ChatGPT -> POST /.netlify/functions/pharmapulse-connector
  -> connectorHttpHandler.handleConnectorRequest()
     1. verify access token (connectorTokenService)
     2. replay guard (connectorReplayGuard)
     3. rate limit (connectorRateLimitService)
     4. scope + admin mapping (connectorScopeService)
     5. idempotency wrap (connectorIdempotencyService, for mutating tools)
     6. dispatch to tool handler (connectorToolRegistry -> connectorIntakeService)
     7. audit log (connectorAuditService)
  -> JSON response
```

Every check is deny-by-default: a missing/invalid token, unseen scope,
unmapped client, or replayed request is rejected before the tool
handler ever runs.

## Reuse of Phase 1 (no parallel import engine)

`connectorIntakeService.ts`'s 8 handlers call the *exact same* engine
Phase 1's `/ai-intake` page calls:

- `createImportJob` / `runValidation` / `commitJob` (`importJobEngine.ts`)
- `createAdapterForDomain` (`intakeDomainRegistry.ts` — same 8-domain
  adapter wiring, including the new Regions adapter and the KPI
  draft-only guard)
- `computeRowsSignature` (`onboardingOrchestrator.ts` — the exact same
  preview-staleness fingerprint used for approval binding)
- `toProposedAction` (`intakeSessionTypes.ts`)

The only thing Phase 2 adds on top is the transport/security layer
(auth, scopes, tokens, idempotency, rate limiting, replay, audit) — no
business rule (validation, duplicate detection, field mapping) is
duplicated.

## Existing-data access: `getExistingData` injection

Phase 1 adapters need read access to existing regions/groups/
branches/pharmacists/registry to validate against. `connectorIntakeService.ts`
never calls a Firestore client directly — it calls
`env.getExistingData()`, an injected function:

- **Tests / local simulator**: `makeFakeExistingData()` (in-memory, no
  network) — proves the full validation/duplicate-detection/approval/
  idempotency logic works correctly using the real Phase 1 adapters.
- **Production Netlify Function**: `fetchExistingDataAdmin()`
  (`netlify/functions/firestoreConnectorRepository.ts`) — an
  Admin-SDK equivalent of Phase 1's client-SDK
  `fetchIntakeExistingData()`, same output shape, different read
  mechanics (justified: the client SDK cannot authenticate inside a
  serverless function with no browser session).

See `AI_INTAKE_PHASE_2_LIMITATIONS.md` for what this does and does not
cover for the actual write (execute) path.
