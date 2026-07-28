# Universal AI Intake — Phase 2.2 MCP Tool Registry

`buildMcpToolDescriptors()` (`mcpToolSchemas.ts`) maps the 8 existing
tools from `connectorToolRegistry.ts`'s `MCP_TOOL_MANIFEST` (Phase 2,
unchanged) into MCP `tools/list` descriptors. No tool was added,
removed, or renamed. No public schema change is backward-incompatible
— the JSON Schema `properties`/`required` shapes are new (Phase 2.2),
but they document exactly the same input fields
`connectorTypes.ts`'s existing `*Input` interfaces have always
required; no existing caller's payload becomes invalid.

## Per-tool summary

| Tool | Required scope | Confirmation | Idempotency key required | Entity types |
|---|---|---|---|---|
| `pharmapulse_create_intake_session` | `intake:create` | No | Yes | all 10 supported domains |
| `pharmapulse_validate_intake_session` | `intake:validate` | No | No | — |
| `pharmapulse_get_intake_preview` | `intake:read` | No | No | — |
| `pharmapulse_approve_intake_session` | `intake:approve` | **Yes** | Yes | — |
| `pharmapulse_execute_intake_session` | `intake:execute` | **Yes** | Yes | — |
| `pharmapulse_get_intake_status` | `intake:read` | No | No | — |
| `pharmapulse_cancel_intake_session` | `intake:cancel` | No | No | — |
| `pharmapulse_get_reference_data` | `reference:read` | No | No | — |

Every tool is `destructive: false` — none can delete a record. Execute
can only create/update rows already shown in a preview the caller
explicitly approved (see `AI_INTAKE_PHASE_2_APPROVAL_MODEL.md`,
unchanged since Phase 2).

## Input schema example (`pharmapulse_execute_intake_session`)

```json
{
  "type": "object",
  "properties": {
    "sessionId":      { "type": "string" },
    "approvalToken":  { "type": "string" },
    "idempotencyKey": { "type": "string" }
  },
  "required": ["sessionId", "approvalToken", "idempotencyKey"],
  "additionalProperties": false
}
```

`additionalProperties: false` is set on every tool's schema — an
unrecognized field in a tool call's `arguments` is rejected at Layer 1
(MCP schema validation) rather than silently ignored or passed through
to Phase 1's adapters.

## `_meta` passthrough

Each descriptor carries a non-standard-but-widely-supported `_meta`
object (`requiredScope`, `destructive`, `requiresConfirmation`,
`requiresIdempotencyKey`, `supportedEntityTypes`) so a caller can
introspect connector-specific behavior without a second discovery
call. This is informational only — the protocol handler never trusts
anything a *client* echoes back from `_meta`; every actual
authorization/scope/confirmation check happens server-side inside
`handleConnectorRequest()`, exactly as before Phase 2.2.

## No new business tools, no delete tools

Per the spec's restrictions, Phase 2.2 adds zero new tools to the
manifest — the MCP layer is purely a new transport/framing over the
existing 8. `buildMcpToolDescriptors()` is proven by test to return
exactly these 8 names, no more, no fewer
(`mcpToolSchemas.test.ts` — "returns exactly the 8 existing connector
tools").
