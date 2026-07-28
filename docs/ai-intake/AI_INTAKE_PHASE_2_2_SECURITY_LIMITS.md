# Universal AI Intake — Phase 2.2 Request Limits and Schema Validation

## Two-layer validation, every `tools/call`

1. **Layer 1 — MCP tool input schema** (`mcpSchemaValidator.ts`,
   new): required-field presence, basic JSON type checks, and the
   request-limit ceilings below. Shallow and structural only — never
   re-implements entity validation, normalization, or duplicate
   detection.
2. **Layer 2 — existing PharmaPulse domain validation** (Phase 1
   adapters, reached unchanged via `dispatchConnectorTool()` →
   `connectorIntakeService.ts`): the real business rules, unchanged
   since Phase 1/2.

A request that fails Layer 1 never reaches Layer 2 — it's rejected
immediately as a tool-call error result (`isError: true`,
`code: 'INVALID_PAYLOAD'`), with the specific missing/invalid field(s)
named in `fieldErrors`.

## Request-limit ceilings (`MCP_LIMITS`, `mcpToolSchemas.ts`)

| Limit | Value | Enforced on |
|---|---|---|
| Max rows per `create_intake_session` request | 2000 | `rows[]` array length |
| Max preview page size | 500 | `get_intake_preview`'s `limit` field |
| Max reference-data result size | 200 | `get_reference_data`'s `limit` field |
| Max request body size | 2 MB | Netlify Function transport layer (`pharmapulse-mcp.ts`), before JSON parsing |
| Max tool calls per time window | inherited from Phase 2's existing per-client+tool rate limiter (`connectorRateLimitService.ts`, unchanged) | every `tools/call` |

Exceeding any of these returns a **structured error**
(`INVALID_PAYLOAD` for schema-level limits, `RATE_LIMITED` for the
call-frequency limit) — **never a silent truncation**. A 2500-row
`create_intake_session` call is rejected outright with a message
telling the caller to split the import into multiple sessions; it is
never silently cut down to 2000 rows and executed anyway.

## Rejected inputs (structural, by construction)

- **Unknown fields**: every tool's input schema sets
  `additionalProperties: false` — an unrecognized field in `arguments`
  is rejected at Layer 1.
- **Arbitrary document paths / arbitrary collection names**: no tool
  input schema anywhere has a "path" or "collection" field at all —
  `collectionKey` is always resolved server-side from a closed
  allowlist (`COLLECTION_ALLOWLIST`, `commitOperationTypes.ts`, Phase
  2.1, unchanged) never from connector/MCP input.
- **Unknown tool names**: rejected as a JSON-RPC protocol error
  (`INVALID_PARAMS`, -32602) before any schema or business validation
  runs at all.
- **Unsupported entity types**: rejected inside Layer 2 — `createIntakeSession`
  throws `UNSUPPORTED_ENTITY` for anything not in
  `INTAKE_DOMAIN_LABELS` (Phase 1, unchanged).
- **Unsupported lifecycle mutations**: KPI Definitions are still
  forced to `draft`/`isActive:false` regardless of what a connector
  call requests (Phase 2's `kpiRegistryDraftOnlyAdapter.ts` guard,
  unchanged).
- **Auth mutation fields**: no input schema anywhere has a
  `password`/`authUid`/custom-claims field — extra fields a client
  sends are either rejected outright (`additionalProperties: false`)
  or, for fields genuinely outside any schema's tracked property list,
  simply never read by `parseRow()` (Phase 1, unchanged;
  `connectorHttpHandler.test.ts`'s pre-existing "no tool accepts or
  would act on a password/Auth-UID-creation field" test still passes
  unchanged).
- **Destructive instructions**: structurally impossible — no tool's
  commit-plan builder (`buildCommitPlan.ts`) ever produces a `delete`
  operation type; `CommitOperationType` is `'create' | 'update' |
  'upsert' | 'skip'` only.
