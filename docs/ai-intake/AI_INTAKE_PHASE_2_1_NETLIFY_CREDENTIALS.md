# Universal AI Intake — Phase 2.1 Netlify Credentials Model

This is unchanged from Phase 2's credential model
(`AI_INTAKE_PHASE_2_ENVIRONMENT.md`) — Phase 2.1 did not introduce a
new credential mechanism, only a new consumer of the existing one
(`AdminFirestoreCommitExecutor` now shares the same Admin SDK app the
repository already initializes).

## Credential source

`firestoreConnectorRepository.ts`'s `getAdminApp()`:

```ts
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
if (!raw) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set — connector cannot initialize the Admin SDK')
}
const serviceAccount = JSON.parse(raw)
cachedApp = initializeApp({ credential: cert(serviceAccount) })
```

- **No service-account JSON file is committed** to the repository —
  the entire credential is a single Netlify **environment variable**
  (Netlify dashboard → Site settings → Environment variables, or
  `netlify env:set` from the Netlify CLI, never a file in the repo).
- **No private key appears in `.env.example`** — confirmed:
  `FIREBASE_SERVICE_ACCOUNT_JSON` is documented there only as a name
  with an empty/placeholder value and a comment explaining it must be
  set via Netlify's secure environment configuration, never committed.
- **Fails closed when missing** — `getAdminApp()` throws immediately,
  synchronously, on the first call. There is no fallback to Application
  Default Credentials, no silent "development mode" bypass, and no
  degraded read-only mode.
- **No credential logging** — the raw JSON is parsed and passed
  directly to `cert()`; it is never `console.log`'d, never included in
  an error message (the thrown error message names the missing env var,
  not its value), and never written to any Firestore document
  (including the `connector_audit_logs`/`audit_logs` audit trails,
  which are redaction-tested — see `AI_INTAKE_PHASE_2_CONNECTOR_SECURITY.md`).

## Phase 2.1's addition: the commit executor shares the same app

`pharmapulse-connector.ts` (the Netlify Function handler) now also
constructs:

```ts
const commitExecutor = createAdminFirestoreCommitExecutor(getAdminFirestore())
```

`getAdminFirestore()` (new, exported from `firestoreConnectorRepository.ts`)
calls the same cached `getAdminApp()`/`getDb()` the repository already
uses — **one Admin SDK app per function invocation**, shared by the
repository and the commit executor, never a second independent
connection or a second place credentials could leak from.

## Application Default Credentials — documented alternative, not used this session

The spec offers ADC as an alternative to a committed service-account
JSON. This repo's implementation uses the service-account-JSON-via-env-var
approach instead (matches Phase 2's existing choice, not revisited in
Phase 2.1 — changing the credential mechanism itself was out of scope
for "close the single remaining Phase 2 gap"). ADC would require a
GCP-native hosting environment (Cloud Run, Cloud Functions, GCE) with
attached service-account identity; Netlify Functions do not run inside
GCP's metadata-server environment, so ADC is not directly available to
them without an additional token-exchange step. This is noted as a
possible future hardening, not implemented.

## Netlify configuration required to actually enable production writes

None of the following were set this session (verified: no `netlify
deploy` was run, no live environment variables were configured):

| Variable | Purpose | Required for |
|---|---|---|
| `CONNECTOR_ENABLED` | top-level kill switch | any tool to respond (403 otherwise) |
| `CONNECTOR_PRODUCTION_WRITES_ENABLED` | write-path kill switch | `execute` specifically |
| `CONNECTOR_ENVIRONMENT` | must equal the guard's expected production string | `execute` specifically |
| `CONNECTOR_TOKEN_SECRET` | HMAC secret for access tokens | all authenticated tools |
| `CONNECTOR_APPROVAL_SECRET` | HMAC secret for approval tokens | `approve`/`execute` |
| `CONNECTOR_AUDIENCE` / `CONNECTOR_ISSUER` | token audience/issuer strings | all authenticated tools |
| `CONNECTOR_CLIENT_ADMIN_MAP` | JSON map of connector `clientId` → admin UID | all authenticated tools |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Admin SDK credential | any Firestore read/write (repository AND commit executor) |

All of these are absent by default, meaning the connector is
completely inert (every tool returns 403) until an operator
deliberately configures them in the Netlify dashboard.
