# Universal AI Intake — Phase 2 Idempotency

## Where required

`pharmapulse_create_intake_session`, `pharmapulse_approve_intake_session`,
and `pharmapulse_execute_intake_session` all require an `idempotencyKey`
— enforced at the HTTP handler level (`connectorHttpHandler.ts`'s
`IDEMPOTENT_TOOLS` set), not left to each handler to remember.

## Behavior

`connectorIdempotencyService.withIdempotency(key, payload, store, execute)`:

- **Same key + same payload** (hashed via SHA-256,
  `hashPayload()`) → returns the original stored result, `execute()`
  is never called a second time.
- **Same key + different payload** → `IDEMPOTENCY_CONFLICT` (409),
  never silently proceeds with either version.
- **New key** → runs `execute()`, persists the result keyed by
  `idempotencyKey`.

Persisted server-side via `ConnectorRepository.getIdempotencyRecord`/
`putIdempotencyRecord` — in-memory Map for tests/simulator,
`connector_idempotency` Firestore collection in production
(`firestoreConnectorRepository.ts`).

## Execution-specific guarantees

- A successfully executed session cannot be re-executed with the same
  idempotency key (returns the cached result — verified: "repeated
  execute with the SAME idempotency key returned the cached result (no
  duplicate write)" in the local simulator).
- A genuinely new execution attempt (different idempotency key) against
  an already-consumed approval token is rejected separately by the
  approval single-use check (`APPROVAL_ALREADY_USED`) — idempotency and
  single-use approval are deliberately two independent guards, so a
  caller can't bypass one by varying the other.
- Partial-failure retry (retrying only failed rows, not re-running
  successful ones) is inherited unchanged from Phase 1's existing
  `commitJob()` resume/retry mechanism (DX-7) — no new retry logic was
  built for the connector specifically.
