# Universal AI Intake — Phase 2 Environment Variables

All documented (names only, no values) in `.env.example`. These are
**server-side only** — read via `process.env` inside
`netlify/functions/pharmapulse-connector.ts`, never prefixed `VITE_`,
so Vite never inlines them into the client bundle. Must be set as
Netlify dashboard secret environment variables, never in a committed
file.

| Variable | Purpose | Default when unset |
|---|---|---|
| `CONNECTOR_ENABLED` | Master on/off switch — must be exactly `"true"` | disabled (fail closed) |
| `CONNECTOR_PRODUCTION_WRITES_ENABLED` | Separate switch for the one write tool | disabled (fail closed) |
| `CONNECTOR_ENVIRONMENT` | `production` \| `staging` \| `development` | unrecognized (fail closed) |
| `CONNECTOR_TOKEN_SECRET` | HMAC secret for access tokens | required — handler passes `''` if unset, which cannot verify any real token |
| `CONNECTOR_APPROVAL_SECRET` | HMAC secret for approval tokens (different from the above) | same as above |
| `CONNECTOR_AUDIENCE` | Token audience claim | `pharmapulse-connector` |
| `CONNECTOR_ISSUER` | Token issuer claim | `pharmapulse` |
| `CONNECTOR_CLIENT_ADMIN_MAP` | JSON `{clientId: adminUid}` mapping | empty — every client rejected |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Admin SDK credentials, single-line JSON | required — `getAdminApp()` throws if unset |

## Fail-closed guarantee

Every one of these has a safe "does nothing" default. Deploying this
code with no environment variables configured at all results in every
connector request being rejected at the very first check
(`CONNECTOR_ENABLED !== 'true'`, checked before the request body is
even parsed) — confirmed by `connectorProductionGuard.test.ts` and
`connectorHttpHandler.test.ts`'s production-guard test.

## What was actually configured this session

**Nothing.** No `.env` value was set, no Netlify dashboard variable
was set, no service account was created or obtained. All connector
tests and the local simulator run entirely against injected
mocks/in-memory fakes — see `AI_INTAKE_PHASE_2_LIMITATIONS.md`.
