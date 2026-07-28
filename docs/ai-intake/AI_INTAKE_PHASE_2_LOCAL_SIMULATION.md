# Universal AI Intake — Phase 2 Local Connector Simulation

## Run it

```
npx vitest run scripts/connectorSimulate.demo.test.ts
```

No credentials, no environment variables, no network access, no
Firestore emulator required — it walks the full lifecycle against the
**in-memory `ConnectorRepository`** only.

## What it demonstrates

1. **Authenticate** — issues a dev connector access token
   (`connectorTokenService.issueConnectorToken()`) for a fictitious
   `chatgpt-dev` client, mapped to a fake `dev-admin-uid`.
2. **Create** a Region intake session from one structured row.
3. **Validate** — prints the real validation summary + preview
   signature.
4. **Preview** — prints the row-level classification.
5. **Approve** — issues a real approval token bound to that preview
   signature.
6. **Execute** — commits through the real Phase 1 `commitJob()`
   engine (Firestore client-SDK calls mocked, so this is genuinely
   offline).
7. **Status** — confirms the session reads back as `COMPLETED`.
8. **Idempotent replay** — re-executes with the *same* idempotency key
   and asserts the response is byte-identical to the first execution
   (proving no duplicate write occurred).
9. Prints the count of audit records the run produced.

## Why this satisfies "isolated test repository only"

The in-memory repository (`createInMemoryConnectorRepository()`) is a
complete, self-contained implementation of `ConnectorRepository` —
sessions, replay guard, idempotency, rate limits, consumed approvals,
and audit log all live in plain JS `Map`/`Set`/array structures that
exist only for the process's lifetime. `firebase/firestore` is
explicitly mocked at the top of the simulator file (same mocks as
`connectorHttpHandler.test.ts`) specifically so the underlying Phase 1
adapters' `commitBatch()` calls resolve against fakes, not a live
project — confirmed by the absence of any `@firebase/firestore`
network warning in the simulator's output.

## Extending the simulator

To try a different entity type or a larger batch, edit the `rows`
array in `scripts/connectorSimulate.demo.test.ts`'s create-session
call — the same real Phase 1 adapters (Groups, Pharmacies, Users,
Assignments, KPI Definitions, KPI Targets, KPI Actuals) will validate
it identically to how the browser `/ai-intake` page or a real
connector call would.
